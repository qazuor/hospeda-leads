# Búsqueda libre sin acentos

La búsqueda de datos ignora tildes y mayúsculas: `Colon` encuentra `Colón`,
`gastronomia` encuentra `Gastronomía` y `pinguino` encuentra `pingüino`.
Acepta texto latino compuesto y descompuesto, conservando `ñ` como letra distinta
de `n`, igual que el menú de comandos.

## Alcance

- Texto libre de negocios/gestiones, incluidos los campos y notas que ya se buscaban.
- Lista comercial de negocios, incluidos los archivados accesibles por administradores.
- Selector de negocios de agenda/tareas.
- Papelera e historial, conservando sus restricciones de acceso.

Un helper Kysely normaliza ambos operandos en PostgreSQL con NFD, elimina las
marcas combinantes latinas excepto la tilde U+0303 y recompone con NFC. Usa
parámetros para el texto y referencias SQL para los campos. No requiere
extensiones, migraciones, reescritura de datos ni cambios de esquema.

Se conservan los campos buscados, los comodines LIKE existentes, los filtros de
catálogo y texto, la combinación AND/OR, el orden, la paginación y la visibilidad
de registros eliminados/archivados. Esta mejora se aplica a la búsqueda libre `q`.

## Validación

- Typecheck, suite unitaria y build.
- Integración PostgreSQL real en CI: equivalencia Unicode latina, ñ, campos de
  gestión/contacto/notas, negocios sin gestiones, dos páginas, filtros AND/OR,
  búsquedas auxiliares, permisos y exclusión de eliminados/archivados.
- Navegador con API real: búsqueda desde Negocios usando las tres variantes de
  `Colón`, nombre original visible y búsqueda sin resultados.
- CI completa con integraciones existentes, navegador y Docker.

## Pendientes

Definir las reglas de multivertical antes de implementar esa evolución. Después,
continuar materiales, historial y cobertura de loading/toasts/accesibilidad según
el documento de mejoras.
