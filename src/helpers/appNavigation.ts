import { BookOpen, CalendarDays, CheckCheck, RotateCcw, Store, Workflow } from 'lucide-react';
import { VOCAB } from '../content/vocabulary';

/** Main destinations (owner decision 5A) are shared by the header and command palette. `keywords` are hidden search aliases (old names). */
export const mainNavigation = [
  { url: '/my-day', label: 'Hoy', description: 'Tareas pendientes y próximos pasos', keywords: 'mi día tareas', icon: CheckCheck },
  { url: '/accounts', label: VOCAB.businesses, description: 'Establecimientos y sus datos', keywords: 'cuentas', icon: Store },
  { url: '/opportunities', label: VOCAB.managements, description: 'Propuestas y seguimiento comercial', keywords: 'gestiones comerciales tablero etapas', icon: Workflow },
  { url: '/guide', label: 'Ayuda', description: 'Guía de uso paso a paso', keywords: 'manual', icon: BookOpen },
];

/** Views of "Hoy" (`/my-day?view=`): Lista was Mi día, Calendario absorbs Agenda and Para retomar absorbs Reactivación. */
export const todayViews = [
  { view: 'list', label: 'Lista', url: '/my-day', description: 'Tareas vencidas, de hoy y próximas', keywords: 'mi día', icon: CheckCheck },
  { view: 'calendar', label: 'Calendario', url: '/my-day?view=calendar', description: 'Visitas y reuniones con fecha', keywords: 'agenda encuentros', icon: CalendarDays },
  { view: 'retomar', label: 'Para retomar', url: '/my-day?view=retomar', description: 'Gestiones cerradas con fecha para volver a contactar', keywords: 'reactivación retomar pospuestas', icon: RotateCcw },
] as const;
/** One of the "Hoy" views. */
export type TodayView = typeof todayViews[number]['view'];

/** Reads `?view=` of "Hoy"; anything unknown or missing falls back to the list. */
export const parseTodayView = ({ value }: { value: string | null }): TodayView => todayViews.find(item => item.view === value)?.view ?? 'list';

/** Header label for the section of `pathname` (shown next to the hamburger on phones), or null outside the main sections. */
export const sectionTitle = ({ pathname }: { pathname: string }): string | null =>
  pathname.startsWith('/sales/') ? VOCAB.managements : mainNavigation.find(item => pathname.startsWith(item.url))?.label ?? null;
