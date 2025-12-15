import { create } from "zustand";

export const useDungeonStore = create((set, get) => ({
  dungeons: [],
  loading: false,
  error: null,
  setDungeons: (list) => set({ dungeons: list }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  getById: (id) => get().dungeons.find((d) => d.id === id),
}));

