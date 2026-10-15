import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export interface DownloadedAsset {
  originalUrl: string;
  localPath: string;
  sizeBytes: number;
  fromCache: boolean;
}

export class MediaAssetDownloader {
  private cacheBaseDir: string;

  constructor(cacheBaseDir?: string) {
    this.cacheBaseDir = cacheBaseDir || path.resolve('cache', 'media_assets');
    if (!fs.existsSync(this.cacheBaseDir)) {
      fs.mkdirSync(this.cacheBaseDir, { recursive: true });
    }
  }

  /**
   * Downloads a single remote asset or returns existing local file if already cached
   */
  public async ensureLocalAsset(episodeId: string, assetUrlOrPath: string, fileNameHint?: string): Promise<DownloadedAsset> {
    // If it's already a local file path that exists, return it directly
    if (fs.existsSync(assetUrlOrPath) && !assetUrlOrPath.startsWith('http://') && !assetUrlOrPath.startsWith('https://')) {
      const stats = fs.statSync(assetUrlOrPath);
      return {
        originalUrl: assetUrlOrPath,
        localPath: path.resolve(assetUrlOrPath),
        sizeBytes: stats.size,
        fromCache: true,
      };
    }

    // It's a remote URL: set up destination directory
    const episodeCacheDir = path.join(this.cacheBaseDir, episodeId);
    if (!fs.existsSync(episodeCacheDir)) {
      fs.mkdirSync(episodeCacheDir, { recursive: true });
    }

    // Determine filename
    let fileName = fileNameHint;
    if (!fileName) {
      try {
        const parsed = new URL(assetUrlOrPath);
        fileName = path.basename(parsed.pathname);
      } catch {
        fileName = `asset_${Date.now()}.mp4`;
      }
    }
    // Clean up filename
    fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localTarget = path.join(episodeCacheDir, fileName);

    // If file already exists locally and has non-zero size, reuse cache
    if (fs.existsSync(localTarget)) {
      const stats = fs.statSync(localTarget);
      if (stats.size > 1024) {
        return {
          originalUrl: assetUrlOrPath,
          localPath: localTarget,
          sizeBytes: stats.size,
          fromCache: true,
        };
      }
    }

    // Download from remote URL
    console.log(`[MediaAssetDownloader] Downloading: ${assetUrlOrPath} -> ${localTarget}`);
    const response = await fetch(assetUrlOrPath, {
      signal: AbortSignal.timeout(60000), // 60s timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to download media asset from ${assetUrlOrPath}: HTTP ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error(`Empty response body from ${assetUrlOrPath}`);
    }

    // Stream to local file
    const fileStream = fs.createWriteStream(localTarget);
    // @ts-ignore - Readable.fromWeb works in Node 18+
    await pipeline(Readable.fromWeb(response.body), fileStream);

    const stats = fs.statSync(localTarget);
    console.log(`[MediaAssetDownloader] Downloaded ${stats.size} bytes for ${fileName}`);

    return {
      originalUrl: assetUrlOrPath,
      localPath: localTarget,
      sizeBytes: stats.size,
      fromCache: false,
    };
  }

  /**
   * Pre-caches all visual and audio assets in a MediaPlan and returns an updated MediaPlan with local paths
   */
  public async preCacheMediaPlanAssets(plan: any): Promise<any> {
    const updatedPlan = JSON.parse(JSON.stringify(plan));

    // 1. Download visuals
    if (updatedPlan.tracks?.visuals) {
      for (const vis of updatedPlan.tracks.visuals) {
        if (vis.src && (vis.src.startsWith('http://') || vis.src.startsWith('https://'))) {
          try {
            const downloaded = await this.ensureLocalAsset(plan.projectId, vis.src, `${vis.id}.mp4`);
            vis.src = downloaded.localPath;
          } catch (err: any) {
            console.warn(`[MediaAssetDownloader] Warning: Could not download visual ${vis.id}: ${err.message}`);
          }
        }
      }
    }

    // 2. Download audios
    if (updatedPlan.tracks?.audio) {
      for (const aud of updatedPlan.tracks.audio) {
        if (aud.src && (aud.src.startsWith('http://') || aud.src.startsWith('https://'))) {
          try {
            const downloaded = await this.ensureLocalAsset(plan.projectId, aud.src, `${aud.id}.mp3`);
            aud.src = downloaded.localPath;
          } catch (err: any) {
            console.warn(`[MediaAssetDownloader] Warning: Could not download audio ${aud.id}: ${err.message}`);
          }
        }
      }
    }

    return updatedPlan;
  }
}
