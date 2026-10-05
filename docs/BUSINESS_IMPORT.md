# Importar negocios sin ventas

En Negocios → Herramientas adicionales → Importar CSV, seleccionar **Solo negocios** (predeterminado).

Cada alta crea exclusivamente un `crm_accounts`, con condición `prospect`. No crea ventas (`leads`), personas, tareas ni actividades. Sin `asignadoA` queda sin responsable; solo admin puede importar una asignación explícita. No hay etapa de venta hasta crear una propuesta real.

Campos: `nombre`, `ciudad`, `tipo` (vertical activa), `subtipo` (activo para esa vertical), `provincia`, `direccion`, `telefono`, `whatsapp`, `email`, `sitioWeb`, `urlGmap`, `perfilInstagram`, `perfilFacebook`, `perfilAirbnb`, `perfilBooking`, `perfilTurismoEntreRios`, `businessNotes`, `discoverySource`, `verificationUrls`, `verifiedOn`, `asignadoA`.

WhatsApp se carga solo cuando el negocio lo identifica explícitamente. `verificationUrls` admite URLs HTTP(S) separadas por espacios o líneas. `verifiedOn` usa AAAA-MM-DD y no admite futuro. Registrar dudas en `businessNotes`; no inferir datos ausentes. Fuente del lote y fuente de descubrimiento individual se conservan por separado.

La revisión detecta nombre/localidad, teléfono, email, sitio web, dirección/localidad y perfiles sociales coincidentes, tanto en CRM como dentro del lote. Las coincidencias se omiten inicialmente. Revisar antes de cambiar su acción; no fusionar ni actualizar por defecto.

El endpoint autenticado existente `POST /_api/data_quality` acepta `import_preview` con `mode: "business"`, y luego `import_confirm` con el `batchId` y decisiones revisadas. Mantiene permisos, transacción atómica y comprobación de coincidencias al confirmar. Cada resultado incluye `entity`, `accountId` e `id` para enlazar al negocio. Repetir la confirmación devuelve el resultado guardado sin duplicar altas.

Los lotes históricos y clientes API que omiten `mode` conservan `opportunity`: crean una venta inicial. El modo está persistido en el lote y forma parte de su identidad para impedir confundir los dos flujos. El antiguo ingest por Bearer continúa deshabilitado.

Para automatizar sin navegador, usar la [API limitada de importación de negocios](BUSINESS_IMPORT_API.md). Requiere configurar una clave independiente; no habilita el antiguo ingest ni hereda permisos administrativos.

La migración 013 agrega columnas sin reescribir las ventas. Clasificación histórica: copia únicamente valores no ambiguos de las oportunidades; conflictos quedan sin clasificación. Editar un negocio no cambia las clasificaciones independientes de sus ventas.
