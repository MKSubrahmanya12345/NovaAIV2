import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MAX_TAIL = 6000;

const trimTail = (value = "", max = MAX_TAIL) => {
  const text = String(value || "");
  return text.length > max ? text.slice(-max) : text;
};

const resolveArduinoCliPath = () => {
  if (process.env.ARDUINO_CLI_PATH?.trim()) {
    return process.env.ARDUINO_CLI_PATH.trim();
  }

  const home = process.env.USERPROFILE || process.env.HOME || "";
  const windowsLocal = path.join(home, ".arduino-cli", "bin", "arduino-cli.exe");
  const unixLocal = path.join(home, ".arduino-cli", "bin", "arduino-cli");

  if (existsSync(windowsLocal)) return windowsLocal;
  if (existsSync(unixLocal)) return unixLocal;

  return "arduino-cli";
};

const runCommand = ({ command, args, cwd, timeoutMs = 120000, env = process.env }) => {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd,
      env,
      shell: process.platform === "win32"
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: -1,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        command: `${command} ${args.join(" ")}`
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        exitCode: code ?? -1,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        command: `${command} ${args.join(" ")}`
      });
    });
  });
};

const ensureWokwiToml = async (projectPath) => {
  const tomlPath = path.join(projectPath, "wokwi.toml");
  if (existsSync(tomlPath)) return;

  await writeFile(tomlPath, `[wokwi]\nversion = 1\nfirmware = "build/sketch.ino.hex"\n`, "utf8");
};

const copyCompiledHex = async ({ buildDir }) => {
  const files = await readdir(buildDir);
  const hexCandidate = files.find((name) => name.endsWith(".ino.hex"));

  if (!hexCandidate) {
    throw new Error("Compile succeeded but no .ino.hex output was found in build directory");
  }

  const sourcePath = path.join(buildDir, hexCandidate);
  const targetPath = path.join(buildDir, "sketch.ino.hex");

  if (sourcePath !== targetPath) {
    const content = await readFile(sourcePath);
    await writeFile(targetPath, content);
  }

  return targetPath;
};

export const writeWokwiProjectFiles = async ({
  projectPath,
  diagramJson,
  sketchCode,
  diagramFile = "diagram.json",
  sketchFile = "sketch.ino"
}) => {
  if (!projectPath?.trim()) {
    throw new Error("projectPath is required");
  }

  await mkdir(projectPath, { recursive: true });
  await ensureWokwiToml(projectPath);

  const diagramPath = path.join(projectPath, diagramFile);
  const sketchPath = path.join(projectPath, sketchFile);

  const normalizedDiagram = typeof diagramJson === "string"
    ? JSON.stringify(JSON.parse(diagramJson), null, 2)
    : JSON.stringify(diagramJson || {}, null, 2);

  await writeFile(diagramPath, normalizedDiagram, "utf8");
  await writeFile(sketchPath, sketchCode || "", "utf8");

  return {
    diagramPath,
    sketchPath
  };
};

export const compileWokwiSketch = async ({
  projectPath,
  sketchFile = "sketch.ino",
  fqbn = "arduino:avr:uno",
  timeoutMs = 180000
}) => {
  if (!projectPath?.trim()) {
    throw new Error("projectPath is required");
  }

  const sketchPath = path.join(projectPath, sketchFile);
  if (!existsSync(sketchPath)) {
    throw new Error(`Sketch file does not exist: ${sketchPath}`);
  }

  const arduinoCliPath = resolveArduinoCliPath();
  const buildDir = path.join(projectPath, "build");
  await mkdir(buildDir, { recursive: true });

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "hardcode-arduino-"));
  const sketchName = "hardcode_sketch";
  const tempSketchDir = path.join(tmpRoot, sketchName);
  const tempSketchFile = path.join(tempSketchDir, `${sketchName}.ino`);

  await mkdir(tempSketchDir, { recursive: true });
  const sourceCode = await readFile(sketchPath, "utf8");
  await writeFile(tempSketchFile, sourceCode, "utf8");

  try {
    const compileResult = await runCommand({
      command: arduinoCliPath,
      args: ["compile", "--fqbn", fqbn, "--output-dir", buildDir, tempSketchDir],
      cwd: projectPath,
      timeoutMs
    });

    const normalized = {
      ok: compileResult.ok,
      command: compileResult.command,
      exitCode: compileResult.exitCode,
      durationMs: compileResult.durationMs,
      stdoutTail: trimTail(compileResult.stdout),
      stderrTail: trimTail(compileResult.stderr),
      summary: compileResult.ok ? "Compile succeeded" : `Compile failed | exitCode=${compileResult.exitCode}`,
      metadata: {
        projectPath,
        sketchFile,
        fqbn,
        buildDir,
        timedOut: compileResult.timedOut
      },
      ranAt: new Date()
    };

    if (!compileResult.ok) {
      return normalized;
    }

    const firmwarePath = await copyCompiledHex({ buildDir });
    return {
      ...normalized,
      metadata: {
        ...normalized.metadata,
        firmwarePath
      }
    };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
};

export const readWokwiProjectFiles = async ({
  projectPath,
  diagramFile = "diagram.json",
  sketchFile = "sketch.ino"
}) => {
  if (!projectPath?.trim()) {
    throw new Error("projectPath is required");
  }

  const diagramPath = path.join(projectPath, diagramFile);
  const sketchPath = path.join(projectPath, sketchFile);

  return {
    diagramJson: existsSync(diagramPath) ? await readFile(diagramPath, "utf8") : "",
    sketchCode: existsSync(sketchPath) ? await readFile(sketchPath, "utf8") : ""
  };
};