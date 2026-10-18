import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DemonstrationRecorder, type ObservedEvent } from '../src/compiler/DemonstrationRecorder.ts';
import { WorkflowCompiler } from '../src/compiler/WorkflowCompiler.ts';
import { SkillRegistry } from '../src/skills/SkillRegistry.ts';
import { SkillRunner } from '../src/skills/SkillRunner.ts';

async function runTeachRecorderTests() {
  console.log('====================================================');
  console.log('       TEST SUITE: DEMONSTRATION & SKILL RECORDER   ');
  console.log('====================================================');

  const recorder = new DemonstrationRecorder();
  const compiler = new WorkflowCompiler();

  // Test 1: Start session
  console.log('[Test 1] DemonstrationRecorder initializes and starts session...');
  recorder.startRecording('Schedule TikTok Short');
  let status = recorder.getStatus();
  assert.strictEqual(status.isRecording, true, 'Recorder should be recording');
  assert.strictEqual(status.sessionName, 'Schedule TikTok Short');
  assert.strictEqual(status.totalEvents, 0);
  console.log('  ✓ Session started cleanly');

  // Test 2: Record diverse actions
  console.log('[Test 2] Record click, keyboard, navigate, file_select, and assertion events...');
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

  status = recorder.getStatus();
  assert.strictEqual(status.totalEvents, 6, 'Should have 6 recorded events');
  console.log('  ✓ 6 events captured in memory');

  // Test 3: Stop session and verify persistence
  console.log('[Test 3] Stop session and verify session JSON on disk...');
  const stopResult = recorder.stopRecording();
  assert.strictEqual(stopResult.totalEvents, 6);
  assert.strictEqual(stopResult.sessionName, 'Schedule TikTok Short');
  assert.ok(stopResult.savedFilePath && fs.existsSync(stopResult.savedFilePath), 'Session file must be saved on disk');

  const fileContent = JSON.parse(fs.readFileSync(stopResult.savedFilePath!, 'utf-8'));
  assert.strictEqual(fileContent.sessionName, 'Schedule TikTok Short');
  assert.strictEqual(fileContent.events.length, 6);
  console.log(`  ✓ Session JSON successfully saved to: ${stopResult.savedFilePath}`);

  // Test 4: Compile into SkillContract
  console.log('[Test 4] WorkflowCompiler compiles observed events into portable SkillContract...');
  const compilation = compiler.compile('Schedule TikTok Short', stopResult.events);
  assert.strictEqual(compilation.abstractedStepsCount, 6);
  assert.strictEqual(compilation.suggestedGateLevel, '2_approval_gate', 'Publishing action requires approval gate');
  assert.strictEqual(compilation.skill.id, 'schedule_tiktok_short');
  assert.strictEqual(compilation.skill.executionMode, 'browser_agent');
  assert.strictEqual(compilation.skill.actions.length, 6);

  // Validate step actions mapping
  assert.strictEqual(compilation.skill.actions[0].action, 'browser.navigate');
  assert.strictEqual(compilation.skill.actions[1].action, 'ui.click');
  assert.strictEqual(compilation.skill.actions[2].action, 'file.select');
  assert.strictEqual(compilation.skill.actions[3].action, 'form.fill_text');
  assert.strictEqual(compilation.skill.actions[4].action, 'ui.click');
  assert.strictEqual(compilation.skill.actions[5].action, 'action.verify');
  console.log('  ✓ Correct action mapping verified for all 6 steps');

  // Test 5: Register and Execute synthesized skill with SkillRunner
  console.log('[Test 5] Execute synthesized skill via SkillRunner and verify execution receipt...');
  const registry = new SkillRegistry();
  registry.registerSkill(compilation.skill, true);

  const registered = registry.getSkill('schedule_tiktok_short');
  assert.ok(registered, 'Synthesized skill must be retrievable from registry');

  const runner = new SkillRunner();

  const execResult = await runner.execute({
    missionId: 'test-mission-recorder-001',
    skill: registered,
    params: {
      input_file_3: 'watched_exports/master_ep1.mp4',
      text_field_4: 'Check out today episode! #lams #viral',
    },
    isApprovedByHuman: true,
  });

  assert.strictEqual(execResult.receipt.status, 'SUCCESS', 'Skill execution must return SUCCESS');
  assert.strictEqual(execResult.receipt.steps.length, 6, 'All 6 steps must have evidence');
  for (const stepEv of execResult.receipt.steps) {
    assert.strictEqual(stepEv.status, 'PASS', `Step ${stepEv.step} must PASS`);
  }
  assert.ok(execResult.receipt.signature, 'Execution receipt must have a cryptographic verification signature');
  console.log(`  ✓ All 6 synthesized steps executed PASS with receipt signature: ${execResult.receipt.signature.substring(0, 16)}...`);

  console.log('====================================================');
  console.log(' ✓ ALL 5/5 TEACH & DEMONSTRATION RECORDER TESTS PASSED');
  console.log('====================================================');
  process.exit(0);
}

runTeachRecorderTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
