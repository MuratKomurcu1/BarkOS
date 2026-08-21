import { describe, expect, it, vi } from 'vitest'
import { AGENT_HOOK_INSTALL_MANAGED_HOOKS_METHOD } from '../shared/agent-hook-relay'
import type { MethodHandler, RequestContext } from './dispatcher'
import {
  registerManagedHookInstaller,
  type ManagedHookInstallSummary,
  type ManagedHookRuntime
} from './managed-hook-installer'
import type { AgentHookTarget } from '../shared/agent-hook-types'

function captureHandler(
  loadRuntime: () => ManagedHookRuntime,
  onInstalled?: (summary: ManagedHookInstallSummary, agents: AgentHookTarget[]) => void
): MethodHandler {
  let handler: MethodHandler | undefined
  registerManagedHookInstaller(
    {
      onRequest: (method, nextHandler) => {
        expect(method).toBe(AGENT_HOOK_INSTALL_MANAGED_HOOKS_METHOD)
        handler = nextHandler
      }
    },
    loadRuntime,
    onInstalled
  )
  return handler!
}

function context(signal?: AbortSignal): RequestContext {
  return { clientId: 1, isStale: () => signal?.aborted ?? false, signal }
}

describe('registerManagedHookInstaller', () => {
  it('forwards request cancellation to the remote runtime', async () => {
    const controller = new AbortController()
    const installManagedHooks = vi.fn().mockResolvedValue({ installers: 14, errors: 0 })
    const handler = captureHandler(() => ({ installManagedHooks }))

    await expect(handler({ agents: ['codex'] }, context(controller.signal))).resolves.toEqual({
      installers: 14,
      errors: 0
    })
    expect(installManagedHooks).toHaveBeenCalledWith({
      signal: controller.signal,
      agents: ['codex']
    })
  })

  it('does not load or start the runtime for an already-cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const loadRuntime = vi.fn()
    const handler = captureHandler(loadRuntime)

    await expect(handler({}, context(controller.signal))).rejects.toMatchObject({
      name: 'AbortError'
    })
    expect(loadRuntime).not.toHaveBeenCalled()
  })

  it('forwards only a valid negotiated server-key fingerprint', async () => {
    const installManagedHooks = vi.fn().mockResolvedValue({ installers: 14, errors: 0 })
    const handler = captureHandler(() => ({ installManagedHooks }))
    const fingerprint = 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

    await handler({ hostKeyFingerprint: fingerprint, agents: ['codex'] }, context())
    await handler({ hostKeyFingerprint: 'ssh://untrusted-host', agents: ['codex'] }, context())

    expect(installManagedHooks).toHaveBeenNthCalledWith(1, {
      signal: undefined,
      hostKeyFingerprint: fingerprint,
      agents: ['codex']
    })
    expect(installManagedHooks).toHaveBeenNthCalledWith(2, {
      signal: undefined,
      agents: ['codex']
    })
  })

  it('fails closed when the detected agent allowlist is omitted', async () => {
    const installManagedHooks = vi.fn().mockResolvedValue({ installers: 0, errors: 0 })
    const handler = captureHandler(() => ({ installManagedHooks }))

    await handler({}, context())

    expect(installManagedHooks).toHaveBeenCalledWith({
      signal: undefined,
      agents: []
    })
  })

  it('validates, deduplicates, and forwards the detected agent allowlist', async () => {
    const installManagedHooks = vi.fn().mockResolvedValue({ installers: 1, errors: 0 })
    const handler = captureHandler(() => ({ installManagedHooks }))

    await handler({ agents: ['codex', 'codex'] }, context())

    expect(installManagedHooks).toHaveBeenCalledWith({
      signal: undefined,
      agents: ['codex']
    })
    await expect(handler({ agents: ['unknown'] }, context())).rejects.toThrow(
      'invalid_managed_hook_agents'
    )
  })

  it('reports exact installed agents after the runtime finishes', async () => {
    const summary = { installers: 1, errors: 0, installedAgents: ['droid'] as AgentHookTarget[] }
    const onInstalled = vi.fn()
    const handler = captureHandler(
      () => ({ installManagedHooks: vi.fn().mockResolvedValue(summary) }),
      onInstalled
    )

    await expect(handler({ agents: ['droid'] }, context())).resolves.toEqual(summary)
    expect(onInstalled).toHaveBeenCalledWith(summary, ['droid'])
  })
})
