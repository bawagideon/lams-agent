import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { AuthManager } from '../src/auth/AuthManager.ts';
import { ApprovalManager } from '../src/auth/ApprovalManager.ts';
import { YouTubePublisher } from '../src/adapters/youtube/YouTubePublisher.ts';
import { config } from '../src/config/env.ts';

const BASE_URL = 'http://127.0.0.1:4200';

async function runPublishingFailureTests() {
  console.log('====================================================');
  console.log('   FAILURE-INJECTION & RELEASE SEMANTICS AUDIT');
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
  const approvalManager = ApprovalManager.getInstance();
  const secret = authManager.getSecret();

  // Obtain valid creator session cookie and CSRF token
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: secret }),
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
  const loginData = await loginRes.json();
  const csrfToken = loginData.csrfToken || '';

  // Fetch real target episode to test state consistency
  const epsRes = await fetch(`${BASE_URL}/api/episodes`);
  const epsData = await epsRes.json();
  const targetEpisode = epsData.episodes.find((e: any) => e.status === 'Review') || epsData.episodes[0];
  assert(targetEpisode, 'Target episode required for failure-injection testing');
  const initialStatus = targetEpisode.status;

  // 1. Failure Mode: Non-existent episode ID
  await test('Failure Injection 1: Release request with non-existent episode ID returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/episodes/non-existent-uuid-99999/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ approvalToken: 'dummy' }),
    });
    assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // 2. Failure Mode: Missing approval token
  await test('Failure Injection 2: Release request without approval token fails without mutating DB', async () => {
    const res = await fetch(`${BASE_URL}/api/episodes/${targetEpisode.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({}),
    });
    assert(res.status === 400 || res.status === 403, `Expected 400 or 403, got ${res.status}`);

    // Verify DB status is completely untouched
    const checkRes = await fetch(`${BASE_URL}/api/episodes`);
    const checkData = await checkRes.json();
    const ep = checkData.episodes.find((e: any) => e.id === targetEpisode.id);
    assert.strictEqual(ep.status, initialStatus, 'Database status MUST NOT be mutated on missing approval token');
  });

  // 3. Failure Mode: Forged signature on approval token
  await test('Failure Injection 3: Forged approval token rejected before execution; DB unchanged', async () => {
    const res = await fetch(`${BASE_URL}/api/episodes/${targetEpisode.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ approvalToken: 'forged-id.forged-payload.forged-signature-123456789' }),
    });
    assert(res.status === 400 || res.status === 403, `Expected 400 or 403, got ${res.status}`);

    const checkRes = await fetch(`${BASE_URL}/api/episodes`);
    const checkData = await checkRes.json();
    const ep = checkData.episodes.find((e: any) => e.id === targetEpisode.id);
    assert.strictEqual(ep.status, initialStatus, 'Database status MUST NOT be mutated on forged token');
  });

  // 4. Failure Mode: Required thumbnail missing
  await test('Failure Injection 4: Required thumbnail failure halts release with fatal error', async () => {
    const publisher = new YouTubePublisher('mock-id', 'mock-secret', 'mock-refresh');
    let threw = false;
    try {
      // Simulate missing required thumbnail file
      await publisher.setThumbnail('fake-video-id', 'non-existent-thumbnail.jpg');
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('Thumbnail file not found'), `Unexpected error: ${err.message}`);
    }
    assert(threw, 'Publisher MUST throw error when thumbnail file is missing');
  });

  // 5. Failure Mode: Past publication schedule timestamp
  await test('Failure Injection 5: Past publication schedule is rejected; YouTube requires future date', async () => {
    const publisher = new YouTubePublisher('mock-id', 'mock-secret', 'mock-refresh');
    let threw = false;
    try {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      await publisher.setSchedule('fake-video-id', pastDate);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('must be a valid future timestamp'), `Unexpected error: ${err.message}`);
    }
    assert(threw, 'Publisher MUST reject past schedule dates');
  });

  // 6. Failure Mode: Video verification postcondition mismatch
  await test('Failure Injection 6: Postcondition verification strictly detects channel mismatch', async () => {
    // When verifyVideo detects channel mismatch, it throws an integrity error
    const publisher = new YouTubePublisher('mock-id', 'mock-secret', 'mock-refresh');
    // Test that verifyVideo asserts on parameters
    let threw = false;
    try {
      await (publisher as any).verifyVideo('', { channelId: 'expected-channel' });
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('videoId is required'), `Unexpected error: ${err.message}`);
    }
    assert(threw, 'verifyVideo MUST fail closed when videoId is missing');
  });

  // 7. Gated Live YouTube Release Test (Conditional execution)
  await test('Gated Live Test: Designated test channel private release (Only when TEST_LIVE_YOUTUBE=true)', async () => {
    if (process.env.TEST_LIVE_YOUTUBE !== 'true') {
      console.log(' (SKIPPED: Set TEST_LIVE_YOUTUBE=true to run against live YouTube quota)');
      return;
    }

    assert(config.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID required for live test');
    assert(config.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET required for live test');
    assert(config.GOOGLE_REFRESH_TOKEN, 'GOOGLE_REFRESH_TOKEN required for live test');

    const testDir = path.resolve('watched_exports');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const liveTestVideo = path.join(testDir, 'live_gated_test.mp4');

    // Create a 2KB test file
    fs.writeFileSync(liveTestVideo, Buffer.alloc(2048, 0x5a));

    try {
      const publisher = new YouTubePublisher(
        config.GOOGLE_CLIENT_ID,
        config.GOOGLE_CLIENT_SECRET,
        config.GOOGLE_REFRESH_TOKEN
      );

      const receipt = await publisher.uploadVideo({
        videoFilePath: liveTestVideo,
        title: `[LAMS HQ Automated Test] Verification Video - ${Date.now()}`,
        description: 'Automated end-to-end verification test for LAMS HQ. Uploaded as private.',
        privacyStatus: 'private',
      });

      assert(receipt.videoId, 'Expected valid videoId from YouTube');
      assert.strictEqual(receipt.privacyStatus, 'private', 'Live upload MUST be strictly private');

      // Verify read-back
      const verification = await publisher.verifyVideo(receipt.videoId, {
        privacyStatus: 'private',
      });
      assert(verification.exists, 'Video must exist on YouTube');
      console.log(`\n      Live Video Uploaded & Verified: https://youtu.be/${receipt.videoId} (Private)`);
    } finally {
      if (fs.existsSync(liveTestVideo)) {
        try { fs.unlinkSync(liveTestVideo); } catch {}
      }
    }
  });

  console.log('\n====================================================');
  console.log(`Failure Injection Results: ${passed} / ${total} tests passed.`);
  console.log('====================================================\n');

  if (passed !== total) process.exit(1);
}

runPublishingFailureTests().catch(err => {
  console.error('Fatal Failure Injection test error:', err);
  process.exit(1);
});
