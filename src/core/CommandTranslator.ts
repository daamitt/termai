import type { AIProvider } from '../providers/AIProvider.js';

export class CommandTranslator {
  constructor(private provider: AIProvider) {}

  translate(aiCommand: string): string {
    // Parse command for special operators
    let cmd = aiCommand;
    let background = false;
    let redirect = '';

    // 1. Check for background job (& at end)
    if (cmd.trim().endsWith('&')) {
      background = true;
      cmd = cmd.trim().slice(0, -1).trim();
    }

    // 2. Check for redirect (> or >>)
    const redirectMatch = cmd.match(/\s+(>>?)\s+(\S+)\s*$/);
    if (redirectMatch) {
      redirect = ` ${redirectMatch[1]} ${redirectMatch[2]}`;
      cmd = cmd.slice(0, redirectMatch.index).trim();
    }

    // 3. Split by | for pipe chain
    const tasks = cmd.split('|').map((t) => t.trim()).filter(Boolean);

    // 4. Build shell command based on provider capabilities
    let shellCmd = '';

    if (tasks.length === 1) {
      // Simple command
      shellCmd = this.provider.buildCommand(tasks[0]);
    } else {
      // Pipe chain
      if (this.provider.supportsNativePiping()) {
        // Claude supports native piping via stdin
        shellCmd = tasks.map((task) => this.provider.buildCommand(task)).join(' | ');
      } else {
        // OpenCode needs explicit context passing
        shellCmd = tasks
          .map((task, i) => {
            if (i === 0) {
              return this.provider.buildCommand(task);
            } else {
              // Capture all previous output and pass as context (not line by line)
              return `{ output=$(cat); ${this.provider.buildCommand(task + '. Context: $output')}; }`;
            }
          })
          .join(' | ');
      }
    }

    // 5. Append redirect and background
    shellCmd += redirect;
    if (background) {
      shellCmd += ' &';
    }

    return shellCmd;
  }
}
