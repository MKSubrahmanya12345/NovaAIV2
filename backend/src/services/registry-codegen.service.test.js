import test from "node:test";
import assert from "node:assert/strict";

import { getRegistry } from "./registry.service.js";
import { validatePlan, generateArtifactsFromRegistry } from "./registry-codegen.service.js";

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

test("stepper motor registry: pins and attrs match expected Wokwi contract", () => {
  const registry = getRegistry();
  const stepper = registry.STEPPER_MOTOR;

  assert.ok(stepper, "STEPPER_MOTOR missing from registry");
  assert.equal(stepper.wokwiType, "wokwi-stepper-motor");
  assert.equal(stepper.category, "actuator");

  const pinNames = (stepper.pins || []).map((p) => p.name);
  assert.deepEqual(pinNames, ["A-", "A+", "B+", "B-"]);

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

test("validatePlan: enforces CLN wiring only when colon is enabled", () => {
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

  const ok1 = validatePlan(registry, planColonOn);
  assert.equal(ok1.ok, true);

  const planColonOffButWired = {
    ...planColonOn,
    components: [{ type: "SEVEN_SEGMENT_4", id: "display", attrs: { colon: false } }]
  };

  const bad = validatePlan(registry, planColonOffButWired);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes("CLN must not be wired")));
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

