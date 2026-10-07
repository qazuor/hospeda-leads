# Vistas del sistema

Se recuperan las seis vistas originales de Negocios en el selector Vistas, agrupadas por separado de las personales. Sus valores tienen identificadores distintos, incluso cuando los nombres coinciden. Las vistas del sistema permanecen utilizables si falla la carga de las personales.

Configuración exclusiva de admin en Configuraciones por defecto: nombre, visibilidad y orden. Se guarda en el endpoint existente, que valida admin en servidor. La configuración anterior sin systemViews sigue siendo válida y recupera las seis opciones originales. No hay migración ni modificación de datos comerciales.

Criterios originales conservados: Todos limpia búsqueda/filtros; Mis negocios usa el email del usuario que aplica la vista; Para hoy y Vencidos calculan el día actual de Argentina; Sin responsable y Sin próxima acción filtran ausencia. Aplicar conserva presentación, columnas y ordenamiento y reinicia el contexto de resultados como cualquier filtro. No introduce etapas comerciales.

Límite de esta subtarea: admin configura nombre, orden y visibilidad de las seis vistas originales. Los criterios originales se conservan; filtros específicos adicionales se crean desde Filtros preestablecidos. No se agregan reglas comerciales ni automatismos.

Pruebas: criterios dinámicos, configuración anterior, identificadores, validación y escritura exclusiva de admin. Navegador: coexistencia con vistas personales del mismo nombre en desktop/mobile y configuración de admin. CI y revisión visual requeridos antes de mergear.

Continuidad: edición inline de badges y búsqueda global indiferente a mayúsculas y acentos siguen pendientes.
