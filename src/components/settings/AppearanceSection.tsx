import { Sun, Moon, Monitor } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";

const themes = [
  { key: "light" as const, label: "浅色", icon: Sun },
  { key: "dark" as const, label: "深色", icon: Moon },
  { key: "system" as const, label: "跟随系统", icon: Monitor },
];

export default function AppearanceSection() {
  const { settings, setTheme } = useSettingsStore();

  return (
    <section className="animate-slide-up">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
          主题
        </h2>
        <div
          className="w-8 h-[2px] rounded-full"
          style={{ background: "var(--gold)", opacity: 0.5 }}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {themes.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTheme(key)}
            className="card-interactive card flex flex-col items-center gap-2 py-4 transition-all"
            style={{
              borderColor:
                settings.theme === key
                  ? "var(--gold)"
                  : "var(--border-default)",
              boxShadow:
                settings.theme === key ? "var(--shadow-gold)" : "none",
              cursor: "pointer",
            }}
          >
            <Icon
              size={20}
              strokeWidth={1.5}
              style={{
                color:
                  settings.theme === key
                    ? "var(--gold)"
                    : "var(--text-tertiary)",
              }}
            />
            <span
              className="text-xs font-mono"
              style={{
                color:
                  settings.theme === key
                    ? "var(--gold)"
                    : "var(--text-secondary)",
              }}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* 关于 */}
      <div className="flex items-center gap-3 mt-8 mb-4">
        <h2
          className="text-title font-serif"
          style={{ color: "var(--text-primary)" }}
        >
          关于
        </h2>
        <div
          className="w-8 h-[2px] rounded-full"
          style={{ background: "var(--gold)", opacity: 0.5 }}
        />
      </div>
      <div
        className="card text-sm space-y-2"
        style={{ color: "var(--text-secondary)" }}
      >
        <div className="flex justify-between py-1">
          <span className="font-mono text-xs">应用名称</span>
          <span className="font-serif" style={{ color: "var(--text-primary)" }}>飞序 · Fileosophy</span>
        </div>
        <div
          className="w-full h-[1px]"
          style={{ background: "var(--border-light)" }}
        />
        <div className="flex justify-between py-1">
          <span className="font-mono text-xs">版本</span>
          <span className="font-mono" style={{ color: "var(--text-primary)" }}>1.0.0</span>
        </div>
        <div
          className="w-full h-[1px]"
          style={{ background: "var(--border-light)" }}
        />
        <div className="flex justify-between py-1">
          <span className="font-mono text-xs">框架</span>
          <span className="font-mono" style={{ color: "var(--text-primary)" }}>
            Tauri 2.x + React 18
          </span>
        </div>
      </div>
    </section>
  );
}