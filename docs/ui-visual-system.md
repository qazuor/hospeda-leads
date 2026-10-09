# CRM visual system

The October 2026 visual audit is implemented through shared CSS Modules rather than page-specific overrides. Domain state, permissions, mutation payloads, validations and business rules stay in their existing components.

## Shared primitives

- `CrmLayout.module.css`: panel, page heading, wrapping action group, responsive filter grid, form field, dialog footer, empty state and horizontal section navigation.
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

Localized date/file presentation preserves the existing data contracts. Native date-time and time fields retain their validation semantics.

## Visual follow-up

`CrmDateInput` displays Spanish calendar days and emits the existing YYYY-MM-DD contract. It accepts localized typed dates and existing ISO input, rejects impossible dates and preserves the configured bounds. `CrmMonthInput` presents the same YYYY-MM value through a Spanish month picker. Native date-time and time fields retain their original validation semantics.

File fields display Spanish selection labels while retaining the original native input, accept list, disabled state, files, ref and change event. Resource and import labels remain explicit accessible names.

Mobile row/card actions have 44px targets; narrow action cells wrap instead of overflowing. Names can wrap and card metadata shares a readable scale. Model variables use a compact menu with human labels and the token secondary; the mobile editor offers a focusable preview destination and keeps its save footer visible. Classification navigation, history rows and message sections follow the same spacing and surface rules.

The unit suite checks localized display, ISO output, invalid/leap days, month output and native file events. Browser tests retain API-payload assertions; only displayed-value and control-selection assertions change for localized controls.

Mobile notifications appear below the compact header, show one notice at a time and reserve space for a dismiss target. They remain below active dialogs and keep their existing destination/retry actions.
