import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { MediaAssetDownloader } from '../src/adapters/media/MediaAssetDownloader.ts';
import { AuthManager } from '../src/auth/AuthManager.ts';
import { ApprovalManager } from '../src/auth/ApprovalManager.ts';
import { YouTubeLiveClient } from '../src/adapters/youtube/YouTubeLiveClient.ts';
import { escapeHtml } from '../src/server/utils/htmlEscape.ts';
import { DurableJobQueue } from '../src/jobs/DurableJobQueue.ts';

const BASE_URL = 'http://127.0.0.1:4200';

async function runTests() {
  console.log('====================================================');
  console.log('   LAMS HQ: HARDENED ARCHITECTURE & SECURITY AUDIT');
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

  // 1. Dashboard UI test (Home route)
  await test('Route: GET / (Home) renders with Creator UI specs', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();

    assert(html.includes('LAMS HQ'), 'Dashboard must contain brand title "LAMS HQ"');
    assert(/Good (morning|afternoon|evening), Lams/.test(html), 'Dashboard must contain personalized greeting to Lams');
    assert(html.includes('Next up'), 'Dashboard must have "Next up" hero section');
    assert(html.includes('READY FOR YOUR REVIEW'), 'Dashboard must have "READY FOR YOUR REVIEW" badge');
    assert(html.includes('Watch the scenes'), 'Dashboard must have "Watch the scenes" button');
    assert(html.includes('Open in CapCut'), 'Dashboard must have "Open in CapCut" button');
    assert(html.includes('Go to release'), 'Dashboard must have "Go to release" button');
    assert(html.includes('Your assistant'), 'Dashboard must have "Your assistant" chat panel');
    assert(html.includes("Here's what I'll do"), 'Dashboard must have structured plan card');
    assert(html.includes('Release Room'), 'Dashboard must include Safe Mode Release Room modal');
  });

  // 2. Direct Navigation Route: GET /episodes
  await test('Route: GET /episodes renders Episodes view without 404', async () => {
    const res = await fetch(`${BASE_URL}/episodes`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes('Your Episodes'), 'Must contain "Your Episodes"');
    assert(html.includes('Search episodes...'), 'Must contain search input');
    assert(html.includes('Needs Review'), 'Must contain "Needs Review" filter');
  });

  // 3. Direct Navigation Route: GET /skills
  await test('Route: GET /skills renders Skills view without 404', async () => {
    const res = await fetch(`${BASE_URL}/skills`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes('Workforce Skills'), 'Must contain "Workforce Skills"');
    assert(html.includes('Teach New Skill'), 'Must contain "Teach New Skill"');
  });

  // 4. Direct Navigation Route: GET /activity
  await test('Route: GET /activity renders Activity view without 404', async () => {
    const res = await fetch(`${BASE_URL}/activity`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes('Recent Activity'), 'Must contain "Recent Activity"');
    assert(html.includes('Verified Pass'), 'Must contain verified status tags');
  });

  // 5. Direct Navigation Route: GET /connections
  await test('Route: GET /connections renders Connections view without 404', async () => {
    const res = await fetch(`${BASE_URL}/connections`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes('Connections & Tools'), 'Must contain "Connections & Tools"');
    assert(html.includes('YouTube Channel'), 'Must contain YouTube channel card');
    assert(html.includes('Supabase Database'), 'Must contain Supabase card');
  });

  // 6. Fetch real episodes from Supabase
  let targetEpisode: any = null;
  await test('Supabase Bridge loads real production episodes', async () => {
    const res = await fetch(`${BASE_URL}/api/episodes`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.episodes), 'Expected episodes array');
    assert(data.episodes.length > 0, 'Expected at least 1 episode in Supabase');
    targetEpisode = data.episodes.find((e: any) => e.status === 'Review') || data.episodes[0];
    assert(targetEpisode, 'Expected a target episode');
    console.log(`\n      Target Episode: "${targetEpisode.title}" (${targetEpisode.id}) - Status: ${targetEpisode.status}`);
  });

  // 7. Subroute: GET /episodes/:id (Episode Detail & Player)
  await test('Subroute: GET /episodes/:id renders Episode Studio with light design language', async () => {
    assert(targetEpisode, 'Target episode required');
    const res = await fetch(`${BASE_URL}/episodes/${targetEpisode.id}`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes(escapeHtml(targetEpisode.title)), 'Preview page must contain episode title');
    assert(html.includes('Scene Sequence'), 'Preview page must contain Scene Sequence');
    assert(html.includes('Back to Studio'), 'Preview page must link back to Studio');
    assert(html.includes('Open in CapCut'), 'Preview page must have Open in CapCut button');
    assert(html.includes('Release Room'), 'Preview page must have Release Room modal');
  });

  // 8. Subroute: GET /episodes/:id/preview
  await test('Subroute: GET /episodes/:id/preview renders successfully without 404', async () => {
    assert(targetEpisode, 'Target episode required');
    const res = await fetch(`${BASE_URL}/episodes/${targetEpisode.id}/preview`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
  });

  // 9. Preflight Release Check endpoint
  await test('Preflight Release Check endpoint validates all prerequisites', async () => {
    assert(targetEpisode, 'Target episode required');
    const res = await fetch(`${BASE_URL}/api/episodes/${targetEpisode.id}/release-check`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const check = await res.json();
    assert.strictEqual(check.episodeId, targetEpisode.id);
    assert(typeof check.canRelease === 'boolean', 'canRelease should be boolean');
    assert(Array.isArray(check.reasons), 'reasons should be an array');
    assert(check.youtube, 'youtube status object should be returned');
  });

  // 10. Security: AuthManager creates and verifies signed session cookies
  let authCookie = '';
  await test('AuthManager: /api/auth/login authenticates with creator key and sets cookie', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'lams-creator-hq-2026' }),
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const setCookie = res.headers.get('set-cookie');
    assert(setCookie && setCookie.includes('lams_session='), 'Expected lams_session Set-Cookie header');
    assert(setCookie.includes('HttpOnly'), 'Cookie must be HttpOnly');
    authCookie = setCookie.split(';')[0];
  });

  // 11. Security: Two-Phase Cryptographic Approval (Rejection of unapproved releases)
  await test('Approval Engine: Rejects release without valid cryptographic approval token', async () => {
    assert(targetEpisode, 'Target episode required');
    const res = await fetch(`${BASE_URL}/api/episodes/${targetEpisode.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      body: JSON.stringify({ isApprovedByHuman: true }), // Old mock flag must be ignored
    });
    // Expected 400 Bad Request or 403 Forbidden
    assert(res.status === 400 || res.status === 403, `Expected 400 or 403, got ${res.status}`);

    // Verify DB was NOT mutated
    const checkRes = await fetch(`${BASE_URL}/api/episodes`);
    const checkData = await checkRes.json();
    const refreshed = checkData.episodes.find((e: any) => e.id === targetEpisode.id);
    assert.strictEqual(refreshed.status, targetEpisode.status, `DB was mutated without token!`);
  });

  // 12. Security: Approval Token Generation & Tamper Detection
  await test('Approval Engine: Validates token binding to episode and file checksum', async () => {
    const approvalManager = ApprovalManager.getInstance();

    // Create a temporary test video file
    const testDir = path.resolve('watched_exports');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const dummyVideo = path.join(testDir, 'test_approval_video.mp4');
    fs.writeFileSync(dummyVideo, Buffer.alloc(2048, 0x42));

    try {
      const { proposal, approvalToken } = approvalManager.createReleaseProposal({
        episodeId: 'test-ep-001',
        title: 'Test Episode',
        videoFilePath: dummyVideo,
        channelTitle: 'Test Channel',
      });

      assert(approvalToken, 'Expected approvalToken');
      assert.strictEqual(proposal.status, 'PENDING');

      // Test valid validation & consumption
      const consumeResult = approvalManager.validateAndConsumeApproval(approvalToken, 'test-ep-001', dummyVideo);
      assert.strictEqual(consumeResult.valid, true, `Expected valid approval, got error: ${consumeResult.error}`);

      // Test replay attack rejection (consuming twice)
      const replayResult = approvalManager.validateAndConsumeApproval(approvalToken, 'test-ep-001', dummyVideo);
      assert.strictEqual(replayResult.valid, false, 'Replay attack must be rejected');
      assert(replayResult.error?.includes('consumed') || replayResult.error?.includes('replay'), 'Must state consumed');

      // Test forged signature rejection
      const forgedToken = approvalToken.slice(0, -6) + 'abcdef';
      const forgedResult = approvalManager.validateAndConsumeApproval(forgedToken, 'test-ep-001', dummyVideo);
      assert.strictEqual(forgedResult.valid, false, 'Forged token must be rejected');
    } finally {
      if (fs.existsSync(dummyVideo)) fs.unlinkSync(dummyVideo);
    }
  });

  // 13. Security: SSRF & DNS Rebinding Hardening
  await test('MediaAssetDownloader: Strictly rejects private IP, loopback, and metadata URLs', async () => {
    const downloader = new MediaAssetDownloader();

    const attackUrls = [
      'http://127.0.0.1/admin',
      'http://localhost:8080/secret',
      'http://169.254.169.254/latest/meta-data',
      'http://0.0.0.0:4200/api',
      'ftp://example.com/video.mp4',
      'file:///etc/passwd',
    ];

    for (const url of attackUrls) {
      let threw = false;
      try {
        await downloader.validateRemoteUrl(url);
      } catch {
        threw = true;
      }
      assert(threw, `Expected SSRF rejection for '${url}', but it passed!`);
    }
  });

  // 14. Security: Magic Byte Media Verification
  await test('MediaAssetDownloader: Rejects corrupt or invalid media files via magic bytes', async () => {
    const downloader = new MediaAssetDownloader();
    const dummyPath = path.resolve('cache', 'test_fake.mp4');
    const cacheDir = path.dirname(dummyPath);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    // Write a fake file with plain text instead of MP4 magic bytes
    fs.writeFileSync(dummyPath, 'NOT_A_REAL_MP4_VIDEO_STREAM');

    let rejected = false;
    try {
      downloader.verifyMagicBytes(dummyPath, 'video');
    } catch {
      rejected = true;
    } finally {
      if (fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath);
    }

    assert(rejected, 'Expected magic byte verification to reject non-video payload');
  });

  // 15. Security: Fail-Closed Audio Validation
  await test('MediaAssetDownloader: Fails closed when required audio assets fail', async () => {
    const downloader = new MediaAssetDownloader();
    const planWithInvalidAudio = {
      projectId: 'test-fail-closed',
      tracks: {
        visuals: [],
        audio: [
          { id: 'narration-1', src: 'http://non-existent-domain-xyz-12345.org/audio.mp3' },
        ],
      },
    };

    let threw = false;
    try {
      await downloader.preCacheMediaPlanAssets(planWithInvalidAudio);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('required media asset(s) failed validation'), 'Must fail closed with clear reason');
    }

    assert(threw, 'preCacheMediaPlanAssets MUST throw and fail closed on audio failure');
  });

  // 16. Security: OAuth CSRF State Token Verification
  await test('YouTubeLiveClient: Generates cryptographic CSRF state and rejects callbacks without it', async () => {
    const client = new YouTubeLiveClient();
    const authUrl = client.getAuthUrl();
    const parsed = new URL(authUrl);
    const state = parsed.searchParams.get('state');

    assert(state, 'Auth URL must contain state parameter');
    assert.strictEqual(state.length, 64, 'State must be a 64-character hex cryptographic token');

    // Attempting callback with invalid state must fail with CSRF error
    let rejected = false;
    try {
      await client.handleOAuthCallback('fake-code', 'invalid-state-token');
    } catch (err: any) {
      rejected = true;
      assert(err.message.includes('CSRF') || err.message.includes('state'), 'Must state CSRF or state error');
    }

    assert(rejected, 'handleOAuthCallback must reject invalid state tokens');
  });

  // 17. Security: Output Escaping & XSS Protection
  await test('XSS Protection: escapeHtml neutralizes script tags and injection payloads', async () => {
    const malicious = '<script>alert("XSS")</script>&<img src=x onerror=alert(1)>';
    const escaped = escapeHtml(malicious);

    assert(!escaped.includes('<script>'), 'Must not contain raw <script>');
    assert(!escaped.includes('</script>'), 'Must not contain raw </script>');
    assert(escaped.includes('&lt;script&gt;'), 'Must encode < and >');
    assert(escaped.includes('&amp;'), 'Must encode &');
  });

  // 18. Security: Range Request 416 Validation & Path Traversal
  await test('Exports Endpoint: Path traversal blocked and invalid byte ranges return 416', async () => {
    // Path traversal test
    const traversalRes = await fetch(`${BASE_URL}/api/exports/..%2F..%2Fpackage.json`);
    assert.strictEqual(traversalRes.status, 404, 'Path traversal must return 404');

    // Create a temporary valid export file to test range header
    const watchedDir = path.resolve('watched_exports');
    if (!fs.existsSync(watchedDir)) fs.mkdirSync(watchedDir, { recursive: true });
    const dummyExport = path.join(watchedDir, 'range_test.mp4');
    fs.writeFileSync(dummyExport, Buffer.alloc(1024, 0x55));

    try {
      // 416 invalid range: start >= fileSize
      const invalidRangeRes = await fetch(`${BASE_URL}/api/exports/range_test.mp4`, {
        headers: { Range: 'bytes=99999-100000' },
      });
      assert.strictEqual(invalidRangeRes.status, 416, `Expected 416 Range Not Satisfiable, got ${invalidRangeRes.status}`);

      // Valid partial range request: 206 Partial Content
      const validRangeRes = await fetch(`${BASE_URL}/api/exports/range_test.mp4`, {
        headers: { Range: 'bytes=0-99' },
      });
      assert.strictEqual(validRangeRes.status, 206, `Expected 206 Partial Content, got ${validRangeRes.status}`);
      assert.strictEqual(validRangeRes.headers.get('content-range'), 'bytes 0-99/1024');
    } finally {
      if (fs.existsSync(dummyExport)) fs.unlinkSync(dummyExport);
    }
  });

  // 19. Architecture: Durable Job Queue & Idempotency
  await test('DurableJobQueue: Deduplicates jobs using idempotency keys', async () => {
    const queue = DurableJobQueue.getInstance();
    const idempotencyKey = `job-test-${Date.now()}`;

    const job1 = await queue.enqueue('capcut_draft', { episodeId: 'ep-idempotent' }, idempotencyKey);
    const job2 = await queue.enqueue('capcut_draft', { episodeId: 'ep-idempotent' }, idempotencyKey);

    assert.strictEqual(job1.id, job2.id, 'Idempotency key must return the exact same existing job ID');
  });

  // 20. Chat Assistant with Structured Plan Cards
  await test('Chat API: Generates structured Plan Card for release intent', async () => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Can you schedule this episode for tomorrow?' }),
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.reply, 'Expected reply text');
    assert(data.planCard, 'Expected planCard object');
    assert.strictEqual(data.planCard.type, 'release_plan', 'Expected release_plan type');
  });

  console.log('\n====================================================');
  console.log(`Results: ${passed} / ${total} tests passed.`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
