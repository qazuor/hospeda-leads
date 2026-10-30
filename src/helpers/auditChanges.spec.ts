import {describe,it,expect} from 'vitest';
import {auditChanges} from './auditChanges';
describe('audit changes',()=>{
 it('shows edited business fields and Boolean transitions, without technical payloads',()=>{
  expect(auditChanges({before:{nombre:'Anterior',do_not_contact:false,status:'reviewed',is_client:false},after:{nombre:'Nuevo',do_not_contact:true,status:'in_management',is_client:true,updated_at:'today',file_data:'binary'}})).toEqual(['Nombre: Anterior → Nuevo','No contactar: No → Sí','Estado del negocio: reviewed → in_management','Cliente: No → Sí']);
 });
 it('keeps deletion snapshots and reasons readable',()=>{
  expect(auditChanges({before:{title:'Visita'},after:null})).toEqual(['Título: Visita → Vacío']);
  expect(auditChanges({reason:'Error de carga'})).toEqual(['Motivo: Error de carga']);
 });
 it('shows the reason alongside a business state change',()=>{
  expect(auditChanges({before:{commercial_status:'prospect'},after:{commercial_status:'client'},reason:'Era cliente antes de usar el CRM'})).toEqual(['Condición comercial: prospect → client','Motivo: Era cliente antes de usar el CRM']);
 });
 it('distinguishes direct changes from values derived from another action',()=>{
  expect(auditChanges({origin:'direct',before:{status:'new'},after:{status:'reviewed'}})).toEqual(['Origen: Cambio directo','Estado del negocio: new → reviewed']);
  expect(auditChanges({origin:'automatic',cause:'management_change',before:{status:'in_management'},after:{status:'no_follow_up_scheduled'}})).toEqual(['Origen: Automático · derivado de un cambio en la gestión','Estado del negocio: in_management → no_follow_up_scheduled']);
 });
});
