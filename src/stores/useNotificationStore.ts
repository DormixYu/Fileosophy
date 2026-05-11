import { create } from "zustand";
import type { Notification, NotificationPreferences } from "@/types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/types";
import { notificationHistoryApi } from "@/lib/tauri-api";

export interface ToastItem {
  id: string;
  type: "info" | "success" | "warning" | "error" | "file-received";
  title: string;
  message: string;
  createdAt: number;
  link?: string;
}

// 通知类型到偏好 key 的映射
const TYPE_TO_PREF: Record<string, keyof NotificationPreferences> = {
  "项目已创建": "project_created",
  "项目已删除": "project_deleted",
  "项目状态变更": "project_status_changed",
  "新卡片": "card_created",
  "卡片移动": "card_moved",
  "文件已上传": "file_uploaded",
  "文件已删除": "file_deleted",
  "收到文件": "file_received",
  "文件已接收": "file_received",
  "共享已开启": "share_started",
  "共享已停止": "share_stopped",
};

interface NotificationState {
  toasts: ToastItem[];
  history: Notification[];
  historyLoading: boolean;
  unreadCount: number;
  preferences: NotificationPreferences;
  preferencesLoaded: boolean;

  addToast: (toast: Omit<ToastItem, "id" | "createdAt"> & { link?: string }) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;

  fetchHistory: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearHistory: () => Promise<void>;

  fetchPreferences: () => Promise<void>;
  savePreferences: (prefs: NotificationPreferences) => Promise<void>;
}

let nextId = 0;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  toasts: [],
  history: [],
  historyLoading: false,
  unreadCount: 0,
  preferences: DEFAULT_NOTIFICATION_PREFERENCES,
  preferencesLoaded: false,

  addToast: (toast) => {
    const { preferences, preferencesLoaded } = get();

    // 检查偏好设置：若该类型被禁用则不弹 toast（但仍持久化）
    const prefKey = TYPE_TO_PREF[toast.title];
    const shouldShow = !preferencesLoaded || !prefKey || preferences[prefKey];

    const id = `toast-${Date.now()}-${++nextId}`;

    if (shouldShow) {
      const newToast: ToastItem = {
        ...toast,
        id,
        createdAt: Date.now(),
      };

      set((state) => ({
        toasts: [...state.toasts, newToast].slice(-5),
      }));

      // 5 秒后自动移除
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, 5000);
    }

    // 持久化到后端（无论偏好如何都保存到历史）
    notificationHistoryApi
      .add({
        id,
        type: toast.type,
        title: toast.title,
        message: toast.message,
        link: toast.link,
      })
      .catch((e) => console.error("Failed to persist notification:", e));
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearAll: () => set({ toasts: [] }),

  fetchHistory: async () => {
    set({ historyLoading: true });
    try {
      const list = await notificationHistoryApi.getAll();
      const unread = list.filter((n) => !n.read).length;
      set({ history: list.reverse(), historyLoading: false, unreadCount: unread });
    } catch (e) {
      console.error("Failed to fetch notification history:", e);
      set({ historyLoading: false });
    }
  },

  markRead: async (id: string) => {
    try {
      await notificationHistoryApi.markRead(id);
      set((state) => ({
        history: state.history.map((n) => (n.id === id ? { ...n, read: true } : n)),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (e) {
      console.error("Failed to mark read:", e);
    }
  },

  markAllRead: async () => {
    try {
      await notificationHistoryApi.markAllRead();
      set((state) => ({
        history: state.history.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (e) {
      console.error("Failed to mark all read:", e);
    }
  },

  clearHistory: async () => {
    try {
      await notificationHistoryApi.clearAll();
      set({ history: [], unreadCount: 0 });
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
  },

  fetchPreferences: async () => {
    try {
      const prefs = await notificationHistoryApi.getPreferences() as unknown as NotificationPreferences;
      set({ preferences: prefs, preferencesLoaded: true });
    } catch {
      set({ preferences: DEFAULT_NOTIFICATION_PREFERENCES, preferencesLoaded: true });
    }
  },

  savePreferences: async (prefs: NotificationPreferences) => {
    try {
      await notificationHistoryApi.updatePreferences(prefs as unknown as Record<string, boolean>);
      set({ preferences: prefs });
    } catch (e) {
      console.error("Failed to save preferences:", e);
    }
  },
}));
