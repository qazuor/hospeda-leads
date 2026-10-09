import {test,expect} from '@playwright/test';
import superjson from 'superjson';
for(const width of [1280,390])test(`commercial history separates conversations from data edits at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const account={id:'1',nombre:'Negocio de prueba',commercialStatus:'prospect',assignedUserEmail:'admin@example.com',doNotContact:false};
 const event={id:'activity:1',occurredAt:new Date('2026-10-08T15:00:00Z'),kind:'activity',title:'Conversación con Ana',result:'Pidió una propuesta',notes:null,channel:'whatsapp',outcome:'interested',continuation:'task',actorEmail:'admin@example.com',leadId:null,opportunityName:null,recipientName:'Ana',messageStatus:'whatsapp_opened',messageSubject:null,messageText:'Hola Ana'};
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  const data=path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:
   path.endsWith('/commercial')?(url.searchParams.has('historyPage')?{events:[event],total:1,page:1,pending:[{id:'1',title:'Revisar propuesta',dueDate:'2026-10-12',dueAt:null,assignedUserEmail:'admin@example.com',leadId:null,opportunityName:null,continuation:'wait'}],totalPending:1}:{account,contacts:[],opportunities:[],journal:[{id:'1',action:'account_updated',actorName:'Admin',createdAt:new Date(),metadata:{before:{nombre:'Anterior'},after:{nombre:account.nombre}}}],leadJournal:[],stages:[],users:[{email:'admin@example.com',displayName:'Admin'}]}):
   path.endsWith('/work')?{tasks:[],activities:[],types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:0,totalActivities:0,page:1}:
   path.endsWith('/settings')?{users:[],cities:[],types:[],subtypes:[],templates:[],authorizedEmails:[],opportunityStages:[]}:{};
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts/1?section=history');
 await expect(page.getByRole('heading',{name:'Conversaciones y resultados'})).toBeVisible();
 await expect(page.getByText('Pidió una propuesta',{exact:true})).toBeVisible();
 await expect(page.getByText('WhatsApp abierto · envío no confirmado',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Revisar propuesta',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Auditoría de cambios',exact:true})).not.toBeVisible();
 await page.getByRole('button',{name:'Auditoría de cambios de datos',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Auditoría de cambios',exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.screenshot({path:`test-results/commercial-history-${width}.png`,fullPage:true});
});
