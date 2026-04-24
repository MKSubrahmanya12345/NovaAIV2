import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile, stat, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MAX_TAIL = 6000;
const MAX_WORKBENCH_FILE_BYTES = 2 * 1024 * 1024;
const MAX_WORKBENCH_ENTRIES = 2500;
const WORKBENCH_EXCLUDED_DIRS = new Set([".git", "node_modules", ".vscode"]);
const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".cpp",
  ".cs",
  ".h",
  ".hpp",
  ".ini",
  ".ino",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".py",
  ".rs",
  ".sh",
  ".test",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);
const PREFERRED_WORKBENCH_FILES = [
  "sketch.ino",
  "diagram.json",
  "wokwi.toml",
  "wokwi.ini",
  "diagram.ini",
  "smoke.test.yaml",
  "smoke.test.yml"
];

/** Extensions included in simulator AI bundles and compile staging (top-level project sources). */
const SOURCE_BUNDLE_EXT = new Set([
  ".ino",
  ".cpp",
  ".cc",
  ".c",
  ".h",
  ".hpp",
  ".S",
  ".s",
  ".inc"
]);

const MAX_SOURCE_BUNDLE_FILES = 40;
const MAX_SOURCE_BUNDLE_FILE_CHARS = 24_000;
const MAX_SOURCE_BUNDLE_TOTAL_CHARS = 220_000;

const isUnderBuildOrArtifacts = (relPath = "") => {
  const n = String(relPath || "").replace(/\\/g, "/").toLowerCase();
  return n.startsWith("build/") || n.startsWith(".novaai/") || n.includes("/build/");
};

const shouldIncludeInSourceBundle = (relPath = "") => {
  if (!relPath || isUnderBuildOrArtifacts(relPath)) return false;
  const ext = path.extname(relPath).toLowerCase();
  if (SOURCE_BUNDLE_EXT.has(ext)) return true;
  const lower = relPath.toLowerCase();
  return lower === "libraries.txt" || lower.endsWith("/libraries.txt");
};

const trimTail = (value = "", max = MAX_TAIL) => {
  const text = String(value || "");
  return text.length > max ? text.slice(-max) : text;
};

const createWorkbenchError = (message, code, extras = {}) => {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extras);
  return error;
};

const toWorkbenchPath = (value = "") => {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .trim();
};

const getProjectRoot = (projectPath = "") => {
  if (!projectPath?.trim()) {
    throw createWorkbenchError("projectPath is required", "WORKBENCH_PROJECT_PATH_REQUIRED");
  }

  return path.resolve(projectPath.trim());
};

const resolveWorkbenchTarget = ({ projectPath, workbenchPath = "" }) => {
  const rootPath = getProjectRoot(projectPath);
  const normalizedWorkbenchPath = toWorkbenchPath(workbenchPath);
  const absolutePath = path.resolve(rootPath, normalizedWorkbenchPath || ".");
  const rootPrefix = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;

  if (absolutePath !== rootPath && !absolutePath.startsWith(rootPrefix)) {
    throw createWorkbenchError(
      "Requested file path escapes the selected project root",
      "WORKBENCH_PATH_ESCAPE"
    );
  }

  return {
    rootPath,
    workbenchPath: normalizedWorkbenchPath,
    absolutePath
  };
};

const toRelativeWorkbenchPath = (rootPath, absolutePath) => {
  const relativePath = path.relative(rootPath, absolutePath);
  return relativePath ? relativePath.split(path.sep).join("/") : "";
};

const looksLikeTextByExtension = (absolutePath = "") => {
  const extension = path.extname(absolutePath).toLowerCase();
  return !extension || TEXT_EXTENSIONS.has(extension);
};

const isProbablyTextBuffer = (buffer, absolutePath = "") => {
  if (looksLikeTextByExtension(absolutePath)) {
    return true;
  }

  if (!buffer?.length) {
    return true;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspicious = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }

    if ((byte < 7 || (byte > 14 && byte < 32)) && byte !== 9 && byte !== 10 && byte !== 13) {
      suspicious += 1;
    }
  }

  return suspicious / sample.length < 0.12;
};

const serializeWorkbenchFileMeta = ({ rootPath, absolutePath, stats, isText = true }) => {
  const extension = path.extname(absolutePath).toLowerCase();

  return {
    type: "file",
    name: path.basename(absolutePath),
    path: toRelativeWorkbenchPath(rootPath, absolutePath),
    extension,
    size: stats.size,
    modifiedAtMs: Math.round(stats.mtimeMs),
    isText
  };
};

const sortWorkbenchEntries = (entries = []) => {
  return [...entries].sort((left, right) => {
    if (left.isDirectory() && !right.isDirectory()) return -1;
    if (!left.isDirectory() && right.isDirectory()) return 1;
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });
};

const collectWorkbenchFiles = (node, output = []) => {
  if (!node) {
    return output;
  }

  if (node.type === "file") {
    output.push(node);
    return output;
  }

  for (const child of node.children || []) {
    collectWorkbenchFiles(child, output);
  }

  return output;
};

const pickPreferredWorkbenchFile = (files = []) => {
  const textFiles = files.filter((file) => file.isText);

  for (const preferredName of PREFERRED_WORKBENCH_FILES) {
    const match = textFiles.find((file) => file.path.toLowerCase() === preferredName || file.name.toLowerCase() === preferredName);
    if (match?.path) {
      return match.path;
    }
  }

  return textFiles[0]?.path || files[0]?.path || "";
};

const buildWorkbenchTree = async ({ rootPath, absolutePath, relativePath = "", tracker }) => {
  tracker.directoryCount += 1;

  let entries = [];
  try {
    entries = await readdir(absolutePath, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const children = [];

  for (const entry of sortWorkbenchEntries(entries)) {
    if (tracker.entryCount >= MAX_WORKBENCH_ENTRIES) {
      tracker.truncated = true;
      break;
    }

    if (entry.isSymbolicLink()) {
      continue;
    }

    const childAbsolutePath = path.join(absolutePath, entry.name);
    const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (WORKBENCH_EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }

      tracker.entryCount += 1;
      children.push(await buildWorkbenchTree({
        rootPath,
        absolutePath: childAbsolutePath,
        relativePath: childRelativePath,
        tracker
      }));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    tracker.entryCount += 1;

    let fileStats = null;
    try {
      fileStats = await stat(childAbsolutePath);
    } catch {
      continue;
    }

    if (!fileStats.isFile()) {
      continue;
    }

    const isText = looksLikeTextByExtension(childAbsolutePath);
    if (isText) {
      tracker.textFileCount += 1;
    }
    tracker.fileCount += 1;

    children.push(serializeWorkbenchFileMeta({
      rootPath,
      absolutePath: childAbsolutePath,
      stats: fileStats,
      isText
    }));
  }

  return {
    type: "directory",
    name: path.basename(absolutePath) || absolutePath,
    path: relativePath,
    children
  };
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

const stageMultiFileSketchForCompile = async (projectPath, sketchFile) => {
  const rootPath = getProjectRoot(projectPath);
  const normalizedSketch = toWorkbenchPath(sketchFile);
  const primaryAbs = path.join(rootPath, normalizedSketch);

  if (!existsSync(primaryAbs)) {
    throw new Error(`Sketch file does not exist: ${primaryAbs}`);
  }

  const primaryName = path.basename(primaryAbs);
  const sketchFolderName = path.basename(primaryName, path.extname(primaryName));
  if (!sketchFolderName) {
    throw new Error(`Invalid sketch file name: ${sketchFile}`);
  }

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "NovaAI-arduino-"));
  const tempSketchDir = path.join(tmpRoot, sketchFolderName);
  await mkdir(tempSketchDir, { recursive: true });

  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!SOURCE_BUNDLE_EXT.has(ext)) continue;
    const from = path.join(rootPath, ent.name);
    const to = path.join(tempSketchDir, ent.name);
    await copyFile(from, to);
  }

  const primaryDest = path.join(tempSketchDir, primaryName);
  if (!existsSync(primaryDest)) {
    await copyFile(primaryAbs, primaryDest);
  }

  return { tmpRoot, tempSketchDir, sketchFolderName };
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

  const rootPath = getProjectRoot(projectPath);
  const sketchPath = path.join(rootPath, toWorkbenchPath(sketchFile));
  if (!existsSync(sketchPath)) {
    throw new Error(`Sketch file does not exist: ${sketchPath}`);
  }

  const arduinoCliPath = resolveArduinoCliPath();
  const buildDir = path.join(rootPath, "build");
  await mkdir(buildDir, { recursive: true });

  let tmpRoot = "";
  try {
    const { tmpRoot: stagedRoot, tempSketchDir } = await stageMultiFileSketchForCompile(projectPath, sketchFile);
    tmpRoot = stagedRoot;

    const compileResult = await runCommand({
      command: arduinoCliPath,
      args: ["compile", "--fqbn", fqbn, "--output-dir", buildDir, tempSketchDir],
      cwd: rootPath,
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
        projectPath: rootPath,
        sketchFile,
        fqbn,
        buildDir,
        timedOut: compileResult.timedOut,
        compileMode: "multi-file-staged"
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
    if (tmpRoot) {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
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

/**
 * Collects text sources (.ino/.cpp/.h/…) for simulator + design AI prompts.
 * Respects per-file and total character budgets to avoid oversized prompts.
 */
export const readWorkbenchSourceBundle = async ({
  projectPath,
  diagramFile = "diagram.json",
  sketchFile = "sketch.ino",
  maxFiles = MAX_SOURCE_BUNDLE_FILES,
  maxFileChars = MAX_SOURCE_BUNDLE_FILE_CHARS,
  maxTotalChars = MAX_SOURCE_BUNDLE_TOTAL_CHARS
}) => {
  const rootPath = getProjectRoot(projectPath);
  const workbench = await scanWokwiWorkbenchTree({ projectPath: rootPath });
  const files = collectWorkbenchFiles(workbench.tree).filter((f) => f.isText);

  const candidates = [];
  const add = (rel) => {
    const x = toWorkbenchPath(rel);
    if (!x || candidates.includes(x)) return;
    candidates.push(x);
  };

  add(diagramFile);
  add(sketchFile);
  add("libraries.txt");
  add("wokwi.toml");

  for (const f of files) {
    if (shouldIncludeInSourceBundle(f.path)) {
      add(f.path);
    }
  }

  const snippets = [];
  let totalChars = 0;
  let omittedFileCount = 0;

  for (const relPath of candidates) {
    if (snippets.length >= maxFiles) {
      omittedFileCount += candidates.length - snippets.length;
      break;
    }

    try {
      const { file, content } = await readWokwiWorkbenchFile({
        projectPath: rootPath,
        filePath: relPath
      });

      if (!file?.isText) continue;

      const raw = String(content || "");
      const truncated = raw.length > maxFileChars;
      const slice = truncated ? raw.slice(0, maxFileChars) : raw;
      const entryCost = slice.length + relPath.length + 48;
      if (totalChars + entryCost > maxTotalChars) {
        omittedFileCount += candidates.length - snippets.length;
        break;
      }

      totalChars += entryCost;
      snippets.push({
        path: relPath,
        content: slice,
        truncated
      });
    } catch {
      omittedFileCount += 1;
    }
  }

  return {
    projectPath: workbench.projectPath,
    diagramFile: toWorkbenchPath(diagramFile),
    sketchFile: toWorkbenchPath(sketchFile),
    filePaths: snippets.map((s) => s.path),
    snippets,
    truncatedProject: omittedFileCount > 0,
    omittedFileCount
  };
};

export const scanWokwiWorkbenchTree = async ({ projectPath }) => {
  const rootPath = getProjectRoot(projectPath);

  let rootStats = null;
  try {
    rootStats = await stat(rootPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createWorkbenchError("Selected project path does not exist", "WORKBENCH_PROJECT_PATH_MISSING");
    }
    throw error;
  }

  if (!rootStats.isDirectory()) {
    throw createWorkbenchError("projectPath must point to a directory", "WORKBENCH_PROJECT_NOT_DIRECTORY");
  }

  const tracker = {
    entryCount: 0,
    fileCount: 0,
    directoryCount: 0,
    textFileCount: 0,
    truncated: false
  };

  const tree = await buildWorkbenchTree({
    rootPath,
    absolutePath: rootPath,
    relativePath: "",
    tracker
  });

  const files = collectWorkbenchFiles(tree);

  return {
    projectPath: rootPath,
    tree,
    preferredFile: pickPreferredWorkbenchFile(files),
    stats: {
      fileCount: tracker.fileCount,
      directoryCount: tracker.directoryCount,
      textFileCount: tracker.textFileCount,
      truncated: tracker.truncated
    }
  };
};

export const getWokwiWorkbenchFileMeta = async ({ projectPath, filePath }) => {
  const { rootPath, absolutePath } = resolveWorkbenchTarget({
    projectPath,
    workbenchPath: filePath
  });

  let fileStats = null;
  try {
    fileStats = await stat(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createWorkbenchError("Selected file does not exist", "WORKBENCH_FILE_MISSING");
    }
    throw error;
  }

  if (!fileStats.isFile()) {
    throw createWorkbenchError("Selected path must point to a file", "WORKBENCH_FILE_NOT_A_FILE");
  }

  return serializeWorkbenchFileMeta({
    rootPath,
    absolutePath,
    stats: fileStats,
    isText: looksLikeTextByExtension(absolutePath)
  });
};

export const readWokwiWorkbenchFile = async ({ projectPath, filePath }) => {
  const { rootPath, absolutePath } = resolveWorkbenchTarget({
    projectPath,
    workbenchPath: filePath
  });

  let fileStats = null;
  try {
    fileStats = await stat(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createWorkbenchError("Selected file does not exist", "WORKBENCH_FILE_MISSING");
    }
    throw error;
  }

  if (!fileStats.isFile()) {
    throw createWorkbenchError("Selected path must point to a file", "WORKBENCH_FILE_NOT_A_FILE");
  }

  if (fileStats.size > MAX_WORKBENCH_FILE_BYTES) {
    return {
      file: serializeWorkbenchFileMeta({
        rootPath,
        absolutePath,
        stats: fileStats,
        isText: false
      }),
      content: "",
      readOnly: true,
      readOnlyReason: `File is larger than ${Math.round(MAX_WORKBENCH_FILE_BYTES / (1024 * 1024))}MB`
    };
  }

  const buffer = await readFile(absolutePath);
  const isText = isProbablyTextBuffer(buffer, absolutePath);

  return {
    file: serializeWorkbenchFileMeta({
      rootPath,
      absolutePath,
      stats: fileStats,
      isText
    }),
    content: isText ? buffer.toString("utf8") : "",
    readOnly: !isText,
    readOnlyReason: isText ? "" : "Binary or unsupported file type"
  };
};

export const writeWokwiWorkbenchFile = async ({
  projectPath,
  filePath,
  content = "",
  expectedModifiedAtMs,
  force = false
}) => {
  if (typeof content !== "string") {
    throw createWorkbenchError("content must be a string", "WORKBENCH_CONTENT_REQUIRED");
  }

  const { rootPath, absolutePath } = resolveWorkbenchTarget({
    projectPath,
    workbenchPath: filePath
  });

  let beforeStats = null;
  let fileAlreadyExists = false;
  try {
    beforeStats = await stat(absolutePath);
    fileAlreadyExists = beforeStats.isFile();
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  if (beforeStats && !beforeStats.isFile()) {
    throw createWorkbenchError("Selected path must point to a file", "WORKBENCH_FILE_NOT_A_FILE");
  }

  const expectedVersion = Number(expectedModifiedAtMs);
  const hasExpectedVersion = Number.isFinite(expectedVersion);

  if (
    fileAlreadyExists
    && !force
    && hasExpectedVersion
    && Math.abs(beforeStats.mtimeMs - expectedVersion) > 5
  ) {
    throw createWorkbenchError("File changed on disk before save completed", "WORKBENCH_FILE_CONFLICT", {
      currentFile: serializeWorkbenchFileMeta({
        rootPath,
        absolutePath,
        stats: beforeStats,
        isText: looksLikeTextByExtension(absolutePath)
      })
    });
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");

  const afterStats = await stat(absolutePath);

  return {
    file: serializeWorkbenchFileMeta({
      rootPath,
      absolutePath,
      stats: afterStats,
      isText: true
    }),
    savedAt: new Date().toISOString(),
    bytesWritten: Buffer.byteLength(content, "utf8")
  };
};
