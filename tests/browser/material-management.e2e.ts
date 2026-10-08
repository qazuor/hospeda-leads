import { test, expect } from '@playwright/test';
import superjson from 'superjson';

for (const width of [1280, 390]) test(`material management keeps drafts and locks pending actions at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('hospeda-live-mode', 'off');
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function(blob) {
      (window as any).releaseFile = () => read.call(this, blob);
    };
  });
  const errors: string[] = [], writes: any[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const material = { id: 'b7308353-e2cb-487b-92ac-6da7541b1efe', title: 'Propuesta de prueba', type: 'propuesta', status: 'draft', library: false, accountId: '101', leadId: null, categoryId: null, createdAt: new Date(), ownerEmail: 'admin@example.com', versions: [{ id: 'ac32e102-138f-4d3b-a53c-48843bdb644f', version: 1, fileName: null, url: 'https://example.com/folleto', mimeType: null, createdAt: new Date() }] };
  let createCalls = 0, versionCalls = 0, deleteCalls = 0, removed = false, releaseDelete!: () => void;
  const deleteGate = new Promise<void>(resolve => { releaseDelete = resolve; });
  await page.route('**/_api/**', async route => {
    const url = new URL(route.request().url()); let data: unknown = {};
    if (url.pathname.endsWith('/auth/session')) data = { user: { id: 1, email: 'admin@example.com', displayName: 'Admin', role: 'admin' } };
    else if (url.pathname.endsWith('/commercial')) data = { account: { id: '101', nombre: 'Negocio de materiales', assignedUserEmail: 'admin@example.com', commercialStatus: 'prospect', archivedAt: null, mergedIntoId: null }, opportunities: [], contacts: [], journal: [], leadJournal: [], stages: [], users: [] };
    else if (url.pathname.endsWith('/pipeline')) data = { stages: [], insights: [], events: [], objections: [], lossReasons: [], objectionTypes: [], rules: [], users: [], verticals: [] };
    else if (url.pathname.endsWith('/work')) data = { activities: [], tasks: [], types: [], users: [], attention: [], contacts: [] };
    else if (url.pathname.endsWith('/resources')) {
      if (route.request().method() === 'POST') {
        const input = superjson.parse<any>(route.request().postData()!); writes.push(input);
        let failure = false;
        if (input.action === 'status') material.status = input.status;
        if (input.action === 'create') failure = ++createCalls === 1;
        if (input.action === 'version') { failure = ++versionCalls === 1; if (!failure) { material.status = 'draft'; material.versions.unshift({ ...material.versions[0], version: 2 }); } }
        if (input.action === 'delete') { failure = ++deleteCalls === 1; if (failure) await deleteGate; else removed = true; }
        if (failure) { await route.fulfill({ status: 500, contentType: 'application/json', body: superjson.stringify({ error: 'No se pudo guardar' }) }); return; }
        data = { ok: true };
      } else data = { documents: url.searchParams.has('accountId') && !removed ? [material] : [], categories: [], maxDocumentBytes: 2097152 };
    }
    await route.fulfill({ contentType: 'application/json', body: superjson.stringify(data) });
  });
  await page.goto('/accounts/101?section=documents');
  await page.getByRole('button', { name: 'Agregar documento o recurso', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Título del documento', exact: true });
  await title.fill('Nuevo material');
  await page.getByRole('button', { name: 'Aprobar versión', exact: true }).click();
  await expect(page.getByRole('article')).toContainText('Aprobado');
  await expect(title).toHaveValue('Nuevo material'); // Unrelated writes preserve the upload draft.
  const file = page.getByLabel('O archivo', { exact: true });
  await file.setInputFiles({ name: 'propuesta.txt', mimeType: 'text/plain', buffer: Buffer.from('Propuesta comercial') });
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Preparando archivo…', exact: true })).toBeDisabled();
  await expect(title).toBeDisabled(); await expect(file).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Nueva versión', exact: true })).toBeDisabled();
  expect(writes.filter(input => input.action === 'create')).toHaveLength(0);
  await page.evaluate(() => (window as any).releaseFile());
  await expect(page.getByRole('alert')).toContainText('Los datos del formulario se conservan');
  await expect(title).toHaveValue('Nuevo material');
  expect(await file.evaluate((node: HTMLInputElement) => node.files?.[0]?.name)).toBe('propuesta.txt');
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
  await page.evaluate(() => (window as any).releaseFile());
  await expect(page.getByRole('status')).toContainText('Documento guardado como borrador');
  expect(writes.filter(input => input.action === 'create')).toHaveLength(2);
  expect(writes.filter(input => input.action === 'create')[0]).toEqual(writes.filter(input => input.action === 'create')[1]);
  await expect(title).toHaveValue('');
  expect(await file.evaluate((node: HTMLInputElement) => node.files?.length)).toBe(0);
  await page.getByRole('button', { name: 'Nueva versión', exact: true }).click();
  await page.getByRole('textbox', { name: 'Vínculo HTTP(S)', exact: true }).fill('https://example.com/version-2');
  await page.getByRole('button', { name: 'Cancelar versión', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Tenés cambios sin guardar');
  await page.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar versión', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Los datos del formulario se conservan');
  await expect(page.getByRole('textbox', { name: 'Vínculo HTTP(S)', exact: true })).toHaveValue('https://example.com/version-2');
  await page.getByRole('button', { name: 'Guardar versión', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Nueva versión guardada como borrador');
  await expect(page.getByRole('article')).toContainText('Borrador');
  const versions = writes.filter(input => input.action === 'version'); expect(versions).toHaveLength(2); expect(versions[0]).toEqual(versions[1]); expect(versions[0].revision).toBe(1);
  await page.getByRole('button', { name: 'Dar de baja', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Propuesta de prueba');
  await dialog.getByRole('button', { name: 'Confirmar baja', exact: true }).dblclick();
  await expect(dialog.getByRole('button', { name: 'Dando de baja documento…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible(); expect(deleteCalls).toBe(1);
  releaseDelete(); await expect(dialog.getByRole('alert')).toContainText('No se pudo guardar');
  await page.screenshot({ path: `test-results/material-management-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await dialog.getByRole('button', { name: 'Confirmar baja', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.getByRole('article')).toHaveCount(0);
  expect(writes.filter(input => input.action === 'delete')).toEqual(Array(2).fill({ action: 'delete', id: material.id, revision: 2 }));
  expect(errors).toEqual([]);
});
