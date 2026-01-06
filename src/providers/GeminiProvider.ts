import { AIProvider, ProviderOptions } from './AIProvider.js';

export class GeminiProvider implements AIProvider {
  private sessionId?: string;
  private continueSession: boolean = false;

  constructor(options: ProviderOptions) {
    this.sessionId = options.sessionId;
  }

  async initialize(): Promise<void> {
    // Gemini CLI doesn't need initialization - direct execution
  }

  async shutdown(): Promise<void> {
    // No server to shut down
  }

  isReady(): boolean {
    return true; // Always ready
  }

  getName(): string {
    return 'gemini';
  }

  buildCommand(prompt: string): string {
    // Escape single quotes in prompt to prevent shell syntax errors
    const safePrompt = prompt.replace(/'/g, "'\\''");

    // Basic command structure: gemini -p 'prompt'
    let cmd = `gemini -p '${safePrompt}'`;

    // Gemini CLI might support session/context, but for now we follow the basic pattern
    // If specific session flags exist, they can be added here similar to Claude's -r
    
    return cmd;
  }

  supportsNativePiping(): boolean {
    return true;
  }
}
