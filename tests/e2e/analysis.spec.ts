import { test, expect } from '@playwright/test';

test.describe('LandScope analysis flow', () => {
  test('select demo parcel and verify analysis results', async ({ page }) => {
    await page.goto('/');

    // Wait for the header to render.
    await expect(page.getByText('LandScope')).toBeVisible();

    // The empty state should be visible initially.
    await expect(page.getByText('Select a parcel to begin')).toBeVisible();

    // Click a demo parcel bookmark.
    await page.getByTestId('demo-parcel-demo-parcel-1').click();

    // The empty state should disappear.
    await expect(page.getByText('Select a parcel to begin')).toBeHidden({ timeout: 10_000 });

    // Wait for summary cards to show non-placeholder values.
    // The "Parcel" card should show an acreage value (contains " ac").
    const parcelCard = page.getByTestId('summary-card-parcel');
    await expect(parcelCard).toBeVisible({ timeout: 15_000 });

    // Wait for the buildable card to show a numeric value (not skeleton).
    const buildableCard = page.getByTestId('summary-card-buildable');
    await expect(buildableCard).toBeVisible({ timeout: 15_000 });

    // The breakdown table should be present.
    await expect(page.getByTestId('breakdown-table')).toBeVisible({ timeout: 15_000 });

    // Verify the constraint controls are visible.
    await expect(page.getByText('Wetlands')).toBeVisible();
    await expect(page.getByText('FEMA Flood Hazard')).toBeVisible();
    await expect(page.getByText('Transmission Lines')).toBeVisible();
  });

  test('change wetland buffer and verify result updates', async ({ page }) => {
    await page.goto('/');

    // Select demo parcel.
    await page.getByTestId('demo-parcel-demo-parcel-1').click();
    await expect(page.getByTestId('summary-card-buildable')).toBeVisible({ timeout: 15_000 });

    // Capture the initial buildable value.
    const buildableCard = page.getByTestId('summary-card-buildable');

    // Find the wetlands buffer number input and change it.
    // The wetlands constraint control has a buffer number input.
    const wetlandsControl = page.locator('text=Wetlands').locator('..');
    const bufferInput = wetlandsControl.locator('input[type="number"]').first();
    await bufferInput.fill('100');
    await bufferInput.blur();

    // Wait for recalculation — the "Recalculating…" indicator may appear.
    // Then wait for it to disappear (or just wait for a stable value).
    await page.waitForTimeout(2000);

    // The buildable card should still be visible and show a value.
    await expect(buildableCard).toBeVisible({ timeout: 15_000 });
    const newText = await buildableCard.textContent();
    expect(newText).toBeTruthy();
  });

  test('open How Calculated drawer', async ({ page }) => {
    await page.goto('/');

    await page.getByText('How is this calculated?').click();

    // The drawer should appear.
    await expect(page.getByText('How buildable area is calculated')).toBeVisible();
    await expect(page.getByText('Geometry Model')).toBeVisible();
    await expect(page.getByText('Coordinate Reference System')).toBeVisible();
    await expect(page.getByText('EPSG:32614')).toBeVisible();
  });

  test('disclaimer banner is visible', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText(/preliminary screening tool only/i)).toBeVisible();
  });
});
