import { create } from "zustand";
import type { AppSettings, ShortcutConfig, ProjectStatusConfig, ProjectTypeConfig, ProjectTableColumn } from "@/types";
import { DEFAULT_SHORTCUTS, DEFAULT_PROJECT_STATUSES, DEFAULT_PROJECT_TYPES, DEFAULT_PROJECT_TABLE_COLUMNS } from "@/types";
import { settingsApi, shortcutApi } from "@/lib/tauri-api";

// 快捷键配置在 settings 表中的 key
const SHORTCUTS_KEY = "shortcuts";

function parseJSON<T>(raw: string | undefined, defaults: T): T {
  try { return raw ? JSON.parse(raw) : defaults; }
  catch { return defaults; }
}

interface SettingsStore {
  settings: AppSettings;
  shortcuts: ShortcutConfig[];
  loading: boolean;
  error: string | null;
  parsedStatuses: ProjectStatusConfig[];
  parsedTypes: ProjectTypeConfig[];
  parsedColumns: ProjectTableColumn[];

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
  parsedStatuses: DEFAULT_PROJECT_STATUSES,
  parsedTypes: DEFAULT_PROJECT_TYPES,
  parsedColumns: DEFAULT_PROJECT_TABLE_COLUMNS,

  // ── 设置 ─────────────────────────────────────────────────────

  fetchSettings: async () => {
    set({ loading: true, error: null });
    try {
      const settings = await settingsApi.get();
      set({
        settings,
        loading: false,
        parsedStatuses: parseJSON(settings["project_statuses"], DEFAULT_PROJECT_STATUSES),
        parsedTypes: parseJSON(settings["project_types"], DEFAULT_PROJECT_TYPES),
        parsedColumns: parseJSON(settings["project_table_columns"], DEFAULT_PROJECT_TABLE_COLUMNS),
      });
      applyTheme(settings.theme);
    } catch {
      set({ loading: false });
    }
  },

  updateSettings: async (settings: AppSettings) => {
    set({ loading: true, error: null });
    try {
      const updated = await settingsApi.update(settings);
      set({
        settings: updated,
        loading: false,
        parsedStatuses: parseJSON(updated["project_statuses"], DEFAULT_PROJECT_STATUSES),
        parsedTypes: parseJSON(updated["project_types"], DEFAULT_PROJECT_TYPES),
        parsedColumns: parseJSON(updated["project_table_columns"], DEFAULT_PROJECT_TABLE_COLUMNS),
      });
      applyTheme(updated.theme);
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  setTheme: (theme: "light" | "dark" | "system") => {
    const prevTheme = get().settings.theme;
    set({ settings: { ...get().settings, theme } });
    applyTheme(theme);
    // 委托给 saveSettings 统一持久化路径，避免竞态覆盖
    get().saveSettings({ theme }).catch((e) => {
      // 回滚 theme 到之前值
      set({ settings: { ...get().settings, theme: prevTheme } });
      applyTheme(prevTheme);
      console.error("Failed to persist theme, rolled back:", e);
    });
  },

  saveSettings: async (partial: Record<string, string>) => {
    const current = get().settings;
    const updated: AppSettings = { ...current, ...partial };
    try {
      const result = await settingsApi.update(updated);
      set({
        settings: result,
        parsedStatuses: parseJSON(result["project_statuses"], DEFAULT_PROJECT_STATUSES),
        parsedTypes: parseJSON(result["project_types"], DEFAULT_PROJECT_TYPES),
        parsedColumns: parseJSON(result["project_table_columns"], DEFAULT_PROJECT_TABLE_COLUMNS),
      });
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
        await shortcutApi.register(sc.shortcut, () => {
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

  }));

// 保存 matchMedia change handler，以便切换主题时能移除旧监听
let systemThemeHandler: ((e: MediaQueryListEvent) => void) | null = null;

function applyTheme(theme: string) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");

  // 移除之前的系统主题监听器
  if (systemThemeHandler) {
    window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", systemThemeHandler);
    systemThemeHandler = null;
  }

  if (theme === "system") {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    root.classList.add(mql.matches ? "dark" : "light");
    // 监听系统主题变化，自动切换
    const handler = (e: MediaQueryListEvent) => {
      root.classList.remove("light", "dark");
      root.classList.add(e.matches ? "dark" : "light");
    };
    mql.addEventListener("change", handler);
    systemThemeHandler = handler;
  } else {
    root.classList.add(theme);
  }
}
