import assert from 'node:assert';
import http from 'node:http';
import { AuthManager } from '../src/auth/AuthManager.ts';

const BASE_URL = 'http://127.0.0.1:4200';

async function runAuthTests() {
  console.log('====================================================');
  console.log('   SECURITY SUITE: AUTH & AUTHORIZATION AUDIT');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`[Test ${total}] ${name}... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err: any) {
      console.log('❌ FAIL');
      console.error('   Error:', err.message);
    }
  }

  const authManager = AuthManager.getInstance();
  const validSecret = authManager.getSecret();

  // 1. Production startup fails closed when secret is missing / short
  await test('Production Startup: Fails closed when secret is missing or < 32 chars', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.LAMS_AUTH_SECRET;
    const originalApiKey = process.env.CREATOR_API_KEY;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.LAMS_AUTH_SECRET;
      delete process.env.CREATOR_API_KEY;

      let threw = false;
      try {
        // Attempt creating a new instance directly
        new (AuthManager as any)();
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('FATAL: Production startup halted'), `Unexpected message: ${err.message}`);
      }
      assert(threw, 'AuthManager MUST throw fatal error in production without strong secret');

      // Test short secret (<32 chars)
      process.env.LAMS_AUTH_SECRET = 'too-short-secret';
      let threwShort = false;
      try {
        new (AuthManager as any)();
      } catch (err: any) {
        threwShort = true;
        assert(err.message.includes('FATAL'), `Unexpected message: ${err.message}`);
      }
      assert(threwShort, 'AuthManager MUST reject secrets shorter than 32 characters in production');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalSecret) process.env.LAMS_AUTH_SECRET = originalSecret;
      else delete process.env.LAMS_AUTH_SECRET;
      if (originalApiKey) process.env.CREATOR_API_KEY = originalApiKey;
      else delete process.env.CREATOR_API_KEY;
    }
  });

  // 2. Query param authentication is rejected
  await test('Query Parameter Auth: Rejected to prevent URL token leakage', async () => {
    const { sessionToken } = authManager.createSessionToken();

    // Direct unit test of authenticateRequest with query params in URL
    const mockReq = {
      headers: {},
      url: `/api/auth/status?token=${sessionToken}&apiKey=${validSecret}`,
      method: 'GET',
    } as any;
    const directResult = authManager.authenticateRequest(mockReq);
    assert.strictEqual(directResult.authenticated, false, 'authenticateRequest MUST NOT extract credentials from query string');

    // HTTP test against live server
    const queryUrl = `${BASE_URL}/api/auth/status?token=${sessionToken}&apiKey=${validSecret}`;
    const res = await fetch(queryUrl);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.authenticated, false, 'Passing credentials in query params MUST NOT authenticate the session');
  });

  // 3. Login JSON response omits sessionToken when setting HttpOnly cookie
  let sessionCookie = '';
  let validCsrfToken = '';
  await test('Login Endpoint: Sets HttpOnly cookie and strictly omits sessionToken from JSON body', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: validSecret }),
    });

    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const setCookie = res.headers.get('set-cookie');
    assert(setCookie && setCookie.includes('lams_session='), 'Response MUST set lams_session cookie');
    assert(setCookie.includes('HttpOnly'), 'Cookie MUST have HttpOnly flag');
    assert(setCookie.includes('SameSite=Lax'), 'Cookie MUST have SameSite=Lax');
    sessionCookie = setCookie.split(';')[0];

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert(body.csrfToken, 'Response MUST provide csrfToken');
    validCsrfToken = body.csrfToken;

    // Critical security check: sessionToken MUST NOT be returned in JSON body
    assert.strictEqual((body as any).sessionToken, undefined, 'CRITICAL: sessionToken leaked in JSON response body!');
  });

  // 4. CSRF Protection on Mutating Requests
  await test('CSRF Defense: Rejects mutating cookie requests without valid X-CSRF-Token header', async () => {
    // Attempt mutating request without CSRF token
    const resNoCsrf = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ message: 'CSRF attack attempt' }),
    });

    assert(resNoCsrf.status === 401 || resNoCsrf.status === 403, `Expected 401 or 403 for missing CSRF, got ${resNoCsrf.status}`);
    const errData = await resNoCsrf.json();
    assert(errData.error?.includes('CSRF') || errData.error?.includes('Authentication'), 'Expected CSRF error');

    // Attempt mutating request with invalid CSRF token
    const resBadCsrf = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'X-CSRF-Token': 'bogus-csrf-token-12345',
      },
      body: JSON.stringify({ message: 'CSRF attack attempt' }),
    });
    assert(resBadCsrf.status === 401 || resBadCsrf.status === 403, `Expected 401 or 403 for invalid CSRF, got ${resBadCsrf.status}`);

    // Request with valid CSRF token succeeds
    const resValidCsrf = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'X-CSRF-Token': validCsrfToken,
      },
      body: JSON.stringify({ message: 'Hello assistant' }),
    });
    assert.strictEqual(resValidCsrf.status, 200, `Expected 200 with valid CSRF, got ${resValidCsrf.status}`);
  });

  // 5. Dedicated /api/auth/token endpoint for API Bearer clients
  let bearerAccessToken = '';
  await test('API Auth: /api/auth/token endpoint exchanges credentials for Bearer token', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: validSecret }),
    });

    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const body = await res.json();
    assert(body.accessToken, 'Expected accessToken in response');
    bearerAccessToken = body.accessToken;

    // Use bearer token to access protected endpoint
    const resProtected = await fetch(`${BASE_URL}/api/auth/status`, {
      headers: {
        Authorization: `Bearer ${bearerAccessToken}`,
      },
    });
    assert.strictEqual(resProtected.status, 200, `Expected 200 OK with Bearer token, got ${resProtected.status}`);
    const statusData = await resProtected.json();
    assert.strictEqual(statusData.authenticated, true);
  });

  // 6. Role-Based Access Control (RBAC)
  await test('RBAC: Viewer session cannot execute release proposal or approval', async () => {
    const { sessionToken: viewerToken } = authManager.createSessionToken('viewer-001', 'viewer');

    const res = await fetch(`${BASE_URL}/api/episodes/any-id/propose-release`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${viewerToken}`,
      },
    });

    assert.strictEqual(res.status, 403, `Expected 403 Forbidden for viewer role, got ${res.status}`);
    const data = await res.json();
    assert(data.error?.includes('Forbidden'), 'Expected Forbidden error response');
  });

  console.log('\n====================================================');
  console.log(`Auth Security Results: ${passed} / ${total} tests passed.`);
  console.log('====================================================\n');

  if (passed !== total) process.exit(1);
}

runAuthTests().catch(err => {
  console.error('Fatal Auth test error:', err);
  process.exit(1);
});
