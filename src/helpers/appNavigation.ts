import { Archive, BookOpen, CalendarDays, CheckCheck, Copy, History, Inbox, Mail, RotateCcw, Settings, Store, Trash2, Upload, Workflow, BarChart3 } from 'lucide-react';
import { VOCAB } from '../content/vocabulary';

/** Destinations in the work section. */
export const workNavigation = [
  { url: '/my-day', label: 'Hoy', description: 'Tareas pendientes y próximos pasos', keywords: 'mi día tareas', icon: CheckCheck },
  { url: '/inbox', label: 'Bandeja', description: 'Conversaciones por revisar', keywords: 'mensajes conversaciones email whatsapp', icon: Inbox },
] as const;
/** Destinations for business and management records. */
export const recordNavigation = [
  { url: '/accounts', label: VOCAB.businesses, description: 'Establecimientos y sus datos', keywords: 'cuentas', icon: Store },
  { url: '/opportunities', label: VOCAB.managements, description: 'Propuestas y seguimiento comercial', keywords: 'gestiones comerciales tablero etapas', icon: Workflow },
] as const;
/** Admin-only destinations, including the archived business view. */
export const adminNavigation = [
  { url: '/archived', label: 'Negocios archivados', icon: Archive },
  { url: '/accounts?adminTool=import', label: 'Importar CSV', icon: Upload },
  { url: '/accounts?adminTool=duplicates', label: 'Buscar duplicados', icon: Copy },
  { url: '/analytics', label: 'Estadísticas', icon: BarChart3 },
  { url: '/settings', label: 'Configuración', icon: Settings },
  { url: '/history', label: 'Historial del equipo', icon: History },
  { url: '/trash', label: 'Papelera', icon: Trash2 },
  { url: '/inbound', label: 'Mensajes sin asociar', icon: Mail },
] as const;
/** Main destinations shared with the command palette. */
export const mainNavigation = [
  ...workNavigation,
  ...recordNavigation,
  { url: '/guide', label: 'Ayuda', description: 'Guía de uso paso a paso', keywords: 'manual', icon: BookOpen },
] as const;
/** Views of Hoy. */
export const todayViews = [
  { view: 'list', label: 'Lista', url: '/my-day', description: 'Tareas vencidas, de hoy y próximas', keywords: 'mi día', icon: CheckCheck },
  { view: 'calendar', label: 'Calendario', url: '/my-day?view=calendar', description: 'Visitas y reuniones con fecha', keywords: 'agenda encuentros', icon: CalendarDays },
  { view: 'retomar', label: 'Para retomar', url: '/my-day?view=retomar', description: 'Gestiones cerradas con fecha para volver a contactar', keywords: 'reactivación retomar pospuestas', icon: RotateCcw },
] as const;
/** A Hoy view. */
export type TodayView = typeof todayViews[number]['view'];
/** Reads ?view= of Hoy; unknown values fall back to Lista. */
export const parseTodayView = ({ value }: { value: string | null }): TodayView => todayViews.find(item => item.view === value)?.view ?? 'list';
/** Header label for a primary section. */
export const sectionTitle = ({ pathname }: { pathname: string }): string | null => pathname.startsWith('/sales/') ? VOCAB.managements : mainNavigation.find(item => pathname===item.url||pathname.startsWith(item.url+'/'))?.label ?? null;
/** Product name used as the browser tab title outside a section. */
export const APP_TITLE = 'Hospeda CRM';
/** Browser tab title for a section. */
export const documentTitle = ({ section }: { section: string | null | undefined }): string => section ? `${section} · ${APP_TITLE}` : APP_TITLE;
/** Breadcrumb entry. */
export type Breadcrumb = { label: string; url?: string };
/** Builds the shell breadcrumb trail from the current route and optional loaded page label. */
export function breadcrumbTrail({ pathname, search, isAdmin, pageLabel }: { pathname: string; search: string; isAdmin: boolean; pageLabel?: string | null }): Breadcrumb[] {
  const query = new URLSearchParams(search);
  const adminItem = isAdmin ? adminNavigation.find(item => item.url.includes('?') ? pathname + search === item.url : pathname === item.url) : undefined;
  if (adminItem) return [{ label: 'Administración' }, { label: adminItem.label }];
  if (pathname === '/userscript') return [{ label: 'User script de WhatsApp' }];
  if (pathname.startsWith('/sales/')) return [{ label: VOCAB.managements, url: '/opportunities' }, { label: pageLabel || 'Gestión' }];
  if (pathname.startsWith('/accounts/')) return [{ label: VOCAB.businesses, url: '/accounts' }, { label: pageLabel || 'Ficha' }];
  const section = pathname === '/accounts' ? VOCAB.businesses : sectionTitle({ pathname });
  if (section) return [{ label: section }];
  const extraAdmin = isAdmin ? ({ '/library': 'Materiales para ofrecer', '/templates': 'Modelos de mensaje' } as Record<string, string>)[pathname] : undefined;
  return extraAdmin ? [{ label: 'Administración' }, { label: extraAdmin }] : [{ label: pageLabel || 'Hospeda CRM' }];
}
