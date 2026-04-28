# Wokwi GitHub Organization Repositories

This document contains a complete list of all 133 repositories under the `wokwi` GitHub organization, followed by a curated list of repositories that contain the core underlying technologies and components necessary to build an interactive circuit simulator like Wokwi.

## Relevant Wokwi Repositories for Simulator Architecture

The following repositories form the foundation of Wokwi's web-based simulation platform. They include the javascript-based architecture emulators, UI components, and custom chip APIs.

### Core Emulators (JavaScript/WebAssembly)
- **[avr8js](https://github.com/wokwi/avr8js)**: Arduino (8-bit AVR) simulator, written in JavaScript and runs in the browser / Node.js.
- **[rp2040js](https://github.com/wokwi/rp2040js)**: A Raspberry Pi Pico Emulator in JavaScript.
- **[esp8266js](https://github.com/wokwi/esp8266js)**: ESP8266 Simulator in JavaScript.
- **[avr8js-research](https://github.com/wokwi/avr8js-research)**: AVR8js Performance Research.
- **[ngspice-wasm](https://github.com/wokwi/ngspice-wasm)**: ngspice compiled into Web Assembly (SPICE circuit simulator).
- **[rv32emu-wasm](https://github.com/wokwi/rv32emu-wasm)**: Compiling RV32Emu to Web Assembly.

### UI & Visual Elements
- **[wokwi-elements](https://github.com/wokwi/wokwi-elements)**: Web Components for Electronics and IoT Parts (Provides the interactive SVGs and drag/drop logic for parts like resistors, LEDs, Breadboards).
- **[react-easy-panzoom](https://github.com/wokwi/react-easy-panzoom)**: Wrapper to enable pan and zoom features for any React component.
- **[use-resize-observer](https://github.com/wokwi/use-resize-observer)**: A React hook that allows you to use a ResizeObserver to measure an element's size.

### Hardware Boards & Parts Definitions
- **[wokwi-boards](https://github.com/wokwi/wokwi-boards)**: Custom board definitions for wokwi.com.
- **[wokwi-part-tests](https://github.com/wokwi/wokwi-part-tests)**: Automated tests for various Wokwi parts and sensors.
- **[wokwi-libraries-cache](https://github.com/wokwi/wokwi-libraries-cache)**: Cached libraries for Wokwi Build server.

### Custom Chips API
- **[wokwi_chips_api](https://github.com/wokwi/wokwi_chips_api)**: Wokwi Custom Chips API in Rust.
- **[wokwi_chip_ll](https://github.com/wokwi/wokwi_chip_ll)**: Wokwi Custom Chip API in Rust.
- **[wokwi-chip-clang-action](https://github.com/wokwi/wokwi-chip-clang-action)**: Compiles Custom Chips written in C for the Wokwi Simulator.
- **[inverter-chip](https://github.com/wokwi/inverter-chip)**: Inverter Chip for Wokwi.
- **[chip_framebuffer_example](https://github.com/wokwi/chip_framebuffer_example)**: Wokwi Framebuffer Chip in Rust example.

### Tooling, APIs & Debugging
- **[wokwi-python-client](https://github.com/wokwi/wokwi-python-client)**: Typed, asyncio-friendly Python SDK for the Wokwi Simulation Server.
- **[wokwi-cli](https://github.com/wokwi/wokwi-cli)**: Wokwi Command Line Interface (for CI use cases).
- **[wokwi-gdbserver](https://github.com/wokwi/wokwi-gdbserver)**: Debug Arduino/ESP32 Code running in the Wokwi Simulator using GDB.
- **[web-avr-gdb](https://github.com/wokwi/web-avr-gdb)**: avr-gdb running in a web-browser.
- **[TinyDebug](https://github.com/wokwi/TinyDebug)**: ATtiny85 Serial-like debug interface for the Wokwi.com simulator.
- **[wokwi-docs](https://github.com/wokwi/wokwi-docs)**: Documentation for the Wokwi Simulator.
- **[wokwi-embed-example](https://github.com/wokwi/wokwi-embed-example)**: A prototype showing how to embed Wokwi inside another web app, using MicroPython + ESP32.

---

## All 133 Wokwi Repositories

- **[easyeda2kicad](https://github.com/wokwi/easyeda2kicad)**: Convert EasyEDA designs to KiCad EDA
- **[kicad-jlcpcb-bom-plugin](https://github.com/wokwi/kicad-jlcpcb-bom-plugin)**: Export a JLCPCB Compatible BOM directly from your KiCad schematic
- **[avr8js](https://github.com/wokwi/avr8js)**: Arduino (8-bit AVR) simulator, written in JavaScript and runs in the browser / Node.js
- **[wokwi-elements](https://github.com/wokwi/wokwi-elements)**: Web Components for Electronics and IoT Parts
- **[gcc-output-parser](https://github.com/wokwi/gcc-output-parser)**: GCC error parsing library for Node.js
- **[astyle-wasm](https://github.com/wokwi/astyle-wasm)**: Artistic Style (AStyle) compiled for Web Assembly
- **[wokwi-TaskScheduler](https://github.com/wokwi/wokwi-TaskScheduler)**: TaskScheduler challenges and playgrounds
- **[wokwi-playgrounds](https://github.com/wokwi/wokwi-playgrounds)**: Playgrounds for Wokwi.com
- **[avr8js-research](https://github.com/wokwi/avr8js-research)**: AVR8js Performance Research
- **[bmp-ts](https://github.com/wokwi/bmp-ts)**: A pure typescript bmp encoder and decoder
- **[good-arduino-code](https://github.com/wokwi/good-arduino-code)**: Frontend for goodarduinocode.com - A curated collection of Arduino coding examples
- **[Button](https://github.com/wokwi/Button)**: Button is a tiny library to make reading buttons very simple. It handles debouncing automatically, and monitoring of state.
- **[wokwi](https://github.com/wokwi/wokwi)**: Wokwi
- **[arduino-libraries](https://github.com/wokwi/arduino-libraries)**: Online Playgrounds for popular Arduino libraries
- **[sol-crusher-simulator](https://github.com/wokwi/sol-crusher-simulator)**: Simulator for the Sol Crush (3D NeoPixel Simulation)
- **[led-3d-cube](https://github.com/wokwi/led-3d-cube)**: 3D LED Cube for Wokwi AVR Simulator
- **[wokwi-features](https://github.com/wokwi/wokwi-features)**: Wokwi Feature requests & Bug Reports
- **[the-skull](https://github.com/wokwi/the-skull)**: The Skull CTF, A mind-bending hardware puzzle in three acts
- **[attiny-hvsp-captures](https://github.com/wokwi/attiny-hvsp-captures)**: High-voltage Serial Programming ATtiny85 logic analyzer captures 
- **[attiny-hvsp-programmer](https://github.com/wokwi/attiny-hvsp-programmer)**: ATtiny High-voltage Serial Programmer with Chip Erase function
- **[video-assets](https://github.com/wokwi/video-assets)**: Just some static files
- **[skull-after-dark](https://github.com/wokwi/skull-after-dark)**: The Skull PCB: After Dark Version
- **[led-3d-spiral](https://github.com/wokwi/led-3d-spiral)**: 3D LED Spiral for Wokwi AVR Simulator
- **[led-2d-spiral](https://github.com/wokwi/led-2d-spiral)**: 2D LED Spiral for Wokwi AVR Simulator
- **[led-web-socket](https://github.com/wokwi/led-web-socket)**: LED Web Socket Transmitter (for use with Wokwi.com simulator)
- **[the-skull-xmas](https://github.com/wokwi/the-skull-xmas)**: Christmas Firmware for The Skull
- **[wokwi-gdbserver](https://github.com/wokwi/wokwi-gdbserver)**: Debug Arduino/ESP32 Code running in the Wokwi Simulator using GDB
- **[led-vogel-spiral](https://github.com/wokwi/led-vogel-spiral)**: 256 LEDs Arranged in Vogel's Spiral for Wokwi AVR Simulator
- **[splendida](https://github.com/wokwi/splendida)**: 256 WS2812B LEDs arranged in Fermat's Spiral Shape
- **[wasm-avr-gdb](https://github.com/wokwi/wasm-avr-gdb)**: Web Assembly build of AVR GDB 
- **[rp2040js](https://github.com/wokwi/rp2040js)**: A Raspberry Pi Pico Emulator in JavaScript
- **[uf2](https://github.com/wokwi/uf2)**: USB Flashing Format (UF2) JavaScript Library
- **[web-avr-gdb](https://github.com/wokwi/web-avr-gdb)**: avr-gdb running in a web-browser
- **[browser-vm-gdb](https://github.com/wokwi/browser-vm-gdb)**: A small Linux x86 VM meant for use in the browser
- **[wokwi-docs](https://github.com/wokwi/wokwi-docs)**: Documentation for the Wokwi Simulator
- **[soulmate-streamer](https://github.com/wokwi/soulmate-streamer)**: Stream pixel data from Wokwi to Soulmate
- **[fastled-monaco](https://github.com/wokwi/fastled-monaco)**: FastLED auto complete + goodies for Monaco Editor
- **[led-recorder](https://github.com/wokwi/led-recorder)**: export LED animation from Wokwi into JSON Lines / binary files
- **[wokwi-animator](https://github.com/wokwi/wokwi-animator)**: Arduino OLED Animations tool
- **[web-gdb](https://github.com/wokwi/web-gdb)**: GDB running inside the browser (using v86)
- **[firmware-assets](https://github.com/wokwi/firmware-assets)**: Firmware Assets
- **[littlefs-wasm](https://github.com/wokwi/littlefs-wasm)**: LittleFS compiled to Web Assembly
- **[pioasm-wasm](https://github.com/wokwi/pioasm-wasm)**: Raspberry Pi Pico pioasm compiled to Web Assembly
- **[TinyDebug](https://github.com/wokwi/TinyDebug)**: ATtiny85 Serial-like debug interface for the Wokwi.com simulator
- **[oofatfs-wasm](https://github.com/wokwi/oofatfs-wasm)**: ooFatFS Compiled to Web Assembly
- **[react-easy-panzoom](https://github.com/wokwi/react-easy-panzoom)**: Wrapper to enable pan and zoom features for any React component
- **[rp2040js-circuitpython](https://github.com/wokwi/rp2040js-circuitpython)**: CircuitPython Simulator using RP2040js
- **[wokwi-circuitpython-libraries](https://github.com/wokwi/wokwi-circuitpython-libraries)**: CircuitPython libraries, packed for use in Wokwi
- **[wokwi-boards](https://github.com/wokwi/wokwi-boards)**: Custom board definitions for wokwi.com
- **[hdl-parser](https://github.com/wokwi/hdl-parser)**: Parser for nand2tetris HDL (Hardware Description Language), written in JavaScript
- **[wokwi-tests](https://github.com/wokwi/wokwi-tests)**: Integration tests for the Wokwi simulation platform
- **[verispell](https://github.com/wokwi/verispell)**: SPELL implementation in Verilog
- **[silife](https://github.com/wokwi/silife)**: Game of Life, in Silicon
- **[wrapped_spell](https://github.com/wokwi/wrapped_spell)**: SPELL CPU, wrapped for Caravel
- **[openmpw-docker](https://github.com/wokwi/openmpw-docker)**: Docker container with OpenMPW PDK + tools: yosys, magic, klayout, ngspice, gtkwave, etc
- **[openroad-docker](https://github.com/wokwi/openroad-docker)**: OpenROAD docker image (with GUI enabled)
- **[skullfet](https://github.com/wokwi/skullfet)**: Skull shaped MOSFET cells for the Efabless's 130nm process
- **[wrapped_silife](https://github.com/wokwi/wrapped_silife)**: Game of Life in Silicon, wrapped for OpenMPW group submission
- **[wrapped_skullfet](https://github.com/wokwi/wrapped_skullfet)**: Skull MOSFET, wrapped for Caravel
- **[caravel_skullfet](https://github.com/wokwi/caravel_skullfet)**: 
- **[wokwi-library-index](https://github.com/wokwi/wokwi-library-index)**: Index for the Wokwi Library Manager
- **[wokwigw](https://github.com/wokwi/wokwigw)**: Wokwi IoT Network Gateway
- **[esp32-arduino-debug](https://github.com/wokwi/esp32-arduino-debug)**: Docker container for source-level debugging of ESP32 Arduino applications (using xtensa-GDB)
- **[rust-build](https://github.com/wokwi/rust-build)**: Workflows for building Rust fork esp-rs/rust with Xtensa support
- **[rv32emu-wasm](https://github.com/wokwi/rv32emu-wasm)**: Compiling RV32Emu to Web Assembly
- **[mbedtls-wasm](https://github.com/wokwi/mbedtls-wasm)**: mbedTLS, compiled for Web Assembly
- **[wokwi-builders](https://github.com/wokwi/wokwi-builders)**: Project builders for various environments
- **[espressif-websocket-example](https://github.com/wokwi/espressif-websocket-example)**: An example for the nice folks at Espressif
- **[wokwi-embed-bridge-example](https://github.com/wokwi/wokwi-embed-bridge-example)**: Example for using Wokwi together with Platform.io (Prototype)
- **[mch2022-firmware-bin](https://github.com/wokwi/mch2022-firmware-bin)**: Firmware Binaries for the MCH2022 Badge
- **[elfist](https://github.com/wokwi/elfist)**: ELF format parser library (TypeScript)
- **[tiny-tapeout-test-simple](https://github.com/wokwi/tiny-tapeout-test-simple)**: 7 Segment GDS fun
- **[tt-game-of-life-cell-popcnt](https://github.com/wokwi/tt-game-of-life-cell-popcnt)**: Tiny Tapeout Game of Life Cell Logic (population count)
- **[flasher-esp32](https://github.com/wokwi/flasher-esp32)**: Wokwi Flasher for Espressif chips, based on esptool-js
- **[ngspice-wasm](https://github.com/wokwi/ngspice-wasm)**: ngspice compiled into Web Assembly
- **[dhcp-wasm](https://github.com/wokwi/dhcp-wasm)**: DHCPv6 and DHCPv4 packet library, client and server written in Go
- **[uio-wasm](https://github.com/wokwi/uio-wasm)**: experimental, for breaking up circular dependencies in u-root, so we can remove version tags
- **[arduino-simon-game](https://github.com/wokwi/arduino-simon-game)**: Simon Game for Arduino with Score Display + Wokwi Simulation
- **[arduino-lcd-helloworld](https://github.com/wokwi/arduino-lcd-helloworld)**: Arduino + LCD1602 example for Wokwi Visual Studio Code extension
- **[rust_chip_inverter](https://github.com/wokwi/rust_chip_inverter)**: Inverter Custom Chip example in Rust
- **[wokwi_chip_ll](https://github.com/wokwi/wokwi_chip_ll)**: Wokwi Custom Chip API in Rust
- **[gf180_spell](https://github.com/wokwi/gf180_spell)**: SPELL CPU for GF180 Shuttle
- **[gf180_skullfet](https://github.com/wokwi/gf180_skullfet)**: Barebone transistors (GF180 GFMPW-0 submission)
- **[wokwi-chip-clang-action](https://github.com/wokwi/wokwi-chip-clang-action)**: Compiles Custom Chips written in C for the Wokwi Simulator (https://wokwi.com)
- **[inverter-chip](https://github.com/wokwi/inverter-chip)**: Inverter Chip for Wokwi
- **[tinytapeout-skullart](https://github.com/wokwi/tinytapeout-skullart)**: SkullFET-inspired art for TinyTapeout
- **[esp32-ntp-clock](https://github.com/wokwi/esp32-ntp-clock)**: ESP32 NTP Clock Example (using Platform IO)
- **[esp32-idf-hello-wifi](https://github.com/wokwi/esp32-idf-hello-wifi)**: ESP32 IDF WiFi Example for VSCode + Wokwi
- **[pico-sdk-blink](https://github.com/wokwi/pico-sdk-blink)**: Pico SDK Blink with Wokwi Simulation
- **[esp32-http-server](https://github.com/wokwi/esp32-http-server)**: ESP32 HTTP Server Example for Wokwi
- **[assemblyscript-inverter-chip](https://github.com/wokwi/assemblyscript-inverter-chip)**: Wokwi Chip in AssemblyScript
- **[chip_framebuffer_example](https://github.com/wokwi/chip_framebuffer_example)**: Wokwi Framebuffer Chip in Rust example
- **[wrapped_simon_game](https://github.com/wokwi/wrapped_simon_game)**: Simon Game Project for Zero to ASIC Group Submission
- **[simon-verilog](https://github.com/wokwi/simon-verilog)**: Simon Says game, written in Verilog and simulated on Wokwi
- **[esp32c6-hello-world](https://github.com/wokwi/esp32c6-hello-world)**: ESP32-C6 on Wokwi for VS Code
- **[esp32-async-web-server-example](https://github.com/wokwi/esp32-async-web-server-example)**: ESP32 Async Web Server Example: Control 2 LEDs from a web page hosted on the ESP32 (simulate with Wokwi for VS Code)
- **[esp32-test-binaries](https://github.com/wokwi/esp32-test-binaries)**: Precompiled firmware binaries for testing ESP32 chips on Wokwi
- **[tt03-simon-game](https://github.com/wokwi/tt03-simon-game)**: Simon Says game submission for TT-03
- **[avr8js-blog-assets](https://github.com/wokwi/avr8js-blog-assets)**: JavaScript assets for https://blog.wokwi.com/avr8js-simulate-arduino-in-javascript/
- **[tt03-simon-game-faster](https://github.com/wokwi/tt03-simon-game-faster)**: Simon Says game submission for TT-03 (faster clock)
- **[wokwi-cli](https://github.com/wokwi/wokwi-cli)**: Wokwi Command Line Interface (for CI use cases)
- **[esp-idf-hello-world](https://github.com/wokwi/esp-idf-hello-world)**: ESP IDF Hello World, precompiled for ESP32 and configured for Wokwi
- **[wokwi-ci-action](https://github.com/wokwi/wokwi-ci-action)**: Use the Wokwi Embedded Systems Simulator in your CI workflow
- **[stm32-hello-wokwi](https://github.com/wokwi/stm32-hello-wokwi)**: STM32 Nucleo64 + Wokwi Example (C031C6)
- **[esp-wrover-kit-embedded-wizard-wokwi](https://github.com/wokwi/esp-wrover-kit-embedded-wizard-wokwi)**: Experimental integration of Embedded Wizard and Wokwi CI
- **[esp32c6-i2c-lp](https://github.com/wokwi/esp32c6-i2c-lp)**: ESP32-C6 LP I2C (Low Power) on Wokwi Example
- **[esp8266js](https://github.com/wokwi/esp8266js)**: ESP8266 Simulator in JavaScript
- **[platform-io-esp32-counter-ci](https://github.com/wokwi/platform-io-esp32-counter-ci)**: ESP32 Pushbutton Counter (Platform IO) with Wokwi CI
- **[esp32h2-hello-world](https://github.com/wokwi/esp32h2-hello-world)**: ESP32-H2 on Wokwi for VS Code
- **[esp32-http-server-binaries](https://github.com/wokwi/esp32-http-server-binaries)**: ESP32 HTTP Server - precompiled firmware
- **[platform-io-esp32-http-client](https://github.com/wokwi/platform-io-esp32-http-client)**: ESP32 HTTP Client with Wokwi CI example
- **[discord-community-rules](https://github.com/wokwi/discord-community-rules)**: Wokwi Discord Community Rules
- **[esp32-i2c-lcd1602-example](https://github.com/wokwi/esp32-i2c-lcd1602-example)**: ESP32-compatible example for I2C-LCD1602 Display
- **[esp32-roms](https://github.com/wokwi/esp32-roms)**: ESP32 bootrom binaries
- **[wokwi-vscode-micropython](https://github.com/wokwi/wokwi-vscode-micropython)**: MicroPython in Wokwi for VS Code
- **[esp32p4-hello-world](https://github.com/wokwi/esp32p4-hello-world)**: ESP32-P4 on Wokwi for VS Code (preview)
- **[wokwi-esp-test-template](https://github.com/wokwi/wokwi-esp-test-template)**: ESP Project Testing Template (CI Project Template/Demo)
- **[riscv-tests-precompiled](https://github.com/wokwi/riscv-tests-precompiled)**: 
- **[esp-idf-oled-ssd1306](https://github.com/wokwi/esp-idf-oled-ssd1306)**: I2C OLED with ESP-IDF and Wokwi Simulation
- **[esp32p4-mipi-dsi-panel-demo](https://github.com/wokwi/esp32p4-mipi-dsi-panel-demo)**: Precompiled ESP32-P4 + MIPI DSI panel example, ready to simulate in Wokwi
- **[wokwi_chips_api](https://github.com/wokwi/wokwi_chips_api)**: Wokwi Custom Chips API in Rust
- **[chip-sh1107](https://github.com/wokwi/chip-sh1107)**: SH1107 Simulation model for Wokwi
- **[wokwi-ci-server-action](https://github.com/wokwi/wokwi-ci-server-action)**: Runs a Wokwi CI server inside GitHub actions
- **[embedded-research-workshop-gitpod](https://github.com/wokwi/embedded-research-workshop-gitpod)**: Gitpod workspace for Wokwi for Embedded System Security Research workshop
- **[embedded-research-workshop-codespace](https://github.com/wokwi/embedded-research-workshop-codespace)**: GitHub codespace for Wokwi for Embedded System Security Research workshop
- **[esp-idf](https://github.com/wokwi/esp-idf)**: Espressif IoT Development Framework. Official development framework for Espressif SoCs.
- **[use-resize-observer](https://github.com/wokwi/use-resize-observer)**:  A React hook that allows you to use a ResizeObserver to measure an element's size.
- **[wokwi-part-tests](https://github.com/wokwi/wokwi-part-tests)**: Automated tests for various Wokwi parts and sensors
- **[wokwi-libraries-cache](https://github.com/wokwi/wokwi-libraries-cache)**: Cached libraries for Wokwi Build server
- **[wokwi-python-client](https://github.com/wokwi/wokwi-python-client)**: Typed, asyncio-friendly Python SDK for the Wokwi Simulation Server
- **[wokwi-embed-example](https://github.com/wokwi/wokwi-embed-example)**: A prototype showing how to embed Wokwi inside another web app, using MicroPython + ESP32
- **[oidc-experiment](https://github.com/wokwi/oidc-experiment)**: Wokwi OICD experiment
- **[idf-wokwi](https://github.com/wokwi/idf-wokwi)**: Wokwi simulation extension for ESP-IDF (idf.py wokwi)
