import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { decide } from "./decide.js";
import { DecideError } from "./contract.js";

const inputShape = {
  state: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
  preset: z
    .enum([
      "command",
      "subagent",
      "diff",
      "file",
      "commit",
      "bundle",
      "comando",
      "subagente",
      "ficheiro",
      "pacote"
    ])
    .optional(),
  questions: z.record(z.string(), z.unknown()).optional()
};

const TOOL_DESCRIPTION =
  "Typed local decision over state. Presets: command, subagent, diff, file, commit, bundle. Returns yesno/choice/score plus action auto|review|stop. Do not invent probabilities in text.";

async function handleDecide(args: {
  state: string | Record<string, unknown> | unknown[];
  preset?:
    | "command"
    | "subagent"
    | "diff"
    | "file"
    | "commit"
    | "bundle"
    | "comando"
    | "subagente"
    | "ficheiro"
    | "pacote";
  questions?: Record<string, unknown>;
}) {
  try {
    const result = await decide(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  } catch (err) {
    const message = err instanceof DecideError ? `${err.code}: ${err.message}` : String(err);
    return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "TypedDecisionMCP", version: "0.1.0" });
  server.tool("decide", TOOL_DESCRIPTION, inputShape, handleDecide);
  server.tool(
    "decidir",
    "Alias of decide (formerly the Portuguese tool name). Same handler and English response keys.",
    inputShape,
    handleDecide
  );
  return server;
}
