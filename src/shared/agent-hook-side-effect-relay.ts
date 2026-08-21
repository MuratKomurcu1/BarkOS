import type { AgentHookRelayEnvelope, AgentHookSource } from './agent-hook-relay'
import { parsePaneKey } from './stable-pane-id'

export const AGENT_HOOK_EVALUATE_SIDE_EFFECT_METHOD =
  'agent_hook.evaluateBarkosSideEffect.v1' as const
export const AGENT_HOOK_SIDE_EFFECT_CAPABILITY_VERSION = 1 as const
export const AGENT_HOOK_SIDE_EFFECT_REQUEST_TIMEOUT_MS = 4_000

export type AgentHookPreToolUseDecision = Readonly<{
  hookSpecificOutput: Readonly<{
    hookEventName: 'PreToolUse'
    permissionDecision: 'allow' | 'deny'
    permissionDecisionReason: string
  }>
}>

export type AgentHookBeforeToolDecision = Readonly<{
  decision: 'allow' | 'deny'
  reason?: string
}>

export type AgentHookSideEffectDecision = AgentHookPreToolUseDecision | AgentHookBeforeToolDecision

export type AgentHookSideEffectRelayRequest = Readonly<{
  version: typeof AGENT_HOOK_SIDE_EFFECT_CAPABILITY_VERSION
  barkosSideEffectEnforcement: true
  envelope: AgentHookRelayEnvelope
  toolPayload: Readonly<Record<string, unknown>>
}>

export type AgentHookSideEffectRelayResponse = Readonly<{
  version: typeof AGENT_HOOK_SIDE_EFFECT_CAPABILITY_VERSION
  matched: boolean
  decision: AgentHookSideEffectDecision | null
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedOptionalString(value: unknown, max: number): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length <= max)
}

function isSideEffectDecision(value: unknown): value is AgentHookSideEffectDecision {
  if (!isRecord(value)) {
    return false
  }
  if (value.decision === 'allow') {
    return value.reason === undefined || boundedOptionalString(value.reason, 2_048)
  }
  if (value.decision === 'deny') {
    return (
      typeof value.reason === 'string' && value.reason.length > 0 && value.reason.length <= 2_048
    )
  }
  if (!isRecord(value.hookSpecificOutput)) {
    return false
  }
  const output = value.hookSpecificOutput
  return (
    output.hookEventName === 'PreToolUse' &&
    (output.permissionDecision === 'allow' || output.permissionDecision === 'deny') &&
    typeof output.permissionDecisionReason === 'string' &&
    output.permissionDecisionReason.length > 0 &&
    output.permissionDecisionReason.length <= 2_048
  )
}

export function parseAgentHookSideEffectRelayRequest(
  value: unknown
): AgentHookSideEffectRelayRequest | null {
  if (
    !isRecord(value) ||
    value.version !== AGENT_HOOK_SIDE_EFFECT_CAPABILITY_VERSION ||
    value.barkosSideEffectEnforcement !== true ||
    !isRecord(value.envelope) ||
    !isRecord(value.toolPayload)
  ) {
    return null
  }
  const envelope = value.envelope
  const toolPayload = value.toolPayload
  if (
    (envelope.source !== 'claude' &&
      envelope.source !== 'codex' &&
      envelope.source !== 'droid' &&
      envelope.source !== 'gemini' &&
      envelope.source !== 'opencode') ||
    typeof envelope.paneKey !== 'string' ||
    parsePaneKey(envelope.paneKey) === null ||
    envelope.connectionId !== null ||
    !boundedOptionalString(envelope.launchToken, 2_048) ||
    !boundedOptionalString(envelope.tabId, 512) ||
    !boundedOptionalString(envelope.worktreeId, 512) ||
    !isRecord(envelope.payload) ||
    toolPayload.hook_event_name !== (envelope.source === 'gemini' ? 'BeforeTool' : 'PreToolUse') ||
    typeof toolPayload.tool_name !== 'string' ||
    toolPayload.tool_name.trim().length === 0 ||
    toolPayload.tool_name.length > 256
  ) {
    return null
  }
  return value as AgentHookSideEffectRelayRequest
}

export function parseAgentHookSideEffectRelayResponse(
  value: unknown
): AgentHookSideEffectRelayResponse | null {
  if (
    !isRecord(value) ||
    value.version !== AGENT_HOOK_SIDE_EFFECT_CAPABILITY_VERSION ||
    typeof value.matched !== 'boolean' ||
    (value.decision !== null && !isSideEffectDecision(value.decision))
  ) {
    return null
  }
  return value as AgentHookSideEffectRelayResponse
}

export function createAgentHookSideEffectRelayResponse(
  matched: boolean,
  decision: AgentHookSideEffectDecision | null
): AgentHookSideEffectRelayResponse {
  return {
    version: AGENT_HOOK_SIDE_EFFECT_CAPABILITY_VERSION,
    matched,
    decision
  }
}

export function agentHookSideEffectDecisionMatchesSource(
  source: AgentHookSource,
  decision: AgentHookSideEffectDecision | null
): boolean {
  if (decision === null) {
    return true
  }
  return source === 'gemini' ? 'decision' in decision : 'hookSpecificOutput' in decision
}

export function createAgentHookSideEffectTransportDenial(
  reason = 'BarkOS could not verify the remote approval channel, so the side effect was blocked.',
  source: AgentHookSource = 'claude'
): AgentHookSideEffectDecision {
  if (source === 'gemini') {
    return { decision: 'deny', reason }
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  }
}
