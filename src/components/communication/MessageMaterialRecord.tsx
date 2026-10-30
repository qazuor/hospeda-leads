import type {Message} from '../../endpoints/communication.schema';
import {SentMaterials,canRevokeMaterialLink} from '../MessageMaterials';
import type {CommunicationView} from './types';

/**
 * Spec 89 §8.4: the sales material included in a message and «Revocar enlace» for its author, the responsibles or an admin
 * (also under No contactar). It renders under a sent bubble and, for an opened send that is not confirmed yet (spec 92 owner
 * decision: not in «Conversación»), inside its «Requiere acción» entry, so the public link can always be revoked.
 */
export function MessageMaterialRecord({view,message}:{view:CommunicationView;message:Message}){
 if(message.status==='draft'||!message.materials?.length)return null;
 const managementOwner=message.leadId==null?null:view.detail?.opportunities.find(o=>String(o.id)===String(message.leadId))?.assignedUserEmail;
 return <SentMaterials materials={message.materials} message={message} users={view.detail?.users} canRevoke={x=>canRevokeMaterialLink({admin:view.admin,userEmail:view.userEmail,authorEmail:x.createdByEmail,businessOwnerEmail:view.detail?.account.assignedUserEmail,managementOwnerEmail:managementOwner})}/>;
}
