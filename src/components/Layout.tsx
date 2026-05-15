import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, FolderKanban, GanttChart, Share2, Settings, Plus, Bell } from "lucide-react";
import { systemApi } from "@/lib/tauri-api";
import { getInitials } from "@/lib/formatUtils";
import { useProjectStore } from "@/stores/useProjectStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useUserStore } from "@/stores/useUserStore";
import { useEffect } from "react";
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
  const { unreadCount, fetchHistory, fetchPreferences, setupListeners } = useNotificationStore();
  const { user, fetchUser } = useUserStore();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchHistory();
    fetchPreferences();
    fetchUser();
    setupListeners();
  }, [fetchProjects, fetchHistory, fetchPreferences, fetchUser, setupListeners]);

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-void)" }}>
      {/* 侧边栏 */}
      <aside
        className="relative flex flex-col w-56 shrink-0 border-r"
        style={{
          background: "var(--bg-surface-alt)",
          borderColor: "var(--border-default)",
        }}
      >
        {/* ── Logo 区 ── */}
        <div
          className="flex items-center justify-between px-5 h-14 border-b"
          style={{ borderColor: "var(--border-light)" }}
        >
          <div className="flex items-center gap-2.5">
            <svg
              viewBox="0 0 100 100"
              fill="none"
              className="w-7 h-7"
              style={{ color: "var(--text-primary)" }}
            >
              <path d="M26,8 L64,8 L82,26 L82,92 L26,92 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M64,8 L64,26 L82,26" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
              <line x1="36" y1="36" x2="56" y2="36" stroke="currentColor" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
              <line x1="36" y1="78" x2="54" y2="78" stroke="currentColor" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
              <line x1="36" y1="86" x2="46" y2="86" stroke="currentColor" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
              <path
                d="M34,57 C40,36 52,36 52,53 C52,70 64,70 66,50"
                stroke="var(--gold)"
                strokeWidth="2.4"
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 3px rgba(201,168,76,0.35))" }}
              />
            </svg>
            <span
              className="font-serif text-sm uppercase tracking-[0.15em]"
              style={{ color: "var(--text-primary)", fontWeight: 300 }}
            >
              Fileosophy
            </span>
          </div>
          <button
            className="relative p-1.5 rounded-md transition-colors hover-gold-bg"
            style={{ color: "var(--text-secondary)" }}
            aria-label="通知"
            onClick={() => setShowNotifications(true)}
          >
            <Bell size={16} strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full"
                style={{ background: "var(--gold)" }}
              />
            )}
          </button>
        </div>

        {/* ── 导航区 ── */}
        <nav className="px-3 pt-4 pb-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all ${
                  isActive ? "font-normal" : "font-light"
                } hover-gold-bg`
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
        </nav>

        {/* ── 分割线 ── */}
        <div
          className="mx-5 h-px"
          style={{ background: "var(--border-light)" }}
        />

        {/* ── 最近项目区 ── */}
        <div className="flex-1 px-3 pt-3 pb-2 overflow-y-auto scrollbar-hide">
          <div
            className="px-3 py-1.5 text-footnote uppercase tracking-[0.2em]"
            style={{ color: "var(--text-dim)" }}
          >
            最近项目
          </div>
          <div className="space-y-0.5">
            {projects.slice(0, 8).map((project) => (
              <NavLink
                key={project.id}
                to={`/project/${project.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all truncate hover-gold-bg ${
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
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all hover-gold-bg hover-gold-text"
              style={{ color: "var(--text-dim)" }}
            >
              <Plus size={12} strokeWidth={1.5} />
              <span>查看全部</span>
            </NavLink>
          </div>
        </div>

        {/* ── 品牌理念 ── */}
        <div
          className="px-5 py-2 text-center border-t"
          style={{ borderColor: "var(--border-light)" }}
        >
          <p
            className="text-caption italic font-serif tracking-wide"
            style={{ color: "var(--text-dim)" }}
          >
            在有序的体系中迸发思想的自由
          </p>
        </div>

        {/* ── 用户区 ── */}
        <NavLink
          to="/settings?tab=profile"
          className="flex items-center gap-2.5 px-4 py-3 border-t transition-colors hover-gold-bg"
          style={{
            borderColor: "var(--border-light)",
            color: "var(--text-secondary)",
          }}
        >
          {user?.avatar_path ? (
            <img
              src={systemApi.convertFileSrc(user.avatar_path)}
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

      {/* 通知中心 */}
      <NotificationCenter
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </div>
  );
}