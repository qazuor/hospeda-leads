# Spec 105 — El script adjunta el material en WhatsApp Web

Estado: **borrador para revisión del propietario** (31/10/2026). Origen: decisión D5 de la [spec 101](101-links-y-envio-de-material.md) (31/10/2026) y B4 de la [spec 103](103-bandeja-instagram-userscript.md). Tipo: cambio de producto en el user script (adjuntar el archivo del material en WhatsApp Web) con un endpoint nuevo en el servidor, más la publicación de la **versión 1.8.0** del script, que junta esta spec con los arreglos de la 103 (bloque 4, antes «1.7.1») y el separador «De otras verticales» de la [spec 102](102-pantalla-de-material-de-venta.md) (D3). Las decisiones de producto ya las tomó el propietario; la sección 17 deja solo las bifurcaciones reales que quedan. Migración: **ninguna** (se reusan `attach` y `attached_version` de `crm_sales_material_shares`, `migrations/046_sales_material.sql:69-70`).

Parte de la [spec 89](89-material-de-venta.md) (enlace por material y mensaje, registro técnico, adjuntos de email), la [spec 96](96-contact-three-clicks.md) (script conectado y en la última versión en la computadora), la [spec 98](98-sales-material-script-panels.md) («Enviar material» desde el panel), la spec 100 D7 (un WhatsApp abierto hace menos de 5 minutos espera la confirmación del script) y la spec 101 (enlace corto `/m/<slug>-<4>`). Respeta `AGENTS.md` («Abrir un canal, guardar un borrador o mover una etapa NO es evidencia…»; permisos y «No contactar» en todo camino de escritura; loading y bloqueo de doble envío; **nunca reintentar solo un envío de resultado incierto**; secretos fuera de URLs y logs) y `docs/decisiones.md` (línea 380: **siempre el camino más simple para el vendedor**; línea 384: el script nunca lee el portapapeles y sus acciones salen de eventos reales del vendedor; línea 403: en Instagram el material viaja solo como enlace; línea 427: esta spec).

## 1. Problema

1. Desde el panel de WhatsApp, «Enviar material» pega un texto con el enlace del material («Podés ver «Título» en: https://crm.hospeda.com.ar/m/folleto-2027-k7qz»). El cliente tiene que tocar el enlace para ver el archivo. El propietario quiere que **el archivo llegue al chat**, como lo mandaría el vendedor a mano.
2. La spec 101 §8 dejó el adjunto fuera de alcance por frágil (DOM de WhatsApp Web, archivos grandes, confirmación). El propietario lo decidió igual (D5), con condiciones: tope de 50 MB, el vendedor ve la vista previa y aprieta Enviar, el registro sale de ver el mensaje enviado, Instagram y celular siguen con enlace.
3. La versión nueva del script obliga a todos los vendedores a actualizar el mismo día (barrera de la spec 96). Los arreglos que iban a salir como 1.7.1 (spec 103, bloque 4) y el separador de verticales de la spec 102 viajan en la misma versión para pedir una sola actualización.

## 2. Objetivos y no objetivos

### Objetivos

1. Con un material de archivo de hasta 50 MB, «Pegar en el chat» deja en WhatsApp Web la **vista previa del archivo con el texto del mensaje como descripción**, enlace corto incluido. El vendedor la revisa y aprieta Enviar.
2. Un material de enlace externo, un archivo de más de 50 MB o cualquier paso que falle terminan en **solo el texto con el enlace**, con un aviso visible. Nunca queda un estado a medias (sección 5.4).
3. El envío se registra como hoy: cuando el script ve la burbuja saliente ya enviada. Además, el CRM anota que el material fue **adjuntado** (versión), sin inferir nada más.
4. El archivo se baja con el token del script, desde un endpoint del CRM acotado a un enlace de un borrador del propio vendedor. Nada queda público y el token nunca viaja en una URL.
5. Una sola versión del script, la 1.8.0, con esta spec, el bloque 4 de la 103 y el separador de la 102.

### No objetivos

- Que el script envíe: no aprieta Enter ni el botón de enviar, ni en la vista previa ni en el chat.
- Instagram (sigue con enlace, línea 403) y el celular (el script no corre ahí; `wa.me` sigue con el texto).
- Adjuntar desde el composer del CRM sin el script, ni por `wa.me`/`web.whatsapp.com/send` (no aceptan archivos, spec 101 §8). Lo que pase con un chat que abrió el CRM es la D1.
- API oficial de WhatsApp Business.
- Cambiar qué cuenta como envío, como respuesta o como «el cliente lo vio». Adjuntar no es evidencia de entrega ni de lectura.
- Cambiar el tope de subida de material (150 MB, spec 102) o el de adjuntos de email.
- Trabajo solo de accesibilidad (diferido por el propietario).

## 3. Hallazgos

Verificado en `origin/staging` el 31/10/2026 (rama `docs/spec-105-script-attach`, `ddf0078`). Las líneas citadas son de esta rama.

### 3.1 Cómo pega hoy el panel

- `openCompose` (`userscript/src/compose.ts:89`) arma el borrador con `prepare`, suma el material con `material_add` (el CRM crea el enlace del borrador y devuelve el texto) y muestra la vista previa con «MATERIAL EN EL MENSAJE» (`compose.ts:173-176`).
- «Pegar en el chat» (`paste`, `compose.ts:254-271`): revisa que la caja esté vacía o tenga el texto que pegó el script (si no, pide «Reemplazar»), llama a `open()` (mismo chat, mismo teléfono y `dispatch` una sola vez por borrador, `compose.ts:242-248`), vuelve a revisar que nada cambió durante los pedidos y pega con `pasteIntoComposer` (`userscript/src/selectors.ts:31-40`: un `paste` sintético con `DataTransfer` y, si no alcanza, `insertText` línea por línea; nunca Enter).
- Si pegar falla, ofrece «Copiar texto» y «Reintentar»; nada se reintenta solo (`compose.ts:198`).
- `dispatch` deja el mensaje en `whatsapp_opened` y fija `sent_version` de cada enlace que sigue en el texto; para WhatsApp fuerza `attach=false` (`src/helpers/salesMaterialDraft.ts:182`).

### 3.2 Cómo se registra el envío

- `AutoRegisterController` (`userscript/src/autoRegister.ts`) observa `#main` y, 5 s después del último cambio, registra los mensajes nuevos. Un saliente solo se registra cuando su burbuja ya no tiene el reloj (`outboundDeliveryState(row)==="sent"`, `selectors.ts:4`): **un archivo que todavía se está subiendo no se registra**, y uno que falló tampoco.
- Sin registro automático, el vendedor usa «Registrar mensajes» (mismo endpoint).
- El servidor completa el intento `whatsapp_opened` del mismo teléfono y ventana de tiempo cuyo texto coincide con lo enviado (`matchingPending`, `src/helpers/userscriptRegister.ts:57-66`; `sentMatchesPrepared`, solapamiento de palabras ≥ 0,5, `userscript/src/textMatch.ts`).
- `textOf` (`selectors.ts:68-89`) lee el texto seleccionable de la burbuja; si no hay texto y hay un adjunto devuelve `[documento: …]`, `[imagen]`, etc. **Con descripción, devuelve la descripción**, que es el texto preparado: el intento se completa igual que hoy. Que WhatsApp marque la descripción de un documento con el mismo nodo seleccionable se confirma en el prototipo (6.4).

### 3.3 Enlaces, adjuntos y versiones

- Cada material de un borrador tiene su enlace en `crm_sales_material_shares` (un enlace por material y mensaje, spec 89 D6). La tabla ya tiene `attach boolean` y `attached_version integer` (`046_sales_material.sql:70`), que hoy usa solo el email: `claimDraftMaterials` (`salesMaterialDraft.ts:152-186`) y `markAttachedVersions` (`:188-190`).
- `attachBlockReasons` (`src/helpers/salesMaterialMessage.ts:130-140`) devuelve para WhatsApp «WhatsApp no adjunta archivos: va solo el enlace.».
- El material puede ser archivo (`object_key`, `file_name`, `mime_type`, `byte_size` en `crm_sales_material_versions`) o enlace externo (`url`). El enlace siempre sirve la **versión actual** (spec 89 D6).

### 3.4 Almacenamiento

- R2 privado, endpoint `https://<cuenta>.r2.cloudflarestorage.com` (`src/helpers/r2.ts:28-36`). `R2Storage` tiene `presignGet`, `head`, `readPrefix` y `read` (este último solo para objetos chicos, lo carga entero en memoria). **No hay lectura en streaming.**
- Las rutas públicas `/m/<segmento>/file` responden 302 a un GET prefirmado de 5 minutos (`src/endpoints/materialShare.ts:74-81`).

### 3.5 Metadatos y API del script

- Cabecera generada en `userscript/vite.config.ts:11`: `@grant GM_xmlhttpRequest`, `GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`, `unsafeWindow`; `@connect` **solo el host del CRM**; `@match` WhatsApp Web, Instagram y el CRM.
- `request` (`userscript/src/api.ts:9-22`) manda el token como `Authorization: Bearer` y la versión en `X-Hospeda-Userscript-Version`, siempre con `responseType:"json"`. No hay descarga binaria.
- `scriptAuth` (`src/endpoints/userscript.ts:39`): token válido y versión ≥ `USERSCRIPT_MIN_VERSION` (1.5.0); si no, 401 o 426. El token autentica al usuario para toda la API del script (no tiene alcances).
- `registerSchema` (`userscript.ts:35`) no es estricto: un campo nuevo y opcional en cada mensaje es aditivo.
- Versión actual: `USERSCRIPT_VERSION = "1.7.0"` (`userscript/src/version.ts`). La barrera compara la instalada con la última publicada; una instalada **mayor** pasa (`src/helpers/userscriptGate.ts:30`). Tampermonkey nunca baja de versión sola.
- Aviso de versión nueva en WhatsApp Web, Instagram y el CRM: `userscript/src/updatePrompt.ts` (PR #244).

### 3.6 Lo que viaja en la 1.8.0 además de esta spec

- **Spec 103, bloque 4** (`103-bandeja-instagram-userscript.md` §8): panel de Instagram al día (revalidar al entrar a un chat con caché de más de 10 s y al volver a la pestaña; el foco no congela el redibujo al cambiar de chat; prueba de chat estable en dos ticks, también en `learn()`), panel de WhatsApp que revalida el contexto al volver a la pestaña, diagnóstico de insignias en «Ajustes» de Instagram, y «Sin asignar» → «Sin responsable».
- **Spec 102, D3**: en el selector de material, el material de la vertical del negocio (y el de «todas») arriba, «De otras verticales (N)» plegado, y todo desplegado si arriba no queda nada. El servidor manda `otherVertical` por material y `contextVertical` en la rama `feat/spec-102-verticals-covers` (`src/endpoints/userscript.ts:188-191` de esa rama); **todavía no está en `staging`**. El panel trata la ausencia de `otherVertical` como `false`.

## 4. Resumen de bloques

| Bloque | Qué | Necesita decisión | Script nuevo | Migración |
| --- | --- | --- | --- | --- |
| 0 | Prototipo en WhatsApp Web real (6.4) | No | No | No |
| 1 | Servidor: metadatos de adjunto, `GET /_api/userscript/material_file`, `media` en el registro, interruptor | D4, D5 | No (aditivo, llega a 1.7.0 sin efecto) | No |
| 2 | Script: adjuntar en «Pegar en el chat» | D1, D2, D3 | Sí, 1.8.0 | No |
| 3 | Script: bloque 4 de la spec 103 | No (ya decidido) | Sí, 1.8.0 | No |
| 4 | Script: separador «De otras verticales» (spec 102 D3) | No (ya decidido) | Sí, 1.8.0 | No |
| 5 | Publicación de la 1.8.0 | No | — | No |

El bloque 2 espera el 0 y el 1. El 4 espera que la rama de la spec 102 llegue a `staging`. El 3 no depende de nada.

## 5. Flujo del vendedor

### 5.1 Qué se adjunta (plan)

Al mostrar la vista previa del borrador, el panel calcula un **plan** con lo que devuelve el CRM para cada material del borrador (7.1). Función pura `attachPlan` en `userscript/src/attach.ts`:

| Caso | Plan | Aviso en el panel |
| --- | --- | --- |
| Un solo material, de archivo, `attach.eligible` | Adjuntar ese archivo, texto como descripción | «Va el archivo «{título}» ({tamaño}) con el texto como descripción.» |
| Material de enlace externo | Solo texto | Ninguno (es lo esperable; la vista previa ya muestra el enlace) |
| Archivo de más de 50 MB | Solo texto | «“{título}” pesa {N} MB: va solo el enlace (se adjuntan archivos de hasta 50 MB).» |
| Dos o más materiales | Según D2 | Según D2 |
| Texto más largo que el máximo de descripción de WhatsApp (6.4) | Solo texto | «El mensaje es muy largo para ir como descripción del archivo: va solo el enlace.» |
| CRM sin metadatos (anterior a esta spec) o interruptor apagado (D5) | Solo texto | Ninguno |
| Borrador sin material | Como hoy | — |

Con plan «solo texto», todo sigue exactamente como en la 1.7.0.

### 5.2 Paso a paso (plan «adjuntar»)

El vendedor ve un solo botón, **«Pegar en el chat»**, y arriba el aviso de 5.1. «Copiar» sigue copiando solo el texto (sin archivo).

1. **Controles de hoy**, en el mismo orden: borrador listo, caja vacía o con el texto que pegó el script (si no, «Reemplazar»), mismo chat, mismo teléfono (`chatMatchesRecipient`).
2. **Bajar el archivo** (antes de `dispatch`, así una falla acá no deja nada abierto en el CRM). `GET /_api/userscript/material_file` (7.2) con `GM_xmlhttpRequest` y `responseType:"arraybuffer"`. El panel muestra «Bajando el archivo… {n} %» y un botón «Cancelar» (aborta el pedido; el panel vuelve a la vista previa sin cambios). Al terminar, el script verifica que el tamaño y el tipo coinciden con los metadatos (si no, falla).
   - Falla (red, 5xx, 429, tamaño o tipo distinto, tiempo agotado): **no se pega nada**. El panel muestra «No pude bajar el archivo.» con «Reintentar» y «Pegar solo con el enlace». Nada se reintenta solo.
   - Rechazo de negocio (403, 409: «No contactar», restricción, archivado, borrador cambiado): igual que un `dispatch` rechazado hoy; error en el panel, nada en el chat.
3. **`dispatch`** como hoy (`open()`): el mensaje pasa a `whatsapp_opened`. Si falla, error y nada en el chat (como hoy).
4. **Adjuntar en WhatsApp** (sección 6): se inyecta el archivo, se espera la vista previa de WhatsApp, se escribe el texto en el campo de descripción y se verifica que quedó completo.
5. **Terminar en un estado completo** (5.4). Con éxito, el panel pasa a «Listo, está en el chat» con «Revisá la vista previa de WhatsApp y apretá Enviar. Si al final no lo mandás, avisalo acá.» y los botones de hoy («Volver al negocio», «Cambiar de modelo», «No lo voy a enviar»).
6. **El vendedor aprieta Enviar** en WhatsApp. El script no hace nada más: el registro automático (o «Registrar mensajes») ve la burbuja con el archivo y la descripción cuando ya no tiene el reloj, y la manda con `media` (7.3). El servidor completa el intento por el texto de la descripción y anota el adjunto.

Si el vendedor cierra la vista previa sin enviar, el intento queda `whatsapp_opened` como cualquier pegado sin enviar: «No lo voy a enviar» lo cierra, y si no, aparece en «Requiere acción» como hoy.

### 5.3 Copy nuevo (español, UI del script)

«Va el archivo «{título}» ({tamaño}) con el texto como descripción.», «“{título}” pesa {N} MB: va solo el enlace (se adjuntan archivos de hasta 50 MB).», «El mensaje es muy largo para ir como descripción del archivo: va solo el enlace.», «Bajando el archivo… {n} %», «Cancelar», «No pude bajar el archivo.», «Pegar solo con el enlace», «Adjuntando en WhatsApp…», «Revisá la vista previa de WhatsApp y apretá Enviar. Si al final no lo mandás, avisalo acá.», «No pude adjuntar el archivo en WhatsApp: pegué el texto con el enlace.», «La vista previa de WhatsApp quedó abierta sin el texto. Cerrala con la X (no la envíes) y tocá «Pegar solo el texto».», «Pegar solo el texto». La nota del pie cambia solo con plan «adjuntar»: «El mensaje no se envía solo: el archivo y el texto quedan en la vista previa para que los revises y aprietes Enviar.».

### 5.4 Nunca a medias

Al terminar el paso 4, WhatsApp queda en **uno** de estos estados, y el script lo verifica antes de decir «Listo»:

| Estado | Cuándo | Panel |
| --- | --- | --- |
| A. Vista previa con el archivo y la descripción completa | Éxito | «Listo, está en el chat» |
| B. Sin vista previa abierta y la caja con el texto completo (enlace incluido) | Cualquier paso de 6.2 falló y la vista previa no llegó a abrirse, o se pudo cerrar | «Listo, está en el chat» + aviso «No pude adjuntar el archivo en WhatsApp: pegué el texto con el enlace.» |
| C. Vista previa abierta sin la descripción completa, y el script no pudo cerrarla | Falla al escribir la descripción y falla al cerrar | Aviso bloqueante: «La vista previa de WhatsApp quedó abierta sin el texto. Cerrala con la X (no la envíes) y tocá «Pegar solo el texto».»; «Pegar solo el texto» revisa que la vista previa se cerró y pega como en B |

B es exactamente lo que hace la 1.7.0, así que el intento ya abierto por `dispatch` queda bien: el texto tiene el enlace. Si pegar el texto también falla, sigue el camino de hoy («Copiar texto» y «Reintentar»). El script nunca deja un archivo sin texto con el panel diciendo «Listo», ni texto en la caja **y** una vista previa abierta a la vez.

## 6. Interacción con WhatsApp Web

### 6.1 Reglas

- Solo eventos que salen del clic del vendedor en «Pegar en el chat» (o en «Pegar solo el texto»). Nada en segundo plano.
- Nunca Enter, nunca clic en el botón de enviar de la vista previa ni del chat. Un test estático lo fija (12).
- Nunca se lee el portapapeles ni se escribe un archivo en él (línea 384).
- Ningún `<script>`, `iframe`, `blob:` ni pedido de red desde la página: los bytes llegan por `GM_xmlhttpRequest` y el `File` se arma en memoria.
- Selectores en `userscript/src/selectors.ts` (como el resto), con fixtures y un diagnóstico redactado de la vista previa si cambian.

### 6.2 Pasos y esperas

1. **Inyectar el archivo.** Estrategia elegida en el prototipo, en este orden de preferencia (se usa **una**; la segunda solo si la primera no abrió ninguna vista previa):
   - **a. `paste` con el archivo** en la caja del chat: un `ClipboardEvent("paste")` sintético con un `DataTransfer` que lleva el `File`, igual que el pegado de texto de hoy. WhatsApp Web abre la vista previa con los archivos pegados.
   - **b. Entrada de archivo del menú de adjuntar:** clic en «Adjuntar», luego en «Documento» (o «Fotos y videos», según D3), localizar el `input[type=file]` que WhatsApp crea, asignarle `files` desde un `DataTransfer` y disparar `change`. Si el menú quedó abierto y el paso falla, se cierra con Escape.
   - En Firefox el `File` y el `DataTransfer` se construyen con los constructores de la página si el prototipo muestra que WhatsApp no acepta los del sandbox.
2. **Esperar la vista previa:** un `MutationObserver` sobre `#app` hasta que aparezca el editor de medios con su campo de descripción, con tiempo máximo de 20 s (un PDF de 50 MB tarda en generar la miniatura). Sin vista previa a tiempo → estado B.
3. **Escribir la descripción:** el campo es otro `contenteditable`. Se usa la misma lógica que `pasteIntoComposer` sobre ese campo (refactor: la función recibe el editor) y se verifica con `holdsText` que quedó el texto completo.
4. **Verificar:** la vista previa sigue abierta, muestra un archivo (no dos) y la descripción tiene el texto. Si no → cerrar la vista previa (botón de cerrar o Escape) y verificar que se cerró y que la caja del chat está vacía → pegar el texto (estado B). Si no se cierra → estado C.
5. Se sueltan las referencias a los bytes al terminar, con éxito o sin él.

### 6.3 Fragilidad

WhatsApp Web cambia su DOM sin aviso y no documenta nada de esto. Cada paso tiene su verificación y su salida a B o C; el peor caso es el comportamiento de la 1.7.0 con un aviso. Si un cambio de WhatsApp rompe el adjunto para todos, el interruptor de D5 lo apaga sin publicar script.

### 6.4 Paso 0, prototipo (sin código en `staging`)

En Chrome, Edge y Firefox, con Tampermonkey y una cuenta de prueba que el propietario mande a su propio número (nunca a clientes), confirmar y anotar en esta spec:

1. Si `paste` con un `File` (PDF, JPG, DOCX) abre la vista previa; si no, si funciona la entrada del menú (6.2 b).
2. Si un `File` armado en el sandbox de Tampermonkey sirve o hace falta el de la página (Firefox).
3. Selectores estables del editor de medios: campo de descripción, botón de cerrar, cantidad de archivos.
4. Qué hace WhatsApp con un texto ya escrito en la caja al adjuntar (¿lo pasa a la descripción?). El flujo exige la caja vacía antes de inyectar, así que solo importa para no duplicarlo.
5. **Máximo de caracteres de la descripción** y qué pasa al superarlo (se fija la constante `CAPTION_MAX_CHARS`).
6. En la burbuja enviada: la descripción de un documento y de una imagen ¿está en `[data-testid='selectable-text']`/`.selectable-text`? ¿Qué atributo marca la burbuja como documento o imagen? Con eso se escriben los fixtures `current-document-caption.html` y `current-image-caption.html`.
7. Que la burbuja de un archivo de 50 MB lleva el reloj hasta terminar de subir (el registro espera) y que el `paste` y la espera no congelan la pestaña.
8. Saltos de línea, `*negrita*` y el enlace corto en la descripción: llegan intactos y el enlace es tocable en el celular.

Si el prototipo muestra que ninguna estrategia abre la vista previa de forma confiable, la spec vuelve al propietario antes del bloque 2.

## 7. Contrato del servidor

### 7.1 Metadatos de adjunto en el borrador (aditivo)

`PreparedTemplate.materials[]` y `MaterialChange.materials[]` (respuestas de `prepare`, `material_add` y `material_remove` en el canal WhatsApp) suman por material:

```ts
attach?: { eligible: boolean; reason: string | null; fileName: string | null; mimeType: string | null; byteSize: number | null; kind: "document" | "image" | null }
```

- Lo calcula un helper puro `whatsappAttachEligibility({source, fileName, mimeType, byteSize, limitBytes})` en `salesMaterialMessage.ts` (junto a `attachBlockReasons`, cuya rama de WhatsApp pasa a usarlo): enlace externo → «Es un enlace externo: va solo el enlace.»; sin nombre o sin tamaño → no elegible; más de `WHATSAPP_ATTACH_MAX_BYTES` (50 × 1024 × 1024) → el aviso de 5.1.
- `kind` sale del tipo MIME según D3.
- `fileName` es el **título del material** limpio más la extensión del archivo guardado («Folleto 2027.pdf»), no el nombre con que se subió.
- Con el interruptor apagado (D5), `eligible:false` sin motivo visible.
- Canal Instagram: sin `attach`.
- Un script 1.7.0 ignora el campo.

### 7.2 `GET /_api/userscript/material_file?messageId=<uuid>&shareId=<uuid>`

Registrado a mano en `src/server/app.ts` junto a las otras rutas del script; handler en `src/endpoints/userscript.ts` (o `userscriptMaterialFile.ts` si el archivo pasa de 500 líneas).

Controles, en este orden:

1. `scriptAuth`: token en `Authorization: Bearer` (401) y versión ≥ mínima (426). Los ids no son secretos; el token nunca va en la URL.
2. Zod: `messageId` y `shareId` UUID (400).
3. Límite por token: como mucho 6 descargas cada 10 minutos y una a la vez, en memoria como las insignias (`src/helpers/userscriptBadges.ts`). Si se supera: 429 con `Retry-After`.
4. Mensaje: `channel='whatsapp'`, `owner_email` = usuario del token (**sin excepción de admin**: el archivo sale solo para quien preparó el borrador) y estado `draft`, o `whatsapp_opened` creado hace menos de 15 minutos (para la D1 y para «Reintentar» después de `dispatch`).
5. Enlace: `share.message_id = messageId`, sin revocar, y su token sigue en el texto del borrador (`shareTokenHashesInBody`). Si se sacó del texto, no hay archivo.
6. Negocio: `assertBusinessAccess` con escritura, «No contactar», restricción de WhatsApp y archivado, con los mismos mensajes que `dispatch` (403/409).
7. Material: entregable, activo, versión actual de archivo (`object_key`), `whatsappAttachEligibility` elegible (incluye los 50 MB y el interruptor).
8. `head` en R2 **antes de bajar nada**: existe y `size` = `byte_size` guardado y ≤ 50 MB. Si no: 409 «El archivo cambió; volvé a preparar el mensaje.».

Los casos 4, 5 y 7 sin cumplir (mensaje ajeno, enlace de otro mensaje, enlace revocado, material no disponible, externo) responden **el mismo 404** con el mismo cuerpo, «No encontramos ese archivo.», para no dejar enumerar (misma regla que `UNRECOGNISED`, `salesMaterialDraft.ts:158`).

Respuesta 200, según D4 (con la recomendación, los bytes pasan por el CRM):

- Cuerpo en streaming desde R2 (método nuevo `R2Storage.stream({key, maxBytes})`, que corta si los bytes superan `maxBytes`), sin cargar el archivo entero en memoria.
- Encabezados: `Content-Type` = `mime_type` guardado, `Content-Length`, `Content-Disposition: attachment` con el nombre de 7.1 (`contentDisposition`), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Hospeda-Material-Version: <n>`.
- No suma registro técnico: bajar no es que el cliente lo vio, ni siquiera que se envió.
- Log `userscript_material_file` con `shareId`, bytes y duración; sin token, sin nombre de negocio, sin título.

### 7.3 Registro del envío con adjunto

- El script suma a cada mensaje del lote `media?: "document" | "image" | "video" | "audio" | null` (lo mismo que hoy detecta `textOf`). Opcional y aditivo en `registerSchema`.
- Al completar un intento `whatsapp_opened` (`completeUserscriptOpened`): si el mensaje trae `media` `document` o `image` y el intento tiene **un** enlace vigente con archivo elegible, se fija `attach=true, attached_version=sent_version` en ese enlace y se escribe en el journal `material_file_attached` (`{shareId, materialId, version}`). Sin `media` no se toca nada: fue solo texto.
- Lo que se anota es «se adjuntó la versión N según el script», nunca «el cliente lo recibió» ni «lo vio». La ficha muestra el material como adjunto con el mismo rótulo que ya usa el email para `attached_version` (verificarlo al implementar).
- El registro manual («Registrar mensajes») pasa por el mismo camino.

### 7.4 Interruptor (D5)

Decisión del propietario: un interruptor «Adjuntar archivos desde el script» en Configuración (solo admin, encendido por defecto), guardado en `app_settings` y registrado en el journal de configuración como los demás ajustes. El servidor lo lee en cada pedido: apagado, `attach.eligible=false` en 7.1 y 404 en 7.2. Los scripts 1.8.0 vuelven solos al comportamiento de la 1.7.0, sin redeploy.

## 8. Seguridad

- **Token.** Viaja solo en el encabezado de `GM_xmlhttpRequest`, que corre en el contexto de la extensión: la página de WhatsApp no ve ni el token ni la respuesta del CRM, solo el `File` que el vendedor igual va a mandar. Nunca va en una URL, un log ni el DOM.
- **Alcance.** El token no tiene alcances (3.5), así que el endpoint acota por datos: solo un enlace vivo de un borrador del propio usuario, de WhatsApp, reciente, con el enlace todavía en el texto. Un token robado no baja material arbitrario, solo lo que su dueño ya estaba por mandar (y el material, de todos modos, se comparte con clientes).
- **Sin exposición pública.** No hay ruta pública nueva; `/m/…` no cambia. Con D4 A ninguna URL prefirmada sale del servidor.
- **`@connect`.** Con D4 A, ninguno nuevo: el host del CRM ya está. Con D4 B se suma el host de R2.
- **CSP de WhatsApp Web.** No aplica a `GM_xmlhttpRequest`. El script no inyecta código, no crea URLs `blob:` ni iframes y no pide nada desde la página, así que la CSP de WhatsApp no lo bloquea ni hay que relajarla.
- **Sin envío automático.** Ver 6.1; test estático.
- **«No contactar», restricción, archivado y permisos** se revisan en 7.2 y otra vez en `dispatch`, como hoy.
- **Sin fugas.** Logs y diagnósticos sin token, sin títulos, sin nombres de negocio ni teléfonos. El diagnóstico de la vista previa (si se agrega) sigue la regla de `redactedSnapshot`. El archivo no se guarda en `GM_setValue` ni en ningún almacenamiento del navegador.
- **Tamaño.** Tope de 50 MB en tres lugares: metadatos (7.1), `head` antes de bajar (7.2) y corte en el streaming; el script además aborta si `onprogress` supera los metadatos.

## 9. Errores y reintentos

| Falla | Dónde | Qué pasa | Reintento |
| --- | --- | --- | --- |
| Red, 5xx, 429, tiempo agotado al bajar | Paso 2 | Nada en el chat ni en el CRM | «Reintentar» o «Pegar solo con el enlace», a elección del vendedor |
| 401 / 426 | Paso 2 | Mensajes de siempre de `request` (token, actualizar) | El vendedor corrige y vuelve a tocar |
| 403 / 409 de negocio, 404 | Paso 2 | Error en el panel, nada en el chat | Como hoy: volver al negocio o preparar de nuevo |
| Tamaño o tipo distinto | Paso 2 | «No pude bajar el archivo.» | Igual que red |
| `dispatch` rechazado | Paso 3 | Como hoy | Como hoy |
| Vista previa que no aparece, descripción incompleta | Paso 4 | Estado B (o C) | **Ninguno automático**: el texto con el enlace ya está; adjuntar de nuevo es «Cambiar de modelo» o volver a abrir «Enviar material» |
| El vendedor apretó Enviar y el archivo falla al subir | WhatsApp | La burbuja queda con error: no se registra | Lo resuelve el vendedor en WhatsApp; el intento sigue abierto en «Requiere acción» |

Nunca se reintenta solo algo cuyo resultado es incierto. El único paso con resultado incierto es el envío, y lo hace el vendedor.

## 10. Script 1.8.0

- **Adjuntar (bloque 2):** `attach.ts` nuevo (`attachPlan` puro, `downloadMaterialFile` con `GM_xmlhttpRequest` y `arraybuffer`, `attachToChat` con los pasos de 6.2). `compose.ts`: plan y aviso sobre la vista previa, progreso y «Cancelar», estados B y C, nota del pie. `api.ts`: tipos de `attach` y `media`, `fetchMaterialFile`. `selectors.ts`: selectores del editor de medios, `pasteIntoComposer` sobre cualquier editor, `media` en `readChat`. `autoRegister.ts`/`register.ts`: mandan `media`.
- **Spec 103, bloque 4 (bloque 3):** tal cual `103-bandeja-instagram-userscript.md` §8 y §14 (fila 20 y 17 diag.).
- **Spec 102, D3 (bloque 4):** `materialPicker` (`userscript/src/materials.ts`) agrupa por `otherVertical`: arriba la vertical del negocio y «todas», abajo «De otras verticales (N)» plegado (botón que despliega), todo desplegado si arriba no queda nada; la búsqueda sigue en el CRM. Mismo comportamiento en WhatsApp e Instagram.
- `USERSCRIPT_VERSION` → **1.8.0**. `USERSCRIPT_MIN_VERSION` sigue en **1.5.0**. Cabecera: sin `@grant` nuevos; `@connect` según D4. `scripts/verify-userscript-build.mjs` verifica la versión y, con D4 B, el `@connect` nuevo.
- Instagram: solo cambian lo de los bloques 3 y 4; nunca adjunta.

## 11. Componentes y funciones

| Pieza | Archivo | Cambio | Bloque |
| --- | --- | --- | --- |
| Elegibilidad | `src/helpers/salesMaterialMessage.ts:130` | `whatsappAttachEligibility`, `WHATSAPP_ATTACH_MAX_BYTES`; rama WhatsApp de `attachBlockReasons` | 1 |
| Metadatos del borrador | `src/endpoints/userscript.ts` (`prepare`, `material_add`, `material_remove`), `src/helpers/salesMaterialDraft.ts` | `attach` por material | 1 |
| Descarga | `src/endpoints/userscript.ts` (o archivo nuevo), `src/server/app.ts:96-115` | `material_file`, límite por token | 1 |
| Streaming de R2 | `src/helpers/r2.ts:7-20,45-66` | `stream({key,maxBytes})` | 1 |
| Registro | `src/endpoints/userscript.ts:35`, `src/helpers/userscriptRegister.ts` | `media` opcional; `attach`/`attached_version` y journal | 1 |
| Interruptor | `src/endpoints/userscript.ts`, Configuración | ajuste `app_settings` «Adjuntar archivos desde el script» | 1 |
| Plan, descarga e inyección | `userscript/src/attach.ts` (nuevo) | `attachPlan`, `downloadMaterialFile`, `attachToChat` | 2 |
| Panel | `userscript/src/compose.ts:173-271` | aviso, progreso, estados B y C | 2 |
| Selectores | `userscript/src/selectors.ts:24-40,68-89` | editor de medios, `pasteIntoComposer(editor)`, `media` | 2 |
| Registro en el script | `userscript/src/autoRegister.ts`, `register.ts`, `api.ts` | `media`; tipos | 2 |
| Paneles al día y diagnóstico | ver spec 103 §13 (filas del bloque 4) | — | 3 |
| Separador de verticales | `userscript/src/materials.ts:20-59`, `api.ts` (`ScriptMaterial.otherVertical?`) | grupos y plegado | 4 |
| Versión | `userscript/src/version.ts`, `userscript/vite.config.ts:11`, `scripts/verify-userscript-build.mjs` | 1.8.0, `@connect` según D4 | 5 |

## 12. Plan de tests

Regresión primero donde corresponde (el `media` y la descripción leída de una burbuja con documento arrancan con un fixture que hoy da `[documento: …]`).

| Tema | Unit (`*.spec.ts`) | Integración (`scripts/test-*.ts`, base local descartable) | Manual |
| --- | --- | --- | --- |
| Elegibilidad | `salesMaterialMessage.spec.ts`: archivo de 50 MB justo elegible, 50 MB + 1 no, externo, sin nombre, sin tamaño, `kind` por MIME, nombre = título + extensión, interruptor apagado | — | — |
| Plan | `attach.spec.ts`: un archivo → adjuntar; externo, más de 50 MB, texto largo, sin metadatos → solo texto con su aviso; dos materiales según D2 | — | — |
| Descarga | `attach.spec.ts` con `GM_xmlhttpRequest` simulado: el token va en el encabezado y nunca en la URL; corta si `onprogress` supera los metadatos; tamaño o tipo distinto → error; 401/403/404/409/426/429 y tiempo agotado → mensajes; «Cancelar» aborta | — | — |
| Inyección | `attach.spec.ts` con fixtures del prototipo (`current-media-preview.html`, `current-attach-menu.html`): éxito → estado A; sin vista previa a tiempo → B; descripción incompleta + cierre que funciona → B; cierre que falla → C; caja con texto ajeno → no inyecta; **nunca se busca ni se toca el botón de enviar ni se manda Enter** (espía de eventos y test estático sobre el fuente de `attach.ts`, como `instagramIsolation.spec.ts`) | — | — |
| Panel | `compose.spec.ts`: aviso del plan, progreso, «Reintentar» y «Pegar solo con el enlace» sin reintento automático, `dispatch` recién después de bajar el archivo, una falla de descarga no llama a `dispatch`, estados B y C con su copy, doble clic bloqueado | — | — |
| Lectura de la burbuja | `userscript.spec.ts`: `readChat` con `current-document-caption.html` y `current-image-caption.html` → `text` = descripción, `media` = `document`/`image` | — | — |
| Endpoint | — | `test-userscript.ts` (R2 simulado con `setR2StorageForTests`): 200 con bytes, `Content-Type`, `Content-Length`, `Content-Disposition` y `no-store` para el borrador propio; el mismo 404 para borrador de otro usuario, enlace de otro mensaje, enlace revocado, enlace sacado del texto, material archivado y material externo; admin sobre borrador ajeno → 404; 403/409 con «No contactar», restricción y archivado; `head` con tamaño distinto → 409; más de 50 MB → no elegible y 404; `whatsapp_opened` de hace 20 minutos → 404; séptima descarga en 10 minutos → 429; sin token → 401; versión vieja → 426; interruptor apagado → `eligible:false` y 404; el log no contiene el token | — |
| Registro | — | `test-userscript.ts`: registrar la burbuja con `media:"document"` completa el intento y fija `attach` y `attached_version`; sin `media` completa el intento y no toca `attach`; journal `material_file_attached`; un script sin `media` (1.7.0) sigue funcionando | — |
| Metadatos | — | `test-userscript.ts`: `prepare` y `material_add` en WhatsApp devuelven `attach`; en Instagram no | — |
| Bloques 3 y 4 | Los de la spec 103 §14 (filas 20 y 17 diag.); `materials.spec.ts`: grupos por `otherVertical`, plegado con su número, todo desplegado si arriba no queda nada, sin `otherVertical` = como hoy | `test-userscript.ts` (rama de la 102): `materials` devuelve `otherVertical` | — |
| WhatsApp Web real | No se puede automatizar en CI | — | Lista de 12.1 |

Gates: `npm run typecheck`, `npm test`, `npm run build` (incluye `verify-userscript-build`), las integraciones listadas y la suite de navegador del CRM (`npm run build && npm start`, luego `npm run test:browser`) en verde; CI verde en el SHA de cada PR. Ninguna prueba abre WhatsApp real ni manda mensajes.

### 12.1 Smoke manual en WhatsApp Web (propietario, antes de publicar y después del deploy)

Con la cuenta de prueba, mandando **a un número propio**, en Chrome y en Firefox:

1. «Enviar material» con un PDF de pocos MB → vista previa con el PDF y la descripción con el enlace corto; Enviar → burbuja con el archivo y la descripción.
2. El registro automático confirma el envío; en el CRM el intento queda enviado y el material figura como adjunto (versión).
3. El enlace de la descripción abre en el celular del destinatario.
4. Una imagen (según D3) llega como foto o como documento.
5. Un material de enlace externo → solo texto, como en la 1.7.0.
6. Un archivo de más de 50 MB → aviso y solo texto.
7. Cortar la red durante la descarga → «No pude bajar el archivo.»; «Pegar solo con el enlace» pega el texto.
8. Cerrar la vista previa sin enviar → «No lo voy a enviar» cierra el intento.
9. Negocio con «No contactar» → el botón deshabilitado (panel) y, forzando, 403 sin nada en el chat.
10. Interruptor apagado (en `staging`) → solo texto sin aviso.
11. Panel de Instagram (bloque 3) y separador de verticales (bloque 4) según sus specs.
12. El aviso «Hay una versión nueva» aparece con la 1.7.0 instalada y «Actualizar» instala la 1.8.0.

## 13. Riesgos

- **DOM de WhatsApp Web.** Es lo más frágil de la spec. Mitigación: prototipo (6.4), verificación en cada paso, salida a B o C, interruptor (D5), diagnóstico redactado.
- **Eventos sintéticos.** WhatsApp podría ignorar un `paste` o un `change` sin `isTrusted`. Si pasa con las dos estrategias, no hay adjunto posible sin simular de otra forma: vuelve al propietario.
- **Términos de WhatsApp.** El script prepara y el vendedor envía, igual que con el texto; riesgo bajo, no nulo (mismo criterio que Instagram, línea 370).
- **Descripción no leída en la burbuja.** Si WhatsApp pone la descripción de un documento en otro nodo, el intento no se completa y el mensaje se registra aparte (queda en «Requiere acción»). El prototipo (punto 6) y los fixtures lo cubren antes de publicar.
- **Ancho de banda del CRM** (D4 A): hasta 50 MB por envío a través del VPS. Con pocos vendedores es poco; el límite por token acota abusos.
- **Archivos grandes y la spec 100 D7.** Si subir el archivo tarda más de 5 minutos, el intento aparece en «¿Lo enviaste?» antes de la confirmación del script; el 409 «Este envío ya estaba confirmado.» ya cubre la carrera.
- **Versión del material.** Si el admin sube una versión nueva entre la descarga y el envío, el archivo adjunto es el que se bajó y `sent_version` es la de `dispatch`; `X-Hospeda-Material-Version` permite al script detectar la diferencia y no adjuntar (estado B). Riesgo mínimo.
- **Barrera de la spec 96.** La 1.8.0 bloquea el CRM en la computadora hasta actualizar: aviso previo y publicación coordinada (sección 15).

## 14. Orden de implementación (PRs a `staging`)

Cada PR con typecheck, `npm test`, build y sus integraciones en verde, y CI verde en el SHA del PR.

1. **Bloque 0:** prototipo y notas en esta spec (PR de docs).
2. **Bloque 1 (servidor):** elegibilidad, metadatos, `material_file`, streaming de R2, `media` en el registro, interruptor. Aditivo: llega a staging sin efecto para la 1.7.0.
3. **Bloque 3:** script, bloque 4 de la spec 103 (sin cambiar la versión todavía).
4. **Bloque 4:** script, separador de verticales (después de que la rama de la spec 102 esté en `staging`).
5. **Bloque 2:** script, adjuntar.
6. **Bloque 5:** `USERSCRIPT_VERSION` 1.8.0, `@connect` según D4, guía de uso y `userscript/README.md` («Adjuntar el archivo (versión 1.8.0)»), smoke 12.1 en `staging`.

## 15. Publicación y vuelta atrás

1. Todo lo anterior en `staging`, con el smoke 12.1 hecho.
2. El propietario avisa a los vendedores **antes** del deploy: qué cambia (el archivo va en el chat, siguen apretando Enviar) y que el CRM les va a pedir actualizar el script.
3. Deploy: la promoción `staging` → `main` es un deploy y la ordena el propietario (decisión del 30/10/2026), con respaldo de la base antes. No hay migración. El interruptor de Configuración arranca encendido.
4. Los vendedores actualizan desde el aviso «Hay una versión nueva» o «Buscar actualizaciones» en Tampermonkey. Con D4 B, Tampermonkey puede pedir aprobar el host de R2.
5. Smoke 12.1 en producción por el propietario.
6. Documentación: `src/content/user-guide.json` (y regenerar `docs/guia-de-uso.md`), `userscript/README.md`, `docs/decisiones.md`, `docs/estado-desarrollo.md`, `docs/pendientes.md`.

**Vuelta atrás.**
- **Solo el adjunto:** el admin apaga «Adjuntar archivos desde el script» en Configuración (D5), sin redeploy. Los 1.8.0 instalados vuelven a solo texto sin actualizar.
- **El script entero:** Tampermonkey no baja de versión, así que «volver a la versión anterior» es publicar una **1.8.1** armada desde el código de la 1.7.0 (o con el arreglo puntual). La barrera la exige igual que cualquier versión nueva.
- **El servidor:** todos los cambios son aditivos; una 1.7.0 sigue funcionando contra el servidor nuevo y una 1.8.0 contra uno viejo (sin `attach` en los metadatos = solo texto).

## 16. Aceptación

- **Dado** un borrador de WhatsApp con un solo material PDF de 10 MB, **cuando** el vendedor toca «Pegar en el chat», **entonces** WhatsApp Web muestra la vista previa con el PDF («{título}.pdf») y la descripción con el texto completo y el enlace corto, el panel dice «Listo, está en el chat» y **nada se envía** hasta que el vendedor aprieta Enviar.
- **Dado** ese envío hecho por el vendedor, **cuando** la burbuja queda sin reloj, **entonces** el script lo registra, el intento queda enviado y el enlace tiene `attach=true` y `attached_version` = la versión enviada; ningún estado de respuesta, etapa ni tarea cambia por el adjunto.
- **Dado** un material de enlace externo o un archivo de más de 50 MB, **entonces** se pega solo el texto con el enlace, y en el segundo caso con el aviso de 5.1.
- **Dado** cualquier falla de 6.2, **entonces** WhatsApp queda en el estado B o C de 5.4, con su aviso, y nunca con una vista previa sin texto con el panel diciendo «Listo».
- **Dado** que la descarga falla, **entonces** no se llamó a `dispatch`, no hay nada en el chat y el panel ofrece «Reintentar» y «Pegar solo con el enlace»; nada se reintenta solo.
- **Dado** un token de otro usuario, un enlace de otro mensaje, revocado o sacado del texto, **entonces** `material_file` responde el mismo 404; con «No contactar», 403 o 409; el token nunca aparece en una URL ni en un log.
- **Dado** el interruptor de Configuración apagado, **entonces** la 1.8.0 se comporta como la 1.7.0.
- **Dado** el panel de Instagram o el CRM en el celular, **entonces** el material sigue yendo solo como enlace.
- Con la 1.8.0, el panel de Instagram y el de WhatsApp se ven al día sin recargar y el selector de material pliega «De otras verticales (N)» (specs 103 y 102).
- `npm run typecheck`, `npm test`, `npm run build`, las integraciones listadas y `npm run test:browser` en verde; CI verde en el SHA de cada PR; smoke 12.1 hecho por el propietario.

## 17. Decisiones abiertas

1. **D1 — Chats que abrió el CRM («Abrir WhatsApp» del composer).** Con la spec 103 D7, en la computadora «Contactar» abre `web.whatsapp.com/send` con el texto ya escrito; el panel no participa.
   - **Opción A:** solo se adjunta desde el panel («Enviar material» / «Mandar un mensaje» → «Pegar en el chat»).
     - Pro: un solo camino, menos superficie; el contrato de 7.2 alcanza con `draft`.
     - Contra: el material mandado desde el CRM sigue llegando como enlace; el vendedor tiene que saber que para adjuntar va por el panel.
   - **Opción B:** además, si el chat abierto tiene un intento `whatsapp_opened` del vendedor con un material elegible y la caja tiene exactamente ese texto, el panel ofrece «Adjuntar el archivo» (un clic): vacía la caja, adjunta y escribe el texto como descripción, con los mismos estados de 5.4.
     - Pro: el archivo llega también desde el camino del CRM, que es el principal en la computadora (línea 380).
     - Contra: `context` tiene que sumar `messageId` y materiales a `openWhatsapp`; un clic más en el panel; más casos que probar.
     - Impacto: `src/endpoints/userscript.ts:44-46`, `userscript/src/ui.ts`; 7.2 ya admite `whatsapp_opened` de menos de 15 minutos.
   - **Recomendación: B**, en la misma 1.8.0; si el prototipo complica, A en la 1.8.0 y B después.
2. **D2 — Dos o más materiales en el mismo mensaje.**
   - **Opción A:** todo como enlace, con el aviso «Con más de un material va solo el enlace de cada uno.».
     - Pro: predecible; una sola vista previa con un solo archivo, lo más simple de verificar.
     - Contra: el cliente no recibe archivos en ese caso.
   - **Opción B:** se adjunta solo el primero y el resto va como enlace.
     - Contra: cuál se adjunta depende del orden; confuso para el vendedor.
   - **Opción C:** todos los archivos en la misma vista previa, descripción en el primero.
     - Pro: el cliente recibe todo.
     - Contra: más frágil (varias miniaturas, descripción por archivo); el registro solo ve una burbuja con descripción; suma de tamaños.
   - **Recomendación: A** para la 1.8.0; C se reconsidera si el uso real lo pide.
3. **D3 — Imágenes: ¿foto o documento?**
   - **Opción A:** JPG, PNG y WebP como foto («Fotos y videos»); todo lo demás como documento.
     - Pro: el cliente ve la imagen en el chat sin abrir nada.
     - Contra: WhatsApp la comprime; un folleto con letra chica puede perder nitidez (el enlace de la descripción tiene el original).
   - **Opción B:** todo como documento.
     - Pro: archivo original sin compresión; un solo camino en el DOM.
     - Contra: la imagen se ve como un archivo a descargar.
   - **Recomendación: A.**
4. **D4 — ¿Por dónde viajan los bytes?**
   - **Opción A:** streaming a través del CRM (`material_file` lee de R2 y responde los bytes).
     - Pro: ningún `@connect` nuevo (sin pedido de aprobación en Tampermonkey el día de la actualización); ninguna URL prefirmada sale del servidor; tipo, nombre y tope los controla el CRM.
     - Contra: hasta 50 MB por envío pasan por el VPS; hace falta `R2Storage.stream`.
   - **Opción B:** `material_file` responde 302 a un GET prefirmado de 60 segundos y el script lo sigue.
     - Pro: el VPS no mueve los bytes.
     - Contra: `@connect <cuenta>.r2.cloudflarestorage.com` nuevo (el build necesita conocer la cuenta; Tampermonkey puede pedir aprobarlo); la URL prefirmada es una credencial de 60 s en manos del script; dos saltos que pueden fallar.
   - **Recomendación: A.**
5. **D5 — Interruptor para apagar el adjunto.**
   - **Opción A:** variable `USERSCRIPT_ATTACH_FILES` (encendida por defecto), cambio en Coolify y redeploy.
     - Pro: apaga el adjunto en minutos sin publicar script y sin tocar datos de producción; mismo patrón que `CRM_MCP_ENABLED`.
     - Contra: requiere redeploy.
   - **Opción B:** clave en `app_settings` (`crm_sales_material`).
     - Pro: sin redeploy.
     - Contra: apagarlo es una escritura en la base de producción (operación de datos con aprobación y runbook, `AGENTS.md`), salvo que se haga una pantalla de admin.
   - **Opción C:** sin interruptor; la vuelta atrás es una 1.8.1.
     - Contra: todos los vendedores tienen que actualizar de nuevo el mismo día.
   - **Recomendación: A.**

Defaults que la spec ya eligió (no son bifurcaciones): nombre del archivo = título del material + extensión; un solo botón «Pegar en el chat»; bajar antes de `dispatch`; 6 descargas cada 10 minutos por token; 15 minutos de ventana para `whatsapp_opened`; 20 s de espera de la vista previa; tope de 50 MB como constante en el código (decisión del propietario).

### Decisión del propietario (31/10/2026)

- **D1:** sí, también cuando el chat lo abrió el CRM («Abrir WhatsApp» del redactor); `openWhatsapp` pasa `messageId` y materiales en `context`.
- **D2:** con dos o más materiales, todo va como enlace, con aviso.
- **D3:** JPG, PNG y WebP como foto; el resto como documento.
- **D4:** los bytes viajan en streaming a través del CRM; sin `@connect` nuevo ni URL prefirmada en el navegador (requiere un método de lectura en streaming en `R2Storage`).
- **D5:** interruptor en Configuración (no variable de entorno); ver 7.4.

## 18. Migraciones y datos

- **Ninguna migración.** `attach` y `attached_version` existen desde la `046`; el registro y el journal usan tablas existentes. No se edita ninguna migración aplicada.
- Nada escribe en producción por su cuenta: los adjuntos se anotan solo al registrar envíos nuevos. Los enlaces y mensajes ya enviados no se tocan.
- Con D5 B haría falta una escritura en `app_settings` para apagar el adjunto; con la recomendación (A), no.
