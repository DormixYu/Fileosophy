import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage";
import ProjectListPage from "@/pages/ProjectListPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import GanttPage from "@/pages/GanttPage";
import SharingPage from "@/pages/SharingPage";
import SettingsPage from "@/pages/SettingsPage";
import GlobalSearch from "@/components/common/GlobalSearch";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import OnboardingOverlay from "@/components/common/OnboardingOverlay";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useProjectStore } from "@/stores/useProjectStore";

function AppContent() {
  const [showSearch, setShowSearch] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const registerAllShortcuts = useSettingsStore((s) => s.registerAllShortcuts);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const requestCreateProject = useProjectStore((s) => s.requestCreateProject);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const action = e.detail;
      if (action === "quick_add") {
        requestCreateProject();
        navigate("/projects");
      }
      if (action === "global_search") setShowSearch(true);
      if (action === "toggle_window") {
        (async () => {
          try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            const win = getCurrentWindow();
            const visible = await win.isVisible();
            if (visible) {
              await win.hide();
            } else {
              await win.show();
              await win.setFocus();
            }
          } catch (e) {
            console.warn("窗口切换失败:", e);
          }
        })();
      }
    };
    window.addEventListener("global-shortcut", handler as EventListener);
    return () => window.removeEventListener("global-shortcut", handler as EventListener);
  }, [requestCreateProject, navigate]);

  useEffect(() => {
    registerAllShortcuts();
  }, [registerAllShortcuts]);

  // 首次启动检测
  useEffect(() => {
    (async () => {
      try {
        await fetchSettings();
        const settings = useSettingsStore.getState().settings;
        if (!settings["tutorial_completed"]) {
          setShowOnboarding(true);
        }
      } catch {
        // settings 加载失败时不阻塞
      }
      setCheckingOnboarding(false);
    })();
  }, [fetchSettings]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  // 首次启动引导期间不渲染主页面
  if (showOnboarding) {
    return <OnboardingOverlay onComplete={handleOnboardingComplete} />;
  }

  // 正在检测是否需要引导时显示空白
  if (checkingOnboarding) {
    return null;
  }

  return (
    <>
    <ErrorBoundary>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/project/:id" element={<ProjectDetailPage />} />
        <Route path="/gantt" element={<GanttPage />} />
        <Route path="/sharing" element={<SharingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
    </ErrorBoundary>

    <GlobalSearch
      open={showSearch}
      onClose={() => setShowSearch(false)}
    />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}