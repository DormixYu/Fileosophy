import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { LayoutDashboard, FolderKanban, GanttChart, Share2, Settings, Plus, Bell } from "lucide-react";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
import { useProjectStore } from "@/stores/useProjectStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useUserStore } from "@/stores/useUserStore";
import { useEffect } from "react";
import ToastContainer from "@/components/notifications/ToastContainer";
import NotificationCenter from "@/components/notifications/NotificationCenter";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "概览" },
  { to: "/projects", icon: FolderKanban, label: "项目" },
  { to: "/gantt", icon: GanttChart, label: "甘特图" },
  { to: "/sharing", icon: Share2, label: "共享" },
  { to: "/settings", icon: Settings, label: "设置" },
];

export default function Layout() {
  const { projects, fetchProjects } = useProjectStore();
  const { unreadCount, fetchHistory, fetchPreferences } = useNotificationStore();
  const { user, fetchUser } = useUserStore();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchHistory();
    fetchPreferences();
    fetchUser();
  }, [fetchProjects, fetchHistory, fetchPreferences, fetchUser]);

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-void)" }}>
      {/* 侧边栏 */}
      <aside
        className="flex flex-col w-56 shrink-0 border-r"
        style={{
          background: "var(--bg-surface-alt)",
          borderColor: "var(--border-default)",
        }}
      >
        {/* Logo + 通知图标 */}
        <div
          className="flex items-center justify-between px-5 h-14 border-b"
          style={{ borderColor: "var(--border-light)" }}
        >
          <div className="flex items-center gap-2.5">
            <svg
              viewBox="0 0 120 120"
              fill="none"
              className="w-7 h-7"
              style={{ color: "var(--text-primary)" }}
            >
              <rect x="22" y="16" width="66" height="88" rx="6" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M70 16 L70 38 L88 38" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
              <line x1="34" y1="50" x2="58" y2="50" stroke="currentColor" strokeWidth="1.2" opacity="0.3" strokeLinecap="round" />
              <line x1="34" y1="58" x2="52" y2="58" stroke="currentColor" strokeWidth="1.2" opacity="0.25" strokeLinecap="round" />
              <line x1="34" y1="66" x2="60" y2="66" stroke="currentColor" strokeWidth="1.2" opacity="0.22" strokeLinecap="round" />
              <path d="M28,82 C34,66 44,54 54,58 C64,62 72,48 80,42" stroke="var(--gold)" strokeWidth="2.6" strokeLinecap="round" />
              <circle cx="82" cy="40" r="2.8" fill="var(--gold)" />
            </svg>
            <span
              className="font-serif text-lg tracking-widest"
              style={{ color: "var(--text-primary)" }}
            >
              飞序
            </span>
          </div>
          <button
            className="relative p-1.5 rounded-md transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => setShowNotifications(true)}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--gold-glow)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Bell size={16} strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[14px] h-[14px] rounded-full text-[9px] font-medium px-0.5"
                style={{ background: "var(--gold)", color: "#fff" }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* 导航 */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all ${
                  isActive ? "font-normal" : "font-light"
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? "var(--gold-glow)" : "transparent",
                color: isActive ? "var(--gold)" : "var(--text-secondary)",
              })}
            >
              <Icon size={16} strokeWidth={1.5} />
              {label}
            </NavLink>
          ))}

          {/* 分割线 */}
          <div
            className="my-3 h-px"
            style={{ background: "var(--border-light)" }}
          />

          {/* 最近项目列表 */}
          <div
            className="px-3 py-1 text-[10px] uppercase tracking-[0.2em]"
            style={{ color: "var(--text-muted)" }}
          >
            最近项目
          </div>
          {projects.slice(0, 8).map((project) => (
            <NavLink
              key={project.id}
              to={`/project/${project.id}`}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all truncate ${
                  isActive ? "font-normal" : "font-light"
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? "var(--gold-glow)" : "transparent",
                color: isActive ? "var(--gold)" : "var(--text-tertiary)",
              })}
            >
              <span className="truncate">{project.name}</span>
            </NavLink>
          ))}

          <NavLink
            to="/projects"
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all"
            style={{ color: "var(--text-muted)" }}
          >
            <Plus size={12} strokeWidth={1.5} />
            <span>查看全部</span>
          </NavLink>
        </nav>

        
        {/* 用户信息 */}
        <NavLink
          to="/settings?tab=profile"
          className="flex items-center gap-2.5 px-4 py-3 border-t transition-colors"
          style={{
            borderColor: "var(--border-light)",
            color: "var(--text-secondary)",
          }}
        >
          {user?.avatar_path ? (
            <img
              src={convertFileSrc(user.avatar_path)}
              alt="头像"
              className="w-7 h-7 rounded-full object-cover shrink-0"
              style={{ border: "1.5px solid var(--gold)" }}
            />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-serif shrink-0"
              style={{
                background: "var(--gold-glow-strong)",
                color: "var(--gold)",
                border: "1.5px solid var(--gold)",
              }}
            >
              {user?.name ? getInitials(user.name) : "?"}
            </div>
          )}
          <span className="text-xs truncate">
            {user?.name || "设置用户资料"}
          </span>
        </NavLink>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* 全局通知 Toast */}
      <ToastContainer />

      {/* 通知中心 */}
      <NotificationCenter
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </div>
  );
}
