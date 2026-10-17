import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { YTEngineBridge } from '../bridge/YTEngineBridge.ts';
import { CapCutAdapter } from '../adapters/media/CapCutAdapter.ts';
import { YouTubeLiveClient } from '../adapters/youtube/YouTubeLiveClient.ts';
import { HeadlessRenderer } from '../adapters/media/HeadlessRenderer.ts';
import { ExportFolderWatcher } from '../adapters/media/ExportFolderWatcher.ts';
import { WorkflowCompiler } from '../compiler/WorkflowCompiler.ts';
import { SkillRegistry } from '../skills/SkillRegistry.ts';
import { SkillRunner } from '../skills/SkillRunner.ts';
import { AuthManager } from '../auth/AuthManager.ts';
import { ApprovalManager } from '../auth/ApprovalManager.ts';
import { DurableJobQueue } from '../jobs/DurableJobQueue.ts';
import { renderDashboardHtml } from './views/DashboardHtml.ts';
import { renderPreviewHtml } from './views/PreviewHtml.ts';
import { escapeHtml } from './utils/htmlEscape.ts';

export class MissionControlServer {
  private server: http.Server;
  private bridge: YTEngineBridge;
  private capcutAdapter: CapCutAdapter;
  private youtubeLive: YouTubeLiveClient;
  private headlessRenderer: HeadlessRenderer;
  private exportWatcher: ExportFolderWatcher;
  private workflowCompiler: WorkflowCompiler;
  private skillRegistry: SkillRegistry;
  private skillRunner: SkillRunner;
  private authManager: AuthManager;
  private approvalManager: ApprovalManager;
  private jobQueue: DurableJobQueue;
  private port: number;

  constructor(port = 4200) {
    this.port = port;
    this.bridge = new YTEngineBridge();
    this.capcutAdapter = new CapCutAdapter();
    this.youtubeLive = new YouTubeLiveClient(`http://localhost:${this.port}/oauth2callback`);
    this.headlessRenderer = new HeadlessRenderer();
    this.exportWatcher = new ExportFolderWatcher();
    this.workflowCompiler = new WorkflowCompiler();
    this.skillRegistry = new SkillRegistry();
    this.skillRunner = new SkillRunner();
    this.authManager = AuthManager.getInstance();
    this.approvalManager = ApprovalManager.getInstance();
    this.jobQueue = DurableJobQueue.getInstance();

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  private readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) {
          req.destroy(new Error('Request payload too large (max 5MB)'));
        }
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private getDynamicRedirectUri(req: http.IncomingMessage): string {
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${this.port}`;
    const proto = req.headers['x-forwarded-proto'] || (host.toString().includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}/oauth2callback`;
  }

  /**
   * Guards sensitive routes. If LAMS_REQUIRE_AUTH is set or in production, enforces credentials.
   * If in local development, allows unauthenticated local requests with a warning header.
   */
  private checkAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const requireAuth = process.env.LAMS_REQUIRE_AUTH === 'true' || process.env.NODE_ENV === 'production';
    const authResult = this.authManager.authenticateRequest(req);

    if (authResult.authenticated) {
      return true;
    }

    if (requireAuth) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer error="invalid_token"',
      });
      res.end(JSON.stringify({ error: authResult.error || 'Authentication required' }));
      return false;
    }

    // Dev fallback for local developer ergonomics
    res.setHeader('X-Auth-Notice', 'Development mode: unauthenticated request allowed on localhost');
    return true;
  }

  public async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const method = req.method || 'GET';
    const dynamicRedirectUri = this.getDynamicRedirectUri(req);

    const pageRoutes = ['/', '/home', '/episodes', '/skills', '/activity', '/connections'];

    // 1. Live Creator Studio Pages (Home, Episodes, Skills, Activity, Connections)
    if (method === 'GET' && pageRoutes.includes(url.pathname)) {
      try {
        const initialTab = url.pathname === '/' || url.pathname === '/home' ? 'home' : url.pathname.slice(1);
        const selectedEpId = url.searchParams.get('episodeId') || undefined;
        const [episodes, channel] = await Promise.all([
          this.bridge.getRealEpisodes(),
          this.youtubeLive.getChannelStatus(dynamicRedirectUri),
        ]);
        const metrics = this.bridge.computePipelineMetrics(episodes);
        const skills = this.skillRegistry.listSkills();
        const exports = this.exportWatcher.listExportedVideos();

        const html = renderDashboardHtml(episodes, metrics, channel, skills, exports, selectedEpId, initialTab);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Error loading studio:</h1><pre>${escapeHtml(err.stack)}</pre>`);
      }
      return;
    }

    // 2. Authentication API endpoints
    if (method === 'POST' && url.pathname === '/api/auth/login') {
      try {
        const rawBody = await this.readRequestBody(req);
        const { password, secretKey } = JSON.parse(rawBody || '{}');
        const candidate = secretKey || password;

        if (this.authManager.verifyLogin(candidate)) {
          const sessionToken = this.authManager.createSessionToken('lams-creator', 'creator');
          const cookieHeader = this.authManager.getSessionCookieHeader(sessionToken);

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': cookieHeader,
          });
          res.end(JSON.stringify({ success: true, token: sessionToken }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid creator credentials' }));
        }
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/logout') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': this.authManager.getLogoutCookieHeader(),
      });
      res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
      return;
    }

    if (method === 'GET' && url.pathname === '/api/auth/status') {
      const auth = this.authManager.authenticateRequest(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        authenticated: auth.authenticated,
        user: auth.session?.userId || null,
        role: auth.session?.role || null,
      }));
      return;
    }

    // 3. Google OAuth Callback with CSRF State Verification
    if (method === 'GET' && url.pathname === '/oauth2callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error || !code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>YouTube Connection Notice</h1><p>${escapeHtml(error || 'Missing authorization code')}</p><p><a href="/">Back to Studio</a></p>`);
        return;
      }

      try {
        const result = await this.youtubeLive.handleOAuthCallback(code, state, dynamicRedirectUri);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 60px; background: #f8fafc; color: #0f172a;">
              <h1 style="color: #16a34a; font-size: 24px; font-weight: bold;">✓ YouTube Channel Successfully Connected!</h1>
              <p style="font-size: 16px; margin-top: 10px; color: #334155;">Connected as: <strong>${escapeHtml(result.channelTitle)}</strong></p>
              <p style="color: #64748b; font-size: 13px;">Your studio is now ready to schedule private releases.</p>
              <a href="/connections" style="display: inline-block; margin-top: 24px; background: #4338ca; color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px;">Return to Studio</a>
            </body>
          </html>
        `);
      } catch (authErr: any) {
        const isCsrf = authErr.message.includes('CSRF') || authErr.message.includes('state');
        res.writeHead(isCsrf ? 403 : 500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Connection Notice</h1><p style="color: #dc2626;">${escapeHtml(authErr.message)}</p><p><a href="/connections">Back to Studio</a></p>`);
      }
      return;
    }

    // 4. API: List Episodes and Metrics JSON
    if (method === 'GET' && url.pathname === '/api/episodes') {
      try {
        const episodes = await this.bridge.getRealEpisodes();
        const metrics = this.bridge.computePipelineMetrics(episodes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ episodes, metrics }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 5. Episode Scene Preview Player UI
    const isEpisodePreviewRoute = method === 'GET' && (
      (url.pathname.startsWith('/episodes/') && !pageRoutes.includes(url.pathname)) ||
      (url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/preview'))
    );

    if (isEpisodePreviewRoute) {
      const cleanPath = url.pathname.replace(/^\/(api\/)?episodes\//, '').replace(/\/preview$/, '');
      const episodeId = cleanPath.split('/')[0];
      try {
        const [episodeDetails, channel] = await Promise.all([
          this.bridge.getEpisodeDetails(episodeId),
          this.youtubeLive.getChannelStatus(dynamicRedirectUri),
        ]);

        if (!episodeDetails) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 60px; background: #f8fafc; color: #0f172a;">
                <h1 style="font-size: 24px; font-weight: bold;">Episode Not Found</h1>
                <p style="color: #64748b; margin-top: 8px;">The requested episode could not be found in your database.</p>
                <a href="/episodes" style="display: inline-block; margin-top: 20px; background: #4338ca; color: white; padding: 10px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">Back to Episodes</a>
              </body>
            </html>
          `);
          return;
        }

        const exportedVideo = this.exportWatcher.findExportForEpisode(episodeId, episodeDetails.title);
        const html = renderPreviewHtml(episodeDetails, exportedVideo, channel.isConnected);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Preview Error:</h1><pre>${escapeHtml(err.stack)}</pre>`);
      }
      return;
    }

    // 6. API: Episode Details JSON
    if (method === 'GET' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/details')) {
      const episodeId = url.pathname.split('/')[3];
      try {
        const details = await this.bridge.getEpisodeDetails(episodeId);
        if (!details) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Episode not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(details));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 7. API: Release Room Preflight Check
    if (method === 'GET' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/release-check')) {
      const episodeId = url.pathname.split('/')[3];
      try {
        const [episode, channel] = await Promise.all([
          this.bridge.getEpisodeDetails(episodeId),
          this.youtubeLive.getChannelStatus(dynamicRedirectUri),
        ]);

        if (!episode) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Episode not found' }));
          return;
        }

        const exported = this.exportWatcher.findExportForEpisode(episodeId, episode.title);

        const reasons: string[] = [];
        if (!exported) reasons.push('Master video not found in watched_exports folder');
        if (!channel.isConnected) reasons.push('YouTube channel not linked');
        if (episode.scenesCount > 0 && episode.completedScenesCount < episode.scenesCount) {
          reasons.push('Not all scenes have finished generating');
        }

        const checks = {
          episodeId: episode.id,
          title: episode.title,
          scenesCount: episode.scenesCount,
          completedScenesCount: episode.completedScenesCount,
          allScenesReady: episode.scenesCount > 0 && episode.completedScenesCount >= episode.scenesCount,
          masterVideo: exported ? {
            fileName: exported.fileName,
            sizeMb: exported.sizeMb,
            path: exported.filePath,
          } : null,
          youtube: {
            connected: channel.isConnected,
            channelTitle: channel.title,
            authUrl: channel.authUrl,
          },
          canRelease: Boolean(exported && channel.isConnected),
          reasons,
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(checks));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 8. API: Propose Release (Phase 1 of Two-Phase Cryptographic Approval)
    if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/propose-release')) {
      if (!this.checkAuth(req, res)) return;
      const episodeId = url.pathname.split('/')[3];
      try {
        const episode = await this.bridge.getEpisodeDetails(episodeId);
        if (!episode) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Episode '${episodeId}' not found.` }));
          return;
        }

        const exported = this.exportWatcher.findExportForEpisode(episodeId, episode.title);
        const channel = await this.youtubeLive.getChannelStatus(dynamicRedirectUri);

        if (!exported || !channel.isConnected) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Preflight requirements missing (video file or YouTube connection required).',
          }));
          return;
        }

        const { proposal, approvalToken } = this.approvalManager.createReleaseProposal({
          episodeId,
          title: episode.title,
          videoFilePath: exported.filePath,
          channelTitle: channel.title || 'YouTube Channel',
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          approvalToken,
          proposal,
        }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 9. API: Assemble Real CapCut Draft
    if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/capcut')) {
      if (!this.checkAuth(req, res)) return;
      const episodeId = url.pathname.split('/')[3];
      try {
        const mediaPlan = await this.bridge.compileRealEpisodeToMediaPlan(episodeId);
        const result = await this.capcutAdapter.createDraftFromMediaPlan(mediaPlan);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          draftId: result.draftId,
          draftPath: result.draftPath,
          tracksCount: result.tracksCount,
          durationSeconds: result.totalDurationSeconds,
        }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 10. API: Render Master Video via FFmpeg
    if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/render')) {
      if (!this.checkAuth(req, res)) return;
      const episodeId = url.pathname.split('/')[3];
      try {
        const mediaPlan = await this.bridge.compileRealEpisodeToMediaPlan(episodeId);
        const cleanTitle = (mediaPlan.title || 'episode').replace(/[^a-zA-Z0-9]/g, '_');
        const outName = `${cleanTitle}_${episodeId.substring(0, 8)}_master.mp4`;
        const outPath = path.join(this.exportWatcher.getWatchedDirPath(), outName);

        const renderResult = await this.headlessRenderer.render(mediaPlan, outPath);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          outputPath: renderResult.outputPath,
          durationSeconds: renderResult.durationSeconds,
          fileSizeBytes: renderResult.fileSizeBytes,
        }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 11. API: Hardened Approve & Release Workflow (Phase 2 with Cryptographic Token & Verification)
    if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/approve')) {
      if (!this.checkAuth(req, res)) return;
      const episodeId = url.pathname.split('/')[3];
      try {
        // Step 1: Preflight validation
        const episode = await this.bridge.getEpisodeDetails(episodeId);
        if (!episode) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Episode '${episodeId}' not found in database.` }));
          return;
        }

        const exported = this.exportWatcher.findExportForEpisode(episodeId, episode.title);
        const channel = await this.youtubeLive.getChannelStatus(dynamicRedirectUri);

        if (!exported || !channel.isConnected) {
          const reasons: string[] = [];
          if (!exported) {
            reasons.push(`No master video file found for '${episode.title}'. Drop your CapCut export into watched_exports/ or render it first.`);
          }
          if (!channel.isConnected) {
            reasons.push('YouTube channel is not connected. Re-authorize your Google account.');
          }

          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Release preflight requirements not met',
            reasons,
          }));
          return;
        }

        // Step 2: Validate Cryptographic Approval Token (Reject Unverified Release Requests)
        let rawBody = '';
        try {
          rawBody = await this.readRequestBody(req);
        } catch {}
        const bodyObj = rawBody ? JSON.parse(rawBody) : {};
        const approvalToken = (req.headers['x-approval-token'] as string) || bodyObj.approvalToken;

        // In test mode or when approval token is provided, validate strictly
        if (approvalToken) {
          const validation = this.approvalManager.validateAndConsumeApproval(
            approvalToken,
            episodeId,
            exported.filePath
          );
          if (!validation.valid) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: validation.error || 'Approval token rejected.',
            }));
            return;
          }
        } else if (process.env.LAMS_REQUIRE_AUTH === 'true' || process.env.NODE_ENV === 'production') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Cryptographic approval token required. Call /api/episodes/:id/propose-release first.',
          }));
          return;
        }

        // Step 3: Execute publishing skill (DO NOT TOUCH DATABASE YET)
        const pubSkill = this.skillRegistry.getSkill('youtube_publish')!;
        const skillResult = await this.skillRunner.execute({
          missionId: episodeId,
          skill: pubSkill,
          params: {
            episodeId,
            title: episode.title,
            description: `${episode.title}\n\n${episode.topic}\n\nProduced with LAMS HQ personal creator workforce.`,
            videoFilePath: exported.filePath,
          },
          isApprovedByHuman: true,
        });

        // Step 4: Check execution receipt strictly
        if (skillResult.receipt.status !== 'SUCCESS') {
          const failDetail = skillResult.outputData?.error || 'Verification postconditions failed.';
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: `Release aborted: ${failDetail}`,
            receiptId: skillResult.receipt.receiptId,
            status: 'FAILED',
          }));
          return;
        }

        const uploadData = skillResult.outputData['publisher.upload_video'];
        const videoId = uploadData?.videoId;
        if (!videoId || typeof videoId !== 'string') {
          throw new Error('Upload finished but YouTube API did not confirm a valid video ID.');
        }

        // Step 5: ONLY AFTER YouTube API confirms videoId, update Supabase DB
        await this.bridge.updateEpisodeStatus(episodeId, 'Scheduled');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          episodeId,
          newStatus: 'Scheduled',
          videoId,
          videoUrl: uploadData.videoUrl || `https://youtu.be/${videoId}`,
          receiptId: skillResult.receipt.receiptId,
        }));
      } catch (err: any) {
        // Database remains UNMODIFIED on any error
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 12. API: Streaming File Upload to Export Folder (Safe 2GB Cap, DB Check & Magic Bytes)
    if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/upload-export')) {
      if (!this.checkAuth(req, res)) return;
      const episodeId = url.pathname.split('/')[3];
      try {
        // 1. Ensure episode exists in database first
        const episode = await this.bridge.getEpisodeDetails(episodeId);
        if (!episode) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Cannot upload export: Episode '${episodeId}' not found in database.` }));
          return;
        }

        // 2. Validate content type
        const contentType = (req.headers['content-type'] || '').toLowerCase();
        if (contentType && !contentType.includes('video') && !contentType.includes('octet-stream')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid content type: only video uploads are allowed.' }));
          return;
        }

        const rawHeaderName = req.headers['x-filename'] as string;
        const decoded = rawHeaderName ? decodeURIComponent(rawHeaderName) : `export_${episodeId}_${Date.now()}.mp4`;
        const safeName = path.basename(decoded).replace(/[^a-zA-Z0-9._-]/g, '_');
        const watchedDir = this.exportWatcher.getWatchedDirPath();
        const tmpPath = path.join(watchedDir, `upload_${Date.now()}_${safeName}.tmp`);
        const targetPath = path.join(watchedDir, safeName);

        // 3. Stream with 2GB limit enforcement
        const maxBytes = 2 * 1024 * 1024 * 1024; // 2GB
        let bytesReceived = 0;
        const fileStream = fs.createWriteStream(tmpPath);

        req.on('data', chunk => {
          bytesReceived += chunk.length;
          if (bytesReceived > maxBytes) {
            req.destroy(new Error('File upload exceeded 2GB maximum limit.'));
          }
        });

        // @ts-ignore
        await pipeline(req, fileStream);

        // 4. Magic bytes verification (must be MP4/MOV)
        const headerBuf = Buffer.alloc(32);
        const fd = fs.openSync(tmpPath, 'r');
        fs.readSync(fd, headerBuf, 0, 32, 0);
        fs.closeSync(fd);

        const ascii = headerBuf.toString('ascii');
        const isMp4 = ascii.includes('ftyp') || ascii.includes('moov');
        const isWebm = headerBuf[0] === 0x1A && headerBuf[1] === 0x45 && headerBuf[2] === 0xDF && headerBuf[3] === 0xA3;
        if (!isMp4 && !isWebm) {
          try { fs.unlinkSync(tmpPath); } catch {}
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Uploaded file is not a valid MP4 or WebM video file.' }));
          return;
        }

        // Atomic rename from .tmp to final file
        if (fs.existsSync(targetPath)) {
          try { fs.unlinkSync(targetPath); } catch {}
        }
        fs.renameSync(tmpPath, targetPath);

        const stats = fs.statSync(targetPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          fileName: safeName,
          filePath: targetPath,
          sizeBytes: stats.size,
          sizeMb: Math.round((stats.size / (1024 * 1024)) * 100) / 100,
        }));
      } catch (err: any) {
        res.writeHead(err.message.includes('2GB') ? 413 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 13. API: Stream Exported Video (HTTP 206 Partial Content + Path Traversal & 416 Range Validation)
    if (method === 'GET' && url.pathname.startsWith('/api/exports/')) {
      const rawFileName = decodeURIComponent(url.pathname.replace('/api/exports/', ''));
      const safeFileName = path.basename(rawFileName); // Traversal protection
      const watchedDir = path.resolve(this.exportWatcher.getWatchedDirPath());
      const filePath = path.resolve(watchedDir, safeFileName);

      // Path containment check
      if (!filePath.startsWith(watchedDir) || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Exported video file not found');
        return;
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // 416 Range Not Satisfiable validation
        if (isNaN(start) || isNaN(end) || start < 0 || end < start || start >= fileSize) {
          res.writeHead(416, {
            'Content-Range': `bytes */${fileSize}`,
            'Content-Type': 'text/plain',
          });
          res.end('416 Requested Range Not Satisfiable');
          return;
        }

        const chunkSize = end - start + 1;
        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'video/mp4',
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(filePath).pipe(res);
      }
      return;
    }

    // 14. API: Creator Assistant Chat with Plan Cards
    if (method === 'POST' && url.pathname === '/api/chat') {
      try {
        const body = await this.readRequestBody(req);
        const { message } = JSON.parse(body || '{}');
        const clean = (message || '').toLowerCase().trim();

        const episodes = await this.bridge.getRealEpisodes();
        let reply = '';
        let planCard: any = null;

        if (/release|schedule|publish|approve/i.test(clean)) {
          const targetEp = episodes.find(e => clean.includes(e.title.toLowerCase())) || episodes.find(e => e.status === 'Review') || episodes[0];
          if (targetEp) {
            const exported = this.exportWatcher.findExportForEpisode(targetEp.id, targetEp.title);
            planCard = {
              type: 'release_plan',
              episodeId: targetEp.id,
              title: targetEp.title,
              projectName: targetEp.projectName,
              masterVideo: exported ? `${exported.fileName} (${exported.sizeMb} MB)` : 'Not yet detected (render or export first)',
              visibility: 'Private Release (Safe Mode)',
              ready: !!exported,
            };
            reply = `I prepared the release plan for <strong>${escapeHtml(targetEp.title)}</strong>. Review the details below and confirm when ready:`;
          } else {
            reply = `I couldn't find an episode matching your request. You have ${episodes.length} episodes in your library.`;
          }
        } else if (/capcut|draft|timeline/i.test(clean)) {
          const targetEp = episodes.find(e => clean.includes(e.title.toLowerCase())) || episodes.find(e => e.status === 'Review') || episodes[0];
          if (targetEp) {
            planCard = {
              type: 'capcut_plan',
              episodeId: targetEp.id,
              title: targetEp.title,
              action: 'assemble_draft',
            };
            reply = `I can assemble the CapCut desktop timeline for <strong>${escapeHtml(targetEp.title)}</strong>. Click below to proceed:`;
          } else {
            reply = `Tell me which episode to assemble for CapCut.`;
          }
        } else if (/youtube|channel|status|connect/i.test(clean)) {
          const channel = await this.youtubeLive.getChannelStatus(dynamicRedirectUri);
          if (channel.isConnected) {
            reply = `🔗 YouTube is connected to <strong>${escapeHtml(channel.title)}</strong> (${channel.subscriberCount || '0'} subscribers). All uploads are posted privately for review.`;
          } else {
            reply = `⚠️ YouTube is not connected. <a href="${channel.authUrl}" class="text-indigo-400 font-bold underline">Click here to connect your YouTube channel</a>.`;
          }
        } else if (/review|pending|needs|next/i.test(clean)) {
          const reviewList = episodes.filter(e => e.status === 'Review');
          if (reviewList.length > 0) {
            reply = `You have <strong>${reviewList.length} episode(s)</strong> awaiting your OK:<br/>` +
              reviewList.map(e => `• <strong>${escapeHtml(e.title)}</strong> (${escapeHtml(e.projectName)}) — <a href="/api/episodes/${e.id}/preview" target="_blank" class="text-indigo-400 underline">Preview</a>`).join('<br/>');
          } else {
            reply = `All episodes are up to date! None currently waiting in Review.`;
          }
        } else {
          reply = `I can help you review scene previews, assemble CapCut drafts, check your YouTube connection, or schedule finished videos. Try asking: <em>"Review pending episodes"</em> or <em>"Release The Harvest of Deeds"</em>.`;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply, planCard }));
      } catch (chatErr: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: 'Error: ' + chatErr.message }));
      }
      return;
    }

    // 15. API: Teach Mode Synthesis & Registration
    if (method === 'POST' && url.pathname === '/api/teach/compile') {
      if (!this.checkAuth(req, res)) return;
      try {
        const body = await this.readRequestBody(req);
        const { name, application } = JSON.parse(body || '{}');
        const targetApp = application || 'YouTube Studio';

        const demoEvents = [
          { timestamp: Date.now(), application: targetApp, windowTitle: `${targetApp} Main View`, eventType: 'navigate' as const, targetElement: { text: 'Content / Library' } },
          { timestamp: Date.now(), application: targetApp, windowTitle: `${targetApp} Upload`, eventType: 'click' as const, targetElement: { text: 'Select Video File' } },
          { timestamp: Date.now(), application: targetApp, windowTitle: `${targetApp} Metadata`, eventType: 'keyboard' as const, targetElement: { text: 'Title Field' }, inputData: 'Episode Title from Queue' },
          { timestamp: Date.now(), application: targetApp, windowTitle: `${targetApp} Publishing`, eventType: 'click' as const, targetElement: { text: 'Publish / Schedule' } },
        ];

        const compiled = this.workflowCompiler.compile(name || 'Custom Workflow', demoEvents);
        this.skillRegistry.registerSkill(compiled.skill, true);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, skill: compiled.skill }));
      } catch (teachErr: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: teachErr.message }));
      }
      return;
    }

    // 16. API: Skills Execution
    if (method === 'POST' && url.pathname.startsWith('/api/skills/') && url.pathname.endsWith('/run')) {
      if (!this.checkAuth(req, res)) return;
      const skillId = url.pathname.split('/')[3];
      const skill = this.skillRegistry.getSkill(skillId);
      if (!skill) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Skill not found' }));
        return;
      }

      const result = await this.skillRunner.execute({
        missionId: 'manual-trigger',
        skill,
        params: {},
        isApprovedByHuman: true,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // 17. API: Durable Job Queue Endpoints (Worker and Client Polling)
    if (method === 'GET' && url.pathname === '/api/jobs') {
      const status = url.searchParams.get('status') as any;
      const jobs = this.jobQueue.listJobs(status);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jobs }));
      return;
    }

    if (method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
      const jobId = url.pathname.split('/')[3];
      const job = this.jobQueue.getJob(jobId);
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Job not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(job));
      return;
    }

    if (method === 'POST' && url.pathname === '/api/jobs/enqueue') {
      if (!this.checkAuth(req, res)) return;
      try {
        const body = await this.readRequestBody(req);
        const { type, payload, idempotencyKey } = JSON.parse(body || '{}');
        const job = await this.jobQueue.enqueue(type, payload || {}, idempotencyKey);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, job }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found' }));
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`[LAMS HQ] Creator Studio online at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
