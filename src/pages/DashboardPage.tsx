import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, TrendingUp, Clock, Plus } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";

export default function DashboardPage() {
  const { projects, fetchProjects, loading } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const activeCount = useMemo(
    () =>
      projects.filter(
        (p) => p.status !== "completed" && p.status !== "cancelled"
      ).length,
    [projects]
  );

  const recentProjects = [...projects]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, 6);

  return (
    <div className="p-8 animate-slide-up">
      {/* 页头 */}
      <div className="mb-8">
        <h1
          className="text-headline mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          概览
        </h1>
        <p className="text-body" style={{ color: "var(--text-tertiary)" }}>
          欢迎回来，这里是你的项目全貌
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-8">
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
              ? new Date(recentProjects[0].updated_at).toLocaleDateString(
                  "zh-CN"
                )
              : "—"
          }
        />
      </div>

      {/* 最近项目 */}
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-title"
          style={{ color: "var(--text-primary)" }}
        >
          最近项目
        </h2>
        <Link
          to="/projects"
          className="btn btn-ghost btn-sm"
          style={{ color: "var(--gold)" }}
        >
          查看全部
        </Link>
      </div>

      {loading ? (
        <div
          className="text-center py-12 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          加载中…
        </div>
      ) : recentProjects.length === 0 ? (
        <div className="card text-center py-12">
          <FolderKanban
            size={40}
            strokeWidth={1}
            className="mx-auto mb-3"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>
            还没有项目，创建第一个吧
          </p>
          <Link to="/projects" className="btn btn-primary">
            <Plus size={14} strokeWidth={1.5} />
            新建项目
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {recentProjects.map((project) => (
            <Link
              key={project.id}
              to={`/project/${project.id}`}
              className="card card-interactive"
            >
              <h3
                className="text-base mb-1 font-serif"
                style={{ color: "var(--text-primary)" }}
              >
                {project.name}
              </h3>
              <p
                className="text-xs line-clamp-2 mb-3"
                style={{ color: "var(--text-tertiary)" }}
              >
                {project.description || "暂无描述"}
              </p>
              <div
                className="text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                更新于{" "}
                {new Date(project.updated_at).toLocaleDateString("zh-CN")}
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
    <div className="card flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{
          background: "var(--gold-glow)",
          color: "var(--gold)",
        }}
      >
        {icon}
      </div>
      <div>
        <div
          className="text-[10px] uppercase tracking-[0.15em] mb-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </div>
        <div
          className="text-xl font-serif"
          style={{ color: "var(--text-primary)" }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
