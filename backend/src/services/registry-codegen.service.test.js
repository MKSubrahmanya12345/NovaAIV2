import test from "node:test";
import assert from "node:assert/strict";

import { getRegistry } from "./registry.service.js";
import {
  validatePlan,
  generateArtifactsFromRegistry,
  generateParts,
  buildServoSketchFromPlan,
  buildLcdSketchFromPlan
} from "./registry-codegen.service.js";

test("validatePlan: rejects invalid pin for a variant", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SEVEN_SEGMENT_4", id: "seg", attrs: {} }],
    connections: [
      {
        from: { type: "SEVEN_SEGMENT_4", id: "seg", pin: "COM.1" }, // invalid for _4
        to: { type: "ARDUINO_MEGA", id: "board", pin: "GND.1" },
        color: "black",
        route: []
      }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('Invalid pin "COM.1"')));
});

test("validatePlan: accepts valid pins for SEVEN_SEGMENT_4", () => {
  const registry = getRegistry();

  const requiredPins = ["DIG1", "DIG2", "DIG3", "DIG4", "A", "B", "C", "D", "E", "F", "G", "COM"];
  const connections = requiredPins.map((pin, idx) => ({
    from: { type: "ARDUINO_MEGA", id: "board", pin: String(22 + idx) },
    to: { type: "SEVEN_SEGMENT_4", id: "seg", pin },
    color: pin === "COM" ? "red" : "green",
    route: []
  }));

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SEVEN_SEGMENT_4", id: "seg", attrs: { colon: false } }],
    connections,
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validatePlan: rejects type mismatch for a reused id", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SEVEN_SEGMENT_1", id: "seg", attrs: {} }],
    connections: [
      {
        from: { type: "SEVEN_SEGMENT_4", id: "seg", pin: "A" }, // id seg is actually _1
        to: { type: "ARDUINO_MEGA", id: "board", pin: "13" },
        color: "green",
        route: []
      }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("type mismatch")));
});

test("validatePlan: accepts type \"board\" on MCU endpoints (coerced to board.type)", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "RESISTOR", id: "r1", attrs: {} }],
    connections: [
      { from: { type: "RESISTOR", id: "r1", pin: "1" }, to: { type: "board", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "RESISTOR", id: "r1", pin: "2" }, to: { type: "board", id: "board", pin: "GND.1" }, color: "black", route: [] }
    ],
    notes: []
  };
  const result = validatePlan(registry, plan);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validatePlan: accepts LCD_1602 with legal wires", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      { type: "LCD_1602", id: "lcd1", attrs: { pins: "full" } },
      { type: "RESISTOR", id: "rV0", attrs: {} }
    ],
    connections: [
      { from: { type: "LCD_1602", id: "lcd1", pin: "VSS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "VDD" }, to: { type: "ARDUINO_UNO", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RW" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.2" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "V0" }, to: { type: "RESISTOR", id: "rV0", pin: "1" }, color: "green", route: [] },
      { from: { type: "RESISTOR", id: "rV0", pin: "2" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.3" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "12" }, color: "green", route: [] }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validatePlan: normalizes D12 to 12 on board endpoints", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      { type: "LCD_1602", id: "lcd1", attrs: { pins: "full" } },
      { type: "RESISTOR", id: "rV0", attrs: {} }
    ],
    connections: [
      { from: { type: "LCD_1602", id: "lcd1", pin: "VSS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "VDD" }, to: { type: "ARDUINO_UNO", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RW" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.2" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "V0" }, to: { type: "RESISTOR", id: "rV0", pin: "1" }, color: "green", route: [] },
      { from: { type: "RESISTOR", id: "rV0", pin: "2" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.3" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "D12" }, color: "green", route: [] }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validatePlan: rejects parallel LCD_1602 without RW to board GND", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      { type: "LCD_1602", id: "lcd1", attrs: { pins: "full" } },
      { type: "RESISTOR", id: "rV0", attrs: {} }
    ],
    connections: [
      { from: { type: "LCD_1602", id: "lcd1", pin: "VSS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "VDD" }, to: { type: "ARDUINO_UNO", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "V0" }, to: { type: "RESISTOR", id: "rV0", pin: "1" }, color: "green", route: [] },
      { from: { type: "RESISTOR", id: "rV0", pin: "2" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.2" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "12" }, color: "green", route: [] }
    ],
    notes: []
  };
  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("lcd policy") && e.includes("RW")));
});

test("validatePlan: rejects parallel LCD_1602 without V0 connection", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "LCD_1602", id: "lcd1", attrs: { pins: "full" } }],
    connections: [
      { from: { type: "LCD_1602", id: "lcd1", pin: "VSS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "VDD" }, to: { type: "ARDUINO_UNO", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RW" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.2" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "12" }, color: "green", route: [] }
    ],
    notes: []
  };
  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("lcd policy") && e.includes("V0")));
});

test("validatePlan: rejects POTENTIOMETER with parallel LCD when SIG is not wired to lcd V0", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      { type: "LCD_1602", id: "lcd1", attrs: { pins: "full" } },
      { type: "RESISTOR", id: "rV0", attrs: {} },
      { type: "POTENTIOMETER", id: "pot1", attrs: {} }
    ],
    connections: [
      { from: { type: "LCD_1602", id: "lcd1", pin: "VSS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "VDD" }, to: { type: "ARDUINO_UNO", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RW" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.2" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "V0" }, to: { type: "RESISTOR", id: "rV0", pin: "1" }, color: "green", route: [] },
      { from: { type: "RESISTOR", id: "rV0", pin: "2" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.3" }, color: "black", route: [] },
      { from: { type: "POTENTIOMETER", id: "pot1", pin: "GND" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "POTENTIOMETER", id: "pot1", pin: "VCC" }, to: { type: "ARDUINO_UNO", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "POTENTIOMETER", id: "pot1", pin: "SIG" }, to: { type: "ARDUINO_UNO", id: "board", pin: "A0" }, color: "green", route: [] }
    ],
    notes: []
  };
  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("potentiometer policy") && e.includes("V0")));
});

test("validatePlan: accepts POTENTIOMETER with parallel LCD when SIG wires to lcd V0", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      { type: "LCD_1602", id: "lcd1", attrs: { pins: "full" } },
      { type: "POTENTIOMETER", id: "pot1", attrs: {} }
    ],
    connections: [
      { from: { type: "LCD_1602", id: "lcd1", pin: "VSS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "VDD" }, to: { type: "ARDUINO_UNO", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RW" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.2" }, color: "black", route: [] },
      { from: { type: "POTENTIOMETER", id: "pot1", pin: "SIG" }, to: { type: "LCD_1602", id: "lcd1", pin: "V0" }, color: "green", route: [] },
      { from: { type: "POTENTIOMETER", id: "pot1", pin: "GND" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "POTENTIOMETER", id: "pot1", pin: "VCC" }, to: { type: "ARDUINO_UNO", id: "board", pin: "5V" }, color: "red", route: [] }
    ],
    notes: []
  };
  const result = validatePlan(registry, plan);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validatePlan: rejects POTENTIOMETER with only SIG wired", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "POTENTIOMETER", id: "pot1", attrs: {} }],
    connections: [
      { from: { type: "POTENTIOMETER", id: "pot1", pin: "SIG" }, to: { type: "ARDUINO_UNO", id: "board", pin: "A0" }, color: "green", route: [] }
    ],
    notes: []
  };
  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("potentiometer policy") && e.includes("GND")));
});

test("buildLcdSketchFromPlan: emits LiquidCrystal sketch when RS/E/D4–D7 wired", () => {
  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      { type: "LCD_1602", id: "lcd1", attrs: { pins: "full" } },
      { type: "RESISTOR", id: "rV0", attrs: {} }
    ],
    connections: [
      { from: { type: "LCD_1602", id: "lcd1", pin: "VSS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "VDD" }, to: { type: "ARDUINO_UNO", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RW" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.2" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "V0" }, to: { type: "RESISTOR", id: "rV0", pin: "1" }, color: "green", route: [] },
      { from: { type: "RESISTOR", id: "rV0", pin: "2" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.3" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "12" }, color: "green", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "E" }, to: { type: "ARDUINO_UNO", id: "board", pin: "11" }, color: "green", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "D4" }, to: { type: "ARDUINO_UNO", id: "board", pin: "10" }, color: "green", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "D5" }, to: { type: "ARDUINO_UNO", id: "board", pin: "9" }, color: "green", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "D6" }, to: { type: "ARDUINO_UNO", id: "board", pin: "8" }, color: "green", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "D7" }, to: { type: "ARDUINO_UNO", id: "board", pin: "7" }, color: "green", route: [] }
    ],
    notes: []
  };
  const sketch = buildLcdSketchFromPlan(plan, "");
  assert.ok(sketch);
  assert.ok(sketch.includes("#include <LiquidCrystal.h>"));
  assert.ok(sketch.includes("lcd.begin(16, 2)"));
  assert.ok(sketch.includes("LiquidCrystal lcd("));
});

test("buildLcdSketchFromPlan: returns null when D4 not wired or LCD is i2c", () => {
  const base = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "LCD_1602", id: "lcd1", attrs: { pins: "full" } }],
    connections: [
      { from: { type: "LCD_1602", id: "lcd1", pin: "RW" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "RS" }, to: { type: "ARDUINO_UNO", id: "board", pin: "12" }, color: "green", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "E" }, to: { type: "ARDUINO_UNO", id: "board", pin: "11" }, color: "green", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "D5" }, to: { type: "ARDUINO_UNO", id: "board", pin: "9" }, color: "green", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "D6" }, to: { type: "ARDUINO_UNO", id: "board", pin: "8" }, color: "green", route: [] },
      { from: { type: "LCD_1602", id: "lcd1", pin: "D7" }, to: { type: "ARDUINO_UNO", id: "board", pin: "7" }, color: "green", route: [] }
    ],
    notes: []
  };
  assert.equal(buildLcdSketchFromPlan(base, ""), null);

  const i2cPlan = {
    ...base,
    components: [{ type: "LCD_1602", id: "lcd1", attrs: { pins: "i2c" } }]
  };
  assert.equal(buildLcdSketchFromPlan(i2cPlan, ""), null);

  const nonePlan = {
    ...base,
    components: [{ type: "LCD_1602", id: "lcd1", attrs: { pins: "none" } }]
  };
  assert.equal(buildLcdSketchFromPlan(nonePlan, ""), null);
});

test("generateParts: parallel LCD_1602 omits i2cAddress from attrs", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "LCD_1602", id: "lcd1", attrs: { pins: "full", i2cAddress: "0x27" } }],
    connections: [
      { from: { type: "LCD_1602", id: "lcd1", pin: "RW" }, to: { type: "ARDUINO_UNO", id: "board", pin: "GND.1" }, color: "black", route: [] }
    ],
    notes: []
  };
  const lcdPart = generateParts(registry, plan).find((p) => p.id === "lcd1");
  assert.ok(lcdPart);
  assert.equal(lcdPart.attrs.pins, "full");
  assert.equal("i2cAddress" in lcdPart.attrs, false);
});

test("stepper motor registry: pins and attrs match expected Wokwi contract", () => {
  const registry = getRegistry();
  const stepper = registry.STEPPER_MOTOR;

  assert.ok(stepper, "STEPPER_MOTOR missing from registry");
  assert.equal(stepper.wokwiType, "wokwi-stepper-motor");
  assert.equal(stepper.category, "actuator");

  const pinNames = (stepper.pins || []).map((p) => p.name);
  assert.deepEqual(pinNames, ["A-", "A+", "B+", "B-"]);

  assert.equal(stepper.attrs.value.default, "");
  assert.equal(stepper.attrs.units.default, "");
  assert.equal(stepper.attrs.display.default, "steps");
  assert.equal(stepper.attrs.gearRatio.default, "1:1");
  assert.equal(stepper.attrs.size.default, "23");
});

test("a4988 registry: pins match expected Wokwi contract", () => {
  const registry = getRegistry();
  const drv = registry.A4988_DRIVER;

  assert.ok(drv, "A4988_DRIVER missing from registry");
  assert.equal(drv.wokwiType, "wokwi-a4988");

  const pinNames = (drv.pins || []).map((p) => p.name);
  assert.deepEqual(pinNames, [
    "ENABLE",
    "MS1",
    "MS2",
    "MS3",
    "RESET",
    "SLEEP",
    "STEP",
    "DIR",
    "GND",
    "VDD",
    "1B",
    "1A",
    "2A",
    "2B",
    "VMOT"
  ]);
});

test("servo registry: wokwi-servo attrs are horn + hornColor only (no angle)", () => {
  const registry = getRegistry();
  const servo = registry.SERVO;

  assert.ok(servo, "SERVO missing from registry");
  assert.equal(servo.wokwiType, "wokwi-servo");
  const keys = Object.keys(servo.attrs || {}).sort();
  assert.deepEqual(keys, ["horn", "hornColor"]);
  assert.equal(servo.attrs.horn.default, "single");
  assert.equal(servo.attrs.hornColor.default, "#ccc");
});

test("generateParts: servo diagram attrs omit angle; keep horn + hornColor only", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      {
        type: "SERVO",
        id: "s1",
        top: 10,
        left: 20,
        attrs: { angle: 90, horn: "double", hornColor: "#aabbcc", extra: "drop-me" }
      }
    ]
  };

  const parts = generateParts(registry, plan);
  const servoPart = parts.find((p) => p.id === "s1");
  assert.ok(servoPart);
  assert.deepEqual(Object.keys(servoPart.attrs).sort(), ["horn", "hornColor"]);
  assert.equal(servoPart.attrs.horn, "double");
  assert.equal(servoPart.attrs.hornColor, "#aabbcc");
  assert.ok(!Object.prototype.hasOwnProperty.call(servoPart.attrs, "angle"));
});

test("generateParts: invalid servo horn falls back to single", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SERVO", id: "s2", attrs: { horn: "nope" } }]
  };
  const servoPart = generateParts(registry, plan).find((p) => p.id === "s2");
  assert.equal(servoPart.attrs.horn, "single");
});

test("buildServoSketchFromPlan: second+minute ids get clock-style map + 1 Hz (no fast sweep)", () => {
  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      { type: "SERVO", id: "servo_seconds", top: 0, left: 0, attrs: {} },
      { type: "SERVO", id: "servo_minutes", top: 0, left: 0, attrs: {} }
    ],
    connections: [
      { from: { type: "SERVO", id: "servo_seconds", pin: "PWM" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "9" }, color: "green", route: [] },
      { from: { type: "SERVO", id: "servo_minutes", pin: "PWM" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "10" }, color: "green", route: [] },
      { from: { type: "SERVO", id: "servo_seconds", pin: "GND" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "SERVO", id: "servo_minutes", pin: "GND" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "GND.2" }, color: "black", route: [] },
      { from: { type: "SERVO", id: "servo_seconds", pin: "V+" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "SERVO", id: "servo_minutes", pin: "V+" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "5V.1" }, color: "red", route: [] }
    ],
    notes: []
  };

  const wireComments = "// - servo_seconds:PWM -> board:9\n// - servo_minutes:PWM -> board:10";
  const sketch = buildServoSketchFromPlan(plan, wireComments);

  assert.ok(sketch);
  assert.ok(sketch.includes("#include <Servo.h>"));
  assert.ok(sketch.includes("Servo servoMinutes"));
  assert.ok(sketch.includes("Servo servoSeconds"));
  assert.ok(sketch.includes("servoMinutes.attach(10)"));
  assert.ok(sketch.includes("servoSeconds.attach(9)"));
  assert.ok(sketch.includes("map(seconds, 0, 59, 0, 180)"));
  assert.ok(sketch.includes("map(minutes, 0, 59, 0, 180)"));
  assert.ok(sketch.includes("delay(1000)"));
  assert.equal(sketch.includes("delay(25)"), false);
  assert.ok(sketch.includes("// Wiring plan:"));
  assert.ok(sketch.includes("servo_seconds:PWM -> board:9"));
});

test("buildServoSketchFromPlan: two servos without clock ids use slow staggered demo", () => {
  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      { type: "SERVO", id: "pan", top: 0, left: 0, attrs: {} },
      { type: "SERVO", id: "tilt", top: 0, left: 0, attrs: {} }
    ],
    connections: [
      { from: { type: "SERVO", id: "pan", pin: "PWM" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "5" }, color: "green", route: [] },
      { from: { type: "SERVO", id: "tilt", pin: "PWM" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "6" }, color: "green", route: [] }
    ],
    notes: []
  };
  const sketch = buildServoSketchFromPlan(plan);
  assert.ok(sketch.includes("int demoSec = 0"));
  assert.ok(sketch.includes("delay(1000)"));
  assert.ok(sketch.includes("Servo servoPan"));
  assert.ok(sketch.includes("Servo servoTilt"));
});

test("buildServoSketchFromPlan: returns null when no SERVO components", () => {
  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "PUSHBUTTON", id: "b1", top: 0, left: 0, attrs: {} }],
    connections: [],
    notes: []
  };
  assert.equal(buildServoSketchFromPlan(plan), null);
});

test("buildServoSketchFromPlan: returns null when PWM not wired to board", () => {
  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SERVO", id: "s1", top: 0, left: 0, attrs: {} }],
    connections: [
      { from: { type: "SERVO", id: "s1", pin: "GND" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "GND.1" }, color: "black", route: [] }
    ],
    notes: []
  };
  assert.equal(buildServoSketchFromPlan(plan), null);
});

test("validatePlan: rejects stepper without a4988 driver", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "STEPPER_MOTOR", id: "motor1", attrs: {} }],
    connections: [],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("expected exactly 1 A4988_DRIVER")));
});

test("validatePlan: accepts stepper with a4988 wiring + STEP/DIR + RESET<->SLEEP", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      { type: "STEPPER_MOTOR", id: "motor1", attrs: {} },
      { type: "A4988_DRIVER", id: "drv1", attrs: {} }
    ],
    connections: [
      { from: { type: "A4988_DRIVER", id: "drv1", pin: "2B" }, to: { type: "STEPPER_MOTOR", id: "motor1", pin: "A-" }, color: "green", route: [] },
      { from: { type: "A4988_DRIVER", id: "drv1", pin: "2A" }, to: { type: "STEPPER_MOTOR", id: "motor1", pin: "A+" }, color: "green", route: [] },
      { from: { type: "A4988_DRIVER", id: "drv1", pin: "1A" }, to: { type: "STEPPER_MOTOR", id: "motor1", pin: "B+" }, color: "green", route: [] },
      { from: { type: "A4988_DRIVER", id: "drv1", pin: "1B" }, to: { type: "STEPPER_MOTOR", id: "motor1", pin: "B-" }, color: "green", route: [] },
      { from: { type: "A4988_DRIVER", id: "drv1", pin: "STEP" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "9" }, color: "green", route: [] },
      { from: { type: "A4988_DRIVER", id: "drv1", pin: "DIR" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "10" }, color: "green", route: [] },
      { from: { type: "A4988_DRIVER", id: "drv1", pin: "RESET" }, to: { type: "A4988_DRIVER", id: "drv1", pin: "SLEEP" }, color: "green", route: [] }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, true);
});

test("validatePlan: rejects SEVEN_SEGMENT_4 when wiring is incomplete", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SEVEN_SEGMENT_4", id: "display", attrs: { colon: false } }],
    connections: [
      { from: { type: "ARDUINO_MEGA", id: "board", pin: "2" }, to: { type: "SEVEN_SEGMENT_4", id: "display", pin: "DIG1" }, color: "green", route: [] },
      { from: { type: "ARDUINO_MEGA", id: "board", pin: "5V" }, to: { type: "SEVEN_SEGMENT_4", id: "display", pin: "COM" }, color: "red", route: [] }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('seven-seg policy: SEVEN_SEGMENT_4 "display"')));
});

test("validatePlan: accepts SEVEN_SEGMENT_4 when minimum wiring is present (colon off)", () => {
  const registry = getRegistry();

  const requiredPins = ["DIG1", "DIG2", "DIG3", "DIG4", "A", "B", "C", "D", "E", "F", "G", "COM"];
  const connections = requiredPins.map((pin, idx) => ({
    from: { type: "ARDUINO_MEGA", id: "board", pin: String(22 + idx) },
    to: { type: "SEVEN_SEGMENT_4", id: "display", pin },
    color: "green",
    route: []
  }));

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SEVEN_SEGMENT_4", id: "display", attrs: { colon: false } }],
    connections,
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, true);
});

test("validatePlan: rejects SEVEN_SEGMENT_4 colon=true when CLN is not wired", () => {
  const registry = getRegistry();

  const requiredPins = ["DIG1", "DIG2", "DIG3", "DIG4", "A", "B", "C", "D", "E", "F", "G", "COM"];
  const connections = requiredPins.map((pin, idx) => ({
    from: { type: "ARDUINO_MEGA", id: "board", pin: String(22 + idx) },
    to: { type: "SEVEN_SEGMENT_4", id: "display", pin },
    color: "green",
    route: []
  }));

  const planColonOn = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SEVEN_SEGMENT_4", id: "display", attrs: { colon: true } }],
    connections,
    notes: []
  };

  const bad = validatePlan(registry, planColonOn);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes("colon=true requires CLN")));
});

test("validatePlan: accepts SEVEN_SEGMENT_4 colon=true when CLN is wired", () => {
  const registry = getRegistry();

  const requiredPins = ["DIG1", "DIG2", "DIG3", "DIG4", "A", "B", "C", "D", "E", "F", "G", "COM", "CLN"];
  const connections = requiredPins.map((pin, idx) => ({
    from: { type: "ARDUINO_MEGA", id: "board", pin: String(22 + idx) },
    to: { type: "SEVEN_SEGMENT_4", id: "display", pin },
    color: "green",
    route: []
  }));

  const planColonOn = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SEVEN_SEGMENT_4", id: "display", attrs: { colon: true } }],
    connections,
    notes: []
  };

  assert.equal(validatePlan(registry, planColonOn).ok, true);
});

test("validatePlan: rejects SEVEN_SEGMENT_4 CLN wired when colon is off", () => {
  const registry = getRegistry();

  const requiredPins = ["DIG1", "DIG2", "DIG3", "DIG4", "A", "B", "C", "D", "E", "F", "G", "COM", "CLN"];
  const connections = requiredPins.map((pin, idx) => ({
    from: { type: "ARDUINO_MEGA", id: "board", pin: String(22 + idx) },
    to: { type: "SEVEN_SEGMENT_4", id: "display", pin },
    color: "green",
    route: []
  }));

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SEVEN_SEGMENT_4", id: "display", attrs: { colon: false } }],
    connections,
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("CLN must not be wired")));
});

test("validatePlan: rejects invalid pin on SEVEN_SEGMENT_4", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "SEVEN_SEGMENT_4", id: "seg", attrs: { colon: false } }],
    connections: [
      {
        from: { type: "SEVEN_SEGMENT_4", id: "seg", pin: "NOT_A_PIN" },
        to: { type: "ARDUINO_MEGA", id: "board", pin: "GND.1" },
        color: "black",
        route: []
      }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('Invalid pin "NOT_A_PIN"')));
});

test("validatePlan: rejects RESISTOR when only one pin is wired", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "RESISTOR", id: "r1", attrs: {} }],
    connections: [
      { from: { type: "RESISTOR", id: "r1", pin: "1" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "5V" }, color: "red", route: [] }
    ],
    notes: []
  };
  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('resistor policy') && e.includes("pin 2")));
});

test("validatePlan: accepts RESISTOR with both pins wired", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "RESISTOR", id: "r1", attrs: {} }],
    connections: [
      { from: { type: "RESISTOR", id: "r1", pin: "1" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "5V" }, color: "red", route: [] },
      { from: { type: "RESISTOR", id: "r1", pin: "2" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "GND.1" }, color: "black", route: [] }
    ],
    notes: []
  };
  const result = validatePlan(registry, plan);
  assert.equal(result.ok, true);
});

test("generateParts: board omits default simulator attrs; 7-seg uses commonPin and omits colon when off", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      {
        type: "SEVEN_SEGMENT_4",
        id: "display",
        top: 100,
        left: 100,
        attrs: { common: "cathode", colon: false, color: "red" }
      }
    ]
  };
  const parts = generateParts(registry, plan);
  const boardPart = parts.find((p) => p.id === "board");
  assert.deepEqual(boardPart.attrs, {});
  const seg = parts.find((p) => p.id === "display");
  assert.equal(seg.attrs.commonPin, "cathode");
  assert.ok(!Object.prototype.hasOwnProperty.call(seg.attrs, "common"));
  assert.ok(!Object.prototype.hasOwnProperty.call(seg.attrs, "colon"));
  assert.equal(seg.attrs.digits, "4");
  assert.equal(seg.attrs.color, "red");
});

test("generateParts: 7-seg colon on emits colon \"1\"", () => {
  const registry = getRegistry();
  const plan = {
    board: { type: "ARDUINO_UNO", id: "board", top: 270, left: 185, attrs: {} },
    components: [
      { type: "SEVEN_SEGMENT_4", id: "d1", top: 0, left: 0, attrs: { colon: true, commonPin: "anode" } }
    ]
  };
  const seg = generateParts(registry, plan).find((p) => p.id === "d1");
  assert.equal(seg.attrs.colon, "1");
  assert.equal(seg.attrs.commonPin, "anode");
});

test("validatePlan: rejects DS1307 without power to board", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "DS1307", id: "clock", attrs: {} }],
    connections: [
      { from: { type: "DS1307", id: "clock", pin: "SDA" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "20" }, color: "green", route: [] },
      { from: { type: "DS1307", id: "clock", pin: "SCL" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "21" }, color: "green", route: [] }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('ds1307 policy')));
});

test("validatePlan: accepts DS1307 with I2C and power", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "DS1307", id: "clock", attrs: {} }],
    connections: [
      { from: { type: "DS1307", id: "clock", pin: "SDA" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "20" }, color: "green", route: [] },
      { from: { type: "DS1307", id: "clock", pin: "SCL" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "21" }, color: "green", route: [] },
      { from: { type: "DS1307", id: "clock", pin: "GND" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "GND.1" }, color: "black", route: [] },
      { from: { type: "DS1307", id: "clock", pin: "5V" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "5V" }, color: "red", route: [] }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, true);
});

test("validatePlan: rejects pushbutton with only one board connection", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "PUSHBUTTON", id: "btn", attrs: {} }],
    connections: [
      { from: { type: "PUSHBUTTON", id: "btn", pin: "1.l" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "A0" }, color: "green", route: [] }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("pushbutton policy")));
});

test("validatePlan: accepts pushbutton with two board connections", () => {
  const registry = getRegistry();

  const plan = {
    board: { type: "ARDUINO_MEGA", id: "board", top: 270, left: 185, attrs: {} },
    components: [{ type: "PUSHBUTTON", id: "btn", attrs: {} }],
    connections: [
      { from: { type: "PUSHBUTTON", id: "btn", pin: "1.l" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "A0" }, color: "green", route: [] },
      { from: { type: "PUSHBUTTON", id: "btn", pin: "1.r" }, to: { type: "ARDUINO_MEGA", id: "board", pin: "GND.1" }, color: "black", route: [] }
    ],
    notes: []
  };

  const result = validatePlan(registry, plan);
  assert.equal(result.ok, true);
});

test("generateArtifactsFromRegistry: emits runnable stepper sketch when wired to numeric pins", async () => {
  // NOTE: this doesn't call the model; we only care about the deterministic emission path.
  // We provide a plan-shaped object via project.componentsState and avoid Groq by not letting it be called:
  // Instead we directly validate + emit by calling generateArtifactsFromRegistry with a fake plan is not supported.
  // So here we simulate by calling validatePlan + manual emission expectations on sketch helper behavior:
  // We run the real function only if GROQ_API_KEY is present; otherwise skip.

  if (!process.env.GROQ_API_KEY) {
    return;
  }

  const project = {
    description: "Clock with 2 steppers",
    meta: {},
    ideaState: {},
    componentsState: {}
  };

  const generated = await generateArtifactsFromRegistry({
    project,
    userPrompt: "Use ARDUINO_MEGA and one STEPPER_MOTOR driven by one A4988_DRIVER. Connect motor coils to driver (1B/1A/2A/2B). Connect STEP to pin 9 and DIR to pin 10. Connect RESET to SLEEP. Do not connect VCC/GND to the motor."
  });

  assert.ok(generated?.diagramJson?.parts?.some((p) => p.type === "wokwi-stepper-motor"));
  assert.ok(String(generated.sketchIno).includes("A4988 stepper-driver scaffold"));
});

test("safeParseJson repair: tolerates trailing commas in AI plan JSON", async () => {
  if (!process.env.GROQ_API_KEY) return;

  const project = {
    description: "Repair parse test",
    meta: {},
    ideaState: {},
    componentsState: {}
  };

  // Force the model to respond with a JSON array that often gets trailing commas.
  // Even if the model behaves, our repair layer must not break valid JSON.
  const generated = await generateArtifactsFromRegistry({
    project,
    userPrompt: "Return ONLY plan JSON. Include a components array of exactly 1 item and add a trailing comma after that item (this is intentional for parser robustness testing). Use board ARDUINO_MEGA."
  });

  assert.ok(generated?.diagramJson);
});

