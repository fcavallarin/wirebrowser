// MCP server exposing Wirebrowser to local AI agents (e.g. Claude Code).
//
// Security model: the tools can run arbitrary JavaScript in the browser
// pages and read their memory, so the server
//  - is off unless enabled in the settings,
//  - listens on 127.0.0.1 only,
//  - requires a bearer token,
//  - rejects requests whose Host or Origin header is not the local server
//    (DNS rebinding, requests from web pages).
//
// Transport: Streamable HTTP in stateless mode (one MCP server instance per
// request, JSON responses). Tools are serialized with a single lock because
// they share the browser and its debugger.

import http from "node:http";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "#src/app/mcp/mcp-tools.js";
import { Mutex } from "#src/app/mcp/mcp-utils.js";

export const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const INSTRUCTIONS = [
  "Wirebrowser instruments the JavaScript of the pages open in its browser through the Chrome",
  "DevTools Protocol. Typical flow: list_pages, navigate, search_sources to find the code,",
  "get_source_window to read it, run_with_hooks to observe or change values at runtime",
  "(arguments, locals, return values) while a trigger makes the page run the code,",
  "search_live_objects / evaluate to inspect state, origin_trace to find where a value is created.",
  "Locations (line, col) are 1-based and document-relative everywhere.",
].join(" ");

const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();

export const generateMcpToken = () => crypto.randomBytes(24).toString("base64url");

class WirebrowserMcpServer {
  constructor({ pagesManager, modulesManager, version = "0.0.0" }) {
    this.pagesManager = pagesManager;
    this.modulesManager = modulesManager;
    this.version = version;
    this.lock = new Mutex();
    this.httpServer = null;
    this.config = null;
  }

  isRunning = () => {
    return this.httpServer !== null;
  };

  getUrl = () => {
    return this.config ? `http://127.0.0.1:${this.config.port}${MCP_PATH}` : null;
  };

  start = async ({ port, token }) => {
    if (typeof token !== "string" || token.length < 16) {
      throw new Error("A token of at least 16 characters is required");
    }
    await this.stop();
    const config = {
      port,
      tokenDigest: digest(token),
      allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
      allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
    };
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res, config).catch((e) => {
        console.error("[MCP]", e);
        if (!res.headersSent) {
          this.sendError(res, 500, "Internal server error");
        }
      });
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.httpServer = server;
    this.config = config;
  };

  stop = async () => {
    if (!this.httpServer) {
      return;
    }
    const server = this.httpServer;
    this.httpServer = null;
    this.config = null;
    await new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  };

  sendError = (res, status, message) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
  };

  isAuthorized = (req, config) => {
    const header = req.headers.authorization || "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) {
      return false;
    }
    // Compare digests: constant time, and no length leak
    return crypto.timingSafeEqual(digest(m[1].trim()), config.tokenDigest);
  };

  readJsonBody = (req) => {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error("Request body too large"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  };

  createMcpServer = () => {
    const server = new McpServer(
      { name: "wirebrowser", version: this.version },
      { instructions: INSTRUCTIONS }
    );
    registerTools(server, {
      pagesManager: this.pagesManager,
      modulesManager: this.modulesManager,
      lock: this.lock,
    });
    return server;
  };

  handleRequest = async (req, res, config) => {
    const { pathname } = new URL(req.url, "http://127.0.0.1");
    if (pathname !== MCP_PATH) {
      return this.sendError(res, 404, "Not found");
    }
    if (!config.allowedHosts.includes(req.headers.host)) {
      return this.sendError(res, 403, "Invalid Host header");
    }
    if (req.headers.origin !== undefined && !config.allowedOrigins.includes(req.headers.origin)) {
      return this.sendError(res, 403, "Invalid Origin header");
    }
    if (!this.isAuthorized(req, config)) {
      return this.sendError(res, 401, "Unauthorized");
    }
    if (req.method !== "POST") {
      // Stateless server: no SSE stream (GET) and no sessions to delete
      res.setHeader("Allow", "POST");
      return this.sendError(res, 405, "Method not allowed");
    }

    let body;
    try {
      body = await this.readJsonBody(req);
    } catch (e) {
      return this.sendError(res, 400, e.message);
    }

    const mcpServer = this.createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  };
}

export default WirebrowserMcpServer;
