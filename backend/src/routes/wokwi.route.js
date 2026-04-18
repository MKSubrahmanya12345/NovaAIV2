import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  lintProjectWokwi,
  runProjectWokwi,
  runScenarioWokwi,
  captureSerialWokwi,
  getWokwiEvidence,
  getLocalWokwiFiles,
  syncCompileRunWokwi,
  getLocalWokwiScreenshot,
  generateCustomChipBlueprint,
  startInteractiveMcpSession,
  callInteractiveMcpTool,
  stopInteractiveMcpSession,
  listInteractiveMcpSessions
} from "../controllers/wokwi.controller.js";

const router = express.Router();

router.post("/wokwi/lint", protectRoute, lintProjectWokwi);
router.post("/wokwi/run", protectRoute, runProjectWokwi);
router.post("/wokwi/scenario", protectRoute, runScenarioWokwi);
router.post("/wokwi/serial/capture", protectRoute, captureSerialWokwi);
router.post("/wokwi/local/files", protectRoute, getLocalWokwiFiles);
router.post("/wokwi/local/sync-run", protectRoute, syncCompileRunWokwi);
router.get("/wokwi/local/screenshot/:projectId", protectRoute, getLocalWokwiScreenshot);
router.post("/wokwi/custom-chip/generate", protectRoute, generateCustomChipBlueprint);
router.get("/wokwi/evidence/:projectId", protectRoute, getWokwiEvidence);

router.post("/wokwi/mcp/session/start", protectRoute, startInteractiveMcpSession);
router.get("/wokwi/mcp/sessions", protectRoute, listInteractiveMcpSessions);
router.post("/wokwi/mcp/session/:sessionId/tool", protectRoute, callInteractiveMcpTool);
router.post("/wokwi/mcp/session/:sessionId/stop", protectRoute, stopInteractiveMcpSession);

export default router;
