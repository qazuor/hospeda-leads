import {test, expect} from '@playwright/test';
import superjson from 'superjson';

test('Beginner help supports scenarios, search, direct links and history', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('hospeda-live-mode', 'off'));
  await page.setViewportSize({width: 1440, height: 1000});
  await page.route('**/_api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/auth/session')
      ? {user: {id: 3, email: 'admin@example.com', displayName: 'Admin', role: 'admin'}}
      : {};
    await route.fulfill({contentType: 'application/json', body: superjson.stringify(data)});
  });
  await page.goto('/guide');
  await expect(page.getByRole('heading', {name: 'Usar Hospeda, paso a paso'})).toBeVisible();
  await page.getByRole('link', {name: /Quiero llevar un negocio hasta una venta/}).click();
  const article = page.getByRole('article');
  await expect(article.getByRole('heading', {name: 'De negocio nuevo a venta cerrada: ejemplo paso a paso'})).toBeVisible();
  await expect(article.locator('ol > li')).toHaveCount(12);
  await page.getByLabel('¿Qué necesitás hacer?').fill('no respondio');
  await expect(page.getByRole('heading', {name: 'Resultados de ayuda'})).toBeVisible();
  await page.getByRole('link', {name: /No respondió o pidió esperar/}).click();
  await expect(article.getByRole('heading', {name: 'No respondió o pidió esperar'})).toBeVisible();
  await expect(article.getByText(/No se envían mensajes ni se reabre o cierra/)).toBeVisible();
  await expect(page.getByLabel('¿Qué necesitás hacer?')).toHaveValue('');
  await page.goBack();
  await expect(article.getByRole('heading', {name: 'De negocio nuevo a venta cerrada: ejemplo paso a paso'})).toBeVisible();
  await page.goto('/guide?topic=clients&article=care');
  await expect(article.getByRole('heading', {name: 'Acompañar a un cliente'})).toBeVisible();
  await expect(article.getByText(/No crees una gestión solo para registrar una consulta/)).toBeVisible();
  await page.screenshot({path: 'test-results/guide-desktop.png', fullPage: true, animations: 'disabled'});
  await page.getByLabel('¿Qué necesitás hacer?').fill('xyzningunaexplicacion');
  await expect(page.getByText('Probá con otra palabra o volvé a los temas de la guía.')).toBeVisible();
  await page.getByRole('button', {name: 'Ver todos los temas'}).click();
  await page.setViewportSize({width: 390, height: 844});
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path: 'test-results/guide-mobile.png', fullPage: true, animations: 'disabled'});
  await page.addStyleTag({content: '*,*::before,*::after{transition:none!important}'});
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({path: 'test-results/guide-dark-mobile.png', fullPage: true, animations: 'disabled'});
});
