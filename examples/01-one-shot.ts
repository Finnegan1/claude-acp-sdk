/**
 * Example: One-shot prompt — send a question, get back the full answer.
 */
import { ClaudeCode } from "../src/index.js";

async function main() {
  const claude = new ClaudeCode();

  const result = await claude.send("What files are in this directory?", {
    cwd: process.cwd(),
  });

  console.log("Response:", result.text);
  console.log("Stop reason:", result.stopReason);
  console.log("Tool calls:", result.toolCalls.length);

  await claude.destroy();
}

main().catch(console.error);
