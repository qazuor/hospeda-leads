# Mantine: base visual y primer recorrido

Fecha: 7 de octubre de 2026. Base verificada: `main` en `3f677d234149e637babd72cd4a4615f5f546c3ae`; sin PRs abiertos al iniciar.

## Alcance de esta entrega

- Mantine core/hooks 9.7.1 con versiones exactas y lockfile. Los otros paquetes existentes no se actualizaron.
- Provider conectado a la preferencia existente claro/oscuro/automático; se conserva la clave de almacenamiento actual.
- Variables puente resueltas en body, donde se aplica .dark; contraste automático en botones primarios. La revisión visual detectó y corrigió fondo/texto incompatibles en el botón secundario oscuro.
- Tokens de color Hospeda, tipografía existente, radios, espaciado y tamaños compartidos.
- Orden explícito de capas CSS: baseline anterior antes de Mantine. CSS Modules existentes siguen vigentes.
- Componentes compartidos `CrmButton`, `CrmSelect` y `CrmDialog` en `src/components/ui`.
- Primer piloto: selección de gestión y canal de Contactar desde negocio/fila; Modal desktop y Drawer inferior mobile, opciones buscables, iconos Lucide y áreas de control de al menos 44px.
- Restauración de foco al desmontar y preservación del disparador original de fila, incluso durante la carga previa.
- Normalización local de búsqueda con equivalencia de mayúsculas/acentos y Unicode combinado; ñ se conserva como letra distinta. No modifica datos almacenados.
- Import React anterior a las expresiones React.lazy para evitar el fallo de inicialización observado en el servidor Vite de desarrollo.

No se modifican reglas comerciales, permisos de servidor, creación explícita de gestiones, envíos, base de datos ni preferencias del listado. Los siguientes editores del recorrido de contacto todavía usan los controles anteriores.

## Inventario y retiro progresivo

| Área | Estado y siguiente paso |
| --- | --- |
| Providers, tema y estilos | Base Mantine incorporada; conservar tokens y preferencia única |
| Contactar: elegir gestión/canal | Piloto Mantine; continuar con preparación y composición en PRs separados |
| Badges inline | Radix Popover/Tooltip, botones propios y selects nativos; próximo piloto |
| Filtros/vistas | Controles anteriores; migrar antes de ampliar edición de badges y guardado contextual |
| Navegación | Componentes actuales; iconos coherentes y Spotlight pendientes |
| Cards/listado | Funcionalidades terminadas preservadas; layout inteligente pendiente |
| Mi día/Agenda/Gestiones/Configuración | Migración por módulo pendiente |
| Notificaciones/editor | Sonner/TipTap conservados; integración visual posterior |

La coexistencia es temporal por módulo. No sustituir globalmente wrappers de Radix sin revisar contratos, asChild, eventos, foco, portales y editores anidados. Mantine Select no equivale a un select HTML: las pruebas del piloto usan sus opciones accesibles.

## Orden acordado de continuación

1. Completar la muestra de controles: badges inline y formulario/editor; corregir bloqueos mobile encontrados.
2. Navegación e iconos; Spotlight Ctrl+K/Cmd+K con opciones según permisos.
3. Política global de búsqueda cliente/servidor; edición de badges de filtros sin alterar AND/OR.
4. Guardado contextual de vistas; luego fila de badges con overflow.
5. Cards y completar Negocios.
6. Ficha/contacto, Mi día/Agenda, Gestiones/historia, Configuración/materiales: Mantine, loading, errores, toasts y accesibilidad por módulo.
7. Flujo comercial tras resolver etapas/resultados/pendientes/delegaciones/modelos.
8. Multivertical tras aprobar diseño, permisos, filtros, orden y compatibilidad histórica.
9. Limpieza histórica en procedimiento separado: auditoría, manifiesto, respaldo/restauración y ensayo antes de revisión productiva.

Propuestas de vistas aún por confirmar: considerar modificados todos los campos persistidos por la vista; mantener criterios de sistema inmutables y permitir copia personal; overflow desktop con menú y mobile con scroll. No se implementaron como reglas aprobadas.

## Validación

- TypeScript y build.
- Pruebas unitarias de búsqueda: caso, acentos, Unicode, vacío y distinción ñ/n.
- Prueba browser nueva del piloto a 1280/390px en claro/oscuro: búsqueda, selección por teclado, opciones cerradas excluidas, sin resultados, foco/restauración, overflow y ausencia de escrituras por seleccionar/cancelar.
- Regresión de contacto con API/base descartable: preparación explícita, cancelación, guardar, elegir varias gestiones y abrir editor; actualizada para Mantine Select.
- Regresión de badges y resto del listado mediante CI existente.
- Las pruebas locales con endpoints simulados no sustituyen la integración/CI completa. Nunca usar proveedores ni base productivos para pruebas.

Estado: implementación local en `feature/crm-mantine-foundation`. TypeScript, build y 66 unitarias aprobados. Se ejecutaron 10 recorridos locales con API simulada (piloto en claro/oscuro y badges/permisos a 1280/390px); la matriz final pasó tras corregir contraste, se comprobó contraste del botón primario ≥4,5:1 y se revisaron capturas finales desktop/mobile en claro/oscuro. No se ejecutaron integración con PostgreSQL, Docker ni CI final de esta rama.

Publicación autorizada explícitamente por el usuario el 7 de octubre de 2026 tras el bloqueo inicial de revisión automática. Preparar PR contra main; antes de mergear, comprobar CI completa sobre HEAD final y evidencia del recorrido real. La autorización para abrir los siguientes PRs también permanece vigente.

No equivale a adopción global terminada ni a despliegue comprobado.
