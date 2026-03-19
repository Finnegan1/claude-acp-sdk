/**
 * Public types for the claude-code-acp-sdk package.
 *
 * These are simplified, user-friendly types that wrap the raw ACP protocol types.
 */

import type {
  ToolKind,
  ToolCallStatus,
  ToolCallContent,
  ToolCallLocation,
  ContentBlock,
  StopReason,
  Usage,
  Cost,
  PlanEntry,
  SessionId,
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionModeId,
  ModelId,
  McpServer,
} from "@agentclientprotocol/sdk";

// ─── Configuration ───────────────────────────────────────────────────────────

export interface ClaudeCodeOptions {
  /**
   * Path to the claude-agent-acp binary. If not provided, resolves from node_modules.
   */
  acpBinaryPath?: string;

  /**
   * Environment variables to pass to the ACP subprocess.
   * Use this for ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, etc.
   */
  env?: Record<string, string>;

  /**
   * Permission handler. Called when Claude Code needs approval for a tool call.
   * If not provided, all permission requests are auto-approved.
   */
  permissionHandler?: PermissionHandler;

  /**
   * Logger for debug output. Defaults to no logging.
   */
  logger?: Logger;
}

export interface SessionOptions {
  /**
   * Working directory for this session. Must be an absolute path.
   */
  cwd: string;

  /**
   * MCP servers to connect to.
   */
  mcpServers?: McpServer[];

  /**
   * Additional metadata to pass to the ACP adapter.
   */
  meta?: Record<string, unknown>;
}

// ─── Permission Handling ─────────────────────────────────────────────────────

export interface PermissionRequest {
  sessionId: string;
  title: string;
  description: string;
  options: PermissionOption[];
  raw: RequestPermissionRequest;
}

export type PermissionHandler = (
  request: PermissionRequest
) => Promise<PermissionDecision>;

export interface PermissionDecision {
  /**
   * The ID of the chosen permission option.
   */
  optionId: string;
}

// ─── Streaming Events ────────────────────────────────────────────────────────

/**
 * Simplified event types emitted during a prompt turn.
 */
export type SessionEvent =
  | TextChunkEvent
  | ThinkingChunkEvent
  | ToolCallEvent
  | ToolCallUpdateEvent
  | PlanEvent
  | UsageEvent
  | ModeChangeEvent
  | SessionInfoEvent
  | UserMessageChunkEvent;

export interface TextChunkEvent {
  type: "text";
  content: ContentBlock;
  messageId?: string | null;
}

export interface ThinkingChunkEvent {
  type: "thinking";
  content: ContentBlock;
  messageId?: string | null;
}

export interface UserMessageChunkEvent {
  type: "user_message";
  content: ContentBlock;
  messageId?: string | null;
}

export interface ToolCallEvent {
  type: "tool_call";
  toolCallId: string;
  title: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  content?: ToolCallContent[];
  locations?: ToolCallLocation[];
  rawInput?: unknown;
  rawOutput?: unknown;
}

export interface ToolCallUpdateEvent {
  type: "tool_call_update";
  toolCallId: string;
  title?: string | null;
  kind?: ToolKind | null;
  status?: ToolCallStatus | null;
  content?: ToolCallContent[] | null;
  locations?: ToolCallLocation[] | null;
  rawInput?: unknown;
  rawOutput?: unknown;
}

export interface PlanEvent {
  type: "plan";
  entries: PlanEntry[];
}

export interface UsageEvent {
  type: "usage";
  /** Context window size in tokens. */
  contextSize: number;
  /** Tokens currently used in context. */
  contextUsed: number;
  /** Cumulative session cost (if available). */
  cost?: Cost | null;
}

export interface ModeChangeEvent {
  type: "mode_change";
  modeId: string;
}

export interface SessionInfoEvent {
  type: "session_info";
  title?: string;
}

// ─── Prompt Result ───────────────────────────────────────────────────────────

export interface PromptResult {
  stopReason: StopReason;
  usage?: Usage | null;
}

// ─── Collected Turn Result ───────────────────────────────────────────────────

/**
 * The full result of a collected (non-streaming) prompt turn.
 */
export interface TurnResult {
  /** The final text response assembled from all text chunks. */
  text: string;
  /** All thinking chunks assembled. */
  thinking: string;
  /** All tool calls that occurred during the turn. */
  toolCalls: ToolCallEvent[];
  /** The stop reason for this turn. */
  stopReason: StopReason;
  /** Token usage for this turn. */
  usage?: Usage | null;
}

// ─── Logger ──────────────────────────────────────────────────────────────────

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// ─── Re-exports of useful ACP types ─────────────────────────────────────────

export type {
  ToolKind,
  ToolCallStatus,
  ToolCallContent,
  ToolCallLocation,
  ContentBlock,
  StopReason,
  Usage,
  Cost,
  PlanEntry,
  SessionId,
  PermissionOption,
  McpServer,
  SessionModeId,
  ModelId,
} from "@agentclientprotocol/sdk";
