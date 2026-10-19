import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dashboard = fs.readFileSync(path.join(root, 'src/server/views/DashboardHtml.ts'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'src/server/views/PreviewHtml.ts'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/server/MissionControlServer.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name: string, run: () => void) {
  try {
    run();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

test('Dashboard tab buttons are backed by both client and server route allowlists', () => {
  const tabs = ['home', 'episodes', 'skills', 'activity', 'connections'];
  const validTabs = dashboard.match(/const validTabs = \[([^\]]+)\]/)?.[1] || '';
  const pageRoutes = server.match(/const pageRoutes = \[([^\]]+)\]/)?.[1] || '';
  for (const tab of tabs) {
    assert.match(validTabs, new RegExp(`['"]${tab}['"]`), `missing client tab ${tab}`);
    assert.match(pageRoutes, new RegExp(`['"]/${tab === 'home' ? 'home' : tab}'?['"]`), `missing server page route ${tab}`);
  }
});

test('Every dashboard data-action has a delegated action branch', () => {
  const actions = [...new Set([...dashboard.matchAll(/data-action="([^"]+)"/g)].map(match => match[1]))];
  const handlerStart = dashboard.indexOf('// Delegated Action Handler');
  const handler = dashboard.slice(handlerStart, handlerStart + 1800);
  assert.ok(handlerStart >= 0, 'dashboard delegated action handler not found');
  for (const action of actions) {
    assert.ok(handler.includes(`action === '${action}'`), `data-action "${action}" has no delegated handler`);
  }
});

test('Episode preview close controls are wired and scene cards support mouse and keyboard', () => {
  assert.ok(preview.includes(`querySelectorAll('[data-action="close-release"]')`), 'release modal close controls are not wired');
  assert.match(preview, /role="button"[^>]*class="scene-card-item[^"]*"/s, 'scene cards need button semantics');
  assert.match(preview, /tabindex="0"[^>]*aria-label="Play scene/s, 'scene cards need keyboard focus');
  assert.match(preview, /document\.addEventListener\('keydown'/, 'scene cards need keyboard activation');
  assert.match(preview, /e\.key !== 'Enter' && e\.key !== ' '/, 'scene cards must activate with Enter and Space');
});

test('Cloud CapCut and render jobs are reported as queued, not falsely completed', () => {
  const dashboardCapCut = dashboard.slice(dashboard.indexOf('async function assembleCapCutDraft'), dashboard.indexOf('// Release Room Logic'));
  const previewCapCut = preview.slice(preview.indexOf('async function triggerCapCutDraft'), preview.indexOf('async function openReleaseRoom'));
  const render = preview.slice(preview.indexOf('async function triggerFfmpegRender'), preview.indexOf('async function openReleaseRoom'));
  for (const [name, source] of [['dashboard CapCut', dashboardCapCut], ['preview CapCut', previewCapCut], ['preview render', render]] as const) {
    assert.ok(source.includes('data.queued'), `${name} must distinguish queued jobs`);
    assert.ok(source.includes('!res.ok'), `${name} must handle HTTP error status codes`);
  }
  assert.ok(preview.includes("triggerFfmpegRender(episodeId, 'btnFfmpegFallback')"), 'fallback render must update its own button state');
});

test('Visible dashboard API features have corresponding server route families', () => {
  const expectedRouteFragments = [
    '/api/chat',
    '/api/teach/record/start',
    '/api/teach/record/event',
    '/api/teach/record/stop',
    '/api/teach/record/video',
    '/api/teach/compile',
    '/api/skills/',
    '/api/episodes/',
  ];
  for (const route of expectedRouteFragments) {
    assert.ok(server.includes(route), `server route family not found: ${route}`);
  }
  assert.ok(dashboard.includes("fetch('/api/chat'"), 'chat form has no chat endpoint');
  assert.ok(dashboard.includes("fetch('/api/teach/compile'"), 'skill compile UI has no compile endpoint');
});

test('No dead hash-only links are used as fake navigation', () => {
  assert.equal(/<a\b[^>]*href\s*=\s*['"]#['"]/i.test(dashboard + preview), false, 'found href="#" placeholder link');
});

console.log(`\nUI interaction audit: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
