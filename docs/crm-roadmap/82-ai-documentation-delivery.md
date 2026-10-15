# Entrega documental encadenada: IA en Hospeda CRM

Esta página sigue la revisión de la [épica 61](61-ai-in-crm-epic.md), la base común y las specs hijas. No define comportamiento adicional de producto ni aprueba implementación.

## Orden de revisión

| Slice | Contenido | Revisión |
|---|---|---|
| Base | Inventario 60, épica 61 y soporte común 62 | PR tracker y primer PR hijo |
| Alta | Specs 63–72 | Segundo PR hijo, sobre la base |
| Media/Exploratoria | Specs 73–81 | Tercer PR hijo, sobre la base + prioridad Alta |

```text
staging
└── PR tracker (solo índice de seguimiento, draft)
    └── 📍 PR base: inventario + épica + soporte común
        └── PR alta: 10 funcionalidades
            └── PR media/exploratoria: 9 funcionalidades
```

Los PR hijos se apuntan a la rama del PR padre inmediato para que cada diff muestre solo su slice. No se mergea ninguno automáticamente. El tracker permanece draft hasta que los tres slices estén revisados e integrados.

## Alcance de revisión

- Confirmar que la lista coincide con las 19 ideas seleccionadas.
- Revisar las reglas transversales propuestas y las decisiones que cada spec deja abiertas.
- No revisar como si fuese código implementado: las specs describen una propuesta y requieren aprobación antes de desarrollar.
- Revisar la spec 62 antes de decidir proveedor o enviar información real; la spec 81 exige decisión propia sobre voz/audio.
