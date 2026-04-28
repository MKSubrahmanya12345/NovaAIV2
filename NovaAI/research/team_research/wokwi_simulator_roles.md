# Simulator Team Structure & Roles

Building a browser-based hardware simulator on the scale of Wokwi requires a specialized, multi-disciplinary engineering team. Based on the core repositories necessary to recreate Wokwi’s architecture, here is the breakdown of the engineering roles you will need, along with the repositories that fall under their domain.

## 1. Emulator & WebAssembly Core Engineer
**Focus Area:** Emulation logic, CPU architecture, instruction set execution, and WebAssembly compilation.  
**Job Description:** You will be responsible for building, optimizing, and maintaining the core CPU emulators that run entirely in the browser using JavaScript and WebAssembly. You must have a deep understanding of microcontroller architectures (AVR, ARM Cortex, Tensilica, RISC-V) and be adept at writing highly performant, deterministic code that runs seamlessly in V8/Node.js engines.
**Associated Repositories:**
- **[avr8js](https://github.com/wokwi/avr8js)**: Core Arduino (8-bit AVR) simulator logic
- **[rp2040js](https://github.com/wokwi/rp2040js)**: Raspberry Pi Pico Emulator (ARM Core)
- **[esp8266js](https://github.com/wokwi/esp8266js)**: ESP8266 Simulator (Tensilica)
- **[ngspice-wasm](https://github.com/wokwi/ngspice-wasm)**: Underlying SPICE circuit simulator bindings
- **[rv32emu-wasm](https://github.com/wokwi/rv32emu-wasm)**: RISC-V architecture emulator
- **[avr8js-research](https://github.com/wokwi/avr8js-research)**: R&D for execution performance profiling

## 2. Frontend & UI Component Developer
**Focus Area:** Web components, interactive SVG manipulation, user interface, and DOM rendering.  
**Job Description:** You will build the interactive layer of the simulator. Your job is to create responsive, visually accurate interactive SVGs for breadboards, LEDs, displays, and wiring. You must specialize in framework-agnostic Web Components, drag-and-drop systems, rendering optimization, and canvas/SVG pan-and-zoom mechanics to ensure the simulator feels snappy and hardware-like.
**Associated Repositories:**
- **[wokwi-elements](https://github.com/wokwi/wokwi-elements)**: The primary visual rendering engine and Web Components for IoT parts
- **[react-easy-panzoom](https://github.com/wokwi/react-easy-panzoom)**: Workspace panning and scaling logic
- **[use-resize-observer](https://github.com/wokwi/use-resize-observer)**: Rendering optimization heuristics
- **[wokwi-docs](https://github.com/wokwi/wokwi-docs)**: Structuring the public-facing platform footprint

## 3. Hardware Modeler & Parts Integrator 
**Focus Area:** Pinout mapping, peripheral behavior, schematic definitions, and CI hardware tests.  
**Job Description:** You will act as the bridge between raw emulators and the visual UI. Your role involves digesting real-world hardware data sheets and defining the simulation logic, pin layouts, and electronic characteristics (I2C, SPI, UART behaviors) for external peripherals (displays, sensors, motors, breakout boards). You'll write rigorous test suites to ensure virtual parts match real electrical outcomes.
**Associated Repositories:**
- **[wokwi-boards](https://github.com/wokwi/wokwi-boards)**: Defining board layouts, pins, and topologies
- **[wokwi-part-tests](https://github.com/wokwi/wokwi-part-tests)**: Test harnesses validating sensor and part logic states
- **[wokwi-libraries-cache](https://github.com/wokwi/wokwi-libraries-cache)**: Maintaining the logic caches for compiling Arduino dependencies

## 4. Systems Integration & Custom API Engineer
**Focus Area:** Rust, C/C++ toolchains, compiler bridges, and third-party extension ecosystems.  
**Job Description:** You will architect the boundaries of the simulator to allow user-driven hardware extensions. You'll build and maintain compilation pipelines (utilizing Clang and Rust toolchains) that take users' custom chip algorithms written in C or Rust and compile them into WebAssembly modules that dynamically slot into the simulation timeline. 
**Associated Repositories:**
- **[wokwi_chips_api](https://github.com/wokwi/wokwi_chips_api)** & **[wokwi_chip_ll](https://github.com/wokwi/wokwi_chip_ll)**: Rust APIs for interfacing with the simulation timescale engine
- **[wokwi-chip-clang-action](https://github.com/wokwi/wokwi-chip-clang-action)**: The CI/CD pipelines needed to compile C/C++ into WASM for simulator injection
- **[inverter-chip](https://github.com/wokwi/inverter-chip)** & **[chip_framebuffer_example](https://github.com/wokwi/chip_framebuffer_example)**: Prototyping and reference code for custom extensions

## 5. DevTools & Embedded Telemetry Engineer
**Focus Area:** GDB bridges, debugging servers, CLI interfaces, and SDK automation.  
**Job Description:** You will empower developers to interact with and debug the simulated environments exactly like real hardware. You will maintain GDB servers that track simulated execution context in real-time, implement low-level debugging agents (TinyDebug), and build Python-based/CLI endpoints for developers integrating the simulator seamlessly into their continuous integration workflows.
**Associated Repositories:**
- **[wokwi-gdbserver](https://github.com/wokwi/wokwi-gdbserver)** & **[web-avr-gdb](https://github.com/wokwi/web-avr-gdb)**: Connecting standard debugging tools to running WebAssembly memory scopes
- **[TinyDebug](https://github.com/wokwi/TinyDebug)**: Building serial-like debugging interfaces
- **[wokwi-cli](https://github.com/wokwi/wokwi-cli)**: CLI toolchain bindings
- **[wokwi-python-client](https://github.com/wokwi/wokwi-python-client)**: Official automation SDK
- **[wokwi-embed-example](https://github.com/wokwi/wokwi-embed-example)**: Iframe and service worker embedding logic APIs
