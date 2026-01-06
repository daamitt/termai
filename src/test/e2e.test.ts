import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as pty from 'node-pty';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Strip ANSI escape codes from string
 */
function stripAnsi(str: string): string {
  // Remove ANSI escape codes
  return str
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b[()][AB]/g, '') // Also strip some other common sequences
    .replace(/\r/g, ''); // Strip carriage returns for easier matching
}

/**
 * PTY Test Harness with pattern-based waiting
 */
class PTYTestHarness {
  private ptyProcess: pty.IPty | null = null;
  private outputBuffer: string = '';
  private debugMode: boolean = false;

  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  /**
   * Start termai in a PTY
   */
  async start(args: string[] = []) {
    // Vitest runs TS files directly, so __dirname points to src/test
    // We need to explicitly use the dist path to test compiled code
    const termaiPath = path.join(__dirname, '../../dist/bin/termai.js');

    this.ptyProcess = pty.spawn('node', [termaiPath, ...args], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
    });

    // Capture all output
    this.ptyProcess.onData((data) => {
      this.outputBuffer += data;
      if (this.debugMode) {
        process.stderr.write(`[PTY] ${data.replace(/\n/g, '\n[PTY] ')}`);
      }
    });

    // Wait for termai to finish initialization
    // Look for "started successfully!" message
    await this.waitForPattern(/started successfully!/, 15000);

    // Wait a bit more for shell to be ready
    await this.wait(2000);

    // Clear initialization output
    this.clearOutput();
  }

  /**
   * Wait for a pattern to appear in output (with ANSI stripping)
   */
  async waitForPattern(pattern: RegExp | string, timeoutMs = 10000): Promise<string> {
    const startTime = Date.now();
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const stripped = stripAnsi(this.outputBuffer);

        if (regex.test(stripped)) {
          clearInterval(checkInterval);
          resolve(this.outputBuffer);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          const lastOutput = this.outputBuffer.substring(Math.max(0, this.outputBuffer.length - 1000));
          const lastStripped = stripAnsi(lastOutput);
          reject(
            new Error(
              `Timeout waiting for pattern: ${pattern}\n` +
              `Received output (last 1000 chars, stripped):\n${lastStripped}\n` +
              `Raw output (last 200 chars): ${JSON.stringify(lastOutput.substring(lastOutput.length - 200))}`
            )
          );
        }
      }, 100);
    });
  }

  /**
   * Wait for output to stabilize (no new data for a period)
   */
  async waitForStable(stableMs = 500, timeoutMs = 10000): Promise<void> {
    const startTime = Date.now();
    let lastOutputTime = Date.now();
    let lastOutputLength = this.outputBuffer.length;

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const currentLength = this.outputBuffer.length;

        if (currentLength !== lastOutputLength) {
          // Output changed, reset timer
          lastOutputTime = Date.now();
          lastOutputLength = currentLength;
        } else if (Date.now() - lastOutputTime > stableMs) {
          // Output stable for required period
          clearInterval(checkInterval);
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          reject(new Error('Timeout waiting for output to stabilize'));
        }
      }, 50);
    });
  }

  /**
   * Type text character by character
   */
  async type(text: string, delayMs = 50): Promise<void> {
    for (const char of text) {
      this.ptyProcess?.write(char);
      await this.wait(delayMs);
    }
  }

  /**
   * Send a key sequence
   */
  async sendKey(key: string): Promise<void> {
    const sequences: Record<string, string> = {
      enter: '\r',
      backspace: '\x7f',
      up: '\x1b[A',
      down: '\x1b[B',
      left: '\x1b[D',
      right: '\x1b[C',
      home: '\x1b[H',
      end: '\x1b[F',
      tab: '\t',
      'ctrl-c': '\x03',
      'ctrl-d': '\x04',
    };

    const sequence = sequences[key.toLowerCase()];
    if (!sequence) {
      throw new Error(`Unknown key: ${key}`);
    }

    this.ptyProcess?.write(sequence);
    await this.wait(100);
  }

  /**
   * Get current output buffer (ANSI stripped)
   */
  getOutput(): string {
    return stripAnsi(this.outputBuffer);
  }

  /**
   * Get raw output buffer (with ANSI codes)
   */
  getRawOutput(): string {
    return this.outputBuffer;
  }

  /**
   * Clear output buffer
   */
  clearOutput(): void {
    this.outputBuffer = '';
  }

  /**
   * Kill the PTY process
   */
  kill(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  /**
   * Simple wait helper
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

describe('termai E2E tests', () => {
  let harness: PTYTestHarness;
  const testCLI = process.env.TEST_CLI || 'claude';

  beforeAll(async () => {
    // Start termai with debug, specified CLI, and NO SIDEBAR for clean output
    harness = new PTYTestHarness(process.env.DEBUG_TESTS === 'true');
    await harness.start(['-d', '--cli', testCLI, '--no-sidebar']);
  }, 30000); // Longer timeout for initialization

  afterAll(() => {
    harness.kill();
  });

  describe('Core functionality', () => {
    it('should detect and execute AI commands starting with #', async () => {
      harness.clearOutput();

      await harness.type('# hello');
      await harness.sendKey('enter');

      // Wait for execution to complete
      await harness.waitForPattern(/finalIsAI: true/, 10000);
      await harness.waitForStable(1500, 10000);

      const output = harness.getOutput();
      expect(output).toContain('finalIsAI: true');
      expect(output).toContain('[EXEC]');
      expect(output).toContain(`${testCLI} -p`);
    }, 30000);

    it('should NOT treat regular bash commands as AI commands', async () => {
      harness.clearOutput();

      await harness.type('echo "test123"');
      await harness.sendKey('enter');

      // Wait for bash command to execute
      await harness.waitForPattern(/test123/, 10000);

      const output = harness.getOutput();
      expect(output).toContain('finalIsAI: false');
      expect(output).toContain('Sending to bash');
      expect(output).toContain('test123');
      expect(output).not.toContain('[EXEC]');
    }, 20000);

    it('should handle backspace correctly in input buffer', async () => {
      harness.clearOutput();

      await harness.type('# hello world');

      // Delete "world" (5 chars)
      for (let i = 0; i < 5; i++) {
        await harness.sendKey('backspace');
      }

      await harness.type('test');
      await harness.sendKey('enter');

      await harness.waitForPattern(/buffer="# hello test"/, 10000);
      await harness.waitForStable(1500, 10000);

      const output = harness.getOutput();
      expect(output).toContain('buffer="# hello test"');
      expect(output).toContain('finalIsAI: true');
    }, 30000);

    it('should handle navigation keys and detect them', async () => {
      harness.clearOutput();

      await harness.sendKey('up');
      await harness.waitForPattern(/NAV.*key=up/, 5000);

      const output = harness.getOutput();
      expect(output).toMatch(/NAV.*key=up/);
    }, 15000);

    it(`should translate AI commands to ${testCLI} CLI format`, async () => {
      harness.clearOutput();

      await harness.type('# what is 2+2');
      await harness.sendKey('enter');

      await harness.waitForPattern(/\[EXEC\]/, 10000);
      await harness.waitForStable(1500, 10000);

      const output = harness.getOutput();
      expect(output).toMatch(new RegExp(`\\[EXEC\\].*${testCLI} -p`));
      expect(output).toContain('what is 2+2');
    }, 30000);

    it('should work with # as comment in shell (INTERACTIVE_COMMENTS enabled)', async () => {
      harness.clearOutput();

      await harness.type('# test command');
      await harness.sendKey('enter');

      await harness.waitForPattern(/finalIsAI: true/, 10000);
      await harness.waitForStable(1500, 10000);

      const output = harness.getOutput();
      // Should NOT see "command not found" error from shell
      expect(output).not.toContain('command not found');
      expect(output).toContain('finalIsAI: true');
    }, 30000);
  });
});
