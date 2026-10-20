import {test, expect} from '@playwright/test';

test('A stale lazy chunk reloads exactly once and then shows a recoverable fallback', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('hospeda-live-mode', 'off'));
  await page.goto('/login');
  await page.getByLabel('Email', {exact: true}).fill('admin@example.com');
  await page.getByLabel('Contraseña', {exact: true}).fill('test-password-123');
  await page.getByRole('button', {name: 'Ingresar', exact: true}).click();
  await expect(page).toHaveURL(/\/my-day$/);
  await expect(page.locator('main:not([role="status"])')).toBeVisible();
  let chunkRequests = 0, loads = 0;
  await page.route(/\/assets\/guide-[^/]+\.js$/, route => {
    chunkRequests++;
    return route.fulfill({status: 404, headers: {'cache-control': 'no-store'}, body: 'Not found'});
  });
  page.on('load', () => { loads++; });
  await page.getByRole('link', {name: 'Ayuda', exact: true}).click();
  // First failure triggers the single guarded reload; the second failure must not loop.
  await expect(page.getByText('Algo salió mal al mostrar esta pantalla.')).toBeVisible({timeout: 20000});
  await page.waitForTimeout(1500);
  expect(loads).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('crm-chunk-reload-at'))).not.toBeNull();
  expect(chunkRequests).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button', {name: 'Reintentar'})).toBeVisible();
  // Once the chunk is reachable again, "Recargar" recovers the screen.
  await page.unroute(/\/assets\/guide-[^/]+\.js$/);
  await page.getByRole('button', {name: 'Recargar'}).click();
  await expect(page.getByText('Algo salió mal al mostrar esta pantalla.')).toHaveCount(0);
  await expect(page.locator('main:not([role="status"])')).toBeVisible();
});

test('A failed Hoy view recovers when the seller goes back to another view', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('hospeda-live-mode', 'off'));
  await page.goto('/login');
  await page.getByLabel('Email', {exact: true}).fill('admin@example.com');
  await page.getByLabel('Contraseña', {exact: true}).fill('test-password-123');
  await page.getByRole('button', {name: 'Ingresar', exact: true}).click();
  await expect(page).toHaveURL(/\/my-day$/);
  await expect(page.getByRole('tab', {name: 'Lista', exact: true})).toHaveAttribute('aria-selected', 'true');
  await page.route(/\/assets\/reactivation-[^/]+\.js$/, route => route.abort());
  // A reload already happened recently, so the boundary must recover in place (no second reload).
  await page.evaluate(() => sessionStorage.setItem('crm-chunk-reload-at', String(Date.now())));
  let loads = 0;
  page.on('load', () => { loads++; });
  await page.getByRole('tab', {name: 'Para retomar', exact: true}).click();
  await expect(page).toHaveURL(/\/my-day\?view=retomar$/);
  await expect(page.getByText('Algo salió mal al mostrar esta pantalla.')).toBeVisible({timeout: 20000});
  // Same pathname, different ?view: the route error boundary must reset.
  await page.goBack();
  await expect(page).toHaveURL(/\/my-day$/);
  await expect(page.getByText('Algo salió mal al mostrar esta pantalla.')).toHaveCount(0);
  await expect(page.getByRole('tab', {name: 'Lista', exact: true})).toHaveAttribute('aria-selected', 'true');
  expect(loads).toBe(0);
});
