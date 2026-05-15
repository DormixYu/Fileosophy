import { useState, useEffect, useCallback } from "react";
import { RotateCcw, Save } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import type { ShortcutConfig } from "@/types";
import { DEFAULT_SHORTCUTS } from "@/types";

function formatShortcut(shortcut: string): string {
  return shortcut
    .replace("CommandOrControl", "Ctrl")
    .replace("Super", "Win")
    .split("+")
    .join(" + ");
}

export default function ShortcutsSection({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { shortcuts, saveShortcuts, registerAllShortcuts } =
    useSettingsStore();
  const { addToast } = useNotificationStore();
  const [editing, setEditing] = useState<ShortcutConfig[]>([]);
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setEditing([...shortcuts]);
  }, [shortcuts]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleRecordKey = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("CommandOrControl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Super");

      const key = e.key;
      if (
        !["Control", "Alt", "Shift", "Meta"].includes(key)
      ) {
        // 映射特殊键
        const keyMap: Record<string, string> = {
          " ": "Space",
          ArrowUp: "ArrowUp",
          ArrowDown: "ArrowDown",
          ArrowLeft: "ArrowLeft",
          ArrowRight: "ArrowRight",
          Escape: "Escape",
          Backspace: "Backspace",
          Delete: "Delete",
          Enter: "Enter",
          Tab: "Tab",
        };
        const mapped = keyMap[key] || key.toUpperCase();
        parts.push(mapped);
      }

      if (parts.length > 1) {
        const shortcut = parts.join("+");
        const updated = [...editing];
        updated[index] = { ...updated[index], shortcut };
        setEditing(updated);
        setDirty(true);
      }
      setRecordingIndex(null);
    },
    [editing]
  );

  const handleSave = async () => {
    await saveShortcuts(editing);
    await registerAllShortcuts();
    setDirty(false);
    addToast({
      type: "success",
      title: "快捷键已保存",
      message: "全局快捷键已重新注册",
    });
  };

  const handleReset = () => {
    setEditing([...DEFAULT_SHORTCUTS]);
    setDirty(true);
  };

  return (
    <section className="animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2
            className="text-title font-serif"
            style={{ color: "var(--text-primary)" }}
          >
            全局快捷键
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

      <p
        className="text-xs mb-4 font-mono"
        style={{ color: "var(--text-tertiary)" }}
      >
        点击快捷键区域，按下新的组合键来修改。保存后立即生效。
      </p>

      <div className="space-y-2">
        {editing.map((sc, index) => (
          <div
            key={sc.action}
            className="card flex items-center justify-between py-3"
          >
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-serif"
                style={{ color: "var(--text-primary)" }}
              >
                {sc.label}
              </p>
              <p
                className="text-xs mt-0.5 font-mono"
                style={{ color: "var(--text-tertiary)" }}
              >
                {sc.description}
              </p>
            </div>
            {/* 品牌 kbd 按钮：bg-surface-alt + border-default + font-mono */}
            <button
              className="px-3 py-1.5 rounded-md text-xs font-mono transition-all min-w-[140px] text-center"
              style={{
                background:
                  recordingIndex === index
                    ? "var(--gold-glow-strong)"
                    : "var(--bg-surface-alt)",
                border: `1px solid ${
                  recordingIndex === index
                    ? "var(--gold)"
                    : "var(--border-default)"
                }`,
                color:
                  recordingIndex === index
                    ? "var(--gold)"
                    : "var(--text-primary)",
                boxShadow:
                  recordingIndex === index
                    ? "var(--shadow-gold)"
                    : "none",
                cursor: "pointer",
              }}
              onClick={() => setRecordingIndex(recordingIndex === index ? null : index)}
              onKeyDown={(e) => handleRecordKey(index, e)}
              tabIndex={0}
            >
              {recordingIndex === index
                ? "按下组合键..."
                : formatShortcut(sc.shortcut)}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}