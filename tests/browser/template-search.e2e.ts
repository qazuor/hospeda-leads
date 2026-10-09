import {test,expect} from '@playwright/test';
import superjson from 'superjson';

test('model search ignores accents in name, vertical and profile while preserving ñ',async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const templates=[{id:'1',name:'Proposición Colón',channel:'email',vertical:'Gastronomía',commercialProfile:'Dueño',subject:'',body:'Hola'},
 {id:'2',name:'Propuesta cana',channel:'whatsapp',vertical:'Experiencias',commercialProfile:'Referente',subject:null,body:'Hola'}];
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const data=path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:
   path.endsWith('/settings')?{templates,users:[],cities:[],types:[],subtypes:[],authorizedEmails:[],opportunityStages:[]}:{};
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/settings?section=templates');
 const search=page.getByPlaceholder('Buscar modelo…');
 for(const query of ['proposicion colon','PROPOSICIÓN COLÓN','Proposicio\u0301n Colo\u0301n','gastronomia','dueño']) {
  await search.fill(query);await expect(page.getByText('1 modelo',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Email/}).filter({hasText:'1'})).toHaveCount(1);
 }
 await search.fill('dueno');await expect(page.getByText('No hay modelos para mostrar.')).toBeVisible();
 await search.fill('');await expect(page.getByText('2 modelos',{exact:true})).toBeVisible();
});
