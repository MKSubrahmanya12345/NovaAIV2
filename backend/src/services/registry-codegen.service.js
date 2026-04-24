import Groq from "groq-sdk";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRegistry, getAIContext } from "./registry.service.js";

let GROQ_CLIENT = null;
const getGroqClient = () => {
  if (GROQ_CLIENT) return GROQ_CLIENT;
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    // Important: keep module importable for offline validation/tests.
    // We only require GROQ_API_KEY when actually calling the model.
    throw new Error("GROQ_API_KEY is missing (required only for plan generation).");
  }
  GROQ_CLIENT = new Groq({ apiKey });
  return GROQ_CLIENT;
};

const stripThinking = (value = "") => {
  return String(value || "")
    // Strip both closed and unclosed <think> blocks (some models omit </think>)
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "")
    .trim();
};

const stripJsonComments = (value = "") => {
  // AI sometimes returns "JSON" with JS-style comments. JSON doesn't allow them.
  // We strip full-line comments and block comments as a best-effort recovery.
  // (Not a full JSON tokenizer; good enough for our plan JSON contract.)
  return String(value || "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
};

const normalizeJsonishText = (value = "") => {
  return String(value || "")
    // smart quotes → normal quotes
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
};

const stripTrailingCommas = (value = "") => {
  // Common LLM mistake: trailing commas before } or ]
  return String(value || "").replace(/,(\s*[}\]])/g, "$1");
};

const extractFirstBalancedObject = (value = "") => {
  const text = String(value || "");
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === "}") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
};

const safeParseJson = (text = "") => {
  const cleaned = stripTrailingCommas(stripJsonComments(normalizeJsonishText(stripThinking(text))));
  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonBlock = cleaned.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonBlock?.[1]) {
      const candidate = stripTrailingCommas(stripJsonComments(normalizeJsonishText(jsonBlock[1])));
      return JSON.parse(candidate);
    }
    const balanced = extractFirstBalancedObject(cleaned);
    if (balanced) {
      const candidate = stripTrailingCommas(stripJsonComments(normalizeJsonishText(balanced)));
      return JSON.parse(candidate);
    }
    throw new Error("AI response parsing failed");
  }
};

const callAI = async (prompt) => {
  const groq = getGroqClient();
  const model = process.env.GROQ_MODEL || "gpt-4o";

  // Prefer Groq structured outputs when available; otherwise fall back to prompt-only.
  const baseArgs = {
    model,
    messages: [
      { role: "system", content: "Return ONLY valid JSON. No markdown. No prose. No <think>." },
      { role: "user", content: prompt }
    ],
    temperature: 0
  };

  let res;
  try {
    res = await groq.chat.completions.create({
      ...baseArgs,
      response_format: { type: "json_object" }
    });
  } catch {
    res = await groq.chat.completions.create(baseArgs);
  }

  return String(res.choices?.[0]?.message?.content || "").trim();
};

const getPresetDir = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../data/presets");
};

const buildServoOverdonePreset = () => {
  const presetDir = path.join(getPresetDir(), "servo-overdone");
  const sketchIno = readFileSync(path.join(presetDir, "servo.ino"), "utf8");
  const diagramRaw = readFileSync(path.join(presetDir, "diagram.json"), "utf8");
  const diagramJson = JSON.parse(diagramRaw);

  return {
    sketchIno,
    diagramJson,
    notes: ["Hardcoded preset: 32 dancing servos (ServoOverdone)."],
    plan: null
  };
};

const defaultAttrsFor = (registryDef) => {
  const attrs = registryDef?.attrs && typeof registryDef.attrs === "object" ? registryDef.attrs : {};
  return Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, v?.default ?? null]));
};

const pickDefaultBoardKey = (registry) => {
  const entries = Object.entries(registry || {});
  const controllers = entries.filter(([, def]) => String(def?.category || "").toLowerCase() === "controller");
  if (controllers.length === 1) return controllers[0][0];
  if (controllers.length > 1) return controllers[0][0];
  if (entries.length > 0) return entries[0][0];
  return "";
};

const computeLayout = (count) => {
  const cols = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(Math.max(1, count)))));
  const gapX = 170;
  const gapY = 140;
  const startX = 140;
  const startY = 90;
  return { cols, gapX, gapY, startX, startY };
};

const generateParts = (registry, plan) => {
  const items = Array.isArray(plan?.components) ? plan.components : [];
  const { cols, gapX, gapY, startX, startY } = computeLayout(items.length + 1);

  const parts = [];

  const boardKey = plan?.board?.type || "";
  const boardDef = registry[boardKey];
  if (!boardDef) {
    throw new Error(`Board type not found in registry: ${boardKey || "(empty)"}`);
  }

  parts.push({
    type: boardDef.wokwiType,
    id: String(plan?.board?.id || "board"),
    top: Number.isFinite(plan?.board?.top) ? plan.board.top : 270,
    left: Number.isFinite(plan?.board?.left) ? plan.board.left : 185,
    attrs: {
      ...defaultAttrsFor(boardDef),
      ...(plan?.board?.attrs && typeof plan.board.attrs === "object" ? plan.board.attrs : {})
    }
  });

  items.forEach((comp, idx) => {
    const def = registry[comp.type];
    if (!def) {
      throw new Error(`Component type not found in registry: ${comp.type || "(empty)"}`);
    }
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    parts.push({
      type: def.wokwiType,
      id: String(comp.id || `${comp.type.toLowerCase()}${idx + 1}`),
      top: Number.isFinite(comp.top) ? comp.top : startY + row * gapY,
      left: Number.isFinite(comp.left) ? comp.left : startX + col * gapX,
      rotate: Number.isFinite(comp.rotate) ? comp.rotate : undefined,
      attrs: {
        ...defaultAttrsFor(def),
        ...(comp.attrs && typeof comp.attrs === "object" ? comp.attrs : {})
      }
    });
  });

  return parts.map((p) => {
    const cleaned = { ...p };
    if (cleaned.rotate === undefined) delete cleaned.rotate;
    return cleaned;
  });
};

const validatePinExists = (registry, compType, pinName) => {
  const def = registry[compType];
  if (!def) throw new Error(`Unknown component type: ${compType}`);
  const pins = Array.isArray(def.pins) ? def.pins.map((p) => p.name) : [];
  if (!pins.includes(pinName)) {
    throw new Error(`Invalid pin "${pinName}" for component "${compType}"`);
  }
};

export const validatePlan = (registry, plan) => {
  const errors = [];

  const add = (msg) => errors.push(String(msg));
  if (!plan || typeof plan !== "object") {
    add("plan must be an object");
    return { ok: false, errors };
  }

  if (!plan.board || typeof plan.board !== "object") {
    add("plan.board is required");
  } else {
    if (!plan.board.type) add("plan.board.type is required");
    if (!plan.board.id) add("plan.board.id is required");
    if (plan.board.type && !registry[plan.board.type]) add(`board type not in registry: ${plan.board.type}`);
  }

  const components = Array.isArray(plan.components) ? plan.components : [];
  const ids = new Map();

  const register = (type, id) => {
    if (!type || !id) return;
    if (ids.has(id)) add(`duplicate id: ${id}`);
    ids.set(id, type);
  };

  if (plan.board?.type && plan.board?.id) register(plan.board.type, plan.board.id);

  components.forEach((c, idx) => {
    if (!c || typeof c !== "object") return add(`component at index ${idx} must be an object`);
    if (!c.type) add(`component[${idx}].type is required`);
    if (!c.id) add(`component[${idx}].id is required`);
    if (c.type && !registry[c.type]) add(`component type not in registry: ${c.type}`);
    if (c.type && c.id) register(c.type, c.id);
  });

  const wires = Array.isArray(plan.connections) ? plan.connections : [];

  const isNumericPin = (pin) => {
    const n = Number(pin);
    return Number.isFinite(n) && String(pin).trim() === String(n);
  };

  const isWireBetween = (a, b) => {
    // endpoints are {type,id,pin}
    if (!a || !b) return false;
    return (
      (a.type === b.type && a.id === b.id && a.pin === b.pin)
    );
  };

  const hasConnection = (end1, end2) => {
    for (const w of wires) {
      const from = w?.from;
      const to = w?.to;
      if (!from || !to) continue;
      const matchDirect = isWireBetween(from, end1) && isWireBetween(to, end2);
      const matchReverse = isWireBetween(from, end2) && isWireBetween(to, end1);
      if (matchDirect || matchReverse) return true;
    }
    return false;
  };

  const hasAnyConnectionToPin = (componentType, componentId, componentPin) => {
    for (const w of wires) {
      const from = w?.from;
      const to = w?.to;
      if (!from || !to) continue;
      const a = from.type === componentType && from.id === componentId && from.pin === componentPin;
      const b = to.type === componentType && to.id === componentId && to.pin === componentPin;
      if (a || b) return true;
    }
    return false;
  };

  const boardEndForPin = (pin) => ({
    type: plan.board?.type,
    id: plan.board?.id,
    pin
  });

  const findBoardPinFor = (componentType, componentId, componentPin) => {
    for (const w of wires) {
      const from = w?.from;
      const to = w?.to;
      if (!from || !to) continue;

      const aIsTarget = from.type === componentType && from.id === componentId && from.pin === componentPin;
      const bIsTarget = to.type === componentType && to.id === componentId && to.pin === componentPin;

      if (aIsTarget && to.type === plan.board?.type && to.id === plan.board?.id) return to.pin;
      if (bIsTarget && from.type === plan.board?.type && from.id === plan.board?.id) return from.pin;
    }
    return null;
  };
  wires.forEach((w, idx) => {
    const from = w?.from;
    const to = w?.to;
    if (!from || !to) return add(`connection[${idx}] must include from and to`);
    if (!from.type || !from.id || !from.pin) add(`connection[${idx}].from must include type,id,pin`);
    if (!to.type || !to.id || !to.pin) add(`connection[${idx}].to must include type,id,pin`);

    if (from?.id && ids.get(from.id) && from.type && ids.get(from.id) !== from.type) {
      add(`connection[${idx}].from type mismatch for id ${from.id}`);
    }
    if (to?.id && ids.get(to.id) && to.type && ids.get(to.id) !== to.type) {
      add(`connection[${idx}].to type mismatch for id ${to.id}`);
    }

    if (from?.type && from?.pin) {
      try { validatePinExists(registry, from.type, from.pin); } catch (e) { add(`connection[${idx}].from: ${e.message}`); }
    }
    if (to?.type && to?.pin) {
      try { validatePinExists(registry, to.type, to.pin); } catch (e) { add(`connection[${idx}].to: ${e.message}`); }
    }
  });

  // Stepper policy: STEPPER_MOTOR must be driven via A4988_DRIVER
  const planComponents = Array.isArray(plan.components) ? plan.components : [];
  const steppers = planComponents.filter((c) => c?.type === "STEPPER_MOTOR");
  const drivers = planComponents.filter((c) => c?.type === "A4988_DRIVER");

  if (steppers.length > 0 && drivers.length !== steppers.length) {
    add(`stepper policy: expected exactly 1 A4988_DRIVER per STEPPER_MOTOR (steppers=${steppers.length}, drivers=${drivers.length})`);
  }

  // Pair steppers to drivers by wiring signature (4 coil wires).
  const unusedDrivers = new Set(drivers.map((d) => d.id));
  const coilPairs = [
    ["2B", "A-"],
    ["2A", "A+"],
    ["1A", "B+"],
    ["1B", "B-"]
  ];

  for (const stepper of steppers) {
    const stepperId = stepper?.id;
    if (!stepperId) continue;

    let matchedDriverId = null;

    for (const driver of drivers) {
      if (!unusedDrivers.has(driver.id)) continue;
      const driverId = driver?.id;
      if (!driverId) continue;

      const ok = coilPairs.every(([driverPin, motorPin]) =>
        hasConnection(
          { type: "A4988_DRIVER", id: driverId, pin: driverPin },
          { type: "STEPPER_MOTOR", id: stepperId, pin: motorPin }
        )
      );

      if (ok) {
        matchedDriverId = driverId;
        break;
      }
    }

    if (!matchedDriverId) {
      add(`stepper policy: STEPPER_MOTOR "${stepperId}" is missing required A4988 coil wiring (1B/1A/2A/2B -> B-/B+/A+/A-)`);
      continue;
    }

    unusedDrivers.delete(matchedDriverId);

    // Ensure STEP/DIR are wired to board numeric pins.
    const stepPin = findBoardPinFor("A4988_DRIVER", matchedDriverId, "STEP");
    const dirPin = findBoardPinFor("A4988_DRIVER", matchedDriverId, "DIR");

    if (!stepPin || !isNumericPin(stepPin)) add(`stepper policy: driver "${matchedDriverId}" STEP must connect to a numeric board pin`);
    if (!dirPin || !isNumericPin(dirPin)) add(`stepper policy: driver "${matchedDriverId}" DIR must connect to a numeric board pin`);

    // Recommend RESET<->SLEEP; not required by validator, but we can enforce presence as a quality gate.
    const hasResetSleep = hasConnection(
      { type: "A4988_DRIVER", id: matchedDriverId, pin: "RESET" },
      { type: "A4988_DRIVER", id: matchedDriverId, pin: "SLEEP" }
    );
    if (!hasResetSleep) {
      add(`stepper policy: driver "${matchedDriverId}" should connect RESET to SLEEP`);
    }
  }

  // Seven-segment completeness policy (SEVEN_SEGMENT_4)
  const sevenSeg4s = planComponents.filter((c) => c?.type === "SEVEN_SEGMENT_4");
  const requiredSegPins = ["A", "B", "C", "D", "E", "F", "G"];
  const requiredDigPins = ["DIG1", "DIG2", "DIG3", "DIG4"];

  for (const seg of sevenSeg4s) {
    const segId = String(seg?.id || "").trim();
    if (!segId) continue;

    for (const pin of [...requiredDigPins, ...requiredSegPins, "COM"]) {
      if (!hasAnyConnectionToPin("SEVEN_SEGMENT_4", segId, pin)) {
        add(`seven-seg policy: SEVEN_SEGMENT_4 "${segId}" missing required connection for pin "${pin}"`);
      }
    }

    const colonEnabled = Boolean(seg?.attrs && typeof seg.attrs === "object" && seg.attrs.colon === true);
    const hasCln = hasAnyConnectionToPin("SEVEN_SEGMENT_4", segId, "CLN");
    if (colonEnabled && !hasCln) {
      add(`seven-seg policy: SEVEN_SEGMENT_4 "${segId}" colon=true requires CLN to be wired`);
    }
    if (!colonEnabled && hasCln) {
      add(`seven-seg policy: SEVEN_SEGMENT_4 "${segId}" colon is false/missing, so CLN must not be wired`);
    }
  }

  return { ok: errors.length === 0, errors };
};

const generateConnections = (registry, plan) => {
  const wires = Array.isArray(plan?.connections) ? plan.connections : [];
  return wires.map((w, idx) => {
    const from = w?.from;
    const to = w?.to;
    if (!from?.type || !from?.pin || !to?.type || !to?.pin) {
      throw new Error(`Invalid connection at index ${idx}`);
    }

    validatePinExists(registry, from.type, from.pin);
    validatePinExists(registry, to.type, to.pin);

    const color = String(w?.color || "green");
    const route = Array.isArray(w?.route) ? w.route : [];
    return [
      `${from.id}:${from.pin}`,
      `${to.id}:${to.pin}`,
      color,
      route
    ];
  });
};

const buildPlanPrompt = ({ project, userPrompt, registryContext, defaultBoardKey }) => {
  return `
You are a strict hardware planning assistant.

Goal:
Return a SMALL JSON plan that selects components FROM THE REGISTRY and wires them.
Do not output sketch.ino or diagram.json directly.

Rules:
- You can ONLY use component "type" values that exist in the REGISTRY CONTEXT list (use the "name" field as the type key).
- Pins must be chosen from that component's pin list.
- If the user asks for a board, pick it if it exists in the registry. Otherwise choose a reasonable default.
- If the prompt is ambiguous, make safe defaults and write a note in notes[].
- Return ONLY valid JSON. No markdown. No prose. No trailing commas. NO COMMENTS (no // or /* */).

Component rules (must follow):
- STEPPER_MOTOR has NO power pins. Never connect STEPPER_MOTOR to VCC/5V/GND.
- If any STEPPER_MOTOR is present, you MUST include exactly one A4988_DRIVER per motor.
- Wire each driver to its motor coils:
  - A4988_DRIVER:2B -> STEPPER_MOTOR:A-
  - A4988_DRIVER:2A -> STEPPER_MOTOR:A+
  - A4988_DRIVER:1A -> STEPPER_MOTOR:B+
  - A4988_DRIVER:1B -> STEPPER_MOTOR:B-
- Wire each driver control pins to the board:
  - A4988_DRIVER:STEP -> board numeric pin
  - A4988_DRIVER:DIR -> board numeric pin
- For power, use the driver pins (optional but preferred):
  - A4988_DRIVER:VDD -> board 5V / 5V.1 / 5V.2
  - A4988_DRIVER:GND -> board GND.1 / GND.2 / GND.3 / etc.
- Connect A4988_DRIVER:RESET to A4988_DRIVER:SLEEP (no board pin required).
- SEVEN_SEGMENT_4 minimum wiring completeness:
  - If you include a component with type SEVEN_SEGMENT_4, you MUST wire ALL of: DIG1,DIG2,DIG3,DIG4 and segments A,B,C,D,E,F,G and COM.
  - CLN is OPTIONAL: only wire CLN if attrs.colon is true. If attrs.colon is false/missing, do NOT wire CLN.

REGISTRY CONTEXT (compressed):
${JSON.stringify(registryContext)}

OUTPUT SHAPE (STRICT):
{
  "board": { "type": "${defaultBoardKey}", "id": "board", "top": 270, "left": 185, "attrs": {} },
  "components": [
    { "type": "", "id": "", "attrs": {}, "top": 0, "left": 0, "rotate": 0 }
  ],
  "connections": [
    {
      "from": { "type": "", "id": "", "pin": "" },
      "to": { "type": "", "id": "", "pin": "" },
      "color": "green",
      "route": []
    }
  ],
  "notes": []
}

PROJECT DESCRIPTION:
${project?.description || ""}

PROJECT META:
${JSON.stringify(project?.meta || {})}

IDEATION STATE:
${JSON.stringify(project?.ideaState || {})}

COMPONENTS STATE:
${JSON.stringify(project?.componentsState || {})}

USER REQUEST:
${userPrompt || ""}
`;
};

export async function generateArtifactsFromRegistry({ project, userPrompt = "" }) {
  // Deterministic preset(s): no AI call.
  const promptText = String(userPrompt || "");
  const ideationSummary = String(project?.ideaState?.summary || "");
  const meta = project?.meta || {};
  const looksLikeServoOverdone =
    /\b32 dancing servos\b/i.test(promptText)
    || /\bservooverdone\b/i.test(ideationSummary)
    || (
      String(meta?.board || "") === "ARDUINO_MEGA"
      && Number(meta?.componentCount) === 32
      && String(meta?.stage || "") !== "idea"
    );

  if (looksLikeServoOverdone) {
    return buildServoOverdonePreset();
  }

  const registry = getRegistry();
  const registryContext = getAIContext();
  const defaultBoardKey = pickDefaultBoardKey(registry);
  if (!defaultBoardKey) {
    throw new Error("componentRegistry is empty; add at least one controller component.");
  }

  const planPrompt = buildPlanPrompt({ project, userPrompt, registryContext, defaultBoardKey });
  const raw = await callAI(planPrompt);
  let plan;
  try {
    plan = safeParseJson(raw);
  } catch (err) {
    const excerpt = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 600);
    console.error("Plan AI raw output (excerpt):", excerpt);
    throw new Error(`AI response parsing failed. Excerpt: ${excerpt || "(empty)"}`);
  }

  // Normalize board defaults if model omitted.
  const boardType = plan?.board?.type || defaultBoardKey;
  const boardId = String(plan?.board?.id || "board");
  const normalizedPlan = {
    ...plan,
    board: {
      type: boardType,
      id: boardId,
      top: Number.isFinite(plan?.board?.top) ? plan.board.top : 270,
      left: Number.isFinite(plan?.board?.left) ? plan.board.left : 185,
      attrs: plan?.board?.attrs && typeof plan.board.attrs === "object" ? plan.board.attrs : {}
    },
    components: Array.isArray(plan?.components) ? plan.components : [],
    connections: Array.isArray(plan?.connections) ? plan.connections : [],
    notes: Array.isArray(plan?.notes) ? plan.notes.map((n) => String(n)) : []
  };

  const validation = validatePlan(registry, normalizedPlan);
  if (!validation.ok) {
    throw new Error(`Plan validation failed: ${validation.errors.join(" | ")}`);
  }

  // Generate diagram from plan + registry.
  const parts = generateParts(registry, normalizedPlan);
  const connections = generateConnections(registry, {
    ...normalizedPlan,
    // Ensure board id is consistent for connection building.
    board: { ...normalizedPlan.board, id: normalizedPlan.board.id }
  });

  // Minimal sketch: keep deterministic and prompt-agnostic.
  // If we recognize a supported actuator pattern (e.g., stepper motor), emit a runnable demo scaffold.
  const wireComments = (Array.isArray(normalizedPlan.connections) ? normalizedPlan.connections : [])
    .map((w) => {
      const from = w?.from ? `${w.from.id}:${w.from.pin}` : "";
      const to = w?.to ? `${w.to.id}:${w.to.pin}` : "";
      return from && to ? `// - ${from} -> ${to}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const boardIdForSketch = normalizedPlan.board.id;
  const components = Array.isArray(normalizedPlan.components) ? normalizedPlan.components : [];
  const wires = Array.isArray(normalizedPlan.connections) ? normalizedPlan.connections : [];

  const isBoardEndpoint = (ep) => ep?.id === boardIdForSketch && ep?.type === normalizedPlan.board.type;

  const getBoardPinConnectedTo = (componentId, componentType, componentPin) => {
    // Find a wire between board and the component pin; return the board's pin name.
    for (const w of wires) {
      const from = w?.from;
      const to = w?.to;
      if (!from || !to) continue;

      const aIsTarget = from.id === componentId && from.type === componentType && from.pin === componentPin;
      const bIsTarget = to.id === componentId && to.type === componentType && to.pin === componentPin;

      if (aIsTarget && isBoardEndpoint(to)) return to.pin;
      if (bIsTarget && isBoardEndpoint(from)) return from.pin;
    }
    return null;
  };

  const drivers = components.filter((c) => c?.type === "A4988_DRIVER");
  const a4988Sketch = (() => {
    if (drivers.length === 0) return null;

    const resolved = drivers
      .map((d) => {
        const id = String(d.id || "").trim();
        if (!id) return null;
        const step = getBoardPinConnectedTo(id, "A4988_DRIVER", "STEP");
        const dir = getBoardPinConnectedTo(id, "A4988_DRIVER", "DIR");
        const en = getBoardPinConnectedTo(id, "A4988_DRIVER", "ENABLE"); // optional

        const stepN = step != null ? Number(step) : NaN;
        const dirN = dir != null ? Number(dir) : NaN;
        const enN = en != null ? Number(en) : NaN;

        if (!Number.isFinite(stepN) || !Number.isFinite(dirN)) return { id, ok: false, pins: { step, dir, en } };
        return { id, ok: true, pins: { step: stepN, dir: dirN, en: Number.isFinite(enN) ? enN : null } };
      })
      .filter(Boolean);

    const ok = resolved.filter((d) => d.ok);
    if (ok.length === 0) return null;

    const decls = ok
      .map((d, idx) => {
        const enLine = d.pins.en != null ? `const int D${idx}_EN = ${d.pins.en};\n` : "";
        return `const int D${idx}_STEP = ${d.pins.step};\nconst int D${idx}_DIR = ${d.pins.dir};\n${enLine}`;
      })
      .join("\n");

    const setupLines = ok
      .map((d, idx) => {
        const lines = [
          `  pinMode(D${idx}_STEP, OUTPUT);`,
          `  pinMode(D${idx}_DIR, OUTPUT);`,
          `  digitalWrite(D${idx}_STEP, LOW);`,
          `  digitalWrite(D${idx}_DIR, LOW);`
        ];
        if (d.pins.en != null) {
          lines.push(`  pinMode(D${idx}_EN, OUTPUT);`);
          lines.push(`  digitalWrite(D${idx}_EN, LOW); // ENABLE is active-low`);
        }
        return lines.join("\n");
      })
      .join("\n\n");

    const loopPulse = ok
      .map((_, idx) => `  digitalWrite(D${idx}_STEP, HIGH);\n  delayMicroseconds(400);\n  digitalWrite(D${idx}_STEP, LOW);`)
      .join("\n\n");

    const loopDirFlip = ok
      .map((_, idx) => `  if ((steps % 200) == 0) digitalWrite(D${idx}_DIR, !digitalRead(D${idx}_DIR));`)
      .join("\n");

    return `// Generated by HardCode
// A4988 stepper-driver scaffold (derived from validated registry wiring).
${wireComments ? `\n// Wiring plan:\n${wireComments}\n` : ""}

${decls}
long steps = 0;

void setup() {
  Serial.begin(9600);
${setupLines ? `\n${setupLines}\n` : ""}
}

void loop() {
${loopPulse}
  steps++;
${loopDirFlip ? `\n${loopDirFlip}\n` : ""}
  delay(2);
}
`;
  })();

  const sketchIno = a4988Sketch || `// Generated by HardCode\n// This is a minimal scaffold. Add behavior based on your wiring plan.\n${wireComments ? `\n// Wiring plan:\n${wireComments}\n` : ""}\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  delay(100);\n}\n`;

  return {
    sketchIno,
    diagramJson: {
      version: 1,
      author: "HardCode AI",
      editor: "wokwi",
      parts,
      connections,
      dependencies: {}
    },
    notes: [
      ...normalizedPlan.notes,
      "Generated via registry-plan pipeline: AI produced a small plan, backend validated with full registry and generated diagram.json."
    ],
    plan: normalizedPlan
  };
}

