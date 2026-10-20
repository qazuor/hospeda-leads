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
 it('keeps city, person, vertical and unknown values neutral instead of hashing a hue',()=>{
  for(const category of ['city','person','vertical','subtype'] as const)expect(badgeTone(category,'Colón')).toBe('neutral');
  expect(valueBadgeColors('city','Colón')).toEqual(valueBadgeColors('city','Gualeguaychú'));
  expect(badgeTone('status','Valor desconocido')).toBe('neutral');
 });
 it('uses different hues for closed-won and closed-lost',()=>{
  expect(valueBadgeColors('status','Cerrada ganada')['--badge-h' as never]).not.toBe(valueBadgeColors('status','Cerrada perdida')['--badge-h' as never]);
 });
 it('treats prototype property names as plain unknown values',()=>{
  for(const value of ['constructor','__proto__','toString','hasOwnProperty'])for(const category of ['status','city','generic'] as const){
   expect(badgeTone(category,value)).toBe('neutral');
   expect(valueBadgeColors(category,value)).toEqual(valueBadgeColors('city','Colón'));
  }
 });
});
