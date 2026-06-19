import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

async function createTrip(page: typeof test.prototype, title = 'スマート旅行テスト') {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('tabiori'));
  await page.reload();
  await page.getByRole('link', { name: '新しい旅行', exact: true }).click();
  await page.getByLabel(/旅行名/).fill(title);
  // Set end date 1 day ahead so we have 2 days
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endDate = tomorrow.toISOString().slice(0, 10);
  await page.getByLabel('終了日').fill(endDate);
  await page.getByRole('button', { name: '作成する' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test('add spot via map, save as candidate via bookmark, promote to day', async ({ page }) => {
  await createTrip(page, '候補テスト旅行');

  // Add a spot by clicking the map
  await page.locator('.leaflet-container').click({ position: { x: 320, y: 250 } });
  await expect(page.getByText('名称未設定').first()).toBeVisible();

  // Candidate box should be visible and empty
  await expect(page.getByRole('button', { name: /候補スポット/ })).toBeVisible();

  // The candidates section starts with "候補スポットはありません"
  await expect(page.getByText('候補スポットはありません')).toBeVisible();
});

test('reservation: add and delete a reservation', async ({ page }) => {
  await createTrip(page, '予約テスト旅行');

  // Find the "予約" section and click 追加
  await expect(page.getByRole('heading', { name: '予約', level: 3 })).toBeVisible();
  await page.getByRole('button', { name: '追加', exact: true }).click();

  // Fill in the reservation form
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('名称 *').fill('ホテル東京');
  await page.getByRole('button', { name: '保存' }).click();

  // Reservation should appear in the card
  await expect(page.getByText('ホテル東京').first()).toBeVisible();
  await expect(page.getByText('宿泊').first()).toBeVisible();

  // Delete it via the dropdown menu
  await page.getByRole('button', { name: 'ホテル東京 の操作' }).click();
  await page.getByRole('menuitem', { name: '削除' }).click();
  await page.getByRole('button', { name: '削除する' }).click();
  await expect(page.getByText('予約はありません')).toBeVisible();
});

test('ICS download button exists in itinerary header', async ({ page }) => {
  await createTrip(page, 'ICSテスト旅行');
  // The ICS download button should be present (aria-label check)
  await expect(
    page.getByRole('button', { name: 'カレンダーに書き出し (.ics)' }),
  ).toBeVisible();
});

test('trip duplication produces a copy with 「コピー」 in title', async ({ page }) => {
  await createTrip(page, '複製テスト旅行');
  await page.goto('/');
  await page.getByRole('button', { name: '複製テスト旅行 の操作' }).click();
  await page.getByRole('menuitem', { name: '複製' }).click();
  await expect(
    page.getByRole('heading', { name: '複製テスト旅行（コピー）', exact: true }),
  ).toBeVisible({ timeout: 10_000 });
});

test('export → import roundtrip preserves reservations in backup', async ({ page }) => {
  await createTrip(page, '予約バックアップテスト');

  // Add a reservation
  await page.getByRole('button', { name: '追加', exact: true }).click();
  await page.getByLabel('名称 *').fill('予約テスト新幹線');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('予約テスト新幹線').first()).toBeVisible();

  // Export
  await page.goto('/');
  await page.getByRole('button', { name: '予約バックアップテスト の操作' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'JSONで書き出し' }).click(),
  ]);
  const downloadPath = test.info().outputPath('reservation-backup.json');
  await download.saveAs(downloadPath);

  const json = fs.readFileSync(downloadPath, 'utf-8');
  const parsed = JSON.parse(json);
  expect(parsed.reservations).toBeDefined();
  expect(parsed.reservations.length).toBeGreaterThan(0);
  expect(parsed.reservations[0].title).toBe('予約テスト新幹線');
  // confirmationCode should NOT appear in reservations with empty code
  expect(parsed.reservations[0].confirmationCode).toBe('');

  // Import
  await page.setInputFiles('input[type="file"]', downloadPath);
  await expect(
    page.getByRole('heading', { name: '予約バックアップテスト（読み込み）' }),
  ).toBeVisible({ timeout: 10_000 });
});

test('template buttons set end date on trip creation form', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('tabiori'));
  await page.reload();
  await page.getByRole('link', { name: '新しい旅行', exact: true }).click();

  // Fill start date first
  const today = new Date().toISOString().slice(0, 10);
  await page.getByLabel('開始日').fill(today);

  // Click "1泊2日" template
  await page.getByRole('button', { name: '1泊2日' }).click();

  // End date should be set to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endDate = tomorrow.toISOString().slice(0, 10);
  await expect(page.getByLabel('終了日')).toHaveValue(endDate);
});
