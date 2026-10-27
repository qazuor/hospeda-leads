/**
 * Spec 90: one rule, everywhere, for telling Instagram from any other social network. A sent row is Instagram when the
 * Instagram webhook stored it for Hospeda's account (owner `instagram@hospeda`) or its destination names Instagram; a
 * received row is Instagram unless another `channel_detail` says otherwise (only the Instagram webhook stores social
 * inbound rows today). Anything else on `social` is «Red social». The SQL twin lives in `instagramChannelSql.ts`.
 */
export const INSTAGRAM_ECHO_OWNER='instagram@hospeda';
/** A sent `social` row is Instagram when it is Hospeda's echo or its destination names Instagram. */
export const isInstagramOutbound=(row:{channel:string;ownerEmail?:string|null;destinationDetail?:string|null}):boolean=>row.channel==='social'&&(row.ownerEmail===INSTAGRAM_ECHO_OWNER||/instagr/i.test(row.destinationDetail??''));
/** A received `social` row is Instagram unless its `channel_detail` names another network. */
export const isInstagramInbound=(row:{channel:string;channelDetail?:string|null}):boolean=>row.channel==='social'&&(row.channelDetail??'instagram')==='instagram';
/** Who sent an Instagram echo and its status line, the same in «Comunicación» and in Historial. */
export const ECHO_SENDER='Instagram de Hospeda';
export const ECHO_STATUS='Enviado desde la app de Instagram de Hospeda · registrado automáticamente';
/** «Instagram» or «Red social» for a social row, given whether it is Instagram. */
export const socialChannelLabel=(instagram:boolean):string=>instagram?'Instagram':'Red social';
