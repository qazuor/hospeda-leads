# Spec hija: crear filtros describiendo lo que se busca

**Épica:** [61](61-ai-in-crm-epic.md) · **Prioridad:** Media · **Depende de:** [62](62-ai-platform-foundation-spec.md), catálogo de filtros y operadores.

## Resultado esperado

Una persona describe qué negocios quiere encontrar y recibe una propuesta de filtros que puede revisar antes de aplicarla.

## Flujo

1. En Negocios escribe una frase, por ejemplo “alojamientos de Colón sin revisar”.
2. La IA propone condiciones usando solo campos, operadores y valores de catálogo permitidos; términos no claros generan una pregunta corta.
3. La vista previa muestra cada campo, operador, valor, grupo AND/OR y exclusión de forma editable.
4. La persona aplica; guardar la combinación como vista es una acción separada y explícita.

## Guardrails y aceptación

- La generación no ejecuta una consulta amplia ni cambia la lista hasta aplicar.
- No inventa nombres de campos ni valores de catálogo, y no modifica operador/grupos de filtros existentes sin mostrarlo.
- Las exclusiones y agrupaciones existentes permanecen intactas al editar una sugerencia.
- Si una frase produce múltiples interpretaciones, pregunta cuál pretende en vez de elegir silenciosamente.
- Aplicar usa el filtro normal del servidor y sus permisos; guardar vista conserva el flujo actual.

## Impacto estimado

`FilterBuilderDialog`, `FieldFilterEditors`, catálogo compartido de campos/valores y serialización actual de filtros. El modelo entrega una estructura limitada; no SQL ni expresiones ejecutables.
