import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { lookup } from 'node:dns/promises';
import serverlessChromium from '@sparticuz/chromium';
import puppeteer, { type Browser, type HTTPRequest } from 'puppeteer-core';
import { isPublicAddress, normalizeUrl } from './safe-fetch';

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };

async function localExecutable(): Promise<string> {
  const candidates = process.platform === 'win32'
    ? [
        `${process.env.PROGRAMFILES ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${process.env.PROGRAMFILES ?? 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('No se encontró Chrome o Edge para generar la captura.');
}

async function validateBrowserRequest(request: HTTPRequest): Promise<void> {
  const raw = request.url();
  if (raw.startsWith('data:') || raw.startsWith('blob:') || raw === 'about:blank') return request.continue();
  try {
    const url = normalizeUrl(raw);
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) return request.abort('blockedbyclient');
    return request.continue();
  } catch {
    return request.abort('blockedbyclient');
  }
}

async function launchBrowser(): Promise<Browser> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  return puppeteer.launch({
    args: isServerless ? serverlessChromium.args : [],
    executablePath: isServerless ? await serverlessChromium.executablePath() : await localExecutable(),
    headless: true,
  });
}

export async function captureDesktopScreenshot(input: string): Promise<Uint8Array> {
  const url = normalizeUrl(input);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('El destino no corresponde a una dirección pública permitida.');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.setRequestInterception(true);
    page.on('request', request => { void validateBrowserRequest(request); });
    await page.goto(url.href, { waitUntil: 'networkidle2', timeout: 20_000 });
    return await page.screenshot({ type: 'webp', quality: 78, fullPage: false, captureBeyondViewport: false });
  } finally {
    await browser.close();
  }
}
