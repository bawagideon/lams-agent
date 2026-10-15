import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import type { MediaPlan } from '../../contracts/MediaPlan.ts';
import { MediaAssetDownloader } from './MediaAssetDownloader.ts';

export interface RenderResult {
  success: boolean;
  outputPath: string;
  durationSeconds: number;
  fileSizeBytes: number;
  renderedAt: string;
  commandExecuted?: string;
}

export class HeadlessRenderer {
  private ffmpegPath: string;
  private downloader: MediaAssetDownloader;

  constructor(customFfmpegPath?: string) {
    this.ffmpegPath = customFfmpegPath || process.env.FFMPEG_PATH || 'ffmpeg';
    this.downloader = new MediaAssetDownloader();
  }

  /**
   * Checks if FFmpeg binary is accessible
   */
  public async isFFmpegAvailable(): Promise<{ available: boolean; version?: string }> {
    return new Promise((resolve) => {
      execFile(this.ffmpegPath, ['-version'], (err, stdout) => {
        if (err) {
          resolve({ available: false });
        } else {
          const firstLine = stdout.split('\n')[0];
          resolve({ available: true, version: firstLine });
        }
      });
    });
  }

  /**
   * Generates a deterministic FFmpeg filtergraph specification from MediaPlan
   */
  public buildFFmpegCommand(plan: MediaPlan, outputPath: string): { args: string[]; commandSummary: string } {
    const args: string[] = ['-y'];

    // Collect all unique visual inputs
    plan.tracks.visuals.forEach(v => {
      args.push('-i', path.resolve(v.src));
    });

    // Collect all unique audio inputs
    plan.tracks.audio.forEach(a => {
      args.push('-i', path.resolve(a.src));
    });

    const numVisuals = plan.tracks.visuals.length;
    const numAudios = plan.tracks.audio.length;

    const filterComplex: string[] = [];

    // 1. Scale and pad all visual clips to target resolution
    const visualStreams: string[] = [];
    for (let i = 0; i < numVisuals; i++) {
      const scaledTag = `[v_scaled_${i}]`;
      filterComplex.push(
        `[${i}:v]scale=${plan.resolution.width}:${plan.resolution.height}:force_original_aspect_ratio=decrease,pad=${plan.resolution.width}:${plan.resolution.height}:(ow-iw)/2:(oh-ih)/2,setsar=1${scaledTag}`
      );
      visualStreams.push(scaledTag);
    }

    // 2. Concatenate visual streams
    if (visualStreams.length > 0) {
      filterComplex.push(`${visualStreams.join('')}concat=n=${visualStreams.length}:v=1:a=0[v_concat]`);
    }

    // 3. Audio stream mixing with adelay offsets
    const audioStreams: string[] = [];
    for (let j = 0; j < numAudios; j++) {
      const inputIndex = numVisuals + j;
      const audioConfig = plan.tracks.audio[j];
      const delayMs = Math.round(audioConfig.startTime * 1000);
      const delayedTag = `[a_delayed_${j}]`;

      // Apply delay & volume
      filterComplex.push(
        `[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=${audioConfig.volume}${delayedTag}`
      );
      audioStreams.push(delayedTag);
    }

    // 4. Mix all audio tracks
    if (audioStreams.length > 0) {
      filterComplex.push(`${audioStreams.join('')}amix=inputs=${audioStreams.length}:duration=longest[a_mix]`);
    }

    args.push('-filter_complex', filterComplex.join(';'));
    args.push('-map', '[v_concat]');
    if (audioStreams.length > 0) {
      args.push('-map', '[a_mix]');
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-t', plan.durationSeconds.toString(),
      outputPath
    );

    return {
      args,
      commandSummary: `${this.ffmpegPath} ${args.join(' ')}`,
    };
  }

  /**
   * Executes the render pipeline
   */
  public async render(plan: MediaPlan, outputPath: string): Promise<RenderResult> {
    const { available } = await this.isFFmpegAvailable();
    if (!available) {
      throw new Error(
        `FFmpeg binary not found at '${this.ffmpegPath}'. Please set FFMPEG_PATH or install ffmpeg.`
      );
    }

    // 1. Pre-cache all remote assets locally
    const localPlan: MediaPlan = await this.downloader.preCacheMediaPlanAssets(plan);
    localPlan.tracks.visuals = (localPlan.tracks.visuals || []).filter(v => fs.existsSync(v.src));
    localPlan.tracks.audio = (localPlan.tracks.audio || []).filter(a => fs.existsSync(a.src));

    if (localPlan.tracks.visuals.length === 0) {
      throw new Error(`Cannot render: No scene video files could be downloaded or found locally.`);
    }

    // Ensure output directory exists
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const { args, commandSummary } = this.buildFFmpegCommand(localPlan, outputPath);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.ffmpegPath, args);

      let stderrLog = '';
      proc.stderr.on('data', (d) => {
        stderrLog += d.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg exited with code ${code}:\n${stderrLog}`));
          return;
        }

        if (!fs.existsSync(outputPath)) {
          reject(new Error(`Render reported success but output file not found at ${outputPath}`));
          return;
        }

        const stats = fs.statSync(outputPath);
        resolve({
          success: true,
          outputPath,
          durationSeconds: plan.durationSeconds,
          fileSizeBytes: stats.size,
          renderedAt: new Date().toISOString(),
          commandExecuted: commandSummary,
        });
      });
    });
  }
}
