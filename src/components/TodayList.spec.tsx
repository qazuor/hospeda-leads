import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {MantineProvider} from '@mantine/core';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import type {WorkData,WorkTask} from '../endpoints/work.schema';
vi.mock('./WorkPanel',()=>({TaskRow:({task}:{task:WorkTask})=><p>{task.title}</p>}));
import {TodayList} from './TodayList';

beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
});
afterEach(cleanup);
const now=new Date('2026-10-25T15:00:00Z');
const task=(id:string,dueDate:string):WorkTask=>({id,accountId:'1',leadId:null,title:`Tarea ${id}`,description:null,typeId:'call',assignedUserEmail:null,dueDate,dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Hotel Sol',city:null,opportunityName:null,deletedAt:null});
const data=(tasks:WorkTask[]):WorkData=>({tasks,activities:[],types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,bucketCounts:{overdue:0,today:0,upcoming:tasks.length},totalTasks:tasks.length,totalActivities:0,page:1});
const mount=(d:WorkData)=>render(<MantineProvider><MemoryRouter><TodayList data={d} now={now} admin={false} filtered={false} inboundRows={[]} inboundError={null} inboundBusy={false} onInboundRetry={()=>undefined} firstSteps={null} onEdit={()=>undefined} onClearFilters={()=>undefined} onFocusFilters={()=>undefined}/></MemoryRouter></MantineProvider>);

describe('TodayList «Próximas acciones» (spec 100 D6)',()=>{
 it('starts open, so upcoming tasks show without a click',()=>{
  mount(data([task('1','2026-10-28')]));
  const control=screen.getByRole('button',{name:/^Próximas acciones \(1\)/});
  expect(control.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Tarea 1')).toBeTruthy();
 });
 it('can still be collapsed and reopened by the seller',()=>{
  mount(data([task('1','2026-10-28')]));
  const control=screen.getByRole('button',{name:/^Próximas acciones/});
  fireEvent.click(control);expect(control.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(control);expect(control.getAttribute('aria-expanded')).toBe('true');
 });
});
