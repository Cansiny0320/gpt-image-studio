import { create } from 'zustand';
import { defaultSettings, withoutIntermediatePreviews, type Settings } from './contract';
export const useStudio = create<{
  settings: Settings;
  update: (value: Partial<Settings>) => void;
  restore: (value: Settings) => void;
}>((set) => ({
  settings: { ...defaultSettings },
  update: (value) =>
    set((state) => ({ settings: withoutIntermediatePreviews({ ...state.settings, ...value }) })),
  restore: (settings) => set({ settings: withoutIntermediatePreviews(settings) }),
}));
