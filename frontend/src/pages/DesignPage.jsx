import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useThemeStore } from "../store/useThemeStore";
import DesignChat from "../components/DesignChat";
import useVoiceGuidance from "../hooks/useVoiceGuidance";

const defaultWokwiUrl = "";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getInitialProject = (locationState) => {
  return locationState?.projectSnapshot || null;
};

const getDraftStorageKey = (projectId) => `hardcode:design:draft:${projectId}`;
const getWokwiUrlStorageKey = (projectId) => `hardcode:design:wokwi-url:${projectId}`;
const getVoiceStorageKey = (projectId) => `hardcode:design:voice:${projectId}`;

export default function DesignPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const draggingRef = useRef(false);
  const lastVoiceErrorRef = useRef({ code: "", at: 0 });

  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === "dark";

  const [project, setProject] = useState(() => getInitialProject(location.state));
  const [messages, setMessages] = useState(() => getInitialProject(location.state)?.designMessages || []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(58);
  const [wokwiContext, setWokwiContext] = useState({ connected: false, reason: "No live circuit context" });
  const [draftRestored, setDraftRestored] = useState(false);
  const [wokwiUrlFallback, setWokwiUrlFallback] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [localRunLoading, setLocalRunLoading] = useState(false);
  const [useLocalPreview, setUseLocalPreview] = useState(true);
  const [localScreenshotUrl, setLocalScreenshotUrl] = useState("");

  const designState = project?.designState || {};
  const ideaState = project?.ideaState || {};
  const componentsState = project?.componentsState || {};
  const wokwiUrl = project?.wokwiUrl || project?.designState?.wokwiUrl || wokwiUrlFallback || defaultWokwiUrl;

  const {
    isVoiceSupported,
    isRecognitionSupported,
    status: voiceStatus,
    speakText,
    startListening,
    stopListening,
    pauseForTyping,
  } = useVoiceGuidance({
    enabled: voiceEnabled,
    rate: speechRate,
    handsFree: handsFreeMode,
    onFinalTranscript: ({ text, autoSend }) => {
      if (!text) return;

      setInput(text);

      if (autoSend) {
        pushAssistantMessage(text);
      }
    },
    onInterimTranscript: (text) => {
      if (!handsFreeMode || !text) return;
      setInput(text);
    },
    onError: (error) => {
      const payload =
        typeof error === "string"
          ? { code: "unknown_error", message: error, recoverable: false }
          : (error || { code: "unknown_error", message: "Voice error", recoverable: false });

      const now = Date.now();
      const recent = lastVoiceErrorRef.current;
      if (recent.code === payload.code && now - recent.at < 3500) {
        return;
      }

      lastVoiceErrorRef.current = { code: payload.code, at: now };

      if (payload.code === "network" && payload.recoverable) {
        toast.error("Microphone connection dropped. Retrying automatically...");
        return;
      }

      toast.error(payload.message || "Voice guidance error");
    }
  });

  useEffect(() => {
    if (!id) return;

    try {
      const cachedUrl = localStorage.getItem(getWokwiUrlStorageKey(id));
      if (cachedUrl && cachedUrl.trim()) {
        setWokwiUrlFallback(cachedUrl.trim());
      }
    } catch {
      // Ignore localStorage errors.
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const nextUrl = (project?.wokwiUrl || project?.designState?.wokwiUrl || "").trim();
    if (!nextUrl) return;

    try {
      localStorage.setItem(getWokwiUrlStorageKey(id), nextUrl);
      setWokwiUrlFallback(nextUrl);
    } catch {
      // Ignore localStorage errors.
    }
  }, [id, project?.wokwiUrl, project?.designState?.wokwiUrl]);

  useEffect(() => {
    if (!id) return;

    try {
      const rawDraft = localStorage.getItem(getDraftStorageKey(id));
      if (!rawDraft) return;

      const parsed = JSON.parse(rawDraft);

      if (typeof parsed?.input === "string") {
        setInput(parsed.input);
      }

      if (typeof parsed?.leftPanelWidth === "number") {
        setLeftPanelWidth(clamp(parsed.leftPanelWidth, 30, 70));
      }

      setDraftRestored(true);
    } catch {
      // Ignore malformed draft state and continue with defaults.
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    try {
      const rawVoice = localStorage.getItem(getVoiceStorageKey(id));
      if (!rawVoice) return;

      const parsed = JSON.parse(rawVoice);

      if (typeof parsed?.voiceEnabled === "boolean") {
        setVoiceEnabled(parsed.voiceEnabled);
      }

      if (typeof parsed?.handsFreeMode === "boolean") {
        setHandsFreeMode(parsed.handsFreeMode);
      }

      if (typeof parsed?.speechRate === "number") {
        setSpeechRate(clamp(parsed.speechRate, 0.7, 1.2));
      }
    } catch {
      // Ignore malformed voice settings.
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    try {
      const payload = {
        input,
        leftPanelWidth,
        updatedAt: Date.now()
      };
      localStorage.setItem(getDraftStorageKey(id), JSON.stringify(payload));
    } catch {
      // localStorage can fail in strict browser modes.
    }
  }, [id, input, leftPanelWidth]);

  useEffect(() => {
    if (!id) return;

    try {
      const payload = {
        voiceEnabled,
        handsFreeMode,
        speechRate,
        updatedAt: Date.now()
      };
      localStorage.setItem(getVoiceStorageKey(id), JSON.stringify(payload));
    } catch {
      // localStorage can fail in strict browser modes.
    }
  }, [id, handsFreeMode, speechRate, voiceEnabled]);

  useEffect(() => {
    if (!id) return;

    const handleBeforeUnload = () => {
      try {
        const payload = {
          input,
          leftPanelWidth,
          updatedAt: Date.now()
        };
        localStorage.setItem(getDraftStorageKey(id), JSON.stringify(payload));
      } catch {
        // Best effort save on close/refresh.
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [id, input, leftPanelWidth]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!draggingRef.current || !containerRef.current) return;

      const bounds = containerRef.current.getBoundingClientRect();
      const nextLeftWidth = ((event.clientX - bounds.left) / bounds.width) * 100;
      setLeftPanelWidth(clamp(nextLeftWidth, 30, 70));
    };

    const handlePointerUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const loadProject = async () => {
      try {
        // Use route state only for immediate paint, then always refresh from backend.
        if (location.state?.projectSnapshot) {
          setProject(location.state.projectSnapshot);
          setMessages(location.state.projectSnapshot?.designMessages || []);
        }

        const res = await axios.get(
          `http://localhost:5000/api/project/${id}`,
          { withCredentials: true }
        );

        setProject(res.data);
        setMessages(res.data?.designMessages || []);
      } catch (err) {
        console.error("Load Design Project Error:", err);
        toast.error(err?.response?.data?.error || "Unable to load design project");
      } finally {
        setBooting(false);
      }
    };

    if (id) {
      loadProject();
    }
  }, [id, location.state]);

  useEffect(() => {
    const bootDesign = async () => {
      if (!id || booting || messages.length > 0) return;

      try {
        setLoading(true);
        const res = await axios.post(
          "http://localhost:5000/api/design/init",
          { projectId: id },
          { withCredentials: true }
        );

        setMessages([{ role: "ai", content: res.data.reply }]);
        speakText(res.data.reply);
        setProject(prev => prev ? { ...prev, designState: res.data.designState } : prev);
        if (res.data?.wokwiContext) {
          setWokwiContext(res.data.wokwiContext);
        }
      } catch (err) {
        const errorMessage = err?.response?.data?.error || "Unable to start Design AI";
        toast.error(errorMessage);
        setMessages([{ role: "ai", content: errorMessage }]);
        speakText(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    bootDesign();
  }, [id, booting, messages.length, speakText]);

  useEffect(() => {
    const loadLiveContext = async () => {
      if (!id) return;

      try {
        const res = await axios.get(
          `http://localhost:5000/api/design/context/${id}`,
          { withCredentials: true }
        );

        if (res.data?.wokwiContext) {
          setWokwiContext(res.data.wokwiContext);
        }
      } catch (err) {
        console.error("Load Wokwi Context Error:", err);
      }
    };

    loadLiveContext();
  }, [id]);

  const pushAssistantMessage = async (messageText) => {
    const nextMessage = messageText.trim();
    if (!nextMessage || loading) return;

    setMessages(prev => [...prev, { role: "user", content: nextMessage }]);
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post(
        "http://localhost:5000/api/design/chat",
        { projectId: id, message: nextMessage },
        { withCredentials: true }
      );

      setMessages(prev => [...prev, { role: "ai", content: res.data.reply }]);
      speakText(res.data.reply);
      setProject(prev => prev ? { ...prev, designState: res.data.designState } : prev);
      if (res.data?.wokwiContext) {
        setWokwiContext(res.data.wokwiContext);
      }
    } catch (err) {
      const errorMessage = err?.response?.data?.error || "Design chat failed";
      toast.error(errorMessage);
      setMessages(prev => [...prev, { role: "ai", content: errorMessage }]);
      speakText(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    pushAssistantMessage(input);
  };

  const handleInputChange = (nextInput) => {
    pauseForTyping();
    setInput(nextInput);
  };

  const handleDebug = () => {
    pushAssistantMessage(
      "Debug the current design context. Summarize the active Wokwi layout, list missing parts, and give the next manual step only. Keep it concise."
    );
  };

  const handleToggleVoice = () => {
    if (!isVoiceSupported) {
      toast.error("Voice is not supported in this browser");
      return;
    }

    setVoiceEnabled((prev) => {
      const next = !prev;

      if (!next) {
        stopListening();
      } else if (handsFreeMode && isRecognitionSupported) {
        startListening();
      }

      return next;
    });
  };

  const handleToggleHandsFree = () => {
    if (!isRecognitionSupported) {
      toast.error("Speech recognition is not supported in this browser");
      return;
    }

    if (!voiceEnabled) {
      setVoiceEnabled(true);
    }

    setHandsFreeMode((prev) => !prev);
  };

  const handleMicToggle = () => {
    if (!isRecognitionSupported) {
      toast.error("Speech recognition is not supported in this browser");
      return;
    }

    if (!voiceEnabled) {
      setVoiceEnabled(true);
    }

    if (voiceStatus === "listening" || voiceStatus === "duplex") {
      stopListening();
      return;
    }

    startListening();
  };

  const handleDividerPointerDown = () => {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleSetWokwiUrl = async () => {
    const currentUrl = project?.wokwiUrl || "https://wokwi.com/projects/328451800839488084";
    const inputValue = window.prompt("Paste Wokwi project URL", currentUrl);

    if (inputValue === null) return;

    const nextUrl = inputValue.trim();

    try {
      const res = await axios.put(
        `http://localhost:5000/api/project/${id}`,
        { wokwiUrl: nextUrl },
        { withCredentials: true }
      );

      setProject(res.data);
      setWokwiUrlFallback(nextUrl);

      try {
        if (nextUrl) {
          localStorage.setItem(getWokwiUrlStorageKey(id), nextUrl);
        } else {
          localStorage.removeItem(getWokwiUrlStorageKey(id));
        }
      } catch {
        // Ignore localStorage errors.
      }

      const contextRes = await axios.get(
        `http://localhost:5000/api/design/context/${id}`,
        { withCredentials: true }
      );

      if (contextRes.data?.wokwiContext) {
        setWokwiContext(contextRes.data.wokwiContext);
      }

      toast.success(nextUrl ? "Wokwi URL saved" : "Wokwi URL cleared");
    } catch (err) {
      console.error("Save Wokwi URL Error:", err);
      toast.error(err?.response?.data?.error || "Failed to save Wokwi URL");
    }
  };

  const handleLocalCompileRun = async () => {
    if (!id || localRunLoading) return;

    const projectPath = (project?.wokwiProjectPath || "").trim();
    if (!projectPath) {
      toast.error("Local project path is not set. Save wokwiProjectPath in project settings first.");
      return;
    }

    try {
      setLocalRunLoading(true);

      const filesRes = await axios.post(
        "http://localhost:5000/api/wokwi/local/files",
        {
          projectId: id,
          projectPath,
          diagramFile: "diagram.json",
          sketchFile: "sketch.ino"
        },
        { withCredentials: true }
      );

      const rawDiagram = filesRes.data?.diagramJson || "";
      const sketchCode = filesRes.data?.sketchCode || "";

      let parsedDiagram = null;
      try {
        parsedDiagram = JSON.parse(rawDiagram);
      } catch {
        throw new Error("Local diagram.json is invalid JSON");
      }

      const runRes = await axios.post(
        "http://localhost:5000/api/wokwi/local/sync-run",
        {
          projectId: id,
          projectPath,
          diagramFile: "diagram.json",
          sketchFile: "sketch.ino",
          diagramJson: parsedDiagram,
          sketchCode,
          fqbn: "arduino:avr:uno",
          timeoutMs: 20000,
          compileTimeoutMs: 180000,
          captureScreenshot: true,
          screenshotTime: 1200,
          expectText: "BOOT_OK",
          failText: ""
        },
        { withCredentials: true }
      );

      const runSummary = runRes.data?.runResult?.summary || "Local compile/run completed";
      const serialTail = runRes.data?.runResult?.serialTail || "";
      const screenshotUrl = runRes.data?.screenshotUrl
        ? `http://localhost:5000${runRes.data.screenshotUrl}?t=${Date.now()}`
        : "";

      if (screenshotUrl) {
        setLocalScreenshotUrl(screenshotUrl);
        setUseLocalPreview(true);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `Local runner status: ${runSummary}${serialTail ? `\n\nSerial:\n${serialTail}` : ""}`
        }
      ]);

      const contextRes = await axios.get(
        `http://localhost:5000/api/design/context/${id}`,
        { withCredentials: true }
      );

      if (contextRes.data?.wokwiContext) {
        setWokwiContext(contextRes.data.wokwiContext);
      }

      toast.success("Local sync + compile + run passed");
    } catch (err) {
      const responseData = err?.response?.data || {};
      const message =
        responseData?.error ||
        responseData?.compileResult?.summary ||
        responseData?.runResult?.summary ||
        err?.message ||
        "Local compile/run failed";

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `Local runner failed: ${message}`
        }
      ]);
      toast.error(message);
    } finally {
      setLocalRunLoading(false);
    }
  };

  return (
    <div className={`h-screen overflow-hidden ${isDark ? "bg-[#212121] text-[#e5e5e5]" : "bg-[#f5f5f5] text-[#111]"}`}>
      <div className="mx-auto flex h-full w-full max-w-screen-2xl flex-col gap-3 px-4 py-4 lg:px-5">
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b pb-3 ${isDark ? "border-white/10" : "border-black/10"}`}>
          <div>
            <button
              onClick={() => navigate(`/project/${id}`)}
              className={`border px-3 py-1 text-xs font-semibold transition ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"}`}
            >
              ← Back to Project
            </button>
            <h1 className="mt-2 text-2xl font-semibold">Design AI</h1>
            <p className={`mt-1 text-sm ${isDark ? "text-[#a3a3a3]" : "text-[#555]"}`}>
              Design-only workspace with Wokwi on the right and AI guidance on the left.
            </p>
            {draftRestored && (
              <p className={`mt-1 text-xs font-semibold ${isDark ? "text-green-400" : "text-green-700"}`}>
                Draft restored after refresh/close.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSetWokwiUrl}
              className={`border px-4 py-2 text-xs font-semibold transition ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"}`}
            >
              Set Wokwi URL
            </button>

            <button
              onClick={handleLocalCompileRun}
              disabled={localRunLoading || loading}
              className={`px-4 py-2 text-xs font-semibold transition ${isDark ? "bg-emerald-700 hover:bg-emerald-600" : "bg-emerald-600 text-white hover:bg-emerald-700"} ${(localRunLoading || loading) ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {localRunLoading ? "Running Local..." : "Run Local Build"}
            </button>

            <button
              onClick={() => setUseLocalPreview((prev) => !prev)}
              className={`border px-4 py-2 text-xs font-semibold transition ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"}`}
            >
              {useLocalPreview ? "Show Wokwi URL" : "Show Local Preview"}
            </button>

            <button
              onClick={handleDebug}
              disabled={loading}
              className={`px-4 py-2 text-xs font-semibold transition ${isDark ? "bg-[#3a3a3a] hover:bg-[#4a4a4a]" : "bg-black text-white hover:bg-[#222]"} ${loading ? "cursor-not-allowed opacity-60" : ""}`}
            >
              Debug Design
            </button>
            <button
              onClick={toggleTheme}
              className={`border px-4 py-2 text-xs font-semibold transition ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"}`}
            >
              {isDark ? "Light" : "Dark"}
            </button>
          </div>
        </div>

        <div ref={containerRef} className={`flex min-h-0 flex-1 items-stretch gap-0 overflow-hidden border ${isDark ? "border-white/10" : "border-black/10"}`}>
          <section
            className="min-w-0 overflow-hidden rounded-l-2xl border-r-0"
            style={{ width: `${leftPanelWidth}%` }}
          >
            <div className={`flex h-full min-h-0 flex-col overflow-hidden ${isDark ? "bg-[#2a2a2a]" : "bg-white"}`}>
              <div className={`border-b px-4 py-3 ${isDark ? "border-white/10" : "border-black/10"}`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${isDark ? "text-[#a3a3a3]" : "text-[#666]"}`}>
                  Wokwi
                </p>
                <h2 className="mt-1 text-base font-semibold">Simulator / layout view</h2>
              </div>

              <div className="flex min-h-0 flex-1 flex-col bg-[#1e1e1e] p-2">
                {useLocalPreview && localScreenshotUrl ? (
                  <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center border border-white/10 bg-black">
                    <img
                      alt="Local simulation preview"
                      src={localScreenshotUrl}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : useLocalPreview ? (
                  <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center border border-white/10 bg-black px-6 text-center">
                    <p className="text-sm text-white/70">
                      Local preview mode is active. Click Run Local Build to generate an updated preview,
                      or switch to Show Wokwi URL if you want to open the cloud simulator.
                    </p>
                  </div>
                ) : wokwiUrl ? (
                  <iframe
                    title="Wokwi simulator"
                    src={wokwiUrl}
                    className="h-full min-h-0 w-full flex-1 border border-white/10 bg-black"
                    allow="clipboard-read; clipboard-write; fullscreen"
                  />
                ) : (
                  <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center border border-white/10 bg-black px-6 text-center">
                    <p className="text-sm text-white/70">
                      No Wokwi project link is connected yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <button
            type="button"
            onPointerDown={handleDividerPointerDown}
            aria-label="Resize design panels"
            className={`group relative z-10 flex w-3 cursor-col-resize items-stretch justify-center border-x ${isDark ? "border-white/10 bg-[#1f1f1f]" : "border-black/10 bg-[#eaeaea]"}`}
          >
            <span className={`my-4 w-1 rounded-full ${isDark ? "bg-white/20 group-hover:bg-white/40" : "bg-black/20 group-hover:bg-black/40"}`} />
          </button>

          <section
            className="min-w-0 overflow-hidden rounded-r-2xl border-l-0"
            style={{ width: `${100 - leftPanelWidth}%` }}
          >
            <div className={`flex h-full min-h-0 overflow-hidden ${isDark ? "bg-[#2a2a2a]" : "bg-white"}`}>
              <DesignChat
                project={project}
                wokwiContext={wokwiContext}
                messages={messages}
                input={input}
                setInput={handleInputChange}
                loading={loading}
                onSend={handleSend}
                onDebug={handleDebug}
                voiceEnabled={voiceEnabled}
                handsFreeMode={handsFreeMode}
                speechRate={speechRate}
                setSpeechRate={setSpeechRate}
                voiceStatus={voiceStatus}
                voiceSupported={isVoiceSupported}
                recognitionSupported={isRecognitionSupported}
                onToggleVoice={handleToggleVoice}
                onToggleHandsFree={handleToggleHandsFree}
                onMicToggle={handleMicToggle}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}