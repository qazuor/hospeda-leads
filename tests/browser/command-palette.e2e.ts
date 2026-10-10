import { test, expect } from '@playwright/test';
import superjson from 'superjson';

for (const width of [1280, 390]) for (const role of ['user', 'admin']) {
  test(`Command palette permissions, keyboard and layout at ${width}px ${role}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const writes: string[] = [], errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('hospeda-live-mode', 'off');
      localStorage.setItem('hospeda-theme-mode', 'light');
    });
    await page.route('**/_api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== 'GET') writes.push(path);
      const data = path.endsWith('/leads') ? { rows: [], total: 0, page: 1, pageSize: 50, filters: { ciudades: [], estados: [], tipos: [], asignados: [], suscripciones: [], origenes: [], quienesCargaron: [], mediosContacto: [], creadosPor: [] } }
        : path.endsWith('/saved_views') ? { views: [] }
        : path.endsWith('/business_list_defaults') ? { defaults: null }
        : path.endsWith('/settings') ? { users: [], cities: [], types: [], subtypes: [], contactChannels: [], templates: [], authorizedEmails: [], opportunityStages: [] }
        : path.endsWith('/auth/session')
        ? { user: { id: 3, email: 'fixture@example.com', displayName: 'Fixture', role } }
        : {};
      await route.fulfill({ contentType: 'application/json', body: superjson.stringify(data) });
    });
    await page.goto('/guide');
    await expect(page.getByRole('button', { name: 'Fixture', exact: true }).locator('svg').first()).toBeVisible();
    const trigger = page.getByRole('button', { name: 'Abrir accesos rápidos', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Accesos rápidos', exact: true });
    const search = dialog.getByRole('textbox', { name: 'Buscar opciones', exact: true });
    await trigger.click();
    await expect(search).toBeFocused();
    await expect(dialog.getByRole('button', { name: /^Estadísticas/ })).toHaveCount(role === 'admin' ? 1 : 0);
    await expect(dialog.getByRole('button', { name: /^Importar CSV/ })).toHaveCount(role === 'admin' ? 1 : 0);
    await expect(dialog.getByRole('button', { name: /^Papelera/ })).toHaveCount(role === 'admin' ? 1 : 0);
    await page.screenshot({ path: `test-results/command-palette-${width}-${role}-light.png`, animations: 'disabled' });
    await search.fill('GESTIONES COMERCIALES');
    await expect(dialog.locator('[data-action]')).toHaveCount(1);
    await search.press('ArrowDown');
    await expect(dialog.getByRole('status',{name:'Opción seleccionada',exact:true})).toContainText('Gestiones comerciales');
    await search.fill('zzzz');
    await expect(dialog.getByText('Sin opciones para esta búsqueda')).toBeVisible();
    await search.fill('TEMA OSCURO');
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('body')).toHaveClass(/dark/);
    await expect(trigger).toBeFocused();

    await trigger.focus();
    await page.keyboard.press('Control+k');
    await expect(search).toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(dialog).toHaveCount(1);
    expect(await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, repeat: true, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
    await search.fill('CONFIGURACION');
    if (role === 'admin') await expect(dialog.getByRole('button', { name: /^Configuración/ })).toBeVisible();
    else await expect(dialog.getByText('Sin opciones para esta búsqueda')).toBeVisible();
    await search.fill('');
    await search.press('ArrowUp');
    await expect(dialog.locator('[data-selected]')).toHaveCount(1);
    if (width === 390) await page.setViewportSize({ width, height: 500 });
    await expect.poll(() => dialog.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(width === 390 ? 500 : 844);
    await expect(dialog.locator('[data-selected]')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `test-results/command-palette-${width}-${role}-dark.png`, animations: 'disabled' });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
    await dialog.getByRole('button', { name: 'Cerrar accesos rápidos' }).focus();
    await page.keyboard.press('Tab');
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Ctrl+K belongs to editing controls and existing modal/editor workflows.
    const guideSearch = page.getByRole('searchbox');
    await guideSearch.fill('borrador');
    await guideSearch.press('Control+k');
    await expect(dialog).toHaveCount(0);
    await expect(guideSearch).toHaveValue('borrador');
    await page.evaluate(() => {
      const editor = document.createElement('div');
      editor.contentEditable = 'true';
      editor.id = 'editor-fixture';
      editor.textContent = 'Mensaje sin guardar';
      document.body.append(editor);
      editor.focus();
    });
    await page.keyboard.press('Control+k');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#editor-fixture')).toHaveText('Mensaje sin guardar');
    await page.evaluate(() => document.getElementById('editor-fixture')?.remove());
    await page.evaluate(() => {
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      modal.id = 'existing-modal';
      modal.textContent = 'Formulario abierto';
      document.body.append(modal);
    });
    await trigger.focus();
    await page.keyboard.press('Control+k');
    await expect(dialog).toHaveCount(0);
    await page.evaluate(() => document.getElementById('existing-modal')?.remove());
    await page.evaluate(() => {
      const marker = document.createElement('span');
      marker.dataset.unsaved = 'true';
      marker.id = 'unsaved-marker';
      document.body.append(marker);
    });
    await trigger.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Guardá o descartá los cambios antes de abrir los accesos rápidos.')).toBeVisible();
    await page.evaluate(() => document.getElementById('unsaved-marker')?.remove());

    // Mac shortcut, navigation into an existing route, then one listener after route change.
    await trigger.focus();
    await page.keyboard.press('Meta+k');
    await expect(search).toBeFocused();
    await search.fill('ESTABLECIMIENTOS');
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/accounts$/);
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await expect(dialog).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Cerrar accesos rápidos' }).click();
    await expect(dialog).toHaveCount(0);
    await page.screenshot({ path: `test-results/command-navigation-${width}-${role}.png`, animations: 'disabled' });
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
