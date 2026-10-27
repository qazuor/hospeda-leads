import { test, expect } from '@playwright/test';
import superjson from 'superjson';

// Spec 89 retired the library: a business keeps showing the documents linked before, nobody can link new ones, and /library lands on «Material de venta».
for (const width of [1280, 390]) test(`retired library keeps legacy links readable and sends sellers to sales material at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(() => { localStorage.setItem('hospeda-live-mode', 'off'); localStorage.setItem('hospeda-theme-mode', 'light'); });
  const errors: string[] = [], writes: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const account = { id: '101', nombre: 'Negocio de materiales', assignedUserEmail: 'owner@example.com', commercialStatus: 'prospect', archivedAt: null, mergedIntoId: null };
  const opportunities = [{ id: '201', accountId: '101', opportunityName: 'Propuesta propia', assignedUserEmail: 'owner@example.com', deletedAt: null }];
  const legacy = { id: 'b7308353-e2cb-487b-92ac-6da7541b1efe', title: 'Folleto aprobado', type: 'propuesta', status: 'approved', library: true, accountId: null, leadId: null, categoryId: null, createdAt: new Date(), ownerEmail: 'admin@example.com', versions: [{ id: 'ac32e102-138f-4d3b-a53c-48843bdb644f', version: 1, fileName: null, url: 'https://example.com/folleto', mimeType: null, createdAt: new Date() }], links: [{ leadId: '201', leadName: 'Propuesta propia', activityId: '301', activityTitle: 'Reunión de propuesta' }] };
  const material = { id: '0b4fd1c8-0a5e-4f2b-9d1e-7d4b8c6a1f20', title: 'Video institucional', description: 'Para la primera reunión', kind: 'deliverable', source: 'url', status: 'active', archivedAt: null, archivedByEmail: null, revision: 1, createdByEmail: 'admin@example.com', createdAt: new Date(), updatedAt: new Date(), hasCover: false, categories: [{ id: '1', name: 'Videos', active: true }], currentVersion: { id: '5c0c1f86-2b1b-4b55-8d55-2a8f7f6b9e11', version: 1, url: 'https://example.com/video', fileName: null, mimeType: null, byteSize: null, actorEmail: 'admin@example.com', createdAt: new Date() } };
  await page.route('**/_api/**', async route => {
    const url = new URL(route.request().url()); let data: unknown = {};
    if (route.request().method() === 'POST') writes.push(route.request().postData());
    if (url.pathname.endsWith('/auth/session')) data = { user: { id: 3, email: 'owner@example.com', displayName: 'Owner', role: 'user' } };
    else if (url.pathname.endsWith('/commercial')) data = url.searchParams.has('historyPage') ? { events: [], total: 0, page: 1, pending: [], totalPending: 0 } : { account, opportunities, contacts: [], journal: [], leadJournal: [], stages: [], users: [] };
    else if (url.pathname.endsWith('/pipeline')) data = { stages: [], insights: [], events: [], objections: [], lossReasons: [], objectionTypes: [], rules: [], users: [], verticals: [] };
    else if (url.pathname.endsWith('/work')) data = { activities: [], tasks: [], types: [], users: [], attention: [], contacts: [] };
    else if (url.pathname.endsWith('/resources')) data = { documents: url.searchParams.has('accountId') ? [legacy] : [], categories: [], maxDocumentBytes: 2097152 };
    else if (url.pathname.endsWith('/sales_materials')) data = { materials: [material], categories: material.categories, limits: { maxUploadBytes: 524288000, maxCoverBytes: 1048576, storageConfigured: true } };
    await route.fulfill({ contentType: 'application/json', body: superjson.stringify(data) });
  });
  await page.goto('/accounts/101?section=documents');
  const card = page.getByRole('article').filter({ hasText: legacy.title });
  await expect(card).toContainText('Gestión: Propuesta propia · Actividad: Reunión de propuesta');
  await expect(page.getByRole('button', { name: 'Agregar documento', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Vincular material aprobado', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Vincular a negocio', exact: true })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: 'Material de venta', exact: true })).toHaveAttribute('href', '/sales-material');
  await page.screenshot({ path: `test-results/contextual-materials-${width}-light.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.goto('/library');
  await expect(page).toHaveURL(/\/sales-material$/);
  await expect(page.getByRole('heading', { name: 'Material de venta', exact: true })).toBeVisible();
  const materialCard = page.getByRole('article', { name: material.title });
  await expect(materialCard).toContainText('Entregable');
  await expect(materialCard.getByRole('link', { name: 'Abrir enlace', exact: true })).toHaveAttribute('href', '/_api/sales_materials/file?versionId=' + material.currentVersion.id + '&disposition=inline');
  await expect(page.getByRole('button', { name: 'Nuevo material', exact: true })).toHaveCount(0);
  await page.evaluate(() => document.body.classList.add('dark'));
  await page.screenshot({ path: `test-results/sales-material-${width}-dark.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
