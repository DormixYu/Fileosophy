import { useState, useEffect } from "react";
import { Sun, Moon, Monitor, ArrowRight, ChevronLeft, LayoutDashboard, FolderKanban, BarChart3, Share2, Settings, Sparkles } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useUserStore } from "@/stores/useUserStore";

const themes = [
  { key: "light" as const, label: "浅色", icon: Sun },
  { key: "dark" as const, label: "深色", icon: Moon },
  { key: "system" as const, label: "跟随系统", icon: Monitor },
];

const navItems = [
  { icon: LayoutDashboard, label: "概览", desc: "项目统计与最近动态" },
  { icon: FolderKanban, label: "项目", desc: "看板、甘特图、文件管理" },
  { icon: BarChart3, label: "甘特图", desc: "跨项目任务时间线汇总" },
  { icon: Share2, label: "共享", desc: "局域网文件夹分享与协作" },
  { icon: Settings, label: "设置", desc: "主题、快捷键、数据管理" },
];

interface OnboardingOverlayProps {
  onComplete: () => void;
}

export default function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const { settings, setTheme, saveSettings } = useSettingsStore();
  const { user, saveUser } = useUserStore();

  const totalSteps = 4;

  // 初始化用户名
  useEffect(() => {
    if (user?.name) setUserName(user.name);
  }, [user]);

  const goNext = () => {
    setDirection("forward");
    if (step < totalSteps - 1) setStep(step + 1);
  };
  const goPrev = () => {
    setDirection("backward");
    if (step > 0) setStep(step - 1);
  };

  const handleFinish = async () => {
    // 保存用户名
    if (userName.trim()) {
      try { await saveUser(userName.trim()); } catch { /* ignore */ }
    }
    // 标记教程完成
    try { await saveSettings({ tutorial_completed: "true" }); } catch { /* ignore */ }
    onComplete();
  };

  const slideClass = direction === "forward" ? "animate-slide-up" : "animate-slide-down";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "var(--bg)" }}>
      {/* 噪点纹理背景（由 body::before 提供，这里用半透明叠加模拟） */}
      <div className="absolute inset-0 opacity-[0.018]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />

      <div className="relative w-full max-w-md px-6 py-8">
        {/* 步骤进度指示器 */}
        <div className="flex items-center gap-2 justify-center mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all duration-500"
              style={{
                width: i === step ? "24px" : "8px",
                background: i <= step ? "var(--gold)" : "var(--border-default)",
              }}
            />
          ))}
        </div>

        {/* 步骤内容 */}
        <div key={step} className={`${slideClass} duration-300`}>
          {/* Step 0: 欢迎 */}
          {step === 0 && (
            <div className="text-center space-y-6">
              {/* Logo */}
              <div className="flex justify-center mb-2">
                <svg viewBox="0 0 120 120" width="80" height="80" className="animate-scale-in">
                  <rect x="24" y="12" width="60" height="76" rx="8" ry="8"
                    fill="none" stroke="var(--gold)" strokeWidth="2.5" />
                  <path d="M84 12 L84 32 L64 32" fill="none" stroke="var(--gold)" strokeWidth="2.5" />
                  <line x1="36" y1="36" x2="72" y2="36" stroke="var(--text-secondary)" strokeWidth="2" />
                  <line x1="36" y1="46" x2="72" y2="46" stroke="var(--text-secondary)" strokeWidth="2" />
                  <line x1="36" y1="56" x2="56" y2="56" stroke="var(--text-secondary)" strokeWidth="2" />
                  <path d="M36 70 C44 60 54 74 66 58 C74 48 82 62 88 54"
                    fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="88" cy="54" r="3" fill="var(--gold)" />
                </svg>
              </div>
              <h1 className="text-2xl font-serif animate-fade-in" style={{ color: "var(--text-primary)" }}>
                飞序 · Fileosophy
              </h1>
              <p className="text-sm font-serif animate-fade-in" style={{ color: "var(--text-secondary)" }}>
                在有序的体系中迸发思想的自由
              </p>
              <div className="space-y-3 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  一个桌面项目管理工具——看板、甘特图、文件共享、局域网协作
                </p>
              </div>
            </div>
          )}

          {/* Step 1: 主题选择 */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-serif" style={{ color: "var(--text-primary)" }}>
                  选择你的风格
                </h2>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  选择一个主题，随时可以在设置中更改
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {themes.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setTheme(key)}
                    className="card flex flex-col items-center gap-3 py-6 transition-all"
                    style={{
                      borderColor: settings.theme === key ? "var(--gold)" : "var(--border-default)",
                      boxShadow: settings.theme === key ? "var(--shadow-gold)" : "none",
                      cursor: "pointer",
                      background: "var(--bg-surface)",
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{
                        background: key === "light"
                          ? "#f6f1e6"
                          : key === "dark"
                          ? "#16120e"
                          : "linear-gradient(135deg, #16120e 50%, #f6f1e6 50%)",
                        border: "1px solid var(--border-light)",
                      }}
                    >
                      <Icon
                        size={20}
                        strokeWidth={1.5}
                        style={{
                          color: settings.theme === key ? "var(--gold)" : "var(--text-tertiary)",
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-mono"
                      style={{
                        color: settings.theme === key ? "var(--gold)" : "var(--text-secondary)",
                      }}
                    >
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: 用户名 */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-serif" style={{ color: "var(--text-primary)" }}>
                  你是谁？
                </h2>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  设置你的名字，方便团队成员识别
                </p>
              </div>
              <div className="flex justify-center">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: "var(--gold-glow)", border: "2px solid var(--gold)" }}
                >
                  <Sparkles size={28} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
                </div>
              </div>
              <div className="max-w-xs mx-auto">
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="输入你的名字"
                  autoFocus
                  className="input-base w-full text-center text-sm font-serif"
                  onKeyDown={(e) => e.key === "Enter" && goNext()}
                  maxLength={20}
                />
              </div>
            </div>
          )}

          {/* Step 3: 导览 */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-serif" style={{ color: "var(--text-primary)" }}>
                  快速了解
                </h2>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  五个核心功能区域
                </p>
              </div>
              <div className="space-y-2">
                {navItems.map(({ icon: Icon, label, desc }, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all"
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-light)",
                      animationDelay: `${i * 0.1}s`,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: "var(--gold-glow)" }}
                    >
                      <Icon size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
                    </div>
                    <div>
                      <span className="text-xs font-serif" style={{ color: "var(--text-primary)" }}>
                        {label}
                      </span>
                      <span className="text-[11px] font-mono ml-2" style={{ color: "var(--text-muted)" }}>
                        {desc}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 导航按钮 */}
        <div className="flex items-center justify-between mt-8">
          {step > 0 ? (
            <button
              className="btn btn-ghost btn-sm flex items-center gap-1"
              onClick={goPrev}
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
              上一步
            </button>
          ) : (
            <span />
          )}

          {step < totalSteps - 1 ? (
            <button
              className="btn btn-primary btn-sm flex items-center gap-1"
              onClick={goNext}
            >
              下一步
              <ArrowRight size={14} strokeWidth={1.5} />
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm flex items-center gap-1"
              onClick={handleFinish}
            >
              开始使用
              <Sparkles size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}