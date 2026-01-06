// ANSI escape codes for cursor positioning
const ESC = '\x1b';

export class AnsiSidebar {
  private sidebarWidth = 30;
  private content: string[] = [];

  constructor() {
    this.setupSidebar();
  }

  private setupSidebar() {
    // Initial sidebar content
    this.content = [
      '\x1b[32m\x1b[1mtermai\x1b[0m',
      '\x1b[2m──────────────────────────\x1b[0m',
      '',
      '\x1b[36mServer:\x1b[0m \x1b[32m●\x1b[0m',
      '',
      '\x1b[33mAI History:\x1b[0m',
      '\x1b[2mNone\x1b[0m',
      '',
      '\x1b[2m^C exit\x1b[0m',
    ];
  }

  updateHistory(commands: string[]) {
    this.content = [
      '\x1b[32m\x1b[1mtermai\x1b[0m',
      '\x1b[2m──────────────────────────\x1b[0m',
      '',
      '\x1b[36mServer:\x1b[0m \x1b[32m●\x1b[0m',
      '',
      '\x1b[33mAI History:\x1b[0m',
      ...commands.slice(0, 5).map((cmd) => `\x1b[90m${cmd.slice(0, 26)}\x1b[0m`),
      '',
      '\x1b[2m^C exit\x1b[0m',
    ];
  }

  render() {
    const termWidth = process.stdout.columns || 80;
    const sidebarX = termWidth - this.sidebarWidth;

    // Save cursor position
    process.stdout.write(`${ESC}7`);

    // Draw sidebar at each line
    this.content.forEach((line, idx) => {
      // Move to position
      process.stdout.write(`${ESC}[${idx + 1};${sidebarX}H`);
      // Clear to end of line
      process.stdout.write(`${ESC}[K`);
      // Draw border + content
      process.stdout.write(`│ ${line}`);
    });

    // Restore cursor position
    process.stdout.write(`${ESC}8`);
  }

  clear() {
    const termWidth = process.stdout.columns || 80;
    const sidebarX = termWidth - this.sidebarWidth;

    this.content.forEach((_, idx) => {
      process.stdout.write(`${ESC}[${idx + 1};${sidebarX}H${ESC}[K`);
    });
  }
}
