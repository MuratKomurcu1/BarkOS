import type {
  AgentHookSideEffectRelayResponse,
  AgentHookSideEffectDecision
} from '../agent-hook-side-effect-relay'
import {
  createAgentHookSideEffectTransportDenial,
  parseAgentHookSideEffectRelayResponse
} from '../agent-hook-side-effect-relay'
import { parsePaneKey } from '../stable-pane-id'
import type { BarkosPairedSideEffectAgent } from './side-effect-capable-agent'

export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION = 1 as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V2 = 2 as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V3 = 3 as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V4 = 4 as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY =
  'barkos.paired-side-effect-approval.v1' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V2 =
  'barkos.paired-side-effect-approval.v2' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V3 =
  'barkos.paired-side-effect-approval.v3' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V4 =
  'barkos.paired-side-effect-approval.v4' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_SUBSCRIBE_METHOD =
  'barkos.sideEffectApproval.subscribe' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_SUBSCRIBE_METHOD_V2 =
  'barkos.sideEffectApproval.subscribeV2' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_SUBSCRIBE_METHOD_V3 =
  'barkos.sideEffectApproval.subscribeV3' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_SUBSCRIBE_METHOD_V4 =
  'barkos.sideEffectApproval.subscribeV4' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RESOLVE_METHOD =
  'barkos.sideEffectApproval.resolve' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RESOLVE_METHOD_V2 =
  'barkos.sideEffectApproval.resolveV2' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RESOLVE_METHOD_V3 =
  'barkos.sideEffectApproval.resolveV3' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RESOLVE_METHOD_V4 =
  'barkos.sideEffectApproval.resolveV4' as const
export const BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_TIMEOUT_MS = 6_000

export type BarkosPairedSideEffectApprovalVersion =
  | typeof BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION
  | typeof BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V2
  | typeof BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V3
  | typeof BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V4

export type BarkosPairedSideEffectApprovalAuthority = Readonly<{
  runtimeId: string
  worktreeId: string
  terminalHandle: string
  orchestrationRunId: string
  orchestrationTaskId: string
  orchestrationDispatchId: string
}>

export type BarkosPairedSideEffectToolRequest = Readonly<{
  source: BarkosPairedSideEffectAgent
  paneKey: string
  launchToken: string
  sideEffectEnforcement: true
  toolName: string
  toolInput: unknown
  toolUseId?: string
  providerSessionId?: string
}>

export type BarkosPairedSideEffectApprovalEvent =
  | Readonly<{
      type: 'ready'
      version: BarkosPairedSideEffectApprovalVersion
      subscriptionId: string
    }>
  | Readonly<{
      type: 'request'
      version: BarkosPairedSideEffectApprovalVersion
      requestId: string
      request: BarkosPairedSideEffectToolRequest
      authority: BarkosPairedSideEffectApprovalAuthority
    }>
  | Readonly<{
      type: 'end'
      version: BarkosPairedSideEffectApprovalVersion
    }>

export type BarkosPairedSideEffectApprovalResolution = Readonly<{
  version: BarkosPairedSideEffectApprovalVersion
  requestId: string
  response: AgentHookSideEffectRelayResponse
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function parseAuthority(value: unknown): BarkosPairedSideEffectApprovalAuthority | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'runtimeId',
      'worktreeId',
      'terminalHandle',
      'orchestrationRunId',
      'orchestrationTaskId',
      'orchestrationDispatchId'
    ])
  ) {
    return null
  }
  return isBoundedString(value.runtimeId, 256) &&
    isBoundedString(value.worktreeId, 4_096) &&
    isBoundedString(value.terminalHandle, 256) &&
    isBoundedString(value.orchestrationRunId, 256) &&
    isBoundedString(value.orchestrationTaskId, 256) &&
    isBoundedString(value.orchestrationDispatchId, 256)
    ? (value as BarkosPairedSideEffectApprovalAuthority)
    : null
}

function isApprovalVersion(value: unknown): value is BarkosPairedSideEffectApprovalVersion {
  return (
    value === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION ||
    value === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V2 ||
    value === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V3 ||
    value === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V4
  )
}

export function barkosPairedApprovalVersionForAgent(
  agent: BarkosPairedSideEffectAgent
): BarkosPairedSideEffectApprovalVersion {
  return agent === 'opencode'
    ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V4
    : agent === 'gemini'
      ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V3
      : agent === 'droid'
        ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V2
        : BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION
}

export function barkosPairedApprovalVersionSupportsAgent(
  version: BarkosPairedSideEffectApprovalVersion,
  agent: BarkosPairedSideEffectAgent
): boolean {
  return version >= barkosPairedApprovalVersionForAgent(agent)
}

export function barkosPairedApprovalCapabilityForVersion(
  version: BarkosPairedSideEffectApprovalVersion
): string {
  return version === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V4
    ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V4
    : version === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V3
      ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V3
      : version === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V2
        ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V2
        : BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY
}

export function barkosPairedApprovalSubscribeMethod(
  version: BarkosPairedSideEffectApprovalVersion
): string {
  return version === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V4
    ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_SUBSCRIBE_METHOD_V4
    : version === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V3
      ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_SUBSCRIBE_METHOD_V3
      : version === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V2
        ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_SUBSCRIBE_METHOD_V2
        : BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_SUBSCRIBE_METHOD
}

export function barkosPairedApprovalResolveMethod(
  version: BarkosPairedSideEffectApprovalVersion
): string {
  return version === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V4
    ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RESOLVE_METHOD_V4
    : version === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V3
      ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RESOLVE_METHOD_V3
      : version === BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION_V2
        ? BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RESOLVE_METHOD_V2
        : BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RESOLVE_METHOD
}

function parseToolRequest(
  value: unknown,
  version: BarkosPairedSideEffectApprovalVersion
): BarkosPairedSideEffectToolRequest | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'source',
      'paneKey',
      'launchToken',
      'sideEffectEnforcement',
      'toolName',
      'toolInput',
      'toolUseId',
      'providerSessionId'
    ])
  ) {
    return null
  }
  if (
    (value.source !== 'claude' &&
      value.source !== 'codex' &&
      value.source !== 'droid' &&
      value.source !== 'gemini' &&
      value.source !== 'opencode') ||
    !barkosPairedApprovalVersionSupportsAgent(version, value.source) ||
    !isBoundedString(value.paneKey, 1_024) ||
    parsePaneKey(value.paneKey) === null ||
    !isBoundedString(value.launchToken, 2_048) ||
    value.sideEffectEnforcement !== true ||
    !isBoundedString(value.toolName, 256) ||
    (value.toolUseId !== undefined && !isBoundedString(value.toolUseId, 512)) ||
    (value.providerSessionId !== undefined && !isBoundedString(value.providerSessionId, 512))
  ) {
    return null
  }
  return value as BarkosPairedSideEffectToolRequest
}

export function parseBarkosPairedSideEffectApprovalEvent(
  value: unknown
): BarkosPairedSideEffectApprovalEvent | null {
  if (!isRecord(value) || !isApprovalVersion(value.version) || typeof value.type !== 'string') {
    return null
  }
  if (value.type === 'ready') {
    return hasOnlyKeys(value, ['type', 'version', 'subscriptionId']) &&
      isBoundedString(value.subscriptionId, 512)
      ? (value as BarkosPairedSideEffectApprovalEvent)
      : null
  }
  if (value.type === 'end') {
    return hasOnlyKeys(value, ['type', 'version'])
      ? (value as BarkosPairedSideEffectApprovalEvent)
      : null
  }
  if (
    value.type !== 'request' ||
    !hasOnlyKeys(value, ['type', 'version', 'requestId', 'request', 'authority'])
  ) {
    return null
  }
  return isBoundedString(value.requestId, 512) &&
    parseToolRequest(value.request, value.version) !== null &&
    parseAuthority(value.authority) !== null
    ? (value as BarkosPairedSideEffectApprovalEvent)
    : null
}

export function parseBarkosPairedSideEffectApprovalResolution(
  value: unknown
): BarkosPairedSideEffectApprovalResolution | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['version', 'requestId', 'response']) ||
    !isApprovalVersion(value.version) ||
    !isBoundedString(value.requestId, 512) ||
    parseAgentHookSideEffectRelayResponse(value.response) === null
  ) {
    return null
  }
  return value as BarkosPairedSideEffectApprovalResolution
}

export function createBarkosPairedSideEffectApprovalDenial(
  reason: string,
  source: BarkosPairedSideEffectAgent = 'codex'
): AgentHookSideEffectDecision {
  return createAgentHookSideEffectTransportDenial(reason, source)
}
