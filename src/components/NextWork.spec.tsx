import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import type {WorkData} from '../endpoints/work.schema';

const getWork=vi.hoisted(()=>vi.fn());
vi.mock('../endpoints/work.schema',async importOriginal=>({...(await importOriginal<typeof import('../endpoints/work.schema')>()),getWork}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'anonymous'}})}));
vi.mock('./WorkPanel',()=>({TaskRow:({task}:{task:{title:string}})=><div>{task.title}</div>}));
import {NextWork} from './NextWork';

afterEach(()=>{cleanup();vi.clearAllMocks();});
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));});

const detail={account:{nombre:'Hotel',ciudad:null,assignedUserEmail:null,doNotContact:false,telefono:'+541112345678',email:null},contacts:[],opportunities:[],journal:[],leadJournal:[],stages:[]} as unknown as CommercialDetail;
const activity=(continuation:'done'|'task',id:string,continuationReason:string|null=continuation==='done'?'Ya tengo otra tarea agendada':null)=>({id,accountId:'1',leadId:null,taskId:null,typeId:'call',title:id,occurredAt:new Date(id==='old'?'2026-10-01':'2026-10-02'),participants:'',contactIds:[],channel:null,continuation,continuationReason,result:null,notes:null,actorEmail:null,accountName:'Hotel',city:null});
const task:WorkData['tasks'][number]={id:'pending',accountId:'1',leadId:null,title:'Llamar el jueves',description:null,typeId:'call',assignedUserEmail:'a@example.test',dueDate:'2099-11-05',dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Hotel',city:null,opportunityName:null,deletedAt:null,purpose:null};
const data=(activities:WorkData['activities'],tasks:WorkData['tasks'])=>({tasks,activities,types:[],accounts:[],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:0,totalTasks:tasks.length,totalActivities:activities.length,page:1} as WorkData);
const setup=(work:WorkData)=>{getWork.mockResolvedValue(work);return render(<MantineProvider><QueryClientProvider client={new QueryClient()}><NextWork accountId="1" detail={detail}/></QueryClientProvider></MantineProvider>);};

describe('NextWork',()=>{
 it('shows the general pending task after a newer task activity follows an older done activity',async()=>{
  setup(data([activity('task','new'),activity('done','old')],[task]));
  expect(await screen.findByText('Llamar el jueves')).toBeTruthy();
 });
 it('explains that the other task is not visible when none is pending',async()=>{
  setup(data([activity('done','old')],[]));
  expect(await screen.findByRole('heading',{name:'No encontramos la otra tarea'})).toBeTruthy();
 });
 it('plans the next step when a newer task activity supersedes an older done activity and nothing is pending',async()=>{
  // Fails with a "newest done activity" selection, which would title «No encontramos la otra tarea».
  setup(data([activity('task','new'),activity('done','old')],[]));
  expect(await screen.findByRole('heading',{name:'Elegir el próximo paso'})).toBeTruthy();
  expect(screen.queryByText('No encontramos la otra tarea')).toBeNull();
 });
 it('does not title the business as a closed management in the business view',async()=>{
  setup(data([activity('done','old','La gestión ya está cerrada')],[]));
  expect(await screen.findByRole('heading',{name:'Por ahora no hay otro paso'})).toBeTruthy();
  expect(screen.queryByText('Gestión cerrada')).toBeNull();
  expect(screen.getByText('La última acción se guardó con la decisión de terminar por ahora. Podés planificar otra cuando corresponda.')).toBeTruthy();
 });
});
