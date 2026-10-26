import {z} from 'zod';
import {apiJson} from '../helpers/apiClient';

const id=z.string().regex(/^[1-9]\d*$/),channel=z.enum(['email','whatsapp','call','social','other']),page={cursor:z.string().optional(),limit:z.coerce.number().int().min(1).max(200).optional()};
export const inboxBusinessesInput=z.object({filter:z.enum(['pending','all']).default('pending'),channel:channel.optional(),scope:z.enum(['mine','all']).optional(),cursor:page.cursor,limit:z.coerce.number().int().min(1).max(100).default(40)});
export const inboxThreadsInput=z.object({accountId:id});
/** `includeVoided=1` adds voided automatic registrations to the detail; the server honors it only for an admin. */
export const inboxThreadInput=z.object({accountId:id,leadId:z.union([id,z.literal('none')]),channel,includeVoided:z.literal('1').optional(),cursor:page.cursor,limit:z.coerce.number().int().min(1).max(200).default(50)});
export const inboxSearchInput=z.object({q:z.string().trim().max(120),direction:z.enum(['in','out','all']).default('all'),channel:channel.optional(),from:z.string().date().optional(),to:z.string().date().optional(),scope:z.enum(['mine','all']).optional(),cursor:page.cursor,limit:z.coerce.number().int().min(1).max(100).default(30)});
export type InboxBusiness=z.infer<typeof inboxBusinessesInput>;
export type InboxThread=z.infer<typeof inboxThreadsInput>;
export type InboxThreadItem=z.infer<typeof inboxThreadInput>;
export type InboxSearch=z.infer<typeof inboxSearchInput>;
const query=(params:object)=>new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)]));
export const getInboxBusinesses=(params:InboxBusiness)=>apiJson('/_api/inbox/businesses?'+query(params));
export const getInboxThreads=(params:InboxThread)=>apiJson('/_api/inbox/threads?'+query(params));
export const getInboxThread=(params:InboxThreadItem)=>apiJson('/_api/inbox/thread?'+query(params));
export const searchInbox=(params:InboxSearch)=>apiJson('/_api/inbox/search?'+query(params));
