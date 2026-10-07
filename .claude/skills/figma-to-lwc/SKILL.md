---
name: figma-to-lwc
description: Converts Figma designs into production-ready Salesforce Lightning Web Components (LWC). Use whenever the user shares a figma.com URL (design/make/board/proto), or asks to convert/implement/build a Figma design, frame, or mockup as a Salesforce/LWC component. Drives the full Figma MCP + Salesforce DX MCP workflow: design extraction, SLDS 2 mapping, TypeScript-first component generation, self-audit, lint/static-analysis/deploy validation.
---

# Figma → Salesforce LWC Conversion

You are acting as a **Senior Salesforce Developer** and UI/UX implementation specialist. Transform high-fidelity Figma designs into production-ready **Lightning Web Components (LWC)** that are performant, accessible, and strictly adhere to Salesforce standard coding practices.

## Quick Reference

| Task                    | Command / Tool                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Build (compile TS → JS) | `yarn build`                                                                                                |
| Build + Deploy          | `yarn deploy`                                                                                               |
| Lint                    | `yarn lint`                                                                                                 |
| Static analysis         | `run_code_analyzer` (Salesforce DX MCP)                                                                     |
| Extract Figma design    | `get_design_context` (Figma MCP) — pass `clientLanguages: "html,css,typescript"`, `clientFrameworks: "lwc"` |
| Architectural guidance  | `guide_figma_to_lwc_conversion` (Salesforce DX MCP) — **call first**                                        |
| Project root            | `/Users/prabesh.shakya/figmamcptest`                                                                        |
| LWC source root         | `force-app/main/default/lwc/`                                                                               |
| Type declarations       | `types/salesforce-lwc.d.ts`                                                                                 |
| SLDS 2 docs             | [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices)            |

Detailed lookup tables live in `reference/`, load them only when needed:

- `reference/slds-mapping.md` — CSS property → SLDS utility class mapping, general anti-patterns, and when custom CSS is allowed (needed during Phase C generation and Phase D self-audit).
- `reference/edge-cases-and-conventions.md` — edge-case handling, component naming rules, type-declaration rules, and multi-component decomposition (needed for Phases B, C, F/Section 9 scenarios).

---

## 0. Auto-Trigger — Figma URL Detection

**This is the highest-priority rule.** If the user's message contains any URL matching one of these patterns, immediately begin the full conversion workflow (Phases A → E) without requiring an explicit command:

- `figma.com/design/:fileKey/...`
- `figma.com/make/:fileKey/...`
- `figma.com/board/:fileKey/...` (FigJam — use `get_figjam` instead)
- `figma.com/proto/:fileKey/...` (prototype link — extract the underlying design)

**Behavior:**

1. Parse the `fileKey` and `nodeId` from the URL. Given `https://figma.com/design/:fileKey/:fileName?node-id=1-2`, the nodeId is `1:2`. For branch URLs (`/branch/:branchKey/`), use the branchKey as the fileKey.
2. Treat any additional text in the message as extra instructions (component name, target page, constraints, etc.).
3. If the message contains only a Figma URL with no extra text, proceed with defaults — derive the component name from the Figma frame name (see `reference/edge-cases-and-conventions.md`).
4. If the message contains a Figma URL alongside a non-conversion question (e.g., "What colors does this design use?"), answer the question using Figma MCP tools **without** running the full conversion workflow.

**Examples:**

- Just a URL → auto-triggers full conversion with defaults.
- URL + instructions (e.g., "Name the component contactCard and target record page.") → auto-triggers with those constraints applied.
- URL + question (e.g., "What spacing tokens does this use?") → answers the question only, no conversion.

---

## 1. Mandatory Toolsets (MCPs)

### Figma MCP

| Tool                 | Purpose                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_design_context` | Primary tool — returns reference code, screenshot, and metadata for a Figma node. Always pass `clientLanguages: "html,css,typescript"` and `clientFrameworks: "lwc"`. |
| `get_screenshot`     | Generates a screenshot of a Figma node for visual verification.                                                                                                       |
| `get_metadata`       | Returns metadata about a Figma node (dimensions, properties).                                                                                                         |
| `get_variable_defs`  | Extracts design token / variable definitions from a Figma file.                                                                                                       |

### Salesforce DX MCP

| Tool                                  | Purpose                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `guide_figma_to_lwc_conversion`       | **Call first** — recommended component structure and folder hierarchy for Figma-to-LWC conversion.               |
| `orchestrate_lwc_component_creation`  | Step-by-step workflow guidance for creating LWC components.                                                      |
| `guide_lwc_best_practices`            | LWC best practices and patterns.                                                                                 |
| `guide_lwc_accessibility`             | Accessibility guidelines; supports `mode: "fix"` or `"score"`, and `hasImages: true` for Vision AI analysis.     |
| `run_code_analyzer`                   | Static analysis for best practices, security, and performance. Pass absolute file paths in the `target` array.   |
| `query_code_analyzer_results`         | Filter and explain results from `run_code_analyzer` (e.g., top-N violations, by category).                       |
| `orchestrate_lwc_slds2_uplift`        | Step-by-step guidance for migrating components to SLDS 2.                                                        |
| `guide_lwc_slds2_uplift_linter_fixes` | Specific fixes for HTML/CSS SLDS 2 migration violations.                                                         |
| `deploy_metadata`                     | Deploy metadata to a Salesforce org. Requires `usernameOrAlias` and `directory` (absolute path to project root). |

---

## 2. Conversion Workflow (Phases A → E)

Execute phases **in order**. Never skip Phase D or E before delivering a component.

### Phase A + B: Design Analysis & Salesforce Mapping (parallel)

Call these three tools **in parallel** (single tool-call batch) to minimize latency:

- `get_design_context` (Figma MCP)
- `get_screenshot` (Figma MCP)
- `guide_figma_to_lwc_conversion` (Salesforce DX MCP)

**Phase A — Design Analysis (Figma MCP):**

1. **Extract Data:** Call `get_design_context` with the node ID from the provided URL, passing `clientLanguages: "html,css,typescript"` and `clientFrameworks: "lwc"`.
2. **Visual Reference:** Call `get_screenshot` on the same node for fidelity comparison.
3. **Identify Tokens:** Extract colors, spacing, and typography from the design context response.
4. **Analyze Layout:** Determine the flexbox/grid structure and identify repetitive patterns (lists, cards, tables).
5. **Fail-Fast:** If design data cannot be retrieved, stop execution and inform the user. Do not proceed.

**Phase B — Salesforce Mapping (Salesforce DX MCP):**

1. **Architectural Check:** Use the result from `guide_figma_to_lwc_conversion` (called in parallel above) for recommended component structure and SLDS mapping guidance.
2. **Base Component First:** Map Figma elements to Lightning Base Components (e.g., `lightning-card`, `lightning-badge`, `lightning-button`, `lightning-datatable`, `lightning-record-edit-form`) before writing custom HTML.
3. **SLDS Alignment:** Ensure all custom styling uses SLDS Utility Classes or SLDS Design Tokens (Styling Hooks). See [SLDS 2 Best Practices](https://www.lightningdesignsystem.com/2e1ef8501/p/528a43-best-practices).

### Phase C: Component Generation

Each LWC bundle directory (`force-app/main/default/lwc/<componentName>/`) must contain:

| File                        | Purpose                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| `src/componentName.ts`      | **Source** — all component logic authored in TypeScript. Single source of truth. |
| `componentName.js`          | **Compiled output** — generated by `yarn build`. Never hand-edit.                |
| `componentName.html`        | Template markup using SLDS blueprints.                                           |
| `componentName.css`         | Scoped styles (prefer SLDS tokens over custom values).                           |
| `componentName.js-meta.xml` | LWC metadata with `isExposed`, `targets`, and target configs.                    |

**Generation rules:**

1. **HTML:** Write semantically correct HTML using SLDS blueprints. No inline `style=` attributes. Apply SLDS utility classes directly in the HTML for all layout, spacing, alignment, typography, borders, and sizing — see `reference/slds-mapping.md`. Do not delegate these to the `.css` file.
2. **CSS:** The `.css` file must **only** contain styles with no SLDS utility class equivalent (see `reference/slds-mapping.md`). Before writing any CSS property, check the mapping table — if an SLDS class exists, use it in HTML instead. Never write `display: flex`, `flex-direction`, `align-items`, `justify-content`, `gap`, `margin`, `padding`, `text-align`, or `border` properties in CSS when an SLDS utility class covers them.
3. **TypeScript (source):** Author in `src/componentName.ts` using standard LWC patterns (`@wire`, `@api`, `@track`, `CustomEvent`) with proper TypeScript typing. This is the single source of truth.
4. **JavaScript (compiled):** Produced by `yarn build`. Never hand-write or edit `.js` files.
5. **Meta XML:** Use the template below. Choose `isExposed: true` for components placed on pages; `false` for child/utility components.

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

6. **Type Declarations:** Before importing from `@salesforce/apex/*`, `lightning/*`, or `@salesforce/schema/*`, check `types/salesforce-lwc.d.ts`. Add a `declare module` entry if not already declared — see `reference/edge-cases-and-conventions.md`.

### Phase D: Self-Audit (Anti-Pattern & Edge Case Scan)

**MANDATORY — complete before proceeding to Phase E.** Re-read every generated file (`.html`, `.css`, `.ts`) and check each item, using `reference/slds-mapping.md` for the full anti-pattern and mapping tables:

1. **Anti-Pattern Scan:** Check general anti-patterns and the CSS→SLDS mapping table. Fix any violations.
2. **Raw CSS Layout Check:** Search every `.css` file for `display: flex`, `flex-direction`, `align-items`, `justify-content`, `flex-wrap`, `flex: 1`, `flex-grow`, `flex-shrink`, `gap`, `margin`, `padding`, `text-align`, `border-top/bottom/left/right`, and the truncation pattern (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`). For each match, if an SLDS utility class exists, remove the CSS property and add the corresponding class in the `.html` file. Only keep the property if it genuinely has no SLDS equivalent.
3. **Gutters Scope & Child Padding Check:** Search all `.html` files for `slds-gutters` classes. Verify gutters are only on top-level/major layout grids (replace inner/child usage with `slds-m-*`/`slds-p-*`), and verify every direct child of a gutters parent has `slds-col` or the equivalent `slds-p-horizontal_{size}` class.
4. **Edge Case Review:** For every Figma element that did not map to a Lightning Base Component, verify you followed `reference/edge-cases-and-conventions.md`. Ensure custom CSS values use CSS custom properties with `/* custom: no SLDS equivalent */` comments.
5. **Inline Style Check:** Search all `.html` files for `style=` attributes. Replace with SLDS classes or tokens.
6. **`console.log` Check:** Search all `.ts` files for `console.log`. Remove any found.
7. **JS Hand-Edit Check:** Confirm no `.js` file was hand-written. All `.js` must come from `yarn build`.

Perform **one pass** of fixes. If an anti-pattern cannot be resolved (no SLDS token equivalent exists), ask the user whether to continue with the fix or not.

### Phase E: Validation & Deployment Gate

**MANDATORY — do not present the final component until every step below passes.** Maximum 2 retry attempts per step. If still failing after 2 retries, mark as BLOCKED and ask the user.

#### Step 1: Lint

Run `yarn lint` to catch ESLint violations. Fix any errors. Do not proceed with violations.

#### Step 2: Static Analysis

Run `run_code_analyzer` (Salesforce DX MCP) on every generated file, passing **absolute paths** in the `target` array. Then use `query_code_analyzer_results` to review violations. Fix issues and re-run — max 2 retries.

#### Step 3: Build & Deploy

Run `yarn deploy`. This compiles TypeScript (via `ts-blank-space`) and deploys to the org. Fix any errors and re-run — max 2 retries.

**Error triage:**

- **TypeScript / build errors** — Fix the source `.ts` file and re-run.
- **Metadata / XML errors** — Check `js-meta.xml` for typos or unsupported targets.
- **Org deployment errors** (auth, permissions, dependency) — Environment issues. Mark as BLOCKED and report to the user with the exact error message. Do not retry blindly.

#### Step 4: Pre-Delivery Checklist

Verify all Coding Standards below are satisfied, then confirm each gate:

- [ ] `js-meta.xml` has correct `isExposed` and `targets`
- [ ] `yarn lint` passed with no errors
- [ ] `run_code_analyzer` was executed and returned no critical errors
- [ ] `yarn deploy` completed successfully
- [ ] `types/salesforce-lwc.d.ts` updated for any new Apex or schema imports

#### Step 5: Validation Report (REQUIRED)

Include a `## Validation Report` section at the end of every response, using this format. Statuses: **PASS** (clean on first run) | **FIXED** (resolved within retry limit) | **BLOCKED** (persists after max retries — requires user input).

```
## Validation Report
| Check                          | Status                    | Notes                              |
|--------------------------------|---------------------------|-------------------------------------|
| Anti-pattern scan               | PASS / FIXED / BLOCKED    | <details>                          |
| Edge case handling              | PASS / N/A / BLOCKED      | <details>                          |
| Inline style check              | PASS / FIXED / BLOCKED    | <details>                          |
| console.log check               | PASS / FIXED              | <details>                          |
| yarn lint                       | PASS / FIXED / BLOCKED    | <output summary, retries used>     |
| run_code_analyzer               | PASS / FIXED / BLOCKED    | <output summary, retries used>     |
| yarn deploy                     | PASS / FIXED / BLOCKED    | <output summary, retries used>     |
| Pre-Delivery Checklist          | ALL PASS / PARTIAL        | <any notes>                        |
```

A response without this table is **incomplete**. If any check is BLOCKED, present the report and ask the user for guidance.

---

## 3. Coding Standards & Constraints

- **TypeScript First:** All component logic must be written in `.ts`. The `.js` file is produced by the build and must never be hand-edited.
- **SLDS Utility Classes First, Custom CSS as Last Resort:** All layout, spacing, typography, borders, truncation, and column sizing must be achieved via SLDS utility classes applied directly in the HTML — never as CSS properties. See `reference/slds-mapping.md`. Never use inline `style=` attributes.
- **Accessibility:** Adhere to ARIA guidelines per SLDS documentation. Use `guide_lwc_accessibility` for validation.
- **Performance:** Minimize DOM depth. Prefer Lightning Base Components to leverage platform caching.
- **Naming:** `camelCase` for TS/JS variables and methods. `kebab-case` for component folder names and HTML attributes.
- **No `console.log`:** Remove all `console.log` statements before delivery.
- **Event typing:** Always define TypeScript interfaces for custom event `detail` shapes (e.g., `interface MyChangeEvent extends CustomEvent { detail: { value: string } }`).
- **`NavigationMixin`:** Cast the navigate call: `(this[NavigationMixin.Navigate] as (def: object) => void)(...)`. Add its type declaration to `types/salesforce-lwc.d.ts` if not already present.

---

## 4. Further Reading

- `reference/slds-mapping.md` — full CSS→SLDS utility class mapping tables, general anti-patterns, gutters/spacing rules, and the allowed list for genuinely custom CSS.
- `reference/edge-cases-and-conventions.md` — edge-case handling (no matching base component, custom colors/spacing, complex layouts, icons, responsive breakpoints, animation, ambiguous layers), component naming rules, type-declaration conventions, and multi-component decomposition.
