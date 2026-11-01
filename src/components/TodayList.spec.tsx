import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {ContactFollowUps,PendingOutcome} from '../endpoints/communication.schema';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import type {WorkData,WorkTask} from '../endpoints/work.schema';
vi.mock('./WorkPanel',()=>({TaskRow:({task}:{task:WorkTask})=><p>{task.title}</p>}));
vi.mock('./OutcomeAfterContact',()=>({OutcomeAfterContact:({contact,note}:{contact:{messageId?:string};note?:string})=><div role="dialog">Cómo salió (mock) {contact.messageId} {note}</div>}));
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

describe('TodayList «Pendientes de contacto» (spec 100 §4.2)',()=>{
 const pending=(id:string,over:Partial<PendingOutcome>={}):PendingOutcome=>({id,accountId:'1',accountName:'Hotel Sol',leadId:'9',opportunityName:'Plan A',contactId:null,channel:'call',status:'manual_sent',purpose:null,recipientName:'Julia',lastInteractionAt:new Date('2026-10-24T12:00:00Z'),...over});
 const none={items:[],count:0,groupCount:0};
 const withFollowUps=(followUps:ContactFollowUps):WorkData=>({...data([]),followUps});
 const ui=(d:WorkData)=><QueryClientProvider client={new QueryClient()}><MantineProvider><MemoryRouter><TodayList data={d} now={now} admin={false} filtered={false} inboundRows={[]} inboundError={null} inboundBusy={false} onInboundRetry={()=>undefined} firstSteps={null} onEdit={()=>undefined} onClearFilters={()=>undefined} onFocusFilters={()=>undefined}/></MemoryRouter></MantineProvider></QueryClientProvider>;
 it('keeps the outcome dialog open when the save empties the card (the dialog lives outside it)',()=>{
  const view=render(ui(withFollowUps({unconfirmed:none,outcomes:{items:[pending('a1')],count:1,groupCount:1},expired:{unconfirmed:none,outcomes:none}})));
  fireEvent.click(screen.getByRole('button',{name:'Anotá cómo salió'}));
  expect(screen.getByRole('dialog').textContent).toContain('a1');
  view.rerender(ui(withFollowUps({unconfirmed:none,outcomes:none,expired:{unconfirmed:none,outcomes:none}})));
  expect(screen.queryByRole('region',{name:'Pendientes de contacto'})).toBeNull();
  expect(screen.getByRole('dialog').textContent).toContain('a1');
 });
 it('shows the card with only expired follow-ups, so they stay answerable',()=>{
  render(ui(withFollowUps({unconfirmed:none,outcomes:none,expired:{unconfirmed:none,outcomes:{items:[pending('o1')],count:1,groupCount:1}}})));
  expect(screen.getByRole('button',{name:'Vencidos · 1'})).toBeTruthy();
 });
});
