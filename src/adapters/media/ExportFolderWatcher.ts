import fs from 'node:fs';
import path from 'node:path';

export interface ExportedVideoFile {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  sizeMb: number;
  modifiedAt: string;
  matchedEpisodeId?: string;
}

export class ExportFolderWatcher {
  private watchedDir: string;

  constructor(customPath?: string) {
    this.watchedDir = customPath || path.resolve('watched_exports');
    if (!fs.existsSync(this.watchedDir)) {
      fs.mkdirSync(this.watchedDir, { recursive: true });
    }
  }

  public getWatchedDirPath(): string {
    return this.watchedDir;
  }

  /**
   * Scans watched folder for exported video files (.mp4, .mov, .mkv, .webm)
   */
  public listExportedVideos(): ExportedVideoFile[] {
    if (!fs.existsSync(this.watchedDir)) {
      return [];
    }

    const videoExts = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
    const entries = fs.readdirSync(this.watchedDir, { withFileTypes: true });

    const files: ExportedVideoFile[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (videoExts.has(ext)) {
          const fullPath = path.join(this.watchedDir, entry.name);
          try {
            const stats = fs.statSync(fullPath);
            files.push({
              fileName: entry.name,
              filePath: fullPath,
              sizeBytes: stats.size,
              sizeMb: Math.round((stats.size / (1024 * 1024)) * 100) / 100,
              modifiedAt: stats.mtime.toISOString(),
            });
          } catch {
            // file might be locked during active write
          }
        }
      }
    }

    return files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  }

  /**
   * Finds the best matching video export for a specific episode ID or title
   */
  public findExportForEpisode(episodeId: string, episodeTitle?: string): ExportedVideoFile | null {
    const exports = this.listExportedVideos();
    if (exports.length === 0) return null;

    // 1. Exact match on episodeId
    const idMatch = exports.find(e => e.fileName.toLowerCase().includes(episodeId.toLowerCase()));
    if (idMatch) return idMatch;

    // 2. Title match
    if (episodeTitle) {
      const cleanTitle = episodeTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      const titleMatch = exports.find(e => {
        const cleanFile = e.fileName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanFile.includes(cleanTitle) || cleanTitle.includes(cleanFile);
      });
      if (titleMatch) return titleMatch;
    }

    // 3. Fallback: return most recent export if only 1 exists
    if (exports.length === 1) {
      return exports[0];
    }

    return null;
  }

  /**
   * Writes a raw buffer or stream to the watched export directory
   */
  public saveUploadedVideo(fileName: string, buffer: Buffer): ExportedVideoFile {
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = path.join(this.watchedDir, cleanFileName);
    fs.writeFileSync(targetPath, buffer);
    const stats = fs.statSync(targetPath);

    return {
      fileName: cleanFileName,
      filePath: targetPath,
      sizeBytes: stats.size,
      sizeMb: Math.round((stats.size / (1024 * 1024)) * 100) / 100,
      modifiedAt: stats.mtime.toISOString(),
    };
  }
}
