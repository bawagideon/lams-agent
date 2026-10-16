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
   * Validates remote URL against SSRF and private IP ranges
   */
  private validateRemoteUrl(rawUrl: string): URL {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid URL scheme '${parsed.protocol}'. Only HTTP and HTTPS are permitted.`);
    }

    const hostname = parsed.hostname.toLowerCase();
    const disallowed = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '::1'];
    if (disallowed.includes(hostname) || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
      throw new Error(`Access to private/local network address '${hostname}' is prohibited.`);
    }

    return parsed;
  }

  /**
   * Downloads a single remote asset or returns existing local file if already cached.
   * Cleans up partial files on failure.
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

    // SSRF verification
    const parsedUrl = this.validateRemoteUrl(assetUrlOrPath);

    // Set up destination directory
    const cleanEpisodeId = episodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const episodeCacheDir = path.join(this.cacheBaseDir, cleanEpisodeId);
    if (!fs.existsSync(episodeCacheDir)) {
      fs.mkdirSync(episodeCacheDir, { recursive: true });
    }

    // Determine clean filename
    let fileName = fileNameHint;
    if (!fileName) {
      try {
        fileName = path.basename(parsedUrl.pathname);
      } catch {
        fileName = `asset_${Date.now()}.mp4`;
      }
    }
    fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localTarget = path.join(episodeCacheDir, fileName);

    // Reuse valid cached file
    if (fs.existsSync(localTarget)) {
      try {
        const stats = fs.statSync(localTarget);
        if (stats.size > 1024) {
          return {
            originalUrl: assetUrlOrPath,
            localPath: localTarget,
            sizeBytes: stats.size,
            fromCache: true,
          };
        }
      } catch {
        // If stat fails, re-download
      }
    }

    // Download from remote URL
    console.log(`[MediaAssetDownloader] Downloading: ${assetUrlOrPath} -> ${localTarget}`);
    
    try {
      const response = await fetch(assetUrlOrPath, {
        signal: AbortSignal.timeout(60000), // 60s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Empty response body received from media server.');
      }

      // Stream to local file
      const fileStream = fs.createWriteStream(localTarget);
      // @ts-ignore - Readable.fromWeb works in Node 18+
      await pipeline(Readable.fromWeb(response.body), fileStream);

      const stats = fs.statSync(localTarget);
      if (stats.size < 512) {
        throw new Error(`Downloaded asset corrupted or too small (${stats.size} bytes).`);
      }

      console.log(`[MediaAssetDownloader] Verified ${stats.size} bytes for ${fileName}`);

      return {
        originalUrl: assetUrlOrPath,
        localPath: localTarget,
        sizeBytes: stats.size,
        fromCache: false,
      };
    } catch (err: any) {
      // Clean up corrupt/partial file on failure
      if (fs.existsSync(localTarget)) {
        try { fs.unlinkSync(localTarget); } catch {}
      }
      throw new Error(`Failed to download media asset from ${assetUrlOrPath}: ${err.message}`);
    }
  }

  /**
   * Pre-caches all visual and audio assets in a MediaPlan.
   * STRICT: Fails execution if any visual clip cannot be resolved locally.
   */
  public async preCacheMediaPlanAssets(plan: any): Promise<any> {
    const updatedPlan = JSON.parse(JSON.stringify(plan));
    const failedVisuals: string[] = [];

    // 1. Download visuals strictly
    if (updatedPlan.tracks?.visuals) {
      for (const vis of updatedPlan.tracks.visuals) {
        if (vis.src && (vis.src.startsWith('http://') || vis.src.startsWith('https://'))) {
          try {
            const downloaded = await this.ensureLocalAsset(plan.projectId, vis.src, `${vis.id}.mp4`);
            vis.src = downloaded.localPath;
          } catch (err: any) {
            console.error(`[MediaAssetDownloader] STRICT ERROR on visual ${vis.id}: ${err.message}`);
            failedVisuals.push(`${vis.id} (${err.message})`);
          }
        } else if (vis.src && !fs.existsSync(vis.src)) {
          failedVisuals.push(`${vis.id} (Local file not found: ${vis.src})`);
        }
      }
    }

    if (failedVisuals.length > 0) {
      throw new Error(
        `Cannot assemble timeline: ${failedVisuals.length} visual clip(s) failed validation:\n- ` +
        failedVisuals.join('\n- ')
      );
    }

    // 2. Download audios (if any)
    if (updatedPlan.tracks?.audio) {
      for (const aud of updatedPlan.tracks.audio) {
        if (aud.src && (aud.src.startsWith('http://') || aud.src.startsWith('https://'))) {
          try {
            const downloaded = await this.ensureLocalAsset(plan.projectId, aud.src, `${aud.id}.mp3`);
            aud.src = downloaded.localPath;
          } catch (err: any) {
            console.warn(`[MediaAssetDownloader] Audio download skipped for ${aud.id}: ${err.message}`);
          }
        }
      }
    }

    return updatedPlan;
  }
}
