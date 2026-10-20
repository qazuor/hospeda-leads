import {describe,expect,it} from 'vitest';
import {managementLabel,managementReasonCatalog,managementStageCatalog,managementTypeHints,managementTypeLabels,managementTypes,suggestedStageForOutcome} from './businessManagement';

describe('business management catalogs',()=>{
 it('offers Leandro referral as an open stage for every management type',()=>{
  for(const type of managementTypes){
   expect(managementStageCatalog(type)).toContainEqual(expect.objectContaining({key:`${type}:leandro`,label:'Derivada a Leandro',classification:'open'}));
  }
 });

 it('includes Other with a required note for closures that need a reason',()=>{
  for(const type of managementTypes){
   const outcomes=managementStageCatalog(type).filter(stage=>stage.classification!=='open').map(stage=>stage.outcome!);
   for(const outcome of outcomes){
    if(outcome==='completed')continue;
    const reasons=managementReasonCatalog(type,outcome);
    const other=reasons.find(reason=>reason.key==='other');
    expect(other,`${type}/${outcome} Other reason`).toBeDefined();
    expect(other?.requiresNote,`${type}/${outcome} Other note`).toBe(true);
    if(['lost','not_participating','not_collaborating','proposal_lost','not_completed'].includes(outcome)){
     expect(reasons.find(reason=>reason.key==='do_not_contact')?.doNotContact,`${type}/${outcome} do not contact`).toBe(true);
    }
   }
  }
 });
});

describe('management labels and hints',()=>{
 it('resolves a stage key even when the management type is missing',()=>{
  expect(managementLabel(null,'provider:interested')).toBe('Interesado en participar');
  expect(managementLabel(undefined,'main:lost')).toBe('Cerrada perdida');
  expect(managementLabel('main','main:won')).toBe('Cerrada ganada');
  expect(managementLabel(null,'Prospecto')).toBe('Prospecto');
  expect(managementLabel('main',null)).toBe('Sin etapa');
 });

 it('keeps type names and adds one hint line per type (decision 6b)',()=>{
  expect(managementTypeLabels.partner).toBe('Partners');
  for(const type of managementTypes){
   expect(managementTypeHints[type].length,type).toBeGreaterThan(20);
   expect(managementTypeHints[type],type).not.toMatch(/\n/);
  }
 });
});

describe('suggestedStageForOutcome (decision 9A)',()=>{
 const key=(type:Parameters<typeof suggestedStageForOutcome>[0],current:string,outcome:string)=>suggestedStageForOutcome(type,current,outcome)?.key??null;
 it('suggests the interested stage of each type, only forward',()=>{
  expect(key('main','main:contact','interested')).toBe('main:interested');
  expect(key('main','main:contacted','interested')).toBe('main:interested');
  expect(key('partner','partner:conversation','interested')).toBe('partner:interest');
  expect(key('provider','provider:information_sent','interested')).toBe('provider:interested');
  expect(key('editor','editor:contact','interested')).toBe('editor:interested');
  expect(key('accompaniment','accompaniment:pending','interested')).toBe('accompaniment:working');
  expect(key('main','main:interested','interested')).toBeNull();
  expect(key('main','main:evaluating_plan','interested')).toBeNull();
  expect(key('partner','partner:negotiation','interested')).toBeNull();
  expect(key('editor','editor:proposal_sent','interested')).toBeNull();
  expect(key('main','main:leandro','interested')).toBeNull();
 });

 it('suggests Contactado for "later" only from the first stage',()=>{
  for(const type of ['main','partner','provider','editor'] as const)expect(key(type,`${type}:contact`,'later')).toBe(`${type}:contacted`);
  expect(key('accompaniment','accompaniment:pending','later')).toBe('accompaniment:contacted');
  expect(key('main','main:contacted','later')).toBeNull();
  expect(key('partner','partner:conversation','later')).toBeNull();
 });

 it('never suggests from closed stages, other types or other outcomes',()=>{
  expect(key('main','main:won','interested')).toBeNull();
  expect(key('main','main:lost','later')).toBeNull();
  expect(key('main','partner:contact','interested')).toBeNull();
  for(const outcome of ['no_answer','not_interested','do_not_contact','other','replied'])expect(key('main','main:contact',outcome),outcome).toBeNull();
  expect(suggestedStageForOutcome(null,'main:contact','interested')).toBeNull();
  expect(suggestedStageForOutcome('main',null,'interested')).toBeNull();
 });
});
