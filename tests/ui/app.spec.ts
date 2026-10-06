import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync("test-artifacts/fixture.json", "utf8"));

test.beforeEach(async ({ page }) => {
  // Mock only the IPC boundary. The fixture contains results from Rust's actual
  // astronomy engine. Native persistence and timezones have separate Rust tests.
  await page.addInitScript((data) => {
    const state = window as any;
    state.__calls = [];
    state.__TAURI_INTERNALS__ = { invoke: async (command: string, args: any) => {
      state.__calls.push({ command, args });
      if (command === "bootstrap") {
        if (state.__failBootstrap) throw new Error("D:\\SunriseSet\\cities.json: invalid data");
        return data.bootstrap;
      }
      if (command === "save_settings") {
        if (state.__failSave) throw new Error("D:\\SunriseSet\\settings.toml: access denied");
        await new Promise(resolve => setTimeout(resolve, 30));
        return;
      }
      if (command === "calculate_days") {
        const delay = state.__delays?.[args.date] ?? 10;
        await new Promise(resolve => setTimeout(resolve, delay));
        const rows = structuredClone(data.rows.filter((row: any) => args.cityIds.includes(row.city_id)));
        if (state.__delays?.[args.date]) {
          for (const row of rows) for (const event of row.day.events) {
            if (event.kind === "sunrise") event.time = `08:${args.date.slice(-2)}`;
          }
        }
        return rows;
      }
      throw new Error(`Unexpected command: ${command}`);
    } };
  }, fixture);
});

test('region filter combines with search and retains city selections', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '⚙ 設定', exact: true }).click();
  const region = page.getByRole('combobox', { name: '地域', exact: true });
  await expect(region.locator('option')).toHaveCount(8);
  const selected = await page.locator('.city-picker input:checked').count();
  await region.selectOption('asia');
  await page.getByRole('searchbox').fill('東京');
  await expect(page.locator('.city-option')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: '東京 日本', exact: true })).toBeChecked();
  await region.selectOption('europe');
  await expect(page.locator('.city-option')).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await region.selectOption('atlantic');
  await expect(page.locator('.city-option')).toContainText(['レイキャビク']);
  await region.selectOption('all');
  await expect(page.locator('.city-option')).toHaveCount(266);
  expect(await page.locator('.city-picker input:checked').count()).toBe(selected);
});

test('detailed table shows all columns and returns to normal view', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.day-bar')).toHaveCount(8);
  await page.getByRole('button', { name: '詳細表示へ', exact: true }).click();
  await expect(page.locator('.city-table thead th')).toHaveCount(13);
  await expect(page.locator('.city-table tbody tr')).toHaveCount(8);
  const tokyo = page.locator('.city-table tbody tr').filter({ has: page.getByRole('rowheader', { name: '東京', exact: true }) });
  await expect(tokyo).toContainText('Asia/Tokyo');
  await expect(tokyo.locator('.altitude-value')).toHaveText(/77\.\d{2}°/);
  await expect(page.locator('.table-polar').first()).toHaveText('白夜');
  await page.getByRole('button', { name: '↓ 北から', exact: true }).click();
  await expect(page.locator('.city-table tbody th').first()).toHaveText('ウシュアイア');
  await page.getByRole('button', { name: '通常表示へ', exact: true }).click();
  await expect(page.locator('.city-card')).toHaveCount(8);
  await expect(page.locator('.city-table')).toHaveCount(0);
});

test('renders cities, polar state, twilight and latitude sort without overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.city-card')).toHaveCount(8);
  await expect(page.locator('.day-bar')).toHaveCount(8);
  await expect(page.locator('.city-name h2').first()).toHaveText('トロムセ');
  await expect(page.locator('.polar-badge').first()).toHaveText('白夜');
  const tokyo = page.locator('.city-card').filter({ has: page.getByRole('heading', { name: '東京', exact: true }) });
  await tokyo.getByRole('button', { name: '薄明の時刻を表示' }).click();
  await expect(tokyo.locator('.event-grid > div')).toHaveCount(8);
  await expect(tokyo.locator('.event-grid')).toContainText('UTC+09:00');
  await page.screenshot({ path: 'test-artifacts/overview.png', fullPage: true });
  await page.getByRole('button', { name: '↓ 北から' }).click();
  await expect(page.locator('.city-name h2').first()).toHaveText('ウシュアイア');
  await page.setViewportSize({ width: 720, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(720);
  const spacing = await tokyo.evaluate(element => {
    const bar = element.querySelector('.day-bar')?.getBoundingClientRect();
    const times = element.querySelector('.sun-times')?.getBoundingClientRect();
    return bar && times ? times.left - bar.right : -1;
  });
  expect(spacing).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-artifacts/compact.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('settings edits appear in overview and persist only when saved', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '⚙ 設定' }).click();
  await page.getByRole('combobox', { name: '言語', exact: true }).selectOption('en');
  await page.getByRole('combobox', { name: 'Display year' }).selectOption('next_year');
  await page.getByRole('searchbox').fill('Tokyo');
  await expect(page.locator('.city-option')).toHaveCount(1);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Hide all', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await page.getByRole('button', { name: '← Back to overview' }).click();
  await expect(page.locator('.date-top h2')).toContainText('2027');
  await expect(page.locator('.empty-state')).toContainText('No cities selected.');
  await expect(page.getByRole('status')).toHaveText('Unsaved');
  expect(await page.evaluate(() => (window as any).__calls.filter((c: any) => c.command === 'save_settings').length)).toBe(0);
  await page.getByRole('button', { name: '⚙ Settings' }).click();
  await page.getByRole('searchbox').fill('Tokyo');
  await page.getByRole('checkbox', { name: 'Tokyo Japan', exact: true }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
  const saved = await page.evaluate(() => (window as any).__calls.filter((c: any) => c.command === 'save_settings').at(-1).args.settings);
  expect(saved).toMatchObject({ language: 'en', year: 'next_year', visible_cities: ['jp-tokyo'] });
});
test('late calculations do not overwrite the newly selected date', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.day-bar')).toHaveCount(8);
  await page.evaluate(() => { (window as any).__delays = { '2026-06-22': 500, '2026-06-23': 20 }; });
  await page.getByRole('button', { name: '翌日', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__calls.some((c: any) => c.args?.date === '2026-06-22'))).toBeTruthy();
  await page.getByRole('button', { name: '翌日', exact: true }).click();
  const tokyo = page.locator('.city-card').filter({ has: page.getByRole('heading', { name: '東京', exact: true }) });
  await expect(tokyo.locator('.sun-times')).toContainText('08:23');
  await page.waitForTimeout(650);
  await expect(tokyo.locator('.sun-times')).toContainText('08:23');
  await expect(tokyo.locator('.sun-times')).not.toContainText('08:22');
});

test('save failure shows the path and can be retried', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.day-bar')).toHaveCount(8);
  await page.evaluate(() => { (window as any).__failSave = true; });
  await page.getByRole('button', { name: '⚙ 設定' }).click();
  await page.getByRole('combobox', { name: '言語', exact: true }).selectOption('en');
  await page.getByRole('combobox', { name: 'Sort order' }).selectOption('south');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('settings.toml');
  await page.evaluate(() => { (window as any).__failSave = false; });
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
});
test('startup failure preserves an actionable retry screen', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__failBootstrap = true; });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('cities.json');
  await page.evaluate(() => { (window as any).__failBootstrap = false; });
  await page.getByRole('button', { name: '再試行' }).click();
  await expect(page.locator('.day-bar')).toHaveCount(8);
});
