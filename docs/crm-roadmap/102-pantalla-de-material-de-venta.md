# Spec 102 — Pantalla de material de venta

Estado: **borrador para revisión del propietario** (31/10/2026). Origen: smoke en producción del 30/10/2026, hallazgo 15. Tipo: una corrección de bug (portada del PDF, **implementable sin decisiones del propietario**), una habilitación chica sin riesgo (portada manual en enlaces, **sin decisión**) y tres cambios de producto (verticales, selector de categorías y portada automática de enlaces, **dependen de las decisiones de la sección 10**). Migración: **ninguna** para los bloques 1 y 2; **una nueva** para el bloque 4 (verticales): `057_*`, o el siguiente número libre al implementar (la `056` queda reservada en forma condicional por la spec 101, bloque 4).

Parte de la [spec 89](89-material-de-venta.md) (biblioteca administrada, R2, portadas manuales), la [spec 95](95-material-de-venta-pantalla.md) (portadas automáticas en el navegador, `cover_mode`, «Generar portadas faltantes», filtros y agrupado por categoría) y la [spec 98](98-sales-material-script-panels.md) (material en los paneles del user script). Respeta `AGENTS.md` (permisos del servidor en todo camino de escritura, loading y bloqueo de doble envío, conservar lo tipeado ante un error, migraciones inmutables, una tarea visual no cambia contratos sin necesidad) y `docs/decisiones.md` (línea 22: con contexto conocido se respeta la segmentación por vertical, sin perfil/vertical explícito no se excluye nada; línea 23: la biblioteca es administrada; línea 38: los valores de vertical no se renombran ni se equiparan en silencio; línea 380: **siempre el camino más simple para el vendedor**).

## 1. Problema

Hallazgo 15, en palabras del propietario:

1. **(15a)** Marcar a qué verticales aplica cada material y filtrar solo: al enviar desde un negocio de la vertical X, mostrar primero (o solo) sus materiales. Decidir con el camino más simple del vendedor en mente; **nunca esconder todo**.
2. **(15b)** Mejorar el selector de categorías.
3. **(15c)** Generar portadas para los enlaces externos.
4. **(15d, bug)** Al subir un PDF no se generó la portada **ni se ofreció crearla**.

## 2. Objetivos y no objetivos

### Objetivos

1. Un PDF subido termina con portada, o el admin sabe **por qué** no la tiene y tiene a mano cómo generarla o subirla. Nunca más un salto silencioso.
2. Un material de enlace externo puede tener portada (manual siempre; automática si se aprueba D1).
3. El admin marca a qué verticales aplica un material; vacío significa «todas».
4. Al elegir material desde un negocio, el vendedor ve primero lo que aplica a ese negocio, sin un clic extra, y el resto queda a un clic. Nunca una lista vacía porque falte marcar verticales.
5. Elegir y crear categorías en el formulario es un solo control.

### No objetivos

- Cambiar quién administra el material (sigue siendo solo admin), los tipos de material, el formato de los enlaces `/m/` (spec 101) ni la página pública salvo su portada.
- Generar portadas en el servidor para archivos (D2 lo deja como alternativa descartada).
- Segmentar material por perfil comercial o tipo de gestión (solo vertical, lo pedido).
- Ordenar por vertical el selector del editor de modelos (`RichTemplateEditor`); queda como seguimiento posible.
- Escribir en producción. Ningún bloque toca materiales existentes: los existentes quedan «todas las verticales» y sin portada nueva hasta que un admin la genere.
- Trabajo solo de accesibilidad (diferido por el propietario).

## 3. Hallazgos

Verificado en `origin/staging` el 31/10/2026 (rama `docs/spec-102-sales-material-screen`, `bf90000`). Las líneas citadas son de esta rama.

### 3.1 PDF sin portada y sin ofrecer crearla (hallazgo 15d, bug)

**Cómo funciona hoy (spec 95 D1).** Las portadas automáticas se generan **en el navegador**, no en el servidor:
- Al crear un material de archivo sin portada manual, `SalesMaterialForm.save` llama a `autoCover` (`src/components/SalesMaterialForm.tsx:105-109,117`). Al guardar «Nueva versión», lo mismo si la portada era automática o nunca existió (`:125`).
- `autoCoverFormat` decide si hay portada posible (`src/helpers/salesMaterialAutoCover.ts:22-26`): un PDF solo si pesa **hasta 50 MB** (`AUTO_COVER_MAX_PDF_BYTES`, `:11`).
- El PDF se dibuja con `pdfjs-dist` 6.4.299 cargado por `import()` dinámico (`:76`) en `renderPdfCover` (`src/helpers/pdfThumbnail.ts:26-39`): primera página a 1200 px, con el worker por `?url` (`:2-3`). `getDocument` se llama solo con `data` o `url` (`:30`): **sin `wasmUrl`, `iccUrl`, `cMapUrl` ni `standardFontDataUrl`**, que en pdf.js valen `null` por defecto (decodificadores wasm de imágenes JPX/JBIG2, perfiles ICC de color, CMaps de fuentes CJK y fuentes estándar no embebidas).
- El JPEG resultante se sube por el camino normal de portadas (URL firmada + acción `cover` con `auto:true`, `salesMaterialAutoCover.ts:109-116`); el servidor valida tipo, tamaño y firma (`salesMaterialService.ts:80-96`) y respeta la elección manual (`:197`).
- Cada render tiene 30 s (`salesMaterialAutoCover.ts:13,97`).

**Qué ve el admin según el caso.**
- **PDF de más de 50 MB:** `autoCover` devuelve `''` sin intentar nada (`SalesMaterialForm.tsx:106`). El toast dice solo «Material guardado.». `needsAutoCover` también lo excluye (`salesMaterialAutoCover.ts:33`), así que **«Generar portadas faltantes» no aparece** (`SalesMaterialPanel.tsx:46,79`). Es exactamente «no generó portada ni ofreció crearla». La spec 95 D1 lo decidió así («quedan con el marcador»), sin avisar.
- **Falla del render o de la subida:** `saveAutoCover` atrapa el error y devuelve `{ok:false,error}` (`salesMaterialAutoCover.ts:115`), pero el formulario **descarta el motivo** y solo mira `.ok` (`SalesMaterialForm.tsx:108`). El toast de advertencia (10 s, `SalesMaterialPanel.tsx:96`) dice «La portada automática no se pudo generar: la tarjeta muestra el dibujo del formato.», sin botón para reintentar. No hay registro en consola ni en el servidor: **la causa real no queda en ningún lado**.
- Después de esa falla aparece «Generar portadas faltantes (1)» en el encabezado de la página, pero ese camino lee el archivo **desde R2** (`/_api/sales_materials/file` → 302, `salesMaterialAutoCover.ts:123`), que es otro camino (CORS + `Range`). Si también falla, el material entra en `failedAutoCoverIds` (`:118,124`) y **el botón desaparece hasta recargar**.
- No existe una acción «Generar portada» para un material puntual: el menú «Portada» (`SalesMaterialCard.tsx:63`) solo permite subir o quitar una imagen (`SalesMaterialForm.tsx:162,170`).

**Causas posibles, de más a menos probable** (no hay registro de producción que permita elegir una; el código no alcanza para saberlo):

| # | Hipótesis | Evidencia | Cómo se confirma |
| --- | --- | --- | --- |
| H1 | El PDF pesa más de 50 MB (folletos de diseñador suelen pesar eso) | Salto silencioso y sin botón: coincide con las palabras del propietario | La tarjeta muestra el tamaño (`SalesMaterialCard.tsx:49`) |
| H2 | Pestaña abierta antes del deploy del 30/10: el `import()` pide `pdfThumbnail-<hash viejo>.js`, que ya no existe (404, `staticAssets.ts:63-66`) | El smoke fue el mismo día del deploy; el error se traga | Repetir con la página recargada |
| H3 | pdf.js no puede dibujar el PDF real: imágenes JPX/JBIG2 o color CMYK/ICC sin `wasmUrl`/`iccUrl`, fuentes no embebidas, PDF con contraseña, página muy pesada (>30 s) | Las pruebas solo usan un PDF sintético de texto (`tests/browser/fixtures/pdf.ts:1-2`) | Abrir el mismo PDF en local con la consola abierta |
| H4 | Falla la subida o la verificación de la portada | Poco probable: el archivo subió por el mismo camino | El motivo del error, una vez que se muestre |

La CSP de la app es **solo de reporte** (`src/server/security.ts:7,82`, incluye `worker-src 'self' blob:`): no bloquea el worker.

**Propuesto.** Sección 5 (bloque 1, sin decisiones). Primer paso del bloque: pedir al propietario el PDF (o su tamaño y el texto exacto del toast) y reproducir con el build de producción en local. Las correcciones cubren H1 a H4 aunque no se consiga el archivo.

### 3.2 Portadas de enlaces externos (hallazgo 15c)

**Actual.**
- Para un enlace externo no se genera nada: la tarjeta dibuja un marcador con el ícono y el color de la primera categoría (spec 95 D1; `SalesMaterialCard.tsx:24-29`).
- Tampoco se puede **subir** una portada: el campo «Portada (opcional)» solo aparece para archivos (`SalesMaterialForm.tsx:162`) y el ítem «Portada» del menú también (`SalesMaterialCard.tsx:63`). **El servidor sí lo permite:** la acción `cover` no mira `source` (`salesMaterialService.ts:177,194-203`) y la subida con `purpose:'cover'` solo rechaza `purpose:'file'` en un enlace (`:66`). Es un límite solo de la interfaz.
- La página pública de un enlace muestra la portada si existe y si no el marcador (`src/server/materialPage.ts:57,64`); la vista previa de WhatsApp usa la portada o, sin ella, `hospeda-logo.jpg` (`:71`). Una portada en un enlace mejora las dos cosas.
- No hay en el servidor ningún `fetch` a URLs arbitrarias ni defensas contra SSRF (búsqueda de `ssrf`, `dns.lookup`, `isPrivate`: sin resultados); tampoco librerías de imagen (`sharp`, `canvas`) en `package.json`. La imagen de runtime es `node:22-alpine` (`Dockerfile:1`).

**Propuesto.** Bloque 2 (portada manual, sin decisión) y bloque 3 (automática, D1). Sección 6.

### 3.3 Verticales (hallazgo 15a)

**Actual.**
- La vertical de un negocio es `crm_accounts.tipo` (texto) y la de una gestión `leads.tipo` (`src/helpers/schema.tsx:174,273`); se valida contra el catálogo `crm_verticals(name, sort_order, active)` al escribir (`src/helpers/accountClassification.ts:7`). El catálogo no se edita desde la app (no hay escrituras fuera de seeds y pruebas).
- Los modelos de mensaje ya se segmentan por vertical con un texto y comparan con `canonicalVertical` (singular/plural y alias: `src/helpers/verticalColors.ts:21-24`; `messageTemplatePolicy.ts:10-12`); la vertical efectiva es `lead.tipo ?? account.tipo` (`communicationService.ts:200,341`). Es el precedente a seguir.
- El material **no tiene vertical**: `crm_sales_materials` (`migrations/046_sales_material.sql:11-25`, `051`) solo tiene categorías.
- Hay tres lugares donde un vendedor elige material para un negocio, y ninguno conoce la vertical:
  - «Enviar material» en la ficha (`CommunicationActionBar.tsx:80`) y «Agregar material» en el borrador (`MessageComposer.tsx:131`), los dos con `SalesMaterialPicker` (`src/components/SalesMaterialPicker.tsx:24-31`), que pide `GET /_api/sales_materials?kind=deliverable` y lista en el orden del servidor.
  - El panel del user script (`src/endpoints/userscript.ts:182-186`, `userscript/src/materials.ts`), que ya recibe `accountId`.
- El servidor ordena por `status, updated_at DESC` y corta en 500 (`salesMaterialService.ts:29,39`).

**Propuesto.** Sección 7 (D3, D4 y D5).

### 3.4 Selector de categorías (hallazgo 15b)

**Actual.** En «Nuevo material» / «Editar material» hay dos controles separados (`SalesMaterialForm.tsx:159-160`): un `MultiSelect` «Categorías» con búsqueda y, debajo, un campo «Nueva categoría» con su botón «Crear categoría», que crea la categoría (`category_create`, `:93-99`) y la deja elegida. Para crear una hay que notar el segundo campo, escribir, apretar el botón y volver a mirar el primero. La administración completa sigue en Configuración → «Categorías de material» (`SalesMaterialCategories.tsx`). El wrapper `MultiSelect` (`src/components/MultiSelect.tsx:11-15`) es el de Mantine sin opción de crear.

**Propuesto.** Sección 8 (D6).

## 4. Resumen de bloques

| Bloque | Hallazgo | Tipo | ¿Necesita decisión? | Migración |
| --- | --- | --- | --- | --- |
| 1 | 15d | Bug | **No** | No |
| 2 | 15c (parte) | Habilitación de UI (el servidor ya lo admite) | **No** | No |
| 3 | 15c | Producto + seguridad | **Sí: D1** (D2 cerrada con recomendación) | No |
| 4 | 15a | Producto + datos | **Sí: D3, D4, D5** | Sí, una nueva |
| 5 | 15b | UI | **Sí: D6** | No |

Los bloques son independientes. El 3 reusa el «Generar portada» del bloque 1 si ya está mergeado; si no, lo trae.

## 5. Portada del PDF (bloque 1, sin decisiones)

Comportamiento:

1. **Nunca un salto silencioso.** `autoCoverFormat` pasa a devolver el motivo cuando no hay portada posible (`{format:null,reason}`): «Este PDF pesa más de N MB: no podemos generar su portada en el navegador.», «El navegador no puede leer este video.». El toast lo dice y ofrece subir una imagen.
2. **El motivo real de una falla se conserva.** `saveAutoCover` ya devuelve `error`; el formulario lo agrega al aviso en lenguaje simple («No se pudo leer el PDF.», «El PDF tiene contraseña.», «La portada tardó demasiado.», «Se actualizó el CRM: recargá la página y probá de nuevo.») y lo escribe con `console.warn('[portada automática]', materialId, error)` para diagnóstico. No se manda nada al servidor (no hay canal de errores del cliente y no hace falta uno nuevo para esto).
3. **Ofrecer crearla, ahí mismo.** El toast de advertencia lleva una acción **«Elegir portada»** (Sonner `action`) que abre el diálogo «Portada» de ese material.
4. **«Generar desde el archivo» en el diálogo «Portada».** Aparece para un material de archivo sin portada manual (`coverSource` `null` o `auto`) cuyo formato admite portada. Corre `saveMissingAutoCover` sobre ese material **sin mirar `failedAutoCoverIds`** (es un pedido explícito), muestra «Generando portada…», bloquea el doble clic y, al fallar, deja el motivo en el diálogo junto al campo para subir una imagen. Con una portada quitada a mano (`none`) también aparece: elegirla es una decisión manual nueva y pasa a `auto` (el servidor hoy rechaza `auto` sobre `none` con `coverKept`, así que esta acción manda `auto:true` **y** `replaceRemoved:true`; ver sección 9).
5. **Errores de carga de chunk.** Si el `import()` de pdf.js falla (H2), el motivo es «Se actualizó el CRM: recargá la página y probá de nuevo.», y no se suma a `failedAutoCoverIds`.
6. **pdf.js completo.** `renderPdfCover` (y `renderPdfThumbnail`, que comparte la carga) pasa `wasmUrl`, `iccUrl`, `cMapUrl` (con `cMapPacked`) y `standardFontDataUrl`, servidos como assets propios con Vite (las carpetas `wasm/`, `iccs/`, `cmaps/` y `standard_fonts/` del paquete; mismo origen, permitido por `connect-src 'self'`). Antes de cablearlo, confirmar los nombres de las carpetas y opciones en la versión fijada 6.4.299 (las opciones están confirmadas en la documentación de pdf.js; los caminos dentro del paquete, no).
7. **Límite de tamaño.** Un archivo recién elegido ya está en la memoria del navegador: el tope sube a **150 MB** para la fuente local. Para la fuente remota (backfill y «Generar desde el archivo»), `getDocument({url,disableStream:true,disableAutoFetch:true})` pide solo los rangos que necesita la primera página (el CORS del bucket ya permite `Range`, spec 95 §7), con el mismo tope de 150 MB. Más arriba: motivo explícito y oferta de subir una imagen. El número es ajustable; se elige por memoria en notebooks modestas.

Sin cambios en el servidor, en `cover_mode` (salvo el punto 4) ni en el flujo de guardado: el material se guarda siempre, la portada nunca bloquea.

Copy nuevo: «Elegir portada», «Generar desde el archivo», «Generando portada…», los motivos del punto 2, «Este PDF pesa más de 150 MB: no podemos generar su portada en el navegador. Subí una imagen con «Elegir portada».».

## 6. Portadas de enlaces externos (bloques 2 y 3)

### 6.1 Portada manual (bloque 2, sin decisión)

- «Portada (opcional)» aparece también al crear un enlace, y el ítem «Portada» del menú también para enlaces. Mismo camino, mismas validaciones (imagen de hasta 1 MB, firma), `cover_mode='manual'`.
- Sin cambios en el servidor: ya lo admite (sección 3.2). Se agrega un test de integración que lo fija.

### 6.2 Portada automática (bloque 3, D1)

Recomendación D1, opción 1: **imagen de vista previa del sitio (Open Graph) buscada por el servidor con defensas contra SSRF, y codificada en el navegador por el camino de portadas existente.**

Flujo:
1. Al crear un enlace sin portada manual, al guardar «Nueva versión» de un enlace con portada automática o nunca puesta, en «Generar portadas faltantes» y en «Generar desde el enlace» (el botón del bloque 1 con su texto para enlaces), el navegador llama `POST /_api/sales_materials/link_preview` con `{id, revision}`.
2. El servidor toma la URL **de la versión actual guardada** (nunca una URL que venga en el pedido: no hay forma de usar el endpoint para sondear direcciones arbitrarias), busca `og:image`, `og:image:secure_url` o `twitter:image` en el HTML y devuelve **los bytes de la imagen** (mismo origen, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`).
3. El navegador la achica y codifica con `encodeAutoCover` (ya existe) y la guarda con `saveAutoCover` (`auto:true`). El servidor nunca guarda en R2 una imagen de terceros sin pasar por la verificación normal; `cover_mode` y «lo manual gana» quedan iguales.
4. Si no hay imagen o algo falla: el material se guarda igual, la tarjeta muestra el marcador y el aviso dice «No encontramos una imagen en ese enlace. Podés subir una con «Elegir portada».».

Defensas del servidor (todas obligatorias, con tests):
- **Permiso:** solo admin (`assertSalesMaterialAdmin`), material activo, `source='url'`, `revision` vigente.
- **Destino:** solo `https:`, puerto 443, sin usuario/contraseña, sin IP literal en el host.
- **DNS y conexión fijada:** resolver todas las direcciones (`dns.lookup` con `all:true`) y rechazar si **alguna** es loopback, privada (10/8, 172.16/12, 192.168/16), link-local (169.254/16, incluye metadatos de nube), CGNAT (100.64/10), `0.0.0.0/8`, multicast, reservada, `::1`, `fc00::/7`, `fe80::/10`, IPv4 mapeada en IPv6, 6to4 o Teredo. La conexión se hace a la dirección validada (opción `lookup` de `node:https`, SNI y `Host` con el nombre original), así un segundo DNS no puede apuntar a otra parte (DNS rebinding). Sin dependencias nuevas: `node:https`, `node:dns`, `node:net`.
- **Redirecciones:** manuales, como mucho 3, y cada salto pasa otra vez por todas las reglas.
- **Tiempos:** 4 s para conectar y recibir encabezados, 8 s por pedido, 15 s en total.
- **Tamaños:** del HTML se leen como mucho 512 KB (las etiquetas van en `<head>`) y solo con `Content-Type: text/html`; la imagen, como mucho 5 MB (se corta el stream al pasarse), `Content-Type` y firma de JPEG, PNG, WebP o GIF (`signatureMatches`, ya existe). SVG y cualquier otro tipo se rechazan.
- **Pedido limpio:** sin cookies ni credenciales, sin `Referer`, `User-Agent` fijo («HospedaCRM-LinkPreview/1.0»), `Accept` acotado.
- **Límite de uso:** 20 por admin por minuto, en memoria (como el resto de los límites del CRM).
- **Registro:** solo el host y el resultado (`ok`, `sin imagen`, `bloqueado`, `tiempo`), nunca la URL completa (puede llevar tokens).

Privacidad: el sitio externo ve **un** pedido desde la IP del VPS cuando el admin crea o regenera el material; ningún dato del cliente ni del vendedor viaja y los destinatarios no generan pedidos. Sitios que piden sesión (Drive privado, Instagram) no dan imagen: queda el marcador o la portada manual.

## 7. Verticales (bloque 4, D3, D4 y D5)

Recomendación (D3 opción 1, D4 opción 1, D5 opción 1):

**Datos.** `crm_sales_materials.verticals text[] NOT NULL DEFAULT '{}'`, con los nombres del catálogo. **Vacío = todas las verticales.** Los materiales existentes quedan vacíos: nada cambia para ellos.

**Admin.**
- En «Nuevo material» / «Editar material», un selector «Verticales» (wrapper `MultiSelect`, opciones = catálogo activo en su orden, `allLabel` «Todas las verticales»), debajo de «Categorías». Ayuda: «Vacío: el material se ofrece para cualquier negocio. Con verticales, se ofrece primero en los negocios de esas verticales.».
- Validación en el servidor (`create` y `update`): cada nombre existe en `crm_verticals` y está activo; uno inactivo que el material ya tenía se conserva (como las categorías desactivadas). Hasta 20.
- La tarjeta muestra las verticales como insignias (nada si es «todas»). La barra de filtros suma «Vertical» (un material «todas» pasa cualquier filtro de vertical). El agrupado sigue siendo por categoría.

**Vendedor (D3 opción 1).** La vertical del contexto es la de la gestión si hay gestión, si no la del negocio (`lead.tipo ?? account.tipo`, igual que los modelos). En el selector de material:
1. Arriba, sin título extra si no hace falta: **lo que aplica** a ese negocio. Primero los marcados con su vertical, después los de «todas las verticales».
2. Debajo, plegado: **«De otras verticales (N)»**, que se abre con un clic.
3. Si arriba no queda nada (nadie marcó material para esa vertical y no hay material «todas»), se muestra todo desplegado con la nota «No hay material marcado para {vertical}; te mostramos todo.». **Nunca una lista vacía por la vertical.**
4. La búsqueda y las categorías filtran las dos partes; si lo buscado solo está en «otras», esa parte se abre sola.
5. Sin vertical conocida (negocio sin `tipo`): la lista de hoy, sin partes.

**Servidor.** `GET /_api/sales_materials` acepta `forAccountId` y `forLeadId` opcionales. El servidor lee la vertical **solo si el usuario puede leer ese negocio/gestión** (`assertBusinessAccess` / `assertLeadAccess` de lectura); si no puede, ignora el parámetro (sin orden, `contextVertical:null`), así la vertical de un negocio ajeno no se filtra. Devuelve `contextVertical` y, por material, `verticalMatch: 'specific'|'all'|'other'|null`, ordenando `specific`, `all`, `other` y, dentro de cada grupo, el orden actual. La comparación usa `canonicalVertical` (mismos alias que los modelos), en TypeScript sobre la lista ya leída.

**User script.** `GET /_api/userscript/materials` resuelve la vertical con el `accountId` que ya recibe (y la gestión si el panel la manda) y devuelve la lista en ese orden con `otherVertical:true` en los de otras verticales. El panel actual ya lista en el orden recibido, así que **el orden funciona sin publicar una versión nueva del script** (confirmar en `userscript/src/materials.ts` al implementar). El separador «De otras verticales» en el panel va en la próxima versión del script, fuera de este bloque.

**Límite conocido.** El orden se aplica sobre los 500 primeros materiales (`LIST_LIMIT`); con más, el aviso de lista truncada sigue pidiendo buscar.

## 8. Selector de categorías (bloque 5, D6)

Recomendación D6, opción 1: **un solo control que busca, elige y crea.** Un `CreatableMultiSelect` compartido (Mantine `Combobox` + `PillsInput`, el patrón documentado para multiselección con creación; no hay dependencia nueva), con el mismo aspecto que `MultiSelect`:
- Escribir filtra las categorías activas; si no hay una con ese nombre exacto (comparación sin tildes, ñ distinta de n, como el resto de la búsqueda), la última opción es **«Crear categoría «{texto}»»**.
- Elegir esa opción llama `category_create` (solo admin, ya existe), muestra «Creando categoría…» en el control, bloquea otro intento y la deja elegida. Un error («Ya existe una categoría con ese nombre.») queda debajo del control con lo escrito intacto.
- Se va el campo «Nueva categoría» y su botón (`SalesMaterialForm.tsx:160`).
- La barra de filtros, el selector del vendedor y Configuración no cambian.

## 9. Permisos y contratos

- Toda escritura de material sigue siendo **solo admin** en el servidor (`assertSalesMaterialAdmin`, `salesMaterialService.ts:23`, en `mutateSalesMaterial` y `createSalesMaterialUpload`): `verticals` en `create`/`update`, `cover` de enlaces, `category_create` desde el selector nuevo y el endpoint nuevo `link_preview`.
- Lectura con `forAccountId`/`forLeadId`: cualquier usuario autenticado; la vertical se resuelve solo con permiso de lectura sobre ese negocio o gestión.
- Cambios de contrato, todos aditivos y opcionales: `verticals` en `create`/`update` (vacío por defecto), `forAccountId`/`forLeadId` en el listado, `verticals`, `verticalMatch` y `contextVertical` en la respuesta (más la lista de verticales activas para el formulario), `replaceRemoved` en `cover` (bloque 1, punto 4; solo con `auto:true`: permite reemplazar una portada quitada a mano porque el admin la pidió explícitamente; sin él, `auto` sobre `none` sigue respondiendo `coverKept`), `otherVertical` en el listado del script, y el endpoint `POST /_api/sales_materials/link_preview` (registrado a mano en `src/server/app.ts`, junto a `:119-124`).
- «No contactar» y las restricciones de canal no cambian: el selector se sigue abriendo desde los mismos lugares, con los mismos bloqueos (`CommunicationActionBar.tsx:72`, `userscript.ts:177-180`).

## 10. Decisiones abiertas

1. **D1 — Portada automática de enlaces.**
   - **Opción 1:** Open Graph buscado por el servidor con las defensas de la sección 6.2; codificado en el navegador.
     - Pro: la portada real del sitio (YouTube, recorridos 360, sitios propios); reusa la validación y el guardado de portadas; sin dependencias nuevas; el endpoint no acepta URLs del pedido.
     - Contra: es el primer `fetch` del servidor a sitios de terceros; las defensas contra SSRF tienen que estar bien y probadas; sitios con sesión no dan imagen.
     - Impacto: endpoint nuevo, un helper de red con tests, cambios en el formulario y en el backfill. Sin migración.
   - **Opción 2:** portada dibujada en el navegador (fondo de marca, título, dominio, color de la categoría) y guardada como automática.
     - Pro: cero riesgo de red; siempre hay portada.
     - Contra: no es la imagen del sitio; la tarjeta ya dibuja un marcador parecido, así que solo mejora la página pública y la vista previa de WhatsApp (que ya muestran título y logo).
     - Impacto: solo cliente.
   - **Opción 3:** opción 1 y, si no hay imagen, la opción 2.
     - Pro: siempre hay portada guardada.
     - Contra: suma las dos implementaciones; una portada dibujada guardada tapa la posibilidad de detectar después que el sitio sí tiene imagen (hay que regenerar a mano).
   - **Opción 4:** servicio externo de vistas previas o capturas.
     - Contra: manda cada URL a un tercero, dependencia y costo. Descartada.
   - **Opción 5:** solo la portada manual (bloque 2).
     - Pro: nada nuevo que asegurar.
     - Contra: no cumple «generar portadas para enlaces».
   - **Recomendación: opción 1.** La portada del sitio es lo que se espera ver; el marcador actual cubre la falta de imagen y el bloque 2 deja subir una a mano.
2. **D2 — ¿Portadas de archivos en el servidor?** (alternativa para la causa H3)
   - **Opción A:** seguir en el navegador, con las correcciones del bloque 1.
     - Pro: sin dependencias ni carga en el VPS; ya probado en CI.
     - Contra: depende del navegador del admin.
   - **Opción B:** generar en el servidor (`poppler`/`pdftoppm` en la imagen, o pdf.js con un canvas nativo).
     - Contra: paquete nativo nuevo en `node:22-alpine`, CPU y memoria del VPS, y procesar PDFs de terceros en el servidor (superficie de ataque).
   - **Recomendación: A.** No pide decisión para avanzar: el bloque 1 sigue A. Se revisa solo si, con el motivo ya visible, los PDF reales siguen fallando.
3. **D3 — Cómo usa la vertical el selector del vendedor.**
   - **Opción 1:** primero lo que aplica (su vertical, después «todas»), y «De otras verticales (N)» plegado a un clic; todo desplegado si arriba no queda nada.
     - Pro: el vendedor ve lo relevante sin hacer nada y lo demás sin buscar un interruptor; nunca vacío.
     - Contra: dos partes en la lista; un material mal marcado queda plegado.
     - Impacto: listado con contexto, selector, orden en el script.
   - **Opción 2:** filtrar solo lo que aplica, con un chip «Solo {vertical} ×» para ver todo.
     - Pro: lista más corta.
     - Contra: un material mal marcado queda escondido; el vendedor tiene que entender el chip; con cero resultados hace falta la misma excepción.
   - **Opción 3:** solo ordenar, sin partes.
     - Pro: lo más simple de construir.
     - Contra: con mucho material, lo de otras verticales se mezcla visualmente con lo relevante.
   - **Recomendación: opción 1** (decisión 380: el camino más simple para el vendedor, y «nunca esconder todo»).
4. **D4 — Cómo se guardan las verticales del material.**
   - **Opción 1:** columna `verticals text[]` en `crm_sales_materials`.
     - Pro: una migración de una línea; el journal de auditoría y la `revision` cubren el cambio solos (es una columna de la fila); mismo criterio que `message_templates.vertical` (texto).
     - Contra: sin clave foránea (el catálogo no se renombra desde la app, decisión 38; se valida al escribir).
   - **Opción 2:** tabla `crm_sales_material_verticals(material_id, vertical_id)` con claves foráneas.
     - Pro: integridad referencial.
     - Contra: la tabla sin `id` no entra en `crm_audit_resource()` y hay que escribir el journal a mano, como con las categorías (`salesMaterialService.ts:125-132`); más SQL.
   - **Recomendación: opción 1.**
5. **D5 — Qué vertical cuenta para «aplica».**
   - **Opción 1:** la de la gestión del contexto; sin gestión, la del negocio (`lead.tipo ?? account.tipo`).
     - Pro: igual que los modelos; un negocio multivertical recibe el material de la gestión que se está trabajando.
     - Contra: «Enviar material» desde la ficha sin gestión usa la vertical del negocio.
   - **Opción 2:** siempre la del negocio.
     - Pro: más simple.
     - Contra: se aparta de cómo se eligen los modelos.
   - **Recomendación: opción 1.**
6. **D6 — Selector de categorías.**
   - **Opción 1:** un control que busca, elige y crea («Crear categoría «X»» como última opción).
     - Pro: un solo lugar; escala con muchas categorías; sin dependencia nueva.
     - Contra: componente nuevo (`Combobox`), con sus tests.
   - **Opción 2:** todas las categorías a la vista como chips con un clic, más un chip «+ Nueva» que se vuelve campo.
     - Pro: lo más rápido con pocas categorías; se ve todo de un vistazo.
     - Contra: con muchas categorías ocupa mucho y no busca.
   - **Opción 3:** dejar el `MultiSelect` y mover «Nueva categoría» a un «¿No está? Creala» plegado.
     - Pro: cambio mínimo.
     - Contra: siguen siendo dos controles.
   - **Recomendación: opción 1.** Si al propietario lo que le molestó fue otra cosa (por ejemplo, no ver todas las categorías de un vistazo), la opción 2 es la alternativa.

### Decisión del propietario (31/10/2026)

- **D1:** portada automática de enlaces = imagen Open Graph buscada por el servidor con defensas SSRF.
- **D2:** las portadas de archivos siguen en el navegador. Causa del PDF del smoke confirmada: pesaba más de 50 MB (límite viejo), resuelto con 150 MB.
- **D3:** selector del vendedor: su vertical y «todas» arriba, «De otras verticales (N)» plegado, todo desplegado si arriba no queda nada.
- **D4:** columna `verticals text[]`.
- **D5:** cuenta la vertical de la gestión; sin gestión, la del negocio.
- **D6:** un solo control que busca, elige y crea categorías.

## 11. Componentes y funciones

| Pieza | Archivo | Cambio | Bloque |
| --- | --- | --- | --- |
| Formato y motivo | `src/helpers/salesMaterialAutoCover.ts:11,22-34` | `autoCoverFormat` devuelve motivo; tope 150 MB; `needsAutoCover` sin cambio de regla para los elegibles | 1 |
| Errores legibles | `src/helpers/salesMaterialAutoCover.ts:100-125` | mapa de errores (contraseña, chunk, tiempo) y `console.warn`; el chunk no entra en `failedAutoCoverIds` | 1 |
| pdf.js | `src/helpers/pdfThumbnail.ts:1-39` | `wasmUrl`, `iccUrl`, `cMapUrl`, `standardFontDataUrl`; rango con `disableStream`/`disableAutoFetch` para URL | 1 |
| Aviso con acción | `SalesMaterialForm.tsx:105-109`, `SalesMaterialPanel.tsx:96` | motivo en el aviso; acción «Elegir portada» que abre el diálogo «Portada» | 1 |
| «Generar desde el archivo» | `SalesMaterialForm.tsx:126-129,162-170` | botón en modo `cover` | 1 |
| `replaceRemoved` | `salesMaterials.schema.ts:16`, `salesMaterialService.ts:197` | `auto` + `replaceRemoved` reemplaza `none` | 1 |
| Portada de enlaces | `SalesMaterialForm.tsx:162`, `SalesMaterialCard.tsx:63` | también con `source==='url'` | 2 |
| Vista previa del enlace | `src/helpers/linkPreview.ts` (nuevo), `src/endpoints/salesMaterials.ts`, `src/server/app.ts:119-124` | fetch seguro y endpoint admin | 3 |
| Portada automática de enlaces | `salesMaterialAutoCover.ts`, `SalesMaterialForm.tsx`, `SalesMaterialPanel.tsx:46` | fuente `{link:materialId}`; enlaces en el backfill | 3 |
| Verticales (datos) | migración nueva, `salesMaterialService.ts:31-53,148-204`, `salesMaterials.schema.ts:13-14,27,32-35` | columna, validación, `forAccountId`/`forLeadId`, `verticalMatch` | 4 |
| Orden por vertical | `src/helpers/salesMaterialRelevance.ts` (nuevo, puro) | `salesMaterialRelevance({materials,vertical})` compartido por el listado y el script | 4 |
| Selector del vendedor | `SalesMaterialPicker.tsx`, `CommunicationActionBar.tsx:80`, `MessageComposer.tsx:131` | prop `context:{accountId,leadId?}`; partes y «De otras verticales» | 4 |
| Admin | `SalesMaterialForm.tsx:159`, `SalesMaterialCard.tsx:47`, `SalesMaterialFilters.tsx`, `salesMaterialGroups.ts` | selector «Verticales», insignias, filtro | 4 |
| Script | `src/endpoints/userscript.ts:182-186` | orden y `otherVertical` | 4 |
| Selector de categorías | `src/components/CreatableMultiSelect.tsx` (nuevo), `SalesMaterialForm.tsx:159-160` | un control con «Crear categoría «X»» | 5 |

## 12. Plan de tests

Regresión primero: cada bloque arranca con un test que reproduce el caso del smoke y falla.

| Tema | Unit (`*.spec.ts(x)`) | Integración (`scripts/test-*.ts`) | E2E (`tests/browser/*.e2e.ts`) |
| --- | --- | --- | --- |
| 15d: PDF | `salesMaterialAutoCover.spec.ts`: PDF de 60 MB → motivo (hoy `null` sin motivo: falla); 160 MB → motivo; error de contraseña, de chunk y de tiempo → texto legible; el de chunk no entra en `failedAutoCoverIds`. `SalesMaterialForm.spec.tsx`: crear un PDF grande avisa el motivo (hoy «Material guardado.» solo: falla); una falla muestra el motivo; «Generar desde el archivo» llama `saveMissingAutoCover`, bloquea doble clic y muestra el error. `SalesMaterialPanel.spec.tsx`: el aviso trae «Elegir portada» y abre el diálogo | `test-sales-material.ts`: `cover` con `auto:true` sobre `none` sigue `coverKept`; con `replaceRemoved:true` guarda `auto` | `material-screen.e2e.ts`: fixture nueva de PDF con imagen JPX o CMYK (generada en el test) obtiene portada al crear; un PDF que falla (bytes rotos con firma `%PDF-`) deja el aviso con «Elegir portada» y «Generar desde el archivo» lo reintenta |
| 15c: manual | `SalesMaterialCard.spec.tsx`: «Portada» en enlaces; `SalesMaterialForm.spec.tsx`: campo de portada al crear un enlace | `test-sales-material.ts`: subida `cover` + `cover` sobre un enlace → `manual`, página pública con portada | `material-screen.e2e.ts`: enlace con portada manual |
| 15c: automática | `linkPreview.spec.ts`: rechaza `http:`, puerto, IP literal, cada rango privado y mapeado (IPv4 e IPv6), DNS con una dirección privada entre varias, redirección a privada, más de 3 redirecciones, HTML > 512 KB, imagen > 5 MB, SVG, firma que no coincide, tiempo agotado; extrae `og:image` relativo y absoluto; usa la dirección validada (rebinding) | `test-sales-material.ts`: `link_preview` 403 para vendedor, 409 con `revision` vieja, 400 en material de archivo; con un servidor HTTPS local de prueba inyectado (resolver y agente de prueba) devuelve la imagen | `material-screen.e2e.ts`: crear un enlace contra un sitio simulado con `og:image` → portada automática; sin `og:image` → aviso |
| 15a: verticales | `salesMaterialRelevance.spec.ts`: específico, todas, otras; alias singular/plural; sin vertical → orden original; sin coincidencias → todo. `SalesMaterialPicker.spec.tsx`: partes, «De otras verticales» plegado, nota cuando arriba no queda nada, búsqueda que abre «otras» | `test-sales-material.ts`: `verticals` solo admin, nombre inexistente o inactivo rechazado, inactivo previo conservado, journal con el cambio; listado con `forAccountId` ordena; sin permiso de lectura → `contextVertical:null`; `forLeadId` usa la vertical de la gestión. `test-userscript.ts`: orden y `otherVertical` | `material-composer.e2e.ts`: «Enviar material» en un negocio de Alojamiento muestra primero su material y «De otras verticales» plegado |
| 15b: categorías | `CreatableMultiSelect.spec.tsx`: filtra, ofrece crear solo sin coincidencia exacta (tildes iguales, ñ distinta), crea y elige, error conserva lo escrito, bloqueo de doble creación | — (`category_create` ya cubierto) | `material-screen.e2e.ts`: crear una categoría desde el selector y guardar el material con ella |

Suite de navegador completa antes del merge de cada bloque con UI (`npm run build && npm start`, luego `npm run test:browser`; ~10 minutos).

## 13. Riesgos

- **Causa real del PDF desconocida.** El bloque 1 cubre las cuatro hipótesis y deja el motivo a la vista; si con eso un PDF real sigue fallando, el motivo indica el próximo paso (D2).
- **SSRF (bloque 3).** Es el riesgo principal: primer fetch del servidor a terceros. Mitigado por endpoint solo admin, URL tomada de la base, IP validada y fijada, redirecciones revalidadas, límites de tiempo y tamaño, y tests por cada regla. Una revisión adversarial con contexto fresco es obligatoria antes del merge.
- **Assets de pdf.js.** Sumar `cmaps/`, `standard_fonts/`, `iccs/` y `wasm/` agranda `dist/` (varios MB, solo se piden cuando hacen falta).
- **150 MB en el navegador.** Una notebook con poca memoria puede tardar; el tope de 30 s corta y avisa.
- **Material mal marcado** queda en «De otras verticales», no escondido (D3).
- **Orden del script sin versión nueva** depende de que el panel respete el orden recibido; si no, el orden llega con la próxima versión del script.

## 14. Orden de implementación (PRs a `staging`)

Cada bloque, con typecheck, `npm test`, build y sus integraciones en verde, y CI verde en el SHA del PR. Los bloques son independientes entre sí.

1. **Bloque 1, hallazgo 15d (sin decisiones):** motivo visible, «Elegir portada», «Generar desde el archivo», pdf.js completo, tope y rangos. Arranca reproduciendo con el PDF del propietario si lo comparte.
2. **Bloque 2, portada manual de enlaces (sin decisión):** solo cliente y un test de integración.
3. **Bloque 3, portada automática de enlaces (espera D1):** helper de red, endpoint y cliente. Revisión adversarial obligatoria.
4. **Bloque 4, verticales (espera D3, D4, D5):** migración nueva, listado con contexto, selector, admin y orden en el script.
5. **Bloque 5, selector de categorías (espera D6):** componente nuevo y formulario.

## 15. Aceptación

- Subir un PDF de menos de 150 MB deja su portada; si no se puede, el aviso dice por qué y ofrece «Elegir portada»; el diálogo «Portada» tiene «Generar desde el archivo», que funciona sin recargar la página. Ningún PDF queda sin portada sin un aviso.
- Un enlace externo admite portada manual al crearlo y desde «Portada».
- (Si se aprueba D1) Crear un enlace a un sitio con imagen de vista previa deja una portada automática; la página pública y la vista previa de WhatsApp la muestran; una URL que resuelve a una dirección interna no se pide nunca.
- (Si se aprueban D3–D5) Un admin marca verticales; al «Enviar material» desde un negocio de esa vertical, su material aparece primero, el genérico después y el resto plegado a un clic; en un negocio sin material marcado para su vertical se ve todo; el panel del script respeta el mismo orden.
- (Si se aprueba D6) En «Nuevo material», escribir un nombre nuevo en «Categorías» permite crearla y queda elegida, sin otro campo.
- `npm run typecheck`, `npm test`, `npm run build`, las integraciones listadas y `npm run test:browser` en verde; CI verde en el SHA de cada PR.

## 16. Migraciones y datos

- Bloques 1, 2, 3 y 5: **ninguna migración**.
- Bloque 4: **una migración nueva, aditiva**, `057_sales_material_verticals.sql` (o el siguiente número libre al implementar; la `056` la toma la spec 101 si se aprueba su bloque 4): `ALTER TABLE crm_sales_materials ADD COLUMN verticals text[] NOT NULL DEFAULT '{}' CHECK (cardinality(verticals) <= 20)`. Las filas existentes quedan `'{}'` («todas las verticales»), es decir, igual que hoy. No escribe datos ni toca otra tabla. Los triggers de auditoría y de versión en vivo de `crm_sales_materials` (`046_sales_material.sql:79-88`) ya cubren la columna.
- No se edita ninguna migración aplicada. Ningún bloque escribe en producción: las portadas de los materiales existentes las genera un admin con «Generar portadas faltantes» o «Generar desde el archivo» después del deploy, y las verticales las marca un admin a mano.
