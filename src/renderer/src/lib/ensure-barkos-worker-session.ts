import type { BarkosCompany } from '../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import { useAppStore } from '@/store'
import { collectBarkosWorkerLaunchTargets } from './barkos-worker-launch-targets'
import { launchBarkosWorkerSession } from './launch-barkos-worker-session'
import {
  resolveBarkosWorkerSessionState,
  resolveReadyBarkosWorkerRuntime,
  type BarkosReadyWorkerRuntime
} from './barkos-worker-session-state'

export const BARKOS_WORKER_READY_TIMEOUT_MS = 30_000

export function resolveCurrentBarkosWorkerRuntime(
  workerId: string,
  fallbackBinding?: BarkosWorkerSessionBinding
): BarkosReadyWorkerRuntime | null {
  const state = useAppStore.getState()
  return resolveReadyBarkosWorkerRuntime({
    binding: state.barkosWorkerSessions[workerId] ?? fallbackBinding,
    statuses: state.agentStatusByPaneKey
  })
}

export function waitForBarkosWorkerRuntime(args: {
  workerId: string
  fallbackBinding: BarkosWorkerSessionBinding
  timeoutMs: number
  accept?: (runtime: BarkosReadyWorkerRuntime) => boolean
  timeoutMessage?: string
}): Promise<BarkosReadyWorkerRuntime> {
  const accept = args.accept ?? (() => true)
  return new Promise((resolve, reject) => {
    let settled = false
    let unsubscribe = (): void => undefined
    const finish = (result: BarkosReadyWorkerRuntime | Error): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      unsubscribe()
      if (result instanceof Error) {
        reject(result)
      } else {
        resolve(result)
      }
    }
    const check = (): void => {
      const runtime = resolveCurrentBarkosWorkerRuntime(args.workerId, args.fallbackBinding)
      if (runtime && accept(runtime)) {
        finish(runtime)
      }
    }
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            args.timeoutMessage ??
              `Worker ${args.workerId} did not publish a recognized live agent terminal within ${Math.ceil(args.timeoutMs / 1_000)} seconds`
          )
        ),
      args.timeoutMs
    )
    unsubscribe = useAppStore.subscribe(check)
    check()
  })
}

export function resolveBarkosPersistedWorkerLaunchTarget(
  company: BarkosCompany,
  binding: BarkosWorkerSessionBinding
) {
  const worker = company.workers.find((candidate) => candidate.id === binding.workerId)
  if (!worker) {
    return null
  }
  const state = useAppStore.getState()
  return (
    collectBarkosWorkerLaunchTargets(
      {
        detectedAgentIds: state.detectedAgentIds,
        remoteDetectedAgentIds: state.remoteDetectedAgentIds,
        runtimeDetectedAgentIds: state.runtimeDetectedAgentIds,
        disabledTuiAgents: state.settings?.disabledTuiAgents ?? null,
        repos: state.repos,
        worktreesByRepo: state.worktreesByRepo,
        folderWorkspaces: state.folderWorkspaces,
        projectGroups: state.projectGroups,
        runtimeEnvironments: state.runtimeEnvironments,
        sshTargetLabels: state.sshTargetLabels
      },
      worker
    ).find(
      (target) =>
        target.id === binding.targetId &&
        target.workspaceId === binding.workspaceId &&
        target.workspaceKind === binding.workspaceKind &&
        target.executionHostId === binding.executionHostId
    ) ?? null
  )
}

export async function ensureBarkosWorkerSessionReady(args: {
  company: BarkosCompany
  workerId: string
  fallbackBinding?: BarkosWorkerSessionBinding
  timeoutMs?: number
}): Promise<BarkosReadyWorkerRuntime> {
  const store = useAppStore.getState()
  const binding = store.barkosWorkerSessions[args.workerId] ?? args.fallbackBinding
  const ready = resolveCurrentBarkosWorkerRuntime(args.workerId, binding)
  if (ready) {
    return ready
  }
  const sessionState = resolveBarkosWorkerSessionState({
    binding,
    statuses: store.agentStatusByPaneKey,
    tabsByWorktree: store.tabsByWorktree
  })
  if (!binding || sessionState === 'unbound') {
    throw new Error(`Launch worker ${args.workerId} once to choose its exact workspace and host`)
  }
  if (sessionState === 'requested') {
    throw new Error(
      `Worker ${args.workerId} has an unconfirmed remote launch; verify the host before relaunching`
    )
  }
  const timeoutMs = args.timeoutMs ?? BARKOS_WORKER_READY_TIMEOUT_MS
  if (sessionState === 'starting') {
    return waitForBarkosWorkerRuntime({
      workerId: args.workerId,
      fallbackBinding: binding,
      timeoutMs
    })
  }

  const target = resolveBarkosPersistedWorkerLaunchTarget(args.company, binding)
  if (!target || !target.compatible || !target.agentAvailable) {
    throw new Error(
      `Worker ${args.workerId}'s saved workspace and host are not currently eligible for relaunch`
    )
  }
  const result = await launchBarkosWorkerSession({
    company: args.company,
    workerId: args.workerId,
    target
  })
  if (!result.ok) {
    throw new Error(`Worker ${args.workerId} relaunch failed: ${result.reason}`)
  }
  if (!result.binding.tabId) {
    throw new Error(`Worker ${args.workerId} relaunch did not return a terminal identity`)
  }
  return waitForBarkosWorkerRuntime({
    workerId: args.workerId,
    fallbackBinding: result.binding,
    timeoutMs
  })
}
