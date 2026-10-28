# Spec 95 — Material de venta: mejoras de pantalla

Estado: **aprobada por el propietario — 28/10/2026**. Rama `feat/sales-material-ui-95` (sin PR todavía).

## 1. Objetivo

Que la pantalla «Material de venta» (spec 89) se lea y se use mejor con datos reales: portadas automáticas, una barra de filtros prolija, la lista agrupada por categoría y tarjetas con menos botones. No cambia permisos, tipos de material ni el flujo de subida.

## 2. Alcance

1. **Portada automática** cuando no hay una cargada a mano.
2. **Barra de filtros** en una fila (se acomoda en pantallas angostas).
3. **Lista agrupada por categoría** en secciones plegables.
4. **Acciones de la tarjeta**: abrir la vista previa desde la portada o el título, «Abrir» visible y el resto en «⋯».

## 3. Decisiones

**D1. Portada automática generada en el navegador.**
- Imagen de más de 1 MB: la misma imagen achicada. Las imágenes de hasta 1 MB ya son su propia portada (spec 89) y no generan nada.
- Video: un cuadro a ~1 s (o la mitad si dura menos) con `<video>` + `<canvas>`.
- PDF: la primera página con `pdfjs-dist` (ya era dependencia, versión fija `6.4.299`). Se carga con `import()` dinámico solo cuando hace falta, en el mismo chunk diferido que las miniaturas de PDF; su worker ya está configurado para Vite (`?url`).
- Enlace externo, audio y documentos de Office: no se guarda imagen; la tarjeta dibuja un marcador con el ícono del formato (Lucide) y el color y las iniciales de la primera categoría.
- El resultado es un JPEG de hasta 1200 px de lado mayor, con calidad y tamaño que bajan hasta entrar en el límite de 1 MB. Se sube por **el mismo camino de portada** (URL firmada + acción `cover`), así el servidor aplica las mismas validaciones de tipo, tamaño y firma.
- Se genera al crear y al guardar «Nueva versión», solo si no hay portada manual. **Un error nunca bloquea el guardado**: el material queda guardado, el aviso suma una nota y la tarjeta muestra el marcador.

**D2. Portada automática vs. manual: migración `051_sales_material_auto_cover.sql`.** Se agrega `crm_sales_materials.cover_auto boolean NOT NULL DEFAULT false` (con `CHECK` de que solo hay `cover_auto` si hay portada). Alternativa descartada: deducirlo del nombre del archivo subido (`crm_sales_material_uploads.file_name`); es implícito, depende de un join por `object_key` y un admin podría subir a mano un archivo con ese nombre. Con la columna:
- `cover` acepta `auto: true` opcional. El servidor **rechaza** una portada automática si ya hay una manual (la manual siempre gana, también ante carreras); la subida rechazada queda pendiente y la borra el barrido.
- `version` borra la portada automática del archivo anterior en la misma transacción (el navegador genera la nueva); una manual se conserva.
- El listado devuelve `coverSource: 'manual' | 'auto' | null`. Las portadas existentes quedan como manuales, que es lo que eran.

**D3. Materiales existentes sin portada: botón «Generar portadas faltantes (N)».** Solo para admins, solo con almacenamiento configurado y solo si hay materiales activos de archivo (PDF, video o imagen grande) sin portada entre los listados. Procesa de a uno, muestra «Generando portadas… X de N», bloquea las otras acciones mientras corre y al final informa cuántas se generaron y cuántas no. Se descartó generar al ver la tarjeta: descargaría videos y PDF sin que nadie lo pida, en paralelo y en cada visita, y repetiría los errores. El navegador lee el archivo por `/_api/sales_materials/file` (302 a R2), así que el CORS del bucket tiene que permitir `GET` desde el origen del CRM (ya figura en `COOLIFY_DEPLOY.md`).

**D4. Filtros.** Una fila con búsqueda, categorías, formato y estado (`SegmentedControl`: Todos · Entregables · Internos · Archivados; «Archivados» solo para admins). «Limpiar filtros» va al final de la fila, aparece solo con algún filtro activo y los vuelve todos al valor inicial. Categorías usa el wrapper compartido `MultiSelect` (mismo alto, letra y color que `NativeSelect`). «Nuevo material» y «Generar portadas faltantes» van en las acciones del encabezado de la página (`PageHeader`), como «Nuevo negocio»; los avisos de guardado son toasts de Sonner, como en el resto del CRM. El contrato de la API no cambia: búsqueda, categorías y tipo van al servidor como antes; formato y «solo archivados» (`includeArchived=1` + filtro de estado) se aplican sobre la lista devuelta. El filtro sigue siendo estado local, como en spec 89 (la URL solo lleva `?material=`).

**D5. Agrupado por categoría.** Una sección plegable por categoría, en el orden de la lista de categorías, con su cantidad; «Sin categoría» al final; las secciones vacías no se muestran. Con un filtro de categorías se muestran solo esas secciones. Un cambio de búsqueda o filtro vuelve a abrir todas las secciones para que ningún resultado quede escondido. **Un material con varias categorías aparece en cada una**: quien recorre una categoría encuentra todo lo que tiene. El ancla `material-<id>` (búsqueda global) va solo en la primera aparición. El propietario puede cambiarlo a «solo en la primera» más adelante; es un cambio en `groupSalesMaterials`.

**D6. Tarjeta.** La portada y el título abren la vista previa (mismas reglas que el viejo botón «Vista previa»: almacenamiento configurado y formato previsualizable). Un solo botón visible, «Abrir» (o «Abrir enlace»). El menú «⋯» (Mantine `Menu` por el wrapper `DropdownMenu`) tiene «Descargar» para todos en materiales de archivo y, para admins, «Editar», «Nueva versión», «Portada» y, separado, «Archivar»/«Restaurar». Se conservan los motivos de deshabilitado de spec 89 (almacenamiento no configurado, operación en curso) y las reglas de quién ve cada acción. Un vendedor en un enlace no tiene menú. La portada de un PDF se muestra entera (`contain`) sobre el fondo de la tarjeta, con sombra, para que una página blanca se lea como miniatura.

## 4. Comportamiento

- Crear un PDF sin portada: «Guardando material…» → «Generando portada…» → «Material guardado.» con la portada en la tarjeta.
- Crear con portada manual: se usa la manual, no se genera ninguna.
- Nueva versión con portada automática: el servidor la quita y el navegador genera la del archivo nuevo. Con portada manual: no cambia.
- Si la generación falla (formato dañado, canvas no disponible, CORS, límite): el material queda guardado y el aviso dice «La portada automática no se pudo generar: la tarjeta muestra el dibujo del formato.».

## 5. Archivos

- Servidor: `migrations/051_sales_material_auto_cover.sql`, `src/endpoints/salesMaterials.schema.ts` (`auto`, `coverSource`), `src/helpers/salesMaterialService.ts`.
- Cliente: `src/helpers/salesMaterialAutoCover.ts`, `src/helpers/pdfThumbnail.ts` (`renderPdfCover`), `src/helpers/salesMaterialGroups.ts`, `src/components/SalesMaterialPanel.tsx`, `SalesMaterialCard.tsx`, `SalesMaterialFilters.tsx`, `SalesMaterialForm.tsx`, `SalesMaterial.module.css`.

## 6. Pruebas

- Unitarias: `salesMaterialGroups.spec.ts` (orden, «Sin categoría», multi-categoría, secciones filtradas, filtros), `salesMaterialAutoCover.spec.ts` (pdf.js y canvas simulados: formatos elegibles, escala y calidad, subida con `auto:true`, fallos sin excepción), `SalesMaterialCard.spec.tsx` (menú, permisos, motivos, marcador), `SalesMaterialFilters.spec.tsx` («Limpiar filtros»), `SalesMaterialPanel.spec.tsx` (secciones plegables, filtros, «Generar portadas faltantes») y `SalesMaterialForm.spec.tsx` (automática al crear y en versión, la manual gana, un fallo no bloquea).
- Integración: `scripts/test-sales-material.ts` (portada `auto`, validación de firma, versión que la borra, manual que gana y sobrevive versiones).
- Navegador: `tests/browser/material-screen.e2e.ts` a 1280 y 390 px (secciones, menú, filtros, portada automática de un PDF al crear y con «Generar portadas faltantes» sobre un R2 simulado con CORS).

## 7. Límites conocidos

- La generación depende del navegador: un códec de video que el navegador no decodifica, o un bucket sin CORS de `GET`, deja el marcador.
- «Generar portadas faltantes» trabaja sobre lo listado (respeta filtros y el tope de 500 materiales).
- Formato y «solo archivados» se filtran en el cliente: si la lista llega truncada, el aviso de spec 89 sigue pidiendo afinar la búsqueda.
