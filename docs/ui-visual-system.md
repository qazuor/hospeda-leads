# CRM visual system

The October 2026 visual audit is implemented through shared CSS Modules rather than page-specific overrides. Domain state, permissions, mutation payloads, validations and business rules stay in their existing components.

## Shared primitives

- `CrmLayout.module.css`: panel, page heading, wrapping action group, form field, dialog footer, empty state and horizontal section navigation.
- `CrmControls.module.css`: control dimensions and readable button labels; action links use the Mantine variant foreground.
- `Disclosure.module.css`: one accordion header anatomy, padding and chevron placement. Page styles only describe context and typography.
- `Dialog`: consistent width, responsive padding and secondary/primary action footer.
- `CrmEmptyState`: shared presentation, with query and action ownership in callers.
- `base.css`: responsive panel spacing, title scale and radius tokens.

Compose these classes in page CSS Modules. Preserve layout-specific rules; remove declarations that duplicate the primitive. Use one surface per main section and reserve raised shadows for floating content.

## Current application

Compact header and horizontal tabs, readable controls, task metadata and calendar, commercial next-step layout, filter badges and builder, non-overlapping global history controls, settings navigation, model editor proportions, resource thumbnails and version history, natural connection badges, duplicate review spacing, empty statistics/archived/trash states, and compact mobile guide navigation.

## Verification

TypeScript, unit tests and production build locally. CI additionally runs migrations, integration tests, browser flows and production Docker smoke tests. Transversal browser coverage includes 320, 390 and 1280px in both themes, checks document overflow and limits mobile header height to 130px. Screenshots remain available as CI evidence.

Presentation of native date/file controls and further composition adjustments are separate visual follow-ups; do not change their data contracts merely to restyle them.
