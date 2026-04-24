import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const resolveWokwiCliPath = () => {
  if (process.env.WOKWI_CLI_PATH?.trim()) {
    return process.env.WOKWI_CLI_PATH.trim();
  }

  const home = process.env.USERPROFILE || process.env.HOME || "";
  const windowsDefault = path.join(home, ".wokwi", "bin", "wokwi-cli.exe");
  const unixDefault = path.join(home, ".wokwi", "bin", "wokwi-cli");

  if (existsSync(windowsDefault)) return windowsDefault;
  if (existsSync(unixDefault)) return unixDefault;

  return "wokwi-cli";
};

export const checkWokwiCliReady = () => {
  const token = process.env.WOKWI_CLI_TOKEN;

  if (!token) {
    console.warn("[wokwi] WOKWI_CLI_TOKEN is not set. MCP/Wokwi CLI features are disabled.");
    return;
  }

  const wokwiCliPath = resolveWokwiCliPath();
  const version = spawnSync(wokwiCliPath, ["--version"], {
    encoding: "utf8",
    env: process.env,
    shell: true,
  });

  if (version.error || version.status !== 0) {
    console.warn("[wokwi] wokwi-cli not found or not executable. Install wokwi-cli or set WOKWI_CLI_PATH.");
    return;
  }

  console.log(`[wokwi] CLI ready (${version.stdout.trim() || "version unknown"}). MCP bridge can be enabled.`);
};
