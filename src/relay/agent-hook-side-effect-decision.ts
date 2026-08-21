import type { AgentHookRelayEnvelope, AgentHookSource } from '../shared/agent-hook-relay'
import {
  AGENT_HOOK_SIDE_EFFECT_CAPABILITY_VERSION,
  agentHookSideEffectDecisionMatchesSource,
  parseAgentHookSideEffectRelayResponse,
  type AgentHookSideEffectDecision,
  type AgentHookSideEffectRelayRequest,
  type AgentHookSideEffectRelayResponse
} from '../shared/agent-hook-side-effect-relay'

export type RelaySideEffectEvaluator = (
  request: AgentHookSideEffectRelayRequest
) => Promise<AgentHookSideEffectRelayResponse>

export async function evaluateRelaySideEffectDecision(
  source: AgentHookSource,
  envelope: AgentHookRelayEnvelope | null,
  toolPayload: Record<string, unknown> | null,
  evaluate: RelaySideEffectEvaluator | undefined
): Promise<AgentHookSideEffectDecision | null> {
  if (!envelope || !toolPayload || !evaluate) {
    return null
  }
  const response = parseAgentHookSideEffectRelayResponse(
    await evaluate({
      version: AGENT_HOOK_SIDE_EFFECT_CAPABILITY_VERSION,
      barkosSideEffectEnforcement: true,
      envelope,
      toolPayload
    })
  )
  return response?.matched === true &&
    agentHookSideEffectDecisionMatchesSource(source, response.decision)
    ? (response.decision ?? null)
    : null
}
