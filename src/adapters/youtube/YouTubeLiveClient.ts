import crypto from 'node:crypto';
import { google, youtube_v3 } from 'googleapis';
import { config } from '../../config/env.ts';
import { CredentialStore } from '../../auth/CredentialStore.ts';

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
  private defaultRedirectUri: string;
  private credentialStore: CredentialStore;
  private static oauthStates: Map<string, { createdAt: number; expiresAt: number }> = new Map();

  constructor(defaultRedirectUri = 'http://localhost:4200/oauth2callback') {
    this.clientId = config.GOOGLE_CLIENT_ID;
    this.clientSecret = config.GOOGLE_CLIENT_SECRET;
    this.defaultRedirectUri = defaultRedirectUri;
    this.credentialStore = CredentialStore.getInstance();
  }

  private cleanExpiredStates(): void {
    const now = Date.now();
    for (const [state, meta] of YouTubeLiveClient.oauthStates.entries()) {
      if (now > meta.expiresAt) {
        YouTubeLiveClient.oauthStates.delete(state);
      }
    }
  }

  public getAuthUrl(customRedirectUri?: string): string {
    this.cleanExpiredStates();

    const redirectUri = customRedirectUri || this.defaultRedirectUri;
    const oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ];

    // Cryptographic CSRF state token
    const state = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    YouTubeLiveClient.oauthStates.set(state, {
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000, // 10 minutes TTL
    });

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Forces issuance of a new refresh token
      scope: scopes,
      state,
    });
  }

  /**
   * Exchanges the temporary code for permanent tokens with CSRF state verification.
   * Persists tokens securely via CredentialStore (no runtime .env writes).
   */
  public async handleOAuthCallback(
    code: string,
    state?: string | null,
    customRedirectUri?: string
  ): Promise<{ channelTitle: string; channelId: string; refreshToken: string }> {
    this.cleanExpiredStates();

    // 1. CSRF State Verification
    if (!state) {
      throw new Error('OAuth Security Rejection: Missing state parameter. Potential CSRF attack.');
    }

    const stateMeta = YouTubeLiveClient.oauthStates.get(state);
    if (!stateMeta) {
      throw new Error('OAuth Security Rejection: Invalid or expired state token. Please initiate a new login.');
    }

    if (Date.now() > stateMeta.expiresAt) {
      YouTubeLiveClient.oauthStates.delete(state);
      throw new Error('OAuth Security Rejection: State token expired. Please retry.');
    }

    // Consume state immediately
    YouTubeLiveClient.oauthStates.delete(state);

    const redirectUri = customRedirectUri || this.defaultRedirectUri;
    const oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (!tokens.refresh_token) {
      throw new Error('Google did not return a refresh token. Please re-authenticate with prompt=consent.');
    }

    // Fetch channel details
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const res = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channel = res.data.items?.[0];
    const channelTitle = channel?.snippet?.title || 'Connected YouTube Channel';
    const channelId = channel?.id || 'Unknown';

    // Save token to durable CredentialStore
    this.credentialStore.setYouTubeCredentials(tokens.refresh_token, channelId, channelTitle);

    return {
      channelTitle,
      channelId,
      refreshToken: tokens.refresh_token,
    };
  }

  /**
   * Queries real channel status from YouTube Data API v3
   */
  public async getChannelStatus(customRedirectUri?: string): Promise<ChannelProfile> {
    const authUrl = this.getAuthUrl(customRedirectUri);
    const refreshToken = this.credentialStore.getYouTubeRefreshToken();

    if (!refreshToken) {
      return {
        isConnected: false,
        authUrl,
        statusMessage: 'No YouTube refresh token configured. Click to connect Lams account.',
      };
    }

    try {
      const redirectUri = customRedirectUri || this.defaultRedirectUri;
      const oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        redirectUri
      );
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      // Timeout wrapper to prevent hanging on network calls
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
        avatarUrl: channel.snippet?.thumbnails?.default?.url,
        subscriberCount: channel.statistics?.subscriberCount || '0',
        videoCount: channel.statistics?.videoCount || '0',
        viewCount: channel.statistics?.viewCount || '0',
        authUrl,
        statusMessage: 'Connected and ready for private release scheduling.',
      };
    } catch (err: any) {
      return {
        isConnected: false,
        authUrl,
        statusMessage: `Token expired or invalid (${err.message}). Click to reconnect.`,
      };
    }
  }
}
