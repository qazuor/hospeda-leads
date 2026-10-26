# Spec 86 — Insignias del CRM en la lista de chats de WhatsApp

Estado: aprobada por el propietario — 26/10/2026. Mockup aprobado el 25/10/2026 (lienzo «Insignias en la lista de chats»). Es el punto 3 de «User script de WhatsApp: revisión y próximos pasos» (`decisiones.md`).

## 1. Problema

En la lista de chats no se ve qué chats son negocios del CRM, en qué estado están ni quién los lleva. Hay que abrir cada chat para enterarse, y es fácil escribirle a un negocio con No contactar o que lleva otro vendedor.

## 2. Objetivo

Debajo de cada chat individual de la lista, una insignia propia del CRM con lo justo para decidir sin abrirlo. Va dibujada en una capa del script, sin tocar las etiquetas de WhatsApp. Al pasar el mouse, un detalle con el negocio y un enlace a la ficha.

## 3. Principios

- **Solo lectura.** Las insignias no registran nada, no cambian estados y no hacen clics en WhatsApp.
- **Datos que salen de WhatsApp:** el título del chat y su teléfono, cuando el script lo puede leer. Nunca el texto del último mensaje ni el contenido de chats sin abrir.
- **Mismas reglas de lectura que `context`:** lo que un vendedor no puede ver en el CRM tampoco aparece en la insignia.
- **No ensuciar:** los grupos, los chats archivados y los chats sin teléfono ni código no llevan insignia.

## 4. Qué muestra

Una insignia por chat, de 20 px, debajo del texto del último mensaje. Lleva el círculo «H» con el color del estado:

| Caso | Insignia | Color |
|---|---|---|
| Un negocio con gestión abierta | «Etapa · Responsable». Si el código no está en el título, va adelante: «H3502 · Primer contacto · Ana» | azul |
| Un negocio sin gestión abierta | «H3502 · Revisado · sin gestión», con el estado del negocio | azul |
| No contactar o restricción activa de WhatsApp | «H2201 · No contactar» (pisa a las anteriores) | rojo |
| Varios negocios con ese teléfono o código | «2 negocios posibles» | ámbar |
| Chat individual con teléfono y sin negocio | «Sin asociar al CRM», con borde punteado | gris |
| Negocio que el vendedor no puede leer | Sin insignia | — |

**Detalle al pasar el mouse o con foco** (tarjeta flotante como en el mockup):
- código · ciudad;
- nombre;
- estado y responsable;
- la gestión abierta (etapa · tipo);
- el último registro de WhatsApp, con «(automático)» si lo registró la spec 85;
- «Abrir en el CRM».

Con varios negocios, el detalle los lista con su código y su estado. Elegir cuál corresponde se sigue haciendo en el panel, al abrir el chat.

## 5. Servidor

- `POST /_api/userscript/badges`, con token del script y control de versión como las demás rutas. El cuerpo es `{ chats: [{ key, title, phone? }] }`, con hasta 50 por pedido y cada `key` opaca para el script.
- Empareja cada chat con la misma función que `context`: código en el título y teléfono normalizado, con el mismo límite y las mismas reglas de lectura.
- Por chat devuelve:
  - `{ key, kind: 'single' | 'multiple' | 'none' }`;
  - con un negocio, `{ accountId, code, name, city, statusLabel, assignedUserName, doNotContact, restricted, openManagement: { stageLabel, typeLabel } | null, lastWhatsappAt, lastWhatsappAutomatic }`;
  - con varios, la lista corta de `{ accountId, code, name, statusLabel }`.
- Una consulta por lote, sin N+1. Sin escrituras ni journal.
- Límite de frecuencia por token: 30 pedidos por minuto.

## 6. Script

- **Lectura de la lista:** un observer sobre `#pane-side` lee las filas visibles: título, si es grupo y el teléfono. El teléfono sale del modelo de chat de React de la fila, con la misma función `fromChatModel` que usa el encabezado. Se busca subiendo desde los elementos internos de la fila, porque la fila misma no lo expone. Si eso falla, sale del título cuando es un número. La cuenta oficial de WhatsApp (número `0`) y las filas sin teléfono ni código no llevan insignia.
- **Pedidos:** tras 600 ms sin cambios por desplazamiento, pide los chats visibles que no estén en caché, con hasta 50 por pedido. La caché dura 5 minutos por chat, y el chat abierto se refresca cuando el panel registra algo.
- **Dibujo:** cada insignia va en su propio host con shadow DOM, como el panel, anclado a la fila. WhatsApp recicla las filas al desplazar, así que la insignia se ata a la clave del chat y no al nodo, y se vuelve a dibujar si la fila cambia de chat. Si WhatsApp redibuja la fila, el script la repone sin parpadeo visible.
- **Errores:** si el CRM no responde, no se muestran insignias y el panel lo dice en Ajustes. Nunca hay una insignia con datos viejos de otro chat.
- **Ajustes:** «Mostrar insignias en la lista de chats», encendido por defecto y guardado en el navegador.

## 7. Fuera de alcance

- Filtrar u ordenar la lista de WhatsApp por estado del CRM.
- Acciones desde la insignia, como registrar, cambiar de estado o asignar.
- Insignias en búsquedas de WhatsApp o en la vista de archivados.
- Instagram.

## 8. Validación

- **Unit (script):**
  - lectura de filas con fixtures reales de la lista: contacto guardado, número sin guardar, grupo y archivado;
  - una insignia por caso de la tabla;
  - reciclado de filas sin mostrar la insignia de otro chat;
  - espera de 600 ms, caché y lotes de 50;
  - interruptor de Ajustes.
- **Integración (`scripts/test-userscript.ts`):**
  - cada `kind`;
  - No contactar y restricción;
  - un negocio no legible no se devuelve;
  - límite de 50 por lote y de frecuencia;
  - token revocado.
- **Manual en WhatsApp real:**
  - desplazar una lista larga y ver que cada insignia sigue a su chat;
  - abrir un chat y volver;
  - modo claro y oscuro.

## 9. Riesgos y preguntas

- **Teléfono de contactos guardados (verificado el 26/10/2026):** un diagnóstico de solo lectura en WhatsApp real encontró el modelo de chat en cada fila visible, incluso en un contacto guardado con id `@lid`, con su teléfono real en `contact.phoneNumber`. Se lee desde los elementos internos de la fila. Son detalles internos de WhatsApp: si dejan de estar, la fila cae al título, y si no hay número queda sin insignia.
- **Rendimiento:** con listas de cientos de chats solo se procesan las filas visibles, lo que mantiene acotados los pedidos y el DOM.
