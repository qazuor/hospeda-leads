import { test, expect } from '@playwright/test';
import superjson from 'superjson';

for (const width of [1280, 390]) test(`contextual materials preserve destination and selection at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(() => { localStorage.setItem('hospeda-live-mode', 'off'); localStorage.setItem('hospeda-theme-mode', 'light'); });
  const errors: string[] = [], writes: any[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const account = { id: '101', nombre: 'Negocio de materiales', assignedUserEmail: 'owner@example.com', commercialStatus: 'prospect', archivedAt: null, mergedIntoId: null };
  const opportunities = [{ id: '201', accountId: '101', opportunityName: 'Propuesta propia', assignedUserEmail: 'owner@example.com', deletedAt: null }, { id: '202', accountId: '101', opportunityName: 'Propuesta del colega', assignedUserEmail: 'other@example.com', deletedAt: null }];
  const material = { id: 'b7308353-e2cb-487b-92ac-6da7541b1efe', title: 'Folleto aprobado', type: 'propuesta', status: 'approved', library: true, accountId: null, leadId: null, categoryId: null, createdAt: new Date(), ownerEmail: 'admin@example.com', versions: [{ id: 'ac32e102-138f-4d3b-a53c-48843bdb644f', version: 1, fileName: null, url: 'https://example.com/folleto', mimeType: null, createdAt: new Date() }] };
  let linked = false, calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_api/**', async route => {
    const url = new URL(route.request().url()); let data: unknown = {};
    if (url.pathname.endsWith('/auth/session')) data = { user: { id: 3, email: 'owner@example.com', displayName: 'Owner', role: 'user' } };
    else if (url.pathname.endsWith('/commercial')) data = { account, opportunities, contacts: [], journal: [], leadJournal: [], stages: [], users: [] };
    else if (url.pathname.endsWith('/pipeline')) data = { stages: [], insights: [], events: [], objections: [], lossReasons: [], objectionTypes: [], rules: [], users: [], verticals: [] };
    else if (url.pathname.endsWith('/work')) data = { activities: [{ id: '301', leadId: '201', title: 'Reunión de propuesta', occurredAt: new Date() }], tasks: [], types: [], users: [], attention: [], contacts: [] };
    else if (url.pathname.endsWith('/resources')) {
      if (route.request().method() === 'POST') {
        calls++; writes.push(superjson.parse(route.request().postData()!));
        if (calls === 1) { await gate; await route.fulfill({ status: 500, contentType: 'application/json', body: superjson.stringify({ error: 'No se pudo vincular' }) }); return; }
        linked = true; data = { ok: true };
      } else data = { documents: url.searchParams.has('accountId') ? linked ? [{ ...material, links: [{ leadId: '201', leadName: 'Propuesta propia', activityId: '301', activityTitle: 'Reunión de propuesta' }] }] : [] : [material], categories: [], maxDocumentBytes: 2097152 };
    }
    await route.fulfill({ contentType: 'application/json', body: superjson.stringify(data) });
  });
  await page.goto('/accounts/101?section=documents');
  const form = page.getByRole('region', { name: 'Vincular material aprobado', exact: true });
  await expect(form).toBeVisible();
  await form.getByRole('combobox', { name: 'Documento de biblioteca', exact: true }).click();
  await page.getByRole('option', { name: /Folleto aprobado/ }).click();
  expect(writes).toHaveLength(0);
  await form.getByRole('combobox', { name: 'Vincular a', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Propuesta del colega', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'Propuesta propia', exact: true }).click();
  await form.getByRole('combobox', { name: 'Actividad vinculada al material (opcional)', exact: true }).click();
  await page.getByRole('option', { name: /Reunión de propuesta/ }).click();
  const save = form.getByRole('button', { name: 'Vincular documento al negocio', exact: true });
  await save.dblclick(); await expect(form.getByRole('button', { name: 'Vinculando documento…', exact: true })).toBeDisabled();
  await expect(form.getByRole('combobox', { name: 'Documento de biblioteca', exact: true })).toBeDisabled();
  expect(writes).toHaveLength(1); release();
  await expect(form.getByRole('alert')).toContainText('Tu selección se conserva');
  await expect(form.getByRole('combobox', { name: 'Documento de biblioteca', exact: true })).toContainText(material.title);
  await save.click(); await expect(form.getByRole('status')).toContainText('quedó vinculado a Propuesta propia. No se envió al cliente.');
  expect(writes).toEqual(Array(2).fill({ action: 'link', id: material.id, accountId: '101', leadId: '201', activityId: '301' }));
  await expect(page.getByRole('article').filter({ hasText: material.title })).toContainText('Gestión: Propuesta propia · Actividad: Reunión de propuesta');
  await page.screenshot({ path: `test-results/contextual-materials-${width}-light.png`, fullPage: true });
  await page.evaluate(() => document.body.classList.add('dark'));
  await page.screenshot({ path: `test-results/contextual-materials-${width}-dark.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  account.assignedUserEmail = 'other@example.com';
  await page.reload();
  await expect(page.getByRole('region', { name: 'Vincular material aprobado', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article').filter({ hasText: material.title })).toBeVisible();
  await page.goto('/library'); await expect(page.getByRole('heading', { name: 'Acceso denegado', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
