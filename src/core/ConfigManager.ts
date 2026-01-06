import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { CLIType } from '../providers/ProviderDetector.js';

export interface TermaiConfig {
  preferredCLI?: CLIType;
  claudeSessionId?: string;
  openCodePort?: number;
}

export class ConfigManager {
  private configFile: string;
  private config: TermaiConfig = {};

  constructor() {
    this.configFile = path.join(os.homedir(), '.termai_config');
  }

  async load(): Promise<TermaiConfig> {
    try {
      const data = await fs.readFile(this.configFile, 'utf-8');
      this.config = JSON.parse(data);
    } catch (err) {
      // File doesn't exist, use defaults
      this.config = {};
    }
    return this.config;
  }

  async save(): Promise<void> {
    try {
      await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  setPreferredCLI(cli: CLIType): void {
    this.config.preferredCLI = cli;
  }

  getPreferredCLI(): CLIType | undefined {
    return this.config.preferredCLI;
  }

  setClaudeSession(sessionId: string): void {
    this.config.claudeSessionId = sessionId;
  }

  getClaudeSession(): string | undefined {
    return this.config.claudeSessionId;
  }

  setOpenCodePort(port: number): void {
    this.config.openCodePort = port;
  }

  getOpenCodePort(): number | undefined {
    return this.config.openCodePort;
  }

  getConfig(): TermaiConfig {
    return { ...this.config };
  }
}
