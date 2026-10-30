import {describe,expect,it} from 'vitest';
import {dayProgress,urgentCapNotice} from './dayProgress';

describe('dayProgress',()=>{
 it('shows progress while tasks are left',()=>expect(dayProgress({overdue:1,today:3,done:3,waiting:0})).toEqual({kind:'progress',done:3,total:7}));
 it('is finished only when tasks and pending outcomes are all done',()=>{
  expect(dayProgress({overdue:0,today:0,done:3,waiting:0}).kind).toBe('finished');
  expect(dayProgress({overdue:0,today:0,done:3,waiting:2}).kind).toBe('progress');
 });
 it('says nothing on an empty day',()=>expect(dayProgress({overdue:0,today:0,done:0,waiting:0}).kind).toBe('none'));
});

describe('urgentCapNotice',()=>{
 it('says nothing while every overdue and today task fits',()=>expect(urgentCapNotice({overdue:300,today:300,cap:300,admin:false})).toEqual([]));
 it('says the oldest overdue are shown, how many are hidden and where to look',()=>{
  const lines=urgentCapNotice({overdue:420,today:5,cap:300,admin:false});
  expect(lines[0]).toBe('Vencidas: ves las 300 más antiguas de 420. Las 120 más recientes no aparecen en esta lista.');
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain('filtrá por localidad o rubro en «Filtros de trabajo»');
 });
 it('covers a crowded today and offers the responsible filter only to admins',()=>{
  const lines=urgentCapNotice({overdue:10,today:301,cap:300,admin:true});
  expect(lines[0]).toBe('Para hoy: ves las 300 primeras según el horario, de 301. La otra no aparece en esta lista.');
  expect(lines[1]).toContain('responsable, localidad o rubro');
 });
});
