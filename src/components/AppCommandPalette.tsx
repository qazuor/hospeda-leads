import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spotlight, useSpotlight } from '@mantine/spotlight';
import { Archive, BarChart3, BookOpen, Copy, History, Library, Mail, Moon, RotateCcw, Search, Settings, Sun, SunMoon, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '../helpers/useAuth';
import { useThemeMode } from '../helpers/themeMode';
import { normalizeSearchText } from '../helpers/searchText';
import { mainNavigation } from '../helpers/appNavigation';
import { commandPalette, commandStore, openCommandPalette, restoreCommandFocus } from '../helpers/commandPalette';
import { CrmButton } from './ui/CrmButton';
import styles from './AppCommandPalette.module.css';

export function AppCommandPalette() {
  const { authState } = useAuth();
  const authenticated = authState.type === 'authenticated';
  const isAdmin = authenticated && authState.user.role === 'admin';
  const navigate = useNavigate();
  const { switchToLightMode, switchToDarkMode, switchToAutoMode } = useThemeMode();
  const { opened, selected } = useSpotlight(commandStore);
  const [query, setQuery] = useState('');
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  useEffect(() => {
    if (!authenticated) { commandPalette.close(); return; }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey
        || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      if (commandStore.getState().opened) { event.preventDefault(); return; }
      if (event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      event.preventDefault();
      openCommandPalette();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [authenticated]);

  useEffect(() => {
    if (!opened) return;
    // Mobile keyboards may resize the visual viewport without changing 100dvh.
    const update = () => setViewportHeight(window.visualViewport?.height ?? window.innerHeight);
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector('[data-command-option][data-selected]')?.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [opened, selected, query, viewportHeight]);

  if (!authenticated) return null;
  const destinations = [
    ...mainNavigation,
    { url: '/reactivation', label: 'Retomar gestiones pospuestas', description: 'Seguimientos que pueden reactivarse', icon: RotateCcw },
    { url: '/guide', label: 'Guía de uso paso a paso', description: 'Ayuda para trabajar con el CRM', icon: BookOpen },
    ...(isAdmin ? [
      { url: '/archived', label: 'Negocios archivados', description: 'Consultar negocios fuera del listado activo', icon: Archive },
      { url: '/analytics', label: 'Estadísticas', description: 'Resultados comerciales del equipo', icon: BarChart3 },
      { url: '/settings', label: 'Configuración', description: 'Usuarios y catálogos del CRM', icon: Settings },
      { url: '/templates', label: 'Mensajes modelo', description: 'Plantillas de WhatsApp y email', icon: Mail },
      { url: '/settings?section=library', label: 'Biblioteca comercial', description: 'Materiales y documentos del equipo', icon: Library },
      { url: '/history', label: 'Historial del equipo', description: 'Actividad y auditoría global', icon: History },
      { url: '/trash', label: 'Papelera', description: 'Registros eliminados y recuperación', icon: Trash2 },
    ] : []),
  ];
  const go = (url: string) => {
    // Recheck at execution time as well as opening time.
    if (!document.querySelector('[data-unsaved="true"]')) navigate(url);
  };
  const groups = [
    { label: 'Ir a', actions: destinations.map(item => ({ ...item, id: item.url, run: () => go(item.url) })) },
    { label: 'Acciones', actions: [
      { id: 'light', label: 'Tema claro', description: 'Usar colores claros', icon: Sun, run: switchToLightMode },
      { id: 'dark', label: 'Tema oscuro', description: 'Usar colores oscuros', icon: Moon, run: switchToDarkMode },
      { id: 'auto', label: 'Usar tema del sistema', description: 'Seguir la preferencia del dispositivo', icon: SunMoon, run: switchToAutoMode },
      ...(isAdmin ? [
        { id: 'import', label: 'Importar CSV', description: 'Abrir revisión de importación de negocios', icon: Upload, run: () => go('/accounts?adminTool=import') },
        { id: 'duplicates', label: 'Buscar duplicados', description: 'Abrir revisión de coincidencias', icon: Copy, run: () => go('/accounts?adminTool=duplicates') },
      ] : []),
    ] },
  ].map(group => ({ ...group, actions: group.actions.filter(action =>
    normalizeSearchText(`${action.label} ${action.description}`).includes(normalizeSearchText(query))) }));
  const hasResults = groups.some(group => group.actions.length > 0);
  const selectedAction = groups.flatMap(group => group.actions)[selected];

  return <Spotlight.Root store={commandStore} shortcut={null} query={query} onQueryChange={setQuery}
    title="Accesos rápidos" zIndex={410} size={640} yOffset={16} scrollable
    maxHeight={Math.max(100, Math.min(420, viewportHeight - 210))} trapFocus returnFocus
    styles={{ content: { maxHeight: viewportHeight - 32 } }}
    onSpotlightClose={restoreCommandFocus}
    classNames={{ content: styles.content, header: styles.header, title: styles.title, body: styles.body, search: styles.search,
      action: styles.action, actionDescription: styles.description, actionsList: styles.list }}>
    <CrmButton className={styles.close} variant="subtle" aria-label="Cerrar accesos rápidos" onClick={commandPalette.close}><X size={20} aria-hidden="true" /></CrmButton>
    <Spotlight.Search aria-label="Buscar opciones" placeholder="Buscar una pantalla o acción…" data-autofocus
      leftSection={<Search size={20} aria-hidden="true" />} />
    {hasResults ? <Spotlight.ActionsList h={Math.max(60, Math.min(420, viewportHeight - 230))}>{groups.map(group => group.actions.length > 0 &&
      <Spotlight.ActionsGroup key={group.label} label={group.label}>{group.actions.map(action =>
        <Spotlight.Action key={action.id} id={action.id} label={action.label} description={action.description}
          data-command-option data-selected={selectedAction?.id === action.id || undefined}
          leftSection={<action.icon size={20} aria-hidden="true" />} onClick={action.run} />
      )}</Spotlight.ActionsGroup>)}</Spotlight.ActionsList> : <Spotlight.Empty>Sin opciones para esta búsqueda</Spotlight.Empty>}
    <Spotlight.Footer>↑ ↓ para elegir · Enter para abrir · Esc para cerrar</Spotlight.Footer>
    <span className={styles.announcement} role="status" aria-live="polite">{selectedAction ? `Opción seleccionada: ${selectedAction.label}` : ''}</span>
  </Spotlight.Root>;
}
