/**
 * ClaudeCode — the main entry point for the SDK.
 *
 * Creates and manages ACP connections and sessions.
 */

import type { ListSessionsRequest } from "@agentclientprotocol/sdk";
import {
  createAcpConnection,
  type AcpConnection,
} from "./connection.js";
import { Session } from "./session.js";
import type {
  ClaudeCodeOptions,
  SessionOptions,
  TurnResult,
  Logger,
} from "./types.js";

const NOOP_LOGGER: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export class ClaudeCode {
  private readonly options: ClaudeCodeOptions;
  private readonly logger: Logger;
  private connection: AcpConnection | null = null;
  private sessions: Map<string, Session> = new Map();

  constructor(options: ClaudeCodeOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? NOOP_LOGGER;
  }

  /**
   * Ensure we have an active ACP connection.
   */
  private async ensureConnection(): Promise<AcpConnection> {
    if (this.connection && !this.connection.signal.aborted) {
      return this.connection;
    }

    this.logger.debug("Creating new ACP connection...");
    this.connection = await createAcpConnection(this.options);

    // Auto-reconnect handling
    this.connection.closed.then(() => {
      this.logger.info("ACP connection closed");
      this.connection = null;
    });

    return this.connection;
  }

  /**
   * Create a new session for multi-turn conversation.
   *
   * @example
   * ```ts
   * const claude = new ClaudeCode();
   * const session = await claude.createSession({ cwd: '/path/to/project' });
   *
   * const r1 = await session.send('Summarize the codebase');
   * console.log(r1.text);
   *
   * const r2 = await session.send('Now add rate limiting');
   * console.log(r2.toolCalls);
   *
   * await session.close();
   * ```
   */
  async createSession(options: SessionOptions): Promise<Session> {
    const conn = await this.ensureConnection();

    const response = await conn.agent.newSession({
      cwd: options.cwd,
      mcpServers: options.mcpServers ?? [],
      _meta: options.meta ?? undefined,
    });

    const session = new Session(
      response.sessionId,
      options.cwd,
      conn,
      this.logger
    );
    session.modes = response.modes;
    session.models = response.models;

    this.sessions.set(response.sessionId, session);

    this.logger.info("Session created:", response.sessionId);
    return session;
  }

  /**
   * Resume an existing session by ID.
   */
  async resumeSession(
    sessionId: string,
    options: SessionOptions
  ): Promise<Session> {
    const conn = await this.ensureConnection();

    if (conn.agent.unstable_resumeSession) {
      const response = await conn.agent.unstable_resumeSession({
        sessionId,
        cwd: options.cwd,
        mcpServers: options.mcpServers ?? [],
      });

      const session = new Session(
        response.sessionId,
        options.cwd,
        conn,
        this.logger
      );
      session.modes = response.modes;
      session.models = response.models;

      this.sessions.set(response.sessionId, session);
      return session;
    }

    throw new Error("Session resuming is not supported by the agent");
  }

  /**
   * List available sessions.
   */
  async listSessions(cwd?: string) {
    const conn = await this.ensureConnection();

    if (conn.agent.listSessions) {
      const params: ListSessionsRequest = {};
      if (cwd) {
        (params as Record<string, unknown>).cwd = cwd;
      }
      return conn.agent.listSessions(params);
    }

    throw new Error("Session listing is not supported by the agent");
  }

  /**
   * One-shot convenience method: send a prompt and get back the full result.
   * Creates a temporary session, sends the prompt, and closes the session.
   *
   * @example
   * ```ts
   * const claude = new ClaudeCode();
   * const result = await claude.send('What does auth.py do?', {
   *   cwd: '/path/to/project'
   * });
   * console.log(result.text);
   * ```
   */
  async send(text: string, options: SessionOptions): Promise<TurnResult> {
    const session = await this.createSession(options);
    try {
      return await session.send(text);
    } finally {
      await session.close().catch(() => {});
    }
  }

  /**
   * One-shot streaming: create a temporary session and stream events.
   *
   * @example
   * ```ts
   * const claude = new ClaudeCode();
   * for await (const event of claude.stream('Fix the bug', { cwd: '.' })) {
   *   if (event.type === 'text') process.stdout.write(event.content.text);
   * }
   * ```
   */
  async *stream(text: string, options: SessionOptions) {
    const session = await this.createSession(options);
    try {
      const turn = session.prompt(text);
      yield* turn;
      await turn.result;
    } finally {
      await session.close().catch(() => {});
    }
  }

  /**
   * Shut down the ACP connection and all sessions.
   */
  async destroy(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.close().catch(() => {});
    }
    this.sessions.clear();
    this.connection?.destroy();
    this.connection = null;
  }
}
