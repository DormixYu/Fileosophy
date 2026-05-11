import { create } from "zustand";
import type { AppSettings, ShortcutConfig } from "@/types";
import { DEFAULT_SHORTCUTS } from "@/types";
import { settingsApi, shortcutApi, notificationApi } from "@/lib/tauri-api";

// 快捷键配置在 settings 表中的 key
const SHORTCUTS_KEY = "shortcuts";

interface SettingsStore {
  settings: AppSettings;
  shortcuts: ShortcutConfig[];
  loading: boolean;
  error: string | null;

  // 设置
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  saveSettings: (partial: Record<string, string>) => Promise<void>;
  setTheme: (theme: "light" | "dark" | "system") => void;

  // 快捷键
  fetchShortcuts: () => Promise<void>;
  saveShortcuts: (shortcuts: ShortcutConfig[]) => Promise<void>;
  registerAllShortcuts: () => Promise<void>;
  unregisterAllShortcuts: () => Promise<void>;

  // 通知
  requestNotificationPermission: () => Promise<boolean>;
  sendNativeNotification: (title: string, body: string) => Promise<void>;
}

const defaultSettings: AppSettings = {
  theme: "system",
  language: "zh-CN",
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: defaultSettings,
  shortcuts: DEFAULT_SHORTCUTS,
  loading: false,
  error: null,

  // ── 设置 ─────────────────────────────────────────────────────

  fetchSettings: async () => {
    set({ loading: true, error: null });
    try {
      const settings = await settingsApi.get();
      set({ settings, loading: false });
      applyTheme(settings.theme);
    } catch {
      set({ loading: false });
    }
  },

  updateSettings: async (settings: AppSettings) => {
    set({ loading: true, error: null });
    try {
      const updated = await settingsApi.update(settings);
      set({ settings: updated, loading: false });
      applyTheme(updated.theme);
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  setTheme: (theme: "light" | "dark" | "system") => {
    const current = get().settings;
    set({ settings: { ...current, theme } });
    applyTheme(theme);
  },

  saveSettings: async (partial: Record<string, string>) => {
    const current = get().settings;
    const updated: AppSettings = { ...current, ...partial };
    try {
      const result = await settingsApi.update(updated);
      set({ settings: result });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  // ── 快捷键 ──────────────────────────────────────────────────

  fetchShortcuts: async () => {
    try {
      const settings = await settingsApi.get();
      const raw = settings[SHORTCUTS_KEY];
      if (raw) {
        const parsed: ShortcutConfig[] = JSON.parse(raw);
        // 用默认值填充缺失的快捷键
        const merged = DEFAULT_SHORTCUTS.map((def) => {
          const saved = parsed.find((s) => s.action === def.action);
          return saved ? { ...def, shortcut: saved.shortcut } : def;
        });
        set({ shortcuts: merged });
      } else {
        set({ shortcuts: DEFAULT_SHORTCUTS });
      }
    } catch {
      set({ shortcuts: DEFAULT_SHORTCUTS });
    }
  },

  saveShortcuts: async (shortcuts: ShortcutConfig[]) => {
    try {
      const settings = get().settings;
      const updated: AppSettings = {
        ...settings,
        [SHORTCUTS_KEY]: JSON.stringify(shortcuts),
      };
      await settingsApi.update(updated);
      set({ settings: updated, shortcuts });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  registerAllShortcuts: async () => {
    const { shortcuts } = get();
    // 先注销所有
    await get().unregisterAllShortcuts();

    for (const sc of shortcuts) {
      if (!sc.shortcut) continue;
      try {
        await shortcutApi.register(sc.shortcut, (_event) => {
          // 快捷键触发时，通过自定义事件通知前端
          window.dispatchEvent(
            new CustomEvent("global-shortcut", { detail: sc.action })
          );
        });
      } catch (e) {
        console.warn(`快捷键注册失败 [${sc.label}]: ${e}`);
      }
    }
  },

  unregisterAllShortcuts: async () => {
    const { shortcuts } = get();
    for (const sc of shortcuts) {
      if (!sc.shortcut) continue;
      try {
        await shortcutApi.unregister(sc.shortcut);
      } catch {
        // 忽略未注册的快捷键
      }
    }
  },

  // ── 系统通知 ────────────────────────────────────────────────

  requestNotificationPermission: async () => {
    try {
      const granted = await notificationApi.isPermissionGranted();
      if (granted) return true;
      const result = await notificationApi.requestPermission();
      return result === "granted";
    } catch {
      return false;
    }
  },

  sendNativeNotification: async (title: string, body: string) => {
    try {
      await notificationApi.sendNotification({ title, body });
    } catch (e) {
      console.warn("系统通知发送失败:", e);
    }
  },
}));

function applyTheme(theme: string) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");

  if (theme === "system") {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    root.classList.add(prefersDark ? "dark" : "light");
  } else {
    root.classList.add(theme);
  }
}
