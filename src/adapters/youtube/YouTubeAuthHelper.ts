import http from 'node:http';
import { google } from 'googleapis';

export class YouTubeAuthHelper {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(clientId: string, clientSecret: string, redirectUri = 'http://localhost:8080/oauth2callback') {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
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
      prompt: 'consent', // Forces refresh token issuance
      scope: scopes,
    });
  }

  public async startAuthServer(port = 8080): Promise<{ refreshToken: string; channelTitle: string; channelId: string }> {
    return new Promise((resolve, reject) => {
      const oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );

      const server = http.createServer(async (req, res) => {
        try {
          if (!req.url?.startsWith('/oauth2callback')) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const parsedUrl = new URL(req.url, `http://localhost:${port}`);
          const code = parsedUrl.searchParams.get('code');
          const error = parsedUrl.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>Authentication Failed</h1><p>${error}</p>`);
            server.close();
            reject(new Error(`OAuth Error: ${error}`));
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>Missing Code</h1>`);
            return;
          }

          // Exchange authorization code for tokens
          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);

          if (!tokens.refresh_token) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>Warning: No refresh token returned.</h1><p>Ensure prompt=consent is used.</p>`);
            server.close();
            reject(new Error('No refresh token returned by Google OAuth.'));
            return;
          }

          // Verify by fetching channel info
          const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
          const channelRes = await youtube.channels.list({
            part: ['snippet'],
            mine: true,
          });

          const channel = channelRes.data.items?.[0];
          const channelTitle = channel?.snippet?.title || 'Unknown Channel';
          const channelId = channel?.id || 'Unknown ID';

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc;">
                <h1 style="color: #22c55e;">✓ LAMS HQ YouTube Authentication Successful!</h1>
                <p>Connected YouTube Channel: <strong>${channelTitle}</strong> (ID: ${channelId})</p>
                <p>Refresh token successfully received. You can now close this tab.</p>
              </body>
            </html>
          `);

          server.close();
          resolve({
            refreshToken: tokens.refresh_token,
            channelTitle,
            channelId,
          });
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Internal Error</h1><p>${err.message}</p>`);
          server.close();
          reject(err);
        }
      });

      server.listen(port, () => {
        console.log(`[YouTubeAuthHelper] Listening for OAuth callback on http://localhost:${port}/oauth2callback`);
      });
    });
  }
}
