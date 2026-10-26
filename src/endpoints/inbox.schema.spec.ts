import {describe,expect,it} from 'vitest';
import {inboxBusinessesInput,inboxSearchInput,inboxThreadInput} from './inbox.schema';
import {buildInboxSnippet,decodeInboxCursor,encodeInboxCursor,escapeLikePattern} from './inboxPure';

describe('inbox schemas and cursor',()=>{
 it('applies list defaults and rejects excessive limits',()=>{expect(inboxBusinessesInput.parse({}).limit).toBe(40);expect(()=>inboxBusinessesInput.parse({limit:'101'})).toThrow();});
 it('validates thread and search inputs',()=>{expect(inboxThreadInput.safeParse({accountId:'4',leadId:'none',channel:'email'}).success).toBe(true);expect(inboxSearchInput.safeParse({q:'  precio  '}).success).toBe(true);});
 it('rejects malformed cursors and mismatched cursor id kinds',()=>{expect(()=>decodeInboxCursor('invalid')).toThrow('Cursor inválido.');expect(()=>encodeInboxCursor({at:new Date().toISOString(),id:'not-a-uuid',kind:'in'})).toThrow();});
 it('round trips microsecond cursors',()=>{const value={at:'2026-10-25T12:00:00.123456Z',id:'42',kind:'business' as const};expect(decodeInboxCursor(encodeInboxCursor(value))).toEqual(value);});
 it('round trips an opaque cursor and rejects malformed cursors',()=>{const value={at:'2026-10-25T12:00:00.000Z',id:'00000000-0000-4000-8000-000000000007',kind:'in' as const};expect(decodeInboxCursor(encodeInboxCursor(value))).toEqual(value);expect(()=>decodeInboxCursor('broken')).toThrow('Cursor inválido.');});
});
describe('escapeLikePattern',()=>{
 it('escapes LIKE wildcards and the escape character',()=>{expect(escapeLikePattern('10%')).toBe('10\\%');expect(escapeLikePattern('a_b')).toBe('a\\_b');expect(escapeLikePattern('a\\b')).toBe('a\\\\b');expect(escapeLikePattern('%%%')).toBe('\\%\\%\\%');});
 it('leaves plain text untouched',()=>{expect(escapeLikePattern('Précio año')).toBe('Précio año');});
});
describe('buildInboxSnippet',()=>{
 it('finds accent-insensitive matches while keeping ñ distinct',()=>{expect(buildInboxSnippet('Tenemos Précio especial','precio')).toContain('Précio');expect(buildInboxSnippet('año calendario','ano')).toBe('año calendario');});
 it('strips markup and bounds the window',()=>{expect(buildInboxSnippet('<p>'+('x'.repeat(250))+'precio</p>','precio').length).toBeLessThanOrEqual(202);expect(buildInboxSnippet('<b>precio</b>','precio')).toBe('precio');});
});
