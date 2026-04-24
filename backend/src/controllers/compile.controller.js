import { compileWokwiSketch } from "../services/wokwi-local.service.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Project from "../models/project.model.js";

/**
 * Compile a sketch to hex code for embedded Wokwi simulator
 * POST /api/compile/sketch
 * 
 * Request body:
 * {
 *   "projectId": "ObjectId",
 *   "sketchCode": "string",
 *   "fqbn": "arduino:avr:uno" (optional)
 * }
 * 
 * Response:
 * {
 *   "hexCode": "string",
 *   "compileResult": { ... }
 * }
 */
export const compileSketchToHex = async (req, res) => {
  try {
    const { projectId, sketchCode, fqbn = "arduino:avr:uno" } = req.body;

    if (!sketchCode || !sketchCode.trim()) {
      return res.status(400).json({ error: "sketchCode is required" });
    }

    // Optional: verify project ownership
    if (projectId) {
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (project.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    // Create temporary directory for compilation
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "hardcode-compile-"));

    try {
      // Write sketch file
      const sketchPath = path.join(tmpRoot, "sketch.ino");
      await writeFile(sketchPath, sketchCode, "utf8");

      // Compile using Arduino CLI
      const compileResult = await compileWokwiSketch({
        projectPath: tmpRoot,
        sketchFile: "sketch.ino",
        fqbn,
        timeoutMs: 180000
      });

      if (!compileResult.ok) {
        return res.status(400).json({
          error: "Compilation failed",
          compileResult
        });
      }

      // Read the compiled hex file
      const { readFile } = await import("node:fs/promises");
      const hexPath = compileResult.metadata?.firmwarePath;
      
      if (!hexPath) {
        return res.status(500).json({
          error: "Compiled hex file path not found"
        });
      }

      const hexContent = await readFile(hexPath, "utf8");

      res.json({
        hexCode: hexContent,
        compileResult
      });

    } finally {
      // Clean up temporary files
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }

  } catch (err) {
    console.error("Compile sketch error:", err);
    res.status(500).json({
      error: err.message || "Failed to compile sketch"
    });
  }
};
