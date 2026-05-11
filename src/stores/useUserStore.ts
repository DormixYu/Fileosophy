import { create } from "zustand";
import type { User } from "@/types";
import { userApi } from "@/lib/tauri-api";

interface UserStore {
  user: User | null;
  loading: boolean;

  fetchUser: () => Promise<void>;
  saveUser: (name: string, avatarPath?: string | null) => Promise<void>;
  uploadAvatar: (imageData: string) => Promise<string>;
}

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  loading: false,

  fetchUser: async () => {
    set({ loading: true });
    try {
      const user = await userApi.getCurrent();
      set({ user, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  saveUser: async (name: string, avatarPath?: string | null) => {
    set({ loading: true });
    try {
      const user = await userApi.createOrUpdate(name, avatarPath);
      set({ user, loading: false });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  uploadAvatar: async (imageData: string) => {
    const path = await userApi.uploadAvatar(imageData);
    // 刷新用户信息以获取新头像路径
    const user = await userApi.getCurrent();
    if (user) set({ user });
    return path;
  },
}));
