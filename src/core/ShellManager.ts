import * as pty from 'node-pty';
import * as os from 'os';

export class ShellManager {
  private ptyProcess: pty.IPty;

  constructor(shellPath?: string) {
    const shell = shellPath || process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash');

    // Use full terminal width - sidebar will overlay on top
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 30;

    try {
      this.ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: cols,
        rows: rows,
        cwd: process.cwd(),
        env: { ...process.env } as Record<string, string>,
      });
    } catch (err) {
      console.error(`Failed to spawn shell: ${shell}`);
      throw err;
    }
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  onData(callback: (data: string) => void): void {
    this.ptyProcess.onData(callback);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }

  kill(): void {
    this.ptyProcess.kill();
  }
}
