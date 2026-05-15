import { useState, useEffect } from "react";
import { Save, RotateCcw } from "lucide-react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import type { NotificationPreferences } from "@/types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/types";

const PREF_LABELS: Record<keyof NotificationPreferences, { label: string; desc: string }> = {
  project_created: { label: "项目创建", desc: "新建项目时通知" },
  project_deleted: { label: "项目删除", desc: "删除项目时通知" },
  project_status_changed: { label: "项目状态变更", desc: "项目状态改变时通知" },
  card_created: { label: "新卡片", desc: "看板中创建新卡片时通知" },
  card_moved: { label: "卡片移动", desc: "看板卡片移动时通知" },
  file_uploaded: { label: "文件上传", desc: "项目中上传文件时通知" },
  file_deleted: { label: "文件删除", desc: "项目中删除文件时通知" },
  file_received: { label: "文件接收", desc: "局域网收到文件时通知" },
  share_started: { label: "共享开启", desc: "开启文件夹共享时通知" },
  share_stopped: { label: "共享停止", desc: "停止文件夹共享时通知" },
};

export default function NotificationSection({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { preferences, fetchPreferences, savePreferences } = useNotificationStore();
  const { addToast } = useNotificationStore();
  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  useEffect(() => {
    setLocalPrefs(preferences);
  }, [preferences]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const toggle = (key: keyof NotificationPreferences) => {
    setLocalPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  const handleSave = async () => {
    await savePreferences(localPrefs);
    setDirty(false);
    addToast({ type: "success", title: "通知设置已保存", message: "" });
  };

  const handleReset = () => {
    setLocalPrefs(DEFAULT_NOTIFICATION_PREFERENCES);
    setDirty(true);
  };

  const prefKeys = Object.keys(PREF_LABELS) as (keyof NotificationPreferences)[];

  return (
    <section className="animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
            通知设置
          </h2>
          <div
            className="w-8 h-[2px] rounded-full"
            style={{ background: "var(--gold)", opacity: 0.5 }}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={handleReset}>
            <RotateCcw size={13} strokeWidth={1.5} />
            恢复默认
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={!dirty}
            style={{ opacity: dirty ? 1 : 0.5 }}
          >
            <Save size={13} strokeWidth={1.5} />
            保存
          </button>
        </div>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
        控制哪些操作会弹出通知。关闭后通知仍会保存到历史记录中，但不会弹出 Toast 提示。
      </p>

      <div className="space-y-1 mb-6">
        {prefKeys.map((key) => {
          const { label, desc } = PREF_LABELS[key];
          const isOn = localPrefs[key];
          return (
            <button
              key={key}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-colors text-left hover-surface-alt-bg"
              style={{
                border: "none",
                cursor: "pointer",
              }}
              onClick={() => toggle(key)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>
                  {label}
                </p>
                <p className="text-[11px] mt-0.5 font-mono" style={{ color: "var(--text-muted)" }}>
                  {desc}
                </p>
              </div>
              {/* 品牌 toggle 开关 */}
              <div
                className="w-9 h-5 rounded-full relative transition-colors shrink-0 ml-3"
                style={{
                  background: isOn ? "var(--gold)" : "var(--border-default)",
                  boxShadow: isOn ? "var(--shadow-gold)" : "none",
                }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
                  style={{
                    background: "var(--bg-elevated)",
                    transform: isOn ? "translateX(18px)" : "translateX(2px)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}