import os from 'node:os';
import path from 'node:path';
import { DurableJobQueue, AgentJob } from '../jobs/DurableJobQueue.ts';
import { YTEngineBridge } from '../bridge/YTEngineBridge.ts';
import { CapCutAdapter } from '../adapters/media/CapCutAdapter.ts';
import { HeadlessRenderer } from '../adapters/media/HeadlessRenderer.ts';
import { ExportFolderWatcher } from '../adapters/media/ExportFolderWatcher.ts';

export class WindowsWorker {
  private workerId: string;
  private queue: DurableJobQueue;
  private bridge: YTEngineBridge;
  private capcutAdapter: CapCutAdapter;
  private headlessRenderer: HeadlessRenderer;
  private exportWatcher: ExportFolderWatcher;
  private isRunning: boolean = false;
  private pollIntervalMs: number = 3000;

  constructor(customWorkerId?: string) {
    this.workerId = customWorkerId || `worker-${os.hostname()}-${process.pid}`;
    this.queue = DurableJobQueue.getInstance();
    this.bridge = new YTEngineBridge();
    this.capcutAdapter = new CapCutAdapter();
    this.headlessRenderer = new HeadlessRenderer();
    this.exportWatcher = new ExportFolderWatcher();
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[WindowsWorker] Started worker '${this.workerId}'. Listening for desktop jobs...`);

    while (this.isRunning) {
      try {
        const job = await this.queue.claimNext(this.workerId, ['capcut_draft', 'ffmpeg_render']);
        if (job) {
          console.log(`[WindowsWorker] Claimed job ${job.id} (${job.type})`);
          await this.executeJob(job);
        }
      } catch (err: any) {
        console.error(`[WindowsWorker] Error in poll loop: ${err.message}`);
      }

      if (this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
      }
    }
  }

  public stop(): void {
    this.isRunning = false;
    console.log(`[WindowsWorker] Worker '${this.workerId}' shutting down gracefully.`);
  }

  private async executeJob(job: AgentJob): Promise<void> {
    let heartbeatTimer: NodeJS.Timeout | null = null;
    try {
      // Start heartbeat timer every 15 seconds
      heartbeatTimer = setInterval(async () => {
        await this.queue.heartbeat(job.id, this.workerId);
      }, 15000);

      let result: any = null;

      if (job.type === 'capcut_draft') {
        const episodeId = job.payload.episodeId;
        if (!episodeId) throw new Error('Missing episodeId in capcut_draft job payload.');

        const mediaPlan = await this.bridge.compileRealEpisodeToMediaPlan(episodeId);
        const draftResult = await this.capcutAdapter.createDraftFromMediaPlan(mediaPlan);
        result = {
          draftId: draftResult.draftId,
          draftPath: draftResult.draftPath,
          tracksCount: draftResult.tracksCount,
          durationSeconds: draftResult.totalDurationSeconds,
        };
      } else if (job.type === 'ffmpeg_render') {
        const episodeId = job.payload.episodeId;
        if (!episodeId) throw new Error('Missing episodeId in ffmpeg_render job payload.');

        const mediaPlan = await this.bridge.compileRealEpisodeToMediaPlan(episodeId);
        const cleanTitle = (mediaPlan.title || 'episode').replace(/[^a-zA-Z0-9]/g, '_');
        const outName = `${cleanTitle}_${episodeId.substring(0, 8)}_master.mp4`;
        const outPath = path.join(this.exportWatcher.getWatchedDirPath(), outName);

        const renderResult = await this.headlessRenderer.render(mediaPlan, outPath);
        result = {
          outputPath: renderResult.outputPath,
          durationSeconds: renderResult.durationSeconds,
          fileSizeBytes: renderResult.fileSizeBytes,
        };
      } else {
        throw new Error(`Unsupported job type '${job.type}' for Windows worker.`);
      }

      await this.queue.complete(job.id, this.workerId, result);
      console.log(`[WindowsWorker] Successfully completed job ${job.id}`);
    } catch (err: any) {
      console.error(`[WindowsWorker] Job ${job.id} failed: ${err.message}`);
      await this.queue.fail(job.id, this.workerId, err.message);
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    }
  }
}

// Standalone execution if run directly via CLI
if (process.argv[1] && (process.argv[1].endsWith('WindowsWorker.ts') || process.argv[1].endsWith('WindowsWorker.js'))) {
  const worker = new WindowsWorker();
  worker.start().catch(console.error);

  process.on('SIGINT', () => {
    worker.stop();
    process.exit(0);
  });
}
