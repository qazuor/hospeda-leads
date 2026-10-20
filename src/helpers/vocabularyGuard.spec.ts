// @vitest-environment node
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';

/**
 * Vocabulary guard (owner decision 6d): visible terms that the UX plan retires.
 * Existing occurrences are frozen in BASELINE as `path::term` (path relative to `src/`).
 * Removing an occurrence never fails; adding a new one does. Only the final vocabulary sweep (U-32) edits BASELINE.
 */
const BANNED_TERMS=['Gestión comercial inicial','Gestiones comerciales','Registrar qué pasó','Registrar actividad','Planificar','Dar de baja','Relación del negocio','Seguimiento general','Contacto general','Agregar contacto','AHORA CORRESPONDE','Sin seguimiento programado','Completá los campos obligatorios','Not authenticated','negocios u gestiones','Editar / reprogramar','Más opciones'] as const;

const BASELINE:readonly string[]=[
 'components/AccountMergeDialog.tsx::Gestiones comerciales',
 'components/AppHeader.tsx::Más opciones',
 'components/BulkChangeReview.tsx::Completá los campos obligatorios',
 'components/BusinessContactDialog.tsx::Relación del negocio',
 'components/BusinessHistory.tsx::Seguimiento general',
 'components/BusinessListTools.tsx::Completá los campos obligatorios',
 'components/BusinessReassignment.tsx::Completá los campos obligatorios',
 'components/BusinessSummary.tsx::Gestiones comerciales',
 'components/BusinessSummary.tsx::Gestión comercial inicial',
 'components/Button.tsx::Completá los campos obligatorios',
 'components/ClassificationSettings.tsx::Completá los campos obligatorios',
 'components/CommercialEditor.tsx::Dar de baja',
 'components/CommercialHelp.tsx::Sin seguimiento programado',
 'components/CommercialPanel.tsx::Agregar contacto',
 'components/CommercialPanel.tsx::Dar de baja',
 'components/CommercialPanel.tsx::Gestiones comerciales',
 'components/CommercialPanel.tsx::Gestión comercial inicial',
 'components/ContactTemplateDialog.tsx::Completá los campos obligatorios',
 'components/ContactTemplateDialog.tsx::Registrar qué pasó',
 'components/DataImportDialog.tsx::Completá los campos obligatorios',
 'components/DataQualityPanel.tsx::Completá los campos obligatorios',
 'components/FilterLegend.tsx::Completá los campos obligatorios',
 'components/GeneralContactDialog.tsx::Contacto general',
 'components/GeneralContactDialog.tsx::Relación del negocio',
 'components/InlineBusinessBadge.tsx::Completá los campos obligatorios',
 'components/InlineBusinessStatus.tsx::Completá los campos obligatorios',
 'components/LeadDetailDialog.tsx::Completá los campos obligatorios',
 'components/LeadDetailDialog.tsx::Gestión comercial inicial',
 'components/LibraryResourceSelect.tsx::Completá los campos obligatorios',
 'components/ManualAttemptResolution.tsx::Completá los campos obligatorios',
 'components/NextWork.tsx::AHORA CORRESPONDE',
 'components/NextWork.tsx::Planificar',
 'components/PdfPreview.tsx::Completá los campos obligatorios',
 'components/PersonalViewsDialog.tsx::Completá los campos obligatorios',
 'components/Pipeline.tsx::Dar de baja',
 'components/Pipeline.tsx::Gestión comercial inicial',
 'components/Pipeline.tsx::Relación del negocio',
 'components/PipelineSettings.tsx::Gestiones comerciales',
 'components/PipelineSettings.tsx::Planificar',
 'components/ProfileDialog.tsx::Completá los campos obligatorios',
 'components/ResourceLinkForm.tsx::Gestión comercial inicial',
 'components/ResourcesPanel.tsx::Completá los campos obligatorios',
 'components/ResourcesPanel.tsx::Dar de baja',
 'components/ResourcesPanel.tsx::Gestión comercial inicial',
 'components/RichTemplateEditor.tsx::Completá los campos obligatorios',
 'components/TaskContactDialog.tsx::Completá los campos obligatorios',
 'components/TaskContactDialog.tsx::Registrar qué pasó',
 'components/TaskContactDialog.tsx::Relación del negocio',
 'components/TaskContactDialog.tsx::Seguimiento general',
 'components/WorkEditor.tsx::Dar de baja',
 'components/WorkEditor.tsx::Editar / reprogramar',
 'components/WorkEditor.tsx::Gestión comercial inicial',
 'components/WorkEditor.tsx::Planificar',
 'components/WorkEditor.tsx::Registrar actividad',
 'components/WorkEditor.tsx::Registrar qué pasó',
 'components/WorkEditor.tsx::Relación del negocio',
 'components/WorkEditor.tsx::Seguimiento general',
 'components/WorkFlowSteps.tsx::Registrar qué pasó',
 'components/WorkPanel.tsx::Dar de baja',
 'components/WorkPanel.tsx::Editar / reprogramar',
 'components/WorkPanel.tsx::Registrar actividad',
 'components/WorkPanel.tsx::Registrar qué pasó',
 'components/ui/CrmButton.tsx::Completá los campos obligatorios',
 'endpoints/auth/logout_POST.ts::Not authenticated',
 'endpoints/auth/session_GET.ts::Not authenticated',
 'endpoints/work.ts::negocios u gestiones',
 'helpers/appNavigation.ts::Gestiones comerciales',
 'helpers/getSetServerSession.tsx::Not authenticated',
 'helpers/useAuth.tsx::Not authenticated',
 'pages/_index.tsx::Completá los campos obligatorios',
 'pages/_index.tsx::Gestiones comerciales',
 'pages/_index.tsx::Gestión comercial inicial',
 'pages/analytics.tsx::Gestiones comerciales',
 'pages/business-list.tsx::Completá los campos obligatorios',
 'pages/my-day.tsx::Gestiones comerciales',
 'pages/my-day.tsx::Gestión comercial inicial',
 'pages/my-day.tsx::Planificar',
 'pages/my-day.tsx::Registrar actividad',
 'pages/reactivation.tsx::Gestión comercial inicial',
 'pages/sale.tsx::Gestiones comerciales',
 'pages/settings.tsx::Completá los campos obligatorios',
 'pages/templates.tsx::Completá los campos obligatorios',
];

const srcRoot=fileURLToPath(new URL('..',import.meta.url));
const scanned=(file:string)=>/\.(ts|tsx)$/.test(file)&&!/\.(spec|test)\.tsx?$/.test(file)&&!file.endsWith('.schema.ts');
const listFiles=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?listFiles(join(dir,entry.name)):[join(dir,entry.name)]);
/** Returns every `path::term` occurrence of a banned term in `src/`. */
const findViolations=()=>listFiles(srcRoot).filter(scanned).flatMap(file=>{
 const text=readFileSync(file,'utf8');
 const path=relative(srcRoot,file).split(sep).join('/');
 return BANNED_TERMS.filter(term=>text.includes(term)).map(term=>`${path}::${term}`);
});

describe('vocabulary guard',()=>{
 it('adds no banned visible term outside the frozen baseline',()=>{
  const allowed=new Set(BASELINE);
  expect(findViolations().filter(violation=>!allowed.has(violation))).toEqual([]);
 });

 it('actually scans the source tree',()=>{
  expect(listFiles(srcRoot).filter(scanned).length).toBeGreaterThan(100);
  expect(BASELINE.every(entry=>BANNED_TERMS.some(term=>entry.endsWith('::'+term)))).toBe(true);
 });
});
