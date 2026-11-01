import {describe,it,expect} from 'vitest';
import {historyContinuationText} from './BusinessHistory';

describe('business history continuation copy',()=>{
 it('shows the selected reason for no-follow-up and keeps legacy rows readable',()=>{
  expect(historyContinuationText('done','Ya tengo otra tarea agendada')).toBe('No se agendó nada · Ya tengo otra tarea agendada');
  expect(historyContinuationText('done','La gestión ya está cerrada')).toBe('No se agendó nada · La gestión ya está cerrada');
  expect(historyContinuationText('done')).toBe('Se decidió terminar por ahora');
  expect(historyContinuationText('wait')).toBe('Se acordó esperar hasta una fecha');
 });
});
