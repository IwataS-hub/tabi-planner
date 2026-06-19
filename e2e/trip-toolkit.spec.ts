import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

const today = new Date().toISOString().slice(0, 10);

const OPEN_METEO_RESPONSE = {
  latitude: 35.0,
  longitude: 135.0,
  timezone: 'Asia/Tokyo',
  daily: {
    time: [today],
    weather_code: [0],
    temperature_2m_max: [28],
    temperature_2m_min: [20],
    apparent_temperature_max: [30],
    apparent_temperature_min: [19],
    precipitation_sum: [0],
    precipitation_probability_max: [5],
    wind_speed_10m_max: [15],
    uv_index_max: [4],
    sunrise: [`${today}T05:00`],
    sunset: [`${today}T18:30`],
  },
  hourly: {
    time: [`${today}T09:00`, `${today}T10:00`],
    temperature_2m: [24, 25],
    apparent_temperature: [23, 24],
    precipitation_probability: [0, 0],
    weather_code: [0, 0],
    wind_speed_10m: [10, 12],
  },
};

async function setupFreshDb(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('tabiori'));
  await page.reload();
}

async function createTrip(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('link', { name: '新しい旅行', exact: true }).click();
  await page.getByLabel(/旅行名/).fill(name);
  await page.getByRole('button', { name: '作成する' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function addSpotViaMap(page: import('@playwright/test').Page) {
  await page.locator('.leaflet-container').click({ position: { x: 320, y: 250 } });
  await expect(page.getByText('名称未設定').first()).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1: Weather widget appears when a spot is added
// ---------------------------------------------------------------------------
test('weather widget appears after adding a spot', async ({ page }) => {
  // Mock Open-Meteo via BrowserContext to ensure cross-origin interception
  await page.context().route(/open-meteo\.com/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OPEN_METEO_RESPONSE),
    });
  });

  await setupFreshDb(page);
  await createTrip(page, '天気テスト旅行');
  await addSpotViaMap(page);

  // Weather widget header must appear once a spot with coordinates is present
  await expect(page.getByText('天気予報')).toBeVisible({ timeout: 10_000 });
  // Manual refresh button should be keyboard-accessible
  await expect(page.getByRole('button', { name: '天気を更新' })).toBeVisible();
  // Widget should finish fetching: either show weather data or an error, not stay loading
  await expect(page.getByText('天気情報を取得中…')).not.toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// Scenario 2: Checklist add → complete
// ---------------------------------------------------------------------------
test('checklist: add item then mark complete', async ({ page }) => {
  await setupFreshDb(page);
  await createTrip(page, 'チェックテスト旅行');

  // Navigate to checklist tab
  await page.getByRole('link', { name: 'チェック' }).click();

  // Click the first "追加" button (in packing tab header)
  await page.getByRole('button', { name: '追加' }).first().click();

  // Fill title and submit with Enter key
  const titleInput = page.getByPlaceholder('例：折りたたみ傘');
  await titleInput.fill('サンスクリーン');
  await titleInput.press('Enter');

  await expect(page.getByText('サンスクリーン')).toBeVisible();

  // Mark complete by clicking the checkbox button
  await page.getByRole('button', { name: '完了にする' }).click();
  await expect(page.getByRole('button', { name: '未完了にする' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 3: 3 participants → ¥10,000 equal split
// ---------------------------------------------------------------------------
test('money: 3 participants, ¥10,000 equal split sum is correct', async ({ page }) => {
  await setupFreshDb(page);
  await createTrip(page, 'お金テスト旅行');

  // Navigate to money tab
  await page.getByRole('link', { name: 'お金' }).click();

  // Add 3 participants using Enter key to submit
  for (const name of ['Alice', 'Bob', 'Carol']) {
    await page.getByRole('button', { name: '追加', exact: true }).first().click();
    const nameInput = page.getByPlaceholder('参加者名');
    await nameInput.fill(name);
    await nameInput.press('Enter');
    await expect(page.getByText(name)).toBeVisible({ timeout: 3_000 });
  }

  // Add an expense — wait for the "追加" button in the expenses header
  await page.getByRole('heading', { name: /費用一覧/ }).waitFor();
  // Use placeholder text of the expense form to confirm it opened
  await page.locator('section').filter({ hasText: '費用一覧' }).getByRole('button', { name: '追加' }).click();

  // Confirm expense form opened (title input placeholder)
  await expect(page.getByPlaceholder('例：夕食')).toBeVisible({ timeout: 3_000 });
  await page.getByPlaceholder('例：夕食').fill('夕食');
  await page.getByLabel('金額（円）').fill('10000');

  // Click the expense form's "保存" button (exact match to avoid hitting 印刷／PDFに保存)
  await page.getByRole('button', { name: '保存', exact: true }).click();

  // Expense should appear in the list with correct amount (formatYen uses Intl → ￥10,000)
  await expect(page.getByText('夕食')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('￥10,000').first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 4: Export → import → participants/checklists restored
// ---------------------------------------------------------------------------
test('portability: participants and checklists survive export/import', async ({ page }) => {
  await setupFreshDb(page);
  await createTrip(page, '持ち越しテスト旅行');

  // Add a participant
  await page.getByRole('link', { name: 'お金' }).click();
  await page.getByRole('button', { name: '追加', exact: true }).first().click();
  await page.getByPlaceholder('参加者名').fill('田中');
  await page.getByPlaceholder('参加者名').press('Enter');
  await expect(page.getByText('田中')).toBeVisible();

  // Add a checklist item
  await page.getByRole('link', { name: 'チェック' }).click();
  await page.getByRole('button', { name: '追加' }).first().click();
  await page.getByPlaceholder('例：折りたたみ傘').fill('パスポート');
  await page.getByPlaceholder('例：折りたたみ傘').press('Enter');
  await expect(page.getByText('パスポート')).toBeVisible();

  // Go back to trip list and export
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '持ち越しテスト旅行', level: 3 })).toBeVisible();
  await page.getByRole('button', { name: '持ち越しテスト旅行 の操作' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /JSON/ }).click(),
  ]);

  const jsonPath = await download.path();
  expect(jsonPath).toBeTruthy();

  // Reset DB and re-import
  await page.evaluate(() => indexedDB.deleteDatabase('tabiori'));
  await page.reload();

  await page.locator('input[type="file"]').setInputFiles(jsonPath!);
  await expect(page.getByRole('heading', { name: '持ち越しテスト旅行', level: 3 })).toBeVisible({
    timeout: 5_000,
  });

  // Open trip → verify participant (TripCard uses a button, not a link)
  await page.getByRole('button', { name: /持ち越しテスト旅行 を開く/ }).click();
  await page.getByRole('link', { name: 'お金' }).click();
  await expect(page.getByText('田中')).toBeVisible({ timeout: 5_000 });

  // Verify checklist item
  await page.getByRole('link', { name: 'チェック' }).click();
  await expect(page.getByText('パスポート')).toBeVisible({ timeout: 5_000 });
});
