import {describe,expect,it} from 'vitest';
import {managementReasonCatalog,managementStageCatalog,managementTypes} from './businessManagement';

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
