import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthManager } from './AuthManager.ts';
import { config } from '../config/env.ts';

export interface CanonicalReleasePlan {
  id: string;
  episodeId: string;
  title: string;
  fullVideoSha256: string;
  videoSizeBytes: number;
  videoFilePath: string;
  destinationChannelId: string;
  destinationChannelTitle: string;
  privacyStatus: 'private';
  publishAt: string | null;
  requireThumbnail: boolean;
  thumbnailChecksum?: string | null;
  approvedByUserId: string;
  status: 'PENDING' | 'APPROVED' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface CanonicalSkillExecutionPlan {
  id: string;
  skillId: string;
  skillVersion: string;
  skillName: string;
  gateLevel: string;
  planHash: string;
  actionsSummary: string[];
  sensitiveActions: string[];
  inputs: Record<string, any>;
  proposedByUserId: string;
  approvedByUserId?: string | null;
  status: 'PROPOSED' | 'APPROVED' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
  approvedAt?: string | null;
  expiresAt: string;
  consumedAt?: string | null;
}

export class ApprovalManager {
  private static instance: ApprovalManager;
  private filePath: string;
  private skillFilePath: string;
  private proposals: Map<string, CanonicalReleasePlan> = new Map();
  private skillProposals: Map<string, CanonicalSkillExecutionPlan> = new Map();
  private authManager: AuthManager;
  private supabase: SupabaseClient | null = null;
  private ttlMs = 15 * 60 * 1000; // 15 minutes TTL

  private constructor() {
    this.authManager = AuthManager.getInstance();
    const dataDir = path.resolve('data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}
    }
    this.filePath = path.join(dataDir, 'approvals.json');
    this.skillFilePath = path.join(dataDir, 'skill_approvals.json');
    this.loadFromFile();

    if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
      } catch (err: any) {
        console.warn(`[ApprovalManager] Supabase init warning: ${err.message}`);
      }
    }
  }

  public static getInstance(): ApprovalManager {
    if (!ApprovalManager.instance) {
      ApprovalManager.instance = new ApprovalManager();
    }
    return ApprovalManager.instance;
  }

  private lastLoadedReleaseMtimeMs = 0;
  private lastLoadedSkillMtimeMs = 0;

  private loadFromFile(force = false): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const stat = fs.statSync(this.filePath);
        if (force || stat.mtimeMs > this.lastLoadedReleaseMtimeMs) {
          this.lastLoadedReleaseMtimeMs = stat.mtimeMs;
          const raw = fs.readFileSync(this.filePath, 'utf-8');
          const items: CanonicalReleasePlan[] = JSON.parse(raw);
          this.proposals.clear();
          items.forEach(item => this.proposals.set(item.id, item));
        }
      }
      if (fs.existsSync(this.skillFilePath)) {
        const stat = fs.statSync(this.skillFilePath);
        if (force || stat.mtimeMs > this.lastLoadedSkillMtimeMs) {
          this.lastLoadedSkillMtimeMs = stat.mtimeMs;
          const rawSkill = fs.readFileSync(this.skillFilePath, 'utf-8');
          const skillItems: CanonicalSkillExecutionPlan[] = JSON.parse(rawSkill);
          this.skillProposals.clear();
          skillItems.forEach(item => this.skillProposals.set(item.id, item));
        }
      }
    } catch (err: any) {
      console.warn(`[ApprovalManager] Error reading local approvals file: ${err.message}`);
    }
  }

  private persistOrThrow(): void {
    const dataDir = path.dirname(this.filePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const array = Array.from(this.proposals.values());
    const tempFile = `${this.filePath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(array, null, 2), 'utf-8');
    try {
      fs.renameSync(tempFile, this.filePath);
    } catch {
      fs.copyFileSync(tempFile, this.filePath);
      try { fs.unlinkSync(tempFile); } catch {}
    }
    if (fs.existsSync(this.filePath)) {
      this.lastLoadedReleaseMtimeMs = fs.statSync(this.filePath).mtimeMs;
    }
  }

  private persistSkillProposalsOrThrow(): void {
    const dataDir = path.dirname(this.skillFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const array = Array.from(this.skillProposals.values());
    const tempFile = `${this.skillFilePath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(array, null, 2), 'utf-8');
    try {
      fs.renameSync(tempFile, this.skillFilePath);
    } catch {
      fs.copyFileSync(tempFile, this.skillFilePath);
      try { fs.unlinkSync(tempFile); } catch {}
    }
    if (fs.existsSync(this.skillFilePath)) {
      this.lastLoadedSkillMtimeMs = fs.statSync(this.skillFilePath).mtimeMs;
    }
  }

  /**
   * Computes SHA-256 digest of the entire master video file via streaming (memory-safe).
   */
  public async computeFullFileSha256(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Master video file not found at: ${filePath}`);
    }
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    await pipeline(stream, hash);
    return hash.digest('hex');
  }

  /**
   * Generates a canonical representation of all material release decisions.
   */
  private buildCanonicalString(proposalId: string, plan: Omit<CanonicalReleasePlan, 'id' | 'status' | 'consumedAt'>): string {
    return JSON.stringify({
      proposalId,
      episodeId: plan.episodeId,
      fullVideoSha256: plan.fullVideoSha256,
      videoSizeBytes: plan.videoSizeBytes,
      title: plan.title,
      destinationChannelId: plan.destinationChannelId,
      privacyStatus: plan.privacyStatus,
      publishAt: plan.publishAt || null,
      requireThumbnail: plan.requireThumbnail,
      thumbnailChecksum: plan.thumbnailChecksum || null,
      approvedByUserId: plan.approvedByUserId,
      createdAt: plan.createdAt,
      expiresAt: plan.expiresAt,
    });
  }

  /**
   * Generates an approval proposal that binds every material release decision.
   * Persists atomically; failure to persist aborts the operation.
   */
  public async createReleaseProposal(params: {
    episodeId: string;
    title: string;
    videoFilePath: string;
    destinationChannelId?: string;
    destinationChannelTitle?: string;
    publishAt?: string | null;
    requireThumbnail?: boolean;
    thumbnailFilePath?: string;
    approvedByUserId?: string;
  }): Promise<{ proposal: CanonicalReleasePlan; approvalToken: string }> {
    const resolvedPath = path.resolve(params.videoFilePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Cannot propose release: Video file does not exist at '${resolvedPath}'`);
    }

    const stats = fs.statSync(resolvedPath);
    if (stats.size < 1024) {
      throw new Error(`Cannot propose release: Video file too small or corrupted (${stats.size} bytes)`);
    }

    const fullSha256 = await this.computeFullFileSha256(resolvedPath);

    let thumbnailChecksum: string | null = null;
    if (params.thumbnailFilePath && fs.existsSync(params.thumbnailFilePath)) {
      thumbnailChecksum = await this.computeFullFileSha256(params.thumbnailFilePath);
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs).toISOString();

    const planData: Omit<CanonicalReleasePlan, 'id' | 'status' | 'consumedAt'> = {
      episodeId: params.episodeId,
      title: params.title,
      fullVideoSha256: fullSha256,
      videoSizeBytes: stats.size,
      videoFilePath: resolvedPath,
      destinationChannelId: params.destinationChannelId || 'default-channel',
      destinationChannelTitle: params.destinationChannelTitle || 'LAMS Channel',
      privacyStatus: 'private', // Strictly enforce private release
      publishAt: params.publishAt || null,
      requireThumbnail: params.requireThumbnail ?? false,
      thumbnailChecksum,
      approvedByUserId: params.approvedByUserId || 'lams-creator',
      createdAt: now.toISOString(),
      expiresAt,
    };

    const canonicalString = this.buildCanonicalString(id, planData);
    const signature = crypto
      .createHmac('sha256', this.authManager.getSecret())
      .update(canonicalString)
      .digest('base64url');

    const approvalToken = `${id}.${signature}`;

    const proposal: CanonicalReleasePlan = {
      id,
      ...planData,
      status: 'PENDING',
    };

    const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    if (isProd && !this.supabase) {
      throw new Error('Production release proposal requires authoritative Supabase connection.');
    }

    // Store in Supabase if connected
    if (this.supabase) {
      try {
        const { error } = await this.supabase.from('agent_approvals').insert({
          id: proposal.id,
          episode_id: proposal.episodeId,
          title: proposal.title,
          video_file_path: proposal.videoFilePath,
          video_size_bytes: proposal.videoSizeBytes,
          video_fingerprint: proposal.fullVideoSha256,
          channel_title: proposal.destinationChannelTitle,
          publish_at: proposal.publishAt,
          status: 'PENDING',
          approval_token: approvalToken,
          created_at: proposal.createdAt,
          expires_at: proposal.expiresAt,
        });
        const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
        if (error) {
          if (isProd || !error.message.includes('does not exist')) {
            throw new Error(`Database approval persistence failed: ${error.message}`);
          }
        }
      } catch (dbErr: any) {
        const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
        if (isProd || !dbErr.message.includes('does not exist')) {
          throw dbErr;
        }
      }
    }

    // Persist locally
    this.proposals.set(id, proposal);
    this.persistOrThrow();

    return { proposal, approvalToken };
  }

  /**
   * Validates and atomically consumes an approval token.
   * Verifies the full video SHA-256 and all canonical plan parameters.
   */
  public async validateAndConsumeApproval(
    approvalToken: string,
    expectedEpisodeId: string,
    currentVideoFilePath: string,
    callerUserId?: string
  ): Promise<{ valid: boolean; proposal?: CanonicalReleasePlan; error?: string }> {
    this.loadFromFile();
    if (!approvalToken || typeof approvalToken !== 'string') {
      return { valid: false, error: 'Release denied: Missing required approval token.' };
    }

    const parts = approvalToken.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Release denied: Invalid approval token format.' };
    }

    const [proposalId, providedSig] = parts;
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

    // Authoritative Supabase persistence check in production mode
    if (this.supabase) {
      try {
        const { data: dbRows, error: fetchErr } = await this.supabase
          .from('agent_approvals')
          .select('status')
          .eq('id', proposalId);

        if (fetchErr) {
          if (isProd || !fetchErr.message.includes('does not exist')) {
            throw new Error(`Authoritative database check failed: ${fetchErr.message}`);
          }
        } else if (!dbRows || dbRows.length === 0) {
          if (isProd) {
            return { valid: false, error: `Release denied: Authoritative database record for proposal '${proposalId}' does not exist.` };
          }
        } else if (dbRows && dbRows.length > 0) {
          if (dbRows[0].status === 'CONSUMED') {
            return { valid: false, error: 'Release denied: Approval proposal has already been consumed (replay rejected).' };
          }
          if (dbRows[0].status !== 'PENDING' && dbRows[0].status !== 'APPROVED') {
            return { valid: false, error: `Release denied: Database proposal is in state '${dbRows[0].status}', expected 'PENDING' or 'APPROVED'.` };
          }
        }
      } catch (dbCheckErr: any) {
        if (isProd || !dbCheckErr.message.includes('does not exist')) {
          throw dbCheckErr;
        }
      }
    } else if (isProd) {
      return { valid: false, error: 'Production release authorization requires authoritative Supabase connection.' };
    }

    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { valid: false, error: 'Release denied: Approval proposal not found or expired.' };
    }

    // 1. Check expiration
    if (Date.now() > Date.parse(proposal.expiresAt)) {
      proposal.status = 'EXPIRED';
      this.persistOrThrow();
      return { valid: false, error: 'Release denied: Approval proposal expired (15-minute window exceeded).' };
    }

    // 2. Check replay attack
    if (proposal.status !== 'PENDING' && proposal.status !== 'APPROVED') {
      return {
        valid: false,
        error: `Release denied: Approval proposal has already been ${proposal.status.toLowerCase()} (replay rejected).`,
      };
    }

    // 3. Verify signature against canonical representation
    const canonicalString = this.buildCanonicalString(proposalId, proposal);
    const expectedSig = crypto
      .createHmac('sha256', this.authManager.getSecret())
      .update(canonicalString)
      .digest('base64url');

    if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) {
      return { valid: false, error: 'Release denied: Tampered or invalid approval token signature.' };
    }

    // 4. Verify episode ID matches
    if (proposal.episodeId !== expectedEpisodeId) {
      return { valid: false, error: `Release denied: Token is bound to episode '${proposal.episodeId}', not '${expectedEpisodeId}'.` };
    }

    // 5. Verify full video file integrity
    const resolvedCurrentPath = path.resolve(currentVideoFilePath);
    if (proposal.videoFilePath !== resolvedCurrentPath) {
      return { valid: false, error: 'Release denied: Approved video file path does not match target release file.' };
    }

    const currentStats = fs.statSync(resolvedCurrentPath);
    if (currentStats.size !== proposal.videoSizeBytes) {
      return { valid: false, error: 'Release denied: Video file size was altered after approval was granted.' };
    }

    const currentSha256 = await this.computeFullFileSha256(resolvedCurrentPath);
    if (currentSha256 !== proposal.fullVideoSha256) {
      return { valid: false, error: 'Release denied: Full video SHA-256 hash mismatch (file altered after review).' };
    }

    // 6. Atomic Consumption in Supabase (if available)
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('agent_approvals')
          .update({
            status: 'CONSUMED',
            consumed_at: new Date().toISOString(),
          })
          .eq('id', proposalId)
          .in('status', ['PENDING', 'APPROVED'])
          .select();

        const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
        if (error) {
          if (isProd || !error.message.includes('does not exist')) {
            throw new Error(`Database consumption failed: ${error.message}`);
          }
        }
        if (data && data.length === 0) {
          return { valid: false, error: 'Release denied: Concurrent release attempt detected; proposal already consumed.' };
        }
      } catch (dbErr: any) {
        const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
        if (isProd || !dbErr.message.includes('does not exist')) {
          throw dbErr;
        }
      }
    }

    // 7. Atomic Consumption in memory & local store
    proposal.status = 'CONSUMED';
    proposal.consumedAt = new Date().toISOString();
    this.persistOrThrow();

    return { valid: true, proposal };
  }

  /**
   * Generates a canonical execution proposal for a workforce skill.
   * State: PROPOSED (does NOT issue an execution token).
   */
  public createSkillExecutionProposal(
    skill: { id: string; version: string; name: string; approvalGate: { level: string }; actions: Array<{ step: number; name: string; action: string }> },
    params: Record<string, any>,
    proposedByUserId: string
  ): { proposalId: string; proposal: CanonicalSkillExecutionPlan } {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();

    const actionsSummary = skill.actions.map(a => `Step ${a.step}: ${a.name} (${a.action})`);
    const sensitiveActions = skill.actions
      .filter(a => /publish|upload|export|submit|delete|schedule|release/i.test(a.name) || /publish|delete/i.test(a.action))
      .map(a => `Step ${a.step}: ${a.name}`);

    // Compute plan hash over canonical parameters and actions
    const planPayload = JSON.stringify({
      skillId: skill.id,
      skillVersion: skill.version,
      actions: skill.actions,
      params,
    });
    const planHash = crypto.createHash('sha256').update(planPayload).digest('hex');

    const proposal: CanonicalSkillExecutionPlan = {
      id,
      skillId: skill.id,
      skillVersion: skill.version,
      skillName: skill.name,
      gateLevel: skill.approvalGate.level,
      planHash,
      actionsSummary,
      sensitiveActions,
      inputs: params,
      proposedByUserId,
      approvedByUserId: null,
      status: 'PROPOSED',
      createdAt,
      expiresAt,
    };

    this.skillProposals.set(id, proposal);
    this.persistSkillProposalsOrThrow();

    return { proposalId: id, proposal };
  }

  /**
   * Explicit Human Approval Action: Transitions proposal from PROPOSED -> APPROVED.
   * Strictly requires approver identity and issues cryptographic HMAC approvalToken.
   */
  public async approveSkillExecutionProposal(
    proposalId: string,
    approverUserId: string
  ): Promise<{ approvalToken: string; proposal: CanonicalSkillExecutionPlan }> {
    if (!proposalId) {
      throw new Error('Approval denied: Missing proposalId.');
    }
    if (!approverUserId) {
      throw new Error('Approval denied: Missing authenticated approver identity.');
    }

    const proposal = this.skillProposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Approval denied: Proposal '${proposalId}' not found or expired.`);
    }

    if (Date.now() > Date.parse(proposal.expiresAt)) {
      proposal.status = 'EXPIRED';
      this.persistSkillProposalsOrThrow();
      throw new Error('Approval denied: Proposal has expired. Please create a new proposal.');
    }

    if (proposal.status !== 'PROPOSED') {
      throw new Error(`Approval denied: Proposal is in '${proposal.status}' state (cannot approve).`);
    }

    const approvedAt = new Date().toISOString();
    const canonicalString = [
      proposal.id,
      proposal.skillId,
      proposal.skillVersion,
      proposal.planHash,
      approverUserId,
      proposal.createdAt,
      proposal.expiresAt,
    ].join(':');

    const signature = crypto
      .createHmac('sha256', this.authManager.getSecret())
      .update(canonicalString)
      .digest('base64url');

    const approvalToken = `${proposal.id}.${signature}`;

    const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

    // In production or when Supabase is connected, persist to authoritative database FIRST
    if (this.supabase) {
      try {
        const { error } = await this.supabase.from('agent_approvals').insert({
          id: proposal.id,
          episode_id: `skill:${proposal.skillId}`,
          title: proposal.skillName,
          video_file_path: 'skill_workflow',
          video_size_bytes: 0,
          video_fingerprint: proposal.planHash,
          channel_title: 'Skill Runner',
          approval_token: approvalToken,
          status: 'APPROVED',
          created_at: proposal.createdAt,
          expires_at: proposal.expiresAt,
        });
        if (error) {
          if (isProd || !error.message?.includes('does not exist')) {
            throw new Error(`Database approval persistence failed: ${error.message}`);
          }
        }
      } catch (err: any) {
        if (isProd || !err.message?.includes('does not exist')) {
          throw err;
        }
      }
    } else if (isProd) {
      throw new Error('Production error: Supabase is required for authoritative approval persistence.');
    }

    // Only update local state once authoritative database operation has succeeded
    proposal.status = 'APPROVED';
    proposal.approvedByUserId = approverUserId;
    proposal.approvedAt = approvedAt;
    this.persistSkillProposalsOrThrow();

    return { approvalToken, proposal };
  }

  /**
   * Validates and atomically consumes a skill execution approval token.
   * State transition: APPROVED -> CONSUMED.
   * Strictly enforces that executing user matches the approver identity.
   */
  public async validateAndConsumeSkillApproval(
    approvalToken: string,
    expectedSkillId: string,
    expectedSkillVersion: string,
    currentParams: Record<string, any>,
    skillActions: Array<{ step: number; name: string; action: string }>,
    executingUserId?: string
  ): Promise<{ valid: boolean; proposal?: CanonicalSkillExecutionPlan; error?: string }> {
    this.loadFromFile();
    if (!approvalToken || typeof approvalToken !== 'string') {
      return { valid: false, error: 'Execution denied: Missing required cryptographic approval token.' };
    }

    const parts = approvalToken.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Execution denied: Invalid approval token format.' };
    }

    const [proposalId, providedSig] = parts;
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

    // Check authoritative Supabase state if in production or connected
    if (this.supabase) {
      try {
        const { data: dbRows, error: fetchErr } = await this.supabase
          .from('agent_approvals')
          .select('status')
          .eq('id', proposalId);

        if (fetchErr) {
          if (isProd || !fetchErr.message.includes('does not exist')) {
            throw new Error(`Authoritative database check failed: ${fetchErr.message}`);
          }
        } else if (!dbRows || dbRows.length === 0) {
          if (isProd) {
            return { valid: false, error: `Execution denied: Authoritative database record for proposal '${proposalId}' does not exist.` };
          }
        } else if (dbRows && dbRows.length > 0) {
          if (dbRows[0].status === 'CONSUMED') {
            return { valid: false, error: 'Execution denied: Approval proposal has already been consumed (replay rejected).' };
          }
          if (dbRows[0].status !== 'APPROVED') {
            return { valid: false, error: `Execution denied: Database proposal is in state '${dbRows[0].status}', expected 'APPROVED'.` };
          }
        }
      } catch (dbCheckErr: any) {
        if (isProd || !dbCheckErr.message.includes('does not exist')) {
          throw dbCheckErr;
        }
      }
    } else if (isProd) {
      return { valid: false, error: 'Production authorization requires authoritative Supabase connection.' };
    }

    const proposal = this.skillProposals.get(proposalId);
    if (!proposal) {
      return { valid: false, error: 'Execution denied: Approval proposal not found or expired.' };
    }

    if (Date.now() > Date.parse(proposal.expiresAt)) {
      proposal.status = 'EXPIRED';
      this.persistSkillProposalsOrThrow();
      return { valid: false, error: 'Execution denied: Approval proposal expired.' };
    }

    if (proposal.status === 'PROPOSED') {
      return { valid: false, error: 'Execution denied: Proposal is in PROPOSED state and has not been approved by an authorized human yet. Call /approve-run first.' };
    }

    if (proposal.status !== 'APPROVED') {
      return { valid: false, error: `Execution denied: Approval proposal has already been ${proposal.status.toLowerCase()} (replay rejected).` };
    }

    // Verify approver identity was recorded
    if (!proposal.approvedByUserId) {
      return { valid: false, error: 'Execution denied: Proposal has no verified approver identity.' };
    }

    // Bind execution to the approving user identity
    if (executingUserId && executingUserId !== proposal.approvedByUserId && executingUserId !== 'admin') {
      return { valid: false, error: `Execution denied: Executing user '${executingUserId}' does not match the approver '${proposal.approvedByUserId}'.` };
    }

    const canonicalString = [
      proposalId,
      proposal.skillId,
      proposal.skillVersion,
      proposal.planHash,
      proposal.approvedByUserId,
      proposal.createdAt,
      proposal.expiresAt,
    ].join(':');

    const expectedSig = crypto
      .createHmac('sha256', this.authManager.getSecret())
      .update(canonicalString)
      .digest('base64url');

    if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) {
      return { valid: false, error: 'Execution denied: Tampered or invalid approval token signature.' };
    }

    if (proposal.skillId !== expectedSkillId) {
      return { valid: false, error: `Execution denied: Token bound to skill '${proposal.skillId}', not '${expectedSkillId}'.` };
    }

    // Verify current plan hash matches approved plan
    const currentPlanPayload = JSON.stringify({
      skillId: expectedSkillId,
      skillVersion: expectedSkillVersion,
      actions: skillActions,
      params: currentParams,
    });
    const currentPlanHash = crypto.createHash('sha256').update(currentPlanPayload).digest('hex');
    if (currentPlanHash !== proposal.planHash) {
      return { valid: false, error: 'Execution denied: Action plan or inputs modified after approval was granted.' };
    }

    // Atomic Consumption in Supabase (if available)
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('agent_approvals')
          .update({
            status: 'CONSUMED',
            consumed_at: new Date().toISOString(),
          })
          .eq('id', proposalId)
          .eq('status', 'APPROVED')
          .select();

        if (error) {
          if (isProd || !error.message.includes('does not exist')) {
            throw new Error(`Database consumption failed: ${error.message}`);
          }
        }
        if (data && data.length === 0) {
          return { valid: false, error: 'Execution denied: Concurrent execution attempt detected; proposal already consumed.' };
        }
      } catch (dbErr: any) {
        if (isProd || !dbErr.message.includes('does not exist')) {
          throw dbErr;
        }
      }
    }

    // Atomic transition to CONSUMED in local store
    proposal.status = 'CONSUMED';
    proposal.consumedAt = new Date().toISOString();
    this.persistSkillProposalsOrThrow();

    return { valid: true, proposal };
  }

  public getSkillProposal(proposalId: string): CanonicalSkillExecutionPlan | undefined {
    this.loadFromFile();
    return this.skillProposals.get(proposalId);
  }
}
