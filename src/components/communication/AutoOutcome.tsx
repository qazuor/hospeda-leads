import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getWork} from '../../endpoints/work.schema';
import type {Message} from '../../endpoints/communication.schema';
import {outcomeLabel} from '../../helpers/crmLabels';
import {AUTO_OUTCOME_NOTE} from '../../helpers/responseOutcome';
import {WorkEditor} from '../WorkEditor';
import {Button} from '../Button';
import type {CommunicationView} from './types';
import styles from './CommunicationView.module.css';

/** Spec 96 §10.1: an outcome a registered response set is corrected by a person who can write here (the server checks it again). */
export const canFixAutoOutcome=(view:CommunicationView,message:Pick<Message,'autoOutcomeResponseId'|'activityId'>):boolean=>!!message.autoOutcomeResponseId&&!!message.activityId&&!view.readOnly&&view.canWrite;

/** «<resultado> · Resultado registrado automáticamente desde la respuesta» under a send whose outcome a response set. */
export function AutoOutcomeNote({message}:{message:Pick<Message,'autoOutcomeResponseId'|'activityOutcome'>}){
 if(!message.autoOutcomeResponseId)return null;
 return <p className={styles.note} data-auto-outcome="true">{outcomeLabel(message.activityOutcome)} · {AUTO_OUTCOME_NOTE}</p>;
}

/**
 * «Corregir cómo salió» of an automatic outcome: the same work editor used to correct a completed task's result. Saving it is
 * audited like any activity edit and removes the automatic mark.
 */
export function AutoOutcomeCorrection({view,message,onClose}:{view:CommunicationView;message:Message;onClose:()=>void}){
 const qc=useQueryClient();
 const work=useQuery({queryKey:['work','auto-outcome',message.activityId],queryFn:()=>getWork({mode:'detail',accountId:String(message.accountId),...(view.admin?{responsible:'all'}:{})}),staleTime:0,gcTime:0});
 const activity=work.data?.activities.find(a=>String(a.id)===String(message.activityId));
 if(work.isPending)return <p role="status" className={styles.note}>Cargando el resultado…</p>;
 if(work.error||!activity||!work.data)return <div role="alert" className={styles.note}>{work.error?.message??'No encontramos el resultado registrado para este envío.'} <Button size="sm" variant="ghost" onClick={onClose}>Cerrar</Button></div>;
 return <WorkEditor target={{kind:'activity',item:activity}} data={work.data} onClose={onClose} onSaved={()=>{for(const key of ['communication','work','commercial-detail'])void qc.invalidateQueries({queryKey:[key]});}}/>;
}
