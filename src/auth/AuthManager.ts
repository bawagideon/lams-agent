import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.ts';

export type UserRole = 'creator' | 'admin' | 'viewer';

export interface AuthSession {
  userId: string;
  role: UserRole;
  issuedAt: number;
  expiresAt: number;
  csrfToken: string;
}

export class AuthManager {
  private static instance: AuthManager;
  private secretKey: string;
  private sessionTtlMs: number = 7 * 24 * 60 * 60 * 1000; // 7 days

  private constructor() {
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    const configuredSecret = process.env.LAMS_AUTH_SECRET || process.env.CREATOR_API_KEY;

    if (configuredSecret && configuredSecret.trim().length >= 32) {
      this.secretKey = configuredSecret.trim();
    } else if (isProduction) {
      // In production, strictly fail closed if strong secrets are missing
      throw new Error(
        'FATAL: Production startup halted. LAMS_AUTH_SECRET or CREATOR_API_KEY environment variable is missing or insecure (<32 chars).'
      );
    } else {
      // In development, persist an ephemeral key locally so server restarts within dev do not invalidate sessions
      this.secretKey = this.getOrGenerateDevSecret();
      console.warn(
        '[AuthManager] DEVELOPMENT MODE: No strong LAMS_AUTH_SECRET set. Using persisted local dev secret.'
      );
    }
  }

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  private getOrGenerateDevSecret(): string {
    const devSecretFile = path.resolve('data', '.dev_auth_secret');
    try {
      if (fs.existsSync(devSecretFile)) {
        const stored = fs.readFileSync(devSecretFile, 'utf-8').trim();
        if (stored.length >= 32) return stored;
      }
    } catch {}

    const generated = crypto.randomBytes(32).toString('hex');
    try {
      const dataDir = path.dirname(devSecretFile);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(devSecretFile, generated, { encoding: 'utf-8', mode: 0o600 });
    } catch {}
    return generated;
  }

  public getSecret(): string {
    return this.secretKey;
  }

  /**
   * Generates a tamper-proof signed session string with embedded CSRF token:
   * base64(payload).signature
   */
  public createSessionToken(userId: string = 'lams-creator', role: UserRole = 'creator'): { sessionToken: string; csrfToken: string } {
    const now = Date.now();
    const csrfToken = crypto.randomBytes(24).toString('hex');
    const session: AuthSession = {
      userId,
      role,
      issuedAt: now,
      expiresAt: now + this.sessionTtlMs,
      csrfToken,
    };

    const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('base64url');

    return {
      sessionToken: `${payload}.${signature}`,
      csrfToken,
    };
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
   * Validates a login attempt using creator password or API key.
   * NO hardcoded fallback credentials permitted.
   */
  public verifyLogin(credential: string): boolean {
    if (!credential || typeof credential !== 'string') return false;

    const expected = process.env.LAMS_AUTH_SECRET || process.env.CREATOR_API_KEY;
    if (!expected) {
      // If no secret configured (only possible in dev mode), compare with dev secret
      return crypto.timingSafeEqual(Buffer.from(credential), Buffer.from(this.secretKey));
    }

    if (credential.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(credential), Buffer.from(expected));
  }

  /**
   * Extracts and verifies credentials from request:
   * 1. Authorization: Bearer <token>
   * 2. Cookie: lams_session=<token>
   * (Strictly disallows query-string token authentication to prevent URL leakage).
   */
  public authenticateRequest(req: http.IncomingMessage): {
    authenticated: boolean;
    session?: AuthSession;
    authMethod?: 'bearer' | 'cookie';
    error?: string;
  } {
    // 1. Check Bearer token header
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const session = this.verifySessionToken(token);
      if (session) {
        return { authenticated: true, session, authMethod: 'bearer' };
      }
      // Check if direct API key was passed as Bearer token
      if (this.verifyLogin(token)) {
        return {
          authenticated: true,
          authMethod: 'bearer',
          session: {
            userId: 'api-service',
            role: 'creator',
            issuedAt: Date.now(),
            expiresAt: Date.now() + 3600000,
            csrfToken: 'api-bearer-exempt',
          },
        };
      }
      return { authenticated: false, error: 'Invalid or expired Bearer token' };
    }

    // 2. Check Cookie
    const cookieHeader = req.headers['cookie'];
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      const sessionCookie = cookies.find(c => c.startsWith('lams_session='));
      if (sessionCookie) {
        const token = sessionCookie.split('=')[1];
        const session = this.verifySessionToken(token);
        if (session) {
          // For state-changing methods authenticated via cookie, check CSRF token
          const method = req.method || 'GET';
          const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
          if (isMutating) {
            const csrfHeader = req.headers['x-csrf-token'] as string;
            const secFetchSite = (req.headers['sec-fetch-site'] as string || '').toLowerCase();
            const isSameOrigin = secFetchSite === 'same-origin' || secFetchSite === 'same-site';

            if (!isSameOrigin && (!csrfHeader || csrfHeader !== session.csrfToken)) {
              return { authenticated: false, error: 'CSRF validation failed for cookie session' };
            }
          }

          return { authenticated: true, session, authMethod: 'cookie' };
        }
      }
    }

    return {
      authenticated: false,
      error: 'Authentication required. Provide Authorization: Bearer <token> or valid session cookie.',
    };
  }

  /**
   * Enforces role-based authorization.
   */
  public hasPermission(session: AuthSession, action: 'read' | 'approve' | 'release' | 'admin'): boolean {
    if (session.role === 'admin') return true;
    if (session.role === 'creator') return action !== 'admin';
    if (session.role === 'viewer') return action === 'read';
    return false;
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
