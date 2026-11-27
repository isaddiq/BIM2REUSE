<div align="center">

<a href="https://isaddiq.github.io/BIM2Reuse/">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logos/bim2reuse-wordmark-dark.svg" />
    <img src="assets/logos/bim2reuse-wordmark-light.svg" alt="BIM2REUSE: From BIM to Circular Construction" width="364" />
  </picture>
</a>

**Turn buildings, with or without a BIM model, into traceable material reuse decisions, in the browser.**

[![Open the app](https://img.shields.io/badge/Open%20the%20app-isaddiq.github.io%2FBIM2Reuse-16804a?style=for-the-badge&logo=githubpages&logoColor=white)](https://isaddiq.github.io/BIM2Reuse/)

[![License: MIT](https://img.shields.io/badge/License-MIT-07543d?style=flat-square)](LICENSE)
[![IFC](https://img.shields.io/badge/IFC-2x3%20%C2%B7%204%20%C2%B7%204.3-e0560f?style=flat-square)](https://technical.buildingsmart.org/standards/ifc/)
[![No upload](https://img.shields.io/badge/Files-stay%20on%20your%20device-555?style=flat-square)](#privacy)

[Workflow](#workflow) · [Buildings without BIM](#existing-buildings-without-bim) · [Modules](#modules) · [Try the samples](#try-the-samples) · [Your own data](#your-own-data) · [Principles](#principles-and-limitations) · [Citation](#citation)

<br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/images/readme/overview-dark.webp" />
  <img src="assets/images/readme/overview.webp" alt="BIM2REUSE Overview: model counts and a status card for every circular construction module" width="100%" />
</picture>

</div>

**BIM2REUSE** is a free, open-source web application for circular construction. Open the IFC model of an existing building, or survey a building that has no model, and BIM2REUSE builds the information that reuse decisions need:

- what the building is made of;
- which components could be reused;
- how they come out;
- where they could go in a new building;
- what that saves in carbon and cost.

Every record stays linked to the component it describes: the IFC GlobalId of a model element, or the component ID of a surveyed one.

<a id="privacy"></a>🔒 **Private by design.** There is no server. IFC files are read on your device with web-ifc (WebAssembly), and projects, documents and photographs are saved in your browser. Nothing you open or enter is uploaded.

## Workflow

A project starts in one of two ways:

- **Workflow 1: Import IFC model.** Open an IFC2x3, IFC4 or IFC4.3 file.
- **Workflow 2: Existing building without BIM.** Record the building in **Building Survey** from site visits, drawings and photographs.

Both lead to the same circular modules:

| Step | Module | Result |
| --- | --- | --- |
| 1. Explore | **IFC Viewer** or **Building Survey** | The model in 3D and on floor plans, or a surveyed building with a simplified 3D model |
| 2. Inventory | **Materials** | Materials, volumes and masses of every element, with the source of each value |
| 3. Document | **Passports** | A material passport for each component |
| 4. Assess | **Assessment** | A screening of each component's reuse pathway |
| 5. Plan | **Deconstruction** | Removal stages from a dependency graph of tasks |
| 6. Bank | **Material Bank** | A catalogue of recoverable components from one or more buildings |
| 7. Match | **Reuse Matching** | An optimal allocation of banked components to a new building, with cutting plans |
| 8. Compare | **Carbon & Cost** | The new building's demand built new, compared with it built from reused components |
| 9. Report | **Reports** | One technical report, printable to PDF |

The **Overview** shows the model at a glance, how ready its data is for each module, and the status of every module for the open project.

## Existing buildings without BIM

<img src="assets/images/readme/survey.webp" alt="Building Survey: building information, the simplified 3D model coloured by survey information, the component editor and the list of surveyed components" width="100%" />

Choose **Start a building survey** on the start page, then enter the building name, address, construction year and number of floors. **Building Survey** then has four parts:

- **Building, floors and documents** (left): building information, floors with their elevation and height, and the files you collect, such as floor plans, CAD drawings, PDFs, photographs and inventories.
- **3D model** (centre): pick a component type and click on the active floor:
  - columns, doors and windows take one click;
  - walls and beams take two (Shift keeps them straight);
  - slabs and roofs take two opposite corners.

  Doors and windows snap into the nearest wall. Each component is drawn as a box from its dimensions and position.
- **Component** (right): dimensions, cross-section, material, grade and density, condition, connections and reuse potential, plus photographs and inspection documents.
- **Surveyed components** (bottom): every component with what is still missing.

**Tracing floor plans.** Upload a plan image (PNG, JPG, WebP, GIF or SVG) to a floor, and **Calibrate** it by clicking two points of a known distance. Components placed on it are recorded as *taken from drawings*. PDF and CAD files are kept as documents; export a plan page as an image to trace it.

**Importing an inventory.** Import a CSV or JSON list of components (one row each, or a quantity column). Components without coordinates are laid out in rows on their floor and marked as placed automatically. The [example inventory](assets/samples/survey-example-inventory.csv) shows every column.

**Where each value comes from.** Every value records its provenance: *manual*, *taken from drawings*, *imported*, *estimated* or *inspection verified*. Dimensions you have not measured keep the component type's placeholder and are marked estimated. Missing information is flagged in red, never filled in. The **Survey** colour mode shows which components are missing information, carry estimates, or are fully verified.

**Identity.** Each surveyed component gets a persistent component ID (`B2R-…`). IFC GlobalIds are kept for real IFC elements only.

**Using the other modules.** Materials, Passports, Assessment, Deconstruction, Material Bank, Reuse Matching, Carbon & Cost and Reports work on surveyed components as they do on IFC elements:

- Photographs and inspection documents attached to a component become evidence in its passport.
- Approval for reuse still needs a completed inspection, verified technical status and an inspection record, test or certificate.
- Doors and windows recorded in a wall give the same deconstruction suggestions as IFC fill relations.

**Adding a model later.** Import an IFC file into a survey project and the survey stays, with its components shown next to the IFC elements. Link a surveyed component to the IFC element it is (pick it in 3D or paste its GlobalId). Its survey values, passport, evidence, deconstruction task and bank records then move to that element, so nothing is lost.

> The 3D model is a simplified reconstruction from the dimensions and positions you enter. It is not a measured survey: BIM2REUSE does not recognise elements in images and does not reconstruct buildings from scans or photographs.

## Modules

### IFC Viewer

<img src="assets/images/readme/viewer.webp" alt="IFC Viewer with the model coloured by element category, the model tree, the category legend and the inspector" width="100%" />

- **Views:** 3D, floor plans, or both side by side.
- **Browse:** model tree, IFC classes and disciplines, an IFC schema browser, saved views and selection sets.
- **Inspect** each element: property sets, quantities, materials, type, classification and relationships.
- **Tools:** search, hide, isolate, X-ray, section box, plan cut, measuring and issue pins.
- **Colour modes** show each module's data on the model (material, passport, reuse outcome, removal stage, bank availability, matching result, survey information), with legends that isolate on click.

### Material inventory

<img src="assets/images/readme/materials.webp" alt="Material inventory table with the provenance of each quantity and the model coloured by material category" width="100%" />

- **Materials** are read per element and per type, with layered walls, composite windows and profiled beams split into their materials.
- **Quantities** come from the IFC file and are checked against the geometry.
- **Mass** = volume × density. The density is taken from the file, entered by you, or from a reference dataset you choose to apply.
- **Data-gap filters** show exactly which values are missing.
- **Export** as CSV or JSON, with the source of every value.

### Passports and reuse assessment

<img src="assets/images/readme/passport.webp" alt="Passport editor beside the isolated component in 3D" width="100%" />

- **Passports** cover identification, geometry, materials, condition, connections, reuse, sustainability and evidence (files you attach).
- **Pre-filled from the model:** fields are filled from the IFC data, including survey data the model carries. You complete or correct the rest.
- **Approval** for a specific use requires recorded evidence, a completed inspection and verification.
- **The assessment** combines mandatory checks with a weighted screening index. A failed check always wins over a high score.
- **Outcomes:** potential direct reuse, refurbishment, recycling evaluation, inspection required, insufficient information, or unsuitable.

<img src="assets/images/readme/assessment.webp" alt="Reuse assessment with criterion weights, outcomes and the reasoning for one component" width="100%" />

### Deconstruction planner

<img src="assets/images/readme/deconstruction.webp" alt="Deconstruction planner with suggested dependencies, removal stages in 3D, the stage timeline and one task with its predecessors" width="100%" />

- **Tasks:** one removal task per element.
- **Suggested dependencies:** doors and windows before their host wall, and supported elements before their support. A suggestion counts only after you confirm it, and you can add your own.
- **Analysis:** removal stages, dependency cycles, and the critical path once durations are entered.
- **Review warnings,** for example for structural elements nobody has reviewed yet.
- **Outputs:** stage playback in 3D, a timeline, and CSV, JSON and Graphviz exports.

### Material bank and reuse matching

<img src="assets/images/readme/matching.webp" alt="Reuse matching with last-run figures, parameters, cutting diagrams and the explanation for one stock piece" width="100%" />

- **The bank** collects components from the open model, from CSV or JSON inventories, and from other saved projects. Each record has an availability state and editable data. Reservations stay local to the project.
- **Requirements** of the new building are typed in, imported from CSV, or read from a destination IFC model.
- **Matching** checks every component against every requirement: type, material, grade, section, length, size, condition, availability and verification. Missing data is never treated as compatible.
- **The optimiser** (HiGHS, a mixed-integer solver running in the background) fulfils as much demand as possible. It then minimises cutting waste, cost or transport, allowing for saw kerf and end trimming. The solver status is reported as returned.
- **Results:**
  - fulfilled and unmet demand, with a reason for each unmet requirement;
  - cutting diagrams;
  - allocations, and reservation of the components used;
  - a report.

<img src="assets/images/readme/bank.webp" alt="Material bank catalogue with availability states and an editable record" width="100%" />

### Carbon and cost

<img src="assets/images/readme/carbon.webp" alt="Carbon and cost comparison of building new and building with reused components" width="100%" />

- **Two scenarios:**
  - **Conventional:** the new building's demand produced new (A1–A3) and transported to site (A4).
  - **With reuse:** matched components reprocessed and transported from their source, with only the unmet pieces produced new.
- **Your factors:** every carbon and cost factor is entered or imported by you, with its source. Missing inputs are listed, and no saving is stated until both scenarios are complete.
- **Module D:** recycling of cutting offcuts is reported separately, outside the totals.

### Reports

<img src="assets/images/readme/reports.webp" alt="Reports page with the section choice and the combined report preview" width="100%" />

The report gives the project identity and the source model with its file hash. For each module it states the method, results, missing information and limitations. Print it to PDF from the browser or save it as HTML.

The **project package** (`.bim2reuse.zip`) holds every record, the source IFC file, survey documents and attached evidence, so a project can be reopened on another computer.

## Try the samples

### Workflow 2: the demo survey

<img src="assets/images/readme/demo-survey.webp" alt="The demo survey of a former post office: 52 surveyed components on two floors with the calibrated floor plan under them" width="100%" />

Choose **Open the demo survey** on the start page (or in Building Survey). The demo is the survey of a fictional building, the *Former Post Office*: two storeys, built in 1968, steel frame. It is a complete project with no IFC model:

- building information, two floors and two calibrated tracing plans;
- 52 components (columns, beams, slabs, the roof deck, facade walls, a partition, doors and windows in their walls, a stair, a balustrade and radiators), each with dimensions, material, grade, density or mass, condition, connections and reuse potential, and the provenance of every value;
- documents: a structural section, a condition survey report and a hazardous materials screening;
- passports in progress, and two steel beams approved for reuse with a material test certificate as evidence;
- confirmed deconstruction dependencies (doors and windows before their walls), with durations and review flags on the frame.

Download it as a package: [demo-survey.bim2reuse.zip](assets/samples/demo-survey.bim2reuse.zip).

> The building, the reports and the test certificate are fictional, made to demonstrate the workflow.

### Workflow 1: the sample model

Choose **Try a sample model** on the start page. The sample is the *Research centre*, a four-storey building generated for BIM2REUSE (IFC4, MIT licence). It contains every kind of data the modules use:

- material layer, constituent and profile sets, with densities;
- base quantities for every element;
- 40 steel IPE 300 floor beams, doors and windows in their wall openings, a precast stair core, furniture, glazing and PV panels;
- a project classification and manufacturer data;
- an **illustrative reuse survey** on each component: condition, inspection, connections, grade and application.

Example files for the other modules come with it. Load each one with **Load the example** (or **Load example factors**) in its module, or download it as a template:

| File | Used in | Contents |
| --- | --- | --- |
| [research-centre-bank.csv](assets/samples/research-centre-bank.csv) | Material Bank | Stock recovered from a second building: glulam and steel beams, doors |
| [research-centre-requirements.csv](assets/samples/research-centre-requirements.csv) | Reuse Matching | Requirements of a new pavilion: steel beams of three lengths, a glulam ridge beam, doors, glazed panels and steel columns |
| [research-centre-carbon-factors.csv](assets/samples/research-centre-carbon-factors.csv) | Carbon & Cost | Illustrative carbon and cost factors for steel, timber, glass and transport |

**Suggested path:**

1. Open the sample and look at **Materials**, **Passports** and **Assessment**.
2. In **Deconstruction**, suggest the door and window dependencies and confirm them.
3. In **Material Bank**, add the components with a reuse outcome, load the example stock, and set a transport distance.
4. In **Reuse Matching**, load the example requirements and run the optimisation.
5. In **Carbon & Cost**, load the example factors.
6. Open **Reports**.

> The survey data and the example factors are invented to demonstrate the workflow. They are labelled as such in the files and are not product or EPD data.

## Your own data

**IFC models.** Any IFC2x3, IFC4 or IFC4.3 file opens. The more of the following a model carries, the more BIM2REUSE fills in for you:

| Data in the model | Used for |
| --- | --- |
| `IfcRelAssociatesMaterial`, including layer, constituent and profile sets | Inventory, passports, matching |
| `IfcElementQuantity` (base quantities) | Volumes, areas and lengths |
| `MassDensity` on materials (`Pset_MaterialCommon`) | Mass |
| `IfcRelFillsElement` and `IfcRelVoidsElement` | Deconstruction dependencies |
| `IfcRelAssociatesClassification` | Data readiness, reports |
| `Pset_ManufacturerTypeInformation` | Passport identification |
| Survey properties named `ConditionRating`, `VisualInspection`, `InspectionDate`, `ConnectionType`, `Contamination`, `Grade`, `GradeVerified`, `CandidateApplication`, `ApplicationFit`, `VerificationStatus`, `TechnicalDocumentation` (in any property set) | Passports and assessment |

**Building surveys.** A survey inventory is a CSV or JSON file with one row per component. It uses columns such as `type`, `name`, `floor`, `x`, `y`, `length`, `width`, `height`, `material`, `grade`, `condition`, `connection_type`, `reuse_potential` and `provenance`; the [example inventory](assets/samples/survey-example-inventory.csv) lists them all. Survey documents and photographs can be any file type.

**CSV files.** The bank, requirement and factor imports accept comma- or semicolon-separated files with a header row. Lengths are in metres and masses in kilograms. Rows that fail validation are listed with the reason; nothing is guessed. The example files above show every column.

## Principles and limitations

- **No invented data.** Missing values stay missing. Each value records where it came from: IFC, geometry, drawings, an imported file, a manual entry, an estimate or a verified inspection.
- **Suggestions are not decisions.** Dependencies, densities and compatibility rest on data a person confirms or supplies.
- **Honest optimisation.** The solver status is reported as returned, and every solution is checked against the rules before it is shown.
- **Stated limits:**
  - The reuse index is a screening aid, not a certified structural or regulatory assessment.
  - The carbon comparison is not a full life-cycle assessment to EN 15978.
  - The deconstruction plan is preliminary. Structural removal, temporary works and site safety need qualified professional review.
  - Compatibility uses only the criteria supplied; structural reuse needs professional verification.
  - The 3D model of a surveyed building is a simplified manual reconstruction, not a measured survey.

The method draws on IFC (ISO 16739), EN 15804, ISO 14040/14044, ISO 22057 and ISO 59020. BIM2REUSE does not claim compliance with these standards.

## Run your own copy

BIM2REUSE is a static site. Serve the repository folder over HTTP; `file://` URLs block WebAssembly and workers.

```bash
git clone https://github.com/isaddiq/BIM2Reuse.git
cd BIM2Reuse
npx serve .
```

Built with React 18, Three.js, web-ifc 0.0.35 and HiGHS 1.16 (vendored in `assets/vendor/highs/`). Browser storage uses IndexedDB.

## Citation

If you use BIM2REUSE in research, please cite it:

```bibtex
@software{bim2reuse,
  author = {Saddiq},
  title  = {{BIM2REUSE}: From BIM to Circular Construction},
  year   = {2026},
  url    = {https://github.com/isaddiq/BIM2Reuse}
}
```

The workflow builds on the D5 digital circular workflow: [Five digital steps towards matchmaking for material reuse in construction (npj Materials Sustainability, 2024)](https://www.nature.com/articles/s44296-024-00034-8).

## Licence

The code, the Research centre sample and the demo survey are released under the [MIT licence](LICENSE).

- **HiGHS** (`assets/vendor/highs/`) is MIT licensed.
- **Icons** in `assets/icons/flaticon/` are credited in their `ATTRIBUTION.md`.

Made by **Saddiq** · [isaddiq.github.io](https://isaddiq.github.io/)
