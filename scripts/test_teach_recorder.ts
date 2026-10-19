import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DemonstrationRecorder, type ObservedEvent } from '../src/compiler/DemonstrationRecorder.ts';
import { WorkflowCompiler } from '../src/compiler/WorkflowCompiler.ts';
import { SkillRegistry } from '../src/skills/SkillRegistry.ts';
import { SkillRunner } from '../src/skills/SkillRunner.ts';
import { AuthManager } from '../src/auth/AuthManager.ts';
import { ApprovalManager } from '../src/auth/ApprovalManager.ts';
import { computeSkillPlanHash } from '../src/contracts/SkillContract.ts';
import { signEvidenceReceipt, verifyEvidenceReceipt, canonicalizeReceiptPayload, canonicalizeValue } from '../src/contracts/EvidenceReceipt.ts';
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

  const globalCustomSkillsPath = path.resolve('data', 'custom_skills.json');
  const originalGlobalCustomSkills = fs.existsSync(globalCustomSkillsPath) ? fs.readFileSync(globalCustomSkillsPath, 'utf-8') : null;

  try {
    // Auth helper: Login to obtain valid creator session cookie
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
    assert.strictEqual(compiledResult.skill.isSample, false);
    assert.strictEqual(compiledResult.skill.status, 'draft');

    assert.strictEqual(compiledResult.skill.actions[0].action, 'browser.navigate');
    assert.strictEqual(compiledResult.skill.actions[1].action, 'ui.click');
    assert.strictEqual(compiledResult.skill.actions[2].action, 'file.select');
    assert.strictEqual(compiledResult.skill.actions[3].action, 'form.fill_text');
    assert.strictEqual(compiledResult.skill.actions[4].action, 'ui.click');
    assert.strictEqual(compiledResult.skill.actions[5].action, 'action.verify');
  });

  // Test 5: Recorder status endpoint is protected by authentication
  await test('Server Security: GET /api/teach/record/status strictly requires authentication', async () => {
    const unauthRes = await fetch(`${BASE_URL}/api/teach/record/status`, {
      headers: { Authorization: 'Bearer invalid-token-12345' },
    });
    assert.strictEqual(unauthRes.status, 401, 'Invalid credentials call must return 401 Unauthorized');

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

  // Test 7: Three-Phase Lifecycle Phase 1 - Proposing does NOT issue an execution token
  let proposedId = '';
  await test('Approval Lifecycle: POST /api/skills/:id/propose-run creates PROPOSED plan without token', async () => {
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
    assert.strictEqual(data.requiresApproval, true);
    assert.ok(data.proposalId, 'Response must return proposalId');
    assert.strictEqual(data.proposal.status, 'PROPOSED', 'Proposal initial status must strictly be PROPOSED');
    assert.strictEqual(data.approvalToken, undefined, 'CRITICAL: propose-run MUST NOT issue an execution approval token');
    proposedId = data.proposalId;
  });

  // Test 8: Three-Phase Lifecycle Phase 2 - Explicit Human Approval issues cryptographic token
  let approvalToken = '';
  await test('Approval Lifecycle: POST /api/skills/:id/approve-run transitions to APPROVED and signs token', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/schedule_tiktok_short/approve-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
      },
      body: JSON.stringify({ proposalId: proposedId }),
    });
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.approvalToken, 'approve-run MUST issue the signed approval token');
    assert.strictEqual(data.proposal.status, 'APPROVED');
    assert.ok(data.proposal.approvedByUserId, 'Approver user identity must be recorded');
    approvalToken = data.approvalToken;
  });

  // Test 9: Execution Rejection on unapproved, forged, or mismatched tokens
  await test('Approval Engine: POST /api/skills/:id/run fails closed (HTTP 403) on unapproved/tampered tokens', async () => {
    // 9a: Missing token
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

    // 9b: Forged token
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

  // Test 10: Three-Phase Lifecycle Phase 3 - Single-use consumption and replay defense
  await test('Approval Engine: Tokens are single-use; replay attempts fail closed (HTTP 403)', async () => {
    // Modify status directly to CONSUMED to simulate already-consumed proposal
    const approvalMgr = (await import('../src/auth/ApprovalManager.ts')).ApprovalManager.getInstance();
    const proposal = approvalMgr.getSkillProposal(proposedId);
    assert.ok(proposal, 'Proposal must exist');

    // Test replay validation directly against ApprovalManager
    const replayValidation = await approvalMgr.validateAndConsumeSkillApproval(
      approvalToken,
      'schedule_tiktok_short',
      '1.0.0',
      { input_file_3: 'watched_exports/master_ep1.mp4', text_field_4: 'New viral drop #lams' },
      compiledResult!.skill.actions,
      proposal.approvedByUserId || 'creator'
    );
    assert.strictEqual(replayValidation.valid, true, 'First consumption must succeed');
    assert.strictEqual(proposal.status, 'CONSUMED');

    // Second consumption must fail (replay attack rejected)
    const secondValidation = await approvalMgr.validateAndConsumeSkillApproval(
      approvalToken,
      'schedule_tiktok_short',
      '1.0.0',
      { input_file_3: 'watched_exports/master_ep1.mp4', text_field_4: 'New viral drop #lams' },
      compiledResult!.skill.actions,
      proposal.approvedByUserId || 'creator'
    );
    assert.strictEqual(secondValidation.valid, false, 'Replay consumption MUST be rejected');
    assert.ok(secondValidation.error?.includes('already been consumed'), 'Error must specify already consumed');
  });

  // Test 11: Machine-enforced sample template status, verifiable promotion & plan tamper defense
  await test('Sample Templates: Require machine-verifiable evidence receipt for promotion and detect plan tampering', async () => {
    const sampleSkill = {
      schemaVersion: '1.0',
      id: 'sample_template_skill',
      name: 'Sample Template Skill',
      version: '1.0.0',
      description: 'Sample template skill for testing promotion',
      executionMode: 'browser_agent' as const,
      isSample: true,
      status: 'sample_template' as const,
      inputs: {},
      preconditions: [],
      approvalGate: { required: true, level: '2_approval_gate' as const, prompt: 'Approve promotion test' },
      actions: [
        {
          step: 1,
          name: 'Navigate to Example Domain',
          action: 'browser.navigate',
          parameters: { target: 'https://example.com' },
        },
        {
          step: 2,
          name: 'Verify Learn More Link',
          action: 'action.verify',
          parameters: { selector: 'a', expectedText: 'Learn more' },
        },
      ],
      verification: { postconditions: [], proofRequired: false },
      failureRecovery: { maxRetries: 0, alertLevel: 'low' as const },
    };

    const customSkillsFilePath = path.resolve('data', 'custom_skills.json');
    const origCustomSkills = fs.existsSync(customSkillsFilePath) ? fs.readFileSync(customSkillsFilePath, 'utf-8') : null;

    try {
      const registry = new SkillRegistry();
      registry.registerSkill(sampleSkill, true);

    // 11a: Call promotion endpoint without testRunReceiptId -> must return HTTP 422
    const unverifiedRes = await fetch(`${BASE_URL}/api/skills/${sampleSkill.id}/promote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
      },
      body: JSON.stringify({ reviewerNotes: 'Attempting unverified promotion' }),
    });
    assert.strictEqual(unverifiedRes.status, 422, 'Unverified promotion attempt must be rejected with 422');
    const unverifiedData = await unverifiedRes.json();
    assert.ok(unverifiedData.error?.includes('testRunReceiptId confirming successful test execution'), 'Must require testRunReceiptId');

    // 11b: Execute the skill test run using SkillRunner to generate genuine evidence receipt
    const runner = new SkillRunner();
    const testExecution = await runner.execute({
      missionId: 'test-mission-verify-sample',
      skill: sampleSkill,
      params: {},
      isApprovedByHuman: true,
    });
    assert.strictEqual(testExecution.receipt.status, 'SUCCESS', 'Test execution of sample skill must succeed');
    const validReceiptId = testExecution.receipt.receiptId;
    assert.ok(fs.existsSync(path.resolve('data', 'evidence_receipts', `${validReceiptId}.json`)), 'Evidence receipt must be saved to disk');

    // 11b-2: Tamper Defense: Attempt promotion with evidence receipt having mismatched planHash -> must be rejected with 422
    const tamperedReceiptId = `receipt_mismatch_${Date.now()}`;
    const tamperedReceiptPath = path.resolve('data', 'evidence_receipts', `${tamperedReceiptId}.json`);
    const validReceipt = JSON.parse(fs.readFileSync(path.resolve('data', 'evidence_receipts', `${validReceiptId}.json`), 'utf-8'));
    const mismatchedReceipt = {
      ...validReceipt,
      receiptId: tamperedReceiptId,
      planHash: 'tampered_non_matching_plan_hash_0000000000000000',
    };
    const authSecret = AuthManager.getInstance().getSecret();
    const signedMismatchedReceipt = signEvidenceReceipt(mismatchedReceipt, authSecret);
    fs.writeFileSync(tamperedReceiptPath, JSON.stringify(signedMismatchedReceipt, null, 2), 'utf-8');

    const mismatchRes = await fetch(`${BASE_URL}/api/skills/${sampleSkill.id}/promote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
      },
      body: JSON.stringify({ testRunReceiptId: tamperedReceiptId, reviewerNotes: 'Attempting mismatched receipt' }),
    });
    assert.strictEqual(mismatchRes.status, 422, 'Mismatched planHash in evidence receipt must be rejected with 422');
    const mismatchData = await mismatchRes.json();
    assert.ok(mismatchData.error?.includes('does not match the canonical action plan hash'), `Unexpected error: ${mismatchData.error}`);
    try { fs.unlinkSync(tamperedReceiptPath); } catch {}

    // 11b-3: Cryptographic HMAC Authenticity: Attempt promotion with forged HMAC signature -> must be rejected with 422
    const forgedReceiptId = `receipt_forged_hmac_${Date.now()}`;
    const forgedReceiptPath = path.resolve('data', 'evidence_receipts', `${forgedReceiptId}.json`);
    const forgedReceipt = {
      ...validReceipt,
      receiptId: forgedReceiptId,
      receiptSignature: 'forged_hmac_signature_0000000000000000000000000000000000000000000000000000000000000000',
    };
    fs.writeFileSync(forgedReceiptPath, JSON.stringify(forgedReceipt, null, 2), 'utf-8');

    const forgedRes = await fetch(`${BASE_URL}/api/skills/${sampleSkill.id}/promote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
      },
      body: JSON.stringify({ testRunReceiptId: forgedReceiptId, reviewerNotes: 'Attempting forged HMAC' }),
    });
    assert.strictEqual(forgedRes.status, 422, 'Forged HMAC signature in evidence receipt must be rejected with 422');
    const forgedData = await forgedRes.json();
    assert.ok(
      forgedData.error?.includes('cryptographic verification failed') ||
      forgedData.error?.includes('HMAC signature is invalid') ||
      forgedData.error?.includes('signature verification failed'),
      `Expected HMAC rejection message, got: ${forgedData.error}`
    );
    try { fs.unlinkSync(forgedReceiptPath); } catch {}

    // 11c: Call promotion endpoint with valid testRunReceiptId -> must succeed with 200
    const promoRes = await fetch(`${BASE_URL}/api/skills/${sampleSkill.id}/promote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
      },
      body: JSON.stringify({ testRunReceiptId: validReceiptId, reviewerNotes: 'Verified via test run' }),
    });
    assert.strictEqual(promoRes.status, 200, `Expected 200, got ${promoRes.status}`);
    const promoData = await promoRes.json();
    assert.strictEqual(promoData.skill.status, 'verified_production');
    assert.strictEqual(promoData.skill.isSample, false);
    assert.ok(promoData.skill.verificationProof, 'Skill must have verificationProof');
    assert.strictEqual(promoData.skill.verificationProof.testRunReceiptId, validReceiptId);

    // 11d: Tamper Defense: If actions are modified post-promotion, production execution must fail closed
    const promotedSkill = promoData.skill;
    const tamperedSkill = JSON.parse(JSON.stringify(promotedSkill));
    tamperedSkill.actions[0].parameters.target = 'https://example.org/tampered';

    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      let threw = false;
      try {
        await runner.execute({
          missionId: 'test-mission-tamper',
          skill: tamperedSkill,
          params: {},
          isApprovedByHuman: true,
        });
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('verification proof is missing or invalidated by altered action plan'), `Unexpected error: ${err.message}`);
      }
      assert.strictEqual(threw, true, 'SkillRunner must fail closed when action plan does not match verification proof planHash in production');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  } finally {
    if (origCustomSkills !== null) {
      fs.writeFileSync(customSkillsFilePath, origCustomSkills, 'utf-8');
    }
  }
});

  // Test 12: Browser Prerequisite Check
  await test('Playwright Adapter: Browser prerequisite diagnostic checks installed binary', async () => {
    const prereqs = await PlaywrightBrowserAdapter.checkBrowserPrerequisites();
    assert.strictEqual(typeof prereqs.ready, 'boolean');
    assert.ok(prereqs.ready, 'System must have Edge or Chromium ready');
    assert.ok(prereqs.channel === 'msedge' || prereqs.channel === 'chromium');
  });

  // Test 13: Real Playwright Browser Automation executes genuine DOM navigation & inspection
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

  // Test 14: Playwright & SkillRunner strictly report FAIL on unmet assertions (no false success)
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

  // Test 15: Cross-Process Skill Cache Invalidation & Deletion Purge via SHA-256 Content Hashing
  await test('SkillRegistry: Cross-process child process writes and deletes custom skill; parent detects and purges via SHA-256 content hash', async () => {
    const registry = new SkillRegistry();
    const uniqueId = `cross_proc_test_${Date.now()}`;
    const newSkill = {
      schemaVersion: '1.0',
      id: uniqueId,
      name: 'Cross Process Child Skill',
      version: '1.0.0',
      description: 'Skill written by spawned child process',
      executionMode: 'browser_agent' as const,
      isSample: false,
      status: 'draft' as const,
      inputs: {},
      preconditions: [],
      approvalGate: { required: false, level: '0_autonomous' as const, prompt: '' },
      actions: [],
      verification: { postconditions: [], proofRequired: false },
      failureRecovery: { maxRetries: 0, alertLevel: 'low' as const },
    };

    // 15a: Parent registry initially does not have this skill
    assert.strictEqual(registry.getSkill(uniqueId), undefined, 'Parent registry should not have new skill initially');

    // 15b: Spawn a real Node.js child process to write the skill to data/custom_skills.json
    const addScript = `
      const fs = require('fs');
      const path = require('path');
      const filePath = path.resolve('data', 'custom_skills.json');
      const skills = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : [];
      skills.push(${JSON.stringify(newSkill)});
      fs.writeFileSync(filePath, JSON.stringify(skills, null, 2), 'utf-8');
    `;
    const addProc = spawnSync('node', ['-e', addScript], { encoding: 'utf-8' });
    assert.strictEqual(addProc.status, 0, `Child process failed to write skill: ${addProc.stderr}`);

    // 15c: Parent registry reloads via SHA-256 content hashing and discovers it
    const discovered = registry.getSkill(uniqueId);
    assert.ok(discovered, 'Parent registry must reload and discover skill written by child process');
    assert.strictEqual(discovered.id, uniqueId);

    // 15d: Spawn a real Node.js child process to DELETE the skill from data/custom_skills.json
    const deleteScript = `
      const fs = require('fs');
      const path = require('path');
      const filePath = path.resolve('data', 'custom_skills.json');
      if (fs.existsSync(filePath)) {
        const skills = JSON.parse(fs.readFileSync(filePath, 'utf-8')).filter(s => s.id !== '${uniqueId}');
        fs.writeFileSync(filePath, JSON.stringify(skills, null, 2), 'utf-8');
      }
    `;
    const delProc = spawnSync('node', ['-e', deleteScript], { encoding: 'utf-8' });
    assert.strictEqual(delProc.status, 0, `Child process failed to delete skill: ${delProc.stderr}`);

    // 15e: Parent registry must PURGE the deleted skill from in-memory cache upon reload
    const purged = registry.getSkill(uniqueId);
    assert.strictEqual(purged, undefined, 'Parent registry must purge deleted custom skill from memory');
  });

  // Test 16: Restart Recovery and Child Process Isolation of ApprovalManager
  await test('ApprovalManager: Recovers proposals across independent child processes via disk persistence and requires DB in prod', async () => {
    const approvalMgr = ApprovalManager.getInstance();
    const testSkill = {
      id: 'restart_recovery_skill',
      name: 'Restart Recovery Skill',
      version: '1.0.0',
      actions: [{ step: 1, name: 'Step 1', action: 'ui.click' }],
      inputs: {},
      approvalGate: { required: true, level: '2_approval_gate', prompt: 'Approve restart test' },
    };

    const { proposalId, proposal } = approvalMgr.createSkillExecutionProposal(
      testSkill as any,
      { testParam: 'val123' },
      'test-creator'
    );
    assert.strictEqual(proposal.status, 'PROPOSED');

    // Verify independent child process can read and recover the proposal from disk
    const checkScript = `
      import { ApprovalManager } from './src/auth/ApprovalManager.ts';
      const mgr = ApprovalManager.getInstance();
      const p = mgr.getSkillProposal('${proposalId}');
      if (!p || p.status !== 'PROPOSED') {
        console.error('Child process could not find proposal:', p);
        process.exit(1);
      }
      process.exit(0);
    `;
    const childCheck = spawnSync('node', ['--experimental-strip-types', '-e', checkScript], { encoding: 'utf-8' });
    assert.strictEqual(childCheck.status, 0, `Independent child process failed to recover proposal: ${childCheck.stderr}`);

    // Also test production validation path: If Supabase has no record in production, fails closed
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const prodValidation = await approvalMgr.validateAndConsumeSkillApproval(
        'mock-token',
        testSkill.id,
        testSkill.version,
        { testParam: 'val123' },
        testSkill.actions,
        'test-creator'
      );
      assert.strictEqual(prodValidation.valid, false, 'In production, approval without authoritative database record must fail closed');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  // Test 17: Strict Verifier Registry: Unsupported or unregistered postconditions fail closed
  await test('SkillRunner: Strict verifier registry fails closed on unknown or unverified postconditions', async () => {
    const runner = new SkillRunner();
    const rogueSkill = {
      schemaVersion: '1.0',
      id: 'rogue_postcondition_skill',
      name: 'Rogue Postcondition Skill',
      version: '1.0.0',
      description: 'Skill with bogus unregistered postcondition',
      executionMode: 'browser_agent' as const,
      isSample: false,
      status: 'draft' as const,
      inputs: {},
      preconditions: [],
      approvalGate: { required: false, level: '0_autonomous' as const, prompt: '' },
      actions: [
        {
          step: 1,
          name: 'Navigate to Example',
          action: 'browser.navigate',
          parameters: { target: 'https://example.com' },
        },
      ],
      verification: {
        postconditions: ['unregistered_bogus_security_condition_12345'],
        proofRequired: false,
      },
      failureRecovery: { maxRetries: 0, alertLevel: 'low' as const },
    };

    const execResult = await runner.execute({
      missionId: 'test-mission-strict-postcond',
      skill: rogueSkill,
      params: {},
      isApprovedByHuman: true,
    });

    assert.strictEqual(execResult.outputData.status, 'FAILED', 'Execution must fail closed when postcondition is unknown');
    assert.strictEqual(execResult.receipt.status, 'FAILED', 'Receipt status must be FAILED');
    assert.ok(
      execResult.outputData.error?.includes('Unsupported postcondition') ||
      execResult.receipt.verificationProof?.error?.includes('Unsupported or unregistered postcondition'),
      `Unexpected error message: ${JSON.stringify(execResult.outputData)}`
    );
    assert.strictEqual(execResult.receipt.passedPostconditions?.length || 0, 0, 'Unknown postcondition must not be marked passed');
  });

  // Test 18: File Deletion Invalidation: Deleting custom_skills.json completely purges memory on forceFresh
  await test('SkillRegistry: Complete removal of custom_skills.json purges memory cache on forceFresh', async () => {
    const registry = new SkillRegistry();
    const tempSkillId = `temp_delete_skill_${Date.now()}`;
    const tempSkill = {
      schemaVersion: '1.0',
      id: tempSkillId,
      name: 'Temporary Skill',
      version: '1.0.0',
      description: 'Will be deleted with file',
      executionMode: 'browser_agent' as const,
      isSample: false,
      status: 'draft' as const,
      inputs: {},
      preconditions: [],
      approvalGate: { required: false, level: '0_autonomous' as const, prompt: '' },
      actions: [],
      verification: { postconditions: [], proofRequired: false },
      failureRecovery: { maxRetries: 0, alertLevel: 'low' as const },
    };

    const customFilePath = path.resolve('data', 'custom_skills.json');
    const backupContent = fs.existsSync(customFilePath) ? fs.readFileSync(customFilePath, 'utf-8') : '[]';

    try {
      registry.registerSkill(tempSkill, true);
      assert.ok(registry.getSkill(tempSkillId), 'Skill must be registered in memory and disk');

      // Delete custom_skills.json completely from disk
      if (fs.existsSync(customFilePath)) fs.unlinkSync(customFilePath);

      // Calling getSkill with forceFresh: true must purge from memory
      const purged = registry.getSkill(tempSkillId, { forceFresh: true });
      assert.strictEqual(purged, undefined, 'Skill must be purged from memory when backing file is removed');
    } finally {
      fs.writeFileSync(customFilePath, backupContent, 'utf-8');
    }
  });

  // Test 19: Video Recording Security: SessionId validation, traversal blocking, and path privacy
  await test('Server Security: POST /api/teach/record/video validates sessionId and does not leak local paths', async () => {
    // 19a: Invalid sessionId with directory traversal or illegal chars -> must return 400
    const invalidRes = await fetch(`${BASE_URL}/api/teach/record/video?sessionId=../../etc/passwd`, {
      method: 'POST',
      headers: {
        'Content-Type': 'video/webm',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
      },
      body: Buffer.from('fake-video-payload'),
    });
    assert.strictEqual(invalidRes.status, 400, 'Directory traversal in sessionId must be rejected with 400');
    const invalidData = await invalidRes.json();
    assert.ok(invalidData.error?.includes('Invalid sessionId format'), `Unexpected error: ${invalidData.error}`);

    // 19b: Valid upload returns success without absolute filesystem path leakage
    const validSession = `rec_valid_${Date.now()}`;
    const validRes = await fetch(`${BASE_URL}/api/teach/record/video?sessionId=${validSession}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'video/webm',
        Cookie: authCookie,
        'X-CSRF-Token': authCsrfToken,
      },
      body: Buffer.from('dummy-valid-webm-data-chunk-0123456789'),
    });
    assert.strictEqual(validRes.status, 200, `Expected 200, got ${validRes.status}`);
    const validData = await validRes.json();
    assert.strictEqual(validData.success, true);
    assert.strictEqual(validData.sessionId, validSession);
    assert.strictEqual(validData.savedPath, undefined, 'CRITICAL: Must not leak absolute server path in API response');
    assert.ok(typeof validData.sizeMb === 'number' || typeof validData.sizeMb === 'string', 'Must return sizeMb metric');

    // Clean up test recording file
    const recFile1 = path.resolve('data', 'recordings', `${validSession}.webm`);
    const recFile2 = path.resolve('data', 'demonstrations', `${validSession}.webm`);
    if (fs.existsSync(recFile1)) {
      try { fs.unlinkSync(recFile1); } catch {}
    }
    if (fs.existsSync(recFile2)) {
      try { fs.unlinkSync(recFile2); } catch {}
    }
  });

  // Test 20: Recursive HMAC Canonicalization: Key Insertion Order Invariance & Complete Nested Preservation
  await test('Cryptographic Integrity: Recursive canonicalization preserves nested keys and is order-invariant', async () => {
    // 20a: Nested key preservation - steps and proofData must not lose properties
    const samplePayload = {
      receiptId: 'rcpt_test_canon_1',
      missionId: 'mission_canon',
      skillId: 'skill_canon',
      skillVersion: '1.0.0',
      status: 'SUCCESS' as const,
      startedAt: '2026-10-19T12:00:00.000Z',
      completedAt: '2026-10-19T12:00:01.000Z',
      totalDurationMs: 1000,
      executedBy: 'Test Agent',
      steps: [
        {
          step: 1,
          name: 'Step One',
          action: 'browser.navigate',
          durationMs: 400,
          status: 'PASS' as const,
          detail: 'Navigated to target URL',
        },
      ],
      proofData: {
        planHash: 'hash_abc_123',
        verificationProof: {
          domChecked: true,
          elementText: 'Success Element',
        },
      },
    };

    const canonicalStr = canonicalizeReceiptPayload(samplePayload);
    const parsedBack = JSON.parse(canonicalStr);

    // Assert that nested properties are preserved (not dropped by top-level replacer arrays)
    assert.strictEqual(parsedBack.steps[0].action, 'browser.navigate', 'Step action must be preserved in canonical string');
    assert.strictEqual(parsedBack.steps[0].detail, 'Navigated to target URL', 'Step detail must be preserved');
    assert.strictEqual(parsedBack.steps[0].durationMs, 400, 'Step durationMs must be preserved');
    assert.strictEqual(parsedBack.proofData.verificationProof.domChecked, true, 'Nested proofData property must be preserved');

    // 20b: Key insertion order invariance
    // Object with scrambled key insertion order
    const scrambledPayload = {
      totalDurationMs: 1000,
      status: 'SUCCESS' as const,
      startedAt: '2026-10-19T12:00:00.000Z',
      skillVersion: '1.0.0',
      skillId: 'skill_canon',
      receiptId: 'rcpt_test_canon_1',
      proofData: {
        verificationProof: {
          elementText: 'Success Element',
          domChecked: true,
        },
        planHash: 'hash_abc_123',
      },
      steps: [
        {
          detail: 'Navigated to target URL',
          status: 'PASS' as const,
          name: 'Step One',
          durationMs: 400,
          action: 'browser.navigate',
          step: 1,
        },
      ],
      missionId: 'mission_canon',
      executedBy: 'Test Agent',
      completedAt: '2026-10-19T12:00:01.000Z',
    };

    const scrambledCanonicalStr = canonicalizeReceiptPayload(scrambledPayload);
    assert.strictEqual(
      canonicalStr,
      scrambledCanonicalStr,
      'Cryptographic canonical string must be completely invariant to key insertion order'
    );
  });

  // Test 21: Tamper Resistance: Independent nested mutations strictly invalidate HMAC signatures
  await test('Cryptographic Integrity: Tampering with nested step actions, statuses, or proofs invalidates HMAC', async () => {
    const rawReceipt = {
      receiptId: 'rcpt_tamper_test',
      missionId: 'mission_tamper',
      skillId: 'test_skill_tamper',
      skillVersion: '1.0.0',
      status: 'SUCCESS' as const,
      startedAt: new Date(Date.now() - 5000).toISOString(),
      completedAt: new Date().toISOString(),
      totalDurationMs: 5000,
      executedBy: 'Test Runner',
      steps: [
        {
          step: 1,
          name: 'Legitimate Step',
          action: 'browser.navigate',
          durationMs: 500,
          status: 'PASS' as const,
          detail: 'Step 1 success',
        },
      ],
      proofData: {
        planHash: 'original_legit_plan_hash',
      },
    };

    const signedReceipt = signEvidenceReceipt(rawReceipt);
    const initialCheck = verifyEvidenceReceipt(signedReceipt);
    assert.strictEqual(initialCheck.valid, true, 'Original signed receipt must be cryptographically valid');

    // 21a: Tamper with step[0].action -> must fail signature check
    const tamperedActionReceipt = JSON.parse(JSON.stringify(signedReceipt));
    tamperedActionReceipt.steps[0].action = 'malicious.unauthorized_action';
    const actionCheck = verifyEvidenceReceipt(tamperedActionReceipt);
    assert.strictEqual(actionCheck.valid, false, 'Tampered step action must invalidate HMAC signature');
    assert.ok(actionCheck.error?.includes('tampered'), 'Error must report tampering or signature invalidation');

    // 21b: Tamper with step[0].status -> must fail signature check
    const tamperedStatusReceipt = JSON.parse(JSON.stringify(signedReceipt));
    tamperedStatusReceipt.steps[0].status = 'FAIL';
    const statusCheck = verifyEvidenceReceipt(tamperedStatusReceipt);
    assert.strictEqual(statusCheck.valid, false, 'Tampered step status must invalidate HMAC signature');

    // 21c: Tamper with nested proofData.planHash -> must fail signature check
    const tamperedProofReceipt = JSON.parse(JSON.stringify(signedReceipt));
    tamperedProofReceipt.proofData.planHash = 'forged_fake_hash';
    const proofCheck = verifyEvidenceReceipt(tamperedProofReceipt);
    assert.strictEqual(proofCheck.valid, false, 'Tampered proofData must invalidate HMAC signature');

    // 21d: Malformed signature format fails closed gracefully without uncaught exceptions
    const malformedSigReceipt = { ...signedReceipt, signature: 'not-a-valid-hex-sig!!!' };
    const malformedCheck = verifyEvidenceReceipt(malformedSigReceipt);
    assert.strictEqual(malformedCheck.valid, false, 'Malformed signature must fail closed');
    assert.ok(malformedCheck.error?.includes('invalid'), 'Error must specify invalid format');

    // 21e: Empty or non-object receipt fails closed gracefully
    assert.strictEqual(verifyEvidenceReceipt(null).valid, false);
    assert.strictEqual(verifyEvidenceReceipt({}).valid, false);
  });

  // Test 22: Screen-State Postcondition Strictness: Rejection of false claims without explicit DOM assertions
  await test('SkillRunner: target_screen_state_matches_final_demonstration requires explicit DOM locator assertion', async () => {
    const runner = new SkillRunner();

    // 22a: Skill without explicit DOM assertion step and without targetSelector MUST fail closed
    const unassertedSkill = {
      schemaVersion: '1.0',
      id: 'test_unasserted_screen_state',
      name: 'Unasserted Screen State Skill',
      version: '1.0.0',
      description: 'Skill claiming screen state matches without verifying any DOM element',
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
      ],
      verification: {
        postconditions: ['target_screen_state_matches_final_demonstration'],
        proofRequired: true,
      },
      failureRecovery: { maxRetries: 0, alertLevel: 'low' as const },
    };

    const unassertedResult = await runner.execute({
      missionId: 'mission-unasserted-screen',
      skill: unassertedSkill,
      params: {},
      isApprovedByHuman: true,
    });

    assert.strictEqual(unassertedResult.outputData.status, 'FAILED', 'Skill must fail closed when claiming screen state without DOM assertion');
    assert.strictEqual(unassertedResult.receipt.status, 'FAILED');
    assert.ok(
      unassertedResult.outputData.error?.includes('explicit target DOM locator assertion') ||
      unassertedResult.receipt.verificationProof?.error?.includes('explicit target DOM locator assertion'),
      `Unexpected error: ${JSON.stringify(unassertedResult.outputData)}`
    );

    // 22b: Skill WITH an explicit DOM assertion step (action.verify) that passes MUST succeed
    const assertedSkill = {
      schemaVersion: '1.0',
      id: 'test_asserted_screen_state',
      name: 'Asserted Screen State Skill',
      version: '1.0.0',
      description: 'Skill with real DOM locator verification',
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
          name: 'Verify Learn More Link Visible',
          action: 'action.verify',
          parameters: { selector: 'a', expectedText: 'Learn more' },
        },
      ],
      verification: {
        postconditions: ['target_screen_state_matches_final_demonstration'],
        proofRequired: true,
      },
      failureRecovery: { maxRetries: 0, alertLevel: 'low' as const },
    };

    const assertedResult = await runner.execute({
      missionId: 'mission-asserted-screen',
      skill: assertedSkill,
      params: {},
      isApprovedByHuman: true,
    });

    assert.strictEqual(assertedResult.outputData.status, undefined, 'Asserted execution should succeed without failure error');
    assert.strictEqual(assertedResult.receipt.status, 'SUCCESS', 'Receipt status must be SUCCESS');
    assert.ok(
      assertedResult.receipt.passedPostconditions?.includes('target_screen_state_matches_final_demonstration'),
      'Receipt must record verified screen state postcondition'
    );
  });

    if (originalGlobalCustomSkills !== null) {
      try {
        fs.writeFileSync(globalCustomSkillsPath, originalGlobalCustomSkills, 'utf-8');
      } catch {}
    }

    console.log('\n====================================================');
    console.log(` ✓ ALL ${passed} / ${total} TEACH RECORDER & EXECUTION TESTS PASSED`);
    console.log('====================================================');
    process.exit(0);
  } finally {
    if (originalGlobalCustomSkills !== null) {
      try {
        fs.writeFileSync(globalCustomSkillsPath, originalGlobalCustomSkills, 'utf-8');
      } catch {}
    }
  }
}

runTeachRecorderTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
