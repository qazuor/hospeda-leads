import {formatDateTime} from './crmDates';

/**
 * Spec 93: what Brevo told us about a sent email after the provider accepted it. Pure helpers shared by the server (terminal
 * event rule, link sanitizing) and the client (badges). Opens, clicks and spam complaints are informational only: nothing here
 * turns them into contact, reply, task completion or «Último contacto».
 */

/** Read-only aggregate of the Brevo events linked to one sent email (GET /_api/communication, `message.emailEngagement`). */
export type EmailEngagement={
 readonly deliveredAt:Date|null;
 readonly firstOpenedAt:Date|null;
 readonly openCount:number;
 /** Opens Brevo flags as proxied (`proxy_open` / `unique_proxy_open`, e.g. Apple Mail Privacy Protection). */
 readonly firstProxyOpenedAt:Date|null;
 readonly proxyOpenCount:number;
 readonly firstClickedAt:Date|null;
 readonly clickCount:number;
 /** Sanitized text (scheme + host + path), never a clickable link. */
 readonly clickedLinks:readonly string[];
 readonly spamAt:Date|null;
 readonly lastEventAt:Date|null;
};

/** Brevo transactional `event` values that settle the delivery result (verified against Brevo's webhook docs, spec 93 §2.1). */
export const EMAIL_TERMINAL_EVENTS=['delivered','hard_bounce','soft_bounce','blocked','invalid_email','error'] as const;
/** True for an event that can change the message status. Opens, clicks, spam, deferred, unsubscribed and request never do. */
export const isTerminalEmailEvent=(event:string):boolean=>(EMAIL_TERMINAL_EVENTS as readonly string[]).includes(event);

/** Same-second order: a soft bounce sorts before the delivery, any permanent failure after it. */
const rank=(event:string)=>event==='soft_bounce'?0:event==='delivered'?1:2;
/**
 * Spec 93 D4: the terminal event that decides the status. The latest one wins, except that a soft bounce (temporary, Brevo
 * retries it) never overrides a delivery, before or in the same second. A later hard bounce, block, invalid address or error
 * still wins over a delivery (asynchronous bounce).
 */
export function terminalEmailEvent<T extends {readonly event:string;readonly occurredAt:Date}>({events}:{events:readonly T[]}):T|undefined{
 const terminal=events.filter(v=>isTerminalEmailEvent(v.event)).slice().sort((a,b)=>new Date(a.occurredAt).getTime()-new Date(b.occurredAt).getTime()||rank(a.event)-rank(b.event));
 const last=terminal.at(-1);
 if(last?.event!=='soft_bounce')return last;
 return terminal.filter(v=>v.event==='delivered').at(-1)??last;
}

const MAX_LINK=80;
/**
 * A clicked URL as plain text for a tooltip: only http(s), without credentials, query string or fragment (they can carry
 * tracking tokens or personal data), at most 80 characters. Anything else is dropped.
 */
export function sanitizeEngagementLink({link}:{link:unknown}):string|null{
 if(typeof link!=='string'||link.length>2000)return null;
 let url:URL;
 try{url=new URL(link.trim())}catch{return null}
 if(url.protocol!=='http:'&&url.protocol!=='https:')return null;
 const text=(url.host+(url.pathname==='/'?'':url.pathname)).replace(/[\u0000-\u001f\u007f]/g,'');
 if(!text)return null;
 return text.length>MAX_LINK?text.slice(0,MAX_LINK-1)+'…':text;
}
/** Distinct sanitized links, at most three, in the given order. */
export const sanitizeEngagementLinks=({links}:{links:readonly unknown[]}):string[]=>[...new Set(links.map(link=>sanitizeEngagementLink({link})).filter((x):x is string=>!!x))].slice(0,3);

export const OPEN_APPROXIMATE_NOTE='Aproximado: algunos clientes de correo abren los emails automáticamente (Apple Mail) y otros bloquean las imágenes.';
export const PROXY_OPEN_NOTE='Brevo detectó una apertura hecha por un servidor intermedio (por ejemplo, la protección de privacidad de Apple Mail). Puede no haberla abierto una persona.';
export const CLICK_NO_LINK_NOTE='Brevo registró un click en un enlace del email.';
export const SPAM_NOTE='El destinatario marcó este email como spam. Conviene no volver a escribirle por email sin revisarlo.';

/** One informational badge of an email item. `warning` is the spam complaint. */
export type EngagementBadge={readonly kind:'opened'|'proxy_open'|'click'|'spam';readonly label:string;readonly tooltip:string;readonly tone:'info'|'warning'};
const counted=(label:string,at:Date|string,count:number)=>`${label} · ${formatDateTime(at)}${count>1?` · ×${count}`:''}`;
/** Badges in display order: spam first (it needs attention), then open, possible automatic open and click. */
export function emailEngagementBadges({engagement}:{engagement:EmailEngagement|null|undefined}):EngagementBadge[]{
 if(!engagement)return [];
 const badges:EngagementBadge[]=[];
 if(engagement.spamAt)badges.push({kind:'spam',label:`Marcado como spam · ${formatDateTime(engagement.spamAt)}`,tooltip:SPAM_NOTE,tone:'warning'});
 if(engagement.firstOpenedAt&&engagement.openCount>0)badges.push({kind:'opened',label:counted('Abierto',engagement.firstOpenedAt,engagement.openCount),tooltip:OPEN_APPROXIMATE_NOTE,tone:'info'});
 if(engagement.firstProxyOpenedAt&&engagement.proxyOpenCount>0)badges.push({kind:'proxy_open',label:counted('Posible apertura automática',engagement.firstProxyOpenedAt,engagement.proxyOpenCount),tooltip:PROXY_OPEN_NOTE,tone:'info'});
 if(engagement.firstClickedAt&&engagement.clickCount>0)badges.push({kind:'click',label:counted('Click en un enlace',engagement.firstClickedAt,engagement.clickCount),tooltip:engagement.clickedLinks.length?'Enlaces: '+engagement.clickedLinks.join(' · '):CLICK_NO_LINK_NOTE,tone:'info'});
 return badges;
}
/** «Entregado · <fecha hora>» for a delivered email with its first delivery time; null keeps the existing status label. */
export const emailDeliveredLabel=({status,engagement}:{status:string;engagement:EmailEngagement|null|undefined}):string|null=>status==='delivery_confirmed'&&engagement?.deliveredAt?`Entregado · ${formatDateTime(engagement.deliveredAt)}`:null;
