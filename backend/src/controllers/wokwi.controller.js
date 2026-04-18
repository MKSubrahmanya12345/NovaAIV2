import mongoose from "mongoose";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import Project from "../models/project.model.js";
import {
  lintWokwiProject,
  runWokwiProject,
  runWokwiScenario,
  captureWokwiSerial
} from "../services/wokwi-runner.service.js";
import {
  startWokwiMcpSession,
  listWokwiMcpSessions,
  callWokwiMcpTool,
  stopWokwiMcpSession
} from "../services/wokwi-mcp-client.service.js";
import {
  writeWokwiProjectFiles,
  compileWokwiSketch,
  readWokwiProjectFiles
} from "../services/wokwi-local.service.js";
import { generateCustomChipTemplate } from "../services/ai.services.js";

const ensureProjectAccess = async (projectId, userId) => {
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

const saveEvidence = async (project, key, value) => {
  if (!project.wokwiEvidence) {
    project.wokwiEvidence = {
      lastLint: null,
      lastRun: null,
      lastScenario: null,
      lastSerialCapture: null,
      updatedAt: null
    };
  }

  project.wokwiEvidence[key] = value;
  project.wokwiEvidence.updatedAt = new Date();
  await project.save();
};

export const lintProjectWokwi = async (req, res) => {
  try {
    const { projectId, projectPath = "", diagramFile = "diagram.json", wokwiUrl = "", timeoutMs = 20000 } = req.body;

    const access = await ensureProjectAccess(projectId, req.user._id);
    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const project = access.project;
    const result = await lintWokwiProject({
      projectPath: projectPath || project.wokwiProjectPath || "",
      diagramFile,
      wokwiUrl: wokwiUrl || project.wokwiUrl || "",
      timeoutMs
    });

    await saveEvidence(project, "lastLint", result);

    res.json({
      projectId,
      evidenceType: "lint",
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to lint Wokwi project" });
  }
};

export const runProjectWokwi = async (req, res) => {
  try {
    const {
      projectId,
      projectPath = "",
      timeoutMs = 30000,
      expectText = "",
      failText = "",
      serialLogFile = "",
      screenshotPart = "",
      screenshotTime,
      screenshotFile = "",
      vcdFile = ""
    } = req.body;

    const access = await ensureProjectAccess(projectId, req.user._id);
    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const project = access.project;
    const result = await runWokwiProject({
      projectPath: projectPath || project.wokwiProjectPath || "",
      timeoutMs,
      expectText,
      failText,
      serialLogFile,
      screenshotPart,
      screenshotTime,
      screenshotFile,
      vcdFile
    });

    await saveEvidence(project, "lastRun", result);

    res.json({
      projectId,
      evidenceType: "run",
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to run Wokwi project" });
  }
};

export const runScenarioWokwi = async (req, res) => {
  try {
    const {
      projectId,
      projectPath = "",
      scenarioPath,
      timeoutMs = 30000,
      expectText = "",
      failText = "",
      serialLogFile = "",
      screenshotPart = "",
      screenshotTime,
      screenshotFile = "",
      vcdFile = ""
    } = req.body;

    if (!scenarioPath) {
      return res.status(400).json({ error: "scenarioPath is required" });
    }

    const access = await ensureProjectAccess(projectId, req.user._id);
    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const project = access.project;
    const result = await runWokwiScenario({
      projectPath: projectPath || project.wokwiProjectPath || "",
      scenarioPath,
      timeoutMs,
      expectText,
      failText,
      serialLogFile,
      screenshotPart,
      screenshotTime,
      screenshotFile,
      vcdFile
    });

    await saveEvidence(project, "lastScenario", result);

    res.json({
      projectId,
      evidenceType: "scenario",
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to run Wokwi scenario" });
  }
};

export const captureSerialWokwi = async (req, res) => {
  try {
    const { projectId, projectPath = "", timeoutMs = 12000 } = req.body;

    const access = await ensureProjectAccess(projectId, req.user._id);
    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const project = access.project;
    const result = await captureWokwiSerial({
      projectPath: projectPath || project.wokwiProjectPath || "",
      timeoutMs
    });

    await saveEvidence(project, "lastSerialCapture", result);

    res.json({
      projectId,
      evidenceType: "serial-capture",
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to capture serial output" });
  }
};

export const getWokwiEvidence = async (req, res) => {
  try {
    const { projectId } = req.params;

    const access = await ensureProjectAccess(projectId, req.user._id);
    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const project = access.project;
    res.json({
      projectId,
      wokwiUrl: project.wokwiUrl,
      wokwiProjectPath: project.wokwiProjectPath,
      evidence: project.wokwiEvidence || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to fetch Wokwi evidence" });
  }
};

export const startInteractiveMcpSession = async (req, res) => {
  try {
    const { projectId, projectPath = "", quiet = true } = req.body;

    let resolvedPath = projectPath;

    if (projectId) {
      const access = await ensureProjectAccess(projectId, req.user._id);
      if (access.error) {
        return res.status(access.error.status).json(access.error.payload);
      }

      resolvedPath = resolvedPath || access.project.wokwiProjectPath || "";
    }

    const session = await startWokwiMcpSession({
      projectPath: resolvedPath,
      quiet
    });

    res.json({
      mode: "interactive",
      session
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to start MCP session" });
  }
};

export const callInteractiveMcpTool = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { tool, argumentsInput = {} } = req.body;

    if (!tool) {
      return res.status(400).json({ error: "tool is required" });
    }

    const output = await callWokwiMcpTool({ sessionId, tool, argumentsInput });
    res.json(output);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to call MCP tool" });
  }
};

export const stopInteractiveMcpSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await stopWokwiMcpSession(sessionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to stop MCP session" });
  }
};

export const listInteractiveMcpSessions = async (_req, res) => {
  try {
    res.json({ sessions: listWokwiMcpSessions() });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to list MCP sessions" });
  }
};

export const getLocalWokwiFiles = async (req, res) => {
  try {
    const { projectId, projectPath = "", diagramFile = "diagram.json", sketchFile = "sketch.ino" } = req.body;

    const access = await ensureProjectAccess(projectId, req.user._id);
    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const project = access.project;
    const resolvedPath = projectPath || project.wokwiProjectPath || "";
    const files = await readWokwiProjectFiles({
      projectPath: resolvedPath,
      diagramFile,
      sketchFile
    });

    res.json({
      projectId,
      projectPath: resolvedPath,
      ...files
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load local Wokwi files" });
  }
};

export const syncCompileRunWokwi = async (req, res) => {
  try {
    const {
      projectId,
      projectPath = "",
      diagramJson,
      sketchCode,
      diagramFile = "diagram.json",
      sketchFile = "sketch.ino",
      fqbn = "arduino:avr:uno",
      timeoutMs = 30000,
      compileTimeoutMs = 180000,
      expectText = "",
      failText = "",
      captureScreenshot = false,
      screenshotTime = 1200
    } = req.body;

    if (typeof sketchCode !== "string") {
      return res.status(400).json({ error: "sketchCode is required" });
    }

    if (diagramJson === undefined || diagramJson === null) {
      return res.status(400).json({ error: "diagramJson is required" });
    }

    const access = await ensureProjectAccess(projectId, req.user._id);
    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const project = access.project;
    const resolvedPath = projectPath || project.wokwiProjectPath || "";

    if (!resolvedPath) {
      return res.status(400).json({ error: "projectPath is required" });
    }

    const writeResult = await writeWokwiProjectFiles({
      projectPath: resolvedPath,
      diagramJson,
      sketchCode,
      diagramFile,
      sketchFile
    });

    const compileResult = await compileWokwiSketch({
      projectPath: resolvedPath,
      sketchFile,
      fqbn,
      timeoutMs: compileTimeoutMs
    });

    if (!compileResult.ok) {
      return res.status(400).json({
        projectId,
        projectPath: resolvedPath,
        stage: "compile",
        writeResult,
        compileResult
      });
    }

    const resolvedExpectText = expectText?.trim() || "BOOT_OK";

    if (resolvedExpectText && !sketchCode.includes(resolvedExpectText)) {
      return res.status(400).json({
        projectId,
        projectPath: resolvedPath,
        stage: "validation",
        error: `Expected text \"${resolvedExpectText}\" was not found in sketchCode. Add Serial.println(\"${resolvedExpectText}\") in setup() or update Expect text.`
      });
    }

    const artifactsDir = path.join(resolvedPath, ".hardcode");
    let screenshotFile = "";
    if (captureScreenshot) {
      await mkdir(artifactsDir, { recursive: true });
      screenshotFile = path.join(artifactsDir, "latest-screenshot.png");
    }

    const runResult = await runWokwiProject({
      projectPath: resolvedPath,
      timeoutMs,
      expectText: resolvedExpectText,
      failText,
      screenshotTime: captureScreenshot ? Number(screenshotTime) || 1200 : undefined,
      screenshotFile
    });

    await saveEvidence(project, "lastRun", runResult);

    res.json({
      projectId,
      projectPath: resolvedPath,
      stage: "run",
      writeResult,
      compileResult,
      runResult,
      screenshotAvailable: Boolean(captureScreenshot && existsSync(screenshotFile)),
      screenshotUrl: captureScreenshot ? `/api/wokwi/local/screenshot/${projectId}` : ""
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed local sync/compile/run" });
  }
};

export const getLocalWokwiScreenshot = async (req, res) => {
  try {
    const { projectId } = req.params;

    const access = await ensureProjectAccess(projectId, req.user._id);
    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const project = access.project;
    const resolvedPath = project.wokwiProjectPath || "";
    if (!resolvedPath) {
      return res.status(400).json({ error: "wokwiProjectPath is not configured" });
    }

    const screenshotPath = path.join(resolvedPath, ".hardcode", "latest-screenshot.png");
    if (!existsSync(screenshotPath)) {
      return res.status(404).json({ error: "No local screenshot available yet" });
    }

    res.sendFile(screenshotPath);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load local screenshot" });
  }
};

export const generateCustomChipBlueprint = async (req, res) => {
  try {
    const { projectId, chipName = "", purpose = "", userPrompt = "" } = req.body;

    const access = await ensureProjectAccess(projectId, req.user._id);
    if (access.error) {
      return res.status(access.error.status).json(access.error.payload);
    }

    const template = await generateCustomChipTemplate({
      project: access.project,
      chipName,
      purpose,
      userPrompt
    });

    res.json({
      projectId,
      template
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to generate custom chip blueprint" });
  }
};
