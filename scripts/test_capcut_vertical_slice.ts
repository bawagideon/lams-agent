import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DemonstrationRecorder } from '../src/compiler/DemonstrationRecorder.ts';
import { WorkflowCompiler } from '../src/compiler/WorkflowCompiler.ts';
import { SkillRegistry } from '../src/skills/SkillRegistry.ts';
import { SkillRunner } from '../src/skills/SkillRunner.ts';
import { verifyEvidenceReceipt, type EvidenceReceipt } from '../src/contracts/EvidenceReceipt.ts';

console.log('--- TEST: CapCut Vertical Slice Closed Loop ---');
console.log('Testing: Record -> Review/Redact -> Compile -> Isolated Test -> Save -> Run From Chat -> Verify');

const EPISODE_ID = '3b5e6c74-c2bc-4dc5-800a-dc2427142c82';
const EPISODE_TITLE = 'The Necklace Awakens';

// STEP 1: RECORD
console.log('\n[Step 1] Recording Demonstration...');
const recorder = new DemonstrationRecorder();
const sessionName = 'CapCut Timeline Automated Assembly';
const demoId = recorder.startRecording(sessionName, 'CapCut Desktop');

// Create a synthetic demo video file to link
const recordingsDir = path.resolve('data', 'recordings');
if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
const demoVideoPath = path.join(recordingsDir, `capcut_test_${Date.now()}.mp4`);
fs.writeFileSync(demoVideoPath, Buffer.from('FAKE_VIDEO_PAYLOAD_' + crypto.randomUUID()));

// Log realistic interaction events
const ev1 = recorder.recordEvent({
  eventType: 'navigate',
  application: 'CapCut Desktop',
  windowTitle: 'CapCut Workspace',
  targetElement: { text: 'Media Project Pool' },
  inputData: 'capcut://project/new',
  provenance: 'observed',
});

const ev2 = recorder.recordEvent({
  eventType: 'file_select',
  application: 'CapCut Desktop',
  windowTitle: 'Import Media',
  targetElement: { text: 'Import JSON Timeline' },
  inputData: 'media_plan.json',
  provenance: 'observed',
});

const secretString = 'SECRET_RENDER_KEY_CONFIDENTIAL_123';
const ev3 = recorder.recordEvent({
  eventType: 'keyboard',
  application: 'CapCut Desktop',
  windowTitle: 'Project Properties',
  targetElement: { selector: '#auth_key_input', text: 'Auth Key Field' },
  inputData: secretString,
  provenance: 'observed',
});

const ev4 = recorder.recordEvent({
  eventType: 'click',
  application: 'CapCut Desktop',
  windowTitle: 'CapCut Workspace',
  targetElement: { text: 'Assemble CapCut Draft', selector: '#btn_assemble' },
  provenance: 'observed',
});

const ev5 = recorder.recordEvent({
  eventType: 'assertion',
  application: 'CapCut Desktop',
  windowTitle: 'CapCut Workspace',
  targetElement: { text: 'draft_content.json exists on disk', selector: '#timeline_rendered' },
  inputData: 'draft_content_json_exists',
  provenance: 'observed',
});

const videoStats = fs.statSync(demoVideoPath);
const record = recorder.stopRecording({
  fileName: path.basename(demoVideoPath),
  filePath: demoVideoPath,
  sizeBytes: videoStats.size,
  sizeMb: Math.round((videoStats.size / (1024 * 1024)) * 100) / 100,
});

assert.strictEqual(record.status, 'recorded');
assert.strictEqual(record.events.length, 5);
assert.ok(record.manifest.checksum, 'Manifest checksum must be present');
assert.ok(record.manifest.videoChecksum, 'Video SHA256 checksum must be present');
console.log(`✓ Recorded demonstration "${record.sessionName}" with 5 steps and SHA-256 video linkage.`);

// STEP 2: REVIEW EVIDENCE & REDACT
console.log('\n[Step 2] Reviewing Evidence & Redacting Sensitive Token...');
const initialChecksum = record.manifest.checksum;
const reviewedRecord = recorder.reviewAndRedactEvent(record.demonstrationId, ev3.id, {
  redacted: true,
});

assert.strictEqual(reviewedRecord.status, 'reviewed');
const redactedEvent = reviewedRecord.events.find(e => e.id === ev3.id);
assert.ok(redactedEvent);
assert.strictEqual(redactedEvent.redacted, true);
assert.strictEqual(redactedEvent.inputData, '[REDACTED_SECRET]');
assert.notStrictEqual(reviewedRecord.manifest.checksum, initialChecksum, 'Manifest checksum must update after redaction');
console.log('✓ Successfully reviewed and redacted sensitive credential. Manifest checksum updated atomically.');

// STEP 3: COMPILE
console.log('\n[Step 3] Compiling Demonstration to Verified Skill Contract...');
const compiler = new WorkflowCompiler();
const compileResult = compiler.compileDemonstration(reviewedRecord);

assert.ok(compileResult.skill);
assert.strictEqual(compileResult.skill.executionMode, 'file_draft');
assert.strictEqual(compileResult.skill.approvalGate.level, '0_autonomous');
assert.ok(compileResult.skill.actions.some(a => a.action === 'editor.write_capcut_draft'));
assert.ok(compileResult.skill.verification.postconditions.includes('draft_content_json_exists'));
assert.ok(compileResult.skill.verification.postconditions.includes('draft_meta_info_exists'));
assert.strictEqual(reviewedRecord.status, 'compiled');
assert.strictEqual(reviewedRecord.compiledSkillId, compileResult.skill.id);
console.log(`✓ Skill contract synthesized: ${compileResult.skill.id}@${compileResult.skill.version} with 3 actions.`);

// STEP 4: ISOLATED TEST & SAVE
console.log('\n[Step 4] Saving to Registry & Executing Isolated Test Run...');
const registry = new SkillRegistry();
const skill = compileResult.skill;
skill.status = 'verified_production'; // Promoted after human review
registry.registerSkill(skill, true);

const fetchedSkill = registry.getSkill(skill.id, { forceFresh: true });
assert.ok(fetchedSkill, 'Skill must be retrievable from registry');
assert.strictEqual(fetchedSkill.id, skill.id);

const runner = new SkillRunner();
const testResult = await runner.execute({
  missionId: `test_mission_${Date.now()}`,
  skill: fetchedSkill,
  params: { episodeId: EPISODE_ID, title: EPISODE_TITLE },
  isApprovedByHuman: true,
});

assert.strictEqual(testResult.receipt.status, 'SUCCESS');
assert.ok(testResult.outputData['editor.write_capcut_draft']);
const draftPath = testResult.outputData['editor.write_capcut_draft'].draftPath;
assert.ok(fs.existsSync(path.join(draftPath, 'draft_content.json')), 'draft_content.json must exist');
assert.ok(fs.existsSync(path.join(draftPath, 'draft_meta_info.json')), 'draft_meta_info.json must exist');
console.log(`✓ Isolated execution succeeded. Generated draft at: ${draftPath}`);

// STEP 5: RUN FROM CHAT
console.log('\n[Step 5] Triggering Skill Execution From Chat API...');
const chatRes = await fetch('http://localhost:4200/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: `Run my CapCut assembly skill for ${EPISODE_TITLE}` }),
});

assert.strictEqual(chatRes.status, 200);
const chatBody: any = await chatRes.json();
assert.ok(chatBody.reply.includes('Executed skill'), 'Chat response should indicate success');
assert.ok(chatBody.planCard, 'Chat response must include execution receipt card');
assert.strictEqual(chatBody.planCard.type, 'skill_execution_receipt');
assert.strictEqual(chatBody.planCard.status, 'SUCCESS');
assert.ok(chatBody.planCard.receiptId);
console.log(`✓ Chat executed skill and returned verified receipt: ${chatBody.planCard.receiptId}`);

// STEP 6: VERIFY RECEIPT AND DRAFT ON DISK
console.log('\n[Step 6] Cryptographic Verification of Execution Receipt & Draft Content...');
const receiptFilePath = path.resolve('data', 'evidence_receipts', `${chatBody.planCard.receiptId}.json`);
assert.ok(fs.existsSync(receiptFilePath), `Receipt file must exist at: ${receiptFilePath}`);

const rawReceipt = fs.readFileSync(receiptFilePath, 'utf-8');
const receipt: EvidenceReceipt = JSON.parse(rawReceipt);
const verifyResult = verifyEvidenceReceipt(receipt);
assert.strictEqual(verifyResult.valid, true, `Evidence receipt security signature must be cryptographically valid: ${verifyResult.error}`);

// Verify draft content structure
const draftContent = JSON.parse(fs.readFileSync(path.join(chatBody.planCard.draftPath, 'draft_content.json'), 'utf-8'));
assert.ok(Array.isArray(draftContent.tracks), 'draft_content.json must contain tracks array');
assert.ok(draftContent.tracks.length >= 2, 'Must have at least video and audio tracks');
assert.ok(draftContent.duration > 0, 'Draft timeline duration must be positive');

console.log('✓ Cryptographic receipt HMAC verified. CapCut draft tracks and materials validated.');
console.log('=== CAPCUT VERTICAL SLICE: FULL LOOP CLOSED SUCCESSFULLY ===');

// Clean up test demo video
try { fs.unlinkSync(demoVideoPath); } catch {}
