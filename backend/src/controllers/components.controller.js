import Project from "../models/project.model.js";
import { processComponents } from "../services/ai.services.js";
import { generateArtifactsFromRegistry } from "../services/registry-codegen.service.js";

const isIdeaFinalized = (project) => {
  return Boolean(project?.ideaState?.summary?.trim()) && (project?.ideaState?.unknowns?.length ?? 0) === 0;
};

const canStartComponents = (project) => {
  return isIdeaFinalized(project) || project?.meta?.stage === "components" || project?.meta?.stage === "design" || project?.meta?.stage === "build";
};

/*
INIT COMPONENTS (optional first call)
*/
export const initComponents = async (req, res) => {
  try {
    const { projectId } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!canStartComponents(project)) {
      return res.status(400).json({
        error: "Finalize Ideation AI before starting Components AI"
      });
    }

    // init structure if missing
    if (!project.componentsState) {
      project.componentsState = {
        architecture: "",
        components: [],
        apiEndpoints: []
      };
    }

    const ai = await processComponents(project, "Start components design");

    project.componentsState = {
      architecture: ai.architecture,
      components: ai.components,
      apiEndpoints: ai.apiEndpoints
    };

    if (!project.componentsMessages) project.componentsMessages = [];

    project.componentsMessages.push({
      role: "ai",
      content: ai.reply
    });

    await project.save();

    res.json({
      reply: ai.reply,
      componentsState: project.componentsState,
      generationProfile: project.generationProfile || null
    });

  } catch (err) {
    console.error("PROJECT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};


/*
CHAT LOOP - COMPONENTS
*/
export const chatComponents = async (req, res) => {
  try {
    const { projectId, message } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!canStartComponents(project)) {
      return res.status(400).json({
        error: "Finalize Ideation AI before starting Components AI"
      });
    }

    if (!project.componentsMessages) project.componentsMessages = [];

    // store user msg
    project.componentsMessages.push({
      role: "user",
      content: message
    });

    const ai = await processComponents(project, message);

    project.componentsState = {
      architecture: ai.architecture,
      components: ai.components,
      apiEndpoints: ai.apiEndpoints
    };

    project.componentsMessages.push({
      role: "ai",
      content: ai.reply
    });

    await project.save();

    res.json({
      reply: ai.reply,
      componentsState: project.componentsState,
      generationProfile: project.generationProfile || null
    });

  } catch (err) {
    console.error("PROJECT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

/*
GENERATE WOKWI FILES FROM IDEATION + COMPONENTS STATE
*/
export const generateWokwiFilesFromAI = async (req, res) => {
  try {
    const { projectId, userPrompt = "" } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!canStartComponents(project)) {
      return res.status(400).json({
        error: "Finalize Ideation AI before generating Wokwi files"
      });
    }

    const generated = await generateArtifactsFromRegistry({ project, userPrompt });

    res.json({
      projectId,
      generated,
      generationProfile: project.generationProfile || null
    });
  } catch (err) {
    console.error("GENERATE WOKWI FILES ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to generate Wokwi files" });
  }
};