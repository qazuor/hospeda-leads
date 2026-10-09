import { test, expect } from '@playwright/test';
import superjson from 'superjson';
import {twoPagePdf} from './fixtures/pdf';

for (const width of [1280, 390]) test(`PDF pages, zoom, corrupt retry and permissions at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(() => { localStorage.setItem('hospeda-live-mode', 'off'); localStorage.setItem('hospeda-theme-mode', 'light'); });
  const errors: string[] = [], writes: any[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const account = { id: '101', nombre: 'Negocio de materiales', assignedUserEmail: 'owner@example.com', commercialStatus: 'prospect', archivedAt: null, mergedIntoId: null };
  const opportunities = [{ id: '201', accountId: '101', opportunityName: 'Propuesta propia', assignedUserEmail: 'owner@example.com', deletedAt: null }, { id: '202', accountId: '101', opportunityName: 'Propuesta del colega', assignedUserEmail: 'other@example.com', deletedAt: null }];
  const material = { id: 'b7308353-e2cb-487b-92ac-6da7541b1efe', title: 'Folleto aprobado', type: 'propuesta', status: 'approved', library: true, accountId: null, leadId: null, categoryId: null, createdAt: new Date(), ownerEmail: 'admin@example.com', versions: [{ id: 'ac32e102-138f-4d3b-a53c-48843bdb644f', version: 1, fileName: 'folleto.pdf', url: null, mimeType: 'application/pdf', createdAt: new Date() }] };
  let downloads=0,mode='corrupt';
  await page.route('**/_api/**',async route=>{
   const url=new URL(route.request().url());let data:unknown={};
   if(route.request().method()==='POST'){writes.push(route.request().postData());}
   if(url.pathname.endsWith('/resources/download')){downloads++;await route.fulfill({status:mode==='denied'?403:200,contentType:'application/pdf',body:mode==='corrupt'?Buffer.from('%PDF-1.7 invalid'):twoPagePdf()});return;}
   if(url.pathname.endsWith('/auth/session'))data={user:{id:3,email:'owner@example.com',displayName:'Owner',role:'user'}};
   else if(url.pathname.endsWith('/commercial'))data={account,opportunities,contacts:[],journal:[],leadJournal:[],stages:[],users:[]};
   else if(url.pathname.endsWith('/pipeline'))data={stages:[],insights:[],events:[],objections:[],lossReasons:[],objectionTypes:[],rules:[],users:[],verticals:[]};
   else if(url.pathname.endsWith('/work'))data={activities:[],tasks:[],types:[],users:[],attention:[],contacts:[]};
   else if(url.pathname.endsWith('/resources'))data={documents:url.searchParams.has('accountId')?[]:[material],categories:[],maxDocumentBytes:2097152};
   await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
  });
  await page.goto('/accounts/101?section=documents');
  const form = page.getByRole('region', { name: 'Vincular material aprobado', exact: true });
  await expect(form).toBeVisible();
  await form.getByRole('combobox', { name: 'Documento de biblioteca', exact: true }).click();
  await page.getByRole('option', { name: /Folleto aprobado/ }).click();
  await form.getByRole('button',{name:'Previsualizar material seleccionado',exact:true}).scrollIntoViewIfNeeded();
  await expect(form.getByText('Miniatura no disponible. Podés reintentar o abrir la vista previa.',{exact:true})).toBeVisible();
  await form.getByRole('button',{name:'Previsualizar material seleccionado',exact:true}).click();
  let dialog=page.getByRole('dialog');await expect(dialog.getByRole('alert')).toContainText('No se pudo mostrar el PDF');
  mode='valid';await dialog.getByRole('button',{name:'Reintentar vista previa',exact:true}).click();
  await expect(dialog.getByRole('status').filter({hasText:'Página 1 de 2'})).toBeVisible();
  const region=dialog.getByRole('region',{name:'Página del PDF',exact:true});await expect(region).toHaveAttribute('aria-busy','false');await expect(region).toContainText('Primera pagina');
  await expect(dialog.getByRole('button',{name:'Página anterior',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Página siguiente',exact:true}).click();await expect(region).toHaveAttribute('aria-busy','false');await expect(region).toContainText('Segunda pagina');await expect(dialog.getByRole('button',{name:'Página siguiente',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Ampliar página',exact:true}).click();await expect.poll(()=>region.locator('canvas').evaluate(el=>el.getBoundingClientRect().width>el.parentElement!.parentElement!.clientWidth)).toBe(true);
  await dialog.getByRole('button',{name:'Ajustar página',exact:true}).click();await expect(region).toHaveAttribute('aria-busy','false');
  await page.screenshot({path:`test-results/pdf-preview-${width}-light.png`});await page.evaluate(()=>document.body.classList.add('dark'));await page.screenshot({path:`test-results/pdf-preview-${width}-dark.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await dialog.getByRole('button',{name:'Cerrar vista previa',exact:true}).click();await form.getByRole('button',{name:'Reintentar miniatura',exact:true}).click();await expect(form.getByRole('img',{name:'Primera página de folleto.pdf',exact:true})).toBeVisible();await expect(form.getByRole('combobox',{name:'Documento de biblioteca',exact:true})).toContainText('Folleto aprobado');mode='denied';
  await form.getByRole('button',{name:'Previsualizar material seleccionado',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('alert')).toContainText('No tenés permiso');await expect(dialog.locator('canvas')).toHaveCount(0);
  expect(downloads).toBe(5);expect(writes).toHaveLength(0);expect(errors).toEqual([]);
});
