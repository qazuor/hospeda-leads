# Completar búsqueda sin acentos

La biblioteca de materiales, el buscador de modelos y los filtros de texto/notas
(contiene, no contiene, igual, distinto; también en grupos AND/OR) reutilizan la
normalización existente. Se conserva ñ, el texto original, los comodines LIKE,
la paginación y los permisos. Los catálogos siguen comparándose por valor exacto.

Validación: typecheck, unitarias, build, integración PostgreSQL con filtros positivos
 y negativos, equivalencia Unicode y permisos de documentos; navegador para modelos.
