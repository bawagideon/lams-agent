import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
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
  private currentAllowLoopback = false;
  private dnsResolver: typeof dns = dns;

  public setDnsResolverForTesting(customResolver: any): void {
    this.dnsResolver = customResolver || dns;
  }

  constructor(evidenceDir?: string) {
    this.evidenceDir = evidenceDir || path.resolve('data', 'evidence');
    if (!fs.existsSync(this.evidenceDir)) {
      try {
        fs.mkdirSync(this.evidenceDir, { recursive: true });
      } catch {}
    }
  }

  /**
   * Diagnostic: Checks whether a supported browser executable (Edge or Chromium) is installed.
   */
  public static async checkBrowserPrerequisites(): Promise<{ ready: boolean; channel?: string; path?: string; error?: string }> {
    const knownWindowsEdgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
    ];

    for (const p of knownWindowsEdgePaths) {
      if (p && fs.existsSync(p)) {
        return { ready: true, channel: 'msedge', path: p };
      }
    }

    // Try testing playwright-core launch
    try {
      const b = await chromium.launch({
        headless: true,
        channel: 'msedge',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      await b.close();
      return { ready: true, channel: 'msedge' };
    } catch {
      try {
        const b = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        await b.close();
        return { ready: true, channel: 'chromium' };
      } catch (err: any) {
        return {
          ready: false,
          error: `No supported browser binary found on this system. Please install Microsoft Edge (standard on Windows) or run 'npx playwright install chromium'. Details: ${err.message}`,
        };
      }
    }
  }

  /**
   * SSRF check: Disallows private IP ranges, link-local, carrier NAT, cloud metadata, and broadcast.
   * Strictly fails closed on DNS resolution failures.
   * Ignores allowLoopback flag in production environments.
   */
  public async validateUrlSafety(targetUrl: string, requestedAllowLoopback = false): Promise<void> {
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    // Production restriction: allowLoopback is NEVER permitted in production
    const allowLoopback = isProd ? false : requestedAllowLoopback;

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new Error(`SSRF blocked: Invalid URL format: '${targetUrl}'`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'about:') {
      throw new Error(`Disallowed protocol: '${parsed.protocol}'. Only http, https, and about: are supported.`);
    }

    if (parsed.protocol === 'about:') return;

    const hostname = parsed.hostname.toLowerCase();

    // Check direct loopback hostnames
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
      if (!allowLoopback) {
        throw new Error(`SSRF blocked: Navigation to loopback (${hostname}) is prohibited.`);
      }
      return;
    }

    // Check if hostname is direct IP literal
    const cleanHost = hostname.replace(/^\[/, '').replace(/\]$/, '');
    if (this.isPrivateIp(cleanHost)) {
      if (!allowLoopback || !this.isLoopbackIp(cleanHost)) {
        throw new Error(`SSRF blocked: Destination IP '${cleanHost}' is in a private, loopback, or metadata range.`);
      }
      return;
    }

    // Resolve DNS and strictly check all returned address families (IPv4 A and IPv6 AAAA)
    const resolvedIps = new Set<string>();

    try {
      const lookups = await this.dnsResolver.lookup(hostname, { all: true } as any);
      if (Array.isArray(lookups)) {
        for (const item of lookups) {
          if (item?.address) resolvedIps.add(item.address);
        }
      }
    } catch {}

    try {
      const aRecords = await this.dnsResolver.resolve4(hostname);
      if (Array.isArray(aRecords)) {
        for (const ip of aRecords) resolvedIps.add(ip);
      }
    } catch {}

    try {
      const aaaaRecords = await this.dnsResolver.resolve6(hostname);
      if (Array.isArray(aaaaRecords)) {
        for (const ip of aaaaRecords) resolvedIps.add(ip);
      }
    } catch {}

    if (resolvedIps.size === 0) {
      throw new Error(`SSRF blocked: DNS resolution failed or returned 0 records for host '${hostname}'.`);
    }

    let hasSafe = false;
    let hasUnsafe = false;

    for (const ip of resolvedIps) {
      if (this.isPrivateIp(ip)) {
        if (!allowLoopback || !this.isLoopbackIp(ip)) {
          hasUnsafe = true;
          throw new Error(`SSRF blocked: Resolved IP ${ip} for host '${hostname}' is in a private, loopback, or metadata range.`);
        }
      } else {
        hasSafe = true;
      }
    }

    if (hasSafe && hasUnsafe) {
      throw new Error(`SSRF blocked: Host '${hostname}' resolved to mixed safe and private IPs (DNS rebinding attempt).`);
    }
  }

  private isLoopbackIp(ip: string): boolean {
    const clean = ip.toLowerCase();
    if (clean === '127.0.0.1' || clean === '::1' || clean.startsWith('127.')) return true;
    return false;
  }

  /**
   * Comprehensive validation covering RFC 1918, RFC 6598, RFC 3927, Cloud Metadata (169.254.169.254),
   * IPv4-mapped IPv6, ULA, and multicast/broadcast ranges.
   */
  public isPrivateIp(ip: string): boolean {
    const cleanIp = ip.toLowerCase().trim();

    // IPv6 checks
    if (cleanIp === '::1' || cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:1' || cleanIp === '0:0:0:0:0:0:0:0') {
      return true;
    }
    if (cleanIp.startsWith('fe8') || cleanIp.startsWith('fe9') || cleanIp.startsWith('fea') || cleanIp.startsWith('feb')) {
      return true; // Link-local fe80::/10
    }
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return true; // Unique Local Address (ULA) fc00::/7
    }
    if (cleanIp.startsWith('ff')) {
      return true; // Multicast ff00::/8
    }
    if (cleanIp.startsWith('2001:db8:')) {
      return true; // Documentation
    }
    if (cleanIp.startsWith('100::')) {
      return true; // Discard-only
    }
    if (cleanIp.startsWith('64:ff9b:')) {
      return true; // IPv4/IPv6 translation
    }

    let ipv4 = cleanIp;
    if (cleanIp.startsWith('::ffff:')) {
      ipv4 = cleanIp.substring(7);
    }

    // IPv4 checks
    const parts = ipv4.split('.').map(p => parseInt(p, 10));
    if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      const [a, b, c, d] = parts;
      if (a === 0) return true; // 0.0.0.0/8 (Current network)
      if (a === 10) return true; // 10.0.0.0/8 (Private RFC1918)
      if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (Carrier-grade NAT RFC6598)
      if (a === 127) return true; // 127.0.0.0/8 (Loopback)
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (Private RFC1918)
      if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF Protocol)
      if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
      if (a === 192 && b === 168) return true; // 192.168.0.0/16 (Private RFC1918)
      if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (Benchmark)
      if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
      if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
      if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 (Multicast)
      if (a >= 240) return true; // 240.0.0.0/4 (Reserved & 255.255.255.255 Broadcast)
    }

    return false;
  }

  private proxyServer: http.Server | null = null;
  private proxyPort = 0;

  private async ensureProxyServer(): Promise<number> {
    if (this.proxyServer && this.proxyPort > 0) {
      return this.proxyPort;
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const targetUrl = req.url || '';
        this.validateUrlSafety(targetUrl, this.currentAllowLoopback)
          .then(() => {
            const proxyReq = http.request(
              targetUrl,
              {
                method: req.method,
                headers: req.headers,
              },
              (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
                proxyRes.pipe(res);
              }
            );
            proxyReq.on('error', (err) => {
              res.writeHead(502, { 'Content-Type': 'text/plain' });
              res.end(`Bad Gateway: ${err.message}`);
            });
            req.pipe(proxyReq);
          })
          .catch((err) => {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end(`SSRF Blocked: ${err.message}`);
          });
      });

      server.on('connect', (req, clientSocket, head) => {
        const [host, portStr] = (req.url || '').split(':');
        const port = parseInt(portStr, 10) || 443;
        const targetUrl = `https://${host}:${port}`;

        this.validateUrlSafety(targetUrl, this.currentAllowLoopback)
          .then(async () => {
            let safeIp = host;
            try {
              const lookups: any = await this.dnsResolver.lookup(host, { all: true } as any);
              if (Array.isArray(lookups) && lookups.length > 0) {
                safeIp = lookups[0].address;
              } else if (lookups && lookups.address) {
                safeIp = lookups.address;
              }
            } catch {}

            const targetSocket = net.connect({ host: safeIp, port }, () => {
              clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
              if (head && head.length > 0) targetSocket.write(head);
              clientSocket.pipe(targetSocket);
              targetSocket.pipe(clientSocket);
            });

            targetSocket.on('error', () => clientSocket.destroy());
            clientSocket.on('error', () => targetSocket.destroy());
          })
          .catch(() => {
            clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\nSSRF blocked');
            clientSocket.destroy();
          });
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo;
        this.proxyPort = addr.port;
        this.proxyServer = server;
        resolve(this.proxyPort);
      });

      server.on('error', (err) => reject(err));
    });
  }

  /**
   * Ensures a browser instance and page are initialized.
   * Attaches network-level route interception to enforce SSRF validation on all requests & redirects.
   */
  public async ensurePage(allowLoopback = false): Promise<Page> {
    this.currentAllowLoopback = allowLoopback;

    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    const proxyPort = await this.ensureProxyServer();

    if (!this.browser) {
      // Diagnostic check for prerequisites
      const prereqs = await PlaywrightBrowserAdapter.checkBrowserPrerequisites();
      if (!prereqs.ready) {
        throw new Error(prereqs.error || 'No supported browser binary available.');
      }

      try {
        this.browser = await chromium.launch({
          channel: prereqs.channel || 'msedge',
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
      proxy: { server: `http://127.0.0.1:${proxyPort}` },
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LAMS-Agent/1.0',
    });

    this.page = await this.context.newPage();

    // NETWORK LAYER INTERCEPTION: Block any request or redirect destined for private/metadata IPs
    await this.page.route('**', async (route) => {
      const request = route.request();
      const targetUrl = request.url();
      try {
        await this.validateUrlSafety(targetUrl, this.currentAllowLoopback);
        await route.continue();
      } catch (err: any) {
        // Abort blocked network connection at the client before socket opens
        await route.abort('blockedbyclient');
      }
    });

    return this.page;
  }

  /**
   * Action: browser.navigate
   */
  public async navigate(targetUrl: string, allowLoopback = false): Promise<{ url: string; title: string; status: number }> {
    await this.validateUrlSafety(targetUrl, allowLoopback);
    const page = await this.ensurePage(allowLoopback);
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
    const page = await this.ensurePage(this.currentAllowLoopback);
    let locator = null;

    if (selector) {
      locator = page.locator(selector).first();
    } else {
      locator = page.locator(`button:has-text("${target}"), a:has-text("${target}"), input[value="${target}"], [role="button"]:has-text("${target}")`).first();
    }

    const count = await locator.count();
    if (count === 0) {
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
    const page = await this.ensurePage(this.currentAllowLoopback);
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

    const page = await this.ensurePage(this.currentAllowLoopback);
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
    const page = await this.ensurePage(this.currentAllowLoopback);

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
    const page = await this.ensurePage(this.currentAllowLoopback);
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
      if (this.proxyServer) {
        try { this.proxyServer.close(); } catch {}
        this.proxyServer = null;
        this.proxyPort = 0;
      }
    } catch {}
  }
}
