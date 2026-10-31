import {beforeAll,describe,it,expect,vi} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
vi.mock('./OutcomeAfterContact',()=>({OutcomeAfterContact:({contact,note}:{contact:{messageId?:string};note?:string})=><p>Cómo salió (mock) {contact.messageId} {note}</p>}));
import {OutcomeGroupRow,PendingOutcomes,groupOutcomeNote} from './PendingOutcomes';
import {groupOutcomeFollowUps} from '../helpers/contactFollowUpGroups';
import type {PendingOutcome} from '../endpoints/communication.schema';

const item=(id:string,over:Partial<PendingOutcome>={}):PendingOutcome=>({id,accountId:'1',accountName:'Hotel',leadId:null,opportunityName:null,contactId:null,channel:'whatsapp',status:'manual_sent',purpose:null,recipientName:'Julia',lastInteractionAt:new Date('2026-10-30T12:00:00Z'),...over});
beforeAll(()=>{window.matchMedia=()=>({matches:false,media:'',onchange:null,addListener:()=>{},removeListener:()=>{},addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>false});});
describe('PendingOutcomes',()=>{
 it('shows the actual confirmation source for WhatsApp, Instagram and manual confirmation',()=>{
  render(<MantineProvider><PendingOutcomes items={[item('wa',{externalId:'wamid.1',confirmationSource:'userscript'}),item('ig',{channel:'social',destinationDetail:'instagram',externalId:'mid.1',confirmationSource:'instagram'}),item('manual',{externalId:'wamid.2',confirmationSource:'manual'})]}/></MantineProvider>);
  expect(screen.getByText(/Enviado · confirmado por el script de WhatsApp/)).toBeTruthy();
  expect(screen.getByText(/Enviado · confirmado por Instagram/)).toBeTruthy();
  expect(screen.getByText(/Envío confirmado manualmente/)).toBeTruthy();
 });
 it('lists only contacts in «Anotá cómo salió» and the unconfirmed sends in their own block with the same button (spec 99 §3.6)',()=>{
  render(<MantineProvider><PendingOutcomes items={[item('c1'),item('c2')]} count={25} unconfirmed={{items:[item('u1',{status:'whatsapp_opened'}),item('u2',{status:'manual_pending',channel:'call'})],count:2}}/></MantineProvider>);
  const card=screen.getByRole('region',{name:'Anotá cómo salió'}),block=within(card).getByRole('region',{name:'Envíos sin confirmar'});
  expect(within(card).getByLabelText('Contactos sin resultado').textContent).toBe('25');
  expect(within(block).getByRole('heading',{name:'Envíos sin confirmar · 2'})).toBeTruthy();
  expect(within(block).getAllByRole('button',{name:'Anotá cómo salió'})).toHaveLength(2);
  expect(within(card).getAllByRole('article')).toHaveLength(4);
  expect(within(card).getByText('Se muestran los 2 más recientes de 25.')).toBeTruthy();
 });
 it('with only unconfirmed sends shows just «Envíos sin confirmar · N», without an «Anotá cómo salió» header at 0',()=>{
  render(<MantineProvider><PendingOutcomes items={[]} count={0} unconfirmed={{items:[item('u1',{status:'whatsapp_opened'})],count:1}}/></MantineProvider>);
  const card=screen.getByRole('region',{name:'Anotá cómo salió'});
  expect(within(card).queryByRole('heading',{name:'Anotá cómo salió'})).toBeNull();expect(within(card).queryByLabelText('Contactos sin resultado')).toBeNull();
  expect(within(card).getByRole('heading',{name:'Envíos sin confirmar · 1'})).toBeTruthy();
 });
 it('shows a management group with its 3 sends (manual, script, Instagram), their labels and one button whose dialog covers all 3 (spec 100 §6)',()=>{
  const [group]=groupOutcomeFollowUps({items:[item('manual',{leadId:'9',opportunityName:'Plan anual',channel:'call',lastInteractionAt:new Date('2026-10-28T12:00:00Z')}),item('wa',{leadId:'9',opportunityName:'Plan anual',externalId:'wamid.1',confirmationSource:'userscript',lastInteractionAt:new Date('2026-10-29T12:00:00Z')}),item('ig',{leadId:'9',opportunityName:'Plan anual',channel:'social',destinationDetail:'instagram',externalId:'mid.1',confirmationSource:'instagram'})]});
  const onOutcome=vi.fn();
  render(<MantineProvider><OutcomeGroupRow group={group} showBusiness={false} onOutcome={onOutcome}/></MantineProvider>);
  const row=screen.getByRole('article',{name:'Resultado pendiente de Plan anual'});
  expect(within(row).getByText('3 envíos sin resultado')).toBeTruthy();
  for(const label of [/Envío confirmado manualmente/,/Enviado · confirmado por el script de WhatsApp/,/Enviado · confirmado por Instagram/])expect(within(row).getByText(label)).toBeTruthy();
  fireEvent.click(within(row).getByRole('button',{name:'Anotá cómo salió'}));
  expect(onOutcome).toHaveBeenCalledWith(group);expect(group.newest.id).toBe('ig');
  expect(groupOutcomeNote(group)).toBe('Este resultado vale para los 3 envíos de esta gestión.');
 });
 it('shows at most 3 sends of a group and «+N más» for the rest',()=>{
  const [group]=groupOutcomeFollowUps({items:['a','b','c','d','e'].map((id,i)=>item(id,{lastInteractionAt:new Date(Date.UTC(2026,9,20+i))}))});
  render(<MantineProvider><OutcomeGroupRow group={group} showBusiness={false} onOutcome={()=>{}}/></MantineProvider>);
  const row=screen.getByRole('article',{name:'Resultado pendiente de Sin gestión'});
  expect(within(row).getAllByRole('listitem')).toHaveLength(3);
  fireEvent.click(within(row).getByRole('button',{name:'+2 más'}));
  expect(within(row).getAllByRole('listitem')).toHaveLength(5);
 });
 it('counts a group of 12 sends by the server total although only its 10 newest arrive',()=>{
  const [group]=groupOutcomeFollowUps({items:Array.from({length:10},(_,i)=>item('s'+i,{groupTotal:12,lastInteractionAt:new Date(Date.UTC(2026,9,20,i))}))});
  expect(group.total).toBe(12);expect(groupOutcomeNote(group)).toBe('Este resultado vale para los 12 envíos de esta gestión.');
  render(<MantineProvider><OutcomeGroupRow group={group} showBusiness={false} onOutcome={()=>{}}/></MantineProvider>);
  const row=screen.getByRole('article',{name:'Resultado pendiente de Sin gestión'});
  expect(within(row).getByText('12 envíos sin resultado')).toBeTruthy();
  fireEvent.click(within(row).getByRole('button',{name:'+9 más'}));
  expect(within(row).getAllByRole('listitem')).toHaveLength(10);
  expect(within(row).queryByRole('button',{name:/más$/})).toBeNull();expect(within(row).getByText('+2 más')).toBeTruthy();
 });
 it('never counts a group below the sends it lists (an older server without groupTotal)',()=>{
  const [group]=groupOutcomeFollowUps({items:[item('a',{leadId:'9'}),item('b',{leadId:'9'})]});
  expect(group.total).toBe(2);expect(groupOutcomeNote(groupOutcomeFollowUps({items:[item('a')]})[0])).toBeUndefined();
 });
});
