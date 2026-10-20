import {test,expect} from '@playwright/test';
import superjson from 'superjson';

test('reactivation rows summarize the business date and link the actionable task',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const data={historicalReview:[],configJournal:[],stages:[],managementReasons:[{id:'4',managementType:'main',outcomeKey:'lost',reasonKey:'no_response',name:'No respondió',doNotContact:false,requiresNote:false,active:true}],lossReasons:[],objectionTypes:[],rules:[],insights:[],events:[],objections:[],reactivations:[
  {id:'10',accountId:'1',nombre:'Cabañas del Río',opportunityName:'Plan de alojamiento',tipo:'Alojamiento',managementType:'main',assignedUserEmail:'admin@example.com',estado:'main:lost',pipelineRevision:1,eventId:'101',reasonId:'4',comment:'Retomar en noviembre',recontactDate:'2026-11-01',businessStatus:'recontact',businessRecontactDate:'2026-11-01',taskId:'15',taskTitle:'Llamar por la propuesta',taskStatus:'pending',taskDueDate:'2026-11-01',relatedLeadId:'10',relatedOpportunityName:'Plan de alojamiento',doNotContact:false},
  {id:'11',accountId:'2',nombre:'Hostería del Valle',opportunityName:'Ficha Hospeda',tipo:'Alojamiento',managementType:'main',assignedUserEmail:'admin@example.com',estado:'main:lost',pipelineRevision:1,eventId:'102',reasonId:'4',comment:null,recontactDate:'2026-11-05',businessStatus:'no_follow_up_scheduled',businessRecontactDate:null,taskId:null,taskTitle:null,taskStatus:null,taskDueDate:null,relatedLeadId:null,relatedOpportunityName:null,doNotContact:false}
 ],total:2,page:1,users:[{email:'admin@example.com',displayName:'Admin'}],verticals:['Alojamiento']};
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  await route.fulfill({contentType:'application/json',body:superjson.stringify(path.endsWith('/auth/session')?{user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}:path.endsWith('/pipeline')?data:{})});
 });
 // Old bookmark: Reactivación now lives in Hoy → Para retomar.
 await page.goto('/reactivation');
 await expect(page).toHaveURL(/\/my-day\?view=retomar$/);
 await expect(page.getByRole('tab',{name:'Para retomar',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('tabpanel',{name:'Para retomar',exact:true})).toBeVisible();
 await expect(page).toHaveTitle('Hoy · Hospeda CRM');
 await expect(page.getByRole('link',{name:'Ir a Gestiones',exact:true})).toHaveAttribute('href','/opportunities');
 const planned=page.locator('article').filter({hasText:'Cabañas del Río'});
 await expect(planned).toContainText('Estado del negocio: Recontactar');
 await expect(planned).toContainText('La fecha resume esta tarea');
 await expect(planned.getByRole('link',{name:'Abrir tarea: Llamar por la propuesta'})).toHaveAttribute('href','/my-day?accountId=1&taskId=15');
 await expect(planned).toContainText('Estado de la tarea: Pendiente');
 await expect(planned).not.toContainText('Fecha acordada para retomar:');
 await expect(planned.getByRole('button',{name:'Elegir cómo retomar',exact:true})).toBeDisabled();
 const unplanned=page.locator('article').filter({hasText:'Hostería del Valle'});
 await unplanned.getByRole('button',{name:'Elegir cómo retomar',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('heading',{name:'Elegir cómo retomar'})).toBeVisible();
 await expect(dialog.getByRole('combobox',{name:'Acción'})).toContainText('Crear seguimiento y conservar cerrada');
});
