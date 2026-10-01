import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, ChevronDown, History, ListFilter, LogOut, Moon, Settings, Sun, SunMoon, Trash2, UserCircle } from "lucide-react";
import { Button } from "./Button";
import { ProfileDialog } from "./ProfileDialog";
import { useAuth } from "../helpers/useAuth";
import { useThemeMode } from "../helpers/themeMode";
import { LiveModeSwitch } from "./LiveModeSwitch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "./DropdownMenu";
import styles from "./AppHeader.module.css";

const LOGO="/hospeda-logo.jpg";

export const AppHeader=()=>{
  const location=useLocation();
  const {authState,logout}=useAuth();
  const {mode,switchToLightMode,switchToDarkMode,switchToAutoMode}=useThemeMode();
  const isAdmin=authState.type==="authenticated"&&authState.user.role==="admin";
  const administrationActive=["/history","/trash","/settings","/templates"].some(path=>location.pathname.startsWith(path));
  const displayName=authState.type==="authenticated"?authState.user.displayName:"";
  const [profileOpen,setProfileOpen]=React.useState(false);

  return <header className={styles.header}>
    <Link to="/" className={styles.brand}><img src={LOGO} alt="Hospeda"/><div><strong>Hospeda Leads</strong><span>CRM comercial</span></div></Link>
    <nav>
      <Link to="/" className={location.pathname==="/"?styles.active:""}><ListFilter size={16}/>Leads</Link>
      <Link to="/accounts" className={location.pathname.startsWith("/accounts")?styles.active:""}>Cuentas</Link>
      {isAdmin&&<Link to="/analytics" className={location.pathname==="/analytics"?styles.active:""}><BarChart3 size={16}/>Estadísticas</Link>}
      {isAdmin&&<DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={styles.navMenu+" "+(administrationActive?styles.active:"")}>
            <Settings size={16}/>Administración<ChevronDown size={14}/>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem asChild><Link to="/history"><History size={16}/>Historial</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/trash"><Trash2 size={16}/>Papelera</Link></DropdownMenuItem>
          <DropdownMenuSeparator/>
          <DropdownMenuItem asChild><Link to="/settings"><Settings size={16}/>Configuración</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </nav>
    <div className={styles.user}>
      <LiveModeSwitch/>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={styles.userMenuButton}>
            <UserCircle size={17}/><span>{displayName}</span><ChevronDown size={14}/>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{displayName||"Usuario"}</DropdownMenuLabel>
          <DropdownMenuSeparator/>
          <DropdownMenuItem onClick={()=>setProfileOpen(true)}><UserCircle size={16}/>Mi perfil</DropdownMenuItem>
          <DropdownMenuSeparator/>
          <DropdownMenuItem onClick={switchToLightMode}><Sun size={16}/>Tema claro{mode==="light"&&<b className={styles.menuCheck}>✓</b>}</DropdownMenuItem>
          <DropdownMenuItem onClick={switchToDarkMode}><Moon size={16}/>Tema oscuro{mode==="dark"&&<b className={styles.menuCheck}>✓</b>}</DropdownMenuItem>
          <DropdownMenuItem onClick={switchToAutoMode}><SunMoon size={16}/>Usar tema del sistema{mode==="auto"&&<b className={styles.menuCheck}>✓</b>}</DropdownMenuItem>
          <DropdownMenuSeparator/>
          <DropdownMenuItem onClick={()=>logout()}><LogOut size={16}/>Cerrar sesión</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen}/>
  </header>
};