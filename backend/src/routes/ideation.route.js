import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { chatIdeationProject, createIdeationProject } from "../controllers/ideation.controller.js";

const router = express.Router();

router.post("/project", protectRoute, createIdeationProject);
router.post("/project/chat", protectRoute, chatIdeationProject);

export default router;