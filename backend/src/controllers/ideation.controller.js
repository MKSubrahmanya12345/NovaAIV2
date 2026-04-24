import mongoose from "mongoose";
import Project from "../models/project.model.js";
import { buildGenerationProfileFromMeta, processInput } from "../services/ai.services.js";

const isIdeaFinalized = (project) => {
  return Boolean(project?.ideaState?.summary?.trim()) && (project?.ideaState?.unknowns?.length ?? 0) === 0;
};

const isServoOverdoneShortcut = (text = "") => {
  return /\b32 dancing servos\b/i.test(String(text || ""));
};

const applyServoOverdoneIdeation = (project, userText) => {
  project.ideaState = {
    summary: "Build the ServoOverdone demo: Arduino Mega controlling 32 servos with 4 motion sequences (random, synchronized sweep, rotating wave, compass pointer).",
    requirements: [
      "Use an Arduino Mega as the controller",
      "Attach 32 servos on pins 22..53",
      "Provide Wokwi `servo.ino` and `diagram.json` files that match the ServoOverdone preset",
      "No AI generation for the preset; return hardcoded files"
    ],
    unknowns: []
  };

  project.meta = project.meta || {};
  project.meta.stage = "components";
  project.meta.board = "ARDUINO_MEGA";
  project.meta.language = "cpp";
  project.meta.componentCount = 32;
  project.meta.detectedAt = new Date();

  project.generationProfile = buildGenerationProfileFromMeta(project.meta || {});

  project.messages.push({
    role: "ai",
    content: `Locked. Using hardcoded preset for "${String(userText || "").trim()}". Components AI is now unlocked — click Generate Files.`
  });
};

export const createIdeationProject = async (req, res) => {
  try {
    const { description } = req.body;
    const normalizedDescription = description?.trim();

    if (!normalizedDescription) {
      return res.status(400).json({ error: "Description is required" });
    }

    if (!req.user?._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const recentSameProject = await Project.findOne({
      owner: req.user._id,
      description: normalizedDescription,
      createdAt: { $gte: new Date(Date.now() - 60 * 1000) }
    }).sort({ createdAt: -1 });

    if (recentSameProject) {
      const latestReply = [...(recentSameProject.messages || [])]
        .reverse()
        .find(msg => msg.role === "ai")?.content || "Project already exists.";

      return res.json({
        projectId: recentSameProject._id,
        reply: latestReply,
        question: "",
        ideaState: recentSameProject.ideaState,
        ideationFinalized: isIdeaFinalized(recentSameProject),
        deduped: true
      });
    }

    const project = await Project.create({
      description: normalizedDescription,
      owner: req.user._id,
      messages: [{ role: "user", content: normalizedDescription }],
      ideaState: {
        summary: "",
        requirements: [],
        unknowns: []
      },
      meta: { stage: "idea" }
    });

    // Hardcoded shortcut: skip AI, finalize immediately.
    if (isServoOverdoneShortcut(normalizedDescription)) {
      applyServoOverdoneIdeation(project, normalizedDescription);
      await project.save();

      const latestReply = [...(project.messages || [])].reverse().find((m) => m.role === "ai")?.content || "";
      return res.json({
        projectId: project._id,
        reply: latestReply,
        question: "",
        ideaState: project.ideaState,
        ideationFinalized: isIdeaFinalized(project),
        generationProfile: project.generationProfile
      });
    }

    const ai = await processInput(project, normalizedDescription);

    project.ideaState = {
      summary: ai.summary,
      requirements: ai.requirements,
      unknowns: ai.unknowns
    };

    project.meta.stage = isIdeaFinalized(project) ? "components" : "idea";

    if (ai.detectedMeta) {
      project.meta = project.meta || {};

      // Persist board as registry key (e.g., ARDUINO_MEGA). AI already normalizes this.
      if (ai.detectedMeta.board && (project.meta.board === null || project.meta.board !== ai.detectedMeta.board)) {
        project.meta.board = ai.detectedMeta.board;
      }

      if (typeof ai.detectedMeta.powerSource === "string") {
        project.meta.powerSource = ai.detectedMeta.powerSource;
      }

      if (typeof ai.detectedMeta.language === "string") {
        project.meta.language = ai.detectedMeta.language;
      }

      project.meta.componentCount = Number.isFinite(ai.detectedMeta.componentCount)
        ? ai.detectedMeta.componentCount
        : 0;
      project.meta.detectedAt = ai.detectedMeta.detectedAt || new Date();
    }

    project.generationProfile = buildGenerationProfileFromMeta(project.meta || {});

    project.messages.push({
      role: "ai",
      content: ai.assistantReply
    });

    await project.save();

    res.json({
      projectId: project._id,
      reply: ai.assistantReply,
      question: ai.question,
      ideaState: project.ideaState,
      ideationFinalized: isIdeaFinalized(project),
      generationProfile: project.generationProfile
    });
  } catch (err) {
    console.error("IDEATION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

export const chatIdeationProject = async (req, res) => {
  try {
    const { projectId, message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: "Invalid projectId" });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden" });
    }

    project.messages.push({
      role: "user",
      content: message.trim()
    });

    // Hardcoded shortcut: skip AI, finalize immediately.
    if (isServoOverdoneShortcut(message)) {
      applyServoOverdoneIdeation(project, message);
      await project.save();
      const latestReply = [...(project.messages || [])].reverse().find((m) => m.role === "ai")?.content || "";

      return res.json({
        reply: latestReply,
        question: "",
        ideaState: project.ideaState,
        ideationFinalized: isIdeaFinalized(project),
        meta: project.meta,
        generationProfile: project.generationProfile
      });
    }

    const ai = await processInput(project, message);

    // #region agent log
    fetch('http://127.0.0.1:7453/ingest/b8da6778-f3ca-4c12-8d65-59ddc4130029',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6aa033'},body:JSON.stringify({sessionId:'6aa033',runId:'pre-fix',hypothesisId:'H4',location:'backend/src/controllers/ideation.controller.js:chatIdeationProject',message:'Ideation controller applying detectedMeta',data:{incomingDetectedBoard:ai?.detectedMeta?.board||null,prevMetaBoard:project?.meta?.board||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    project.ideaState = {
      summary: ai.summary,
      requirements: ai.requirements,
      unknowns: ai.unknowns
    };

    project.meta.stage = isIdeaFinalized(project) ? "components" : "idea";

    if (ai.detectedMeta) {
      project.meta = project.meta || {};

      if (
        ai.detectedMeta.board
        && (project.meta.board === null || project.meta.board !== ai.detectedMeta.board)
      ) {
        project.meta.board = ai.detectedMeta.board;
      }

      if (typeof ai.detectedMeta.powerSource === "string") {
        project.meta.powerSource = ai.detectedMeta.powerSource;
      }

      if (typeof ai.detectedMeta.language === "string") {
        project.meta.language = ai.detectedMeta.language;
      }

      project.meta.componentCount = Number.isFinite(ai.detectedMeta.componentCount)
        ? ai.detectedMeta.componentCount
        : 0;
      project.meta.detectedAt = ai.detectedMeta.detectedAt || new Date();
    }

    project.generationProfile = buildGenerationProfileFromMeta(project.meta || {});

    project.messages.push({
      role: "ai",
      content: ai.assistantReply
    });

    await project.save();

    res.json({
      reply: ai.assistantReply,
      question: ai.question,
      ideaState: project.ideaState,
      ideationFinalized: isIdeaFinalized(project),
      meta: project.meta,
      generationProfile: project.generationProfile
    });
  } catch (err) {
    console.error("IDEATION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};