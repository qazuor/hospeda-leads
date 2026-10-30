import type {CommunicationDetail,InboundMessage} from '../../endpoints/communication.schema';
import type {CommercialDetail} from '../../endpoints/commercial.schema';

/** Everything the «Comunicación» sections share: loaded data and the client mirror of the permissions (the server checks again). */
export type CommunicationView={
 readonly data:CommunicationDetail;
 readonly detail:CommercialDetail|undefined;
 readonly admin:boolean;
 readonly userEmail:string;
 readonly readOnly:boolean;
 /** Admin, or owner of the management (management view) / business (business view). */
 readonly canWrite:boolean;
 /** Decision 1C: an archived business is read-only for every seller, so recording or correcting a response stays with the admin. */
 readonly archivedReadOnly:boolean;
 /** Decision D1: the same rule the server applies to «Pidió no ser contactado». */
 readonly canRecordDnc:boolean;
 readonly openResponse:(inbound:InboundMessage|null)=>void;
 /** Loaded status of a sent message, so an uncertain inbound reply can settle. */
 readonly replyStatus:(messageId:string)=>string|undefined;
};
/** Shown on a button disabled while its request runs. */
export const BUSY_REASON='La operación está en curso. Esperá a que termine para continuar.';
/** Channels a business view can preset when opening «Contactar». */
export type ContactChannel='email'|'whatsapp'|'instagram'|'call';
/** What «Responder» (spec 91 §10) can preset besides the channel: the recipient ('' is the business own channel). */
export type ContactOptions={readonly contactId?:string};
