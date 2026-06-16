import { expect, test } from '@playwright/test';

// Use a desktop viewport so the itinerary renders the split (list + map) layout.
test.use({ viewport: { width: 1280, height: 800 } });

test('create a trip, add a spot on the map, and persist across reload', async ({ page }) => {
  // Start from a clean local database so the run is deterministic.
  await page.goto('/');
  await page.evaluate(async () => {
    indexedDB.deleteDatabase('tabiori');
  });
  await page.reload();

  // Empty state → start a new trip.
  await page.getByRole('link', { name: '新しい旅行' }).first().click();

  await page.getByLabel(/旅行名/).fill('はじめての京都');
  await page.getByRole('button', { name: '作成する' }).click();

  // We should land on the itinerary screen.
  await expect(page.getByRole('heading', { name: 'はじめての京都' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Day 1/ })).toBeVisible();

  // Click the map to add a spot; it should appear with the default name.
  const map = page.locator('.leaflet-container');
  await expect(map).toBeVisible();
  await map.click({ position: { x: 300, y: 250 } });

  await expect(page.getByText('名称未設定').first()).toBeVisible();

  // Rename the spot via the inline editor (auto-saved).
  const nameField = page.getByRole('textbox', { name: '名称', exact: true });
  await expect(nameField).toBeVisible();
  await nameField.fill('清水寺');

  // The collapsed list header only shows the new name once the debounced save
  // has been persisted and re-read — so this also proves it reached IndexedDB.
  await expect(page.getByText('清水寺').first()).toBeVisible();

  // Reload: the trip and spot must be restored from IndexedDB.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'はじめての京都' })).toBeVisible();
  await expect(page.getByText('清水寺').first()).toBeVisible();
});
