import { ShellManager } from './ShellManager.js';
import { CommandTranslator } from './CommandTranslator.js';

export class CommandRouter {
  constructor(
    private shellManager: ShellManager,
    private commandTranslator: CommandTranslator
  ) {}

  route(command: string): void {
    const trimmed = command.trim();

    if (trimmed.startsWith('#')) {
      // Strip # and translate to OpenCode command
      const aiCommand = trimmed.slice(1).trim();
      const shellCommand = this.commandTranslator.translate(aiCommand);

      // Send translated command to shell
      this.shellManager.write(shellCommand + '\r');
    } else {
      // Pass through to shell
      this.shellManager.write(command + '\r');
    }
  }
}
