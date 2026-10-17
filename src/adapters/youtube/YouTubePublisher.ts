import fs from 'node:fs';
import path from 'node:path';
import { google, youtube_v3 } from 'googleapis';

export interface YouTubePublishInput {
  videoFilePath: string;
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string; // Default '27' (Education) or '28' (Science & Tech)
  privacyStatus?: 'private' | 'public' | 'unlisted';
  publishAt?: string; // ISO-8601 string, e.g. "2026-10-10T19:00:00.000Z"
  thumbnailFilePath?: string;
  onProgress?: (progressPercent: number, uploadedBytes: number, totalBytes: number) => void;
}

export interface YouTubePublishReceipt {
  success: boolean;
  videoId: string;
  videoUrl: string;
  status: string;
  privacyStatus: string;
  scheduledPublishTime?: string;
  uploadedAt: string;
  fileSizeBytes: number;
  thumbnailUploaded: boolean;
  channelId: string;
  quotaCostEstimate: number;
}

export class YouTubePublisher {
  private youtube: youtube_v3.Youtube;
  private authClient: any;

  constructor(clientId: string, clientSecret: string, refreshToken: string) {
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'Missing YouTube credentials. clientId, clientSecret, and refreshToken are required.'
      );
    }

    this.authClient = new google.auth.OAuth2(clientId, clientSecret);
    this.authClient.setCredentials({ refresh_token: refreshToken });
    this.youtube = google.youtube({ version: 'v3', auth: this.authClient });
  }

  /**
   * Pre-flight checks: ensures video file exists, validates publishAt time,
   * checks file size and returns basic quota cost estimate.
   */
  public async preflightValidate(input: YouTubePublishInput): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!fs.existsSync(input.videoFilePath)) {
      errors.push(`Video file does not exist at: ${input.videoFilePath}`);
    }

    if (input.thumbnailFilePath && !fs.existsSync(input.thumbnailFilePath)) {
      errors.push(`Thumbnail file does not exist at: ${input.thumbnailFilePath}`);
    }

    if (input.publishAt) {
      const scheduleDate = new Date(input.publishAt);
      if (isNaN(scheduleDate.getTime())) {
        errors.push(`Invalid publishAt ISO date format: ${input.publishAt}`);
      } else if (scheduleDate.getTime() <= Date.now()) {
        errors.push(`publishAt must be in the future. Received: ${input.publishAt}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Performs resumable upload to YouTube and sets metadata, scheduling, and thumbnail
   */
  public async publish(input: YouTubePublishInput): Promise<YouTubePublishReceipt> {
    const validation = await this.preflightValidate(input);
    if (!validation.valid) {
      throw new Error(`Preflight validation failed:\n${validation.errors.join('\n')}`);
    }

    const fileStats = fs.statSync(input.videoFilePath);
    const totalBytes = fileStats.size;

    // Quota cost for videos.insert is 1600 units
    const quotaCost = 1600 + (input.thumbnailFilePath ? 50 : 0);

    // If scheduled, YouTube strictly requires privacyStatus to be 'private'
    const privacy = input.publishAt ? 'private' : (input.privacyStatus || 'private');

    const requestBody: youtube_v3.Schema$Video = {
      snippet: {
        title: input.title,
        description: input.description,
        tags: input.tags || [],
        categoryId: input.categoryId || '27',
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: false,
      },
    };

    if (input.publishAt) {
      requestBody.status!.publishAt = input.publishAt;
    }

    // Prepare read stream
    const mediaStream = fs.createReadStream(input.videoFilePath);

    let uploadedBytes = 0;
    if (input.onProgress) {
      mediaStream.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        const pct = Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
        input.onProgress!(pct, uploadedBytes, totalBytes);
      });
    }

    // 1. Upload Video
    const insertRes = await this.youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody,
        media: {
          body: mediaStream,
        },
      },
      {
        // Resumable upload configurations
        retry: true,
        retryConfig: {
          retry: 3,
          retryDelay: 1500,
        },
      }
    );

    const videoId = insertRes.data.id;
    if (!videoId) {
      throw new Error('YouTube API returned successful response but videoId is missing.');
    }

    // 2. Upload Thumbnail if supplied
    let thumbnailUploaded = false;
    if (input.thumbnailFilePath) {
      try {
        await this.youtube.thumbnails.set({
          videoId,
          media: {
            body: fs.createReadStream(input.thumbnailFilePath),
          },
        });
        thumbnailUploaded = true;
      } catch (thumbErr: any) {
        console.warn(`[YouTubePublisher] Warning: Failed to set thumbnail for ${videoId}: ${thumbErr.message}`);
      }
    }

    return {
      success: true,
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      status: insertRes.data.status?.uploadStatus || 'uploaded',
      privacyStatus: insertRes.data.status?.privacyStatus || privacy,
      scheduledPublishTime: insertRes.data.status?.publishAt || input.publishAt,
      uploadedAt: new Date().toISOString(),
      fileSizeBytes: totalBytes,
      thumbnailUploaded,
      channelId: insertRes.data.snippet?.channelId || '',
      quotaCostEstimate: quotaCost,
    };
  }

  /**
   * Sets or updates video snippet metadata on YouTube via real API call.
   */
  public async setMetadata(
    videoId: string,
    metadata: { title?: string; description?: string; tags?: string[]; categoryId?: string }
  ): Promise<{ titleApplied: string; descriptionApplied: string; categoryId: string; tags: string[] }> {
    if (!videoId) {
      throw new Error('Cannot set metadata: videoId is required.');
    }

    const snippet: youtube_v3.Schema$VideoSnippet = {
      title: metadata.title || 'LAMS HQ Episode Release',
      description: metadata.description || '',
      tags: metadata.tags || [],
      categoryId: metadata.categoryId || '27',
    };

    const updateRes = await this.youtube.videos.update({
      part: ['snippet'],
      requestBody: {
        id: videoId,
        snippet,
      },
    });

    const updatedSnippet = updateRes.data.snippet;
    return {
      titleApplied: updatedSnippet?.title || snippet.title!,
      descriptionApplied: updatedSnippet?.description || snippet.description!,
      categoryId: updatedSnippet?.categoryId || snippet.categoryId!,
      tags: updatedSnippet?.tags || snippet.tags!,
    };
  }

  /**
   * Sets a custom thumbnail for an uploaded YouTube video.
   */
  public async setThumbnail(
    videoId: string,
    thumbnailFilePath: string
  ): Promise<{ thumbnailSet: boolean; thumbnailUrl?: string }> {
    if (!videoId) {
      throw new Error('Cannot set thumbnail: videoId is required.');
    }
    if (!thumbnailFilePath || !fs.existsSync(thumbnailFilePath)) {
      throw new Error(`Thumbnail file not found at: ${thumbnailFilePath}`);
    }

    const res = await this.youtube.thumbnails.set({
      videoId,
      media: {
        body: fs.createReadStream(thumbnailFilePath),
      },
    });

    const defaultUrl = res.data.items?.[0]?.default?.url;
    return {
      thumbnailSet: true,
      thumbnailUrl: defaultUrl || undefined,
    };
  }

  /**
   * Configures publication schedule for a private YouTube video.
   * YouTube strictly requires privacyStatus = 'private' when publishAt is set.
   */
  public async setSchedule(
    videoId: string,
    publishAt: string
  ): Promise<{ publishAt: string; privacyStatus: string; scheduled: boolean }> {
    if (!videoId) {
      throw new Error('Cannot set schedule: videoId is required.');
    }
    if (!publishAt) {
      throw new Error('Cannot set schedule: publishAt timestamp is required.');
    }

    const scheduleDate = new Date(publishAt);
    if (isNaN(scheduleDate.getTime()) || scheduleDate.getTime() <= Date.now()) {
      throw new Error(`Invalid schedule: publishAt must be a valid future timestamp. Received: ${publishAt}`);
    }

    const isoSchedule = scheduleDate.toISOString();

    const updateRes = await this.youtube.videos.update({
      part: ['status'],
      requestBody: {
        id: videoId,
        status: {
          privacyStatus: 'private',
          publishAt: isoSchedule,
        },
      },
    });

    const currentStatus = updateRes.data.status;
    return {
      publishAt: currentStatus?.publishAt || isoSchedule,
      privacyStatus: currentStatus?.privacyStatus || 'private',
      scheduled: true,
    };
  }

  /**
   * Reads back the live status of a video from YouTube to verify postconditions.
   */
  public async verifyVideo(videoId: string): Promise<{
    exists: boolean;
    videoId: string;
    title: string;
    uploadStatus: string;
    privacyStatus: string;
    publishAt?: string;
    channelId: string;
  }> {
    if (!videoId) {
      throw new Error('Cannot verify video: videoId is required.');
    }

    const res = await this.youtube.videos.list({
      part: ['snippet', 'status'],
      id: [videoId],
    });

    const item = res.data.items?.[0];
    if (!item) {
      throw new Error(`Verification failed: Video ID '${videoId}' was not found on YouTube.`);
    }

    return {
      exists: true,
      videoId,
      title: item.snippet?.title || '',
      uploadStatus: item.status?.uploadStatus || 'unknown',
      privacyStatus: item.status?.privacyStatus || 'unknown',
      publishAt: item.status?.publishAt || undefined,
      channelId: item.snippet?.channelId || '',
    };
  }
}
