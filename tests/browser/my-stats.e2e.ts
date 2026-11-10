import {test,expect} from '@playwright/test';
import superjson from 'superjson';

const stats={period:{from:'2026-11-01',to:'2026-11-09'},asOf:'2026-11-09',work:{completed:2,overdue:1,today:3},businesses:{total:4,doNotContact:1,byStatus:[{status:'new',count:2},{status:'reviewed',count:2}]},managements:{open:3,won:1,lost:1,closeRate:50,lossReasons:[{reason:'Sin respuesta',count:1}],stale:1},contacts:{events:2,businesses:1,firstContactAverageDays:4,firstContactSamples:2},series:{granularity:'day' as const,points:[{period:'2026-11-09',contacts:2,won:1}]}};

for(const role of ['user','admin'] as const)test(`${role} can view personal statistics and keep the period URL`,async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.addInitScript(()=>localStorage.setItem('hospeda-live-mode','off'));
 await page.route('**/_api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const data=path.endsWith('/auth/session')?{user:{id:3,email:'seller@example.com',displayName:'Vendedora',role}}:path.endsWith('/my_stats')?stats:path.endsWith('/analytics')?{pipelineOpen:0,pipelineWon:0,pipelineLost:0,lossReasons:[],total:0,pending:0,subscribed:0,overdue:0,withPhone:0,withEmail:0,withWebsite:0,noContact:0,inactive30:0,contacted:0,conversionRate:0,new7:0,avgDaysToFirstContact:null,firstContactSamples:0,byCity:[],byStatus:[],byType:[],bySubtype:[],byOrigin:[],byPriority:[],byResponsible:[],byTypeConversion:[],byResponsibleConversion:[],avgDaysByStatus:[],createdByDay:[]}:path.endsWith('/settings')?{users:[],cities:[],types:[],subtypes:[],contactChannels:[],templates:[],authorizedEmails:[],opportunityStages:[]}:{ };
  await route.fulfill({contentType:'application/json',body:superjson.stringify(data)});
 });
 await page.goto('/my-stats');await expect(page).toHaveURL(/period=month/);await expect(page.getByRole('heading',{name:'Mis estadísticas'})).toBeVisible();
 const menuLink=page.getByRole('link',{name:'Mis estadísticas',exact:true}).first();await expect(menuLink).toBeVisible();await menuLink.click();await expect(page).toHaveURL(/\/my-stats\?period=month/);
 await expect(page.getByRole('heading',{name:'Mi trabajo'})).toBeVisible();await expect(page.getByRole('heading',{name:'Mis negocios'})).toBeVisible();await expect(page.getByRole('heading',{name:'Mis gestiones'})).toBeVisible();await expect(page.getByRole('heading',{name:'Mis contactos'})).toBeVisible();
 await page.getByRole('button',{name:'Esta semana',exact:true}).click();await expect(page).toHaveURL(/period=week/);await page.reload();await expect(page.getByRole('button',{name:'Esta semana',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 // The mobile bottom bar keeps one row: «Mis estadísticas» lives in «Más».
 const bottom=page.getByRole('navigation',{name:'Navegación inferior'});await expect(bottom.getByRole('link',{name:'Mis estadísticas'})).toHaveCount(0);await bottom.getByRole('button',{name:'Más'}).click();await expect(page.getByRole('dialog').getByRole('link',{name:'Mis estadísticas'})).toBeVisible();await page.keyboard.press('Escape');
 await expect(page.getByText('Los grupos no enlazan')).toHaveCount(0);await expect(page.getByText('Pocos datos',{exact:true})).toBeVisible();
 if(role==='admin'){await page.goto('/analytics');await expect(page).toHaveURL(/\/analytics$/);await expect(page.getByRole('heading',{name:'Estadísticas'})).toBeVisible();}
});
