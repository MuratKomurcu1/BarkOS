import type { Page } from '@stablyai/playwright-test'
import { E2E_READY_CODEX_ACCOUNT_ID } from './barkos-codex-failover-ipc-harness'
import {
  E2E_ORCHESTRATION_DISPATCH_ID,
  E2E_REPLACEMENT_TAB_ID,
  E2E_REPLACEMENT_TERMINAL_HANDLE,
  E2E_SOURCE_TAB_ID,
  E2E_SOURCE_TERMINAL_HANDLE,
  type BarkosCodexFailoverScenario
} from './barkos-codex-failover-scenario'
import { waitForSessionReady } from './helpers/store'

export async function prepareBarkosCodexFailoverRenderer(
  page: Page,
  scenario: BarkosCodexFailoverScenario
): Promise<void> {
  await page.reload()
  await waitForSessionReady(page)
  await page.getByRole('button', { name: 'Company', exact: true }).click()
  await page.evaluate(
    ({ current, ids }) => {
      const store = window.__store
      if (!store) {
        throw new Error('BarkOS E2E renderer store is unavailable')
      }
      const state = store.getState()
      const now = Date.now()
      const limits = (usedPercent: number) => ({
        provider: 'codex' as const,
        session: {
          usedPercent,
          windowMinutes: 300,
          resetsAt: now + 300_000,
          resetDescription: null
        },
        weekly: null,
        updatedAt: now,
        error: null,
        status: 'ok' as const
      })
      store.setState({
        detectedAgentIds: ['codex'],
        rateLimits: {
          ...state.rateLimits,
          codex: limits(100),
          codexTarget: { runtime: 'host', wslDistro: null },
          inactiveCodexAccounts: [
            {
              accountId: ids.readyAccountId,
              rateLimits: limits(10),
              updatedAt: now,
              isFetching: false
            }
          ]
        },
        createTab: (() => ({ id: ids.replacementTabId })) as never,
        queueTabStartupCommand: (() => undefined) as never,
        claimAutomaticAgentResume: (() => undefined) as never,
        clearSleepingAgentSession: (() => undefined) as never,
        setTabBarOrder: (() => undefined) as never
      })
      const next = store.getState()
      const providerSession = {
        key: 'session_id' as const,
        id: 'e2e-codex-session',
        transcriptPath: '/barkos-e2e/source/rollout-session.jsonl'
      }
      next.setAgentStatus(
        `${ids.sourceTabId}:source-leaf`,
        {
          state: 'done',
          prompt: 'Resume the exact bounded task.',
          agentType: 'codex',
          providerFailure: { kind: 'usage-limit-exceeded' },
          orchestration: {
            taskId: 'e2e-orchestration-task',
            dispatchId: ids.orchestrationDispatchId,
            dispatchStatus: 'dispatched'
          }
        },
        'Codex recovery source',
        { updatedAt: now, stateStartedAt: now },
        {
          tabId: ids.sourceTabId,
          worktreeId: current.workspaceId,
          terminalHandle: ids.sourceTerminalHandle,
          connectionId: null
        },
        {
          providerSession
        }
      )
      next.setAgentStatus(
        `${ids.replacementTabId}:replacement-leaf`,
        {
          state: 'done',
          prompt: 'Resume the exact bounded task.',
          agentType: 'codex'
        },
        'Codex recovery replacement',
        { updatedAt: now + 1, stateStartedAt: now + 1 },
        {
          tabId: ids.replacementTabId,
          worktreeId: current.workspaceId,
          terminalHandle: ids.replacementTerminalHandle,
          connectionId: null
        },
        {
          providerSession
        }
      )
    },
    {
      current: scenario,
      ids: {
        orchestrationDispatchId: E2E_ORCHESTRATION_DISPATCH_ID,
        readyAccountId: E2E_READY_CODEX_ACCOUNT_ID,
        replacementTabId: E2E_REPLACEMENT_TAB_ID,
        replacementTerminalHandle: E2E_REPLACEMENT_TERMINAL_HANDLE,
        sourceTabId: E2E_SOURCE_TAB_ID,
        sourceTerminalHandle: E2E_SOURCE_TERMINAL_HANDLE
      }
    }
  )
}
