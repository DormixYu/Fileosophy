import { create } from "zustand";
import type { Notification, NotificationPreferences } from "@/types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/types";
import { notificationHistoryApi } from "@/lib/tauri-api";
import { listen } from "@tauri-apps/api/event";
import type { NotificationPayload, FileSharedPayload } from "@/types";

interface NotificationState {
  history: Notification[];
  historyLoading: boolean;
  unreadCount: number;
  preferences: NotificationPreferences;
  preferencesLoaded: boolean;
  listenersReady: boolean;

  addToast: (notif: { type: string; title: string; message: string; link?: string }) => void;

  fetchHistory: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearHistory: () => Promise<void>;

  fetchPreferences: () => Promise<void>;
  savePreferences: (prefs: NotificationPreferences) => Promise<void>;
  setupListeners: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  history: [],
  historyLoading: false,
  unreadCount: 0,
  preferences: DEFAULT_NOTIFICATION_PREFERENCES,
  preferencesLoaded: false,
  listenersReady: false,

  // 添加通知（写入历史 + 增加 unreadCount，不弹 Toast）
  addToast: (notif) => {
    const now = new Date().toISOString();
    const record = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      link: notif.link,
      read: false,
      created_at: now,
    };

    // 立即加入本地 history
    set((state) => ({
      history: [record, ...state.history],
      unreadCount: state.unreadCount + 1,
    }));

    // 持久化到后端（异步，不影响本地显示）
    notificationHistoryApi
      .add({
        id: record.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        link: notif.link,
      })
      .catch((e) => console.error("Failed to persist notification:", e));
  },

  fetchHistory: async () => {
    set({ historyLoading: true });
    try {
      const list = await notificationHistoryApi.getAll();
      const reversed = list.reverse();
      const backendIds = new Set(reversed.map((n) => n.id));
      const localOnly = get().history.filter((n) => !backendIds.has(n.id));
      const unread = reversed.filter((n) => !n.read).length + localOnly.filter((n) => !n.read).length;
      set({ history: [...localOnly, ...reversed], historyLoading: false, unreadCount: unread });
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

  // 设置后端事件监听（替代 ToastContainer 的监听逻辑）
  setupListeners: () => {
    if (get().listenersReady) return;

    listen<NotificationPayload>("app-notification", (event) => {
      const { addToast } = get();
      addToast({
        type: event.payload.type || "info",
        title: event.payload.title,
        message: event.payload.message,
        link: event.payload.link,
      });
    }).catch((e) => console.error("Failed to listen app-notification:", e));

    listen<FileSharedPayload>("file-shared", (event) => {
      const { addToast } = get();
      if (event.payload.status === "sent") {
        addToast({
          type: "success",
          title: "文件已发送",
          message: `已发送 "${event.payload.file_name}"`,
        });
      } else if (event.payload.status === "received") {
        addToast({
          type: "file-received",
          title: "收到文件",
          message: `来自 ${event.payload.peer_addr} 的文件已接收`,
        });
      }
    }).catch((e) => console.error("Failed to listen file-shared:", e));

    set({ listenersReady: true });
  },
}));