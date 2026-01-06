import { spawn, ChildProcess } from 'child_process';

export class OpenCodeServer {
  private serverProcess: ChildProcess | null = null;
  private port: number;
  private attachUrl: string;

  constructor(port: number = 4096) {
    this.port = port;
    this.attachUrl = `http://localhost:${port}`;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Spawn opencode server
      this.serverProcess = spawn('opencode', ['serve', '--port', String(this.port)], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let serverReady = false;
      const timeout = setTimeout(() => {
        if (!serverReady) {
          this.stop(); // Cleanup on timeout
          reject(new Error('OpenCode server failed to start within 10 seconds'));
        }
      }, 10000);

      // Listen for output indicating server is ready
      this.serverProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        // Look for indicators that server is ready
        if (output.includes('listening') || output.includes('Server started') || output.includes('ready')) {
          if (!serverReady) {
            serverReady = true;
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      this.serverProcess.stderr?.on('data', (data) => {
        console.error('OpenCode server error:', data.toString());
      });

      this.serverProcess.on('error', (err) => {
        clearTimeout(timeout);
        this.stop(); // Cleanup on error
        reject(err);
      });

      this.serverProcess.on('exit', (code) => {
        if (!serverReady) {
          clearTimeout(timeout);
          this.stop(); // Cleanup on early exit
          reject(new Error(`OpenCode server exited with code ${code}`));
        }
      });

      // If no specific ready message, resolve after a short delay
      setTimeout(() => {
        if (!serverReady) {
          serverReady = true;
          clearTimeout(timeout);
          resolve();
        }
      }, 2000);
    });
  }

  getAttachUrl(): string {
    return this.attachUrl;
  }

  async stop(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }
  }

  isRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed;
  }
}
