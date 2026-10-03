import {test, expect} from '@playwright/test';

test('Slow navigation keeps the loading notice aligned with page content', async ({page}) => {
  await page.setViewportSize({width: 1800, height: 1000});
  await page.addInitScript(() => localStorage.setItem('hospeda-live-mode', 'off'));
  await page.goto('/login');
  await page.getByLabel('Email', {exact: true}).fill('admin@example.com');
  await page.getByLabel('Contraseña', {exact: true}).fill('test-password-123');
  await page.getByRole('button', {name: 'Ingresar', exact: true}).click();
  await expect(page).toHaveURL(/\/my-day$/);
  await expect(page.locator('main:not([role="status"])')).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release = resolve;});
  await page.route(/\/assets\/guide-[^/]+\.js$/, async route => {
    await gate;
    await route.continue();
  });
  await page.getByRole('button', {name: 'Más opciones'}).click();
  await page.getByRole('menuitem', {name: 'Guía de uso paso a paso'}).click();
  const loading = page.locator('[data-route-loading]');
  await expect(loading).toBeVisible();
  await expect(loading.locator('div')).toHaveCSS('position', 'static');
  async function edges(selector: string) {
    return page.locator(selector).evaluate(el => {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      return [rect.left + parseFloat(style.paddingLeft), rect.right - parseFloat(style.paddingRight)];
    });
  }
  const loadingEdges = await edges('[data-route-loading]');
  release();
  await expect(loading).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();
  expect(await edges('main')).toEqual(loadingEdges);
});
