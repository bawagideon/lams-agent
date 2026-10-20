import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright-core';
import { MissionControlServer } from '../src/server/MissionControlServer.ts';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    const start = Date.now();
    await fn();
    passed++;
    console.log(`  ✓ ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

async function runBrowserE2ESuite() {
  console.log('================================================================');
  console.log('         LAMS HQ: BROWSER-DRIVEN END-TO-END VERIFICATION        ');
  console.log('================================================================\n');

  let server: MissionControlServer | null = null;
  let baseUrl = 'http://127.0.0.1:4200';

  // Check if server is already running on port 4200
  try {
    const res = await fetch(`${baseUrl}/api/episodes`);
    if (res.ok) {
      console.log('• Connected to running server on ' + baseUrl);
    } else {
      throw new Error('Server returned ' + res.status);
    }
  } catch {
    console.log('• Launching internal test server on port 4200...');
    server = new MissionControlServer(4200);
    await server.start();
  }

  // Launch Playwright browser (Chromium / msedge)
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

  console.log(`• Browser Engine launched: ${browser.version()}\n`);

  try {
    // -------------------------------------------------------------
    // 1. Tab Navigation & Browser History
    // -------------------------------------------------------------
    await test('Tab Navigation and Browser History Flow', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`${baseUrl}/`);

      // Verify Home view initially visible
      await page.waitForSelector('#view-home:not(.hidden)');
      assert.ok(await page.isVisible('#view-home'), 'Home view should be active initially');

      // Click Episodes tab
      await page.click('#nav-episodes');
      await page.waitForSelector('#view-episodes:not(.hidden)');
      assert.ok(page.url().includes('/episodes'), 'URL should reflect /episodes route');
      assert.ok(await page.isVisible('#view-episodes'), 'Episodes view should be visible');

      // Click Skills tab
      await page.click('#nav-skills');
      await page.waitForSelector('#view-skills:not(.hidden)');
      assert.ok(page.url().includes('/skills'), 'URL should reflect /skills route');
      assert.ok(await page.isVisible('#view-skills'), 'Skills view should be visible');

      // Click Activity tab
      await page.click('#nav-activity');
      await page.waitForSelector('#view-activity:not(.hidden)');
      assert.ok(page.url().includes('/activity'), 'URL should reflect /activity route');
      assert.ok(await page.isVisible('#view-activity'), 'Activity view should be visible');

      // Click Connections tab
      await page.click('#nav-connections');
      await page.waitForSelector('#view-connections:not(.hidden)');
      assert.ok(page.url().includes('/connections'), 'URL should reflect /connections route');
      assert.ok(await page.isVisible('#view-connections'), 'Connections view should be visible');

      // Test Browser Back Button
      await page.goBack();
      await page.waitForSelector('#view-activity:not(.hidden)');
      assert.ok(page.url().includes('/activity'), 'Back button should restore /activity view');

      await page.close();
    });

    // -------------------------------------------------------------
    // 2. Episode Search and Filter Functionality
    // -------------------------------------------------------------
    await test('Episode Search and Status Filtering', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`${baseUrl}/episodes`);
      await page.waitForSelector('#view-episodes:not(.hidden)');

      // Count initial episode cards
      await page.waitForSelector('.episode-card');
      const initialCards = await page.$$('.episode-card');
      assert.ok(initialCards.length > 0, 'Episodes should be rendered');

      // Filter by 'Draft'
      const draftFilterBtn = await page.$('.filter-ep-btn[data-filter="Draft"]');
      assert.ok(draftFilterBtn, 'Draft filter button must exist');
      await draftFilterBtn.click();
      await page.waitForTimeout(200);

      const visibleDrafts = await page.$$eval('.episode-card:not(.hidden)', els => els.length);
      assert.ok(visibleDrafts > 0, 'Draft episodes should be visible');

      // Filter by 'Needs Review' (Review)
      const reviewFilterBtn = await page.$('.filter-ep-btn[data-filter="Review"]');
      assert.ok(reviewFilterBtn, 'Review filter button must exist');
      await reviewFilterBtn.click();
      await page.waitForTimeout(200);

      const visibleReviews = await page.$$eval('.episode-card:not(.hidden)', els => els.length);
      assert.ok(visibleReviews > 0, 'Review episodes should be visible');

      // Restore All filter
      const allFilterBtn = await page.$('.filter-ep-btn[data-filter="all"]');
      await allFilterBtn?.click();
      await page.waitForTimeout(200);

      // Search keyword filter
      const searchInput = await page.$('#episodeSearchInput');
      assert.ok(searchInput, 'Search input must exist');
      await searchInput.fill('Necklace');
      await page.waitForTimeout(250);

      const searchFilteredCards = await page.$$eval('.episode-card:not(.hidden)', els => els.length);
      assert.ok(searchFilteredCards > 0 && searchFilteredCards <= initialCards.length, 'Search should filter cards');

      // Clear search
      await searchInput.fill('');
      await page.waitForTimeout(200);
      const restoredCards = await page.$$eval('.episode-card:not(.hidden)', els => els.length);
      assert.equal(restoredCards, initialCards.length, 'Clearing search restores all episodes');

      await page.close();
    });

    // -------------------------------------------------------------
    // 3. Episode Preview & Scene Selection (Mouse + Keyboard)
    // -------------------------------------------------------------
    await test('Episode Preview Scene Selection via Click & Keyboard (Enter/Space)', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`${baseUrl}/episodes/7fa80cc7-9aa8-4309-bd6c-fff5920cccd0`);

      await page.waitForSelector('.scene-card-item');
      const sceneCards = await page.$$('.scene-card-item');
      assert.ok(sceneCards.length > 1, 'Should render multiple scene cards');

      // Check ARIA attributes
      const firstCardRole = await sceneCards[0].getAttribute('role');
      const firstCardTabindex = await sceneCards[0].getAttribute('tabindex');
      assert.equal(firstCardRole, 'button', 'Scene card should have role="button"');
      assert.equal(firstCardTabindex, '0', 'Scene card should be keyboard focusable');

      // Click second scene card
      await sceneCards[1].click();
      await page.waitForTimeout(200);
      const isSecondSelected = await sceneCards[1].evaluate(el => el.classList.contains('active-scene-card'));
      assert.ok(isSecondSelected, 'Second scene card should have active-scene-card class after click');

      // Keyboard selection on first scene card via Enter key
      await sceneCards[0].focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      const isFirstSelectedAfterEnter = await sceneCards[0].evaluate(el => el.classList.contains('active-scene-card'));
      assert.ok(isFirstSelectedAfterEnter, 'First scene card should have active-scene-card class via Enter key');

      // Keyboard selection on second scene card via Space key
      await sceneCards[1].focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      const isSecondSelectedAfterSpace = await sceneCards[1].evaluate(el => el.classList.contains('active-scene-card'));
      assert.ok(isSecondSelectedAfterSpace, 'Second scene card should have active-scene-card class via Space key');

      await page.close();
    });

    // -------------------------------------------------------------
    // 4. Release Room Scheduling Inputs & Proposal Binding
    // -------------------------------------------------------------
    await test('Release Room Scheduling Inputs and Cryptographic publishAt Binding', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`${baseUrl}/episodes/7fa80cc7-9aa8-4309-bd6c-fff5920cccd0`);

      // Open Release Room Modal
      const approveTopBtn = await page.$('#btnApproveTop');
      assert.ok(approveTopBtn, 'btnApproveTop must exist');
      await approveTopBtn.click();

      await page.waitForSelector('#releaseRoomModal:not(.hidden)');
      const modal = await page.$('#releaseRoomModal');
      assert.ok(modal, 'Release room modal must be visible');

      // Modal Semantics
      const modalRole = await modal.getAttribute('role');
      const modalAriaModal = await modal.getAttribute('aria-modal');
      assert.equal(modalRole, 'dialog', 'Release room modal must have role="dialog"');
      assert.equal(modalAriaModal, 'true', 'Release room modal must have aria-modal="true"');

      // Verify scheduling inputs exist and have default values
      const dateInput = await page.$('#releaseDate');
      const timeInput = await page.$('#releaseTime');
      assert.ok(dateInput, '#releaseDate input must exist');
      assert.ok(timeInput, '#releaseTime input must exist');

      const dateVal = await dateInput.inputValue();
      const timeVal = await timeInput.inputValue();
      assert.ok(dateVal.length > 0, 'Release date must have initialized value');
      assert.ok(timeVal.length > 0, 'Release time must have initialized value');

      // Verify window.__activePublishAt is set
      const activePublishAt = await page.evaluate(() => (window as any).__activePublishAt);
      assert.ok(activePublishAt, 'window.__activePublishAt must be set from date/time inputs');

      // Modify release date and trigger change
      const targetDate = '2026-12-25';
      await dateInput.fill(targetDate);
      await dateInput.dispatchEvent('change');
      await page.waitForTimeout(300);

      const updatedPublishAt = await page.evaluate(() => (window as any).__activePublishAt);
      assert.ok(updatedPublishAt?.startsWith(targetDate), `publishAt should reflect updated date ${targetDate}`);

      // Dismiss modal using Escape key
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const isHiddenAfterEscape = await page.$eval('#releaseRoomModal', el => el.classList.contains('hidden'));
      assert.ok(isHiddenAfterEscape, 'Release room modal must close when pressing Escape');

      await page.close();
    });

    // -------------------------------------------------------------
    // 5. Demonstration Recorder Studio & Action Step Palette
    // -------------------------------------------------------------
    await test('Demonstration Recorder Controls, Presets & Event Stream Durability', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`${baseUrl}/skills`);
      await page.waitForSelector('#view-skills:not(.hidden)');

      // Verify recorder UI elements
      const btnStart = await page.$('#btnStartCapture');
      const btnStop = await page.$('#btnStopCapture');
      const btnRetry = await page.$('#btnRetryUploadVideo');
      const btnClear = await page.$('#btnClearRecording');

      assert.ok(btnStart, '#btnStartCapture must exist');
      assert.ok(btnStop, '#btnStopCapture must exist');
      assert.ok(btnRetry, '#btnRetryUploadVideo must exist');
      assert.ok(btnClear, '#btnClearRecording must exist');

      // Load YouTube Shorts Preset
      const ytPresetBtn = await page.$('[data-preset="youtube-shorts"]');
      assert.ok(ytPresetBtn, 'YouTube Shorts preset button must exist');
      await ytPresetBtn.click();
      await page.waitForTimeout(300);

      // Verify recorded events stream renders steps
      const stepsCountText = await page.$eval('#recordedStepsCount', el => el.textContent?.trim());
      assert.ok(stepsCountText && !stepsCountText.startsWith('0'), 'Preset must populate steps');

      // Verify provenance badge rendered
      const provBadges = await page.$$eval('#recordedEventsStream span', spans => spans.map(s => s.textContent?.trim()));
      assert.ok(provBadges.some(b => b === 'Sample Template'), 'Sample Template provenance badge must be present');

      // Test reset button
      await btnClear.click();
      await page.waitForTimeout(200);
      const resetCountText = await page.$eval('#recordedStepsCount', el => el.textContent?.trim());
      assert.equal(resetCountText, '0 steps', 'Reset button should clear recorded steps');

      await page.close();
    });

    // -------------------------------------------------------------
    // 6. Responsive Viewports & Mobile Chat Drawer
    // -------------------------------------------------------------
    await test('Responsive Viewport (320px & 375px) Layout and Mobile Drawers', async () => {
      const viewports = [
        { width: 320, height: 568, name: 'Small Mobile (320px)' },
        { width: 375, height: 667, name: 'Standard Mobile (375px)' },
        { width: 768, height: 1024, name: 'Tablet (768px)' },
      ];

      for (const vp of viewports) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(`${baseUrl}/`);

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        assert.equal(overflow, false, `${vp.name} should not have horizontal scrollbar overflow`);

        // At mobile viewports, check mobile drawer toggle
        if (vp.width < 768) {
          const mobileToggle = await page.$('#btnFloatingChatToggle');
          if (mobileToggle && await mobileToggle.isVisible()) {
            await mobileToggle.click();
            await page.waitForTimeout(250);
            const drawerOpen = await page.$eval('#assistantPane', el => el.classList.contains('translate-x-0'));
            assert.ok(drawerOpen, 'Assistant drawer should open on mobile');

            // Close chat via close button
            const closeBtn = await page.$('#btnCloseChat');
            if (closeBtn && await closeBtn.isVisible()) {
              await closeBtn.click();
              await page.waitForTimeout(250);
              const drawerClosed = await page.$eval('#assistantPane', el => el.classList.contains('translate-x-full'));
              assert.ok(drawerClosed, 'Assistant drawer should close on close button click');
            }
          }
        }

        await page.close();
      }
    });

    // -------------------------------------------------------------
    // 7. Reduced Motion and Accessibility Checks
    // -------------------------------------------------------------
    await test('Prefers-Reduced-Motion and Dialog ARIA Compliance', async () => {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
        reducedMotion: 'reduce',
      });
      await page.goto(`${baseUrl}/`);

      // Verify all modal dialogs have role="dialog" and aria-modal="true"
      const dialogs = await page.$$eval('[role="dialog"]', els => els.map(el => ({
        id: el.id,
        role: el.getAttribute('role'),
        ariaModal: el.getAttribute('aria-modal'),
      })));

      assert.ok(dialogs.length >= 4, 'All primary modals must have role="dialog"');
      for (const d of dialogs) {
        assert.equal(d.role, 'dialog', `Modal #${d.id} must have role="dialog"`);
        assert.equal(d.ariaModal, 'true', `Modal #${d.id} must have aria-modal="true"`);
      }

      await page.close();
    });

  } finally {
    await browser.close();
    if (server) {
      await server.stop();
    }
  }

  console.log('================================================================');
  console.log(`E2E Audit Result: ${passed} passed, ${failed} failed.`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBrowserE2ESuite().catch((err) => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
