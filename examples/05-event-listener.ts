/**
 * Example: Global event listeners — monitor all activity across turns.
 */
import { ClaudeCode } from "../src/index.js";

async function main() {
  const claude = new ClaudeCode({
    logger: {
      debug: () => {},
      info: (...args) => console.error("[info]", ...args),
      warn: (...args) => console.error("[warn]", ...args),
      error: (...args) => console.error("[error]", ...args),
    },
  });

  const session = await claude.createSession({ cwd: process.cwd() });

  // Register a global listener for all events in this session
  const unsubscribe = session.on((event) => {
    switch (event.type) {
      case "tool_call":
        console.error(`📦 Tool: ${event.title} [${event.kind}]`);
        break;
      case "tool_call_update":
        if (event.status) {
          console.error(`   ↳ ${event.toolCallId}: ${event.status}`);
        }
        break;
      case "plan":
        console.error(
          `📋 Plan: ${event.entries.map((e) => e.content).join(", ")}`
        );
        break;
    }
  });

  // The listener fires for all prompt turns
  await session.send("What is the project structure?");
  await session.send("How many lines of code are there?");

  unsubscribe();
  await session.close();
  await claude.destroy();
}

main().catch(console.error);
