import mongoose from "mongoose";
import Groq from "groq-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import Project from "../models/project.model.js";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const RELEVANT_EXTENSIONS = new Set([
  ".ino",
  ".json",
  ".toml",
  ".ini",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".md",
  ".txt"
]);

const MAX_FILES = 24;
const MAX_SNIPPET_CHARS = 3500;
const MAX_HISTORY_MESSAGES = 10;

const stripThinking = (value = "") => {
  return String(value)
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
};

const safeText = (value = "") => stripThinking(String(value || ""));

const isRelevantFile = (filePath) => {
  const lowered = filePath.toLowerCase();
  return lowered.endsWith("diagram.json")
    || lowered.endsWith("wokwi.toml")
    || lowered.endsWith("wokwi.ini")
    || lowered.endsWith("sketch.ino")
    || lowered.endsWith("main.c")
    || lowered.endsWith("main.cpp")
    || lowered.endsWith("main.ino")
    || RELEVANT_EXTENSIONS.has(path.extname(lowered));
};

const collectFiles = async (rootPath) => {
  const queue = [rootPath];
  const output = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== ".vscode") {
          queue.push(fullPath);
        }
      } else {
        output.push(fullPath);
      }
    }
  }

  return output;
};

const readSnippet = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return "";
    }

    const content = await fs.readFile(filePath, "utf8");
    if (content.length > MAX_SNIPPET_CHARS) {
      return `${content.slice(0, MAX_SNIPPET_CHARS)}\n...`;
    }

    return content;
  } catch {
    return "";
  }
};

const buildLocalHardwareContext = async (projectPath = "") => {
  if (!projectPath?.trim()) {
    return {
      selected: false,
      projectPath: "",
      fileCount: 0,
      files: [],
      relevantFiles: [],
      snippets: [],
      reason: "No local hardware project path configured"
    };
  }

  const resolvedPath = path.resolve(projectPath.trim());
  const allFiles = await collectFiles(resolvedPath);
  const relevantFiles = allFiles.filter(isRelevantFile);
  const filesToRead = (relevantFiles.length > 0 ? relevantFiles : allFiles)
    .slice(0, MAX_FILES);

  const snippets = [];
  for (const filePath of filesToRead) {
    const content = await readSnippet(filePath);
    if (content) {
      snippets.push({
        path: filePath,
        content
      });
    }
  }

  return {
    selected: true,
    projectPath: resolvedPath,
    fileCount: allFiles.length,
    files: allFiles,
    relevantFiles,
    snippets,
    sketchPath: allFiles.find((filePath) => filePath.toLowerCase().endsWith(".ino")),
    diagramPath: allFiles.find((filePath) => filePath.toLowerCase().endsWith("diagram.json")),
    configPath: allFiles.find((filePath) => {
      const lowered = filePath.toLowerCase();
      return lowered.endsWith("wokwi.toml") || lowered.endsWith("wokwi.ini") || lowered.endsWith("diagram.ini");
    })
  };
};

const buildHistoryText = (project) => {
  return (project?.projectAiMessages || [])
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
};

const buildProjectAIPrompt = ({ project, userInput, context, historyText, mode }) => {
  return `
You are ProjectAI for the HardCode extension.

Purpose:
- Inspect the selected hardware repository and the project record.
- Help the user reason about the .ino firmware, diagram.json wiring, config files, and any companion files.
- Give direct implementation guidance without rewriting the whole product flow.
- Reuse the current project context instead of inventing new structure.

Rules:
- Keep the answer concise, concrete, and hardware-focused.
- Mention exact file names when they matter.
- If the repo path is missing, ask the user to select one.
- If the context shows multiple possible entry files, call out the one you think is primary.
- Do not return JSON. Return plain text only.
- Do not mention internal chain-of-thought.

Mode:
${mode}

Project description:
${project?.description || ""}

Idea state:
${JSON.stringify(project?.ideaState || {})}

Components state:
${JSON.stringify(project?.componentsState || {})}

Design state:
${JSON.stringify(project?.designState || {})}

Hardware context:
${JSON.stringify(context, null, 2)}

Recent ProjectAI history:
${historyText}

User input:
${userInput}
`;
};

const callProjectAI = async ({ project, userInput, context, mode }) => {
  const historyText = buildHistoryText(project);
  const prompt = buildProjectAIPrompt({ project, userInput, context, historyText, mode });

  const response = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2
  });

  return safeText(response.choices?.[0]?.message?.content || "");
};

const ensureAccess = async (projectId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return { error: { status: 400, payload: { error: "Invalid projectId" } } };
  }

  const project = await Project.findById(projectId);
  if (!project) {
    return { error: { status: 404, payload: { error: "Project not found" } } };
  }

  if (project.owner.toString() !== userId.toString()) {
    return { error: { status: 403, payload: { error: "Forbidden" } } };
  }

  return { project };
};

const persistProjectAIState = (project, context, reply) => {
  project.projectAiState = {
    summary: reply.slice(0, 300),
    hardwarePath: context.projectPath || project.wokwiProjectPath || "",
    files: (context.relevantFiles || context.files || []).slice(0, 24),
    notes: context.reason ? [context.reason] : [],
    lastContextAt: new Date()
  };
};

export const getProjectAiHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const access = await ensureAccess(id, req.user._id);

    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    res.json({
      messages: access.project.projectAiMessages || [],
      projectAiState: access.project.projectAiState || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load ProjectAI history" });
  }
};

export const getProjectAiContext = async (req, res) => {
  try {
    const { id } = req.params;
    const access = await ensureAccess(id, req.user._id);

    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const context = await buildLocalHardwareContext(access.project.wokwiProjectPath || "");
    res.json({
      projectId: id,
      context,
      projectAiState: access.project.projectAiState || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load ProjectAI context" });
  }
};

export const initProjectAi = async (req, res) => {
  try {
    const { projectId } = req.body;
    const access = await ensureAccess(projectId, req.user._id);

    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const context = await buildLocalHardwareContext(access.project.wokwiProjectPath || "");
    const reply = await callProjectAI({
      project: access.project,
      userInput: "Initialize ProjectAI and summarize the available hardware project context.",
      context,
      mode: "init"
    });

    if (!access.project.projectAiMessages) {
      access.project.projectAiMessages = [];
    }

    access.project.projectAiMessages.push({ role: "ai", content: reply });
    persistProjectAIState(access.project, context, reply);
    await access.project.save();

    res.json({ reply, projectAiState: access.project.projectAiState, context });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to initialize ProjectAI" });
  }
};

export const chatProjectAi = async (req, res) => {
  try {
    const { projectId, message, projectPath = "" } = req.body;
    const access = await ensureAccess(projectId, req.user._id);

    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const project = access.project;
    if (!project.projectAiMessages) {
      project.projectAiMessages = [];
    }

    project.projectAiMessages.push({
      role: "user",
      content: String(message).trim()
    });

    const context = await buildLocalHardwareContext(projectPath || project.wokwiProjectPath || "");
    const reply = await callProjectAI({
      project,
      userInput: String(message).trim(),
      context,
      mode: "chat"
    });

    project.projectAiMessages.push({
      role: "ai",
      content: reply
    });

    persistProjectAIState(project, context, reply);
    await project.save();

    res.json({
      reply,
      projectAiState: project.projectAiState,
      context
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to chat with ProjectAI" });
  }
};
