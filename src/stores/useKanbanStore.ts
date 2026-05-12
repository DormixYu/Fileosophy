import { create } from "zustand";
import type {
  KanbanBoard,
  CreateColumnData,
  CreateCardData,
  UpdateCardData,
} from "@/types";
import { kanbanApi } from "@/lib/tauri-api";

interface KanbanStore {
  board: KanbanBoard | null;
  loading: boolean;
  error: string | null;

  fetchBoard: (projectId: number) => Promise<void>;
  addColumn: (data: CreateColumnData) => Promise<void>;
  moveCard: (
    cardId: number,
    targetColumnId: number,
    position: number,
    projectId: number
  ) => Promise<void>;
  createCard: (data: CreateCardData) => Promise<void>;
  updateCard: (cardId: number, data: UpdateCardData) => Promise<void>;
  updateColumn: (columnId: number, title: string) => Promise<void>;
  deleteColumn: (columnId: number) => Promise<void>;
  deleteCard: (cardId: number) => Promise<void>;
}

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  board: null,
  loading: false,
  error: null,

  fetchBoard: async (projectId: number) => {
    set({ loading: true, error: null });
    try {
      const board = await kanbanApi.getBoard(projectId);
      set({ board, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  addColumn: async (data: CreateColumnData) => {
    try {
      const column = await kanbanApi.addColumn(data);
      const board = get().board;
      if (board) {
        set({ board: { columns: [...board.columns, column] } });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  moveCard: async (
    cardId: number,
    targetColumnId: number,
    position: number,
    projectId: number
  ) => {
    try {
      await kanbanApi.moveCard(cardId, targetColumnId, position);
      const updated = await kanbanApi.getBoard(projectId);
      set({ board: updated });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  createCard: async (data: CreateCardData) => {
    try {
      const card = await kanbanApi.createCard(data);
      const board = get().board;
      if (board) {
        const columns = board.columns.map((col) =>
          col.id === data.column_id
            ? { ...col, cards: [...(col.cards ?? []), card] }
            : col
        );
        set({ board: { columns } });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  updateCard: async (cardId: number, data: UpdateCardData) => {
    try {
      const updated = await kanbanApi.updateCard(cardId, data);
      const board = get().board;
      if (board) {
        const columns = board.columns.map((col) => ({
          ...col,
          cards: (col.cards ?? []).map((c) => (c.id === cardId ? updated : c)),
        }));
        set({ board: { columns } });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  updateColumn: async (columnId: number, title: string) => {
    try {
      const updated = await kanbanApi.updateColumn(columnId, title);
      const board = get().board;
      if (board) {
        const columns = board.columns.map((col) =>
          col.id === columnId ? { ...updated, cards: col.cards } : col,
        );
        set({ board: { columns } });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteColumn: async (columnId: number) => {
    try {
      await kanbanApi.deleteColumn(columnId);
      const board = get().board;
      if (board) {
        set({
          board: { columns: board.columns.filter((c) => c.id !== columnId) },
        });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteCard: async (cardId: number) => {
    try {
      await kanbanApi.deleteCard(cardId);
      const board = get().board;
      if (board) {
        const columns = board.columns.map((col) => ({
          ...col,
          cards: (col.cards ?? []).filter((c) => c.id !== cardId),
        }));
        set({ board: { columns } });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));
