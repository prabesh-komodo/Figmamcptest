# SLDS Anti-Pattern & Mapping Reference

Scan every generated file against this reference during Phase C (generation) and Phase D (self-audit). For the full list of SLDS 2 component blueprints and utility classes, see [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices).

> **CRITICAL RULE — SLDS Utility Classes Over Raw CSS:**
> If an SLDS utility class exists for a CSS property, you **MUST** use the utility class in the HTML markup and **MUST NOT** write that CSS property in the `.css` file. The `.css` file should only contain styles that have **no SLDS utility class equivalent**. This applies to layout, spacing, typography, alignment, truncation, borders, and sizing.

## General Anti-Patterns

| Bad                                      | Good                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `style="color: #FF5733"`                 | `class="slds-text-color_error"` or `var(--slds-g-color-feedback-error)`                                                                                |
| `style="margin: 16px"`                   | `class="slds-m-around_medium"` or `var(--slds-g-spacing-4)`                                                                                            |
| `style="font-size: 14px"`                | `class="slds-text-body_regular"` or `var(--slds-g-font-size-3)`                                                                                        |
| `<div class="my-button">Click</div>`     | `<lightning-button label="Click"></lightning-button>`                                                                                                  |
| Manually writing or editing `.js`        | Write `.ts`, run `yarn build` to compile                                                                                                               |
| `document.querySelector(...)`            | `this.template.querySelector(...)`                                                                                                                     |
| `window.location.href = ...`             | `NavigationMixin` from `lightning/navigation`                                                                                                          |
| Raw hex color in CSS without comment     | SLDS color token (e.g., `var(--slds-g-color-brand-base-50)`). If no SLDS match, use a custom property with `/* custom: no SLDS equivalent */` comment. |
| Custom `@keyframes` animation            | SLDS motion token (e.g., `var(--slds-g-motion-duration-quickly)`) or omit                                                                              |
| `<img>` for icons                        | `<lightning-icon>` with SLDS icon name or custom sprite                                                                                                |
| Custom media queries                     | SLDS responsive classes (`slds-small-size_*`, `slds-medium-size_*`)                                                                                    |
| Importing undeclared Apex/schema modules | Add `declare module` to `types/salesforce-lwc.d.ts` first                                                                                              |

## CSS Property → SLDS Utility Class Mapping (MANDATORY)

> Any CSS property listed in the left column below **MUST** be replaced with the corresponding SLDS utility class(es) in the HTML. Do NOT write these properties in the `.css` file.

### Layout / Flexbox

| CSS in `.css` (BAD)                                              | SLDS class(es) in HTML (GOOD)                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `display: flex` (row direction)                                  | `slds-grid`                                                                                                                                                                                                                                                             |
| `display: flex; flex-direction: column`                          | `slds-grid slds-grid_vertical`                                                                                                                                                                                                                                          |
| `flex-direction: column`                                         | `slds-grid_vertical` (parent must already have `slds-grid`)                                                                                                                                                                                                             |
| `flex-wrap: wrap`                                                | `slds-wrap`                                                                                                                                                                                                                                                             |
| `align-items: center`                                            | `slds-grid_vertical-align-center`                                                                                                                                                                                                                                       |
| `align-items: flex-start`                                        | `slds-grid_vertical-align-start`                                                                                                                                                                                                                                        |
| `align-items: flex-end`                                          | `slds-grid_vertical-align-end`                                                                                                                                                                                                                                          |
| `justify-content: center`                                        | `slds-grid_align-center`                                                                                                                                                                                                                                                |
| `justify-content: space-between`                                 | `slds-grid_align-spread`                                                                                                                                                                                                                                                |
| `justify-content: flex-end`                                      | `slds-grid_align-end`                                                                                                                                                                                                                                                   |
| `justify-content: space-around`                                  | `slds-grid_align-space`                                                                                                                                                                                                                                                 |
| `flex: 1` / `flex-grow: 1`                                       | `slds-col` or `slds-grow`                                                                                                                                                                                                                                               |
| `flex-shrink: 0`                                                 | `slds-shrink-none`                                                                                                                                                                                                                                                      |
| `flex-grow: 0`                                                   | `slds-grow-none`                                                                                                                                                                                                                                                        |
| `gap` between flex children (major layout)                       | `slds-gutters` (16px), `slds-gutters_small` (12px), `slds-gutters_x-small` (8px), `slds-gutters_xx-small` (4px), `slds-gutters_large` (24px), or `slds-gutters_x-large` (32px) — **only for top-level / major layout grids** (page columns, card grids, form sections). |
| `gap` between flex children (inner/child elements)               | Use SLDS margin (`slds-m-*`) or padding (`slds-p-*`) classes on individual child elements instead of gutters.                                                                                                                                                           |
| `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` | `slds-truncate`                                                                                                                                                                                                                                                         |

> **When to use gutters vs. spacing classes:**
>
> - **`slds-gutters*`** — Use **only** for big, structural layout grids: page-level column layouts, multi-column card grids, form section rows. These are top-level containers that divide the page into major regions.
> - **`slds-m-*` / `slds-p-*`** — Use for spacing between elements **inside** those regions: items within a card body, buttons in a button group, fields in a form row, inline labels, etc. Prefer margin/padding utility classes for any child-level or inner-component spacing.

> **CRITICAL — When gutters are used, children require padding:**
> SLDS gutters work by applying **negative horizontal margins** on the parent grid container. Each **direct child** of a `slds-gutters*` parent **must** include `slds-col` (or the equivalent `slds-p-horizontal_{size}`) to apply matching horizontal padding. Without this, the child content will overflow or misalign.

| Gutter class on parent  | Required child class                       | Equivalent child padding |
| ----------------------- | ------------------------------------------ | ------------------------ |
| `slds-gutters_xx-small` | `slds-col` or `slds-p-horizontal_xx-small` | 4px left + right         |
| `slds-gutters_x-small`  | `slds-col` or `slds-p-horizontal_x-small`  | 8px left + right         |
| `slds-gutters_small`    | `slds-col` or `slds-p-horizontal_small`    | 12px left + right        |
| `slds-gutters`          | `slds-col` or `slds-p-horizontal_medium`   | 16px left + right        |
| `slds-gutters_large`    | `slds-col` or `slds-p-horizontal_large`    | 24px left + right        |
| `slds-gutters_x-large`  | `slds-col` or `slds-p-horizontal_x-large`  | 32px left + right        |

**Example — converting a flex row with centered items:**

```html
<!-- BAD: relies on custom CSS class with display:flex; align-items:center; justify-content:space-between -->
<div class="task-header">...</div>

<!-- GOOD: SLDS utility classes directly in HTML -->
<div class="slds-grid slds-grid_vertical-align-center slds-grid_align-spread">
  ...
</div>
```

**Example — gutters for major layout, spacing classes for inner elements:**

```html
<!-- GOOD: gutters on a top-level page column grid, children have slds-col -->
<div class="slds-grid slds-gutters">
  <div class="slds-col slds-size_1-of-2">
    <!-- Inner spacing uses margin/padding classes, NOT gutters -->
    <div class="slds-grid slds-grid_vertical-align-center">
      <lightning-icon
        icon-name="standard:task"
        class="slds-m-right_small"
      ></lightning-icon>
      <span class="slds-text-heading_small">Section Title</span>
    </div>
  </div>
  <div class="slds-col slds-size_1-of-2">Column 2</div>
</div>
```

### Spacing (Margin & Padding)

| CSS in `.css` (BAD)            | SLDS class in HTML (GOOD)  |
| ------------------------------ | -------------------------- |
| `margin: Xpx`                  | `slds-m-around_{size}`     |
| `margin-top: Xpx`              | `slds-m-top_{size}`        |
| `margin-bottom: Xpx`           | `slds-m-bottom_{size}`     |
| `margin-left: Xpx`             | `slds-m-left_{size}`       |
| `margin-right: Xpx`            | `slds-m-right_{size}`      |
| `margin-left + margin-right`   | `slds-m-horizontal_{size}` |
| `margin-top + margin-bottom`   | `slds-m-vertical_{size}`   |
| `padding: Xpx`                 | `slds-p-around_{size}`     |
| `padding-top: Xpx`             | `slds-p-top_{size}`        |
| `padding-bottom: Xpx`          | `slds-p-bottom_{size}`     |
| `padding-left: Xpx`            | `slds-p-left_{size}`       |
| `padding-right: Xpx`           | `slds-p-right_{size}`      |
| `padding-left + padding-right` | `slds-p-horizontal_{size}` |
| `padding-top + padding-bottom` | `slds-p-vertical_{size}`   |

**Size tokens:** `xxx-small` (2px), `xx-small` (4px), `x-small` (8px), `small` (12px), `medium` (16px), `large` (24px), `x-large` (32px), `xx-large` (48px). Use `_none` to reset to 0.

### Typography & Text Alignment

| CSS in `.css` (BAD)         | SLDS class in HTML (GOOD)                          |
| --------------------------- | -------------------------------------------------- |
| `text-align: center`        | `slds-text-align_center`                           |
| `text-align: right`         | `slds-text-align_right`                            |
| `text-align: left`          | `slds-text-align_left`                             |
| `font-size` (heading 1)     | `slds-text-heading_large`                          |
| `font-size` (heading 2)     | `slds-text-heading_medium`                         |
| `font-size` (heading 3)     | `slds-text-heading_small`                          |
| `font-size` (body)          | `slds-text-body_regular` or `slds-text-body_small` |
| `font-weight: bold` / `700` | `slds-text-title_bold`                             |

### Borders

| CSS in `.css` (BAD)            | SLDS class in HTML (GOOD) |
| ------------------------------ | ------------------------- |
| `border-top: 1px solid ...`    | `slds-border_top`         |
| `border-bottom: 1px solid ...` | `slds-border_bottom`      |
| `border-left: 1px solid ...`   | `slds-border_left`        |
| `border-right: 1px solid ...`  | `slds-border_right`       |

### Column Sizing

| CSS in `.css` (BAD) | SLDS class in HTML (GOOD) |
| ------------------- | ------------------------- |
| `width: 50%`        | `slds-size_1-of-2`        |
| `width: 33.33%`     | `slds-size_1-of-3`        |
| `width: 25%`        | `slds-size_1-of-4`        |
| `width: 100%`       | `slds-size_1-of-1`        |

## When Custom CSS Is Allowed

The `.css` file should **only** contain styles that genuinely have no SLDS utility class equivalent. Common legitimate custom CSS includes:

- `border-radius` with non-standard values (SLDS tokens preferred: `var(--slds-g-radius-border-*)`)
- `background-color` / `color` with SLDS token variables
- `cursor: pointer` (no SLDS class)
- `position: relative` / `absolute` (no SLDS class for arbitrary positioning)
- `min-width` / `max-width` / `min-height` / `max-height` (no SLDS class)
- `opacity` (no SLDS class)
- `transition` with SLDS motion tokens
- Pseudo-elements (`::before`, `::after`)
- `:host` block

When writing custom CSS, always use SLDS design tokens (`var(--slds-g-*)`) for values. Raw pixel/hex values require a `/* custom: no SLDS equivalent */` comment.
