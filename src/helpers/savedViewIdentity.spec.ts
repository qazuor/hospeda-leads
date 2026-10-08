import {describe,it,expect} from 'vitest';
import {identifySavedViews,savedViewIdentity} from './savedViewIdentity';
describe('saved view identity compatibility',()=>{
 it('gives legacy views repeatable identities isolated by owner without altering config',()=>{
  const legacy={name:'Mis negocios',config:{query:'histórico',extra:'preserve'}};
  const first=identifySavedViews([legacy],3)[0];expect(first.id).toBe(savedViewIdentity(legacy,3));expect(first.id).not.toBe(savedViewIdentity(legacy,4));expect(first.config).toEqual(legacy.config);expect(legacy).not.toHaveProperty('id');
 });
 it('preserves a materialized identity across rename',()=>{
  const view=identifySavedViews([{name:'Antes',config:{}}],3)[0];expect(savedViewIdentity({...view,name:'Después'},3)).toBe(view.id);
 });
});
