import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {InboundMessage} from '../endpoints/communication.schema';

const mocks=vi.hoisted(()=>({postCommunication:vi.fn()}));
vi.mock('../endpoints/communication.schema',async original=>({...await original<typeof import('../endpoints/communication.schema')>(),postCommunication:mocks.postCommunication}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'seller@example.com',displayName:'Seller',role:'user'}}})}));
import {InboundMessageActions,UNCERTAIN_REPLY} from './InboundMessageActions';
import {getInboundReplyGuard,isSettledReplyStatus,setInboundReplyGuard} from '../helpers/inboundReplyGuard';

const item:InboundMessage={id:'7a1c2b3a-1111-4222-8333-944455556666',channel:'email',receivedAt:new Date('2026-10-20T12:00:00Z'),fromAddress:'guest@example.com',fromName:'Guest',subject:'Availability',textBody:'¿Tienen lugar?',status:'pending_review',isAutomatic:false,matchMethod:'',leadId:null,contextName:'General',linkedMessageId:null,responseId:null,attachments:[],canReply:true,replyAvailable:true,replyRestricted:false};
/** Mounts the actions under a QueryClient that outlives the mount, as the app's single client does. */
const mount=(client:QueryClient,replyStatus?:(id:string)=>string|undefined)=>render(<MantineProvider><QueryClientProvider client={client}><InboundMessageActions item={item} canWrite onRegister={()=>undefined} replyStatus={replyStatus}/></QueryClientProvider></MantineProvider>);
async function sendReply(){
 fireEvent.click(await screen.findByRole('button',{name:'Responder'}));
 fireEvent.input(await screen.findByRole('textbox',{name:'Respuesta'}),{target:{textContent:'Hola'}});
 const send=await screen.findByRole('button',{name:'Enviar respuesta'});
 await waitFor(()=>expect((send as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(send);
}
const responder=()=>screen.getByRole('button',{name:'Responder'}) as HTMLButtonElement;
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
beforeEach(()=>{mocks.postCommunication.mockReset();});
afterEach(cleanup);

describe('inbound reply guard across unmounts',()=>{
 it('keeps «Responder» blocked after an uncertain result when the actions remount, with the same attempt id',async()=>{
  const client=new QueryClient();
  const first=mount(client);
  mocks.postCommunication.mockResolvedValueOnce({error:'No se pudo confirmar el resultado del envío.',message:{status:'unknown'}});
  await sendReply();
  await waitFor(()=>expect(mocks.postCommunication).toHaveBeenCalledTimes(1));
  const attemptId=mocks.postCommunication.mock.calls[0][0].id;
  await waitFor(()=>expect(getInboundReplyGuard({owner:client,inboundId:item.id})).toEqual({attemptId,uncertain:true}));
  first.unmount();
  mount(client);
  expect(responder().disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toBe(UNCERTAIN_REPLY);
 });
 it('reuses the attempt id after a failed request even when the actions unmounted meanwhile',async()=>{
  const client=new QueryClient();
  const first=mount(client);
  let reject:(error:Error)=>void=()=>undefined;
  mocks.postCommunication.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail}));
  await sendReply();
  await waitFor(()=>expect(mocks.postCommunication).toHaveBeenCalledTimes(1));
  const attemptId=mocks.postCommunication.mock.calls[0][0].id;
  first.unmount();
  reject(new Error('Sin conexión'));
  await waitFor(()=>expect(getInboundReplyGuard({owner:client,inboundId:item.id})).toEqual({attemptId,uncertain:false}));
  mount(client);
  expect(responder().disabled).toBe(false);
  mocks.postCommunication.mockResolvedValueOnce({message:{status:'accepted'}});
  await sendReply();
  await waitFor(()=>expect(mocks.postCommunication).toHaveBeenCalledTimes(2));
  expect(mocks.postCommunication.mock.calls[1][0]).toMatchObject({action:'inbound_reply',id:attemptId,inboundId:item.id});
  await waitFor(()=>expect(getInboundReplyGuard({owner:client,inboundId:item.id})).toBeNull());
 });
 it('unblocks once the host reports a settled status for the uncertain attempt',async()=>{
  const client=new QueryClient();
  setInboundReplyGuard({owner:client,inboundId:item.id,guard:{attemptId:'attempt-1',uncertain:true}});
  const blocked=mount(client,()=>'unknown');
  expect(responder().disabled).toBe(true);
  blocked.unmount();
  mount(client,id=>id==='attempt-1'?'manual_sent':undefined);
  await waitFor(()=>expect(responder().disabled).toBe(false));
  expect(getInboundReplyGuard({owner:client,inboundId:item.id})).toBeNull();
 });
 it('keeps guards apart per QueryClient',()=>{
  const a=new QueryClient(),b=new QueryClient();
  setInboundReplyGuard({owner:a,inboundId:'x',guard:{attemptId:'1',uncertain:true}});
  expect(getInboundReplyGuard({owner:b,inboundId:'x'})).toBeNull();
  setInboundReplyGuard({owner:a,inboundId:'x',guard:null});
  expect(getInboundReplyGuard({owner:a,inboundId:'x'})).toBeNull();
 });
 it('treats only submitting and unknown as open statuses',()=>{
  expect(isSettledReplyStatus({status:'unknown'})).toBe(false);
  expect(isSettledReplyStatus({status:'submitting'})).toBe(false);
  expect(isSettledReplyStatus({status:undefined})).toBe(false);
  expect(isSettledReplyStatus({status:'accepted'})).toBe(true);
  expect(isSettledReplyStatus({status:'failed'})).toBe(true);
 });
});
