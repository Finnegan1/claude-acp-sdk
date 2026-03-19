/**
 * Session — a stateful, multi-turn conversation with Claude Code.
 *
 * Sessions are created via ClaudeCode.createSession() and provide methods
 * for sending prompts (streaming or collected), changing modes/models,
 * and cancelling in-flight turns.
 */

import type {
  Agent,
  ContentBlock,
  SessionNotification,
  SessionModeState,
  SessionModelState,
} from "@agentclientprotocol/sdk";
import type { AcpConnection, SessionUpdateHandler } from "./connection.js";
import { mapSessionUpdate } from "./events.js";
import type {
  SessionEvent,
  PromptResult,
  TurnResult,
  ToolCallEvent,
  Logger,
} from "./types.js";

const NOOP_LOGGER: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * Extracts text from a ContentBlock if it's a text block.
 */
function textFromBlock(block: ContentBlock): string {
  if (block.type === "text") {
    return block.text;
  }
  return "";
}

export class Session {
  readonly id: string;
  readonly cwd: string;

  private readonly connection: AcpConnection;
  private readonly agent: Agent;
  private readonly logger: Logger;

  /** Available modes for this session (set after creation). */
  modes?: SessionModeState | null;
  /** Available models for this session (set after creation). */
  models?: SessionModelState | null;

  private eventListeners: Array<(event: SessionEvent) => void> = [];
  private promptInProgress = false;

  constructor(
    id: string,
    cwd: string,
    connection: AcpConnection,
    logger?: Logger
  ) {
    this.id = id;
    this.cwd = cwd;
    this.connection = connection;
    this.agent = connection.agent;
    this.logger = logger ?? NOOP_LOGGER;
  }

  /**
   * Send a prompt and stream back events as they arrive.
   *
   * Returns an async iterable of SessionEvent objects and resolves
   * the prompt result (stop reason + usage) when the turn completes.
   *
   * @example
   * ```ts
   * const turn = session.prompt('Fix the bug in auth.py');
   * for await (const event of turn) {
   *   if (event.type === 'text') process.stdout.write(textOf(event.content));
   * }
   * const result = await turn.result;
   * ```
   */
  prompt(text: string): PromptTurn {
    if (this.promptInProgress) {
      throw new Error(
        "A prompt is already in progress. Wait for it to complete or cancel it first."
      );
    }
    this.promptInProgress = true;

    const contentBlocks: ContentBlock[] = [
      { type: "text" as const, text } as ContentBlock,
    ];

    return new PromptTurn(
      this.id,
      contentBlocks,
      this.agent,
      this.connection,
      this.eventListeners,
      this.logger,
      () => {
        this.promptInProgress = false;
      }
    );
  }

  /**
   * Send a prompt with raw content blocks.
   */
  promptWithContent(content: ContentBlock[]): PromptTurn {
    if (this.promptInProgress) {
      throw new Error(
        "A prompt is already in progress. Wait for it to complete or cancel it first."
      );
    }
    this.promptInProgress = true;

    return new PromptTurn(
      this.id,
      content,
      this.agent,
      this.connection,
      this.eventListeners,
      this.logger,
      () => {
        this.promptInProgress = false;
      }
    );
  }

  /**
   * Send a prompt and collect all events, returning a TurnResult
   * with the full text, thinking, tool calls, etc.
   */
  async send(text: string): Promise<TurnResult> {
    const turn = this.prompt(text);
    let fullText = "";
    let fullThinking = "";
    const toolCalls: ToolCallEvent[] = [];

    for await (const event of turn) {
      if (event.type === "text") {
        fullText += textFromBlock(event.content);
      } else if (event.type === "thinking") {
        fullThinking += textFromBlock(event.content);
      } else if (event.type === "tool_call") {
        toolCalls.push(event);
      }
    }

    const result = await turn.result;

    return {
      text: fullText,
      thinking: fullThinking,
      toolCalls,
      stopReason: result.stopReason,
      usage: result.usage,
    };
  }

  /**
   * Register a listener for all session events (from any prompt turn).
   */
  on(listener: (event: SessionEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx >= 0) this.eventListeners.splice(idx, 1);
    };
  }

  /**
   * Cancel the current prompt turn.
   */
  async cancel(): Promise<void> {
    await this.agent.cancel({ sessionId: this.id });
    this.promptInProgress = false;
  }

  /**
   * Change the session's operating mode (e.g., "code", "architect", "ask").
   */
  async setMode(modeId: string): Promise<void> {
    if (this.agent.setSessionMode) {
      await this.agent.setSessionMode({ sessionId: this.id, modeId });
    }
  }

  /**
   * Change the session's model.
   */
  async setModel(modelId: string): Promise<void> {
    if (this.agent.unstable_setSessionModel) {
      await this.agent.unstable_setSessionModel({
        sessionId: this.id,
        modelId,
      });
    }
  }

  /**
   * Close this session and free resources on the agent side.
   */
  async close(): Promise<void> {
    if (this.agent.unstable_closeSession) {
      await this.agent.unstable_closeSession({ sessionId: this.id });
    }
  }
}

/**
 * Represents an in-flight prompt turn.
 *
 * Implements AsyncIterable<SessionEvent> for streaming, and exposes
 * a `.result` promise for the final PromptResult.
 */
export class PromptTurn implements AsyncIterable<SessionEvent> {
  /** Resolves when the prompt turn completes. */
  readonly result: Promise<PromptResult>;

  private readonly sessionId: string;
  private readonly content: ContentBlock[];
  private readonly agent: Agent;
  private readonly connection: AcpConnection;
  private readonly globalListeners: Array<(event: SessionEvent) => void>;
  private readonly logger: Logger;
  private readonly onComplete: () => void;

  private resolveResult!: (result: PromptResult) => void;
  private rejectResult!: (error: Error) => void;
  private eventQueue: Array<SessionEvent | null> = []; // null = end sentinel
  private eventWaiter: ((event: SessionEvent | null) => void) | null = null;
  private started = false;
  private finished = false;

  constructor(
    sessionId: string,
    content: ContentBlock[],
    agent: Agent,
    connection: AcpConnection,
    globalListeners: Array<(event: SessionEvent) => void>,
    logger: Logger,
    onComplete: () => void
  ) {
    this.sessionId = sessionId;
    this.content = content;
    this.agent = agent;
    this.connection = connection;
    this.globalListeners = globalListeners;
    this.logger = logger;
    this.onComplete = onComplete;

    this.result = new Promise<PromptResult>((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });
  }

  private pushEvent(event: SessionEvent | null): void {
    if (this.eventWaiter) {
      const waiter = this.eventWaiter;
      this.eventWaiter = null;
      waiter(event);
    } else {
      this.eventQueue.push(event);
    }
  }

  private pullEvent(): Promise<SessionEvent | null> {
    if (this.eventQueue.length > 0) {
      return Promise.resolve(this.eventQueue.shift()!);
    }
    return new Promise<SessionEvent | null>((resolve) => {
      this.eventWaiter = resolve;
    });
  }

  private start(): void {
    if (this.started) return;
    this.started = true;

    // Register for session updates
    this.connection.onSessionUpdate(
      (notification: SessionNotification): void => {
        // Only handle updates for our session
        if (notification.sessionId !== this.sessionId) return;

        const event = mapSessionUpdate(notification);
        if (event) {
          // Notify global listeners
          for (const listener of this.globalListeners) {
            try {
              listener(event);
            } catch (err) {
              this.logger.error("Event listener error:", err);
            }
          }
          // Push to the async iterator
          this.pushEvent(event);
        }
      }
    );

    // Fire the prompt request
    this.agent
      .prompt({
        sessionId: this.sessionId,
        prompt: this.content,
      })
      .then((response) => {
        this.finished = true;
        this.onComplete();
        // Signal end of events
        this.pushEvent(null);
        this.resolveResult({
          stopReason: response.stopReason,
          usage: response.usage,
        });
      })
      .catch((err) => {
        this.finished = true;
        this.onComplete();
        this.pushEvent(null);
        this.rejectResult(
          err instanceof Error ? err : new Error(String(err))
        );
      });
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SessionEvent> {
    this.start();

    while (true) {
      const event = await this.pullEvent();
      if (event === null) break;
      yield event;
    }
  }
}
