import {beforeAll,describe,it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
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
});
