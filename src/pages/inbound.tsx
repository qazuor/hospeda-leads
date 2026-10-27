import {PageHeader} from '../components/PageHeader';
import {InboundUnmatchedPanel} from '../components/InboundUnmatchedPanel';
import styles from './trash.module.css';
export default function InboundPage(){return <><main className={styles.shell}><PageHeader eyebrow="ADMINISTRACIÓN" title="Mensajes sin asociar" description="Revisá los mensajes (emails e Instagram) que todavía no están asociados a un negocio o gestión." topic="inbound"/><InboundUnmatchedPanel/></main></>}
