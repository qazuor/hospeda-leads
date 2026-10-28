import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ContactTemplateDialog} from './ContactTemplateDialog';

vi.mock('../endpoints/commercial.schema',()=>({getCommercialDetail:vi.fn(async()=>({contacts:[],opportunities:[{id:'1',assignedUserEmail:'seller@example.com'}],account:{id:'1',isClient:false,doNotContact:false,assignedUserEmail:'seller@example.com'},senderProfiles:[]}))}));
const postControl=vi.hoisted(()=>({pending:false,release:()=>{}}));
vi.mock('../endpoints/communication.schema',()=>({getCommunication:vi.fn(async()=>({restrictions:[],activeRestrictions:[],recentMessages:[],recentContactHours:72,openManagements:[]})) ,postCommunication:vi.fn(async()=>{if(postControl.pending)await new Promise<void>(resolve=>{postControl.release=resolve});return ({id:'m',accountId:'1',leadId:'1',contactId:null,channel:'email',recipient:'seller@example.com',recipientName:null,subject:'Subject',body:'Hello',htmlBody:null,textBody:null,templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'draft',revision:0,lastInteractionAt:null,lastActorEmail:null,createdAt:new Date(),updatedAt:new Date(),purpose:null,otherPurpose:null})})}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:'u',email:'seller@example.com',role:'admin'}}})}));
let mediaChanges:Array<(event:MediaQueryListEvent)=>void>=[];
const setup=(presentation:'floating'|'dialog'='floating',callbacks:{onOpenChange?:(v:boolean)=>void;onFloatingClose?:(floating:boolean)=>void}={})=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ContactTemplateDialog open presentation={presentation} channel="email" lead={{id:'1',accountId:'1',nombre:'Negocio',tipo:'hotel',email:'business@example.com'}} templates={[]} onOpenChange={callbacks.onOpenChange??vi.fn()} onFloatingClose={callbacks.onFloatingClose}/></QueryClientProvider></MantineProvider>);
beforeEach(()=>{mediaChanges=[];window.matchMedia=vi.fn().mockImplementation(()=>({matches:true,addEventListener:(name:string,listener:(event:MediaQueryListEvent)=>void)=>{if(name==='change')mediaChanges.push(listener)},removeEventListener:vi.fn(),addListener:(listener:(event:MediaQueryListEvent)=>void)=>{mediaChanges.push(listener)},removeListener:vi.fn()}))});
afterEach(()=>{cleanup();postControl.pending=false;vi.clearAllMocks()});

describe('floating composer',()=>{
 it('is labelled and non-modal, and keeps typed content while minimised and restored',async()=>{
  setup();const dialog=screen.getByRole('dialog',{name:'Preparar email'});expect(dialog.getAttribute('aria-modal')).toBe('false');expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  const prepareButton=screen.getByRole('button',{name:'Escribir un mensaje nuevo'});await waitFor(()=>expect((prepareButton as HTMLButtonElement).disabled).toBe(false));fireEvent.click(prepareButton);const field=await screen.findByRole('textbox',{name:'Asunto final'});field.focus();fireEvent.change(field,{target:{value:'Borrador'} });expect(document.activeElement).toBe(field);fireEvent.click(screen.getByRole('button',{name:'Minimizar'}));expect(screen.getByRole('button',{name:'Restaurar'}).getAttribute('aria-expanded')).toBe('false');fireEvent.click(screen.getByRole('button',{name:'Restaurar'}));expect((screen.getByRole('textbox',{name:'Asunto final'}) as HTMLInputElement).value).toBe('Borrador');
 });
 it('routes Escape through the dirty guard and ignores Escape while the confirmation modal is open',async()=>{
  setup();const prepareButton=screen.getByRole('button',{name:'Escribir un mensaje nuevo'});await waitFor(()=>expect((prepareButton as HTMLButtonElement).disabled).toBe(false));fireEvent.click(prepareButton);const field=await screen.findByRole('textbox',{name:'Asunto final'});fireEvent.change(field,{target:{value:'Cambios'}});fireEvent.keyDown(document,{key:'Escape'});expect(screen.getByRole('dialog',{name:'Tenés cambios sin guardar'})).toBeTruthy();fireEvent.keyDown(document,{key:'Escape'});expect(screen.getByRole('dialog',{name:'Preparar email'})).toBeTruthy();
 });
 it('blocks Escape while a save is in progress',async()=>{setup();const start=screen.getByRole('button',{name:'Escribir un mensaje nuevo'});await waitFor(()=>expect((start as HTMLButtonElement).disabled).toBe(false));fireEvent.click(start);const field=await screen.findByRole('textbox',{name:'Asunto final'});fireEvent.change(field,{target:{value:'Busy'} });postControl.pending=true;fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}));await waitFor(()=>expect((screen.getAllByRole('button',{name:'Cerrar'})[0] as HTMLButtonElement).disabled).toBe(true));fireEvent.keyDown(document,{key:'Escape'});expect(screen.getByRole('dialog',{name:'Preparar email'})).toBeTruthy();postControl.release();});
 it('keeps the composer mounted when matchMedia changes',async()=>{
  setup();const prepareButton=screen.getByRole('button',{name:'Escribir un mensaje nuevo'});await waitFor(()=>expect((prepareButton as HTMLButtonElement).disabled).toBe(false));fireEvent.click(prepareButton);const field=await screen.findByRole('textbox',{name:'Asunto final'});fireEvent.change(field,{target:{value:'Se conserva'}});act(()=>mediaChanges.forEach(listener=>listener({matches:false,media:'(min-width: 768px)'} as MediaQueryListEvent)));expect(screen.getByRole('dialog',{name:'Preparar email'}).getAttribute('aria-modal')).toBe('false');expect((screen.getByRole('textbox',{name:'Asunto final'}) as HTMLInputElement).value).toBe('Se conserva');
 });
 it('ends the floating flow on close only after the unsaved-changes guard approves it',async()=>{
  const onOpenChange=vi.fn(),onFloatingClose=vi.fn();setup('floating',{onOpenChange,onFloatingClose});
  const prepareButton=screen.getByRole('button',{name:'Escribir un mensaje nuevo'});await waitFor(()=>expect((prepareButton as HTMLButtonElement).disabled).toBe(false));fireEvent.click(prepareButton);const field=await screen.findByRole('textbox',{name:'Asunto final'});fireEvent.change(field,{target:{value:'Sin guardar'}});
  fireEvent.click(screen.getAllByRole('button',{name:'Cerrar'})[0]);
  expect(await screen.findByText('Tenés cambios sin guardar')).toBeTruthy();expect(onFloatingClose).not.toHaveBeenCalled();expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Descartar cambios y salir'}));
  await waitFor(()=>expect(onFloatingClose).toHaveBeenCalledWith(true));expect(onOpenChange).toHaveBeenCalledWith(false);
 });
 it('keeps dialog presentation modal for other callers',()=>{setup('dialog');expect(screen.getByRole('dialog',{name:'Preparar email'}).getAttribute('aria-modal')).toBe('true')});
});
