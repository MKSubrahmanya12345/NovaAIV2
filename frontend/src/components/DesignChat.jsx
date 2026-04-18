import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useThemeStore } from "../store/useThemeStore";

export default function DesignChat({
  project,
  wokwiContext,
  messages,
  input,
  setInput,
  loading,
  onSend,
  onDebug,
  voiceEnabled,
  handsFreeMode,
  speechRate,
  setSpeechRate,
  voiceStatus,
  voiceDiagnostics,
  voiceSupported,
  recognitionSupported,
  onToggleVoice,
  onToggleHandsFree,
  onMicToggle,
}) {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const statusLabel =
    voiceStatus === "duplex"
      ? "Speaking + Listening"
      : voiceStatus === "speaking"
        ? "AI Speaking"
        : voiceStatus === "listening"
          ? "Listening"
          : voiceStatus === "unavailable"
            ? "Voice Unavailable"
            : "Idle";

  const statusClasses =
    voiceStatus === "duplex"
      ? "bg-emerald-500/20 text-emerald-300"
      : voiceStatus === "speaking"
        ? "bg-blue-500/20 text-blue-300"
        : voiceStatus === "listening"
          ? "bg-amber-500/20 text-amber-300"
          : voiceStatus === "unavailable"
            ? "bg-red-500/20 text-red-300"
            : (isDark ? "bg-white/10 text-[#cfcfcf]" : "bg-black/10 text-[#444]");

  return (
    <div className={`flex h-full flex-col ${isDark ? "bg-[#212121] text-[#e5e5e5]" : "bg-[#f5f5f5] text-[#111]"}`}>
      <div className={`border-b px-4 py-3 ${isDark ? "border-white/10" : "border-black/10"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${isDark ? "text-[#a3a3a3]" : "text-[#666]"}`}>
              Design AI
            </p>
            <p className={`mt-1 text-[11px] ${wokwiContext?.connected ? "text-green-400" : (isDark ? "text-[#a3a3a3]" : "text-[#666]")}`}>
              {wokwiContext?.connected
                ? `Live circuit connected (${wokwiContext?.source || "context"}): ${wokwiContext?.partCount ?? 0} parts, ${wokwiContext?.connectionCount ?? 0} wires`
                : `Live circuit disconnected: ${wokwiContext?.reason || "No context"}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClasses}`}>
              {statusLabel}
            </span>

            <button
              onClick={onToggleVoice}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"} ${voiceEnabled ? (isDark ? "bg-white/10" : "bg-black/5") : ""}`}
            >
              {voiceEnabled ? "Voice On" : "Voice Off"}
            </button>

            <button
              onClick={onToggleHandsFree}
              disabled={!recognitionSupported}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"} ${handsFreeMode ? (isDark ? "bg-emerald-500/20 text-emerald-200" : "bg-emerald-100 text-emerald-900") : ""} ${!recognitionSupported ? "cursor-not-allowed opacity-50" : ""}`}
            >
              Hands-free {handsFreeMode ? "On" : "Off"}
            </button>

            <button
              onClick={onMicToggle}
              disabled={!recognitionSupported}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"} ${(voiceStatus === "listening" || voiceStatus === "duplex") ? (isDark ? "bg-amber-500/20 text-amber-200" : "bg-amber-100 text-amber-900") : ""} ${!recognitionSupported ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {voiceStatus === "listening" || voiceStatus === "duplex" ? "Stop Mic" : "Start Mic"}
            </button>

            <button
              onClick={onDebug}
              disabled={loading}
              className={`px-2 py-1 text-[11px] font-semibold transition ${isDark ? "text-[#e5e5e5] hover:text-white" : "text-[#111] hover:text-black"} ${loading ? "cursor-not-allowed opacity-60" : ""}`}
            >
              Debug
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <label className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${isDark ? "text-[#999]" : "text-[#666]"}`}>
            Speech Rate
          </label>
          <input
            type="range"
            min="0.7"
            max="1.2"
            step="0.05"
            value={speechRate}
            disabled={!voiceEnabled || !voiceSupported}
            onChange={(event) => setSpeechRate(Number(event.target.value))}
            className="w-40"
          />
          <span className={`text-xs font-semibold ${isDark ? "text-[#cfcfcf]" : "text-[#444]"}`}>
            {speechRate.toFixed(2)}x
          </span>
        </div>

        <p className={`mt-2 text-[10px] ${isDark ? "text-[#9a9a9a]" : "text-[#666]"}`}>
          STT {voiceDiagnostics?.sttSuccess || 0}/{voiceDiagnostics?.sttAttempts || 0} |
          Failures {voiceDiagnostics?.sttFailures || 0} |
          Last chunk {Math.round((voiceDiagnostics?.lastChunkBytes || 0) / 1024)}KB |
          MIME {voiceDiagnostics?.recorderMimeType || "-"}
          {voiceDiagnostics?.lastError ? ` | Last error: ${voiceDiagnostics.lastError}` : ""}
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`mb-3 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[95%] ${message.role === "user" ? "text-right" : "text-left"}`}>
                <div className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${isDark ? "text-[#8f8f8f]" : "text-[#777]"}`}>
                  {message.role === "user" ? "You" : "Design AI"}
                </div>
                <div className={`whitespace-pre-wrap text-sm leading-relaxed ${message.role === "user" ? (isDark ? "text-[#f2f2f2]" : "text-[#111]") : (isDark ? "text-[#e0e0e0]" : "text-[#222]")}`}>
                  {message.content}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div className="flex justify-start">
            <div className={`text-sm ${isDark ? "text-[#8f8f8f]" : "text-[#666]"}`}>
              Thinking...
            </div>
          </div>
        )}
      </div>

      <div className={`border-t p-3 ${isDark ? "border-white/10" : "border-black/10"}`}>
        <div className="flex items-center gap-2">
          <input
            className={`flex-1 border-b bg-transparent px-2 py-2 text-sm outline-none ${isDark ? "border-white/10 placeholder:text-[#777]" : "border-black/10 placeholder:text-[#999]"}`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onSend()}
            placeholder={voiceEnabled ? "Type to pause voice, or speak using mic controls..." : "Ask for design steps, debugging help, or Wokwi context..."}
          />
          <button
            onClick={onSend}
            disabled={loading}
            className={`px-3 py-2 text-sm font-semibold transition ${isDark ? "text-[#e5e5e5] hover:text-white" : "text-[#111] hover:text-black"} ${loading ? "cursor-not-allowed opacity-60" : ""}`}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}