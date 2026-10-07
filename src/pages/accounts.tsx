import React from "react";
import { Link, useParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { CommercialPanel } from "../components/CommercialPanel";
import styles from "../components/Commercial.module.css";

export default function AccountsPage(){
  const {accountId}=useParams();
  return <><AppHeader/><main className={styles.shell}>
    <Link to="/accounts">← Volver al listado de negocios</Link>
    {accountId&&<CommercialPanel key={accountId} accountId={accountId}/>}
  </main></>;
}
