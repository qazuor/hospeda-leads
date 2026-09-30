import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../helpers/useAuth";
import { User } from "../helpers/User";
import { AuthErrorPage } from "./AuthErrorPage";
import { ShieldOff } from "lucide-react";
import { AuthLoadingState } from "./AuthLoadingState";
import styles from "./ProtectedRoute.module.css";

const MakeProtectedRoute: (roles: User["role"][]) => React.FC<{children:React.ReactNode}> =
  (roles) => ({ children }) => {
    const { authState } = useAuth();
    if (authState.type === "loading") return <AuthLoadingState title="Verificando sesión" />;
    if (authState.type === "unauthenticated") return <Navigate to="/login" replace />;
    if (!roles.includes(authState.user.role)) {
      return <AuthErrorPage
        title="Acceso denegado"
        message="Tu usuario no tiene permisos para acceder a esta sección."
        icon={<ShieldOff className={styles.accessDeniedIcon} size={64} />}
      />;
    }
    return <>{children}</>;
  };

export const AdminRoute = MakeProtectedRoute(["admin"]);
export const UserRoute = MakeProtectedRoute(["user", "admin"]);