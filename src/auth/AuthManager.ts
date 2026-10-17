import http from 'node:http';
import crypto from 'node:crypto';
import { config } from '../config/env.ts';

export interface AuthSession {
  userId: string;
  role: 'creator' | 'admin' | 'viewer';
  issuedAt: number;
  expiresAt: number;
}

export class AuthManager {
  private static instance: AuthManager;
  private secretKey: string;
  private sessionTtlMs: number = 7 * 24 * 60 * 60 * 1000; // 7 days

  private constructor() {
    // Priority: configured secret > creator API key > runtime secure fallback
    const envSecret = process.env.LAMS_AUTH_SECRET || process.env.CREATOR_API_KEY;
    if (envSecret && envSecret.trim().length >= 16) {
      this.secretKey = envSecret.trim();
    } else {
      this.secretKey = crypto.randomBytes(32).toString('hex');
      console.warn('[AuthManager] No strong LAMS_AUTH_SECRET configured in environment. Using generated runtime secret.');
    }
  }

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  public getSecret(): string {
    return this.secretKey;
  }

  /**
   * Generates a tamper-proof signed session string:
   * base64(payload).signature
   */
  public createSessionToken(userId: string = 'lams-creator', role: 'creator' | 'admin' = 'creator'): string {
    const now = Date.now();
    const session: AuthSession = {
      userId,
      role,
      issuedAt: now,
      expiresAt: now + this.sessionTtlMs,
    };

    const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('base64url');

    return `${payload}.${signature}`;
  }

  /**
   * Validates a session token string. Returns the session if valid, null otherwise.
   */
  public verifySessionToken(token: string): AuthSession | null {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payload, providedSig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('base64url');

    // Constant-time comparison to prevent timing attacks
    if (providedSig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) {
      return null;
    }

    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as AuthSession;
      if (Date.now() > decoded.expiresAt) {
        return null; // Expired
      }
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Validates a login attempt using a creator password or API key.
   */
  public verifyLogin(credential: string): boolean {
    if (!credential || typeof credential !== 'string') return false;

    // Check against configured auth secret, creator key, or fallback
    const expected = process.env.LAMS_AUTH_SECRET || process.env.CREATOR_API_KEY || 'lams-creator-hq-2026';
    if (credential.length !== expected.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(credential),
      Buffer.from(expected)
    );
  }

  /**
   * Extracts credentials from request:
   * 1. Authorization: Bearer <token>
   * 2. Cookie: lams_session=<token>
   * 3. Query: ?token=<token>
   */
  public authenticateRequest(req: http.IncomingMessage): {
    authenticated: boolean;
    session?: AuthSession;
    error?: string;
  } {
    // 1. Check Bearer token
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const session = this.verifySessionToken(token);
      if (session) {
        return { authenticated: true, session };
      }
      // Or check if direct API key was passed
      if (this.verifyLogin(token)) {
        return {
          authenticated: true,
          session: {
            userId: 'api-client',
            role: 'creator',
            issuedAt: Date.now(),
            expiresAt: Date.now() + 3600000,
          },
        };
      }
    }

    // 2. Check cookie
    const cookieHeader = req.headers['cookie'];
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      const sessionCookie = cookies.find(c => c.startsWith('lams_session='));
      if (sessionCookie) {
        const token = sessionCookie.split('=')[1];
        const session = this.verifySessionToken(token);
        if (session) {
          return { authenticated: true, session };
        }
      }
    }

    // 3. Check query param for media player / exports
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const queryToken = parsedUrl.searchParams.get('token');
      if (queryToken) {
        const session = this.verifySessionToken(queryToken);
        if (session) {
          return { authenticated: true, session };
        }
      }
    } catch {
      // URL parsing failed
    }

    return {
      authenticated: false,
      error: 'Authentication required. Please provide a valid Bearer token or log in.',
    };
  }

  /**
   * Formats a secure Set-Cookie header for the session token.
   */
  public getSessionCookieHeader(token: string): string {
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    const secureFlag = isProduction ? '; Secure' : '';
    const maxAgeSeconds = Math.floor(this.sessionTtlMs / 1000);
    return `lams_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secureFlag}`;
  }

  /**
   * Formats an expired Set-Cookie header to log out.
   */
  public getLogoutCookieHeader(): string {
    return `lams_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}
