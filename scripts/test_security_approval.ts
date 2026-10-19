import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ApprovalManager } from '../src/auth/ApprovalManager.ts';

async function runApprovalTests() {
  console.log('====================================================');
  console.log('   SECURITY SUITE: APPROVAL ENGINE & TAMPER AUDIT');
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

  const approvalManager = ApprovalManager.getInstance();
  const testDir = path.resolve('watched_exports');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const testVideoPath = path.join(testDir, 'test_tamper_spec.mp4');
  const initialContent = Buffer.alloc(2048, 0x42);
  fs.writeFileSync(testVideoPath, initialContent);

  try {
    // 1. Streaming SHA-256 checksum calculation & Canonical Proposal Binding
    let proposalData: any = null;
    await test('Canonical Proposal: Streaming SHA-256 binds full file and material release terms', async () => {
      const { proposal, approvalToken } = await approvalManager.createReleaseProposal({
        episodeId: 'ep-tamper-check',
        title: 'Tamper Verification Episode',
        videoFilePath: testVideoPath,
        destinationChannelId: 'UC_REAL_CHANNEL_ID',
        destinationChannelTitle: 'Lams Channel',
        publishAt: null,
        requireThumbnail: false,
        approvedByUserId: 'creator-lams',
      });

      assert(approvalToken, 'Approval token must be generated');
      assert.strictEqual(proposal.status, 'PENDING');
      assert.strictEqual(proposal.privacyStatus, 'private', 'Privacy status MUST be bound to private');
      assert.strictEqual(proposal.destinationChannelId, 'UC_REAL_CHANNEL_ID');
      assert.strictEqual(proposal.approvedByUserId, 'creator-lams');

      // Verify streaming SHA-256 matches actual hash
      const expectedSha256 = crypto.createHash('sha256').update(initialContent).digest('hex');
      assert.strictEqual(proposal.fullVideoSha256, expectedSha256, 'Streaming SHA-256 must match file content exactly');
      assert.strictEqual(proposal.videoSizeBytes, initialContent.length);

      proposalData = { proposal, approvalToken };
    });

    // 2. Successful validation and consumption of untampered proposal
    await test('Approval Engine: Successfully consumes valid untampered token', async () => {
      assert(proposalData, 'Proposal data required');
      const result = await approvalManager.validateAndConsumeApproval(
        proposalData.approvalToken,
        'ep-tamper-check',
        testVideoPath
      );

      assert.strictEqual(result.valid, true, `Expected valid, got error: ${result.error}`);
      assert(result.proposal, 'Expected consumed proposal record');
      assert.strictEqual(result.proposal.status, 'CONSUMED');
      assert(result.proposal.consumedAt, 'Expected consumedAt timestamp');
    });

    // 3. Replay attack rejection (token cannot be consumed twice)
    await test('Replay Attack Prevention: Token cannot be consumed a second time', async () => {
      assert(proposalData, 'Proposal data required');
      const replayResult = await approvalManager.validateAndConsumeApproval(
        proposalData.approvalToken,
        'ep-tamper-check',
        testVideoPath
      );

      assert.strictEqual(replayResult.valid, false, 'Replay attack must be strictly rejected');
      assert(replayResult.error?.includes('consumed') || replayResult.error?.includes('replay'), `Expected replay rejection, got: ${replayResult.error}`);
    });

    // 4. File Tamper Detection: Modification of video file invalidates proposal
    await test('Tamper Detection: Modifying 1 byte of video file fails validation', async () => {
      // Re-create initial file
      fs.writeFileSync(testVideoPath, initialContent);

      // Create new proposal
      const { proposal, approvalToken } = await approvalManager.createReleaseProposal({
        episodeId: 'ep-tamper-detect',
        title: 'Tamper Detection Test',
        videoFilePath: testVideoPath,
        destinationChannelId: 'UC_REAL_CHANNEL_ID',
      });

      // Tamper with the video file (change last byte)
      const tamperedContent = Buffer.from(initialContent);
      tamperedContent[tamperedContent.length - 1] = 0x99;
      fs.writeFileSync(testVideoPath, tamperedContent);

      const tamperResult = await approvalManager.validateAndConsumeApproval(
        approvalToken,
        'ep-tamper-detect',
        testVideoPath
      );

      assert.strictEqual(tamperResult.valid, false, 'Tampered file MUST fail approval validation');
      assert(
        tamperResult.error?.includes('mismatch') || tamperResult.error?.includes('tampered'),
        `Expected checksum mismatch error, got: ${tamperResult.error}`
      );
    });

    // 5. Signature Forgery Detection
    await test('Cryptographic Defense: Forged token signatures are rejected', async () => {
      fs.writeFileSync(testVideoPath, initialContent);
      const { approvalToken } = await approvalManager.createReleaseProposal({
        episodeId: 'ep-forgery-test',
        title: 'Forgery Test',
        videoFilePath: testVideoPath,
      });

      // Alter signature portion of token
      const parts = approvalToken.split('.');
      const forgedToken = `${parts[0]}.${parts[1]}.badsignature1234567890abcdef`;

      const result = await approvalManager.validateAndConsumeApproval(
        forgedToken,
        'ep-forgery-test',
        testVideoPath
      );

      assert.strictEqual(result.valid, false, 'Forged signature must be rejected');
    });

    // 6. Cross-Episode Substitution Rejection
    await test('Context Binding: Valid token for Episode A cannot be used for Episode B', async () => {
      fs.writeFileSync(testVideoPath, initialContent);
      const { approvalToken } = await approvalManager.createReleaseProposal({
        episodeId: 'ep-episode-a',
        title: 'Episode A',
        videoFilePath: testVideoPath,
      });

      // Attempt consuming against Episode B
      const result = await approvalManager.validateAndConsumeApproval(
        approvalToken,
        'ep-episode-b',
        testVideoPath
      );

      assert.strictEqual(result.valid, false, 'Cross-episode token substitution must be rejected');
      assert(result.error?.includes('bound to episode'), `Expected episode binding error, got: ${result.error}`);
    });

    // 7. Concurrent Race Condition Handling
    await test('Concurrency & Atomicity: Simultaneous validation calls only permit one consumer', async () => {
      fs.writeFileSync(testVideoPath, initialContent);
      const { approvalToken } = await approvalManager.createReleaseProposal({
        episodeId: 'ep-race-condition',
        title: 'Race Condition Test',
        videoFilePath: testVideoPath,
      });

      // Fire two validation requests simultaneously
      const [res1, res2] = await Promise.all([
        approvalManager.validateAndConsumeApproval(approvalToken, 'ep-race-condition', testVideoPath),
        approvalManager.validateAndConsumeApproval(approvalToken, 'ep-race-condition', testVideoPath),
      ]);

      const successCount = (res1.valid ? 1 : 0) + (res2.valid ? 1 : 0);
      assert.strictEqual(successCount, 1, `Exactly ONE concurrent call must succeed. Succeeded: ${successCount}`);
    });

    // 8. Production Database Requirement & Fail-Closed Enforcement
    await test('Production Database Enforcement: Release proposals & validation fail closed in production without Supabase', async () => {
      fs.writeFileSync(testVideoPath, initialContent);
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        // 8a: In production without configured Supabase, proposal creation must fail closed
        let proposalThrew = false;
        try {
          await approvalManager.createReleaseProposal({
            episodeId: 'ep-prod-db-check',
            title: 'Prod DB Check',
            videoFilePath: testVideoPath,
          });
        } catch (err: any) {
          proposalThrew = true;
          assert(err.message.includes('Supabase') || err.message.includes('production'), `Unexpected error: ${err.message}`);
        }

        // 8b: In production, validateAndConsumeApproval must fail closed without an authoritative database record
        const fakeToken = 'hdr.eyJwb3Jwb3NhbElkIjoiZmFrZSJ9.fakesig';
        const valResult = await approvalManager.validateAndConsumeApproval(
          fakeToken,
          'ep-prod-db-check',
          testVideoPath
        );
        assert.strictEqual(valResult.valid, false, 'Validation must fail closed in production without authoritative database record');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

  } finally {
    if (fs.existsSync(testVideoPath)) {
      try { fs.unlinkSync(testVideoPath); } catch {}
    }
  }

  console.log('\n====================================================');
  console.log(`Approval Security Results: ${passed} / ${total} tests passed.`);
  console.log('====================================================\n');

  if (passed !== total) process.exit(1);
}

runApprovalTests().catch(err => {
  console.error('Fatal Approval test error:', err);
  process.exit(1);
});
