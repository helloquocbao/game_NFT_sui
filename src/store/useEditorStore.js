import { create } from 'zustand';

/**
 * Store quản lý state cho Editor
 * Có thể mở rộng để lưu map data, settings, etc.
 */
export const useEditorStore = create((set) => ({
  // Map data có thể được lưu ở đây nếu cần share giữa các component
  currentMapData: null,
  setCurrentMapData: (data) => set({ currentMapData: data }),

  // Settings
  settings: {
    autoSave: false,
    showGrid: true,
  },
  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),

  // Reset store
  reset: () =>
    set({
      currentMapData: null,
      settings: {
        autoSave: false,
        showGrid: true,
      },
    }),
}));

