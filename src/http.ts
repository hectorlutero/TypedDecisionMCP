#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getDecisionEngine } from "./decide.js";
import { isEngineWarm } from "./engine/logits.js";
import { resolveModelPath } from "./model-path.js";
import { envFirst } from "./env.js";
import { createServer } from "./server.js";

const host = envFirst(process.env, "DECIDE_HTTP_HOST", "DECIDIR_HTTP_HOST") ?? "127.0.0.1";
const port = Number(envFirst(process.env, "DECIDE_HTTP_PORT", "DECIDIR_HTTP_PORT") ?? 8788);
const token = envFirst(process.env, "DECIDE_HTTP_TOKEN", "DECIDIR_HTTP_TOKEN");

const http = createHttpServer(async (req, res) => {
  if (req.url === "/health") {
    const warm = isEngineWarm();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        model_loaded: warm || existsSync(resolveModelPath()),
        warm
      })
    );
    return;
  }
  if (token) {
    const header = req.headers.authorization ?? "";
    if (header !== `Bearer ${token}`) {
      res.writeHead(401).end("unauthorized");
      return;
    }
  }
  if (req.method === "POST" && (req.url === "/mcp" || req.url === "/")) {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }
  res.writeHead(404).end("not found");
});

http.listen(port, host, () => {
  console.error(`TypedDecisionMCP http://${host}:${port}/mcp`);
  void getDecisionEngine()
    .then(() => console.error("TypedDecisionMCP warm=true"))
    .catch((err) => console.error("TypedDecisionMCP warm failed", err));
});
