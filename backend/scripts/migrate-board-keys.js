import "dotenv/config";
import mongoose from "mongoose";

import Project from "../src/models/project.model.js";

const LEGACY_TO_REGISTRY = {
  "arduino-mega": "ARDUINO_MEGA",
  "arduino-uno": "ARDUINO_UNO",
  "arduino-nano": "ARDUINO_NANO",
  "esp32-devkit-v1": "ESP32_DEVKIT_V1",
  "raspberry-pi-pico": "RASPBERRY_PI_PICO",
  "attiny85": "ATTINY85"
};

const normalize = (value) => {
  const v = String(value || "").trim();
  return LEGACY_TO_REGISTRY[v] || null;
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI missing. Set it in backend/.env");
  }

  await mongoose.connect(uri);

  const cursor = Project.find({
    $or: [
      { "meta.board": { $in: Object.keys(LEGACY_TO_REGISTRY) } },
      { "generationProfile.board": { $in: Object.keys(LEGACY_TO_REGISTRY) } }
    ]
  }).cursor();

  let scanned = 0;
  let updated = 0;

  for await (const project of cursor) {
    scanned += 1;
    const nextMetaBoard = normalize(project?.meta?.board);
    const nextProfileBoard = normalize(project?.generationProfile?.board);

    let dirty = false;
    if (nextMetaBoard && project.meta.board !== nextMetaBoard) {
      project.meta.board = nextMetaBoard;
      dirty = true;
    }
    if (nextProfileBoard && project.generationProfile.board !== nextProfileBoard) {
      project.generationProfile.board = nextProfileBoard;
      dirty = true;
    }

    if (dirty) {
      project.generationProfile = project.generationProfile || {};
      project.generationProfile.updatedAt = new Date();
      await project.save();
      updated += 1;
    }
  }

  console.log(JSON.stringify({ scanned, updated }));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

