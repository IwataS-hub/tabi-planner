import { expect, test, type Page } from '@playwright/test';

// Desktop viewport so the itinerary renders the split (list + map) layout, with
// the search panel always visible above the list.
test.use({ viewport: { width: 1280, height: 800 } });

const SEARCH_BODY = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        place_id: 'kiyomizu-1',
        name: '清水寺',
        formatted: '清水寺, 京都府京都市東山区清水1丁目294',
        address_line1: '清水寺',
        city: '京都市',
        state: '京都府',
        result_type: 'amenity',
        country_code: 'jp',
        lat: 34.9948,
        lon: 135.785,
      },
    },
  ],
};

const REVERSE_BODY = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: '東京タワー',
        formatted: '東京タワー, 東京都港区芝公園4丁目2-8',
        city: '港区',
        state: '東京都',
        result_type: 'amenity',
        country_code: 'jp',
        lat: 35.6586,
        lon: 139.7454,
      },
    },
  ],
};

/** Intercept ALL Geoapify calls so no real network/key is ever used. */
async function mockGeoapify(
  page: Page,
  options: { search?: 'ok' | 'fail'; reverse?: 'ok' | 'fail' } = {},
) {
  const { search = 'ok', reverse = 'ok' } = options;
  await page.route('**/v1/geocode/search**', async (route) => {
    if (search === 'fail') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SEARCH_BODY),
      });
    }
  });
  await page.route('**/v1/geocode/reverse**', async (route) => {
    if (reverse === 'fail') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(REVERSE_BODY),
      });
    }
  });
}

async function createTrip(page: Page, title: string) {
  await page.goto('/');
  await page.evaluate(() => {
    indexedDB.deleteDatabase('tabiori');
  });
  await page.reload();
  await page.getByRole('link', { name: '新しい旅行' }).first().click();
  await page.getByLabel(/旅行名/).fill(title);
  await page.getByRole('button', { name: '作成する' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test('search → select → add → address saved → restored after reload', async ({ page }) => {
  await mockGeoapify(page);
  await createTrip(page, '京都旅行');

  // Run a search and pick the only result.
  await page.getByRole('searchbox', { name: '場所のキーワード' }).fill('清水寺');
  await page.getByRole('button', { name: '検索' }).click();

  const result = page.getByRole('button', { name: '清水寺 を日程に追加' });
  await expect(result).toBeVisible();
  await result.click();

  // The spot is added, selected, and its editor opens with name + address.
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('清水寺');
  await expect(page.getByRole('textbox', { name: '住所' })).toHaveValue(
    '清水寺, 京都府京都市東山区清水1丁目294',
  );

  // Reload: name and address must survive (persisted to IndexedDB).
  await page.reload();
  await expect(page.getByText('清水寺').first()).toBeVisible();
  // Expand the spot's editor (the collapsible row button, not the drag handle).
  await page.getByRole('button', { name: /清水寺/, expanded: false }).click();
  await expect(page.getByRole('textbox', { name: '住所' })).toHaveValue(
    '清水寺, 京都府京都市東山区清水1丁目294',
  );
});

test('map click adds a spot and reverse geocoding fills name + address', async ({ page }) => {
  await mockGeoapify(page);
  await createTrip(page, '東京旅行');

  const map = page.locator('.leaflet-container');
  await expect(map).toBeVisible();
  await map.click({ position: { x: 400, y: 300 } });

  // Added immediately; the background reverse result then fills in name+address.
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('東京タワー');
  await expect(page.getByRole('textbox', { name: '住所' })).toHaveValue(
    '東京タワー, 東京都港区芝公園4丁目2-8',
  );
});

test('a failed search still leaves manual map-click adds working', async ({ page }) => {
  await mockGeoapify(page, { search: 'fail', reverse: 'fail' });
  await createTrip(page, '失敗時の旅行');

  // Search fails → an inline error is shown (not just a toast).
  await page.getByRole('searchbox', { name: '場所のキーワード' }).fill('清水寺');
  await page.getByRole('button', { name: '検索' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  // Manual add via the map still works; reverse failure does not remove it.
  const map = page.locator('.leaflet-container');
  await map.click({ position: { x: 400, y: 300 } });
  await expect(page.getByText('名称未設定').first()).toBeVisible();

  // And it persists across a reload.
  await page.reload();
  await expect(page.getByText('名称未設定').first()).toBeVisible();
});
