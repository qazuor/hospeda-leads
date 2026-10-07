# Resaltado inesperado de una fila

La referencia guardada para recuperar la posición del listado se usaba también para aplicar un outline a toda la fila/card. Al recargar podía marcar la primera fila visible aunque su checkbox estuviera desmarcado. Las celdas fijas tapaban partes del outline.

Se elimina el indicador de fila/card y el estilo :target equivalente, conservando ancla, scroll y foco en Abrir al volver desde un negocio. La selección sigue dependiendo exclusivamente de los checkboxes. Los indicadores de foco de botones se conservan.

Prueba de navegador ampliada en desktop/mobile: una referencia persistida no dibuja borde de fila ni selecciona checkbox, tanto al abrir el listado como al volver desde la ficha. CI y revisión visual pendientes antes de mergear. Sin cambios de datos ni migraciones.
