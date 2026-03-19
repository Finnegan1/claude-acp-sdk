# Architecture

## Overview

`claude-code-acp-sdk` is a TypeScript wrapper that gives you programmatic control over Claude Code. It does not call the Anthropic API directly. Instead, it communicates with Claude Code through the **Agent Client Protocol (ACP)**.

```
┌───────────────────────┐       stdio (ndJSON)       ┌──────────────────────┐
│                       │  ◄──────────────────────►  │                      │
│  claude-code-acp-sdk  │        ACP protocol        │  claude-agent-acp    │
│  (your process)       │       (JSON-RPC 2.0)       │  (child process)     │
│                       │                            │                      │
└───────────────────────┘                            └──────────┬───────────┘
                                                                │
                                                                │ Claude Agent SDK
                                                                │
                                                      ┌─────────▼───────────┐
                                                      │                     │
                                                      │   Claude Code CLI   │
                                                      │                     │
                                                      └─────────────────────┘
```

## Layers

### 1. `ClaudeCode` (your entry point)

The `ClaudeCode` class is what you interact with. It manages:

- **Connection lifecycle** -- spawning the ACP adapter subprocess and initializing the protocol handshake
- **Session management** -- creating, resuming, and listing sessions
- **Convenience methods** -- `send()` and `stream()` for one-shot usage

Internally it holds a single `AcpConnection` that multiplexes all sessions over one subprocess.

### 2. `AcpConnection` (connection layer)

Defined in `src/connection.ts`. This layer:

1. **Spawns** the `@zed-industries/claude-agent-acp` binary as a child process with `stdio: ['pipe', 'pipe', 'pipe']`
2. **Converts** Node.js streams to Web Streams (required by the ACP SDK)
3. **Creates** a `ClientSideConnection` from `@agentclientprotocol/sdk` with an ndJSON transport
4. **Runs** the ACP `initialize` handshake (protocol version negotiation, capability exchange)
5. **Routes** incoming `session/update` notifications to the registered handler
6. **Routes** incoming `session/request_permission` requests to your permission handler (or auto-approves)

### 3. `Session` and `PromptTurn` (session layer)

Defined in `src/session.ts`. Each `Session` wraps an ACP session ID and provides:

- **`prompt(text)`** -- returns a `PromptTurn` (async iterable of events + `.result` promise)
- **`send(text)`** -- convenience that collects all events from `prompt()` into a `TurnResult`
- **`on(listener)`** -- global event listener for all turns in this session

`PromptTurn` bridges the ACP request/notification model into a clean async iterator:

```
1. Registers a session update handler on the connection
2. Fires agent.prompt() (ACP JSON-RPC request)
3. As session/update notifications arrive, maps them to SessionEvents and yields them
4. When the prompt() response comes back (with stopReason), signals end and resolves .result
```

### 4. Event mapping (events layer)

Defined in `src/events.ts`. The raw ACP `SessionNotification` contains a discriminated union (`sessionUpdate` field). The `mapSessionUpdate()` function flattens this into simple `SessionEvent` objects with a `type` field:

```
ACP SessionUpdate                    SDK SessionEvent
────────────────                     ────────────────
agent_message_chunk    ──────►       { type: "text", content, messageId }
agent_thought_chunk    ──────►       { type: "thinking", content, messageId }
tool_call              ──────►       { type: "tool_call", toolCallId, title, kind, ... }
tool_call_update       ──────►       { type: "tool_call_update", toolCallId, status, ... }
plan                   ──────►       { type: "plan", entries }
usage_update           ──────►       { type: "usage", contextSize, contextUsed, cost }
current_mode_update    ──────►       { type: "mode_change", modeId }
session_info_update    ──────►       { type: "session_info", title }
```

## The ACP Protocol

ACP (Agent Client Protocol) is a standardized protocol for communication between code editors and AI coding agents. It uses **JSON-RPC 2.0** over **newline-delimited JSON (ndJSON)** on stdio.

Key properties:

- **Bidirectional** -- both sides can send requests. The agent can ask the client for permission, file reads, terminal access, etc.
- **Session-based** -- conversations are organized into sessions with unique IDs
- **Streaming** -- progress is reported via `session/update` notifications during a prompt turn

This SDK acts as an ACP **client** (the role normally played by a code editor like Zed).

## Process Model

A single `ClaudeCode` instance spawns **one** child process. All sessions share that process. If the process dies, the connection is marked as closed and a new one is created on the next operation.

```ts
// One process, multiple sessions
const claude = new ClaudeCode();
const s1 = await claude.createSession({ cwd: "/project-a" });
const s2 = await claude.createSession({ cwd: "/project-b" });
// Both s1 and s2 use the same subprocess
```

## Dependencies

| Package | Role |
|---|---|
| `@agentclientprotocol/sdk` | ACP protocol types, `ClientSideConnection`, ndJSON transport |
| `@zed-industries/claude-agent-acp` | ACP adapter binary that wraps Claude Code CLI |
