import {describe,expect,it} from 'vitest';
import {hasSellerChangeDraft,sellerGroupNotice} from './sellerGroupNotice';
describe('sellerGroupNotice',()=>{
 it('names active linked businesses and omits self and inactive members',()=>{expect(sellerGroupNotice([{id:'1',name:'Casa',archived:false,deleted:false,merged:false},{id:'2',name:'Tierra Linda',archived:false,deleted:false,merged:false},{id:'3',name:'Archivado',archived:true,deleted:false,merged:false},{id:'4',name:'Papelera',archived:false,deleted:true,merged:false},{id:'5',name:'Fusionado',archived:false,deleted:false,merged:true}],'1')).toBe('H2 · Tierra Linda');});
 it('returns empty when no other active member remains',()=>{expect(sellerGroupNotice([{id:'1',name:'Referral',archived:false,deleted:false,merged:false},{id:'2',name:'Archived',archived:true,deleted:false,merged:false}], '1')).toBe('');});
});
describe('hasSellerChangeDraft',()=>{it('waits for a changed draft and hides the notice before selection',()=>{expect(hasSellerChangeDraft(undefined,'ana@example.com')).toBe(false);expect(hasSellerChangeDraft('ana@example.com','ana@example.com')).toBe(false);expect(hasSellerChangeDraft('bea@example.com','ana@example.com')).toBe(true);});});
