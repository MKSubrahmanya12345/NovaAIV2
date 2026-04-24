# NovaAI AI Architecture Notes

## Goal
Build a future-ready AI pipeline for vibecoding hardware projects where ideation outputs are persisted, reused by downstream agents, and converted into deterministic simulation artifacts.

## Current Data Flow
1. Ideation AI extracts structured hardware context.
2. Structured context is persisted into `project.meta` in MongoDB.
3. Components AI consumes `project.meta` + `ideaState` + `componentsState`.
4. Wokwi asset generation consumes the same context and emits:
- `sketch.ino`
- `diagram.json`

## Persisted Hardware Context (`project.meta`)
- `board`
- `powerSource`
- `language`
- `componentCount`
- `detectedAt`
- `stage` (existing workflow state)

## Persisted Generation Contract (`project.generationProfile`)
This is a simulator-ready contract derived from ideation metadata and persisted on every ideation update.

Fields:
- `board`
- `boardPartType`
- `powerSource`
- `language`
- `firmwareTarget`
- `simulationTarget`
- `runtimeHints`
- `profileVersion`
- `updatedAt`

Current target defaults:
- `firmwareTarget`: `arduino-cpp-sketch-ino` (or `micropython-with-sketch-fallback`)
- `simulationTarget`: `wokwi-json-ino`

## Deterministic Board Profile System
A board profile map is now used to reduce model variance and lock outputs to a known controller family.

Current board profiles:
- `arduino-uno` -> `wokwi-arduino-uno`
- `arduino-nano` -> `wokwi-arduino-nano`
- `esp32-devkit-v1` -> `wokwi-esp32-devkit-v1`
- `raspberry-pi-pico` -> `wokwi-pi-pico`
- `attiny85` -> `wokwi-attiny85`

Behavior:
- If a board is detected in `project.meta.board`, output generation is forced to align with that board profile.
- If no board is detected, defaults to `arduino-uno` profile.

## Post-Generation Validation + Auto-Repair
Generated assets now pass through validation and deterministic repair.

Validation checks:
- `sketch.ino` contains both `setup()` and `loop()`.
- `diagram.json` has non-empty `parts`.
- `diagram.json` has non-empty `connections`.
- Connection endpoints reference known part IDs.
- Selected board type exists in parts when board meta is present.

Auto-repair actions:
- Add or replace board part to match locked board profile.
- Auto-generate fallback wiring if connections are missing.
- Replace invalid sketch with deterministic fallback template.
- Add repair/validation notes into output metadata.

## API Accessibility Contract
You can now access generation-ready context directly from project and components flows.

Returned fields include `generationProfile` in:
- Ideation create response
- Ideation chat response
- Components init response
- Components chat response
- Components generate-files response
- Legacy project create/chat responses (kept aligned)

## Why This Matters for Your Own Simulator
This creates a stable handoff contract:
- Upstream AI can vary, but outputs are normalized and validated.
- Simulator can trust `project.meta` and generated files as deterministic inputs.
- Future simulation backend can run static checks before execution without relying on raw LLM prose.

## Frontend Visualization Layer
For project debugging and confidence checks, ideation/components UI now includes interactive data visualization controls.

Added UI controls:
- Ideation chat: `View Captured Info` with tab buttons (`Overview`, `Hardware`, `Simulator`)
- Components chat: `Visualize Profile` toggle for generation profile insight cards

Added visual metrics:
- Readiness ring chart (0-100) based on board detection + ideation status + generation profile completeness
- Signal bars for requirements count, component count, unknowns count
- Profile bars for board lock / firmware target / simulation target completeness
- Simulator hint card exposing `board`, `boardPartType`, `firmwareTarget`, `simulationTarget`, and runtime hint count

Purpose:
- Fast human inspection before generating files.
- Quickly spot missing context that would reduce simulation determinism.
- Make simulator handoff status visible without reading raw JSON.

## AVR8JS Integration Notes (Format Contract)
Yes, simulation with `avr8js` needs deterministic formats and board constraints.

Current practical contract for this project:
1. Source side
- `sketch.ino` must contain valid Arduino entry points: `setup()` and `loop()`.
- Language target for AVR8JS path should remain Arduino C/C++ (not pure MicroPython runtime).

2. Hardware side
- `diagram.json` must include a supported AVR board part (`wokwi-arduino-uno`, `wokwi-arduino-nano`, `wokwi-attiny85`, etc.).
- `diagram.json.connections` must be non-empty and reference valid part IDs.
- Pin mapping should be explicit and consistent with selected AVR board profile.

3. Contract side
- `project.generationProfile` should be treated as compile/sim planner input:
	- `board`
	- `boardPartType`
	- `firmwareTarget`
	- `simulationTarget`
	- `runtimeHints`

4. Compile bridge needed before AVR8JS execution
- AVR8JS executes machine-level AVR behavior; it does not compile `.ino` by itself.
- Pipeline must compile sketch to AVR artifact (ELF/HEX) first, then load into AVR8JS runtime.
- For non-AVR boards (ex: ESP32), use a different simulator path.

Implication:
- Existing deterministic board lock + validation is the correct foundation for introducing an AVR8JS adapter service next.

## Components Generation Robustness (Parse Recovery)
To reduce generic fallback outputs in Components-generated files, generation now tries a recovery path before hard fallback:

- First attempt: strict JSON parse (`sketchIno`, `diagramJson`, `notes`).
- If strict parse fails: recover from markdown/plain-text by extracting:
	- C++ code blocks with `setup()` + `loop()`
	- JSON objects that contain `parts` + `connections`
- Only if recovery also fails: use deterministic fallback template.

Result:
- Fewer false fallback hits when model returns valid content in non-JSON formatting.
- Existing deterministic board lock + validation still run after recovery.

## Components Chat UI v2 (Control Deck Layout)
Components Chat was redesigned into a new visual structure (not incremental styling over the old chat shell):

- Left Control Deck:
	- Generate Files
	- Regenerate Strict JSON
	- Contract Insight toggle
	- Profile completeness bars and readiness badge
- Right Conversation + Artifact Board:
	- Chat stream with builder-style message cards
	- Quick prompt chips for common asks
	- Artifact tabs (`Notes`, `Sketch`, `Diagram`) with last generation preview

Fallback visibility:
- If generation notes include fallback template usage, UI now flags it and recommends strict regeneration.

## Recommended Next Build Steps
1. Add JSON schema files for generated artifacts.
- `schemas/diagram.schema.json`
- `schemas/generation-profile.schema.json`

2. Build a simulation planner service.
- Input: project + generationProfile + generated assets
- Output: execution plan with compile strategy, runtime checks, expected serial assertions

3. Add board capability registry.
- Define pin constraints, voltage assumptions, and unsupported peripheral combinations per board.
- Use this before compile/sim to fail early with actionable guidance.

4. Add regression test snapshots.
- Store fixture projects and expected generated artifacts.
- Run deterministic generation tests in CI to prevent drift.

## Notes on Micropython
Current pipeline emits `sketch.ino` for simulation handoff.
If ideation language is `micropython`, generation currently annotates this and still emits C++ fallback to preserve compatibility until a dedicated Micropython simulation path is added.

## Implementation Log
Date: 2026-04-24

Completed in this iteration:
- Added deterministic board profile lock map to generation pipeline.
- Added post-generation validation checks for sketch + diagram integrity.
- Added auto-repair logic for missing board part, missing connections, and invalid sketch entrypoints.
- Added `buildGenerationProfileFromMeta()` helper in AI service.
- Added persistent `generationProfile` object to Project schema.
- Wired ideation controllers to recompute and save `generationProfile` whenever ideation updates metadata.
- Wired legacy project controller flow to keep `generationProfile` aligned.
- Exposed `generationProfile` in components endpoints for downstream consumers.

Files changed in this iteration:
- `backend/src/models/project.model.js`
- `backend/src/services/ai.services.js`
- `backend/src/controllers/ideation.controller.js`
- `backend/src/controllers/project.controller.js`
- `backend/src/controllers/components.controller.js`
- `documentation.md`

## Implementation Log (Frontend Visualization Update)
Date: 2026-04-24

Completed in this iteration:
- Added ideation visualization tabs for overview, hardware, and simulator readiness.
- Added readiness ring chart and signal bar charts in ideation panel.
- Added components profile visualization toggle with contract-focused graph cards.
- Wired ideation/components chat state updates to include `generationProfile` in frontend state.
- Documented AVR8JS-required format constraints and compile bridge requirements.

Files changed in this iteration:
- `frontend/src/components/ProjectChat.jsx`
- `frontend/src/components/ComponentsChat.jsx`
- `documentation.md`

## Implementation Log (Components Reliability + UI Redesign)
Date: 2026-04-24

Completed in this iteration:
- Added recovery parser for generated assets when AI returns markdown/plain text instead of strict JSON.
- Kept deterministic board lock and post-parse validation on recovered payloads.
- Redesigned Components Chat into a new control-deck UI with separate artifact board.
- Added strict regeneration action to reduce fallback-template outcomes.

Files changed in this iteration:
- `backend/src/services/ai.services.js`
- `frontend/src/components/ComponentsChat.jsx`
- `documentation.md`
