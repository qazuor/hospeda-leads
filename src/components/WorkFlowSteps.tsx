import styles from './WorkFlowSteps.module.css';
/** Orientation only: these labels never change task or sale state. */
export function WorkFlowSteps({current,blocked=false}:{current:0|1|2;blocked?:boolean}) {
 const steps=['Contactar','Registrar qué pasó',blocked?'Respetar la restricción':'Elegir cómo sigue'];
 return <ol className={styles.steps} aria-label="Recorrido de esta conversación">{steps.map((label,i)=><li key={i} aria-current={current===i?'step':undefined}><span aria-hidden="true">{i+1}</span>{label}</li>)}</ol>;
}
