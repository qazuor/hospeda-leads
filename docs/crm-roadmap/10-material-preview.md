# Materiales — primera subtarea: revisar antes de vincular

Base remota main verificada: d36b268046d2c79a892b2acd9ddab1e390a6adce. Rama feature/crm-materials-ux.

El selector muestra nombre del material, archivo y versión elegidos. Antes de vincular permite previsualizar imágenes, PDF o texto; para vínculos externos ofrece abrir el material mediante el endpoint autorizado. Seleccionar, abrir y previsualizar no vinculan ni acreditan envío. Cerrar la vista conserva la selección.

La vista de imágenes ofrece Ampliar imagen y Ajustar imagen, desplazamiento dentro del panel y acceso por teclado. Los errores de descarga o de imagen permanecen visibles y permiten Reintentar vista previa. El reintento muestra Cargando vista previa, bloquea solicitudes repetidas y libera la URL temporal anterior. Cerrar cancela la consulta y libera los recursos temporales.

Se reutilizan las autorizaciones y descargas existentes del servidor. No hay migración ni modificación de documentos, permisos, asignaciones o criterios comerciales. La vista PDF conserva el visor nativo y su alternativa Descargar; no se incorpora un visor de páginas propio en esta subtarea.

Validación: TypeScript, unitarias y build local; dos recorridos nuevos de CI en 1280 y 390 px con fallo de descarga, reintento lento, ampliación y teclado, texto seguro, enlace externo, selección conservada y ausencia de vínculo hasta confirmar. No se abren comunicaciones reales. El resultado completo de CI debe verificarse antes de mergear.

Pendiente del bloque materiales: miniaturas, vínculo comercial con gestión explícita desde la ficha, recorrido PDF por páginas consistente entre navegadores y estados de carga/errores/bloqueo del resto de acciones de administración. El filtro sin acentos es una subtarea transversal independiente ya aprobada.
