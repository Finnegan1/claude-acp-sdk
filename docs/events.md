# Events

Events are emitted during a prompt turn as Claude thinks, writes, and uses tools. You receive them through streaming (`session.prompt()` or `claude.stream()`) or global listeners (`session.on()`).

## Consuming Events

### Via Streaming (async iteration)

```ts
const turn = session.prompt("Fix the bug");

for await (const event of turn) {
  console.log(event.type, event);
}
```

### Via Global Listener

```ts
const unsubscribe = session.on((event) => {
  console.log(event.type, event);
});

await session.send("Fix the bug"); // listener fires for all events
unsubscribe();
```

The global listener fires for every event across all prompt turns in the session. The streaming iterator only yields events for that specific turn.

## Event Reference

All events have a `type` field used as a discriminator.

### `text`

A chunk of the assistant's response text.

```ts
{
  type: "text",
  content: ContentBlock,  // usually { type: "text", text: "..." }
  messageId?: string,     // groups chunks into messages
}
```

Text arrives incrementally. Concatenate `content.text` from all `text` events to build the full response.

### `thinking`

A chunk of extended thinking / chain-of-thought content.

```ts
{
  type: "thinking",
  content: ContentBlock,
  messageId?: string,
}
```

### `user_message`

A replayed user message (e.g., when loading a session history).

```ts
{
  type: "user_message",
  content: ContentBlock,
  messageId?: string,
}
```

### `tool_call`

A new tool invocation has started.

```ts
{
  type: "tool_call",
  toolCallId: string,         // unique ID for this call
  title: string,              // e.g. "Read src/auth.py"
  kind?: ToolKind,            // "read" | "edit" | "execute" | "search" | ...
  status?: ToolCallStatus,    // "pending" | "in_progress" | "completed" | "failed"
  content?: ToolCallContent[],// initial content (may be empty)
  locations?: ToolCallLocation[], // files being accessed
  rawInput?: unknown,         // raw tool input parameters
  rawOutput?: unknown,        // raw tool output (usually populated later)
}
```

**`ToolKind` values:** `read`, `edit`, `delete`, `move`, `search`, `execute`, `think`, `fetch`, `switch_mode`, `other`

### `tool_call_update`

An update to an existing tool call (status change, output, content).

```ts
{
  type: "tool_call_update",
  toolCallId: string,          // matches the original tool_call
  title?: string | null,
  kind?: ToolKind | null,
  status?: ToolCallStatus | null,
  content?: ToolCallContent[] | null,
  locations?: ToolCallLocation[] | null,
  rawInput?: unknown,
  rawOutput?: unknown,
}
```

Only changed fields are populated. A typical lifecycle:

```
tool_call          { status: "pending", title: "Edit src/auth.py" }
tool_call_update   { status: "in_progress" }
tool_call_update   { status: "completed", content: [{ type: "diff", ... }] }
```

### `plan`

Claude's execution plan -- a list of tasks it intends to accomplish.

```ts
{
  type: "plan",
  entries: PlanEntry[],  // { content: string, status: "pending"|"in_progress"|"completed" }
}
```

Plans are sent as complete snapshots. Each update replaces the previous plan.

### `usage`

Context window and cost information.

```ts
{
  type: "usage",
  contextSize: number,     // total context window size in tokens
  contextUsed: number,     // tokens currently in use
  cost?: Cost | null,      // { amount: number, currency: string } (cumulative)
}
```

### `mode_change`

The session's operating mode changed (either by you or autonomously by the agent).

```ts
{
  type: "mode_change",
  modeId: string,  // e.g. "code", "architect", "ask"
}
```

### `session_info`

Session metadata was updated.

```ts
{
  type: "session_info",
  title?: string,  // session title (often set after the first prompt)
}
```

## Tool Call Content Types

The `content` field in `tool_call` and `tool_call_update` events contains an array of `ToolCallContent` items:

```ts
// Plain content (text, images)
{ type: "content", content: ContentBlock }

// File diff
{ type: "diff", path: string, oldText: string, newText: string }

// Terminal output reference
{ type: "terminal", terminalId: string }
```

## Pattern: Building a CLI Progress Display

```ts
for await (const event of session.prompt("Implement feature X")) {
  switch (event.type) {
    case "text":
      if (event.content.type === "text") {
        process.stdout.write(event.content.text);
      }
      break;

    case "thinking":
      // Optionally show thinking in a different style
      break;

    case "tool_call":
      process.stderr.write(`\n> ${event.title}\n`);
      break;

    case "tool_call_update":
      if (event.status === "completed") {
        process.stderr.write(`  done\n`);
      } else if (event.status === "failed") {
        process.stderr.write(`  FAILED\n`);
      }
      break;

    case "plan":
      process.stderr.write(`\nPlan:\n`);
      for (const entry of event.entries) {
        const icon = entry.status === "completed" ? "x" : " ";
        process.stderr.write(`  [${icon}] ${entry.content}\n`);
      }
      break;

    case "usage":
      if (event.cost) {
        process.stderr.write(
          `\nCost: ${event.cost.currency} ${event.cost.amount.toFixed(4)}\n`
        );
      }
      break;
  }
}
```
