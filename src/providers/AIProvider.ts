export interface AIProvider {
  /**
   * Initialize the provider (start server, validate CLI, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the provider (stop server, cleanup, etc.)
   */
  shutdown(): Promise<void>;

  /**
   * Check if provider is ready to handle commands
   */
  isReady(): boolean;

  /**
   * Get the provider name ('claude' or 'opencode')
   */
  getName(): string;

  /**
   * Build a shell command for executing the given prompt
   */
  buildCommand(prompt: string): string;

  /**
   * Whether this provider supports native stdin piping
   * If true, commands can be piped directly: cmd1 | cmd2
   * If false, context must be passed explicitly
   */
  supportsNativePiping(): boolean;
}

export interface ProviderOptions {
  port?: number;        // For OpenCode server
  sessionId?: string;   // For Claude session
  debug?: boolean;
}
