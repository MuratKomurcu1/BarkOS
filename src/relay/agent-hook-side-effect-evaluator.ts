import {
  AGENT_HOOK_EVALUATE_SIDE_EFFECT_METHOD,
  AGENT_HOOK_SIDE_EFFECT_REQUEST_TIMEOUT_MS,
  agentHookSideEffectDecisionMatchesSource,
  createAgentHookSideEffectRelayResponse,
  parseAgentHookSideEffectRelayResponse,
  type AgentHookSideEffectRelayRequest,
  type AgentHookSideEffectRelayResponse
} from '../shared/agent-hook-side-effect-relay'
import type { RelayDispatcher } from './dispatcher'

export async function evaluateAgentHookSideEffectThroughDispatcher(
  dispatcher: RelayDispatcher,
  request: AgentHookSideEffectRelayRequest
): Promise<AgentHookSideEffectRelayResponse> {
  const responses = await dispatcher.requestActiveClients(
    AGENT_HOOK_EVALUATE_SIDE_EFFECT_METHOD,
    { ...request },
    { timeoutMs: AGENT_HOOK_SIDE_EFFECT_REQUEST_TIMEOUT_MS }
  )
  const matches = responses.flatMap(({ result }) => {
    const parsed = parseAgentHookSideEffectRelayResponse(result)
    return parsed?.matched === true &&
      agentHookSideEffectDecisionMatchesSource(request.envelope.source, parsed.decision)
      ? [parsed]
      : []
  })
  return matches.length === 1 ? matches[0]! : createAgentHookSideEffectRelayResponse(false, null)
}
