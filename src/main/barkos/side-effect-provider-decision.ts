import type { AgentHookToolUseDecision, AgentHookToolUseRequest } from '../agent-hooks/server'
import {
  barkosPairedApprovalVersionSupportsAgent,
  type BarkosPairedSideEffectApprovalVersion
} from '../../shared/barkos/paired-side-effect-approval'
import {
  isBarkosPairedSideEffectAgent,
  type BarkosPairedSideEffectAgent
} from '../../shared/barkos/side-effect-capable-agent'

export function isBarkosPairedSideEffectRequestSupported(
  request: AgentHookToolUseRequest,
  version: BarkosPairedSideEffectApprovalVersion
): request is AgentHookToolUseRequest & { source: BarkosPairedSideEffectAgent } {
  return (
    request.sideEffectEnforcement === true &&
    isBarkosPairedSideEffectAgent(request.source) &&
    barkosPairedApprovalVersionSupportsAgent(version, request.source)
  )
}

export function createBarkosSideEffectDenial(
  reason: string,
  source: AgentHookToolUseRequest['source']
): AgentHookToolUseDecision {
  return source === 'gemini'
    ? { decision: 'deny', reason }
    : {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason
        }
      }
}

export function createBarkosSideEffectAllowance(
  reason: string,
  source: AgentHookToolUseRequest['source']
): AgentHookToolUseDecision {
  return source === 'gemini'
    ? { decision: 'allow' }
    : {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: reason
        }
      }
}
