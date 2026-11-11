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

test('admin login opens the GIS shell with core workspaces', async ({ page }) => {
  await login(page, 'admin', 'admin123');
  await expect(page.getByTestId('session-user')).toContainText('Administrator');
  await expect(page.getByTestId('nav-ndps-spatial-dashboard')).toBeVisible();
  await expect(page.getByTestId('nav-atlas')).toBeVisible();
  await expect(page.getByTestId('nav-mobile-locus-export')).toBeVisible();
  await expect(page.getByTestId('nav-interactive-map')).toHaveCount(0);
  await expect(page.getByTestId('nav-feature-editor')).toHaveCount(0);
  await expect(page.getByTestId('nav-import-export')).toHaveCount(0);
});

test('viewer RBAC hides admin and export workspaces', async ({ page }) => {
  await login(page, 'viewer', 'viewer123');
  await expect(page.getByTestId('session-user')).toContainText('Viewer');
  await expect(page.getByTestId('nav-ndps-spatial-dashboard')).toBeVisible();
  await expect(page.getByTestId('nav-atlas')).toBeVisible();
  await expect(page.getByTestId('nav-reports-seizure-analytics')).toBeVisible();
  await expect(page.getByTestId('nav-interactive-map')).toHaveCount(0);
  await expect(page.getByTestId('nav-feature-editor')).toHaveCount(0);
  await expect(page.getByTestId('nav-import-export')).toHaveCount(0);
  await expect(page.getByTestId('nav-users-audit-trail')).toHaveCount(0);
});

test('dashboard map loads and shows India drill bar', async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, 'admin', 'admin123');
  await page.getByTestId('nav-ndps-spatial-dashboard').click();
  await expect(page.getByTestId('dashboard-map')).toBeVisible();
  await expect(page.getByTestId('admin-drill-bar')).toBeVisible();
  await expect(page.getByTestId('admin-drill-india')).toHaveText('India');
});

test('header search focuses a KMZ police station on the dashboard', async ({ page }) => {
  test.setTimeout(60_000);
  const psResponse = page.waitForResponse(
    (res) => res.url().includes('/geo/ap-police-stations.geojson') && res.ok()
  );
  await login(page, 'admin', 'admin123');
  await psResponse;
  await page.getByTestId('header-search').fill('Araku-PS');
  await page.getByRole('button', { name: /Araku-PS/ }).click();
  await expect(page.getByTestId('nav-ndps-spatial-dashboard')).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText(/Araku/i);
});
