import { AIProvider, ProviderOptions } from './AIProvider.js';

export class ClaudeCodeProvider implements AIProvider {
  private sessionId?: string;
  private continueSession: boolean = false;

  constructor(options: ProviderOptions) {
    this.sessionId = options.sessionId;
  }

  async initialize(): Promise<void> {
    // Claude doesn't need initialization - direct execution
    // Could optionally check if 'claude' CLI exists here
  }

  async shutdown(): Promise<void> {
    // No server to shut down
  }

  isReady(): boolean {
    return true; // Always ready
  }

  getName(): string {
    return 'claude';
  }

  buildCommand(prompt: string): string {
    // Escape single quotes in prompt
    const safePrompt = prompt.replace(/'/g, "'\\''");

    let cmd = `claude -p '${safePrompt}'`;

    if (this.continueSession) {
      cmd = `claude -c -p '${safePrompt}'`;
    } else if (this.sessionId) {
      cmd = `claude -r '${this.sessionId}' -p '${safePrompt}'`;
    }

    return cmd;
  }

  enableContinueSession(): void {
    this.continueSession = true;
  }

  disableContinueSession(): void {
    this.continueSession = false;
  }

  supportsNativePiping(): boolean {
    return true;
  }
}
