import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { FEATURE_REGISTRY, getFeature, listFeatures, explainControl } from '../src/config/FeatureRegistry.ts';

console.log('--- TEST: Feature Registry & Self-Explanatory UI Audit ---');

// 1. Scan views for all buttons and interactive controls
const viewFiles = [
  path.resolve('src', 'server', 'views', 'DashboardHtml.ts'),
  path.resolve('src', 'server', 'views', 'PreviewHtml.ts'),
];

const disallowedJargon = ['HMAC', 'Supabase', '2_approval_gate', '3_strict_dual_key', 'Zod', 'Vercel'];

let totalButtonsScanned = 0;
const missingControls: string[] = [];

for (const filePath of viewFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const btnRegex = /<button\b([^>]*)>/gi;
  let m;

  while ((m = btnRegex.exec(content)) !== null) {
    totalButtonsScanned++;
    const attrs = m[1];
    const idMatch = attrs.match(/id="([^"]+)"/i);
    const featureIdMatch = attrs.match(/data-feature-id="([^"]+)"/i);
    const controlId = featureIdMatch ? featureIdMatch[1] : (idMatch ? idMatch[1] : null);

    if (!controlId) {
      missingControls.push(`[${fileName}] Button without ID or data-feature-id: ${attrs.trim().substring(0, 80)}`);
      continue;
    }

    // Dynamic interpolation check (e.g. ${escapeHtml(sc.id)})
    if (controlId.includes('${') || controlId.includes("'+")) {
      continue;
    }

    const feature = getFeature(controlId);
    if (!feature) {
      missingControls.push(`[${fileName}] Interactive button '${controlId}' is not registered in FeatureRegistry.`);
    }
  }
}

console.log(`Scanned ${totalButtonsScanned} buttons across UI views.`);
if (missingControls.length > 0) {
  console.error('FAILED: Unregistered or missing controls found:\n' + missingControls.join('\n'));
  process.exit(1);
}
console.log('✓ 100% of scanned interactive buttons have registered entries in FeatureRegistry.');

// 2. Validate registry entry completeness and plain-language integrity
const allFeatures = listFeatures();
assert(allFeatures.length >= 40, `Expected at least 40 registered features, found ${allFeatures.length}`);

for (const feat of allFeatures) {
  assert(feat.id && feat.id.trim().length > 0, `Feature missing id: ${JSON.stringify(feat)}`);
  assert(feat.label && feat.label.trim().length > 0, `Feature ${feat.id} missing label`);
  assert(feat.purpose && feat.purpose.trim().length > 10, `Feature ${feat.id} has insufficient purpose description`);
  assert(feat.outcome && feat.outcome.trim().length > 10, `Feature ${feat.id} has insufficient outcome description`);
  assert(feat.sideEffects && feat.sideEffects.trim().length > 3, `Feature ${feat.id} has insufficient sideEffects description`);
  assert(feat.failureGuidance && feat.failureGuidance.trim().length > 10, `Feature ${feat.id} has insufficient failureGuidance`);

  // Jargon check in user-facing fields
  const userFacingText = `${feat.label} ${feat.purpose} ${feat.outcome} ${feat.sideEffects} ${feat.failureGuidance}`;
  for (const jargon of disallowedJargon) {
    assert(!userFacingText.includes(jargon), `Feature ${feat.id} contains developer jargon '${jargon}'. Use plain creator language instead.`);
  }
}
console.log(`✓ All ${allFeatures.length} features pass completeness and plain creator language checks (no developer jargon).`);

// 3. Test "What does this do?" natural language assistant explanation
const sampleQueries = [
  'What does Assemble CapCut Timeline Draft do?',
  'What does btnStartCapture do?',
  'Explain Release Room',
  'Help with YouTube',
  'What is nav-episodes?',
];

for (const q of sampleQueries) {
  const explanation = explainControl(q);
  assert(explanation !== null, `Failed to explain query: "${q}"`);
  assert(explanation.includes('<strong>Purpose:</strong>'), `Explanation for "${q}" missing Purpose section`);
  assert(explanation.includes('<strong>Immediate Outcome:</strong>'), `Explanation for "${q}" missing Outcome section`);
  assert(explanation.includes('<strong>If Something Goes Wrong:</strong>'), `Explanation for "${q}" missing Guidance section`);
}
console.log('✓ AI Assistant "What does this do?" natural language integration verified for all sample queries.');

console.log('=== FEATURE REGISTRY AUDIT: PASSED ===');
