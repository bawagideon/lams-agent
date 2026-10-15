const fs = require('fs');
const path = require('path');

// 1. Load env from yt-automation/.env.local
const envPath = 'c:/Users/DELL/yt-automation/.env.local';
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || '';
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1]] = val;
  }
});

console.log('[M0 Spike] Loaded environment variables.');
console.log('GOOGLE_CLIENT_ID exists:', !!env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_SECRET exists:', !!env.GOOGLE_CLIENT_SECRET);
console.log('GOOGLE_REFRESH_TOKEN exists:', !!env.GOOGLE_REFRESH_TOKEN);

// 2. Load googleapis from yt-automation
const { google } = require('c:/Users/DELL/yt-automation/node_modules/googleapis');

async function testYouTubeAuth() {
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: env.GOOGLE_REFRESH_TOKEN
  });

  console.log('[M0 Spike] Requesting access token refresh...');
  try {
    const tokenResponse = await oauth2Client.getAccessToken();
    console.log('[M0 Spike] Token refreshed successfully!');
    console.log('Token type:', typeof tokenResponse.token);

    // Test token info to see actual granted scopes
    const tokenInfo = await oauth2Client.getTokenInfo(tokenResponse.token);
    console.log('[M0 Spike] Granted scopes:', tokenInfo.scopes);

    // Test YouTube API client
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    console.log('[M0 Spike] Querying YouTube channels.list(mine: true)...');
    
    try {
      const channelRes = await youtube.channels.list({
        part: ['snippet', 'contentDetails'],
        mine: true
      });

      console.log('[M0 Spike] YouTube API call SUCCESS!');
      if (channelRes.data.items && channelRes.data.items.length > 0) {
        channelRes.data.items.forEach(ch => {
          console.log(`Channel Title: "${ch.snippet.title}" | ID: ${ch.id}`);
        });
      } else {
        console.log('[M0 Spike] No channel attached to this Google Account, but API access is verified!');
      }
    } catch (ytErr) {
      console.error('[M0 Spike] YouTube API error:', ytErr.message);
      if (ytErr.errors) {
        console.error('Details:', JSON.stringify(ytErr.errors, null, 2));
      }
    }
  } catch (authErr) {
    console.error('[M0 Spike] Auth error:', authErr.message);
  }
}

testYouTubeAuth();
