import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

test('rejects invalid credentials', async ({ page }) => {
  await login(page, 'admin', 'wrong-password');
  await expect(page.getByTestId('login-error')).toContainText('Invalid credentials');
  await expect(page.getByTestId('login-form')).toBeVisible();
});

test('admin login opens the GIS shell with write workspaces', async ({ page }) => {
  await login(page, 'admin', 'admin123');
  await expect(page.getByTestId('session-user')).toContainText('Administrator');
  await expect(page.getByTestId('nav-gis-dashboard')).toBeVisible();
  await expect(page.getByTestId('nav-feature-editor-and-digitizer')).toBeVisible();
  await expect(page.getByTestId('nav-vector-and-raster-data-import')).toBeVisible();
  await expect(page.getByTestId('nav-spatial-analysis-and-geoprocessing')).toBeVisible();
});

test('viewer RBAC hides digitize, import, and geoprocess workspaces', async ({ page }) => {
  await login(page, 'viewer', 'viewer123');
  await expect(page.getByTestId('session-user')).toContainText('Viewer');
  await expect(page.getByTestId('nav-interactive-map-viewer')).toBeVisible();
  await expect(page.getByTestId('nav-reports-and-seizure-analytics')).toBeVisible();
  await expect(page.getByTestId('nav-feature-editor-and-digitizer')).toHaveCount(0);
  await expect(page.getByTestId('nav-vector-and-raster-data-import')).toHaveCount(0);
  await expect(page.getByTestId('nav-spatial-analysis-and-geoprocessing')).toHaveCount(0);
  await expect(page.getByTestId('nav-user-roles-and-audit-trail')).toHaveCount(0);
});

test('map viewer loads real mandal polygons and zoom-gated village tiles', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const mandalResponse = page.waitForResponse(
    (res) => res.url().includes('/geo/ap-mandals.geojson') && res.ok()
  );
  const psResponse = page.waitForResponse(
    (res) => res.url().includes('/geo/ap-police-stations.geojson') && res.ok()
  );
  await login(page, 'admin', 'admin123');
  await page.getByTestId('nav-interactive-map-viewer').click();
  await expect(page.getByTestId('admin-drill-bar')).toBeVisible();
  await expect(page.getByTestId('admin-drill-state')).toHaveText('Andhra Pradesh');
  await page.getByTestId('layer-toggle-lyr-mandals').check();
  const mandals = await mandalResponse;
  expect(mandals.status()).toBe(200);
  expect((await psResponse).status()).toBe(200);
  await expect(page.getByTestId('mandal-layer-ready')).toHaveAttribute(
    'data-count',
    '654'
  );
  await expect(page.getByTestId('ps-layer-ready')).toHaveAttribute('data-count', '99');
  await page.getByPlaceholder('Filter rows in active view...').fill('Araku-PS');
  await page.getByTestId('ps-row-araku_ps').click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Araku-PS');

  await page.getByTestId('layer-toggle-lyr-villages').check();
  const villageResponse = page.waitForResponse(
    (res) => res.url().includes('/geo/villages/') && res.ok(),
    { timeout: 45_000 }
  );
  const zoomReadout = page.getByTestId('map-zoom');
  for (let i = 0; i < 8; i += 1) {
    const current = Number.parseFloat((await zoomReadout.textContent()) ?? '0');
    if (current >= 9) break;
    await page.getByTestId('map-zoom-in').click();
    await expect(zoomReadout).not.toHaveText(current.toFixed(1), { timeout: 8_000 });
  }
  await expect(zoomReadout).toHaveText(/^(9|1\d)/);
  await villageResponse;
  await expect(page.getByTestId('village-layer-ready')).toBeAttached({ timeout: 20_000 });
});

test('header search flies to a KMZ police station', async ({ page }) => {
  test.setTimeout(60_000);
  const psResponse = page.waitForResponse(
    (res) => res.url().includes('/geo/ap-police-stations.geojson') && res.ok()
  );
  await login(page, 'admin', 'admin123');
  await psResponse;
  await page.getByTestId('header-search').fill('Araku-PS');
  await page.getByRole('button', { name: /Araku-PS/ }).click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Araku-PS');
});
