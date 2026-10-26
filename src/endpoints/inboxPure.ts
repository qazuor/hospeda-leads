import {z} from 'zod';
import {normalizeSearchText} from '../helpers/searchText';
export const cursorShape=z.object({at:z.string().datetime(),id:z.string().min(1),kind:z.enum(['in','out','business'])}).refine(value=>value.kind==='business'?/^[1-9]\d*$/.test(value.id):/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id));
const encode=(value:string)=>btoa(unescape(encodeURIComponent(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=(value:string)=>decodeURIComponent(escape(atob(value.replace(/-/g,'+').replace(/_/g,'/'))));
export function encodeInboxCursor(value:z.infer<typeof cursorShape>):string{return encode(JSON.stringify(cursorShape.parse(value)));}
export function decodeInboxCursor(value:string|undefined){if(!value)return undefined;try{return cursorShape.parse(JSON.parse(decode(value)));}catch{throw new Error('Cursor inválido.');}}
const plain=(value:string)=>value.replace(/<[^>]*>/gu,' ').replace(/&nbsp;/giu,' ').replace(/&amp;/giu,'&').replace(/&lt;/giu,'<').replace(/&gt;/giu,'>').replace(/\s+/gu,' ').trim();
export function buildInboxSnippet(text:string,query:string,max=200):string {const source=plain(text),needle=normalizeSearchText(query.trim()),normalized=normalizeSearchText(source);const index=normalized.indexOf(needle);if(index<0)return source.slice(0,max);const start=Math.max(0,index-Math.floor((max-needle.length)/2)),end=Math.min(source.length,start+max);return (start?'…':'')+source.slice(start,end)+(end<source.length?'…':'');}
/** Escapes LIKE metacharacters (backslash first, then % and _) so a search term matches literally with ESCAPE '\'. */
export function escapeLikePattern(value:string):string{return value.replace(/[\\%_]/gu,match=>'\\'+match);}
/** Minimum search length, counted by `inboxSearchLength` on both the client and the server. */
export const INBOX_SEARCH_MIN=3;
const graphemes=new Intl.Segmenter('es',{granularity:'grapheme'});
/**
 * Visible characters of a search term: the term is trimmed like Zod's `trim()` (String#trim), then every user-perceived
 * character (grapheme cluster) that is not whitespace counts once. «a b» counts 2 and a lone emoji counts 1, so neither
 * reaches the minimum.
 */
export function inboxSearchLength(value:string):number{
 let count=0;
 for(const {segment} of graphemes.segment(value.trim()))if(!/^\s+$/u.test(segment))count++;
 return count;
}
