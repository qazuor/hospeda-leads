import React from "react";
import { useParams, useLocation } from "react-router-dom";
import { CommercialPanel } from "../components/CommercialPanel";
import styles from "../components/Commercial.module.css";

export default function AccountsPage(){
  const {accountId}=useParams();const location=useLocation();
  // A new navigation (a toast link, a search result) remounts the panel; a tab change (spec 91 §13) carries the panel's own
  // key in the location state, so it keeps the panel mounted.
  const panelKey=(location.state as {panelKey?:string}|null)?.panelKey??location.key;
  return <><main className={styles.shell}>
    {accountId&&<CommercialPanel key={accountId+':'+panelKey} navigationKey={panelKey} accountId={accountId}/>}
  </main></>;
}
