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
  prefKey?: keyof NotificationPreferences;
}

// 通知类型到偏好 key 的默认映射（仅在调用方未指定 prefKey 时使用）
const TYPE_TO_PREF: Record<string, keyof NotificationPreferences> = {
  "info": "project_status_changed",
  "success": "project_created",
  "warning": "project_deleted",
  "error": "project_deleted",
  "file-received": "file_received",
};

interface NotificationState {
  toasts: ToastItem[];
  history: Notification[];
  historyLoading: boolean;
  unreadCount: number;
  preferences: NotificationPreferences;
  preferencesLoaded: boolean;

  addToast: (toast: Omit<ToastItem, "id" | "createdAt"> & { link?: string; prefKey?: keyof NotificationPreferences }) => void;
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
    const { preferences } = get();

    // 优先使用调用方指定的 prefKey，否则从 type 映射
    const prefKey = toast.prefKey || TYPE_TO_PREF[toast.type];

    // 若有 prefKey 且偏好关闭，则不弹 Toast
    const shouldShow = !prefKey || preferences[prefKey];

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

    // 持久化到后端历史（偏好关闭时仍记录，除非 prefKey 存在且偏好关闭）
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
