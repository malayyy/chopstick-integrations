/* Smoke test: boot, console cleanliness, scroll mapping, screenshot. */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('qa/.artifacts', { recursive: true });

const browser = await puppeteer.launch({ channel: 'chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

const consoleLog = [];
page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => consoleLog.push(`[reqfail] ${r.url()}`));

await page.goto('http://localhost:4173/?debug', { waitUntil: 'networkidle2', timeout: 30000 });

// wait for boot veil removal
await page.waitForSelector('#boot', { hidden: true, timeout: 20000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 1200));

const snap1 = await page.evaluate(() => window.__film && window.__film.snapshot());
console.log('STATE at rest:', JSON.stringify(snap1, null, 2));

await page.screenshot({ path: 'qa/.artifacts/desktop-frame0.png' });

// scroll to ~50%
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2 - window.innerHeight / 2 + 1195));
await new Promise((r) => setTimeout(r, 2500));
const snap2 = await page.evaluate(() => window.__film && window.__film.snapshot());
console.log('STATE at 50%:', JSON.stringify(snap2, null, 2));
await page.screenshot({ path: 'qa/.artifacts/desktop-frame150.png' });

// bottom
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await new Promise((r) => setTimeout(r, 2500));
const snap3 = await page.evaluate(() => window.__film && window.__film.snapshot());
console.log('STATE at end:', JSON.stringify(snap3, null, 2));
await page.screenshot({ path: 'qa/.artifacts/desktop-frame299.png' });

console.log('CONSOLE:', consoleLog.length ? consoleLog : 'clean');
await browser.close();
