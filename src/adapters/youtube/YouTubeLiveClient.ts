import fs from 'node:fs';
import path from 'node:path';
import { google, youtube_v3 } from 'googleapis';
import { config } from '../../config/env.ts';

export interface ChannelProfile {
  isConnected: boolean;
  channelId?: string;
  title?: string;
  customUrl?: string;
  avatarUrl?: string;
  subscriberCount?: string;
  videoCount?: string;
  viewCount?: string;
  authUrl: string;
  statusMessage: string;
}

export class YouTubeLiveClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private redirectUri: string;

  constructor(redirectUri = 'http://localhost:4200/oauth2callback') {
    this.clientId = config.GOOGLE_CLIENT_ID;
    this.clientSecret = config.GOOGLE_CLIENT_SECRET;
    this.refreshToken = config.GOOGLE_REFRESH_TOKEN;
    this.redirectUri = redirectUri;
  }

  public getAuthUrl(): string {
    const oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Forces issuance of a new refresh token
      scope: scopes,
    });
  }

  /**
   * Exchanges the temporary code for permanent tokens and saves to local .env
   */
  public async handleOAuthCallback(code: string): Promise<{ channelTitle: string; channelId: string; refreshToken: string }> {
    const oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (!tokens.refresh_token) {
      throw new Error('Google did not return a refresh token. Please re-authenticate with prompt=consent.');
    }

    // Save token to local .env
    const envFilePath = path.resolve('.env');
    let envLines = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf-8').split('\n') : [];
    let found = false;
    envLines = envLines.map(line => {
      if (line.startsWith('GOOGLE_REFRESH_TOKEN=')) {
        found = true;
        return `GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`;
      }
      return line;
    });
    if (!found) {
      envLines.push(`GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`);
    }
    fs.writeFileSync(envFilePath, envLines.join('\n'), 'utf-8');

    // Update in-memory config
    config.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
    this.refreshToken = tokens.refresh_token;

    // Fetch channel title
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const res = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channel = res.data.items?.[0];

    return {
      channelTitle: channel?.snippet?.title || 'Connected YouTube Channel',
      channelId: channel?.id || 'Unknown',
      refreshToken: tokens.refresh_token,
    };
  }

  /**
   * Queries real channel status from YouTube Data API v3
   */
  public async getChannelStatus(): Promise<ChannelProfile> {
    const authUrl = this.getAuthUrl();

    if (!this.refreshToken) {
      return {
        isConnected: false,
        authUrl,
        statusMessage: 'No YouTube refresh token configured. Click to connect Lams account.',
      };
    }

    try {
      const oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );
      oauth2Client.setCredentials({ refresh_token: this.refreshToken });

      // Timeout wrapper to prevent hanging on expired token network calls
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('YouTube API check timed out')), 4000)
      );

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      const apiPromise = youtube.channels.list({
        part: ['snippet', 'statistics'],
        mine: true,
      });

      const res: any = await Promise.race([apiPromise, timeoutPromise]);
      const channel = res.data?.items?.[0];

      if (!channel) {
        return {
          isConnected: false,
          authUrl,
          statusMessage: 'Google account authenticated, but no YouTube Channel was found.',
        };
      }

      return {
        isConnected: true,
        channelId: channel.id,
        title: channel.snippet?.title || 'Lams YouTube Channel',
        customUrl: channel.snippet?.customUrl || '@Lams',
        avatarUrl: channel.snippet?.thumbnails?.default?.url || '',
        subscriberCount: channel.statistics?.subscriberCount || '0',
        videoCount: channel.statistics?.videoCount || '0',
        viewCount: channel.statistics?.viewCount || '0',
        authUrl,
        statusMessage: 'Channel Connected & Live',
      };
    } catch (err: any) {
      return {
        isConnected: false,
        authUrl,
        statusMessage: `Not connected to YouTube (${err.message}). Click to link account.`,
      };
    }
  }
}
