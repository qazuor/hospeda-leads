import React from 'react';import {AppHeader} from '../components/AppHeader';import {ResourcesPanel} from '../components/ResourcesPanel';import styles from '../components/Commercial.module.css';
export default function LibraryPage(){return <><AppHeader/><main className={styles.shell}><h1>Biblioteca comercial</h1><ResourcesPanel/></main></>}
