import type { ElectronApplication } from '@stablyai/playwright-test'

export type BarkosCodexFailoverFault =
  | 'none'
  | 'readback-unavailable'
  | 'dispatch-stop-uncertain'
  | 'pty-stop-unproven'
  | 'work-ledger-persistence'

export type BarkosCodexFailoverHarnessSnapshot = {
  events: string[]
  selectedAccountId: string | null
}

export const E2E_LIMITED_CODEX_ACCOUNT_ID = 'e2e-limited-account'
export const E2E_READY_CODEX_ACCOUNT_ID = 'e2e-ready-account'
export const E2E_REPLACEMENT_DISPATCH_ID = 'e2e-orchestration-dispatch-replacement'

export async function installBarkosCodexFailoverIpcHarness(
  electronApp: ElectronApplication,
  fault: BarkosCodexFailoverFault
): Promise<void> {
  await electronApp.evaluate(
    ({ ipcMain }, config) => {
      type InvokeHandler = (event: unknown, ...args: unknown[]) => unknown
      type HarnessState = BarkosCodexFailoverHarnessSnapshot & {
        fault: BarkosCodexFailoverFault
        selectionAttempted: boolean
        replacementDispatched: boolean
      }
      const registry = (ipcMain as unknown as { _invokeHandlers?: Map<string, InvokeHandler> })
        ._invokeHandlers
      if (!registry) {
        throw new Error('Electron IPC handler registry is unavailable')
      }
      const requireHandler = (channel: string): InvokeHandler => {
        const handler = registry.get(channel)
        if (!handler) {
          throw new Error(`${channel} handler was not registered`)
        }
        return handler
      }
      const productionCapacitySave = requireHandler('barkosProviderCapacity:save')
      const productionWorkLedgerSave = requireHandler('barkosWorkLedger:save')
      const productionWorkerSessionRecord = requireHandler('barkosWorkerSessions:record')
      const state: HarnessState = {
        events: [],
        fault: config.fault,
        selectedAccountId: config.limitedAccountId,
        selectionAttempted: false,
        replacementDispatched: false
      }
      ;(
        globalThis as typeof globalThis & { __barkosCodexFailoverHarness?: HarnessState }
      ).__barkosCodexFailoverHarness = state

      const accountState = () => ({
        accounts: [
          {
            id: config.limitedAccountId,
            email: 'limited@barkos-e2e.invalid',
            managedHomeRuntime: 'host',
            createdAt: 1,
            updatedAt: 1,
            lastAuthenticatedAt: 1
          },
          {
            id: config.readyAccountId,
            email: 'ready@barkos-e2e.invalid',
            managedHomeRuntime: 'host',
            createdAt: 2,
            updatedAt: 2,
            lastAuthenticatedAt: 2
          }
        ],
        activeAccountId: state.selectedAccountId,
        activeAccountIdsByRuntime: { host: state.selectedAccountId, wsl: {} }
      })
      const success = (result: unknown) => ({
        id: 'desktop-ipc',
        ok: true,
        result,
        _meta: { runtimeId: 'barkos-e2e-runtime' }
      })

      ipcMain.removeHandler('claudeAccounts:list')
      ipcMain.handle('claudeAccounts:list', () => ({
        accounts: [],
        activeAccountId: null,
        activeAccountIdsByRuntime: { host: null, wsl: {} }
      }))
      ipcMain.removeHandler('codexAccounts:list')
      ipcMain.handle('codexAccounts:list', () => {
        if (state.selectionAttempted) {
          state.events.push('codex:readback')
          if (state.fault === 'readback-unavailable') {
            throw new Error('Injected Codex account readback failure')
          }
        } else {
          state.events.push('codex:list')
        }
        return accountState()
      })
      ipcMain.removeHandler('codexAccounts:select')
      ipcMain.handle('codexAccounts:select', (_event, args: { accountId: string | null }) => {
        state.events.push(`codex:select:${args.accountId ?? 'system-default'}`)
        state.selectionAttempted = true
        state.selectedAccountId = args.accountId
        return accountState()
      })
      ipcMain.removeHandler('codexAccounts:prepareFailoverResume')
      ipcMain.handle(
        'codexAccounts:prepareFailoverResume',
        (_event, args: { providerSession: { key: string; id: string } }) => {
          state.events.push('codex:prepare-resume')
          return {
            key: args.providerSession.key,
            id: args.providerSession.id,
            transcriptPath: '/barkos-e2e/managed/rollout-session.jsonl'
          }
        }
      )

      ipcMain.removeHandler('runtime:call')
      ipcMain.handle('runtime:call', (_event, args: { method: string; params?: unknown }) => {
        state.events.push(`runtime:${args.method}`)
        const params = (args.params ?? {}) as Record<string, unknown>
        if (
          args.method === 'orchestration.workerStop' &&
          state.fault === 'dispatch-stop-uncertain'
        ) {
          return {
            id: 'desktop-ipc',
            ok: false,
            error: { code: 'timeout', message: 'Injected Dispatch stop uncertainty' },
            _meta: { runtimeId: 'barkos-e2e-runtime' }
          }
        }
        if (args.method === 'orchestration.workerStop') {
          return success({
            dispatchId: params.dispatch,
            state: 'stopped',
            processAction: 'none'
          })
        }
        if (args.method === 'terminal.close') {
          return success({
            close: {
              handle: params.terminal,
              ptyKilled: state.fault !== 'pty-stop-unproven'
            }
          })
        }
        if (args.method === 'orchestration.runUse') {
          return success({ run: { id: params.id }, binding: { consumerGeneration: 2 } })
        }
        if (args.method === 'orchestration.taskUpdate') {
          return success({ task: { id: params.id, status: 'ready' } })
        }
        if (args.method === 'orchestration.dispatch') {
          state.replacementDispatched = true
          return success({
            dispatch: {
              id: config.replacementDispatchId,
              task_id: params.task
            },
            injected: true
          })
        }
        throw new Error(`Unexpected BarkOS E2E runtime method: ${args.method}`)
      })

      ipcMain.removeHandler('barkosProviderCapacity:save')
      ipcMain.handle('barkosProviderCapacity:save', (event, value) => {
        state.events.push('capacity:save')
        return productionCapacitySave(event, value)
      })
      ipcMain.removeHandler('barkosWorkLedger:save')
      ipcMain.handle('barkosWorkLedger:save', (event, value) => {
        state.events.push('work-ledger:save')
        if (state.fault === 'work-ledger-persistence' && state.replacementDispatched) {
          state.events.push('work-ledger:save-error')
          throw new Error('Injected work-ledger persistence failure')
        }
        return productionWorkLedgerSave(event, value)
      })
      ipcMain.removeHandler('barkosWorkerSessions:record')
      ipcMain.handle('barkosWorkerSessions:record', (event, value) => {
        state.events.push('worker-session:record')
        return productionWorkerSessionRecord(event, value)
      })
    },
    {
      fault,
      limitedAccountId: E2E_LIMITED_CODEX_ACCOUNT_ID,
      readyAccountId: E2E_READY_CODEX_ACCOUNT_ID,
      replacementDispatchId: E2E_REPLACEMENT_DISPATCH_ID
    }
  )
}

export function readBarkosCodexFailoverHarness(
  electronApp: ElectronApplication
): Promise<BarkosCodexFailoverHarnessSnapshot> {
  return electronApp.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        __barkosCodexFailoverHarness?: BarkosCodexFailoverHarnessSnapshot
      }
    ).__barkosCodexFailoverHarness
    if (!state) {
      throw new Error('BarkOS Codex failover harness is not installed')
    }
    return { events: [...state.events], selectedAccountId: state.selectedAccountId }
  })
}
