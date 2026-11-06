import { create } from 'zustand';
import { defaultSettings, type Settings } from './contract';
export const useStudio = create<{
  settings: Settings;
  update: (value: Partial<Settings>) => void;
  restore: (value: Settings) => void;
}>((set) => ({
  settings: { ...defaultSettings },
  update: (value) => set((state) => ({ settings: { ...state.settings, ...value } })),
  restore: (settings) => set({ settings }),
}));
