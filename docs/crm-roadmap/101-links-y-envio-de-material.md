# Spec 101 — Links y envío de material

Estado: **borrador para revisión del propietario** (31/10/2026). Origen: smoke en producción del 30/10/2026, hallazgos 11, 12, 13 y 14. Tipo: dos correcciones de bugs del composer (13 y 14, **implementables sin decisiones del propietario**) y dos cambios de producto sobre los enlaces de material de venta (11 y 12, **dependen de las decisiones de la sección 9**). Migración: **ninguna** para los bloques 1 a 3; **una nueva** (`056_*`, o el siguiente número libre al implementar) solo si se aprueba el hallazgo 12 (sección 7).

Parte de la [spec 89](89-material-de-venta.md) (un enlace `/m/<token>` por material y mensaje, D6; página pública, D7) y de las specs 92, 96, 97 y 98 (material en WhatsApp e Instagram, solo como enlace). Respeta `AGENTS.md` («Abrir un canal, guardar un borrador o mover una etapa NO es evidencia…», permisos y «No contactar» en todo camino de escritura, loading y bloqueo de doble envío, nunca reintentar solo un envío de resultado incierto, migraciones inmutables) y `docs/decisiones.md` (línea 23: un vínculo o preview no equivale a enviar; línea 380: **siempre el camino más simple para el vendedor**; líneas 402-403: el material sobrevive al cambio de modelo, en Instagram solo enlace).

## 1. Problema

1. **(11)** El enlace del material es largo e ilegible: `https://crm.hospeda.com.ar/m/` + 43 caracteres al azar. El propietario quiere `/m/<título>-<token corto>`, legible, con el título del material, y propone un token de 4 caracteres válido solo junto con el título, con un límite de intentos por IP más duro.
2. **(12)** Hoy el enlace siempre abre la página del CRM (portada, título, descripción, «Descargar»). El propietario quiere elegir **por material** si abre el archivo directo o la página. Tema abierto: mandar el archivo mismo por WhatsApp.
3. **(13, bug)** En el editor del mensaje de WhatsApp, un `_` dentro de un enlace se muestra como cursiva; al copiar el texto se copia un enlace roto.
4. **(14, fricción)** Hay que guardar el borrador antes de que se habilite «Abrir WhatsApp».

## 2. Objetivos y no objetivos

### Objetivos

1. Un enlace que el cliente pueda leer («qué es») y que siga siendo imposible de adivinar en la práctica.
2. Todo enlace ya enviado sigue funcionando igual (mismos estados: 200, 404, **410 si fue revocado o el material se retiró**, 429).
3. El admin elige por material si el enlace abre la página o el archivo.
4. Lo que se ve en el editor y en la vista final es exactamente lo que se manda: copiar un enlace nunca lo rompe.
5. Con un borrador listo, «Abrir WhatsApp» funciona en un clic, con o sin cambios sin guardar, sin saltear revisión ni reglas de conflicto.

### No objetivos

- Adjuntar archivos en WhatsApp o Instagram (sección 8, D5: fuera de alcance).
- Cambiar qué cuenta como envío: abrir WhatsApp sigue sin ser evidencia; el registro técnico de acceso sigue sin ser «el cliente lo vio» (`salesMaterialShareService.ts:88-91`).
- Vencimiento automático de enlaces, cambios de permisos, de «No contactar» o del flujo de email («Guardar y revisar», decisión del 28/10, `MessageComposer.tsx:116`).
- Escribir en producción. Ningún bloque reescribe enlaces ya enviados.
- Trabajo solo de accesibilidad (diferido por el propietario).

## 3. Hallazgos

Verificado en `origin/staging` el 31/10/2026 (rama `docs/spec-101-material-links`). Las líneas citadas son de esta rama.

### 3.1 Formato del enlace (hallazgo 11)

**Actual.**
- Token: 32 bytes al azar en base64url, 43 caracteres, **256 bits** (`src/helpers/salesMaterialShare.ts:3-4,13`). El último carácter nunca es `-` ni `_` (`:9-12`). La base guarda solo el sha256 (`crm_sales_material_shares.token_hash`, único; `migrations/046_sales_material.sql:61-75`); el token en claro vive solo en el cuerpo del mensaje.
- Se crea en `insertSalesMaterialShare` (`salesMaterialShareService.ts:49-58`), un token por material y mensaje (spec 89 D6). La URL absoluta sale de `materialShareUrl` (`salesMaterialMessage.ts:20-24`) y el texto «Podés ver «Título» en: URL» de `materialLinkSnippet`/`appendMaterialLink` (`:28-38`). Lo usan `material_add` (`salesMaterialDraft.ts:98`), los modelos (`templateMaterialService.ts:74`) y el user script (mismo camino).
- Rutas públicas: `app.ts:182-187` (`/m/:token`, `/file`, `/download`, `/cover`, y `/m/*` → «Este enlace no es válido»).
- Resolución: patrón exacto `^[A-Za-z0-9_-]{43}$` (`salesMaterialShare.ts:4`), búsqueda por hash y comparación en tiempo constante (`salesMaterialShareService.ts:74-85`). Desconocido y malformado son idénticos (404).
- Límite de tasa (`salesMaterialShare.ts:67-93`, `materialShare.ts:9-38`): **en memoria, por proceso** (se borra al reiniciar), por IP exacta: 300 pedidos por minuto y **20 tokens desconocidos por IP cada 10 minutos** (429 con `Retry-After: 600`). El presupuesto estricto solo se consulta para tokens que no resolvieron: un enlace válido nunca queda bloqueado.
- La IP sale de una sola fuente configurada (`CRM_CLIENT_IP_HEADER`, por defecto `x-real-ip` de Traefik; `salesMaterialShare.ts:28-46`). Una dirección IPv6 cuenta entera: un atacante con un `/64` tiene 2^64 «IPs».
- Otros lugares que conocen la forma del token: `shareTokenHashesInBody` y `shareUrlInBody` (`salesMaterialMessage.ts:72-82`), que `dispatch` usa para saber qué enlaces siguen en el texto (`salesMaterialDraft.ts:151-161`: **un enlace que no encuentra se revoca como «Quitado del texto»**); `mangledShareTokenFromPath` (`salesMaterialShare.ts:51-53`, 308 para enlaces con `.`/`,`/`)` pegados); la redacción del log (`observability.ts:15-17`, ya redacta el segmento entero); y las regex de tests (`scripts/test-sales-material-*.ts`, `scripts/test-userscript.ts:273`, `tests/browser/material-*.e2e.ts`). El user script trata el enlace como texto opaco (`userscript/src/compose.spec.ts:177`).
- Spec 89 D7 fijó «tokens de 128 bits o más, sin enumeración» (`89-material-de-venta.md:66`).

**Análisis de fuerza bruta.** Ver sección 5.2. Resumen: con 4 caracteres el espacio es 64^4 ≈ 16,8 millones (2^24); el título no suma secreto (va escrito en el mismo mensaje y en la vista previa); un atacante distribuido o con IPv6 encuentra enlaces vivos en horas o días aunque se endurezca el límite por IP. Con 6 caracteres más (12 en total) el espacio sube a 2^60 y el riesgo pasa a ser despreciable.

**Propuesto.** Sección 5 (D1 y D2).

### 3.2 Abrir el archivo o la página (hallazgo 12)

**Actual.**
- `GET /m/:token` siempre devuelve la página (`materialShare.ts:46-56`; `renderMaterialPage`, `materialPage.ts:55-72`): imagen, PDF en iframe (en Android, portada y «Abrir PDF»), video o audio con controles, y «Descargar» (archivo) o «Abrir» (URL externa).
- `GET /m/:token/file` ya hace 302 a un GET prefirmado de R2 inline, nuevo en cada pedido (5 minutos; 6 horas para audio y video; `materialShare.ts:57-65`). Las URL externas **nunca** se redirigen (`salesMaterialShareService.ts:97`, decisión de spec 89 contra open redirect).
- El registro técnico de acceso se suma solo en la página, para personas (no bots ni HEAD), como mucho una vez cada 10 minutos (`materialShare.ts:51-53`, `salesMaterialShareService.ts:86-96`).
- Los bots de vista previa (WhatsApp, Facebook, etc.; `PREVIEW_BOT_PATTERN`, `salesMaterialShare.ts:24`) reciben la misma página con Open Graph.
- No existe ninguna opción por material: `crm_sales_materials` no tiene columna para esto (`046_sales_material.sql:11-25`, `051_sales_material_auto_cover.sql`). La configuración global `crm_sales_material` (`salesMaterialService.ts:14-21`) solo tiene límites de subida y adjuntos.

**Propuesto.** Sección 7 (D3 y D4). Envío del archivo mismo por WhatsApp: sección 8 (D5).

### 3.3 `_` dentro de un enlace se ve como cursiva (hallazgo 13, bug)

**Actual.**
- El composer de WhatsApp carga el cuerpo en el editor con `'<p>'+whatsappTextToPreviewHtml(body)+'</p>'` (`MessageComposer.tsx:31`) y la vista final usa la misma función (`:135`).
- `whatsappTextToPreviewHtml` (`src/helpers/templateChannelFormatting.tsx:12-20`) aplica `/_([^_\n]+)_/g → <em>` (y lo mismo para `*` y `~`) **sobre todo el texto, URLs incluidas**.
- Un token de 43 caracteres tiene `_` con probabilidad 1/64 por carácter: ~48 % de los enlaces tienen al menos un `_` y ~14 % tienen dos en el mismo token. Con dos `_` en el mismo enlace, o uno en el enlace y otro en otro enlace o en el texto, el tramo intermedio se muestra en cursiva y **pierde los `_`** en pantalla. Copiar desde el editor o desde la vista final copia el enlace sin esos `_`: roto (404).
- Lo guardado no se rompe: al guardar, `htmlToWhatsApp` (`:23-51`) vuelve a escribir `_…_` para cada `<em>`, y `dispatch` arma el `wa.me` con `m.body` del servidor. El daño es lo que el vendedor ve y copia (y cualquier edición alrededor de la cursiva, que puede mover las marcas).
- Mismo riesgo para cualquier URL con `_`, `*` o `~` (URLs externas de material, enlaces que pega el vendedor) y en la vista previa de modelos (`src/pages/templates.tsx:168-169`).
- No hay `templateChannelFormatting.spec.ts`.

**Causa raíz.** El formateo estilo WhatsApp no excluye las URLs.

**Propuesto.** Sección 6.1. Sin decisiones del propietario.

### 3.4 Hay que guardar antes de «Abrir WhatsApp» (hallazgo 14, fricción)

**Actual.** El botón final se bloquea con «Guardá el mensaje para ver el contenido final antes de continuar.» cuando no hay cambios sin guardar pero `m.textBody` está vacío (`MessageComposer.tsx:107-108`). Hay dos caminos donde pasa:

1. **«Enviar material» (el caso del smoke).** «Enviar material» abre un mensaje libre en blanco (`prepare_general`, decisión 380) y le agrega el material (`material_add`, `:95`).
   - El borrador en blanco no recibe texto final: `renderPreparedFinal` lo deja en `null` si el cuerpo está vacío (`communicationService.ts:364-371`).
   - `material_add` guarda el cuerpo con el enlace en `saveBody` (`salesMaterialDraft.ts:70-76`), que **conserva `text_body=null`** si lo era («el texto final significa revisado»).
   - Resultado: cuerpo con el enlace, sin cambios locales, `textBody=null` → botón deshabilitado hasta tocar «Guardar cambios», aunque no haya nada que guardar.
2. **«Seguir editando» un borrador** (`DraftsBlock.tsx:22`) monta el composer **sin `actionSlot`** y con `startEditing`. Sin slot, mientras se edita el botón final está oculto (`confirmSection hidden={editing}`, `:138`) y, si se mostrara, `editBlock` lo bloquea siempre (`:107`, primera condición `!actionSlot`). El vendedor tiene que «Guardar cambios» para ver «Abrir WhatsApp».

En el diálogo «Contactar» (con `actionSlot`, `ContactTemplateDialog.tsx:66,128`) ya existe el camino simple para cambios sin guardar: un clic guarda y abre (`saveThenDispatch`, `:109-115`; decisión del propietario sobre la spec 96), con la pestaña de WhatsApp abierta dentro del clic y cerrada si el guardado falla. Lo que falta es no bloquear cuando no hay cambios y llevar ese mismo botón a «Seguir editando».

El servidor **no** exige `text_body` para WhatsApp: `dispatch` pide revisión igual, cuerpo no vacío y, solo para email, `htmlBody` y asunto (`communicationService.ts:658`). La barrera de `textBody` en WhatsApp es solo del cliente.

**Causa raíz.** La regla «el texto final significa revisado» viene del email (vista final obligatoria, decisión del 28/10). En WhatsApp el texto final es igual al cuerpo (`edit` guarda `text_body=body`, `communicationService.ts:612`), así que no agrega revisión: solo un clic.

**Propuesto.** Sección 6.2. Sin decisiones del propietario (aplica la decisión 380 y la de la spec 96). Instagram queda como está (D6).

## 4. Resumen de bloques

| Bloque | Hallazgo | Tipo | ¿Necesita decisión? | Migración |
| --- | --- | --- | --- | --- |
| 1 | 13 | Bug | **No** | No |
| 2 | 14 | Bug / fricción | **No** (D6 solo para Instagram, recomendación: no tocar) | No |
| 3 | 11 | Producto + seguridad | **Sí: D1, D2** | No (con la recomendación) |
| 4 | 12 | Producto | **Sí: D3, D4** (D5 fuera de alcance) | Sí, una nueva |

## 5. Formato del enlace (hallazgo 11)

### 5.1 Propuesta (recomendación D1 = opción 3, D2 = opción A)

`https://crm.hospeda.com.ar/m/<slug>-<token>`, por ejemplo `https://crm.hospeda.com.ar/m/folleto-temporada-2027-k7m2xq9rtd4h`.

- **Token nuevo:** 12 caracteres del alfabeto base32 de Crockford en minúscula (`0123456789abcdefghjkmnpqrstvwxyz`, sin `i`, `l`, `o`, `u`): **60 bits**. Se genera con `randomBytes(12)` tomando 5 bits por byte (`byte & 31`, uniforme porque 256 es múltiplo de 32). Sin `_`, `-` ni mayúsculas: no se confunde al leerlo, ningún formateo lo toca y un linkificador no lo corta.
- **Slug:** sale del título del material al crear el enlace: minúsculas, sin tildes (`ñ` → `n`: solo para la URL, la regla de búsqueda «ñ ≠ n» no aplica porque el slug nunca se compara), todo lo que no sea `[a-z0-9]` → `-`, sin guiones repetidos ni en los bordes, cortado en 40 caracteres en un `-`; vacío → `material`.
- **El slug es decorativo (D2 A):** el secreto es solo el token. Se busca por `sha256(token)` como hoy (misma columna `token_hash`, sin migración). Cualquier slug o ninguno resuelve el mismo enlace, así que **renombrar un material no rompe nada** y no hay que guardar el slug.
- **Enlaces viejos:** el patrón de 43 caracteres sigue aceptado para siempre, sin redirección.
- Helper puro único `parseShareSegment({segment})` en `salesMaterialShare.ts`, que devuelve los tokens candidatos (uno o dos):
  - si el segmento cumple `^[A-Za-z0-9_-]{43}$`, candidato heredado;
  - si cumple `^(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?([0-9a-hjkmnp-tv-z]{12})$`, candidato nuevo.
  - Un segmento nuevo de exactamente 43 caracteres puede cumplir los dos patrones: se prueban los dos hashes en una sola consulta (`WHERE token_hash = ANY(...)`) y cuenta como **un** intento desconocido.
- **Lo usan todos los que hoy conocen la forma del token:** `resolvePublicShare`, `shareTokenHashesInBody`, `shareUrlInBody`, `mangledShareTokenFromPath` y el 308 de enlaces con puntuación pegada. **Crítico:** si `shareTokenHashesInBody` no reconoce el formato nuevo, `dispatch` revoca el enlace como «Quitado del texto». Va con test de regresión.
- `generateShareToken` pasa a devolver `{token, tokenHash, path}`. `insertSalesMaterialShare` recibe el título (ya lo lee, `:50`) y devuelve `path:'/m/'+slug+'-'+token`. Nada más cambia en `material_add`, modelos ni user script: todos usan `share.path`.
- **Límite endurecido (barato, va con este bloque):** el presupuesto de desconocidos de una IPv6 se cuenta por su `/64` (una IPv4, entera). Se mantienen 300 por minuto y 20 desconocidos cada 10 minutos.
- Largo: hoy 72 caracteres (`https://crm.hospeda.com.ar/m/` + 43); con la propuesta, 29 + slug + 13 (unos 57 con un slug de 15). La propuesta del propietario con 4 caracteres ahorra 8 caracteres más.

### 5.2 Riesgo de fuerza bruta, en números

Supuestos:
- **K** = espacio de tokens; **N** = enlaces vivos que el atacante puede acertar; **G** = intentos por día.
- Probabilidad de acertar algún enlace en un día ≈ G·N/K.
- Hoy hay un enlace por material y mensaje que no vence. Se toma N = 1.000 enlaces vivos de un material (o del total, si el slug no se valida); es un orden de magnitud razonable a meses de uso.

| Formato | K | Atacante con 1 IP (20 cada 10 min ≈ 2.900/día) | 100 IPs (≈ 290.000/día) | IPv6 /64 sin agrupar o botnet de 10.000 IPs (≈ 29 millones/día) |
| --- | --- | --- | --- | --- |
| 4 caracteres base64url (propuesta del propietario) | 2^24 ≈ 1,7·10^7 | ≈ 1 acierto cada 6 días | ≈ 17 aciertos por día | todos los enlaces en horas |
| 4 caracteres + límite duro (5 por IP por hora, presupuesto global de 200 desconocidos por hora) | 2^24 | 120/día: ≈ 1 cada 140 días | tope global 4.800/día: ≈ 1 cada 3,5 días | tope global: ≈ 1 cada 3,5 días (y el tope lo agota cualquiera) |
| 8 caracteres base62 | 2^47,6 ≈ 2,2·10^14 | despreciable | ≈ 1 cada 2.000 años | ≈ 1 cada 20 años |
| **12 caracteres base32 (recomendado)** | 2^60 ≈ 1,2·10^18 | despreciable | despreciable | ≈ 1 cada 110.000 años |
| 43 caracteres base64url (hoy) | 2^256 | — | — | — |

- **El título no es secreto.** Va escrito en el mismo mensaje («Podés ver «Folleto 2027» en:…»), en la vista previa de WhatsApp (`og:title`) y lo conoce cualquier cliente que recibió un enlace. Hay pocas decenas de materiales activos: validar el slug suma como mucho ~6 bits y nada contra quien apunta a un material conocido.
- **El límite por IP no alcanza solo:**
  - es en memoria y se borra en cada reinicio o deploy;
  - un proxy residencial da miles de IPs por pocos dólares;
  - una IPv6 `/64` da 2^64 direcciones (hoy se cuenta la IP entera).
  - Un presupuesto global acota al atacante, pero también deja sin respuesta a quien tipea mal un enlace, y con 4 caracteres sigue filtrando un enlace cada pocos días.
- **Lo que gana el atacante** con un acierto:
  - El material, que es contenido comercial pensado para clientes (folletos, tarifas, recorridos). Confidencialidad baja, pero puede incluir precios o condiciones que no queremos públicos.
  - La página no muestra negocio, vendedor ni nada interno (`salesMaterialShareService.ts:59-66`); un interno nunca se sirve.
  - **Integridad del registro técnico:** cada acceso del atacante suma `technical_access_count` del enlace de un cliente real. Hoy el registro ya es «técnico, no prueba de que lo vio», pero con un token adivinable deja de servir incluso como señal.
  - Revocar corta un enlace concreto (410); no sirve contra una enumeración que no se ve venir.
- **Si se filtra la base:** con 4 caracteres, cualquier hash se invierte al instante; con 60 bits hace falta un esfuerzo de GPU importante (del orden de dos semanas con cien GPU), y quien tiene la base ya tiene todo lo demás. Aceptable.
- **Colisiones:** con 4 caracteres, a partir de unos 4.000 enlaces la colisión es probable (cumpleaños sobre 2^24) y `token_hash UNIQUE` haría fallar `material_add`; habría que reintentar la generación o acotar la unicidad por material. Con 60 bits es despreciable, pero igual se reintenta una vez ante `unique_violation`.
- **Cambio de una decisión estable:** 60 bits está por debajo de los «128 bits o más» de la spec 89 D7. La opción 2 de D1 la respeta; la recomendación la revisa explícitamente.

## 6. Correcciones sin decisiones (hallazgos 13 y 14)

### 6.1 URLs intactas en el editor y la vista final (hallazgo 13)

- `whatsappTextToPreviewHtml` corta el texto en tramos URL / no URL antes de escapar (`/https?:\/\/[^\s<>"']+/g`). Aplica `*`, `_`, `~` y ```` ``` ```` solo a los tramos que no son URL y escribe cada URL como `<a href="URL">URL</a>` (escapada).
- Con `<a>`, TipTap (`Link`, ya configurado en `RichTemplateEditor.tsx:68`) la toma como enlace y `htmlToWhatsApp` la devuelve tal cual (`label===href → href`, `templateChannelFormatting.tsx:39-44`): el viaje ida y vuelta da el mismo cuerpo.
- Puntuación final: un `.`, `,`, `)` o `»` al final de la URL queda fuera del enlace (misma idea que `mangledShareTokenFromPath`).
- Sin cambios en el servidor ni en lo guardado. Aplica también a la vista previa de modelos (`templates.tsx:169`) y a enlaces viejos y externos.
- Fuera de alcance: imitar la regla de WhatsApp de que `_x_` necesita borde de palabra (cambiaría la vista de modelos existentes).

### 6.2 «Abrir WhatsApp» en un clic (hallazgo 14)

1. **Sin barrera por `textBody` en WhatsApp.**
   - En `MessageComposer`, la condición «Guardá el mensaje para ver el contenido final…» (`:107-108`) aplica solo a email (que sí necesita su vista final).
   - En WhatsApp el botón se habilita si hay cuerpo, no faltan variables, el borrador no está en conflicto y el script está al día (`gated`, `:104`).
   - Sin cambios locales, el clic hace `dispatch` de la revisión guardada. Con cambios, hace `saveThenDispatch`: guarda y abre; la pestaña se abre dentro del clic y se cierra si el guardado falla.
2. **Servidor coherente.** `saveBody` (`salesMaterialDraft.ts:75`) guarda `text_body=clean` en WhatsApp e Instagram, igual que `edit` (`communicationService.ts:612`). Email queda igual (solo refresca el final si ya existía). Así, un borrador con material abre directo en la vista final (`finalReady`, `:39`) con «Abrir WhatsApp» a la vista, que es el camino del smoke.
3. **«Seguir editando» con el mismo botón.** `DraftsBlock` arma un pie propio y lo pasa como `actionSlot`. El botón final queda visible mientras se edita, con las mismas reglas que en «Contactar». Al abrirse el canal, el bloque se cierra como el diálogo (`onOpened`).
4. **Reglas que no cambian:**
   - El guardado usa la revisión que tenía el borrador: si cambió en otra ventana, el servidor responde conflicto, se muestra «Este borrador cambió en otra ventana. Revisalo antes de seguir.» (`:150`), la pestaña se cierra y no se abre nada.
   - Doble clic: bloqueado por `processing` y `mutation.isPending` (`:110`).
   - Nada se manda sin el clic del vendedor: «Abrir WhatsApp» abre el chat con el texto y el vendedor toca enviar en WhatsApp. El intento queda «Abierto · sin confirmar» como hoy.
   - Un fallo de `dispatch` con resultado incierto nunca se reintenta solo.
   - Email no cambia: con cambios, el pie dice «Guardar y revisar» y enviar es un segundo clic (decisión del 28/10).
   - Instagram no cambia (D6): el texto se copia dentro del clic, así que con cambios sin guardar sigue pidiendo guardar primero (`:107`, `ig&&dirty`).
5. **No se agrega autoguardado** (ver D6, opción B).

## 7. Abrir el archivo o la página, por material (hallazgo 12)

Propuesta con la recomendación (D3 opción A, D4 opción A):

- **Migración nueva** (`056_sales_material_link_target.sql` o el siguiente número libre): `ALTER TABLE crm_sales_materials ADD COLUMN link_target text NOT NULL DEFAULT 'page' CHECK(link_target IN ('page','file'))`. Los materiales existentes quedan en «página»: **los enlaces ya enviados se comportan igual hasta que el admin cambie el material**.
- **Configuración por material:**
  - En el formulario del admin (`SalesMaterialForm.tsx`), campo «Al abrir el enlace» con dos opciones: «Mostrar la página de Hospeda» / «Abrir el archivo directamente».
  - Va en la acción `update` de `/_api/sales_materials` (Zod, `revision`, solo admin como el resto: `assertSalesMaterialAdmin`).
  - Ayuda: «En el celular, los archivos que el navegador no muestra (presentaciones, planillas, comprimidos) se descargan.»
- **Se lee al abrir**, no al enviar, como la versión actual del material (D6 de la spec 89): cambiar la opción afecta a los enlaces ya enviados.
- **`GET /m/<...>` con `link_target='file'` y material de archivo:**
  - **Persona** (no bot, `GET`): se suma el registro técnico como hoy y se responde 302 a la misma URL prefirmada de `/file` (inline), con los encabezados de `PUBLIC_SHARE_HEADERS` (`no-referrer`: el token no viaja a R2).
  - **Bot de vista previa o `HEAD`:** la página de siempre, para que WhatsApp arme la vista previa con portada y título.
  - Revocado, retirado, desconocido o límite: las mismas páginas de estado (410, 404, 429). La opción nunca saltea esos controles.
  - Android y PDF: el navegador decide (Chrome Android suele descargarlo). Se avisa en la ayuda del formulario.
- **Material de enlace externo (`source='url'`):** según D4.
  - Con la recomendación (A), la opción «Abrir directamente» está deshabilitada para materiales de enlace externo («Los enlaces externos siempre muestran la página de Hospeda.»). Se mantiene la decisión de spec 89 de no redirigir nunca a URL externas.
- No se agrega una ruta extra para ver la página de un material en modo «archivo» (KISS): si el admin quiere la página, elige «página».

## 8. Mandar el archivo mismo por WhatsApp (tema abierto, D5)

Factibilidad verificada contra el código y las capacidades conocidas:

- **`wa.me` / `api.whatsapp.com/send`:** solo aceptan `text` (y el número). No hay parámetro para adjuntar. Es lo que usa `dispatch`.
- **User script en WhatsApp Web:**
  - Técnicamente podría simular el adjunto: bajar el archivo con `GM_xmlhttpRequest` y pegarlo con un `DataTransfer` sintético en el chat.
  - Es frágil: depende del DOM interno de WhatsApp Web, que cambia sin aviso.
  - Hay que bajar los bytes al script (hasta 500 MB por archivo, `89-material-de-venta.md:44`).
  - Choca con las reglas de aislamiento del script (eventos reales, sin leer el portapapeles, `docs/decisiones.md:384`).
  - El CRM no puede confirmar que el archivo salió: el eco confirma texto.
- **Web Share API con archivos** (`navigator.share({files})`):
  - Funciona en el celular: abre la hoja de compartir y el vendedor elige WhatsApp y el chat a mano.
  - No precarga destinatario ni texto de forma confiable y no deja rastro en el CRM (no se puede ni registrar el intento).
  - En la computadora el soporte es parcial.
- **Copiar imagen:** el portapapeles solo acepta `image/png` de forma confiable. Un «Copiar imagen» para materiales de imagen se puede pegar en WhatsApp Web, pero tampoco queda registrado.
- **API oficial de WhatsApp Business (Cloud API):** sí manda documentos, pero exige número de empresa propio, plantillas aprobadas fuera de la ventana de 24 h y costo por conversación. Es otro producto.

Conclusión: el enlace es lo único que el CRM puede registrar y revocar. La opción «Abrir el archivo directamente» (sección 7) cubre lo que el cliente percibe («toco y veo el archivo») sin perder el registro técnico ni la revocación. **Recomendación: fuera de alcance de esta spec** (D5).

## 9. Decisiones abiertas

1. **D1 — Formato y largo del token.**
   - **Opción 1:** mantener los 43 caracteres y anteponer el slug (`/m/folleto-2027-<43>`).
     - Pro: seguridad intacta (256 bits) y sin tocar la decisión de spec 89.
     - Contra: el enlace queda todavía más largo (~85 caracteres); solo mejora el principio.
     - Impacto: parser con slug, sin migración.
   - **Opción 2:** slug + 26 caracteres base32 (128 bits, el piso de spec 89 D7).
     - Pro: respeta D7 al pie de la letra.
     - Contra: ~70 caracteres, casi tan largo como hoy; poca mejora visible.
     - Impacto: igual que la opción 3.
   - **Opción 3:** slug + 12 caracteres base32 en minúscula (60 bits), slug decorativo, límite por `/64` en IPv6.
     - Pro: legible y corto (~55 caracteres); adivinar un enlace es inviable aun con una botnet (sección 5.2); sin `_` ni mayúsculas; sin migración.
     - Contra: baja el piso de 128 a 60 bits (revisa D7); 8 caracteres más que la propuesta del propietario.
     - Impacto: `salesMaterialShare.ts`, `salesMaterialShareService.ts`, `salesMaterialMessage.ts`, tests con regex de token.
   - **Opción 4 (propuesta del propietario):** slug + 4 caracteres válidos solo con el título, más límites duros (5 desconocidos por IP por hora, `/64`, presupuesto global, contadores persistidos en la base para que no se borren al reiniciar).
     - Pro: el enlace más corto.
     - Contra: 2^24 combinaciones. Aun con todos los límites se filtra un enlace cada pocos días ante un atacante distribuido. El título no suma secreto. Colisiones desde unos 4.000 enlaces. El presupuesto global lo agota cualquiera y deja sin respuesta a quien tipea mal. Hash invertible al instante si se filtra la base. El registro técnico deja de servir.
     - Impacto: migración (slug guardado por enlace, unicidad por material), contadores persistidos y reintentos de generación.
   - **Recomendación: opción 3.** Los 8 caracteres de diferencia con la opción 4 compran 2^36 (unas 69 mil millones de veces) más combinaciones; es la única que da un enlace legible y no adivinable.
2. **D2 — ¿El token vale solo junto con el título?**
   - **Opción A:** slug decorativo, se busca solo por token.
     - Pro: renombrar un material no rompe enlaces; sin migración; el título no es secreto, así que validarlo no protege.
     - Contra: `/m/cualquier-cosa-<token>` también abre el material (solo con un token válido, que únicamente tiene quien lo recibió).
   - **Opción B:** guardar el slug por enlace al crearlo y exigirlo (404 si no coincide).
     - Pro: lo que pidió el propietario, al pie de la letra.
     - Contra: migración (`public_slug` en `crm_sales_material_shares`); suma como mucho ~6 bits. Un linkificador que corte o cambie el slug (tildes, mayúsculas) rompe el enlace.
   - **Opción C:** slug decorativo con 308 al slug actual si no coincide.
     - Pro: la URL siempre muestra el título vigente.
     - Contra: una redirección más por clic, sin beneficio de seguridad.
   - **Recomendación: A.**
3. **D3 — ¿Dónde se elige «abrir el archivo o la página»?**
   - **Opción A:** por material, la elige el admin, se lee al abrir.
     - Pro: lo pedido; una sola decisión por material; afecta también a enlaces ya enviados, como la versión actual.
     - Contra: cambiar la opción cambia el comportamiento de enlaces ya mandados.
     - Impacto: migración, formulario y la rama en `page()`.
   - **Opción B:** por material, pero guardada en cada enlace al crearlo.
     - Pro: un enlace enviado nunca cambia de comportamiento.
     - Contra: dos columnas, más lógica, y el admin no puede corregir enlaces viejos.
   - **Opción C:** que el vendedor elija en cada envío.
     - Pro: flexible.
     - Contra: otra decisión en el camino del vendedor (contradice la decisión 380).
   - **Recomendación: A.**
4. **D4 — Materiales de enlace externo con «abrir directamente».**
   - **Opción A:** no se permite; siempre la página.
     - Pro: mantiene la decisión de spec 89 (sin redirecciones a terceros); KISS.
     - Contra: un recorrido 360 o un video de YouTube sigue pasando por la página.
   - **Opción B:** 302 a la URL externa cargada por el admin.
     - Pro: el cliente llega directo.
     - Contra: revisa una decisión estable. No es un open redirect clásico (el destino lo fija el admin y solo con un token válido), pero el CRM pasa a redirigir a sitios de terceros.
   - **Recomendación: A** para esta spec; B se puede sumar después con una línea.
5. **D5 — Mandar el archivo mismo por WhatsApp.**
   - **Opción A:** fuera de alcance; el enlace (con «abrir directamente») es el camino.
     - Pro: registrable, revocable y sin depender del DOM de WhatsApp.
     - Contra: el cliente no recibe el archivo en el chat.
   - **Opción B:** «Compartir archivo» con Web Share API en el celular.
     - Pro: el archivo llega al chat.
     - Contra: sin destinatario precargado y sin registro; solo celular.
   - **Opción C:** adjunto automático desde el user script.
     - Contra: frágil, archivos grandes, choca con el aislamiento del script y no se puede confirmar.
   - **Opción D:** API oficial de WhatsApp Business.
     - Contra: otro producto, con costo y plantillas.
   - **Recomendación: A.**
6. **D6 — Alcance del «un clic» (hallazgo 14).**
   - **Opción A:** WhatsApp sin barrera de `textBody`, guardar y abrir en un clic también en «Seguir editando»; email e Instagram como hoy.
     - Pro: resuelve el smoke; reutiliza `saveThenDispatch`; no toca el portapapeles.
     - Contra: en Instagram sigue el paso de guardar cuando hay cambios.
   - **Opción B:** además, autoguardado con demora mientras se escribe.
     - Pro: nunca hay «cambios sin guardar».
     - Contra: una revisión nueva cada pocos segundos, conflictos con otra ventana más frecuentes, y más escrituras sin acción del vendedor. No hace falta si el botón guarda.
   - **Opción C:** además, Instagram copia el texto local dentro del clic y después guarda y registra.
     - Pro: un clic también en Instagram.
     - Contra: si el guardado falla, el texto ya está en el portapapeles y la vendedora puede pegar algo que no quedó registrado. El portapapeles no se puede deshacer.
   - **Recomendación: A.**

### Decisión del propietario (31/10/2026)

- **D1:** enlace = slug + 4 caracteres (el propietario eligió contra la recomendación de 12; riesgo aceptado y documentado: 2^24 combinaciones). Límites duros: 5 intentos desconocidos por IP por hora, IPv6 agrupado por /64, contadores persistidos en la base.
- **D2:** el slug se exige (guardado por enlace; comparación sin distinguir mayúsculas y normalizando tildes; 404 si no coincide).
- **D3:** «abrir el archivo directo» se elige por material, lo decide el admin y se lee al abrir (afecta enlaces ya enviados).
- **D4:** los materiales de enlace externo con «abrir directo» redirigen al sitio (solo https, destino fijado por el admin, solo con enlace válido). Modifica la regla de la spec 89 de no redirigir a terceros.
- **D5:** el archivo se adjunta desde el user script (spec 105, nueva, por escribir): adjunta el archivo en WhatsApp Web con el texto como descripción más el enlace corto; tope 50 MB (por encima, solo enlace con aviso); el vendedor ve la vista previa y envía él; el script registra el envío al ver el mensaje; Instagram y celular siguen con enlace. Sale en una sola versión 1.8.0 junto con los arreglos que iban a ser 1.7.1.

## 10. Componentes y funciones

| Pieza | Archivo | Cambio | Bloque |
| --- | --- | --- | --- |
| Formateo WhatsApp | `src/helpers/templateChannelFormatting.tsx:12-20` | URLs fuera del formateo, como `<a>` | 1 |
| Barrera del botón final | `src/components/MessageComposer.tsx:105-108` | `textBody` solo en email | 2 |
| Texto final al agregar material | `src/helpers/salesMaterialDraft.ts:70-76` | `text_body=clean` en WhatsApp e Instagram | 2 |
| «Seguir editando» | `src/components/communication/DraftsBlock.tsx:22` | pie propio como `actionSlot`, `onOpened` cierra | 2 |
| Token y parser | `src/helpers/salesMaterialShare.ts:3-13,51-53` | `generateShareToken` (12 base32 + slug), `parseShareSegment`, `shareSlug({title})`, límite por `/64` | 3 |
| Resolución | `src/helpers/salesMaterialShareService.ts:49-58,74-85` | `path` con slug; búsqueda por uno o dos hashes | 3 |
| Tokens en el cuerpo | `src/helpers/salesMaterialMessage.ts:72-82` | ambos formatos vía `parseShareSegment` | 3 |
| Rutas | `src/server/app.ts:182-187`, `src/endpoints/materialShare.ts` | sin cambio de rutas (`:token` es el segmento entero); 308 de enlaces con puntuación para ambos formatos | 3 |
| Opción por material | migración nueva, `salesMaterialService.ts`, `salesMaterials.schema.ts`, `SalesMaterialForm.tsx` | `link_target` | 4 |
| Página o archivo | `src/endpoints/materialShare.ts:46-56` | rama `file` para personas: registro técnico + 302 | 4 |

Copy nuevo (UI, español): «Al abrir el enlace», «Mostrar la página de Hospeda», «Abrir el archivo directamente», «En el celular, los archivos que el navegador no muestra (presentaciones, planillas, comprimidos) se descargan.», «Los enlaces externos siempre muestran la página de Hospeda.». Sin copy nuevo en los bloques 1 a 3.

## 11. Plan de tests

Regresión primero: cada bloque arranca con un test que reproduce el caso del smoke y falla.

| Tema | Unit (`*.spec.ts(x)`) | Integración (`scripts/test-*.ts`) | E2E (`tests/browser/*.e2e.ts`) |
| --- | --- | --- | --- |
| 13: URLs intactas | `templateChannelFormatting.spec.ts` (nuevo): `Mirá https://crm.x/m/ab_cd_ef y _hola_` → la URL sale entera dentro de `<a>`, `_hola_` en cursiva; ida y vuelta `htmlToWhatsApp(whatsappTextToPreviewHtml(t))===t` con `_`, `*`, `~` en URLs, dos URLs y puntuación final; `MessageComposer.spec.tsx`: el editor y la vista final muestran el enlace con sus `_` | — | `material-composer.e2e.ts`: un cuerpo con un enlace que tiene dos `_` se ve sin cursiva y el texto visible contiene la URL exacta |
| 14: un clic | `MessageComposer.footer.spec.tsx`: borrador WhatsApp con material, sin cambios y `textBody:null` → «Abrir WhatsApp» habilitado y llama `dispatch` (falla hoy); con cambios → `edit` y después `dispatch`; conflicto en `edit` → pestaña cerrada, sin `dispatch`; email sin cambios y `textBody:null` sigue bloqueado; Instagram con cambios sigue pidiendo guardar. `DraftsBlock` (spec nuevo o en `CommunicationPanel.spec.tsx`): «Seguir editando» muestra «Abrir WhatsApp» mientras se edita | `test-sales-material-composer.ts`: `material_add` en un borrador WhatsApp en blanco deja `text_body` igual al cuerpo; en email no cambia | `material-composer.e2e.ts`: «Enviar material» → «Abrir WhatsApp» en un clic, sin «Guardar cambios» |
| 11: formato | `salesMaterialShare.spec.ts`: token de 12 caracteres del alfabeto; `shareSlug` (tildes, `ñ`, símbolos, 40 caracteres, vacío); `parseShareSegment` (heredado, nuevo, sin slug, ambiguo de 43, basura); límite por `/64`; `salesMaterialMessage.spec.ts`: `shareTokenHashesInBody`/`shareUrlInBody` encuentran ambos formatos | `test-sales-material-share.ts`: enlace nuevo 200; slug cambiado o ausente 200; token alterado 404; revocado 410; enlace heredado de 43 sigue 200 y 410 al revocar; 429 tras 20 desconocidos (formato nuevo); `test-sales-material-composer.ts`: **`dispatch` con un enlace nuevo en el cuerpo no lo revoca** y fija `sent_version`; actualizar regex de token en `test-sales-material-templates.ts` y `test-userscript.ts:273` | `material-share.e2e.ts`, `material-composer.e2e.ts:64,73`, `material-templates.e2e.ts:46`: regex del formato nuevo |
| 12: archivo directo | `SalesMaterialForm.spec.tsx`: campo visible, deshabilitado para enlace externo | `test-sales-material.ts`: `update` con `link_target` (solo admin, `revision`); `test-sales-material-share.ts`: `file` + persona → 302 a R2 y registro técnico +1; bot y `HEAD` → página 200; revocado → 410; `page` → página como hoy | `material-share.e2e.ts`: material «abrir directamente» lleva al archivo |

Suite de navegador completa antes del merge de cada bloque con UI (`npm run build && npm start`, luego `npm run test:browser`; ~10 minutos).

## 12. Riesgos

- **Dos formatos para siempre.** El parser acepta los dos; un helper único y sus tests evitan que una de las cinco funciones que leen tokens quede atrás. El peor caso (revocar como «Quitado del texto» un enlace nuevo) tiene test de regresión.
- **60 bits en lugar de 128.** Decisión consciente (D1), con números en 5.2.
- **«Abrir directamente» cambia enlaces ya enviados** (D3 A). Es lo esperable para el admin. La ayuda lo dice.
- **Archivos que el navegador no muestra** se descargan al abrir directo. La ayuda del formulario lo avisa.
- **Botón que guarda y abre:** si `edit` responde bien y `dispatch` falla, el borrador queda guardado y la pestaña se cierra; nada se reintenta solo (comportamiento actual de `saveThenDispatch`).

## 13. Orden de implementación (PRs a `staging`)

Cada bloque, con typecheck, `npm test`, build y sus integraciones en verde, y CI verde en el SHA del PR. Los bloques son independientes entre sí.

1. **Bloque 1, hallazgo 13 (sin decisiones):** formateo con URLs intactas. Solo cliente.
2. **Bloque 2, hallazgo 14 (sin decisiones; D6 con la recomendación A):** barrera de `textBody`, `saveBody` y «Seguir editando».
3. **Bloque 3, hallazgo 11 (espera D1 y D2):** formato nuevo, parser único, límite por `/64`. Sin migración con la recomendación.
4. **Bloque 4, hallazgo 12 (espera D3 y D4):** migración nueva, formulario y rama `file`.

D5 no genera bloque con la recomendación.

## 14. Aceptación

- Un borrador de WhatsApp con un enlace que tiene `_` se ve sin cursiva en el editor y en la vista final; copiar el texto copia el enlace exacto y abre la página.
- «Enviar material» → «Abrir WhatsApp» abre el chat en un clic, sin «Guardar cambios»; con cambios sin guardar, un clic guarda y abre; un conflicto no abre nada. «Seguir editando» un borrador de WhatsApp muestra el mismo botón. Email e Instagram se comportan como hoy.
- (Si se aprueba D1/D2) un enlace nuevo se ve como `https://crm.hospeda.com.ar/m/<título>-<12 caracteres>`, abre la página, se revoca con 410, y `dispatch` lo registra como enviado. Un enlace de 43 caracteres mandado antes del cambio sigue abriendo y revocándose igual.
- (Si se aprueba D3/D4) con «Abrir el archivo directamente», tocar el enlace en el celular abre el archivo; la vista previa de WhatsApp sigue mostrando portada y título; un enlace revocado responde 410; el registro técnico suma el acceso.
- `npm run typecheck`, `npm test`, `npm run build`, las integraciones listadas y `npm run test:browser` en verde; CI verde en el SHA de cada PR.

## 15. Migraciones y datos

- Bloques 1, 2 y 3 (con la recomendación): **ninguna migración**. Los tokens nuevos usan la misma columna `token_hash`; los viejos no se tocan.
- Bloque 4: **una migración nueva**, aditiva (`link_target` con valor por defecto `'page'`). No se edita ninguna migración aplicada.
- Ningún bloque reescribe mensajes ni enlaces enviados, ni escribe en producción. D1 opción 4 o D2 opción B necesitarían otra migración (slug por enlace, contadores persistidos), descripta en sección 9.
