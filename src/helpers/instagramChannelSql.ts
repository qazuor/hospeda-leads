import {sql} from 'kysely';
import {INSTAGRAM_ECHO_OWNER} from './instagramChannel';

/** SQL twin of `isInstagramOutbound` for a `crm_messages` alias. */
export const instagramOutboundSql=(alias:string)=>sql<boolean>`(${sql.ref(alias+'.channel')}='social' AND (${sql.ref(alias+'.owner_email')}=${INSTAGRAM_ECHO_OWNER} OR coalesce(${sql.ref(alias+'.destination_detail')},'') ~* 'instagr'))`;
/** SQL twin of `isInstagramInbound` for a `crm_inbound_messages` alias. */
export const instagramInboundSql=(alias:string)=>sql<boolean>`(${sql.ref(alias+'.channel')}='social' AND coalesce(${sql.ref(alias+'.channel_detail')},'instagram')='instagram')`;
