export const extractWokwiProjectId = (url = "") => {
  const match = String(url).match(/wokwi\.com\/projects\/(\d+)/i);
  return match?.[1] || "";
};

const decodeEscapedJsonString = (value) => {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return "";
  }
};

const parseDiagramFromHtml = (html) => {
  const diagramRef = html.match(/"name":"diagram\.json","content":"\$(\w+)"/);
  if (!diagramRef?.[1]) {
    return null;
  }

  const token = diagramRef[1];
  const tokenRegex = new RegExp(`(?:^|[,{])${token}:"((?:\\\\.|[^"\\\\])*)"`);
  const tokenMatch = html.match(tokenRegex);

  if (!tokenMatch?.[1]) {
    return null;
  }

  const diagramString = decodeEscapedJsonString(tokenMatch[1]);
  if (!diagramString) {
    return null;
  }

  try {
    return JSON.parse(diagramString);
  } catch {
    return null;
  }
};

const summarizeDiagram = (diagram) => {
  const parts = Array.isArray(diagram?.parts) ? diagram.parts : [];
  const connections = Array.isArray(diagram?.connections) ? diagram.connections : [];

  const partTypes = [...new Set(parts
    .map((part) => typeof part?.type === "string" ? part.type : "")
    .filter(Boolean))]
    .slice(0, 30);

  const sampleConnections = connections
    .slice(0, 40)
    .map((wire) => {
      const from = Array.isArray(wire) ? wire[0] : "";
      const to = Array.isArray(wire) ? wire[1] : "";
      const color = Array.isArray(wire) ? wire[2] : "";

      return {
        from: typeof from === "string" ? from : "",
        to: typeof to === "string" ? to : "",
        color: typeof color === "string" ? color : ""
      };
    })
    .filter((item) => item.from && item.to);

  return {
    connected: true,
    partCount: parts.length,
    connectionCount: connections.length,
    partTypes,
    sampleConnections
  };
};

export const fetchWokwiDiagram = async (wokwiUrl = "") => {
  const projectId = extractWokwiProjectId(wokwiUrl);

  if (!projectId) {
    return {
      ok: false,
      reason: "No valid Wokwi project URL linked"
    };
  }

  try {
    const diagramResponse = await fetch(`https://wokwi.com/api/projects/${projectId}/diagram.json`);
    if (diagramResponse.ok) {
      const diagram = await diagramResponse.json();
      return {
        ok: true,
        source: "wokwi-diagram-endpoint",
        projectId,
        diagram
      };
    }

    const response = await fetch(`https://wokwi.com/projects/${projectId}`);
    if (!response.ok) {
      return {
        ok: false,
        reason: `Wokwi project request failed (${response.status})`
      };
    }

    const html = await response.text();
    const diagram = parseDiagramFromHtml(html);

    if (!diagram) {
      return {
        ok: false,
        reason: "Unable to parse diagram.json from Wokwi project page"
      };
    }

    return {
      ok: true,
      source: "wokwi-public-project-fallback",
      projectId,
      diagram
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || "Unknown Wokwi diagram retrieval error"
    };
  }
};

export const getWokwiCircuitContext = async (wokwiUrl = "") => {
  const fetched = await fetchWokwiDiagram(wokwiUrl);
  if (!fetched.ok) {
    return {
      connected: false,
      reason: fetched.reason
    };
  }

  return {
    source: fetched.source,
    projectId: fetched.projectId,
    ...summarizeDiagram(fetched.diagram)
  };
};
