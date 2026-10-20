import {useQueryClient} from '@tanstack/react-query';
import {InlineBusinessStatus} from './InlineBusinessStatus';
import {ValueBadge} from './ValueBadge';
import {type Account} from '../endpoints/commercial.schema';
import {businessStatusLabels,type BusinessStatus} from '../helpers/businessStatus';
import {calendarDay} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import {crmSuccess} from '../helpers/crmFeedback';
import styles from './Commercial.module.css';

/** One plain line that explains each business status to the seller. */
export const businessStatusHelp:Record<BusinessStatus,string>={
 new:'Todavía nadie revisó sus datos. Cuando los confirmes, pasalo a Revisado.',
 reviewed:'Sus datos ya están revisados. Podés iniciar una gestión cuando corresponda.',
 in_management:'Tiene una gestión abierta: el estado cambia solo al iniciar o cerrar gestiones.',
 no_follow_up_scheduled:'No tiene ninguna tarea agendada.',
 recontact:'Hay que volver a contactarlo más adelante.',
 archived:'Para volver a trabajarlo, un administrador debe desarchivarlo.'
};

/**
 * Business status on the business record: a single "Estado: X ▾ Cambiar" badge-button plus a one-line helper.
 * The optional recontact date is a reference only; saving it creates no task.
 */
export function BusinessStatusControl({account,readOnly}:{account:Account;readOnly:boolean}){
 const client=useQueryClient();
 const status=account.status??'new';
 const savedRecontactDay=calendarDay(account.recontactAt);
 const label=account.status?businessStatusLabels[account.status]:'Pendiente de migración';
 const editable=!readOnly&&!!account.status&&!['archived','in_management'].includes(account.status);
 return <section className={styles.stateCard} aria-label="Estado del negocio">
  <div>{editable?<InlineBusinessStatus labelled accountId={String(account.id)} status={status} recontactAt={account.recontactAt} onSaved={async()=>{crmSuccess('Estado del negocio actualizado');await client.invalidateQueries();}}/>:<><strong>Estado:</strong><ValueBadge category="status" value={label} nativeTooltip={false}/></>}{status==='recontact'&&savedRecontactDay&&<span className={styles.muted}>Fecha de referencia: {formatDate(savedRecontactDay)}</span>}</div>
  <p className={styles.muted}>{account.status?businessStatusHelp[account.status]:'Este negocio todavía no tiene un estado asignado.'}</p>
 </section>;
}
