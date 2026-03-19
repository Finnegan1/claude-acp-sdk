/**
 * Core ACP connection management.
 *
 * Spawns the claude-agent-acp binary as a subprocess and communicates
 * with it via the ACP protocol (JSON-RPC 2.0 over ndJSON stdio).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Agent,
  type Client,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type {
  ClaudeCodeOptions,
  Logger,
  PermissionHandler,
  PermissionRequest,
} from "./types.js";
import type { RequestPermissionOutcome } from "@agentclientprotocol/sdk";

const NOOP_LOGGER: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * Converts a Node.js Readable stream to a Web ReadableStream.
 */
function nodeToWebReadable(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => {
        controller.close();
      });
      nodeStream.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

/**
 * Converts a Node.js Writable stream to a Web WritableStream.
 */
function nodeToWebWritable(nodeStream: Writable): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise((resolve, reject) => {
        const ok = nodeStream.write(chunk, (err) => {
          if (err) reject(err);
        });
        if (ok) {
          resolve();
        } else {
          nodeStream.once("drain", resolve);
        }
      });
    },
    close() {
      return new Promise((resolve) => {
        nodeStream.end(resolve);
      });
    },
    abort(reason) {
      nodeStream.destroy(
        reason instanceof Error ? reason : new Error(String(reason))
      );
    },
  });
}

/**
 * Resolves the path to the claude-agent-acp binary.
 */
function resolveAcpBinaryPath(): string {
  // The binary is at node_modules/.bin/claude-agent-acp
  // or we can resolve the package's dist/index.js directly
  const pkgPath = import.meta.resolve(
    "@zed-industries/claude-agent-acp/dist/index.js"
  );
  // import.meta.resolve returns a file:// URL
  return new URL(pkgPath).pathname;
}

export type SessionUpdateHandler = (
  notification: SessionNotification
) => void;

export interface AcpConnection {
  /** The ACP client-side connection (implements the Agent interface for sending requests). */
  agent: Agent;
  /** Register a handler for session update notifications. */
  onSessionUpdate(handler: SessionUpdateHandler): void;
  /** The underlying child process. */
  process: ChildProcess;
  /** Promise that resolves when the connection closes. */
  closed: Promise<void>;
  /** AbortSignal that fires when the connection closes. */
  signal: AbortSignal;
  /** Kill the subprocess and close the connection. */
  destroy(): void;
}

/**
 * Spawns the claude-agent-acp subprocess and establishes an ACP connection.
 */
export async function createAcpConnection(
  options: ClaudeCodeOptions = {}
): Promise<AcpConnection> {
  const logger = options.logger ?? NOOP_LOGGER;
  const binaryPath = options.acpBinaryPath ?? resolveAcpBinaryPath();

  logger.debug("Spawning ACP adapter:", binaryPath);

  const child = spawn(process.execPath, [binaryPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...options.env,
    },
  });

  // Forward stderr from the ACP adapter to our logger
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) logger.debug("[acp-adapter]", text);
  });

  // Handle process errors
  child.on("error", (err) => {
    logger.error("ACP adapter process error:", err);
  });

  const stdout = child.stdout!;
  const stdin = child.stdin!;

  // ACP adapter writes TO stdout (we read from it) and reads FROM stdin (we write to it)
  // Note: from the client's perspective, output = what we write, input = what we read
  const outputStream = nodeToWebWritable(stdin);
  const inputStream = nodeToWebReadable(stdout);

  const stream = ndJsonStream(outputStream, inputStream);

  let sessionUpdateHandler: SessionUpdateHandler | null = null;
  const permissionHandler = options.permissionHandler;

  const clientSide = new ClientSideConnection(
    (agent: Agent): Client => ({
      async sessionUpdate(params: SessionNotification): Promise<void> {
        sessionUpdateHandler?.(params);
      },

      async requestPermission(
        params: RequestPermissionRequest
      ): Promise<RequestPermissionResponse> {
        const makeOutcome = (optionId: string): RequestPermissionOutcome => ({
          outcome: "selected" as const,
          optionId,
        });

        if (!permissionHandler) {
          // Auto-approve: pick the first "allow" option
          const allowOption = params.options.find(
            (o) => o.kind === "allow_once" || o.kind === "allow_always"
          );
          if (allowOption) {
            return { outcome: makeOutcome(allowOption.optionId) };
          }
          // Fallback: just pick the first option
          return { outcome: makeOutcome(params.options[0].optionId) };
        }

        const toolCall = params.toolCall;
        const request: PermissionRequest = {
          sessionId: params.sessionId,
          title: toolCall.title ?? "Permission requested",
          description: JSON.stringify(toolCall.rawInput ?? {}),
          options: params.options,
          raw: params,
        };

        const decision = await permissionHandler(request);
        return { outcome: makeOutcome(decision.optionId) };
      },
    }),
    stream
  );

  // Initialize the ACP connection
  logger.debug("Initializing ACP connection...");
  const initResponse = await clientSide.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: {
      name: "claude-code-acp-sdk",
      version: "0.1.0",
    },
    clientCapabilities: {},
  });
  logger.info(
    "ACP connection initialized:",
    initResponse.agentInfo?.name,
    initResponse.agentInfo?.version
  );

  return {
    agent: clientSide,
    onSessionUpdate(handler: SessionUpdateHandler) {
      sessionUpdateHandler = handler;
    },
    process: child,
    closed: clientSide.closed,
    signal: clientSide.signal,
    destroy() {
      child.kill("SIGTERM");
    },
  };
}
