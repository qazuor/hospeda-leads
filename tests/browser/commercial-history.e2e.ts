import {test,expect} from '@playwright/test';
import superjson from 'superjson';
for(const width of [1280,390])test(`commercial history separates conversations from data edits at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const account={id:'1',nombre:'Negocio de prueba',commercialStatus:'prospect',assignedUserEmail:'admin@example.com',doNotContact:false};
 const event={id:'activity:1',occurredAt:new Date('2026-10-08T15:00:00Z'),kind:'activity',title:'Conversación con Ana',result:'Pidió una propuesta',notes:null,channel:'whatsapp',outcome:'interested',continuation:'task',actorEmail:'admin@example.com',leadId:null,opportunityName:null,recipientName:'Ana',messageStatus:'whatsapp_opened',messageSubject:null,messageText:'Hola Ana'};
 const stageEvent={...event,id:'stage:1',kind:'stage',title:'Por contactar → Contactado',result:null,outcome:null,continuation:null,channel:null,recipientName:null,messageStatus:null,messageText:null};
 const historyKinds:(string|null)[]=[];
 await page.route('**/_api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  const data=path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:
   path.endsWith('/commercial')?(url.searchParams.has('historyPage')?(historyKinds.push(url.searchParams.get('historyKind')),{events:[event,stageEvent],total:2,page:1,pending:[{id:'1',title:'Revisar propuesta',dueDate:'2026-10-12',dueAt:null,assignedUserEmail:'admin@example.com',leadId:null,opportunityName:null,continuation:'wait'}],totalPending:1}):{account,contacts:[],opportunities:[],journal:[{id:'1',action:'account_updated',actorName:'Admin',createdAt:new Date(),metadata:{before:{nombre:'Anterior'},after:{nombre:account.nombre}}}],leadJournal:[],stages:[],users:[{email:'admin@example.com',displayName:'Admin'}]}):
   path.endsWith('/work')?{tasks:[{id:'1',accountId:'1',leadId:null,title:'Revisar propuesta',description:null,typeId:'followup',assignedUserEmail:'admin@example.com',dueDate:'2026-10-12',dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Negocio de prueba',city:null,opportunityName:null,deletedAt:null,continuation:'wait'}],activities:[],types:[{id:'followup',name:'Seguimiento',agenda:true,active:true}],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:1,totalActivities:0,page:1}:
   path.endsWith('/communication')?{recentMessages:[],messages:[],resources:[],restrictions:[],responses:[],openManagements:[],recentContactHours:72}:
   path.endsWith('/settings')?{users:[],cities:[],types:[],subtypes:[],templates:[],authorizedEmails:[],opportunityStages:[]}:{};
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/accounts/1?section=history');
 await expect(page.getByRole('heading',{name:'Historial del negocio'})).toBeVisible();
 await expect(page.getByRole('tab',{name:'Qué pasó',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByText('Por contactar → Contactado',{exact:true})).toBeVisible();
 await expect(page.getByText('Resultado: Respondió, le interesa')).toBeVisible();
 await page.getByRole('button',{name:'Cambios de datos',exact:true}).click();
 await expect.poll(()=>historyKinds.at(-1)).toBe('change');
 await page.getByRole('button',{name:'Todo',exact:true}).click();
 await expect(page.getByText('Pidió una propuesta',{exact:true})).toBeVisible();
 await expect(page.getByText('WhatsApp abierto · envío no confirmado',{exact:true})).toBeVisible();
 await expect(page.getByText('Revisar propuesta',{exact:true})).toHaveCount(1);
 await expect(page.getByRole('heading',{name:'Cambios registrados',exact:true})).not.toBeVisible();
 await page.getByRole('button',{name:'Cambios registrados en los datos',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Cambios registrados',exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`test-results/commercial-history-${width}.png`,fullPage:true});
 await page.goto('/accounts/1');await expect(page.getByRole('heading',{name:'Negocio de prueba',exact:true})).toBeVisible();
 await expect(page.getByRole('tab',{name:'Qué pasó',exact:true})).toHaveAttribute('aria-selected','true');
 await page.screenshot({path:`test-results/business-detail-hierarchy-${width}.png`,fullPage:true});
 await page.getByRole('tab',{name:/^Gestiones \(/}).click();await page.getByRole('button',{name:'Iniciar gestión',exact:true}).click();
 const editor=page.getByRole('dialog');await expect(editor.getByText('Negocio:')).toBeVisible();
 await page.screenshot({path:`test-results/opportunity-editor-hierarchy-${width}.png`,fullPage:true});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
