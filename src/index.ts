import { ProviderFactory } from './providers/ProviderFactory.js';
import { ShellManager } from './core/ShellManager.js';
import { CommandTranslator } from './core/CommandTranslator.js';
import { CommandRouter } from './core/CommandRouter.js';
import { HistoryManager } from './core/HistoryManager.js';
import { AnsiSidebar } from './utils/ansiSidebar.js';
import type { TermaiOptions } from './types/index.js';
import type { AIProvider } from './providers/AIProvider.js';
import * as readline from 'readline';
import { spawnSync } from 'child_process';

export async function startApp(options: TermaiOptions) {
  const debug = options.debug || false;
  const showCommand = options.showCommand || false;
  const noSidebar = options.noSidebar || false;

  // Helper function for debug output
  const debugLog = (message: string) => {
    if (debug) {
      // Use stderr for debug to avoid buffering issues and keep it separate from shell output
      process.stderr.write(`${message}\n`);
    }
  };

  // Create provider using factory (handles detection and prompting)
  let provider: AIProvider;
  let cliType: string;

  try {
    const result = await ProviderFactory.create({
      cliOverride: options.cli,
      port: options.port ? parseInt(options.port) : undefined,
      debug: debug,
    });

    provider = result.provider;
    cliType = result.cliType;
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

  // Initialize provider (start server if needed)
  console.log(`Starting ${cliType}...`);

  try {
    await provider.initialize();
    console.log(`${cliType} started successfully!\n`);
  } catch (err) {
    console.error(`Failed to start ${cliType}:`, err);
    await provider.shutdown();
    process.exit(1);
  }

  // Create core components
  const shellManager = new ShellManager(options.shell);
  const commandTranslator = new CommandTranslator(provider);
  const commandRouter = new CommandRouter(shellManager, commandTranslator);
  const historyManager = new HistoryManager();
  const sidebar = new AnsiSidebar();

  await historyManager.load();

  // Enable INTERACTIVE_COMMENTS for zsh (allows # as comment in interactive mode)
  // This makes zsh behave like bash for comment handling
  shellManager.write('setopt INTERACTIVE_COMMENTS 2>/dev/null\n');

  // Setup PTY output
  shellManager.onData((data) => {
    process.stdout.write(data);
    if (!noSidebar) {
      sidebar.render();
    }

    // Keep a rolling buffer of recent shell output for command detection
    recentShellOutput += data;
    // Keep only last 1000 characters to avoid memory issues
    if (recentShellOutput.length > 1000) {
      recentShellOutput = recentShellOutput.slice(-1000);
    }

    // Try to extract the current command line from shell output when navigating
    // This helps detect AI commands retrieved from history via UP arrow
    if (isNavigating) {
      // Remove ANSI escape codes and extract visible text
      const stripped = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
      // Look for # followed by text (AI command marker)
      // Match after any prompt characters like $ or >
      const match = stripped.match(/#\s*[^\n\r]+/);
      if (match) {
        lastShellLine = match[0].trim();
        debugLog(`[DETECTED] Shell line: "${lastShellLine}"`);
      }
    }
  });

  // Setup input handling
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  let inputBuffer = '';
  let isAICommand = false;
  let isNavigating = false; // Track if user is navigating history/line
  let lastShellLine = ''; // Track the last line from shell output for navigation detection
  let recentShellOutput = ''; // Buffer to track recent shell output for detection

  process.stdin.on('keypress', (str, key) => {
    // Debug: log all keys
    if (key.name !== 'return' && str !== '\r' && str !== '\n') {
      debugLog(`[KEY] name="${key.name}" seq=${JSON.stringify(key.sequence)} str=${JSON.stringify(str)}`);
    }

    // Handle Ctrl+C
    if (key.ctrl && key.name === 'c') {
      cleanup();
      return;
    }

    // Detect navigation keys (arrows, home, end, etc.)
    // When user navigates, we can't reliably track the buffer, so reset it
    if (key.name === 'up' || key.name === 'down' || key.name === 'left' || key.name === 'right' || key.name === 'home' || key.name === 'end') {
      debugLog(`[NAV] key=${key.name} seq=${JSON.stringify(key.sequence)}`);
      isNavigating = true;
      inputBuffer = '';
      isAICommand = false;
    }

    // Handle Enter
    if (key.name === 'return') {
      let command = inputBuffer;
      inputBuffer = '';
      const wasNavigating = isNavigating;
      isNavigating = false;

      // If navigating and buffer is empty, try to detect from shell output
      if (wasNavigating && !command) {
        // First try the detected lastShellLine
        if (lastShellLine) {
          command = lastShellLine;
          debugLog(`[DEBUG] Using detected shell line: "${command}"`);
        } else {
          // Fallback: search recent shell output for # commands
          const stripped = recentShellOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
          const match = stripped.match(/#\s*[^\n\r]+/);
          if (match) {
            command = match[0].trim();
            debugLog(`[DEBUG] Detected from recent output: "${command}"`);
          }
        }
      }

      // Clear the detected line and recent output buffer after use
      lastShellLine = '';
      recentShellOutput = '';

      // Debug output
      debugLog(`[DEBUG] inputBuffer: "${command}" | wasNavigating: ${wasNavigating}`);

      // Detect AI commands even when retrieved from history
      // Since # is a bash comment, it's safe to always treat # as AI command
      const finalIsAI = command.startsWith('#');

      debugLog(`[DEBUG] finalIsAI: ${finalIsAI}`);

      if (command.trim() && finalIsAI) {
        historyManager.add(command, true);

        // AI command - let shell see it as comment (adds to history)
        shellManager.write('\r'); // Send Enter to shell

        if (!noSidebar) {
          const aiCommands = historyManager.getRecentAICommands(5);
          sidebar.updateHistory(aiCommands.map((c) => c.command));
        }

        const aiCommand = command.slice(1).trim();
        const shellCommand = commandTranslator.translate(aiCommand);

        // Debug: show generated command
        debugLog(`[EXEC] ${shellCommand}`);

        // Show command if --show-command flag is set
        if (showCommand) {
          process.stderr.write(`\n\x1b[36m→ ${shellCommand}\x1b[0m\n`);
        }

        // Move to new line before executing
        process.stdout.write('\n');

        // Check if command has redirects or background job
        const hasRedirect = aiCommand.match(/\s+(>>?)\s+\S+/);
        const hasBackground = aiCommand.trim().endsWith('&');

        if (hasRedirect || hasBackground) {
          // Use inherit stdio for redirects/background - let shell handle I/O
          spawnSync('sh', ['-c', shellCommand], {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: process.env,
          });
        } else {
          // Capture output and format with dim for interactive commands
          const result = spawnSync('sh', ['-c', shellCommand], {
            cwd: process.cwd(),
            env: process.env,
            encoding: 'utf8',
          });

          // Print AI response with dim formatting
          if (result.stdout) {
            // Dim color ANSI code: \x1b[2m ... \x1b[0m
            process.stdout.write('\x1b[2m');
            process.stdout.write(result.stdout);
            process.stdout.write('\x1b[0m');
          }

          if (result.stderr) {
            process.stderr.write(result.stderr);
          }
        }

        isAICommand = false;
        return;
      }

      // Regular command or navigated command - let bash handle it
      debugLog(`[DEBUG] Sending to bash`);
      shellManager.write('\r');
      isAICommand = false;
      return;
    }

    // Handle backspace - update buffer but DON'T return early
    // Backspace can be: key.name='backspace', sequence='\x7f' (DEL), or sequence='\b' (BS)
    const isBackspace = key.name === 'backspace' || key.name === 'delete' || key.sequence === '\x7f' || key.sequence === '\b' || str === '\x7f' || str === '\b';
    if (isBackspace) {
      debugLog(`[BACKSPACE] name=${key.name} seq=${JSON.stringify(key.sequence)} before="${inputBuffer}"`);
      if (inputBuffer.length > 0 && !isNavigating) {
        inputBuffer = inputBuffer.slice(0, -1);
        isAICommand = inputBuffer.trim().startsWith('#');
        debugLog(`[BACKSPACE] after="${inputBuffer}"`);
      }
      // Fall through to send key to shell
    }

    // Track regular character input (skip if backspace)
    if (str && !key.ctrl && !key.meta && !isBackspace) {
      // If user starts typing after navigation, reset navigation flag and start fresh
      if (isNavigating) {
        debugLog(`[RESET] Starting fresh input after navigation`);
        isNavigating = false;
        inputBuffer = '';
      }

      inputBuffer += str;
      isAICommand = inputBuffer.trim().startsWith('#');
      debugLog(`[CHAR] str="${str}" buffer="${inputBuffer}"`);
    }

    // Send ALL keys to shell (typing, backspace, arrows, etc.)
    if (key.sequence) {
      shellManager.write(key.sequence);
    } else if (str) {
      shellManager.write(str);
    }
  });

  // Initial sidebar render (skip if disabled)
  if (!noSidebar) {
    sidebar.render();
  }

  // Cleanup on exit
  const cleanup = async () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    if (!noSidebar) {
      sidebar.clear();
    }
    shellManager.kill();
    await provider.shutdown();
    await historyManager.save();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep process running
  await new Promise(() => {});
}
