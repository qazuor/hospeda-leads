import { test, expect } from '@playwright/test';
import superjson from 'superjson';
import { basePreferences } from '../../src/helpers/businessListPreferences';
import { simulateUserscript } from './helpers/userscript';
import { reveal } from './support/contactStep';

for (const width of [1280, 390]) for (const dark of [false, true]) {
  test(`Mantine contact search, focus and layout at ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [], writes: string[] = [], manualPayloads: any[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ preferences, dark }) => {
      localStorage.setItem('hospeda-live-mode', 'off');
      localStorage.setItem('hospeda-theme-mode', dark ? 'dark' : 'light');
      localStorage.setItem('hospeda-business-list-v1-user-3', JSON.stringify({ preferences, context: { page: 1, scrollY: 0, scrollX: 0 } }));
    }, { preferences: { ...basePreferences(), columns: ['nombre', 'actions'], pins: {} }, dark });
    await simulateUserscript(page, { user: 'owner@example.com' });
    const account = { id: '1', nombre: 'Negocio de prueba', ciudad: 'Concepción', assignedUserEmail: 'owner@example.com', tipo: 'Alojamientos', status: 'reviewed', doNotContact: false, isClient: false, archivedAt: null, recontactAt: null, telefono: '123', whatsapp: '123', email: 'fixture@example.com' };
    const opportunities = [
      { id: '11', accountId: '1', opportunityName: 'Presentación Concepción', estado: 'Cargado', assignedUserEmail: 'owner@example.com' },
      { id: '12', accountId: '1', opportunityName: 'Otra propuesta', estado: 'Cargado', assignedUserEmail: 'owner@example.com' },
      { id: '13', accountId: '1', opportunityName: 'Gestión cerrada', estado: 'Cerrada', assignedUserEmail: 'owner@example.com' },
    ];
    await page.route('**/_api/**', async route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== 'GET') {
        writes.push(url.pathname);
        if (url.pathname.endsWith('/communication')) manualPayloads.push(superjson.parse<any>(route.request().postData()!));
      }
      let data: unknown = {};
      if (url.pathname.endsWith('/auth/session')) data = { user: { id: 3, email: 'owner@example.com', displayName: 'Owner', role: 'user' } };
      else if (url.pathname.endsWith('/business_list_defaults')) data = { defaults: null };
      else if (url.pathname.endsWith('/saved_views')) data = { views: [] };
      else if (url.pathname.endsWith('/settings')) data = { users: [], cities: [], types: [], subtypes: [], contactChannels: ['WhatsApp', 'Email'], templates: [], authorizedEmails: [], opportunityStages: [] };
      else if (url.pathname.endsWith('/commercial')) data = { account, opportunities, contacts: [], journal: [], leadJournal: [], stages: [] };
      else if (url.pathname.endsWith('/communication')) data = { recentMessages: [], messages: [], resources: [], restrictions: [], responses: [], openManagements: [], recentContactHours: 72 };
      else if (url.pathname.endsWith('/pipeline')) data = { stages: [{ name: 'Cargado', classification: 'open' }, { name: 'Cerrada', classification: 'lost' }] };
      else if (url.pathname.endsWith('/work')) data = { tasks: [], activities: [], types: [{ id: 'message', name: 'Mensaje', agenda: false, active: true }, { id: 'followup', name: 'Seguimiento', agenda: true, active: true }], accounts: [{ id: '1', nombre: account.nombre, ciudad: account.ciudad, assignedUserEmail: account.assignedUserEmail }], opportunities: [], contacts: [], users: [], attention: [], journal: [], followupStages: [], newAssignmentDays: 7, totalTasks: 0, totalActivities: 0, page: 1 };
      else if (url.pathname.endsWith('/leads')) data = { rows: [{ ...account, accountId: '1', canModify: true, opportunityCount: 3, contactCount: 0 }], total: 1, page: 1, pageSize: 50, filters: { ciudades: [], estados: [], tipos: [], asignados: [], suscripciones: [], origenes: [], quienesCargaron: [], mediosContacto: [], creadosPor: [] } };
      // A registered call returns its message, which chains into the outcome step (decision 2B).
      if (route.request().method() !== 'GET' && url.pathname.endsWith('/communication') && manualPayloads.at(-1)?.channel === 'call') data = { id: '00000000-0000-4000-8000-000000000001', accountId: '1', leadId: null, contactId: null, channel: 'call', status: 'manual_sent', purpose: 'first_contact' };
      await route.fulfill({ contentType: 'application/json', body: superjson.stringify(data) });
    });
    await page.goto('/accounts');
    const trigger = page.getByRole('group', { name: 'Acciones de Negocio de prueba' }).getByRole('button', { name: 'Contactar', exact: true });
    await trigger.click();
    // Spec 96 §2.3: one contact step whose title follows the channel; call and social open their own dialog in its place.
    const dialog = page.getByRole('dialog', { name: /^(Preparar (WhatsApp|email|Instagram)|Registrar una llamada|Contacto por red social)$/ });
    const changeLine = (label: string) => dialog.locator('p').filter({ hasText: new RegExp('^' + label + ':') }).getByRole('button', { name: 'Cambiar', exact: true });
    const search = dialog.getByRole('combobox', { name: '¿Sobre qué?', exact: true });
    await expect(search).toBeVisible();
    // Two open managements and none chosen: nothing can be prepared until «¿Sobre qué?» is answered.
    await expect(dialog.getByText('Elegí sobre qué es el contacto.', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Escribir un mensaje nuevo' })).toHaveCount(0);
    await search.fill('CONCEPCION');
    await expect(dialog.getByRole('listbox',{name:'¿Sobre qué?',exact:true}).getByRole('option')).toHaveCount(1);
    await search.press('ArrowDown');
    await search.press('Enter');
    // Once chosen, «Sobre» collapses to one line; «Cambiar» brings the select back with the choice kept.
    await expect(dialog.locator('p').filter({ hasText: /^Sobre:/ })).toContainText('Presentación Concepción · Cargado');
    await expect(dialog.getByRole('button', { name: 'Escribir un mensaje nuevo' })).toBeEnabled();
    await changeLine('Sobre').click();
    await expect(search).toHaveValue('Una gestión: Presentación Concepción · Cargado');
    await search.fill('zzz');
    await expect(dialog.getByText('Sin resultados', { exact: true })).toBeVisible();
    await search.fill('');
    await expect(dialog.getByRole('listbox',{name:'¿Sobre qué?',exact:true}).getByRole('option')).toHaveCount(3);
    await expect(dialog.getByRole('listbox',{name:'¿Sobre qué?',exact:true}).getByRole('option',{ name: 'Sin gestión (contacto general)' })).toHaveCount(1);
    await expect(dialog.getByRole('listbox',{name:'¿Sobre qué?',exact:true}).getByRole('option', { name: /Gestión cerrada/ })).toHaveCount(0);
    await search.press('Escape');
    await expect(dialog).toBeVisible();
    await search.press('Tab');
    await expect(search).toHaveValue('Una gestión: Presentación Concepción · Cargado');
    const channels = dialog.getByRole('group', { name: 'Canal', exact: true });
    await channels.getByRole('button', { name: 'Email', exact: true }).click();
    await expect(channels.getByRole('button', { name: 'Email', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Red social', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Contacto por red social', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar con red social', exact: true }).click();
    let manual = page.getByRole('dialog', { name: 'Registrar contacto por red social', exact: true });
    await manual.getByLabel('Cuenta o perfil usado').fill('@hospeda');
    await manual.getByRole('button', { name: 'Iniciar intento manual', exact: true }).click();
    await expect(manual.getByRole('status')).toContainText('Intento iniciado sin texto');
    expect(manualPayloads[0]).toMatchObject({ action: 'manual_start', channel: 'social', leadId: '11', purpose: null, destination: '@hospeda' });
    await manual.getByRole('button', { name: 'Volver', exact: true }).click();
    // The general case: "Sin gestión", then the Llamada channel from «Otro» and the call panel.
    await search.click();
    await dialog.getByRole('listbox', { name: '¿Sobre qué?', exact: true }).getByRole('option', { name: 'Sin gestión (contacto general)' }).click();
    await dialog.getByRole('button', { name: 'Volver a WhatsApp, Instagram o Email', exact: true }).click();
    // Owner review of spec 96: back in the contact step the resolved controls are collapsed behind «Para: …»; «Cambiar» expands them.
    await reveal(dialog, dialog.getByRole('button', { name: 'Llamada', exact: true }));
    await dialog.getByRole('button', { name: 'Llamada', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Registrar una llamada', exact: true })).toBeVisible();
    await changeLine('Propósito').click();
    await expect(dialog.getByLabel('Propósito del contacto')).toHaveValue('first_contact');
    // Desktop: the number is shown to copy, there is no tel: link, and copying records nothing.
    await expect(dialog.getByLabel('Número a llamar')).toHaveText('123');
    await expect(dialog.locator('a[href^="tel:"]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Copiar número', exact: true }).click();
    expect(writes).toEqual(['/_api/communication']);
    await dialog.getByLabel('Nota de la llamada (opcional)').fill('Llamada realizada para presentar Hospeda');
    await dialog.getByRole('button', { name: 'Ya llamé: anotar cómo salió', exact: true }).click();
    // The call goes straight to "¿Cómo salió?"; leaving it is never silent.
    const outcome = page.getByRole('dialog', { name: 'Anotar lo que pasó', exact: true });
    await expect(outcome.getByLabel('Título')).toHaveValue('Contacto por llamada');
    await outcome.getByRole('button', { name: 'Volver', exact: true }).click();
    const leave = page.getByRole('dialog', { name: '¿Salir sin anotar cómo salió?', exact: true });
    await leave.getByRole('button', { name: 'Salir sin anotar', exact: true }).click();
    await expect(outcome).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Ya llamé: anotar cómo salió', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Anotar cómo salió', exact: true })).toBeVisible();
    expect(manualPayloads[1]).toMatchObject({ action: 'manual_start', channel: 'call', leadId: null, purpose: 'first_contact', body: 'Llamada realizada para presentar Hospeda', result: 'manual_sent' });
    await dialog.getByRole('button', { name: 'Volver a WhatsApp, Instagram o Email', exact: true }).click();
    await channels.getByRole('button', { name: 'Email', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Preparar email', exact: true })).toBeVisible();
    // A secondary (outline) action of the step: «Otra redacción» in the templates list.
    const secondary = dialog.getByRole('button', { name: 'Otra redacción', exact: true });
    const colors = await secondary.evaluate(element => ({
      background: getComputedStyle(element).backgroundColor,
      text: getComputedStyle(element).color,
      pageBackground: getComputedStyle(document.body).backgroundColor,
    }));
    expect(colors.text).not.toBe(colors.background);
    const pageBrightness = colors.pageBackground.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b) / 3;
    expect(dark ? pageBrightness < 100 : pageBrightness > 200).toBe(true);
    // The primary (filled) control of the step: the selected channel.
    const contrast = await channels.getByRole('button', { name: 'Email', exact: true }).evaluate(element => {
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
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(writes).toEqual(['/_api/communication', '/_api/communication']);
    expect(errors).toEqual([]);
  });
}
