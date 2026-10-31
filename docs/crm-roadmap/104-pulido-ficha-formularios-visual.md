# Spec 104 — Pulido de ficha, formularios y visual

Estado: **borrador para revisión del propietario** (31/10/2026). Origen: smoke en producción del 30/10/2026, hallazgos 22 a 38 (34 y 35 ya resueltos, ver 3.0). Tipo: un lote grande de correcciones visuales, de copy y de formularios **implementables sin decisiones del propietario** (bloques 1, 2 y 3) y un bloque de cambios que **dependen de las decisiones de la sección 11** (bloque 4: nombre de la etapa de derivación, restricciones para vendedores, persona preseleccionada, valores fuera de catálogo, ciudades existentes y encabezado del email). Migración: **ninguna** con las recomendaciones salvo D1 opción 2 (`059_*` o el siguiente número libre al implementar: la `056`, la `057` y la `058` quedan reservadas en forma condicional por las specs 101, 102 y 103). **Ningún bloque escribe datos de producción**: lo que corrige datos existentes queda como runbook para el propietario.

Parte de la [spec 53](53-business-and-management-state-model.md) (derivación a Leandro, catálogos fijos), la [spec 90](90-business-communication-view.md) (columna izquierda de la ficha, restricciones solo en «Preferencias y restricciones de contacto»), la [spec 91](91-communication-polish.md) (barra de acciones de «Comunicación»), la [spec 96](96-contact-three-clicks.md) y la [spec 99](99-registro-honesto-de-contactos.md) (qué cuenta como contacto). Respeta `AGENTS.md` (las tareas visuales no cambian contratos, permisos ni reglas de negocio; Mantine, los wrappers compartidos y `CrmLayout` antes que UI nueva; fechas de Argentina con `crmDates.tsx`; búsqueda sin tildes pero ñ ≠ n; catálogos comparan exacto; permisos en el servidor; nada de escrituras en producción; migraciones inmutables) y `docs/decisiones.md` (línea 38: catálogos con sus valores reales, sin equipararlos en silencio; línea 50: pedidos visuales no autorizan cambiar endpoints, datos, permisos ni reglas; línea 104 y 122: etapas fijas en la aplicación; línea 108 y 132: derivación a Leandro, solo admin la desactiva; línea 151: No contactar solo lo levanta admin; línea 287: «Agregar documento»; línea 315: restricciones técnicas en la columna izquierda; línea 338: avisos por encima de diálogos y arriba al centro con un diálogo abierto; línea 380: **siempre el camino más simple para el vendedor**). El trabajo solo de accesibilidad está diferido por el propietario: esta spec no suma tareas de accesibilidad.

## 1. Problema

Hallazgos del smoke, en palabras del propietario:

1. **(22)** El último bloque de la columna de datos del negocio tiene tres columnas en muy poco ancho: el texto se corta letra por letra.
2. **(23)** Faltan datos en la ficha: no muestra Instagram, Facebook ni Maps, ni los lista en «Sin cargar»; el sitio web no es un enlace.
3. **(24)** Inconsistencias de personas: «Sin contactos registrados» aunque hay una persona; «Anotar lo que pasó» dice «Sin persona registrada»; «Persona de contacto» vacía en Gestiones.
4. **(25)** Los selectores muestran opciones viejas como «Duenio (histórico)» y «Whatsapp (histórico)».
5. **(26)** La solapa Comunicación de la gestión no tiene botones de canal.
6. **(27)** Textos raros: la tarjeta dice «VENTA CERRADA SIN VENTA»; la etapa «Derivada a Leandro» tiene un nombre propio fijo; «1 gestiones».
7. **(28)** La casilla «Definir fecha para retomar» no muestra el tilde al marcarla.
8. **(29)** Desde el panel de restricciones un vendedor no puede agregar ninguna.
9. **(30)** Documentos: el texto vacío dice que uses «Agregar documento», pero el vendedor no puede cargar.
10. **(31)** «Agendar encuentro» abre con Tipo «Llamada».
11. **(32)** El selector de negocio va en dos pasos aunque la búsqueda devuelva un solo resultado.
12. **(33)** El calendario tapa el campo Hora; la hora se ve «03:00 PM» (tiene que ser 24 h, es-AR); la validación nativa del navegador aparece en inglés.
13. **(36)** Avisos (toasts): se pierden contra el fondo; los de éxito tardan mucho en irse; uno quedó trabado tapando un diálogo.
14. **(37)** Ciudades duplicadas o sin tilde: «San Jose»/«San José», «Federacion», «Chajari».
15. **(38)** La vista previa del email dice «INVITACION», sin tilde y con un propósito que no corresponde.

## 2. Objetivos y no objetivos

### Objetivos

1. La ficha del negocio se lee bien en la columna izquierda, muestra todos los enlaces cargados (navegables) y lista los vacíos en «Sin cargar» (bloque 1).
2. «Persona», «contacto» y «Persona de contacto» dicen lo mismo en la ficha, en «Anotar lo que pasó» y en Gestiones (bloques 1 y 2).
3. La vista de gestión permite contactar desde «Comunicación» igual que la ficha del negocio (bloque 1).
4. Ningún texto contradice los permisos del usuario (documentos, restricciones) ni tiene errores de concordancia (bloques 1 y 2).
5. Los formularios abren con valores coherentes (tipo de encuentro, negocio único), muestran fecha y hora en formato argentino de 24 h y validan en castellano (bloque 2).
6. Los avisos se distinguen del fondo, los de éxito se van solos en pocos segundos y ninguno tapa las acciones de un diálogo o panel (bloque 3).
7. No se pueden crear ciudades duplicadas que solo difieren en tildes o mayúsculas (bloque 2).

### No objetivos

- Corregir datos existentes en producción: ciudades duplicadas, valores «Duenio» o «Whatsapp» guardados, nombre de etapa guardado en `crm_stages`. Van como runbook o decisión del propietario (D1, D4, D5).
- Cambiar quién puede registrar o levantar restricciones, No contactar o documentos sin la decisión D2.
- Cambiar qué cuenta como contacto: «Último contacto» sigue la regla de la spec 99 (`contactEvidence.ts`).
- Cambiar el mecanismo de la derivación (busca un único usuario llamado Leandro, `pipeline.ts:157-158`); solo el nombre visible es materia de D1.
- Trabajo solo de accesibilidad.

## 3. Hallazgos

Verificado en `origin/staging` el 31/10/2026 (rama `docs/spec-104-polish`, `db0b915`). Las líneas citadas son de esta rama.

### 3.0 Ya resueltos (34 y 35)

Los hallazgos 34 y 35 («Para retomar» con «Todos» y «Hasta» vacío; «Próximas acciones» abierta) se resolvieron en el bloque 5 de la [spec 100](100-requiere-accion-compacto.md), mergeado a `staging` en #303. No se tocan acá.

### 3.1 Tres columnas en la columna izquierda (22, bug)

`BusinessSidebar` dibuja «Datos del negocio» como `<dl className={styles.businessFacts}>` (`src/components/BusinessSidebar.tsx:93`). `.businessFacts` tiene `grid-template-columns:repeat(3,minmax(0,1fr))` (`src/components/Commercial.module.css:25`), pensado para el ancho completo. La columna izquierda mide entre 260 y 320 px (`.recordColumns{grid-template-columns:minmax(260px,320px) …}`, `:97`), así que cada columna queda en unos 75 px. El valor usa `overflow-wrap:anywhere` (`.businessFacts dd`, `:25`; `.researchValue`, `:41`): un email o una URL se parte en cualquier letra. La única regla que pasa a una columna es por ancho de pantalla (`@media(max-width:700px)`, `:28`), no por ancho de la columna.

**Propuesto.** Bloque 1: dentro de `.businessAside`, `.businessFacts` usa una columna (`grid-template-columns:minmax(0,1fr)`) con etiqueta arriba y valor abajo; las URLs largas se muestran recortadas con puntos suspensivos y el valor completo en el `title`. El resto de usos de `.businessFacts` (ancho completo) no cambia.

### 3.2 Enlaces faltantes en la ficha (23, bug)

- La lista de campos de «Datos del negocio» es `businessDataFields` (`src/components/CommercialPanel.tsx:48`): `ciudad, tipo, subtipo, telefono, email, sitioWeb, direccion, provincia, whatsapp, businessNotes, discoverySource, verificationUrls, verifiedOn`. **No incluye** `urlGmap`, `perfilInstagram`, `perfilFacebook`, `perfilAirbnb`, `perfilBooking` ni `perfilTurismoEntreRios`, aunque `fieldLabels` ya tiene sus etiquetas (`:47`). Como `splitEmptyFields` solo mira esa lista (`:99`), esos campos no aparecen ni cargados ni en «Sin cargar».
- El valor se pasa crudo (`value:d.account[field]`, `:138`) y se dibuja como texto (`BusinessSidebar.tsx:93`): el sitio web no es un enlace.
- Ya existen las piezas: `instagramProfileUrl` (`src/helpers/instagramChat.ts:27`) arma la URL del perfil desde el usuario guardado, y el patrón de enlace externo del proyecto es `target="_blank" rel="noopener noreferrer"` (`src/components/SalesMaterialPreview.tsx:31`, `DocumentPreviewDialog.tsx:43`). `BusinessChannel` (`src/components/BusinessChannel.tsx:9-12`) muestra canales con ícono pero sin enlace.

**Propuesto.** Bloque 1: un grupo «Enlaces» dentro de «Datos del negocio» con Sitio web, Google Maps, Instagram, Facebook, Airbnb, Booking y Turismo Entre Ríos, cada uno como enlace con ícono cuando el valor es una URL `http(s)` válida (o, para Instagram, un usuario que `instagramProfileUrl` convierte); si no lo es, se muestra como texto con «(no es un enlace válido)». Los vacíos se suman a «Sin cargar». Abrir un enlace **no registra nada**: ver un perfil o un sitio no es contactar (AGENTS: abrir un canal no es evidencia de contacto) y no pasa por el flujo de «Contactar» ni por la barrera del script. Con No contactar los enlaces siguen visibles (mirar no es contactar).

### 3.3 Personas y contactos (24, bugs de copy y de lectura)

**«Sin contactos registrados».** Es el renglón de **último contacto** del encabezado (`CommercialPanel.tsx:129`): `lastContact` viene de la evidencia de contacto de la spec 99, no de las personas. Con una persona cargada y ningún contacto registrado se lee como «no hay personas». Es copy.

**«Sin persona registrada» en «Anotar lo que pasó».** Es el resumen «Revisá lo que se guardará» (`src/components/WorkEditor.tsx:228`): muestra las personas **elegidas** (`contactIds`). En una actividad nueva la lista de casillas «Personas participantes» (`:206`) vive dentro de «Participantes y notas (opcional)», plegado por defecto (`:204`, `open={!!item}`): el vendedor no ve la casilla y el resumen dice «registrada», como si el negocio no tuviera personas. Copy más un camino visible para elegir; preseleccionar es D3.

**«Persona de contacto» vacía en Gestiones.** El listado de Gestiones (`entity:'opportunity'`) lee la tabla `leads` cruda (`src/endpoints/leads_GET.ts:70`) y su columna heredada `contact_name`, que las gestiones creadas en el CRM no completan: la persona se guarda en `leads.primary_contact_id` (`migrations/004_commercial_foundation.sql:40`). El listado de Negocios sí resuelve la persona con `coalesce(pc.name,l.contact_name)` (`src/helpers/businessTable.ts:24`). El filtro de texto `contactName` usa la misma columna cruda (`leads_GET.ts:23`), así que tampoco encuentra por la persona real.

**Propuesto.** Bloque 1 (encabezado y Gestiones) y bloque 2 (editor):
- Encabezado: «Último contacto: todavía no hay ninguno registrado» (y el resto del renglón igual).
- Editor: el resumen dice «Ninguna persona elegida» con un botón «Elegir personas» que despliega «Participantes y notas» y lleva el foco a la lista. Si el negocio no tiene personas: «El negocio no tiene personas cargadas».
- Gestiones: en `entity:'opportunity'`, `contactName` sale de `coalesce(persona principal de la gestión, persona principal del negocio, leads.contact_name)` (personas no borradas), y el filtro de texto usa la misma expresión. Es la misma regla que el listado de Negocios aplicada a la gestión; no cambia la forma del contrato (`contactName:string|null`).

### 3.4 Opciones «(histórico)» en los selectores (25)

**Origen.** Cargo y Canal preferido de una persona salen de los catálogos `crm_contact_positions` y `crm_contact_channels` de `app_settings` (`src/endpoints/settings_GET.ts:67-68`; semilla en `migrations/005_contact_select_options.sql:3-4`: «Propietario/a», …; «WhatsApp», …). El selector del editor agrega una opción `{valor} (histórico)` **solo cuando el valor guardado del registro no está en el catálogo** (`src/components/CommercialEditor.tsx:86`; lo mismo para Vertical en `:108`). «Duenio» y «Whatsapp» son valores guardados en personas (probablemente importados), que no coinciden en forma exacta con «Propietario/a» ni con «WhatsApp».

**Conclusión.** El código ya cumple «no esconder un valor que el registro tiene; mostrarlo solo cuando está elegido». Lo que confunde es la etiqueta «(histórico)», que suena a opción del catálogo. Equiparar «Whatsapp» con «WhatsApp» o «Duenio» con «Propietario/a» va contra la línea 38 de decisiones y contra «catálogos comparan exacto»; corregir los valores guardados es una operación de datos (D4).

**Propuesto.** Bloque 2: la opción del valor guardado pasa a decir «{valor} · no está en la lista» y debajo del selector aparece, solo en ese caso, «Este valor no está en la lista actual. Elegí uno de la lista para corregirlo.». Al elegir otra opción, el valor viejo desaparece del selector. La normalización de los registros existentes es D4.

### 3.5 «Comunicación» de la gestión sin botones de canal (26, bug)

`CommunicationActionBar` muestra «WhatsApp», «Instagram» y «Email» solo si recibe `onContact` (`src/components/communication/CommunicationActionBar.tsx:71`, `showContact=!view.readOnly&&!!onContact`). La ficha del negocio se lo pasa (`CommercialPanel.tsx:145`) y abre `BusinessContactDialog` (`:149`). La vista de gestión no: `<CommunicationPanel leadId={…} readOnly={readOnly}/>` (`src/components/LeadDetailDialog.tsx:291`) sin `onContact` ni `onSendMaterial`. Además, `onWhatsApp` y `onEmail` de `LeadDetailDialog` (`:79,87-88`) llegan desde `sale.tsx` pero el componente no los usa; el único camino del modelo viejo (`ContactTemplateDialog`) es `?contact=` en la URL (`src/pages/sale.tsx`).

**Propuesto.** Bloque 1: la vista de gestión pasa `onContact` y `onSendMaterial` a `CommunicationPanel`, que abren `BusinessContactDialog` con `initialLeadId` = esta gestión (la prop ya existe, `src/components/BusinessContactDialog.tsx:45,57`) y el `CommercialDetail` del negocio (la misma consulta que ya hace la sección compacta del negocio). Mismas reglas de bloqueo que en la ficha (`contactChannelBlock`, barrera del script, permisos del responsable): no hay permiso nuevo. Se quitan las props muertas `onWhatsApp`/`onEmail` (y sus pasajes en `sale.tsx`); `?contact=` se conserva sin cambios.

### 3.6 Textos (27)

- **«VENTA CERRADA SIN VENTA»** (bug de copy): `NextWork.tsx:41`, rótulo para `classification==='lost'`. Propuesto: «GESTIÓN CERRADA SIN VENTA».
- **«1 gestiones»** (bug): conteos sin singular en `OpportunityStart.tsx:34` (selector de negocio al iniciar gestión; es el más visible), `BusinessTrashPanel.tsx:26`, `pages/reactivation.tsx:30`, `pages/trash.tsx:63,77` y `PipelineBoard.tsx:35`. Ya existe `plural(count,singular,plural)` (`src/content/vocabulary.ts:37`). Propuesto: usarlo en todos, más una búsqueda del mismo patrón con «negocios», «personas», «tareas» y «mensajes» en el mismo PR.
- **«Derivada a Leandro»** (decisión D1): el nombre visible está en **dos lugares**: el catálogo del código (`src/helpers/businessManagement.ts:15,27,37,52,60`) y la columna `display_name` de `crm_stages` (`migrations/019_business_management_workflows.sql:43,53,61,74,80`), que es lo que muestra `stageDisplayName` (`src/helpers/stageTransition.ts:11`). Las claves (`main:leandro`, …), la marca `referred_to_leandro` y la búsqueda del usuario «leandro» (`pipeline.ts:157-158`) son de almacenamiento o de mecanismo y no se ven. Cambiar el texto visible en forma coherente pide código **y** una migración nueva que actualice `display_name` (un cambio de datos de catálogo en producción: necesita aprobación del propietario). La derivación misma es una decisión vigente (decisiones, líneas 108 y 132).

### 3.7 Casilla sin tilde (28, bug)

La casilla está dentro de `<fieldset className={styles.form}>` del diálogo de etapa (`src/components/Pipeline.tsx:84,86`). `Pipeline.module.css` aplica a **todo** `input` del formulario `width:100%`, `background`, `border`, `padding:8px` (línea 1), `min-height:44px` (línea 3) y `border-radius:12px` (línea 9). El `<input>` de la casilla de Mantine es el mismo elemento que dibuja el fondo marcado y sobre el que se posiciona el ícono del tilde: con esas reglas se deforma y el tilde no se ve. El resto de las casillas del mismo diálogo («Cerrar también las otras gestiones abiertas», «Revisamos qué se entrega…», «Marcar este negocio como cliente») tienen el mismo problema. Precedente de la solución en el proyecto: `Communication.module.css:15` excluye `input:not([type=checkbox]):not([type=radio])`.

**Propuesto.** Bloque 2: en `Pipeline.module.css`, las tres reglas pasan a `input:not([type=checkbox]):not([type=radio])`. Revisión del mismo patrón (`.form input`, `.x input{`) en los demás `*.module.css` que contienen casillas; lo que aparezca, en el mismo PR.

### 3.8 Restricciones técnicas para vendedores (29, intencional; decisión D2)

**Es intencional hoy.** El servidor rechaza a quien no es admin: «Solo un administrador puede registrar restricciones técnicas manuales.» (`src/helpers/communicationService.ts:633`). La pantalla muestra el formulario solo a admin (`src/components/TechnicalRestrictions.tsx:40-46`) y «Levantar restricción» también (`:51`). La spec 57 describe la restricción manual como «marcada manualmente por administrador» (`57-communication-code-gap-analysis.md:73`). Marcar No contactar desde la política también es solo admin (`ContactPolicy.tsx:13`), pero un vendedor **sí** registra «Pidió no ser contactado» desde «Anotar lo que pasó» (`canRecordDoNotContact`, `WorkEditor.tsx:131`), que bloquea todo el negocio.

**Problema real.** El vendedor ve el panel con «No hay restricciones técnicas por canal.» (`:47`) y ninguna explicación de quién las registra ni qué hacer si el negocio pidió no ser contactado **por un canal**. No hay decisión escrita sobre una restricción por canal pedida por el negocio a un vendedor.

**Propuesto.** Bloque 2 (sin decisión, solo copy): para quien no es admin, debajo de la lista: «Las restricciones por canal las registra un administrador. Si el negocio pidió que no le escriban por un canal, avisale a un administrador. Si pidió no ser contactado por ningún medio, registralo desde «Anotar lo que pasó» → «Pidió no ser contactado».». Cambiar el permiso es D2.

### 3.9 Documentos: copy según permiso (30, bug)

El texto vacío dice siempre «Usá «Agregar documento o recurso» para crear uno propio.» y, para quien no es admin, agrega «Los documentos nuevos los carga un administrador; si falta alguno, pedíselo.» (`src/components/ResourcesPanel.tsx:103`). El botón existe solo para admin (`:101`, `(!readOnly&&admin)`), y el servidor lo exige (`src/helpers/resourceService.ts:38`). Para el vendedor las dos frases se contradicen.

**Propuesto.** Bloque 1: la frase del botón solo para admin (no solo lectura); el vendedor ve solo «Los documentos los carga un administrador; si falta alguno, pedíselo.». Sin cambio de permisos.

### 3.10 Formularios (31, 32, 33)

**«Agendar encuentro» abre con «Llamada» (31, bug).** «Hoy» en modo agenda abre `setEditor({kind:'task'})` (`src/pages/my-day.tsx:53`), igual que «Agendar tarea». El editor elige `preferredType='call'` para toda tarea (`WorkEditor.tsx:61-62`). Los tipos de agenda existen: `meeting` «Reunión» y `visit` «Visita», con `agenda=true` (`migrations/006_tasks_activities.sql:9-10`; `types[].agenda` en `work.schema.ts:38`).
Propuesto (bloque 2): `WorkTarget` suma `agenda?:true`; con ella, el tipo inicial es el primer tipo activo con `agenda` y el selector «Tipo» lista primero los de agenda. «Anotar encuentro realizado» hace lo mismo para la actividad.

**Negocio en dos pasos (32, bug).** Sin negocio fijado, el editor muestra «Buscar negocio» y debajo un `<select>` «Negocio» con «Elegí un negocio» (`WorkEditor.tsx:192`); la búsqueda (`lookup`, `:112`) solo llena las opciones (`choices`, `:116`). Con un único resultado igual hay que abrir el selector y elegirlo.
Propuesto (bloque 2): si la búsqueda escrita (2 caracteres o más, ya con el retardo de 250 ms) devuelve **exactamente un** negocio y no hay uno elegido, queda elegido y se muestra «Negocio: H123 · Nombre · Ciudad» con «Cambiar». Nunca se cambia un negocio ya elegido por una búsqueda posterior. Con varios resultados, el selector como hoy, con «H123 · Nombre · Ciudad» para distinguir homónimos.

**Calendario, hora y validación (33, bugs).**
- El calendario de `CrmDateInput` (Mantine `DateInput`, `src/components/ui/CrmDateInput.tsx:22-29`) se abre debajo y tapa «Hora (opcional)», que va en la fila siguiente (`WorkEditor.tsx:197-198`).
- La hora es `<Input type="time">` nativo (`WorkEditor.tsx:198`) y «Fecha y hora real» es `datetime-local` nativo (`:211`). El formato de 12 h lo decide el navegador con el idioma del sistema; `lang="es"` (`index.html:2`) no lo cambia.
- `Input`, `NativeSelect` y `Textarea` ya reemplazan el globo nativo por un mensaje en castellano (`src/components/ui/useInlineInvalid.ts:10-21,48`; `Input.tsx:22`). `CrmDateInput` **no** (pasa `required` al `input` de Mantine sin `onInvalid`): ahí sale «Please fill out this field.». Lo mismo con `Checkbox` (`src/components/Checkbox.tsx`). Además, el `max` de `datetime-local` da «El valor máximo es 2026-10-31T14:05» (`invalidMessage`, `:18`).
Propuesto (bloque 2):
- `CrmTimeInput` en `src/components/ui/` sobre el selector de hora de `@mantine/dates` 9.7.1 con formato de 24 h (confirmar el nombre y las props del componente con Context7 antes de implementar), con `useInlineInvalid`. Reemplaza la hora de la tarea; «Fecha y hora real» pasa a `CrmDateInput` + `CrmTimeInput` (mismo valor `YYYY-MM-DDTHH:mm` hacia `argentinaInstant`, sin cambio de contrato).
- Fecha y hora en la misma fila (dos columnas, una en el celular), así el calendario no tapa la hora; el calendario se cierra al elegir (comportamiento por defecto de Mantine, se fija en la prueba).
- `CrmDateInput` y `CrmTimeInput` usan `useInlineInvalid`; `invalidMessage` muestra fechas y horas en formato argentino («No puede ser posterior a hoy 14:05») con `crmDates.tsx`.

### 3.11 Avisos (36)

**Se pierden contra el fondo.** `.toast` es una tarjeta blanca (`var(--card)` #FFFFFF) con borde `var(--border)` #E3E8F0 y `var(--shadow-md)` (`src/components/SonnerToaster.module.css:10-22`; tokens en `src/base.css:37-38,46,62`), sin distinción por tipo. Sobre un diálogo o una tarjeta blanca no se distingue. Además las reglas están en `@layer base`, que pierde contra cualquier regla sin capa.
Propuesto (bloque 3): borde más marcado y una franja de color a la izquierda según el tipo (`[data-type=success|error|warning|info]`, con `--success`, `--destructive`, etc.), sombra `--shadow-lg` y las reglas fuera de `@layer base`. Mismo componente y mismas clases.

**Los de éxito tardan.** `crmSuccess` fija `duration:8000` para todo éxito (`src/helpers/crmFeedback.ts:3-4`), e igual varios llamados directos (`InlineBusinessBadge.tsx`, `TaskPostponeMenu.tsx`, `BusinessRowActions.tsx`, `PersonalViewsDialog.tsx`: 8000; `SalesMaterialPanel.tsx`: 10000). Sonner pausa el tiempo mientras el puntero está encima.
Propuesto (bloque 3): éxito sin acción, 4000 ms; éxito con acción (destino, Deshacer), 8000 ms; errores sin cambio. Una constante compartida (`TOAST_MS` en `crmFeedback.ts`) en lugar de números sueltos.

**Uno quedó trabado tapando un diálogo.** El avisador se mueve arriba al centro mientras `useHasOpenDialog()` es verdadero (`src/components/SonnerToaster.tsx:18-21`; decisión de la línea 338). Ese estado lo alimenta solo `useDialogLayer`, que usan `Dialog` (`src/components/Dialog.tsx:77`) y `CrmDialog` (`src/components/ui/CrmDialog.tsx:17`). Hipótesis, de más a menos probable (no hay registro del caso):

| # | Hipótesis | Evidencia | Cómo se confirma |
| --- | --- | --- | --- |
| H1 | **Paneles que no registran su capa.** `BusinessPreviewDrawer` usa el `Drawer` de Mantine directo (`src/components/BusinessPreviewDrawer.tsx:64`), igual que el menú «Otras secciones» del celular (`AppLayout.tsx:65`). Con ellos abiertos el avisador queda abajo a la derecha, justo sobre el pie del panel lateral derecho | Búsqueda de `Drawer`/`Modal` fuera de los wrappers | Abrir la vista previa de un negocio y disparar un aviso |
| H2 | **El aviso arriba al centro queda bajo el puntero** (encabezado del diálogo, botón de cerrar) y Sonner pausa el tiempo mientras está encima: parece trabado | Comportamiento de Sonner; avisos de 8000 o 10000 ms | Prueba manual con el puntero sobre el aviso |
| H3 | Un aviso con `duration:Infinity` (`UserscriptRequirement.tsx`) es intencional y no debería aparecer sobre un diálogo | Búsqueda de `duration` | Revisar el caso si el propietario lo reconoce |

Propuesto (bloque 3): H1, `BusinessPreviewDrawer` y el `Drawer` de `AppLayout` llaman a `useDialogLayer(opened)` (o se pasan a `CrmDialog`), y una prueba estática falla si aparece un `Modal` o `Drawer` de Mantine fuera de los wrappers. H2, con un diálogo abierto el avisador usa un desplazamiento superior que lo deja por encima del encabezado del diálogo, y los avisos de éxito quedan en 4000 ms. Si el propietario recuerda en qué pantalla pasó, se confirma antes de implementar.

### 3.12 Ciudades duplicadas (37)

**Cómo entran.** La ciudad del negocio es texto libre: `CommercialEditor` (campo `ciudad`, `src/components/CommercialEditor.tsx:27`) y `BusinessQuickCreate` (`:76`) la escriben sin consultar nada. El catálogo `crm_cities` tiene `name UNIQUE` exacto (`migrations/001_initial.sql:18-23`) y «Agregar ciudad» de Configuración (`src/components/ClassificationSettings.tsx:77`) inserta con `onConflict(name)` exacto (`src/endpoints/settings_save_POST.ts:163-165`): «San José» y «San Jose» son dos filas. Las opciones de filtro salen de los valores distintos de los negocios (`leads_GET.ts:325`, `work.ts:125`), así que cada variante escrita aparece como opción. El editor rápido de la insignia de ciudad sí elige del catálogo (`InlineBusinessBadge.tsx:38`).

**Regla de comparación.** `normalizeSearchText` (`src/helpers/searchText.ts:2-6`) saca tildes y mayúsculas **pero conserva la ñ**: es la que corresponde. `comparisonName` de `dataNormalization.ts` convierte ñ en n y **no** se usa para esto.

**En alcance (bloque 2, sin decisión): que no entren duplicados nuevos.**
- Servidor: `addCity` rechaza un nombre cuya forma normalizada ya existe: «Ya existe «San José». Usá esa.» (409). Si la existente está inactiva, la reactiva (como hoy con el nombre exacto).
- Formularios de negocio: el campo Ciudad sugiere ciudades del catálogo mientras se escribe (Autocomplete de Mantine sobre `settings.cities`, comparando con `normalizeSearchText`). Al guardar, si lo escrito coincide normalizado con una ciudad del catálogo pero no es igual, se usa la del catálogo y se avisa «Se guardó como «San José», la ciudad de la lista.». Si no coincide con ninguna, se guarda lo escrito (hoy el catálogo no es obligatorio y esta spec no lo vuelve obligatorio).
- Pequeña aclaración: «Federacion» sola (sin «Federación» en la lista) no se puede corregir sin saber la forma correcta; eso queda para D5.

**Fuera de alcance:** unificar las ciudades y los negocios existentes (D5, runbook del propietario). Ya figura en `pendientes.md` («Ciudades duplicadas: San Jose / San José, Federacion, Chajari»).

### 3.13 Encabezado del email (38)

El rótulo sobre el título del email sale de `profileLabel(commercialProfile)` (`src/helpers/hospedaEmailLayout.tsx:13-17`): «INVITACIÓN INSTITUCIONAL» para Referente, «PROPUESTA COMERCIAL» para Consolidado e «INVITACIÓN» para todo lo demás (incluido sin perfil), **sin mirar para qué es el mensaje**: un seguimiento, un envío de material o una respuesta también dicen «INVITACIÓN». Se dibuja en 11 px, mayúsculas, `letter-spacing:1.6px` y `line-height:1.2` (`:94`).

**La tilde.** El código tiene la tilde en `staging` y en `main` (`git show origin/main`). La vista previa es un `iframe` con `srcDoc` y `charset=UTF-8` (`MessageComposer.tsx:157`). Lo probable es que el acento sobre la «Ó» mayúscula a 11 px con `line-height:1.2` quede recortado o casi invisible; no se pudo confirmar sin navegador. Paso 0 del bloque 3: captura de la vista previa en Chrome y Firefox y del email recibido en Gmail.

**Propuesto.** Bloque 3, sin decisión: `line-height` del rótulo a 1.5 y verificación del paso 0. El contenido del rótulo es D6.

## 4. Resumen de bloques

| Bloque | Hallazgos | Tipo | ¿Necesita decisión? | Migración |
| --- | --- | --- | --- | --- |
| 1. Ficha y vista de gestión | 22, 23, 24 (encabezado y Gestiones), 26, 27 (copy y plurales), 30 | Bugs y copy | **No** | No |
| 2. Formularios | 24 (editor), 25 (copy), 28, 29 (copy), 31, 32, 33, 37 (prevención) | Bugs y copy | **No** | No |
| 3. Avisos y email | 36, 38 (alto de línea y paso 0) | Bugs visuales | **No** | No |
| 4. Cambios con decisión | 27 (etapa), 29, 24 (preselección), 25 (datos), 37 (datos), 38 (rótulo) | Producto y datos | **Sí: D1 a D6** | Solo D1 opción 2 |

Los bloques 1, 2 y 3 son independientes entre sí y se pueden hacer en cualquier orden o en paralelo (tocan archivos distintos salvo `WorkEditor.tsx`, que solo toca el bloque 2). El bloque 4 se arma con las decisiones que el propietario apruebe; cada decisión es un PR chico.

## 5. Ficha y vista de gestión (bloque 1, sin decisiones)

1. **Columna izquierda (22).** Regla `.businessAside .businessFacts{grid-template-columns:minmax(0,1fr)}`; URLs con `text-overflow:ellipsis` y `title` completo; emails y teléfonos con `overflow-wrap:break-word` (corte por palabra) en lugar de `anywhere`.
2. **Enlaces (23).** `businessLinkFields` (sitioWeb, urlGmap, perfilInstagram, perfilFacebook, perfilAirbnb, perfilBooking, perfilTurismoEntreRios) en un grupo «Enlaces» de «Datos del negocio»; vacíos en «Sin cargar». Helper puro `businessLinkHref({field,value})` en `src/helpers/`: devuelve la URL solo si es `http:` o `https:` (sin `javascript:`, `data:` ni otros esquemas); un dominio sin esquema (`cabanas.com.ar`) se completa con `https://`; Instagram usa `instagramProfileUrl`. Enlace con `target="_blank" rel="noopener noreferrer"` e ícono; sin URL válida, texto. También en la ficha compacta y en la vista previa (`BusinessChannel` gana un `href` opcional).
3. **Personas (24).** Copy del último contacto; `contactName` de Gestiones con la persona principal de la gestión, luego la del negocio, luego `contact_name`, también en el filtro de texto.
4. **Comunicación de la gestión (26).** `onContact`/`onSendMaterial` en `LeadDetailDialog` hacia `BusinessContactDialog` con `initialLeadId`; foco de vuelta al botón al cerrar (como en la ficha); se quitan `onWhatsApp`/`onEmail` sin uso.
5. **Textos (27).** «GESTIÓN CERRADA SIN VENTA»; `plural()` en los seis lugares listados y en los que aparezcan con el mismo patrón.
6. **Documentos (30).** Copy por permiso.

## 6. Formularios (bloque 2, sin decisiones)

1. **Editor de trabajo (24, 31, 32, 33).** «Ninguna persona elegida» + «Elegir personas»; `agenda` en `WorkTarget` y tipo inicial de agenda; negocio único elegido solo, con «Cambiar»; `CrmTimeInput` de 24 h; fecha y hora en una fila; validación en castellano en fecha y hora.
2. **Valores fuera de la lista (25).** «{valor} · no está en la lista» y la ayuda debajo, en Cargo, Canal preferido y Vertical del editor comercial (mismo patrón en los selectores que lo repiten).
3. **Casillas (28).** `:not([type=checkbox]):not([type=radio])` en `Pipeline.module.css` y en los módulos con el mismo patrón.
4. **Restricciones (29).** Copy para quien no es admin.
5. **Ciudades (37).** Rechazo de duplicado normalizado en `addCity`; Autocomplete y ajuste a la ciudad del catálogo en `CommercialEditor` y `BusinessQuickCreate`. Helper puro `matchCatalogCity({name,cities})` en `src/helpers/` con `normalizeSearchText`.

## 7. Avisos y email (bloque 3, sin decisiones)

1. **Contraste (36).** Franja por tipo, borde y sombra; reglas fuera de `@layer base`; probado en modo claro y oscuro.
2. **Duración (36).** `TOAST_MS={success:4000,action:8000}` en `crmFeedback.ts`; los llamados con números sueltos pasan a la constante.
3. **Capa de los paneles (36).** `useDialogLayer` en `BusinessPreviewDrawer` y en el `Drawer` de `AppLayout`; prueba estática contra `Modal`/`Drawer` de Mantine fuera de `Dialog` y `CrmDialog`; desplazamiento superior con un diálogo abierto.
4. **Email (38).** Paso 0 (capturas); `line-height:1.5` en el rótulo.

## 8. Permisos y contratos

- **Ningún permiso cambia** en los bloques 1 a 3. «Comunicación» de la gestión usa las mismas reglas que la ficha (servidor y `contactChannelBlock`). Documentos y restricciones solo cambian el texto.
- Contratos: `contactName` del listado de Gestiones cambia de **valor** (la persona real en lugar de la columna heredada), no de forma; el filtro de texto acompaña. `addCity` suma una respuesta 409 para el duplicado normalizado. El resto es cliente.
- Los enlaces de la ficha no registran nada, no pasan por «Contactar» y no consultan la barrera del script.
- Ninguna escritura automática de datos existentes: el ajuste a la ciudad del catálogo ocurre solo cuando el usuario guarda ese negocio.

## 9. Componentes y funciones

| Pieza | Archivo | Cambio | Bloque |
| --- | --- | --- | --- |
| Columna del negocio | `src/components/BusinessSidebar.tsx:92-94`, `Commercial.module.css:25,41,97` | una columna, recorte de URLs, grupo «Enlaces» | 1 |
| Campos de la ficha | `src/components/CommercialPanel.tsx:47-48,99,129,138` | campos de enlace, «Sin cargar», copy del último contacto | 1 |
| Enlaces | `src/helpers/businessLinks.ts` (nuevo, puro), `BusinessChannel.tsx` | `businessLinkHref`, `href` opcional | 1 |
| Persona en Gestiones | `src/endpoints/leads_GET.ts:23,70` | `contactName` con persona principal | 1 |
| Comunicación de la gestión | `src/components/LeadDetailDialog.tsx:79,87-88,291`, `src/pages/sale.tsx` | `onContact`, `onSendMaterial`, quitar props muertas | 1 |
| Textos | `NextWork.tsx:41`, `OpportunityStart.tsx:34`, `BusinessTrashPanel.tsx:26`, `reactivation.tsx:30`, `trash.tsx:63,77`, `PipelineBoard.tsx:35` | copy, `plural()` | 1 |
| Documentos | `ResourcesPanel.tsx:103` | copy por permiso | 1 |
| Editor de trabajo | `WorkEditor.tsx:36,61-62,192,197-198,204-206,211,228`, `my-day.tsx:53` | agenda, negocio único, hora, personas | 2 |
| Hora | `src/components/ui/CrmTimeInput.tsx` (nuevo), `CrmDateInput.tsx` | 24 h, validación en castellano | 2 |
| Validación | `src/components/ui/useInlineInvalid.ts:10-21` | fechas y horas legibles | 2 |
| Valores fuera de lista | `CommercialEditor.tsx:86,108` | copy y ayuda | 2 |
| Casillas | `Pipeline.module.css:1,3,9` y módulos con el mismo patrón | excluir casillas | 2 |
| Restricciones | `TechnicalRestrictions.tsx:47` | copy para vendedores | 2 |
| Ciudades | `settings_save_POST.ts:163-165`, `src/helpers/catalogCity.ts` (nuevo, puro), `CommercialEditor.tsx`, `BusinessQuickCreate.tsx:76` | 409 por duplicado, Autocomplete, ajuste al catálogo | 2 |
| Avisos | `SonnerToaster.module.css`, `crmFeedback.ts:3-4`, llamados con `duration` | contraste, `TOAST_MS` | 3 |
| Capa de paneles | `BusinessPreviewDrawer.tsx:64`, `AppLayout.tsx:65`, `SonnerToaster.tsx` | `useDialogLayer`, desplazamiento | 3 |
| Email | `hospedaEmailLayout.tsx:13-17,94` | alto de línea; rótulo con D6 | 3, 4 |
| Etapa de derivación | `businessManagement.ts:15,27,37,52,60`, migración nueva | nombre visible (D1) | 4 |

## 10. Plan de tests

Regresión primero: cada arreglo arranca con una prueba que reproduce el caso del smoke y falla.

| Tema | Unit (`*.spec.ts(x)`) | Integración (`scripts/test-*.ts`) | E2E (`tests/browser/*.e2e.ts`) |
| --- | --- | --- | --- |
| 22 | `BusinessSidebar.spec.tsx` (nuevo): los datos se dibujan en una lista de una columna dentro de la columna izquierda (clase o estilo calculado) | — | `business-fullscreen.e2e.ts` o nuevo `business-record-polish.e2e.ts`: a 1280 px, el email de «Datos del negocio» ocupa una sola línea o se recorta, nunca una letra por línea |
| 23 | `businessLinks.spec.ts`: `https`, `http`, dominio sin esquema, `javascript:` y `data:` rechazados, usuario de Instagram, texto que no es URL. `CommercialPanel`: Instagram vacío aparece en «Sin cargar»; sitio web es un enlace con `rel="noopener noreferrer"` | — | mismo E2E: clic en el sitio abre otra pestaña y **no** crea ningún registro en «Comunicación» |
| 24 | `WorkEditor.spec.tsx`: sin personas elegidas el resumen dice «Ninguna persona elegida» y «Elegir personas» despliega la lista. `CommercialPanel`: copy del último contacto | `test-commercial.ts`: una gestión con `primary_contact_id` y `contact_name` nulo devuelve `contactName` = nombre de la persona en `entity:'opportunity'` (hoy nulo: falla); el filtro de texto por ese nombre la encuentra; una persona borrada no se usa | `commercial.e2e.ts`: la columna «Persona de contacto» de Gestiones muestra la persona |
| 25 | `CommercialEditor.spec.tsx` (nuevo o el existente): una persona con cargo «Duenio» muestra «Duenio · no está en la lista» y la ayuda; elegir «Propietario/a» la quita; un cargo del catálogo no muestra ayuda | — | — |
| 26 | `LeadDetailDialog.spec.tsx`: «Comunicación» de la gestión muestra WhatsApp, Instagram y Email; «WhatsApp» abre el contacto con esta gestión elegida; en solo lectura no hay botones | — | `business-contact.e2e.ts`: contactar por WhatsApp desde la vista de gestión, con `window.open` interceptado (ninguna prueba abre WhatsApp real) |
| 27 | `NextWork.spec.tsx`: «GESTIÓN CERRADA SIN VENTA». `OpportunityStart`: «1 gestión», «2 gestiones». Prueba estática (estilo `vocabularyGuard.spec.ts`): ningún `{n} gestiones` sin `plural()` | — | — |
| 28 | `Pipeline` (unit con el diálogo de etapa): con «Definir fecha para retomar» marcada, el `input` de la casilla no tiene `padding` ni `min-height` del formulario (estilo calculado) | — | `pipeline` E2E existente o nuevo: captura de la casilla marcada (comparación visual con umbral) |
| 29 | `TechnicalRestrictions.spec.tsx`: vendedor ve el texto nuevo y ningún formulario; admin ve el formulario | `test-communication.ts` ya cubre el 403 del vendedor (se deja como está) | — |
| 30 | `ResourcesPanel.spec.tsx`: vendedor sin documentos no ve «Usá «Agregar documento o recurso»»; admin sí | — | — |
| 31 | `WorkEditor.spec.tsx`: con `agenda:true` el tipo inicial es un tipo de agenda; sin ella, «Llamada» como hoy | — | `my-day` E2E: «Agendar encuentro» abre con «Reunión» o «Visita» |
| 32 | `WorkEditor.spec.tsx`: una búsqueda con un solo resultado elige el negocio y muestra «Cambiar»; con dos, el selector; una búsqueda posterior no cambia un negocio elegido | — | — |
| 33 | `CrmTimeInput.spec.tsx`: «15:00» se muestra «15:00», nunca «03:00 PM»; requerido vacío da «Completá este dato.». `CrmDateInput`: requerido vacío da el mensaje en castellano, no el globo nativo. `useInlineInvalid.spec.ts`: el máximo de fecha y hora se muestra «31/10/2026 14:05» | `test-work.ts`: una actividad con fecha y hora real de los dos campos nuevos guarda el mismo instante que hoy (Argentina) | `contextual-work.e2e.ts`: el calendario abierto no tapa la hora (cajas que no se superponen) |
| 36 | `SonnerToaster.layer.spec.tsx`: con `BusinessPreviewDrawer` abierto el avisador pasa arriba al centro (hoy no: falla). `crmFeedback.spec.ts`: éxito sin acción 4000 ms, con acción 8000. Prueba estática: ningún `Modal`/`Drawer` de `@mantine/core` fuera de `Dialog.tsx` y `CrmDialog.tsx` (con lista de excepciones vacía) | — | `actionable-toasts.e2e.ts`: un aviso de éxito desaparece solo antes de 6 s; con la vista previa abierta, el aviso no se superpone con el pie del panel |
| 37 | `catalogCity.spec.ts`: «San Jose» coincide con «San José», «CHAJARI» con «Chajarí», «Peña» **no** coincide con «Pena», espacios de más | `test-commercial.ts` (o el suite de configuración que corresponda): `addCity` con «San Jose» cuando existe «San José» → 409 con el nombre existente; con una inactiva, la reactiva | `classifications.e2e.ts`: agregar «san jose» muestra el aviso; crear un negocio con «San Jose» lo guarda como «San José» y avisa |
| 38 | `hospedaEmailLayout.spec.ts`: el rótulo conserva «INVITACIÓN» con tilde y el estilo tiene `line-height` ≥ 1.4; con D6, el rótulo según el propósito | — | — |

Suite de navegador completa antes del merge de cada bloque (`npm run build && npm start`, luego `npm run test:browser`; unos 10 minutos). Las integraciones corren contra una base descartable migrada y con `seed` (`CRM_TEST_DATABASE=1`, confirmando antes a dónde apunta `DATABASE_URL`). Ninguna prueba manda emails ni mensajes reales.

## 11. Decisiones abiertas

1. **D1 — Nombre visible de la etapa «Derivada a Leandro» (27).**
   - **Opción 1:** dejarlo como está.
     - Pro: cero cambio; hoy es correcto (la derivación siempre va a Leandro).
     - Contra: un nombre propio en un catálogo fijo; si cambia la persona o el rol, hay que tocar código y datos.
     - Impacto: ninguno.
   - **Opción 2:** nombre neutro elegido por el propietario (por ejemplo «Derivada a dirección comercial») en el catálogo del código **y** en `crm_stages.display_name` con una migración nueva (`059_*` o el siguiente número libre), junto con los textos que dicen «Derivado a Leandro» (encabezado de la ficha, `CommercialPanel.tsx:129`; aviso de la gestión, `Pipeline.tsx:103`; guía de usuario). Las claves, la columna `referred_to_leandro` y la búsqueda del usuario no cambian.
     - Pro: el texto deja de depender de una persona; coherente en las dos fuentes del nombre.
     - Contra: migración que modifica datos de catálogo en producción (se aplica con el deploy, necesita aprobación); el historial muestra el nombre nuevo también para derivaciones viejas.
     - Impacto: `businessManagement.ts`, migración nueva, copy en tres o cuatro archivos y la guía; pruebas de etapas.
   - **Opción 3:** nombre dinámico «Derivada a {nombre visible del usuario de derivación}», leído del usuario que encuentra `pipeline.ts`.
     - Pro: si cambia el usuario, cambia el texto solo.
     - Contra: el catálogo fijo pasa a depender de datos de usuarios; sigue siendo un nombre propio; más lógica para un texto.
   - **Recomendación: opción 1 por ahora**, salvo que el propietario quiera sacar el nombre propio; en ese caso, opción 2 con el texto que él elija. El mecanismo (buscar «leandro» por nombre) es frágil y merece su propia spec si la derivación va a cambiar de destinatario.
2. **D2 — ¿Un vendedor puede registrar restricciones por canal? (29).**
   - **Opción 1:** no (como hoy), con el texto que explica a quién avisar (bloque 2).
     - Pro: sin cambio de permisos; una restricción mal puesta bloquea un canal y solo admin la levanta.
     - Contra: el vendedor que recibe «no me escribas por WhatsApp» depende de un admin para registrarlo.
     - Impacto: solo copy.
   - **Opción 2:** el responsable del negocio (o de una gestión abierta) puede **agregar** una restricción por canal en sus negocios; levantarla sigue siendo solo admin.
     - Pro: el pedido del negocio queda registrado en el momento por quien lo recibió (línea 380: camino más simple); es una acción que solo **restringe**, nunca habilita.
     - Contra: cambio de permisos en el servidor (`communicationService.ts:633`) con sus pruebas; un vendedor podría bloquear un canal por error y esperar a un admin.
     - Impacto: servidor (misma regla de escritura que «Contactar»), `TechnicalRestrictions.tsx`, `test-communication.ts` (vendedor responsable 200, vendedor ajeno 403, levantar sigue 403), decisión nueva en `decisiones.md`.
   - **Recomendación: opción 2.** Restringir es la dirección segura y el vendedor es quien escucha el pedido; levantar queda en admin, igual que No contactar.
3. **D3 — Persona preseleccionada en «Anotar lo que pasó» (24).**
   - **Opción 1:** preseleccionar la persona cuando el negocio tiene **una sola** persona activa o cuando el editor llega desde un contacto con una persona (ya pasa con `contactIds` del destino); el resumen la muestra y se puede destildar.
     - Pro: el caso común queda bien sin abrir nada; el resumen deja ver qué se guarda.
     - Contra: cambia el valor por defecto de lo que se guarda (hoy, nadie); un vendedor apurado puede registrar a una persona que no participó.
     - Impacto: `WorkEditor.tsx` (estado inicial), prueba de unidad.
   - **Opción 2:** no preseleccionar; solo el copy y «Elegir personas» del bloque 2.
     - Pro: nada se registra sin una acción explícita.
     - Contra: la mayoría de las actividades quedan sin persona.
   - **Recomendación: opción 1** (camino más simple, y la persona queda visible en el resumen antes de guardar).
4. **D4 — Valores guardados fuera de catálogo («Duenio», «Whatsapp») (25).**
   - **Opción 1:** solo el copy del bloque 2; cada usuario corrige al editar.
     - Pro: sin escritura de datos.
     - Contra: los valores viejos siguen apareciendo en filtros y listas.
   - **Opción 2:** runbook del propietario: consulta de solo lectura que lista valores de `position` y `preferred_channel` fuera de catálogo con su cantidad; el propietario aprueba un mapeo explícito («Whatsapp» → «WhatsApp», «Duenio» → «Propietario/a», …) y un operador lo aplica con journal, como las recuperaciones anteriores (`docs/management-cleanup-runbook.md` como modelo).
     - Pro: limpia de una vez con un mapeo revisado.
     - Contra: operación de datos en producción; necesita su ventana y su verificación.
   - **Opción 3:** sumar los valores viejos al catálogo.
     - Contra: «Duenio» y «Whatsapp» quedan como opciones para todos. Descartada.
   - **Recomendación: opción 1 ahora y opción 2 cuando el propietario lo apruebe** (el runbook se escribe en el bloque 4; ningún agente lo ejecuta).
5. **D5 — Ciudades duplicadas existentes (37).**
   - **Opción 1:** runbook del propietario: consulta de solo lectura que agrupa `crm_accounts.ciudad` y `crm_cities.name` por `normalizeSearchText` y lista los grupos con más de una forma («San Jose» 12, «San José» 40); el propietario elige la forma correcta de cada grupo (y la de casos sueltos como «Federacion»); un operador actualiza negocios y catálogo con journal y desactiva las filas sobrantes de `crm_cities`.
     - Pro: corrige lo existente con una lista revisada; la prevención del bloque 2 evita que vuelva a pasar.
     - Contra: operación de datos en producción.
   - **Opción 2:** pantalla de admin «Unificar ciudades» que hace lo mismo desde la aplicación.
     - Pro: reusable sin operador.
     - Contra: pantalla nueva para un problema que, con la prevención, no se repite; más permisos y pruebas.
   - **Opción 3:** solo la prevención.
     - Contra: los filtros siguen mostrando duplicados.
   - **Recomendación: opción 1.**
6. **D6 — Rótulo del email (38).**
   - **Opción 1:** rótulo según el **propósito** del mensaje: «INVITACIÓN» solo para el primer contacto comercial; «SEGUIMIENTO», «MATERIAL», «RESPUESTA» (o ninguno en respuestas, que ya usan la variante `reply`) para los demás; el perfil comercial deja de decidirlo.
     - Pro: el rótulo dice lo que es el email.
     - Contra: hay que pasar el propósito a `buildHospedaEmailHtml` desde los tres llamadores (`communicationService.ts`, `emailReply.ts`, `templates.tsx`).
     - Impacto: firma de la función (parámetro opcional), pruebas del layout.
   - **Opción 2:** rótulo neutro fijo «HOSPEDA» más la vertical.
     - Pro: un cambio de una línea; nunca miente.
     - Contra: pierde la señal de «invitación» del primer contacto.
   - **Opción 3:** el rótulo lo define el modelo de mensaje (campo nuevo en la plantilla).
     - Contra: migración y pantalla de modelos; más de lo que pide el hallazgo.
   - **Recomendación: opción 2**, la más simple que deja de decir algo falso; la 1 si el propietario quiere conservar «INVITACIÓN» en el primer contacto.

### Decisión del propietario (31/10/2026)

- **D1:** «Derivada a Leandro» queda como está.
- **D2:** el responsable del negocio (o de una gestión abierta) puede agregar restricciones por canal; levantarlas sigue siendo solo del admin.
- **D3:** persona preseleccionada en «Anotar lo que pasó» cuando el negocio tiene una sola persona activa (visible en el resumen, se puede destildar).
- **D4:** los valores fuera de catálogo existentes se corrigen con un runbook que aprueba el propietario; ningún agente lo ejecuta.
- **D5:** las ciudades duplicadas existentes se corrigen con un runbook que aprueba el propietario; ningún agente lo ejecuta.
- **D6:** rótulo del email «HOSPEDA · {vertical}».
- **Confirmados:** en una gestión cerrada no hay botones de canal (aviso «abrí el negocio»); con un único resultado en la búsqueda de negocio aparece el botón «Elegir H123 · …» (no se elige solo). Esto resuelve el desvío del hallazgo 32.

## 12. Riesgos

- **`contactName` de Gestiones** cambia lo que muestran y filtran las vistas guardadas sobre esa columna: ahora encuentran por la persona real. Es lo correcto, pero una vista guardada por un `contact_name` viejo distinto de la persona actual puede cambiar de resultados.
- **Enlaces de la ficha:** el valor es texto libre; el helper rechaza todo esquema que no sea `http(s)` y la prueba lo fija.
- **Ajuste a la ciudad del catálogo:** cambia lo que el usuario escribió; se avisa en el momento y solo cuando la coincidencia normalizada es exacta (nunca por parecido).
- **`CrmTimeInput`:** el componente de hora de Mantine cambia el teclado en el celular respecto del nativo; se prueba a 390 px.
- **Capa de paneles:** registrar `BusinessPreviewDrawer` en `useDialogLayer` también le cambia el `z-index` calculado; se revisa que los popovers y el composer flotante sigan por encima.
- **D1 opción 2 y D2** cambian datos de catálogo o permisos: cada una con su PR, sus pruebas y la decisión registrada en `decisiones.md`.

## 13. Orden de implementación (PRs a `staging`)

Cada bloque con typecheck, `npm test`, build y sus integraciones en verde, y CI verde en el SHA del PR. Los bloques 1, 2 y 3 son independientes.

1. **Bloque 1, ficha y vista de gestión (sin decisiones):** 22, 23, 24 (encabezado y Gestiones), 26, 27 (copy y plurales), 30. Regresión de `contactName` en `test-commercial.ts` primero.
2. **Bloque 2, formularios (sin decisiones):** 24 (editor), 25 (copy), 28, 29 (copy), 31, 32, 33, 37 (prevención). Si se vuelve grande, se parte en 2a (editor de trabajo y hora: 24, 31, 32, 33) y 2b (casillas, selectores, restricciones y ciudades: 25, 28, 29, 37).
3. **Bloque 3, avisos y email (sin decisiones):** 36 y 38 (paso 0 y alto de línea).
4. **Bloque 4, con decisiones:** un PR por decisión aprobada (D1, D2, D3, D6 en código; D4 y D5 como runbooks en `docs/`, sin ejecutarlos).

## 14. Aceptación

- En la ficha a 1280 px, «Datos del negocio» se lee en una columna, sin palabras partidas letra por letra; Instagram, Facebook y Maps aparecen como enlaces o en «Sin cargar»; el sitio web abre en otra pestaña y no registra nada.
- El encabezado dice «Último contacto: todavía no hay ninguno registrado» cuando no hay contactos, aunque haya personas; «Anotar lo que pasó» dice «Ninguna persona elegida» con «Elegir personas»; la columna «Persona de contacto» de Gestiones muestra la persona principal.
- Un cargo «Duenio» se ve como «Duenio · no está en la lista» con la ayuda, solo en esa persona.
- La solapa Comunicación de una gestión tiene WhatsApp, Instagram y Email con las mismas reglas que la ficha, y abre el contacto con esa gestión elegida.
- Ninguna pantalla dice «VENTA CERRADA SIN VENTA» ni «1 gestiones».
- «Definir fecha para retomar» muestra el tilde al marcarla (y las demás casillas del diálogo de etapa).
- Un vendedor lee en el panel de restricciones a quién avisar; en Documentos no se le pide usar un botón que no tiene.
- «Agendar encuentro» abre con un tipo de agenda; una búsqueda con un solo negocio lo deja elegido; la hora se ve en 24 h («15:00»); el calendario no tapa la hora; un campo de fecha requerido vacío avisa en castellano.
- Los avisos se distinguen sobre un diálogo blanco, los de éxito se van solos en unos 4 s y ninguno tapa el pie de la vista previa de un negocio.
- Agregar «San Jose» con «San José» en la lista avisa que ya existe; un negocio nuevo con «San Jose» queda como «San José».
- La vista previa del email muestra «INVITACIÓN» con tilde visible (paso 0 documentado); con D6, el rótulo no dice «INVITACIÓN» en un seguimiento.
- `npm run typecheck`, `npm test`, `npm run build`, las integraciones listadas y `npm run test:browser` en verde; CI verde en el SHA de cada PR.

## 15. Migraciones y datos

- Con las recomendaciones, **ninguna migración**. Solo D1 opción 2 pediría una (`059_*` o el siguiente número libre al implementar; la `056`, la `057` y la `058` quedan reservadas en forma condicional por las specs 101, 102 y 103) para actualizar `crm_stages.display_name`. No se edita ninguna migración aplicada.
- **Ningún bloque escribe datos existentes en producción.** Ciudades duplicadas (D5) y valores fuera de catálogo (D4) se corrigen solo con un runbook revisado, un mapeo aprobado por el propietario para esa operación y un operador; ningún agente los ejecuta. Siguen en `pendientes.md` junto con el negocio y el documento de prueba ya listados.
- Las consultas de los runbooks son de solo lectura hasta la aprobación, y su resultado (con nombres de negocios) no se versiona: queda fuera de Git, como el resto de la evidencia privada.
