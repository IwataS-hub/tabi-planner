import { expect, test, type Page } from '@playwright/test';

// Desktop viewport so the itinerary renders the split (list + map) layout.
test.use({ viewport: { width: 1280, height: 800 } });

const ROUTE_BODY = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { mode: 'walk', distance: 1300, time: 1080 },
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [135.0, 35.0],
            [135.05, 35.02],
            [135.1, 35.05],
          ],
        ],
      },
    },
  ],
};

/**
 * Mock BOTH Geoapify endpoints, kept strictly separate: geocoding (search /
 * reverse) returns nothing so map-click reverse lookups are harmless, while the
 * routing endpoint is what these tests exercise. Returns a routing call counter.
 */
async function mockGeoapify(page: Page, routing: 'ok' | 'fail' | 'no-route' = 'ok') {
  const counter = { routingCalls: 0 };
  await page.route('**/v1/geocode/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
    }),
  );
  await page.route('**/v1/routing**', async (route) => {
    counter.routingCalls += 1;
    if (routing === 'fail') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    } else if (routing === 'no-route') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ROUTE_BODY),
      });
    }
  });
  return counter;
}

async function createTripWithTwoSpots(page: Page, title: string) {
  await page.goto('/');
  await page.evaluate(() => {
    indexedDB.deleteDatabase('tabiori');
  });
  await page.reload();
  await page.getByRole('link', { name: '新しい旅行' }).first().click();
  await page.getByLabel(/旅行名/).fill(title);
  await page.getByRole('button', { name: '作成する' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const map = page.locator('.leaflet-container');
  await expect(map).toBeVisible();
  await map.click({ position: { x: 300, y: 250 } });
  await map.click({ position: { x: 460, y: 360 } });
  // Two spots → exactly one travel leg between them.
  await expect(page.getByRole('group', { name: /への移動/ })).toHaveCount(1);
}

test('compute a walk route: shows time/distance, draws it, and persists across reload', async ({
  page,
}) => {
  const counter = await mockGeoapify(page, 'ok');
  await createTripWithTwoSpots(page, 'ルート計算の旅');

  await page.getByRole('button', { name: /ルートを計算/ }).click();

  // Time + distance appear on the leg (scope to the leg button so the hidden
  // print layout, which repeats the same text, does not cause ambiguity).
  const leg = page.getByRole('button', { name: /地図で表示/ });
  await expect(leg).toContainText('18分・1.3km');
  await expect(page.getByText('自動', { exact: true })).toBeVisible();

  // The real route is highlighted on the map (distinct stroke colour).
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#2f6f8f"]')).toBeVisible();

  const callsAfterCompute = counter.routingCalls;
  expect(callsAfterCompute).toBe(1);

  // Reload: saved time/distance remain; geometry is NOT re-fetched.
  await page.reload();
  await expect(page.getByRole('button', { name: /地図で表示/ })).toContainText('18分・1.3km');
  await expect(page.getByText('自動', { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  expect(counter.routingCalls).toBe(callsAfterCompute);
  // No route shape after reload (only the straight itinerary line remains).
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#2f6f8f"]')).toHaveCount(0);
});

test('a manual travel-time edit clears the auto metadata', async ({ page }) => {
  await mockGeoapify(page, 'ok');
  await createTripWithTwoSpots(page, '手入力の旅');

  await page.getByRole('button', { name: /ルートを計算/ }).click();
  await expect(page.getByText('自動', { exact: true })).toBeVisible();

  // Open the first spot's editor and type a manual travel time.
  await page
    .getByRole('button', { name: /名称未設定/, expanded: false })
    .first()
    .click();
  await page.getByLabel('次への移動（分）').fill('25');

  // The leg now reflects a manual value; the auto badge is gone.
  await expect(page.getByText('手入力', { exact: true })).toBeVisible();
  await expect(page.getByText('自動', { exact: true })).toHaveCount(0);
});

// Note: reorder-driven invalidation of auto estimates is covered deterministically
// by repository unit tests (reorder / delete / duplicate). It is intentionally not
// exercised here because dnd-kit keyboard-drag timing is flaky under Playwright.

test('a failed route calculation shows an inline error and keeps the itinerary', async ({
  page,
}) => {
  await mockGeoapify(page, 'fail');
  await createTripWithTwoSpots(page, '失敗時の旅');

  await page.getByRole('button', { name: /ルートを計算/ }).click();

  // Inline error (not just a toast); the two spots remain.
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('名称未設定').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('名称未設定').first()).toBeVisible();
});

test('public transit links out to Google Maps and never calls Geoapify', async ({ page }) => {
  const counter = await mockGeoapify(page, 'ok');
  await createTripWithTwoSpots(page, '公共交通の旅');

  await page.getByLabel(/移動手段/).selectOption('transit');

  // No calculate/recalculate button for transit — a Google Maps link instead.
  await expect(page.getByRole('button', { name: /ルートを計算|再計算/ })).toHaveCount(0);
  const link = page.getByRole('link', { name: /Google Mapsで確認/ });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toContain('https://www.google.com/maps/dir/');
  expect(href).toContain('api=1');
  expect(href).toContain('travelmode=transit');
  expect(href).not.toContain('apiKey');
  await expect(
    page.getByText('公共交通の時刻・乗換経路はGoogle Mapsで確認し、移動時間を手入力してください。'),
  ).toBeVisible();

  // Geoapify routing must never be called for transit; no route is drawn.
  await page.waitForTimeout(200);
  expect(counter.routingCalls).toBe(0);
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#2f6f8f"]')).toHaveCount(0);
});
