import test from "node:test";
import assert from "node:assert/strict";

import { normalizeArchitectureState, safeParse } from "./ai.services.js";

test("safeParse: recovers fenced JSON with comments and trailing commas", () => {
  const parsed = safeParse(`
Here is the result:
\`\`\`json
{
  // architecture-aware ideation payload
  "summary": "Safe lock system",
  "requirements": ["Use keypad", "Use servo",],
  "unknowns": [],
  "question": "",
  "assistantReply": "Ready for components",
}
\`\`\`
`);

  assert.equal(parsed.summary, "Safe lock system");
  assert.deepEqual(parsed.requirements, ["Use keypad", "Use servo"]);
  assert.equal(parsed.assistantReply, "Ready for components");
});

test("normalizeArchitectureState: infers multi-file modular architecture for complex hardware projects", () => {
  const project = {
    description: "Arduino keypad LCD servo safe with password states and lock control",
    meta: {
      componentCount: 8
    },
    componentsState: {
      architecture: ""
    }
  };

  const architecture = normalizeArchitectureState({}, {
    project,
    summary: "Build a keypad-controlled safe with LCD prompts and servo lock actuation",
    requirements: [
      "Use an Arduino Uno",
      "Use a 4x4 keypad for input",
      "Use a 16x2 LCD for prompts",
      "Use a servo for the lock mechanism",
      "Track locked, unlock, and reset states"
    ],
    unknowns: []
  });

  assert.equal(architecture.sourceStrategy, "multi-file-modular");
  assert.equal(architecture.entryFile, "sketch.ino");
  assert.equal(architecture.pattern, "finite-state-machine");
  assert.ok(architecture.files.some((file) => file.path === "diagram.json"));
  assert.ok(architecture.files.some((file) => file.path === "libraries.txt"));
  assert.ok(architecture.libraries.some((item) => item.name === "Keypad"));
  assert.ok(architecture.libraries.some((item) => item.name === "LiquidCrystal"));
  assert.ok(architecture.libraries.some((item) => item.name === "Servo"));
});

test("normalizeArchitectureState: preserves explicit architecture plan details", () => {
  const architecture = normalizeArchitectureState({
    summary: "Use dedicated modules for IO and state transitions",
    pattern: "finite-state-machine",
    sourceStrategy: "multi-file-modular",
    entryFile: "main.ino",
    files: [
      {
        path: "main.ino",
        role: "entrypoint",
        responsibility: "Boot the app"
      },
      {
        path: "LockController.cpp",
        role: "module-logic",
        responsibility: "Run lock state transitions"
      }
    ],
    libraries: [
      {
        name: "Keypad",
        purpose: "Scan keypad input"
      }
    ],
    pinAssignments: [
      {
        component: "servo",
        signal: "lock-control",
        boardPin: "9",
        notes: "PWM output"
      }
    ],
    runtimeFlow: ["Read keypad", "Update state", "Drive servo"],
    assumptions: ["Pin 9 remains reserved for servo output"],
    openDecisions: []
  }, {
    project: {
      description: "Lock project"
    },
    summary: "Lock project",
    requirements: [],
    unknowns: ["Need keypad layout"]
  });

  assert.equal(architecture.entryFile, "main.ino");
  assert.equal(architecture.files.length, 2);
  assert.equal(architecture.pinAssignments[0].boardPin, "9");
  assert.deepEqual(architecture.runtimeFlow, ["Read keypad", "Update state", "Drive servo"]);
  assert.deepEqual(architecture.assumptions, ["Pin 9 remains reserved for servo output"]);
});
