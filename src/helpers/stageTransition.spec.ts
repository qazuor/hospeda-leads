import {describe,expect,it} from 'vitest';
import {isReopenLocked,pipelineEventTitle,stageChangeMessage,stageDisplayName,stageOptionGroups,type StageOption} from './stageTransition';

const stage=(name:string,classification:StageOption['classification'],extra:Partial<StageOption>={}):StageOption=>({name,displayName:null,classification,active:true,managementType:'main',...extra});
const stages:StageOption[]=[stage('main:contact','open'),stage('main:contacted','open'),stage('main:won','won'),stage('main:lost','lost'),stage('main:old','open',{active:false}),stage('provider:interested','open',{managementType:'provider'}),stage('Perdida','lost',{managementType:null,displayName:'Perdida'}),stage('Cargado','open',{managementType:null})];
const names=(groups:ReturnType<typeof stageOptionGroups>)=>groups.map(g=>[g.label,g.options.map(o=>o.name)]);

describe('stage dialog options',()=>{
 it('excludes the current stage and groups open vs closing stages of the same type',()=>{
  expect(names(stageOptionGroups({stages,currentStage:'main:contacted',managementType:'main'}))).toEqual([['Sigue abierta',['main:contact']],['Cerrar la gestión',['main:won','main:lost']]]);
 });
 it('offers only open stages to reopen a closed management',()=>{
  expect(names(stageOptionGroups({stages,currentStage:'main:lost',managementType:'main'}))).toEqual([['Reabrir la gestión',['main:contact','main:contacted']]]);
 });
 it('keeps legacy managements on untyped stages',()=>{
  expect(names(stageOptionGroups({stages,currentStage:'Cargado',managementType:null}))).toEqual([['Cerrar la gestión',['Perdida']]]);
 });
});

describe('reopen lock',()=>{
 it('locks a closed typed management for sellers only',()=>{
  expect(isReopenLocked({managementType:'main',current:{classification:'lost'},role:'user'})).toBe(true);
  expect(isReopenLocked({managementType:'main',current:{classification:'won'},role:'user'})).toBe(true);
  expect(isReopenLocked({managementType:'main',current:{classification:'lost'},role:'admin'})).toBe(false);
  expect(isReopenLocked({managementType:'main',current:{classification:'open'},role:'user'})).toBe(false);
  expect(isReopenLocked({managementType:null,current:{classification:'lost'},role:'user'})).toBe(false);
 });
 it('locks an unknown current stage like the server does',()=>{
  expect(isReopenLocked({managementType:'main',current:undefined,role:'user'})).toBe(true);
  expect(isReopenLocked({managementType:'main',current:undefined,role:'admin'})).toBe(false);
 });
});

describe('stage change messages',()=>{
 const reasons=[{id:'r1',doNotContact:false},{id:'dnc',doNotContact:true}];
 const message=(input:Omit<Parameters<typeof stageChangeMessage>[0],'stages'|'reasons'|'canViewArchived'>&{canViewArchived?:boolean})=>stageChangeMessage({stages,reasons,canViewArchived:true,...input});
 it('names the new stage with its label, never the key',()=>{
  expect(message({from:'main:contact',to:'main:contacted'})).toEqual({message:'Etapa cambiada a Contactado',openBusiness:false});
  expect(message({from:'main:lost',to:'main:contacted'})).toEqual({message:'Gestión reabierta en Contactado',openBusiness:false});
 });
 it('says how the management was closed',()=>{
  expect(message({from:'main:contacted',to:'main:lost',reasonId:'r1'})).toEqual({message:'Gestión cerrada: perdida',openBusiness:false});
  expect(message({from:'main:contacted',to:'main:won',reasonId:'r1'})).toEqual({message:'Gestión cerrada: ganada',openBusiness:false});
 });
 it('offers the archived business only to whoever can still read it',()=>{
  expect(message({from:'main:contacted',to:'main:lost',reasonId:'dnc'})).toEqual({message:'El negocio quedó en No contactar y archivado. Podés seguir consultándolo.',openBusiness:true});
  expect(message({from:'main:contacted',to:'main:lost',reasonId:'dnc',canViewArchived:false})).toEqual({message:'El negocio quedó en No contactar y archivado. Solo su responsable o un administrador puede consultarlo.',openBusiness:false});
 });
});

describe('stage names and history titles',()=>{
 it('prefers a real display name and falls back to the catalog label',()=>{
  expect(stageDisplayName(stage('main:lost','lost',{displayName:'main:lost'}))).toBe('Cerrada perdida');
  expect(stageDisplayName(stage('main:lost','lost',{displayName:'Perdimos'}))).toBe('Perdimos');
  expect(stageDisplayName(undefined,'main:won')).not.toContain(':');
 });
 it('titles events without raw keys',()=>{
  expect(pipelineEventTitle({action:'stage',oldStage:'main:contacted',newStage:'main:lost'},stages)).toBe('Contactado → Cerrada perdida');
  expect(pipelineEventTitle({action:'stage',oldStage:null,newStage:'main:contact'},stages)).toMatch(/^Sin etapa → /);
  expect(pipelineEventTitle({action:'contact_policy',oldStage:null,newStage:null},stages)).toBe('Preferencias de contacto actualizadas');
  expect(pipelineEventTitle({action:'some_new_action',oldStage:null,newStage:null},stages)).toBe('Otro cambio en la gestión');
 });
});
