import Groq from "groq-sdk";
import { buildWokwiEvidenceText } from "./wokwi-runner.service.js";
import { formatWokwiComponentCatalogForPrompt, findUnsupportedPartTypesInText } from "../lib/wokwi-components.js";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const cleanArray = (value) => {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map(item => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  )];
};

const stripThinking = (value = "") => {
  return String(value)
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
};

const normalizeQuestionText = (value = "") => {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const isIdeaOnlyRequest = (text = "") => {
  const value = String(text).toLowerCase();
  return /(what can i do|just idea|just ideas|give me ideas|suggest ideas|only idea|high level|high level only|just tell me high level|in short|summarize)/i.test(value);
};

const isTransitionToComponentsRequest = (text = "") => {
  return /(go to components|components section|move to components|switch to components)/i.test(String(text).toLowerCase());
};

const buildFallbackIdeationReply = ({ summary, requirements, unknowns, question, userInput }) => {
  if (isTransitionToComponentsRequest(userInput)) {
    if (unknowns.length === 0) {
      return "Ideation is finalized. Open the Components section to get wiring, connections, and expected output details.";
    }

    const topUnknowns = unknowns.slice(0, 3).join(", ");
    return `Before Components section, I still need: ${topUnknowns}. If you want, I can assume safe defaults and continue.`;
  }

  if (isIdeaOnlyRequest(userInput)) {
    if (summary) {
      return `High level: ${summary}`;
    }

    if (requirements.length > 0) {
      return `High level idea: ${requirements.slice(0, 4).join("; ")}`;
    }

    if (unknowns.length > 0) {
      return `High level idea: use the known parts to build a simple, safe concept and defer implementation details until later.`;
    }
  }

  if (question) {
    return question;
  }

  if (unknowns.length > 0) {
    return `We can continue with assumptions. The most important open detail is: ${unknowns[0]}.`;
  }

  return "Ideation is updated with practical assumptions. Continue in Components section for implementation details.";
};

const applyIdeationGuards = (project, userInput, output) => {
  const sanitized = { ...output };

  const recentAiMessages = (project.messages || [])
    .filter(m => m.role === "ai")
    .slice(-3)
    .map(m => normalizeQuestionText(m.content));

  const normalizedQuestion = normalizeQuestionText(sanitized.question);
  const repeatedQuestion = Boolean(normalizedQuestion) && recentAiMessages.includes(normalizedQuestion);

  if (repeatedQuestion) {
    sanitized.question = "";
  }

  const genericReply = /^ideation state updated\.?$/i.test(sanitized.assistantReply || "");
  if (!sanitized.assistantReply || genericReply || repeatedQuestion) {
    sanitized.assistantReply = buildFallbackIdeationReply({
      summary: sanitized.summary,
      requirements: sanitized.requirements,
      unknowns: sanitized.unknowns,
      question: sanitized.question,
      userInput
    });
  }

  return sanitized;
};

/*
UTIL: safe JSON parse
*/
const safeParse = (text) => {
  const cleaned = stripThinking(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    // try to extract JSON block
    const jsonBlock = cleaned.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonBlock?.[1]) {
      try {
        return JSON.parse(jsonBlock[1]);
      } catch {}
    }

    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    throw new Error("AI response parsing failed");
  }
};

/*
COMMON CALL
*/
const callAI = async (prompt) => {
  const res = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2
  });

  return res.choices[0].message.content.trim();
};

const normalizeIdeationOutput = (raw, userInput, fallbackQuestion = "Please provide the most important missing detail so I can continue.") => {
  const summary = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  const requirements = cleanArray(raw?.requirements);
  const unknowns = cleanArray(raw?.unknowns);

  let question = typeof raw?.question === "string" ? raw.question.trim() : "";
  let assistantReply = typeof raw?.assistantReply === "string" ? raw.assistantReply.trim() : "";

  if (!assistantReply) {
    const alternateReply = typeof raw?.reply === "string" ? raw.reply.trim() : "";
    assistantReply = alternateReply;
  }

  if (unknowns.length > 0 && !question) {
    question = fallbackQuestion;
  }

  if (!assistantReply) {
    assistantReply = question || "I updated the ideation context with practical defaults.";
  }

  if (isIdeaOnlyRequest(userInput)) {
    assistantReply = buildFallbackIdeationReply({
      summary,
      requirements,
      unknowns,
      question,
      userInput
    });
    question = "";
  } else if (unknowns.length === 0 && !question) {
    assistantReply = assistantReply || "Ideation is finalized. Switch to the Components section for wiring, implementation steps, and expected output behavior.";
  }

  return {
    summary,
    requirements,
    unknowns,
    question,
    assistantReply
  };
};

const enforceCatalogForIdeation = (output) => {
  const combinedText = [
    output.summary,
    ...(output.requirements || []),
    output.assistantReply,
    output.question
  ].join("\n");

  const unsupportedPartTypes = findUnsupportedPartTypesInText(combinedText);
  if (unsupportedPartTypes.length === 0) {
    return output;
  }

  const unsupportedLabel = unsupportedPartTypes.join(", ");

  return {
    ...output,
    unknowns: cleanArray([
      ...(output.unknowns || []),
      `Unsupported Wokwi part types referenced: ${unsupportedLabel}`
    ]),
    question: output.question || "Should I replace the unsupported parts with closest supported Wokwi alternatives?",
    assistantReply: `I found unsupported Wokwi part types in the plan (${unsupportedLabel}). I will only use supported Wokwi components, or a custom chip with chip-<name> once you define it in wokwi.toml with matching .chip.json/.wasm files.`
  };
};

const enforceCatalogForComponents = (output) => {
  const combinedText = [
    output.architecture,
    ...(output.components || []),
    ...(output.apiEndpoints || []),
    output.reply
  ].join("\n");

  const unsupportedPartTypes = findUnsupportedPartTypesInText(combinedText);
  if (unsupportedPartTypes.length === 0) {
    return output;
  }

  const unsupportedLabel = unsupportedPartTypes.join(", ");

  return {
    ...output,
    reply: `${output.reply}\n\nConstraint check: unsupported Wokwi part types detected (${unsupportedLabel}). Please switch these to supported parts, or define custom chips as chip-<name> with wokwi.toml + .chip.json/.wasm.`
  };
};

/*
========================
IDEATION (your original upgraded)
========================
*/
export const processInput = async (project, userInput) => {

  const messagesText = project.messages
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = `
You are a hardware system design AI.

You MUST behave like a strict engineer.

GOAL:
Convert a vague idea into a COMPLETE, BUILDABLE hardware system.

ADDITIONAL BEHAVIOR:
- If user asks for ideas with specific parts (example: "3 LEDs, Arduino, small display"), propose concrete feasible ideas with those exact constraints.
- If constraints are unrealistic or too limited, clearly explain why and propose the smallest viable changes.
- If user says "you decide", choose practical defaults and explicitly document those defaults in requirements.
- If user asks "what can I do" or "just idea", provide 3 practical concept options based on known parts and avoid blocking on fine-grained electrical specs.
- Keep ideation conceptual. Do NOT provide step-by-step wiring, pin mapping, resistor calculations, or circuit completion instructions in ideation mode.
- If user asks implementation details in ideation mode, provide high-level behavior only and direct them to Components section for build details.
- If user asks to move to Components section:
  - If unknowns are empty: confirm ideation finalized and direct them to Components section.
  - If unknowns remain: clearly list top missing details instead of generic status text.

PROCESS (MANDATORY):
1. Understand user input
2. Update structured state
3. Identify gaps (unknowns)
4. Remove resolved unknowns
5. Add new unknowns if needed
6. If unknowns remain, ask EXACTLY ONE next question (most critical gap)
7. If unknowns are empty, finalize and do not ask a question

SPECIAL INTENT:
- If the user asks for a high-level answer, idea only, or summary, do not ask a follow-up question unless absolutely required to avoid unsafe assumptions.
- In that case, return a short concept summary and keep the response inside ideation mode.

RULES:
- No assumptions without confirmation
- No multiple questions
- No vague questions
- Unknowns must be specific
- Requirements must be concrete
- Keep summary updated and precise
- Do not repeat the same question if it was already asked recently; either choose a different critical unknown or proceed with conservative defaults.
- Never use generic reply text such as "Ideation state updated."
- You must only use components from the approved Wokwi component catalog listed below.
- If user requests a component outside this catalog, mark it as unavailable in unknowns and suggest the closest in-catalog alternative.
- Custom parts are allowed only as chip-<name> (Wokwi Chips API) and must be treated as pending until user confirms custom chip files exist.
- NEVER output anything outside JSON
- DO NOT include <think> tags

APPROVED WOKWI COMPONENT CATALOG:
${formatWokwiComponentCatalogForPrompt()}

OUTPUT STRICT JSON:

{
  "summary": "",
  "requirements": [],
  "unknowns": [],
  "question": "",
  "assistantReply": ""
}

PROJECT DESCRIPTION:
${project.description}

CURRENT STATE:
${JSON.stringify(project.ideaState)}

CONVERSATION:
${messagesText}

NEW USER INPUT:
${userInput}
`;

  const text = await callAI(prompt);
  const parsed = safeParse(text);

  const normalized = normalizeIdeationOutput(parsed, userInput);
  const guarded = applyIdeationGuards(project, userInput, normalized);
  return enforceCatalogForIdeation(guarded);

  
};


/*
========================
COMPONENTS AI
========================
*/
export const processComponents = async (project, userInput) => {

  const messagesText = (project.componentsMessages || [])
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");
  const runnerEvidence = buildWokwiEvidenceText(project);

  const prompt = `
You are a hardware systems architect.

GOAL:
Convert finalized idea into system architecture and components.

RULES:
- Use ideaState as ground truth
- Be precise and practical
- No vague components
- Output must be buildable
- Include concise implementation guidance in reply.
- Use only approved Wokwi components from the catalog below.
- If an unavailable part is needed, suggest nearest supported alternative.
- If user explicitly requests custom component behavior, describe it as chip-<name> and mention it requires wokwi.toml + .chip.json/.wasm setup.
- In reply, include two labeled sections:
  1) "Connections" (what connects to what)
  2) "Expected output" (what user sees/gets after connection)
- Treat WOKWI RUNNER EVIDENCE as hard evidence from previous simulation/lint runs.
- If evidence conflicts with assumptions, prefer evidence.
- If lint/run/scenario reports failures, mention the critical failure in reply and provide corrective wiring/build steps.

OUTPUT STRICT JSON:

{
  "architecture": "",
  "components": [],
  "apiEndpoints": [],
  "reply": ""
}

IDEA STATE:
${JSON.stringify(project.ideaState)}

CURRENT COMPONENT STATE:
${JSON.stringify(project.componentsState)}

APPROVED WOKWI COMPONENT CATALOG:
${formatWokwiComponentCatalogForPrompt()}

WOKWI RUNNER EVIDENCE:
${runnerEvidence}

CONVERSATION:
${messagesText}

USER INPUT:
${userInput}
`;

  const text = await callAI(prompt);

  try {
    const parsed = safeParse(text);
    const normalized = normalizeComponentsOutput(parsed, stripThinking(text));
    return enforceCatalogForComponents(normalized);
  } catch {
    // Keep chat flow alive when model returns plain text instead of strict JSON.
    const normalized = normalizeComponentsOutput({}, stripThinking(text));
    return enforceCatalogForComponents(normalized);
  }
};


/*
========================
DESIGN AI
========================
*/
export const processDesign = async (project, userInput, wokwiContext = null) => {

  const messagesText = (project.designMessages || [])
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");
  const runnerEvidence = buildWokwiEvidenceText(project);

  const prompt = `
You are a Wokwi hardware layout assistant.

GOAL:
Help the user manually build and debug the current Wokwi circuit/layout.

RULES:
- Use ideaState + componentsState + the project description as circuit context.
- Treat LIVE WOKWI CIRCUIT CONTEXT as the source of truth for parts and connections.
- Be practical, concise, and hardware-focused.
- Do not produce app UI/screens/pages/dashboard concepts.
- Do not drift into generic product design language.
- Always describe what to place, how to wire it, what to check, and what the expected simulator behavior is.
- If the project is a Simon Game or similar Arduino build, stay in that domain and keep the advice aligned to the circuit and score display.
- If a response includes multiple steps, keep them in a short sequence that a user can perform manually in Wokwi.
- If a Wokwi URL is provided, treat it as the active source project and align guidance to that project context.
- Never claim a component exists unless it appears in LIVE WOKWI CIRCUIT CONTEXT partTypes.
- If the user says a part does not exist (example: "there is no 9V battery"), acknowledge and correct the previous guidance based on LIVE WOKWI CIRCUIT CONTEXT.
- If a required part is missing from LIVE WOKWI CIRCUIT CONTEXT, say it is missing and provide the exact next manual step to add it.
- Treat WOKWI RUNNER EVIDENCE as hard evidence from real simulations/tests.
- If evidence indicates runtime/lint failure, mention the top failure and prioritize fixes before new feature steps.
- If serial evidence includes errors, include one verification step that proves the fix in simulator output.

OUTPUT STRICT JSON:

{
  "screens": [
    {
      "name": "Current layout",
      "elements": [],
      "actions": []
    }
  ],
  "theme": "Hardware guidance",
  "uxFlow": [],
  "reply": ""
}

PROJECT DESCRIPTION:
${project.description || ""}

WOKWI PROJECT URL:
${project.wokwiUrl || ""}

LIVE WOKWI CIRCUIT CONTEXT (HARDWARE ONLY):
${JSON.stringify(wokwiContext || { connected: false, reason: "No live circuit context" })}

IDEA STATE:
${JSON.stringify(project.ideaState)}

COMPONENT STATE:
${JSON.stringify(project.componentsState)}

CURRENT DESIGN STATE:
${JSON.stringify(project.designState)}

WOKWI RUNNER EVIDENCE:
${runnerEvidence}

CONVERSATION:
${messagesText}

USER INPUT:
${userInput}
`;

  const text = await callAI(prompt);
  const livePartTypes = (wokwiContext?.partTypes || []).map((item) => String(item).toLowerCase());

  const hasPartType = (pattern) => livePartTypes.some((part) => pattern.test(part));
  const missingMentions = [];

  const buildMissingPartsCorrection = () => {
    const partsLabel = livePartTypes.length > 0 ? livePartTypes.join(", ") : "unknown";
    return `Live Wokwi context does not include: ${missingMentions.join(", ")}. I will only guide using existing circuit parts. Current live part types: ${partsLabel}.`;
  };

  const enforceLiveParts = (replyText) => {
    if (!wokwiContext?.connected) return replyText;

    const textValue = String(replyText || "");
    missingMentions.length = 0;

    if (/\bservo\b/i.test(textValue) && !hasPartType(/servo/)) {
      missingMentions.push("servo");
    }
    if (/\bbattery\b|\b9v\b/i.test(textValue) && !hasPartType(/battery/)) {
      missingMentions.push("battery");
    }

    if (missingMentions.length > 0) {
      return buildMissingPartsCorrection();
    }

    return textValue;
  };

  try {
    const parsed = safeParse(text);
    const normalized = normalizeDesignOutput(parsed, stripThinking(text));

    if (/there\s+is\s+no|no\s+9v\s+battery|not\s+present/i.test(String(userInput))) {
      const hasBattery = livePartTypes.some((part) => part.includes("battery"));
      if (!hasBattery) {
        normalized.reply = "You are correct - there is no battery in the current live Wokwi circuit context. I will only use existing parts unless you explicitly ask to add new ones. Next step: tell me which current part you want to wire or debug.";
      }
    }

    normalized.reply = enforceLiveParts(normalized.reply);

    return normalized;
  } catch {
    // Keep chat flow alive even if the model emits non-JSON text.
    const fallback = normalizeDesignOutput({}, stripThinking(text));
    fallback.reply = enforceLiveParts(fallback.reply);
    return fallback;
  }
};

const sanitizeChipName = (value = "") => {
  const cleaned = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!cleaned) return "custom-chip";
  return cleaned;
};

const buildFallbackCustomChipTemplate = ({ chipName, purpose }) => {
  const normalizedName = sanitizeChipName(chipName || "custom-chip");
  const prettyName = normalizedName.replace(/-/g, " ");

  const chipJson = {
    name: normalizedName,
    author: "HardCode AI",
    pins: ["VCC", "GND", "IN", "OUT"],
    controls: []
  };

  const chipC = `// Wokwi Custom Chip - generated by HardCode\n// Purpose: ${purpose || "Custom simulation component"}\n\n#include \"wokwi-api.h\"\n#include <stdio.h>\n#include <stdlib.h>\n\ntypedef struct {\n  pin_t pin_in;\n  pin_t pin_out;\n} chip_state_t;\n\nstatic void pin_in_changed(void *user_data, pin_t pin, uint32_t value) {\n  chip_state_t *chip = (chip_state_t *)user_data;\n  pin_write(chip->pin_out, value);\n}\n\nvoid chip_init() {\n  chip_state_t *chip = malloc(sizeof(chip_state_t));\n\n  chip->pin_in = pin_init(\"IN\", INPUT);\n  chip->pin_out = pin_init(\"OUT\", OUTPUT);\n\n  const pin_watch_config_t watch = {\n    .edge = BOTH,\n    .pin = chip->pin_in,\n    .user_data = chip,\n    .callback = pin_in_changed,\n  };\n  pin_watch(&watch);\n\n  printf(\"${normalizedName} initialized\\n\");\n}\n`;

  return {
    chipName: normalizedName,
    partType: `chip-${normalizedName}`,
    files: {
      chipJsonFileName: `${normalizedName}.chip.json`,
      chipCFileName: `${normalizedName}.chip.c`,
      chipJson,
      chipC
    },
    snippets: {
      diagramPart: {
        type: `chip-${normalizedName}`,
        id: `${normalizedName}1`,
        top: 0,
        left: 0,
        attrs: {}
      },
      wokwiTomlChipEntry: `[[chip]]\nname = '${normalizedName}'\nbinary = 'chips/${normalizedName}.chip.wasm'`
    },
    guidance: [
      `Generated fallback template for ${prettyName}.`,
      "Compile the .chip.c source into .chip.wasm with wokwi-cli chip compile.",
      "Keep .chip.json and .chip.wasm names aligned with the chip name.",
      "Use the diagram part snippet to place the custom chip in diagram.json."
    ]
  };
};

const normalizeCustomChipTemplateOutput = (raw, fallback) => {
  const chipName = sanitizeChipName(raw?.chipName || fallback.chipName);
  const partType = `chip-${chipName}`;

  const chipJson = raw?.files?.chipJson && typeof raw.files.chipJson === "object"
    ? raw.files.chipJson
    : fallback.files.chipJson;

  const chipC = typeof raw?.files?.chipC === "string" && raw.files.chipC.trim()
    ? raw.files.chipC
    : fallback.files.chipC;

  const diagramPart = raw?.snippets?.diagramPart && typeof raw.snippets.diagramPart === "object"
    ? {
        ...raw.snippets.diagramPart,
        type: partType,
        id: String(raw.snippets.diagramPart.id || `${chipName}1`)
      }
    : {
        ...fallback.snippets.diagramPart,
        type: partType,
        id: `${chipName}1`
      };

  const guidance = cleanArray(raw?.guidance);

  return {
    chipName,
    partType,
    files: {
      chipJsonFileName: `${chipName}.chip.json`,
      chipCFileName: `${chipName}.chip.c`,
      chipJson,
      chipC
    },
    snippets: {
      diagramPart,
      wokwiTomlChipEntry: `[[chip]]\nname = '${chipName}'\nbinary = 'chips/${chipName}.chip.wasm'`
    },
    guidance: guidance.length > 0 ? guidance : fallback.guidance
  };
};

export const generateCustomChipTemplate = async ({ project, chipName = "", purpose = "", userPrompt = "" }) => {
  const fallback = buildFallbackCustomChipTemplate({ chipName, purpose: purpose || userPrompt });

  const prompt = `
You are an embedded simulation assistant.

GOAL:
Generate a strict Wokwi custom chip template using a fixed structure.

RULES:
- Return ONLY JSON.
- chipName must be lowercase kebab-case, no spaces.
- partType must be chip-<chipName>.
- files.chipJson must follow Wokwi chip definition shape: name, author, pins, controls.
- files.chipC must compile as a basic Wokwi chip C source and include chip_init().
- snippets.diagramPart.type must be chip-<chipName>.
- snippets.wokwiTomlChipEntry must include [[chip]], name, and binary path.
- Keep template practical and minimal.

OUTPUT JSON SHAPE:
{
  "chipName": "",
  "partType": "",
  "files": {
    "chipJson": {},
    "chipC": ""
  },
  "snippets": {
    "diagramPart": {},
    "wokwiTomlChipEntry": ""
  },
  "guidance": []
}

PROJECT DESCRIPTION:
${project?.description || ""}

CHIP NAME REQUEST:
${chipName || "custom-chip"}

PURPOSE:
${purpose || ""}

USER PROMPT:
${userPrompt || ""}
`;

  try {
    const text = await callAI(prompt);
    const parsed = safeParse(text);
    return normalizeCustomChipTemplateOutput(parsed, fallback);
  } catch {
    return fallback;
  }
};

const normalizeComponentsOutput = (raw, fallbackReply = "I generated components guidance. Ask a follow-up for exact wiring and expected behavior.") => {
  const architecture = typeof raw?.architecture === "string" ? raw.architecture.trim() : "";
  const components = cleanArray(raw?.components);
  const apiEndpoints = cleanArray(raw?.apiEndpoints);

  const formatReplyValue = (value) => {
    if (typeof value === "string") {
      return value.trim();
    }

    if (Array.isArray(value)) {
      return cleanArray(value).join("\n");
    }

    if (!value || typeof value !== "object") {
      return "";
    }

    const sections = Object.entries(value)
      .map(([label, sectionValue]) => {
        if (typeof sectionValue === "string") {
          const text = sectionValue.trim();
          return text ? `${label}: ${text}` : "";
        }

        if (Array.isArray(sectionValue)) {
          const list = cleanArray(sectionValue);
          return list.length > 0 ? `${label}: ${list.join(", ")}` : "";
        }

        if (!sectionValue || typeof sectionValue !== "object") {
          return "";
        }

        const lines = Object.entries(sectionValue)
          .map(([k, v]) => {
            const text = typeof v === "string" ? v.trim() : "";
            return text ? `- ${k}: ${text}` : "";
          })
          .filter(Boolean);

        return lines.length > 0 ? `${label}:\n${lines.join("\n")}` : "";
      })
      .filter(Boolean);

    return sections.join("\n\n").trim();
  };

  let reply = formatReplyValue(raw?.reply);
  if (!reply) {
    reply = fallbackReply;
  }

  return {
    architecture,
    components,
    apiEndpoints,
    reply
  };
};

const normalizeDesignOutput = (raw, fallbackReply = "I analyzed the live circuit context. Ask for the next exact wiring/debug step.") => {
  const screens = Array.isArray(raw?.screens)
    ? raw.screens.map((screen) => ({
        name: typeof screen?.name === "string" ? screen.name.trim() : "",
        elements: cleanArray(screen?.elements),
        actions: cleanArray(screen?.actions)
      }))
    : [];

  const theme = typeof raw?.theme === "string" ? raw.theme.trim() : "Hardware guidance";
  const uxFlow = cleanArray(raw?.uxFlow);

  let reply = typeof raw?.reply === "string" ? raw.reply.trim() : "";
  if (!reply) {
    reply = fallbackReply;
  }

  return {
    screens,
    theme,
    uxFlow,
    reply
  };
};