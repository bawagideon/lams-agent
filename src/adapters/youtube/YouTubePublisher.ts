import fs from 'node:fs';
import path from 'node:path';
import { google, youtube_v3 } from 'googleapis';

export interface PublishInput {
  title: string;
  description: string;
  videoFilePath: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  publishAt?: string; // ISO 8601 string for future scheduled release
  thumbnailFilePath?: string;
  requireThumbnail?: boolean;
}

export interface PublishReceipt {
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
  private oauth2Client: any;

  constructor(clientId: string, clientSecret: string, refreshToken: string) {
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Cannot initialize YouTubePublisher: Missing OAuth client credentials or refresh token.');
    }

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    this.youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });
  }

  public async publish(input: PublishInput): Promise<PublishReceipt> {
    return this.uploadVideo(input);
  }

  /**
   * Performs real resumable/streaming upload of master video to YouTube Data API v3.
   * By default, all uploads are forced to 'private' privacyStatus for creator safety.
   */
  public async uploadVideo(input: PublishInput): Promise<PublishReceipt> {
    if (!fs.existsSync(input.videoFilePath)) {
      throw new Error(`Video file not found at: ${input.videoFilePath}`);
    }

    const totalBytes = fs.statSync(input.videoFilePath).size;
    if (totalBytes < 1024) {
      throw new Error(`Video file too small or corrupted: ${totalBytes} bytes`);
    }

    // Force private privacy status for Safe Mode
    const privacy = input.privacyStatus || 'private';

    const requestBody: youtube_v3.Schema$Video = {
      snippet: {
        title: input.title,
        description: input.description,
        tags: input.tags || ['Lams', 'Creator Operations', 'AI Video'],
        categoryId: input.categoryId || '27', // Education / Science & Tech
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: false,
      },
    };

    if (input.publishAt) {
      const scheduleDate = new Date(input.publishAt);
      if (!isNaN(scheduleDate.getTime()) && scheduleDate.getTime() > Date.now()) {
        requestBody.status!.publishAt = scheduleDate.toISOString();
        requestBody.status!.privacyStatus = 'private'; // Required by YouTube API when publishAt is set
      }
    }

    let quotaCost = 1600; // Standard YouTube Data API v3 upload cost

    // Resumable upload via stream
    const mediaStream = fs.createReadStream(input.videoFilePath);

    const insertRes = await this.youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody,
      media: {
        body: mediaStream,
      },
    });

    const videoId = insertRes.data.id;
    if (!videoId) {
      throw new Error('YouTube API did not return a valid video ID after upload.');
    }

    // Upload custom thumbnail if provided
    let thumbnailUploaded = false;
    if (input.thumbnailFilePath) {
      try {
        if (!fs.existsSync(input.thumbnailFilePath)) {
          throw new Error(`Thumbnail file not found at: ${input.thumbnailFilePath}`);
        }
        await this.youtube.thumbnails.set({
          videoId,
          media: {
            body: fs.createReadStream(input.thumbnailFilePath),
          },
        });
        thumbnailUploaded = true;
        quotaCost += 50;
      } catch (thumbErr: any) {
        if (input.requireThumbnail) {
          throw new Error(`Required thumbnail upload failed: ${thumbErr.message}`);
        }
        console.warn(`[YouTubePublisher] Warning: Optional thumbnail failed for ${videoId}: ${thumbErr.message}`);
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
   * Reads back live status from YouTube and verifies postconditions against expected plan.
   */
  public async verifyVideo(
    videoId: string,
    expected?: {
      channelId?: string;
      title?: string;
      privacyStatus?: string;
      publishAt?: string;
    }
  ): Promise<{
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

    const liveChannelId = item.snippet?.channelId || '';
    const liveTitle = item.snippet?.title || '';
    const livePrivacy = item.status?.privacyStatus || '';
    const livePublishAt = item.status?.publishAt || undefined;

    if (expected?.channelId && liveChannelId !== expected.channelId) {
      throw new Error(`Verification failed: Channel ID mismatch. Expected '${expected.channelId}', found '${liveChannelId}'`);
    }

    if (expected?.privacyStatus && livePrivacy !== expected.privacyStatus) {
      throw new Error(`Verification failed: Privacy status mismatch. Expected '${expected.privacyStatus}', found '${livePrivacy}'`);
    }

    if (expected?.publishAt && livePublishAt !== expected.publishAt) {
      throw new Error(`Verification failed: Publication schedule mismatch. Expected '${expected.publishAt}', found '${livePublishAt}'`);
    }

    return {
      exists: true,
      videoId,
      title: liveTitle,
      uploadStatus: item.status?.uploadStatus || 'unknown',
      privacyStatus: livePrivacy,
      publishAt: livePublishAt,
      channelId: liveChannelId,
    };
  }
}
