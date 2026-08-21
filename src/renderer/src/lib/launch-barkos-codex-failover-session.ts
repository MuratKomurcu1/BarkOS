import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import type { BarkosCompany } from '../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import { useAppStore } from '@/store'
import {
  BARKOS_WORKER_READY_TIMEOUT_MS,
  resolveBarkosPersistedWorkerLaunchTarget,
  waitForBarkosWorkerRuntime
} from './ensure-barkos-worker-session'
import {
  activateBarkosWorkerLaunchTarget,
  launchBarkosWorkerSession
} from './launch-barkos-worker-session'
import { launchSleepingAgentSession } from './sleeping-agent-session-launch'
import type { BarkosReadyWorkerRuntime } from './barkos-worker-session-state'

type BarkosFailoverSourceStatus = Pick<
  AgentStatusEntry,
  | 'interrupted'
  | 'lastAssistantMessage'
  | 'paneKey'
  | 'prompt'
  | 'providerSession'
  | 'state'
  | 'terminalTitle'
  | 'updatedAt'
>

function matchesProviderSession(
  actual: AgentProviderSessionMetadata | undefined,
  expected: AgentProviderSessionMetadata
): boolean {
  return actual?.key === expected.key && actual.id === expected.id
}

async function launchSameCodexConversation(args: {
  company: BarkosCompany
  binding: BarkosWorkerSessionBinding
  sourceStatus: BarkosFailoverSourceStatus
  targetAccountId: string
  timeoutMs: number
  now: number
}): Promise<BarkosReadyWorkerRuntime> {
  const target = resolveBarkosPersistedWorkerLaunchTarget(args.company, args.binding)
  if (!target || !target.compatible || !target.agentAvailable) {
    throw new Error('The saved BarkOS worker target is not eligible for Codex failover')
  }
  if (!args.sourceStatus.providerSession) {
    throw new Error('Same-conversation Codex failover requires provider session provenance')
  }
  const providerSession = await window.api.codexAccounts.prepareFailoverResume({
    accountId: args.targetAccountId,
    providerSession: args.sourceStatus.providerSession
  })
  if (!activateBarkosWorkerLaunchTarget(target)) {
    throw new Error('The saved BarkOS worker workspace is unavailable')
  }

  let tabId: string | null = null
  const launched = launchSleepingAgentSession(
    {
      paneKey: args.sourceStatus.paneKey,
      ...(args.binding.tabId ? { tabId: args.binding.tabId } : {}),
      worktreeId: args.binding.workspaceId,
      agent: 'codex',
      providerSession,
      prompt: args.sourceStatus.prompt,
      state: args.sourceStatus.state,
      capturedAt: args.now,
      updatedAt: args.sourceStatus.updatedAt,
      ...(args.sourceStatus.terminalTitle
        ? { terminalTitle: args.sourceStatus.terminalTitle }
        : {}),
      ...(args.sourceStatus.lastAssistantMessage
        ? { lastAssistantMessage: args.sourceStatus.lastAssistantMessage }
        : {}),
      ...(args.sourceStatus.interrupted !== undefined
        ? { interrupted: args.sourceStatus.interrupted }
        : {}),
      origin: 'live'
    },
    {
      suppressNavigation: true,
      onSessionLaunched: (launchedTabId) => {
        tabId = launchedTabId
      }
    }
  )
  if (!launched || !tabId) {
    throw new Error('Codex same-conversation failover launch was rejected')
  }
  const binding: BarkosWorkerSessionBinding = {
    ...args.binding,
    tabId,
    state: 'created',
    launchedAt: args.now
  }
  await useAppStore.getState().recordBarkosWorkerSession(binding)
  return waitForBarkosWorkerRuntime({
    workerId: binding.workerId,
    fallbackBinding: binding,
    timeoutMs: args.timeoutMs,
    accept: (runtime) =>
      runtime.state === 'done' && matchesProviderSession(runtime.providerSession, providerSession),
    timeoutMessage: 'The selected Codex account did not resume the verified conversation in time'
  })
}

async function launchNewCodexConversation(args: {
  company: BarkosCompany
  binding: BarkosWorkerSessionBinding
  timeoutMs: number
}): Promise<BarkosReadyWorkerRuntime> {
  const target = resolveBarkosPersistedWorkerLaunchTarget(args.company, args.binding)
  if (!target || !target.compatible || !target.agentAvailable) {
    throw new Error('The saved BarkOS worker target is not eligible for Codex failover')
  }
  const result = await launchBarkosWorkerSession({
    company: args.company,
    workerId: args.binding.workerId,
    target
  })
  if (!result.ok || !result.binding.tabId) {
    throw new Error(
      `Codex new-session failover launch failed${result.ok ? '' : `: ${result.reason}`}`
    )
  }
  return waitForBarkosWorkerRuntime({
    workerId: result.binding.workerId,
    fallbackBinding: result.binding,
    timeoutMs: args.timeoutMs,
    accept: (runtime) =>
      runtime.state === 'done' &&
      runtime.sessionBoundary !== true &&
      runtime.providerSession !== undefined,
    timeoutMessage: 'The replacement Codex session did not finish its BarkOS briefing in time'
  })
}

export async function launchBarkosCodexFailoverSession(args: {
  company: BarkosCompany
  binding: BarkosWorkerSessionBinding
  sourceStatus: BarkosFailoverSourceStatus
  targetAccountId: string | null
  conversationMode: 'same-conversation' | 'new-session'
  timeoutMs?: number
  now?: number
}): Promise<BarkosReadyWorkerRuntime> {
  const timeoutMs = args.timeoutMs ?? BARKOS_WORKER_READY_TIMEOUT_MS
  if (args.conversationMode === 'same-conversation') {
    if (!args.targetAccountId) {
      throw new Error('Same-conversation Codex failover requires a managed target account')
    }
    return launchSameCodexConversation({
      company: args.company,
      binding: args.binding,
      sourceStatus: args.sourceStatus,
      targetAccountId: args.targetAccountId,
      timeoutMs,
      now: args.now ?? Date.now()
    })
  }
  return launchNewCodexConversation({
    company: args.company,
    binding: args.binding,
    timeoutMs
  })
}
