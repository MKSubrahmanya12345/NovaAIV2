import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { compileSketchToHex } from "../controllers/compile.controller.js";

const router = express.Router();

// POST /api/compile/sketch - Compile Arduino sketch to hex for embedded simulator
router.post("/sketch", protectRoute, compileSketchToHex);

export default router;
