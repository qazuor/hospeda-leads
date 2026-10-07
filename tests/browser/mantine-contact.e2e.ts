import { test, expect } from '@playwright/test';
import superjson from 'superjson';
import { basePreferences } from '../../src/helpers/businessListPreferences';

for (const width of [1280, 390]) for (const dark of [false, true]) {
  test(`Mantine contact search, focus and layout at ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [], writes: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ preferences, dark }) => {
      localStorage.setItem('hospeda-live-mode', 'off');
      localStorage.setItem('hospeda-theme-mode', dark ? 'dark' : 'light');
      localStorage.setItem('hospeda-business-list-v1-user-3', JSON.stringify({ preferences, context: { page: 1, scrollY: 0, scrollX: 0 } }));
    }, { preferences: { ...basePreferences(), columns: ['nombre', 'actions'], pins: {} }, dark });
    const account = { id: '1', nombre: 'Negocio de prueba', ciudad: 'Concepción', assignedUserEmail: 'owner@example.com', tipo: 'Alojamientos', archivedAt: null, telefono: '123', email: 'fixture@example.com' };
    const opportunities = [
      { id: '11', accountId: '1', opportunityName: 'Presentación Concepción', estado: 'Cargado', assignedUserEmail: 'owner@example.com' },
      { id: '12', accountId: '1', opportunityName: 'Otra propuesta', estado: 'Cargado', assignedUserEmail: 'owner@example.com' },
      { id: '13', accountId: '1', opportunityName: 'Gestión cerrada', estado: 'Cerrada', assignedUserEmail: 'owner@example.com' },
    ];
    await page.route('**/_api/**', async route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== 'GET') writes.push(url.pathname);
      let data: unknown = {};
      if (url.pathname.endsWith('/auth/session')) data = { user: { id: 3, email: 'owner@example.com', displayName: 'Owner', role: 'user' } };
      else if (url.pathname.endsWith('/business_list_defaults')) data = { defaults: null };
      else if (url.pathname.endsWith('/saved_views')) data = { views: [] };
      else if (url.pathname.endsWith('/settings')) data = { users: [], cities: [], types: [], subtypes: [], contactChannels: ['WhatsApp', 'Email'], templates: [], authorizedEmails: [], opportunityStages: [] };
      else if (url.pathname.endsWith('/commercial')) data = { account, opportunities, contacts: [], journal: [], leadJournal: [], stages: [] };
      else if (url.pathname.endsWith('/communication')) data = { recentMessages: [], messages: [], resources: [] };
      else if (url.pathname.endsWith('/pipeline')) data = { stages: [{ name: 'Cargado', classification: 'open' }, { name: 'Cerrada', classification: 'lost' }] };
      else if (url.pathname.endsWith('/leads')) data = { rows: [{ ...account, accountId: '1', canModify: true, opportunityCount: 3, contactCount: 0 }], total: 1, page: 1, pageSize: 50, filters: { ciudades: [], estados: [], tipos: [], asignados: [], suscripciones: [], origenes: [], quienesCargaron: [], mediosContacto: [], creadosPor: [] } };
      await route.fulfill({ contentType: 'application/json', body: superjson.stringify(data) });
    });
    await page.goto('/accounts');
    const trigger = page.getByRole('group', { name: 'Acciones de Negocio de prueba' }).getByRole('button', { name: 'Contactar', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Contactar', exact: true });
    const search = dialog.getByRole('combobox', { name: 'Gestión abierta', exact: true });
    await expect(search).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Continuar con el mensaje' })).toBeDisabled();
    await search.fill('CONCEPCION');
    await expect(dialog.getByRole('listbox',{name:'Gestión abierta',exact:true}).getByRole('option')).toHaveCount(1);
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(search).toHaveValue('Presentación Concepción · Cargado');
    await expect(dialog.getByRole('button', { name: 'Continuar con el mensaje' })).toBeEnabled();
    await search.fill('zzz');
    await expect(dialog.getByText('Sin resultados', { exact: true })).toBeVisible();
    await search.fill('');
    await expect(dialog.getByRole('listbox',{name:'Gestión abierta',exact:true}).getByRole('option')).toHaveCount(2);
    await expect(dialog.getByRole('listbox',{name:'Gestión abierta',exact:true}).getByRole('option', { name: /Gestión cerrada/ })).toHaveCount(0);
    await search.press('Escape');
    await expect(dialog).toBeVisible();
    await search.press('Tab');
    await expect(search).toHaveValue('Presentación Concepción · Cargado');
    await dialog.getByRole('combobox', { name: 'Canal', exact: true }).selectOption('email');
    const secondary = dialog.getByRole('button', { name: 'Agregar o editar teléfono o email', exact: true });
    const colors = await secondary.evaluate(element => ({
      background: getComputedStyle(element).backgroundColor,
      text: getComputedStyle(element).color,
      pageBackground: getComputedStyle(document.body).backgroundColor,
    }));
    expect(colors.text).not.toBe(colors.background);
    const pageBrightness = colors.pageBackground.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b) / 3;
    expect(dark ? pageBrightness < 100 : pageBrightness > 200).toBe(true);
    const contrast = await dialog.getByRole('button', { name: 'Continuar con el mensaje' }).evaluate(element => {
      const luminance = (color: string) => {
        const rgb = color.match(/\d+/g)!.slice(0, 3).map(value => {
          const channel = Number(value) / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const style = getComputedStyle(element), a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/mantine-contact-${width}-${dark ? 'dark' : 'light'}.png`, animations: 'disabled' });
    // Keyboard focus stays inside the dialog, including after cycling backwards.
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
