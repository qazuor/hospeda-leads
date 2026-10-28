import {describe,expect,it} from 'vitest';
import {CLICK_NO_LINK_NOTE,engagementTime,OPEN_APPROXIMATE_NOTE,PROXY_OPEN_NOTE,SPAM_NOTE,emailDeliveredLabel,emailEngagementBadges,isTerminalEmailEvent,sanitizeEngagementLink,sanitizeEngagementLinks,terminalEmailEvent,type EmailEngagement} from './emailEngagement';

const at=(s:number)=>new Date(Date.UTC(2026,9,27,15,0,s));
const ev=(event:string,s:number)=>({event,occurredAt:at(s)});
const none:EmailEngagement={deliveredAt:null,firstOpenedAt:null,openCount:0,firstProxyOpenedAt:null,proxyOpenCount:0,firstClickedAt:null,clickCount:0,clickedLinks:[],spamAt:null,lastEventAt:null};

describe('terminalEmailEvent (spec 93 D4)',()=>{
 it('ignores informational events',()=>{
  // Arrange
  const events=[ev('delivered',1),ev('opened',5),ev('click',6),ev('spam',7),ev('deferred',8),ev('unsubscribed',9),ev('unique_opened',10),ev('proxy_open',11)];
  // Act
  const result=terminalEmailEvent({events});
  // Assert
  expect(result?.event).toBe('delivered');
  for(const e of ['opened','unique_opened','proxy_open','unique_proxy_open','click','spam','deferred','unsubscribed','request'])expect(isTerminalEmailEvent(e)).toBe(false);
 });
 it('ends delivered after a soft bounce or a deferral',()=>{
  expect(terminalEmailEvent({events:[ev('deferred',1),ev('soft_bounce',2),ev('delivered',3)]})?.event).toBe('delivered');
 });
 it('lets the delivery win a same-second tie with a soft bounce, whatever the input order',()=>{
  expect(terminalEmailEvent({events:[ev('delivered',3),ev('soft_bounce',3)]})?.event).toBe('delivered');
  expect(terminalEmailEvent({events:[ev('soft_bounce',3),ev('delivered',3)]})?.event).toBe('delivered');
 });
 it('never lets a later soft bounce override a delivery',()=>{
  expect(terminalEmailEvent({events:[ev('delivered',1),ev('soft_bounce',9)]})?.event).toBe('delivered');
 });
 it('keeps a later permanent failure over a delivery (asynchronous bounce)',()=>{
  expect(terminalEmailEvent({events:[ev('delivered',1),ev('hard_bounce',9)]})?.event).toBe('hard_bounce');
  expect(terminalEmailEvent({events:[ev('delivered',1),ev('blocked',9)]})?.event).toBe('blocked');
 });
 it('keeps a lone soft bounce as the result and returns nothing without terminal events',()=>{
  expect(terminalEmailEvent({events:[ev('soft_bounce',1)]})?.event).toBe('soft_bounce');
  expect(terminalEmailEvent({events:[ev('opened',1)]})).toBeUndefined();
 });
});

describe('sanitizeEngagementLink',()=>{
 it('keeps host and path only, as text',()=>{
  expect(sanitizeEngagementLink({link:'https://user:pw@hospeda.com.ar/planes/anual?utm=1&email=x@y.com#top'})).toBe('hospeda.com.ar/planes/anual');
  expect(sanitizeEngagementLink({link:'http://hospeda.com.ar/'})).toBe('hospeda.com.ar');
 });
 it('drops non-http schemes, garbage and non-strings',()=>{
  for(const link of ['javascript:alert(1)','mailto:a@b.com','data:text/html,x','not a url','',null,42])expect(sanitizeEngagementLink({link})).toBeNull();
 });
 it('truncates long links to 80 characters',()=>{
  const out=sanitizeEngagementLink({link:'https://hospeda.com.ar/'+'a'.repeat(200)})!;
  expect(out).toHaveLength(80);expect(out.endsWith('…')).toBe(true);
 });
 it('deduplicates and keeps at most three',()=>{
  expect(sanitizeEngagementLinks({links:['https://a.com/x?1','https://a.com/x?2','https://b.com','javascript:x','https://c.com','https://d.com']})).toEqual(['a.com/x','b.com','c.com']);
 });
});

describe('emailEngagementBadges',()=>{
 it('shows nothing without data',()=>{
  expect(emailEngagementBadges({engagement:null})).toEqual([]);
  expect(emailEngagementBadges({engagement:none})).toEqual([]);
 });
 it('shows the first open, the count only above one and the approximate note',()=>{
  // Arrange
  const one={...none,firstOpenedAt:at(1),openCount:1},two={...one,openCount:2};
  // Act
  const [single]=emailEngagementBadges({engagement:one}),[double]=emailEngagementBadges({engagement:two});
  // Assert
  expect(single).toEqual({kind:'opened',label:`Abierto · ${engagementTime(at(1))}`,tooltip:OPEN_APPROXIMATE_NOTE,tone:'info'});
  expect(double!.label).toBe(`Abierto · ${engagementTime(at(1))} · ×2`);
 });
 it('labels proxy opens apart as a possible automatic open, never as «Abierto»',()=>{
  const badges=emailEngagementBadges({engagement:{...none,firstProxyOpenedAt:at(2),proxyOpenCount:3}});
  expect(badges.map(b=>b.kind)).toEqual(['proxy_open']);
  expect(badges[0]).toMatchObject({label:`Posible apertura automática · ${engagementTime(at(2))} · ×3`,tooltip:PROXY_OPEN_NOTE});
 });
 it('lists clicked links as text in the tooltip, or a neutral note without them',()=>{
  const [withLinks]=emailEngagementBadges({engagement:{...none,firstClickedAt:at(3),clickCount:2,clickedLinks:['a.com/x','b.com']}});
  expect(withLinks).toMatchObject({kind:'click',label:`Click en un enlace · ${engagementTime(at(3))} · ×2`,tooltip:'Enlaces: a.com/x · b.com'});
  expect(emailEngagementBadges({engagement:{...none,firstClickedAt:at(3),clickCount:1}})[0]!.tooltip).toBe(CLICK_NO_LINK_NOTE);
 });
 it('puts the spam warning first, then open, possible automatic open and click',()=>{
  const badges=emailEngagementBadges({engagement:{...none,firstOpenedAt:at(1),openCount:2,firstProxyOpenedAt:at(1),proxyOpenCount:1,firstClickedAt:at(2),clickCount:1,spamAt:at(4)}});
  expect(badges.map(b=>b.kind)).toEqual(['spam','opened','proxy_open','click']);
  expect(badges[0]).toMatchObject({tone:'warning',tooltip:SPAM_NOTE,label:`Marcado como spam · ${engagementTime(at(4))}`});
 });
});

describe('emailDeliveredLabel',()=>{
 it('reads «Entregado · <fecha hora>» only for a delivered email with its delivery time',()=>{
  expect(emailDeliveredLabel({status:'delivery_confirmed',engagement:{...none,deliveredAt:at(1)}})).toBe(`Entregado · ${engagementTime(at(1))}`);
  expect(emailDeliveredLabel({status:'delivery_confirmed',engagement:none})).toBeNull();
  expect(emailDeliveredLabel({status:'failed',engagement:{...none,deliveredAt:at(1)}})).toBeNull();
  expect(emailDeliveredLabel({status:'accepted',engagement:null})).toBeNull();
 });
});
