import {managementStageByKey,managementStageCatalog,managementLabel,type ManagementType} from '../helpers/businessManagement';
import styles from './StageStepper.module.css';

/** Compact, non-interactive progress display for a management stage. */
export function StageStepper({stage,type}:{stage:string|null|undefined;type:ManagementType|null|undefined}){
 const current=stage?managementStageByKey(stage):undefined;
 // Copy before sorting: the catalog array is shared module state.
 const catalog=type?[...managementStageCatalog(type)].sort((a,b)=>a.order-b.order):[];
 const won=catalog.find(item=>item.classification==='won');
 const hasLaterOpen=!!won&&catalog.some(item=>item.classification==='open'&&item.order>won.order);
 const path=won?(hasLaterOpen&&current&&current.order>won.order?catalog.filter(item=>item.classification==='open'&&item.order>won.order&&!item.key.endsWith(':leandro')):catalog.filter(item=>item.classification==='open'&&item.order<won.order&&!item.key.endsWith(':leandro'))):catalog.filter(item=>item.classification==='open'&&!item.key.endsWith(':leandro'));
 if(!type||!current||current.key.endsWith(':leandro')||current.classification!=='open'||!path.length||!path.some(item=>item.key===current.key)){
  const label=current?.label??managementLabel(type,stage);
  const closed=current?.classification;
  return <span className={styles.closed} data-tone={closed==='won'?'green':closed==='lost'?'red':'slate'}>Etapa: {label}</span>;
 }
 const index=path.findIndex(item=>item.key===current.key);
 return <span className={styles.stepper} role="img" aria-label={`Etapa ${index+1} de ${path.length}: ${current.label}`} data-tone="blue">
  {path.map((item,i)=><span key={item.key} className={i<=index?styles.past:styles.future} data-current={i===index||undefined} title={item.label}/>)}
  <strong>Etapa: {current.label}</strong>
 </span>;
}
