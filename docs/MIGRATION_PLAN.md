# BIM2bot → BIM2REUSE migration plan

Phase 0 deliverable: an audit of the BIM2Bot Lab code base and the plan for turning it into BIM2REUSE. The recovery point is the git tag `bim2bot-baseline` (commit `ef45a55`).

## 1. What the existing application is

| Aspect | Finding |
| --- | --- |
| Framework | React 18.3.1 (UMD from unpkg), plain JSX. No TypeScript, no bundler. |
| Build | `esbuild` compiles each `.jsx` file on its own into an IIFE under `assets/js/compiled/`. Each file publishes its API on `window`. `index.html` loads the compiled files in a fixed order. The compiled files are committed, so GitHub Pages serves the repository root with no build step. Rebuilding from source reproduces the committed files byte for byte. |
| 3D | Three.js 0.160 (ESM from unpkg), with a custom `ThreeViewer` class (`viewer/viewer.jsx`). |
| IFC | web-ifc 0.0.35 (WASM), vendored under `assets/js/web-ifc-0.0.35/` and loaded through the pre-bundled `ifc-loader-bundle.js`. |
| Parser | `core/ifcloader.jsx` `parseIfcBuffer(runtime, bytes)`. It is pure (no DOM), so it runs in Node or a worker. It has a fast critical path (spatial tree and geometry) and a deferred path (property sets, materials, classifications, space boundaries, fills and voids). |
| State | React `useReducer` for viewer state (selection, hidden, isolated, colour and opacity overrides, saved views, selection sets, issues, measurements). `localStorage` holds only the theme and panel sizes. Nothing persists project data. |
| Tests | None. |
| Deployment | GitHub Pages from the branch root. No workflow. |

The baseline smoke test passed in headless Chrome: it opened the Research centre sample (696 meshes), selected an element by clicking the view, filled the inspector, and logged no console errors.

## 2. Reusable-component inventory

| File | Role | Decision |
| --- | --- | --- |
| `core/ifcloader.jsx` | web-ifc bootstrap, STEP parse, spatial tree, geometry baking, lazy property, material and classification expansion | **Keep.** Rename the robot-named `navRelations` to the general `elementRelations` (space boundaries, fills, voids). These relations will later suggest deconstruction dependencies. Phase 2 extends material and quantity extraction here. |
| `core/schema.jsx` | IFC class catalogue, colours, discipline groups, schema documentation | **Keep.** Remove `NAV_ROLES` and `navRoleOf`. |
| `core/plan.jsx` | 2D floor-plan slicing (cut and below layers, room fills, label placement) | **Keep** unchanged. It reads levels, rooms, doors and stairs from the new `core/spatial.jsx`. |
| `core/building.jsx` | S1 levels, S2 rooms, S3 door-to-room linking, S4 stairs and lifts, S5 navigation graph, routing, robot readiness | **Split.** S1, S2, door footprints and S4 move to a new robot-free `core/spatial.jsx`. S3 linking, S5, routing, readiness and the robot profile are removed. |
| `core/robotics.jsx` | ROS 2 export, route comparison, LiDAR, **zip writer** | **Remove.** The general zip writer (`makeZip`, `crc32`) moves to `core/zip.jsx`, which also gets a reader for project packages. |
| `core/navmap.jsx`, `core/simulation.jsx` | Occupancy grids, A* search, fleet simulation | **Remove** (robot-only). The grid and A* code is specific to navigation cells, so nothing in it is reused for dependency graphs. Deconstruction gets its own DAG code in Phase 6. |
| `viewer/viewer.jsx` | Scene, picking, selection, hide, isolate, colour and opacity overrides, X-ray, section box, plan cut, measure, pins, explode, screenshot, overlays | **Keep.** Retheme the colours. `setColorOverrides`, `setOpacityOverrides` and `setIsolated` drive every module's view modes. |
| `viewer/viewcube.jsx` | Navigation cube | **Keep.** |
| `viewer/overlays.jsx`, `viewer/preview.jsx` | Route, grid and robot models, start-page simulation previews | **Remove.** |
| `ui/panels.jsx` | Model tree, classes, disciplines, schema browser, views, sets, inspector, bottom panel, model checks, CSV/JSON export, modal, popovers | **Keep.** Remove the inspector's "Navigation semantics" section and the schema browser's "Navigation role". |
| `ui/planview.jsx` | 2D plan canvas: pan, zoom, picking, rooms, labels | **Keep the viewer.** Remove the grid, heatmap, zone, obstacle, route, mission, LiDAR and agent layers and the map tools. |
| `ui/icons.jsx` | Inline SVG icon set | **Keep.** Remove `Robot` and `Route`. Add the circular-construction module icons. |
| `ui/navigation.jsx`, `ui/simulate.jsx`, `ui/experiments.jsx` | Navigate and Simulate workspaces, robot presets, door schedules, LiDAR, batch experiments | **Remove.** |
| `app.jsx` | Shell, start page, viewer HUD, dock, layers popover, section box, context menu, keyboard shortcuts, panel resizing | **Refactor.** Keep the viewer HUD, dock, layers, section box, context menu, shortcuts and resizing. Replace the three-workspace switch with the BIM2REUSE module shell and remove all robot state. |
| `assets/css/main.css` | Design tokens (light and dark) and components | **Keep and retheme** to the BIM2REUSE greens. Remove the Navigate, Simulate, occupancy and intelligence styles. |
| `assets/images/home/*`, robot README images, `og-image.jpg`, `bim2bot-*` logos | Robot media | **Remove or replace** with BIM2REUSE logos, icons and screenshots. |
| Sample IFCs | Office blocks (MIT, BIM Whale), Research centre (generated here) | **Keep.** Rename the "BIM2Bot Lab" strings in the Research centre header and project name. GlobalIds are unchanged. |

## 3. Robot-specific functionality removed in Phase 1

- **UI:** the Navigate and Simulate workspaces, robot profiles and presets, start, goal, obstacle, zone, inspect and mission map tools, route cards, route comparison, ROS 2 export, the simulation scenario, playback, results and experiments, door schedules, LiDAR, the start-page robot previews, the building-intelligence robot-readiness report, the inspector's navigation semantics, and "Block door for routing".
- **Code:** `navmap`, `simulation`, `robotics` (except the zip writer), `overlays`, `preview`, `navigation`, `simulate`, `experiments`, the robot parts of `building`, and `NAV_ROLES`.
- **Assets:** simulation GIFs and preview trajectories, robot README images, BIM2Bot logos, and the og-image.

## 4. Architecture decisions

1. **No framework change.** The brief allows React, TypeScript and Vite only "if the project already uses" them. It uses React with a no-bundler esbuild pipeline that GitHub Pages serves as-is, so that pipeline stays. New modules follow the same pattern: DOM-free engines in `core/`, React views in `ui/`, one compiled IIFE each, and the load order set in `index.html`.
2. **One persistent viewer.** The `ThreeViewer` instance is created once and never unmounted. Modules that need the model render around it (left, right and bottom slots). Page-style modules (Overview, Settings, Reports) cover it without destroying it, so switching modules never re-parses or re-tessellates the IFC.
3. **Element registry.** `core/registry.jsx` assigns every element a stable key (`<modelKey>:<GlobalId>`) alongside its express ID. Persisted data refers to GlobalIds and is remapped to express IDs when a project is reopened.
4. **Local project store.** IndexedDB holds project records and the IFC bytes (keyed by SHA-256), so a reopened project re-parses its own copy of the model. Projects export to and import from a versioned `.bim2reuse.zip` (`project.json` plus `models/*.ifc`).
5. **Provenance-first data model** (Phase 2 onward). Every quantity is `{ value, unit, source, method, timestamp, verification, reference }`. Missing values stay missing.
6. **Tests.** `node:test` unit tests load the compiled `core/` scripts and run them against the real web-ifc 0.0.35 Node build and the bundled sample IFCs. Puppeteer-core drives the installed Chrome for browser integration tests. Neither needs a runtime dependency on the site.

## 5. Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Audit, inventory, plan, recovery point | Done |
| 1 | Rebrand, remove robot features, module shell, Overview, Settings, project save/open/autosave/export, viewer preserved, tests | Done |
| 2 | Material and quantity extraction (layer, constituent and profile sets; type-level materials; units), inventory table, material view mode, CSV/JSON | Done |
| 3 | Passports, reuse screening, assessment view mode, passport exports | Done |
| 4 | Material bank, destination requirements, compatibility, cutting-stock and allocation optimisation (HiGHS, MIT; GLPK.js was rejected because it is GPL) | Done |
| 5 | Carbon and cost scenarios | Done |
| 6 | Deconstruction dependency graph, sequencing, timeline | Done |
| 7 | Refinement, reports, workers, documentation, end-to-end validation | Done |

Modules that are not implemented yet show an explicit "Planned" status page. They never show placeholder numbers.

## 6. Risks

- **web-ifc 0.0.35** is old. It is kept because the viewer, the WASM and the loader bundle are pinned together. An upgrade is a separate, tested change.
- **Geometry-derived volumes** come from tessellated meshes. They are valid only for closed, manifold meshes, and Phase 2 must check closure before reporting a volume.
- **IndexedDB quotas** limit how many IFC files can be stored locally. The Settings page shows the current storage estimate.

## 7. Phase 1 outcome

- **Removed:** every module in section 3, more than 5,500 lines of robot code, and the robot media. The served files are checked for robot wording and BIM2Bot branding by `tests/unit/build.test.mjs` and by the browser test.
- **Kept unchanged in behaviour:** the IFC parser, the viewer (only its colours changed), the navigation cube, the model tree, the schema browser, the inspector (minus its navigation section), search, the section box, the plan cut, measuring, issues, saved views, selection sets, model checks and floor plans.
- **Added:** `core/spatial.jsx`, `core/registry.jsx`, `core/project.jsx`, `core/modelstats.jsx`, `core/zip.jsx` (reader added to the existing writer), and `ui/workspace.jsx`, `ui/modules.jsx`, `ui/projectui.jsx`.
- **Fixed on the way:** element exports now read each element's materials and property sets before writing (they used to be empty for elements nobody had inspected).
- **Known gap carried into phase 2:** the inspector labels quantities in SI units without converting from the project units. Phase 2 reads units properly.
- **Checks:** 21 unit tests and 24 browser checks, all passing.

## 8. Phase 4 outcome

- **Material Bank** (`core/bank.jsx`, `ui/bankui.jsx`): records from this model's passports (by reuse outcome, edited passport or all components, filtered by type), CSV and JSON inventories with a row-by-row rejection report, and the banks of other saved projects. A component reserved or allocated in another project is imported as Unavailable, because reservations belong to the project that made them. Records are edited in place (availability, verification, condition, grade, dimensions, logistics); re-adding from the model never overwrites an edited record. The Bank colour mode shows availability in 3D.
- **Reuse Matching** (`core/matching.jsx`, `ui/matchingui.jsx`): requirements entered by hand, imported from CSV, or read from a destination IFC model that is parsed, grouped and closed again without replacing the source model. The MILP is built on the main thread and solved by HiGHS 1.16 (vendored unchanged in `assets/vendor/highs/`, MIT) in a Web Worker (`assets/js/workers/optimizer.js`); Cancel terminates the worker, and a hard timeout stops a solver that does not return. Every solution is re-checked (one stock per piece, capacity per stock, whole reuse used once) before it is shown. Results: fulfilled and unmet demand with an explanation per requirement, cutting diagrams, allocations, a per-requirement compatibility list, and the Match colour mode. Allocated units can be reserved in the bank (a partly used record is split). The last run is saved with a signature of its inputs and is flagged out of date when the bank, requirements or parameters change.
- **Viewer:** the colour-mode switch keeps Normal, Category, the module's own mode and the active mode as buttons and moves the rest to a "More" list, so seven modes no longer overflow a narrow viewer.
- **Checks:** 51 unit tests (including brute-force optimality, reservation splitting, run signatures and a byte-for-byte check of the vendored solver) and 55 browser checks, all passing.

## 9. Phases 5–7 outcome

- **Carbon & Cost** (`core/carbon.jsx`, `ui/carbonui.jsx`): the destination demand of the last matching run built new (A1–A3, A4) and with the allocated components (reuse processing, transport of whole stock from its source, new material for unmet pieces). Factors are user-entered or CSV-imported with their source; a missing factor leaves a listed gap and no saving is stated until both scenarios are complete. Module D (offcut recycling) is reported apart. The stage chart uses the validated categorical slots 1–3 in both themes.
- **Deconstruction** (`core/deconstruction.jsx`, `ui/deconstructionui.jsx`): one task per physical element; dependencies suggested from fill/void relations and stacked geometry, confirmed or rejected by a person, or added by picking; stages by longest-path layering, Tarjan cycles, transitive predecessors and successors, critical path when every task has a duration; review warnings, stage playback, timeline, CSV/JSON/DOT exports.
- **Reports** (`core/reports.jsx`, `ui/reportsui.jsx`): one report with project identity, source hash, and method, results, missing information and limitations per module, printable to PDF; status cards for every module on the Overview.
- **Checks:** 61 unit tests and 70 browser checks, all passing.

