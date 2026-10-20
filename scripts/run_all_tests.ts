import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { PlaywrightBrowserAdapter } from '../src/adapters/browser/PlaywrightBrowserAdapter.ts';

interface SuiteResult {
  file: string;
  name: string;
  durationMs: number;
  exitCode: number;
  passed: boolean;
  output: string;
}

async function runAllTests() {
  console.log('================================================================');
  console.log('       LAMS HQ: COMPREHENSIVE AUTOMATED VERIFICATION SUITE       ');
  console.log('================================================================\n');

  const startTime = Date.now();

  // Environment and Git Context
  const gitCommit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() || 'unknown';
  const gitBranch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() || 'main';
  const gitStatus = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf-8' }).stdout?.trim() || '';
  const isWorkingTreeClean = gitStatus.length === 0;
  const enforceClean = process.argv.includes('--enforce-clean') || process.env.ENFORCE_CLEAN_TREE === 'true';

  if (enforceClean && !isWorkingTreeClean) {
    console.error(`\n❌ PRE-RUN CHECK FAILED: Working tree has uncommitted modifications (--enforce-clean active):\n${gitStatus}`);
    process.exit(1);
  }

  const nodeVersion = process.version;
  const platform = `${process.platform} (${process.arch})`;
  const browserCheck = await PlaywrightBrowserAdapter.checkBrowserPrerequisites();

  console.log('System Diagnostic Context:');
  console.log(` • Node Version:     ${nodeVersion}`);
  console.log(` • Platform / Arch:  ${platform}`);
  console.log(` • Git Commit:       ${gitCommit.substring(0, 8)} (${gitBranch})`);
  console.log(` • Working Tree:     ${isWorkingTreeClean ? 'Clean (0 uncommitted changes)' : `DIRTY (${gitStatus.split('\n').length} uncommitted entries)`}`);
  console.log(` • Enforce Clean:    ${enforceClean ? 'YES (Active)' : 'NO'}`);
  console.log(` • Browser Engine:   ${browserCheck.ready ? `${browserCheck.channel} (Ready)` : `FAILED: ${browserCheck.error}`}`);
  console.log('----------------------------------------------------------------\n');

  const testSuites = [
    { file: 'scripts/test_security_ssrf.ts', name: 'SSRF & Redirect Rebinding Audit' },
    { file: 'scripts/test_security_auth.ts', name: 'Authentication & Authorization Audit' },
    { file: 'scripts/test_security_approval.ts', name: 'Approval Engine & Cryptographic Tamper Audit' },
    { file: 'scripts/test_publishing_failure_modes.ts', name: 'Publishing Failure Modes & Release Semantics' },
    { file: 'scripts/test_hardened_release.ts', name: 'Hardened Architecture & Live Release Audit' },
    { file: 'scripts/test_teach_recorder.ts', name: 'Demonstration Recorder, 3-Phase Lifecycle & Browser Exec' },
    { file: 'scripts/test_feature_registry.ts', name: 'Feature Registry, UI Controls & Creator Language Compliance' },
    { file: 'scripts/test_capcut_vertical_slice.ts', name: 'CapCut Vertical Slice Closed Loop (Record -> Review -> Compile -> Test -> Chat -> Verify)' },
    { file: 'scripts/test_ui_interactions.ts', name: 'UI Interaction Truthfulness & Navigation Audit' },
    { file: 'scripts/test_browser_e2e.ts', name: 'Browser-Driven End-to-End User Journeys (Playwright)' },
  ];

  const results: SuiteResult[] = [];

  for (const suite of testSuites) {
    console.log(`>>> Executing Suite: ${suite.name} (${suite.file})...`);
    const suiteStart = Date.now();

    const proc = spawnSync('node', ['--experimental-strip-types', suite.file], {
      cwd: path.resolve('.'),
      encoding: 'utf-8',
      env: { ...process.env },
    });

    const durationMs = Date.now() - suiteStart;
    const passed = proc.status === 0;

    results.push({
      file: suite.file,
      name: suite.name,
      durationMs,
      exitCode: proc.status ?? -1,
      passed,
      output: proc.stdout + (proc.stderr ? `\nSTDERR:\n${proc.stderr}` : ''),
    });

    if (passed) {
      console.log(`    ✅ Suite PASSED in ${durationMs}ms\n`);
    } else {
      console.error(`    ❌ Suite FAILED with exit code ${proc.status} in ${durationMs}ms\n`);
      console.error(proc.stdout);
      if (proc.stderr) console.error(proc.stderr);
    }
  }

  const totalDuration = Date.now() - startTime;
  const allPassed = results.every(r => r.passed);

  console.log('================================================================');
  console.log('                   AUTOMATION AUDIT SUMMARY RECEIPT             ');
  console.log('================================================================');
  console.log(`Status:           ${allPassed ? '✓ ALL SUITES PASSED (100%)' : '❌ ONE OR MORE SUITES FAILED'}`);
  console.log(`Total Runtime:    ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Commit Hash:      ${gitCommit}`);
  const postGitStatus = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf-8' }).stdout?.trim() || '';
  const isPostTreeClean = postGitStatus.length === 0;

  console.log(`Working Tree In:  ${isWorkingTreeClean ? '✓ Clean' : '⚠ Dirty (Uncommitted changes)'}`);
  console.log(`Working Tree Out: ${isPostTreeClean ? '✓ Clean' : '⚠ Dirty (Uncommitted changes or test residue)'}`);
  console.log('----------------------------------------------------------------');

  results.forEach((r, idx) => {
    const icon = r.passed ? '✓' : '✗';
    console.log(` [${idx + 1}] ${icon} ${r.name.padEnd(52)} ${r.durationMs}ms (exit ${r.exitCode})`);
  });
  console.log('================================================================\n');

  // Persist machine-verifiable audit summary receipt bound to exact git commit SHA & diagnostics
  const auditReceipt = {
    receiptId: `audit_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    gitCommit,
    gitBranch,
    isWorkingTreeClean,
    isPostTreeClean,
    environment: {
      nodeVersion,
      platform,
      browserEngine: browserCheck.ready ? browserCheck.channel : `FAILED: ${browserCheck.error}`,
    },
    totalDurationMs: totalDuration,
    allPassed,
    suites: results.map(r => ({
      name: r.name,
      file: r.file,
      passed: r.passed,
      exitCode: r.exitCode,
      durationMs: r.durationMs,
    })),
    sha256: crypto.createHash('sha256').update(JSON.stringify({
      gitCommit,
      allPassed,
      suites: results.map(r => ({ name: r.name, exitCode: r.exitCode })),
    })).digest('hex'),
  };

  const receiptPath = path.resolve('data', 'audit_summary_receipt.json');
  try {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, JSON.stringify(auditReceipt, null, 2), 'utf-8');
    console.log(`✓ Audit summary receipt persisted: ${receiptPath}\n`);
  } catch (err: any) {
    console.warn(`⚠ Warning: Could not persist audit summary receipt: ${err.message}`);
  }

  if (!allPassed) {
    process.exit(1);
  }

  if (enforceClean && !isPostTreeClean) {
    console.error(`\n❌ POST-RUN CHECK FAILED: Test execution left uncommitted artifacts or dirty files in working tree:\n${postGitStatus}`);
    process.exit(1);
  }

  process.exit(0);
}

runAllTests().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
