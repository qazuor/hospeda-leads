import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {placeBadge,compactBadgeText} from './badgeView';
import {readChatRow,badgeText,ChatBadges,badgePreference,toggleBadgePreference,isArchivedView} from './badges';

describe('chat badges',()=>{
 let storage:Map<string,unknown>;
 beforeEach(()=>{document.body.replaceChildren();vi.useFakeTimers();storage=new Map();vi.stubGlobal('unsafeWindow',window);vi.stubGlobal('GM_getValue',(key:string,fallback:unknown)=>storage.has(key)?storage.get(key):fallback);vi.stubGlobal('GM_setValue',vi.fn((key:string,value:unknown)=>storage.set(key,value)));});
 afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
 const row=(title:string,key=title)=>{const node=document.createElement('div');node.dataset.testid='cell-frame-container';node.dataset.id=key;node.innerHTML=`<div data-testid="cell-frame-title"><span title="${title}">${title}</span></div>`;return node;};
 const reply=()=>{const spy=vi.fn((options:{data:string;onload:(r:unknown)=>void})=>{const chats=JSON.parse(options.data).chats as {key:string}[];options.onload({status:200,response:{results:chats.map(chat=>({key:chat.key,kind:'none'}))}});});vi.stubGlobal('GM_xmlhttpRequest',spy);return spy;};
 const host=(key:string)=>document.querySelector<HTMLElement>(`[data-hospeda-badge-host][data-chat-key="${key}"]`);
 it('shows only the code, the business count or «Sin CRM» in the pill',()=>{expect(compactBadgeText({key:'k',kind:'single',code:'H12',doNotContact:true})).toBe('H12');expect(compactBadgeText({key:'k',kind:'multiple',businesses:[{accountId:'1',code:'H1',name:'A'},{accountId:'2',code:'H2',name:'B'}]} as never)).toBe('2 negocios');expect(compactBadgeText({key:'k',kind:'none'})).toBe('Sin CRM');});
 it('anchors the badge on the right of the first line, not over the chat name',()=>{const r=document.createElement('div');r.innerHTML='<span>Ana</span><span>15:12</span>';const h=document.createElement('div');placeBadge(h,r);expect(h.style.left).toBe('auto');expect(h.style.right).not.toBe('');expect(h.style.top).not.toBe('');});
 it('pairs a row without data-id with the page row at the same position, and refuses a different chat there',()=>{
  const isolated=document.implementation.createHTMLDocument(''),page=document.implementation.createHTMLDocument('');
  const build=(d:Document,names:string[])=>{const pane=d.createElement('div');pane.id='pane-side';for(const name of names){const r=d.createElement('div');r.setAttribute('role','row');r.innerHTML=`<span title="${name}">${name}</span>`;pane.append(r);}d.body.append(pane);return [...pane.children] as HTMLElement[];};
  const mine=build(isolated,['Ana','Juan']),theirs=build(page,['Ana','Juan']);
  Object.defineProperty(theirs[1]!.querySelector('span')!,'__reactFiber$page',{enumerable:true,value:{memoizedProps:{chat:{id:{_serialized:'juan@lid'},contact:{phoneNumber:{user:'5491155556666'}}}}}});
  vi.stubGlobal('unsafeWindow',{document:page});
  expect(readChatRow(mine[1]!,isolated)).toMatchObject({key:'juan@lid',phone:'+5491155556666'});
  theirs[1]!.querySelector('span')!.textContent='Pedro';
  expect(readChatRow(mine[1]!,isolated)).toBeNull();
 });
 it('reads saved @lid contact.phoneNumber and c.us, and skips groups, official 0 and rows without identity',()=>{
  const saved=row('Ana');document.body.append(saved);Object.defineProperty(saved.querySelector('span')!,'__reactFiber$page',{enumerable:true,value:{memoizedProps:{chat:{id:{_serialized:'abc@lid'},contact:{phoneNumber:{user:'5491122233344'}}}}}});
  expect(readChatRow(saved)?.phone).toBe('+5491122233344');
  const unsaved=row('5491122233344');document.body.append(unsaved);Object.defineProperty(unsaved.querySelector('span')!,'__reactFiber$page',{enumerable:true,value:{memoizedProps:{chat:{id:{_serialized:'5491122233344@c.us'}}}}});expect(readChatRow(unsaved)?.phone).toBe('+5491122233344');
  const group=row('Grupo');document.body.append(group);Object.defineProperty(group.querySelector('span')!,'__reactFiber$page',{enumerable:true,value:{memoizedProps:{chat:{id:{_serialized:'123@g.us'}}}}});expect(readChatRow(group)).toBeNull();
  expect(readChatRow(row('0@c.us'))).toBeNull();expect(readChatRow(row('Contact without phone'))).toBeNull();
  expect(readChatRow(row('+5491122233344'))?.phone).toBe('+5491122233344');
  const archived=row('5491122233344');archived.dataset.testid='archived-chat-list';document.body.append(archived);expect(readChatRow(archived)).toBeNull();
 });
 it('uses the row own stable id for same-title chats and scopes archived detection to its header',()=>{
  const root=document.createElement('div');root.id='pane-side';root.innerHTML='<div data-testid="cell-frame-title">Archivadas</div>';const a=row('Mismo nombre · H007','chat-one'),b=row('Mismo nombre · H007','chat-two');root.append(a,b);document.body.append(root);
  Object.defineProperty(a.querySelector('span')!,'__reactFiber$one',{enumerable:true,value:{memoizedProps:{chat:{id:{_serialized:'wid-one@lid'},contact:{phoneNumber:{user:'5491111111111'}}}}}});Object.defineProperty(b.querySelector('span')!,'__reactFiber$two',{enumerable:true,value:{memoizedProps:{chat:{id:{_serialized:'wid-two@lid'},contact:{phoneNumber:{user:'5491222222222'}}}}}});
  expect(readChatRow(a)).toMatchObject({key:'wid-one@lid',phone:'+5491111111111'});expect(readChatRow(b)).toMatchObject({key:'wid-two@lid',phone:'+5491222222222'});expect(readChatRow(a)?.key).not.toBe(readChatRow(b)?.key);expect(readChatRow(a)?.phone).not.toBe(readChatRow(b)?.phone);expect(isArchivedView(root)).toBe(false);expect(readChatRow(a)).not.toBeNull();
  const archived=document.createElement('div');archived.setAttribute('aria-label','Chats archivados');expect(isArchivedView(archived)).toBe(true);
 });
 it('renders each badge state and priority',()=>{
  expect(badgeText({key:'k',kind:'single',code:'H12',openManagement:{stageLabel:'Primer contacto',typeLabel:'Partner'},assignedUserName:'Ana'})).toBe('H12 · Primer contacto · Ana');
  expect(badgeText({key:'k',kind:'single',code:'H12',openManagement:{stageLabel:'Primer contacto',typeLabel:'Partner'},assignedUserName:'Ana'},'Empresa · H12')).toBe('Primer contacto · Ana');
  expect(badgeText({key:'k',kind:'single',code:'H12',statusLabel:'Revisado'})).toBe('H12 · Revisado · sin gestión');
  expect(badgeText({key:'k',kind:'single',code:'H12',doNotContact:true,openManagement:{stageLabel:'Etapa',typeLabel:null}})).toBe('H12 · No contactar');
  expect(badgeText({key:'k',kind:'single',code:'H12',restricted:true})).toBe('H12 · No contactar');
  expect(badgeText({key:'k',kind:'multiple',businesses:[{accountId:'1',code:'H1',name:'A',statusLabel:null},{accountId:'2',code:'H2',name:'B',statusLabel:null}]})).toBe('2 negocios posibles');
  expect(badgeText({key:'k',kind:'none'})).toBe('Sin asociar al CRM');
 });
 it('debounces 600 ms, caches for five minutes, batches at fifty and redraws after invalidation',async()=>{
  const root=document.createElement('div');document.body.append(root);
  for(let i=1;i<=51;i++)root.append(row(String(5491122233000+i)));
  const requestSpy=reply();
  const controller=new ChatBadges('https://crm.test',()=> 'hcu_test');controller.start(root);
  await vi.advanceTimersByTimeAsync(599);expect(requestSpy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);expect(requestSpy).toHaveBeenCalledTimes(2);
  expect(JSON.parse(requestSpy.mock.calls[0]![0].data as string).chats).toHaveLength(50);expect(JSON.parse(requestSpy.mock.calls[1]![0].data as string).chats).toHaveLength(1);
  requestSpy.mockClear();await vi.advanceTimersByTimeAsync(299_999);expect(requestSpy).not.toHaveBeenCalled();root.append(row('5491122233001'));
  await vi.advanceTimersByTimeAsync(600);expect(requestSpy).toHaveBeenCalled();
  controller.stop();expect(root.querySelector('[data-hospeda-badge-host]')).toBeNull();
 });
 it('recycles a row without carrying the old chat badge and debounces list mutation',async()=>{
  const root=document.createElement('div'),item=row('5491122233344');root.append(item);document.body.append(root);const requestSpy=reply();
  const controller=new ChatBadges('https://crm.test',()=> 'token');controller.start(root);await vi.advanceTimersByTimeAsync(600);
  expect(host('5491122233344')?.dataset.chatKey).toBe('5491122233344');
  item.dataset.id='5491122233355';item.querySelector('span')!.setAttribute('title','5491122233355');
  await vi.advanceTimersByTimeAsync(599);expect(requestSpy).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);expect(host('5491122233344')).toBeNull();expect(host('5491122233355')?.dataset.chatKey).toBe('5491122233355');
  controller.stop();
 });
 it('Ajustes switch persists on/off, stops observation and removes badges',async()=>{
  const root=document.createElement('div'),item=row('5491122233344');root.append(item);document.body.append(root);const requestSpy=reply();
  const controller=new ChatBadges('https://crm.test',()=> 'token');controller.start(root);await vi.advanceTimersByTimeAsync(600);expect(host('5491122233344')).not.toBeNull();
  toggleBadgePreference(false,controller,root);expect(badgePreference()).toBe(false);expect(GM_setValue).toHaveBeenCalledWith('hospeda-userscript-chat-badges',false);expect(document.querySelector('[data-hospeda-badge-host]')).toBeNull();
  item.dataset.id='5491122233355';item.querySelector('span')!.setAttribute('title','5491122233355');controller.refreshChat('5491122233355',null);await vi.advanceTimersByTimeAsync(1000);expect(requestSpy).toHaveBeenCalledTimes(1);
  requestSpy.mockClear();toggleBadgePreference(true,controller,root);expect(badgePreference()).toBe(true);await vi.advanceTimersByTimeAsync(600);item.querySelector('span')!.setAttribute('title','5491122233366');await vi.advanceTimersByTimeAsync(600);expect(requestSpy).toHaveBeenCalled();
 });
 it('shadow styles use host selectors, details stay attached, and redraws when badge content changes',async()=>{
  const root=document.createElement('div'),item=row('5491122233344');root.append(item);document.body.append(root);let name='Primero';
  vi.stubGlobal('GM_xmlhttpRequest',(options:{data:string;onload:(r:unknown)=>void})=>{const chats=JSON.parse(options.data).chats as {key:string}[];options.onload({status:200,response:{results:chats.map(chat=>({key:chat.key,kind:'single',code:'H7',name,city:null,statusLabel:'Revisado'}))}});});
  const c=new ChatBadges('https://crm.test',()=> 'token');c.start(root);await vi.advanceTimersByTimeAsync(600);let badgeHost=host('5491122233344')!;expect(badgeHost.dataset.fingerprint).toContain('Primero');const css=badgeHost.shadowRoot!.querySelector('style')!.textContent!;expect(css).toContain(':host(:hover) .detail');expect(css).toContain(':host(:focus-within) .detail');expect(css).toContain(':host(.dark)');expect(css).toContain('white-space:pre-line');expect(css).not.toContain('.host:hover');name='Segundo';item.dataset.id='second';item.querySelector('span[title]')!.setAttribute('title','5491122233345');await vi.advanceTimersByTimeAsync(600);badgeHost=host('second')!;expect(badgeHost.dataset.fingerprint).toContain('Segundo');c.stop();
 });
 it('serializes scans, retries 429 with backoff, resumes, and truncates request fields',async()=>{
  const root=document.createElement('div'),item=row('Chat · H7','k'.repeat(120));item.dataset.id='k'.repeat(120);root.append(item);document.body.append(root);
  const req=vi.fn((options:{data:string;onload:(r:unknown)=>void})=>options.onload({status:429,response:{error:'slow'}}));vi.stubGlobal('GM_xmlhttpRequest',req);
  const controller=new ChatBadges('https://crm.test',()=> 'token');controller.start(root);await vi.advanceTimersByTimeAsync(600);expect(req).toHaveBeenCalledTimes(0); // invalid stable keys are skipped
  const span=item.querySelector('span[title]')!;span.setAttribute('title',`Chat · H${'7'.repeat(240)}`);item.dataset.id='k'.repeat(100);expect(readChatRow(item)?.title).toHaveLength(200);await Promise.resolve();await vi.advanceTimersByTimeAsync(600);expect(req).toHaveBeenCalledTimes(1);const sent=JSON.parse(req.mock.calls[0]![0].data).chats[0];expect(sent.key).toHaveLength(100);expect(sent.title).toHaveLength(200);await vi.advanceTimersByTimeAsync(4999);expect(req).toHaveBeenCalledTimes(1);req.mockImplementation(options=>options.onload({status:200,response:{results:[{key:sent.key,kind:'none'}]}}));await vi.advanceTimersByTimeAsync(1);expect(req).toHaveBeenCalledTimes(2);controller.stop();
 });
 it('handles 401 by stopping and not drawing, and switch-off cancels refreshChat work',async()=>{
  const root=document.createElement('div'),item=row('5491122233344');root.id='pane-side';root.append(item);document.body.append(root);const req=vi.fn((options:{onload:(r:unknown)=>void})=>options.onload({status:401,response:{error:'expired'}}));vi.stubGlobal('GM_xmlhttpRequest',req);const unauthorized=vi.fn(),controller=new ChatBadges('https://crm.test',()=> 'token',()=>{},unauthorized);controller.start(root);await vi.advanceTimersByTimeAsync(600);expect(unauthorized).toHaveBeenCalledOnce();expect(document.querySelector('[data-hospeda-badge-host]')).toBeNull();controller.refreshChat('5491122233344',null);await vi.advanceTimersByTimeAsync(1000);expect(req).toHaveBeenCalledTimes(1);
 });
 it('handles 426 through the update callback and never renders hidden results',async()=>{
  const root=document.createElement('div'),item=row('5491122233344');root.append(item);document.body.append(root);const req=vi.fn((options:{onload:(r:unknown)=>void})=>options.onload({status:426,response:{error:'update'}}));vi.stubGlobal('GM_xmlhttpRequest',req);const update=vi.fn(),c=new ChatBadges('https://crm.test',()=> 'token',()=>{},()=>{},update);c.start(root);await vi.advanceTimersByTimeAsync(600);expect(update).toHaveBeenCalledOnce();expect(document.querySelector('[data-hospeda-badge-host]')).toBeNull();c.stop();
  vi.stubGlobal('GM_xmlhttpRequest',(options:{data:string;onload:(r:unknown)=>void})=>{const key=JSON.parse(options.data).chats[0].key;options.onload({status:200,response:{results:[{key,kind:'hidden'}]}});});const hidden=new ChatBadges('https://crm.test',()=> 'token');hidden.start(root);await vi.advanceTimersByTimeAsync(600);expect(document.querySelector('[data-hospeda-badge-host]')).toBeNull();hidden.stop();
 });
 it('keeps a single scan in flight and checks recycled identity after its response',async()=>{
  const root=document.createElement('div'),item=row('5491122233344','first');root.append(item);document.body.append(root);let firstResponse:((r:unknown)=>void)|undefined;const req=vi.fn((options:{data:string;onload:(r:unknown)=>void})=>{if(req.mock.calls.length===1)firstResponse=options.onload;else options.onload({status:200,response:{results:[{key:'second',kind:'none'}]}});});vi.stubGlobal('GM_xmlhttpRequest',req);const c=new ChatBadges('https://crm.test',()=> 'token');c.start(root);await vi.advanceTimersByTimeAsync(600);expect(req).toHaveBeenCalledTimes(1);item.dataset.id='second';item.querySelector('span[title]')!.setAttribute('title','5491122233355');await vi.advanceTimersByTimeAsync(600);expect(req).toHaveBeenCalledTimes(1);firstResponse?.({status:200,response:{results:[{key:'first',kind:'single',code:'H1',name:'Old'}]}});await vi.advanceTimersByTimeAsync(0);expect(host('first')).toBeNull();expect(req).toHaveBeenCalledTimes(2);expect(host('second')).not.toBeNull();c.stop();
 });
});
