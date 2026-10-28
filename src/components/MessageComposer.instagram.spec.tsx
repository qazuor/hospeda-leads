import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MessageComposer} from './MessageComposer';
import {INSTAGRAM_DISPATCH_FAILED,handOffToUserscript,instagramOpenedToast,openInstagramForPaste,userscriptPastesOnInstagram} from './InstagramOpenChat';
import {HANDOFF_ACK_ATTRIBUTE,HANDOFF_EVENT} from '../../userscript/src/instagram/handoff';
import {INSTALLED_ATTRIBUTE} from '../../userscript/src/announce';
import {postCommunication,type PreparedMessage} from '../endpoints/communication.schema';
import {toast} from 'sonner';

vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),info:vi.fn(),warning:vi.fn()},default:vi.fn()}));
vi.mock('./RichTemplateEditor',()=>({RichTemplateEditor:({ariaLabel,channel}:{ariaLabel:string;channel:string})=><textarea aria-label={ariaLabel} data-channel={channel}/>}));
vi.mock('../endpoints/communication.schema',async original=>({...(await original<typeof import('../endpoints/communication.schema')>()),postCommunication:vi.fn()}));

let coarse=false;
/** Stand-in for the user script on this CRM page: parses the JSON string handoff and acks it with its nonce, like `instagramBridge.ts`. */
let stopScript=()=>{};
function fakeScript(){const handed:Record<string,unknown>[]=[];const listener=(event:Event)=>{const value=JSON.parse((event as CustomEvent<string>).detail);handed.push(value);document.documentElement.setAttribute(HANDOFF_ACK_ATTRIBUTE,value.nonce);};document.addEventListener(HANDOFF_EVENT,listener);stopScript=()=>document.removeEventListener(HANDOFF_EVENT,listener);return handed;}
beforeAll(()=>{window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};});
beforeEach(()=>{
 coarse=false;
 window.matchMedia=((query:string)=>({matches:query.includes('coarse')?coarse:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.restoreAllMocks();document.documentElement.removeAttribute(INSTALLED_ATTRIBUTE);document.documentElement.removeAttribute(HANDOFF_ACK_ATTRIBUTE);stopScript();});

const URL_IG='https://ig.me/m/hotel.sol',URL_PROFILE='https://www.instagram.com/hotel.sol/';// no user script here: no spec 94 marker
const message=(over:Partial<PreparedMessage>={}):PreparedMessage=>({id:'11111111-1111-4111-8111-111111111111',accountId:'5',leadId:null,contactId:null,channel:'social',destinationDetail:'instagram',recipient:'@hotel.sol',recipientName:'Hotel Sol',subject:'',body:'Hola *Sol*, ¿cómo están?',htmlBody:null,textBody:'Hola *Sol*, ¿cómo están?',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'draft',revision:4,lastInteractionAt:null,lastActorEmail:null,createdAt:new Date('2026-10-27T15:30:00Z'),updatedAt:new Date('2026-10-27T15:30:00Z'),purpose:'first_contact',otherPurpose:null,...over});
const show=(initial:PreparedMessage,props:Partial<React.ComponentProps<typeof MessageComposer>>={})=>render(<MantineProvider><QueryClientProvider client={new QueryClient()}><MessageComposer initial={initial} {...props}/></QueryClientProvider></MantineProvider>);
const clipboard=(impl:()=>Promise<void>)=>{const writeText=vi.fn(impl);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});return writeText;};
/** Saves the draft (mocked `edit`) and ticks «Revisé destinatario y contenido final». */
async function review(initial=message()){
 vi.mocked(postCommunication).mockResolvedValueOnce({...initial,revision:5});
 show(initial);
 fireEvent.click(screen.getByRole('button',{name:/Guardar y ver contenido final/}));
 const check=await screen.findByRole('checkbox',{name:'Revisé destinatario y contenido final'});
 fireEvent.click(check);
 return screen.getByRole('button',{name:'Abrir Instagram'});
}
const opened=(over:Partial<PreparedMessage>={})=>message({status:'instagram_opened',revision:6,lastInteractionAt:new Date(),...over});

describe('MessageComposer · Instagram (spec 92)',()=>{
 it('uses the plain editor, names the business username and hides the sales material',async()=>{
  show(message());
  expect(screen.getByText(/Instagram para/).textContent).toContain('Hotel Sol');
  expect(screen.getByText('@hotel.sol')).toBeTruthy();
  expect((await screen.findByLabelText('Mensaje final')).getAttribute('data-channel')).toBe('instagram');
  expect(screen.queryByText('Material de venta')).toBeNull();
 });
 it('shows the review notices and the help text, including the inactive-integration and shared-username warnings',async()=>{
  vi.mocked(postCommunication).mockResolvedValueOnce({...message(),revision:5});
  show(message({instagramAutoConfirm:false,instagramShared:true}));
  fireEvent.click(screen.getByRole('button',{name:/Guardar y ver contenido final/}));
  const notices=await screen.findByRole('group',{name:'Antes de abrir Instagram'});
  expect(notices.textContent).toContain('en el celular, el chat de @hotel.sol; en la computadora, el perfil de @hotel.sol, donde tocás «Enviar mensaje».');
  expect(notices.textContent).toContain('Tenés que estar con la sesión de Hospeda en Instagram');
  expect(notices.textContent).toContain('La conexión con Instagram no está activa');
  expect(notices.textContent).toContain('Otro negocio tiene el mismo usuario de Instagram');
  expect(screen.getByText(/Instagram no permite cargar el texto en el chat: lo pegás vos/)).toBeTruthy();
  // The saved text is shown literally: Instagram has no markup.
  expect(screen.getByLabelText('Texto que se copia').textContent).toBe('Hola *Sol*, ¿cómo están?');
 });
 it('copies and pre-opens the tab in the same click, then points it at the profile on a computer (ig.me does not work on Instagram Web)',async()=>{
  const writeText=clipboard(()=>Promise.resolve());const popup={opener:{},closed:false,location:{href:'about:blank'},close:vi.fn()};
  const open=vi.spyOn(window,'open').mockReturnValue(popup as unknown as Window);
  const button=await review();
  let resolve!:(v:unknown)=>void;vi.mocked(postCommunication).mockReturnValueOnce(new Promise(r=>{resolve=r}));
  fireEvent.click(button);
  // Inside the gesture, before the request resolves.
  expect(writeText).toHaveBeenCalledWith('Hola *Sol*, ¿cómo están?');
  expect(open).toHaveBeenCalledWith('about:blank','_blank');expect(popup.opener).toBeNull();
  await waitFor(()=>expect(vi.mocked(postCommunication).mock.lastCall?.[0]).toEqual({action:'dispatch',id:message().id,revision:5,confirm:true}));
  expect(screen.getAllByText('Abriendo Instagram…').length).toBeGreaterThan(0);
  resolve({message:opened(),username:'hotel.sol'});
  await waitFor(()=>expect(popup.location.href).toBe(URL_PROFILE));
  await waitFor(()=>expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Mensaje copiado\. En el perfil tocá «Enviar mensaje» y pegalo \((Ctrl|⌘)\+?V\)\. Con el user script de Hospeda se pega solo\.$/),expect.anything()));
  expect(await screen.findByText('Esperando que Instagram confirme el envío…')).toBeTruthy();
 });
 it('blocks a double click: one copy, one tab, one request',async()=>{
  clipboard(()=>Promise.resolve());const open=vi.spyOn(window,'open').mockReturnValue({opener:{},closed:false,location:{href:''},close:vi.fn()} as unknown as Window);
  const button=await review();vi.mocked(postCommunication).mockClear();
  vi.mocked(postCommunication).mockReturnValueOnce(new Promise(()=>{}));
  fireEvent.click(button);fireEvent.click(button);
  await waitFor(()=>expect(postCommunication).toHaveBeenCalledTimes(1));
  await new Promise(r=>setTimeout(r,20));
  expect(postCommunication).toHaveBeenCalledTimes(1);expect(open).toHaveBeenCalledTimes(1);
 });
 it('keeps «Abrir Instagram» off while the editor has unsaved changes',()=>{
  show(message());
  // Still editing: the review step (and its button) is hidden until the text is saved.
  const button=screen.queryByRole('button',{name:'Abrir Instagram'});
  expect(!button||(button as HTMLButtonElement).disabled||button.closest('[hidden]')).toBeTruthy();
 });
 it('falls back to the copy box with «Copiar» when the clipboard is denied',async()=>{
  clipboard(()=>Promise.reject(new Error('denied')));Object.defineProperty(document,'execCommand',{configurable:true,value:vi.fn().mockReturnValue(false)});
  vi.spyOn(window,'open').mockReturnValue({opener:{},closed:false,location:{href:''},close:vi.fn()} as unknown as Window);
  const button=await review();vi.mocked(postCommunication).mockResolvedValueOnce({message:opened(),username:'hotel.sol'});
  fireEvent.click(button);
  const box=await screen.findByRole('group',{name:'Copiar el mensaje'});
  expect(box.textContent).toContain('No pudimos copiar el mensaje. Copialo desde acá:');
  expect((within(box).getByLabelText('Mensaje para copiar') as HTMLTextAreaElement).value).toBe('Hola *Sol*, ¿cómo están?');
  expect(within(box).getByRole('button',{name:'Copiar'})).toBeTruthy();
  await waitFor(()=>expect(toast.warning).toHaveBeenCalledWith('Perfil de Instagram abierto. Copiá el mensaje desde el CRM, tocá «Enviar mensaje» y pegalo.'));
 });
 it('shows the chat link when the popup was blocked; the attempt is still recorded',async()=>{
  clipboard(()=>Promise.resolve());vi.spyOn(window,'open').mockReturnValue(null);
  const button=await review();vi.mocked(postCommunication).mockResolvedValueOnce({message:opened(),username:'hotel.sol'});
  fireEvent.click(button);
  const link=await screen.findByRole('link',{name:'Abrir el perfil de @hotel.sol en Instagram'});
  expect(link.getAttribute('href')).toBe(URL_PROFILE);
  expect(screen.getByText(/No se pudo abrir Instagram automáticamente. El intento quedó guardado como no confirmado./)).toBeTruthy();
 });
 it('on a phone opens no tab and ends in the «Ir al chat» link-button',async()=>{
  coarse=true;clipboard(()=>Promise.resolve());const open=vi.spyOn(window,'open');
  const button=await review();vi.mocked(postCommunication).mockResolvedValueOnce({message:opened(),username:'hotel.sol'});
  fireEvent.click(button);
  const link=await screen.findByRole('link',{name:'Ir al chat de @hotel.sol en Instagram'});
  expect(link.getAttribute('href')).toBe(URL_IG);expect(link.getAttribute('target')).toBe('_blank');
  expect(open).not.toHaveBeenCalled();
  await waitFor(()=>expect(toast.success).toHaveBeenCalledWith('Mensaje copiado: en el chat mantené apretado y elegí Pegar',expect.anything()));
 });
 it('closes the pre-opened tab and keeps the text when the server refuses',async()=>{
  clipboard(()=>Promise.resolve());const popup={opener:{},closed:false,location:{href:''},close:vi.fn()};vi.spyOn(window,'open').mockReturnValue(popup as unknown as Window);
  const button=await review();vi.mocked(postCommunication).mockRejectedValueOnce(new Error('Cambió el Instagram del negocio. Prepará un nuevo borrador.'));
  fireEvent.click(button);
  expect((await screen.findAllByText('Cambió el Instagram del negocio. Prepará un nuevo borrador.')).length).toBeGreaterThan(0);
  expect(popup.close).toHaveBeenCalled();
  // L9: the closed tab is explained, with the way back.
  await waitFor(()=>expect(toast.warning).toHaveBeenCalledWith(INSTAGRAM_DISPATCH_FAILED));
  expect(screen.getByLabelText('Texto que se copia').textContent).toBe('Hola *Sol*, ¿cómo están?');
 });
 it('copies synchronously (execCommand) before window.open takes the focus (M3)',async()=>{
  const order:string[]=[];
  Object.defineProperty(document,'execCommand',{configurable:true,value:vi.fn((command:string)=>{order.push('execCommand:'+command);return true;})});
  clipboard(()=>{order.push('writeText');return Promise.reject(new Error('Document is not focused'));});
  vi.spyOn(window,'open').mockImplementation(()=>{order.push('open');return {opener:{},closed:false,location:{href:''},close:vi.fn()} as unknown as Window;});
  const button=await review();vi.mocked(postCommunication).mockResolvedValueOnce({message:opened(),username:'hotel.sol'});
  fireEvent.click(button);
  expect(order.indexOf('execCommand:copy')).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('execCommand:copy')).toBeLessThan(order.indexOf('open'));
  // The async clipboard rejected (focus moved), yet the copy counts: no «Copialo desde acá» box.
  await waitFor(()=>expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Mensaje copiado/),expect.anything()));
  expect(screen.queryByRole('group',{name:'Copiar el mensaje'})).toBeNull();
  Object.defineProperty(document,'execCommand',{configurable:true,value:undefined});
 });
 it('says it is already sent when the echo arrived first, and opens nothing',async()=>{
  clipboard(()=>Promise.resolve());const popup={opener:{},closed:false,location:{href:''},close:vi.fn()};vi.spyOn(window,'open').mockReturnValue(popup as unknown as Window);
  const button=await review();vi.mocked(postCommunication).mockResolvedValueOnce({message:message({status:'manual_sent',externalId:'mid.1'}),alreadyConfirmed:true});
  fireEvent.click(button);
  expect(await screen.findByText('Ya está enviado: Instagram confirmó este mensaje.')).toBeTruthy();
  expect(popup.close).toHaveBeenCalled();expect(popup.location.href).toBe('');
 });
 it('«Copiar y abrir de nuevo» copies and opens the same chat without any request',async()=>{
  const writeText=clipboard(()=>Promise.resolve());const tab={opener:{},location:{href:'about:blank'}};const open=vi.spyOn(window,'open').mockReturnValue(tab as unknown as Window);
  show(opened());
  fireEvent.click(screen.getByRole('button',{name:'Copiar y abrir de nuevo'}));
  // The copy and the blank tab happen inside the click; without the user script the tab gets the plain profile.
  expect(writeText).toHaveBeenCalledWith('Hola *Sol*, ¿cómo están?');expect(open).toHaveBeenCalledWith('about:blank','_blank');
  await waitFor(()=>expect(tab.location.href).toBe(URL_PROFILE));
  await waitFor(()=>expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/^Mensaje copiado\. En el perfil tocá «Enviar mensaje»/)));
  expect(postCommunication).not.toHaveBeenCalled();
 });
 it('waits for the echo for 15 minutes, then asks «¿Lo enviaste?»; the answers stay available meanwhile',async()=>{
  show(opened());
  expect(screen.getByText('Esperando que Instagram confirme el envío…')).toBeTruthy();
  expect(screen.queryByText('¿Lo enviaste?')).toBeNull();
  expect(screen.getByRole('button',{name:'Sí, se envió'})).toBeTruthy();
  cleanup();
  show(opened({lastInteractionAt:new Date(Date.now()-16*60_000)}));
  expect(screen.queryByText('Esperando que Instagram confirme el envío…')).toBeNull();
  expect(screen.getByText('¿Lo enviaste?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'No se envió'}));
  await waitFor(()=>expect(vi.mocked(postCommunication).mock.lastCall?.[0]).toEqual({action:'outcome',id:message().id,event:'manual_not_sent',notes:''}));
 });
});

describe('«Abrir Instagram» toast and the user script (spec 94)',()=>{
 it('detects a script version that pastes on Instagram from the attribute it announces on the CRM page',()=>{
  expect(userscriptPastesOnInstagram()).toBe(false);
  for(const [version,pastes] of [['1.3.0',false],['1.4.0',true],['1.10.2',true],['garbage',false]] as const){document.documentElement.setAttribute(INSTALLED_ATTRIBUTE,version);expect(userscriptPastesOnInstagram(),version).toBe(pastes);}
 });
 it('says the script pastes when it is installed, and offers it otherwise; phone and copy failures keep their texts',()=>{
  expect(instagramOpenedToast({copied:true,mobile:false,scriptPastes:true})).toMatch(/^Mensaje copiado\. Si el script está activo en Instagram, abre el chat y pega el mensaje; si no, pegalo con (Ctrl\+V|⌘V)\.$/);
  expect(instagramOpenedToast({copied:true,mobile:false,scriptPastes:false})).toMatch(/Con el user script de Hospeda se pega solo\.$/);
  expect(instagramOpenedToast({copied:true,mobile:true,scriptPastes:true})).toBe('Mensaje copiado: en el chat mantené apretado y elegí Pegar');
  expect(instagramOpenedToast({copied:false,mobile:false,scriptPastes:true})).toMatch(/^Perfil de Instagram abierto\. Copiá el mensaje desde el CRM/);
 });
 it('hands the text with a one-time nonce to the user script and resolves only when it acks',async()=>{
  const dispatched=vi.fn();document.addEventListener(HANDOFF_EVENT,dispatched);
  expect(await handOffToUserscript({username:'@hotel.sol',text:'Hola'})).toBeNull();
  document.documentElement.setAttribute(INSTALLED_ATTRIBUTE,'1.3.0');expect(await handOffToUserscript({username:'@hotel.sol',text:'Hola'})).toBeNull();
  document.documentElement.setAttribute(INSTALLED_ATTRIBUTE,'1.4.0');
  expect(await handOffToUserscript({username:'Hotel Sol',text:'Hola'})).toBeNull();
  expect(await handOffToUserscript({username:'@hotel.sol',text:'a'.repeat(4001)})).toBeNull();// over the cap: plain profile, manual paste
  expect(dispatched).not.toHaveBeenCalled();
  // A script that does not ack (missing bridge, old build, sandbox issue): no promise of an automatic paste.
  expect(await handOffToUserscript({username:'@hotel.sol',text:'Hola',timeoutMs:60})).toBeNull();expect(dispatched).toHaveBeenCalledTimes(1);
  const handed=fakeScript();
  const a=await handOffToUserscript({username:'@Hotel.Sol',text:'Hola, ¿cómo están?'}),b=await handOffToUserscript({username:'@hotel.sol',text:'Hola'});
  expect(a).toMatch(/^[0-9a-f]{32}$/);expect(b).not.toBe(a);
  expect(handed[0]).toEqual({nonce:a,username:'hotel.sol',expiresAt:expect.any(Number),text:'Hola, ¿cómo están?'});
  expect((handed[0].expiresAt as number)-Date.now()).toBeLessThanOrEqual(2*60_000);
  expect(typeof (dispatched.mock.calls[1][0] as CustomEvent).detail).toBe('string');// a JSON string crosses Tampermonkey's sandbox
  document.removeEventListener(HANDOFF_EVENT,dispatched);
 });
 it('treats a throw while handing off as no ack: plain profile and the manual-paste toast, never a blank tab',async()=>{
  document.documentElement.setAttribute(INSTALLED_ATTRIBUTE,'1.4.0');
  vi.spyOn(document,'dispatchEvent').mockImplementation(()=>{throw new Error('boom');});
  expect(await handOffToUserscript({username:'@hotel.sol',text:'Hola'})).toBeNull();
  const tab={opener:{},location:{href:'about:blank'}};vi.spyOn(window,'open').mockReturnValue(tab as unknown as Window);
  expect(await openInstagramForPaste({username:'@hotel.sol',text:'Hola',mobile:false})).toEqual({opened:true,scriptPastes:false});
  expect(tab.location.href).toBe(URL_PROFILE);
 });
 it('opens the profile with #hospeda=<nonce> and says the script pastes once the script acked',async()=>{
  document.documentElement.setAttribute(INSTALLED_ATTRIBUTE,'1.4.0');const handed=fakeScript();
  clipboard(()=>Promise.resolve());const popup={opener:{},closed:false,location:{href:'about:blank'},close:vi.fn()};vi.spyOn(window,'open').mockReturnValue(popup as unknown as Window);
  const button=await review();vi.mocked(postCommunication).mockResolvedValueOnce({message:opened(),username:'hotel.sol'});
  fireEvent.click(button);
  await waitFor(()=>expect(popup.location.href).toMatch(/^https:\/\/www\.instagram\.com\/hotel\.sol\/#hospeda=[0-9a-f]{32}$/));
  expect(handed).toHaveLength(1);expect(handed[0].nonce).toBe(popup.location.href.split('=')[1]);expect(handed[0].text).toBe('Hola *Sol*, ¿cómo están?');
  await waitFor(()=>expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Mensaje copiado\. Si el script está activo en Instagram, abre el chat y pega el mensaje; si no, pegalo con (Ctrl\+V|⌘V)\.$/),expect.anything()));
 });
 it('opens the plain profile and asks for a manual paste when the script does not ack',async()=>{
  document.documentElement.setAttribute(INSTALLED_ATTRIBUTE,'1.4.0');
  clipboard(()=>Promise.resolve());const popup={opener:{},closed:false,location:{href:'about:blank'},close:vi.fn()};vi.spyOn(window,'open').mockReturnValue(popup as unknown as Window);
  const button=await review();vi.mocked(postCommunication).mockResolvedValueOnce({message:opened(),username:'hotel.sol'});
  fireEvent.click(button);
  await waitFor(()=>expect(popup.location.href).toBe(URL_PROFILE),{timeout:2000});
  await waitFor(()=>expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Con el user script de Hospeda se pega solo\.$/),expect.anything()));
 });
 it('«Copiar y abrir de nuevo» hands off again with a new nonce on a computer and opens the chat link on a phone',async()=>{
  document.documentElement.setAttribute(INSTALLED_ATTRIBUTE,'1.4.0');const handed=fakeScript();
  const tab={opener:{},location:{href:'about:blank'}};const open=vi.spyOn(window,'open').mockReturnValue(tab as unknown as Window);
  expect(await openInstagramForPaste({username:'@hotel.sol',text:'Hola',mobile:false})).toEqual({opened:true,scriptPastes:true});
  expect(open).toHaveBeenCalledWith('about:blank','_blank');expect(tab.location.href).toBe(URL_PROFILE+'#hospeda='+handed[0].nonce);
  open.mockClear();
  expect(await openInstagramForPaste({username:'@hotel.sol',text:'Hola',mobile:true})).toEqual({opened:true,scriptPastes:false});
  expect(open).toHaveBeenCalledWith(URL_IG,'_blank');expect(handed).toHaveLength(1);
  open.mockReturnValue(null);expect(await openInstagramForPaste({username:'@hotel.sol',text:'Hola',mobile:false})).toEqual({opened:false,scriptPastes:false});
 });
});
