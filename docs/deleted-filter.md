# Filtro de eliminados

En el diálogo de filtros, los administradores pueden agregar «Oportunidad eliminada (Papelera)» con sí/no. Sin este filtro, solo se muestran registros activos. Sí devuelve oportunidades con `deleted_at`; no devuelve activas. Para ver ambas, combinar sí OR no en un mismo bloque. El resto de bloques y el texto libre siguen combinándose con AND. Las vistas guardadas conservan la regla.

En Negocios, el filtro encuentra negocios con alguna oportunidad que cumpla la condición; no significa que el negocio haya sido eliminado. Las filas que representan una oportunidad eliminada son de consulta: no permiten editar, contactar ni seleccionar para acciones masivas. Se accede a Papelera para restaurar por el flujo existente. Pipeline se deshabilita mientras se utiliza este filtro.

La API exige admin cuando la consulta contiene la regla, incluso si se envía manualmente o mediante una vista guardada. Se conserva el permiso de Papelera y no se altera ninguna fecha o histórico. Restaurar elimina el registro del resultado «sí» y lo devuelve al resultado «no». No requiere migración ni deploy automático.
