import http from 'node:http';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { MediaAssetDownloader } from '../src/adapters/media/MediaAssetDownloader.ts';

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

  // 1. Direct private IP blocking
  await test('Direct private and loopback IPs are blocked', async () => {
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

  // 2. Setup mock HTTP redirect server
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
    // 3. Multi-hop SSRF redirect to loopback is blocked at redirect hop
    await test('HTTP 302 redirect to loopback (127.0.0.1) is aborted at hop', async () => {
      let rejected = false;
      try {
        await downloader.ensureLocalAsset('test-ep', `${redirectBase}/redirect-loopback`, 'ssrf_hop1.mp4', 'video');
      } catch (err: any) {
        rejected = true;
        assert(err.message.includes('prohibited') || err.message.includes('private') || err.message.includes('loopback'), `Error message: ${err.message}`);
      }
      assert(rejected, 'Expected redirect to loopback to be blocked');
    });

    // 4. Multi-hop SSRF redirect to AWS metadata is blocked at redirect hop
    await test('HTTP 302 redirect to Cloud metadata (169.254.169.254) is aborted at hop', async () => {
      let rejected = false;
      try {
        await downloader.ensureLocalAsset('test-ep', `${redirectBase}/redirect-metadata`, 'ssrf_hop2.mp4', 'video');
      } catch (err: any) {
        rejected = true;
        assert(err.message.includes('prohibited') || err.message.includes('private'), `Error message: ${err.message}`);
      }
      assert(rejected, 'Expected redirect to link-local metadata to be blocked');
    });

    // 5. Infinite redirect loop protection (max 5 hops)
    await test('Redirect loop exceeds maximum hops (max 5 hops)', async () => {
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
