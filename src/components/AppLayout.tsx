import React from 'react';
import { Drawer, Tooltip } from '@mantine/core';
import { ChevronDown, LogOut, Moon, Search, Sun, SunMoon, UserCircle, PanelLeftClose, PanelLeftOpen, Code, Ellipsis, ShieldCheck, CircleHelp } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { APP_TITLE, adminNavigation, breadcrumbTrail, documentTitle, mainNavigation, recordNavigation, sectionTitle, workNavigation } from '../helpers/appNavigation';
import type { Breadcrumb } from '../helpers/appNavigation';
import { openCommandPalette } from '../helpers/commandPalette';
import { useAuth } from '../helpers/useAuth';
import { useThemeMode } from '../helpers/themeMode';
import { LiveModeSwitch } from './LiveModeSwitch';
import { ProfileDialog } from './ProfileDialog';
import { RouteLoading } from './RouteLoading';
import { Button } from './Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './DropdownMenu';
import styles from './AppLayout.module.css';

const PageCrumbContext = React.createContext<(label: string | null | undefined) => void>(() => undefined);
/** Sets or clears the optional trailing shell breadcrumb. */
export const usePageCrumb = (label: string | null | undefined): void => {
  const setLabel = React.useContext(PageCrumbContext);
  React.useEffect(() => { setLabel(label); return () => setLabel(undefined); }, [label, setLabel]);
};
type PageHelp = { label: string; content: React.ReactNode };
const PageHelpContext = React.createContext<(help: PageHelp | null) => void>(() => undefined);
/** Registers contextual page help in the application shell and clears it on unmount. */
export const usePageHelp = (help: PageHelp | null): void => {
  const setHelp = React.useContext(PageHelpContext);
  React.useEffect(() => { setHelp(help); return () => setHelp(null); }, [help?.label, help?.content, setHelp]);
};
const readPreference = (key: string, fallback: boolean) => { try { const value = localStorage.getItem(key); return value === null ? fallback : value === 'true'; } catch { return fallback; } };
const writePreference = (key: string, value: boolean) => { try { localStorage.setItem(key, String(value)); } catch { /* Storage may be unavailable. */ } };

/** Shared authenticated application shell. */
export function AppLayout() {
  const location = useLocation();
  const { authState, logout } = useAuth();
  const { mode, switchToLightMode, switchToDarkMode, switchToAutoMode } = useThemeMode();
  const isAdmin = authState.type === 'authenticated' && authState.user.role === 'admin';
  const displayName = authState.type === 'authenticated' ? authState.user.displayName : '';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';
  const onAdminRoute = location.pathname === '/archived' || ['/analytics', '/settings', '/history', '/trash', '/inbound', '/library', '/templates'].includes(location.pathname) || location.pathname === '/accounts' && new URLSearchParams(location.search).has('adminTool');
  const [collapsed, setCollapsed] = React.useState(() => readPreference('hospeda-sidebar-collapsed', false));
  const [adminOpen, setAdminOpen] = React.useState(() => onAdminRoute || readPreference('hospeda-sidebar-admin-open', false));
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [pageLabel, setPageLabel] = React.useState<string | null>();
  const [pageHelp, setPageHelp] = React.useState<PageHelp | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  React.useEffect(() => { const adminLabel = isAdmin ? adminNavigation.find(item => item.url.includes('?') ? location.pathname + location.search === item.url : item.url === location.pathname)?.label : null; document.title = documentTitle({ section: adminLabel ?? sectionTitle({ pathname: location.pathname }) }); return () => { document.title = APP_TITLE; }; }, [location.pathname, location.search, isAdmin]);
  React.useEffect(() => { setMoreOpen(false); setHelpOpen(false); }, [location.pathname, location.search]);
  React.useEffect(() => { if (!pageHelp) setHelpOpen(false); }, [pageHelp]);
  // Entering an admin page from anywhere (palette, links, history) reveals its group.
  React.useEffect(() => { if (onAdminRoute) setAdminOpen(true); }, [onAdminRoute]);
  const toggleCollapsed = () => setCollapsed(value => { writePreference('hospeda-sidebar-collapsed', !value); return !value; });
  const toggleAdmin = () => setAdminOpen(value => { writePreference('hospeda-sidebar-admin-open', !value); return !value; });
  const isActive = (url: string) => url.includes('?') ? location.pathname + location.search === url : location.pathname === url || location.pathname.startsWith(url + '/') || url === '/opportunities' && location.pathname.startsWith('/sales/');
  const trail = breadcrumbTrail({ pathname: location.pathname, search: location.search, isAdmin, pageLabel });
  const navLink = (item: typeof mainNavigation[number] | typeof adminNavigation[number], mobile = false) => {
    const Icon = item.icon;
    const active = isActive(item.url);
    const content = <><Icon size={19} aria-hidden="true"/><span className={styles.itemText}>{item.label}</span></>;
    const link = <Link key={item.url} to={item.url} className={`${styles.navItem} ${active ? styles.active : ''}`} aria-label={item.label} aria-current={active ? 'page' : undefined} onClick={() => mobile && setMoreOpen(false)}>{content}</Link>;
    return !mobile && collapsed ? <Tooltip key={item.url} label={item.label} position="right">{link}</Tooltip> : link;
  };
  const userMenu = (mobile = false) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className={`${styles.userTrigger} ${mobile ? styles.mobileUserTrigger : ''}`} aria-label={displayName || 'Mi perfil'}><span className={styles.avatar}>{initials}</span><span className={styles.userText}>{displayName}</span><ChevronDown size={14} className={styles.userText}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>{displayName || 'Usuario'}</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem onClick={() => setProfileOpen(true)}><UserCircle size={16}/>Mi perfil</DropdownMenuItem><DropdownMenuItem asChild><Link to="/userscript"><Code size={16}/>User script de WhatsApp</Link></DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onClick={switchToLightMode}><Sun size={16}/>Tema claro{mode === 'light' && <b>✓</b>}</DropdownMenuItem><DropdownMenuItem onClick={switchToDarkMode}><Moon size={16}/>Tema oscuro{mode === 'dark' && <b>✓</b>}</DropdownMenuItem><DropdownMenuItem onClick={switchToAutoMode}><SunMoon size={16}/>Usar tema del sistema{mode === 'auto' && <b>✓</b>}</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onClick={() => logout()}><LogOut size={16}/>Cerrar sesión</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
  const openPalette = () => openCommandPalette();
  const searchButton = (mobile = false) => <Tooltip label="Buscar o ir a…" position="right" disabled={!collapsed || mobile}><button type="button" className={`${styles.searchButton} ${mobile ? styles.mobileSearch : ''}`} data-command-trigger aria-label="Abrir accesos rápidos" aria-keyshortcuts="Control+K Meta+K" onClick={openPalette}><Search size={18}/><span className={styles.searchText}>Buscar o ir a…</span><kbd className={styles.searchText}>{typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd></button></Tooltip>;
  const breadcrumbs = (items: Breadcrumb[]) => <nav className={styles.crumbs} aria-label="Ruta">{items.map((crumb, index) => <React.Fragment key={`${crumb.label}-${index}`}>{index > 0 && <span aria-hidden="true">›</span>}{index < items.length - 1 && crumb.url ? <Link to={crumb.url}>{crumb.label}</Link> : <span aria-current={index === items.length - 1 ? 'page' : undefined}>{crumb.label}</span>}</React.Fragment>)}</nav>;
  const helpButton = () => pageHelp && <Button variant="ghost" size="sm" className={styles.helpButton} aria-label={pageHelp.label} onClick={() => setHelpOpen(true)}><CircleHelp size={19} aria-hidden="true"/></Button>;
  return <PageCrumbContext.Provider value={setPageLabel}><PageHelpContext.Provider value={setPageHelp}><div className={`${styles.app} ${collapsed ? styles.collapsed : ''}`}>
    <aside className={styles.sidebar}><div className={styles.brandRow}><Link to="/my-day" className={styles.brand}><img src="/hospeda-logo.jpg" alt="Hospeda"/><span className={styles.brandText}><strong>Hospeda CRM</strong><small>Equipo Hospeda</small></span></Link><button className={styles.collapseButton} type="button" aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} aria-expanded={!collapsed} onClick={toggleCollapsed}>{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button></div>
      {searchButton()}<nav aria-label="Navegación principal"><div className={styles.groupLabel}>Trabajo</div>{workNavigation.map(item => navLink(item))}<div className={styles.groupLabel}>Registros</div>{recordNavigation.map(item => navLink(item))}{isAdmin && <><Tooltip label="Administración" position="right" disabled={!collapsed}><button className={styles.groupToggle} type="button" aria-label="Administración" aria-expanded={adminOpen} onClick={toggleAdmin}><ShieldCheck size={19} aria-hidden="true" className={styles.railIcon}/><span className={styles.groupLabel}>Administración</span><ChevronDown size={15}/></button></Tooltip>{adminOpen && adminNavigation.map(item => navLink(item))}</>}<div className={styles.spacer}/>{navLink({ ...mainNavigation.find(item=>item.url==='/guide')!, url: '/guide', label: 'Ayuda' })}</nav>
      <div className={styles.live}><LiveModeSwitch/></div>
    </aside>
    <div className={styles.main}><header className={styles.topbar}>{breadcrumbs(trail)}<div className={styles.topbarActions}>{userMenu()}{helpButton()}</div></header><header className={styles.mobileTop}><Link to="/my-day" className={styles.mobileBrand}><img src="/hospeda-logo.jpg" alt="Hospeda"/><strong>{(isAdmin && adminNavigation.find(item => item.url.includes('?') ? location.pathname + location.search === item.url : item.url === location.pathname)?.label) ?? sectionTitle({ pathname: location.pathname }) ?? trail.at(-1)?.label ?? APP_TITLE}</strong></Link>{searchButton(true)}<div className={styles.mobileActions}>{userMenu(true)}{helpButton()}</div></header><div className={styles.page}><React.Suspense fallback={<RouteLoading/>}><Outlet/></React.Suspense></div></div>
    <nav className={styles.bottomNav} aria-label="Navegación inferior">{mainNavigation.map(item => <Link key={item.url} to={item.url} className={styles.bottomItem} aria-current={isActive(item.url) ? 'page' : undefined}><item.icon size={20}/><span>{item.label}</span></Link>)}<button type="button" className={styles.bottomItem} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}><Ellipsis size={20} aria-hidden="true"/><span>Más</span></button></nav>
    <Drawer opened={moreOpen} onClose={() => setMoreOpen(false)} position="bottom" title="Otras secciones" closeButtonProps={{ 'aria-label': 'Cerrar otras secciones' }} overlayProps={{ className: 'crm-dialog-overlay' }} classNames={{ content: styles.sheet, body: styles.sheetBody }}><div className={styles.sheetContent}>{isAdmin && <><div className={styles.groupLabel}>Administración</div>{adminNavigation.map(item => navLink(item, true))}</>}<LiveModeSwitch/></div></Drawer>
    <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen}/>
    {pageHelp&&<Drawer opened={helpOpen} onClose={() => setHelpOpen(false)} position="right" title={pageHelp.label} closeButtonProps={{ 'aria-label': 'Cerrar ayuda' }} overlayProps={{ className: 'crm-dialog-overlay' }}>{pageHelp.content}</Drawer>}
  </div></PageHelpContext.Provider></PageCrumbContext.Provider>;
}
