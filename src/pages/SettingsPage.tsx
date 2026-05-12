import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Sun,
  Moon,
  Monitor,
  Keyboard,
  Database,
  Download,
  Upload,
  Save,
  RotateCcw,
  FileJson,
  FileSpreadsheet,
  Settings2,
  Plus,
  Trash2,
  FolderOpen,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User as UserIcon,
  Camera,
  Bell,
} from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useUserStore } from "@/stores/useUserStore";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { NotificationPreferences } from "@/types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/types";
import { projectApi, exportApi, folderApi } from "@/lib/tauri-api";
import Modal from "@/components/common/Modal";
import type {
  ShortcutConfig,
  ProjectTypeConfig,
  ProjectStatusConfig,
  ProjectTableColumn,
  ScannedFolder,
} from "@/types";
import {
  DEFAULT_SHORTCUTS,
  DEFAULT_PROJECT_TYPES,
  DEFAULT_PROJECT_STATUSES,
  DEFAULT_PROJECT_TABLE_COLUMNS,
  DEFAULT_NUMBER_TEMPLATE,
  DEFAULT_FOLDER_TEMPLATE,
} from "@/types";

type TabKey = "profile" | "appearance" | "notifications" | "project" | "shortcuts" | "data";

const tabs: { key: TabKey; label: string; icon: typeof Sun }[] = [
  { key: "profile", label: "用户资料", icon: UserIcon },
  { key: "appearance", label: "外观", icon: Sun },
  { key: "notifications", label: "通知", icon: Bell },
  { key: "project", label: "项目配置", icon: Settings2 },
  { key: "shortcuts", label: "快捷键", icon: Keyboard },
  { key: "data", label: "数据管理", icon: Database },
];

const themes = [
  { key: "light" as const, label: "浅色", icon: Sun },
  { key: "dark" as const, label: "深色", icon: Moon },
  { key: "system" as const, label: "跟随系统", icon: Monitor },
];

// ── 用户资料标签 ──────────────────────────────────────────────

const PRESET_EMOJIS = [
  "😀", "😎", "🤓", "🦊",
  "🐱", "🐼", "🦉", "🌸",
  "🔥", "⚡", "🌊", "🌙",
  "🎯", "🚀", "💎", "🎨",
];

function ProfileSection({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { user, fetchUser, saveUser, uploadAvatar } = useUserStore();
  const { addToast } = useNotificationStore();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleNameChange = (value: string) => {
    setName(value);
    setDirty(value !== (user?.name || ""));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveUser(name.trim(), user?.avatar_path);
      setDirty(false);
      addToast({ type: "success", title: "用户资料已保存", message: "" });
    } catch (e) {
      addToast({ type: "error", title: "保存失败", message: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const selected = await open({
        multiple: false,
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
      });
      if (!selected) return;

      const filePath = selected as string;
      const fileData = await readFile(filePath);
      // 转为 base64 data URL
      const bytes = new Uint8Array(fileData);
      const base64 = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
      const ext = filePath.split(".").pop()?.toLowerCase() || "png";
      const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      const dataUrl = `data:${mime};base64,${base64}`;

      await uploadAvatar(dataUrl);
      addToast({ type: "success", title: "头像已更新", message: "" });
    } catch (e) {
      addToast({ type: "error", title: "头像上传失败", message: String(e) });
    }
  };

  const handleEmojiSelect = async (emoji: string) => {
    try {
      // 将 emoji 绘制到 canvas 转为 PNG base64
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg-surface").trim();
      ctx.fillRect(0, 0, 128, 128);
      ctx.font = "72px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, 64, 68);
      const dataUrl = canvas.toDataURL("image/png");

      await uploadAvatar(dataUrl);
      setShowEmojiPicker(false);
      addToast({ type: "success", title: "头像已更新", message: "" });
    } catch (e) {
      addToast({ type: "error", title: "头像设置失败", message: String(e) });
    }
  };

  const getInitials = (n: string) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
  };

  return (
    <section className="animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-title" style={{ color: "var(--text-primary)" }}>
          用户资料
        </h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{ opacity: saving || !name.trim() ? 0.5 : 1 }}
        >
          <Save size={13} strokeWidth={1.5} />
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      {/* 头像 */}
      <div className="flex items-center gap-5 mb-4">
        {user?.avatar_path ? (
          <img
            src={convertFileSrc(user.avatar_path)}
            alt="头像"
            className="w-20 h-20 rounded-full object-cover"
            style={{ border: "2px solid var(--gold)" }}
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-serif"
            style={{
              background: "var(--gold-glow-strong)",
              color: "var(--gold)",
              border: "2px solid var(--gold)",
            }}
          >
            {user?.name ? getInitials(user.name) : "?"}
          </div>
        )}
        <div className="space-y-2">
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            {user?.name || "未设置用户名"}
          </p>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost btn-sm"
              style={{ border: "1px solid var(--border-default)" }}
              onClick={handleAvatarUpload}
            >
              <Camera size={13} strokeWidth={1.5} />
              上传图片
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{
                border: showEmojiPicker ? "1px solid var(--gold)" : "1px solid var(--border-default)",
                color: showEmojiPicker ? "var(--gold)" : undefined,
              }}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              选择 Emoji
            </button>
          </div>
        </div>
      </div>

      {/* Emoji 预设头像选择 */}
      {showEmojiPicker && (
        <div
          className="mb-6 p-3 rounded-lg animate-slide-up"
          style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-default)" }}
        >
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            选择一个 Emoji 作为头像
          </p>
          <div className="grid grid-cols-8 gap-2">
            {PRESET_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all hover:scale-110"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                }}
                onClick={() => handleEmojiSelect(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 用户名 */}
      <div className="mb-6">
        <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
          用户名
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="输入你的名称"
          className="w-full px-3 py-2 text-sm rounded-md outline-none font-mono"
          style={inputStyle}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
      </div>
    </section>
  );
}

// ── 通知设置标签 ──────────────────────────────────────────────

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

function NotificationSection({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
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
        <h2 className="text-title" style={{ color: "var(--text-primary)" }}>
          通知设置
        </h2>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={handleReset}>
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
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-colors text-left"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
              onClick={() => toggle(key)}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alt)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {label}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {desc}
                </p>
              </div>
              <div
                className="w-9 h-5 rounded-full relative transition-colors shrink-0 ml-3"
                style={{
                  background: isOn ? "var(--gold)" : "var(--border-default)",
                }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
                  style={{
                    background: "var(--bg-surface)",
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

// ── 外观标签 ──────────────────────────────────────────────────

function AppearanceSection() {
  const { settings, setTheme } = useSettingsStore();

  return (
    <section className="animate-slide-up">
      <h2 className="text-title mb-4" style={{ color: "var(--text-primary)" }}>
        主题
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {themes.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTheme(key)}
            className="card flex flex-col items-center gap-2 py-4 transition-all"
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
              className="text-xs"
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
      <h2
        className="text-title mt-8 mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        关于
      </h2>
      <div
        className="card text-sm space-y-2"
        style={{ color: "var(--text-secondary)" }}
      >
        <div className="flex justify-between">
          <span>应用名称</span>
          <span style={{ color: "var(--text-primary)" }}>Fileosophy</span>
        </div>
        <div className="flex justify-between">
          <span>版本</span>
          <span style={{ color: "var(--text-primary)" }}>1.0.0</span>
        </div>
        <div className="flex justify-between">
          <span>框架</span>
          <span style={{ color: "var(--text-primary)" }}>
            Tauri 2.x + React 18
          </span>
        </div>
      </div>
    </section>
  );
}

// ── 快捷键标签 ────────────────────────────────────────────────

function ShortcutsSection({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
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
        <h2
          className="text-title"
          style={{ color: "var(--text-primary)" }}
        >
          全局快捷键
        </h2>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={handleReset}>
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
        className="text-xs mb-4"
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
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {sc.label}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--text-tertiary)" }}
              >
                {sc.description}
              </p>
            </div>
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

function formatShortcut(shortcut: string): string {
  return shortcut
    .replace("CommandOrControl", "Ctrl")
    .replace("Super", "Win")
    .split("+")
    .join(" + ");
}

// ── 数据管理标签 ──────────────────────────────────────────────

function DataSection() {
  const { addToast } = useNotificationStore();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exportProjects, setExportProjects] = useState<{ id: number; name: string }[]>([]);

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const json = await exportApi.exportAllProjects();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fileosophy-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast({
        type: "success",
        title: "备份完成",
        message: "所有项目数据已导出",
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "备份失败",
        message: String(e),
      });
    } finally {
      setExporting(false);
    }
  };

  const handleImportAll = async () => {
    setImporting(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [
          { name: "JSON", extensions: ["json"] },
        ],
      });
      if (!selected) {
        setImporting(false);
        return;
      }
      const projects = await exportApi.importAllProjects(selected as string);
      addToast({
        type: "success",
        title: "导入完成",
        message: `成功导入 ${projects.length} 个项目`,
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "导入失败",
        message: String(e),
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExportSingle = async (format: "json" | "csv") => {
    try {
      const allProjects = await projectApi.getAll();
      const projects = allProjects.map(p => ({ id: p.id, name: p.name }));

      if (projects.length === 0) {
        addToast({
          type: "warning",
          title: "没有项目",
          message: "请先创建一个项目",
        });
        return;
      }

      setExportProjects(projects);
      setExportFormat(format);
      setShowExportPicker(true);
    } catch (e) {
      addToast({
        type: "error",
        title: "导出失败",
        message: String(e),
      });
    }
  };

  const handleExportConfirm = async (projectId: number) => {
    try {
      setShowExportPicker(false);
      const result = await exportApi.exportProject(projectId, exportFormat);

      const ext = exportFormat === "json" ? "json" : "csv";
      const mimeType = exportFormat === "json" ? "application/json" : "text/csv";
      const blob = new Blob([result], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${projectId}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);

      addToast({
        type: "success",
        title: "导出完成",
        message: `项目已导出为 ${exportFormat.toUpperCase()} 格式`,
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "导出失败",
        message: String(e),
      });
    }
  };

  return (
    <section className="animate-slide-up">
      <h2 className="text-title mb-4" style={{ color: "var(--text-primary)" }}>
        数据管理
      </h2>

      {/* 备份与还原 */}
      <div className="mb-6">
        <h3
          className="text-sm font-medium mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          完整备份与还原
        </h3>
        <p
          className="text-xs mb-3"
          style={{ color: "var(--text-tertiary)" }}
        >
          导出所有项目数据（含看板、甘特图、文件元数据）为 JSON 格式，可用于完整备份和迁移。
        </p>
        <div className="flex gap-3">
          <button
            className="btn btn-primary"
            onClick={handleExportAll}
            disabled={exporting}
          >
            <Download size={14} strokeWidth={1.5} />
            {exporting ? "导出中..." : "导出全部项目"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={handleImportAll}
            disabled={importing}
            style={{
              border: "1px solid var(--border-default)",
            }}
          >
            <Upload size={14} strokeWidth={1.5} />
            {importing ? "导入中..." : "从备份文件导入"}
          </button>
        </div>
      </div>

      {/* 单项目导出 */}
      <div>
        <h3
          className="text-sm font-medium mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          单项目导出
        </h3>
        <p
          className="text-xs mb-3"
          style={{ color: "var(--text-tertiary)" }}
        >
          将当前选中的项目导出为不同格式。
        </p>
        <div className="flex gap-3">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleExportSingle("json")}
            style={{ border: "1px solid var(--border-default)" }}
          >
            <FileJson size={13} strokeWidth={1.5} />
            导出 JSON
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleExportSingle("csv")}
            style={{ border: "1px solid var(--border-default)" }}
          >
            <FileSpreadsheet size={13} strokeWidth={1.5} />
            导出 CSV
          </button>
        </div>
      </div>

      {/* 文件夹扫描导入 */}
      <FolderScanImport addToast={addToast} />

      {/* 项目选择弹窗 */}
      <Modal
        open={showExportPicker}
        onClose={() => setShowExportPicker(false)}
        title="选择导出项目"
        footer={
          <button className="btn btn-ghost btn-sm" onClick={() => setShowExportPicker(false)}>
            取消
          </button>
        }
      >
        <div className="space-y-1 max-h-60 overflow-auto">
          {exportProjects.map((p) => (
            <button
              key={p.id}
              className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors"
              style={{ color: "var(--text-primary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--gold-glow)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onClick={() => handleExportConfirm(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Modal>
    </section>
  );
}

// ── 文件夹扫描导入组件 ──────────────────────────────────────

function FolderScanImport({ addToast }: { addToast: (t: { type: "info" | "success" | "warning" | "error" | "file-received"; title: string; message: string }) => void }) {
  const [scanPath, setScanPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScannedFolder[]>([]);
  const [importing, setImporting] = useState<string | null>(null);

  const handleScan = async () => {
    if (!scanPath.trim()) return;
    setScanning(true);
    setResults([]);
    try {
      const data = await folderApi.scanFolders(scanPath);
      setResults(data);
      addToast({ type: "success", title: "扫描完成", message: `发现 ${data.length} 个文件夹` });
    } catch (e) {
      addToast({ type: "error", title: "扫描失败", message: String(e) });
    } finally {
      setScanning(false);
    }
  };

  const handleImport = async (folder: ScannedFolder) => {
    setImporting(folder.path);
    try {
      await folderApi.importFromFolder(folder);
      addToast({ type: "success", title: "导入成功", message: `已导入 "${folder.folder_name}"` });
      setResults((prev) => prev.filter((r) => r.path !== folder.path));
      await useProjectStore.getState().fetchProjects();
    } catch (e) {
      addToast({ type: "error", title: "导入失败", message: String(e) });
    } finally {
      setImporting(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
  };

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
        文件夹扫描导入
      </h3>
      <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
        选择一个目录，自动识别子文件夹中的项目编号和名称，一键导入为项目。
      </p>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={scanPath}
          onChange={(e) => setScanPath(e.target.value)}
          placeholder="选择或输入目录路径"
          className="flex-1 px-3 py-1.5 text-sm font-mono rounded-md outline-none"
          style={inputStyle}
        />
        <button
          className="btn btn-ghost btn-sm"
          style={{ border: "1px solid var(--border-default)" }}
          onClick={async () => {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const selected = await open({ directory: true, multiple: false });
            if (selected) setScanPath(selected as string);
          }}
        >
          <FolderOpen size={13} strokeWidth={1.5} />
          选择
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleScan}
          disabled={scanning || !scanPath.trim()}
        >
          {scanning ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" /> : <Search size={13} strokeWidth={1.5} />}
          {scanning ? "扫描中..." : "扫描"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2 mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              共 {results.length} 个文件夹，{results.filter((r) => r.matched).length} 个已匹配
            </span>
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                const matched = results.filter((r) => r.matched);
                for (const folder of matched) {
                  try { await folderApi.importFromFolder(folder); } catch {}
                }
                setResults([]);
                useProjectStore.getState().fetchProjects();
                addToast({ type: "success", title: "批量导入完成", message: `已导入 ${matched.length} 个项目` });
              }}
            >
              全部导入（已匹配）
            </button>
          </div>
          {results.map((folder) => (
            <div
              key={folder.path}
              className="card flex items-center gap-3 py-2"
            >
              {folder.matched ? (
                <CheckCircle2 size={14} strokeWidth={1.5} style={{ color: "#22c55e", flexShrink: 0 }} />
              ) : (
                <AlertCircle size={14} strokeWidth={1.5} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{folder.folder_name}</p>
                <p className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                  {folder.matched
                    ? `${folder.parsed_code} | ${folder.parsed_name} | ${folder.inferred_type}`
                    : folder.path}
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ border: "1px solid var(--border-default)" }}
                disabled={importing === folder.path}
                onClick={() => handleImport(folder)}
              >
                {importing === folder.path ? "导入中..." : "导入"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 项目配置标签 ──────────────────────────────────────────────

function ProjectConfigSection({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { settings, saveSettings } = useSettingsStore();
  const { addToast } = useNotificationStore();

  // 编号模板
  const [numberTemplate, setNumberTemplate] = useState(
    settings["number_template"] || DEFAULT_NUMBER_TEMPLATE
  );
  // 文件夹模板
  const [folderTemplate, setFolderTemplate] = useState(
    settings["folder_template"] || DEFAULT_FOLDER_TEMPLATE
  );
  // 日期格式
  const [dateFormat, setDateFormat] = useState(
    settings["date_format"] || "YYMMDD"
  );
  // 项目根目录
  const [projectRootPath, setProjectRootPath] = useState(
    settings["default_project_path"] || ""
  );

  // 项目分类
  const [types, setTypes] = useState<ProjectTypeConfig[]>(() => {
    try {
      const raw = settings["project_types"];
      return raw ? JSON.parse(raw) : DEFAULT_PROJECT_TYPES;
    } catch {
      return DEFAULT_PROJECT_TYPES;
    }
  });

  // 项目状态
  const [statuses, setStatuses] = useState<ProjectStatusConfig[]>(() => {
    try {
      const raw = settings["project_statuses"];
      return raw ? JSON.parse(raw) : DEFAULT_PROJECT_STATUSES;
    } catch {
      return DEFAULT_PROJECT_STATUSES;
    }
  });

  // 表格列
  const [columns, setColumns] = useState<ProjectTableColumn[]>(() => {
    try {
      const raw = settings["project_table_columns"];
      return raw ? JSON.parse(raw) : DEFAULT_PROJECT_TABLE_COLUMNS;
    } catch {
      return DEFAULT_PROJECT_TABLE_COLUMNS;
    }
  });

  const [dirty, setDirty] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypePrefix, setNewTypePrefix] = useState("");

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleSave = async () => {
    await saveSettings({
      number_template: numberTemplate,
      folder_template: folderTemplate,
      date_format: dateFormat,
      default_project_path: projectRootPath,
      project_types: JSON.stringify(types),
      project_statuses: JSON.stringify(statuses),
      project_table_columns: JSON.stringify(columns),
    });
    setDirty(false);
    addToast({ type: "success", title: "项目配置已保存", message: "" });
  };

  const handleReset = () => {
    setNumberTemplate(DEFAULT_NUMBER_TEMPLATE);
    setFolderTemplate(DEFAULT_FOLDER_TEMPLATE);
    setDateFormat("YYMMDD");
    setProjectRootPath("");
    setTypes([...DEFAULT_PROJECT_TYPES]);
    setStatuses([...DEFAULT_PROJECT_STATUSES]);
    setColumns([...DEFAULT_PROJECT_TABLE_COLUMNS]);
    setDirty(true);
  };

  const addType = () => {
    if (!newTypeName.trim()) return;
    setTypes((prev) => [
      ...prev,
      { id: newTypeName.trim(), name: newTypeName.trim(), prefix: newTypePrefix.trim() || newTypeName.trim().slice(0, 2), keywords: [] },
    ]);
    setNewTypeName("");
    setNewTypePrefix("");
    setDirty(true);
  };

  const removeType = (id: string) => {
    setTypes((prev) => prev.filter((t) => t.id !== id));
    setDirty(true);
  };

  const updateTypePrefix = (id: string, prefix: string) => {
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, prefix } : t)));
    setDirty(true);
  };

  const updateTypeKeywords = (id: string, keywordsStr: string) => {
    const keywords = keywordsStr.split(",").map((k) => k.trim()).filter(Boolean);
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, keywords } : t)));
    setDirty(true);
  };

  const toggleColumn = (key: string) => {
    setColumns((prev) =>
      prev.map((c) =>
        c.key === key && !c.fixed ? { ...c, visible: !c.visible } : c
      )
    );
    setDirty(true);
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
  };

  return (
    <section className="animate-slide-up space-y-6">
      {/* 保存/重置 */}
      <div className="flex items-center justify-between">
        <h2 className="text-title" style={{ color: "var(--text-primary)" }}>
          项目配置
        </h2>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={handleReset}>
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
      <div>
        <h2 className="text-title mb-2" style={{ color: "var(--text-primary)" }}>
          编号模板
        </h2>
        <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
          支持变量：{"{prefix}"}（项目分类前缀）、{"{date}"}（日期）、{"{sequence}"}（当日序号）
        </p>
        <div className="flex items-center gap-3 mb-3">
          <input
            type="text"
            value={numberTemplate}
            onChange={(e) => { setNumberTemplate(e.target.value); setDirty(true); }}
            className="flex-1 px-3 py-2 text-sm font-mono rounded-md outline-none"
            style={inputStyle}
          />
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: "var(--text-muted)" }}>文件夹模板</label>
            <input
              type="text"
              value={folderTemplate}
              onChange={(e) => { setFolderTemplate(e.target.value); setDirty(true); }}
              className="w-64 px-3 py-1.5 text-sm font-mono rounded-md outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: "var(--text-muted)" }}>日期格式</label>
            <select
              value={dateFormat}
              onChange={(e) => { setDateFormat(e.target.value); setDirty(true); }}
              className="px-3 py-1.5 text-sm rounded-md outline-none"
              style={inputStyle}
            >
              <option value="YYMMDD">YYMMDD（如 260506）</option>
              <option value="YYYYMMDD">YYYYMMDD（如 20260506）</option>
            </select>
          </div>
        </div>

        {/* 项目根目录 */}
        <div className="mt-3">
          <label className="text-[11px] mb-1 block" style={{ color: "var(--text-muted)" }}>项目根目录</label>
          <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
            新建项目时在此目录下自动创建项目文件夹。留空则不自动创建。
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={projectRootPath}
              onChange={(e) => { setProjectRootPath(e.target.value); setDirty(true); }}
              placeholder="例如 D:\Projects"
              className="flex-1 px-3 py-1.5 text-sm font-mono rounded-md outline-none"
              style={inputStyle}
            />
            <button
              className="btn btn-ghost btn-sm"
              style={{ border: "1px solid var(--border-default)" }}
              onClick={async () => {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const selected = await open({ directory: true, multiple: false });
                if (selected) { setProjectRootPath(selected as string); setDirty(true); }
              }}
            >
              <FolderOpen size={13} strokeWidth={1.5} />
              选择
            </button>
          </div>
        </div>
      </div>

      {/* 项目分类管理 */}
      <div>
        <h2 className="text-title mb-3" style={{ color: "var(--text-primary)" }}>
          项目分类
        </h2>
        <div className="space-y-2 mb-3">
          {types.map((t) => (
            <div key={t.id} className="card flex items-center gap-3 py-2">
              <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                {t.name}
              </span>
              <div className="flex items-center gap-2">
                <label className="text-[11px]" style={{ color: "var(--text-muted)" }}>前缀</label>
                <input
                  type="text"
                  value={t.prefix}
                  onChange={(e) => updateTypePrefix(t.id, e.target.value)}
                  className="w-20 px-2 py-1 text-xs font-mono rounded outline-none text-center"
                  style={inputStyle}
                />
              </div>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={(t.keywords || []).join(", ")}
                  onChange={(e) => updateTypeKeywords(t.id, e.target.value)}
                  placeholder="关键词（逗号分隔）"
                  className="w-full px-2 py-1 text-xs rounded outline-none"
                  style={inputStyle}
                />
              </div>
              <button
                onClick={() => removeType(t.id)}
                className="p-1 rounded hover:bg-red-50"
                style={{ color: "var(--color-danger)", cursor: "pointer", background: "none", border: "none" }}
              >
                <Trash2 size={13} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="分类名称"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            className="w-40 px-3 py-1.5 text-sm rounded-md outline-none"
            style={inputStyle}
            onKeyDown={(e) => e.key === "Enter" && addType()}
          />
          <input
            type="text"
            placeholder="前缀"
            value={newTypePrefix}
            onChange={(e) => setNewTypePrefix(e.target.value)}
            className="w-24 px-3 py-1.5 text-sm rounded-md outline-none"
            style={inputStyle}
            onKeyDown={(e) => e.key === "Enter" && addType()}
          />
          <button className="btn btn-primary btn-sm" onClick={addType}>
            <Plus size={13} strokeWidth={1.5} />
            添加
          </button>
        </div>
      </div>

      {/* 项目状态管理 */}
      <div>
        <h2 className="text-title mb-3" style={{ color: "var(--text-primary)" }}>
          项目状态
        </h2>
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
              style={{
                background: `${s.color}18`,
                border: `1px solid ${s.color}30`,
                color: s.color,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.name}
            </div>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          项目状态暂不支持在线编辑，如需修改请直接编辑设置表中的 project_statuses 键值。
        </p>
      </div>

      {/* 表格列显示 */}
      <div>
        <h2 className="text-title mb-3" style={{ color: "var(--text-primary)" }}>
          项目列表显示列
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 py-1.5 px-2 rounded text-xs cursor-pointer transition-colors"
              style={{
                color: col.fixed ? "var(--text-muted)" : "var(--text-primary)",
                opacity: col.fixed ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={col.visible || col.fixed}
                disabled={col.fixed}
                onChange={() => toggleColumn(col.key)}
                className="accent-[var(--gold)]"
              />
              {col.label}
              {col.fixed && (
                <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
                  固定
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 设置页面主组件 ────────────────────────────────────────────

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const validTabs: TabKey[] = ["profile", "appearance", "notifications", "project", "shortcuts", "data"];
  const initialTab = validTabs.includes(searchParams.get("tab") as TabKey) ? (searchParams.get("tab") as TabKey) : "appearance";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [dirtyTabs, setDirtyTabs] = useState<Record<TabKey, boolean>>({
    profile: false, appearance: false, notifications: false,
    project: false, shortcuts: false, data: false,
  });
  const { fetchShortcuts } = useSettingsStore();

  const handleTabChange = (key: TabKey) => {
    if (dirtyTabs[activeTab]) {
      if (!window.confirm("当前页有未保存的修改，是否放弃修改并切换？")) return;
    }
    setActiveTab(key);
  };

  const handleDirtyChange = (tab: TabKey, dirty: boolean) => {
    setDirtyTabs((prev) => ({ ...prev, [tab]: dirty }));
  };

  useEffect(() => {
    fetchShortcuts();
  }, [fetchShortcuts]);

  return (
    <div className="p-8 max-w-2xl">
      <h1
        className="text-headline mb-6"
        style={{ color: "var(--text-primary)" }}
      >
        设置
      </h1>

      {/* 标签栏 */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-lg"
        style={{ background: "var(--bg-surface-alt)" }}
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs transition-all flex-1 justify-center"
            style={{
              background:
                activeTab === key ? "var(--bg-elevated)" : "transparent",
              color:
                activeTab === key ? "var(--gold)" : "var(--text-tertiary)",
              boxShadow:
                activeTab === key ? "var(--shadow-sm)" : "none",
              cursor: "pointer",
              border: "none",
            }}
          >
            <Icon size={14} strokeWidth={1.5} />
            {label}
            {dirtyTabs[key] && (
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--gold)" }} />
            )}
          </button>
        ))}
      </div>

      {/* 标签内容 */}
      {activeTab === "profile" && <ProfileSection onDirtyChange={(d) => handleDirtyChange("profile", d)} />}
      {activeTab === "appearance" && <AppearanceSection />}
      {activeTab === "notifications" && <NotificationSection onDirtyChange={(d) => handleDirtyChange("notifications", d)} />}
      {activeTab === "project" && <ProjectConfigSection onDirtyChange={(d) => handleDirtyChange("project", d)} />}
      {activeTab === "shortcuts" && <ShortcutsSection onDirtyChange={(d) => handleDirtyChange("shortcuts", d)} />}
      {activeTab === "data" && <DataSection />}
    </div>
  );
}
