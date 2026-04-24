import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "./store/useAuthStore";

import HeroPage from "./pages/HeroPage";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import ProjectMainPage from "./components/ProjectMainPage";
import DesignPage from "./pages/DesignPage";

function App() {
  const { authUser, checkAuth, isCheckingAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isCheckingAuth) {
    return (
      <div className="app-shell page-bg flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="surface w-full max-w-sm rounded-xl p-6 text-center"
        >
          <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          <p className="text-sm font-medium muted">Loading...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Routes>

      {/* HERO */}
      <Route path="/" element={<HeroPage />} />

      {/* AUTH */}
      <Route
        path="/auth"
        element={!authUser ? <AuthPage /> : <Navigate to="/home" />}
      />

      {/* HOME */}
      <Route
        path="/home"
        element={authUser ? <HomePage /> : <Navigate to="/auth" />}
      />

      {/* PROJECT */}
      <Route
        path="/project/:id"
        element={authUser ? <ProjectMainPage /> : <Navigate to="/auth" />}
      />

      <Route
        path="/project/:id/design"
        element={authUser ? <DesignPage /> : <Navigate to="/auth" />}
      />

      </Routes>
    </div>
  );
}

export default App;