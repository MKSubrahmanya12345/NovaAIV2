import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { useThemeStore } from "../store/useThemeStore";
import toast from "react-hot-toast";

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
        });
      }

      if (res.data?.ideaState) {
        setIdeaState(res.data.ideaState);
      }

      setProjectMeta(res.data?.meta || {});
      setGenerationProfile(res.data?.generationProfile || {});

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
    <div className={`flex h-full flex-col ${
      isDark ? "bg-[#212121] text-[#e5e5e5]" : "bg-[#f5f5f5] text-[#111]"
    }`}>

      {/* Header */}
      <div className={`flex items-center justify-between border-b px-6 py-4 ${
        isDark
          ? "bg-[#2a2a2a] border-white/10"
          : "bg-white border-black/10"
      }`}>
        <h2 className="text-sm font-semibold">Project Chat</h2>
        <p className={`text-xs ${isDark ? "text-[#888]" : "text-[#666]"}`}>
          Live
        </p>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-8 space-y-6"
      >
        <AnimatePresence>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[70%] rounded-xl px-5 py-4 ${
                  m.role === "user"
                    ? (isDark
                        ? "bg-[#3a3a3a]"
                        : "bg-black text-white")
                    : (isDark
                        ? "bg-[#2a2a2a] border border-white/10"
                        : "bg-white border border-black/10")
                }`}
              >
                <div className={`mb-2 text-[11px] font-medium ${
                  isDark ? "text-[#888]" : "text-[#666]"
                }`}>
                  {m.role === "user" ? "You" : "Assistant"}
                </div>

                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div className="flex justify-start">
            <div className={`rounded-xl px-5 py-4 text-sm ${
              isDark
                ? "bg-[#2a2a2a] border border-white/10 text-[#888]"
                : "bg-white border border-black/10 text-[#555]"
            }`}>
              Generating response...
            </div>
          </div>
        )}
      </div>

      <div className="px-6 pb-3 flex justify-end">
        <button
          onClick={() => setShowMeta(prev => !prev)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            isDark
              ? "border-white/10 bg-[#2a2a2a] hover:bg-[#333]"
              : "border-black/10 bg-white hover:bg-[#f1f1f1]"
          }`}
        >
          {showMeta ? "Hide Info" : "View Captured Info"}
        </button>
      </div>

      {showMeta && (
        <div className="px-6 pb-4">
          <div className="rounded-xl border border-white/10 bg-[#1f1f1f] px-4 py-4 text-[#e5e5e5]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Ideation Summary</h3>
              <div className="flex items-center gap-2">
                {[
                  ["overview", "Overview"],
                  ["hardware", "Hardware"],
                  ["sim", "Simulator"]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setInsightView(key)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                      insightView === key
                        ? "bg-[#3a3a3a] text-[#f3f4f6]"
                        : "bg-[#262626] text-[#9ca3af] hover:bg-[#333]"
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
                  <div className="rounded-lg border border-white/10 bg-[#262626] px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#9ca3af]">Readiness Score</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div
                        className="h-12 w-12 rounded-full"
                        style={{
                          background: `conic-gradient(#22c55e ${readinessScore * 3.6}deg, #3f3f46 0deg)`
                        }}
                      />
                      <div>
                        <p className="text-lg font-semibold text-[#f3f4f6]">{readinessScore}%</p>
                        <p className="text-xs text-[#9ca3af]">Ideation + profile confidence</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-[#262626] px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#9ca3af]">Signal Bars</p>
                    <div className="mt-2 space-y-2 text-xs">
                      <div>
                        <p className="mb-1 text-[#d1d5db]">Requirements ({requirementsCount})</p>
                        <div className="h-2 rounded-full bg-[#3f3f46]">
                          <div className="h-2 rounded-full bg-[#38bdf8]" style={{ width: `${Math.min(100, requirementsCount * 20)}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 text-[#d1d5db]">Detected Components ({componentsDetected})</p>
                        <div className="h-2 rounded-full bg-[#3f3f46]">
                          <div className="h-2 rounded-full bg-[#a78bfa]" style={{ width: `${Math.min(100, componentsDetected * 20)}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 text-[#d1d5db]">Open Unknowns ({unknownsCount})</p>
                        <div className="h-2 rounded-full bg-[#3f3f46]">
                          <div className="h-2 rounded-full bg-[#f59e0b]" style={{ width: `${Math.min(100, unknownsCount * 25)}%` }} />
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
                  <p className="text-xs uppercase tracking-[0.18em] text-[#9ca3af]">Detected Hardware</p>
                  <div className="mt-1 space-y-1 text-[#d1d5db]">
                    <p>Board: {projectMeta?.board || "Not detected yet"}</p>
                    <p>Power: {projectMeta?.powerSource || "Not detected yet"}</p>
                    <p>Language: {projectMeta?.language || "cpp"}</p>
                    <p>Components found: {projectMeta?.componentCount || 0}</p>
                  </div>
                </section>

                <section>
                  <p className="text-xs uppercase tracking-[0.18em] text-[#9ca3af]">Generation Profile</p>
                  <div className="mt-1 space-y-1 text-[#d1d5db]">
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
                  <p className="text-xs uppercase tracking-[0.18em] text-[#9ca3af]">AVR8JS Readiness</p>
                  <div className="mt-2 rounded-lg border border-white/10 bg-[#262626] px-3 py-3 text-[#d1d5db]">
                    <p>Need artifacts:</p>
                    <ul className="mt-2 list-disc pl-5 text-xs space-y-1 text-[#cbd5e1]">
                      <li>Valid sketch.ino with setup() and loop()</li>
                      <li>Consistent board part in diagram.json</li>
                      <li>Pin mappings and non-empty connections</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <p className="text-xs uppercase tracking-[0.18em] text-[#9ca3af]">Status</p>
                  <p className={`mt-1 ${ideationFinalized ? "text-[#22c55e]" : "text-[#facc15]"}`}>
                    {ideationFinalized ? "✓ Ready for Components" : "⏳ In Progress"}
                  </p>
                </section>
              </div>
            )}

            <div className="mt-4 space-y-4 text-sm">
              <section>
                <p className="text-xs uppercase tracking-[0.18em] text-[#9ca3af]">Project Idea</p>
                <p className="mt-1 text-[#d1d5db]">
                  {ideaState?.summary?.trim() || "Not captured yet"}
                </p>
              </section>

              <section>
                <p className="text-xs uppercase tracking-[0.18em] text-[#9ca3af]">Requirements</p>
                {Array.isArray(ideaState?.requirements) && ideaState.requirements.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-[#d1d5db] space-y-1">
                    {ideaState.requirements.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[#9ca3af]">None yet</p>
                )}
              </section>

              <section>
                <p className="text-xs uppercase tracking-[0.18em] text-[#9ca3af]">Open Questions</p>
                {Array.isArray(ideaState?.unknowns) && ideaState.unknowns.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-[#d1d5db] space-y-1">
                    {ideaState.unknowns.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[#22c55e]">None - ideation complete ✓</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className={`border-t px-6 py-4 ${
        isDark
          ? "bg-[#2a2a2a] border-white/10"
          : "bg-white border-black/10"
      }`}>
        <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
          isDark
            ? "bg-[#1f1f1f] border-white/10"
            : "bg-[#f0f0f0] border-black/10"
        }`}>
          <input
            className={`flex-1 bg-transparent px-2 py-2 text-sm outline-none ${
              isDark ? "placeholder:text-[#666]" : "placeholder:text-[#888]"
            }`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="Type your message..."
          />

          <button
            onClick={sendMessage}
            disabled={loading}
            className={`rounded-lg px-5 py-2 text-sm font-semibold ${
              isDark
                ? "bg-[#3a3a3a] hover:bg-[#4a4a4a]"
                : "bg-black text-white hover:bg-[#222]"
            }`}
          >
            Send
          </button>
        </div>
      </div>

    </div>
  );
}