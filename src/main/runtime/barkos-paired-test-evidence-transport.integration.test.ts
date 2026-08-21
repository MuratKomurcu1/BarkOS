import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BARKOS_TEST_EVIDENCE_RUNTIME_CAPABILITY,
  BARKOS_TEST_EVIDENCE_RUNTIME_METHOD,
  type BarkosRuntimeTestEvidenceRunRequest
} from '../../shared/barkos/test-evidence-run'
import { parsePairingCode } from '../../shared/pairing'
import { sendRemoteRuntimeRequestWithStatusPreflight } from '../../shared/remote-runtime-client'
import { addEnvironmentFromPairingCode } from '../../shared/runtime-environment-store'
import type { RuntimeStatus } from '../../shared/runtime-types'
import { runBarkosLocalTestEvidenceCommand } from '../barkos/test-evidence-command-executor'
import type * as TestEvidenceCommandExecutor from '../barkos/test-evidence-command-executor'
import { runBarkosPairedTestEvidence } from '../barkos/paired-test-evidence-client'
import type { OrcaRuntimeService } from './orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'

vi.mock('../barkos/test-evidence-command-executor', async (importOriginal) => {
  const original = await importOriginal<typeof TestEvidenceCommandExecutor>()
  return { ...original, runBarkosLocalTestEvidenceCommand: vi.fn() }
})

const TEST_TIMEOUT_MS = 15_000
const request: BarkosRuntimeTestEvidenceRunRequest = {
  version: 1,
  workspaceId: 'worktree-1',
  tabId: 'tab-1',
  orchestrationRunId: 'run-1',
  orchestrationTaskId: 'task-1',
  orchestrationDispatchId: 'dispatch-1',
  command: 'pnpm test'
}

type HostHarness = {
  environmentId: string
  pairingUrl: string
  resolveCwd: ReturnType<typeof vi.fn>
  server: OrcaRuntimeRpcServer
  userDataPath: string
}

const activeHosts: HostHarness[] = []

async function launchHost(capabilities: string[]): Promise<HostHarness> {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-barkos-evidence-transport-'))
  const resolveCwd = vi.fn(async () => userDataPath)
  const runtimeId = 'barkos-evidence-runtime'
  const runtime = {
    getRuntimeId: () => runtimeId,
    getStartedAt: () => 1,
    getStatus: (): Partial<RuntimeStatus> => ({
      runtimeId,
      graphStatus: 'ready',
      capabilities
    }),
    cleanupSubscriptionsForConnection: () => {},
    cancelMobileDictationForConnection: () => {},
    onClientDisconnected: () => {},
    resolveBarkosPairedTestEvidenceCwd: resolveCwd
  } as unknown as OrcaRuntimeService
  const server = new OrcaRuntimeRpcServer({
    runtime,
    userDataPath,
    enableWebSocket: true,
    wsPort: 0
  })
  await server.start()
  const offer = server.createPairingOffer({ name: 'BarkOS evidence', scope: 'runtime' })
  if (!offer.available) {
    throw new Error('pairing unavailable')
  }
  const environment = addEnvironmentFromPairingCode(userDataPath, {
    name: 'BarkOS evidence host',
    pairingCode: offer.pairingUrl
  })
  const harness = {
    environmentId: environment.id,
    pairingUrl: offer.pairingUrl,
    resolveCwd,
    server,
    userDataPath
  }
  activeHosts.push(harness)
  return harness
}

describe('paired BarkOS test evidence E2EE transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(runBarkosLocalTestEvidenceCommand).mockResolvedValue({
      stdout: '12 tests passed',
      stderr: '',
      exitCode: 0,
      timedOut: false
    })
  })

  afterEach(async () => {
    const hosts = activeHosts.splice(0)
    await Promise.allSettled(hosts.map((host) => host.server.stop()))
    for (const host of hosts) {
      rmSync(host.userDataPath, { recursive: true, force: true })
    }
  })

  it(
    'does not send the command when the paired host lacks the capability',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const host = await launchHost([])

      await expect(
        runBarkosPairedTestEvidence({
          userDataPath: host.userDataPath,
          environmentId: host.environmentId,
          request,
          signal: new AbortController().signal
        })
      ).rejects.toThrow('barkos_test_paired_runtime_capability_missing')
      expect(host.resolveCwd).not.toHaveBeenCalled()
      expect(runBarkosLocalTestEvidenceCommand).not.toHaveBeenCalled()
    }
  )

  it(
    'propagates client cancellation through socket close to the host execution signal',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const host = await launchHost([BARKOS_TEST_EVIDENCE_RUNTIME_CAPABILITY])
      let executionSignal: AbortSignal | undefined
      let markStarted: (() => void) | undefined
      const started = new Promise<void>((resolve) => {
        markStarted = resolve
      })
      vi.mocked(runBarkosLocalTestEvidenceCommand).mockImplementation(
        async (_plan, _cwd, signal) => {
          executionSignal = signal
          markStarted?.()
          return await new Promise((resolve) => {
            const finish = (): void =>
              resolve({
                stdout: '',
                stderr: '',
                exitCode: null,
                timedOut: false,
                canceled: true
              })
            signal.addEventListener('abort', finish, { once: true })
            if (signal.aborted) {
              finish()
            }
          })
        }
      )
      const controller = new AbortController()
      const pending = runBarkosPairedTestEvidence({
        userDataPath: host.userDataPath,
        environmentId: host.environmentId,
        request,
        signal: controller.signal
      })

      await started
      controller.abort()

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      await vi.waitFor(() => expect(executionSignal?.aborted).toBe(true))
    }
  )

  it(
    'keeps the command unsent when the host restarts after status preflight',
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const host = await launchHost([BARKOS_TEST_EVIDENCE_RUNTIME_CAPABILITY])
      const pairing = parsePairingCode(host.pairingUrl)
      if (!pairing) {
        throw new Error('invalid pairing')
      }
      let stopPromise: Promise<void> | null = null

      await expect(
        sendRemoteRuntimeRequestWithStatusPreflight(
          pairing,
          BARKOS_TEST_EVIDENCE_RUNTIME_METHOD,
          request,
          5_000,
          (response) => {
            expect(response).toMatchObject({
              ok: true,
              result: {
                runtimeId: 'barkos-evidence-runtime',
                capabilities: [BARKOS_TEST_EVIDENCE_RUNTIME_CAPABILITY]
              },
              _meta: { runtimeId: 'barkos-evidence-runtime' }
            })
            stopPromise = host.server.stop()
          }
        )
      ).rejects.toThrow(/closed|unavailable/i)
      await stopPromise
      expect(host.resolveCwd).not.toHaveBeenCalled()
      expect(runBarkosLocalTestEvidenceCommand).not.toHaveBeenCalled()
    }
  )
})
