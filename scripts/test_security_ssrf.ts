import http from 'node:http';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { MediaAssetDownloader } from '../src/adapters/media/MediaAssetDownloader.ts';
import { PlaywrightBrowserAdapter } from '../src/adapters/browser/PlaywrightBrowserAdapter.ts';

async function runSsrfTests() {
  console.log('====================================================');
  console.log('   SECURITY SUITE: SSRF & REDIRECT REBINDING AUDIT');
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

  const downloader = new MediaAssetDownloader();
  const browserAdapter = new PlaywrightBrowserAdapter();

  // 1. MediaAssetDownloader direct private IP blocking
  await test('MediaAssetDownloader: Direct private and loopback IPs are blocked', async () => {
    const blockedTargets = [
      'http://127.0.0.1/admin',
      'http://127.0.0.2:8080/flag',
      'http://10.0.0.1/secrets',
      'http://172.16.0.1/config',
      'http://192.168.1.1/router',
      'http://169.254.169.254/latest/meta-data',
      'http://localhost:4200/api',
      'ftp://example.com/asset.mp4',
      'file:///etc/passwd',
    ];

    for (const url of blockedTargets) {
      let threw = false;
      try {
        await downloader.validateRemoteUrl(url);
      } catch {
        threw = true;
      }
      assert(threw, `Expected URL '${url}' to be blocked, but it passed!`);
    }
  });

  // 2. PlaywrightBrowserAdapter comprehensive IPv4 & IPv6 validation
  await test('PlaywrightBrowserAdapter: Comprehensive IPv4, IPv6, and carrier-NAT IPs blocked', async () => {
    const blockedTargets = [
      'http://127.0.0.1:4200',
      'http://10.254.0.1/internal',
      'http://172.20.0.1/admin',
      'http://192.168.0.100/status',
      'http://169.254.169.254/computeMetadata/v1/',
      'http://100.64.0.1/cgnat',
      'http://0.0.0.0/secrets',
      'http://[::1]/root',
      'http://[fe80::1]/linklocal',
      'http://[fc00::1]/ula',
      'http://[::ffff:127.0.0.1]/mapped',
      'http://[::ffff:169.254.169.254]/mapped_meta',
      'file:///C:/Windows/win.ini',
      'gopher://127.0.0.1:70/',
    ];

    for (const url of blockedTargets) {
      let threw = false;
      try {
        await browserAdapter.validateUrlSafety(url, false);
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('SSRF blocked') || err.message.includes('Disallowed protocol'), `Unexpected error: ${err.message}`);
      }
      assert(threw, `PlaywrightBrowserAdapter expected to block '${url}', but it passed!`);
    }
  });

  // 3. PlaywrightBrowserAdapter fails closed on unresolvable DNS
  await test('PlaywrightBrowserAdapter: Fails closed on DNS resolution failures', async () => {
    let threw = false;
    try {
      await browserAdapter.validateUrlSafety('http://non-existent-domain-xyz-ssrf-check-12345.invalid/test', false);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('SSRF blocked') && err.message.includes('DNS resolution failed'), `Unexpected message: ${err.message}`);
    }
    assert(threw, 'Must fail closed on DNS resolution failure');
  });

  // 4. Production loopback override prevention
  await test('PlaywrightBrowserAdapter: Production strictly prohibits loopback regardless of parameter', async () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      let threw = false;
      try {
        await browserAdapter.validateUrlSafety('http://127.0.0.1:4200/api', true);
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('SSRF blocked'), `Expected SSRF blocked, got: ${err.message}`);
      }
      assert(threw, 'In production, allowLoopback parameter MUST NOT bypass SSRF restriction');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  // 5. Setup mock HTTP redirect server for multi-hop redirect tests
  let redirectServer: http.Server | null = null;
  const redirectPort = 4288;
  const redirectBase = `http://127.0.0.1:${redirectPort}`;

  await new Promise<void>((resolve) => {
    redirectServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${redirectPort}`);
      if (url.pathname === '/redirect-loopback') {
        res.writeHead(302, { Location: 'http://127.0.0.1:4200/api/auth/status' });
        res.end();
      } else if (url.pathname === '/redirect-metadata') {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
        res.end();
      } else if (url.pathname === '/redirect-infinite') {
        res.writeHead(302, { Location: `${redirectBase}/redirect-infinite` });
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    redirectServer.listen(redirectPort, () => resolve());
  });

  const cacheDir = path.resolve('cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  process.env.ALLOW_TEST_REDIRECT_MOCK = 'true';

  try {
    // 6. Multi-hop SSRF redirect to loopback is blocked at redirect hop
    await test('MediaAssetDownloader: HTTP 302 redirect to loopback (127.0.0.1) aborted at hop', async () => {
      let rejected = false;
      try {
        await downloader.ensureLocalAsset('test-ep', `${redirectBase}/redirect-loopback`, 'ssrf_hop1.mp4', 'video');
      } catch (err: any) {
        rejected = true;
        assert(err.message.includes('prohibited') || err.message.includes('private') || err.message.includes('loopback'), `Error message: ${err.message}`);
      }
      assert(rejected, 'Expected redirect to loopback to be blocked');
    });

    // 7. Multi-hop SSRF redirect to AWS metadata is blocked at redirect hop
    await test('MediaAssetDownloader: HTTP 302 redirect to Cloud metadata (169.254.169.254) aborted at hop', async () => {
      let rejected = false;
      try {
        await downloader.ensureLocalAsset('test-ep', `${redirectBase}/redirect-metadata`, 'ssrf_hop2.mp4', 'video');
      } catch (err: any) {
        rejected = true;
        assert(err.message.includes('prohibited') || err.message.includes('private'), `Error message: ${err.message}`);
      }
      assert(rejected, 'Expected redirect to link-local metadata to be blocked');
    });

    // 8. Infinite redirect loop protection (max 5 hops)
    await test('MediaAssetDownloader: Redirect loop exceeds maximum hops (max 5 hops)', async () => {
      let rejected = false;
      try {
        await downloader.ensureLocalAsset('test-ep', `${redirectBase}/redirect-infinite`, 'ssrf_hop3.mp4', 'video');
      } catch (err: any) {
        rejected = true;
        assert(err.message.includes('Too many redirects'), `Error message: ${err.message}`);
      }
      assert(rejected, 'Expected infinite redirect to be terminated');
    });
  } finally {
    process.env.ALLOW_TEST_REDIRECT_MOCK = 'false';
    if (redirectServer) {
      await new Promise<void>((resolve) => (redirectServer as http.Server).close(() => resolve()));
    }
  }

  console.log('\n====================================================');
  console.log(`SSRF Security Results: ${passed} / ${total} tests passed.`);
  console.log('====================================================\n');

  if (passed !== total) process.exit(1);
}

runSsrfTests().catch(err => {
  console.error('Fatal SSRF test error:', err);
  process.exit(1);
});
