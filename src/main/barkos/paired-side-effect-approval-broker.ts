import { randomUUID } from 'node:crypto'
import type { AgentHookToolUseRequest } from '../agent-hooks/server'
import {
  agentHookSideEffectDecisionMatchesSource,
  createAgentHookSideEffectRelayResponse,
  type AgentHookSideEffectRelayResponse
} from '../../shared/agent-hook-side-effect-relay'
import {
  BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_TIMEOUT_MS,
  BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION,
  barkosPairedApprovalVersionSupportsAgent,
  createBarkosPairedSideEffectApprovalDenial,
  type BarkosPairedSideEffectApprovalAuthority,
  type BarkosPairedSideEffectApprovalEvent,
  type BarkosPairedSideEffectApprovalResolution,
  type BarkosPairedSideEffectApprovalVersion
} from '../../shared/barkos/paired-side-effect-approval'
import type { BarkosPairedSideEffectAgent } from '../../shared/barkos/side-effect-capable-agent'
import { classifyBarkosSideEffect } from './side-effect-classification'

export type BarkosPairedSideEffectHostAuthority =
  | Readonly<{ status: 'unpaired' }>
  | Readonly<{ status: 'invalid' }>
  | Readonly<{
      status: 'verified'
      ownerDeviceId: string
      authority: BarkosPairedSideEffectApprovalAuthority
    }>

type Subscriber = {
  subscriptionId: string
  version: BarkosPairedSideEffectApprovalVersion
  emit: (event: BarkosPairedSideEffectApprovalEvent) => void
  close: () => void
}

type PendingDecision = {
  ownerDeviceId: string
  source: BarkosPairedSideEffectAgent
  version: BarkosPairedSideEffectApprovalVersion
  settle: (response: AgentHookSideEffectRelayResponse) => void
  timer: ReturnType<typeof setTimeout>
}

const CHANNEL_UNAVAILABLE_REASON =
  'BarkOS could not reach the paired approval owner, so the side effect was blocked.'
const IDENTITY_INVALID_REASON =
  'BarkOS could not verify the paired worker identity, so the side effect was blocked.'

export class BarkosPairedSideEffectApprovalBroker {
  private readonly subscribers = new Map<string, Subscriber>()
  private readonly pending = new Map<string, PendingDecision>()

  constructor(
    private readonly resolveAuthority: (
      request: AgentHookToolUseRequest
    ) => BarkosPairedSideEffectHostAuthority
  ) {}

  subscribe(
    ownerDeviceId: string,
    emit: (event: BarkosPairedSideEffectApprovalEvent) => void,
    version: BarkosPairedSideEffectApprovalVersion = BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION
  ): { subscriptionId: string; closed: Promise<void>; close: () => void } {
    const subscriptionId = `barkos-side-effect-${randomUUID()}`
    let resolveClosed: () => void = () => undefined
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve
    })
    let active = true
    const close = (): void => {
      if (!active) {
        return
      }
      active = false
      if (this.subscribers.get(ownerDeviceId)?.subscriptionId === subscriptionId) {
        this.subscribers.delete(ownerDeviceId)
      }
      this.failPendingForOwner(ownerDeviceId)
      try {
        emit({ type: 'end', version })
      } catch {
        // The transport may already be closed.
      }
      resolveClosed()
    }
    this.subscribers.get(ownerDeviceId)?.close()
    this.subscribers.set(ownerDeviceId, { subscriptionId, version, emit, close })
    emit({
      type: 'ready',
      version,
      subscriptionId
    })
    return { subscriptionId, closed, close }
  }

  evaluate = async (
    request: AgentHookToolUseRequest
  ): Promise<AgentHookSideEffectRelayResponse> => {
    if (
      request.sideEffectEnforcement !== true ||
      (request.source !== 'claude' &&
        request.source !== 'codex' &&
        request.source !== 'droid' &&
        request.source !== 'gemini' &&
        request.source !== 'opencode')
    ) {
      return createAgentHookSideEffectRelayResponse(false, null)
    }
    const source = request.source
    if (!classifyBarkosSideEffect(request.toolName, request.toolInput)) {
      return createAgentHookSideEffectRelayResponse(true, null)
    }
    const resolved = this.resolveAuthority(request)
    if (resolved.status === 'unpaired') {
      return createAgentHookSideEffectRelayResponse(false, null)
    }
    if (resolved.status === 'invalid') {
      return createAgentHookSideEffectRelayResponse(
        true,
        createBarkosPairedSideEffectApprovalDenial(IDENTITY_INVALID_REASON, source)
      )
    }
    const subscriber = this.subscribers.get(resolved.ownerDeviceId)
    if (
      !subscriber ||
      !request.launchToken ||
      !barkosPairedApprovalVersionSupportsAgent(subscriber.version, source)
    ) {
      return createAgentHookSideEffectRelayResponse(
        true,
        createBarkosPairedSideEffectApprovalDenial(CHANNEL_UNAVAILABLE_REASON, source)
      )
    }
    const requestId = randomUUID()
    const response = await new Promise<AgentHookSideEffectRelayResponse>((settle) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        settle(
          createAgentHookSideEffectRelayResponse(
            true,
            createBarkosPairedSideEffectApprovalDenial(CHANNEL_UNAVAILABLE_REASON, source)
          )
        )
      }, BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_TIMEOUT_MS)
      timer.unref?.()
      this.pending.set(requestId, {
        ownerDeviceId: resolved.ownerDeviceId,
        source,
        version: subscriber.version,
        settle,
        timer
      })
      try {
        subscriber.emit({
          type: 'request',
          version: subscriber.version,
          requestId,
          request: {
            source,
            paneKey: request.paneKey,
            launchToken: request.launchToken!,
            sideEffectEnforcement: true,
            toolName: request.toolName,
            toolInput: request.toolInput,
            ...(request.toolUseId ? { toolUseId: request.toolUseId } : {}),
            ...(request.providerSessionId ? { providerSessionId: request.providerSessionId } : {})
          },
          authority: resolved.authority
        })
      } catch {
        this.pending.delete(requestId)
        clearTimeout(timer)
        settle(
          createAgentHookSideEffectRelayResponse(
            true,
            createBarkosPairedSideEffectApprovalDenial(CHANNEL_UNAVAILABLE_REASON, source)
          )
        )
      }
    })
    return response.matched
      ? response
      : createAgentHookSideEffectRelayResponse(
          true,
          createBarkosPairedSideEffectApprovalDenial(IDENTITY_INVALID_REASON, source)
        )
  }

  resolve(ownerDeviceId: string, resolution: BarkosPairedSideEffectApprovalResolution): boolean {
    const pending = this.pending.get(resolution.requestId)
    if (
      !pending ||
      pending.ownerDeviceId !== ownerDeviceId ||
      pending.version !== resolution.version ||
      !agentHookSideEffectDecisionMatchesSource(pending.source, resolution.response.decision)
    ) {
      return false
    }
    this.pending.delete(resolution.requestId)
    clearTimeout(pending.timer)
    pending.settle(resolution.response)
    return true
  }

  private failPendingForOwner(ownerDeviceId: string): void {
    for (const [requestId, pending] of this.pending) {
      if (pending.ownerDeviceId !== ownerDeviceId) {
        continue
      }
      this.pending.delete(requestId)
      clearTimeout(pending.timer)
      pending.settle(
        createAgentHookSideEffectRelayResponse(
          true,
          createBarkosPairedSideEffectApprovalDenial(CHANNEL_UNAVAILABLE_REASON, pending.source)
        )
      )
    }
  }
}
