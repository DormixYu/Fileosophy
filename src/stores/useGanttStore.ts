import { create } from "zustand";
import type {
  GanttTask,
  CreateGanttTaskData,
  UpdateGanttTaskData,
} from "@/types";
import { ganttApi } from "@/lib/tauri-api";

interface GanttStore {
  tasks: GanttTask[];
  loading: boolean;
  error: string | null;

  fetchTasks: (projectId: number) => Promise<void>;
  addTask: (data: CreateGanttTaskData) => Promise<void>;
  updateTask: (id: number, data: UpdateGanttTaskData) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
}

export const useGanttStore = create<GanttStore>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,

  fetchTasks: async (projectId: number) => {
    set({ loading: true, error: null });
    try {
      const tasks = await ganttApi.getData(projectId);
      set({ tasks, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  addTask: async (data: CreateGanttTaskData) => {
    try {
      const task = await ganttApi.addTask(data);
      set({ tasks: [...get().tasks, task] });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  updateTask: async (id: number, data: UpdateGanttTaskData) => {
    try {
      const updated = await ganttApi.updateTask(id, data);
      set({ tasks: get().tasks.map((t) => (t.id === id ? updated : t)) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteTask: async (id: number) => {
    try {
      await ganttApi.deleteTask(id);
      set({ tasks: get().tasks.filter((t) => t.id !== id) });
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));
