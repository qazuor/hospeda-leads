import {beforeAll,describe,it,expect} from 'vitest';
import {render,screen,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {PendingOutcomes} from './PendingOutcomes';
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
});
