import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { AuthManager } from '../src/auth/AuthManager.ts';

console.log('====================================================');
console.log('    LAMS HQ: AUTOMATED UI DEMO CLIP GENERATOR       ');
console.log('====================================================\n');

async function generateDemos() {
  const demosDir = path.resolve('output', 'demo_videos');
  if (!fs.existsSync(demosDir)) fs.mkdirSync(demosDir, { recursive: true });

  const authManager = AuthManager.getInstance();
  const { sessionToken, csrfToken } = authManager.createSessionToken('demo_creator', 'admin');

  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: 'msedge',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
  } catch {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
  }

  const baseUrl = 'http://localhost:4200';

  const setupContext = async () => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: demosDir, size: { width: 1280, height: 720 } },
    });
    await ctx.addCookies([
      {
        name: 'lams_session',
        value: sessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ]);
    return ctx;
  };

  // 1. CapCut Assembly Demo
  console.log('[1/4] Generating CapCut Assembly Demo...');
  const capcutCtx = await setupContext();
  const capcutPage = await capcutCtx.newPage();
  await capcutPage.goto(baseUrl);
  await capcutPage.waitForSelector('[data-action="assemble-capcut"]');
  await capcutPage.locator('[data-action="assemble-capcut"]').first().hover();
  await capcutPage.waitForTimeout(600);
  await capcutPage.locator('[data-action="assemble-capcut"]').first().click();
  
  await capcutPage.waitForSelector('#studioResultModal:not(.hidden)', { timeout: 15000 });
  await capcutPage.waitForTimeout(1200);
  await capcutPage.click('#btnCloseResultModal');
  await capcutPage.waitForTimeout(500);
  const capcutVideoPath = await capcutPage.video()?.path();
  await capcutCtx.close();
  if (capcutVideoPath && fs.existsSync(capcutVideoPath)) {
    const dest = path.join(demosDir, 'capcut_assembly_demo.webm');
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.renameSync(capcutVideoPath, dest);
    console.log(`  ✓ Saved: ${dest} (${Math.round(fs.statSync(dest).size / 1024)} KB)`);
  }

  // 2. Release Room Scheduling Demo
  console.log('\n[2/4] Generating Release Room Scheduling Demo...');
  const releaseCtx = await setupContext();
  const releasePage = await releaseCtx.newPage();
  await releasePage.goto(baseUrl);
  await releasePage.waitForSelector('[data-action="open-release"]');
  await releasePage.locator('[data-action="open-release"]').first().hover();
  await releasePage.waitForTimeout(600);
  await releasePage.locator('[data-action="open-release"]').first().click();
  await releasePage.waitForSelector('#releaseRoomModal:not(.hidden)');
  await releasePage.waitForTimeout(800);
  await releasePage.fill('#releaseDate', '2026-11-01');
  await releasePage.fill('#releaseTime', '18:30');
  await releasePage.waitForTimeout(1000);
  await releasePage.click('#btnCloseReleaseX');
  await releasePage.waitForTimeout(400);
  const releaseVideoPath = await releasePage.video()?.path();
  await releaseCtx.close();
  if (releaseVideoPath && fs.existsSync(releaseVideoPath)) {
    const dest = path.join(demosDir, 'release_room_demo.webm');
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.renameSync(releaseVideoPath, dest);
    console.log(`  ✓ Saved: ${dest} (${Math.round(fs.statSync(dest).size / 1024)} KB)`);
  }

  // 3. Teach Mode Demonstration Recorder Demo
  console.log('\n[3/4] Generating Teach Mode Recorder Demo...');
  const teachCtx = await setupContext();
  const teachPage = await teachCtx.newPage();
  await teachPage.goto(`${baseUrl}/skills`);
  await teachPage.waitForSelector('#view-skills:not(.hidden)');
  await teachPage.waitForSelector('[data-preset="youtube-shorts"]');
  await teachPage.hover('[data-preset="youtube-shorts"]');
  await teachPage.waitForTimeout(600);
  await teachPage.click('[data-preset="youtube-shorts"]');
  await teachPage.waitForTimeout(1000);
  await teachPage.click('#palBtnClick');
  await teachPage.waitForTimeout(500);
  await teachPage.click('#palBtnKeyboard');
  await teachPage.waitForTimeout(500);
  await teachPage.click('#palBtnAssert');
  await teachPage.waitForTimeout(1500);
  const teachVideoPath = await teachPage.video()?.path();
  await teachCtx.close();
  if (teachVideoPath && fs.existsSync(teachVideoPath)) {
    const dest = path.join(demosDir, 'teach_mode_demo.webm');
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.renameSync(teachVideoPath, dest);
    console.log(`  ✓ Saved: ${dest} (${Math.round(fs.statSync(dest).size / 1024)} KB)`);
  }

  // 4. Creator Assistant Chat & Skill Run Demo
  console.log('\n[4/4] Generating Creator Assistant Execution Demo...');
  const chatCtx = await setupContext();
  const chatPage = await chatCtx.newPage();
  await chatPage.goto(baseUrl);
  await chatPage.waitForSelector('#chatInput');
  await chatPage.fill('#chatInput', 'What does Assemble CapCut Timeline Draft do?');
  await chatPage.waitForTimeout(600);
  await chatPage.click('#btnSendChat');
  await chatPage.waitForTimeout(2000);
  await chatPage.fill('#chatInput', 'Run my CapCut assembly skill for The Necklace Awakens');
  await chatPage.waitForTimeout(600);
  await chatPage.click('#btnSendChat');
  await chatPage.waitForTimeout(3000);
  const chatVideoPath = await chatPage.video()?.path();
  await chatCtx.close();
  if (chatVideoPath && fs.existsSync(chatVideoPath)) {
    const dest = path.join(demosDir, 'assistant_chat_demo.webm');
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.renameSync(chatVideoPath, dest);
    console.log(`  ✓ Saved: ${dest} (${Math.round(fs.statSync(dest).size / 1024)} KB)`);
  }

  await browser.close();
  console.log('\n====================================================');
  console.log('✓ All 4 UI Demo Videos Generated Successfully!');
  console.log('====================================================');
}

generateDemos().catch(err => {
  console.error('Failed to generate demos:', err);
  process.exit(1);
});
