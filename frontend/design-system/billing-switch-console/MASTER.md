# Switchboard console design system

The application uses React, Lucide icons, and its existing `Ui*` primitives. Theme tokens and shared component rules live in `src/enterprise.css`, loaded after the legacy styles. New screens should reuse those tokens and primitives instead of introducing a second component library.

## Direction

- Calm, technical enterprise UI with readable data density.
- Solid surfaces, clear borders, restrained elevation, and one primary action per page.
- Cobalt marks navigation and primary actions. Teal marks positive state; amber and red signal attention and errors.
- Light and dark themes each have dedicated semantic token values. Avoid hardcoded colors in new components.

## Shared tokens

| Role | Token |
| --- | --- |
| Page, sidebar, card | `--bg`, `--sidebar`, `--surface` |
| Raised and interactive surfaces | `--surface-2`, `--surface-3`, `--surface-hover` |
| Borders | `--line`, `--line-soft` |
| Text hierarchy | `--text`, `--text-soft`, `--text-muted` |
| Brand and semantic state | `--brand`, `--accent`, `--blue`, `--warning`, `--danger` |
| Elevation and shape | `--shadow-xs` through `--shadow-lg`, `--radius-sm` through `--radius-lg` |
| Layout | `--page-pad-x`, `--page-pad-y`, `--grid-gap`, `--topbar-height` |

The type system uses Plus Jakarta Sans for interface text and JetBrains Mono for IDs, durations, and numeric values. Keep numbers tabular in metric and table columns.

## Component patterns

- Use `UiButton`, `UiInput`, `UiSelect`, `UiField`, `UiBadge`, `UiTabs`, `UiDialog`, `UiDrawer`, and `UiSkeleton` from `src/components/ui/Primitives.tsx` where appropriate.
- Page titles use `.page-header`; content groups use `.panel`; tabular data uses `.table-panel` and `.table-scroll`.
- Search and filters belong in `.toolbar` or a module filter panel above the data they control.
- Empty, loading, error, and confirmation states need text that explains the current state and a useful next action when available.
- Use Lucide icons at consistent 16–20px sizes. Icon-only actions need an accessible label.
- Keep controls keyboard accessible, focus visibly outlined, and animations reduced under `prefers-reduced-motion`.

## Module guidance

Customers, carriers, DIDs, authentication, routing, normalization, plans, invoices, CDR, live calls, analytics, and SIP trace share the same surfaces and controls. Preserve each module's existing task flow and data semantics. Use real API values for charts and metrics; do not decorate a production screen with fabricated telemetry.
