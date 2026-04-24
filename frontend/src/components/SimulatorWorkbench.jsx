import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useThemeStore } from "../store/useThemeStore";

const API_BASE = "http://localhost:5000/api";
const AXIOS_CONFIG = { withCredentials: true };

const pretty = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatBytes = (value = 0) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatWhen = (value = "") => {
  if (!value) return "Never";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const hasFilePath = (node, targetPath) => {
  if (!node || !targetPath) return false;
  if (node.type === "file") return node.path === targetPath;
  return (node.children || []).some((child) => hasFilePath(child, targetPath));
};

const collectQuickFiles = (node, output = []) => {
  if (!node) return output;

  if (node.type === "file") {
    output.push(node);
    return output;
  }

  for (const child of node.children || []) {
    collectQuickFiles(child, output);
  }

  return output;
};

const getEditorLabel = (file) => {
  const extension = String(file?.extension || "").toLowerCase();

  if (extension === ".ino" || extension === ".cpp" || extension === ".c" || extension === ".h" || extension === ".hpp") {
    return "C/C++";
  }
  if (extension === ".json") return "JSON";
  if (extension === ".toml") return "TOML";
  if (extension === ".yaml" || extension === ".yml") return "YAML";
  if (extension === ".md") return "Markdown";
  if (extension === ".js" || extension === ".jsx" || extension === ".ts" || extension === ".tsx") return "JavaScript/TypeScript";
  return "Plain text";
};

function EvidenceMiniCard({ title, item, isDark }) {
  const badgeLabel = item ? (item.ok ? "PASS" : "FAIL") : "Idle";
  const badgeClasses = item
    ? (item.ok ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300")
    : "bg-amber-500/20 text-amber-300";

  return (
    <div className={`rounded-xl border px-3 py-3 ${isDark ? "border-white/10 bg-[#172234]" : "border-[#d8cfbf] bg-white"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]">{title}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClasses}`}>
          {badgeLabel}
        </span>
      </div>
      <p className={`mt-2 text-[11px] leading-relaxed ${isDark ? "text-[#aebbd0]" : "text-[#5f6470]"}`}>
        {item?.summary || "No run captured yet."}
      </p>
      <p className={`mt-1 text-[10px] ${isDark ? "text-[#7d8aa3]" : "text-[#7b7780]"}`}>
        {item?.ranAt ? formatWhen(item.ranAt) : "No timestamp"}
      </p>
    </div>
  );
}

function ExplorerNode({
  node,
  depth,
  collapsedFolders,
  onToggleFolder,
  onSelectFile,
  selectedFilePath,
  isDark
}) {
  if (!node) return null;

  if (node.type === "directory") {
    const isCollapsed = Boolean(collapsedFolders[node.path]);
    const canToggle = (node.children || []).length > 0;

    return (
      <div>
        <button
          type="button"
          onClick={() => canToggle && onToggleFolder(node.path)}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${isDark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className={`w-3 text-[11px] ${isDark ? "text-[#8fa2bf]" : "text-[#6b7280]"}`}>
            {canToggle ? (isCollapsed ? "+" : "-") : ""}
          </span>
          <span className={`text-[11px] font-semibold uppercase tracking-[0.15em] ${isDark ? "text-[#8fb6ff]" : "text-[#0f766e]"}`}>DIR</span>
          <span className="truncate">{node.name}</span>
        </button>

        {!isCollapsed && (node.children || []).map((child) => (
          <ExplorerNode
            key={`${child.type}:${child.path || child.name}`}
            node={child}
            depth={depth + 1}
            collapsedFolders={collapsedFolders}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
            selectedFilePath={selectedFilePath}
            isDark={isDark}
          />
        ))}
      </div>
    );
  }

  const isSelected = selectedFilePath === node.path;

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.path)}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
        isSelected
          ? (isDark ? "bg-[#1d4ed8] text-white" : "bg-[#0f766e] text-white")
          : (isDark ? "hover:bg-white/10" : "hover:bg-black/5")
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span className={`text-[11px] font-semibold uppercase tracking-[0.15em] ${isSelected ? "text-white/80" : (isDark ? "text-[#7d8aa3]" : "text-[#6b7280]")}`}>FILE</span>
      <span className="truncate">{node.name}</span>
      {!node.isText && (
        <span className={`ml-auto text-[10px] ${isSelected ? "text-white/80" : (isDark ? "text-[#8a97ad]" : "text-[#7b7780]")}`}>
          read-only
        </span>
      )}
    </button>
  );
}

export default function SimulatorWorkbench({ projectId, projectSnapshot, onProjectUpdate }) {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";

  const [localProjectPath, setLocalProjectPath] = useState(projectSnapshot?.wokwiProjectPath || "");
  const [tree, setTree] = useState(null);
  const [treeStats, setTreeStats] = useState(null);
  const [collapsedFolders, setCollapsedFolders] = useState({});
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [editorValue, setEditorValue] = useState("");
  const [baselineValue, setBaselineValue] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [conflictFile, setConflictFile] = useState(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [savingPath, setSavingPath] = useState(false);
  const [runningAction, setRunningAction] = useState("");
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [liveSyncEnabled, setLiveSyncEnabled] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [lastDiskSyncAt, setLastDiskSyncAt] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const [evidence, setEvidence] = useState(null);

  const [diagramFile, setDiagramFile] = useState("diagram.json");
  const [sketchFile, setSketchFile] = useState("sketch.ino");
  const [scenarioPath, setScenarioPath] = useState("smoke.test.yaml");
  const [fqbn, setFqbn] = useState("arduino:avr:uno");
  const [timeoutMs, setTimeoutMs] = useState(20000);
  const [compileTimeoutMs, setCompileTimeoutMs] = useState(180000);
  const [expectText, setExpectText] = useState("");
  const [failText, setFailText] = useState("");

  const bootstrappedPathRef = useRef("");
  const conflictToastShownRef = useRef(false);

  const isDirty = Boolean(selectedFile?.isText) && editorValue !== baselineValue;
  const quickFiles = useMemo(() => collectQuickFiles(tree).filter((file) => {
    const lowered = file.path.toLowerCase();
    return lowered.endsWith(".ino")
      || lowered.endsWith("diagram.json")
      || lowered.endsWith("wokwi.toml")
      || lowered.endsWith("wokwi.ini")
      || lowered.endsWith(".yaml")
      || lowered.endsWith(".yml");
  }).slice(0, 8), [tree]);

  useEffect(() => {
    setLocalProjectPath(projectSnapshot?.wokwiProjectPath || "");
  }, [projectSnapshot?.wokwiProjectPath]);

  useEffect(() => {
    if (conflictFile) {
      return;
    }
    conflictToastShownRef.current = false;
  }, [conflictFile]);

  const toggleFolder = (folderPath) => {
    setCollapsedFolders((current) => ({
      ...current,
      [folderPath]: !current[folderPath]
    }));
  };

  const refreshEvidence = async () => {
    if (!projectId) return;

    try {
      const res = await axios.get(`${API_BASE}/wokwi/evidence/${projectId}`, AXIOS_CONFIG);
      setEvidence(res.data?.evidence || null);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to load simulator evidence");
    }
  };

  const loadWorkbenchFile = async (filePath, options = {}) => {
    const { silent = false, projectPathOverride = "" } = options;
    const resolvedProjectPath = (projectPathOverride || localProjectPath).trim();

    if (!projectId || !resolvedProjectPath || !filePath) {
      return false;
    }

    if (selectedFilePath && selectedFilePath !== filePath && isDirty && !autoSaveEnabled) {
      toast.error("Save the current file before switching, or turn auto-save back on.");
      return false;
    }

    if (selectedFilePath && selectedFilePath !== filePath && isDirty && autoSaveEnabled) {
      const ok = await saveSelectedFile({ silentSuccess: true, projectPathOverride: resolvedProjectPath });
      if (!ok) return false;
    }

    if (!silent) {
      setLoadingFile(true);
    }

    try {
      const res = await axios.post(
        `${API_BASE}/wokwi/local/workbench/file/read`,
        {
          projectId,
          projectPath: resolvedProjectPath,
          filePath
        },
        AXIOS_CONFIG
      );

      const nextFile = res.data?.file || null;
      const nextContent = typeof res.data?.content === "string" ? res.data.content : "";

      setSelectedFilePath(filePath);
      setSelectedFile(nextFile);
      setEditorValue(nextContent);
      setBaselineValue(nextContent);
      setConflictFile(null);
      setFileMessage(res.data?.readOnly
        ? `${nextFile?.name || filePath} is read-only here: ${res.data?.readOnlyReason || "Unsupported file type"}`
        : `Loaded ${nextFile?.path || filePath}`);
      setLastLoadedAt(new Date().toISOString());

      const lowered = String(filePath).toLowerCase();
      if (lowered.endsWith("diagram.json")) {
        setDiagramFile(filePath);
      }
      if (lowered.endsWith(".ino")) {
        setSketchFile(filePath);
      }
      if (lowered.endsWith(".yaml") || lowered.endsWith(".yml")) {
        setScenarioPath(filePath);
      }

      if (!silent) {
        toast.success(`Loaded ${nextFile?.name || filePath}`);
      }

      return true;
    } catch (error) {
      setFileMessage(error?.response?.data?.error || "Failed to load file");
      if (!silent) {
        toast.error(error?.response?.data?.error || "Failed to load file");
      }
      return false;
    } finally {
      if (!silent) {
        setLoadingFile(false);
      }
    }
  };

  const loadWorkbenchTree = async (projectPathOverride = "", options = {}) => {
    const { silent = false, preferCurrentSelection = true } = options;
    const resolvedProjectPath = (projectPathOverride || localProjectPath).trim();

    if (!projectId || !resolvedProjectPath) {
      if (!silent) {
        toast.error("Set a local Wokwi project path first.");
      }
      return false;
    }

    if (!silent) {
      setLoadingTree(true);
    }

    try {
      const res = await axios.post(
        `${API_BASE}/wokwi/local/workbench/tree`,
        {
          projectId,
          projectPath: resolvedProjectPath
        },
        AXIOS_CONFIG
      );

      const nextTree = res.data?.tree || null;
      const nextPreferredFile = res.data?.preferredFile || "";

      setTree(nextTree);
      setTreeStats(res.data?.stats || null);

      if (selectedFilePath && !hasFilePath(nextTree, selectedFilePath)) {
        setSelectedFilePath("");
        setSelectedFile(null);
        setEditorValue("");
        setBaselineValue("");
        setConflictFile(null);
        setFileMessage("The previously selected file no longer exists on disk.");
      }

      const nextFileToOpen = preferCurrentSelection && selectedFilePath && hasFilePath(nextTree, selectedFilePath)
        ? selectedFilePath
        : nextPreferredFile;

      if (nextFileToOpen && nextFileToOpen !== selectedFilePath) {
        await loadWorkbenchFile(nextFileToOpen, {
          silent: true,
          projectPathOverride: resolvedProjectPath
        });
      }

      if (!silent) {
        toast.success("Project tree loaded");
      }

      return true;
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to load project tree";
      setFileMessage(message);
      if (!silent) {
        toast.error(message);
      }
      return false;
    } finally {
      if (!silent) {
        setLoadingTree(false);
      }
    }
  };

  const saveSelectedFile = async (options = {}) => {
    const { force = false, silentSuccess = false, projectPathOverride = "" } = options;
    const resolvedProjectPath = (projectPathOverride || localProjectPath).trim();

    if (!projectId || !resolvedProjectPath || !selectedFilePath || !selectedFile?.isText) {
      return false;
    }

    if (!force && !isDirty) {
      return true;
    }

    setSavingFile(true);

    try {
      const res = await axios.post(
        `${API_BASE}/wokwi/local/workbench/file/write`,
        {
          projectId,
          projectPath: resolvedProjectPath,
          filePath: selectedFilePath,
          content: editorValue,
          expectedModifiedAtMs: selectedFile?.modifiedAtMs,
          force
        },
        AXIOS_CONFIG
      );

      setSelectedFile(res.data?.file || selectedFile);
      setBaselineValue(editorValue);
      setConflictFile(null);
      setLastSavedAt(res.data?.savedAt || new Date().toISOString());
      setFileMessage(`Saved ${res.data?.file?.path || selectedFilePath}`);

      if (!silentSuccess) {
        toast.success(`Saved ${res.data?.file?.name || selectedFilePath}`);
      }

      return true;
    } catch (error) {
      if (error?.response?.status === 409) {
        setConflictFile(error?.response?.data?.currentFile || { path: selectedFilePath });
        setFileMessage("Disk changed before save completed. Reload or overwrite.");
        toast.error("Disk changed before save completed. Reload or overwrite.");
        return false;
      }

      toast.error(error?.response?.data?.error || "Failed to save file");
      return false;
    } finally {
      setSavingFile(false);
    }
  };

  const ensureCurrentFileSaved = async () => {
    if (!isDirty || !selectedFile?.isText) {
      return true;
    }
    return saveSelectedFile({ silentSuccess: true });
  };

  const saveProjectPath = async () => {
    if (!projectId) return;

    try {
      setSavingPath(true);
      const res = await axios.put(
        `${API_BASE}/project/${projectId}`,
        { wokwiProjectPath: localProjectPath.trim() },
        AXIOS_CONFIG
      );

      onProjectUpdate?.(res.data);
      toast.success("Local Wokwi path saved");
      await refreshEvidence();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to save project path");
    } finally {
      setSavingPath(false);
    }
  };

  const runAction = async (label, request) => {
    if (!await ensureCurrentFileSaved()) {
      return;
    }

    try {
      setRunningAction(label);
      const res = await request();
      setLastResult(res.data);
      toast.success(`${label} completed`);
      await refreshEvidence();
    } catch (error) {
      const message = error?.response?.data?.error || `${label} failed`;
      setLastResult(error?.response?.data || { error: message });
      toast.error(message);
    } finally {
      setRunningAction("");
    }
  };

  const runLint = () => runAction("Lint", () => axios.post(
    `${API_BASE}/wokwi/lint`,
    {
      projectId,
      projectPath: localProjectPath.trim(),
      diagramFile: diagramFile.trim() || "diagram.json",
      timeoutMs: Number(timeoutMs) || 20000
    },
    AXIOS_CONFIG
  ));

  const runProject = () => runAction("Run", () => axios.post(
    `${API_BASE}/wokwi/run`,
    {
      projectId,
      projectPath: localProjectPath.trim(),
      timeoutMs: Number(timeoutMs) || 20000,
      expectText: expectText.trim(),
      failText: failText.trim()
    },
    AXIOS_CONFIG
  ));

  const runScenario = () => runAction("Scenario", () => axios.post(
    `${API_BASE}/wokwi/scenario`,
    {
      projectId,
      projectPath: localProjectPath.trim(),
      scenarioPath: scenarioPath.trim(),
      timeoutMs: Number(timeoutMs) || 20000,
      expectText: expectText.trim(),
      failText: failText.trim()
    },
    AXIOS_CONFIG
  ));

  const syncCompileRun = async () => {
    if (!projectId || !localProjectPath.trim()) {
      toast.error("Set a local Wokwi project path first.");
      return;
    }

    if (!await ensureCurrentFileSaved()) {
      return;
    }

    try {
      setRunningAction("Sync + Compile + Run");

      const localFilesRes = await axios.post(
        `${API_BASE}/wokwi/local/files`,
        {
          projectId,
          projectPath: localProjectPath.trim(),
          diagramFile: diagramFile.trim() || "diagram.json",
          sketchFile: sketchFile.trim() || "sketch.ino"
        },
        AXIOS_CONFIG
      );

      const diagramJson = JSON.parse(localFilesRes.data?.diagramJson || "{}");
      const sketchCode = String(localFilesRes.data?.sketchCode || "");

      const res = await axios.post(
        `${API_BASE}/wokwi/local/sync-run`,
        {
          projectId,
          projectPath: localProjectPath.trim(),
          diagramFile: diagramFile.trim() || "diagram.json",
          sketchFile: sketchFile.trim() || "sketch.ino",
          diagramJson,
          sketchCode,
          fqbn: fqbn.trim() || "arduino:avr:uno",
          timeoutMs: Number(timeoutMs) || 20000,
          compileTimeoutMs: Number(compileTimeoutMs) || 180000,
          expectText: expectText.trim(),
          failText: failText.trim()
        },
        AXIOS_CONFIG
      );

      setLastResult(res.data);
      toast.success("Sync + Compile + Run completed");
      await refreshEvidence();
    } catch (error) {
      const message =
        error?.response?.data?.error
        || error?.response?.data?.compileResult?.summary
        || error?.response?.data?.runResult?.summary
        || "Sync + Compile + Run failed";
      setLastResult(error?.response?.data || { error: message });
      toast.error(message);
    } finally {
      setRunningAction("");
    }
  };

  const refreshSelectedFileFromDisk = useEffectEvent(async () => {
    if (!projectId || !localProjectPath.trim() || !selectedFilePath || savingFile) {
      return;
    }

    try {
      const statusRes = await axios.post(
        `${API_BASE}/wokwi/local/workbench/file/status`,
        {
          projectId,
          projectPath: localProjectPath.trim(),
          filePath: selectedFilePath
        },
        AXIOS_CONFIG
      );

      const diskFile = statusRes.data?.file;
      if (!diskFile?.modifiedAtMs || diskFile.modifiedAtMs === selectedFile?.modifiedAtMs) {
        return;
      }

      if (isDirty) {
        setConflictFile(diskFile);
        setFileMessage("Disk changed while you had unsaved edits. Reload or overwrite.");
        if (!conflictToastShownRef.current) {
          toast.error("Disk changed while you were editing.");
          conflictToastShownRef.current = true;
        }
        return;
      }

      const reloaded = await axios.post(
        `${API_BASE}/wokwi/local/workbench/file/read`,
        {
          projectId,
          projectPath: localProjectPath.trim(),
          filePath: selectedFilePath
        },
        AXIOS_CONFIG
      );

      setSelectedFile(reloaded.data?.file || diskFile);
      setEditorValue(typeof reloaded.data?.content === "string" ? reloaded.data.content : "");
      setBaselineValue(typeof reloaded.data?.content === "string" ? reloaded.data.content : "");
      setConflictFile(null);
      setLastDiskSyncAt(new Date().toISOString());
      setFileMessage(`Reloaded ${diskFile.name} from disk`);
    } catch (error) {
      if (error?.response?.status === 404) {
        setConflictFile({ path: selectedFilePath, missing: true });
        setFileMessage("Selected file was removed on disk.");
      }
    }
  });

  const refreshTreeSilently = useEffectEvent(async () => {
    if (!projectId || !localProjectPath.trim()) {
      return;
    }

    try {
      const res = await axios.post(
        `${API_BASE}/wokwi/local/workbench/tree`,
        {
          projectId,
          projectPath: localProjectPath.trim()
        },
        AXIOS_CONFIG
      );

      const nextTree = res.data?.tree || null;
      setTree(nextTree);
      setTreeStats(res.data?.stats || null);

      if (selectedFilePath && !hasFilePath(nextTree, selectedFilePath)) {
        setSelectedFilePath("");
        setSelectedFile(null);
        setEditorValue("");
        setBaselineValue("");
        setConflictFile(null);
        setFileMessage("Selected file disappeared from the project tree.");
      }
    } catch {
      // Background refresh should not spam the user.
    }
  });

  const saveShortcut = useEffectEvent(async () => {
    if (!selectedFile?.isText) {
      return;
    }

    await saveSelectedFile();
  });

  useEffect(() => {
    if (!projectId) return;

    refreshEvidence();
  }, [projectId]);

  useEffect(() => {
    const savedPath = (projectSnapshot?.wokwiProjectPath || "").trim();
    if (!projectId || !savedPath || bootstrappedPathRef.current === savedPath) {
      return;
    }

    bootstrappedPathRef.current = savedPath;
    loadWorkbenchTree(savedPath, {
      silent: true,
      preferCurrentSelection: false
    });
  }, [projectId, projectSnapshot?.wokwiProjectPath]);

  useEffect(() => {
    if (!selectedFilePath || !liveSyncEnabled) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      refreshSelectedFileFromDisk();
    }, 2200);

    return () => window.clearInterval(interval);
  }, [selectedFilePath, liveSyncEnabled]);

  useEffect(() => {
    if (!localProjectPath.trim() || !liveSyncEnabled) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      refreshTreeSilently();
    }, 6000);

    return () => window.clearInterval(interval);
  }, [localProjectPath, liveSyncEnabled]);

  useEffect(() => {
    if (!autoSaveEnabled || !isDirty || !selectedFile?.isText || savingFile || conflictFile) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      saveSelectedFile({ silentSuccess: true });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [autoSaveEnabled, isDirty, editorValue, selectedFile?.path, savingFile, conflictFile]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveShortcut();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleEditorChange = (value) => {
    setEditorValue(value);
    setFileMessage(`Editing ${selectedFile?.name || "file"}${autoSaveEnabled ? " (auto-save on)" : ""}`);
  };

  const handleEditorKeyDown = (event) => {
    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();

    const textarea = event.currentTarget;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const nextValue = `${editorValue.slice(0, selectionStart)}  ${editorValue.slice(selectionEnd)}`;

    setEditorValue(nextValue);

    window.requestAnimationFrame(() => {
      textarea.selectionStart = selectionStart + 2;
      textarea.selectionEnd = selectionStart + 2;
    });
  };

  return (
    <div className={`h-full overflow-hidden ${isDark ? "bg-[#101929] text-[#e2e8f0]" : "bg-[#f3efe6] text-[#1f2937]"}`}>
      <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className={`min-h-0 overflow-y-auto border-b px-4 py-4 xl:border-b-0 xl:border-r ${isDark ? "border-[#223247] bg-[#111a28]" : "border-[#d8cfbf] bg-[#f8f3ea]"}`}>
          <div className="space-y-4">
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.25em] ${isDark ? "text-[#93c5fd]" : "text-[#0f766e]"}`}>SimulatorAI</p>
              <h2 className="mt-1 text-lg font-semibold">Wokwi Workbench</h2>
              <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-[#8fa2bf]" : "text-[#6b7280]"}`}>
                Browse local project files, edit them inline, and keep disk changes in sync without your custom VS Code extension.
              </p>
            </div>

            <div className={`rounded-2xl border px-3 py-3 ${isDark ? "border-[#304764] bg-[#132033]" : "border-[#d8cfbf] bg-white"}`}>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.16em]">Project Path</label>
              <input
                value={localProjectPath}
                onChange={(event) => setLocalProjectPath(event.target.value)}
                placeholder="C:/.../backend/wokwi-smoke"
                className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#304764] bg-[#0f1727] text-[#e2e8f0]" : "border-[#d8cfbf] bg-[#faf7f1] text-[#1f2937]"}`}
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveProjectPath}
                  disabled={savingPath}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${isDark ? "bg-[#1d4ed8] text-white hover:bg-[#2563eb]" : "bg-[#0f766e] text-white hover:bg-[#0d9488]"} ${savingPath ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  {savingPath ? "Saving..." : "Save Path"}
                </button>
                <button
                  type="button"
                  onClick={() => loadWorkbenchTree()}
                  disabled={loadingTree}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${isDark ? "border-[#36506f] bg-[#17263a] hover:bg-[#1d3048]" : "border-[#d8cfbf] bg-white hover:bg-[#f4efe6]"} ${loadingTree ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  {loadingTree ? "Loading..." : "Load Path"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAutoSaveEnabled((current) => !current)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${autoSaveEnabled ? (isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-800") : (isDark ? "bg-[#1a2333] text-[#9fb3cc]" : "bg-[#ece7dc] text-[#475569]")}`}
                >
                  Auto-save {autoSaveEnabled ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  onClick={() => setLiveSyncEnabled((current) => !current)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${liveSyncEnabled ? (isDark ? "bg-sky-500/20 text-sky-300" : "bg-sky-100 text-sky-800") : (isDark ? "bg-[#1a2333] text-[#9fb3cc]" : "bg-[#ece7dc] text-[#475569]")}`}
                >
                  Live Sync {liveSyncEnabled ? "On" : "Off"}
                </button>
              </div>

              <div className={`mt-3 grid grid-cols-2 gap-2 text-[11px] ${isDark ? "text-[#8fa2bf]" : "text-[#6b7280]"}`}>
                <div className={`rounded-xl px-3 py-2 ${isDark ? "bg-[#0f1727]" : "bg-[#faf7f1]"}`}>
                  Files: {treeStats?.fileCount ?? 0}
                </div>
                <div className={`rounded-xl px-3 py-2 ${isDark ? "bg-[#0f1727]" : "bg-[#faf7f1]"}`}>
                  Folders: {treeStats?.directoryCount ?? 0}
                </div>
                <div className={`rounded-xl px-3 py-2 ${isDark ? "bg-[#0f1727]" : "bg-[#faf7f1]"}`}>
                  Text files: {treeStats?.textFileCount ?? 0}
                </div>
                <div className={`rounded-xl px-3 py-2 ${isDark ? "bg-[#0f1727]" : "bg-[#faf7f1]"}`}>
                  {treeStats?.truncated ? "Tree truncated" : "Tree complete"}
                </div>
              </div>
            </div>

            {quickFiles.length > 0 && (
              <div className={`rounded-2xl border px-3 py-3 ${isDark ? "border-[#304764] bg-[#132033]" : "border-[#d8cfbf] bg-white"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Quick Open</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {quickFiles.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => loadWorkbenchFile(file.path)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${selectedFilePath === file.path
                        ? (isDark ? "bg-[#1d4ed8] text-white" : "bg-[#0f766e] text-white")
                        : (isDark ? "bg-[#17263a] text-[#93c5fd] hover:bg-[#1d3048]" : "bg-[#f4efe6] text-[#0f766e] hover:bg-[#ece5d8]")}`}
                    >
                      {file.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={`rounded-2xl border px-2 py-2 ${isDark ? "border-[#304764] bg-[#132033]" : "border-[#d8cfbf] bg-white"}`}>
              <div className="flex items-center justify-between px-2 py-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Project Explorer</p>
                <button
                  type="button"
                  onClick={() => loadWorkbenchTree("", { silent: true })}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${isDark ? "text-[#93c5fd] hover:bg-[#1d3048]" : "text-[#0f766e] hover:bg-[#f4efe6]"}`}
                >
                  Refresh
                </button>
              </div>

              <div className="mt-1 max-h-[42vh] overflow-y-auto">
                {tree?.children?.length ? (
                  tree.children.map((child) => (
                    <ExplorerNode
                      key={`${child.type}:${child.path || child.name}`}
                      node={child}
                      depth={0}
                      collapsedFolders={collapsedFolders}
                      onToggleFolder={toggleFolder}
                      onSelectFile={(path) => loadWorkbenchFile(path)}
                      selectedFilePath={selectedFilePath}
                      isDark={isDark}
                    />
                  ))
                ) : (
                  <div className={`px-3 py-4 text-sm ${isDark ? "text-[#8fa2bf]" : "text-[#6b7280]"}`}>
                    Load a project path to see files and folders here.
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <main className="min-h-0 overflow-hidden">
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto]">
            <div className={`border-b px-5 py-4 ${isDark ? "border-[#223247] bg-[#101929]" : "border-[#d8cfbf] bg-[#f7f2e8]"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isDark ? "text-[#93c5fd]" : "text-[#0f766e]"}`}>Editor</p>
                  <h3 className="mt-1 text-lg font-semibold">{selectedFile?.name || "No file selected"}</h3>
                  <p className={`mt-1 text-xs ${isDark ? "text-[#8fa2bf]" : "text-[#6b7280]"}`}>
                    {selectedFile?.path || "Choose a file from the project explorer to edit it here."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${selectedFile?.isText ? (isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-800") : (isDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-800")}`}>
                    {selectedFile ? (selectedFile.isText ? getEditorLabel(selectedFile) : "Read-only") : "Waiting"}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${isDirty ? (isDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-800") : (isDark ? "bg-[#1a2333] text-[#9fb3cc]" : "bg-[#ece7dc] text-[#475569]")}`}>
                    {isDirty ? "Unsaved changes" : "Saved"}
                  </span>

                  <button
                    type="button"
                    onClick={() => saveSelectedFile()}
                    disabled={!selectedFile?.isText || savingFile}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${isDark ? "bg-[#1d4ed8] text-white hover:bg-[#2563eb]" : "bg-[#0f766e] text-white hover:bg-[#0d9488]"} ${(!selectedFile?.isText || savingFile) ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {savingFile ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => loadWorkbenchFile(selectedFilePath)}
                    disabled={!selectedFilePath || loadingFile}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${isDark ? "border-[#36506f] bg-[#17263a] hover:bg-[#1d3048]" : "border-[#d8cfbf] bg-white hover:bg-[#f4efe6]"} ${(!selectedFilePath || loadingFile) ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    Reload
                  </button>
                  <button
                    type="button"
                    onClick={() => saveSelectedFile({ force: true })}
                    disabled={!selectedFile?.isText || savingFile || !conflictFile}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${isDark ? "border-red-500/40 text-red-300 hover:bg-red-500/10" : "border-red-200 text-red-700 hover:bg-red-50"} ${(!selectedFile?.isText || savingFile || !conflictFile) ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    Overwrite Disk
                  </button>
                </div>
              </div>

              <div className={`mt-3 grid grid-cols-2 gap-2 text-[11px] xl:grid-cols-4 ${isDark ? "text-[#8fa2bf]" : "text-[#6b7280]"}`}>
                <div className={`rounded-xl px-3 py-2 ${isDark ? "bg-[#132033]" : "bg-white"}`}>Size: {formatBytes(selectedFile?.size || 0)}</div>
                <div className={`rounded-xl px-3 py-2 ${isDark ? "bg-[#132033]" : "bg-white"}`}>Modified: {selectedFile?.modifiedAtMs ? formatWhen(selectedFile.modifiedAtMs) : "Unknown"}</div>
                <div className={`rounded-xl px-3 py-2 ${isDark ? "bg-[#132033]" : "bg-white"}`}>Last loaded: {formatWhen(lastLoadedAt)}</div>
                <div className={`rounded-xl px-3 py-2 ${isDark ? "bg-[#132033]" : "bg-white"}`}>Last saved: {formatWhen(lastSavedAt || lastDiskSyncAt)}</div>
              </div>

              {conflictFile && (
                <div className={`mt-3 rounded-2xl border px-4 py-3 ${isDark ? "border-red-500/30 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-800"}`}>
                  <p className="text-sm font-semibold">Disk changed outside the editor.</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Reload to accept the newest on-disk version, or use Overwrite Disk if your editor content should win.
                  </p>
                </div>
              )}
            </div>

            <div className="min-h-0 overflow-hidden px-5 py-4">
              <div className={`grid h-full min-h-0 grid-rows-[1fr_auto] rounded-2xl border ${isDark ? "border-[#304764] bg-[#132033]" : "border-[#d8cfbf] bg-white"}`}>
                <div className="min-h-0 overflow-hidden p-3">
                  {selectedFile ? (
                    selectedFile.isText ? (
                      <textarea
                        value={editorValue}
                        onChange={(event) => handleEditorChange(event.target.value)}
                        onKeyDown={handleEditorKeyDown}
                        spellCheck={false}
                        className={`h-full min-h-[340px] w-full resize-none rounded-xl border px-4 py-3 font-mono text-[13px] leading-relaxed outline-none ${isDark ? "border-[#304764] bg-[#0f1727] text-[#e2e8f0]" : "border-[#d8cfbf] bg-[#faf7f1] text-[#1f2937]"}`}
                      />
                    ) : (
                      <div className={`flex h-full items-center justify-center rounded-xl border border-dashed px-6 py-6 text-center ${isDark ? "border-[#304764] bg-[#0f1727] text-[#9fb3cc]" : "border-[#d8cfbf] bg-[#faf7f1] text-[#6b7280]"}`}>
                        <div>
                          <p className="text-sm font-semibold">This file is not editable here.</p>
                          <p className="mt-2 text-xs leading-relaxed">
                            Binary or unsupported files are shown as read-only so the workbench does not corrupt them.
                          </p>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className={`flex h-full items-center justify-center rounded-xl border border-dashed px-6 py-6 text-center ${isDark ? "border-[#304764] bg-[#0f1727] text-[#9fb3cc]" : "border-[#d8cfbf] bg-[#faf7f1] text-[#6b7280]"}`}>
                      <div>
                        <p className="text-sm font-semibold">No file open yet.</p>
                        <p className="mt-2 text-xs leading-relaxed">
                          Save a path, load the project tree, and click any file on the left to open it. Press Ctrl/Cmd+S any time to save.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`border-t px-4 py-3 text-xs ${isDark ? "border-[#223247] text-[#8fa2bf]" : "border-[#e6ddcf] text-[#6b7280]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>{fileMessage || "Ready."}</p>
                    <p>{loadingFile ? "Loading file..." : savingFile ? "Saving file..." : autoSaveEnabled ? "Auto-save armed" : "Manual save mode"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className={`border-t px-5 py-3 ${isDark ? "border-[#223247] bg-[#101929]" : "border-[#d8cfbf] bg-[#f7f2e8]"}`}>
              <p className={`text-xs ${isDark ? "text-[#8fa2bf]" : "text-[#6b7280]"}`}>
                {runningAction ? `${runningAction} in progress...` : "Workbench idle."} {liveSyncEnabled ? "Disk polling is active." : "Disk polling is paused."}
              </p>
            </div>
          </div>
        </main>

        <aside className={`min-h-0 overflow-y-auto border-t px-4 py-4 xl:border-t-0 xl:border-l ${isDark ? "border-[#223247] bg-[#111a28]" : "border-[#d8cfbf] bg-[#f8f3ea]"}`}>
          <div className="space-y-4">
            <div className={`rounded-2xl border px-3 py-3 ${isDark ? "border-[#304764] bg-[#132033]" : "border-[#d8cfbf] bg-white"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Bench Actions</p>
              <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-[#8fa2bf]" : "text-[#6b7280]"}`}>
                Run the selected local Wokwi project after saving your current editor buffer.
              </p>

              <div className="mt-3 grid gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em]">Diagram file</label>
                  <input
                    value={diagramFile}
                    onChange={(event) => setDiagramFile(event.target.value)}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#304764] bg-[#0f1727]" : "border-[#d8cfbf] bg-[#faf7f1]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em]">Sketch file</label>
                  <input
                    value={sketchFile}
                    onChange={(event) => setSketchFile(event.target.value)}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#304764] bg-[#0f1727]" : "border-[#d8cfbf] bg-[#faf7f1]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em]">Scenario path</label>
                  <input
                    value={scenarioPath}
                    onChange={(event) => setScenarioPath(event.target.value)}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#304764] bg-[#0f1727]" : "border-[#d8cfbf] bg-[#faf7f1]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em]">Board FQBN</label>
                  <input
                    value={fqbn}
                    onChange={(event) => setFqbn(event.target.value)}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#304764] bg-[#0f1727]" : "border-[#d8cfbf] bg-[#faf7f1]"}`}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em]">Timeout</label>
                  <input
                    type="number"
                    value={timeoutMs}
                    onChange={(event) => setTimeoutMs(Number(event.target.value || 0))}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#304764] bg-[#0f1727]" : "border-[#d8cfbf] bg-[#faf7f1]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em]">Compile timeout</label>
                  <input
                    type="number"
                    value={compileTimeoutMs}
                    onChange={(event) => setCompileTimeoutMs(Number(event.target.value || 0))}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#304764] bg-[#0f1727]" : "border-[#d8cfbf] bg-[#faf7f1]"}`}
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em]">Expect text</label>
                  <input
                    value={expectText}
                    onChange={(event) => setExpectText(event.target.value)}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#304764] bg-[#0f1727]" : "border-[#d8cfbf] bg-[#faf7f1]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em]">Fail text</label>
                  <input
                    value={failText}
                    onChange={(event) => setFailText(event.target.value)}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-[#304764] bg-[#0f1727]" : "border-[#d8cfbf] bg-[#faf7f1]"}`}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={runLint}
                  disabled={Boolean(runningAction)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${isDark ? "bg-[#17263a] text-[#93c5fd] hover:bg-[#1d3048]" : "bg-[#ece5d8] text-[#0f766e] hover:bg-[#e2d8c7]"} ${runningAction ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  Lint
                </button>
                <button
                  type="button"
                  onClick={runProject}
                  disabled={Boolean(runningAction)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${isDark ? "bg-[#17263a] text-[#93c5fd] hover:bg-[#1d3048]" : "bg-[#ece5d8] text-[#0f766e] hover:bg-[#e2d8c7]"} ${runningAction ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  Run
                </button>
                <button
                  type="button"
                  onClick={runScenario}
                  disabled={Boolean(runningAction)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${isDark ? "bg-[#17263a] text-[#93c5fd] hover:bg-[#1d3048]" : "bg-[#ece5d8] text-[#0f766e] hover:bg-[#e2d8c7]"} ${runningAction ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  Scenario
                </button>
                <button
                  type="button"
                  onClick={refreshEvidence}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${isDark ? "border-[#36506f] bg-[#132033] hover:bg-[#1d3048]" : "border-[#d8cfbf] bg-white hover:bg-[#f4efe6]"}`}
                >
                  Refresh
                </button>
              </div>

              <button
                type="button"
                onClick={syncCompileRun}
                disabled={Boolean(runningAction)}
                className={`mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isDark ? "bg-[#1d4ed8] text-white hover:bg-[#2563eb]" : "bg-[#0f766e] text-white hover:bg-[#0d9488]"} ${runningAction ? "cursor-not-allowed opacity-60" : ""}`}
              >
                Sync + Compile + Run
              </button>
            </div>

            <div className="grid gap-3">
              <EvidenceMiniCard title="Latest Lint" item={evidence?.lastLint} isDark={isDark} />
              <EvidenceMiniCard title="Latest Run" item={evidence?.lastRun} isDark={isDark} />
              <EvidenceMiniCard title="Latest Scenario" item={evidence?.lastScenario} isDark={isDark} />
            </div>

            <div className={`rounded-2xl border px-3 py-3 ${isDark ? "border-[#304764] bg-[#132033]" : "border-[#d8cfbf] bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">API Output</p>
                <button
                  type="button"
                  onClick={() => setLastResult(null)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${isDark ? "text-[#93c5fd] hover:bg-[#1d3048]" : "text-[#0f766e] hover:bg-[#f4efe6]"}`}
                >
                  Clear
                </button>
              </div>

              <pre className={`mt-3 max-h-[32vh] overflow-auto rounded-xl border px-3 py-3 text-[11px] leading-relaxed ${isDark ? "border-[#304764] bg-[#0f1727] text-[#dbe7f5]" : "border-[#d8cfbf] bg-[#faf7f1] text-[#1f2937]"}`}>
                {lastResult ? pretty(lastResult) : "No simulator action output yet."}
              </pre>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
