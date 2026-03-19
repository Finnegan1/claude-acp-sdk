/**
 * Example: Streaming — watch events arrive in real-time.
 */
import { ClaudeCode } from "../src/index.js";

async function main() {
  const claude = new ClaudeCode();

  for await (const event of claude.stream("List all TypeScript files", {
    cwd: process.cwd(),
  })) {
    switch (event.type) {
      case "text":
        if (event.content.type === "text") {
          process.stdout.write(event.content.text);
        }
        break;
      case "thinking":
        if (event.content.type === "text") {
          process.stderr.write(`[thinking] ${event.content.text}`);
        }
        break;
      case "tool_call":
        console.log(`\n[tool] ${event.title} (${event.kind ?? "unknown"})`);
        break;
      case "tool_call_update":
        if (event.status === "completed") {
          console.log(`[tool done] ${event.toolCallId}`);
        }
        break;
      case "usage":
        console.log(
          `\n[usage] context: ${event.contextUsed}/${event.contextSize}`
        );
        break;
    }
  }

  console.log("\n--- Done ---");
  await claude.destroy();
}

main().catch(console.error);
