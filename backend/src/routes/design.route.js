import express from "express";
import {
  chatDesign,
  initDesign,
  getDesignContext
} from "../controllers/design.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// optional init
router.post("/design/init", protectRoute, initDesign);

// main chat
router.post("/design/chat", protectRoute, chatDesign);
router.get("/design/context/:projectId", protectRoute, getDesignContext);

export default router;