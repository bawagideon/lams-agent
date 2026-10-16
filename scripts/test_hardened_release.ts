import assert from 'node:assert';

const BASE_URL = 'http://127.0.0.1:4200';

async function runTests() {
  console.log('====================================================');
  console.log('   LAMS HQ: FULL ROUTES & DESIGN LANGUAGE VERIFICATION');
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
    assert(html.includes(targetEpisode.title), 'Preview page must contain episode title');
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

  // 10. State Machine Integrity: Negative Release test
  await test('Approve endpoint strictly rejects release without master video and does NOT mutate DB', async () => {
    assert(targetEpisode, 'Target episode required');
    const res = await fetch(`${BASE_URL}/api/episodes/${targetEpisode.id}/approve`, {
      method: 'POST',
    });
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

  // 11. Chat Assistant with Structured Plan Cards
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
  });

  // 12. Security: Path Traversal Prevention
  await test('Exports endpoint prevents path traversal attempts', async () => {
    const res = await fetch(`${BASE_URL}/api/exports/..%2F..%2Fpackage.json`);
    assert.strictEqual(res.status, 404, `Expected 404 Not Found for traversed path, got ${res.status}`);
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
