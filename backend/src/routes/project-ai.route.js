import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  chatProjectAi,
  getProjectAiContext,
  getProjectAiHistory,
  initProjectAi
} from "../controllers/projectAi.controller.js";

const router = express.Router();

router.get("/project-ai/history/:id", protectRoute, getProjectAiHistory);
router.get("/project-ai/context/:id", protectRoute, getProjectAiContext);
router.post("/project-ai/init", protectRoute, initProjectAi);
router.post("/project-ai/chat", protectRoute, chatProjectAi);

export default router;