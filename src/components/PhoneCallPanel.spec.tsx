import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {PhoneCallPanel,useCallSession} from './PhoneCallPanel';
import {getCommunication,postCommunication} from '../endpoints/communication.schema';

vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),info:vi.fn()}}));
vi.mock('./OutcomeAfterContact',()=>({OutcomeAfterContact:()=><p>Cómo salió (mock)</p>}));
vi.mock('../endpoints/communication.schema',async original=>({...(await original<typeof import('../endpoints/communication.schema')>()),postCommunication:vi.fn(),getCommunication:vi.fn()}));
const setPointer=(coarse:boolean)=>{window.matchMedia=((query:string)=>({matches:coarse&&query.includes('pointer: coarse'),media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);};
beforeEach(()=>{setPointer(false);Object.defineProperty(navigator,'clipboard',{value:{writeText:vi.fn().mockResolvedValue(undefined)},configurable:true});window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};vi.mocked(getCommunication).mockResolvedValue({restrictions:[],messages:[],recentMessages:[]} as never);});
afterEach(()=>{cleanup();vi.clearAllMocks();});

const account={id:'5',nombre:'Hotel Sol',telefono:'+54 9 3442 00-0001'};
const ana={id:'7',name:'Ana',phone:'+5493442000077',deletedAt:null},leo={id:'8',name:'Leo',phone:'+5493442000088',deletedAt:null};
const show=(props:Partial<React.ComponentProps<typeof PhoneCallPanel>>={})=>render(<MantineProvider><QueryClientProvider client={new QueryClient()}><PhoneCallPanel account={account} contacts={[]} leadId={null} purpose={{purpose:'first_contact',otherPurpose:''}} onFinished={()=>{}} {...props}/></QueryClientProvider></MantineProvider>);

describe('PhoneCallPanel',()=>{
 it('shows the number with "Copiar número" and no tel: link on a desktop',async()=>{
  show();
  expect((await screen.findByLabelText('Número a llamar')).textContent).toBe('+54 9 3442 00-0001');
  expect(screen.getByRole('button',{name:'Copiar número'})).toBeTruthy();
  expect(document.querySelector('a[href^="tel:"]')).toBeNull();
 });
 it('offers a tel: link instead of copying on a touch device',async()=>{
  setPointer(true);show();
  const link=await screen.findByRole('link',{name:'Llamar ahora'});
  expect(link.getAttribute('href')).toBe('tel:+5493442000001');
  expect(screen.queryByRole('button',{name:'Copiar número'})).toBeNull();
 });
 it('records nothing until "Ya llamé" and then saves a call with the stated summary',async()=>{
  vi.mocked(postCommunication).mockResolvedValue({id:'m1',accountId:'5',leadId:null,contactId:null,channel:'call',purpose:'first_contact',status:'manual_sent'} as never);
  show();
  await waitFor(()=>expect((screen.getByRole('button',{name:'Copiar número'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Copiar número'}));
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Todavía no se anotó'));
  expect(postCommunication).not.toHaveBeenCalled();
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('+54 9 3442 00-0001');
  fireEvent.click(screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}));
  await waitFor(()=>expect(postCommunication).toHaveBeenCalledTimes(1));
  expect(vi.mocked(postCommunication).mock.calls[0][0]).toMatchObject({action:'manual_start',channel:'call',result:'manual_sent',leadId:null,purpose:'first_contact',contactId:null,body:'Llamada realizada a Hotel Sol (+54 9 3442 00-0001).'});
  await screen.findByText('Cómo salió (mock)');
 });
 it('makes the seller choose among several people before any call can be saved',async()=>{
  show({contacts:[ana,leo]});
  const yes=await screen.findByRole('button',{name:'Ya llamé: anotar cómo salió'});
  expect((yes as HTMLButtonElement).disabled||yes.getAttribute('aria-disabled')==='true').toBe(true);
  expect(screen.queryByLabelText('Número a llamar')).toBeNull();
  fireEvent.change(screen.getByLabelText('¿A quién llamás?'),{target:{value:'8'}});
  expect((await screen.findByLabelText('Número a llamar')).textContent).toBe('+5493442000088');
 });
 it('hands over to the task completion path without saving a call when asked to',async()=>{
  const onLog=vi.fn();show({contacts:[ana],leadId:'9',purpose:null,fixedRecipient:{id:'7',mustChoose:false},onLog});
  expect((await screen.findByLabelText('Número a llamar')).textContent).toBe('+5493442000077');
  expect(screen.queryByRole('button',{name:'No me atendieron'})).toBeNull();
  await waitFor(()=>expect((screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}));
  expect(onLog).toHaveBeenCalledWith('7','phone');expect(postCommunication).not.toHaveBeenCalled();
 });
 it('does not let a restricted person be called',async()=>{
  vi.mocked(getCommunication).mockResolvedValue({restrictions:[{channel:'call',contactId:null,leadId:null,liftedAt:null}],messages:[],recentMessages:[]} as never);
  show();
  await waitFor(()=>{const yes=screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'});expect((yes as HTMLButtonElement).disabled||yes.getAttribute('aria-disabled')==='true').toBe(true);expect((screen.getByRole('button',{name:'Copiar número'}) as HTMLButtonElement).disabled).toBe(true)});
 });
 it('lets her say she called even when no number is stored, while showing and copying stay off',async()=>{
  show({account:{...account,telefono:null}});
  await screen.findByText('Esta persona no tiene un teléfono cargado.');
  await waitFor(()=>expect((screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}) as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByRole('button',{name:'Copiar número'}) as HTMLButtonElement).disabled).toBe(true);
 });
 it('keeps the number and "Ya llamé" usable on a general task path (onLog, no management, no purpose)',async()=>{
  const onLog=vi.fn();show({leadId:null,purpose:null,contacts:[ana],fixedRecipient:{id:'7',mustChoose:false},onLog});
  await waitFor(()=>{expect((screen.getByRole('button',{name:'Copiar número'}) as HTMLButtonElement).disabled).toBe(false);expect((screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}) as HTMLButtonElement).disabled).toBe(false)});
  fireEvent.click(screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}));expect(onLog).toHaveBeenCalledWith('7','phone');
 });
 it('still needs a purpose when it saves the call itself without a management',async()=>{
  show({leadId:null,purpose:null});
  await screen.findByLabelText('Número a llamar');
  expect((screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(()=>expect((screen.getByRole('button',{name:'Copiar número'}) as HTMLButtonElement).disabled).toBe(false));
 });
 it('does not render a tel: link without a number once the call is saved (touch)',async()=>{
  setPointer(true);vi.mocked(postCommunication).mockResolvedValue({id:'m1',accountId:'5',leadId:null,contactId:null,channel:'call',purpose:'first_contact',status:'manual_sent'} as never);
  show({account:{...account,telefono:null}});
  await waitFor(()=>expect((screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}));
  await screen.findByText('Cómo salió (mock)');
  expect(document.querySelector('a[href="tel:"]')).toBeNull();
 });
});

describe('PhoneCallPanel call session',()=>{
 function Host({leadId}:{leadId:string|null}){const session=useCallSession();const [shown,setShown]=React.useState(true);
  return <MantineProvider><QueryClientProvider client={client}><button onClick={()=>setShown(!shown)}>alternar</button>{shown&&<PhoneCallPanel session={session} account={account} contacts={[]} leadId={leadId} purpose={{purpose:'first_contact',otherPurpose:''}} onFinished={()=>{}}/>}</QueryClientProvider></MantineProvider>;}
 const client=new QueryClient();
 it('keeps a saved call saved when the panel is unmounted and mounted again',async()=>{
  vi.mocked(postCommunication).mockResolvedValue({id:'m1',accountId:'5',leadId:null,contactId:null,channel:'call',purpose:'first_contact',status:'manual_sent'} as never);
  render(<Host leadId={null}/>);
  await waitFor(()=>expect((screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}));await screen.findByText('Cómo salió (mock)');
  fireEvent.click(screen.getByRole('button',{name:'alternar'}));fireEvent.click(screen.getByRole('button',{name:'alternar'}));
  const again=await screen.findByRole('button',{name:'Ya llamé: anotar cómo salió'});
  expect((again as HTMLButtonElement).disabled).toBe(true);expect(postCommunication).toHaveBeenCalledTimes(1);
 });
 it('retries an uncertain save with the same request key even if the note or the button changes',async()=>{
  vi.mocked(postCommunication).mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({id:'m1',accountId:'5',leadId:null,contactId:null,channel:'call',purpose:'first_contact',status:'manual_sent'} as never);
  render(<Host leadId={null}/>);
  await waitFor(()=>expect((screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Ya llamé: anotar cómo salió'}));await screen.findByRole('alert');
  fireEvent.change(screen.getByLabelText('Nota de la llamada (opcional)'),{target:{value:'otra nota'}});
  fireEvent.click(screen.getByRole('button',{name:'No me atendieron'}));
  await waitFor(()=>expect(postCommunication).toHaveBeenCalledTimes(2));
  const [first,second]=vi.mocked(postCommunication).mock.calls.map(c=>(c[0] as {id:string}).id);expect(second).toBe(first);
 });
 it('warns, without blocking the call, when the chosen person\'s phone belongs to a No contactar business (D2)',async()=>{
  const dnc={...ana,dncPhoneBusinesses:[{nombre:'Cabañas del Río',ciudad:'Colón'}]};
  show({contacts:[dnc,leo],initialContactId:'7'});
  const note=await screen.findByRole('note',{name:'Teléfono de un negocio No contactar'});
  expect(note.textContent).toContain('Este teléfono es de un negocio que pidió no ser contactado: Cabañas del Río (Colón).');
  expect(note.textContent).toContain('No uses este teléfono para contactar sin consultar a un administrador.');
  await waitFor(()=>expect((screen.getByRole('button',{name:'Copiar número'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Copiar número'}));
  await waitFor(()=>expect(navigator.clipboard.writeText).toHaveBeenCalledWith('+5493442000077'));
  fireEvent.change(screen.getByLabelText('¿A quién llamás?'),{target:{value:'8'}});
  await waitFor(()=>expect(screen.queryByRole('note',{name:'Teléfono de un negocio No contactar'})).toBeNull());
 });
 it('shows no notice for a person without a No contactar phone match',async()=>{
  show({contacts:[{...ana,dncPhoneBusinesses:[]},leo],initialContactId:'7'});
  await screen.findByLabelText('Número a llamar');
  expect(screen.queryByRole('note')).toBeNull();
 });
});
