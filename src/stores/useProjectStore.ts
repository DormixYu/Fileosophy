import { create } from "zustand";
import type { Project, CreateProjectData, UpdateProjectData } from "@/types";
import { projectApi } from "@/lib/tauri-api";

interface ProjectStore {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  error: string | null;

  fetchProjects: () => Promise<void>;
  fetchProjectById: (id: number) => Promise<void>;
  createProject: (data: CreateProjectData) => Promise<Project>;
  updateProject: (id: number, data: UpdateProjectData) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
  clearCurrentProject: () => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await projectApi.getAll();
      set({ projects, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchProjectById: async (id: number) => {
    set({ loading: true, error: null });
    try {
      const project = await projectApi.getById(id);
      set({ currentProject: project, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createProject: async (data: CreateProjectData) => {
    set({ loading: true, error: null });
    try {
      const project = await projectApi.create(data);
      set({ projects: [...get().projects, project], loading: false });
      return project;
    } catch (e) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },

  updateProject: async (id: number, data: UpdateProjectData) => {
    set({ loading: true, error: null });
    try {
      const updated = await projectApi.update(id, data);
      set({
        projects: get().projects.map((p) => (p.id === id ? updated : p)),
        currentProject:
          get().currentProject?.id === id ? updated : get().currentProject,
        loading: false,
      });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  deleteProject: async (id: number) => {
    set({ loading: true, error: null });
    try {
      await projectApi.delete(id);
      set({
        projects: get().projects.filter((p) => p.id !== id),
        currentProject:
          get().currentProject?.id === id ? null : get().currentProject,
        loading: false,
      });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  clearCurrentProject: () => set({ currentProject: null }),
}));
