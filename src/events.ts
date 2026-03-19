/**
 * Maps raw ACP SessionUpdate notifications to simplified SessionEvent types.
 */

import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { SessionEvent } from "./types.js";

/**
 * Converts a raw ACP SessionNotification into a simplified SessionEvent,
 * or returns null if the update type is not mapped.
 */
export function mapSessionUpdate(
  notification: SessionNotification
): SessionEvent | null {
  const update = notification.update;

  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return {
        type: "text",
        content: update.content,
        messageId: update.messageId,
      };

    case "agent_thought_chunk":
      return {
        type: "thinking",
        content: update.content,
        messageId: update.messageId,
      };

    case "user_message_chunk":
      return {
        type: "user_message",
        content: update.content,
        messageId: update.messageId,
      };

    case "tool_call":
      return {
        type: "tool_call",
        toolCallId: update.toolCallId,
        title: update.title,
        kind: update.kind,
        status: update.status,
        content: update.content,
        locations: update.locations,
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      };

    case "tool_call_update":
      return {
        type: "tool_call_update",
        toolCallId: update.toolCallId,
        title: update.title,
        kind: update.kind,
        status: update.status,
        content: update.content,
        locations: update.locations,
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      };

    case "plan":
      return {
        type: "plan",
        entries: update.entries,
      };

    case "usage_update":
      return {
        type: "usage",
        contextSize: update.size,
        contextUsed: update.used,
        cost: update.cost,
      };

    case "current_mode_update":
      return {
        type: "mode_change",
        modeId: update.currentModeId,
      };

    case "session_info_update":
      return {
        type: "session_info",
        title: update.title ?? undefined,
      };

    case "available_commands_update":
    case "config_option_update":
      // These are internal updates, not exposed to the user
      return null;

    default:
      return null;
  }
}
