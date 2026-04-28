# NovaAI Simulator: Project Status & Architecture

## 1. Tech Stack Overview
- **Monorepo Management**: npm workspaces (Root, `frontend`, `backend`)
- **Frontend Core**: React 18, Vite, TypeScript
- **Styling & UI**: Tailwind CSS, Lucide React (Icons)
- **Simulation Engine**: `avr8js` (Executes compiled ATmega328P hex files in-browser)
- **Visuals & Hardware**: `@wokwi/elements` (Web components for Arduino, LEDs, etc.)
- **Canvas Interaction**: `react-zoom-pan-pinch` (Pan/Zoom API)
- **Code & JSON Editing**: `@monaco-editor/react` (VS Code's editor engine)
- **Backend / Compiler Proxy**: Node.js, Express.js, `node-fetch`

## 2. Methodology & Construction Flow
We followed a modular, "bottom-up" approach to build a stable foundation before adding dynamic features:

1. **Infrastructure Setup**: We migrated from an unstable Bun setup to a reliable Express.js + Node.js backend. The backend acts simply as a secure proxy to Wokwi's Hexi compiler API, bypassing browser CORS restrictions.
2. **Simulation Foundation**: Embedded Monaco for code editing and `avr8js` for the simulation engine. We built a custom, browser-safe Intel HEX parser to load binary data into the virtual CPU without relying on Node.js buffers.
3. **Dynamic State Management**: Transitioned from hardcoded React elements to a JSON-driven architecture (`diagram.json`). The entire visual state (parts, positions, connections) is now derived from this JSON and persisted to `localStorage`.
4. **Visual & Interaction Engine**:
   - Integrated `react-zoom-pan-pinch` for a scalable workspace.
   - Built a precise drag-and-drop system that translates screen coordinates to scaled canvas coordinates.
   - Extracted exact pixel coordinates from `@wokwi/elements` source code to build a custom, pixel-perfect **SVG Wiring Engine** using Bezier curves.
5. **Tooling & UX**: Added floating tools including a Component Library for drag-and-drop, a two-way syncing JSON editor, and a live timestamped Serial Monitor tapping into the `avr8js` USART peripheral.

## 3. Functionalities / Feature Status

### ✅ Started & Completed
- **Compiler Proxy**: Node.js backend successfully accepts sketch code, fetches Hex from Wokwi, and returns it.
- **AVR Execution Engine**: `avr8js` runs the compiled C++ at 16MHz inside a `requestAnimationFrame` loop.
- **Code Editor**: Monaco is fully integrated for C++ sketch writing.
- **Dynamic Render System**: Frontend dynamically renders components from state instead of static JSX.
- **Drag & Drop**: Scale-aware drag positioning with `localStorage` persistence.
- **Component Library**: Searchable panel to drop new parts onto the canvas.
- **SVG Wiring Engine**: Live bezier curve rendering that follows parts seamlessly as they are dragged.
- **Interactive Wiring**: Click-to-wire mechanism mapping component pins to connections.
- **Diagram Editor**: Two-way synced Monaco editor for editing `diagram.json` with real-time canvas updates.
- **Serial Monitor**: Captures `Serial.print` output from the virtual AVR USART and displays it with timestamps.

### 🟡 Started but Incomplete (The Current Bottleneck)
- **Dynamic Simulation Logic**: While the visual wiring is dynamic, the actual *simulation* is still hardcoded. Currently, the `avr8js` loop is locked to manually reading `PB4` (Pin 12) and `PB5` (Pin 13) to toggle specific LEDs. 
  - *Goal*: Map the visual `diagram.json` connections directly to the CPU's GPIO state listeners so *any* wired component works instantly without hardcoding pin numbers.

### ❌ Not Started
- **Wire Deletion**: You can delete parts, but you cannot delete individual wires from the UI (only via JSON editor).
- **Component Properties UI**: A visual sidebar to click a part and edit its properties (color, value, label) without opening the JSON editor.
- **AI Code Generation**: The ultimate goal of adding an LLM integration to auto-write sketches based on the requested circuit.

## 4. What's Next? (Next Steps)
Now that the UI and architecture are equivalent to a full-blown standard Wokwi environment, the primary goal is to merge the UI with the simulation logic.

**Next Priority**: **The Dynamic Connection Engine**
We need to write the logic that reads the `diagram.json` and dynamically sets up AVR listeners based on the wires you drew. If you wire Pin 8 to `led3`, the simulation should automatically route `PORTB/PORTD` changes to update `led3`'s state without any hardcoded logic in `App.tsx`.
