import { Burger, Drawer, UnstyledButton } from '@mantine/core';
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
  const displayName=authState.type==="authenticated"?authState.user.displayName:"";
  const [profileOpen,setProfileOpen]=React.useState(false);
  const [navigationOpen,setNavigationOpen]=React.useState(false);
  React.useEffect(()=>setNavigationOpen(false),[location.pathname,location.search]);
  const extraNavigation=[
    {url:'/reactivation',label:'Retomar gestiones pospuestas',icon:RotateCcw},
    ...(isAdmin?[{url:'/archived',label:'Negocios archivados',icon:Archive}]:[]),
    {url:'/guide',label:'Guía de uso paso a paso',icon:BookOpen},
  ];
  const adminNavigation=[
    {url:'/accounts?adminTool=import',label:'Importar CSV',icon:Upload},
    {url:'/accounts?adminTool=duplicates',label:'Buscar duplicados',icon:Copy},
    {url:'/analytics',label:'Estadísticas',icon:BarChart3},
    {url:'/settings',label:'Configuración',icon:Settings},
    {url:'/history',label:'Historial del equipo',icon:History},
    {url:'/trash',label:'Papelera',icon:Trash2},
  ];
  const isActive=(url:string)=>url.includes('?')?location.pathname+location.search===url:location.pathname.startsWith(url)||(url==='/opportunities'&&location.pathname.startsWith('/sales/'));
  const mobileLink=({url,label,icon:Icon}:Pick<typeof mainNavigation[number], 'url'|'label'|'icon'>)=><Link key={url} to={url} aria-current={isActive(url)?'page':undefined} onClick={()=>setNavigationOpen(false)}><Icon size={20} aria-hidden="true"/><span>{label}</span></Link>;


  return <header className={styles.header}><div className={styles.inner}>
    <Burger className={styles.burger} opened={navigationOpen} onClick={()=>setNavigationOpen(v=>!v)} aria-label="Abrir menú de navegación" aria-expanded={navigationOpen} aria-controls="crm-mobile-navigation" size="sm"/>
    <Link to="/my-day" className={styles.brand}><img src={LOGO} alt="Hospeda"/><div><strong>Hospeda CRM</strong><span>Equipo Hospeda</span></div></Link>
    <nav aria-label="Navegación principal" className={styles.desktopNavigation}><div className={styles.navGroup}>
      <div className={styles.navLinks}>{mainNavigation.map(({url,label,icon:Icon})=><Link key={url} to={url} aria-current={(location.pathname.startsWith(url)||(url==='/opportunities'&&location.pathname.startsWith('/sales/')))?'page':undefined} className={(location.pathname.startsWith(url)||(url==='/opportunities'&&location.pathname.startsWith('/sales/')))?styles.active:''}><Icon size={18} aria-hidden="true"/>{label}</Link>)}</div>
      <DropdownMenu><DropdownMenuTrigger asChild><UnstyledButton type="button" className={styles.navMenu}>Más opciones<ChevronDown size={16}/></UnstyledButton></DropdownMenuTrigger><DropdownMenuContent align="start">{extraNavigation.map(({url,label,icon:Icon})=><DropdownMenuItem key={url} asChild><Link to={url}><Icon size={16} aria-hidden="true"/>{label}</Link></DropdownMenuItem>)}{isAdmin&&<><DropdownMenuSeparator/><DropdownMenuLabel>Administración</DropdownMenuLabel>{adminNavigation.map(({url,label,icon:Icon})=><DropdownMenuItem key={url} asChild><Link to={url}><Icon size={16} aria-hidden="true"/>{label}</Link></DropdownMenuItem>)}</>}</DropdownMenuContent></DropdownMenu>
    </div></nav>
    <div className={styles.user}>
      {authState.type==="authenticated"&&<CrmButton variant="default" className={styles.commands} data-command-trigger aria-label="Abrir accesos rápidos" aria-keyshortcuts="Control+K Meta+K" onClick={openCommandPalette}>
        <Search size={18} aria-hidden="true"/><span className={styles.commandLabel}>Accesos rápidos</span><kbd>{typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K'}</kbd>
      </CrmButton>}
      <div className={styles.desktopLive}><LiveModeSwitch/></div>
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
    </div><Drawer opened={navigationOpen} onClose={()=>setNavigationOpen(false)} title="Menú de navegación" position="left" size="min(22rem, calc(100vw - 24px))" zIndex={450} closeButtonProps={{'aria-label':'Cerrar menú de navegación'}} classNames={{content:styles.drawerContent,header:styles.drawerHeader,body:styles.drawerBody}}>
      <nav id="crm-mobile-navigation" aria-label="Navegación móvil" className={styles.mobileNavigation}>
        {mainNavigation.map(mobileLink)}<div className={styles.navigationDivider}/>{extraNavigation.map(mobileLink)}
        {isAdmin&&<><p className={styles.navigationLabel}>Administración</p>{adminNavigation.map(mobileLink)}</>}
      </nav><div className={styles.drawerLive}><LiveModeSwitch/></div>
    </Drawer><ProfileDialog open={profileOpen} onOpenChange={setProfileOpen}/>
  </header>
};