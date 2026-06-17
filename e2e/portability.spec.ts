import fs from 'node:fs';
import { expect, test } from '@playwright/test';

// Desktop viewport so the itinerary shows the list + map split (map is needed
// to add a spot by clicking).
test.use({ viewport: { width: 1280, height: 800 } });

test('export a trip to JSON, re-import it, open it, and reach the print view', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('tabiori'));
  await page.reload();

  // Create a trip and add one spot.
  await page.getByRole('link', { name: '新しい旅行', exact: true }).click();
  await page.getByLabel(/旅行名/).fill('東北周遊');
  await page.getByLabel('概要').fill('みちのくの名所めぐり');
  await page.getByRole('button', { name: '作成する' }).click();

  await expect(page.getByRole('heading', { name: '東北周遊' })).toBeVisible();
  await page.locator('.leaflet-container').click({ position: { x: 320, y: 250 } });
  await expect(page.getByText('名称未設定').first()).toBeVisible();

  // Back to the trip list (deterministic; trip persists in IndexedDB).
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '東北周遊', exact: true })).toBeVisible();

  // Export via the card menu and capture the download.
  await page.getByRole('button', { name: '東北周遊 の操作' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'JSONで書き出し' }).click(),
  ]);
  const downloadPath = test.info().outputPath('trip-backup.json');
  await download.saveAs(downloadPath);

  const json = fs.readFileSync(downloadPath, 'utf-8');
  expect(json).toContain('"format": "tabiori-trip-backup"');
  expect(json).toContain('東北周遊');

  // Import the saved file: a new trip should appear in the list.
  await page.setInputFiles('input[type="file"]', downloadPath);
  await expect(page.getByRole('heading', { name: '東北周遊（読み込み）' })).toBeVisible({
    timeout: 10_000,
  });

  // The original trip is still there too (no overwrite).
  await expect(page.getByRole('heading', { name: '東北周遊', exact: true })).toBeVisible();

  // Open the imported trip.
  await page.getByRole('button', { name: '東北周遊（読み込み） を開く' }).click();
  await expect(page.getByRole('heading', { name: '東北周遊（読み込み）' })).toBeVisible();

  // The print button exists and the print-only itinerary is in the DOM.
  await expect(page.getByRole('button', { name: '印刷／PDFに保存' })).toBeVisible();
  await expect(page.getByText('旅のしおり')).toBeAttached();
});
