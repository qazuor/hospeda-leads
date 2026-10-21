import {test,expect,type Page} from '@playwright/test';
import superjson from 'superjson';
import {localDay} from '../../src/helpers/workDates';
import {pickOutcome} from './support/outcome';
import {waitForTransitions} from './support/transitions';

async function login(page:Page){
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/my-day$/);
}
async function api(page:Page,endpoint:string,body?:unknown){const result=await page.evaluate(async({endpoint,body})=>{const r=await fetch('/_api/'+endpoint,body?{method:'POST',headers:{'Content-Type':'application/json'},body}:{});return {status:r.status,text:await r.text()}},{endpoint,body:body?superjson.stringify(body):undefined});expect(result.status,result.text).toBe(200);return superjson.parse<any>(result.text);}
/** A business with one open management, a phone, and a logged call that now waits for "¿Cómo salió?". */
async function startCall(page:Page,label:string,button:'Ya llamé: anotar cómo salió'|'No me atendieron',person?:string){
 const stamp=Date.now(),accountId=(await api(page,'commercial',{action:'account_save',nombre:label+' '+stamp,telefono:'+5493442'+String(stamp).slice(-6),assignedUserEmail:'admin@example.com'})).id;
 const leadId=(await api(page,'commercial',{action:'opportunity_save',accountId,confirmReviewed:true,opportunityName:'Gestión '+label+' '+stamp,estado:'Cargado'})).id;
 if(person)await api(page,'commercial',{action:'contact_save',accountId,name:person,phone:'+5493442000888',isPrimary:true});
 await page.goto('/sales/'+leadId);await page.getByRole('tab',{name:'Comunicación',exact:true}).click();
 await page.getByText('Registrar una llamada',{exact:true}).click();await waitForTransitions(page);
 if(person){const who=page.getByLabel('¿A quién llamás?');await who.selectOption((await who.locator('option',{hasText:person}).getAttribute('value'))!);}
 await page.getByRole('button',{name:button,exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Anotar lo que pasó',exact:true});await expect(editor).toBeVisible();
 return {accountId,leadId,editor};
}

test('after "No me atendieron" the editor already says "No respondió" and suggests waiting for a date',async({page})=>{
 test.setTimeout(90000);await login(page);
 const {leadId,editor}=await startCall(page,'Sin respuesta','No me atendieron');
 await expect(editor.getByText('Paso 3 de 3',{exact:false})).toBeVisible();
 await expect(editor.getByText('Canal:',{exact:false})).toContainText('Teléfono');
 await expect(editor.getByRole('combobox',{name:'Propósito',exact:true})).toHaveCount(0);
 await expect(editor.getByRole('radio',{name:'No respondió',exact:true})).toBeChecked();
 await expect(editor.getByRole('radio')).toHaveCount(6);
 // Moving to another result drops the suggested wait; a choice she made herself is kept.
 await pickOutcome(editor,'interested');await expect(editor.getByRole('combobox',{name:/^¿Cómo sigue\?/})).toHaveValue('');
 await pickOutcome(editor,'no_answer');await expect(editor.getByRole('combobox',{name:/^¿Cómo sigue\?/})).toHaveValue('wait');
 await editor.getByRole('combobox',{name:/^¿Cómo sigue\?/}).selectOption('task');await pickOutcome(editor,'interested');await expect(editor.getByRole('combobox',{name:/^¿Cómo sigue\?/})).toHaveValue('task');
 await pickOutcome(editor,'no_answer');await editor.getByRole('combobox',{name:/^¿Cómo sigue\?/}).selectOption('wait');
 await expect(editor.getByRole('combobox',{name:/^¿Cómo sigue\?/})).toHaveValue('wait');
 // The date is never invented: saving without one is refused until she picks it.
 await editor.getByRole('button',{name:'Guardar y programar',exact:true}).click();
 await expect(editor.getByRole('textbox',{name:/Cuándo/})).toBeFocused();
 await editor.getByRole('button',{name:'Mañana',exact:true}).click();
 await editor.getByRole('button',{name:'Guardar y programar',exact:true}).click();await expect(editor).toHaveCount(0);
 const detail=await api(page,'work?mode=detail&leadId='+leadId);
 expect(detail.activities.some((a:any)=>a.outcome==='no_answer')).toBe(true);
 expect(detail.tasks.some((t:any)=>t.title==='Retomar conversación')).toBe(true);
});

test('a required field inside the closed "Fecha, canal y participantes" opens it and gets focus',async({page})=>{
 test.setTimeout(90000);await login(page);
 const {editor}=await startCall(page,'Validación','Ya llamé: anotar cómo salió');
 await editor.getByRole('button',{name:'Cambiar',exact:true}).click();await waitForTransitions(page);
 const when=editor.getByLabel('Fecha y hora real');await expect(when).toBeVisible();await when.fill('');
 await editor.getByText('Fecha, canal y participantes',{exact:true}).click();await waitForTransitions(page);await expect(when).toBeHidden();
 await pickOutcome(editor,'other');
 await editor.getByRole('combobox',{name:/^¿Cómo sigue\?/}).selectOption('done');
 await editor.getByRole('combobox',{name:'¿Por qué no agendás nada?',exact:true}).selectOption('Ya tengo otra tarea agendada');
 await editor.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(when).toBeVisible();await expect(when).toBeFocused();await expect(editor.getByText('Completá este dato.')).toBeVisible();
 await expect(editor).toBeVisible();
});

test('"Pidió no ser contactado" asks for confirmation inline and blocks the whole business',async({page})=>{
 test.setTimeout(90000);await login(page);
 const {accountId,leadId,editor}=await startCall(page,'Bloqueo','Ya llamé: anotar cómo salió','Ana del bloqueo');
 const messageId=(await api(page,'communication?leadId='+leadId)).messages[0].id;
 await expect(api(page,'work?mode=day').then(day=>day.pendingOutcomes.map((p:any)=>p.id))).resolves.toContain(messageId);
 await pickOutcome(editor,'do_not_contact');
 await expect(editor.getByRole('combobox',{name:/^¿Cómo sigue\?/})).toHaveCount(0);
 await expect(editor.getByText('Se bloquea todo el negocio',{exact:false})).toBeVisible();
 const close=editor.getByRole('checkbox',{name:/^Gestión/});await expect(close).not.toBeChecked();
 await editor.getByRole('button',{name:'Bloquear contacto',exact:true}).click();
 await expect(editor).toBeVisible();expect((await api(page,'commercial?accountId='+accountId)).account.doNotContact).toBe(false);
 await editor.getByRole('checkbox',{name:/Confirmo que no se le va a poder contactar/}).check();
 await editor.getByRole('button',{name:'Bloquear contacto',exact:true}).click();await expect(editor).toHaveCount(0);
 const detail=await api(page,'commercial?accountId='+accountId);
 expect(detail.account.doNotContact).toBe(true);
 const day=await api(page,'work?mode=day');expect(day.pendingOutcomes.map((p:any)=>p.id)).not.toContain(messageId);
});

test('"Cambiar" next to the channel reveals the hidden fields in Mi día completion',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const task={id:'1',accountId:'1',leadId:null,title:'Consultar necesidades',purpose:'commercial',description:null,typeId:'call',assignedUserEmail:'admin@example.com',dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Negocio de prueba',city:'Colón',opportunityName:null,deletedAt:null};
 const data={tasks:[task],activities:[],types:[{id:'call',name:'Llamada',active:true,agenda:false},{id:'followup',name:'Seguimiento',active:true,agenda:false}],accounts:[{id:'1',nombre:'Negocio de prueba',assignedUserEmail:'admin@example.com'}],opportunities:[],contacts:[],users:[{email:'admin@example.com',displayName:'Admin'}],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:1,totalActivities:0,page:1,bucketCounts:{overdue:0,today:1,upcoming:0},cities:[],verticals:[]};
 await page.route('**/_api/**',async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({contentType:'application/json',body:superjson.stringify(path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:path.endsWith('/work')?data:{})});});
 await page.goto('/my-day');await page.locator('article').filter({has:page.getByText('Consultar necesidades',{exact:true})}).getByRole('button',{name:'Anotar cómo salió',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Anotar lo que pasó',exact:true})).toBeVisible();
 await expect(dialog.getByText('Tarea: algo pendiente con fecha',{exact:false})).toHaveCount(0);
 await expect(dialog.getByRole('combobox',{name:'Propósito',exact:true})).toHaveCount(0);
 await expect(dialog.getByLabel('Fecha y hora real')).toBeHidden();
 await dialog.getByRole('button',{name:'Cambiar',exact:true}).click();await waitForTransitions(page);await expect(dialog.getByLabel('Fecha y hora real')).toBeVisible();
 // The result is a group of big radio buttons and nothing is chosen for her.
 await expect(dialog.getByRole('radio')).toHaveCount(5);await expect(dialog.locator('input[name="outcome"]:checked')).toHaveCount(0);
});

test('the results group links its error to the radios',async({page})=>{
 test.setTimeout(90000);await login(page);
 const {editor}=await startCall(page,'Error de grupo','Ya llamé: anotar cómo salió');
 await editor.getByRole('button',{name:'Guardar',exact:true}).click();
 const first=editor.getByRole('radio').first();await expect(first).toBeFocused();await expect(first).toHaveAttribute('aria-invalid','true');
 const errorId=await first.getAttribute('aria-describedby');expect(errorId).toBeTruthy();await expect(page.locator('#'+errorId)).toHaveText('Elegí qué pasó.');
 await pickOutcome(editor,'other');await expect(first).not.toHaveAttribute('aria-invalid','true');
});
