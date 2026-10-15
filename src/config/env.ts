import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  PIXVERSE_API_KEY?: string;
  PORT: number;
}

function loadEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;

  const content = fs.readFileSync(filePath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (match) {
      let val = match[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[match[1]] = val;
    }
  });
  return result;
}

// 1. Try local .env, fallback to yt-automation/.env.local
const localEnvPath = path.resolve('.env');
const parentEnvPath = 'c:/Users/DELL/yt-automation/.env.local';

const mergedEnv = {
  ...loadEnvFile(parentEnvPath),
  ...loadEnvFile(localEnvPath),
  ...process.env,
};

export const config: AppConfig = {
  GOOGLE_CLIENT_ID: mergedEnv.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: mergedEnv.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REFRESH_TOKEN: mergedEnv.GOOGLE_REFRESH_TOKEN || '',
  SUPABASE_URL: mergedEnv.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: mergedEnv.SUPABASE_SERVICE_ROLE_KEY || '',
  GEMINI_API_KEY: mergedEnv.GEMINI_API_KEY,
  ELEVENLABS_API_KEY: mergedEnv.ELEVENLABS_API_KEY,
  PIXVERSE_API_KEY: mergedEnv.PIXVERSE_API_KEY,
  PORT: parseInt(mergedEnv.PORT || '4200', 10),
};
