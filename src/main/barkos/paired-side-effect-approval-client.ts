import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import type { RemoteRuntimeSubscription } from '../../shared/remote-runtime-client'
import { createAgentHookSideEffectRelayResponse } from '../../shared/agent-hook-side-effect-relay'
import {
  BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION,
  barkosPairedApprovalCapabilityForVersion,
  barkosPairedApprovalResolveMethod,
  barkosPairedApprovalSubscribeMethod,
  barkosPairedApprovalVersionForAgent,
  createBarkosPairedSideEffectApprovalDenial,
  parseBarkosPairedSideEffectApprovalEvent,
  type BarkosPairedSideEffectApprovalVersion
} from '../../shared/barkos/paired-side-effect-approval'
import type { BarkosPairedSideEffectAgent } from '../../shared/barkos/side-effect-capable-agent'
import {
  callRuntimeEnvironment,
  getRuntimeEnvironmentStatus,
  subscribeRuntimeEnvironment
} from '../ipc/runtime-environment-transport-routing'
import type { BarkosSideEffectApprovalController } from './side-effect-approval-controller'

type ApprovalClientSession = {
  desired: boolean
  ready: boolean
  version: BarkosPairedSideEffectApprovalVersion | null
  requiredVersion: BarkosPairedSideEffectApprovalVersion
  runtimeId: string | null
  subscription: RemoteRuntimeSubscription | null
  connecting: Promise<boolean> | null
  connectingVersion: BarkosPairedSideEffectApprovalVersion | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

const PREPARE_TIMEOUT_MS = 10_000
const RECONNECT_DELAY_MS = 1_000

export class BarkosPairedSideEffectApprovalClient {
  private readonly sessions = new Map<string, ApprovalClientSession>()

  constructor(
    private readonly userDataPath: string,
    private readonly approvals: BarkosSideEffectApprovalController
  ) {}

  prepare(environmentId: string, agent: BarkosPairedSideEffectAgent): Promise<boolean> {
    const normalizedEnvironmentId = environmentId.trim()
    if (!normalizedEnvironmentId) {
      return Promise.resolve(false)
    }
    const session = this.getSession(normalizedEnvironmentId)
    const requiredVersion = barkosPairedApprovalVersionForAgent(agent)
    session.requiredVersion = Math.max(
      session.requiredVersion,
      requiredVersion
    ) as BarkosPairedSideEffectApprovalVersion
    if (session.ready && session.version !== null && session.version >= session.requiredVersion) {
      return Promise.resolve(true)
    }
    if (session.connecting) {
      const connectingVersion = session.connectingVersion
      return session.connecting.then((ready) =>
        ready && session.version !== null && session.version >= session.requiredVersion
          ? true
          : connectingVersion !== null && connectingVersion < session.requiredVersion
            ? this.prepare(normalizedEnvironmentId, agent)
            : false
      )
    }
    session.subscription?.close()
    session.subscription = null
    session.ready = false
    session.version = null
    const version = session.requiredVersion
    session.connectingVersion = version
    session.connecting = this.connect(normalizedEnvironmentId, session, version).finally(() => {
      session.connecting = null
      session.connectingVersion = null
    })
    return session.connecting
  }

  private getSession(environmentId: string): ApprovalClientSession {
    const existing = this.sessions.get(environmentId)
    if (existing) {
      return existing
    }
    const session: ApprovalClientSession = {
      desired: false,
      ready: false,
      version: null,
      requiredVersion: BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_VERSION,
      runtimeId: null,
      subscription: null,
      connecting: null,
      connectingVersion: null,
      reconnectTimer: null
    }
    this.sessions.set(environmentId, session)
    return session
  }

  private async connect(
    environmentId: string,
    session: ApprovalClientSession,
    version: BarkosPairedSideEffectApprovalVersion
  ): Promise<boolean> {
    const status = await getRuntimeEnvironmentStatus(
      this.userDataPath,
      environmentId,
      PREPARE_TIMEOUT_MS
    )
    const capability = barkosPairedApprovalCapabilityForVersion(version)
    if (status.ok === false || !status.result.capabilities?.includes(capability)) {
      return false
    }
    session.runtimeId = status.result.runtimeId
    let settleReady: (ready: boolean) => void = () => undefined
    const ready = new Promise<boolean>((resolve) => {
      settleReady = resolve
    })
    const timeout = setTimeout(() => settleReady(false), PREPARE_TIMEOUT_MS)
    timeout.unref?.()
    try {
      const subscription = await subscribeRuntimeEnvironment(
        this.userDataPath,
        environmentId,
        barkosPairedApprovalSubscribeMethod(version),
        undefined,
        PREPARE_TIMEOUT_MS,
        {
          onEvent: (event) => {
            if (event.type === 'response') {
              this.handleResponse(environmentId, session, version, event.response, settleReady)
            } else if (event.type === 'error' || event.type === 'close') {
              this.handleDisconnect(environmentId, session)
              settleReady(false)
            }
          },
          onClose: () => this.handleDisconnect(environmentId, session)
        }
      )
      session.subscription = subscription
      const isReady = await ready
      clearTimeout(timeout)
      if (!isReady) {
        subscription.close()
        return false
      }
      session.desired = true
      session.ready = true
      session.version = version
      return true
    } catch {
      clearTimeout(timeout)
      this.scheduleReconnect(environmentId, session)
      return false
    }
  }

  private handleResponse(
    environmentId: string,
    session: ApprovalClientSession,
    version: BarkosPairedSideEffectApprovalVersion,
    response: RuntimeRpcResponse<unknown>,
    settleReady: (ready: boolean) => void
  ): void {
    if (response.ok === false) {
      this.handleDisconnect(environmentId, session)
      settleReady(false)
      return
    }
    const event = parseBarkosPairedSideEffectApprovalEvent(response.result)
    if (!event || event.version !== version) {
      return
    }
    if (event.type === 'ready') {
      settleReady(true)
      return
    }
    if (event.type === 'end') {
      this.handleDisconnect(environmentId, session)
      return
    }
    const expectedRuntimeId = session.runtimeId
    if (!expectedRuntimeId) {
      return
    }
    const request = event.request
    let approvalResponse
    try {
      approvalResponse = this.approvals.evaluatePaired({
        request,
        authority: event.authority,
        environmentId,
        expectedRuntimeId,
        approvalVersion: version
      })
    } catch {
      approvalResponse = createAgentHookSideEffectRelayResponse(
        true,
        createBarkosPairedSideEffectApprovalDenial(
          'BarkOS could not verify local approval state, so the side effect was blocked.',
          request.source
        )
      )
    }
    void callRuntimeEnvironment(
      this.userDataPath,
      environmentId,
      barkosPairedApprovalResolveMethod(version),
      {
        version,
        requestId: event.requestId,
        response: approvalResponse
      },
      4_000
    ).catch(() => undefined)
  }

  private handleDisconnect(environmentId: string, session: ApprovalClientSession): void {
    const subscription = session.subscription
    session.ready = false
    session.version = null
    session.subscription = null
    subscription?.close()
    this.scheduleReconnect(environmentId, session)
  }

  private scheduleReconnect(environmentId: string, session: ApprovalClientSession): void {
    if (!session.desired || session.reconnectTimer) {
      return
    }
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null
      const agent =
        session.requiredVersion === 4
          ? 'opencode'
          : session.requiredVersion === 3
            ? 'gemini'
            : session.requiredVersion === 2
              ? 'droid'
              : 'codex'
      void this.prepare(environmentId, agent)
    }, RECONNECT_DELAY_MS)
    session.reconnectTimer.unref?.()
  }
}
