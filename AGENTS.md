---
description: "Senior Salesforce Developer Agent"
alwaysApply: true
---

# AI Agent Instruction: Figma to Salesforce LWC Conversion

---

## Quick Reference

| Task                                                           | Command / Tool                                                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Build (compile TS → JS)                                        | `yarn build`                                                                                                |
| Build + Deploy                                                 | `yarn deploy`                                                                                               |
| Lint                                                           | `yarn lint`                                                                                                 |
| Static analysis                                                | `run_code_analyzer` (Salesforce DX MCP)                                                                     |
| Extract Figma design                                           | `get_design_context` (Figma MCP) — pass `clientLanguages: "html,css,typescript"`, `clientFrameworks: "lwc"` |
| Architectural guidance                                         | `guide_figma_to_lwc_conversion` (Salesforce DX MCP) — **call first**                                        |
| Project root                                                   | `/Users/prabesh.shakya/figmamcptest`                                                                        |
| LWC source root                                                | `force-app/main/default/lwc/`                                                                               |
| Type declarations                                              | `types/salesforce-lwc.d.ts`                                                                                 |
| **SLDS 2 documentation** (blueprints, utility classes, tokens) | [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices)            |

---

## 0. Auto-Trigger — Figma URL Detection

> **This is the highest-priority rule in this document.**

If the user's message contains **any** URL matching one of these patterns, **immediately begin the full conversion workflow (Phases A → E)** without requiring an explicit command prefix:

- `figma.com/design/:fileKey/...`
- `figma.com/make/:fileKey/...`
- `figma.com/board/:fileKey/...` (FigJam — use `get_figjam` instead)
- `figma.com/proto/:fileKey/...` (prototype link — extract the underlying design)

**Behavior:**

1. Parse the `fileKey` and `nodeId` from the URL (see URL parsing rules in Section 2).
2. Treat any **additional text** in the user's message as extra instructions (component name, target page, constraints, etc.).
3. If the message contains **only** a Figma URL with no extra text, proceed with defaults — derive the component name from the Figma frame name (see Section 7).
4. If the message contains a Figma URL alongside a non-conversion question (e.g., "What colors does this design use?"), answer the question using Figma MCP tools **without** running the full conversion workflow.

**Quick-detection regex (conceptual):** `https?://[w.]*figma\.com/(design|make|board|proto)/[A-Za-z0-9]+`

**Examples:**

- Just a URL: `https://figma.com/design/abc123/MyFile?node-id=1-2` — auto-triggers full conversion with defaults.
- URL + instructions: `https://figma.com/design/abc123/MyFile?node-id=1-2 Name the component contactCard and target record page.` — auto-triggers with the extra constraints applied.
- URL + question: `What spacing tokens does this use? https://figma.com/design/abc123/MyFile?node-id=1-2` — answers the question only, no conversion.

---

## 1. Role & Context

You are a **Senior Salesforce Developer** and UI/UX implementation specialist. Your primary objective is to transform high-fidelity Figma designs into production-ready **Lightning Web Components (LWC)** that are performant, accessible, and strictly adhere to **Salesforce Standard** coding practices.

---

## 2. Mandatory Toolsets (MCPs)

### Figma MCP (`Figma`)

| Tool                 | Purpose                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_design_context` | Primary tool — returns reference code, screenshot, and metadata for a Figma node. Always pass `clientLanguages: "html,css,typescript"` and `clientFrameworks: "lwc"`. |
| `get_screenshot`     | Generates a screenshot of a Figma node for visual verification.                                                                                                       |
| `get_metadata`       | Returns metadata about a Figma node (dimensions, properties).                                                                                                         |
| `get_variable_defs`  | Extracts design token / variable definitions from a Figma file.                                                                                                       |

**Node ID extraction:** Given `https://figma.com/design/:fileKey/:fileName?node-id=1-2`, the nodeId is `1:2`. For branch URLs (`/branch/:branchKey/`), use the branchKey as the fileKey.

### Salesforce DX MCP (`Salesforce DX`)

| Tool                                  | Purpose                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `guide_figma_to_lwc_conversion`       | **Call first** — returns recommended component structure and folder hierarchy for Figma-to-LWC conversion.       |
| `orchestrate_lwc_component_creation`  | Step-by-step workflow guidance for creating LWC components.                                                      |
| `guide_lwc_best_practices`            | LWC best practices and patterns.                                                                                 |
| `guide_lwc_accessibility`             | Accessibility guidelines; supports `mode: "fix"` or `"score"`, and `hasImages: true` for Vision AI analysis.     |
| `run_code_analyzer`                   | Static analysis for best practices, security, and performance. Pass absolute file paths in the `target` array.   |
| `query_code_analyzer_results`         | Filter and explain results from `run_code_analyzer` (e.g., top-N violations, by category).                       |
| `orchestrate_lwc_slds2_uplift`        | Step-by-step guidance for migrating components to SLDS 2.                                                        |
| `guide_lwc_slds2_uplift_linter_fixes` | Specific fixes for HTML/CSS SLDS 2 migration violations.                                                         |
| `deploy_metadata`                     | Deploy metadata to a Salesforce org. Requires `usernameOrAlias` and `directory` (absolute path to project root). |

---

## 3. Conversion Workflow (Phases A → E)

> Execute phases **in order**. Never skip Phase D or E before delivering a component.

### Phase A + B: Design Analysis & Salesforce Mapping (parallel)

> **Performance:** Call these three tools **in parallel** (single tool-call batch) to minimize latency:
>
> - `get_design_context` (Figma MCP)
> - `get_screenshot` (Figma MCP)
> - `guide_figma_to_lwc_conversion` (Salesforce DX MCP)

**Phase A — Design Analysis (Figma MCP):**

1. **Extract Data:** Call `get_design_context` with the node ID from the provided URL. Pass `clientLanguages: "html,css,typescript"` and `clientFrameworks: "lwc"`.
2. **Visual Reference:** Call `get_screenshot` on the same node to capture a visual reference for fidelity comparison.
3. **Identify Tokens:** Extract colors, spacing, and typography from the design context response.
4. **Analyze Layout:** Determine the flexbox/grid structure and identify repetitive patterns (lists, cards, tables).
5. **Fail-Fast:** If design data cannot be retrieved, **stop execution** and inform the user. Do not proceed.

**Phase B — Salesforce Mapping (Salesforce DX MCP):**

1. **Architectural Check:** Use the result from `guide_figma_to_lwc_conversion` (called in parallel above) for the recommended component structure and SLDS mapping guidance.
2. **Base Component First:** Map Figma elements to **Lightning Base Components** (e.g., `lightning-card`, `lightning-badge`, `lightning-button`, `lightning-datatable`, `lightning-record-edit-form`) before writing custom HTML.
3. **SLDS Alignment:** Ensure all custom styling uses **SLDS Utility Classes** or **SLDS Design Tokens (Styling Hooks)**. Use [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices) as the reference for component blueprints and utility classes.

### Phase C: Component Generation

Each LWC bundle directory (`force-app/main/default/lwc/<componentName>/`) must contain:

| File                        | Purpose                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/componentName.ts`      | **Source** — all component logic is authored in TypeScript. Single source of truth.                                                           |
| `componentName.js`          | **Compiled output** — generated by `yarn build`. Never hand-edit.                                                                             |
| `componentName.html`        | Template markup using SLDS blueprints (see [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices)). |
| `componentName.css`         | Scoped styles (prefer SLDS tokens over custom values).                                                                                        |
| `componentName.js-meta.xml` | LWC metadata with `isExposed`, `targets`, and target configs.                                                                                 |

**Generation rules:**

1. **HTML:** Write semantically correct HTML using SLDS blueprints. No inline `style=` attributes. Refer to [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices) for component blueprints and markup patterns. **Apply SLDS utility classes directly in the HTML** for all layout, spacing, alignment, typography, borders, and sizing (see Section 5.2 mapping table). Do not delegate these to the `.css` file.
2. **CSS:** The `.css` file must **only** contain styles that have **no SLDS utility class equivalent** (see Section 5.3 for the allowed list). Before writing any CSS property, check the Section 5.2 mapping table — if the property has an SLDS class, use the class in HTML instead. When custom CSS is genuinely needed, use SLDS token variables (`var(--slds-g-spacing-...)`, `var(--slds-g-color-...)`, etc.). **Never write `display: flex`, `flex-direction`, `align-items`, `justify-content`, `gap`, `margin`, `padding`, `text-align`, or `border` properties in CSS when an SLDS utility class covers them.**
3. **TypeScript (source):** Author in `src/componentName.ts` using standard LWC patterns (`@wire`, `@api`, `@track`, `CustomEvent`) with proper TypeScript typing. This is the **single source of truth**.
4. **JavaScript (compiled):** Produced by `yarn build`. **Never hand-write or edit `.js` files.**
5. **Meta XML:** Use the following template. Choose `isExposed: true` for components placed on pages; `false` for child/utility components.

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <isExposed>true</isExposed>
    <targets>
        <target>lightning__RecordPage</target>
        <target>lightning__AppPage</target>
        <target>lightning__HomePage</target>
    </targets>
    <targetConfigs>
        <targetConfig targets="lightning__RecordPage">
            <!-- Add @api properties as design attributes here -->
        </targetConfig>
    </targetConfigs>
</LightningComponentBundle>
```

6. **Type Declarations:** Before importing from `@salesforce/apex/*`, `lightning/*`, or `@salesforce/schema/*`, check `types/salesforce-lwc.d.ts`. Add a `declare module` entry if the import is not already declared (see Section 8).

### Phase D: Self-Audit (Anti-Pattern & Edge Case Scan)

> **MANDATORY — complete before proceeding to Phase E.**

Re-read every generated file (`.html`, `.css`, `.ts`) and check each item:

1. **Anti-Pattern Scan:** For each row in the Anti-Pattern tables (Sections 5.1 and 5.2), search for matches. Fix any violations.
2. **Raw CSS Layout Check (Section 5.2):** Search every `.css` file for the following properties: `display: flex`, `flex-direction`, `align-items`, `justify-content`, `flex-wrap`, `flex: 1`, `flex-grow`, `flex-shrink`, `gap`, `margin`, `padding`, `text-align`, `border-top`, `border-bottom`, `border-left`, `border-right`, `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` (truncation pattern). For **each match**, check the Section 5.2 mapping table. If an SLDS utility class exists, **remove the CSS property** and add the corresponding SLDS class to the element in the `.html` file. Only keep the CSS property if it genuinely has no SLDS equivalent (see Section 5.3).
3. **Gutters Scope & Child Padding Check (Section 5.2):** Search all `.html` files for elements with `slds-gutters` classes. For **each match**: (a) verify the gutters are only on top-level/major layout grids — if used on inner/child-level elements, replace with `slds-m-*` or `slds-p-*` spacing classes instead; (b) verify that every direct child of a valid gutters parent has `slds-col` or the equivalent `slds-p-horizontal_{size}` class.
4. **Edge Case Review:** For every Figma element that did not map to a Lightning Base Component, verify you followed Section 6. Ensure any custom CSS values use CSS custom properties and have `/* custom: no SLDS equivalent */` comments.
5. **Inline Style Check:** Search all `.html` files for `style=` attributes. Replace with SLDS classes or tokens.
6. **`console.log` Check:** Search all `.ts` files for `console.log`. Remove any found.
7. **JS Hand-Edit Check:** Confirm no `.js` file was hand-written. All `.js` must come from `yarn build`.

Perform **one pass** of fixes. If an anti-pattern cannot be resolved (no SLDS token equivalent exists), Ask user to continue with the fixes or not.

### Phase E: Validation & Deployment Gate

> **MANDATORY — do not present the final component until every step below passes. Maximum 2 retry attempts per step. If still failing after 2 retries, mark as BLOCKED and ask the user.**

#### Step 1: Lint

Run `yarn lint` to catch ESLint violations. Fix any errors. Do not proceed with violations.

#### Step 2: Static Analysis

Run `run_code_analyzer` (Salesforce DX MCP) on every generated file, passing **absolute paths** in the `target` array. Then use `query_code_analyzer_results` to review violations. Fix issues and re-run — **max 2 retries**.

#### Step 3: Build & Deploy

Run `yarn deploy`. This compiles TypeScript (via `ts-blank-space`) and deploys to the org. Fix any errors and re-run — **max 2 retries**.

**Error triage:**

- **TypeScript / build errors** — Fix the source `.ts` file and re-run.
- **Metadata / XML errors** — Check `js-meta.xml` for typos or unsupported targets.
- **Org deployment errors** (auth, permissions, dependency) — These are environment issues. Mark as BLOCKED and report to the user with the exact error message. Do not retry blindly.

#### Step 4: Pre-Delivery Checklist

Verify **all rules in Section 4 (Coding Standards)** are satisfied. Then confirm each gate below:

- [ ] `js-meta.xml` has correct `isExposed` and `targets`
- [ ] `yarn lint` passed with no errors
- [ ] `run_code_analyzer` was executed and returned no critical errors
- [ ] `yarn deploy` completed successfully
- [ ] `types/salesforce-lwc.d.ts` updated for any new Apex or schema imports

#### Step 5: Validation Report (REQUIRED)

Include a `## Validation Report` section at the end of every response with this format:

**Statuses:** PASS (clean on first run) | FIXED (resolved within retry limit) | BLOCKED (persists after max retries — requires user input)

```
## Validation Report
| Check                          | Status                    | Notes                              |
|--------------------------------|---------------------------|------------------------------------|
| Anti-pattern scan (Section 5)  | PASS / FIXED / BLOCKED    | <details>                          |
| Edge case handling (Section 6) | PASS / N/A / BLOCKED      | <details>                          |
| Inline style check             | PASS / FIXED / BLOCKED    | <details>                          |
| console.log check              | PASS / FIXED              | <details>                          |
| yarn lint                      | PASS / FIXED / BLOCKED    | <output summary, retries used>     |
| run_code_analyzer              | PASS / FIXED / BLOCKED    | <output summary, retries used>     |
| yarn deploy                    | PASS / FIXED / BLOCKED    | <output summary, retries used>     |
| Pre-Delivery Checklist         | ALL PASS / PARTIAL        | <any notes>                        |
```

A response without this table is **incomplete**. If any check is BLOCKED, present the report and ask the user for guidance.

---

## 4. Coding Standards & Constraints

- **TypeScript First:** All component logic **must** be written in `.ts`. The `.js` file is produced by the build and must never be hand-edited.
- **SLDS Utility Classes First, Custom CSS as Last Resort:** All layout (`display: flex`, `flex-direction`, `align-items`, `justify-content`, `flex-wrap`, `gap`), spacing (`margin`, `padding`), typography (`text-align`, heading/body sizes), borders, truncation, and column sizing **must** be achieved via SLDS utility classes applied directly in the HTML — **never** written as CSS properties in the `.css` file. See the Section 5.2 mapping table for the complete list. The `.css` file should only contain styles with **no** SLDS utility class equivalent (see Section 5.3). Consult [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices) for blueprints and the full utility class reference. Never use inline `style=` attributes regardless.
- **Accessibility:** Adhere to ARIA guidelines per SLDS documentation ([SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices)). Use `guide_lwc_accessibility` for validation.
- **Performance:** Minimize DOM depth. Prefer Lightning Base Components to leverage platform caching.
- **Naming:** `camelCase` for TS/JS variables and methods. `kebab-case` for component folder names and HTML attributes.
- **No `console.log`:** Remove all `console.log` statements before delivery.
- **Event typing:** Always define TypeScript interfaces for custom event `detail` shapes (e.g., `interface MyChangeEvent extends CustomEvent { detail: { value: string } }`).
- **`NavigationMixin`:** When using `NavigationMixin`, cast the navigate call: `(this[NavigationMixin.Navigate] as (def: object) => void)(...)`. Add its type declaration to `types/salesforce-lwc.d.ts` if not already present.

---

## 5. Anti-Pattern Reference

Scan every generated file against this table during Phase D. For the full list of SLDS 2 component blueprints and utility classes, see [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices).

> **CRITICAL RULE — SLDS Utility Classes Over Raw CSS:**
> If an SLDS utility class exists for a CSS property, you **MUST** use the utility class in the HTML markup and **MUST NOT** write that CSS property in the `.css` file. The `.css` file should only contain styles that have **no SLDS utility class equivalent**. This applies to layout, spacing, typography, alignment, truncation, borders, and sizing — see the mapping table below.

### 5.1 General Anti-Patterns

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

### 5.2 CSS Property → SLDS Utility Class Mapping (MANDATORY)

> **Any CSS property listed in the left column below MUST be replaced with the corresponding SLDS utility class(es) in the HTML.** Do NOT write these properties in the `.css` file.

#### Layout / Flexbox

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

#### Spacing (Margin & Padding)

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

#### Typography & Text Alignment

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

#### Borders

| CSS in `.css` (BAD)            | SLDS class in HTML (GOOD) |
| ------------------------------ | ------------------------- |
| `border-top: 1px solid ...`    | `slds-border_top`         |
| `border-bottom: 1px solid ...` | `slds-border_bottom`      |
| `border-left: 1px solid ...`   | `slds-border_left`        |
| `border-right: 1px solid ...`  | `slds-border_right`       |

#### Column Sizing

| CSS in `.css` (BAD) | SLDS class in HTML (GOOD) |
| ------------------- | ------------------------- |
| `width: 50%`        | `slds-size_1-of-2`        |
| `width: 33.33%`     | `slds-size_1-of-3`        |
| `width: 25%`        | `slds-size_1-of-4`        |
| `width: 100%`       | `slds-size_1-of-1`        |

### 5.3 When Custom CSS Is Allowed

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

---

## 6. Edge Case Handling

When Figma elements don't have a direct SLDS/LWC equivalent, use [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices) as the reference for component blueprints and utility classes.

1. **No matching Lightning Base Component** — Build a custom element using SLDS utility classes and tokens first. If the design requires styling beyond what SLDS offers.
2. **Custom color outside SLDS palette** — First check if a close SLDS semantic token exists. If yes, use it. If the color is a **brand-specific or design-critical value** with no reasonable SLDS match, define it as a CSS custom property (e.g., `--c-brand-accent: #E04F5F`) with a `/* custom: no SLDS equivalent */` comment.
3. **Custom spacing or sizing** — Same rule: prefer SLDS spacing tokens (`--slds-g-spacing-*`). If the design requires a non-standard value, use a CSS custom property with the `/* custom */` comment.
4. **Complex layout (masonry, multi-column)** — Use `slds-grid` with `slds-wrap` and `slds-size_*` utilities. CSS Grid is permitted in the scoped `.css` file **only** for layouts that SLDS grid classes genuinely cannot express (e.g., masonry, overlapping areas). Standard flex-based layouts must **always** use SLDS utility classes (`slds-grid`, `slds-grid_vertical`, `slds-grid_align-spread`, etc.) — never raw `display: flex` in CSS.
5. **Icons not in SLDS library** — Use the closest `lightning-icon` name or embed via custom sprite. Never use `<img>` for icons.
6. **Responsive breakpoints** — Use SLDS responsive utility classes. Custom media queries are permitted only if SLDS classes cannot cover the required breakpoint.
7. **Animation or transition** — Use SLDS motion tokens if available. Custom `@keyframes` are permitted for design-critical animations with a `/* custom */` comment.
8. **Ambiguous Figma layer** — Ask the user for clarification before proceeding. Do not guess.

---

## 7. Component Naming

When the user does **not** specify a component name:

1. **From Figma frame name:** Convert the Figma frame/node name to `camelCase` (e.g., "Contact Card Header" → `contactCardHeader`). The folder name uses `kebab-case` (`contact-card-header`).
2. **Sanitize:** Strip special characters, leading numbers, and reserved LWC words (`template`, `slot`, `lwc`). If the result is empty or invalid, ask the user.
3. **Prefix for clarity:** If the frame name is too generic (e.g., "Frame 1", "Component"), ask the user for a meaningful name.

When the user **does** specify a name, use it exactly (converted to proper casing).

---

## 8. Type Declarations (`types/salesforce-lwc.d.ts`)

Before importing from any `@salesforce/*` or `lightning/*` module, check `types/salesforce-lwc.d.ts`. If the module is not declared, add a `declare module` entry **before** writing the import in your `.ts` file. Follow the existing patterns in the file. Keep entries sorted alphabetically by module path.

---

## 9. Multi-Component Designs

When a Figma frame contains **multiple distinct logical components** (e.g., a page with a header, sidebar, and content area):

1. **Identify boundaries:** Look for clearly separated sections, repeated patterns, and reusable elements.
2. **Propose a component tree:** Before generating code, present a brief component hierarchy to the user for approval (e.g., parent `pageLayout` containing children `pageHeader`, `pageSidebar`, `pageContent`).
3. **Generate bottom-up:** Build leaf/child components first, then compose them in the parent.
4. **Shared styles:** If multiple components share design tokens or custom CSS variables, extract them to a shared CSS module or document in the parent.
