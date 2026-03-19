# claude-code-acp-sdk

Programmatic TypeScript SDK for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Control Claude Code from your own scripts, CI pipelines, or applications — with streaming, multi-turn sessions, and permission callbacks.

Built on top of the [Agent Client Protocol (ACP)](https://agentclientprotocol.com) via the [`@zed-industries/claude-agent-acp`](https://github.com/zed-industries/claude-agent-acp) adapter.

```
Your code  -->  claude-code-acp-sdk  -->  ACP (stdio)  -->  claude-agent-acp  -->  Claude Code CLI
```

## Install

```bash
npm install claude-code-acp-sdk
```

### Prerequisites

- Node.js >= 18
- A working [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installation, authenticated via `claude auth`

## Quick Start

### One-Shot

```ts
import { ClaudeCode } from "claude-code-acp-sdk";

const claude = new ClaudeCode();

const result = await claude.send("What files are in this directory?", {
  cwd: process.cwd(),
});

console.log(result.text);
console.log(result.toolCalls); // tools Claude used
console.log(result.stopReason); // "end_turn", "max_tokens", etc.

await claude.destroy();
```

### Streaming

```ts
const claude = new ClaudeCode();

for await (const event of claude.stream("Fix the bug in auth.py", {
  cwd: "/path/to/project",
})) {
  switch (event.type) {
    case "text":
      if (event.content.type === "text") process.stdout.write(event.content.text);
      break;
    case "tool_call":
      console.log(`\n[tool] ${event.title}`);
      break;
    case "tool_call_update":
      if (event.status === "completed") console.log(`[done] ${event.toolCallId}`);
      break;
  }
}

await claude.destroy();
```

### Multi-Turn Sessions

```ts
const claude = new ClaudeCode();
const session = await claude.createSession({ cwd: process.cwd() });

const r1 = await session.send("Summarize the codebase");
console.log(r1.text);

const r2 = await session.send("Now add rate limiting to the API");
console.log(r2.text);
console.log(r2.toolCalls);

await session.close();
await claude.destroy();
```

### Permission Control

By default, all tool calls are auto-approved. Pass a `permissionHandler` to control what Claude is allowed to do:

```ts
const claude = new ClaudeCode({
  permissionHandler: async (request) => {
    console.log(`Claude wants to: ${request.title}`);
    console.log(`Details: ${request.description}`);

    // Inspect the options (allow_once, allow_always, reject_once, reject_always)
    for (const opt of request.options) {
      console.log(`  [${opt.optionId}] ${opt.name} (${opt.kind})`);
    }

    // Return the chosen option
    return { optionId: request.options[0].optionId };
  },
});
```

## API Overview

| Class / Method | Description |
|---|---|
| `new ClaudeCode(options?)` | Create the SDK instance. Manages the ACP subprocess. |
| `claude.send(text, sessionOpts)` | One-shot: send prompt, get collected result. |
| `claude.stream(text, sessionOpts)` | One-shot streaming: async iterable of events. |
| `claude.createSession(sessionOpts)` | Create a multi-turn session. |
| `claude.resumeSession(id, opts)` | Resume an existing session by ID. |
| `claude.listSessions(cwd?)` | List available sessions. |
| `claude.destroy()` | Shut down the connection and all sessions. |
| `session.send(text)` | Send prompt, collect full result as `TurnResult`. |
| `session.prompt(text)` | Send prompt, stream events via async iteration. |
| `session.on(listener)` | Register a global event listener. Returns unsubscribe fn. |
| `session.setMode(modeId)` | Switch mode (e.g. "code", "architect", "ask"). |
| `session.setModel(modelId)` | Switch model. |
| `session.cancel()` | Cancel the in-flight prompt turn. |
| `session.close()` | Close the session and free resources. |

## Event Types

Events are streamed from `session.prompt()` or `claude.stream()`:

| `event.type` | Description | Key Fields |
|---|---|---|
| `text` | Assistant text chunk | `content`, `messageId` |
| `thinking` | Extended thinking chunk | `content`, `messageId` |
| `tool_call` | New tool invocation | `toolCallId`, `title`, `kind`, `status` |
| `tool_call_update` | Update to existing tool call | `toolCallId`, `status`, `content` |
| `plan` | Agent execution plan | `entries[]` |
| `usage` | Context window update | `contextSize`, `contextUsed`, `cost` |
| `mode_change` | Mode switched | `modeId` |
| `session_info` | Session metadata update | `title` |
| `user_message` | Replayed user message | `content` |

## Configuration

```ts
const claude = new ClaudeCode({
  // Path to the ACP adapter binary (auto-resolved from node_modules by default)
  acpBinaryPath: "/custom/path/to/claude-agent-acp",

  // Environment variables for the subprocess
  env: {
    ANTHROPIC_API_KEY: "sk-ant-...",
    ANTHROPIC_BASE_URL: "https://custom-gateway.example.com",
  },

  // Custom permission handler (default: auto-approve)
  permissionHandler: async (request) => {
    return { optionId: "allow" };
  },

  // Logger for debug output
  logger: console,
});
```

## Documentation

See the [`docs/`](./docs) folder for detailed guides:

- [Architecture](./docs/architecture.md) -- how the SDK works under the hood
- [Sessions](./docs/sessions.md) -- multi-turn conversations, streaming, and lifecycle
- [Permissions](./docs/permissions.md) -- controlling tool access
- [Events](./docs/events.md) -- all event types and how to handle them

## Examples

See [`examples/`](./examples) for runnable scripts:

- [`01-one-shot.ts`](./examples/01-one-shot.ts) -- simple send/receive
- [`02-streaming.ts`](./examples/02-streaming.ts) -- real-time event streaming
- [`03-multi-turn.ts`](./examples/03-multi-turn.ts) -- multi-turn conversation
- [`04-permissions.ts`](./examples/04-permissions.ts) -- interactive permission handling
- [`05-event-listener.ts`](./examples/05-event-listener.ts) -- global event monitoring

## How It Works

This SDK does **not** call the Anthropic API directly. Instead, it:

1. Spawns the [`@zed-industries/claude-agent-acp`](https://github.com/zed-industries/claude-agent-acp) adapter as a child process
2. Communicates with it over **stdio** using the [Agent Client Protocol](https://agentclientprotocol.com) (JSON-RPC 2.0 / ndJSON)
3. The adapter internally uses the Claude Agent SDK to manage the Claude Code CLI

This means you get the full Claude Code experience -- all built-in tools (`Read`, `Edit`, `Bash`, `Grep`, etc.), `CLAUDE.md` settings, MCP servers, and session persistence -- all controlled programmatically.

## License

[MIT](./LICENSE)
