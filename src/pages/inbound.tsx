import {InboundUnmatchedPanel} from '../components/InboundUnmatchedPanel';
import styles from './trash.module.css';
export default function InboundPage(){return <><main className={styles.shell}><header className={styles.pageHeader}><div><div className={styles.eyebrow}>ADMINISTRACIÓN</div><h1>Mensajes sin asociar</h1></div></header><InboundUnmatchedPanel/></main></>}
