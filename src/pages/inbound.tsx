import {AppHeader} from '../components/AppHeader';
import {InboundUnmatchedPanel} from '../components/InboundUnmatchedPanel';
import styles from './trash.module.css';
export default function InboundPage(){return <><AppHeader/><main className={styles.shell}><header className={styles.pageHeader}><div><div className={styles.eyebrow}>ADMINISTRACIÓN</div><h1>Emails sin asociar</h1></div></header><InboundUnmatchedPanel/></main></>}
