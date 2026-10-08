import { test, expect } from '@playwright/test';
import superjson from 'superjson';
import { basePreferences } from '../../src/helpers/businessListPreferences';

for (const width of [1280, 390]) test(`edit filter badges and save the reviewed draft as a personal view at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const filters = [{ rules: [{ field: 'ciudad', operator: 'eq', value: 'Colón' }, { field: 'ciudad', operator: 'neq', value: 'Concordia' }] }, { rules: [{ field: 'tipo', operator: 'eq', value: 'Alojamientos' }] }];
  const preferences = { ...basePreferences(), query: 'Inicial', filters, legacyFilters: { classification: 'open' } };
  const requests: any[] = [], mutations: any[] = []; let saved: any[] = [], fail = true;
  let release!: () => void; const slow = new Promise<void>(resolve => { release = resolve; });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ preferences, dark }) => {
    localStorage.setItem('hospeda-live-mode', 'off');
    localStorage.setItem('hospeda-business-list-v1-user-3', JSON.stringify({ preferences, context: { page: 1, scrollY: 0, scrollX: 0 } }));
    if (dark) localStorage.setItem('hospeda-theme-mode', 'dark');
  }, { preferences, dark: width === 390 });
  await page.route('**/_api/**', async route => {
    const url = new URL(route.request().url()); let data: unknown = {}, status = 200;
    if (url.pathname.endsWith('/auth/session')) data = { user: { id: 3, email: 'owner@example.com', displayName: 'Owner', role: 'user' } };
    else if (url.pathname.endsWith('/business_list_defaults')) data = { defaults: null };
    else if (url.pathname.endsWith('/settings')) data = { users: [], cities: [{ id: '1', name: 'Colón' }, { id: '2', name: 'Concordia' }], types: ['Alojamientos'], subtypes: [], templates: [], authorizedEmails: [], opportunityStages: [] };
    else if (url.pathname.endsWith('/saved_views')) {
      if (route.request().method() === 'POST') {
        const input = superjson.parse<any>(route.request().postData()!); mutations.push(input);
        if (fail) { fail = false; status = 400; data = { error: 'No pude guardar. Intentá nuevamente.' }; }
        else { await slow; saved.push(input.view); data = { ok: true }; }
      } else data = { views: saved };
    } else if (url.pathname.endsWith('/leads')) {
      requests.push({ query: url.searchParams.get('q'), filters: JSON.parse(url.searchParams.get('filterGroups') || '[]'), classification: url.searchParams.get('classification') });
      data = { rows: [], total: 0, page: 1, pageSize: 50, filters: { ciudades: [], estados: [], tipos: [], asignados: [], suscripciones: [], origenes: [], quienesCargaron: [], mediosContacto: [], creadosPor: [] } };
    }
    await route.fulfill({ status, contentType: 'application/json', body: superjson.stringify(data) });
  });
  await page.goto('/accounts');
  const legend = page.getByLabel('Filtros aplicados', { exact: true });
  const city = legend.getByRole('button', { name: 'Editar filtro Ciudad es Colón', exact: true });
  await city.click(); let popup = page.getByRole('dialog', { name: 'Editar condición de filtro', exact: true });
  await popup.getByRole('combobox', { name: 'Valor del filtro' }).selectOption('Concordia');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: `test-results/editable-filter-popover-${width}.png`, animations: 'disabled' });
  await popup.getByRole('button', { name: 'Cancelar', exact: true }).click(); await expect(city).toBeFocused();
  await page.keyboard.press('Enter'); await expect(popup).toBeVisible(); await expect(popup.getByRole('combobox', { name: 'Valor del filtro' })).toHaveValue('Colón');
  await page.keyboard.press('Escape'); await expect(popup).toHaveCount(0); await expect(city).toBeFocused();
  await city.click(); await popup.getByRole('combobox', { name: 'Valor del filtro' }).selectOption('Concordia');
  await popup.getByRole('button', { name: 'Aplicar condición', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.filters[0].rules[0].value).toBe('Concordia');
  expect(requests.at(-1).filters[0].rules[1]).toEqual(filters[0].rules[1]); expect(requests.at(-1).filters[1]).toEqual(filters[1]); expect(requests.at(-1).classification).toBe('open');
  await legend.getByRole('button', { name: 'Editar filtro Ciudad no es Concordia', exact: true }).click();
  await popup.getByRole('button', { name: 'Quitar este filtro', exact: true }).click();
  await expect(legend.getByText('OR', { exact: true })).toHaveCount(0);
  await legend.getByRole('button', { name: 'Editar filtro Vertical es Alojamientos', exact: true }).click();
  await popup.getByRole('combobox', { name: 'Condición del filtro' }).selectOption('empty'); await expect(popup.getByRole('combobox', { name: 'Valor del filtro' })).toHaveCount(0);
  await popup.getByRole('button', { name: 'Aplicar condición', exact: true }).click();
  await expect(legend.getByRole('button', { name: 'Editar filtro Vertical sin valor', exact: true })).toBeVisible();
  await legend.getByRole('button', { name: 'Editar filtro Vertical sin valor', exact: true }).click(); await popup.getByRole('button', { name: 'Quitar este filtro', exact: true }).click();
  await legend.getByRole('button', { name: 'Editar filtro Texto libre contiene «Inicial»', exact: true }).click(); popup = page.getByRole('dialog', { name: 'Editar búsqueda aplicada', exact: true });
  await popup.getByRole('textbox', { name: 'Búsqueda aplicada', exact: true }).fill(''); await expect(popup.getByRole('button', { name: 'Aplicar condición', exact: true })).toBeDisabled();
  await popup.getByRole('textbox', { name: 'Búsqueda aplicada', exact: true }).fill('Revisada'); await popup.getByRole('button', { name: 'Aplicar condición', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Buscar negocios', exact: true })).toHaveValue('Revisada');
  await page.getByRole('button', { name: 'Editar filtros', exact: true }).click(); const builder = page.getByRole('dialog', { name: 'Filtrar negocios', exact: true });
  await builder.getByRole('textbox', { name: 'Texto libre de búsqueda', exact: true }).fill('Contextual');
  await builder.getByRole('button', { name: 'Aplicar y guardar como vista', exact: true }).click();
  const save = page.getByRole('dialog', { name: 'Guardar como vista', exact: true }); await expect(save).toBeVisible(); await expect(builder).toHaveCount(0);
  const name = save.getByRole('textbox', { name: 'Nombre de la vista', exact: true }); await name.fill('Vista revisada');
  await save.getByRole('button', { name: 'Guardar vista', exact: true }).click(); await expect(save.getByRole('alert')).toContainText('No pude guardar'); await expect(name).toHaveValue('Vista revisada');
  await save.getByRole('button', { name: 'Guardar vista', exact: true }).click(); await expect(save.getByRole('button', { name: 'Guardando vista…', exact: true })).toBeDisabled(); await expect(save.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(save).toBeVisible(); release(); await expect(save).toHaveCount(0);
  expect(mutations).toHaveLength(2); expect(saved[0].config.entity).toBe('business'); expect(saved[0].config.preferences.query).toBe('Contextual'); expect(saved[0].config.preferences.filters).toEqual([{ rules: [{ field: 'ciudad', operator: 'eq', value: 'Concordia' }] }]); expect(saved[0].config.preferences.columns).toEqual(preferences.columns); expect(saved[0].config.preferences.legacyFilters.classification).toBe('open');
  await expect(page.getByRole('textbox', { name: 'Buscar negocios', exact: true })).toHaveValue('Contextual');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/editable-filters-${width}.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Editar filtros', exact: true }).click();
  await builder.getByRole('checkbox', { name: 'Quitar estos filtros al aplicar', exact: true }).check(); await builder.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.classification).toBeNull();
  await legend.getByRole('button', { name: 'Editar filtro Texto libre contiene «Contextual»', exact: true }).click(); await page.getByRole('dialog', { name: 'Editar búsqueda aplicada', exact: true }).getByRole('button', { name: 'Quitar este filtro', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Buscar negocios', exact: true })).toHaveValue('');
  await legend.getByRole('button', { name: 'Editar filtro Ciudad es Concordia', exact: true }).click(); await page.getByRole('dialog', { name: 'Editar condición de filtro', exact: true }).getByRole('button', { name: 'Quitar este filtro', exact: true }).click();
  await expect(legend.getByText('Sin filtros aplicados', { exact: true })).toBeVisible();
  await expect.poll(() => requests.at(-1)?.filters.length).toBe(0);

});
