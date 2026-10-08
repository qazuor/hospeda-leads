# Visor PDF y miniaturas de materiales

PDF.js renderiza una página por vez dentro del diálogo compartido de Mantine, sin depender del plugin PDF del navegador. Ofrece anterior/siguiente con límites, indicador de página, ampliación y ajuste; adapta el canvas al ancho disponible y permite desplazamiento dentro de la página ampliada. El texto extraído queda disponible para lectores de pantalla, aunque no es una capa de selección de texto.

El módulo y su worker se cargan al abrir un PDF. La descarga autenticada conserva el endpoint, permisos, validación de MIME y ausencia de caché existentes. No se ejecutan acciones de vinculación ni de envío al previsualizar. La descarga original sigue disponible. El cierre cancela tareas y destruye el worker; cambios de página/tamaño cancelan renders anteriores. Los archivos corruptos y errores de descarga muestran un mensaje con reintento.

Seleccionar una imagen aprobada de biblioteca muestra una miniatura de la versión elegida, usando el mismo endpoint protegido. Un error de miniatura conserva la selección y el acceso al visor con reintento. No se descargan imágenes de toda la biblioteca ni referencias externas para generar miniaturas.

## Validación

- Typecheck, build y 83 pruebas unitarias.
- Dos recorridos de navegador simulados en 1280/390 px: dos páginas, límites, ampliación/ajuste, archivo corrupto/reintento y permiso denegado, sin escrituras. Capturas claro/oscuro.
- Dos recorridos existentes con API/PostgreSQL reales ampliados: miniatura PNG y PDF válido de dos páginas subido/aprobado, navegación y selección conservada.
- CI completo antes de mergear.

## Referencias

- https://mozilla.github.io/pdf.js/examples/ — renderizado y navegación.
- https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html — ciclo de carga y tareas.

## Pendientes

Miniaturas de primera página PDF en la biblioteca; revisión final de búsqueda y organización de materiales.
