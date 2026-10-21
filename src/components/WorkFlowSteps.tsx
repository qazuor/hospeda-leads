import styles from './WorkFlowSteps.module.css';
/** Orientation only (a progress line, not tabs): these labels never change task or sale state. */
export function WorkFlowSteps({current,blocked=false}:{current:0|1|2;blocked?:boolean}) {
 const steps=['Contactar','Anotar lo que pasó',blocked?'Respetar la restricción':'Elegir cómo sigue'];
 return <p className={styles.steps}><strong>Paso {current+1} de {steps.length}</strong> · {steps[current]}</p>;
}
