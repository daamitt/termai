export interface TermaiOptions {
  shell?: string;
  port?: string;
  cli?: 'claude' | 'opencode';
  debug?: boolean;
  showCommand?: boolean;
  noSidebar?: boolean;
}

export interface CommandHistory {
  command: string;
  timestamp: Date;
  isAI: boolean;
}
