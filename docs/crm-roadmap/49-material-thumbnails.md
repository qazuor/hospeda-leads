# Miniaturas de materiales

La biblioteca y los documentos del negocio muestran imágenes y primera página de PDF. La selección de material reutiliza la misma miniatura. Los vínculos externos y formatos no admitidos no se descargan para previsualizar.

Las tarjetas esperan a entrar en pantalla (más un margen de 100 px). La descarga autenticada conserva MIME, permisos, ausencia de caché y bloqueo de redirecciones del visor existente. PDF.js se carga solo al pedir un PDF, renderiza una primera página pequeña y destruye su worker al terminar; como máximo hay dos renderizados concurrentes. No se conserva una copia del archivo PDF para generar el listado.

Desmontar cancela la descarga/render y revoca las URLs de imágenes. Un error muestra reintento, sin quitar la selección ni impedir el visor/descarga existentes. Las miniaturas tienen texto alternativo y estados visibles; previsualizar no vincula ni envía.

Validación: PDF corrupto/reintento, primera página válida, permiso denegado y selección preservada en escritorio/móvil; imágenes y materiales reales mantienen los recorridos existentes. Typecheck, unitarias, build y CI completa antes de merge.
