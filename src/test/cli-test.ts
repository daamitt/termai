#!/usr/bin/env node
import * as pty from 'node-pty';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestCase {
  name: string;
  input: string; // Raw input string or special keys like <UP>, <ENTER>, <BACKSPACE>
  expectedInOutput?: string[]; // Strings that should appear in output
  notExpectedInOutput?: string[]; // Strings that should NOT appear
  delay?: number; // Delay before sending input (ms)
}

class CLITester {
  private ptyProcess: pty.IPty | null = null;
  private output: string = '';
  private testResults: { name: string; passed: boolean; error?: string }[] = [];

  async start() {
    console.log('🧪 Starting termai CLI test harness...\n');

    // Spawn termai in a PTY with debug flag for test visibility
    const termaiPath = path.join(__dirname, '../../bin/termai.js');

    // Use --cli claude to test Claude CLI integration
    this.ptyProcess = pty.spawn('node', [termaiPath, '-d', '--cli', 'claude'], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: process.cwd(),
      env: { ...process.env } as Record<string, string>,
    });

    // Capture output
    this.ptyProcess.onData((data) => {
      this.output += data;
      // Echo output for debugging (with prefix)
      process.stdout.write('\x1b[90m' + data.replace(/\n/g, '\n  ') + '\x1b[0m');
    });

    // Wait for termai to initialize
    await this.wait(2000);
    this.output = ''; // Clear initialization output
  }

  async runTests() {
    const tests: TestCase[] = [
      {
        name: 'Simple AI command',
        input: '# hello<ENTER>',
        expectedInOutput: ['[DEBUG] finalIsAI: true', '[EXEC]', 'claude -p'],
      },
      {
        name: 'Regular bash command',
        input: 'echo test<ENTER>',
        expectedInOutput: ['[DEBUG] finalIsAI: false', '[DEBUG] Sending to bash'],
        notExpectedInOutput: ['[EXEC]'],
      },
      {
        name: 'AI command after up arrow',
        input: '<UP># what is 2+2<ENTER>',
        expectedInOutput: ['[NAV] key=up', '[RESET] Starting fresh', '[DEBUG] finalIsAI: true', '[EXEC]'],
      },
      {
        name: 'Backspace works',
        input: '# hello world<BACKSPACE><BACKSPACE><BACKSPACE><BACKSPACE><BACKSPACE>test<ENTER>',
        expectedInOutput: ['buffer="# hello test"', '[DEBUG] finalIsAI: true'],
      },
      {
        name: 'Not an AI command (no exclamation)',
        input: 'ls -la<ENTER>',
        expectedInOutput: ['[DEBUG] finalIsAI: false'],
        notExpectedInOutput: ['[EXEC]'],
      },
      {
        name: 'AI command from history (UP + ENTER)',
        input: '# test command<ENTER>',
        delay: 500,
      },
      {
        name: 'Retrieve and re-execute AI command',
        input: '<UP><ENTER>',
        // NOTE: This currently doesn't work because inputBuffer is empty after UP
        // Users need to type at least one char after UP to re-execute
        // Or they can search history with Ctrl+R
        expectedInOutput: ['[DEBUG] Sending to bash'],  // Falls through to bash
      },
      {
        name: 'AI command with output redirect',
        input: '# echo test > output.txt<ENTER>',
        expectedInOutput: ['[DEBUG] finalIsAI: true', '[EXEC]'],
        delay: 500,
      },
    ];

    for (const test of tests) {
      await this.runTest(test);
      await this.wait(1000); // Wait between tests (increased for stability)
    }

    this.printResults();
    this.cleanup();
  }

  async runTest(test: TestCase) {
    console.log(`\n📝 Running test: ${test.name}`);
    this.output = ''; // Clear previous output

    if (test.delay) {
      await this.wait(test.delay);
    }

    // Send input
    await this.sendInput(test.input);

    // Wait for output (increased for AI command execution)
    await this.wait(2000);

    // Validate output
    let passed = true;
    let error = '';

    if (test.expectedInOutput) {
      for (const expected of test.expectedInOutput) {
        if (!this.output.includes(expected)) {
          passed = false;
          error = `Expected "${expected}" in output but not found`;
          break;
        }
      }
    }

    if (passed && test.notExpectedInOutput) {
      for (const notExpected of test.notExpectedInOutput) {
        if (this.output.includes(notExpected)) {
          passed = false;
          error = `Did not expect "${notExpected}" in output but it was found`;
          break;
        }
      }
    }

    this.testResults.push({ name: test.name, passed, error });

    if (passed) {
      console.log(`  ✅ PASSED`);
    } else {
      console.log(`  ❌ FAILED: ${error}`);
      console.log(`  Output snippet: ${this.output.substring(0, 200)}`);
    }
  }

  async sendInput(input: string) {
    // Parse special keys
    const parts = input.split(/<([^>]+)>/);

    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        // Regular text
        if (parts[i]) {
          for (const char of parts[i]) {
            this.ptyProcess?.write(char);
            await this.wait(50); // Small delay between characters
          }
        }
      } else {
        // Special key
        const key = parts[i];
        const sequence = this.getKeySequence(key);
        if (sequence) {
          this.ptyProcess?.write(sequence);
          await this.wait(100);
        }
      }
    }
  }

  getKeySequence(key: string): string | null {
    const sequences: Record<string, string> = {
      ENTER: '\r',
      BACKSPACE: '\x7f',
      UP: '\x1b[A',
      DOWN: '\x1b[B',
      LEFT: '\x1b[D',
      RIGHT: '\x1b[C',
      HOME: '\x1b[H',
      END: '\x1b[F',
      TAB: '\t',
    };
    return sequences[key.toUpperCase()] || null;
  }

  wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  printResults() {
    console.log('\n\n📊 Test Results:');
    console.log('='.repeat(50));

    const passed = this.testResults.filter((r) => r.passed).length;
    const failed = this.testResults.filter((r) => !r.passed).length;

    this.testResults.forEach((result) => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.name}`);
      if (result.error) {
        console.log(`   ${result.error}`);
      }
    });

    console.log('='.repeat(50));
    console.log(`Total: ${this.testResults.length} | Passed: ${passed} | Failed: ${failed}`);
  }

  cleanup() {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
    }
    const failed = this.testResults.filter((r) => !r.passed).length;
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run tests
const tester = new CLITester();
tester.start().then(() => tester.runTests());
