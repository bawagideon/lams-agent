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
  /**
   * SSRF check: Disallows private IP ranges, link-local, carrier NAT, cloud metadata, and broadcast.
   * Strictly fails closed on DNS resolution failures.
   * Ignores allowLoopback flag in production environments.
   * Returns authoritative resolved IP for connection-layer pinning.
   */
  public async validateUrlSafety(targetUrl: string, requestedAllowLoopback = false): Promise<{
    isSafe: boolean;
    resolvedIp: string;
    port: number;
    hostname: string;
    protocol: string;
    parsedUrl: URL;
  }> {
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

    if (parsed.protocol === 'about:') {
      return { isSafe: true, resolvedIp: '127.0.0.1', port: 0, hostname: 'about', protocol: 'about:', parsedUrl: parsed };
    }

    const defaultPort = parsed.protocol === 'https:' ? 443 : 80;
    const port = parsed.port ? parseInt(parsed.port, 10) : defaultPort;
    const hostname = parsed.hostname.toLowerCase();
    const cleanHost = hostname.replace(/^\[/, '').replace(/\]$/, '');

    // Check direct loopback hostnames
    if (cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost === '::1') {
      if (!allowLoopback) {
        throw new Error(`SSRF blocked: Navigation to loopback (${hostname}) is prohibited.`);
      }
      return { isSafe: true, resolvedIp: '127.0.0.1', port, hostname, protocol: parsed.protocol, parsedUrl: parsed };
    }

    // Check if hostname is direct IP literal
    if (this.isPrivateIp(cleanHost)) {
      if (!allowLoopback || !this.isLoopbackIp(cleanHost)) {
        throw new Error(`SSRF blocked: Destination IP '${cleanHost}' is in a private, loopback, or metadata range.`);
      }
      return { isSafe: true, resolvedIp: cleanHost, port, hostname, protocol: parsed.protocol, parsedUrl: parsed };
    }

    // Direct public IP literal check (IPv4 or IPv6)
    if (net.isIP(cleanHost)) {
      return { isSafe: true, resolvedIp: cleanHost, port, hostname, protocol: parsed.protocol, parsedUrl: parsed };
    }

    // Resolve DNS and strictly check all returned address families (IPv4 A and IPv6 AAAA)
    const resolvedIps = new Set<string>();

    try {
      const lookups = await this.dnsResolver.lookup(hostname, { all: true } as any);
      if (Array.isArray(lookups)) {
        for (const item of lookups) {
          if (item?.address) resolvedIps.add(item.address);
        }
      } else if ((lookups as any)?.address) {
        resolvedIps.add((lookups as any).address);
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
    let pinnedIp: string | null = null;

    for (const ip of resolvedIps) {
      if (this.isPrivateIp(ip)) {
        if (!allowLoopback || !this.isLoopbackIp(ip)) {
          hasUnsafe = true;
          throw new Error(`SSRF blocked: Resolved IP ${ip} for host '${hostname}' is in a private, loopback, or metadata range.`);
        }
      } else {
        hasSafe = true;
        if (!pinnedIp) pinnedIp = ip;
      }
    }

    if (hasSafe && hasUnsafe) {
      throw new Error(`SSRF blocked: Host '${hostname}' resolved to mixed safe and private IPs (DNS rebinding attempt).`);
    }

    if (!pinnedIp) {
      if (allowLoopback && resolvedIps.size > 0) {
        pinnedIp = Array.from(resolvedIps)[0];
      } else {
        throw new Error(`SSRF blocked: No safe public IP found for host '${hostname}'.`);
      }
    }

    return { isSafe: true, resolvedIp: pinnedIp, port, hostname, protocol: parsed.protocol, parsedUrl: parsed };
  }

  private parseIpv6Words(cleanIp: string): { words: number[]; embeddedIpv4?: number[] } | null {
    let clean = cleanIp.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').trim();
    let embeddedIpv4: number[] | undefined;

    // Extract embedded IPv4 representation at the end, e.g. ::ffff:127.0.0.1 or 0:0:0:0:0:ffff:192.168.1.1
    const lastColon = clean.lastIndexOf(':');
    if (lastColon !== -1 && clean.substring(lastColon + 1).includes('.')) {
      const rawV4 = clean.substring(lastColon + 1);
      const parts = rawV4.split('.').map(p => parseInt(p, 10));
      if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
        const h1 = ((parts[0] << 8) | parts[1]).toString(16);
        const h2 = ((parts[2] << 8) | parts[3]).toString(16);
        clean = clean.substring(0, lastColon) + ':' + h1 + ':' + h2;
        embeddedIpv4 = parts;
      } else {
        return null;
      }
    }

    const doubleColon = clean.indexOf('::');
    let words: number[] = [];
    if (doubleColon !== -1) {
      if (clean.indexOf('::', doubleColon + 2) !== -1) return null; // Multiple double-colons are invalid
      const leftStr = clean.substring(0, doubleColon);
      const rightStr = clean.substring(doubleColon + 2);
      const left = leftStr ? leftStr.split(':') : [];
      const right = rightStr ? rightStr.split(':') : [];
      const missing = 8 - (left.length + right.length);
      if (missing < 0) return null;
      const allHex = [...left, ...Array(missing).fill('0'), ...right];
      if (allHex.length !== 8) return null;
      words = allHex.map(w => parseInt(w || '0', 16));
    } else {
      const allHex = clean.split(':');
      if (allHex.length !== 8) return null;
      words = allHex.map(w => parseInt(w, 16));
    }

    if (words.some(w => isNaN(w) || w < 0 || w > 0xffff)) {
      return null;
    }

    // If embedded IPv4 was not dot-formatted but w0..w4 are 0 and w5 is 0 or 0xffff
    if (!embeddedIpv4 && words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && (words[5] === 0 || words[5] === 0xffff)) {
      embeddedIpv4 = [(words[6] >> 8) & 0xff, words[6] & 0xff, (words[7] >> 8) & 0xff, words[7] & 0xff];
    }

    return { words, embeddedIpv4 };
  }

  private isPrivateIpv4Octets(parts: number[]): boolean {
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;
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
    return false;
  }

  private isLoopbackIp(ip: string): boolean {
    const clean = ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').trim();
    if (clean === '127.0.0.1' || clean === '::1' || clean.startsWith('127.')) return true;

    if (net.isIP(clean) === 4) {
      const parts = clean.split('.').map(p => parseInt(p, 10));
      return parts.length === 4 && parts[0] === 127;
    }

    const parsed = this.parseIpv6Words(clean);
    if (parsed) {
      const { words, embeddedIpv4 } = parsed;
      if (words.slice(0, 7).every(w => w === 0) && words[7] === 1) return true;
      if (embeddedIpv4 && embeddedIpv4[0] === 127) return true;
    }

    return false;
  }

  /**
   * Comprehensive validation covering RFC 1918, RFC 6598, RFC 3927, Cloud Metadata (169.254.169.254),
   * IPv4-mapped IPv6 (compressed/expanded), ULA, and multicast/broadcast ranges.
   */
  public isPrivateIp(ip: string): boolean {
    const cleanIp = ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').trim();

    // Check IPv4
    if (net.isIP(cleanIp) === 4) {
      const parts = cleanIp.split('.').map(p => parseInt(p, 10));
      return this.isPrivateIpv4Octets(parts);
    }

    // Parse and normalize IPv6
    const parsed = this.parseIpv6Words(cleanIp);
    if (!parsed) {
      return false;
    }

    const { words, embeddedIpv4 } = parsed;

    // Check embedded IPv4 (e.g. IPv4-mapped ::ffff:x.x.x.x, IPv4-compatible ::x.x.x.x)
    if (embeddedIpv4 && this.isPrivateIpv4Octets(embeddedIpv4)) {
      return true;
    }

    const [w0, w1, w2, w3, w4, w5, w6, w7] = words;

    // Unspecified :: and Loopback ::1 (compressed or expanded)
    if (words.every(w => w === 0)) return true; // ::
    if (words.slice(0, 7).every(w => w === 0) && w7 === 1) return true; // ::1

    // Link-local unicast fe80::/10 (0xfe80 - 0xfebf)
    if ((w0 & 0xffc0) === 0xfe80) return true;

    // Unique Local Address (ULA) fc00::/7 (0xfc00 - 0xfdff)
    if ((w0 & 0xfe00) === 0xfc00) return true;

    // Multicast ff00::/8
    if ((w0 & 0xff00) === 0xff00) return true;

    // Documentation 2001:db8::/32
    if (w0 === 0x2001 && w1 === 0x0db8) return true;

    // Discard-only 100::/64
    if (w0 === 0x0100 && w1 === 0 && w2 === 0 && w3 === 0) return true;

    // 6to4 2002::/16 check embedded IPv4
    if (w0 === 0x2002) {
      const v4 = [(w1 >> 8) & 0xff, w1 & 0xff, (w2 >> 8) & 0xff, w2 & 0xff];
      if (this.isPrivateIpv4Octets(v4)) return true;
    }

    // NAT64 / Well-known prefix 64:ff9b::/96
    if (w0 === 0x0064 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) {
      const v4 = [(w6 >> 8) & 0xff, w6 & 0xff, (w7 >> 8) & 0xff, w7 & 0xff];
      if (this.isPrivateIpv4Octets(v4)) return true;
    }

    return false;
  }

  private proxyServer: http.Server | null = null;
  private proxyPort = 0;

  public async getProxyPortForTesting(allowLoopback = false): Promise<number> {
    this.currentAllowLoopback = allowLoopback;
    return this.ensureProxyServer();
  }

  private async ensureProxyServer(): Promise<number> {
    if (this.proxyServer && this.proxyPort > 0) {
      return this.proxyPort;
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          let targetUrl = req.url || '';
          if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = `http://${req.headers.host || 'localhost'}${targetUrl}`;
          }
          const validation = await this.validateUrlSafety(targetUrl, this.currentAllowLoopback);
          const targetIp = validation.resolvedIp;
          const targetPort = validation.port || 80;

          // Connection-layer pinning: Connect directly to the validated IP without re-resolving hostname
          const proxyReq = http.request(
            {
              host: targetIp,
              port: targetPort,
              method: req.method,
              path: validation.parsedUrl.pathname + validation.parsedUrl.search,
              headers: {
                ...req.headers,
                host: validation.parsedUrl.host,
              },
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
        } catch (err: any) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end(`SSRF Blocked: ${err.message}`);
        }
      });

      server.on('connect', async (req, clientSocket, head) => {
        try {
          const urlStr = req.url || '';
          let host: string;
          let port: number;

          if (urlStr.startsWith('[')) {
            // IPv6 authority format: [::1]:443
            const closeBracket = urlStr.indexOf(']');
            if (closeBracket === -1) {
              clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
              clientSocket.destroy();
              return;
            }
            host = urlStr.substring(0, closeBracket + 1);
            const portStr = urlStr.substring(closeBracket + 1).replace(/^:/, '');
            port = parseInt(portStr, 10) || 443;
          } else {
            const lastColon = urlStr.lastIndexOf(':');
            if (lastColon !== -1) {
              host = urlStr.substring(0, lastColon);
              port = parseInt(urlStr.substring(lastColon + 1), 10) || 443;
            } else {
              host = urlStr;
              port = 443;
            }
          }

          const targetUrl = `https://${host}:${port}`;
          const validation = await this.validateUrlSafety(targetUrl, this.currentAllowLoopback);
          const targetIp = validation.resolvedIp;

          // Connection-layer pinning: Connect directly to the approved IP address with NO secondary DNS lookup
          const targetSocket = net.connect({ host: targetIp, port }, () => {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            if (head && head.length > 0) targetSocket.write(head);
            clientSocket.pipe(targetSocket);
            targetSocket.pipe(clientSocket);
          });

          targetSocket.on('error', () => clientSocket.destroy());
          clientSocket.on('error', () => targetSocket.destroy());
        } catch (err: any) {
          clientSocket.write(`HTTP/1.1 403 Forbidden\r\n\r\nSSRF blocked: ${err.message}`);
          clientSocket.destroy();
        }
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
