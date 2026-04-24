import Project from "../models/project.model.js";
import { processDesign } from "../services/ai.services.js";
import { getWokwiCircuitContext } from "../lib/wokwi-context.js";
import { readWokwiProjectFiles } from "../services/wokwi-local.service.js";

const isIdeaFinalized = (project) => {
  return Boolean(project?.ideaState?.summary?.trim()) && (project?.ideaState?.unknowns?.length ?? 0) === 0;
};

const canStartDesign = (project) => {
  return isIdeaFinalized(project) || project?.meta?.stage === "components" || project?.meta?.stage === "design" || project?.meta?.stage === "build";
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
    source: "local-project-files",
    projectPath: "",
    partCount: parts.length,
    connectionCount: connections.length,
    partTypes,
    sampleConnections
  };
};

const getLocalCircuitContext = async (projectPath = "") => {
  if (!projectPath?.trim()) {
    return {
      connected: false,
      source: "local-project-files",
      reason: "No local project path configured"
    };
  }

  try {
    const files = await readWokwiProjectFiles({
      projectPath,
      diagramFile: "diagram.json",
      sketchFile: "sketch.ino"
    });

    if (!files?.diagramJson?.trim()) {
      return {
        connected: false,
        source: "local-project-files",
        reason: "diagram.json not found in local project path"
      };
    }

    const diagram = JSON.parse(files.diagramJson);
    return {
      ...summarizeDiagram(diagram),
      projectPath
    };
  } catch (error) {
    return {
      connected: false,
      source: "local-project-files",
      reason: error?.message || "Unable to read local diagram"
    };
  }
};

const resolveDesignWokwiContext = async (project) => {
  const localContext = await getLocalCircuitContext(project?.wokwiProjectPath || "");
  if (localContext.connected) {
    return localContext;
  }

  const remoteContext = await getWokwiCircuitContext(project?.wokwiUrl || "");
  if (remoteContext.connected) {
    return {
      ...remoteContext,
      source: remoteContext.source || "wokwi-url"
    };
  }

  return {
    connected: false,
    source: "none",
    reason: `${localContext.reason || "Local context unavailable"}. ${remoteContext.reason || "Remote context unavailable"}`
  };
};

/*
INIT DESIGN
*/
export const initDesign = async (req, res) => {
  try {
    const { projectId } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!canStartDesign(project)) {
      return res.status(400).json({
        error: "Finalize Ideation AI before starting Design AI"
      });
    }

    if (!project.designState) {
      project.designState = {
        screens: [],
        theme: "",
        uxFlow: []
      };
    }

    const wokwiContext = await resolveDesignWokwiContext(project);
    const ai = await processDesign(project, "Start hardware layout guidance", wokwiContext);

    project.designState = {
      screens: ai.screens,
      theme: ai.theme,
      uxFlow: ai.uxFlow
    };

    if (!project.designMessages) project.designMessages = [];

    project.designMessages.push({
      role: "ai",
      content: ai.reply
    });

    await project.save();

    res.json({
      reply: ai.reply,
      designState: project.designState,
      wokwiContext
    });

  } catch (err) {
    console.error("PROJECT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};


/*
CHAT LOOP - DESIGN
*/
export const chatDesign = async (req, res) => {
  try {
    const { projectId, message } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!canStartDesign(project)) {
      return res.status(400).json({
        error: "Finalize Ideation AI before starting Design AI"
      });
    }

    if (!project.designMessages) project.designMessages = [];

    project.designMessages.push({
      role: "user",
      content: message
    });

    const wokwiContext = await resolveDesignWokwiContext(project);
    const ai = await processDesign(project, message, wokwiContext);

    project.designState = {
      screens: ai.screens,
      theme: ai.theme,
      uxFlow: ai.uxFlow
    };

    project.designMessages.push({
      role: "ai",
      content: ai.reply
    });

    await project.save();

    res.json({
      reply: ai.reply,
      designState: project.designState,
      wokwiContext
    });

  } catch (err) {
    console.error("PROJECT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getDesignContext = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const wokwiContext = await resolveDesignWokwiContext(project);
    res.json({ wokwiContext });
  } catch (err) {
    console.error("DESIGN CONTEXT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};