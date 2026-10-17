import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.ts';

export interface StoredCredentials {
  youtubeRefreshToken?: string;
  youtubeChannelId?: string;
  youtubeChannelTitle?: string;
  updatedAt?: string;
}

export class CredentialStore {
  private static instance: CredentialStore;
  private filePath: string;
  private memoryCache: StoredCredentials;

  private constructor() {
    const dataDir = path.resolve('data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {
        // Fall back gracefully if filesystem is read-only
      }
    }
    this.filePath = path.join(dataDir, 'credentials.json');
    this.memoryCache = this.loadFromFile();
    
    // Seed with environment token if available
    if (config.GOOGLE_REFRESH_TOKEN && !this.memoryCache.youtubeRefreshToken) {
      this.memoryCache.youtubeRefreshToken = config.GOOGLE_REFRESH_TOKEN;
    }
  }

  public static getInstance(): CredentialStore {
    if (!CredentialStore.instance) {
      CredentialStore.instance = new CredentialStore();
    }
    return CredentialStore.instance;
  }

  private loadFromFile(): StoredCredentials {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err: any) {
      console.warn(`[CredentialStore] Failed to read credentials file: ${err.message}. Using in-memory store.`);
    }
    return {};
  }

  private persist(): void {
    try {
      const dataDir = path.dirname(this.filePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.memoryCache, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`[CredentialStore] Could not persist credentials to disk (${err.message}). Stored in-memory.`);
    }
  }

  public getYouTubeRefreshToken(): string {
    return this.memoryCache.youtubeRefreshToken || config.GOOGLE_REFRESH_TOKEN || '';
  }

  public setYouTubeCredentials(token: string, channelId?: string, channelTitle?: string): void {
    this.memoryCache.youtubeRefreshToken = token;
    if (channelId) this.memoryCache.youtubeChannelId = channelId;
    if (channelTitle) this.memoryCache.youtubeChannelTitle = channelTitle;
    this.memoryCache.updatedAt = new Date().toISOString();
    
    // Also keep in-memory config in sync
    config.GOOGLE_REFRESH_TOKEN = token;
    
    this.persist();
  }

  public getCredentials(): StoredCredentials {
    return { ...this.memoryCache };
  }
}
