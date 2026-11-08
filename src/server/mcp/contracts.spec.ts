import {describe,expect,it} from 'vitest';
import {businessState,managementContract,page} from './contracts';

describe('MCP contracts',()=>{
 it('serializes identifiers and advances a stable cursor without repeating the last item',()=>{
  const result=page([{id:1},{id:2},{id:3}],2,row=>String(row.id));expect(result).toEqual({items:[{id:1},{id:2}],nextCursor:'2',truncated:true});
 });
 it('exposes the DNC flag without inventing an unavailable reason',()=>expect(businessState({do_not_contact:true})).toEqual({doNotContact:true}));
 it('maps management stage labels and class from pure catalog values',()=>expect(managementContract({id:7,management_type:'main',estado:'main:contact',classification:'open'})).toMatchObject({id:'7',typeLabel:'Verticales principales',stageLabel:'Por contactar',stageClass:'open'}));
 it('does not invent a stage class for unknown classifications and never returns assigned email',()=>expect(managementContract({id:8,management_type:'main',estado:'unknown',assigned_user_email:'private@example.com'})).toMatchObject({stageClass:null,ownerName:null,ownerId:null}));
});

describe('journalPersonFields',()=>{
 it('covers every person badge plus legacy Spanish staff fields',async()=>{
  const {journalPersonFields}=await import('./readTools');
  for(const field of ['assignedUserEmail','quienCargo','creadoPor','asignadoA'])expect(journalPersonFields).toContain(field);
 });
});
