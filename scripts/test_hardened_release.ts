import assert from 'node:assert';

const BASE_URL = 'http://127.0.0.1:4200';

async function runTests() {
  console.log('====================================================');
  console.log('   LAMS HQ: HARDENED RELEASE & CREATOR UX VERIFICATION');
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

  // 1. Dashboard UI test
  await test('Dashboard HTML matches Creator UI specifications', async () => {
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

  // 2. Fetch real episodes from Supabase
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

  // 3. Preflight Release Check endpoint
  await test('Preflight Release Check endpoint validates all prerequisites', async () => {
    assert(targetEpisode, 'Target episode required');
    const res = await fetch(`${BASE_URL}/api/episodes/${targetEpisode.id}/release-check`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const check = await res.json();
    assert.strictEqual(check.episodeId, targetEpisode.id);
    assert(typeof check.canRelease === 'boolean', 'canRelease should be boolean');
    assert(Array.isArray(check.reasons), 'reasons should be an array');
    assert(check.youtube, 'youtube status object should be returned');
    console.log(`\n      Check summary: canRelease=${check.canRelease}, reasons=${JSON.stringify(check.reasons)}`);
  });

  // 4. State Machine Integrity: Negative Release test
  await test('Approve endpoint strictly rejects release without master video and does NOT mutate DB', async () => {
    assert(targetEpisode, 'Target episode required');
    const res = await fetch(`${BASE_URL}/api/episodes/${targetEpisode.id}/approve`, {
      method: 'POST',
    });
    // Should fail with 400 because no master video or youtube auth
    assert.strictEqual(res.status, 400, `Expected 400 Bad Request, got ${res.status}`);
    const body = await res.json();
    assert(body.error, 'Expected error in response');
    assert(body.reasons && body.reasons.length > 0, 'Expected rejection reasons in response');

    // Verify DB status was NOT mutated to Scheduled
    const checkRes = await fetch(`${BASE_URL}/api/episodes`);
    const checkData = await checkRes.json();
    const refreshed = checkData.episodes.find((e: any) => e.id === targetEpisode.id);
    assert.strictEqual(refreshed.status, targetEpisode.status, `DB status was mutated! Expected ${targetEpisode.status}, got ${refreshed.status}`);
  });

  // 5. Chat Assistant with Structured Plan Cards
  await test('Chat API generates structured Plan Card for release intent', async () => {
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
    assert(data.planCard.visibility.includes('Private'), 'Expected private visibility in plan');
  });

  // 6. Security: Path Traversal Prevention
  await test('Exports endpoint prevents path traversal attempts', async () => {
    const res = await fetch(`${BASE_URL}/api/exports/..%2F..%2Fpackage.json`);
    // path.basename will sanitize .. to package.json, which won't exist in watched_exports/ -> 404
    assert.strictEqual(res.status, 404, `Expected 404 Not Found for traversed path, got ${res.status}`);
  });

  // 7. Preview route integrity
  await test('Episode Preview page loads with video player and scene filmstrip', async () => {
    assert(targetEpisode, 'Target episode required');
    const res = await fetch(`${BASE_URL}/api/episodes/${targetEpisode.id}/preview`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes(targetEpisode.title), 'Preview page must contain episode title');
    assert(html.includes('Scene Filmstrip'), 'Preview page must contain Scene Filmstrip');
    assert(html.includes('Back to LAMS HQ'), 'Preview page must link back to LAMS HQ');
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
