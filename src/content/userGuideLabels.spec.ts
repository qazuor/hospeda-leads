// @vitest-environment node
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {mainNavigation,todayViews} from '../helpers/appNavigation';
import {businessStatusLabels} from '../helpers/businessStatus';
import guide from './user-guide.json';
import {VOCAB} from './vocabulary';

/**
 * In-app guide vs. the real UI (UX plan U-33).
 * Convention: every button, tab, heading or option the guide cites is written between guillemets («Contactar») in the article text and listed in the
 * article's `uiLabels`. These tests make the guide fail loudly when a cited label no longer exists in `src/`, so a UI rename cannot silently leave the guide stale.
 * A label "exists" when it is a whole string literal or a whole JSX text node in a non-spec source file (comments do not count, a word inside a longer sentence does not count).
 */
type Article={id:string;title:string;when:string;steps:string[];result:string;example:string[];notes:string[];url:string;linkLabel:string;uiLabels:string[]};
const articles=guide.flatMap(topic=>(topic.articles as Article[]).map(article=>({topic:topic.id,article})));

const srcRoot=fileURLToPath(new URL('..',import.meta.url));
const isSource=(file:string)=>/\.(ts|tsx)$/.test(file)&&!/\.(spec|test)\.tsx?$/.test(file);
const listFiles=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?listFiles(join(dir,entry.name)):[join(dir,entry.name)]);
const stripComments=(text:string)=>text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\s)\/\/.*$/gm,'$1');
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** True when `label` is a whole literal or JSX text node of `corpus` (comments are ignored by the caller). */
const labelExists=({label,corpus}:{label:string;corpus:string})=>new RegExp('(^|[\'"`>}] ?)'+escape(label)+'([\'"`<{:]| \\(| ·|$)','m').test(corpus);
/** Every guillemet-quoted label of an article's visible text, in order and without repeats. */
const quotedLabels=(article:Article)=>[...new Set([article.title,article.when,...article.steps,article.result,...article.example,...article.notes].flatMap(text=>[...text.matchAll(/«([^»]+)»/g)].map(match=>match[1])))];

/**
 * Only files that render UI count: not the server, endpoints, history/journal label maps or audit-text maps (a renamed banner must not keep passing because the same words survive in an audit label).
 * Helpers count only when they hold UI words the screens read (navigation, statuses, outcomes, guidance, labels).
 */
const uiHelpers=['appNavigation','businessStatus','businessSections','workOutcomes','workGuidance','crmLabels','messageLabels','contactOutcome','contactPurpose','nextStep','firstSteps','businessListPreferences','recontactTask','communicationTimeline'];
const isUiSource=(path:string)=>/^(components|pages|content)\//.test(path)&&path!=='pages/history.tsx'||uiHelpers.some(name=>path==='helpers/'+name+'.ts');
const isAuditMap=(line:string)=>/^\s*(export\s+)?const\s+(actionLabels|fieldLabels|auditFields|eventTitles|statusNames|channelNames)\b/.test(line);
/** Single words so common that a literal match proves little. They stay checked, but only weakly: prefer citing a longer, more specific label. */
const WEAKLY_CHECKED=['Actualizar','Contexto','Deshacer','Documentos','Email','Llamada','Lunes','Lista','Mañana','Mes','Notas','Propósito','Seguimiento','Sistema','Tipo','Usuarios'] as const;
/** The WhatsApp user script renders its own UI inside WhatsApp Web; the guide cites its labels too. */
const userscriptRoot=fileURLToPath(new URL('../../userscript/src',import.meta.url));
const readSource=(root:string,prefix:string)=>listFiles(root).filter(isSource).map(file=>({path:prefix+relative(root,file).split(sep).join('/'),text:stripComments(readFileSync(file,'utf8')).split('\n').filter(line=>!isAuditMap(line)).join('\n')}));
const corpus=[...readSource(srcRoot,'').filter(file=>isUiSource(file.path)),...readSource(userscriptRoot,'userscript/')];
const allSource=corpus.map(file=>file.text).join('\n');

describe('labelExists',()=>{
 it('accepts whole literals and whole JSX text nodes',()=>{
  expect(labelExists({label:'Anotar lo que pasó',corpus:"logWhatHappened:'Anotar lo que pasó',"})).toBe(true);
  expect(labelExists({label:'Contactar',corpus:'<Button>Contactar</Button>'})).toBe(true);
  expect(labelExists({label:'Próximas acciones',corpus:'<DisclosureSummary>Próximas acciones ({count})</DisclosureSummary>'})).toBe(true);
  expect(labelExists({label:'Elegir fecha…',corpus:'<Item>Elegir fecha…</Item>'})).toBe(true);
 });
 it('rejects a renamed label, a word inside a longer sentence and a comment-only mention',()=>{
  expect(labelExists({label:'Contactar',corpus:"label:'Contactar negocio'"})).toBe(false);
  expect(labelExists({label:'Posponer',corpus:"'Posponer tarea'"})).toBe(false);
  expect(labelExists({label:'Hoy',corpus:"'Mostramos lo de Hoy y mañana'"})).toBe(false);
  expect(labelExists({label:'Mi día',corpus:stripComments('// Mi día was renamed\nconst a=1;')})).toBe(false);
 });
});

describe('user guide labels',()=>{
 it('declares uiLabels for every article and cites a healthy number of labels',()=>{
  expect(articles.length).toBeGreaterThan(30);
  expect(articles.filter(({article})=>article.uiLabels.length>0).length).toBeGreaterThan(30);
  expect(articles.reduce((sum,{article})=>sum+article.uiLabels.length,0)).toBeGreaterThan(250);
  expect(new Set(articles.map(({topic,article})=>topic+'/'+article.id)).size).toBe(articles.length);
 });

 it('keeps guillemets balanced and uiLabels equal to the labels quoted in the text',()=>{
  const problems=articles.flatMap(({article})=>{
   const text=[article.title,article.when,...article.steps,article.result,...article.example,...article.notes].join('\n');
   const quoted=quotedLabels(article),declared=article.uiLabels;
   return [
    ...((text.match(/«/g)??[]).length!==(text.match(/»/g)??[]).length?[article.id+': unbalanced « »']:[]),
    ...(new Set(declared).size!==declared.length?[article.id+': duplicate uiLabels']:[]),
    ...quoted.filter(label=>!declared.includes(label)).map(label=>article.id+': «'+label+'» is quoted but not in uiLabels'),
    ...declared.filter(label=>!quoted.includes(label)).map(label=>article.id+': «'+label+'» is in uiLabels but never quoted in the text')
   ];
  });
  expect(problems).toEqual([]);
 });

 it('only cites labels that still exist as literals in the app source',()=>{
  const missing=articles.flatMap(({article})=>article.uiLabels.filter(label=>!labelExists({label,corpus:allSource})).map(label=>article.id+': «'+label+'»'));
  expect(missing).toEqual([]);
 });

 it('keeps the weakly checked list honest: every entry is still cited, and the corpus excludes audit text',()=>{
  const cited=new Set(articles.flatMap(({article})=>article.uiLabels));
  expect(WEAKLY_CHECKED.filter(label=>!cited.has(label))).toEqual([]);
  expect(corpus.some(file=>file.path.startsWith('server/')||file.path.startsWith('endpoints/')||file.path==='helpers/historyLabels.ts'||file.path==='pages/history.tsx')).toBe(false);
  expect(corpus.length).toBeGreaterThan(50);
  expect(isAuditMap('const actionLabels:Record<string,string>={account_archived:"Negocio archivado"};')).toBe(true);
  expect(labelExists({label:'Negocio archivado',corpus:corpus.filter(file=>['components/CommercialPanel.tsx','components/BusinessSidebar.tsx'].includes(file.path)).map(file=>file.text).join('\n')})).toBe(true);
 });

 it('cites the navigation, the Hoy views and the core actions with their current names',()=>{
  const cited=new Set(articles.flatMap(({article})=>article.uiLabels));
  const required=[...mainNavigation.map(item=>item.label),...todayViews.map(item=>item.label),VOCAB.scheduleTask,VOCAB.logWhatHappened,VOCAB.logOutcome,VOCAB.contact,VOCAB.howDidItGo,VOCAB.whatsNext,VOCAB.noLongerNeeded,'Posponer','Primeros pasos'];
  expect(required.filter(label=>!cited.has(label))).toEqual([]);
 });

 it('names every business status the way the app does',()=>{
  const text=articles.flatMap(({article})=>[...article.steps,article.result,...article.notes]).join('\n');
  expect(Object.values(businessStatusLabels).filter(label=>!text.includes(label))).toEqual([]);
 });

 it('links only to routes and Hoy views that exist',()=>{
  const main=readFileSync(join(srcRoot,'main.tsx'),'utf8');
  const bad=articles.filter(({article})=>article.url).flatMap(({article})=>{
   const [path,query]=article.url.split('?'),view=new URLSearchParams(query).get('view');
   return [...(main.includes('path="'+path+'"')?[]:[article.id+': no route '+path]),...(view&&!todayViews.some(item=>item.view===view)?[article.id+': unknown Hoy view '+view]:[]),...(article.linkLabel?[]:[article.id+': link without linkLabel'])];
  });
  expect(bad).toEqual([]);
 });
 it('resolves every deep link into the guide that the app itself contains',()=>{
  const links=[...allSource.matchAll(/guide\?topic=([a-z-]+)(?:&article=([a-z-]+))?/g)].map(match=>[match[1],match[2]]),calls=[...allSource.matchAll(/url\('([a-z-]+)',\s*'([a-z-]+)'\)/g)].map(match=>[match[1],match[2]]);
  expect(links.length+calls.length).toBeGreaterThan(3);
  const bad=[...links,...calls].filter(([topic,id])=>{const found=guide.find(item=>item.id===topic);return !found||(!!id&&!found.articles.some(item=>item.id===id));});
  expect(bad).toEqual([]);
 });
});

describe('document guide controls',()=>{it('names both linking and own-document controls',()=>{const article=guide.flatMap(topic=>topic.articles).find(item=>item.id==='documents');expect(article?.steps.join(' ')).toContain('«Agregar documento o recurso»');expect(article?.uiLabels).toContain('Agregar documento o recurso');expect(article?.steps.join(' ')).toContain('«Agregar documento»');expect(article?.uiLabels).toContain('Agregar documento')})});
