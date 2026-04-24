import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useThemeStore } from "../store/useThemeStore";
import axios from "axios";
import toast from "react-hot-toast";

import ProjectChat from "../components/ProjectChat";
import ComponentsChat from "../components/ComponentsChat";
import WokwiProofLab from "../components/WokwiProofLab";
export default function ProjectMainPage() {
  const [tab, setTab] = useState("ideation");
  const [isIdeationFinalized, setIsIdeationFinalized] = useState(false);
  const [projectSnapshot, setProjectSnapshot] = useState(null);
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === "dark";

  const navigate = useNavigate();
  const { id } = useParams();

  useEffect(() => {
    const loadProjectState = async () => {
      try {
        if (!id) return;

        const res = await axios.get(
          `http://localhost:5000/api/project/${id}`,
          { withCredentials: true }
        );

        const project = res.data;
        const finalized = Boolean(project?.ideaState?.summary?.trim()) && (project?.ideaState?.unknowns?.length ?? 0) === 0;
        setIsIdeationFinalized(finalized);
        setProjectSnapshot(project);
      } catch (err) {
        console.error("Project state load error:", err);
      }
    };

    loadProjectState();
  }, [id]);

  const handleSelectTab = (nextTab) => {
    if (nextTab === "components" && !isIdeationFinalized) {
      toast.error("Finalize ideation before opening Components section");
      return;
    }

    setTab(nextTab);
  };

  const handleIdeationStateChange = (payload) => {
    if (typeof payload?.ideationFinalized === "boolean") {
      setIsIdeationFinalized(payload.ideationFinalized);
    }
  };

  const handleOpenDesign = () => {
    navigate(`/project/${id}/design`, {
      state: {
        projectSnapshot,
        projectId: id
      }
    });
  };

  const handleSetWokwiUrl = async () => {
    const currentUrl = projectSnapshot?.wokwiUrl || "https://wokwi.com/projects/328451800839488084";
    const input = window.prompt("Paste Wokwi project URL", currentUrl);

    if (input === null) return;

    const nextUrl = input.trim();

    try {
      const res = await axios.put(
        `http://localhost:5000/api/project/${id}`,
        { wokwiUrl: nextUrl },
        { withCredentials: true }
      );

      setProjectSnapshot(res.data);
      toast.success(nextUrl ? "Wokwi URL saved" : "Wokwi URL cleared");
    } catch (err) {
      console.error("Set Wokwi URL Error:", err);
      toast.error(err?.response?.data?.error || "Failed to save Wokwi URL");
    }
  };

  return (
    <div className={`min-h-screen px-6 py-8 ${isDark ? "bg-[#212121] text-[#e5e5e5]" : "bg-[#f5f5f5] text-[#111]"}`}>
      
      {/* Top */}
      <div className="mx-auto w-full max-w-7xl">

        {/* Header */}
        <div className={`mb-6 flex items-center justify-between rounded-xl border px-6 py-4 ${isDark ? "bg-[#2a2a2a] border-white/10" : "bg-white border-black/10"}`}>
          <div>
            <button
              onClick={() => navigate('/home')} // <-- Use navigate for routing
              className={`rounded-lg border px-3 py-1 text-xs transition ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"}`}
            >
              ← Back
            </button>
            <h1 className="text-xl font-semibold">Project Workspace</h1>
            <p className={`text-sm ${isDark ? "text-[#a3a3a3]" : "text-[#555]"}`}>
              Ideation and implementation flow
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSetWokwiUrl}
              disabled={!projectSnapshot}
              className={`rounded-lg px-4 py-2 text-xs font-semibold border transition ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"} ${!projectSnapshot ? "cursor-not-allowed opacity-60" : ""}`}
            >
              Set Wokwi URL
            </button>

            <button
              onClick={handleOpenDesign}
              disabled={!projectSnapshot}
              className={`rounded-lg px-4 py-2 text-xs font-semibold border transition ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"} ${!projectSnapshot ? "cursor-not-allowed opacity-60" : ""}`}
            >
              Open Design AI
            </button>

            <button
              onClick={toggleTheme}
              className={`rounded-lg px-4 py-2 text-xs font-semibold border ${isDark ? "border-white/10 hover:bg-white/10" : "border-black/10 hover:bg-black/5"}`}
            >
              {isDark ? "Light" : "Dark"}
            </button>
          </div>
        </div>

        <div className={`mb-4 inline-flex rounded-lg p-1 ${isDark ? "bg-[#1f1f1f]" : "bg-[#eaeaea]"}`}>
          {["ideation", "components", "proof"].map((t) => (
            <button
              key={t}
              onClick={() => handleSelectTab(t)}
              className={`relative rounded-md px-6 py-2.5 text-sm font-semibold transition ${
                tab === t
                  ? (isDark ? "bg-[#3a3a3a]" : "bg-white shadow")
                  : ""
              } ${t === "components" && !isIdeationFinalized ? "opacity-60" : ""}`}
            >
              {t === "ideation" ? "Ideation AI" : t === "components" ? "Components AI" : "Wokwi Proof Lab"}
            </button>
          ))}
        </div>

        <div className={`rounded-xl border overflow-hidden ${isDark ? "bg-[#2a2a2a] border-white/10" : "bg-white border-black/10"}`}>
          {!isIdeationFinalized && tab === "ideation" && (
            <div className={`border-b px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] ${isDark ? "border-white/10 text-[#a3a3a3]" : "border-black/10 text-[#666]"}`}>
              Finalize ideation to unlock Components section.
            </div>
          )}

          {tab === "ideation" && (
            <motion.div
              key="ideation"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="h-[78vh]"
            >
              <ProjectChat onIdeationStateChange={handleIdeationStateChange} />
            </motion.div>
          )}

          {tab === "components" && (
            <motion.div
              key="components"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="h-[78vh]"
            >
              <ComponentsChat />
            </motion.div>
          )}

          {tab === "proof" && (
            <motion.div
              key="proof"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="h-[78vh]"
            >
              <WokwiProofLab
                projectId={id}
                projectSnapshot={projectSnapshot}
                onProjectUpdate={setProjectSnapshot}
              />
            </motion.div>
          )}
        </div>

      </div>
    </div>
  );
}