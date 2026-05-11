import { useEffect, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage";
import ProjectListPage from "@/pages/ProjectListPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import GanttPage from "@/pages/GanttPage";
import SettingsPage from "@/pages/SettingsPage";
import QuickAddPanel from "@/components/common/QuickAddPanel";
import GlobalSearch from "@/components/common/GlobalSearch";

export default function App() {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const registerShortcuts = useCallback(async () => {
    try {
      const { register } = await import(
        "@tauri-apps/plugin-global-shortcut"
      );

      // 快速新建
      await register("CommandOrControl+Shift+N", (event) => {
        if (event.state === "Pressed") {
          setShowQuickAdd(true);
        }
      });

      // 全局搜索
      await register("CommandOrControl+Shift+F", (event) => {
        if (event.state === "Pressed") {
          setShowSearch(true);
        }
      });

      // 显示/隐藏窗口
      await register("CommandOrControl+Shift+S", async (_event) => {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const visible = await win.isVisible();
        if (visible) {
          await win.hide();
        } else {
          await win.show();
          await win.setFocus();
        }
      });
    } catch (e) {
      console.error("注册全局快捷键失败:", e);
    }
  }, []);

  useEffect(() => {
    registerShortcuts();
  }, [registerShortcuts]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectListPage />} />
          <Route path="/project/:id" element={<ProjectDetailPage />} />
          <Route path="/gantt" element={<GanttPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>

      {/* 全局面板 */}
      <QuickAddPanel
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
      />
      <GlobalSearch
        open={showSearch}
        onClose={() => setShowSearch(false)}
      />
    </BrowserRouter>
  );
}
