import {z} from 'zod';
import {apiJson,postJson} from '../helpers/apiClient';

export const heartbeatSchema=z.object({}).strict();
export const onlineSchema=z.object({}).strict();
export type PresenceSource='crm'|'whatsapp'|'instagram';
export type OnlineUser={id:number;displayName:string;email:string;role:'admin'|'user';lastSeenAt:Date;sources:PresenceSource[]};
export type OnlineOutput={users:OnlineUser[];windowSeconds:120};
export const sendPresenceHeartbeat=async():Promise<void>=>{
  await postJson<{ok:true}>('/_api/presence/heartbeat',{});
};
export const getOnlineUsers=async():Promise<OnlineOutput>=>apiJson<OnlineOutput>('/_api/presence/online');
