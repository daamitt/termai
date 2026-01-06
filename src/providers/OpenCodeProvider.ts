import { AIProvider, ProviderOptions } from './AIProvider.js';
import { OpenCodeServer } from '../core/OpenCodeServer.js';

export class OpenCodeProvider implements AIProvider {
  private server: OpenCodeServer;
  private attachUrl: string = '';

  constructor(options: ProviderOptions) {
    const port = options.port || 4096;
    this.server = new OpenCodeServer(port);
  }

  async initialize(): Promise<void> {
    await this.server.start();
    this.attachUrl = this.server.getAttachUrl();
  }

  async shutdown(): Promise<void> {
    await this.server.stop();
  }

  isReady(): boolean {
    return this.server.isRunning();
  }

  getName(): string {
    return 'opencode';
  }

  buildCommand(prompt: string): string {
    // Escape single quotes in prompt
    const safePrompt = prompt.replace(/'/g, "'\\''");
    return `opencode run --attach ${this.attachUrl} '${safePrompt}'`;
  }

  supportsNativePiping(): boolean {
    return false;
  }
}
