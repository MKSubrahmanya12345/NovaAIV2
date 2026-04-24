import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useThemeStore } from "../store/useThemeStore";
import { useAuthStore } from "../store/useAuthStore";
import axios from "axios";
import toast from "react-hot-toast";

import ProjectChat from "../components/ProjectChat";
import ComponentsChat from "../components/ComponentsChat";
import SimulatorWorkbench from "../components/SimulatorWorkbench";

export default function ProjectMainPage() {
  const [tab, setTab] = useState("ideation");
  const [isIdeationFinalized, setIsIdeationFinalized] = useState(false);
  const [projectSnapshot, setProjectSnapshot] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { theme, toggleTheme } = useThemeStore();
  const logout = useAuthStore((state) => state.logout);
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

  const handleLogout = async () => {
    if (isLoggingOut) return;

    try {
      setIsLoggingOut(true);
      await logout();
      navigate("/auth");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const shell = isDark
    ? "bg-[#1a1a18] text-[#ecebe8]"
    : "bg-[#faf9f5] text-[#1f1f1e]";

  const topBar = isDark
    ? "border-[#2f2f2c] bg-[#212120]"
    : "border-[#e8e6e0] bg-[#f3f2ed]";

  const tabWrap = isDark ? "bg-[#2a2a27] p-1" : "bg-[#ebe9e4] p-1";

  const tabActive = isDark
    ? "bg-[#353532] text-[#f5f4f0] shadow-sm"
    : "bg-white text-[#141413] shadow-sm";

  const tabIdle = isDark
    ? "text-[#a3a29c] hover:text-[#ecebe8]"
    : "text-[#5c5b56] hover:text-[#1f1f1e]";

  const panel = isDark
    ? "border-[#2f2f2c] bg-[#212120]"
    : "border-[#e8e6e0] bg-white";

  return (
    <div className={`flex h-svh min-h-0 w-full shrink-0 flex-col overflow-hidden font-sans ${shell}`}>
      <header className={`shrink-0 border-b ${topBar}`}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate("/home")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                isDark ? "text-[#c4c3bd] hover:bg-white/5" : "text-[#5c5b56] hover:bg-black/[0.04]"
              }`}
            >
              ← Back
            </button>
            <h1 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">Project workspace</h1>
            <p className={`mt-0.5 text-sm ${isDark ? "text-[#a3a29c]" : "text-[#6b6a67]"}`}>
              Ideation, components, and simulator
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSetWokwiUrl}
              disabled={!projectSnapshot}
              className={`rounded-full border px-3 py-2 text-xs font-medium transition sm:px-4 ${
                isDark
                  ? "border-[#3d3d3a] hover:bg-white/5 disabled:opacity-50"
                  : "border-[#dcdad3] hover:bg-black/[0.03] disabled:opacity-50"
              }`}
            >
              Wokwi URL
            </button>
            <button
              type="button"
              onClick={handleOpenDesign}
              disabled={!projectSnapshot}
              className={`rounded-full border px-3 py-2 text-xs font-medium transition sm:px-4 ${
                isDark
                  ? "border-[#3d3d3a] hover:bg-white/5 disabled:opacity-50"
                  : "border-[#dcdad3] hover:bg-black/[0.03] disabled:opacity-50"
              }`}
            >
              Design AI
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-full border px-3 py-2 text-xs font-medium sm:px-4 ${
                isDark ? "border-[#3d3d3a] hover:bg-white/5" : "border-[#dcdad3] hover:bg-black/[0.03]"
              }`}
            >
              {isDark ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={`rounded-full border px-3 py-2 text-xs font-medium sm:px-4 ${
                isDark
                  ? "border-[#3d3d3a] text-[#f0a8a8] hover:bg-white/5"
                  : "border-[#dcdad3] text-[#b45353] hover:bg-black/[0.03]"
              } ${isLoggingOut ? "opacity-50" : ""}`}
            >
              {isLoggingOut ? "…" : "Log out"}
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 pb-3 sm:px-6">
          <div className={`inline-flex rounded-full ${tabWrap}`}>
            {["ideation", "components", "simulator"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleSelectTab(t)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition sm:px-5 ${
                  tab === t ? tabActive : tabIdle
                } ${t === "components" && !isIdeationFinalized ? "opacity-45" : ""}`}
              >
                {t === "ideation" ? "Ideation" : t === "components" ? "Components" : "Simulator"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden border-t ${panel}`}>
        {!isIdeationFinalized && tab === "ideation" && (
          <div
            className={`shrink-0 border-b px-4 py-2.5 text-center text-xs font-medium sm:px-6 ${
              isDark ? "border-[#2f2f2c] text-[#c4c3bd]" : "border-[#e8e6e0] text-[#6b6a67]"
            }`}
          >
            Finish ideation to unlock Components.
          </div>
        )}

        {tab === "ideation" && (
          <motion.div
            key="ideation"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <ProjectChat onIdeationStateChange={handleIdeationStateChange} />
          </motion.div>
        )}

        {tab === "components" && (
          <motion.div
            key="components"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <ComponentsChat />
          </motion.div>
        )}

        {tab === "simulator" && (
          <motion.div
            key="simulator"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <SimulatorWorkbench
              projectId={id}
              projectSnapshot={projectSnapshot}
              onProjectUpdate={setProjectSnapshot}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
