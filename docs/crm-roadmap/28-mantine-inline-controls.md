# Mantine: controles de edición inline

Continúa la base visual del PR 60 en una subtarea acotada. Los botones y selects de edición inline de todos los badges usan ahora los wrappers compartidos de Mantine. `CrmNativeSelect` también reemplaza la definición de estilos local de Canal en Contactar.

Se conserva select nativo para los catálogos del editor inline, incluida la semántica de options disabled y navegación por teclado. La selección buscable de gestiones del diálogo Contactar continúa usando `CrmSelect`. No se modifica el componente global SearchSelect ni se interpreta esta entrega como búsqueda global sin acentos.

Se retiran las reglas CSS locales de select y altura/padding de botones que competían con los controles compartidos. Se mantienen el popover, tooltip, trigger del badge y distribución de acciones existentes; su migración a Mantine es una subtarea posterior.

No hay cambios de payload, permisos, clasificación, selección explícita de gestión, comparación de valores esperados, conflictos, idempotencia ni invalidación/contexto del listado. Durante guardado se conserva el bloqueo de cierre/acciones, texto específico e indicador. No se agregan gestiones ni comunicaciones al editar badges.

Cobertura de validación: TypeScript, unitarias, build y recorridos existentes `all-inline-badges`, `inline-business-badges` y `mantine-contact`, desktop/mobile y usuario/admin; revisar capturas y CI final antes de merge. Incluyen cancelación, opción ajena disabled y navegación que la omite, cambios de clasificación, conflictos/recarga, guardado lento, cards y permisos independientes de gestión.

Pendientes: overlays inline, formulario/preparación y composición de contacto, menú de filtros y resto de adopción por módulo. La migración completa todavía no está terminada.

Validación local completada: TypeScript, build, 66 unitarias y los 10 recorridos de navegador de las tres suites indicadas aprobados. Capturas de permisos desktop y guardado lento mobile revisadas; controles legibles y sin overflow. CI completa de este bloque pendiente antes de merge.

Base integrada: PR 60 mergeado en `3772fb05095a1e490c3964c1a7f0e47478e8e366`, HEAD validado `15cc2bf2b6217a8c525979a808ecb9c292c54994`. CI 37695329708 aprobada (66 unitarias, 55 browser, integraciones, build, smoke API y Docker/persistencia). Evidencia visual local revisada sobre el mismo árbol; el artefacto de CI se generó pero la descarga al entorno devolvió 403. El estado de «CI pendiente» del documento 27 es histórico.
