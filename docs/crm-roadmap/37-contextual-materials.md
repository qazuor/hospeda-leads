# Materiales dentro del contexto comercial

La guía del vendedor lleva al listado de negocios, desde donde puede abrir
Documentos en la ficha o en una gestión. La ruta heredada `/library` sigue siendo
exclusiva de admin; el acceso rápido de admin lleva a Configuración → Biblioteca.

## Consulta y vínculo

- Una gestión consulta únicamente sus documentos directos y vínculos. Ofrece un
  enlace para consultar todos los documentos del negocio.
- El negocio conserva todos los contextos visibles, identificando la gestión y
  actividad de cada vínculo. No se copian ni reescriben archivos/versiones.
- El formulario Mantine muestra el destino, permite elegir una gestión propia
  desde el negocio y una actividad compatible. En una gestión el destino es fijo.
- Elegir o previsualizar no escribe ni envía. El vínculo tiene bloqueo inmediato,
  selección conservada ante error, reintento y confirmación persistente.
- La lectura de gestiones ajenas incluye Documentos; la escritura conserva los
  permisos por responsable de negocio/gestión y admin en servidor.
- Se valida que la gestión corresponda al negocio. Los vínculos de gestiones
  eliminadas quedan fuera de la lectura activa del vendedor; admin conserva acceso.

## Validación

Typecheck, suite unitaria y build. Pruebas desktop/mobile y claro/oscuro para
selección de contexto, petición lenta, doble clic, fallo/reintento, confirmación,
lectura ajena y biblioteca protegida. Integración PostgreSQL real para separación
por gestión, documentos generales, responsables independientes, contextos
inválidos y gestión eliminada. CI completa antes de mergear.

## Pendientes de materiales

Miniaturas y visor de páginas PDF consistente; auditoría de loading y bloqueo de
administración, carga y versiones. Este bloque conserva el visor/formatos actuales.
