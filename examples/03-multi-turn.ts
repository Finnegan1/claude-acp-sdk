/**
 * Example: Multi-turn session — have a conversation across multiple prompts.
 */
import { ClaudeCode } from "../src/index.js";

async function main() {
  const claude = new ClaudeCode();
  const session = await claude.createSession({ cwd: process.cwd() });

  console.log("Session created:", session.id);
  console.log("Available modes:", JSON.stringify(session.modes));

  // First turn
  const r1 = await session.send("Read package.json and summarize what this project does");
  console.log("\n--- Turn 1 ---");
  console.log(r1.text);
  console.log(`(${r1.toolCalls.length} tool calls, stop: ${r1.stopReason})`);

  // Second turn (continues the same session context)
  const r2 = await session.send("What dependencies does it have?");
  console.log("\n--- Turn 2 ---");
  console.log(r2.text);

  await session.close();
  await claude.destroy();
}

main().catch(console.error);
