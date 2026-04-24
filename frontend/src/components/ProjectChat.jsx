import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { useThemeStore } from "../store/useThemeStore";
import toast from "react-hot-toast";
import "../styles/workspace-chat-scroll.css";

export default function ProjectChat({ onIdeationStateChange }) {
  const { id } = useParams();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [ideaState, setIdeaState] = useState({
    summary: "",
    requirements: [],
    unknowns: []
  });
  const [projectMeta, setProjectMeta] = useState({});
  const [generationProfile, setGenerationProfile] = useState({});
  const [architectureState, setArchitectureState] = useState({
    summary: "",
    pattern: "",
    sourceStrategy: "",
    entryFile: "",
    files: [],
    libraries: [],
    pinAssignments: []
  });
  const [ideationFinalized, setIdeationFinalized] = useState(false);
  const [insightView, setInsightView] = useState("overview");
  const scrollRef = useRef(null);

  const { theme } = useThemeStore();
  const isDark = theme === "dark";

  // auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!id) return;

      try {
        const res = await axios.get(
          `http://localhost:5000/api/project/${id}/history/ideation`,
          { withCredentials: true }
        );

        setMessages(res.data?.messages || []);
      } catch (err) {
        const errorMessage = err?.response?.data?.error || "Unable to load ideation history";
        toast.error(errorMessage);
        setMessages([]);
      }

      try {
        const projectRes = await axios.get(
          `http://localhost:5000/api/project/${id}`,
          { withCredentials: true }
        );

        const project = projectRes.data || {};
        const nextIdeaState = project.ideaState || { summary: "", requirements: [], unknowns: [] };
        const finalized = Boolean(nextIdeaState?.summary?.trim()) && (nextIdeaState?.unknowns?.length ?? 0) === 0;

        setIdeaState(nextIdeaState);
        setProjectMeta(project.meta || {});
        setGenerationProfile(project.generationProfile || {});
        setArchitectureState(project.architectureState || {});
        setIdeationFinalized(finalized);
      } catch (err) {
        console.error("Project state load error:", err);
      }
    };

    loadHistory();
  }, [id]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input;

    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post(
        "http://localhost:5000/api/project/chat",
        {
          projectId: id, // ✅ REAL ID
          message: userMsg
        },
        { withCredentials: true }
      );

      setMessages(prev => [
        ...prev,
        { role: "ai", content: res.data.reply }
      ]);

      if (onIdeationStateChange) {
        onIdeationStateChange({
          ideationFinalized: res.data.ideationFinalized,
          ideaState: res.data.ideaState,
          meta: res.data.meta,
          generationProfile: res.data.generationProfile,
          architectureState: res.data.architectureState,
        });
      }

      if (res.data?.ideaState) {
        setIdeaState(res.data.ideaState);
      }

      setProjectMeta(res.data?.meta || {});
      setGenerationProfile(res.data?.generationProfile || {});
      setArchitectureState(res.data?.architectureState || {});

      if (typeof res.data?.ideationFinalized === "boolean") {
        setIdeationFinalized(res.data.ideationFinalized);
      }

    } catch (err) {
      console.error("Chat Error:", err);
      toast.error(err?.response?.data?.error || "Ideation chat failed");
    } finally {
      setLoading(false);
    }
  };

  const requirementsCount = Array.isArray(ideaState?.requirements) ? ideaState.requirements.length : 0;
  const unknownsCount = Array.isArray(ideaState?.unknowns) ? ideaState.unknowns.length : 0;
  const componentsDetected = Number(projectMeta?.componentCount || 0);
  const boardDetected = Boolean(projectMeta?.board);
  const profileReady = Boolean(generationProfile?.boardPartType && generationProfile?.firmwareTarget && generationProfile?.simulationTarget);
  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      (boardDetected ? 30 : 0)
      + (ideationFinalized ? 30 : 0)
      + (profileReady ? 30 : 0)
      + (requirementsCount > 0 ? 10 : 0)
    )
  );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden font-sans ${
        isDark ? "bg-[#1a1a18] text-[#ecebe8]" : "bg-[#faf9f5] text-[#1f1f1e]"
      }`}
    >
      <header
        className={`shrink-0 border-b ${
          isDark ? "border-[#2f2f2c]" : "border-[#e8e6e0]"
        }`}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <h2 className="text-sm font-medium tracking-tight">Ideation</h2>
          <span className={`text-xs font-medium ${isDark ? "text-[#a3a29c]" : "text-[#6b6a67]"}`}>Live</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={scrollRef}
          className="workspaceChatScroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        >
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          <AnimatePresence>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "user" ? (
                  <div
                    className={`max-w-[min(88%,28rem)] rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${
                      isDark ? "bg-[#3d3d3a] text-[#f5f4f0]" : "bg-[#ecece7] text-[#1f1f1e]"
                    }`}
                  >
                    <p className={`mb-1.5 text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#c4c3bd]" : "text-[#6b6a67]"}`}>
                      You
                    </p>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                ) : (
                  <div className="w-full min-w-0 pr-2 sm:pr-4">
                    <p className={`mb-1.5 text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#a3a29c]" : "text-[#6b6a67]"}`}>
                      Assistant
                    </p>
                    <div className={`text-[15px] leading-relaxed whitespace-pre-wrap ${isDark ? "text-[#ecebe8]" : "text-[#2b2b29]"}`}>
                      {m.content}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <div className="flex justify-start">
              <p className={`text-[15px] ${isDark ? "text-[#a3a29c]" : "text-[#6b6a67]"}`}>Thinking…</p>
            </div>
          )}
        </div>
      </div>

      <div
        className={`shrink-0 border-t ${
          isDark ? "border-[#2f2f2c] bg-[#1a1a18]" : "border-[#e8e6e0] bg-[#faf9f5]"
        }`}
      >
        <div className="mx-auto flex w-full max-w-7xl justify-end px-4 pt-2 sm:px-6">
          <button
            type="button"
            onClick={() => setShowMeta((prev) => !prev)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              isDark ? "text-[#c4c3bd] hover:bg-white/5" : "text-[#5c5b56] hover:bg-black/[0.04]"
            }`}
          >
            {showMeta ? "Hide captured info" : "Captured info"}
          </button>
        </div>
      </div>

      {showMeta && (
        <div
          className={`workspaceChatScroll max-h-[min(42svh,22rem)] shrink-0 overflow-y-auto border-t ${
            isDark ? "border-[#2f2f2c] bg-[#212120]" : "border-[#e8e6e0] bg-[#f3f2ed]"
          }`}
        >
          <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6">
            <div
              className={`rounded-2xl border px-4 py-4 sm:px-5 ${
                isDark
                  ? "border-[#3d3d3a] bg-[#2a2a27] text-[#ecebe8]"
                  : "border-[#dcdad3] bg-white text-[#1f1f1e] shadow-sm"
              }`}
            >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold">Ideation Summary</h3>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  ["overview", "Overview"],
                  ["hardware", "Hardware"],
                  ["sim", "Simulator"]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setInsightView(key)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                      insightView === key
                        ? "bg-[#c96442] text-white"
                        : (isDark ? "bg-[#2a2a27] text-[#c4c3bd] hover:bg-[#353532]" : "bg-[#ecece7] text-[#5c5b56] hover:bg-[#e0dfd8]")
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {insightView === "overview" && (
              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className={`rounded-xl border px-3 py-3 ${isDark ? "border-white/[0.1] bg-[#0f1419]" : "border-black/[0.06] bg-slate-50"}`}>
                    <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Readiness Score</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div
                        className="h-12 w-12 rounded-full"
                        style={{
                          background: isDark
                            ? `conic-gradient(#22c55e ${readinessScore * 3.6}deg, #334155 0deg)`
                            : `conic-gradient(#16a34a ${readinessScore * 3.6}deg, #e2e8f0 0deg)`
                        }}
                      />
                      <div>
                        <p className={`text-lg font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{readinessScore}%</p>
                        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Ideation + profile confidence</p>
                      </div>
                    </div>
                  </div>

                  <div className={`rounded-xl border px-3 py-3 ${isDark ? "border-white/[0.1] bg-[#0f1419]" : "border-black/[0.06] bg-slate-50"}`}>
                    <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Signal Bars</p>
                    <div className="mt-2 space-y-2 text-xs">
                      <div>
                        <p className={`mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Requirements ({requirementsCount})</p>
                        <div className={`h-2 rounded-full ${isDark ? "bg-slate-700" : "bg-slate-200"}`}>
                          <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.min(100, requirementsCount * 20)}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className={`mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Detected Components ({componentsDetected})</p>
                        <div className={`h-2 rounded-full ${isDark ? "bg-slate-700" : "bg-slate-200"}`}>
                          <div className="h-2 rounded-full bg-violet-500" style={{ width: `${Math.min(100, componentsDetected * 20)}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className={`mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Open Unknowns ({unknownsCount})</p>
                        <div className={`h-2 rounded-full ${isDark ? "bg-slate-700" : "bg-slate-200"}`}>
                          <div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.min(100, unknownsCount * 25)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {insightView === "hardware" && (
              <div className="mt-4 space-y-4 text-sm">
                <section>
                  <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Detected Hardware</p>
                  <div className={`mt-1 space-y-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    <p>Board: {projectMeta?.board || "Not detected yet"}</p>
                    <p>Power: {projectMeta?.powerSource || "Not detected yet"}</p>
                    <p>Language: {projectMeta?.language || "cpp"}</p>
                    <p>Components found: {projectMeta?.componentCount || 0}</p>
                  </div>
                </section>

                <section>
                  <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Generation Profile</p>
                  <div className={`mt-1 space-y-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    <p>Board Part: {generationProfile?.boardPartType || "Pending"}</p>
                    <p>Firmware Target: {generationProfile?.firmwareTarget || "Pending"}</p>
                    <p>Simulation Target: {generationProfile?.simulationTarget || "Pending"}</p>
                    <p>Runtime Hints: {Array.isArray(generationProfile?.runtimeHints) ? generationProfile.runtimeHints.length : 0}</p>
                  </div>
                </section>
              </div>
            )}

            {insightView === "sim" && (
              <div className="mt-4 space-y-4 text-sm">
                <section>
                  <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>AVR8JS Readiness</p>
                  <div className={`mt-2 rounded-xl border px-3 py-3 ${isDark ? "border-white/[0.1] bg-[#0f1419] text-slate-300" : "border-black/[0.06] bg-slate-50 text-slate-700"}`}>
                    <p>Need artifacts:</p>
                    <ul className={`mt-2 list-disc space-y-1 pl-5 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      <li>Valid sketch.ino with setup() and loop()</li>
                      <li>Consistent board part in diagram.json</li>
                      <li>Pin mappings and non-empty connections</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Status</p>
                  <p className={`mt-1 ${ideationFinalized ? "text-emerald-500" : "text-amber-500"}`}>
                    {ideationFinalized ? "✓ Ready for Components" : "⏳ In Progress"}
                  </p>
                </section>
              </div>
            )}

            <div className="mt-4 space-y-4 text-sm">
              <section>
                <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Project Idea</p>
                <p className={`mt-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {ideaState?.summary?.trim() || "Not captured yet"}
                </p>
              </section>

              <section>
                <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Requirements</p>
                {Array.isArray(ideaState?.requirements) && ideaState.requirements.length > 0 ? (
                  <ul className={`mt-1 list-disc space-y-1 pl-5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    {ideaState.requirements.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className={`mt-1 ${isDark ? "text-slate-500" : "text-slate-500"}`}>None yet</p>
                )}
              </section>

              <section>
                <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Open Questions</p>
                {Array.isArray(ideaState?.unknowns) && ideaState.unknowns.length > 0 ? (
                  <ul className={`mt-1 list-disc space-y-1 pl-5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    {ideaState.unknowns.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-emerald-500">None - ideation complete ✓</p>
                )}
              </section>
              <section>
                <p className={`text-xs uppercase tracking-[0.18em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Architecture Blueprint</p>
                <div className={`mt-1 space-y-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  <p>Pattern: {architectureState?.pattern || "Pending"}</p>
                  <p>Source Strategy: {architectureState?.sourceStrategy || "Pending"}</p>
                  <p>Entry File: {architectureState?.entryFile || "sketch.ino"}</p>
                  <p>Planned Files: {Array.isArray(architectureState?.files) ? architectureState.files.length : 0}</p>
                  <p>Libraries: {Array.isArray(architectureState?.libraries) ? architectureState.libraries.length : 0}</p>
                  <p>Pin Assignments: {Array.isArray(architectureState?.pinAssignments) ? architectureState.pinAssignments.length : 0}</p>
                </div>
                {architectureState?.summary ? (
                  <p className={`mt-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{architectureState.summary}</p>
                ) : null}
              </section>
            </div>
          </div>
        </div>
        </div>
      )}

      </div>

      <div
        className={`z-10 shrink-0 border-t ${
          isDark ? "border-[#2f2f2c] bg-[#1a1a18]" : "border-[#e8e6e0] bg-[#faf9f5]"
        }`}
      >
        <div className="mx-auto w-full max-w-7xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <div
            className={`flex min-h-[52px] items-end gap-2 rounded-[1.75rem] border px-3 py-2 shadow-sm sm:gap-3 sm:px-4 ${
              isDark
                ? "border-[#3d3d3a] bg-[#2a2a27]"
                : "border-[#dcdad3] bg-white"
            }`}
          >
            <input
              type="text"
              className={`min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-[#c96442]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
                isDark ? "text-[#ecebe8] placeholder:text-[#7a7974]" : "text-[#1f1f1e] placeholder:text-[#9c9b96]"
              }`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Message…"
              aria-label="Message"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#c96442] text-sm font-semibold text-white shadow-sm transition hover:bg-[#b55738] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c96442] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
