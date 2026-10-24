import {describe,expect,it} from 'vitest';
import {toneHue,toneOfStatus,toneOfValue} from './tones';

describe('tones',()=>{
 it('returns the configured vivid hue for each named tone',()=>{
  const actual=toneHue('blue');
  expect(actual).toEqual([217,91]);
 });
 it('maps business status labels to the approved tones',()=>{
  const actual=['Nuevo','Revisado','En gestión','Sin tarea agendada','Recontactar','Archivado'].map(toneOfStatus);
  expect(actual).toEqual(['slate','sky','blue','orange','violet','slate']);
 });
 it('maps priority and review values semantically',()=>{
  const actual=[toneOfValue('priority','alta'),toneOfValue('priority','media'),toneOfValue('priority','baja'),toneOfValue('review','Revisado'),toneOfValue('review','No revisado')];
  expect(actual).toEqual(['red','orange','green','green','sky']);
 });
 it('maps closed stages by their won or lost classification',()=>{
  const actual=[toneOfStatus('Cerrada ganada'),toneOfStatus('Cerrada perdida')];
  expect(actual).toEqual(['green','red']);
 });
 it('falls back to slate for unknown values, categories and prototype keys',()=>{
  const actual=[toneOfStatus('constructor'),toneOfStatus('__proto__'),toneOfStatus('Inexistente'),toneOfValue('review','Otro'),toneOfValue('priority','urgente'),toneOfValue('vertical','Hotel')];
  expect(actual).toEqual(['slate','slate','slate','slate','slate','slate']);
 });
 it('matches priority case-insensitively',()=>{
  const actual=[toneOfValue('priority','Alta'),toneOfValue('priority','MEDIA')];
  expect(actual).toEqual(['red','orange']);
 });
});
