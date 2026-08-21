import type { ElectronApplication } from '@stablyai/playwright-test'

export type BarkosDispatchStopFault =
  | 'none'
  | 'intent-persistence'
  | 'worker-stop-uncertain'
  | 'authority-proof-persistence'
  | 'pty-stop-unproven'
  | 'final-persistence'

export type BarkosDispatchStopHarnessSnapshot = {
  events: string[]
  saveCount: number
}

export async function installBarkosDispatchStopIpcHarness(
  electronApp: ElectronApplication,
  fault: BarkosDispatchStopFault
): Promise<void> {
  await electronApp.evaluate(({ ipcMain }, configuredFault) => {
    type InvokeHandler = (event: unknown, ...args: unknown[]) => unknown
    type HarnessState = BarkosDispatchStopHarnessSnapshot & {
      fault: BarkosDispatchStopFault
    }
    const registry = (ipcMain as unknown as { _invokeHandlers?: Map<string, InvokeHandler> })
      ._invokeHandlers
    const productionSave = registry?.get('barkosWorkLedger:save')
    if (!registry || !productionSave) {
      throw new Error('BarkOS work-ledger IPC handler is unavailable')
    }
    const state: HarnessState = { events: [], fault: configuredFault, saveCount: 0 }
    ;(
      globalThis as typeof globalThis & { __barkosDispatchStopHarness?: HarnessState }
    ).__barkosDispatchStopHarness = state
    const success = (result: unknown) => ({
      id: 'desktop-ipc',
      ok: true,
      result,
      _meta: { runtimeId: 'barkos-stop-e2e-runtime' }
    })

    ipcMain.removeHandler('runtime:call')
    ipcMain.handle('runtime:call', (_event, args: { method: string; params?: unknown }) => {
      state.events.push(`runtime:${args.method}`)
      const params = (args.params ?? {}) as Record<string, unknown>
      if (args.method === 'orchestration.runCurrent') {
        return success({ run: null })
      }
      if (args.method === 'orchestration.workerStop') {
        if (state.fault === 'worker-stop-uncertain') {
          return {
            id: 'desktop-ipc',
            ok: false,
            error: { code: 'timeout', message: 'Injected Dispatch stop uncertainty' },
            _meta: { runtimeId: 'barkos-stop-e2e-runtime' }
          }
        }
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
      throw new Error(`Unexpected BarkOS stop runtime method: ${args.method}`)
    })

    ipcMain.removeHandler('barkosWorkLedger:save')
    ipcMain.handle('barkosWorkLedger:save', (event, value) => {
      state.saveCount += 1
      state.events.push(`work-ledger:save:${state.saveCount}`)
      const failedSave =
        (state.fault === 'intent-persistence' && state.saveCount === 1) ||
        (state.fault === 'authority-proof-persistence' && state.saveCount === 2) ||
        (state.fault === 'final-persistence' && state.saveCount === 3)
      if (failedSave) {
        state.events.push(`work-ledger:save-error:${state.saveCount}`)
        throw new Error('Injected work-ledger persistence failure')
      }
      return productionSave(event, value)
    })
  }, fault)
}

export function readBarkosDispatchStopHarness(
  electronApp: ElectronApplication
): Promise<BarkosDispatchStopHarnessSnapshot> {
  return electronApp.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        __barkosDispatchStopHarness?: BarkosDispatchStopHarnessSnapshot
      }
    ).__barkosDispatchStopHarness
    if (!state) {
      throw new Error('BarkOS Dispatch stop harness is not installed')
    }
    return { events: [...state.events], saveCount: state.saveCount }
  })
}
