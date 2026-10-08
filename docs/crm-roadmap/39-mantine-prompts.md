# Últimos diálogos nativos reemplazados

El editor de templates y mensajes usa el diálogo Mantine compartido para agregar o editar enlaces. Captura la selección antes de abrir, valida la URL y el protocolo con las reglas existentes de TipTap, aplica el enlace solo al texto seleccionado y devuelve foco/selección al cerrar. Cancelar o Escape conserva el enlace anterior. El botón de quitar enlace sigue disponible en la barra del editor. Confirmar el diálogo no guarda ni envía el template/mensaje.

Levantar una restricción de contacto usa un diálogo exclusivo de admin, identifica canal, contacto y motivo original, y exige un motivo de 3–1000 caracteres. El guardado bloquea doble clic, cierre y Escape; el error conserva el motivo para reintentar. Al guardar, actualiza comunicación/trabajo y confirma el resultado con foco en el aviso. Los seguimientos detenidos permanecen detenidos y no se envían mensajes.

La revisión de `src/**/*.tsx` no encuentra llamadas a `window.prompt`, `window.confirm` o `window.alert`, ni controles HTML directos button/input/textarea/select/dialog. Los componentes compartidos usan Mantine; TipTap conserva su editor especializado.

El diálogo compartido registra hijos abiertos para que Escape, overlay y foco correspondan al diálogo superior. Cerrar el hijo libera al padre; no cancela la preparación del mensaje.

## Validación

- Typecheck, build y 83 pruebas unitarias.
- Ocho nuevos recorridos simulados: 1280/390 px, email/WhatsApp y admin/user, selección, validación, cancelación, foco, loading, error/reintento y permisos. Capturas claro/oscuro.
- Recorrido existente de comunicaciones ampliado con API/PostgreSQL reales: enlace dentro de un diálogo de mensaje sin envío, levantamiento persistente, motivo y secuencia detenida después de recargar.
- CI completo antes de mergear.

## Referencias

- https://mantine.dev/core/modal/ — enfoque, retorno de foco y cierre controlado.
- https://tiptap.dev/docs/editor/extensions/marks/link — comandos y validación de enlaces.

## Siguiente bloque

Miniaturas y visor de páginas PDF consistente dentro de materiales.
