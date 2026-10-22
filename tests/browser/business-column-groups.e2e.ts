import {test,expect} from '@playwright/test';
import superjson from 'superjson';
import {DEFAULT_BUSINESS_COLUMN_GROUPS} from '../../src/helpers/businessColumnGroups';
import {basePreferences} from '../../src/helpers/businessListPreferences';

test('admin creates a group, seller uses it, and deleting it preserves other columns',async({page})=>{
 let role:'admin'|'user'='admin',groups=structuredClone(DEFAULT_BUSINESS_COLUMN_GROUPS);
 const rows=[{id:'-1',accountId:'1',nombre:'Negocio de prueba',ciudad:'Colón',telefono:'343 555',email:'negocio@example.test',tipo:'Hospedaje',subtipo:'Cabañas',canModify:true,canModifyManagement:true,opportunityCount:0,contactCount:1}];
 await page.route('**/_api/**',async route=>{const request=route.request(),url=new URL(request.url());let data:unknown={};let status=200;
  if(url.pathname.endsWith('/auth/session'))data={user:{id:role==='admin'?1:2,email:role==='admin'?'admin@example.test':'seller@example.test',displayName:role==='admin'?'Admin':'Vendedora',role}};
  else if(url.pathname.endsWith('/business_list_defaults'))data=request.method()==='POST'?{ok:true}:{defaults:null};
  else if(url.pathname.endsWith('/business_column_groups')){if(request.method()==='POST'){if(role!=='admin')status=403;else groups=superjson.parse(request.postData()??'[]');data={ok:true};}else data={groups};}
  else if(url.pathname.endsWith('/settings'))data={users:[],cities:['Colón'],types:['Hospedaje'],templates:[],subtypes:[{name:'Cabañas',typeName:'Hospedaje'}],authorizedEmails:[],opportunityStages:[]};
  else if(url.pathname.endsWith('/leads'))data={rows,total:rows.length,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
  else if(url.pathname.endsWith('/saved_views'))data={views:[]};
  else if(url.pathname.endsWith('/live_version'))data={versions:{}};
  await route.fulfill({status,contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/settings?section=businesses');await expect(page.getByRole('heading',{name:'Columnas agrupadas'})).toBeVisible();
 await page.getByRole('button',{name:'Crear grupo',exact:true}).click();await page.getByRole('textbox',{name:'Nombre del grupo Nuevo grupo',exact:true}).fill('Mi grupo');await page.getByRole('button',{name:'Guardar columnas agrupadas',exact:true}).click();await expect(page.getByText('Columnas agrupadas guardadas',{exact:true})).toBeVisible();const createdGroupId=groups.find(group=>group.name==='Mi grupo')!.id;
 role='user';await page.goto('/accounts');await expect(page.locator('[data-business-id="1"]')).toBeVisible();await page.getByRole('button',{name:'Columnas',exact:true}).click();await page.getByRole('checkbox',{name:'Mi grupo',exact:true}).check();await page.getByRole('button',{name:'Cerrar columnas',exact:true}).click();
 await expect(page.getByRole('columnheader',{name:'Mi grupo',exact:true})).toBeVisible();const groupedCell=page.getByRole('row').filter({hasText:'Negocio de prueba'}).locator('td').filter({has:page.locator('.groupCell')});await expect(groupedCell).toContainText('Colón');await expect(groupedCell).toContainText('Negocio de prueba');
 role='admin';await page.goto('/settings?section=businesses');await page.getByRole('button',{name:'Eliminar grupo Mi grupo',exact:true}).click();await page.getByRole('button',{name:'Guardar columnas agrupadas',exact:true}).click();await expect(page.getByText('Columnas agrupadas guardadas',{exact:true})).toBeVisible();
 role='user';await page.goto('/accounts');await expect(page.getByRole('columnheader',{name:'Ciudad',exact:true})).toBeVisible();await expect(page.getByRole('columnheader',{name:'Mi grupo',exact:true})).toHaveCount(0);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('hospeda-business-list-v1-user-2')??'null')?.preferences);expect(saved.columns).toContain('ciudad');expect(saved.columns).not.toContain('group:'+createdGroupId);
});
