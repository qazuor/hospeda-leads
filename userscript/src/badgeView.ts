import type {Badge} from './badges';
import {parseCode} from './parse';
import type {ChatRow} from './badgeRows';
import {BADGE_CSS,badgeTone,buildBadgeCard,buildPill,placeCard,type BadgeCardData} from './badgeCard';
const hosts=new WeakMap<HTMLElement,HTMLElement>();

/** Short pill text: the color carries the state, the side card carries the rest. */
export function compactBadgeText(b:Badge):string{if(b.kind==='none'||b.kind==='hidden')return 'Sin CRM';if(b.kind==='multiple')return `${b.businesses?.length||2} negocios`;return b.code||'CRM';}
export function badgeText(b:Badge,chatTitle=''):string{if(b.kind==='none'||b.kind==='hidden')return 'Sin asociar al CRM';if(b.kind==='multiple')return `${b.businesses?.length||2} negocios posibles`;if(b.doNotContact||b.restricted)return `${b.code} · No contactar`;const mgmt=b.openManagement,showCode=!parseCode(chatTitle)||parseCode(chatTitle)!==b.code;return mgmt?`${showCode?`${b.code} · `:''}${mgmt.stageLabel} · ${b.assignedUserName||'Sin responsable'}`:`${b.code} · ${b.statusLabel||'Revisado'} · sin gestión`;}
/** The shared hover card's data for a WhatsApp badge (the last WhatsApp line is WhatsApp-only). */
export function cardData(b:Badge):BadgeCardData{if(b.kind==='multiple')return {kind:'multiple',businesses:b.businesses||[]};if(b.kind!=='single')return {kind:'none'};return {kind:'single',accountId:b.accountId,code:b.code||'CRM',name:b.name||'',city:b.city??null,statusLabel:b.statusLabel??null,assignedUserName:b.assignedUserName??null,blocked:!!(b.doNotContact||b.restricted),openManagement:b.openManagement??null,lastWhatsapp:b.lastWhatsappAt?`${new Date(b.lastWhatsappAt).toLocaleString('es-AR')}${b.lastWhatsappAutomatic?' (automático)':''}`:null};}
export function drawBadge(base:string,item:ChatRow,badge:Badge,onHost:(host:HTMLElement)=>void):void{
 const fingerprint=JSON.stringify(badge),old=hosts.get(item.row);if(old?.dataset.chatKey===item.key&&old.dataset.fingerprint===fingerprint){placeBadge(old,item.row);return;}old?.remove();if(badge.kind==='hidden'){hosts.delete(item.row);return;}
 const host=document.createElement('span');host.dataset.hospedaBadgeHost='1';host.dataset.chatKey=item.key;host.dataset.fingerprint=fingerprint;host.addEventListener('click',event=>event.stopPropagation());host.addEventListener('mousedown',event=>event.stopPropagation());placeBadge(host,item.row);
 const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),data=cardData(badge),pill=buildPill({doc:document,tone:badgeTone(data),text:compactBadgeText(badge)}),card=buildBadgeCard({doc:document,base,data});
 style.textContent=`:host{all:initial;display:block;overflow:visible;margin:0;position:fixed;z-index:2147483000;font:11px/20px system-ui;pointer-events:auto}${BADGE_CSS}`;
 pill.setAttribute('aria-label',badgeText(badge,item.title));const show=()=>placeCard({card,anchor:pill.getBoundingClientRect(),view:window});host.addEventListener('mouseenter',show);host.addEventListener('focusin',show);
 host.className=document.body.classList.contains('dark')?'dark':'';host.tabIndex=0;shadow.append(style,pill,card);onHost(host);hosts.set(item.row,host);(document.getElementById('hospeda-badge-layer')||createLayer()).append(host);
}
function createLayer():HTMLElement{const layer=document.createElement('div');layer.id='hospeda-badge-layer';layer.style.cssText='position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:visible';document.body.append(layer);return layer;}

const TIME=/^(\d{1,2}:\d{2}(\s?[ap]\.?\s?m\.?)?|ayer|yesterday|\d{1,2}\/\d{1,2}\/\d{2,4}|lunes|martes|miércoles|jueves|viernes|sábado|domingo)$/i;
/** Places the badge on the row's first line, right-aligned just left of WhatsApp's time, so it never covers the name's start. */
export function placeBadge(host:HTMLElement,row:HTMLElement):void{
 const rect=row.getBoundingClientRect();
 const time=[...row.querySelectorAll<HTMLElement>('span,div')].find(node=>!node.children.length&&TIME.test((node.textContent||'').trim()));
 const timeRect=time?.getBoundingClientRect(),anchor=timeRect&&timeRect.width?timeRect.left-8:rect.right-72;
 const top=timeRect&&timeRect.height?timeRect.top+(timeRect.height-20)/2:rect.top+12;
 host.style.left='auto';host.style.right=`${Math.max(0,window.innerWidth-anchor)}px`;host.style.top=`${Math.max(0,top)}px`;
}
