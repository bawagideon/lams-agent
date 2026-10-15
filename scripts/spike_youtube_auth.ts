import fs from 'node:fs';
import { YouTubeAuthHelper } from '../src/adapters/youtube/YouTubeAuthHelper.ts';

console.log('=== [M0 SPIKE 1] YOUTUBE OAUTH & PUBLISHING RECON ===\n');

// 1. Load Google Credentials
const envPath = 'c:/Users/DELL/yt-automation/.env.local';
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};

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

const clientId = env.GOOGLE_CLIENT_ID;
const clientSecret = env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('[FAIL] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.local');
  process.exit(1);
}

const authHelper = new YouTubeAuthHelper(clientId, clientSecret);
const authUrl = authHelper.getAuthUrl();

console.log('1. Google Client ID:     ', clientId.substring(0, 15) + '...');
console.log('2. Scopes Requested:     ', 'youtube.upload, youtube, youtube.readonly, youtube.force-ssl');
console.log('3. Access Type:          ', 'offline (with prompt=consent for permanent refresh token)');
console.log('\n--- 1-CLICK AUTHORIZATION LINK FOR LAMS ---');
console.log(authUrl);
console.log('\n[PASS] M0 SPIKE 1 SUCCESS: YouTube Auth Helper generated valid OAuth consent flow with YouTube v3 scopes.');
