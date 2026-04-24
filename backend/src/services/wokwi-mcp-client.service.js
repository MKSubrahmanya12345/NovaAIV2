import crypto from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";

const sessions = new Map();

const resolveWokwiCliPath = () => {
  if (process.env.WOKWI_CLI_PATH?.trim()) {
    return process.env.WOKWI_CLI_PATH.trim();
  }

  const home = process.env.USERPROFILE || process.env.HOME || "";
  const windowsDefault = path.join(home, ".wokwi", "bin", "wokwi-cli.exe");
  const unixDefault = path.join(home, ".wokwi", "bin", "wokwi-cli");

  if (existsSync(windowsDefault)) return windowsDefault;
  if (existsSync(unixDefault)) return unixDefault;

  return "wokwi-cli";
};

const requireToken = () => {
  if (!process.env.WOKWI_CLI_TOKEN?.trim()) {
    throw new Error("WOKWI_CLI_TOKEN is required for MCP interactive sessions");
  }
};

const getSdk = async () => {
  const clientModule = await import("@modelcontextprotocol/sdk/client/index.js");
  const stdioModule = await import("@modelcontextprotocol/sdk/client/stdio.js");
  return {
    Client: clientModule.Client,
    StdioClientTransport: stdioModule.StdioClientTransport
  };
};

export const startWokwiMcpSession = async ({ projectPath, quiet = true }) => {
  requireToken();

  const { Client, StdioClientTransport } = await getSdk();
  const cliPath = resolveWokwiCliPath();
  const args = ["mcp"];

  if (quiet) {
    args.push("--quiet");
  }

  if (projectPath) {
    args.push(projectPath);
  }

  const transport = new StdioClientTransport({
    command: cliPath,
    args,
    env: {
      ...process.env,
      WOKWI_CLI_TOKEN: process.env.WOKWI_CLI_TOKEN
    }
  });

  const client = new Client(
    {
      name: "NovaAI-wokwi-mcp-client",
      version: "1.0.0"
    },
    {
      capabilities: {}
    }
  );

  await client.connect(transport);

  const sessionId = crypto.randomUUID();
  const tools = await client.listTools();

  sessions.set(sessionId, {
    sessionId,
    projectPath: projectPath || ".",
    createdAt: new Date(),
    client,
    transport,
    availableTools: tools?.tools || []
  });

  return {
    sessionId,
    projectPath: projectPath || ".",
    availableTools: (tools?.tools || []).map((tool) => ({
      name: tool.name,
      description: tool.description || ""
    }))
  };
};

export const listWokwiMcpSessions = () => {
  return [...sessions.values()].map((session) => ({
    sessionId: session.sessionId,
    projectPath: session.projectPath,
    createdAt: session.createdAt,
    toolCount: session.availableTools.length
  }));
};

export const callWokwiMcpTool = async ({ sessionId, tool, argumentsInput = {} }) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("MCP session not found");
  }

  const result = await session.client.callTool({
    name: tool,
    arguments: argumentsInput
  });

  return {
    sessionId,
    tool,
    result
  };
};

export const stopWokwiMcpSession = async (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return { stopped: false, reason: "Session not found" };
  }

  try {
    await session.client.close();
  } catch {
    // no-op
  }

  sessions.delete(sessionId);
  return { stopped: true };
};
