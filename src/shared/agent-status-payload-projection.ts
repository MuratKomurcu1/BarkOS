import type { ParsedAgentStatusPayload } from './agent-status-types'

/** Keep flattened IPC-only fields out of paired-client status projections. */
export function pickParsedAgentStatusPayload(
  row: ParsedAgentStatusPayload
): ParsedAgentStatusPayload {
  return {
    state: row.state,
    prompt: row.prompt,
    ...(row.agentType !== undefined ? { agentType: row.agentType } : {}),
    ...(row.model !== undefined ? { model: row.model } : {}),
    ...(row.toolName !== undefined ? { toolName: row.toolName } : {}),
    ...(row.toolInput !== undefined ? { toolInput: row.toolInput } : {}),
    ...(row.interactivePrompt !== undefined ? { interactivePrompt: row.interactivePrompt } : {}),
    ...(row.lastAssistantMessage !== undefined
      ? { lastAssistantMessage: row.lastAssistantMessage }
      : {}),
    ...(row.interrupted !== undefined ? { interrupted: row.interrupted } : {}),
    ...(row.sessionBoundary !== undefined ? { sessionBoundary: row.sessionBoundary } : {}),
    ...(row.providerFailure !== undefined ? { providerFailure: row.providerFailure } : {}),
    ...(row.turnCompletedAt !== undefined ? { turnCompletedAt: row.turnCompletedAt } : {}),
    ...(row.subagents !== undefined ? { subagents: row.subagents } : {})
  }
}
