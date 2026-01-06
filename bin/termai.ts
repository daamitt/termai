#!/usr/bin/env node
import { Command } from 'commander';
import { startApp } from '../src/index.js';

const program = new Command();

program
  .name('termai')
  .description('AI-powered shell wrapper with Claude Code, OpenCode and Gemini CLI support')
  .version('1.0.0')
  .option('-s, --shell <path>', 'Specify shell path (default: $SHELL or bash)')
  .option('-p, --port <number>', 'OpenCode server port (default: 4096)', '4096')
  .option('--cli <provider>', 'AI CLI to use: "claude", "opencode" or "gemini"')
  .option('-d, --debug', 'Enable debug output', false)
  .option('--show-command', 'Show the command being executed for AI requests', false)
  .option('--no-sidebar', 'Disable sidebar (useful for testing)')
  .parse();

const options = program.opts();

// Commander's --no-* flags set 'sidebar: false', not 'noSidebar: false'
// Normalize to noSidebar for consistency with our types
if (options.sidebar === false) {
  options.noSidebar = true;
}

// Start the application
await startApp(options);
