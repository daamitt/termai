import { create } from 'zustand';
import type { CommandHistory } from '../types/index.js';

interface AppState {
  commandHistory: CommandHistory[];
  serverStatus: 'starting' | 'running' | 'stopped' | 'error';

  addToHistory: (command: string, isAI: boolean) => void;
  setServerStatus: (status: 'starting' | 'running' | 'stopped' | 'error') => void;
  setCommandHistory: (history: CommandHistory[]) => void;
}

export const useStore = create<AppState>((set) => ({
  commandHistory: [],
  serverStatus: 'starting',

  addToHistory: (command, isAI) =>
    set((state) => ({
      commandHistory: [
        ...state.commandHistory,
        {
          command,
          timestamp: new Date(),
          isAI,
        },
      ].slice(-50), // Keep last 50
    })),

  setServerStatus: (status) => set({ serverStatus: status }),

  setCommandHistory: (history) => set({ commandHistory: history }),
}));
