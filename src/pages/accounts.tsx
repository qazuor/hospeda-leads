import React from "react";
import { useParams, useLocation } from "react-router-dom";
import { CommercialPanel } from "../components/CommercialPanel";
import styles from "../components/Commercial.module.css";

export default function AccountsPage(){
  const {accountId}=useParams();const location=useLocation();
  return <><main className={styles.shell}>
    {accountId&&<CommercialPanel key={accountId+':'+location.key} accountId={accountId}/>}
  </main></>;
}
