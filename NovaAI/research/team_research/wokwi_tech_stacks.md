# Simulator Tech Stacks & Divisions

To divide the workload among developers by technical expertise, here is how the core "required" Wokwi repositories map strictly to technical stacks. You can assign these stacks to distinct developers based on the languages and frameworks they master.

## 1. JavaScript/TypeScript Stack (Core Engine)
**Expertise Needed:** TypeScript, Node.js, V8 optimization, understanding of CPU architectures and memory management in JS.  
**Responsibilities:** Building the logic for execution engines and running binary code on simulated CPUs entirely within JS space.
- **[avr8js](https://github.com/wokwi/avr8js)**: Arduino (8-bit AVR) simulator (TypeScript).
- **[rp2040js](https://github.com/wokwi/rp2040js)**: Raspberry Pi Pico Emulator (TypeScript/JavaScript).
- **[esp8266js](https://github.com/wokwi/esp8266js)**: ESP8266 Simulator (JavaScript).
- **[avr8js-research](https://github.com/wokwi/avr8js-research)**: AVR8js Performance R&D (JavaScript).
- **[flasher-esp32](https://github.com/wokwi/flasher-esp32)**: Wokwi Flasher for Espressif chips, based on esptool-js.

## 2. React / Web Components Stack (Frontend & UI)
**Expertise Needed:** React, Lit / Web Components Toolkit, CSS, SVG manipulation, HTML5 Canvas, responsive design.  
**Responsibilities:** Building the interactive visual elements (hardware breadboards, blinking LEDs, buttons), user interfaces, and documentation sites.
- **[wokwi-elements](https://github.com/wokwi/wokwi-elements)**: Web Components for Electronics and IoT Parts (The core SVG engine for the hardware UI).
- **[react-easy-panzoom](https://github.com/wokwi/react-easy-panzoom)**: React wrapper for pan and zoom features for the circuit diagrams.
- **[use-resize-observer](https://github.com/wokwi/use-resize-observer)**: React hook for measuring element size constraints.
- **[wokwi-docs](https://github.com/wokwi/wokwi-docs)**: Static documentation footprint.
- **[wokwi-part-tests](https://github.com/wokwi/wokwi-part-tests)**: UI Automated tests using standard frontend e2e frameworks.

## 3. Rust Stack (Custom Chips & WASM API)
**Expertise Needed:** Rust, LLVM, WebAssembly compilation targets, memory-safe data structures.  
**Responsibilities:** Architecting the robust API that allows third parties to create their own custom hardware chips via WASM safely and efficiently.
- **[wokwi_chips_api](https://github.com/wokwi/wokwi_chips_api)**: Wokwi Custom Chips framework and endpoints in Rust.
- **[wokwi_chip_ll](https://github.com/wokwi/wokwi_chip_ll)**: Low-level bindings API in Rust.
- **[rust_chip_inverter](https://github.com/wokwi/rust_chip_inverter)**: Reference logic for Rust-based custom chips.
- **[chip_framebuffer_example](https://github.com/wokwi/chip_framebuffer_example)**: Wokwi Framebuffer Chip in Rust example.

## 4. C / C++ & WebAssembly (WASM) Stack (Systems)
**Expertise Needed:** C/C++, Make/CMake, Emscripten, GDB server protocols, low-level compilers.  
**Responsibilities:** Taking existing high-performance C simulators (like SPICE or RISC-V cores) and compiling them into WASM so they can run directly in the browser alongside the JavaScript emulators stack.
- **[ngspice-wasm](https://github.com/wokwi/ngspice-wasm)**: Compiling the NGSpice circuit simulator into Web Assembly.
- **[rv32emu-wasm](https://github.com/wokwi/rv32emu-wasm)**: Compiling RV32Emu to Web Assembly.
- **[wasm-avr-gdb](https://github.com/wokwi/wasm-avr-gdb)**: Web Assembly build of the AVR GDB toolchain.
- **[web-avr-gdb](https://github.com/wokwi/web-avr-gdb)**: avr-gdb running in a web-browser.
- **[wokwi-gdbserver](https://github.com/wokwi/wokwi-gdbserver)**: Core Debug Arduino/ESP32 Code running in the Simulator using standard GDB server logic.
- **[inverter-chip](https://github.com/wokwi/inverter-chip)**: Standard C language implementation hook reference.

## 5. Embedded / Python / Automation Stack
**Expertise Needed:** ESP-IDF framework, Arduino platforms, Python 3, CLI automation, JSON mapping, GitHub Actions/CI configuration.  
**Responsibilities:** Creating the mappings between physical footprints (data sheets/pins) and the simulators logic, as well as handling dev workflows like Python SDKs and remote CI tests.
- **[wokwi-boards](https://github.com/wokwi/wokwi-boards)**: Defining JSON definitions and mapping logic for popular boards (Uno, Mega, Nano, etc.)
- **[wokwi-python-client](https://github.com/wokwi/wokwi-python-client)**: Python SDK for headless simulation.
- **[wokwi-cli](https://github.com/wokwi/wokwi-cli)**: Wokwi Command Line Interface (often running on Node/Go/Python for CI use cases).
- **[TinyDebug](https://github.com/wokwi/TinyDebug)**: ATtiny85 Serial-like debug interface wrapper for Arduino IDE integration.
- **[wokwi-libraries-cache](https://github.com/wokwi/wokwi-libraries-cache)**: Build server cache logic and mapping for Arduino Library manager.
- **[esp32-test-binaries](https://github.com/wokwi/esp32-test-binaries)** / **[esp32-roms](https://github.com/wokwi/esp32-roms)**: Bootrom binaries and compiled firmwares necessary to support ESP simulation workflows.
