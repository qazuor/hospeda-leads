import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';

const postWork=vi.hoisted(()=>vi.fn(async()=>({id:'7'})));
const toastSuccess=vi.hoisted(()=>vi.fn());
vi.mock('sonner',()=>({toast:{success:toastSuccess,error:vi.fn()}}));
vi.mock('../endpoints/work.schema',async importOriginal=>({...(await importOriginal<typeof import('../endpoints/work.schema')>()),postWork}));
import {TaskPostponeMenu,rescheduleBody,postponeOptions,movedDueAt} from './TaskPostponeMenu';
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
  expect(postponeOptions({dueDate:'2026-10-24',now:friday}).map(o=>o.label)).toEqual(['En 3 días']);
 });
});

describe('rescheduleBody',()=>{
 it('sends only the new date and what the row showed',()=>{
  expect(rescheduleBody({task:task(),dueDate:'2026-10-24',dueAt:null})).toEqual({action:'task_reschedule',id:'7',expectedDueDate:'2026-10-19',expectedDueAt:null,dueDate:'2026-10-24',dueAt:null});
 });
 it('keeps the time of day on the new Argentina day',()=>{
  const timed=task({dueDate:'2026-10-19',dueAt:new Date('2026-10-19T17:30:00Z')});// 14:30 in Argentina
  expect(movedDueAt({task:timed,dueDate:'2026-10-24'})).toBe('2026-10-24T17:30:00.000Z');
  expect(movedDueAt({task:task(),dueDate:'2026-10-24'})).toBeNull();
 });
});

describe('TaskPostponeMenu',()=>{
 const setup=(t=task())=>render(<MantineProvider><QueryClientProvider client={new QueryClient()}><TaskPostponeMenu task={t}/></QueryClientProvider></MantineProvider>);
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
  expect((postWork.mock.calls[1] as unknown as [Record<string,unknown>])[0]).toMatchObject({action:'task_reschedule',id:'7',dueDate:'2026-10-19',dueAt:null,expectedDueDate:body.dueDate,expectedDueAt:null});
 });
});
