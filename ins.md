# AI-Ready Rules for Wokwi Generation ??$$$

This document defines the strict formats and rules that an AI assistant must follow to generate valid Wokwi components, wiring, and explanations without failure.

## 1. Custom Chip "Battery" Template (AI Standard)
To simulate a battery or power source with state-of-charge, use this format.

### A. chip.json (Metadata)
```json
{
  "name": "logic-battery",
  "author": "AI-Assistant",
  "version": "1.0",
  "pins": [ "VCC", "GND", "CHG" ],
  "attrs": {
    "capacity_mah": 2000,
    "voltage": 3.7
  }
}
```

### B. chip.c (Logic Rulebook)
Strictly use these signatures from `wokwi-api.h`:
```c
#include "wokwi-api.h"
#include <stdio.h>
#include <stdlib.h>

typedef struct {
  pin_t pin_vcc;
  pin_t pin_gnd;
  uint32_t capacity;
  float current_charge;
  timer_t discharge_timer;
} chip_state_t;

void on_discharge_step(void *user_data) {
  chip_state_t *chip = (chip_state_t*)user_data;
  // AI Logic: Decrease charge, if 0, pin_write(vcc, LOW)
  if (chip->current_charge > 0) {
    chip->current_charge -= 0.01; 
  } else {
    pin_write(chip->pin_vcc, LOW);
  }
}

void chip_init() {
  chip_state_t *chip = malloc(sizeof(chip_state_t));
  chip->pin_vcc = pin_init("VCC", OUTPUT);
  chip->capacity = attr_get_uint32("capacity_mah", 1000);
  chip->current_charge = (float)chip->capacity;

  const timer_config_t config = {
    .callback = on_discharge_step,
    .user_data = chip,
  };
  chip->discharge_timer = timer_init(&config);
  timer_start(chip->discharge_timer, 1000000, true); // 1-second interval
  
  pin_write(chip->pin_vcc, HIGH);
}
```

## 2. Auto-Wiring Format (Code-to-Diagram)
AI must follow these rules when translating Arduino/C code to `diagram.json` connections:

| Code Segment | Diagram Connection Rule | Priority |
| :--- | :--- | :--- |
| `pinMode(X, OUTPUT)` | Connect MCU pin `X` to the `COM` or `IN` pin of the target component. | High |
| `analogRead(A0)` | Connect MCU `A0` to the `SIG` or `OUT` pin of an analog sensor (e.g. Potentiometer). | High |
| `Wire.begin()` | Connect MCU `SDA`/`SCL` to device `SDA`/`SCL`. | Critical |
| `SPI.begin()` | Connect `MOSI`, `MISO`, `SCK`, `CS` respectively. | Critical |

**Connection Array Syntax:**
`[ "originId:pin", "targetId:pin", "color", [ "v_path", "h_path" ] ]`

## 3. Natural Language Explanation (JSON-to-English)
To explain a circuit doubt, use this template-based mapping:

- **Input**: `["uno:7", "led1:A", "red"]`
- **Output**: "Take a **red** wire. Connect one end to **Digital Pin 7** on your **Arduino Uno** and the other end to the **Anode (positive)** pin of the **LED**. This allows the Arduino to control the light."

- **Input**: `["uno:GND", "led1:K", "black"]`
- **Output**: "Complete the circuit by connecting the **GND** pin of the **Arduino** to the **Cathode (negative)** pin of the **LED** using a **black** wire. This is the ground return path."

## 4. Design Guidelines for AI
1. **Color Coding**: Always use `red` for VCC/Power, `black` for GND, and varied colors (`green`, `blue`, `yellow`) for signals.
2. **Pathing**: If `v_path`/`h_path` are not provided, Wokwi will auto-route, but AI should provide a simple `[ ]` empty array to ensure JSON validity.
3. **Safety First**: Before generating connections, AI must verify that every peripheral has a `GND` connection.

