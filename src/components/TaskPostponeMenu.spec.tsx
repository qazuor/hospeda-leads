import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';

const postWork=vi.hoisted(()=>vi.fn(async()=>({id:'7'})));
const toastSuccess=vi.hoisted(()=>vi.fn());
const toastError=vi.hoisted(()=>vi.fn());
vi.mock('sonner',()=>({toast:{success:toastSuccess,error:toastError}}));
vi.mock('./ui/CrmDateInput',()=>({CrmDateInput:({value,onValueChange,min}:{value:string;onValueChange:(value:string)=>void;min?:string})=><input aria-label="Nueva fecha" data-min={min} value={value} onChange={event=>onValueChange(event.currentTarget.value)}/> }));
vi.mock('../endpoints/work.schema',async importOriginal=>({...(await importOriginal<typeof import('../endpoints/work.schema')>()),postWork}));
import {TaskPostponeMenu,rescheduleBody,postponeOptions,movedDueAt,postponeDisabledReason} from './TaskPostponeMenu';
import {postponeBase} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import type {WorkTask} from '../endpoints/work.schema';

beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}} as unknown as typeof ResizeObserver;
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

const task=(extra:Partial<WorkTask>={}):WorkTask=>({id:'7',accountId:'3',leadId:'9',title:'Llamar a Ana',description:'Notas',typeId:'call',assignedUserEmail:'v@example.test',dueDate:'2026-10-19',dueAt:null,priority:'alta',status:'pending',result:null,completedAt:null,legacy:false,participants:'Ana',contactIds:['4'],accountName:'Hotel',city:null,opportunityName:null,deletedAt:null,purpose:null,...extra});

describe('postponeOptions',()=>{
 // Friday 2026-10-23 in Argentina: "Lunes" is the same day as "En 3 días".
 const friday=new Date('2026-10-23T15:00:00Z');
 it('lists Mañana, En 3 días and Lunes without repeating a day',()=>{
  expect(postponeOptions({dueDate:'2026-10-01',now:friday})).toEqual([{label:'Mañana',day:'2026-10-24'},{label:'En 3 días',day:'2026-10-26'}]);
  expect(postponeOptions({dueDate:'2026-10-01',now:new Date('2026-10-21T15:00:00Z')}).map(o=>o.label)).toEqual(['Mañana','En 3 días','Lunes']);
 });
 it('leaves out the day the task already has',()=>{
  expect(postponeOptions({dueDate:'2026-10-24',now:friday})).toEqual([{label:'Un día más',day:'2026-10-25'},{label:'3 días más',day:'2026-10-27'},{label:'Lunes siguiente',day:'2026-10-26'}]);
 });
 it('bases future-task shortcuts after the due date and names them relative to that date',()=>{
  expect(postponeOptions({dueDate:'2026-11-02',now:new Date('2026-10-30T15:00:00Z')})).toEqual([{label:'Un día más',day:'2026-11-03'},{label:'3 días más',day:'2026-11-05'},{label:'Lunes siguiente',day:'2026-11-09'}]);
 });
 it('uses today as the base for overdue tasks',()=>{
  expect(postponeOptions({dueDate:'2026-10-01',now:new Date('2026-10-30T15:00:00Z')}).map(o=>o.day)).toEqual(['2026-10-31','2026-11-02']);
 });
 it('never offers a shortcut earlier than the base for future, today, or overdue tasks',()=>{
  const now=new Date('2026-10-30T15:00:00Z');
  for(const dueDate of ['2026-11-02','2026-10-30','2026-10-01']){
   const base=postponeBase(dueDate,now);
   expect(postponeOptions({dueDate,now}).every(option=>option.day>base)).toBe(true);
  }
 });
});

describe('rescheduleBody',()=>{
 it('sends only the new date and what the row showed',()=>{
  expect(rescheduleBody({task:task(),dueDate:'2026-10-24',dueAt:null})).toEqual({action:'task_reschedule',id:'7',expectedDueDate:'2026-10-19',expectedDueAt:null,dueDate:'2026-10-24',dueAt:null,kind:'postpone'});
 });
 it('keeps the time of day on the new Argentina day',()=>{
  const timed=task({dueDate:'2026-10-19',dueAt:new Date('2026-10-19T17:30:00Z')});// 14:30 in Argentina
  expect(movedDueAt({task:timed,dueDate:'2026-10-24'})).toBe('2026-10-24T17:30:00.000Z');
  expect(movedDueAt({task:task(),dueDate:'2026-10-24'})).toBeNull();
 });
});

describe('TaskPostponeMenu',()=>{
 // Pinned clock: Friday 2026-10-30 12:00 in Argentina. Only Date is faked, so React/Mantine timers keep working.
 const now=new Date('2026-10-30T15:00:00Z');
 beforeEach(()=>{vi.useFakeTimers({toFake:['Date'],now});});
 afterEach(()=>{vi.useRealTimers();});
 const openPicker=async()=>{fireEvent.click(screen.getByRole('button',{name:'Posponer Llamar a Ana'}));fireEvent.click(await screen.findByRole('menuitem',{name:/Elegir fecha/}));};
 const setup=(t=task())=>render(<MantineProvider><QueryClientProvider client={new QueryClient()}><TaskPostponeMenu task={t}/></QueryClientProvider></MantineProvider>);
 it.each([
  ['future','2026-10-31','vence el','2026-11-01'],
  ['today','2026-10-30','hoy vence el','2026-10-30'],
  ['overdue','2026-10-19','venció el','2026-10-30'],
 ] as const)('sets picker minimum and disabled guidance for %s tasks',async(_,dueDate,copy,min)=>{
  setup(task({dueDate}));
  await openPicker();
  expect(screen.getByRole('dialog').textContent).toContain(copy+' '+formatDate(dueDate));
  const datePicker=screen.getByLabelText('Nueva fecha');
  expect(datePicker.getAttribute('data-min')).toBe(min);
  const postpone=screen.getByRole('button',{name:'Posponer'});
  expect(postpone.hasAttribute('disabled')).toBe(true);
  fireEvent.change(datePicker,{target:{value:'2026-10-29'}});
  fireEvent.mouseEnter(postpone.parentElement!);
  expect(await screen.findByText(dueDate>'2026-10-30'?'Elegí una fecha posterior a la fecha de la tarea.':'Elegí hoy o una fecha futura.')).toBeTruthy();
 });
 it.each([
  ['future','2026-11-02','Elegí una fecha posterior a la fecha de la tarea.'],
  ['today','2026-10-30','Elegí hoy o una fecha futura.'],
  ['overdue','2026-10-19','Elegí hoy o una fecha futura.'],
 ] as const)('explains invalid earlier dates for %s tasks',async(_,dueDate,reason)=>{
  setup(task({dueDate}));
  await openPicker();
  const postpone=screen.getByRole('button',{name:'Posponer'});
  fireEvent.change(screen.getByLabelText('Nueva fecha'),{target:{value:'2026-10-29'}});
  fireEvent.mouseEnter(postpone.parentElement!);
  expect(await screen.findByText(reason)).toBeTruthy();
 });
 it('does not offer today for a timed overdue task whose hour already passed today',async()=>{
  vi.setSystemTime(new Date('2026-10-30T18:00:00Z'));// 15:00 in Argentina
  setup(task({dueDate:'2026-10-29',dueAt:new Date('2026-10-29T12:00:00Z')}));// yesterday 09:00
  await openPicker();
  const datePicker=screen.getByLabelText('Nueva fecha');
  expect(datePicker.getAttribute('data-min')).toBe('2026-10-31');
  fireEvent.change(datePicker,{target:{value:'2026-10-30'}});
  const postpone=screen.getByRole('button',{name:'Posponer'});
  expect(postpone.hasAttribute('disabled')).toBe(true);
  fireEvent.mouseEnter(postpone.parentElement!);
  expect(await screen.findByText('La hora de la tarea ya pasó hoy. Elegí mañana o una fecha posterior.')).toBeTruthy();
  expect(postponeDisabledReason({task:task({dueDate:'2026-10-29',dueAt:null}),dueDate:'2026-10-29',pickMin:'2026-10-30'})).toBe('Elegí hoy o una fecha futura.');
 });
 it('rechecks the minimum on submit when the day changed while the picker was open',async()=>{
  vi.setSystemTime(new Date('2026-10-31T02:30:00Z'));// 23:30 of 30/10 in Argentina
  setup(task({dueDate:'2026-10-19'}));
  await openPicker();
  fireEvent.change(screen.getByLabelText('Nueva fecha'),{target:{value:'2026-10-30'}});
  vi.setSystemTime(new Date('2026-10-31T03:30:00Z'));// 00:30 of 31/10: "today" in the picker is stale
  fireEvent.click(screen.getByRole('button',{name:'Posponer'}));
  await waitFor(()=>expect(toastError).toHaveBeenCalledWith('Esa fecha ya no sirve para posponer: cambió el día o pasó la hora de la tarea. Elegí desde el '+formatDate('2026-10-31')+'.'));
  expect(postWork).not.toHaveBeenCalled();
 });
 it('saves the chosen day through task_save and offers Deshacer with the previous date',async()=>{
  setup();
  fireEvent.click(screen.getByRole('button',{name:'Posponer Llamar a Ana'}));
  fireEvent.click(await screen.findByRole('menuitem',{name:/^Mañana/}));
  await waitFor(()=>expect(postWork).toHaveBeenCalledTimes(1));
  const body=(postWork.mock.calls[0] as unknown as [Record<string,unknown>])[0];
  expect(body).toMatchObject({action:'task_reschedule',id:'7',expectedDueDate:'2026-10-19',expectedDueAt:null});
  expect(body.dueDate).not.toBe('2026-10-19');
  await waitFor(()=>expect(toastSuccess).toHaveBeenCalled());
  const options=toastSuccess.mock.calls[0][1] as {action:{label:string;onClick:()=>void}};
  expect(options.action.label).toBe('Deshacer');
  options.action.onClick();
  await waitFor(()=>expect(postWork).toHaveBeenCalledTimes(2));
  expect((postWork.mock.calls[1] as unknown as [Record<string,unknown>])[0]).toMatchObject({action:'task_reschedule',id:'7',dueDate:'2026-10-19',dueAt:null,expectedDueDate:body.dueDate,expectedDueAt:null,kind:'undo'});
 });
});
