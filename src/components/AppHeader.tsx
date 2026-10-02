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

  return <header className={styles.header}><div className={styles.inner}>
    <Link to="/my-day" className={styles.brand}><img src={LOGO} alt="Hospeda"/><div><strong>Hospeda CRM</strong><span>Equipo Hospeda</span></div></Link>
    <nav aria-label="Navegación principal"><div className={styles.navGroup}>
      {[['/my-day','Mi día'],['/accounts','Negocios'],['/opportunities','Ventas'],['/agenda','Agenda']].map(([url,label])=><Link key={url} to={url} aria-current={location.pathname.startsWith(url)?'page':undefined} className={location.pathname.startsWith(url)?styles.active:''}>{label}</Link>)}
      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={styles.navMenu}>Más opciones<ChevronDown size={16}/></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem asChild><Link to="/reactivation">Retomar ventas pospuestas</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/library">Materiales para ofrecer</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/archived">Negocios archivados</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/guide">Guía de uso paso a paso</Link></DropdownMenuItem>{isAdmin&&<><DropdownMenuSeparator/><DropdownMenuItem asChild><Link to="/analytics">Estadísticas</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/settings">Configuración</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/history">Historial del equipo</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/trash">Papelera</Link></DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>
    </div></nav>
    <div className={styles.user}>
      <LiveModeSwitch/>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={styles.userMenuButton} aria-label={displayName||"Mi perfil"}>
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
    </div><ProfileDialog open={profileOpen} onOpenChange={setProfileOpen}/>
  </header>
};