import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectDB } from "./lib/db.js";
import { checkWokwiCliReady } from "./lib/wokwi.js";
import cookieParser from "cookie-parser";


import projectRoutes from "./routes/project.route.js";
import ideationRoutes from "./routes/ideation.route.js";
import authRoutes from "./routes/auth.route.js";
import componentsRoutes from "./routes/components.route.js";
import designRoutes from "./routes/design.route.js";
import projectAiRoutes from "./routes/project-ai.route.js";
import wokwiRoutes from "./routes/wokwi.route.js";
import voiceRoutes from "./routes/voice.route.js";
import compileRoutes from "./routes/compile.route.js";



const app = express();
const port = Number(process.env.PORT) || 5000;
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174"
]);

app.use(cors({
  origin(origin, callback) {
    // Allow server-to-server or non-browser tools without Origin header.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(cookieParser());

app.use(express.json({ limit: "12mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, port });
});

app.use("/api", ideationRoutes);
app.use("/api", projectRoutes);
app.use("/api", componentsRoutes);
app.use("/api", designRoutes);
app.use("/api", projectAiRoutes);
app.use("/api", wokwiRoutes);
app.use("/api", voiceRoutes);
app.use("/api/compile", compileRoutes);
app.use("/api/auth", authRoutes);


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  checkWokwiCliReady();
  connectDB();
});