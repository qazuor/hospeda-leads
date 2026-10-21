// @vitest-environment node
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';

/**
 * Vocabulary guard (owner decision 6d): visible terms that the UX plan retires.
 * Existing occurrences are frozen in BASELINE as `path::term` → count (path relative to `src/`).
 * Removing occurrences never fails; a new file/term pair or a higher count does. Only the final vocabulary sweep (U-32) edits BASELINE.
 */
const BANNED_TERMS=['Gestión comercial inicial','Gestiones comerciales','Registrar qué pasó','Registrar actividad','Planificar','Dar de baja','Relación del negocio','Seguimiento general','Contacto general','Agregar contacto','AHORA CORRESPONDE','Sin seguimiento programado','Completá los campos obligatorios','Not authenticated','negocios u gestiones','Editar / reprogramar','Más opciones'] as const;

const BASELINE:Readonly<Record<string,number>>={
 'components/AccountMergeDialog.tsx::Gestiones comerciales':1,
 'components/AppHeader.tsx::Más opciones':1,
 'components/BulkChangeReview.tsx::Completá los campos obligatorios':3,
 'components/BusinessContactDialog.tsx::Relación del negocio':1,
 'components/BusinessHistory.tsx::Seguimiento general':2,
 'components/BusinessListTools.tsx::Completá los campos obligatorios':1,
 'components/BusinessReassignment.tsx::Completá los campos obligatorios':2,
 'components/BusinessSummary.tsx::Gestiones comerciales':1,
 'components/BusinessSummary.tsx::Gestión comercial inicial':1,
 'components/Button.tsx::Completá los campos obligatorios':1,
 'components/ClassificationSettings.tsx::Completá los campos obligatorios':3,
 'components/CommercialEditor.tsx::Dar de baja':1,
 'components/CommercialHelp.tsx::Sin seguimiento programado':1,
 'components/CommercialPanel.tsx::Agregar contacto':1,
 'components/CommercialPanel.tsx::Dar de baja':1,
 'components/CommercialPanel.tsx::Gestiones comerciales':3,
 'components/CommercialPanel.tsx::Gestión comercial inicial':1,
 'components/ContactTemplateDialog.tsx::Completá los campos obligatorios':1,
 'components/ContactTemplateDialog.tsx::Registrar qué pasó':1,
 'components/DataImportDialog.tsx::Completá los campos obligatorios':2,
 'components/DataQualityPanel.tsx::Completá los campos obligatorios':1,
 'components/FilterLegend.tsx::Completá los campos obligatorios':1,
 'components/InlineBusinessBadge.tsx::Completá los campos obligatorios':1,
 'components/InlineBusinessStatus.tsx::Completá los campos obligatorios':1,
 'components/LeadDetailDialog.tsx::Completá los campos obligatorios':3,
 'components/LeadDetailDialog.tsx::Gestión comercial inicial':1,
 'components/LibraryResourceSelect.tsx::Completá los campos obligatorios':2,
 'components/ManualAttemptResolution.tsx::Completá los campos obligatorios':1,
 'components/NextWork.tsx::AHORA CORRESPONDE':1,
 'components/NextWork.tsx::Planificar':1,
 'components/PdfPreview.tsx::Completá los campos obligatorios':2,
 'components/PersonalViewsDialog.tsx::Completá los campos obligatorios':7,
 'components/Pipeline.tsx::Dar de baja':1,
 'components/Pipeline.tsx::Gestión comercial inicial':2,
 'components/Pipeline.tsx::Relación del negocio':1,
 'components/PipelineSettings.tsx::Gestiones comerciales':1,
 'components/PipelineSettings.tsx::Planificar':1,
 'components/ProfileDialog.tsx::Completá los campos obligatorios':1,
 'components/ResourceLinkForm.tsx::Gestión comercial inicial':2,
 'components/ResourcesPanel.tsx::Completá los campos obligatorios':3,
 'components/ResourcesPanel.tsx::Dar de baja':3,
 'components/ResourcesPanel.tsx::Gestión comercial inicial':3,
 'components/RichTemplateEditor.tsx::Completá los campos obligatorios':1,
 'components/TaskContactDialog.tsx::Completá los campos obligatorios':1,
 'components/TaskContactDialog.tsx::Registrar qué pasó':1,
 'components/TaskContactDialog.tsx::Relación del negocio':1,
 'components/TaskContactDialog.tsx::Seguimiento general':1,
 'components/WorkEditor.tsx::Dar de baja':2,
 'components/WorkEditor.tsx::Editar / reprogramar':1,
 'components/WorkEditor.tsx::Gestión comercial inicial':1,
 'components/WorkEditor.tsx::Planificar':3,
 'components/WorkEditor.tsx::Registrar actividad':1,
 'components/WorkEditor.tsx::Registrar qué pasó':1,
 'components/WorkEditor.tsx::Relación del negocio':1,
 'components/WorkEditor.tsx::Seguimiento general':5,
 'components/WorkFlowSteps.tsx::Registrar qué pasó':1,
 'components/WorkPanel.tsx::Dar de baja':2,
 'components/WorkPanel.tsx::Editar / reprogramar':1,
 'components/WorkPanel.tsx::Registrar actividad':2,
 'components/WorkPanel.tsx::Registrar qué pasó':1,
 'components/ui/CrmButton.tsx::Completá los campos obligatorios':1,
 'endpoints/auth/logout_POST.ts::Not authenticated':1,
 'endpoints/auth/session_GET.ts::Not authenticated':1,
 'endpoints/work.ts::negocios u gestiones':1,
 'helpers/appNavigation.ts::Gestiones comerciales':1,
 'helpers/getSetServerSession.tsx::Not authenticated':1,
 'helpers/useAuth.tsx::Not authenticated':1,
 'pages/_index.tsx::Completá los campos obligatorios':6,
 'pages/_index.tsx::Gestiones comerciales':5,
 'pages/_index.tsx::Gestión comercial inicial':3,
 'pages/analytics.tsx::Gestiones comerciales':6,
 'pages/business-list.tsx::Completá los campos obligatorios':1,
 'pages/my-day.tsx::Gestiones comerciales':2,
 'pages/my-day.tsx::Gestión comercial inicial':1,
 'pages/my-day.tsx::Planificar':3,
 'pages/my-day.tsx::Registrar actividad':1,
 'pages/reactivation.tsx::Gestión comercial inicial':1,
 'pages/sale.tsx::Gestiones comerciales':1,
 'pages/settings.tsx::Completá los campos obligatorios':2,
 'pages/templates.tsx::Completá los campos obligatorios':1,
};

const srcRoot=fileURLToPath(new URL('..',import.meta.url));
const scanned=(file:string)=>/\.(ts|tsx)$/.test(file)&&!/\.(spec|test)\.tsx?$/.test(file)&&!file.endsWith('.schema.ts');
const listFiles=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?listFiles(join(dir,entry.name)):[join(dir,entry.name)]);
/** Returns every `path::term` pair with its occurrence count for banned terms in `src/`. */
const findOccurrences=()=>listFiles(srcRoot).filter(scanned).flatMap(file=>{
 const text=readFileSync(file,'utf8');
 const path=relative(srcRoot,file).split(sep).join('/');
 return BANNED_TERMS.map(term=>({key:`${path}::${term}`,count:text.split(term).length-1})).filter(entry=>entry.count>0);
});

describe('vocabulary guard',()=>{
 it('adds no banned visible term outside the frozen baseline',()=>{
  expect(findOccurrences().filter(({key,count})=>count>(BASELINE[key]??0)).map(({key,count})=>`${key} (${count}, frozen ${BASELINE[key]??0})`)).toEqual([]);
 });

 it('actually scans the source tree',()=>{
  expect(listFiles(srcRoot).filter(scanned).length).toBeGreaterThan(100);
  expect(Object.keys(BASELINE).every(entry=>BANNED_TERMS.some(term=>entry.endsWith('::'+term)))).toBe(true);
 });
});
