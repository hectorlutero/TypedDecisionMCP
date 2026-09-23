import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { decide } from "./decide.js";
import { DecideError } from "./contract.js";

const inputShape = {
  state: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
  preset: z
    .enum(["comando", "subagente", "diff", "ficheiro", "commit", "pacote"])
    .optional(),
  questions: z.record(z.string(), z.unknown()).optional()
};

export function createServer(): McpServer {
  const server = new McpServer({ name: "TypedDecisionMCP", version: "0.1.0" });
  server.tool(
    "decidir",
    "Typed local decision over state. Presets: comando, subagente, diff, ficheiro, commit, pacote. Returns yesno/choice/score plus action auto|review|stop. Do not invent probabilities in text.",
    inputShape,
    async (args) => {
      try {
        const result = await decide(args);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof DecideError ? `${err.code}: ${err.message}` : String(err);
        return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
      }
    }
  );
  return server;
}
