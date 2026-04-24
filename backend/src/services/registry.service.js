import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let REGISTRY_CACHE = null;
let AI_CONTEXT_CACHE = null;

const getRegistryPath = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../data/componentRegistry.json");
};

export function getRegistry() {
  if (REGISTRY_CACHE) return REGISTRY_CACHE;
  const raw = readFileSync(getRegistryPath(), "utf8");
  REGISTRY_CACHE = JSON.parse(raw);
  return REGISTRY_CACHE;
}

export function buildAIContext(registry) {
  if (!registry || typeof registry !== "object") return [];

  return Object.entries(registry).map(([name, comp]) => ({
    name,
    type: comp?.wokwiType || "",
    category: comp?.category || "",
    pins: Array.isArray(comp?.pins) ? comp.pins.map((p) => p?.name).filter(Boolean) : [],
    capabilities: Object.fromEntries(
      (Array.isArray(comp?.pins) ? comp.pins : [])
        .filter((p) => Array.isArray(p?.signals) && p.signals.length > 0)
        .map((p) => [
          p.name,
          p.signals
            .map((s) => {
              const t = String(s?.type || "").trim();
              if (!t) return "";
              const role = s?.role ? `-${String(s.role).toLowerCase()}` : "";
              return `${t}${role}`;
            })
            .filter(Boolean)
        ])
    )
  }));
}

export function getAIContext() {
  if (AI_CONTEXT_CACHE) return AI_CONTEXT_CACHE;
  AI_CONTEXT_CACHE = buildAIContext(getRegistry());
  return AI_CONTEXT_CACHE;
}

export function validateComponentType(componentType) {
  const registry = getRegistry();
  return Boolean(registry && Object.prototype.hasOwnProperty.call(registry, componentType));
}

export function assertValidComponentType(componentType) {
  if (!validateComponentType(componentType)) {
    throw new Error(`Invalid component type: ${String(componentType || "").trim() || "(empty)"}`);
  }
}

