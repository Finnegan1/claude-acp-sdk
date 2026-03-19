# Permissions

Claude Code uses tools like `Bash`, `Edit`, `Write`, and `WebFetch` to accomplish tasks. Some of these tools can modify your filesystem or execute commands. The permission system lets you control what Claude is allowed to do.

## Default Behavior

By default, **all tool calls are auto-approved**. The SDK picks the first "allow" option from the permission request:

```ts
const claude = new ClaudeCode();
// Claude can freely read, write, execute commands, etc.
```

This is convenient for scripting and CI, but you may want more control in interactive or security-sensitive contexts.

## Custom Permission Handler

Pass a `permissionHandler` to `ClaudeCode` to intercept every permission request:

```ts
const claude = new ClaudeCode({
  permissionHandler: async (request) => {
    // request.title       -- what Claude wants to do (e.g. "Edit src/auth.py")
    // request.description -- details (serialized tool input)
    // request.sessionId   -- which session this is for
    // request.options     -- array of PermissionOption objects
    // request.raw         -- the full ACP RequestPermissionRequest

    return { optionId: chosenOption.optionId };
  },
});
```

## Permission Options

Each permission request comes with an array of options. Each option has:

| Field | Type | Description |
|---|---|---|
| `optionId` | `string` | Unique ID to return in your response |
| `name` | `string` | Human-readable label (e.g. "Allow once") |
| `kind` | `PermissionOptionKind` | `"allow_once"`, `"allow_always"`, `"reject_once"`, or `"reject_always"` |

Typical options look like:

```
[allow_once]    "Allow"         -- permit this one tool call
[allow_always]  "Always allow"  -- permit this tool for the rest of the session
[reject_once]   "Deny"          -- reject this one tool call
[reject_always] "Always deny"   -- reject this tool for the rest of the session
```

## Example: Interactive Terminal Prompt

```ts
import * as readline from "node:readline/promises";
import { ClaudeCode, type PermissionRequest } from "claude-code-acp-sdk";

const rl = readline.createInterface({ input: process.stdin, output: process.stderr });

const claude = new ClaudeCode({
  permissionHandler: async (request: PermissionRequest) => {
    console.error(`\nClaude wants to: ${request.title}`);
    for (const opt of request.options) {
      console.error(`  [${opt.optionId}] ${opt.name} (${opt.kind})`);
    }

    const answer = await rl.question("Choose: ");
    const chosen = request.options.find((o) => o.optionId === answer);

    return { optionId: chosen?.optionId ?? request.options[0].optionId };
  },
});
```

## Example: Allow Reads, Prompt for Writes

```ts
const claude = new ClaudeCode({
  permissionHandler: async (request) => {
    const raw = request.raw;
    const toolName = raw.toolCall.title ?? "";

    // Auto-approve read-only tools
    if (toolName.startsWith("Read") || toolName.startsWith("Glob") || toolName.startsWith("Grep")) {
      const allow = request.options.find((o) => o.kind === "allow_once");
      return { optionId: allow!.optionId };
    }

    // Reject destructive bash commands
    const input = JSON.stringify(raw.toolCall.rawInput ?? {});
    if (input.includes("rm -rf") || input.includes("DROP TABLE")) {
      const deny = request.options.find((o) => o.kind === "reject_always");
      return { optionId: deny!.optionId };
    }

    // Default: allow once
    const allow = request.options.find((o) => o.kind === "allow_once");
    return { optionId: allow!.optionId };
  },
});
```

## Example: Auto-Approve Everything (Explicit)

Equivalent to the default behavior, but explicit:

```ts
const claude = new ClaudeCode({
  permissionHandler: async (request) => {
    const allow =
      request.options.find((o) => o.kind === "allow_always") ??
      request.options.find((o) => o.kind === "allow_once") ??
      request.options[0];
    return { optionId: allow.optionId };
  },
});
```

## Timeout Considerations

The ACP protocol waits for the permission response before continuing. If your handler takes a long time (e.g., waiting for user input), Claude Code will block on that tool call. Consider adding a timeout:

```ts
permissionHandler: async (request) => {
  const result = await Promise.race([
    askUser(request),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 30_000)
    ),
  ]).catch(() => {
    // On timeout, deny
    const deny = request.options.find((o) => o.kind === "reject_once");
    return { optionId: deny!.optionId };
  });

  return result;
},
```
