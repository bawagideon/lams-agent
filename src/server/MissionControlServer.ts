import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { YTEngineBridge } from '../bridge/YTEngineBridge.ts';
import { CapCutAdapter } from '../adapters/media/CapCutAdapter.ts';
import { YouTubeLiveClient } from '../adapters/youtube/YouTubeLiveClient.ts';
import { HeadlessRenderer } from '../adapters/media/HeadlessRenderer.ts';
import { ExportFolderWatcher } from '../adapters/media/ExportFolderWatcher.ts';
import { WorkflowCompiler } from '../compiler/WorkflowCompiler.ts';
import { SkillRegistry } from '../skills/SkillRegistry.ts';
import { SkillRunner } from '../skills/SkillRunner.ts';
import { renderDashboardHtml } from './views/DashboardHtml.ts';
import { renderPreviewHtml } from './views/PreviewHtml.ts';

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

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  public async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const method = req.method || 'GET';

    const pageRoutes = ['/', '/home', '/episodes', '/skills', '/activity', '/connections'];

    // 1. Live Creator Studio Pages (Home, Episodes, Skills, Activity, Connections)
    if (method === 'GET' && pageRoutes.includes(url.pathname)) {
      try {
        const initialTab = url.pathname === '/' || url.pathname === '/home' ? 'home' : url.pathname.slice(1);
        const selectedEpId = url.searchParams.get('episodeId') || undefined;
        const [episodes, channel] = await Promise.all([
          this.bridge.getRealEpisodes(),
          this.youtubeLive.getChannelStatus(),
        ]);
        const metrics = this.bridge.computePipelineMetrics(episodes);
        const skills = this.skillRegistry.listSkills();
        const exports = this.exportWatcher.listExportedVideos();

        const html = renderDashboardHtml(episodes, metrics, channel, skills, exports, selectedEpId, initialTab);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Error loading studio:</h1><pre>${err.stack}</pre>`);
      }
      return;
    }

    // 2. Google OAuth Callback (Linking Lams' YouTube channel)
    if (method === 'GET' && url.pathname === '/oauth2callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error || !code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>YouTube Connection Notice</h1><p>${error || 'Missing authorization code'}</p><p><a href="/">Back to Studio</a></p>`);
        return;
      }

      try {
        const result = await this.youtubeLive.handleOAuthCallback(code);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 60px; background: #f8fafc; color: #0f172a;">
              <h1 style="color: #16a34a; font-size: 24px; font-weight: bold;">✓ YouTube Channel Successfully Connected!</h1>
              <p style="font-size: 16px; margin-top: 10px; color: #334155;">Connected as: <strong>${result.channelTitle}</strong></p>
              <p style="color: #64748b; font-size: 13px;">Your studio is now ready to schedule private releases.</p>
              <a href="/connections" style="display: inline-block; margin-top: 24px; background: #4338ca; color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px;">Return to Studio</a>
            </body>
          </html>
        `);
      } catch (authErr: any) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Connection Notice</h1><p>${authErr.message}</p><p><a href="/connections">Back to Studio</a></p>`);
      }
      return;
    }

    // 2b. API: List Episodes and Metrics JSON
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

    // 3. Episode Scene Preview Player UI (handles /episodes/:id, /episodes/:id/preview, and /api/episodes/:id/preview)
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
          this.youtubeLive.getChannelStatus(),
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
        res.end(`<h1>Preview Error:</h1><pre>${err.stack}</pre>`);
      }
      return;
    }

    // 4. API: Episode Details JSON
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

    // 5. API: Release Room Preflight Check
    if (method === 'GET' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/release-check')) {
      const episodeId = url.pathname.split('/')[3];
      try {
        const [episode, channel] = await Promise.all([
          this.bridge.getEpisodeDetails(episodeId),
          this.youtubeLive.getChannelStatus(),
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

    // 6. API: Assemble Real CapCut Draft
    if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/capcut')) {
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

    // 7. API: Render Master Video via FFmpeg
    if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/render')) {
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

    // 8. API: Hardened Approve & Release Workflow (Strict State Machine)
    if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/approve')) {
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
        const channel = await this.youtubeLive.getChannelStatus();

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

        // Step 2: Execute publishing skill (DO NOT TOUCH DATABASE YET)
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

        // Step 3: Check execution receipt strictly
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

        // Step 4: ONLY AFTER YouTube API confirms videoId, update Supabase DB
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

    // 9. API: Streaming File Upload to Export Folder (Path Containment & Memory-Safe)
    if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/upload-export')) {
      const episodeId = url.pathname.split('/')[3];
      try {
        const rawHeaderName = req.headers['x-filename'] as string;
        const decoded = rawHeaderName ? decodeURIComponent(rawHeaderName) : `export_${episodeId}_${Date.now()}.mp4`;
        const safeName = path.basename(decoded).replace(/[^a-zA-Z0-9._-]/g, '_');
        const targetPath = path.join(this.exportWatcher.getWatchedDirPath(), safeName);

        const fileStream = fs.createWriteStream(targetPath);
        // @ts-ignore
        await pipeline(req, fileStream);

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
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 10. API: Stream Exported Video (HTTP 206 Partial Content + Path Traversal Prevention)
    if (method === 'GET' && url.pathname.startsWith('/api/exports/')) {
      const rawFileName = decodeURIComponent(url.pathname.replace('/api/exports/', ''));
      const safeFileName = path.basename(rawFileName); // Traversal protection
      const filePath = path.join(this.exportWatcher.getWatchedDirPath(), safeFileName);

      if (!fs.existsSync(filePath)) {
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

    // 11. API: Creator Assistant Chat with Plan Cards
    if (method === 'POST' && url.pathname === '/api/chat') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
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
              reply = `I prepared the release plan for <strong>${targetEp.title}</strong>. Review the details below and confirm when ready:`;
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
              reply = `I can assemble the CapCut desktop timeline for <strong>${targetEp.title}</strong>. Click below to proceed:`;
            } else {
              reply = `Tell me which episode to assemble for CapCut.`;
            }
          } else if (/youtube|channel|status|connect/i.test(clean)) {
            const channel = await this.youtubeLive.getChannelStatus();
            if (channel.isConnected) {
              reply = `🔗 YouTube is connected to <strong>${channel.title}</strong> (${channel.subscriberCount || '0'} subscribers). All uploads are posted privately for review.`;
            } else {
              reply = `⚠️ YouTube is not connected. <a href="${channel.authUrl}" class="text-indigo-400 font-bold underline">Click here to connect your YouTube channel</a>.`;
            }
          } else if (/review|pending|needs|next/i.test(clean)) {
            const reviewList = episodes.filter(e => e.status === 'Review');
            if (reviewList.length > 0) {
              reply = `You have <strong>${reviewList.length} episode(s)</strong> awaiting your OK:<br/>` +
                reviewList.map(e => `• <strong>${e.title}</strong> (${e.projectName}) — <a href="/api/episodes/${e.id}/preview" target="_blank" class="text-indigo-400 underline">Preview</a>`).join('<br/>');
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
      });
      return;
    }

    // 12. API: Teach Mode Synthesis & Registration
    if (method === 'POST' && url.pathname === '/api/teach/compile') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
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
      });
      return;
    }

    // 13. API: Skills Execution
    if (method === 'POST' && url.pathname.startsWith('/api/skills/') && url.pathname.endsWith('/run')) {
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
