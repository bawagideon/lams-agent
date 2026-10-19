import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

export interface BrowserStepResult {
  status: 'PASS' | 'FAIL';
  action: string;
  detail: string;
  durationMs: number;
  screenshotBase64?: string;
  metadata?: Record<string, any>;
}

export class PlaywrightBrowserAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private evidenceDir: string;

  constructor(evidenceDir?: string) {
    this.evidenceDir = evidenceDir || path.resolve('data', 'evidence');
    if (!fs.existsSync(this.evidenceDir)) {
      try {
        fs.mkdirSync(this.evidenceDir, { recursive: true });
      } catch {}
    }
  }

  /**
   * SSRF check: Disallow private IP ranges, link-local, and cloud metadata unless allowed in test sandbox.
   */
  private async validateUrlSafety(targetUrl: string, allowLoopback = false): Promise<void> {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'about:') {
      throw new Error(`Disallowed protocol: '${parsed.protocol}'. Only http, https, and about: are supported.`);
    }

    if (parsed.protocol === 'about:') return;

    const hostname = parsed.hostname.toLowerCase();

    // Loopback check
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      if (!allowLoopback && process.env.NODE_ENV === 'production') {
        throw new Error(`SSRF blocked: Navigation to loopback (${hostname}) is prohibited in production.`);
      }
      return;
    }

    try {
      const addresses = await dns.resolve(hostname);
      for (const ip of addresses) {
        if (this.isPrivateIp(ip)) {
          throw new Error(`SSRF blocked: Resolved IP ${ip} for host '${hostname}' is in a private, loopback, or metadata range.`);
        }
      }
    } catch (err: any) {
      if (err.message.includes('SSRF blocked')) throw err;
      // If DNS resolution fails, allow playwright to attempt or fail naturally with DNS error
    }
  }

  private isPrivateIp(ip: string): boolean {
    const cleanIp = ip.toLowerCase();
    if (cleanIp === '::1' || cleanIp === '::' || cleanIp.startsWith('fe80:') || cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return true;
    }
    let ipv4 = cleanIp;
    if (cleanIp.startsWith('::ffff:')) {
      ipv4 = cleanIp.substring(7);
    }
    const parts = ipv4.split('.').map(p => parseInt(p, 10));
    if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      const [a, b] = parts;
      if (a === 127) return true;
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
      if (a === 0) return true;
      if (a >= 224) return true;
    }
    return false;
  }

  /**
   * Ensures a browser instance and page are initialized.
   */
  public async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    if (!this.browser) {
      // Prefer Microsoft Edge channel on Windows, fallback to default chromium
      try {
        this.browser = await chromium.launch({
          channel: 'msedge',
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      } catch {
        this.browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      }
    }

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LAMS-Agent/1.0',
    });

    this.page = await this.context.newPage();
    return this.page;
  }

  /**
   * Action: browser.navigate
   */
  public async navigate(targetUrl: string, allowLoopback = false): Promise<{ url: string; title: string; status: number }> {
    await this.validateUrlSafety(targetUrl, allowLoopback);
    const page = await this.ensurePage();
    const resp = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();
    return {
      url: page.url(),
      title,
      status: resp ? resp.status() : 200,
    };
  }

  /**
   * Action: ui.click
   */
  public async click(target: string, selector?: string): Promise<{ clicked: boolean; target: string; currentUrl: string }> {
    const page = await this.ensurePage();
    let locator = null;

    if (selector) {
      locator = page.locator(selector).first();
    } else {
      // Multi-strategy resolution
      locator = page.locator(`button:has-text("${target}"), a:has-text("${target}"), input[value="${target}"], [role="button"]:has-text("${target}")`).first();
    }

    const count = await locator.count();
    if (count === 0) {
      // Fallback: search text directly
      locator = page.getByText(target, { exact: false }).first();
    }

    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await locator.scrollIntoViewIfNeeded();
    await locator.click({ timeout: 10000 });

    return {
      clicked: true,
      target,
      currentUrl: page.url(),
    };
  }

  /**
   * Action: form.fill_text
   */
  public async fillText(field: string, value: string, selector?: string): Promise<{ filled: boolean; field: string; valueLength: number }> {
    const page = await this.ensurePage();
    let locator = null;

    if (selector) {
      locator = page.locator(selector).first();
    } else {
      locator = page.locator(`input[name="${field}"], textarea[name="${field}"], input[placeholder*="${field}" i], textarea[placeholder*="${field}" i], input[id="${field}"], [aria-label*="${field}" i]`).first();
    }

    const count = await locator.count();
    if (count === 0) {
      locator = page.getByLabel(field, { exact: false }).first();
    }

    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await locator.fill(value);

    return {
      filled: true,
      field,
      valueLength: value.length,
    };
  }

  /**
   * Action: file.select
   */
  public async selectFile(filePath: string, selector?: string): Promise<{ fileSelected: boolean; filePath: string; fileName: string }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File selection failed: Local file not found on disk at: ${filePath}`);
    }

    const page = await this.ensurePage();
    const inputSelector = selector || 'input[type="file"]';
    const locator = page.locator(inputSelector).first();

    await locator.waitFor({ state: 'attached', timeout: 15000 });
    await locator.setInputFiles(filePath);

    return {
      fileSelected: true,
      filePath,
      fileName: path.basename(filePath),
    };
  }

  /**
   * Action: action.verify
   * Evaluates actual DOM state, element presence, text content, or URL.
   */
  public async verify(condition: string, selector?: string, expectedText?: string, timeoutMs = 8000): Promise<{ verified: boolean; condition: string; currentUrl: string }> {
    const page = await this.ensurePage();

    if (selector) {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      if (expectedText) {
        const text = await locator.innerText();
        if (!text.toLowerCase().includes(expectedText.toLowerCase())) {
          throw new Error(`Assertion failed: Element '${selector}' text '${text}' does not contain expected '${expectedText}'.`);
        }
      }
      return { verified: true, condition, currentUrl: page.url() };
    }

    if (expectedText) {
      const found = await page.getByText(expectedText, { exact: false }).first().isVisible();
      if (!found) {
        throw new Error(`Assertion failed: Expected text '${expectedText}' not found visible on page.`);
      }
      return { verified: true, condition, currentUrl: page.url() };
    }

    // Generic verification: if condition mentions URL
    if (condition.toLowerCase().includes('url') || condition.startsWith('http')) {
      const current = page.url();
      if (!current.includes(condition) && !condition.includes(current)) {
        throw new Error(`Assertion failed: Current page URL '${current}' does not match expected '${condition}'.`);
      }
      return { verified: true, condition, currentUrl: current };
    }

    // Check page is responsive and has valid title/content
    const title = await page.title();
    const content = await page.content();
    if (!content || content.length < 50) {
      throw new Error(`Assertion failed: Page content is empty or unrendered (${content.length} bytes).`);
    }

    return {
      verified: true,
      condition,
      currentUrl: page.url(),
    };
  }

  /**
   * Captures evidence screenshot.
   */
  public async captureScreenshot(name?: string): Promise<{ screenshotPath: string; base64: string }> {
    const page = await this.ensurePage();
    const fileName = `${name || 'step'}_${Date.now()}.png`;
    const screenshotPath = path.join(this.evidenceDir, fileName);
    const buffer = await page.screenshot({ fullPage: false });
    fs.writeFileSync(screenshotPath, buffer);
    return {
      screenshotPath,
      base64: buffer.toString('base64'),
    };
  }

  public async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    } catch {}
  }
}
