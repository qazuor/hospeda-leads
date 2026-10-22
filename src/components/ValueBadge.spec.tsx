import {describe,expect,it} from 'vitest';
import {badgeTone,valueBadgeColors} from './ValueBadge';
import {businessStatusLabels,businessStatuses} from '../helpers/businessStatus';
import {managementStageCatalog,managementTypes} from '../helpers/businessManagement';

describe('badgeTone',()=>{
 it('gives each business status its fixed semantic tone',()=>{
  expect(businessStatuses.map(key=>badgeTone('status',businessStatusLabels[key]))).toEqual(['info','neutral','progress','warning','violet','muted']);
  expect(badgeTone('status','Sin tarea agendada')).toBe('warning');
 });
 it('does not paint a lost stage as success nor Revisado as danger',()=>{
  expect(badgeTone('status','Cerrada perdida')).not.toBe('success');
  expect(badgeTone('status','Cerrada perdida')).toBe('dangerMuted');
  expect(badgeTone('status','Revisado')).not.toBe('dangerMuted');
 });
 it('derives every stage tone from its classification',()=>{
  const expected={open:'progress',won:'success',lost:'dangerMuted'};
  for(const type of managementTypes)for(const stage of managementStageCatalog(type))expect(badgeTone('status',stage.label),`${type}:${stage.key}`).toBe(expected[stage.classification]);
 });
 it('assigns stable value-dependent hues to non-semantic values',()=>{
  for(const category of ['city','person','subtype','contact','generic'] as const){expect(valueBadgeColors(category,'Colón')).toEqual(valueBadgeColors(category,'Colón'));expect(valueBadgeColors(category,'Colón')['--badge-h' as never]).not.toBe(valueBadgeColors(category,'Gualeguaychú')['--badge-h' as never]);}
  expect(valueBadgeColors('city','Sin responsable')).toEqual(valueBadgeColors('status',''));
  expect(valueBadgeColors('city','Colón')).not.toEqual(valueBadgeColors('city','Gualeguaychú'));
  expect(badgeTone('status','Valor desconocido')).toBe('neutral');
 });
 it('paints a vertical with its fixed rubro colour only in the vertical category',()=>{
  expect(valueBadgeColors('vertical','Gastronomía')['--badge-h' as never]).toBe('24');
  expect(valueBadgeColors('vertical','Alojamiento')).toEqual(valueBadgeColors('vertical','Alojamientos'));
  expect(valueBadgeColors('vertical','Gastronomía')).not.toEqual(valueBadgeColors('vertical','Alojamiento'));
  expect(valueBadgeColors('city','Gastronomía')).not.toEqual(valueBadgeColors('city','Colón'));
 });
 it('uses different hues for closed-won and closed-lost',()=>{
  expect(valueBadgeColors('status','Cerrada ganada')['--badge-h' as never]).not.toBe(valueBadgeColors('status','Cerrada perdida')['--badge-h' as never]);
 });
 it('treats prototype property names as plain unknown values',()=>{
  for(const value of ['constructor','__proto__','toString','hasOwnProperty'])for(const category of ['status','city','generic'] as const){
   expect(badgeTone(category,value)).toBe('neutral');
   expect(valueBadgeColors(category,value)).toEqual(valueBadgeColors(category,value));
  }
 });
});
