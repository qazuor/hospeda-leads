import {PageHeader} from '../components/PageHeader';
import {InboundUnmatchedPanel} from '../components/InboundUnmatchedPanel';
import styles from './trash.module.css';
export default function InboundPage(){return <><main className={styles.shell}><PageHeader eyebrow="ADMINISTRACIÓN" title="Revisión de entrantes" description="Revisá los emails que todavía no están asociados a un negocio o gestión." topic="inbound"/><InboundUnmatchedPanel/></main></>}
