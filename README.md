# termai

An AI-powered shell wrapper that integrates Claude Code, Gemini CLI or OpenCode for intelligent command execution.

## Features

- **Regular Shell**: Acts as a normal shell for standard commands
- **AI Commands**: Prefix commands with `#` to use OpenCode AI
- **Pipes**: Chain AI tasks together: `# task1 | task2 | task3`
- **Redirects**: Save output to files: `# research topic > output.md`
- **Background Jobs**: Run long tasks in background: `# task &`
- **Split-Pane UI**: Main shell + status sidebar showing history and server status
- **Command History**: Persistent history of AI commands

## Prerequisites

- Node.js >= 16
- One of the following AI CLIs:
  - **Claude Code** (recommended): Visit [claude.com/download](https://claude.com/download)
  - **OpenCode**: Visit [opencode.ai](https://opencode.ai/docs/cli/)
  - **Gemini CLI**: Visit [geminicli.com/docs/cli/headless](https://geminicli.com/docs/cli/headless/)

## Installation

```bash
npm install -g termai
```

Or install locally for development:

```bash
git clone <repo>
cd termai
npm install
npm run build
npm link
```

## Usage

Start termai:

```bash
termai
```

### Options

- `-s, --shell <path>`: Specify shell path (default: $SHELL or bash)
- `-p, --port <number>`: OpenCode server port (default: 4096)
- `--cli <provider>`: AI CLI to use: "claude", "opencode" or "gemini"
- `-d, --debug`: Enable debug output (shows command detection, buffer state, etc.)
- `--show-command`: Show the command being executed for AI requests

### CLI Selection

termai automatically detects which AI CLI you have installed:

- If only one CLI is available, it will use that automatically
- If multiple CLIs are installed (Claude, OpenCode, Gemini), you'll be prompted to choose on first launch
- Your choice is saved to `~/.termai_config` for future sessions
- Override the saved preference with `--cli` flag:
  ```bash
  termai --cli claude    # Use Claude Code
  termai --cli opencode  # Use OpenCode
  termai --cli gemini    # Use Gemini CLI
  ```

### Examples

```bash
# Simple AI question
# What is the capital of India

# File search task
# Find all md files mentioning acme corp

# Background task with output redirect
# Do a deep research on XYZ > xyz_research.md &

# Pipe chain - output of each task becomes input for the next
# Fetch Issue 3241 | perform RCA | post a response

# Combined: pipe + redirect + background
# analyze codebase | summarize findings > report.md &

# Show the command being executed
termai --show-command
# hello world
→ claude -p 'hello world'
```

## How It Works

1. **AI Provider**: termai starts the detected AI CLI (Claude Code, Gemini CLI, or OpenCode)
2. **Command Translation**: Commands starting with `#` are translated to the appropriate CLI command
3. **Shell Execution**: The translated commands are executed by your shell, which handles pipes, redirects, and background jobs
4. **Context Passing**: For pipe chains, output from one AI task is passed as context to the next

### Example Translations

**Claude Code / Gemini CLI (native piping):**
```bash
# task1 | task2 > output.md &
→ claude -p 'task1' | claude -p 'task2' > output.md &
# or
→ gemini -p 'task1' | gemini -p 'task2' > output.md &
```

**OpenCode (server mode):**
```bash
# task1 | task2 > output.md &
→ opencode run --attach http://localhost:4096 'task1' | \
  { output=$(cat); opencode run --attach http://localhost:4096 'task2. Context: $output'; } > output.md &
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│            termai (PTY-based CLI)                │
│  ┌─────────────────┬─────────────────────────┐  │
│  │  Main Shell     │  Status Sidebar         │  │
│  │  - Command I/O  │  - Running Commands     │  │
│  │  - PTY Output   │  - Provider Status      │  │
│  │  - History      │  - Command History      │  │
│  └─────────────────┴─────────────────────────┘  │
└──────────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────┐
    │ ProviderFactory     │  Auto-detect & select CLI
    └─────────────────────┘
         │
         ├─────────────────┬─────────────────┬──────────────┐
         ▼                 ▼                 ▼              ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐   ┌─────────┐
    │  Claude  │    │ OpenCode │    │  Gemini  │   │ Config  │
    │ Provider │    │ Provider │    │ Provider │   │ Manager │
    └──────────┘    └──────────┘    └──────────┘   └─────────┘
         │                 │                 │
         ▼                 ▼                 ▼
    ┌────────────────────────────────────────────────┐
    │              CommandTranslator                 │  # cmd → CLI command
    └────────────────────────────────────────────────┘
         │
         ▼
    ┌────────────────────────────────────────────────┐
    │ PTY (bash/zsh)                                 │  Handles pipes, redirects, background
    └────────────────────────────────────────────────┘
         │
         ├──────────────┬──────────────┬─────────────┐
         ▼              ▼              ▼             ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
    │ claude  │   │opencode │   │opencode │   │ gemini  │
    │   -p    │   │  serve  │   │run --att│   │   -p    │
    └─────────┘   └─────────┘   └─────────┘   └─────────┘
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## Keyboard Shortcuts

- `Ctrl+C`: Exit termai

## Configuration

- **CLI Preference**: Stored in `~/.termai_config`
- **Command History**: Stored in `~/.termai_history`

## License

MIT
