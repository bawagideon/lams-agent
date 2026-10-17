import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AuthManager } from './AuthManager.ts';

export interface ReleaseProposal {
  id: string;
  episodeId: string;
  title: string;
  videoFilePath: string;
  videoSizeBytes: number;
  videoFingerprint: string;
  channelTitle: string;
  publishAt?: string;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export class ApprovalManager {
  private static instance: ApprovalManager;
  private filePath: string;
  private proposals: Map<string, ReleaseProposal> = new Map();
  private authManager: AuthManager;
  private ttlMs = 15 * 60 * 1000; // 15 minutes TTL for approval tokens

  private constructor() {
    this.authManager = AuthManager.getInstance();
    const dataDir = path.resolve('data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}
    }
    this.filePath = path.join(dataDir, 'approvals.json');
    this.loadFromFile();
  }

  public static getInstance(): ApprovalManager {
    if (!ApprovalManager.instance) {
      ApprovalManager.instance = new ApprovalManager();
    }
    return ApprovalManager.instance;
  }

  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const items: ReleaseProposal[] = JSON.parse(raw);
        items.forEach(item => this.proposals.set(item.id, item));
      }
    } catch (err: any) {
      console.warn(`[ApprovalManager] Could not read approvals file: ${err.message}`);
    }
  }

  private persist(): void {
    try {
      const dataDir = path.dirname(this.filePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const array = Array.from(this.proposals.values());
      fs.writeFileSync(this.filePath, JSON.stringify(array, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`[ApprovalManager] Could not persist approvals to disk (${err.message})`);
    }
  }

  /**
   * Generates a cryptographic fingerprint of the first 8MB of the master video file.
   */
  public computeFileFingerprint(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Master video file not found at: ${filePath}`);
    }
    const buffer = Buffer.alloc(Math.min(8 * 1024 * 1024, fs.statSync(filePath).size));
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Generates an approval proposal that a human must review before release.
   */
  public createReleaseProposal(params: {
    episodeId: string;
    title: string;
    videoFilePath: string;
    channelTitle: string;
    publishAt?: string;
  }): { proposal: ReleaseProposal; approvalToken: string } {
    if (!fs.existsSync(params.videoFilePath)) {
      throw new Error(`Cannot propose release: Video file does not exist at '${params.videoFilePath}'`);
    }

    const stats = fs.statSync(params.videoFilePath);
    if (stats.size < 1024) {
      throw new Error(`Cannot propose release: Video file is too small or corrupt (${stats.size} bytes)`);
    }

    const fingerprint = this.computeFileFingerprint(params.videoFilePath);
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs).toISOString();

    const proposal: ReleaseProposal = {
      id,
      episodeId: params.episodeId,
      title: params.title,
      videoFilePath: path.resolve(params.videoFilePath),
      videoSizeBytes: stats.size,
      videoFingerprint: fingerprint,
      channelTitle: params.channelTitle,
      publishAt: params.publishAt,
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt,
    };

    // Sign the proposal ID and fingerprint with the server secret
    const sigPayload = `${id}:${proposal.episodeId}:${proposal.videoFingerprint}:${proposal.expiresAt}`;
    const signature = crypto
      .createHmac('sha256', this.authManager.getSecret())
      .update(sigPayload)
      .digest('base64url');

    const approvalToken = `${id}.${signature}`;

    this.proposals.set(id, proposal);
    this.persist();

    return { proposal, approvalToken };
  }

  /**
   * Validates and consumes an approval token.
   * STRICT: Fails if token is missing, forged, expired, already consumed, or if the video file was changed.
   */
  public validateAndConsumeApproval(
    approvalToken: string,
    expectedEpisodeId: string,
    currentVideoFilePath: string
  ): { valid: boolean; proposal?: ReleaseProposal; error?: string } {
    if (!approvalToken || typeof approvalToken !== 'string') {
      return { valid: false, error: 'Release denied: Missing required approval token.' };
    }

    const parts = approvalToken.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Release denied: Invalid approval token format.' };
    }

    const [proposalId, providedSig] = parts;
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { valid: false, error: 'Release denied: Approval proposal not found or expired.' };
    }

    // 1. Check expiration
    if (Date.now() > Date.parse(proposal.expiresAt)) {
      proposal.status = 'EXPIRED';
      this.persist();
      return { valid: false, error: 'Release denied: Approval proposal has expired (15-minute window exceeded).' };
    }

    // 2. Check replay attack
    if (proposal.status !== 'PENDING') {
      return {
        valid: false,
        error: `Release denied: Approval proposal has already been ${proposal.status.toLowerCase()} (replay rejected).`,
      };
    }

    // 3. Verify signature
    const sigPayload = `${proposalId}:${proposal.episodeId}:${proposal.videoFingerprint}:${proposal.expiresAt}`;
    const expectedSig = crypto
      .createHmac('sha256', this.authManager.getSecret())
      .update(sigPayload)
      .digest('base64url');

    if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) {
      return { valid: false, error: 'Release denied: Tampered or invalid approval token signature.' };
    }

    // 4. Verify episode ID matches
    if (proposal.episodeId !== expectedEpisodeId) {
      return { valid: false, error: `Release denied: Token is bound to episode '${proposal.episodeId}', not '${expectedEpisodeId}'.` };
    }

    // 5. Verify video file integrity (has not been swapped or corrupted)
    const resolvedCurrentPath = path.resolve(currentVideoFilePath);
    if (proposal.videoFilePath !== resolvedCurrentPath) {
      return { valid: false, error: 'Release denied: Approved video file path does not match target release file.' };
    }

    const currentStats = fs.statSync(resolvedCurrentPath);
    if (currentStats.size !== proposal.videoSizeBytes) {
      return { valid: false, error: 'Release denied: Video file size was altered after approval was granted.' };
    }

    const currentFingerprint = this.computeFileFingerprint(resolvedCurrentPath);
    if (currentFingerprint !== proposal.videoFingerprint) {
      return { valid: false, error: 'Release denied: Video file content hash mismatch (file altered after review).' };
    }

    // 6. Consume the proposal
    proposal.status = 'CONSUMED';
    proposal.consumedAt = new Date().toISOString();
    this.persist();

    return { valid: true, proposal };
  }
}
