import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
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
  private maxVideoBytes = 1024 * 1024 * 1024; // 1 GB
  private maxAudioBytes = 100 * 1024 * 1024;  // 100 MB
  private maxImageBytes = 25 * 1024 * 1024;   // 25 MB

  constructor(cacheBaseDir?: string) {
    this.cacheBaseDir = cacheBaseDir || path.resolve('cache', 'media_assets');
    if (!fs.existsSync(this.cacheBaseDir)) {
      try {
        fs.mkdirSync(this.cacheBaseDir, { recursive: true });
      } catch {}
    }
  }

  /**
   * Strictly checks whether an IPv4 or IPv6 address is private, loopback, or link-local.
   */
  private isPrivateIp(ip: string): boolean {
    const cleanIp = ip.toLowerCase();

    // IPv6 checks
    if (cleanIp === '::1' || cleanIp === '::' || cleanIp.startsWith('fe80:') || cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return true;
    }

    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
    let ipv4 = cleanIp;
    if (cleanIp.startsWith('::ffff:')) {
      ipv4 = cleanIp.substring(7);
    }

    const parts = ipv4.split('.').map(p => parseInt(p, 10));
    if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      const [a, b] = parts;
      if (a === 127) return true; // 127.0.0.0/8 Loopback
      if (a === 10) return true;  // 10.0.0.0/8 Private
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 Private
      if (a === 192 && b === 168) return true; // 192.168.0.0/16 Private
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local / Cloud metadata
      if (a === 0) return true; // 0.0.0.0/8
      if (a >= 224) return true; // Multicast / Reserved
    }

    return false;
  }

  /**
   * Validates remote URL against SSRF, DNS rebinding, and private IP ranges.
   */
  public async validateRemoteUrl(rawUrl: string): Promise<URL> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(`Invalid URL format: '${rawUrl}'`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid URL scheme '${parsed.protocol}'. Only HTTP and HTTPS are permitted.`);
    }

    const hostname = parsed.hostname.toLowerCase();
    const disallowedNames = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '::1'];
    if (disallowedNames.includes(hostname) || hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.localhost')) {
      throw new Error(`Access to private or local network address '${hostname}' is prohibited.`);
    }

    // Resolve DNS and check actual IPs
    try {
      const records = await dns.lookup(hostname, { all: true });
      for (const record of records) {
        if (this.isPrivateIp(record.address)) {
          throw new Error(`Hostname '${hostname}' resolved to prohibited private IP address ${record.address}.`);
        }
      }
    } catch (dnsErr: any) {
      if (dnsErr.message.includes('prohibited private IP')) {
        throw dnsErr;
      }
      throw new Error(`DNS resolution failed for host '${hostname}': ${dnsErr.message}`);
    }

    return parsed;
  }

  /**
   * Inspects magic bytes of a downloaded file to verify its actual content type.
   */
  public verifyMagicBytes(filePath: string, expectedType: 'video' | 'audio' | 'image'): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    if (stat.size < 16) {
      throw new Error(`File is too small (${stat.size} bytes) to be valid media.`);
    }

    const buffer = Buffer.alloc(32);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 32, 0);
    fs.closeSync(fd);

    if (expectedType === 'video') {
      // MP4 / MOV: should contain 'ftyp' or 'moov' in first 16 bytes, or WebM
      const ascii = buffer.toString('ascii');
      const isMp4 = ascii.includes('ftyp') || ascii.includes('moov');
      const isWebm = buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
      if (!isMp4 && !isWebm) {
        throw new Error(`Invalid video file: missing MP4/WebM magic bytes. Header: ${buffer.subarray(0, 8).toString('hex')}`);
      }
    } else if (expectedType === 'audio') {
      // MP3 (ID3 or sync word), WAV (RIFF...WAVE), AAC, OGG
      const ascii = buffer.toString('ascii');
      const isId3 = ascii.startsWith('ID3');
      const isRiffWave = ascii.startsWith('RIFF') && ascii.includes('WAVE');
      const isMp3Sync = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0;
      const isOgg = ascii.startsWith('OggS');
      if (!isId3 && !isRiffWave && !isMp3Sync && !isOgg) {
        throw new Error(`Invalid audio file: missing MP3/WAV/OGG magic bytes. Header: ${buffer.subarray(0, 8).toString('hex')}`);
      }
    } else if (expectedType === 'image') {
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      const isJpg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
      const isWebp = buffer.toString('ascii').startsWith('RIFF') && buffer.toString('ascii').includes('WEBP');
      if (!isPng && !isJpg && !isWebp) {
        throw new Error(`Invalid image file: missing PNG/JPEG/WEBP magic bytes.`);
      }
    }
  }

  /**
   * Downloads a single remote asset safely or returns existing local file.
   */
  public async ensureLocalAsset(
    episodeId: string,
    assetUrlOrPath: string,
    fileNameHint?: string,
    expectedType: 'video' | 'audio' | 'image' = 'video'
  ): Promise<DownloadedAsset> {
    // If it's already a local file path that exists, return it directly
    if (fs.existsSync(assetUrlOrPath) && !assetUrlOrPath.startsWith('http://') && !assetUrlOrPath.startsWith('https://')) {
      const stats = fs.statSync(assetUrlOrPath);
      this.verifyMagicBytes(path.resolve(assetUrlOrPath), expectedType);
      return {
        originalUrl: assetUrlOrPath,
        localPath: path.resolve(assetUrlOrPath),
        sizeBytes: stats.size,
        fromCache: true,
      };
    }

    // SSRF and DNS verification
    const parsedUrl = await this.validateRemoteUrl(assetUrlOrPath);

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
        fileName = `asset_${Date.now()}.${expectedType === 'audio' ? 'mp3' : 'mp4'}`;
      }
    }
    fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localTarget = path.join(episodeCacheDir, fileName);

    // Reuse valid cached file
    if (fs.existsSync(localTarget)) {
      try {
        const stats = fs.statSync(localTarget);
        if (stats.size > 1024) {
          this.verifyMagicBytes(localTarget, expectedType);
          return {
            originalUrl: assetUrlOrPath,
            localPath: localTarget,
            sizeBytes: stats.size,
            fromCache: true,
          };
        }
      } catch {
        // If stat or magic byte fails, re-download
      }
    }

    // Download from remote URL with size limiting and timeout
    console.log(`[MediaAssetDownloader] Downloading: ${assetUrlOrPath} -> ${localTarget}`);
    const maxBytes = expectedType === 'video' ? this.maxVideoBytes : (expectedType === 'audio' ? this.maxAudioBytes : this.maxImageBytes);

    try {
      const response = await fetch(assetUrlOrPath, {
        signal: AbortSignal.timeout(60000), // 60s timeout
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Empty response body received from media server.');
      }

      // Check Content-Length header if present
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredSize = parseInt(contentLengthHeader, 10);
        if (declaredSize > maxBytes) {
          throw new Error(`Asset exceeds max size limit of ${Math.round(maxBytes / (1024 * 1024))}MB (declared: ${declaredSize} bytes).`);
        }
      }

      // Stream to local file while counting bytes
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(localTarget);

      // @ts-ignore
      const nodeReadable = Readable.fromWeb(response.body);
      nodeReadable.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > maxBytes) {
          nodeReadable.destroy(new Error(`Download exceeded maximum permitted size of ${maxBytes} bytes.`));
        }
      });

      await pipeline(nodeReadable, fileStream);

      const stats = fs.statSync(localTarget);
      if (stats.size < 512) {
        throw new Error(`Downloaded asset corrupted or too small (${stats.size} bytes).`);
      }

      // Verify Magic Bytes
      this.verifyMagicBytes(localTarget, expectedType);

      console.log(`[MediaAssetDownloader] Verified ${stats.size} bytes (${expectedType}) for ${fileName}`);

      return {
        originalUrl: assetUrlOrPath,
        localPath: localTarget,
        sizeBytes: stats.size,
        fromCache: false,
      };
    } catch (err: any) {
      if (fs.existsSync(localTarget)) {
        try { fs.unlinkSync(localTarget); } catch {}
      }
      throw new Error(`Failed to download ${expectedType} asset from ${assetUrlOrPath}: ${err.message}`);
    }
  }

  /**
   * Pre-caches all visual and audio assets in a MediaPlan.
   * STRICT FAIL-CLOSED: Fails execution if ANY visual OR audio clip cannot be resolved or verified.
   */
  public async preCacheMediaPlanAssets(plan: any): Promise<any> {
    const updatedPlan = JSON.parse(JSON.stringify(plan));
    const failedAssets: string[] = [];

    // 1. Download visuals strictly
    if (updatedPlan.tracks?.visuals) {
      for (const vis of updatedPlan.tracks.visuals) {
        if (vis.src && (vis.src.startsWith('http://') || vis.src.startsWith('https://'))) {
          try {
            const downloaded = await this.ensureLocalAsset(plan.projectId, vis.src, `${vis.id}.mp4`, 'video');
            vis.src = downloaded.localPath;
          } catch (err: any) {
            console.error(`[MediaAssetDownloader] STRICT ERROR on visual ${vis.id}: ${err.message}`);
            failedAssets.push(`Visual clip '${vis.id}': ${err.message}`);
          }
        } else if (vis.src && !fs.existsSync(vis.src)) {
          failedAssets.push(`Visual clip '${vis.id}': Local file not found at ${vis.src}`);
        }
      }
    }

    // 2. Download audios strictly (voiceover/narration is essential)
    if (updatedPlan.tracks?.audio) {
      for (const aud of updatedPlan.tracks.audio) {
        if (aud.src && (aud.src.startsWith('http://') || aud.src.startsWith('https://'))) {
          try {
            const downloaded = await this.ensureLocalAsset(plan.projectId, aud.src, `${aud.id}.mp3`, 'audio');
            aud.src = downloaded.localPath;
          } catch (err: any) {
            console.error(`[MediaAssetDownloader] STRICT ERROR on audio ${aud.id}: ${err.message}`);
            failedAssets.push(`Audio track '${aud.id}': ${err.message}`);
          }
        } else if (aud.src && !fs.existsSync(aud.src)) {
          failedAssets.push(`Audio track '${aud.id}': Local file not found at ${aud.src}`);
        }
      }
    }

    if (failedAssets.length > 0) {
      throw new Error(
        `Cannot assemble timeline: ${failedAssets.length} required media asset(s) failed validation:\n- ` +
        failedAssets.join('\n- ')
      );
    }

    return updatedPlan;
  }
}
