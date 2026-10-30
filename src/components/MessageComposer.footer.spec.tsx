import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {MessageComposer} from './MessageComposer';
import {postCommunication,type PreparedMessage} from '../endpoints/communication.schema';
import {CONNECTION_ATTRIBUTE,INSTALLED_ATTRIBUTE,USER_ATTRIBUTE} from '../../userscript/src/announce';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';

vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),info:vi.fn(),warning:vi.fn()}}));
// A plain textarea that reports its text, so the draft becomes dirty like with the real editor.
vi.mock('./RichTemplateEditor',()=>({RichTemplateEditor:({ariaLabel,onChange}:{ariaLabel:string;onChange:(v:string)=>void})=><textarea aria-label={ariaLabel} onChange={e=>onChange(e.target.value)}/>}));
vi.mock('../endpoints/communication.schema',async original=>({...(await original<typeof import('../endpoints/communication.schema')>()),postCommunication:vi.fn()}));

const html=()=>document.documentElement;
const message=(over:Partial<PreparedMessage>={}):PreparedMessage=>({id:'11111111-1111-4111-8111-111111111111',accountId:'5',leadId:'9',contactId:'7',channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana',subject:'',body:'Hola',htmlBody:null,textBody:'Hola',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'draft',revision:4,lastInteractionAt:null,lastActorEmail:null,createdAt:new Date('2026-10-28T15:30:00Z'),updatedAt:new Date('2026-10-28T15:30:00Z'),...over});
const WA='Abrir WhatsApp con Ana · +54 9 3442000002';
let slot:HTMLDivElement;
const show=(initial:PreparedMessage,props:Partial<React.ComponentProps<typeof MessageComposer>>={})=>render(<MantineProvider><MemoryRouter><QueryClientProvider client={new QueryClient()}><MessageComposer initial={initial} actionSlot={slot} {...props}/></QueryClientProvider></MemoryRouter></MantineProvider>);
const deferred=<T,>()=>{let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const popup=()=>({opener:{},closed:false,location:{href:'about:blank'},close:vi.fn()});
const edit=(text:string)=>fireEvent.change(screen.getByLabelText('Mensaje final'),{target:{value:text}});

beforeAll(()=>{window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};Element.prototype.scrollIntoView=Element.prototype.scrollIntoView||(()=>{});});
beforeEach(()=>{
 window.matchMedia=((query:string)=>({matches:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
 html().setAttribute(INSTALLED_ATTRIBUTE,USERSCRIPT_VERSION);html().setAttribute(CONNECTION_ATTRIBUTE,'connected');html().setAttribute(USER_ATTRIBUTE,'seller@example.com');
 slot=document.createElement('div');document.body.appendChild(slot);
});
afterEach(()=>{cleanup();slot.remove();vi.clearAllMocks();vi.restoreAllMocks();for(const name of [INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE])html().removeAttribute(name);});

describe('MessageComposer · final button in the footer slot (owner review of spec 96)',()=>{
 it('saves an edited email and shows the final view before sending, instead of sending at once (owner, 28/10/2026)',async()=>{
  // Arrange
  const email=message({channel:'email',recipient:'ana@example.com',subject:'Asunto',body:'<p>Hola</p>',htmlBody:'<p>Hola</p>',textBody:'Hola'});
  vi.mocked(postCommunication).mockResolvedValue({...email,body:'<p>Hola Ana</p>',htmlBody:'<p>Hola Ana</p>',textBody:'Hola Ana',revision:5});
  show(email,{startEditing:true});
  await screen.findByLabelText('Mensaje final');edit('<p>Hola Ana</p>');
  // Act
  fireEvent.click(within(slot).getByRole('button',{name:'Guardar y revisar'}));
  // Assert
  await waitFor(()=>expect(within(slot).getByRole('button',{name:/^Enviar email a/})).toBeTruthy());
  expect(vi.mocked(postCommunication)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(postCommunication).mock.calls[0][0]).toMatchObject({action:'edit',body:'<p>Hola Ana</p>'});
 });
 it('closes the blank WhatsApp tab when the dispatch fails (review of the footer change)',async()=>{
  // Arrange
  const tab=popup();vi.spyOn(window,'open').mockReturnValue(tab as unknown as Window);
  vi.mocked(postCommunication).mockRejectedValue(new Error('Se cortó la conexión.'));
  show(message());
  // Act
  fireEvent.click(within(slot).getByRole('button',{name:WA}));
  // Assert
  await waitFor(()=>expect(tab.close).toHaveBeenCalledTimes(1));
  expect(window.open).toHaveBeenCalledTimes(1);
 });
 it('renders the final button only in the slot while a draft exists',()=>{
  // Arrange & Act
  show(message());
  // Assert
  expect((within(slot).getByRole('button',{name:WA}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getAllByRole('button',{name:WA})).toHaveLength(1);
  expect(screen.getByText('Se abrirá WhatsApp. Después podés registrar si efectivamente lo enviaste.')).toBeTruthy();
 });
 it('keeps the button visible in the editor and opens directly when nothing changed',async()=>{
  // Arrange
  const tab=popup();const open=vi.spyOn(window,'open').mockReturnValue(tab as unknown as Window);
  vi.mocked(postCommunication).mockReturnValue(new Promise(()=>{}));
  show(message(),{startEditing:true});
  // Act
  fireEvent.click(within(slot).getByRole('button',{name:WA}));
  // Assert
  expect(open).toHaveBeenCalledTimes(1);
  await waitFor(()=>expect(vi.mocked(postCommunication).mock.calls.map(c=>c[0].action)).toEqual(['dispatch']));
 });
 it('with unsaved edits saves first and then dispatches the saved revision, opening the tab inside the click',async()=>{
  // Arrange
  const tab=popup();const open=vi.spyOn(window,'open').mockReturnValue(tab as unknown as Window);
  const save=deferred<unknown>();
  vi.mocked(postCommunication).mockImplementation(async input=>input.action==='edit'?save.promise:{message:message({status:'submitting',revision:6})});
  show(message(),{startEditing:true});
  edit('Hola de nuevo');
  // Act
  fireEvent.click(within(slot).getByRole('button',{name:WA}));
  fireEvent.click(within(slot).getByRole('button',{name:WA}));
  // Assert: the tab opened synchronously, once, before the save resolved
  expect(open).toHaveBeenCalledTimes(1);
  await waitFor(()=>expect(vi.mocked(postCommunication).mock.calls.map(c=>c[0])).toEqual([expect.objectContaining({action:'edit',revision:4,body:'Hola de nuevo'})]));
  save.resolve(message({body:'Hola de nuevo',textBody:'Hola de nuevo',revision:5}));
  await waitFor(()=>expect(vi.mocked(postCommunication).mock.calls[1]?.[0]).toMatchObject({action:'dispatch',revision:5,confirm:true}));
  expect(tab.close).not.toHaveBeenCalled();
 });
 it('closes the opened tab and keeps the text when the save fails',async()=>{
  // Arrange
  const tab=popup();vi.spyOn(window,'open').mockReturnValue(tab as unknown as Window);
  vi.mocked(postCommunication).mockRejectedValue(new Error('No se pudo guardar el mensaje.'));
  show(message(),{startEditing:true});
  edit('Texto que no se pierde');
  // Act
  fireEvent.click(within(slot).getByRole('button',{name:WA}));
  // Assert
  await waitFor(()=>expect(tab.close).toHaveBeenCalledTimes(1));
  expect(vi.mocked(postCommunication).mock.calls.map(c=>c[0].action)).toEqual(['edit']);
  expect(await screen.findByText('No se pudo guardar el mensaje.')).toBeTruthy();
  expect((screen.getByLabelText('Mensaje final') as HTMLTextAreaElement).value).toBe('Texto que no se pierde');
  expect(screen.getByText('Cambios sin guardar')).toBeTruthy();
 });
 it('stays off with the reason while the edit cannot be saved, and for Instagram with unsaved edits',()=>{
  // Arrange & Act
  show(message({body:'',textBody:null}));
  // Assert
  expect((within(slot).getByRole('button',{name:WA}) as HTMLButtonElement).disabled).toBe(true);
  edit('Hola {{contact}}');
  expect((within(slot).getByRole('button',{name:WA}) as HTMLButtonElement).disabled).toBe(true);
  cleanup();
  show(message({channel:'social',destinationDetail:'instagram',recipient:'@hotel.sol',recipientName:'Hotel Sol',body:'Hola',textBody:'Hola'}),{startEditing:true});
  edit('Hola otra vez');
  expect((within(slot).getAllByRole('button')[0] as HTMLButtonElement).disabled).toBe(true);
 });
 it('without a slot keeps the button in the review section, hidden while editing',()=>{
  // Arrange & Act
  show(message(),{actionSlot:undefined,startEditing:true});
  // Assert
  expect(within(slot).queryByRole('button')).toBeNull();
  expect(screen.queryByRole('button',{name:WA})).toBeNull();
 });
});
