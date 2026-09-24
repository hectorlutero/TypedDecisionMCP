#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getLogitEngine, isEngineWarm } from "./engine/logits.js";
import { resolveModelPath } from "./model-path.js";
import { createServer } from "./server.js";

const host = process.env.DECIDIR_HTTP_HOST ?? "127.0.0.1";
const port = Number(process.env.DECIDIR_HTTP_PORT ?? 8788);
const token = process.env.DECIDIR_HTTP_TOKEN;

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
  void getLogitEngine()
    .then(() => console.error("TypedDecisionMCP warm=true"))
    .catch((err) => console.error("TypedDecisionMCP warm failed", err));
});
