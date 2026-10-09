import { UnstyledButton } from '@mantine/core';
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Upload, Copy, BarChart3, ChevronDown, History, LogOut, Moon, Settings, Sun, SunMoon, Trash2, UserCircle, Search, RotateCcw, Archive, BookOpen } from "lucide-react";
import { mainNavigation } from '../helpers/appNavigation';
import { openCommandPalette } from '../helpers/commandPalette';
import { CrmButton } from './ui/CrmButton';
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
      <div className={styles.navLinks}>{mainNavigation.map(({url,label,icon:Icon})=><Link key={url} to={url} aria-current={(location.pathname.startsWith(url)||(url==='/opportunities'&&location.pathname.startsWith('/sales/')))?'page':undefined} className={(location.pathname.startsWith(url)||(url==='/opportunities'&&location.pathname.startsWith('/sales/')))?styles.active:''}><Icon size={18} aria-hidden="true"/>{label}</Link>)}</div>
      <DropdownMenu><DropdownMenuTrigger asChild><UnstyledButton type="button" className={styles.navMenu}>Más opciones<ChevronDown size={16}/></UnstyledButton></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem asChild><Link to="/reactivation"><RotateCcw size={16} aria-hidden="true"/>Retomar gestiones pospuestas</Link></DropdownMenuItem>{isAdmin&&<DropdownMenuItem asChild><Link to="/archived"><Archive size={16} aria-hidden="true"/>Negocios archivados</Link></DropdownMenuItem>}<DropdownMenuItem asChild><Link to="/guide"><BookOpen size={16} aria-hidden="true"/>Guía de uso paso a paso</Link></DropdownMenuItem>{isAdmin&&<><DropdownMenuSeparator/><DropdownMenuLabel>Administración</DropdownMenuLabel><DropdownMenuItem asChild><Link to="/accounts?adminTool=import"><Upload size={16} aria-hidden="true"/>Importar CSV</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/accounts?adminTool=duplicates"><Copy size={16} aria-hidden="true"/>Buscar duplicados</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/analytics"><BarChart3 size={16} aria-hidden="true"/>Estadísticas</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/settings"><Settings size={16} aria-hidden="true"/>Configuración</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/history"><History size={16} aria-hidden="true"/>Historial del equipo</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/trash"><Trash2 size={16} aria-hidden="true"/>Papelera</Link></DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>
    </div></nav>
    <div className={styles.user}>
      {authState.type==="authenticated"&&<CrmButton variant="default" className={styles.commands} data-command-trigger aria-label="Abrir accesos rápidos" aria-keyshortcuts="Control+K Meta+K" onClick={openCommandPalette}>
        <Search size={18} aria-hidden="true"/><span className={styles.commandLabel}>Accesos rápidos</span><kbd>{typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K'}</kbd>
      </CrmButton>}
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