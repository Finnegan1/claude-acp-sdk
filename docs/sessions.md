# Sessions

Sessions represent stateful, multi-turn conversations with Claude Code. Each session maintains its own context -- Claude remembers what was said and done in previous turns.

## Creating a Session

```ts
import { ClaudeCode } from "claude-code-acp-sdk";

const claude = new ClaudeCode();
const session = await claude.createSession({
  cwd: "/path/to/project", // required, must be absolute
  mcpServers: [],           // optional MCP servers
});

console.log(session.id);    // unique session ID
console.log(session.modes);  // available modes (code, architect, ask, ...)
console.log(session.models); // available models
```

## Sending Prompts

### Collected Mode (`send`)

The simplest way. Sends a prompt and waits for the full result:

```ts
const result = await session.send("Explain what auth.py does");

result.text;       // full assistant response as a string
result.thinking;   // extended thinking content (if any)
result.toolCalls;  // array of ToolCallEvent objects
result.stopReason; // "end_turn" | "max_tokens" | "cancelled" | ...
result.usage;      // token usage (if available)
```

### Streaming Mode (`prompt`)

For real-time feedback. Returns a `PromptTurn` that is both an async iterable and has a `.result` promise:

```ts
const turn = session.prompt("Refactor the API layer");

// Stream events as they arrive
for await (const event of turn) {
  if (event.type === "text" && event.content.type === "text") {
    process.stdout.write(event.content.text);
  }
  if (event.type === "tool_call") {
    console.log(`Using tool: ${event.title}`);
  }
}

// Get the final result
const result = await turn.result;
console.log("Stop reason:", result.stopReason);
```

### Raw Content Blocks (`promptWithContent`)

For sending images, resource links, or other content types beyond plain text:

```ts
const turn = session.promptWithContent([
  { type: "text", text: "What's in this image?" },
  { type: "image", data: base64Data, mimeType: "image/png" },
]);
```

## Multi-Turn Conversations

Sessions maintain context across turns. Each `send()` or `prompt()` call is a new turn in the same conversation:

```ts
await session.send("Read the codebase and understand the architecture");
// Claude now knows the codebase

await session.send("Add input validation to the user registration endpoint");
// Claude remembers the architecture from turn 1

await session.send("Now write tests for what you just added");
// Claude remembers the code it wrote in turn 2
```

## One Turn at a Time

A session can only have one prompt in flight. Calling `prompt()` or `send()` while another is running will throw:

```ts
// This will throw:
const p1 = session.send("Do thing A");
const p2 = session.send("Do thing B"); // Error: A prompt is already in progress

// Do this instead:
await session.send("Do thing A");
await session.send("Do thing B");
```

## Cancelling

Cancel an in-flight prompt turn:

```ts
const turn = session.prompt("Do a really long task");

// Cancel after 10 seconds
setTimeout(() => session.cancel(), 10_000);

for await (const event of turn) {
  // Will stop receiving events after cancel
}

const result = await turn.result;
console.log(result.stopReason); // "cancelled"
```

## Changing Mode and Model

```ts
// Switch to architect mode (read-only planning)
await session.setMode("architect");

// Switch to a different model
await session.setModel("opus");
```

Available modes and models depend on the agent's capabilities and are exposed via `session.modes` and `session.models` after creation.

## Session Lifecycle

```ts
const session = await claude.createSession({ cwd: "..." });

// ... use the session ...

// Close when done (frees resources on the agent side)
await session.close();
```

If you don't close a session, it will be cleaned up when `claude.destroy()` is called.

## Resuming Sessions

If you have a session ID from a previous run:

```ts
const session = await claude.resumeSession("previous-session-id", {
  cwd: "/path/to/project",
});

// Continue the conversation
await session.send("Where were we?");
```

## Listing Sessions

```ts
const list = await claude.listSessions("/path/to/project");
console.log(list); // array of session metadata
```

## One-Shot Convenience

If you don't need multi-turn, use `claude.send()` or `claude.stream()` directly. These create a temporary session, send one prompt, and clean up:

```ts
// Collected
const result = await claude.send("What is this project?", { cwd: "." });

// Streaming
for await (const event of claude.stream("Fix the bug", { cwd: "." })) {
  // ...
}
```
