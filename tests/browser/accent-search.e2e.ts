import { test, expect } from '@playwright/test';
import superjson from 'superjson';

test('free business search matches accents and preserves the original label', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hospeda-live-mode', 'off'));
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(/my-day$/);
  const marker = `Búsqueda E2E ${Date.now()}`;
  const name = `${marker} Colón`;
  const created = await page.evaluate(async body => {
    const response = await fetch('/_api/commercial', { method: 'POST', body });
    return { status: response.status, text: await response.text() };
  }, superjson.stringify({ action: 'account_save', nombre: name }));
  expect(created.status).toBe(200);
  const { id } = superjson.parse<{ id: string }>(created.text);
  try {
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Grilla', exact: true }).click();
    const search = page.getByRole('textbox',{name:'Buscar negocios',exact:true});
    for (const query of [`${marker} Colon`, `${marker} COLÓN`, `${marker} Colo\u0301n`]) {
      const response = page.waitForResponse(r => r.url().includes('/_api/leads?') && new URL(r.url()).searchParams.get('q') === query);
      await search.fill(query);
      expect((await response).status()).toBe(200);
      await expect(page.locator(`[data-business-id="${id}"]`)).toBeVisible();
      await expect(page.getByRole('button', { name: `Abrir negocio ${name}`, exact: true })).toBeVisible();
      await expect(search).toHaveValue(query);
    }
    await search.fill(`${marker} inexistente`);
    await expect(page.locator(`[data-business-id="${id}"]`)).toHaveCount(0);
  } finally {
    const status = await page.evaluate(async body => (await fetch('/_api/commercial', { method: 'POST', body })).status,
      superjson.stringify({ action: 'account_archive', accountId: id, archived: true, reason: 'Fin de prueba de búsqueda' }));
    expect(status).toBe(200);
  }
});
