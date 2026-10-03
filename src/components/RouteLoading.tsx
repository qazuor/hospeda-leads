import {useEffect, useState} from 'react';
import {AppHeader} from './AppHeader';
import styles from './RouteLoading.module.css';

export function RouteLoading() {
  const [showNotice, setShowNotice] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowNotice(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  return <>
    <AppHeader />
    <main className={styles.shell} role="status" aria-busy="true" data-route-loading>
      <div className={showNotice ? styles.notice : styles.hidden}>
        Cargando pantalla…
      </div>
    </main>
  </>;
}
