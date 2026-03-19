/**
 * claude-code-acp-sdk — Programmatic SDK for Claude Code via ACP.
 *
 * @example
 * ```ts
 * import { ClaudeCode } from 'claude-code-acp-sdk';
 *
 * const claude = new ClaudeCode();
 * const session = await claude.createSession({ cwd: process.cwd() });
 *
 * // Streaming
 * for await (const event of session.prompt('Fix the bug in auth.py')) {
 *   if (event.type === 'text') process.stdout.write(event.content.text);
 * }
 *
 * // Collected
 * const result = await session.send('Now add tests for it');
 * console.log(result.text);
 * console.log(result.toolCalls);
 *
 * await session.close();
 * await claude.destroy();
 * ```
 */

export { ClaudeCode } from "./claude-code.js";
export { Session, PromptTurn } from "./session.js";

// Types
export type {
  ClaudeCodeOptions,
  SessionOptions,
  PermissionHandler,
  PermissionRequest,
  PermissionDecision,
  SessionEvent,
  TextChunkEvent,
  ThinkingChunkEvent,
  UserMessageChunkEvent,
  ToolCallEvent,
  ToolCallUpdateEvent,
  PlanEvent,
  UsageEvent,
  ModeChangeEvent,
  SessionInfoEvent,
  PromptResult,
  TurnResult,
  Logger,
  // Re-exported ACP types
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
} from "./types.js";
