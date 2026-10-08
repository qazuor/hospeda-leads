# Adopción global de controles Mantine

## Alcance

Se completa la migración de primitivas interactivas en las pantallas del CRM: negocios, gestiones, agenda/Mi día, historial, configuración, mensajes modelo, biblioteca, recursos, importación, duplicados, papelera y autenticación.

- Button, Input, Textarea, Checkbox, Badge/ValueBadge, Skeleton y Spinner usan Mantine. Los campos de opción simple usan NativeSelect de Mantine y conservan valores, opciones deshabilitadas y eventos nativos; los campos buscables usan Combobox.
- Menús y opciones con selección usan Menu/Menu.CheckboxItem; popovers y tooltips usan Popover/Tooltip. Los triggers que necesitan conservar el formato de una celda o toolbar usan UnstyledButton de Mantine.
- Diálogos compartidos usan Modal, incluidos títulos accesibles, portal, bloqueo de scroll y foco. Se conserva el modo inline de las fichas y se usa fullScreen explícito para resultados. Contactar conserva el Drawer móvil de la entrega 27.
- Tabs usan Mantine Tabs con navegación por teclado y paneles inactivos desmontados. El aviso de mensajes sin guardar sigue impidiendo cambiar de sección hasta volver o descartar.
- Las secciones desplegables usan Accordion, con apertura programática y cambio manual. Las tablas de la aplicación usan Table y mantienen selección, columnas fijas, anchos y scroll.
- Se retiran Radix, cmdk y las hojas de estilos de primitivas reemplazadas. Form conserva el estado y validación Zod; su composición de refs/eventos no agrega controles visuales propios.

Las composiciones del dominio y el CSS de disposición/identidad se conservan. TipTap, Sonner y Recharts siguen siendo los motores especializados aprobados; el HTML de email y documentos no se convierte en componentes de la aplicación. Mantine sigue la preferencia claro/oscuro/auto existente y los tokens Hospeda.

## Compatibilidad y ajustes

- Se preservan handlers, permisos y payloads de las acciones comerciales.
- Los popovers controlados abren desde su trigger y respetan cancelación de Escape/click externo durante guardado. Floating UI limita posición y altura al viewport, también al desplazarse por una tabla horizontal en móvil.
- Los diálogos anidados restablecen el contexto modal aun dentro de una ficha inline. Los títulos se registran con Modal.Title; las clases de layout se aplican al contenido, no al contenedor de posicionamiento.
- Se restaura foco al cerrar y al desmontar diálogos. Pantalla completa conserva foco inicial, posición horizontal y salida por Escape.
- La selección parcial usa la propiedad indeterminate de Mantine Checkbox. Se mantiene la densidad de las filas y la elipsis del nombre dentro de la etiqueta de Button.
- Las notificaciones globales quedan debajo de overlays activos; los errores siguen visibles junto a la acción y no bloquean los botones de reintento.
- La búsqueda de opciones reutiliza normalizeSearchText, incluyendo equivalencia de acentos y preservación de ñ.

## Verificación

TypeScript, build y 70 pruebas unitarias aprobados, incluidas cuatro pruebas de compatibilidad de composición de enlaces/checkboxes, búsqueda y selección por teclado, Accordion y tabs con mensaje sin guardar.

La regresión local ejecuta 32 recorridos de navegador con API simulada, a 1280/390 px y variantes de permisos/tema: edición de badges, cargas en segundo plano, selección de columnas, pantalla completa, restauración del listado, acciones por rol, vistas del sistema/personales, lectura de tabla, Spotlight y Contactar. Los 32 recorridos aprobaron. Se revisan capturas de escritorio y móvil. Las reglas responsive ocultan únicamente el texto del botón, preservando los iconos de perfil y salida de pantalla completa; se agregan aserciones de visibilidad de estos iconos. La CI completa del HEAD final es el requisito para merge e incluye integraciones con Postgres, recorridos con API real de prueba y Docker.

El cambio de una aserción de bordes en business-list localiza la raíz Badge de Mantine: el texto ahora está en una etiqueta interna. Conserva el requisito visual, sin relajar la aserción.

## Continuidad

PR 62 integrado en `24d71a03af937a038a8b87e4527696b499d69ada`, HEAD `bfb4ee1f9c2cad33a84e72cfd117ef83e14b5cd9`, tree `8909171cf556903d4faa66d26330b83c357bde53`. CI 37702679523 aprobada (job 113069607223), incluidas integraciones, navegador y Docker. La CI pendiente del documento 29 es un estado histórico.

Luego de esta adopción se retoma el bloque de badges de filtros editables y guardado contextual de vistas, manteniendo la semántica AND/OR y los permisos actuales. Las decisiones comerciales/multiverticales y la limpieza productiva continúan pendientes por separado.
