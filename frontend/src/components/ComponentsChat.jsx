import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { useThemeStore } from "../store/useThemeStore";
import toast from "react-hot-toast";
import useVoiceGuidance from "../hooks/useVoiceGuidance";
import "../styles/workspace-chat-scroll.css";

export default function ComponentsChat() {
  const { id } = useParams();
  const lastVoiceErrorRef = useRef({ code: "", at: 0 });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGeneratingFiles, setIsGeneratingFiles] = useState(false);
  const [showProfileViz, setShowProfileViz] = useState(true);
  const [generationProfile, setGenerationProfile] = useState({});
  const [activeArtifactTab, setActiveArtifactTab] = useState("notes");
  const [artifactPanelMode, setArtifactPanelMode] = useState("normal"); // normal | minimized | maximized
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [latestGenerated, setLatestGenerated] = useState({
    sketch: "",
    diagram: "",
    notes: [],
    fallbackUsed: false
  });
  const scrollRef = useRef(null);

  const { theme } = useThemeStore();
  const isDark = theme === "dark";

  const {
    isVoiceSupported,
    isRecognitionSupported,
    status: voiceStatus,
    diagnostics: voiceDiagnostics,
    speakText,
    stopSpeaking,
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
        sendMessage(text);
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
      toast.error(payload.message || "Voice guidance error");
    }
  });

  const voiceStatusLabel =
    voiceStatus === "duplex"
      ? "Speaking + Listening"
      : voiceStatus === "speaking"
        ? "AI Speaking"
        : voiceStatus === "listening"
          ? "Listening"
          : voiceStatus === "unavailable"
            ? "Voice Unavailable"
            : "Idle";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const loadHistoryOrInit = async () => {
      if (!id) return;

      try {
        setLoading(true);

        const historyRes = await axios.get(
          `http://localhost:5000/api/project/${id}/history/components`,
          { withCredentials: true }
        );

        const existingMessages = historyRes.data?.messages || [];
        if (existingMessages.length > 0) {
          setMessages(existingMessages);
          try {
            const projectRes = await axios.get(
              `http://localhost:5000/api/project/${id}`,
              { withCredentials: true }
            );
            setGenerationProfile(projectRes.data?.generationProfile || {});
          } catch (err) {
            console.error("Failed to fetch project profile:", err);
          }
          return;
        }

        const res = await axios.post(
          "http://localhost:5000/api/components/init",
          { projectId: id },
          { withCredentials: true }
        );

        setMessages([{ role: "ai", content: res.data.reply }]);
        setGenerationProfile(res.data?.generationProfile || {});
      } catch (err) {
        const errorMessage = err?.response?.data?.error || "Unable to start Components AI";
        toast.error(errorMessage);
        setMessages([{ role: "ai", content: errorMessage }]);
      } finally {
        setLoading(false);
      }
    };

    loadHistoryOrInit();
  }, [id]);

  const sendMessage = async (overrideInput) => {
    const resolved = typeof overrideInput === "string" ? overrideInput : input;
    if (!resolved.trim() || loading) return;

    const userMsg = resolved;
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post(
        "http://localhost:5000/api/components/chat",
        { projectId: id, message: userMsg },
        { withCredentials: true }
      );

      void speakText(res.data.reply);
      setMessages(prev => [...prev, { role: "ai", content: res.data.reply }]);
      setGenerationProfile(res.data?.generationProfile || {});
    } catch (err) {
      const errorMessage = err?.response?.data?.error || "Components chat failed";
      toast.error(errorMessage);
      void speakText(errorMessage);
      setMessages(prev => [...prev, { role: "ai", content: errorMessage }]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (value) => {
    pauseForTyping();
    setInput(value);
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

    if (voiceStatus === "listening" || voiceStatus === "duplex") {
      stopListening();
      return;
    }

    setVoiceEnabled(true);
    startListening();
  };

  const copyText = async (text, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      toast.success(label);
      return true;
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = String(text || "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (ok) {
          toast.success(label);
          return true;
        }
      } catch {}
      toast.error("Copy failed");
      return false;
    }
  };

  const copyActiveArtifact = async () => {
    if (activeArtifactTab === "sketch") {
      return copyText(latestGenerated.sketch, "Copied sketch.ino");
    }
    if (activeArtifactTab === "diagram") {
      return copyText(latestGenerated.diagram, "Copied diagram.json");
    }
    return copyText((latestGenerated.notes || []).join("\n"), "Copied notes");
  };

  const copyAllArtifacts = async () => {
    const payload = [
      "sketch.ino",
      latestGenerated.sketch || "",
      "",
      "diagram.json",
      latestGenerated.diagram || "",
      "",
      "notes",
      Array.isArray(latestGenerated.notes) ? latestGenerated.notes.join("\n") : ""
    ].join("\n");
    return copyText(payload, "Copied all artifacts");
  };

  const generateFiles = async ({ strictMode = false } = {}) => {
    if (!id || isGeneratingFiles) return;

    try {
      setIsGeneratingFiles(true);
      const basePrompt = input.trim() || "Generate sketch.ino and diagram.json using ideation and components context";
      const generationPrompt = strictMode
        ? `${basePrompt}\nSTRICT MODE: Output must be a valid Plan JSON only (no markdown, no comments). Use ONLY registry component type keys and ONLY registry pin names.`
        : basePrompt;

      setArtifactPanelMode("maximized");

      const res = await axios.post(
        "http://localhost:5000/api/components/generate-files",
        {
          projectId: id,
          userPrompt: generationPrompt
        },
        { withCredentials: true }
      );

      const generated = res.data?.generated || {};
      setGenerationProfile(res.data?.generationProfile || {});
      const sketch = String(generated.sketchIno || "");
      const diagram = JSON.stringify(generated.diagramJson || {}, null, 2);
      const noteList = Array.isArray(generated.notes) ? generated.notes : [];
      const fallbackUsed = noteList.some((note) => /fallback template used/i.test(String(note || "")));

      setLatestGenerated({
        sketch,
        diagram,
        notes: noteList,
        fallbackUsed
      });

      if (fallbackUsed) {
        toast.error("Fallback template detected. Try Regenerate Strict for a cleaner project-specific output.");
      } else {
        toast.success("Generated sketch.ino + diagram.json");
      }

      setActiveArtifactTab(fallbackUsed ? "notes" : "sketch");
    } catch (err) {
      const message = err?.response?.data?.error || "Failed to generate files";
      toast.error(message);
    } finally {
      setIsGeneratingFiles(false);
    }
  };

  const hintsCount = Array.isArray(generationProfile?.runtimeHints) ? generationProfile.runtimeHints.length : 0;
  const hasBoard = Boolean(generationProfile?.board);
  const hasFirmwareTarget = Boolean(generationProfile?.firmwareTarget);
  const hasSimulationTarget = Boolean(generationProfile?.simulationTarget);
  const profileReadiness = Math.max(
    0,
    Math.min(
      100,
      (hasBoard ? 35 : 0)
      + (hasFirmwareTarget ? 30 : 0)
      + (hasSimulationTarget ? 25 : 0)
      + (hintsCount > 0 ? 10 : 0)
    )
  );

  const statusBadge = profileReadiness >= 80
    ? { label: "Strong", color: "text-[#22c55e]" }
    : profileReadiness >= 50
      ? { label: "Partial", color: "text-[#f59e0b]" }
      : { label: "Weak", color: "text-[#ef4444]" };

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden font-sans ${
        isDark ? "bg-[#1a1a18] text-[#ecebe8]" : "bg-[#faf9f5] text-[#1f1f1e]"
      }`}
    >
      <div
        className={`shrink-0 border-b ${
          isDark ? "border-[#2f2f2c] bg-[#212120]" : "border-[#e8e6e0] bg-[#f3f2ed]"
        }`}
      >
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5 sm:py-3.5">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.25em] ${isDark ? "text-[#93c5fd]" : "text-[#0f766e]"}`}>Build Stage</p>
            <h2 className="mt-1 text-lg font-semibold">Components Control Deck</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isDark ? "bg-[#172235] text-[#7dd3fc]" : "bg-[#d1fae5] text-[#0f766e]"}`}>Readiness {profileReadiness}%</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadge.color} ${isDark ? "bg-[#1a2333]" : "bg-[#e7e5e4]"}`}>{statusBadge.label}</span>

            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
              voiceStatus === "duplex"
                ? "bg-emerald-500/20 text-emerald-300"
                : voiceStatus === "speaking"
                  ? "bg-blue-500/20 text-blue-300"
                  : voiceStatus === "listening"
                    ? "bg-amber-500/20 text-amber-300"
                    : voiceStatus === "unavailable"
                      ? "bg-red-500/20 text-red-300"
                      : (isDark ? "bg-[#1a2333] text-[#9fb3cc]" : "bg-[#e7e5e4] text-[#475569]")
            }`}>
              {voiceStatusLabel}
            </span>

            <button
              onClick={handleToggleVoice}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${isDark ? "border-[#36506f] bg-[#17263a] hover:bg-[#1b314a]" : "border-[#b8ab98] bg-white hover:bg-[#f3efe7]"} ${voiceEnabled ? (isDark ? "text-[#7dd3fc]" : "text-[#0f766e]") : ""}`}
            >
              {voiceEnabled ? "Voice On" : "Voice Off"}
            </button>

            <button
              onClick={handleToggleHandsFree}
              disabled={!isRecognitionSupported}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${isDark ? "border-[#36506f] bg-[#17263a] hover:bg-[#1b314a]" : "border-[#b8ab98] bg-white hover:bg-[#f3efe7]"} ${handsFreeMode ? (isDark ? "text-emerald-300" : "text-emerald-800") : ""} ${!isRecognitionSupported ? "cursor-not-allowed opacity-50" : ""}`}
            >
              Hands-free {handsFreeMode ? "On" : "Off"}
            </button>

            <button
              onClick={handleMicToggle}
              disabled={!isRecognitionSupported}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${isDark ? "border-[#36506f] bg-[#17263a] hover:bg-[#1b314a]" : "border-[#b8ab98] bg-white hover:bg-[#f3efe7]"} ${(voiceStatus === "listening" || voiceStatus === "duplex") ? (isDark ? "text-amber-300" : "text-amber-900") : ""} ${!isRecognitionSupported ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {voiceStatus === "listening" || voiceStatus === "duplex" ? "Stop Mic" : "Start Mic"}
            </button>

            {(voiceStatus === "speaking" || voiceStatus === "duplex") && (
              <button
                type="button"
                onClick={() => stopSpeaking()}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${isDark ? "border-rose-500/40 bg-rose-950/40 text-rose-200 hover:bg-rose-950/60" : "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100"}`}
              >
                Stop voice
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <label className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${isDark ? "text-[#93c5fd]" : "text-[#0f766e]"}`}>
            Speech Rate
          </label>
          <input
            type="range"
            min="0.7"
            max="1.2"
            step="0.05"
            value={speechRate}
            disabled={!voiceEnabled || !isVoiceSupported}
            onChange={(event) => setSpeechRate(Number(event.target.value))}
            className="w-40"
          />
          <span className={`text-xs font-semibold ${isDark ? "text-[#9fb3cc]" : "text-[#475569]"}`}>
            {speechRate.toFixed(2)}x
          </span>
        </div>

        <p className={`mt-2 text-[10px] ${isDark ? "text-[#89a4c4]" : "text-[#64748b]"}`}>
          STT {voiceDiagnostics?.sttSuccess || 0}/{voiceDiagnostics?.sttAttempts || 0} |
          Failures {voiceDiagnostics?.sttFailures || 0} |
          Last chunk {Math.round((voiceDiagnostics?.lastChunkBytes || 0) / 1024)}KB |
          MIME {voiceDiagnostics?.recorderMimeType || "-"}
          {voiceDiagnostics?.lastError ? ` | Last error: ${voiceDiagnostics.lastError}` : ""}
        </p>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(220px,15rem)_minmax(0,1fr)]">
        <aside
          className={`workspaceChatScroll min-h-0 overflow-y-auto border-b px-3 py-3 lg:border-b-0 lg:border-r ${
            isDark ? "border-[#2f2f2c] bg-[#212120]" : "border-[#e8e6e0] bg-[#f3f2ed]"
          }`}
        >
          <div className="space-y-3">
            <button
              onClick={() => generateFiles()}
              disabled={loading || isGeneratingFiles}
              className={`w-full rounded-xl px-3 py-2 text-sm font-semibold transition ${isDark ? "bg-[#0284c7] text-white hover:bg-[#0ea5e9]" : "bg-[#0f766e] text-white hover:bg-[#0d9488]"} ${(loading || isGeneratingFiles) ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {isGeneratingFiles ? "Generating..." : "Generate Files"}
            </button>

            <button
              onClick={() => generateFiles({ strictMode: true })}
              disabled={loading || isGeneratingFiles}
              className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold transition ${isDark ? "border-[#36506f] bg-[#17263a] hover:bg-[#1b314a]" : "border-[#b8ab98] bg-white hover:bg-[#f3efe7]"} ${(loading || isGeneratingFiles) ? "cursor-not-allowed opacity-60" : ""}`}
            >
              Regenerate Strict JSON
            </button>

            <button
              onClick={() => setShowProfileViz(prev => !prev)}
              className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold transition ${isDark ? "border-[#36506f] bg-[#17263a] hover:bg-[#1b314a]" : "border-[#b8ab98] bg-white hover:bg-[#f3efe7]"}`}
            >
              {showProfileViz ? "Hide Contract Insight" : "Show Contract Insight"}
            </button>
          </div>

          {showProfileViz && (
            <div className="mt-4 space-y-3">
              <div className={`rounded-xl border px-3 py-3 ${isDark ? "border-[#2e4360] bg-[#152336]" : "border-[#c9bca8] bg-white"}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${isDark ? "text-[#93c5fd]" : "text-[#0f766e]"}`}>Contract Graph</p>
                <div className="mt-2 space-y-2 text-xs">
                  <div>
                    <p className="mb-1">Board lock</p>
                    <div className={`h-2 rounded-full ${isDark ? "bg-[#24364e]" : "bg-[#e6ddcf]"}`}>
                      <div className="h-2 rounded-full bg-[#22d3ee]" style={{ width: `${hasBoard ? 100 : 8}%` }} />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1">Firmware target</p>
                    <div className={`h-2 rounded-full ${isDark ? "bg-[#24364e]" : "bg-[#e6ddcf]"}`}>
                      <div className="h-2 rounded-full bg-[#60a5fa]" style={{ width: `${hasFirmwareTarget ? 100 : 8}%` }} />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1">Simulation target</p>
                    <div className={`h-2 rounded-full ${isDark ? "bg-[#24364e]" : "bg-[#e6ddcf]"}`}>
                      <div className="h-2 rounded-full bg-[#34d399]" style={{ width: `${hasSimulationTarget ? 100 : 8}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className={`rounded-xl border px-3 py-3 text-xs ${isDark ? "border-[#2e4360] bg-[#152336]" : "border-[#c9bca8] bg-white"}`}>
                <p>Board: {generationProfile?.board || "pending"}</p>
                <p>Board part: {generationProfile?.boardPartType || "pending"}</p>
                <p>Firmware: {generationProfile?.firmwareTarget || "pending"}</p>
                <p>Sim target: {generationProfile?.simulationTarget || "pending"}</p>
                <p>Runtime hints: {hintsCount}</p>
              </div>
            </div>
          )}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              ref={scrollRef}
              className="workspaceChatScroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
            >
              <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 sm:px-6 sm:py-5">
                <AnimatePresence>
                  {messages.map((m, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {m.role === "user" ? (
                        <div
                          className={`max-w-[min(88%,28rem)] rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${
                            isDark ? "bg-[#3d3d3a] text-[#f5f4f0]" : "bg-[#ecece7] text-[#1f1f1e]"
                          }`}
                        >
                          <p className={`mb-1 text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#c4c3bd]" : "text-[#6b6a67]"}`}>
                            You
                          </p>
                          <div className="whitespace-pre-wrap">{m.content}</div>
                        </div>
                      ) : (
                        <div className="w-full min-w-0 pr-1">
                          <p className={`mb-1 text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#a3a29c]" : "text-[#6b6a67]"}`}>
                            Builder
                          </p>
                          <div className={`whitespace-pre-wrap text-[15px] leading-relaxed ${isDark ? "text-[#ecebe8]" : "text-[#2b2b29]"}`}>
                            {m.content}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {(loading || isGeneratingFiles) && (
                  <div className="flex justify-start">
                    <p className={`text-[15px] ${isDark ? "text-[#a3a29c]" : "text-[#6b6a67]"}`}>
                      {isGeneratingFiles ? "Generating project artifacts…" : "Thinking…"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`shrink-0 border-t px-4 py-2.5 sm:px-5 ${
                isDark ? "border-[#2f2f2c] bg-[#1a1a18]" : "border-[#e8e6e0] bg-[#faf9f5]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {[
                  "Give me board + pin mapping",
                  "Generate compact wiring plan",
                  "Explain expected serial output"
                ].map((quick) => (
                  <button
                    key={quick}
                    onClick={() => handleInputChange(quick)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${isDark ? "bg-[#2a2a27] text-[#ecebe8] hover:bg-[#353532]" : "bg-[#ecece7] text-[#1f1f1e] hover:bg-[#e0dfd8]"}`}
                  >
                    {quick}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`z-10 shrink-0 border-t ${
                isDark ? "border-[#2f2f2c] bg-[#1a1a18]" : "border-[#e8e6e0] bg-[#faf9f5]"
              }`}
            >
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 xl:flex-row xl:items-stretch">
                <div
                  className={`min-w-0 flex-1 rounded-[1.75rem] border px-3 py-2 shadow-sm sm:px-4 ${
                    isDark ? "border-[#3d3d3a] bg-[#2a2a27]" : "border-[#dcdad3] bg-white"
                  }`}
                >
                  <div className="flex min-w-0 items-end gap-2">
                    <input
                      type="text"
                      className={`min-h-[44px] min-w-0 flex-1 bg-transparent px-2 py-2 text-[15px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-[#c96442]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
                        isDark ? "text-[#ecebe8] placeholder:text-[#7a7974]" : "text-[#1f1f1e] placeholder:text-[#9c9b96]"
                      }`}
                      value={input}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      placeholder={
                        voiceEnabled
                          ? "Message (typing pauses voice)…"
                          : "Wiring, constraints, serial behavior…"
                      }
                      aria-label="Message"
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={loading || isGeneratingFiles || !input.trim()}
                      className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#c96442] text-sm font-semibold text-white shadow-sm transition hover:bg-[#b55738] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c96442] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Send"
                    >
                      ↑
                    </button>
                  </div>
                </div>

                <div
                  className={`min-w-0 flex-1 overflow-hidden rounded-2xl border shadow-sm xl:max-w-md ${
                    isDark ? "border-[#3d3d3a] bg-[#2a2a27]" : "border-[#dcdad3] bg-white"
                  }`}
                >
                  <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 ${isDark ? "border-white/[0.08]" : "border-[#e4dbce]"}`}>
                    <div className="flex items-center gap-2">
                      {[
                        ["notes", "Notes"],
                        ["sketch", "Sketch"],
                        ["diagram", "Diagram"]
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setActiveArtifactTab(key)}
                          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${activeArtifactTab === key
                            ? (isDark ? "bg-[#1d4ed8] text-white" : "bg-[#0f766e] text-white")
                            : (isDark ? "text-[#93c5fd] hover:bg-[#1d3048]" : "text-[#0f766e] hover:bg-[#f0ebe2]")}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={copyActiveArtifact}
                        disabled={!latestGenerated.sketch && !latestGenerated.diagram && (latestGenerated.notes || []).length === 0}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${isDark ? "border-[#36506f] text-[#93c5fd] hover:bg-[#1d3048]" : "border-[#b8ab98] text-[#0f766e] hover:bg-[#f0ebe2]"} ${(!latestGenerated.sketch && !latestGenerated.diagram && (latestGenerated.notes || []).length === 0) ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        Copy
                      </button>
                      <button
                        onClick={copyAllArtifacts}
                        disabled={!latestGenerated.sketch && !latestGenerated.diagram}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${isDark ? "border-[#36506f] text-[#93c5fd] hover:bg-[#1d3048]" : "border-[#b8ab98] text-[#0f766e] hover:bg-[#f0ebe2]"} ${(!latestGenerated.sketch && !latestGenerated.diagram) ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        Copy all
                      </button>
                      <button
                        onClick={() => setArtifactPanelMode((prev) => prev === "minimized" ? "normal" : "minimized")}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${isDark ? "border-[#36506f] text-[#93c5fd] hover:bg-[#1d3048]" : "border-[#b8ab98] text-[#0f766e] hover:bg-[#f0ebe2]"}`}
                      >
                        {artifactPanelMode === "minimized" ? "Expand" : "Minimize"}
                      </button>
                      <button
                        onClick={() => setArtifactPanelMode((prev) => prev === "maximized" ? "normal" : "maximized")}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${isDark ? "border-[#36506f] text-[#93c5fd] hover:bg-[#1d3048]" : "border-[#b8ab98] text-[#0f766e] hover:bg-[#f0ebe2]"}`}
                      >
                        {artifactPanelMode === "maximized" ? "Normal" : "Max"}
                      </button>
                    </div>
                  </div>

                  {artifactPanelMode !== "minimized" && (
                    <div
                      className={`workspaceChatScroll overflow-y-auto px-3 py-2 font-mono text-xs ${
                        artifactPanelMode === "maximized"
                          ? "max-h-[min(50svh,20rem)] min-h-[10rem] sm:max-h-[min(55svh,24rem)]"
                          : "max-h-[min(32svh,14rem)] min-h-[8rem]"
                      }`}
                    >
                      {activeArtifactTab === "notes" && (
                        latestGenerated.notes.length > 0 ? (
                          <ul className="space-y-1">
                            {latestGenerated.notes.map((note, index) => (
                              <li key={`${note}-${index}`} className={`${/fallback template used/i.test(note) ? "text-[#ef4444]" : ""}`}>
                                • {note}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={isDark ? "text-[#9fb3cc]" : "text-[#7a6f5f]"}>No artifact notes yet.</p>
                        )
                      )}

                      {activeArtifactTab === "sketch" && (
                        <pre className="scrollbar-hide overflow-x-auto whitespace-pre-wrap text-[12px] leading-relaxed">
                          {latestGenerated.sketch || "No sketch generated yet."}
                        </pre>
                      )}

                      {activeArtifactTab === "diagram" && (
                        <pre className="scrollbar-hide overflow-x-auto whitespace-pre-wrap text-[12px] leading-relaxed">
                          {latestGenerated.diagram || "No diagram generated yet."}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}