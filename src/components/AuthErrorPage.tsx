import React from "react";
import { AlertTriangle } from "lucide-react";
import styles from "./AuthErrorPage.module.css";

export interface AuthErrorPageProps {
  title?: string;
  message: string;
  icon?: React.ReactNode;
  className?: string;
}

export const AuthErrorPage: React.FC<AuthErrorPageProps> = ({
  title = "Error de autenticación", message, icon, className,
}) => <div className={`${styles.container} ${className || ""}`}>
  <div className={styles.card}>
    <div className={styles.iconContainer}>{icon || <AlertTriangle className={styles.icon} size={64} />}</div>
    <h1 className={styles.title}>{title}</h1>
    <p className={styles.message}>{message}</p>
  </div>
</div>;