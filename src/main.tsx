import React from "react";
import ReactDOM from "react-dom/client";
import "./base.css";

function MigrationApp() {
  return (
    <main className="migration-shell">
      <section className="migration-card">
        <div className="migration-eyebrow">HOSPEDA</div>
        <h1>Hospeda Leads</h1>
        <p>La migración desde Floot está en curso. El scaffold independiente ya funciona.</p>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MigrationApp />
  </React.StrictMode>,
);
