// Run after a Windows debug build. Launches the actual app in a fresh data folder
// and uses WebView2's temporary debugging port; no IPC is mocked.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

const output = resolve('test-artifacts');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'native-'));
const executable = resolve('src-tauri/target/debug/sunriseset.exe');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function launch(check) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No debugging port');
  await new Promise(resolve => server.close(resolve));
  const child = spawn(executable, [], {
    cwd: directory, windowsHide: true, stdio: 'pipe',
    env: { ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${address.port}`,
      WEBVIEW2_USER_DATA_FOLDER: join(directory, 'webview2'),
    },
  });
  let processError = '';
  child.on('error', error => { processError = error.message; });
  child.stderr.on('data', chunk => { processError += chunk.toString(); });
  let browser;
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (child.exitCode !== null) throw new Error(`App exited: ${processError}`);
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${address.port}`, { timeout: 500 });
        break;
      } catch { await sleep(200); }
    }
    if (!browser) throw new Error(`Could not connect to WebView2: ${processError}`);
    let page;
    for (let attempt = 0; attempt < 50; attempt++) {
      page = browser.contexts().flatMap(context => context.pages())[0];
      if (page) break;
      await sleep(100);
    }
    if (!page) throw new Error('No app page');
    await check(page);
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) {
      const closed = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await closed;
    }
  }
}

await launch(async page => {
  await expect(page.locator('.day-bar')).toHaveCount(8, { timeout: 15000 });
  await page.screenshot({ path: join(output, 'native-overview.png'), fullPage: true });
  await page.getByRole('button', { name: '髫ｨ讒ｭ繝ｻ鬮ｫ・ｪ繝ｻ・ｭ髯橸ｽｳ郢晢ｽｻ }).click();
  await page.getByRole('combobox', { name: '鬮ｫ・ｪ・つ鬮ｫ・ｱ郢晢ｽｻ, exact: true }).selectOption('en');
  await page.getByRole('combobox', { name: 'Display year' }).selectOption('next_year');
  await page.getByRole('combobox', { name: 'Sort order' }).selectOption('south');
  await page.getByRole('button', { name: 'Hide all', exact: true }).click();
  await page.getByRole('searchbox').fill('Tokyo');
  await page.getByRole('checkbox', { name: 'Tokyo Japan', exact: true }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
  await page.getByRole('button', { name: '驕ｶ鄙ｫ繝ｻBack to overview' }).click();
  await expect(page.locator('.day-bar')).toHaveCount(1);
  await expect(page.locator('.city-name h2')).toHaveText('Tokyo');
});

const settings = await readFile(join(directory, 'settings.toml'), 'utf8');
assert.match(settings, /language = "en"/);
assert.match(settings, /year = "next_year"/);
assert.match(settings, /sort = "south"/);
assert.match(settings, /visible_cities = \["jp-tokyo"\]/);
const cities = JSON.parse(await readFile(join(directory, 'cities.json'), 'utf8'));
assert.equal(cities.cities.length, 266);

await launch(async page => {
  await expect(page.locator('.day-bar')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('.city-name h2')).toHaveText('Tokyo');
  await expect(page.getByRole('button', { name: '驕ｶ鄙ｫ繝ｻSouth first' })).toBeVisible();
  await page.getByRole('button', { name: '髫ｨ讒ｭ繝ｻSettings' }).click();
  await expect(page.getByRole('combobox', { name: 'Display year' })).toHaveValue('next_year');
  await expect(page.locator('.storage-panel code')).toHaveText(directory);
});
console.log('Native Windows smoke passed: real IPC, calculation, first-run files, TOML save and restart restoration.');
console.log(`Test data: ${directory}`);
