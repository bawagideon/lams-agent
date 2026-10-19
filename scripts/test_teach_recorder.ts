import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DemonstrationRecorder, type ObservedEvent } from '../src/compiler/DemonstrationRecorder.ts';
import { WorkflowCompiler } from '../src/compiler/WorkflowCompiler.ts';
import { SkillRegistry } from '../src/skills/SkillRegistry.ts';
import { SkillRunner } from '../src/skills/SkillRunner.ts';
import { AuthManager } from '../src/auth/AuthManager.ts';
import { PlaywrightBrowserAdapter } from '../src/adapters/browser/PlaywrightBrowserAdapter.ts';

const BASE_URL = 'http://127.0.0.1:4200';

async function runTeachRecorderTests() {
  console.log('====================================================');
  console.log('   TEST SUITE: RECORDER, COMPILER & BROWSER EXEC    ');
  console.log('====================================================\n');

  let total = 0;
  let passed = 0;

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
      throw err;
    }
  }

  const authManager = AuthManager.getInstance();
  let authCookie = '';
  let authCsrfToken = '';

  // Auth helper: Login to obtain valid session cookie
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: authManager.getSecret() }),
  });
  if (loginRes.ok) {
    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) {
      authCookie = setCookie.split(';')[0];
    }
    const data = await loginRes.json();
    authCsrfToken = data.csrfToken || '';
  }

  const recorder = new DemonstrationRecorder();
  const compiler = new WorkflowCompiler();

  // Test 1: Start session
  await test('DemonstrationRecorder initializes and tracks recording session', async () => {
    recorder.startRecording('Schedule TikTok Short');
    const status = recorder.getStatus();
    assert.strictEqual(status.isRecording, true, 'Recorder should be recording');
    assert.strictEqual(status.sessionName, 'Schedule TikTok Short');
    assert.strictEqual(status.totalEvents, 0);
  });

  // Test 2: Record diverse actions
  await test('DemonstrationRecorder captures click, keyboard, navigate, and assertions', async () => {
    const testEvents: ObservedEvent[] = [
      {
        timestamp: Date.now(),
        application: 'TikTok Web',
        windowTitle: 'TikTok Creator Studio',
        eventType: 'navigate',
        targetElement: { text: 'Upload Page' },
        inputData: 'https://www.tiktok.com/creator-center/upload',
      },
      {
        timestamp: Date.now() + 100,
        application: 'TikTok Web',
        windowTitle: 'Upload Modal',
        eventType: 'click',
        targetElement: { text: 'Select Video File Button', selector: 'input[type=file]' },
      },
      {
        timestamp: Date.now() + 200,
        application: 'TikTok Web',
        windowTitle: 'File Picker',
        eventType: 'file_select',
        targetElement: { text: 'Rendered MP4' },
        inputData: 'watched_exports/master_ep1.mp4',
      },
      {
        timestamp: Date.now() + 300,
        application: 'TikTok Web',
        windowTitle: 'Caption Input',
        eventType: 'keyboard',
        targetElement: { text: 'Caption Textarea', selector: '.caption-input' },
        inputData: 'Check out today episode! #lams #viral',
      },
      {
        timestamp: Date.now() + 400,
        application: 'TikTok Web',
        windowTitle: 'Publish Confirmation',
        eventType: 'click',
        targetElement: { text: 'Schedule Post Button' },
      },
      {
        timestamp: Date.now() + 500,
        application: 'TikTok Web',
        windowTitle: 'Status Toast',
        eventType: 'assertion',
        targetElement: { text: 'Post Scheduled Successfully' },
        inputData: 'Video scheduled for publication',
      },
    ];

    for (const ev of testEvents) {
      recorder.recordEvent(ev);
    }

    const status = recorder.getStatus();
    assert.strictEqual(status.totalEvents, 6, 'Should have 6 recorded events');
  });

  // Test 3: Stop session and verify persistence
  let savedSessionPath = '';
  let recordedEvents: ObservedEvent[] = [];
  await test('DemonstrationRecorder persists session JSON to disk upon stop', async () => {
    const stopResult = recorder.stopRecording();
    assert.strictEqual(stopResult.totalEvents, 6);
    assert.strictEqual(stopResult.sessionName, 'Schedule TikTok Short');
    assert.ok(stopResult.savedFilePath && fs.existsSync(stopResult.savedFilePath), 'Session file must exist on disk');

    savedSessionPath = stopResult.savedFilePath!;
    recordedEvents = stopResult.events;

    const fileContent = JSON.parse(fs.readFileSync(savedSessionPath, 'utf-8'));
    assert.strictEqual(fileContent.sessionName, 'Schedule TikTok Short');
    assert.strictEqual(fileContent.events.length, 6);
  });

  // Test 4: Compile into SkillContract
  let compiledResult: ReturnType<typeof compiler.compile> | null = null;
  await test('WorkflowCompiler compiles events into portable SkillContract with approval gate', async () => {
    compiledResult = compiler.compile('Schedule TikTok Short', recordedEvents);
    assert.strictEqual(compiledResult.abstractedStepsCount, 6);
    assert.strictEqual(compiledResult.suggestedGateLevel, '2_approval_gate', 'Publishing action requires approval gate');
    assert.strictEqual(compiledResult.skill.id, 'schedule_tiktok_short');
    assert.strictEqual(compiledResult.skill.executionMode, 'browser_agent');
    assert.strictEqual(compiledResult.skill.actions.length, 6);

    assert.strictEqual(compiledResult.skill.actions[0].action, 'browser.navigate');
    assert.strictEqual(compiledResult.skill.actions[1].action, 'ui.click');
    assert.strictEqual(compiledResult.skill.actions[2].action, 'file.select');
    assert.strictEqual(compiledResult.skill.actions[3].action, 'form.fill_text');
    assert.strictEqual(compiledResult.skill.actions[4].action, 'ui.click');
    assert.strictEqual(compiledResult.skill.actions[5].action, 'action.verify');
  });

  // Test 5: Recorder status endpoint is protected by authentication
  await test('Server Security: GET /api/teach/record/status strictly requires authentication', async () => {
    // Unauthenticated request with invalid credentials
    const unauthRes = await fetch(`${BASE_URL}/api/teach/record/status`, {
      headers: { Authorization: 'Bearer invalid-token-12345' },
    });
    assert.strictEqual(unauthRes.status, 401, 'Invalid credentials call must return 401 Unauthorized');

    // Authenticated request
    const authRes = await fetch(`${BASE_URL}/api/teach/record/status`, {
      headers: { Cookie: authCookie },
    });
    assert.strictEqual(authRes.status, 200, 'Authenticated status call must return 200 OK');
    const statusData = await authRes.json();
    assert.strictEqual(typeof statusData.status.isRecording, 'boolean');
  });

  // Test 6: Compiler endpoint rejects empty demonstration trace
  await test('Server Validation: POST /api/teach/compile rejects empty trace without isSampleTemplate', async () => {
    const res = await fetch(`${BASE_URL}/api/teach/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
      },
      body: JSON.stringify({
        sessionName: 'Empty Attempt',
        events: [],
        isSampleTemplate: false,
      }),
    });
    assert.strictEqual(res.status, 400, 'Empty demonstration trace must be rejected with HTTP 400');
    const data = await res.json();
    assert.ok(data.error && data.error.includes('No demonstration actions were captured'), 'Error message must explain rejection');
  });

  // Test 7: Skill Proposal Endpoint generates canonical plan and cryptographic approval token
  let approvalToken = '';
  let canonicalPlan: any = null;
  await test('Approval Engine: POST /api/skills/:id/propose-run generates signed approval token', async () => {
    const registry = new SkillRegistry();
    if (compiledResult) {
      registry.registerSkill(compiledResult.skill, true);
    }

    const res = await fetch(`${BASE_URL}/api/skills/schedule_tiktok_short/propose-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
      },
      body: JSON.stringify({
        params: {
          input_file_3: 'watched_exports/master_ep1.mp4',
          text_field_4: 'New viral drop #lams',
        },
      }),
    });
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.approvalToken, 'Response must return signed approval token');
    assert.ok(data.proposal, 'Response must return canonical proposal');
    assert.strictEqual(data.proposal.skillId, 'schedule_tiktok_short');
    approvalToken = data.approvalToken;
    canonicalPlan = data.proposal;
  });

  // Test 8: Skill Run rejects execution when approval token is missing or forged
  await test('Approval Engine: POST /api/skills/:id/run fails closed (HTTP 403) on missing/forged token', async () => {
    // 8a: Missing token
    const noTokenRes = await fetch(`${BASE_URL}/api/skills/schedule_tiktok_short/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
      },
      body: JSON.stringify({
        params: { input_file_3: 'watched_exports/master_ep1.mp4' },
      }),
    });
    assert.strictEqual(noTokenRes.status, 403, 'Missing approval token must return 403 Forbidden');

    // 8b: Forged token
    const forgedRes = await fetch(`${BASE_URL}/api/skills/schedule_tiktok_short/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
        'X-Approval-Token': 'forged.signature.token.here',
      },
      body: JSON.stringify({
        params: { input_file_3: 'watched_exports/master_ep1.mp4' },
      }),
    });
    assert.strictEqual(forgedRes.status, 403, 'Forged approval token must return 403 Forbidden');
  });

  // Test 9: Real Playwright Browser Automation executes genuine DOM navigation & inspection
  await test('Playwright Adapter: Real headless browser navigates and verifies DOM state', async () => {
    const browserAdapter = new PlaywrightBrowserAdapter();
    try {
      const navResult = await browserAdapter.navigate('https://example.com', false);
      assert.strictEqual(navResult.status, 200);
      assert(navResult.title.includes('Example Domain'), `Page title '${navResult.title}' must contain 'Example Domain'`);

      const verifyResult = await browserAdapter.verify('Learn more', 'a', 'Learn more');
      assert.strictEqual(verifyResult.verified, true);

      // Click link
      const clickResult = await browserAdapter.click('Learn more');
      assert.strictEqual(clickResult.clicked, true);
      assert(clickResult.currentUrl.includes('iana.org'), `Navigated URL '${clickResult.currentUrl}' must point to iana.org`);
    } finally {
      await browserAdapter.close();
    }
  });

  // Test 10: Playwright & SkillRunner strictly report FAIL on unmet assertions (no false success)
  await test('Integrity Defense: Unmet DOM condition strictly throws and returns FAILED receipt', async () => {
    const testSkill = {
      schemaVersion: '1.0',
      id: 'test_verify_failure',
      name: 'Verify Assertion Failure Detection',
      version: '1.0.0',
      description: 'Tests that impossible assertions are truthfully reported as FAIL',
      executionMode: 'browser_agent' as const,
      inputs: {},
      preconditions: [],
      approvalGate: { required: false, level: '0_autonomous' as const, prompt: '' },
      actions: [
        {
          step: 1,
          name: 'Navigate to Example Domain',
          action: 'browser.navigate',
          parameters: { target: 'https://example.com' },
        },
        {
          step: 2,
          name: 'Verify Non-Existent Element',
          action: 'action.verify',
          parameters: { selector: '#completely-non-existent-element-xyz', condition: 'Element exists', timeoutMs: 1500 },
        },
      ],
      verification: { postconditions: [], proofRequired: false },
      failureRecovery: { maxRetries: 0, alertLevel: 'low' as const },
    };

    const runner = new SkillRunner();
    const result = await runner.execute({
      missionId: 'test-mission-verify-fail',
      skill: testSkill,
      params: {},
    });

    assert.strictEqual(result.receipt.status, 'FAILED', 'Receipt status must be FAILED on assertion error');
    assert.strictEqual(result.receipt.steps[0].status, 'PASS', 'Step 1 should pass');
    assert.strictEqual(result.receipt.steps[1].status, 'FAIL', 'Step 2 must truthfully be marked as FAIL');
    assert.ok(result.receipt.steps[1].detail.includes('Timeout') || result.receipt.steps[1].detail.includes('waiting for locator'), 'Error detail must record assertion failure');
  });

  console.log('\n====================================================');
  console.log(` ✓ ALL ${passed} / ${total} TEACH RECORDER & EXECUTION TESTS PASSED`);
  console.log('====================================================');
  process.exit(0);
}

runTeachRecorderTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
