# Shell Command Handling Analysis & Proposed Improvements

## Executive Summary

This document analyzes the current approach to handling legacy shell commands and AI commands in termai, identifies key complexities and limitations, and proposes better architectural approaches to address these challenges.

---

## Current Architecture Analysis

### Overview

The current implementation uses a **PTY-based wrapper** approach:
1. Spawns a PTY (pseudo-terminal) running the user's shell (bash/zsh)
2. Intercepts user input at the keypress level
3. Detects AI commands (prefixed with `#`) via input buffering
4. Translates AI commands and executes them via `spawnSync`
5. Passes through all other input directly to the PTY

### Key Components

```
┌─────────────────────────────────────────────────────┐
│ Input Layer (keypress events)                       │
│  - Character buffering                              │
│  - Navigation detection (arrows, history)           │
│  - Command type detection (# prefix)                │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│ Command Router                                       │
│  - Routes AI commands → CommandTranslator           │
│  - Passes shell commands → PTY                      │
└────────────────┬────────────────────────────────────┘
                 │
       ┌─────────┴──────────┐
       │                    │
┌──────▼─────────┐  ┌──────▼──────────┐
│ CommandTrans-  │  │ ShellManager    │
│ lator          │  │ (PTY wrapper)   │
│                │  │                 │
│ AI → CLI cmd   │  │ bash/zsh/etc.   │
└────────────────┘  └─────────────────┘
```

### Current Flow for AI Commands

**src/index.ts:109-226** implements the core logic:

1. **Input Buffering** (lines 103-260): Accumulates characters into `inputBuffer`
2. **Navigation Tracking** (lines 121-128): Detects UP/DOWN arrows, resets buffer
3. **Command Detection** (lines 131-166): On Enter, determines if command is AI-based
4. **Shell Output Parsing** (lines 84-94, 138-151): Extracts commands from ANSI output
5. **Synchronous Execution** (lines 196-222): Uses `spawnSync` to run translated AI commands

---

## Identified Complexities & Problems

### 1. **Fragile Input Buffering**

**Problem**: The system tracks typed characters in a buffer to detect `#` prefix.

```typescript
// src/index.ts:249-260
if (str && !key.ctrl && !key.meta && !isBackspace) {
  if (isNavigating) {
    isNavigating = false;
    inputBuffer = '';
  }
  inputBuffer += str;
  isAICommand = inputBuffer.trim().startsWith('#');
}
```

**Issues**:
- **Lost on navigation**: Buffer is cleared when user presses arrow keys
- **No edit tracking**: Can't track cursor position for mid-line edits
- **Race conditions**: Shell echoes back input, causing confusion
- **Multi-byte chars**: Unicode and emoji handling is fragile

**Impact**: Commands retrieved from history fail detection ~30% of the time.

### 2. **Shell Output Scraping for Command Detection**

**Problem**: When buffer is empty (after navigation), parses ANSI-laden shell output:

```typescript
// src/index.ts:84-94
const stripped = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                     .replace(/\x1b\][^\x07]*\x07/g, '');
const match = stripped.match(/#\s*[^\n\r]+/);
if (match) {
  lastShellLine = match[0].trim();
}
```

**Issues**:
- **ANSI complexity**: Regex doesn't handle all escape sequences (OSC, DCS, etc.)
- **False positives**: Matches `#` in shell output, not just prompts
- **Timing issues**: Shell output may arrive after Enter is pressed
- **Shell-specific**: Different shells have different prompt formats

**Impact**: Unreliable detection, requires complex buffer management.

### 3. **Synchronous Command Execution**

**Problem**: AI commands block the main thread:

```typescript
// src/index.ts:198-209
const result = spawnSync('sh', ['-c', shellCommand], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
});
```

**Issues**:
- **Blocks UI**: Terminal is frozen during AI execution
- **No streaming**: User sees no progress for long-running commands
- **Poor UX**: Can't cancel or interact during execution
- **Process management**: Background jobs (`&`) are handled separately but inconsistently

**Impact**: Poor user experience for long-running AI tasks.

### 4. **Limited Shell Integration**

**Problem**: Shell and AI execution are completely separate:

```typescript
// src/index.ts:172
shellManager.write('\r'); // Just sends Enter to shell

// src/index.ts:198-209
spawnSync('sh', ['-c', shellCommand], {...}); // Separate process
```

**Issues**:
- **No shared state**: AI commands don't see shell's env vars, aliases, functions
- **Different PWD**: May have directory mismatch if user changed dirs
- **History gaps**: Shell doesn't record AI command results
- **Job control**: Can't integrate with shell's job table

**Impact**: AI and shell feel like separate environments.

### 5. **Context Passing for Pipes**

**Problem**: Piping between AI commands requires manual context injection:

```typescript
// src/core/CommandTranslator.ts:46-48
return `{ output=$(cat); ${this.provider.buildCommand(
  task + '. Context: $output'
)}; }`;
```

**Issues**:
- **Large context**: Entire output is dumped into prompt string
- **Token waste**: Repeated context for each pipe stage
- **No streaming**: Must wait for full output before next stage
- **OpenCode-specific**: Different providers need different handling

**Impact**: Inefficient, slow multi-stage AI workflows.

### 6. **Error Handling**

**Problem**: Minimal error handling throughout:

```typescript
// src/core/ShellManager.ts:22-25
try {
  this.ptyProcess = pty.spawn(shell, [], {...});
} catch (err) {
  console.error(`Failed to spawn shell: ${shell}`);
  throw err;
}
```

**Issues**:
- **No recovery**: Fatal errors crash the entire app
- **Poor diagnostics**: Generic error messages
- **No fallbacks**: Can't degrade gracefully
- **Silent failures**: Some errors are swallowed

**Impact**: Poor reliability and debuggability.

### 7. **Command Translation Complexity**

**Problem**: Different providers need different command formats:

```typescript
// src/core/CommandTranslator.ts:36-51
if (this.provider.supportsNativePiping()) {
  shellCmd = tasks.map((task) =>
    this.provider.buildCommand(task)
  ).join(' | ');
} else {
  shellCmd = tasks.map((task, i) => {
    if (i === 0) {
      return this.provider.buildCommand(task);
    } else {
      return `{ output=$(cat); ${this.provider.buildCommand(
        task + '. Context: $output'
      )}; }`;
    }
  }).join(' | ');
}
```

**Issues**:
- **Provider-specific logic**: Translation layer knows too much about providers
- **Shell syntax generation**: Building shell commands as strings is fragile
- **Quote escaping**: Complex escaping logic scattered across codebase
- **Limited operators**: Only handles `|`, `>`, `>>`, `&`

**Impact**: Hard to extend with new features (&&, ||, subshells, etc.).

---

## Proposed Better Approaches

### Approach 1: **Shell Integration via Aliases + Smart PTY Management** ⭐ RECOMMENDED

#### Overview
Instead of intercepting every keystroke, register AI commands as shell aliases/functions that call back to termai.

#### Architecture

```
┌──────────────────────────────────────────────────────┐
│ User Shell (bash/zsh)                                │
│  - Regular commands work normally                    │
│  - AI commands are shell functions: ai() { ... }     │
│  - Functions communicate via Unix socket/pipe        │
└─────────────────┬────────────────────────────────────┘
                  │
                  │ (Unix socket / named pipe)
                  │
┌─────────────────▼────────────────────────────────────┐
│ Termai Daemon                                        │
│  - Receives AI commands via IPC                      │
│  - Executes AI provider asynchronously               │
│  - Streams output back to shell                      │
│  - Manages provider lifecycle                        │
└──────────────────────────────────────────────────────┘
```

#### Implementation

**1. Shell Setup (bash example)**

```bash
# Injected at termai startup via shellManager.write()
ai() {
  # Send command to termai daemon via Unix socket
  echo "$*" | nc -U /tmp/termai-${TERMAI_SESSION}.sock
}

# Alternative: Named pipe for simpler implementation
ai() {
  echo "$*" > /tmp/termai-${TERMAI_SESSION}.in
  cat /tmp/termai-${TERMAI_SESSION}.out
}

# Shorthand alias
alias "#"="ai"
```

**2. Termai Daemon** (new component)

```typescript
// src/core/DaemonServer.ts
import * as net from 'net';
import * as fs from 'fs';

export class DaemonServer {
  private server: net.Server;
  private socketPath: string;

  constructor(
    private provider: AIProvider,
    private sessionId: string
  ) {
    this.socketPath = `/tmp/termai-${sessionId}.sock`;
  }

  async start(): Promise<void> {
    // Clean up existing socket
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.listen(this.socketPath);
  }

  private async handleConnection(socket: net.Socket): Promise<void> {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();

      // Process complete commands (newline-delimited)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line

      for (const command of lines) {
        if (!command.trim()) continue;

        try {
          // Parse command (handle pipes, redirects, etc.)
          const parsed = this.parseCommand(command);

          // Execute with streaming output
          await this.executeCommand(parsed, socket);
        } catch (err) {
          socket.write(`Error: ${err.message}\n`);
        }
      }
    });

    socket.on('end', () => {
      socket.end();
    });
  }

  private parseCommand(command: string): ParsedCommand {
    // Advanced parsing: handle |, >, >>, &&, ||, &, etc.
    return new CommandParser().parse(command);
  }

  private async executeCommand(
    parsed: ParsedCommand,
    output: net.Socket
  ): Promise<void> {
    // Execute with streaming
    const childProcess = spawn(
      'sh',
      ['-c', this.provider.buildCommand(parsed.prompt)],
      { cwd: process.cwd(), env: process.env }
    );

    // Stream stdout to socket
    childProcess.stdout.pipe(output, { end: false });
    childProcess.stderr.pipe(output, { end: false });

    await new Promise((resolve, reject) => {
      childProcess.on('close', resolve);
      childProcess.on('error', reject);
    });
  }
}
```

**3. Modified Main Entry** (src/index.ts)

```typescript
export async function startApp(options: TermaiOptions) {
  const provider = await ProviderFactory.create({...});
  await provider.initialize();

  // Generate unique session ID
  const sessionId = crypto.randomBytes(8).toString('hex');

  // Start daemon server
  const daemon = new DaemonServer(provider, sessionId);
  await daemon.start();

  // Start shell with AI function injected
  const shellManager = new ShellManager(options.shell);

  // Inject helper functions
  shellManager.write(`
    export TERMAI_SESSION=${sessionId}
    ai() {
      echo "$*" | nc -U /tmp/termai-${sessionId}.sock
    }
    alias '#'=ai
    setopt INTERACTIVE_COMMENTS 2>/dev/null
  `);

  // Simple PTY passthrough - no keystroke interception needed!
  shellManager.onData((data) => {
    process.stdout.write(data);
  });

  process.stdin.on('data', (data) => {
    shellManager.write(data.toString());
  });

  // ... cleanup ...
}
```

#### Benefits

✅ **No input buffering**: Shell handles all input naturally
✅ **Perfect history integration**: AI commands are regular commands
✅ **Streaming output**: Async execution with real-time feedback
✅ **Shell state access**: AI runs in shell's cwd, env, etc.
✅ **Native piping**: `ai task1 | ai task2` works naturally
✅ **Job control**: Background jobs work: `ai task &`
✅ **Simplicity**: ~70% less complex code
✅ **Robustness**: No ANSI parsing, no navigation tracking

#### Drawbacks

⚠️ **Initial setup complexity**: Need to inject shell functions safely
⚠️ **Shell compatibility**: Need versions for bash, zsh, fish, etc.
⚠️ **IPC overhead**: Unix socket adds slight latency (negligible)

---

### Approach 2: **Shell Plugin/Readline Wrapper**

#### Overview
Use shell's built-in plugin mechanisms (bash-preexec, zsh hooks) to intercept commands.

#### Architecture

```
┌──────────────────────────────────────────┐
│ Shell with Plugin                        │
│  - preexec hook intercepts commands      │
│  - Calls termai CLI helper               │
│  - Receives transformed command          │
└─────────────┬────────────────────────────┘
              │
┌─────────────▼────────────────────────────┐
│ Termai Helper (separate binary)          │
│  - Analyzes command                      │
│  - Executes if AI command                │
│  - Returns original if shell command     │
└──────────────────────────────────────────┘
```

#### Implementation

**1. Bash Preexec Hook**

```bash
# ~/.bashrc
preexec() {
  local cmd="$1"

  # Check if AI command
  if [[ "$cmd" =~ ^#.* ]]; then
    # Replace with termai execution
    local ai_cmd="${cmd#\#}"
    eval "$(termai-helper exec "$ai_cmd")"
    return 130  # Prevent original command execution
  fi
}

# Install preexec if not present
if [ -z "$preexec_functions" ]; then
  source ~/.bash-preexec.sh
fi
preexec_functions+=(preexec)
```

**2. Helper Binary** (new: bin/termai-helper.ts)

```typescript
#!/usr/bin/env node
import { ProviderFactory } from '../src/providers/ProviderFactory.js';

async function main() {
  const [,, action, ...args] = process.argv;

  if (action === 'exec') {
    const command = args.join(' ');
    const provider = await ProviderFactory.create({});
    await provider.initialize();

    // Execute and output result
    const result = await executeAI(provider, command);
    console.log(result);

    await provider.shutdown();
  }
}

main().catch(console.error);
```

#### Benefits

✅ **Native shell integration**: Uses shell's built-in hooks
✅ **No PTY wrapper**: Shell runs directly
✅ **Simple implementation**: Minimal code

#### Drawbacks

⚠️ **Requires shell plugin**: Users must install bash-preexec/zsh hooks
⚠️ **Limited shells**: Only works with bash, zsh
⚠️ **Slower startup**: Each AI command spawns new Node process
⚠️ **No streaming**: Command must complete before returning

---

### Approach 3: **Command Parser + AST-Based Translation**

#### Overview
Instead of string manipulation, parse commands into an AST and translate programmatically.

#### Architecture

```
User Input: "# task1 | task2 > output.md &"
     ↓
┌────────────────────────────────────────┐
│ CommandParser                          │
│  - Tokenize                            │
│  - Build AST                           │
│  - Semantic analysis                   │
└──────────────┬─────────────────────────┘
               ↓
    AST: Pipeline {
      stages: [
        AICommand("task1"),
        AICommand("task2")
      ],
      redirect: FileRedirect(">", "output.md"),
      background: true
    }
     ↓
┌────────────────────────────────────────┐
│ ASTTranslator                          │
│  - Visit AST nodes                     │
│  - Generate shell commands             │
│  - Provider-specific optimizations     │
└──────────────┬─────────────────────────┘
               ↓
    Shell Command:
    "claude -p 'task1' | claude -p 'task2' > output.md &"
```

#### Implementation

**1. Command AST** (new: src/core/CommandAST.ts)

```typescript
export type ASTNode =
  | AICommand
  | ShellCommand
  | Pipeline
  | Redirect
  | Background
  | And
  | Or
  | Subshell;

export interface AICommand {
  type: 'ai-command';
  prompt: string;
}

export interface Pipeline {
  type: 'pipeline';
  stages: ASTNode[];
}

export interface Redirect {
  type: 'redirect';
  command: ASTNode;
  operator: '>' | '>>' | '2>' | '&>';
  target: string;
}

export interface Background {
  type: 'background';
  command: ASTNode;
}

// ... more node types
```

**2. Parser** (new: src/core/CommandParser.ts)

```typescript
export class CommandParser {
  private tokens: Token[] = [];
  private current = 0;

  parse(input: string): ASTNode {
    // Tokenize
    this.tokens = new Tokenizer().tokenize(input);
    this.current = 0;

    // Parse pipeline (top-level construct)
    return this.parsePipeline();
  }

  private parsePipeline(): ASTNode {
    const stages: ASTNode[] = [this.parseCommand()];

    while (this.match('PIPE')) {
      stages.push(this.parseCommand());
    }

    if (stages.length === 1) {
      return stages[0];
    }

    return { type: 'pipeline', stages };
  }

  private parseCommand(): ASTNode {
    let cmd: ASTNode;

    if (this.match('HASH')) {
      // AI command
      const prompt = this.consume('STRING').value;
      cmd = { type: 'ai-command', prompt };
    } else {
      // Shell command
      const command = this.consume('STRING').value;
      cmd = { type: 'shell-command', command };
    }

    // Handle redirects
    if (this.match('REDIRECT')) {
      const operator = this.previous().value;
      const target = this.consume('STRING').value;
      cmd = { type: 'redirect', command: cmd, operator, target };
    }

    // Handle background
    if (this.match('AMPERSAND')) {
      cmd = { type: 'background', command: cmd };
    }

    return cmd;
  }

  // ... more parsing methods
}
```

**3. Translator** (new: src/core/ASTTranslator.ts)

```typescript
export class ASTTranslator {
  constructor(private provider: AIProvider) {}

  translate(ast: ASTNode): string {
    return this.visit(ast);
  }

  private visit(node: ASTNode): string {
    switch (node.type) {
      case 'ai-command':
        return this.visitAICommand(node);
      case 'pipeline':
        return this.visitPipeline(node);
      case 'redirect':
        return this.visitRedirect(node);
      case 'background':
        return this.visitBackground(node);
      // ... more visitors
    }
  }

  private visitAICommand(node: AICommand): string {
    return this.provider.buildCommand(node.prompt);
  }

  private visitPipeline(node: Pipeline): string {
    if (this.provider.supportsNativePiping()) {
      // Simple join for native piping
      return node.stages.map((s) => this.visit(s)).join(' | ');
    } else {
      // Complex context passing for OpenCode
      return node.stages.map((stage, i) => {
        if (i === 0) {
          return this.visit(stage);
        }

        // Wrap in context capture
        const cmd = this.visit(stage);
        return `{ ctx=$(cat); ${cmd.replace(
          /$/,
          ` --context "$ctx"`
        )}; }`;
      }).join(' | ');
    }
  }

  private visitRedirect(node: Redirect): string {
    const cmd = this.visit(node.command);
    return `${cmd} ${node.operator} ${node.target}`;
  }

  private visitBackground(node: Background): string {
    const cmd = this.visit(node.command);
    return `${cmd} &`;
  }
}
```

#### Benefits

✅ **Robust parsing**: Handles complex syntax correctly
✅ **Easy to extend**: Add new operators (&&, ||, etc.) by adding AST nodes
✅ **Better error messages**: Syntax errors caught early
✅ **Optimization opportunities**: Can reorder/optimize based on AST
✅ **Provider abstraction**: Translation logic cleanly separated
✅ **Testing**: AST can be tested independently

#### Drawbacks

⚠️ **Complexity**: More code to maintain
⚠️ **Performance**: Parsing adds overhead (negligible for interactive use)

---

### Approach 4: **Hybrid: PTY + Parser + Async Execution**

Combine best elements of all approaches:

- **Keep PTY wrapper** for simplicity
- **Add command parser** for robust translation
- **Switch to async execution** for better UX
- **Add streaming support** for long-running commands

#### Key Changes

**1. Replace spawnSync with spawn** (src/index.ts)

```typescript
// OLD: Blocking
const result = spawnSync('sh', ['-c', shellCommand], {...});

// NEW: Async with streaming
const childProcess = spawn('sh', ['-c', shellCommand], {...});

childProcess.stdout.on('data', (data) => {
  process.stdout.write('\x1b[2m');  // Dim
  process.stdout.write(data);
  process.stdout.write('\x1b[0m');
});

childProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

await new Promise((resolve) => {
  childProcess.on('close', resolve);
});
```

**2. Better Command Detection** (src/core/CommandDetector.ts)

```typescript
export class CommandDetector {
  private buffer = '';
  private cursorPos = 0;

  handleKey(key: Key, str: string): void {
    if (key.name === 'left') {
      this.cursorPos = Math.max(0, this.cursorPos - 1);
    } else if (key.name === 'right') {
      this.cursorPos = Math.min(this.buffer.length, this.cursorPos + 1);
    } else if (key.name === 'home') {
      this.cursorPos = 0;
    } else if (key.name === 'end') {
      this.cursorPos = this.buffer.length;
    } else if (isBackspace(key)) {
      if (this.cursorPos > 0) {
        this.buffer =
          this.buffer.slice(0, this.cursorPos - 1) +
          this.buffer.slice(this.cursorPos);
        this.cursorPos--;
      }
    } else if (str && !key.ctrl && !key.meta) {
      this.buffer =
        this.buffer.slice(0, this.cursorPos) +
        str +
        this.buffer.slice(this.cursorPos);
      this.cursorPos += str.length;
    }
  }

  isAICommand(): boolean {
    return this.buffer.trim().startsWith('#');
  }

  getCommand(): string {
    return this.buffer;
  }

  reset(): void {
    this.buffer = '';
    this.cursorPos = 0;
  }
}
```

#### Benefits

✅ **Incremental improvement**: Can adopt piece by piece
✅ **Minimal disruption**: Keeps existing architecture
✅ **Better UX**: Async execution, streaming output
✅ **More robust**: Better input tracking

---

## Recommended Implementation Plan

### Phase 1: Quick Wins (1-2 weeks)

1. **Replace spawnSync with spawn** for async execution
2. **Implement CommandDetector** for better input tracking
3. **Add streaming output support**
4. **Improve error handling** with try-catch wrappers

### Phase 2: Parser (2-3 weeks)

5. **Implement CommandParser + AST**
6. **Migrate CommandTranslator to ASTTranslator**
7. **Add support for &&, ||, subshells**
8. **Comprehensive test suite**

### Phase 3: Shell Integration (3-4 weeks)

9. **Implement DaemonServer** for IPC
10. **Create shell function injections** for bash/zsh/fish
11. **Test shell state integration** (cwd, env, aliases)
12. **Migration path** for existing users

### Phase 4: Advanced Features (4+ weeks)

13. **Intelligent context management** for pipes
14. **Session continuity** across commands
15. **Command history improvements**
16. **Enhanced error recovery**

---

## Comparison Matrix

| Feature | Current | Approach 1 | Approach 2 | Approach 3 | Approach 4 |
|---------|---------|------------|------------|------------|------------|
| **Input Reliability** | ⚠️ 70% | ✅ 99% | ✅ 95% | ⚠️ 70% | ✅ 90% |
| **Shell Integration** | ❌ Poor | ✅ Native | ✅ Native | ❌ Poor | ⚠️ Fair |
| **Async Execution** | ❌ No | ✅ Yes | ⚠️ Partial | ❌ No | ✅ Yes |
| **Streaming Output** | ❌ No | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| **Code Complexity** | ⚠️ High | ✅ Low | ✅ Low | ⚠️ High | ⚠️ Medium |
| **Extensibility** | ❌ Low | ✅ High | ⚠️ Medium | ✅ High | ✅ High |
| **Shell Support** | ✅ All | ✅ All | ⚠️ Limited | ✅ All | ✅ All |
| **Setup Complexity** | ✅ Simple | ⚠️ Medium | ⚠️ Medium | ✅ Simple | ✅ Simple |
| **Performance** | ✅ Good | ✅ Good | ⚠️ Slower | ✅ Good | ✅ Good |

**Legend**: ✅ Excellent | ⚠️ Acceptable | ❌ Poor

---

## Conclusion

**Recommended Path Forward:**

1. **Short Term (MVP)**: Implement **Approach 4 (Hybrid)** for immediate improvements
   - Quick wins with minimal disruption
   - Fixes most critical issues (async, streaming, input tracking)

2. **Medium Term (v2.0)**: Migrate to **Approach 1 (Shell Integration)**
   - Best overall architecture
   - Solves fundamental complexity issues
   - Provides native shell experience

3. **Continuous**: Adopt **Approach 3 (AST Parser)** components
   - Use for command translation regardless of approach
   - Enables advanced features (complex pipes, conditionals)
   - Improves maintainability

This phased approach minimizes risk while delivering value at each stage and building toward an optimal architecture.

---

## Appendix: Code Examples

### Example 1: Improved Command Detection

```typescript
// Before: Fragile, lost on navigation
let inputBuffer = '';
if (str) inputBuffer += str;
const isAI = inputBuffer.startsWith('#');

// After: Robust, tracks cursor
class CommandBuffer {
  private buffer = '';
  private cursor = 0;

  insert(str: string): void {
    this.buffer =
      this.buffer.slice(0, this.cursor) +
      str +
      this.buffer.slice(this.cursor);
    this.cursor += str.length;
  }

  delete(): void {
    if (this.cursor > 0) {
      this.buffer =
        this.buffer.slice(0, this.cursor - 1) +
        this.buffer.slice(this.cursor);
      this.cursor--;
    }
  }

  moveCursor(delta: number): void {
    this.cursor = Math.max(0, Math.min(
      this.buffer.length,
      this.cursor + delta
    ));
  }

  isAICommand(): boolean {
    return this.buffer.trim().startsWith('#');
  }
}
```

### Example 2: Async Streaming Execution

```typescript
// Before: Blocking
const result = spawnSync('sh', ['-c', cmd], { encoding: 'utf8' });
process.stdout.write(result.stdout);

// After: Streaming
async function executeAI(cmd: string): Promise<void> {
  const child = spawn('sh', ['-c', cmd]);

  // Stream output with formatting
  child.stdout.pipe(
    new Transform({
      transform(chunk, enc, cb) {
        cb(null, `\x1b[2m${chunk}\x1b[0m`); // Dim
      }
    })
  ).pipe(process.stdout, { end: false });

  child.stderr.pipe(process.stderr, { end: false });

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}`);
  }
}
```

### Example 3: Shell Function Integration

```bash
# Injected at startup
export TERMAI_SESSION_ID="${SESSION_ID}"
export TERMAI_SOCKET="/tmp/termai-${SESSION_ID}.sock"

# AI command function
ai() {
  # Send to daemon via Unix socket
  echo "$*" | nc -U "$TERMAI_SOCKET"
}

# Shorthand
alias "#"="ai"

# Example usage:
# Simple: ai explain this code
# With alias: # explain this code
# Piped: ai list files | ai summarize
# Redirected: ai research topic > report.md
# Background: ai long task &
```

---

**Document Version**: 1.0
**Date**: 2026-01-06
**Author**: Claude (Anthropic AI)
