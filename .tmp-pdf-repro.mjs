import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const [,, lang = 'en', site = 'https://example.com', outDir = 'C:/Users/edwar/AppData/Local/Temp/pdfrepro'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const before = new Set(fs.readdirSync(outDir));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir });
page.on('console', m => console.log(`[console.${m.type()}]`, m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('requestfailed', r => console.log('[requestfailed]', r.url(), r.failure()?.errorText));
await page.setCookie({ name: 'language', value: lang, url: 'http://localhost:4321' });
await page.goto('http://localhost:4321', { waitUntil: 'networkidle0', timeout: 60000 });
await page.type('#site-url', site);
await page.click('#audit-form button[type=submit]');
await page.waitForSelector('#download-button', { visible: true, timeout: 90000 });
await page.waitForFunction(() => !document.getElementById('report')?.hidden, { timeout: 90000 });
const hasShot = await page.evaluate(() => [...document.querySelectorAll('img')].some(i => i.src.startsWith('blob:')));
console.log('screenshot blob present:', hasShot);
// Capture the actual error passed to console.warn
await page.evaluate(() => { const w = console.warn; console.warn = (...a) => { w(...a.map(x => x instanceof Error ? `${x.name}: ${x.message}\n${x.stack}` : x)); }; const e = console.error; console.error = (...a) => { e(...a.map(x => x instanceof Error ? `${x.name}: ${x.message}\n${x.stack}` : x)); }; });
await page.click('#download-button');
let file = null;
for (let i = 0; i < 60 && !file; i++) {
  await new Promise(r => setTimeout(r, 500));
  file = fs.readdirSync(outDir).find(f => !before.has(f) && f.endsWith('.pdf'));
}
console.log('button text:', await page.$eval('#download-button', b => b.textContent));
console.log('downloaded:', file ? path.join(outDir, file) : 'NONE');
await browser.close();
