import {describe,it,expect} from 'vitest';
import {auditChanges} from './auditChanges';
describe('audit changes',()=>{
 it('shows edited business fields and Boolean transitions, without technical payloads',()=>{
  expect(auditChanges({before:{nombre:'Anterior',do_not_contact:false},after:{nombre:'Nuevo',do_not_contact:true,updated_at:'today',file_data:'binary'}})).toEqual(['Nombre: Anterior → Nuevo','doNotContact: No → Sí']);
 });
 it('keeps deletion snapshots and reasons readable',()=>{
  expect(auditChanges({before:{title:'Visita'},after:null})).toEqual(['Título: Visita → Vacío']);
  expect(auditChanges({reason:'Error de carga'})).toEqual(['Motivo: Error de carga']);
 });
});
