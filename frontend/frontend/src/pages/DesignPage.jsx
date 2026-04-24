import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useThemeStore } from "../store/useThemeStore";
import DesignChat from "../components/DesignChat";
import WokwiSimulator from "../components/WokwiSimulator";
import useVoiceGuidance from "../hooks/useVoiceGuidance";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getInitialProject = (locationState) => {
  return locationState?.projectSnapshot || null;
};

const getDraftStorageKey = (projectId) => `hardcode:design:draft:${projectId}`;
const getVoiceStorageKey = (projectId) => `hardcode:design:voice:${projectId}`;

const SIM_TEST_CASES = [
  {
    id: "blink-led",
    name: "Blink LED (UNO D13)",
    sketchCode: `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(350);
  digitalWrite(13, LOW);
  delay(350);
}
`,
    diagramJson: {
      version: 1,
      author: "HardCode",
      editor: "wokwi",
      parts: [
        { id: "uno", type: "wokwi-arduino-uno", x: 80, y: 120 },
        { id: "led1", type: "wokwi-led", x: 340, y: 150 }
      ],
      connections: [
        ["uno:13", "led1:A", "#ef4444", []],
        ["uno:GND", "led1:C", "#94a3b8", []]
      ],
      dependencies: {}
    }
  },
  {
    id: "counter-7seg",
    name: "7-Segment Counter",
    sketchCode: `const int segPins[8] = {2,3,4,5,6,7,8,9};

const byte digits[10][8] = {
  {1,1,1,1,1,1,0,0},
  {0,1,1,0,0,0,0,0},
  {1,1,0,1,1,0,1,0},
  {1,1,1,1,0,0,1,0},
  {0,1,1,0,0,1,1,0},
  {1,0,1,1,0,1,1,0},
  {1,0,1,1,1,1,1,0},
  {1,1,1,0,0,0,0,0},
  {1,1,1,1,1,1,1,0},
  {1,1,1,1,0,1,1,0}
};

void setup() {
  for (int i = 0; i < 8; i++) pinMode(segPins[i], OUTPUT);
}

void showDigit(int n) {
  for (int i = 0; i < 8; i++) {
    digitalWrite(segPins[i], digits[n][i] ? HIGH : LOW);
  }
}

void loop() {
  for (int i = 0; i < 10; i++) {
    showDigit(i);
    delay(500);
  }
}
`,
    diagramJson: {
      version: 1,
      author: "HardCode",
      editor: "wokwi",
      parts: [
        { id: "uno", type: "wokwi-arduino-uno", x: 70, y: 120 },
        { id: "seg1", type: "wokwi-7segment", x: 360, y: 120 }
      ],
      connections: [
        ["uno:2", "seg1:A", "#22c55e", []],
        ["uno:3", "seg1:B", "#22c55e", []],
        ["uno:4", "seg1:C", "#22c55e", []],
        ["uno:5", "seg1:D", "#22c55e", []],
        ["uno:6", "seg1:E", "#22c55e", []],
        ["uno:7", "seg1:F", "#22c55e", []],
        ["uno:8", "seg1:G", "#22c55e", []],
        ["uno:9", "seg1:DP", "#22c55e", []],
        ["uno:GND", "seg1:COM", "#94a3b8", []]
      ],
      dependencies: {}
    }
  },
  {
    id: "servo-button",
    name: "Servo + Button",
    sketchCode: `#include <Servo.h>

Servo s;
const int btnPin = 2;

void setup() {
  pinMode(btnPin, INPUT_PULLUP);
  s.attach(9);
}

void loop() {
  if (digitalRead(btnPin) == LOW) {
    s.write(165);
  } else {
    s.write(20);
  }
  delay(60);
}
`,
    diagramJson: {
      version: 1,
      author: "HardCode",
      editor: "wokwi",
      parts: [
        { id: "uno", type: "wokwi-arduino-uno", x: 70, y: 130 },
        { id: "servo1", type: "wokwi-servo", x: 330, y: 120 },
        { id: "btn1", type: "wokwi-pushbutton", x: 330, y: 270 }
      ],
      connections: [
        ["uno:9", "servo1:SIGNAL", "#60a5fa", []],
        ["uno:5V", "servo1:VCC", "#f97316", []],
        ["uno:GND", "servo1:GND", "#94a3b8", []],
        ["uno:2", "btn1:1", "#22c55e", []],
        ["uno:GND", "btn1:2", "#94a3b8", []]
      ],
      dependencies: {}
    }
  }
];

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
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [localRunLoading, setLocalRunLoading] = useState(false);
  const [useLocalPreview, setUseLocalPreview] = useState(true);
  const [localScreenshotUrl, setLocalScreenshotUrl] = useState("");
  const [hexCode, setHexCode] = useState("");
  const [compiledDiagram, setCompiledDiagram] = useState(null);
  const [compileLoading, setCompileLoading] = useState(false);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState(SIM_TEST_CASES[0].id);
  const [compiledSketchCode, setCompiledSketchCode] = useState("");

  const designState = project?.designState || {};
  const ideaState = project?.ideaState || {};
  const componentsState = project?.componentsState || {};

  const {
    isVoiceSupported,
    isRecognitionSupported,
    status: voiceStatus,
    diagnostics: voiceDiagnostics,
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
      if (!text) return;
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

  const handleCompileToHex = async () => {
    if (!id || compileLoading) return;

    try {
      setCompileLoading(true);

      // Prefer latest generated content, fallback to selected built-in test case.
      let sketchCode = componentsState?.generatedSketch || "";
      let diagramJson = componentsState?.generatedDiagram || {};

      if (!sketchCode) {
        const selectedCase = SIM_TEST_CASES.find((testCase) => testCase.id === selectedTestCaseId) || SIM_TEST_CASES[0];
        sketchCode = selectedCase.sketchCode;
        diagramJson = selectedCase.diagramJson;
        toast.success(`Using built-in test case: ${selectedCase.name}`);
      }

      // Compile sketch to hex
      const compileRes = await axios.post(
        "http://localhost:5000/api/compile/sketch",
        {
          projectId: id,
          sketchCode,
          fqbn: "arduino:avr:uno"
        },
        { withCredentials: true }
      );

      const compiledHex = compileRes.data?.hexCode || "";
      if (!compiledHex) {
        toast.error("Compilation succeeded but no hex code returned");
        return;
      }

      setHexCode(compiledHex);
      setCompiledDiagram(diagramJson);
      setCompiledSketchCode(sketchCode);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `✅ Sketch compiled successfully to hex (${(compiledHex.length / 1024).toFixed(1)} KB)`
        }
      ]);

      toast.success("Sketch compiled to hex");
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.compileResult?.summary ||
        err?.message ||
        "Compilation failed";

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `❌ Compilation failed: ${message}`
        }
      ]);
      toast.error(message);
    } finally {
      setCompileLoading(false);
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
              Design-only workspace with custom hardware visualization on the right and AI guidance on the left.
            </p>
            {draftRestored && (
              <p className={`mt-1 text-xs font-semibold ${isDark ? "text-green-400" : "text-green-700"}`}>
                Draft restored after refresh/close.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedTestCaseId}
              onChange={(event) => setSelectedTestCaseId(event.target.value)}
              className={`border px-2 py-2 text-xs font-semibold ${isDark ? "border-white/10 bg-[#2a2a2a] text-[#e5e5e5]" : "border-black/10 bg-white text-[#111]"}`}
            >
              {SIM_TEST_CASES.map((testCase) => (
                <option key={testCase.id} value={testCase.id}>
                  {testCase.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleCompileToHex}
              disabled={compileLoading || loading}
              className={`px-4 py-2 text-xs font-semibold transition ${isDark ? 'bg-blue-700 hover:bg-blue-600' : 'bg-blue-600 text-white hover:bg-blue-700'} ${(compileLoading || loading) ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {compileLoading ? 'Compiling...' : 'Compile to Hex'}
            </button>

            <button
              onClick={handleLocalCompileRun}
              disabled={localRunLoading || loading}
              className={`px-4 py-2 text-xs font-semibold transition ${isDark ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'} ${(localRunLoading || loading) ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {localRunLoading ? "Running Local..." : "Run Local Build"}
            </button>

            <button
              onClick={() => setUseLocalPreview((prev) => !prev)}
              className={`border px-4 py-2 text-xs font-semibold transition ${isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`}
            >
              {useLocalPreview ? "Show Local Screenshot" : "Show Custom Visualizer"}
            </button>

            <button
              onClick={handleDebug}
              disabled={loading}
              className={`px-4 py-2 text-xs font-semibold transition ${isDark ? 'bg-[#3a3a3a] hover:bg-[#4a4a4a]' : 'bg-black text-white hover:bg-[#222]'} ${loading ? "cursor-not-allowed opacity-60" : ""}`}
            >
              Debug Design
            </button>
            <button
              onClick={toggleTheme}
              className={`border px-4 py-2 text-xs font-semibold transition ${isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`}
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
                  {hexCode ? "Live Custom Visualizer" : "Visualizer Preview"}
                </p>
                <h2 className="mt-1 text-base font-semibold">{hexCode ? "Embedded AVR8js + custom component renderer" : "Simulation / layout view"}</h2>
              </div>

              {hexCode && compiledDiagram ? (
                <div className="min-h-0 flex-1 overflow-hidden">
                  <WokwiSimulator
                    hexCode={hexCode}
                    diagramJson={compiledDiagram}
                    sketchCode={compiledSketchCode || componentsState?.generatedSketch || ""}
                    projectId={id}
                  />
                </div>
              ) : useLocalPreview && localScreenshotUrl ? (
                <div className="flex min-h-0 flex-1 flex-col bg-[#1e1e1e] p-2">
                  <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center border border-white/10 bg-black">
                    <img
                      alt="Local simulation preview"
                      src={localScreenshotUrl}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              ) : useLocalPreview ? (
                <div className="flex min-h-0 flex-1 flex-col bg-[#1e1e1e] p-2">
                  <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center border border-white/10 bg-black px-6 text-center">
                    <p className="text-sm text-white/70">
                      Click "Compile to Hex" to run generated files, or pick a built-in test case from the dropdown and compile.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col bg-[#1e1e1e] p-2">
                  <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center border border-white/10 bg-black px-6 text-center rounded-lg">
                    <p className="text-sm text-white/70">
                      Compile to Hex to run the custom visualizer, or run local build for a screenshot.
                    </p>
                  </div>
                </div>
              )}
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
                voiceDiagnostics={voiceDiagnostics}
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