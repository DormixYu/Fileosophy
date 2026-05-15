import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FolderKanban, TrendingUp, Clock } from "lucide-react";
import { systemApi } from "@/lib/tauri-api";
import { useProjectStore } from "@/stores/useProjectStore";
import { useUserStore } from "@/stores/useUserStore";
import { getInitials } from "@/lib/formatUtils";
import { formatDate, formatTimeRelative } from "@/lib/formatUtils";
import Spinner from "@/components/common/Spinner";
import EmptyState from "@/components/common/EmptyState";

export default function DashboardPage() {
  const { projects, fetchProjects, loading } = useProjectStore();
  const { user, fetchUser } = useUserStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (projects.length === 0) fetchProjects();
    fetchUser();
  }, [projects.length, fetchProjects, fetchUser]);

  const activeCount = useMemo(
    () =>
      projects.filter(
        (p) => p.status !== "completed" && p.status !== "cancelled"
      ).length,
    [projects]
  );

  const recentProjects = useMemo(
    () =>
      [...projects]
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        .slice(0, 6),
    [projects]
  );

  return (
    <div className="px-10 pt-10 pb-12 animate-fade-up">
      {/* 品牌欢迎区 */}
      <div className="mb-10">
        <div className="flex items-center gap-5 mb-4">
          {user?.avatar_path ? (
            <img
              src={systemApi.convertFileSrc(user.avatar_path)}
              alt="头像"
              className="w-11 h-11 rounded-full object-cover shrink-0"
              style={{ border: "2px solid var(--gold)" }}
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-serif shrink-0"
              style={{ background: "var(--gold-glow-strong)", color: "var(--gold)", border: "2px solid var(--gold)" }}
            >
              {user?.name ? getInitials(user.name) : "?"}
            </div>
          )}
          <div>
            <h1
              className="text-headline font-serif mb-0"
              style={{ color: "var(--text-primary)" }}
            >
              {user?.name ? `欢迎回来，${user.name}` : "概览"}
            </h1>
          </div>
        </div>
        {/* 鎏金装饰线 */}
        <div
          className="h-px w-24 mb-3"
          style={{
            background: `linear-gradient(90deg, var(--gold), transparent)`,
          }}
        />
        <p className="text-callout" style={{ color: "var(--text-tertiary)" }}>
          这里是你的项目全貌
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-5 mb-10">
        <StatCard
          icon={<FolderKanban size={18} strokeWidth={1.5} />}
          label="项目总数"
          value={String(projects.length)}
        />
        <StatCard
          icon={<TrendingUp size={18} strokeWidth={1.5} />}
          label="活跃项目"
          value={String(activeCount)}
        />
        <StatCard
          icon={<Clock size={18} strokeWidth={1.5} />}
          label="最近更新"
          value={
            recentProjects[0]
              ? formatTimeRelative(recentProjects[0].updated_at)
              : "--"
          }
        />
      </div>

      {/* 最近项目区 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2
            className="text-title font-serif"
            style={{ color: "var(--text-primary)" }}
          >
            最近项目
          </h2>
          <span
            className="text-footnote"
            style={{ color: "var(--text-muted)" }}
          >
            {projects.length > 0 ? `${projects.length} 个` : ""}
          </span>
        </div>
        <Link
          to="/projects"
          className="btn btn-ghost btn-sm hover-gold-text"
          style={{ color: "var(--gold)" }}
        >
          查看全部
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16 animate-fade-up">
          <Spinner />
          <p
            className="text-footnote mt-4"
            style={{ color: "var(--text-muted)" }}
          >
            正在加载...
          </p>
        </div>
      ) : recentProjects.length === 0 ? (
        <div className="animate-fade-up">
          <EmptyState
            icon={<FolderKanban size={24} strokeWidth={1.5} />}
            title="还没有项目"
            description="创建第一个吧"
            action={{ label: "新建项目", onClick: () => navigate("/projects") }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-up">
          {recentProjects.map((project) => (
            <Link
              key={project.id}
              to={`/project/${project.id}`}
              className="card card-interactive hover-gold-border group"
            >
              <div className="flex items-start justify-between mb-2">
                <h3
                  className="text-callout font-serif leading-snug"
                  style={{ color: "var(--text-primary)" }}
                >
                  {project.name}
                </h3>
                {project.status && (
                  <span
                    className="badge badge-primary ml-2 shrink-0"
                  >
                    {project.status === "in_progress" ? "进行中" :
                     project.status === "planning" ? "规划中" :
                     project.status === "completed" ? "已完成" :
                     project.status === "on_hold" ? "已暂停" :
                     project.status === "cancelled" ? "已取消" : project.status}
                  </span>
                )}
              </div>
              <p
                className="text-footnote line-clamp-2 mb-4"
                style={{ color: "var(--text-tertiary)" }}
              >
                {project.description || "暂无描述"}
              </p>
              <div
                className="text-caption"
                style={{ color: "var(--text-dim)" }}
              >
                更新于 {formatDate(project.updated_at)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: "var(--gold-glow-strong)",
            color: "var(--gold)",
            border: "1px solid var(--gold)",
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div
            className="text-footnote uppercase tracking-[0.15em] mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            {label}
          </div>
          <div
            className="text-xl font-serif truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}