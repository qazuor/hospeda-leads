# Estado del CRM — corte al 25 de octubre de 2026

## Vistas fijadas y orden de columnas — 25/10/2026

- PR #245 de vistas fijadas por usuario mergeado a `staging` como `c7cd1d7`; no desplegado. Validación: pruebas unitarias, `test:view-pins` y e2e 195/197. Fallos conocidos: `commercial.e2e.ts` solo local y `contextual-materials` a 390 px con inestabilidad conocida.
- Orden de columnas por arrastre para Negocios y Gestiones: implementado en `ux/column-order-v1`. Validación local: tests unitarios/componentes, `npm run typecheck`, `npm test` (157 archivos, 1105 pruebas) y `npm run build`; e2e `column-order.e2e.ts` 4/4 y `business-cards.e2e.ts` en verde; suite e2e completa 197/199 (`commercial.e2e.ts` solo local y `seller-flow` con un timeout de carga que pasa 3/3 aislado). PR #247.

## Spec 84 — modelos del CRM desde WhatsApp Web — mergeado (#246, `343d024`) — 25/10/2026

«Mandar un mensaje» en el panel del user script (`docs/crm-roadmap/84-userscript-templates.md`): elegir un modelo compatible con la gestión abierta, vista previa con los datos del CRM y «Pegar en el chat» sin enviar (o «Copiar»). Rutas `GET /_api/userscript/templates` y `POST /_api/userscript/{prepare,dispatch,outcome}` sobre `mutateCommunication`, con los mismos permisos y restricciones que «Contactar»; pegar deja el intento en «WhatsApp abierto · envío no confirmado» y «No lo voy a enviar» lo cierra.

- Pegar conserva los saltos de línea y reemplaza el texto de la caja: el modelo pegado por el script sin preguntar, otro texto solo con confirmación. Cada reemplazo cierra el intento anterior.
- Popover con la plantilla cruda al pasar el mouse por un modelo.
- Registrar un enviado completa un intento abierto solo si el texto se parece al preparado; un mensaje escrito a mano queda como envío suelto (afecta también a «Contactar»).

Probado en local contra WhatsApp real por el propietario (versiones 1.2.11 a 1.2.15). Validación: `npm run typecheck`, `npx vitest run userscript src/server/routes.spec.ts` (84), `scripts/test-userscript.ts`, `scripts/test-work.ts` y `scripts/test-business-history.ts` contra la base local descartable.

## User script de WhatsApp 1.2.0, revisión y panel nuevo — mergeado (#244, `05943cf`) — 25/10/2026

Probado de punta a punta en local contra WhatsApp Business real (Chrome + Tampermonkey): 4 recibidos en `crm_inbound_messages` (`pending_review`, por teléfono, horas correctas) y 4 enviados en `crm_messages` (`manual_sent` con id real de WhatsApp).

- **Lectura del DOM actual de WhatsApp**: `data-id` sin prefijo, título por `conversation-info-header-chat-title`, dirección por `tail-in`/`tail-out` o el lado del mensaje, texto en `selectable-text`. Los chats sin código ni teléfono visible (`@lid`) toman el teléfono del estado interno de WhatsApp (`unsafeWindow`, fiber de React), y si no lo encuentran no adivinan. Fixtures nuevos con la estructura real.
- **Instalar desde el CRM**: «Instalar user script» en `/userscript`. La página detecta el script en este navegador («Instalado», «Desactualizado» o «No detectado») porque el script corre también en el origen del CRM y solo marca `<html>` con su versión.
- **Panel nuevo** (mockup aprobado): botón con el logo en la barra izquierda de WhatsApp (capa propia superpuesta; aparece directo ahí y la sigue si se mueve; flotante si la barra no aparece en 15 s), panel con negocio, estado, gestiones, avisos de No contactar y de estado Nuevo, vista previa con selección y resumen. Token, versión, tema y diagnóstico en «Ajustes», sin depender de un chat abierto (`GET /_api/userscript/status`). Tema automático según WhatsApp, o claro/oscuro forzado. Variables CSS propias (`--hc-*`) porque las de WhatsApp pisaban el color del botón principal.
- **Actualizaciones:** el script consulta la versión publicada al cargar, cada 30 minutos y al volver a la pestaña (máximo cada 2 minutos), y avisa con una tarjeta propia («Actualizar» / «Más tarde» por 24 h y por versión). Una versión por debajo del mínimo (426) no se puede posponer más allá de la página. Versión mínima: 1.2.0.
- **Versión por token:** migración `041_userscript_token_version.sql` (`last_version`). La lista de tokens muestra la versión que usó cada uno y marca los desactualizados.
- Ayuda actualizada (instalación en Chrome/Edge y Firefox, nuevo flujo del token y de las actualizaciones).

Validación local: `npm run typecheck`, `npm test`, `npm run build`, `scripts/test-userscript.ts` contra la base local descartable con la 041 aplicada. Firefox: pasos documentados, no probado en un Firefox real.

## Rediseño visual v1, Fase 7 mergeada a `staging` (#242, `2975cba`; sin desplegar) — crear y editar en paneles — 25/10/2026

Solo visual: sin cambios de campos, validaciones, endpoints ni permisos. Mockup aprobado el 25/10/2026.

- Nuevo negocio, Datos del negocio, Persona de contacto, Iniciar gestión, Agendar tarea, Cambiar fecha o datos, Anotar lo que pasó y Editar actividad se abren como panel lateral derecho (560 px, pantalla completa en el celular), con el título y el pie de acciones fijos.
- Las confirmaciones cortas (Archivar, Enviar a Papelera, Quitar persona, Ya no hace falta, Borrar) y el editor amplio de gestión siguen siendo ventanas centradas.
- Es una variante (`side`) del mismo `DialogContent`: mismo rol de diálogo, foco atrapado, Escape y protección de cambios sin guardar.
- En escritorio la barra de acciones queda fija en el borde inferior del panel aunque el formulario sea corto (ajuste posterior). En el celular sigue debajo del contenido y fija al desplazar, para acompañar al teclado.

## Rediseño visual v1, Fase 4 mergeada a `staging` (#241, `b56f177`; sin desplegar) — tablero de Gestiones — 25/10/2026

Solo visual: sin endpoints ni pedidos nuevos, sin cambios de permisos. Mockup aprobado el 25/10/2026 (con acordeón en el celular a pedido del propietario).

- Columnas con color propio por etapa (las abiertas por su orden: gris, celeste, violeta, ámbar, rosa, azul; ganada verde y perdida roja), fondo teñido, banda superior y contador. Cada columna se colapsa a una tira y el estado se recuerda en el navegador.
- Tarjetas: nombre de la gestión (abre la gestión), negocio, vertical, días en la etapa, próximo paso con color, avisos de seguimiento y prioridad, responsable y «Cambiar etapa» con los mismos permisos.
- Tocar una tarjeta abre «Vista previa de la gestión» (a la derecha; abajo en el celular) con los pasos de la etapa y los datos clave, «Cambiar etapa» y «Abrir gestión». Sigue a la fila actualizada y se cierra si la gestión deja la lista.
- El tablero ya no tiene selector propio de «Tipo de gestión»: lo toma del filtro rápido cuando hay un solo tipo elegido. Ajuste posterior: sin un único tipo, «Ver etapas del equipo» pide elegir uno (botones con la cantidad de cada tipo que aplican el filtro rápido) en lugar de mezclar las etapas de todos los tipos.
- En el celular (hasta 700 px) el tablero es un acordeón por etapa; arrancan desplegadas las etapas abiertas con gestiones.

## Ajustes de Gestiones y Hoy pedidos por el propietario — mergeados a `staging` (#240, `ee7c006`; sin desplegar) — 25/10/2026

Tres cambios chicos decididos el 25/10/2026 (fuera de la v1 solo visual, aprobados aparte):

- Gestiones tiene el filtro rápido «Tipo de gestión» (y el mismo campo en «Filtrar»). El servidor acepta `managementType` como campo del filtro avanzado solo en Gestiones; en Negocios responde 400.
- «Vencidas» y «Hoy» del filtro «Próximo paso» muestran solo gestiones abiertas, como el resumen. La restricción se deriva del filtro: dura lo que dura «Vencidas» u «Hoy» y no pisa una clasificación elegida por un indicador o una vista guardada; el desplegable lo explica.
- El mini calendario de Hoy marca todas las tareas pendientes del mes mostrado, con los mismos filtros de trabajo, mediante el modo nuevo de solo lectura `GET /_api/work?mode=month` (la grilla visible, hasta 42 días, mismo alcance que la lista; avisa si el tope de 3000 tareas la corta).

## Rediseño visual v1, Fase 5 mergeada a `staging` (#239, `eecd391`; sin desplegar) — Hoy — 25/10/2026

Solo visual: sin endpoints ni pedidos nuevos, sin cambios de permisos ni de No contactar. Mockup aprobado el 25/10/2026.

- Indicadores arriba: Vencidas, Para hoy, Respuestas nuevas, Gestiones sin tarea agendada y el avance «Hoy: N de M hechas» (o «¡Terminaste por hoy!»). Tocar uno lleva a su sección; quedan deshabilitados cuando la sección no aparece y «Respuestas nuevas» muestra «–» mientras carga o si falló.
- Dos columnas desde 1100 px: a la izquierda Anotá cómo salió, Vencidas, Para hoy, Próximas acciones (agrupadas por día) y Gestiones sin tarea agendada; a la derecha Respuestas nuevas, mini calendario y Primeros pasos. Más angosto, una columna intercalada.
- Filtros de trabajo siempre visibles (Responsable solo admin, Localidad, Rubro; Mes y vista en Calendario). La ayuda «Cómo usar esta lista» pasó al «?» («Ayuda sobre Hoy»).
- Filas de tarea con ícono por tipo (también en la ficha); los botones bajan debajo del texto cuando la columna es angosta.
- Mini calendario: al mergear marcaba solo las tareas que la Lista ya trae; el ajuste posterior lo pasa al mes completo.
- Pruebas: ver el PR.

## Rediseño visual v1, Fase 3b mergeada a `staging` (#238, `b8841e4`; sin desplegar) — tabla de Gestiones — 25/10/2026

Solo visual: sin cambios de endpoints, permisos ni reglas de No contactar. Mockup aprobado el 24/10/2026.

- Los seis indicadores del resumen quedan visibles como tiles y filtran al tocarlos; las vistas rápidas y las guardadas van en una sola fila con «Guardar vista». El desplegable «Resumen, vistas guardadas y ayuda» se quitó en Gestiones y la ayuda comercial pasó al «?» («Ayuda sobre gestiones»).
- Filtros rápidos Etapa, Responsable (con «Yo») y Próximo paso (Vencidas, Hoy, Esta semana de hoy al domingo, Próximos 7 días, Sin próximo paso, «Rango…»), con las mismas reglas de pertenencia que Negocios (componente compartido `ListQuickFilters`). «Tipo de gestión» no se agregó: `managementType` no es un campo del filtro avanzado y sumarlo cambiaría la API.
- La columna Etapa muestra la etapa con pasos y la tabla es la vista inicial en todos los anchos; «Tablero comercial» sigue llevando al tablero.
- En el celular: búsqueda a lo ancho, «Filtrar» y «Columnas» debajo y la tira de filtros rápidos desplazable; sin scroll horizontal a 390 y 320 px.
- «Vencidas» y «Hoy» del filtro rápido no limitan a gestiones abiertas (los tiles y vistas sí).
- Pruebas: typecheck, `npm test` (1000), build y e2e completos sobre Postgres 17 descartable (193/194; `commercial.e2e.ts` en «CRM template» falla solo en local).

## Rediseño visual v1, Fase 3a mergeada a `staging` (#237, `a32ed00`; sin desplegar) — lista de Negocios — 25/10/2026

Solo visual: sin cambios de endpoints, permisos ni reglas de No contactar. Mockup aprobado por el propietario el 24/10/2026.

- Vistas del equipo y personales en una sola fila desplazable.
- Filtros rápidos Responsable, Estado, Ciudad y Último contacto junto a «Filtrar negocios» (en el celular, una tira desplazable). Cada uno edita solo su propio grupo (valores en «o»); si el campo ya tiene otra regla, avisa que se edita en «Filtrar negocios». Último contacto tiene atajos en días de Argentina (Hoy, Ayer, Esta semana, Últimos 7 y 30 días, Sin contacto) y «Rango…».
- Tocar una fila (o «Vista previa» en el menú «⋯») abre una vista previa lateral (hoja inferior en el celular) con el mismo pedido que ya usaba «Contactar»: estado, datos, canales, próximo paso, actividad reciente y gestiones abiertas, con «Abrir ficha», «Contactar» y «Editar» (mismas reglas que la fila y que la ficha). Abrirla no registra contacto. El nombre sigue abriendo la ficha y la lista recupera el negocio al volver.
- Último contacto con barra de antigüedad (≤7, ≤30, >30 días, sin contacto) y canales con ícono y valor visible; «No contactar» en rojo.
- Se quitó el botón «Abrir» (ojo) de filas y tarjetas; «Contactar» y «⋯» aparecen al pasar el mouse en la tabla. La selección múltiple usa una barra flotante. En el celular, las tarjetas se agrupan en Vencidos, Hoy, Próximos y Sin próximo paso.
- Pruebas: typecheck, `npm test` (990), build y e2e completos sobre Postgres 17 descartable (193/194; `commercial.e2e.ts` en «CRM template» falla solo en local). Se actualizaron la guía y los e2e que usaban el ojo «Abrir» o el nombre como botón.

## Rediseño visual v1, Fase 2c — composer flotante y formulario de documentos — 24/10/2026 (mergeada a `staging`, #236, `a1c3bbf`; sin desplegar)

- En la ficha completa, WhatsApp y Email de la barra lateral abren «Contactar» con el canal elegido. El composer de email/WhatsApp puede mostrarse como panel flotante desde ≥768 px; conserva el composer compartido y las guardas de borrador. «Contactar» restaura el panel existente; cerrar el composer flotante termina el flujo de contacto en escritorio. El composer modal conserva el comportamiento del caller; otras rutas mantienen la presentación modal.
- Documentos muestra primero la lista; «Agregar documento» revela el formulario de vinculación en la ficha de negocio o gestión. Al vincular, se pliega, la confirmación queda visible encima de la lista y el foco vuelve al botón. Se actualizó la guía y se exportó.
- Pruebas: typecheck, `npm test` (959, incluidos los specs del panel flotante y de Documentos; el de cierre falla si el aviso de cierre vuelve a saltear la guarda), build, capturas del panel abierto y minimizado a 1280 px y del diálogo a 390 px, y e2e completos sobre Postgres 17 descartable (192/194: `business-contact` a 1280 se corrigió después y pasa aislado; `commercial.e2e.ts` en «CRM template» falla solo en local).


## Rediseño visual v1, Fase 2b: contenido de las pestañas de la ficha — 24/10/2026 (mergeada a `staging`, #235, `5e0a965`; sin desplegar)

Solo visual: sin cambios de permisos, endpoints ni acciones.

- Historial: timeline con un ícono y un tono por tipo de evento (y por canal en emails y WhatsApp), fecha a la derecha y filtros como chips; se conservan detalle desplegable, compromisos pendientes y paginación.
- Tareas: pendientes y realizadas en una sola lista agrupada («Pendientes · N», «Realizadas · N»), sin pestañas anidadas; las realizadas muestran 5 y se expanden en el lugar.
- Comunicación: el email recibido se lee como una tarjeta (asunto, remitente, estado, cuerpo) con las mismas acciones. No se muestra destinatario porque el dato no existe, y «Por revisar» no se presenta como respuesta.
- Gestiones: `StageStepper` muestra la etapa como pasos según el catálogo de cada tipo, con la etiqueta propia de la etapa («Participa», «Colabora», «Cerrada completada»…). «Derivada a Leandro», las etapas heredadas y las cerradas se muestran como «Etapa: …».
- Documentos sin cambios: mostrar el formulario solo a pedido necesita un botón con un nombre nuevo, a decidir por el propietario.

Pruebas: typecheck, `npm test`, build, capturas de cada pestaña a 1280 y 390 px sin scroll horizontal y e2e completos sobre Postgres 17 descartable.

## Rediseño visual v1, Fase 2a: ficha del negocio, estructura — 24/10/2026 (mergeado a `staging` en #234, `797aec9`, sin desplegar)

Mockup aprobado sin cambios. Solo visual: no cambian permisos, No contactar, endpoints ni qué cuenta como contacto; no hay pedidos nuevos (el Resumen reutiliza las consultas que la ficha ya hacía).

- Encabezado: nombre, estado, código `H{id}`, datos y responsable; Contactar, Editar negocio y «⋯» arriba a la derecha. Se quitó «← Volver al listado de negocios»: lo reemplaza el breadcrumb (en el celular, la barra inferior).
- Columna de datos del negocio (en el celular y en anchos angostos va después del Próximo paso y las pestañas, por decisión del propietario): identidad, acciones rápidas (WhatsApp y Email abren el mismo diálogo de contacto; Agendar tarea y Anotar lo que pasó abren los mismos editores que la pestaña Tareas), preferencias de contacto, Contacto, Personas y Datos plegables.
- El aviso de No contactar o archivado aparece una sola vez, arriba de las columnas, en todos los anchos.
- Pestañas: Resumen (nueva y de entrada), Historial, Tareas, Comunicación, Gestiones y Documentos; Tareas y Gestiones muestran contador. Desaparece «Gestiones · Personas · Datos»; los `?section=` viejos siguen llevando al contenido correspondiente.
- La Ayuda de negocios pasa a un botón «?» en la barra superior (API `usePageHelp` del shell).
- La vista compacta dentro de la gestión no cambia, incluido el aviso de No contactar.
- Corrección: volver a la lista por un link del shell antes de que cargue la ficha ya no pierde el foco ni la posición de la fila abierta.

Pruebas: typecheck, `npm test` (936), build, capturas a 320, 390 y 1280 px (sin scroll horizontal) y e2e completos sobre Postgres 17 descartable. Sigue la Fase 2b (timeline con íconos, tareas en una lista, email en vista de lectura y stepper de etapas).

## Rediseño visual v1, Fase 1: estructura general — 24/10/2026 (mergeado a `staging` en #233, `8ffa1c0`, sin desplegar)

Un solo layout (`AppLayout`) envuelve todas las rutas con sesión; cada página dejó de montar su propia cabecera. Las guardas `UserRoute`/`AdminRoute`, las rutas, los permisos y las etiquetas no cambian.

- Escritorio: barra lateral con buscador (abre los accesos rápidos), Trabajo (Hoy), Registros (Negocios, Gestiones), Administración plegable solo para admins (se recuerda abierta o cerrada y se abre sola en una página de administración), Ayuda, User script, indicador en vivo y menú de usuario. Se contrae a una columna de íconos con tooltips. Barra superior fina con breadcrumbs (`Negocios › nombre del negocio`, `Gestiones › nombre de la gestión`).
- Celular (< 768 px): cabecera de una línea y barra inferior Hoy, Negocios, Gestiones, Ayuda y Más; «Más» abre el panel «Otras secciones» con Administración, User script y el indicador en vivo. Los avisos emergentes suben por encima de la barra inferior.
- La tabla de usuarios de Configuración cambia a su versión compacta según el ancho de su tarjeta, porque la barra lateral reduce el espacio disponible.
- Los contadores de la navegación quedan para después de v1; no se muestran lugares vacíos.

Pruebas: typecheck, `npm test`, build, e2e completos sobre Postgres 17 descartable y capturas a 1280 px (claro, oscuro y barra contraída) y 390 px. Los e2e que buscaban el menú hamburguesa, el desplegable de Administración o un único enlace «Negocios» se adaptaron a la navegación nueva. Pendiente: revisión visual del propietario en staging.

## Rediseño visual v1, Fase 0: sistema de diseño — 24/10/2026 (mergeado a `staging` en #232, `213434b`, sin desplegar)

Primera fase del rediseño aprobado por el propietario (ver [decisiones](decisiones.md)). Solo visual: no cambia rutas, etiquetas, permisos ni contratos.

- Tipografía Plus Jakarta Sans; primario #2563EB sobre fondo #EEF2F8 con tarjetas blancas de radio 16 px; modo oscuro con fondo #0A0F1C y tarjetas #111827.
- Tonos `--tone-{blue,green,orange,red,violet,sky,pink,slate}` (sólido, suave y tinta) y mapa único valor → tono en `src/helpers/tones.ts` para estado del negocio, etapa, revisión y prioridad.
- Badges sin borde con fondo suave; los de estado llevan un punto decorativo.
- Botones en cuatro niveles: primario sólido, secundario con borde neutro, texto y destructivo (rojo suave, sólido al hover).
- Overlay de diálogos derivado de tokens.

Pruebas: typecheck, `npm test` (932), build y capturas a 1280 px (claro y oscuro) y 390 px sin scroll horizontal. E2e completos sobre Postgres 17 descartable: 186/194 en la primera corrida; seis fallos fijaban la opacidad y el color viejos y se actualizaron al diseño aprobado, uno era el área táctil del «?» de Gestiones (se separó del botón primario y se esperó al tablero antes de medir) y `commercial.e2e.ts` es el fallo local conocido de entorno. Los specs corregidos pasan 11/11. Pendiente: revisión visual del propietario en staging y la Fase 1 (estructura general).

## Mensajes y emails recibidos — 22 y 23/10/2026 (mergeado a `staging`, sin desplegar)

Implementado y mergeado a `staging`: todo lo que sigue. Desplegado a producción: **nada**. Producción sigue sin las migraciones 024–040.

- **#211 (`2aaf63b`):** los badges no semánticos de Negocios vuelven a tener color estable por valor. Revisados pasa a editable para el responsable o un admin: «Revisado» desde Nuevo, «No revisado» desde Revisado, Sin tarea agendada o Recontactar (limpia la fecha y cancela la tarea «Volver a contactar» sin tocar). Sin migración.
- **#212 (`1ee2691`):** motor de variantes de mensajes con azar estable por negocio, persona y día, sin repetir la variante anterior del mismo modelo; condiciones nuevas (ciudad, perfil, propósito, día, mes, es cliente); propósito en modelos (migración 035); contexto único entre vista previa y servidor; modelo de red social con «Copiar texto».
- **#213 (`e42bd6d`):** catálogo nuevo de 33 modelos (11 × Email, WhatsApp, Instagram) y variables. **La migración 036 borra todos los modelos y la configuración de variables existentes** e inserta el catálogo; los mensajes enviados conservan su texto. La firma del email pasa al pie del diseño.
- **#214:** spec 83 de registro automático de canales (email, WhatsApp con user script de Tampermonkey, Instagram).
- **#215:** F1a de la spec 83. Migración 037 (`crm_inbound_messages`), `POST /_api/inbound/email` y `GET /_api/inbound/addresses` con `INBOUND_EMAIL_TOKEN`, y el Email Worker de Cloudflare (`workers/inbound-email/`) que reenvía a Gmail y entrega al CRM. Asociación por `In-Reply-To`, `References` y remitente autenticado (DMARC o SPF alineado según el `Authentication-Results` superior de `mx.cloudflare.net`); ante ambigüedad queda Sin asociar.
- **#216 (`e28bfd4`):** F1b. Emails recibidos en Comunicación del negocio (texto plano), «Registrar respuesta» y «No es una respuesta», bloque «Respuestas nuevas» en Hoy y página admin «Emails sin asociar» (`/inbound`) para asociar a mano.

- **#218 (`65f43ea`):** F2. «Responder» en emails recibidos, por el relay SMTP de Brevo y en el mismo hilo (`Message-ID` propio, `In-Reply-To`, `References`). Si el resultado es incierto, no se puede responder otra vez ese email. La migración 038 agrega columnas a `email_outbox` y repara `headers`/`attachments` que F1 guardaba como string JSON. Requiere `BREVO_SMTP_LOGIN`/`BREVO_SMTP_KEY`; sin ellas «Responder» queda oculto.
- **#219 (`17953b7`) y #220 (`060deaa`):** F3. El lado CRM (migración 039, tokens en «User script de WhatsApp» `/userscript`, contexto y registro por token, «Copiar nombre para agendar») y el user script de Tampermonkey (`userscript/`, servido en `/userscripts/hospeda-crm.user.js`, se actualiza solo). Lee el chat abierto en WhatsApp Web y registra lo visible solo después de una vista previa y una confirmación. Nunca escribe en WhatsApp.
- **#221 (`7705b46`):** Ayuda. Cuatro artículos del script de WhatsApp (instalar, vincular un chat, registrar y problemas), «Responder un email desde el CRM», «Asociar emails que llegaron sin negocio» y actualizaciones de los artículos de rutina, pantallas, contacto y correcciones. El control de textos de la Ayuda ahora también verifica la interfaz del script.
- **#222 (`e76b031`):** los WhatsApp recibidos ya no muestran «(sin asunto)», y el descarte dice «mensaje» en vez de «email».
- **#223 (`2eff9c6`):** la edición de negocios en lote y la redistribución de responsables guardaban su metadata del historial como string JSON, el mismo bug que corrigió #218. Ahora guardan objetos, y un control de código impide el cast directo `::jsonb`. **Las filas viejas siguen como string**; repararlas requiere una migración que aún no se decidió.
- **#224 (`b0c5545`):** pruebas de componente de «Mensajes recibidos», «Responder email» y «Emails sin asociar».
- **#226 (`13d26a8`):** migración 040. Repara la metadata vieja guardada como string en `account_updated` y `business_assignment_rebalanced`; es idempotente y no toca otras acciones. **Escribe sobre datos de producción en el deploy.**
- **#227 (`812fd71`):** el user script (1.1.0) completa el WhatsApp abierto desde «Contactar» en vez de duplicarlo, vincula un envío confirmado a mano, y la vista previa lo avisa.
- **#228:** el admin resuelve un email con resultado incierto («Marcar como enviado» / «Marcar como no enviado», con motivo y journal). Libera «Responder» en las respuestas inciertas. Nunca reenvía.

Pruebas: las de cada PR (typecheck, `npm test`, build, integración sobre bases descartables, e2e y tests del Worker). F1 se probó de punta a punta el 23/10/2026 con emails reales, el Worker desplegado y un servidor local expuesto por túnel temporal: la respuesta en hilo se asoció por `In-Reply-To` y los remitentes desconocidos quedaron Sin asociar. Pendiente: prueba real de asociación por remitente, verificación visual del propietario y lo listado en [pendientes](pendientes.md).

## Acciones solo con icono y guías al día — 22/10/2026 (mergeado/en PR a `staging`, sin desplegar)

- **#209 (mergeado a `staging`, `0e5d0fd`):** en Negocios, Abrir y Contactar pasan a botones solo con icono, con nombre accesible exacto y tooltip de propósito. La columna Acciones baja de 220 a 120 px; el layout de columnas pasa a v5 con una migración única (anchos guardados ≤ 220 → 120; mayores se conservan; después se respeta lo que elija el usuario). CI verde. El primer CI detectó que el foco no volvía a Contactar al cerrar el diálogo (el tooltip se montaba/desmontaba); se corrigió dejando el tooltip siempre montado.
- **Guías (`docs/guides-sync`):** auditoría de `src/content/user-guide.json`, `docs/guia-de-uso.md` (regenerada) y `docs/guia-capacitacion-vendedores.md` contra el código: Revisado como indicador de solo lectura (el estado real se cambia en Estado), recontacto al cerrar gestión con y sin fecha, Es cliente en No contactar solo admin, archivado de solo lectura para el responsable, columnas de contacto, búsqueda sin tildes con ñ, acciones con icono, editores inline y columnas agrupadas con «+N más». Revisión con contexto nuevo: dos hallazgos corregidos. `prueba-con-principiantes.md` y `usability-validation.md` son históricos y no se tocaron.
- Decisión del propietario: la columna y el filtro Revisado quedan de solo lectura por retrocompatibilidad; el estado lo cambia admin o responsable desde Estado.
- Las secciones siguientes sobre #206–#208 describen trabajo que ya está mergeado a `staging` (#206, #207, #208), aunque su texto diga «local».

## Columnas agrupadas en Negocios — implementación local

En `feat/business-table-group-columns` (PR #206) se implementó la columna agrupada para tabla y grilla, el editor en Configuración → Listado de negocios y el endpoint `/_api/business_column_groups`. Las definiciones usan `app_settings.business_list_column_groups_v1`; las semillas Tipo (id estable `classification`) y Contacto aparecen disponibles, pero no seleccionadas por defecto. Contacto incluye Persona de contacto, Teléfono, Teléfono de la persona, WhatsApp, Email y Email de la persona; Medio preferido queda afuera. Las preferencias aceptan IDs `group:<id>` y sólo quitan referencias a grupos eliminados después de cargar correctamente las definiciones. No hay actualización en vivo en otras pestañas.

En `fix/group-columns-polish` se ajustó la presentación de los grupos: etiquetas de miembro a 10 px con el token `--muted-foreground`, valores y controles en una línea con elipsis y acceso al texto completo por tooltip/título. Los grupos ahora muestran todas las líneas cuando hay algún miembro con dato o editable; los miembros vacíos muestran «—» o el editor inline según permisos. Se actualizó `src/content/user-guide.json` y se regeneró `docs/guia-de-uso.md`. Pasaron `npm run typecheck`, `npm test` (103 archivos, 812 pruebas) y `npm run build`. No se ejecutó el e2e ni integración. Sin commit, push, despliegue ni operaciones de base de datos.

En `feat/group-columns-max-lines` (PR #208) se agregó `maxVisible` opcional para limitar las líneas de tabla; omitirlo conserva «Todos» y sigue aceptando definiciones guardadas antes de este cambio. El administrador puede elegir el límite, que se ajusta si quita miembros. La tabla muestra los primeros miembros en orden y abre los demás en un popover con los mismos editores y permisos; las tarjetas siguen mostrando todos. Se actualizaron pruebas unitarias, la guía y el mapa técnico, y se agregó el recorrido navegador solicitado. Pasaron `npm run typecheck`, `npm test` (104 archivos, 817 pruebas) y `npm run build`. El e2e de grupos y las pruebas de integración no se ejecutaron. El fix de revisión queda local, sin commit ni push, despliegue u operaciones de base de datos.

Para la revisión del PR #208 se corrigieron dos bloqueos localmente: editar un miembro oculto conserva abierto el popover padre al interactuar con el dropdown portal del editor, desactiva la trampa de foco y deja que Esc cierre primero el editor; la poda de preferencias se escribe cuando termina la restauración y con su página corregida, en una sola escritura. Se agregó cobertura E2E del editor anidado y una prueba de restauración/persistencia. Pasaron `npm run typecheck`, `npm test` (104 archivos, 819 pruebas) y `npm run build`; el E2E no se ejecutó localmente y queda para el coordinador. Sin commit ni push.

Se corrigió un tercer blocker de revisión: la captura ya no usa un indicador de “saltar la próxima”. Conserva la huella serializada de preferencias y contexto guardados al podar, y omite capturas repetidas sólo mientras ese valor siga igual; una edición posterior de preferencias se persiste. La prueba de página verifica que la poda hace una escritura y que un cambio de ordenamiento posterior hace una segunda. Pasaron `npm run typecheck`, `npm test` (104 archivos, 819 pruebas) y `npm run build`. Sin commit ni push, Docker ni operaciones de base de datos.

El primer blocker de revisión #206 sobre la carga de definiciones quedó corregido localmente: Configuración conserva columnas, anchos, fijaciones, orden y vistas compartidas mientras la consulta está pendiente o falla, informa el estado y permite reintentar o guardar sin podar. El segundo blocker queda corregido localmente: Negocios espera sólo las configuraciones por defecto del equipo; mientras los grupos no se resuelven, conserva sus referencias, oculta las columnas desconocidas y usa `nombre` para ordenar la solicitud. La misma clave efectiva determina `aria-sort` y el indicador del encabezado sin alterar la preferencia guardada. Las ediciones durante la espera conservan referencias a grupos; al resolver definiciones se podan únicamente las referencias inexistentes y las preferencias personales se escriben una vez. Cuando la consulta de grupos responde correctamente, muestra las columnas existentes. El e2e cubre grupos demorados y fallidos en Negocios. Validación local: `npm run typecheck`, `npm test` (103 archivos, 809 pruebas) y `npm run build` pasaron; la prueba de página cubre sort, preservación/poda y conteo de escrituras además de respuestas demoradas y fallidas. No se ejecutó el e2e ni integración. Sin commit, push, migración ni operación de base de datos.

## Revisión de UX y rendimiento — 20 y 21/10/2026 (mergeada en `staging`, sin desplegar)

**Estado de cada hecho.** Implementado y mergeado a `staging`: todo lo que sigue. Desplegado a producción: **nada**. Promoción de `staging` a `main`: **no hecha**; la decide el propietario más adelante. Verificación visual del propietario sobre un entorno real: pendiente. Las cifras de CI/pruebas pertenecen a cada PR, no son un contador vivo.

Antes de promover hay que tener en cuenta:

- **Migraciones nuevas, sin aplicar en producción:** 024–033. 024–026 (rendimiento y sesiones) y 027–031 de esta revisión: 027 resultados unificados y próximo paso obligatorio, 028 seguimiento de resultados de contacto, 029 índice de eventos de pipeline por negocio y etapa, 030 índices de primeros pasos y usuarios, 031 índice parcial de negocios No contactar; de la tanda de seguimientos, 032 índices GIN `pg_trgm` para la búsqueda y 033 índice parcial de tareas hechas por día. 028 fija el instante desde el cual se rastrea «Anotá cómo salió» (en producción, el momento de aplicarla). 024 y 029–031 crean índices sin `CONCURRENTLY` (bloquean escrituras de esas tablas mientras se crean); 025 hace un `UPDATE` de `sessions`; 026 reemplaza triggers; 027 cambia constraints y las valida recorriendo `crm_tasks` y `crm_activities`. **032 ejecuta `CREATE EXTENSION IF NOT EXISTS pg_trgm`: el rol de migración necesita `CREATE` sobre la base de datos; si falta, 032 hace rollback y `migrate && start` impide que la aplicación arranque** (precomprobación: `SELECT has_database_privilege(current_user, current_database(), 'CREATE');`, o crear la extensión antes con un rol administrador). 032 y 033 usan `CREATE INDEX` simple (bloqueo `SHARE`, segundos con el volumen de producción) y `migrate.mjs` no define `lock_timeout`. Ejecutar en horario de baja actividad; detalle en [pendientes](pendientes.md) y en las [notas de deploy del plan de rendimiento](rendimiento-y-arquitectura-2026-10.md).
- `JWT_SECRET` ahora es obligatorio (32 o más caracteres, sin valor de ejemplo): el servidor no arranca sin él (#131, mergeado el 21/10/2026). Debe estar bien definido en Coolify antes de desplegar.
- Healthcheck de Coolify: informado por el propietario el 21/10/2026: lo pasó a `/_api/health/ready` (verifica la base de datos). No verificado desde el repo (informado por el propietario); el comentario de `src/server/app.ts` ya lo refleja.

PRs mergeados a `staging` (#151–#193 de la revisión de UX más la base de rendimiento), agrupados (título resumido de cada uno):

- **Rendimiento, seguridad y arquitectura (#114–#149, plan de rendimiento; ver [resultados](rendimiento-y-arquitectura-2026-10.md)):** carga diferida del editor y la guía; caché de recursos y estáticos con compresión; sondeo de versiones en vivo por dominio; sesiones con expiración y renovación en pestañas abiertas; login sin enumeración de cuentas; JWT obligatorio (#131); errores sin filtrar mensajes de Postgres; códigos HTTP correctos; límite de cuerpo; cabeceras de seguridad, CSP en modo reporte y verificación de Origin; id de petición, log de lentitud y salud con base de datos; bloqueo de filas en Comunicación en lugar de tablas; endpoints muertos retirados; imagen Docker sin root; error boundary.
- **Entorno local (#150):** `npm run local`.
- **Fundamentos de UX (#151–#155):** fechas en hora de Argentina (24 h); tonos de badge semánticos con contraste legible; Esc acotado a selectores, motivos de deshabilitado honestos y validación en línea; vocabulario, etiquetas y catálogo de resultados; cliente de API compartido con errores en español, timeout y reintentos.
- **Negocios y Gestiones (#156–#158, #166, #167):** chequeo de duplicados y bloqueo ante un negocio No contactar; valores por defecto de vendedor, columnas y vista de contacto reciente; totales y tarjetas más calmas en el tablero; acciones por fila claras, esqueletos y tarjetas móviles; alta de negocio en un paso con aviso de duplicado.
- **Permisos (#159, #172, #192):** negocio archivado o No contactar de solo lectura para su responsable; vendedor con gestión abierta corrige datos de contacto; D1 y 1C (solo responsable o admin registran «Pidió no ser contactado»; negocios No contactar de solo lectura para no admins).
- **Sesión y contacto (#160, #161, #170, #174):** diálogo de nuevo ingreso al expirar la sesión conservando la página y los borradores; destinatario y borradores de WhatsApp; todo contacto termina en «¿Cómo salió?» → «¿Cómo sigue?»; un solo diálogo Contactar y llamadas.
- **Resultados y tareas (#162, #163, #173, #180, #183, #184):** lista única de resultados y próximo paso obligatorio; Comunicación usa la misma lista; «Agendar tarea» con atajos de fecha; Hoy rehecho con tareas posponibles, progreso y trabajo urgente sin paginar; editor liviano «Anotar lo que pasó»; etapa sugerida como casilla explícita.
- **Búsqueda y navegación (#164, #165):** teléfonos con cualquier formato y búsqueda por varias palabras (nombre + ciudad); navegación del vendedor Hoy, Negocios, Gestiones, Ayuda.
- **Ficha y gestión (#168, #171, #175, #177, #178):** página de gestión con badge de etapa, diálogo de etapa agrupado y reglas de reapertura; ficha con un próximo paso, estado como badge-botón y cuatro pestañas; línea «Qué pasó» unificada como pestaña por defecto; notas de etapa visibles en esa línea; ayudas, estados vacíos que enseñan y descarga de documentos para el responsable archivado.
- **Móvil, accesibilidad y primer uso (#179, #182):** pasada móvil y errores accesibles en línea; lista de primeros pasos y estado vacío didáctico en Hoy.
- **Vocabulario y colores (#185, #186):** barrido final con guardia estricta de vocabulario; color fijo por rubro en los badges.
- **No contactar y recontacto (#187, #188, #190, #191):** advertencia (sin bloqueo) por teléfono de persona de un negocio No contactar; «Recontactar» con fecha crea la tarea «Volver a contactar»; aviso al contactar un teléfono No contactar (D2); cancelación de tareas pendientes al quedar No contactar (D3).
- **Guía y pruebas (#189, #193, #169, #176, #181):** guía en pantalla sincronizada con las últimas reglas No contactar y «Hoy» en todos los textos (#193), con un test que verifica sus etiquetas; arreglos de pruebas inestables.
- **Seguimientos de la revisión (#195–#201, 21/10, mergeados a `staging`, sin desplegar):** #195 (D4) un contacto pasado de acompañamiento en un negocio No contactar solo marca Es cliente si lo registra un admin; #196 cerrar una gestión con fecha deja solo la tarea de la gestión «Recontactar según lo acordado» (la «Volver a contactar» sin tocar del negocio se cancela) y cambiar el responsable del negocio mueve su tarea sin tocar; #197 marcadores de ejemplo de `JWT_SECRET` unificados (advertencia ante espacios o comillas), e2e estabilizados, `line-clamp` estándar y aserción del chip de lunes; #198 diálogos `.editor` como hoja inferior en móvil, ajuste por `visualViewport` ante el teclado, `viewport-fit=cover` con márgenes de área segura y áreas táctiles de 44 px; #199 migraciones 032 (índices `pg_trgm`) y 033, consulta de historial compartida entre el resumen y el historial del negocio, y aviso del tope de urgentes en Hoy con acceso a filtros; #200 `task_save` con concurrencia optimista por `updated_at` (409 con mensaje en español, sin migración); #201 el responsable de un negocio archivado lee en solo lectura la gestión y su comunicación por `leadId`. Los seguimientos que quedaron abiertos están en [pendientes](pendientes.md). Pruebas: las de cada PR (typecheck, `npm test`, build, integración y e2e sobre bases descartables); no hay verificación visual del propietario ni prueba en un teléfono real.
- **Otros:** #133 (CI más rápida), #138 (actualizaciones de seguridad), #149 (documentación del plan de rendimiento).

Este documento, [decisiones](decisiones.md), [pendientes](pendientes.md), el historial y la guía Markdown se actualizaron al cierre (U-34), con `staging` incluyendo #193; la tanda de seguimientos #195–#201 se registró después.

## Configuración de variables de texto para modelos — 19/10/2026

En `staging`, localmente y sin commit, se agregó Configuración → **Variables de texto**. Permite crear, editar y eliminar variables; seleccionar fuente CRM, sistema, otra variable o texto; y definir textos por vertical, tipo de negocio, tipo de gestión, hora local, canal y presencia de nombre de contacto. Se precargaron variables genéricas `saludo`, `gracias`, `despedida`, `presentacion`, `pregunta_cierre` y `firma`; las variables existentes se conservan. Si ya existía un catálogo guardado, los nuevos valores predeterminados se agregan sin reactivar los que el admin haya deshabilitado. Los modelos insertan el catálogo configurado y la vista previa y el servidor resuelven las mismas reglas; los mensajes preparados conservan una copia del contexto y definiciones usadas. La configuración se guarda en `app_settings`, sin migración de esquema.

Las variantes se resuelven por condiciones reales y gana la combinación más específica; combinaciones duplicadas se rechazan. No se implementó rotación aleatoria o cíclica de textos. Pasaron `pnpm run typecheck`, 13 pruebas focalizadas de render/variables, `pnpm run build` y `git diff --check`. El build conserva el aviso existente de chunk JavaScript superior a 500 kB. Pendiente: revisión visual manual de la nueva sección y prueba funcional en la app autenticada. Sin commit ni push.

## Auditoría del flujo comercial — 19/10/2026

Se revisó estáticamente el recorrido desde alta/revisión del negocio hasta gestión, comunicación, tareas, cierre y reactivación sobre `staging` (`6cc6bb2`). Se documentó el informe [auditoria-flujo-comercial.md](auditoria-flujo-comercial.md) y una guía para capacitación de vendedores principiantes en [guia-capacitacion-vendedores.md](guia-capacitacion-vendedores.md). También se actualizó la guía compartida en Markdown y su fuente JSON para usar la columna **Revisados** y advertir sobre límites actuales de Reactivación.

Hallazgos prioritarios originales: Reactivación no conservaba el tipo de gestión; ofrecía reapertura a no administradores; el cierre por “Pidió no ser contactado” dejaba elegir una fecha incompatible; algunos controles de cambio de etapa aparecían habilitados sin permiso. Los puntos P0 1–4 ya están corregidos; el commit `d173889` está en `staging` y `origin/staging`. P1 5 y 6 quedaron en `045ab36` y ya están publicados en `origin/staging`. P1 7, 10 y 11 están en `8e9e7ca`, publicado en `origin/staging`. P1 12–16 están corregidos localmente: Reactivación anticipa opciones y resume la tarea de recontacto; Archivar y Enviar a Papelera explican usos distintos; la ficha resume la última interacción, tareas pendientes y gestiones abiertas, y cada gestión muestra su actividad reciente junto al próximo paso; Contactar, pipeline y tareas diferencian la relación general del negocio, la gestión concreta y quién ejecuta la tarea. Pasaron typecheck, build y E2E con API interceptada en desktop/móvil para #12–15; para #16 typecheck, build y `git diff --check`. No se probó con la base. Falta revisión visual manual de los puntos corregidos.

## Corrección de Reactivación — P0 1 y 2

Se ajustó Reactivación para conservar el tipo de gestión al reabrir o crear otra gestión vinculada, listar solo etapas abiertas compatibles y no ofrecer la etapa especial de derivación a Leandro. La UI deshabilita la reapertura para no administradores y la API vuelve a comprobar el rol. Pasaron cuatro pruebas unitarias, `pnpm run typecheck` y `pnpm run build`. No se ejecutaron escrituras ni pruebas de integración con base.

## Corrección de cierres y permisos del pipeline — P0 3 y 4

Al cerrar una gestión con motivo **Pidió no ser contactado**, el formulario oculta la fecha de recontacto, descarta una fecha marcada antes y avisa que el negocio quedará Archivado y No contactar. El payload también omite la fecha para ese motivo; la validación del servidor sigue activa. En el tablero y el detalle de gestión, **Cambiar etapa** ahora usa el permiso `canModify` calculado por el servidor mediante `canModifyManagement`; si no corresponde, queda deshabilitado con explicación. El detalle informa quién es el responsable. Pasaron typecheck, 11 pruebas unitarias de permisos/Reactivación y build; no se probaron escrituras ni integración con base.

Commit `d173889` publicado en `origin/staging`.

## Camino recomendado para vendedores nuevos — P1 5

La guía de capacitación y la ayuda dentro del CRM señalan el mismo recorrido: empezar por Mi día si ya existe una tarea; si no, buscar el negocio, abrir su ficha y elegir Contactar o Iniciar gestión según el objetivo. El resultado se registra en el mismo contexto y el próximo compromiso queda como tarea. Búsqueda global, pipeline e historial se describen como atajos, no como procesos distintos. No se quitaron accesos alternativos.

## Canales disponibles desde Contactar — P1 6

Desde Contactar en la ficha, el selector ofrece Email, WhatsApp, Llamada, Red social y Otro para contexto General o una gestión abierta. Email y WhatsApp conservan la preparación/envío existente; los canales manuales abren el formulario de registro con el contexto ya elegido. La guía de capacitación y la ayuda dentro del CRM explican qué queda pendiente y que iniciar o copiar no prueba que el contacto se realizó. Pasó `pnpm run typecheck`, `pnpm run build` y `pnpm exec playwright test tests/browser/mantine-contact.e2e.ts` (4 variantes desktop/móvil y claro/oscuro); también pasó `tests/browser/message-template-policy.e2e.ts` (3 casos). Las regresiones que exigen login no avanzaron de `/login` en el servidor local y no se ejecutaron contra la base. Cambios incluidos en `045ab36`.

## Cliente previo y cierre ganado — P1 7

La acción manual se renombró **Registrar cliente previo** y explica que aplica a relaciones anteriores al seguimiento en CRM. El motivo obligatorio ahora se conserva en el evento de journal y se muestra en el historial del negocio y el global. La guía dirige las ventas nuevas al cierre ganado de la gestión, que mantiene su conversión automática correspondiente. Pasaron typecheck, build y la prueba unitaria del formato del historial. No se ejecutó el test comercial de navegador porque requiere la base local descartable descrita en la guía; queda pendiente la comprobación visual.

## Compatibilidad de la marca «Revisados» — 18/10/2026

En `staging` se restaura la columna seleccionable y el filtro booleano «Revisados» para tabla y cards. La UI deriva el valor exclusivamente del estado del negocio: `Nuevo` (o estado ausente) = no revisado; cualquier otro estado = revisado. Los filtros y columnas guardados con el nombre anterior se conservan; las preferencias de columnas antiguas recuperan la columna una vez y luego permiten ocultarla. El modelo interno y la base siguen usando `crm_accounts.status`; no se consulta ni modifica `review_status` y no se agrega migración.

Verificación local: typecheck, suite completa de Vitest (24 archivos, 111 pruebas) y build pasan; el build mantiene el aviso existente por el bundle principal mayor a 500 kB. Commit `665f614` está en `staging` y fue enviado a `origin/staging`. El servidor Vite del checkout continúa escuchando en `localhost:5173`.

Este documento es el traspaso de la conversación de desarrollo a un checkout local. No importa automáticamente la conversación de ChatGPT a Codex o Claude: conserva las decisiones y la evidencia útil en Git. Verificar el estado remoto al comenzar una nueva sesión.

## Contexto

Hospeda CRM es la herramienta interna de prospección y seguimiento comercial de Hospeda. Está en producción en https://crm.hospeda.com.ar, alojada en un VPS con Coolify y PostgreSQL 17. Es independiente del portal turístico público https://hospeda.com.ar.

La UI debe ser sencilla para vendedores y personas con poca experiencia técnica. El propietario pidió especial atención a móvil, claridad de próximos pasos, loading visible y diseño cuidado. Las pruebas automatizadas no equivalen a haber medido usabilidad con usuarios.

Base remota comprobada para este traspaso: `75904f4acb6958fa8ca90bee3689f73b4a796275` (merge del [PR #92](https://github.com/qazuor/hospeda-leads/pull/92)). El propio PR de documentación será un commit posterior: esta referencia es una base histórica, no un HEAD perpetuo.

## Estados de negocio y gestión — integrados en staging

El issue aprobado [#98](https://github.com/qazuor/hospeda-leads/issues/98) define separar el estado del negocio del estado de cada gestión, preservar los negocios que ya no estén en estado Nuevo y redistribuir los restantes de forma equitativa contando también el trabajo previo. Los PRs #99–#103 están mergeados en `staging`; esto no significa que estén en `main` ni desplegados. La redistribución productiva ejecutada el 15/10 está registrada más abajo; no repetirla automáticamente.

## Lo implementado en main

| Área | Estado y alcance | Referencia |
|---|---|---|
| Modelo comercial | Negocios, personas y gestiones independientes; altas/importaciones solo de negocio; gestiones explícitas e idempotentes | [Fase comercial](crm-roadmap/01-commercial-foundation.md), [inicio explícito](crm-roadmap/07-explicit-management-and-cleanup-audit.md) |
| Seguimiento | Tareas, actividades, Mi día, Agenda, siguiente pendiente y seguimiento general o por gestión | [Trabajo](crm-roadmap/02-tasks-activities.md), [continuidad](crm-roadmap/47-pending-continuity.md) |
| Pipeline | Etapas, objeciones, reactivación y acuerdos con cambios explícitos | [Pipeline](crm-roadmap/03-pipeline-reactivation.md), [reglas pendientes](crm-roadmap/48-commercial-rules-review.md) |
| Calidad/importación | Procedencia, revisión de lotes, API de importación y fusión explícita; no fusionar por simples coincidencias | [Calidad](crm-roadmap/04-data-quality.md), [API](BUSINESS_IMPORT_API.md) |
| Comunicación/materiales | Email Brevo, WhatsApp asistido, modelos, documentos/versiones y biblioteca administrada | [Comunicación](crm-roadmap/05-communication-resources.md), [miniaturas](crm-roadmap/49-material-thumbnails.md) |
| UI compartida | Mantine, wrappers, primitivas CSS, header móvil con hamburguesa y Drawer, navegación responsive | [Sistema visual](ui-visual-system.md) |
| Filtros/vistas | AND/OR, exclusiones, búsqueda libre, badges que editan solo el valor, vistas y guardado contextual | [Badges](crm-roadmap/32-filter-badge-values.md), [vistas](crm-roadmap/33-contextual-view-save.md) |
| Búsqueda | Normalización sin acentos en búsquedas y filtros restantes, conservando ñ | [Búsqueda](crm-roadmap/43-complete-accent-search.md) |
| Historial comercial | Conversaciones, resultados y compromisos; auditoría técnica separada | [Historial comercial](crm-roadmap/44-commercial-history.md) |
| Recorrido del vendedor | Contactar desde tareas comparte el recorrido; resultados guiados y revisión; reprogramación/cancelación/duplicados | [Contactar](crm-roadmap/45-task-contact.md), [resultados](crm-roadmap/46-guided-results.md) |
| Feedback | Avisos con destinos y reintentos pertinentes; bloqueos inmediatos de guardado y conservación del formulario | [Avisos](crm-roadmap/50-actionable-feedback.md), [loading](crm-roadmap/51-loading-audit.md) |
| Accesos rápidos | Ctrl/Cmd+K: navegación más búsqueda de negocios, gestiones, personas, notas, pendientes, archivos, mensajes, actividades y modelos según permisos | `src/endpoints/search.ts`, `tests/browser/business-trash-search.e2e.ts` |
| Archivo/Papelera | Archivo del negocio y eliminación lógica del negocio son estados separados; Papelera conserva además la consulta de gestiones eliminadas | Migración 016, [PR #91](https://github.com/qazuor/hospeda-leads/pull/91) |
| Historial global | Unión de journals de gestiones, negocios/contactos, trabajo, recursos, pipeline y configuración; filtro por negocio y eventos sin gestión | [PR #92](https://github.com/qazuor/hospeda-leads/pull/92), `src/helpers/globalHistoryServer.ts` |
| Metadatos históricos | Campos propios de negocio para origen, referencia, Filtrado y suscripción histórica; recuperación manual auditada | Migración 017, [procedimiento](business-metadata-recovery.md) |

La lista describe código entregado y pruebas disponibles. No declara que toda pantalla o contenido real esté perfecto. Las auditorías visuales anteriores recibieron nuevas observaciones del propietario y necesitan seguimiento.

## Operaciones de datos: ya realizadas, no repetir

### Limpieza del 8/10

El propietario amplió explícitamente el alcance para borrar todas las gestiones artificiales, indicando que no representaban seguimiento real. El operador reportó `cleanupCommitted:true`: 1.602 gestiones eliminadas, 3.532 negocios y responsables conservados y 2 personas conservadas. Hubo respaldo externo, restauración aislada y ensayo con rollback. Se quitaron también sus filas comerciales relacionadas; ver [runbook](management-cleanup-runbook.md).

La auditoría conservadora inicial devolvía 0 candidatos y 1.602 bloqueadas: no fue una licencia para ignorar bloqueos. La operación posterior tuvo un alcance distinto, autorizado expresamente.

### Comparación actual del 10/10

Se recibió un respaldo completo posterior a la limpieza y se verificó su SHA-256. La comparación de filas comprobó:

- Mismos 3.532 negocios y responsables; 2 contactos idénticos.
- 20.547 evidencias y 173 lotes de importación idénticos.
- Documento, versión y vínculo idénticos, incluido el archivo.
- 22 negocios con nuevos canales, direcciones o notas; todos con eventos `account_updated`. Esos cambios se conservaron.
- Journal antiguo: 1.914 filas conservadas con `lead_id` desvinculado; comercial: 4.215 → 4.241; trabajo: 11 → 17; recursos: 20 → 26. Los eventos antiguos de estos journals permanecieron.
- Las bajas de gestiones y sus relacionadas coinciden con la limpieza autorizada. Los 110 eventos de `crm_pipeline_events` sí se eliminaron: el historial unificado no los reconstruye.
- Revisión editorial de modelos observada en el respaldo: 31 modelos anteriores conservados, 6 agregados, 30 textos revisados y 1 modelo de prueba desactivado; 37 registros totales.

Estos son conteos del snapshot recibido, no del estado actual después de cada nueva acción.

### Recuperación del 10/10

El usuario pidió recuperar únicamente Papelera, origen, fuente de referencia, Filtrado y suscripción. Se preparó un manifiesto privado externo a Git y un ejecutor de vista previa/aplicación con huella, conflictos, transacción y auditoría.

Se restauraron las 44 tablas del respaldo actual en una copia aislada PostgreSQL embebida (PGlite 18.3); se reprodujo exactamente la huella de producción, se ensayó la aplicación y se comprobó idempotencia y preservación de los demás campos/tablas. Ese ensayo no prueba concurrencia ni roles/ACL del servidor nativo. El ejecutor también pasó integración en PostgreSQL 17 en CI.

El operador confirmó `committed:true` y cero conflictos en producción, con estos conteos:

| Atributo recuperado | Negocios |
|---|---:|
| Origen | 1.600 |
| Fuente de referencia | 1.590 |
| Filtrado | 146 |
| Suscripción histórica | 5 |
| Papelera, fecha y autor | 23 |

Los grupos se superponen y afectan 1.600 negocios distintos. No se recrearon gestiones. El manifiesto, dumps e informes individuales no se incluyen en el repositorio. Se pidió conservar el informe aplicado fuera del contenedor. Falta confirmación humana de la visualización final en Papelera, filtros y Historial global.

## Bloques abiertos

1. Verificación visual de esa recuperación y del historial global sobre el deploy actual.
2. Nuevo recorrido real de UI, operando formularios, diálogos, menús y estados, en desktop/móvil y ambos temas.
3. Decisiones funcionales comerciales pendientes, antes de añadir automatismos.
4. MCP OAuth y revisión de negocios para multiverticales/fusiones: pospuestos por el propietario.

Detalles y orden sugerido: [pendientes](pendientes.md). Instrucciones estables: [decisiones](decisiones.md). Historia de entregas: [historial](historial-desarrollo.md).

## Última validación comprobada

PR #92: 93 pruebas unitarias, 115 recorridos de navegador, integraciones PostgreSQL 17, build y smoke de Docker aprobados antes del merge. Son los resultados de esa revisión; no cifras a prometer para cualquier commit futuro. Pruebas nuevas del historial usan desktop 1280px y móvil 390px. Otras suites incluyen 320px y ambos temas.

Un CLI local debe volver a verificar comandos, permisos y checks del cambio que realice. El historial de conversaciones de cada herramienta se retoma con su mecanismo propio; los documentos y PRs son el traspaso entre herramientas.

## Planificación de IA — definición funcional acordada

Se generaron una épica, una spec fundacional y 19 specs hijas. El propietario definió la experiencia (chat general y acciones contextuales), acceso para todo usuario autenticado respetando permisos CRM, uso de ficha e historial completos cuando se permiten, registro de prompts/respuestas vinculados al negocio en su journal y de fragmentos por negocio para resultados multinegocio, límites antes de habilitar, punto de comparación por fecha y el informe de cartera con 30 días predeterminados, desglose por responsable y métricas iniciales acordadas. Dictado queda fuera de la primera etapa. No hay integración LLM ni implementación aprobada. Proveedor/modelo se elegirá antes de implementar; también falta verificar privacidad, retención, entrenamiento, región y contrato del proveedor antes de enviar datos reales. Ver [épica 61](crm-roadmap/61-ai-in-crm-epic.md), [base 62](crm-roadmap/62-ai-platform-foundation-spec.md) y el [inventario](crm-roadmap/60-ideas-uso-ia.md).

La documentación se integró en `staging` mediante los PRs [#107](https://github.com/qazuor/hospeda-leads/pull/107), [#108](https://github.com/qazuor/hospeda-leads/pull/108), [#109](https://github.com/qazuor/hospeda-leads/pull/109) y [#110](https://github.com/qazuor/hospeda-leads/pull/110). La implementación de IA sigue pendiente.

## Integración de cambios visuales, estados y comunicación

La rama `feat/integrate-crm-state-communication-visual` recibió el cambio visual del PR #102, la cadena de estados (#99–#101 y sus cortes de journal, API, UI y preferencias), los cambios locales complementarios y Comunicación. El PR #103 se mergeó en `staging` el 14/10. La migración 019 se mantuvo intacta; el nuevo código de archivo está en la migración 023.

Incluye las migraciones 018–023, la conversión de vistas, flujos de estados, derivación, comunicación, la limpieza aprobada de secuencias de prueba y las specs 53–59. No se ejecutaron migraciones ni escrituras de base durante esta integración; tampoco se inició ningún servidor. La limpieza de secuencias de la migración 022 requiere revisar el preflight antes de aplicarla a cualquier base.

La validación registrada para el PR #103 fue `pnpm run typecheck`, `pnpm test` (23 archivos, 110 pruebas), `pnpm run build` y `git diff --cached --check`; el build conserva la advertencia de chunk mayor a 500 kB. No se ejecutaron pruebas de navegador ni de integración PostgreSQL como parte de ese PR. Falta revisión visual y validar migraciones sobre una base local descartable.

## Cambio mergeado — marca de revisión y ayuda del CRM

En el checkout local se agregó UI para editar `crm_accounts.review_status` desde el formulario del negocio, ofrecer Revisión como columna opcional para tabla y cards, editarla inline, mostrar el valor en el detalle, y filtrar por la marca. El valor `filtered` identifica Filtrado; `NULL` se presenta como No filtrado. No se agregó una migración porque el campo existe desde la migración 017. Los filtros de columnas de usuario también ofrecen “Usuario autenticado”, resuelto en el servidor para cada sesión en `assignedUserEmail`, `asignadoA`, `quienCargo` y `creadoPor`. La ayuda suma accesos directos por tarea para el recorrido de negocio a venta y para cerrar una venta, muestra los artículos anidados bajo sus temas y los expone en la paleta de comandos con búsqueda aproximada. Incluye una guía para verificar negocios precargados, marcarlos Filtrado si son válidos o enviarlos a Papelera si son inválidos. Los badges editables simples de tabla y cards abren ahora una lista compacta de opciones como badges y guardan al seleccionar; Vertical/Subtipo conserva el editor detallado por sus dependencias, y las columnas de gestión mantienen la selección explícita cuando hay más de una gestión.

Validación local: `pnpm run typecheck`, `pnpm test` (95 pruebas), `pnpm run build` y los 15 recorridos de navegador afectados aprobados; Vite mantiene el aviso de chunk grande (>500 kB). La pasada completa de CI terminó verde sobre `8b5583d`. El [PR #95](https://github.com/qazuor/hospeda-leads/pull/95) se mergeó el 11/10/2026. No inferir deploy desde el merge. `pnpm-lock.yaml` estaba sin seguimiento y no formó parte del cambio.

## Pulido visual de navegación y recorridos

En la rama `feat/visual-polish-ux` se compactó el header entre 768 y 1440 px para mantener la navegación agrupada y evitar que “Más opciones” quede aislado; se agregaron indicaciones de desplazamiento en los accesos horizontales de la Guía y las vistas guardadas; y se jerarquizaron las acciones de Mi día/Agenda con verbos más claros y una acción principal. El reporte estético y las mejoras futuras priorizadas están en [pendientes](pendientes.md).

Validación local: `pnpm run typecheck`, `pnpm run build` y 6 pruebas de navegador dirigidas (11/10/2026). Se usaron respuestas sintéticas; no se recorrieron datos productivos ni todas las pantallas/temas con una persona usuaria. Build mantiene el aviso de bundle principal mayor a 500 kB. El CI, merge y deploy de este cambio quedan pendientes.

### Segunda pasada visual — previsualización local sin commit

En el mismo checkout se avanzó sobre los hallazgos estéticos del listado de negocios, las cards, el detalle de negocio y los formularios de gestión/modelos/configuración. Se evitó cambiar permisos, reglas comerciales, endpoints o persistencia. La referencia del responsable en cards ahora tiene espacio propio y una sola línea; en móvil se agruparon las vistas y el restablecimiento de preferencias para reducir altura; el bloque de filtros y vistas ahora separa búsqueda, vistas guardadas y filtros aplicados con divisores sutiles, y oculta el aviso de ausencia de vistas personales dentro del carril horizontal. Se dejó una única forma de editar/borrar vistas personales: el botón “Administrar” abre el diálogo; los badges solo seleccionan vistas. Restablecer preferencias también limpia la identidad de la vista activa y su marca en el selector. Las columnas fijadas tienen un tinte de color de acento más visible en desktop, manteniendo el patrón de franjas y adaptándose al tema oscuro. En la tabla, la columna de selección queda siempre primera y fija a la izquierda, incluso en móvil; los anclajes izquierdos configurables dejan reservado su ancho. Los bloques secundarios del detalle usan divisores en vez de paneles anidados; y los formularios de gestión resaltan el contexto del negocio y usan etiquetas/ayudas más legibles. La prueba de navegador del flujo Mi día actualizó su texto esperado al nuevo nombre del botón.

Estado al 11/10/2026: cambios presentes solo en el árbol de trabajo, sin commit ni push, para previsualizar en `http://localhost:3001`. `pnpm run typecheck`, `pnpm run build`, `pnpm test` (95 pruebas), pruebas dirigidas con fixtures sintéticos y `git diff --check` pasaron. La última prueba `business-view-badges.e2e.ts` junto con `personal-views.e2e.ts` pasó en desktop y móvil (4 casos); comprueba selección, foco, edición, borrado y que administrar una vista no cambie la búsqueda actual. `business-system-views.e2e.ts` ahora comprueba que Restablecer quite tanto la etiqueta de vista activa como el badge seleccionado en desktop y móvil. `business-table-reading.e2e.ts` verifica el listado fijado en desktop y móvil, que la selección permanezca a la izquierda durante scroll horizontal, y compara el fondo de columnas fijadas con el resto tanto en claro como oscuro. `mobile-scroll-cues.e2e.ts` también pasó y guardó una captura móvil del panel. Una suite de cards también encontró el fallo conocido de restauración del foco al volver del detalle; se mantuvo fuera del alcance visual y no se alteró esa interacción. No se ejecutaron recorridos que escriban en la base local, porque no se verificó qué base usa el servidor ya iniciado.

Refinamiento posterior: los chips del resumen de filtros ahora son más compactos; la vista activa aparece primero en esa línea, seguida únicamente por filtros añadidos o cambiados manualmente. Los filtros heredados se ocultan, pero los chips manuales conservan su edición inline y mantienen la agrupación de la configuración real. El nombre de la vista ya no se recorta; si es largo, puede ocupar más espacio y empujar el filtro manual a la línea siguiente. `pnpm run typecheck`, `pnpm test` (96 pruebas), `pnpm run build`, `business-system-views.e2e.ts` (desktop/móvil), `business-view-badges.e2e.ts` (desktop/móvil), `mobile-scroll-cues.e2e.ts` y `git diff --check` pasaron. Build conserva el aviso de bundle >500 kB. Sin commit ni push.

## Spec de estados de negocio y gestiones — 11/10/2026

Se redactó la spec de producto 53 y el reporte de brechas 54. Las decisiones funcionales ya se completaron; la implementación se está trabajando en ramas encadenadas separadas y aún no se integró a `main`. No se consultó la base de datos productiva.

La edición de vistas personales ahora permite cambiar también la búsqueda, los filtros avanzados AND/OR y limpiar los filtros heredados visibles desde el constructor. El editor carga la configuración guardada de esa vista y no reemplaza los filtros de la lista actual; el guardado conserva el resto de sus preferencias. `business-view-badges.e2e.ts` cubre edición, error de guardado con reintento y persistencia del nuevo filtro en desktop y móvil. `pnpm test` (96 pruebas), `pnpm run typecheck`, `pnpm run build` y `git diff --check` pasaron.

El [PR #97](https://github.com/qazuor/hospeda-leads/pull/97) ya fue mergeado. La expectativa de `tests/browser/work.e2e.ts` para el botón de Mi día se actualizó en la rama remota de esta rama de trabajo; está incluida en el conjunto que se publica a continuación.

Administrar vistas ahora permite duplicar una vista personal con su misma búsqueda y configuración, con nombre de copia editable. Los administradores también pueden convertir una vista personal en una vista de sistema compartida: la operación mueve su configuración al ajuste de equipo y elimina la vista personal en una transacción; los usuarios comunes no ven esa opción y el servidor la protege por rol. Las vistas compartidas aparecen y se administran en Configuración; pueden cambiar nombre, visibilidad, orden y filtros o quitarse. Si se convierte la vista que está activa, el selector conserva los filtros y pasa a marcar la vista compartida. Validado con `pnpm run typecheck`, `pnpm test` (97 pruebas), `pnpm run build`, `business-view-badges.e2e.ts` (duplicar como usuario común y convertir como admin, desktop/móvil para duplicación) y `business-system-views.e2e.ts` (desktop/móvil), más `git diff --check`. El build mantiene el aviso del bundle principal mayor a 500 kB. El servidor local se detuvo por pedido del usuario. Los cambios se publicaron en el [PR #102](https://github.com/qazuor/hospeda-leads/pull/102); CI está pendiente.

### Ajustes visuales menores en staging — 14/10/2026

En `/tmp/hospeda-staging`, los badges de ciudad muestran `C. del Uruguay` cuando el valor guardado es Concepción del Uruguay; el valor completo se conserva en el dato y como tooltip. Se dio al formulario de Contacto general una jerarquía de labels, controles y espaciado consistente. La revisión de formularios encontró además el editor de perfil con labels demasiado pequeños, el formulario de levantar restricción sin layout propio y el cambio de política de contacto heredando una grilla inadecuada; se ajustaron al mismo patrón. Sin cambios de permisos o comportamiento comercial. `pnpm run typecheck` y `pnpm test` (110 pruebas) pasaron; UI y API local respondieron correctamente. Sin commit ni push.

## Tooltips para acciones deshabilitadas — 15/10/2026

Auditoría e implementación local en `staging`: todos los `Button` y `CrmButton` deshabilitados muestran un tooltip accesible al pasar el mouse o enfocar con teclado, con razón explícita; se cubrieron también checkboxes deshabilitados, opciones inline, selectores y acciones implementadas con `UnstyledButton`/`ActionIcon`. Se añadieron motivos específicos para permisos, restricciones, destinatarios/datos faltantes, guardados en curso, estados del negocio, límites de paginación y vistas. No se modificaron reglas de permisos ni estados comerciales.

Verificado: `pnpm run typecheck`, `pnpm test` (23 archivos, 110 pruebas), `pnpm run build` y `git diff --check`; el build conserva la advertencia existente de chunk JavaScript >500 kB. El servidor local web/API respondió HTTP 200. Sin commit ni push. Revisión visual manual pendiente.

### Actualización de guías y ayudas — 15/10/2026

Se revisó la guía del CRM contra los flujos de estado y comunicación actuales. `src/content/user-guide.json` sigue siendo la fuente de la ayuda en pantalla y de sus resultados en la paleta de comandos; `docs/guia-de-uso.md` se regeneró desde esa fuente. Se añadió un artículo buscable que distingue estados del negocio, etapas de gestiones y marcas independientes. También se actualizaron las instrucciones de verificación, inicio de gestiones, Contactar/Email/WhatsApp, respuestas entrantes, cierres y motivos, recontacto, acompañamiento de ficha, modelos, vistas, papelera, administración e importaciones. Se retiraron referencias a secuencias y a etapas genéricas configurables que ya no describen el producto.

El panel “Cómo avanzar con esta gestión” ahora muestra el catálogo real según tipo, aclara que se pueden saltar etapas abiertas y separa la orientación histórica de las gestiones sin tipo. Se añadió una comprobación al recorrido de navegador de la guía. `pnpm run typecheck`, `pnpm test` (23 archivos, 110 pruebas), `pnpm run build` y `tests/browser/guide.e2e.ts` pasaron. El recorrido se ejecutó en `http://localhost:5173` con respuestas de API interceptadas; no escribió en la base. El build conserva el aviso de chunk mayor a 500 kB.

## Publicación de ajustes UX y guías — 15/10/2026

Los ajustes de interfaz, formularios, tooltips y guías se publicaron en la rama `feat/crm-ux-polish` y el [PR #105](https://github.com/qazuor/hospeda-leads/pull/105) ya fue mergeado en `staging`. Esto no implica merge a `main` ni deploy. Revisión visual manual pendiente.

## Integración local de estados, comunicación y ajustes de UI — 16/10/2026

El branch `feat/ui-aesthetic-functional-tweaks` se reubicó sobre el `staging` actualizado (`8a3095f`). Las implementaciones principales de estados y comunicación ya estaban integradas mediante el PR #103. De los dos worktrees locales, se incorporaron las decisiones de producto de estados y comunicación que faltaban, y se reforzó el test de migración para verificar la conservación de `Es cliente` y `No contactar` en la auditoría. Las variantes locales de componentes eran anteriores a los tooltips de `staging`; se conservaron las versiones actuales. La edición local de la migración 019 se excluyó porque las migraciones aplicadas son inmutables.

Validación en el branch: `pnpm run typecheck`, `pnpm test` (23 archivos, 110 pruebas), `pnpm run build` y `git diff --check`. El build conserva la advertencia existente de chunks mayores a 500 kB. Los tres commits de UI y la documentación/prueba complementaria quedaron integrados en `staging` mediante el commit `924d186` el 16/10/2026. Sin merge a `main` ni deploy confirmado.

## Reparto de responsables en producción — 15/10/2026

Por instrucción directa del propietario, se redistribuyeron los negocios no filtrados ni eliminados en orden ascendente por ID entre los cuatro usuarios con `role='user'`, excluyendo a Julián. Los 356 negocios filtrados o en Papelera conservaron su responsable. Quedaron 883 negocios asignados a cada usuario elegible. Se actualizaron 2.460 filas de `crm_accounts.assigned_user_email` y `updated_at`, con un evento `account_updated` por negocio en `crm_commercial_journal`. No se modificaron responsables de gestiones. La verificación posterior confirmó que cada uno de los cuatro usuarios tiene negocios de Alojamiento, Experiencias y Gastronomía. No repetir la operación como parte de un deploy o cambio de código.

El respaldo completo, manifiesto de reversión y scripts de rollback quedaron fuera de Git. La validación consistió en consultas SQL de solo lectura antes y después, más verificaciones dentro de la transacción. No hubo cambios de código ni pruebas de aplicación en esta operación.

## Acciones de negocios siempre visibles

En la rama `feat/ui-aesthetic-functional-tweaks`, las acciones Abrir, Contactar, Archivar y Eliminar quedan siempre visibles en tabla y grilla; las no permitidas se muestran deshabilitadas con explicación. La columna de acciones tiene un ancho mínimo de 150 px para evitar recortes. También se quitó el resaltado de columna que se activaba al pasar por un encabezado. `pnpm run typecheck` y `git diff --check` pasaron. Commits locales; sin push ni PR.


## Pulido visual de la ficha de negocio · PR 1/2 · 23/10/2026

Rama `ux/business-page-polish`. Primer paso del rediseño de `/accounts/:accountId` pedido por el propietario (falta de jerarquía visual). Cambios: escala tipográfica y ritmo de secciones bajo `.businessDetail` (títulos de sección 18 px, subsecciones 15 px, texto secundario 13 px) y limpieza de reglas CSS repetidas sin cambiar el resto de pantallas; el historial muestra 5 eventos y «Ver N más»; Datos del negocio muestra solo campos cargados y resume los vacíos en «Sin cargar: …»; los selectores de gestión/actividad de un documento nuevo pasan dentro de «Agregar documento o recurso»; «Registrar respuesta recibida» y «Ver tareas» dejan de ocupar todo el ancho. Sin cambios de API, permisos ni etiquetas existentes.

Medido sobre un negocio sintético con 34 eventos (solapa «Qué pasó»): 9657 → 3594 px de alto a 1280 px y 10614 → 4510 px a 390 px, sin scroll horizontal.

Validación local: `npm run typecheck`, `npm test` (122 archivos, 926 pruebas) y `npm run build` pasaron. E2E de la ficha sobre base Docker descartable: 38 de 39 pasaron; `commercial.e2e.ts` falla en el paso «CRM template» también con el build de `staging` en el mismo entorno local (en CI depende de datos que crean las integraciones previas), por lo que no se atribuye a este cambio. PR 1/2 mergeado en `staging` como #230 (`18db09c`).

## Ficha de negocio · PR 2/2 · 23/10/2026

Rama `ux/business-page-tabs`. Encabezado compacto (estado junto al nombre; datos y responsable; persona y canales; «Último contacto» desde la misma consulta del historial), Próximo paso como única tarjeta destacada y solapas «Historial», «Tareas», «Comunicación» y «Gestiones · Personas · Datos», con los `?section=` viejos redirigidos. «Copiar nombre para agendar» pasa a «Más acciones del negocio» (sigue visible en solo lectura). Se quitó «Resumen para retomar». El calendario de la fecha de recontacto se abre hacia arriba para no tapar «Guardar». La Ayuda y `docs/guia-de-uso.md` se actualizaron. Sin cambios de API ni permisos.

Medido sobre el negocio sintético: solapa Historial 2192 px a 1280 px y 2630 px a 390 px, sin scroll horizontal; a 390 px las solapas aparecen en y≈772 cuando Próximo paso está vacío y en y≈1057 con una tarea.

Validación local: `npm run typecheck`, `npm test` (122 archivos, 926 pruebas) y `npm run build` pasaron. Suite de navegador completa sobre base Docker descartable: 193 de 194; `commercial.e2e.ts` se detiene en el paso «CRM template», igual que con el build de `staging` en este entorno (en CI pasó con #230).
