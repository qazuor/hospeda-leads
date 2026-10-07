import { CalendarDays, CheckCheck, Store, Workflow } from 'lucide-react';

/** Main destinations are shared by the header and command palette. */
export const mainNavigation = [
  { url: '/my-day', label: 'Mi día', description: 'Tareas pendientes y próximos pasos', icon: CheckCheck },
  { url: '/accounts', label: 'Negocios', description: 'Establecimientos y sus datos', icon: Store },
  { url: '/opportunities', label: 'Gestiones comerciales', description: 'Propuestas y seguimiento comercial', icon: Workflow },
  { url: '/agenda', label: 'Agenda', description: 'Visitas y reuniones con fecha', icon: CalendarDays },
];
