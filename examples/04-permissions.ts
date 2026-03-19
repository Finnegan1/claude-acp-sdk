/**
 * Example: Custom permission handler — control which tools Claude can use.
 */
import * as readline from "node:readline/promises";
import { ClaudeCode, type PermissionRequest } from "../src/index.js";

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  const claude = new ClaudeCode({
    permissionHandler: async (request: PermissionRequest) => {
      console.error(`\n⚡ Permission requested: ${request.title}`);
      console.error(`   ${request.description}`);
      console.error("   Options:");
      for (const opt of request.options) {
        console.error(`     [${opt.optionId}] ${opt.name} (${opt.kind})`);
      }

      const answer = await rl.question("   Choose option ID: ");
      const chosen = request.options.find((o) => o.optionId === answer);
      if (!chosen) {
        console.error("   Invalid option, picking first allow option...");
        const fallback =
          request.options.find(
            (o) => o.kind === "allow_once" || o.kind === "allow_always"
          ) ?? request.options[0];
        return { optionId: fallback.optionId };
      }
      return { optionId: chosen.optionId };
    },
  });

  const result = await claude.send("Create a file called hello.txt with 'Hello World' in it", {
    cwd: process.cwd(),
  });

  console.log("\nResult:", result.text);
  console.log("Tool calls:", result.toolCalls.map((t) => t.title));

  rl.close();
  await claude.destroy();
}

main().catch(console.error);
