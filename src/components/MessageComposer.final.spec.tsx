import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {MessageComposer} from './MessageComposer';
import {postCommunication,type PreparedMessage} from '../endpoints/communication.schema';
import {CONNECTION_ATTRIBUTE,INSTALLED_ATTRIBUTE,USER_ATTRIBUTE} from '../../userscript/src/announce';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';
import {toast} from 'sonner';

vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),info:vi.fn(),warning:vi.fn()}}));
vi.mock('./RichTemplateEditor',()=>({RichTemplateEditor:({ariaLabel}:{ariaLabel:string})=><textarea aria-label={ariaLabel}/>}));
vi.mock('../endpoints/communication.schema',async original=>({...(await original<typeof import('../endpoints/communication.schema')>()),postCommunication:vi.fn()}));

let coarse=false;
const html=()=>document.documentElement;
const connectScript=(version=USERSCRIPT_VERSION)=>{html().setAttribute(INSTALLED_ATTRIBUTE,version);html().setAttribute(CONNECTION_ATTRIBUTE,'connected');html().setAttribute(USER_ATTRIBUTE,'seller@example.com');};
beforeAll(()=>{window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};});
beforeEach(()=>{coarse=false;window.matchMedia=((query:string)=>({matches:query.includes('coarse')?coarse:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);connectScript();});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.restoreAllMocks();for(const name of [INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE])html().removeAttribute(name);});

const message=(over:Partial<PreparedMessage>={}):PreparedMessage=>({id:'11111111-1111-4111-8111-111111111111',accountId:'5',leadId:'9',contactId:'7',channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana',subject:'',body:'Hola *Ana*',htmlBody:null,textBody:'Hola *Ana*',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'draft',revision:4,lastInteractionAt:null,lastActorEmail:null,createdAt:new Date('2026-10-28T15:30:00Z'),updatedAt:new Date('2026-10-28T15:30:00Z'),...over});
const email=(over:Partial<PreparedMessage>={})=>message({channel:'email',recipient:'ana@example.com',subject:'Hola Ana',body:'<p>Hola Ana</p>',htmlBody:'<html>Hola Ana</html>',textBody:'Hola Ana',...over});
const show=(initial:PreparedMessage,props:Partial<React.ComponentProps<typeof MessageComposer>>={})=>render(<MantineProvider><MemoryRouter><QueryClientProvider client={new QueryClient()}><MessageComposer initial={initial} {...props}/></QueryClientProvider></MemoryRouter></MantineProvider>);
const popup=()=>({opener:{},closed:false,location:{href:'about:blank'},close:vi.fn()});
const WA='Abrir WhatsApp con Ana · +54 9 3442000002';

describe('MessageComposer · final view first (spec 96 §2.4–2.6)',()=>{
 it('opens a prepared template on the final view, with «Editar» and no checkbox',()=>{
  show(message());
  expect(screen.getByRole('heading',{name:'Revisá el contenido final'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Editar'})).toBeTruthy();
  expect(screen.queryByRole('checkbox',{name:'Revisé destinatario y contenido final'})).toBeNull();
  expect(screen.queryByRole('list',{name:'Preparación del mensaje'})).toBeNull();
  expect((screen.getByRole('button',{name:WA}) as HTMLButtonElement).disabled).toBe(false);
 });
 it('opens the editor for a blank message or missing variables',()=>{
  show(message({body:'',textBody:null}));
  expect(screen.getByRole('heading',{name:'Personalizá el mensaje'})).toBeTruthy();
  cleanup();show(message({body:'Hola {{contact}}',textBody:'Hola {{contact}}'}));
  expect(screen.getByRole('heading',{name:'Personalizá el mensaje'})).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('{{contact}}');
 });
 it('saves edits with «Guardar cambios» and goes back to the final view; «Volver al mensaje final» leaves without saving',async()=>{
  vi.mocked(postCommunication).mockResolvedValueOnce(message({revision:5}));
  show(message());
  fireEvent.click(screen.getByRole('button',{name:'Editar'}));
  fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}));
  await waitFor(()=>expect(vi.mocked(postCommunication).mock.calls[0][0]).toMatchObject({action:'edit',id:message().id,revision:4}));
  expect(await screen.findByRole('heading',{name:'Revisá el contenido final'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Editar'}));
  fireEvent.click(screen.getByRole('button',{name:'Volver al mensaje final'}));
  expect(screen.getByRole('heading',{name:'Revisá el contenido final'})).toBeTruthy();
  expect(postCommunication).toHaveBeenCalledTimes(1);
 });
 it('names the destination, opens the tab inside the click and sends confirm:true',async()=>{
  const tab=popup(),open=vi.spyOn(window,'open').mockReturnValue(tab as unknown as Window);
  let resolve!:(value:unknown)=>void;vi.mocked(postCommunication).mockReturnValueOnce(new Promise(r=>{resolve=r}));
  show(message());
  fireEvent.click(screen.getByRole('button',{name:WA}));
  expect(open).toHaveBeenCalledWith('about:blank','_blank');expect(tab.opener).toBeNull();
  await waitFor(()=>expect(vi.mocked(postCommunication).mock.calls[0]?.[0]).toEqual({action:'dispatch',id:message().id,revision:4,confirm:true}));
  resolve({message:message({status:'whatsapp_opened'}),url:'https://wa.me/5493442000002?text=Hola'});
  await waitFor(()=>expect(tab.location.href).toBe('https://wa.me/5493442000002?text=Hola'));
 });
 it('closes with a toast once WhatsApp opened',async()=>{
  const tab=popup();vi.spyOn(window,'open').mockReturnValue(tab as unknown as Window);
  vi.mocked(postCommunication).mockResolvedValueOnce({message:message({status:'whatsapp_opened'}),url:'https://wa.me/5493442000002?text=Hola'});
  const onOpened=vi.fn();show(message(),{onOpened});
  fireEvent.click(screen.getByRole('button',{name:WA}));
  await waitFor(()=>expect(onOpened).toHaveBeenCalledTimes(1));
  expect(toast.success).toHaveBeenCalledWith('WhatsApp abierto para Ana · +54 9 3442000002. Si el script registra el envío, se confirma solo; si no, lo vas a ver en «Requiere acción».',expect.anything());
 });
 it('stays open with the link when the popup was blocked',async()=>{
  vi.spyOn(window,'open').mockReturnValue(null);
  vi.mocked(postCommunication).mockResolvedValueOnce({message:message({status:'whatsapp_opened'}),url:'https://wa.me/5493442000002?text=Hola'});
  const onOpened=vi.fn();show(message(),{onOpened});
  fireEvent.click(screen.getByRole('button',{name:WA}));
  expect(await screen.findByRole('link',{name:'Abrir el mismo intento en WhatsApp'})).toBeTruthy();
  expect(onOpened).not.toHaveBeenCalled();
 });
 it('closes with a toast when Brevo accepted the email and stays open when it rejected it or the result is uncertain',async()=>{
  vi.mocked(postCommunication).mockResolvedValueOnce({message:email({status:'accepted'})});
  const onOpened=vi.fn();show(email(),{onOpened});
  fireEvent.click(screen.getByRole('button',{name:'Enviar email a ana@example.com'}));
  await waitFor(()=>expect(onOpened).toHaveBeenCalledTimes(1));
  expect(toast.success).toHaveBeenCalledWith('Email enviado a ana@example.com. La entrega se confirma por separado.',expect.anything());
  cleanup();onOpened.mockClear();
  vi.mocked(postCommunication).mockResolvedValueOnce({message:email({status:'failed'}),error:'Brevo rechazó el envío'});
  show(email(),{onOpened});fireEvent.click(screen.getByRole('button',{name:'Enviar email a ana@example.com'}));
  await waitFor(()=>expect(postCommunication).toHaveBeenCalledTimes(2));
  cleanup();
  vi.mocked(postCommunication).mockRejectedValueOnce(new Error('Resultado incierto. No se reenvía este mensaje: revisar los logs y eventos de Brevo.'));
  show(email(),{onOpened});fireEvent.click(screen.getByRole('button',{name:'Enviar email a ana@example.com'}));
  expect(await screen.findByText(/Resultado incierto/)).toBeTruthy();
  expect(onOpened).not.toHaveBeenCalled();expect(postCommunication).toHaveBeenCalledTimes(3);
 });
 it('keeps the final button off with the parent block reason',()=>{
  show(message(),{blockReason:'Completá la aclaración del propósito.'});
  const button=screen.getByRole('button',{name:WA}) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
 });
});

describe('MessageComposer · user script gate (spec 96 §3.3)',()=>{
 it('blocks WhatsApp on a computer without the script, with the reason and the way out',()=>{
  for(const name of [INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE])html().removeAttribute(name);html().setAttribute(INSTALLED_ATTRIBUTE,'1.4.0');
  const open=vi.spyOn(window,'open');show(message());
  const button=screen.getByRole('button',{name:WA}) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(screen.getByText(/Actualizá el script \(tenés 1\.4\.0, la actual es 1\.5\.0\)\./)).toBeTruthy();
  expect(screen.getByRole('link',{name:'Ir a User script'}).getAttribute('href')).toBe('/userscript');
  fireEvent.click(button);expect(open).not.toHaveBeenCalled();expect(postCommunication).not.toHaveBeenCalled();
 });
 it('blocks a token of another account and offers «Verificar de nuevo» when it cannot verify',()=>{
  html().setAttribute(CONNECTION_ATTRIBUTE,'unknown');html().removeAttribute(USER_ATTRIBUTE);
  show(message());
  expect((screen.getByRole('button',{name:WA}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/No pudimos verificar el script con el CRM\./)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Verificar de nuevo'})).toBeTruthy();
 });
 it('never gates email or a phone',()=>{
  for(const name of [INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE])html().removeAttribute(name);
  show(email());
  expect((screen.getByRole('button',{name:'Enviar email a ana@example.com'}) as HTMLButtonElement).disabled).toBe(false);
  cleanup();coarse=true;show(message());
  expect((screen.getByRole('button',{name:WA}) as HTMLButtonElement).disabled).toBe(false);
 });
});
