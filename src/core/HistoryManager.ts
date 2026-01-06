import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { CommandHistory } from '../types/index.js';

export class HistoryManager {
  private historyFile: string;
  private history: CommandHistory[] = [];
  private maxHistorySize = 100;

  constructor() {
    this.historyFile = path.join(os.homedir(), '.termai_history');
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.historyFile, 'utf-8');
      this.history = JSON.parse(data).map((h: CommandHistory) => ({
        ...h,
        timestamp: new Date(h.timestamp),
      }));
    } catch (err) {
      // File doesn't exist or is invalid, start with empty history
      this.history = [];
    }
  }

  async save(): Promise<void> {
    try {
      await fs.writeFile(this.historyFile, JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save history:', err);
    }
  }

  add(command: string, isAI: boolean): void {
    this.history.push({
      command,
      timestamp: new Date(),
      isAI,
    });

    // Keep only the last maxHistorySize entries
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  getHistory(): CommandHistory[] {
    return [...this.history];
  }

  getRecentAICommands(limit: number = 10): CommandHistory[] {
    return this.history
      .filter((h) => h.isAI)
      .slice(-limit)
      .reverse();
  }
}
