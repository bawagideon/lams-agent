import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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

      // 1. Live Dashboard UI (Zero Mocks: Real DB + Real YouTube + Watched Exports)
      if (method === 'GET' && url.pathname === '/') {
        try {
          const selectedEpId = url.searchParams.get('episodeId') || undefined;
          const [episodes, channel] = await Promise.all([
            this.bridge.getRealEpisodes(),
            this.youtubeLive.getChannelStatus(),
          ]);
          const metrics = this.bridge.computePipelineMetrics(episodes);
          const skills = this.skillRegistry.listSkills();
          const exports = this.exportWatcher.listExportedVideos();

          const html = renderDashboardHtml(episodes, metrics, channel, skills, exports, selectedEpId);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Error loading dashboard:</h1><pre>${err.stack}</pre>`);
        }
        return;
      }

      // 2. Google OAuth Callback (Linking Lams' real YouTube channel)
      if (method === 'GET' && url.pathname === '/oauth2callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error || !code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>YouTube Connection Failed</h1><p>${error || 'Missing authorization code'}</p><p><a href="/">Back to Dashboard</a></p>`);
          return;
        }

        try {
          const result = await this.youtubeLive.handleOAuthCallback(code);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 60px; background: #080c14; color: #f8fafc;">
                <h1 style="color: #22c55e;">✓ Lams' YouTube Channel Successfully Linked!</h1>
                <p style="font-size: 18px;">Connected Channel: <strong>${result.channelTitle}</strong></p>
                <p style="color: #94a3b8;">Fresh permanent refresh token generated and active.</p>
                <a href="/" style="display: inline-block; margin-top: 20px; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Return to Live Cockpit</a>
              </body>
            </html>
          `);
        } catch (authErr: any) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Token Exchange Error</h1><p>${authErr.message}</p>`);
        }
        return;
      }

      // 3. Episode Scene Preview Player UI (Real Video Streaming & Script Review)
      if (method === 'GET' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/preview')) {
        const episodeId = url.pathname.split('/')[3];
        try {
          const [episodeDetails, channel] = await Promise.all([
            this.bridge.getEpisodeDetails(episodeId),
            this.youtubeLive.getChannelStatus(),
          ]);

          if (!episodeDetails) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`<h1>Episode ${episodeId} not found in database.</h1><p><a href="/">Back</a></p>`);
            return;
          }

          const exportedVideo = this.exportWatcher.findExportForEpisode(episodeId, episodeDetails.title);
          const html = renderPreviewHtml(episodeDetails, exportedVideo, channel.isConnected);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
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

      // 5. API: Assemble Real CapCut Draft (WITH AWAIT!)
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

      // 6. API: Render Fallback Master Video via FFmpeg
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

      // 7. API: Approve Episode & Publish to YouTube
      if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/approve')) {
        const episodeId = url.pathname.split('/')[3];
        try {
          const episode = await this.bridge.getEpisodeDetails(episodeId);
          if (!episode) {
            throw new Error(`Episode ${episodeId} not found`);
          }

          // Check if master video is in watched folder
          const exported = this.exportWatcher.findExportForEpisode(episodeId, episode.title);

          // Update Supabase DB status
          await this.bridge.updateEpisodeStatus(episodeId, 'Scheduled');

          // Run publish skill
          const pubSkill = this.skillRegistry.getSkill('youtube_publish')!;
          const skillResult = await this.skillRunner.execute({
            missionId: episodeId,
            skill: pubSkill,
            params: {
              episodeId,
              title: episode.title,
              description: `${episode.title}\n\n${episode.topic}\n\nProduced with LAMS HQ personal creator workforce.`,
              videoFilePath: exported?.filePath,
            },
            isApprovedByHuman: true,
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            episodeId,
            newStatus: 'Scheduled',
            receiptId: skillResult.receipt.receiptId,
            output: skillResult.outputData,
          }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // 8. API: Upload Master Video directly to Watched Exports
      if (method === 'POST' && url.pathname.startsWith('/api/episodes/') && url.pathname.endsWith('/upload-export')) {
        const episodeId = url.pathname.split('/')[3];
        try {
          const rawHeaderName = req.headers['x-filename'] as string;
          const fileName = rawHeaderName ? decodeURIComponent(rawHeaderName) : `export_${episodeId}_${Date.now()}.mp4`;

          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          const saved = this.exportWatcher.saveUploadedVideo(fileName, buffer);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...saved }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // 9. API: Stream Exported Video (HTTP 206 Partial Content)
      if (method === 'GET' && url.pathname.startsWith('/api/exports/')) {
        const fileName = decodeURIComponent(url.pathname.replace('/api/exports/', ''));
        const filePath = path.join(this.exportWatcher.getWatchedDirPath(), fileName);

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

      // 10. API: Chat & Command Processor
      if (method === 'POST' && url.pathname === '/api/chat') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const { message } = JSON.parse(body || '{}');
            const clean = (message || '').toLowerCase().trim();

            const episodes = await this.bridge.getRealEpisodes();
            let reply = '';

            if (/capcut|draft|timeline/i.test(clean)) {
              const targetEp = episodes.find(e => clean.includes(e.title.toLowerCase())) || episodes.find(e => e.status === 'Review') || episodes[0];
              if (targetEp) {
                const plan = await this.bridge.compileRealEpisodeToMediaPlan(targetEp.id);
                const draft = await this.capcutAdapter.createDraftFromMediaPlan(plan);
                reply = `✂️ CapCut draft created for <strong>${targetEp.title}</strong>!<br/>Path: <code class="text-indigo-300 text-[10px] break-all">${draft.draftPath}</code><br/>Tracks: ${draft.tracksCount} • Media pre-cached locally.`;
              } else {
                reply = `I couldn't identify which episode to assemble. You have ${episodes.length} episodes in your library.`;
              }
            } else if (/schedule|publish|approve/i.test(clean)) {
              const targetEp = episodes.find(e => clean.includes(e.title.toLowerCase())) || episodes.find(e => e.status === 'Review');
              if (targetEp) {
                const exported = this.exportWatcher.findExportForEpisode(targetEp.id, targetEp.title);
                if (exported) {
                  await this.bridge.updateEpisodeStatus(targetEp.id, 'Scheduled');
                  reply = `✓ <strong>${targetEp.title}</strong> is approved! Status set to Scheduled in Supabase, using master video <code>${exported.fileName}</code>.`;
                } else {
                  reply = `Episode <strong>${targetEp.title}</strong> is in Review, but no master video was found in <code>watched_exports/</code>. Would you like me to render a fallback MP4 with FFmpeg first or generate a CapCut draft?`;
                }
              } else {
                reply = `No pending episodes currently match that request. Active review episodes: ${episodes.filter(e => e.status === 'Review').map(e => e.title).join(', ') || 'None'}.`;
              }
            } else if (/youtube|channel|oauth/i.test(clean)) {
              const channel = await this.youtubeLive.getChannelStatus();
              if (channel.isConnected) {
                reply = `🔗 YouTube is connected to <strong>${channel.title}</strong> (${channel.subscriberCount || '0'} subs). Daily upload quota ready.`;
              } else {
                reply = `⚠️ YouTube is not linked. <a href="${channel.authUrl}" class="text-indigo-400 font-bold underline">Click here to link Lams' YouTube channel</a>.`;
              }
            } else if (/review|pending/i.test(clean)) {
              const reviewList = episodes.filter(e => e.status === 'Review');
              if (reviewList.length > 0) {
                reply = `Found <strong>${reviewList.length} episode(s)</strong> awaiting review:<br/>` + reviewList.map(e => `• <strong>${e.title}</strong> (${e.projectName}) — <a href="/api/episodes/${e.id}/preview" target="_blank" class="text-indigo-400 underline">Preview</a>`).join('<br/>');
              } else {
                reply = `All episodes are up to date! None currently waiting in Review.`;
              }
            } else {
              reply = `I can help you assemble CapCut drafts, check YouTube connections, stream scene previews, or schedule completed episodes. Try asking: <em>"Assemble CapCut draft"</em> or <em>"Review pending episodes"</em>.`;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ reply }));
          } catch (chatErr: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ reply: 'Error: ' + chatErr.message }));
          }
        });
        return;
      }

      // 11. API: Teach Mode Synthesis & Registration
      if (method === 'POST' && url.pathname === '/api/teach/compile') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const { name, application } = JSON.parse(body || '{}');
            const targetApp = application || 'YouTube Studio';

            // Synthetic demonstration trace of the demonstrated GUI actions
            const demoEvents = [
              { timestamp: Date.now(), application: targetApp, windowTitle: `${targetApp} Main View`, eventType: 'navigate' as const, targetElement: { text: 'Content / Library' } },
              { timestamp: Date.now(), application: targetApp, windowTitle: `${targetApp} Upload`, eventType: 'click' as const, targetElement: { text: 'Select Video File' } },
              { timestamp: Date.now(), application: targetApp, windowTitle: `${targetApp} Metadata`, eventType: 'keyboard' as const, targetElement: { text: 'Title Field' }, inputData: 'Episode Title from Queue' },
              { timestamp: Date.now(), application: targetApp, windowTitle: `${targetApp} Publishing`, eventType: 'click' as const, targetElement: { text: 'Publish / Schedule' } },
            ];

            const compiled = this.workflowCompiler.compile(name || 'Custom Workflow', demoEvents);
            this.skillRegistry.registerSkill(compiled.skill, true); // persist to disk

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, skill: compiled.skill }));
          } catch (teachErr: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: teachErr.message }));
          }
        });
        return;
      }

      // 12. API: Skills Execution
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
        console.log(`[LAMS HQ] Live Operations Cockpit online at http://localhost:${this.port}`);
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
