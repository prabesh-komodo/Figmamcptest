# Edge Cases, Naming, Type Declarations & Multi-Component Designs

## Edge Case Handling

When Figma elements don't have a direct SLDS/LWC equivalent, use [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices) as the reference for component blueprints and utility classes.

1. **No matching Lightning Base Component** — Build a custom element using SLDS utility classes and tokens first. If the design requires styling beyond what SLDS offers, fall back to custom CSS per the allowed list in `slds-mapping.md`.
2. **Custom color outside SLDS palette** — First check if a close SLDS semantic token exists. If yes, use it. If the color is a brand-specific or design-critical value with no reasonable SLDS match, define it as a CSS custom property (e.g., `--c-brand-accent: #E04F5F`) with a `/* custom: no SLDS equivalent */` comment.
3. **Custom spacing or sizing** — Same rule: prefer SLDS spacing tokens (`--slds-g-spacing-*`). If the design requires a non-standard value, use a CSS custom property with the `/* custom */` comment.
4. **Complex layout (masonry, multi-column)** — Use `slds-grid` with `slds-wrap` and `slds-size_*` utilities. CSS Grid is permitted in the scoped `.css` file **only** for layouts that SLDS grid classes genuinely cannot express (e.g., masonry, overlapping areas). Standard flex-based layouts must **always** use SLDS utility classes (`slds-grid`, `slds-grid_vertical`, `slds-grid_align-spread`, etc.) — never raw `display: flex` in CSS.
5. **Icons not in SLDS library** — Use the closest `lightning-icon` name or embed via custom sprite. Never use `<img>` for icons.
6. **Responsive breakpoints** — Use SLDS responsive utility classes. Custom media queries are permitted only if SLDS classes cannot cover the required breakpoint.
7. **Animation or transition** — Use SLDS motion tokens if available. Custom `@keyframes` are permitted for design-critical animations with a `/* custom */` comment.
8. **Ambiguous Figma layer** — Ask the user for clarification before proceeding. Do not guess.

## Component Naming

When the user does **not** specify a component name:

1. **From Figma frame name:** Convert the Figma frame/node name to `camelCase` (e.g., "Contact Card Header" → `contactCardHeader`). The folder name uses `kebab-case` (`contact-card-header`).
2. **Sanitize:** Strip special characters, leading numbers, and reserved LWC words (`template`, `slot`, `lwc`). If the result is empty or invalid, ask the user.
3. **Prefix for clarity:** If the frame name is too generic (e.g., "Frame 1", "Component"), ask the user for a meaningful name.

When the user **does** specify a name, use it exactly (converted to proper casing).

## Type Declarations (`types/salesforce-lwc.d.ts`)

Before importing from any `@salesforce/*` or `lightning/*` module, check `types/salesforce-lwc.d.ts`. If the module is not declared, add a `declare module` entry **before** writing the import in your `.ts` file. Follow the existing patterns in the file. Keep entries sorted alphabetically by module path.

## Multi-Component Designs

When a Figma frame contains **multiple distinct logical components** (e.g., a page with a header, sidebar, and content area):

1. **Identify boundaries:** Look for clearly separated sections, repeated patterns, and reusable elements.
2. **Propose a component tree:** Before generating code, present a brief component hierarchy to the user for approval (e.g., parent `pageLayout` containing children `pageHeader`, `pageSidebar`, `pageContent`).
3. **Generate bottom-up:** Build leaf/child components first, then compose them in the parent.
4. **Shared styles:** If multiple components share design tokens or custom CSS variables, extract them to a shared CSS module or document in the parent.
