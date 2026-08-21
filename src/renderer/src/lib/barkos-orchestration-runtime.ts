import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'
import type { BarkosMemoryDispatchContext } from '../../../shared/barkos/memory-delivery'
import { materializeBarkosPlanInOrca } from '../../../shared/barkos/orchestration-plan-adapter'
import { dispatchBarkosAssignmentToOrca } from '../../../shared/barkos/orchestration-dispatch-adapter'
import { replaceBarkosCodexDispatchAuthority } from '../../../shared/barkos/provider-failover-dispatch'
import { stopBarkosDispatchAuthority } from '../../../shared/barkos/orchestration-dispatch-stop'
import { barkosAdapterError } from '../../../shared/barkos/orchestration-adapter-support'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
import {
  barkosRuntimeTargetsEqual,
  runtimeTargetForBarkosExecutionHost
} from './barkos-orchestration-target'

function requireRuntimeTarget(binding: BarkosWorkerSessionBinding) {
  const target = runtimeTargetForBarkosExecutionHost(binding.executionHostId)
  if (!target) {
    throw barkosAdapterError(
      'precondition-failed',
      `Worker ${binding.workerId} has an invalid execution host`,
      'runtime-target'
    )
  }
  return target
}

function runtimeEnvironmentId(binding: BarkosWorkerSessionBinding): string | null {
  const target = requireRuntimeTarget(binding)
  return target.kind === 'environment' ? target.environmentId : null
}

export async function materializeBarkosPlanOnRuntime(args: {
  ledger: BarkosWorkLedger
  objectiveId: string
  coordinator: BarkosWorkerSessionBinding
  coordinatorTerminalHandle: string
}) {
  const target = requireRuntimeTarget(args.coordinator)
  return materializeBarkosPlanInOrca({
    ledger: args.ledger,
    objectiveId: args.objectiveId,
    coordinatorTerminalHandle: args.coordinatorTerminalHandle,
    runtimeEnvironmentId: runtimeEnvironmentId(args.coordinator),
    callRpc: (method, params) => callRuntimeRpc<unknown>(target, method, params),
    persist: (ledger) => window.api.barkosWorkLedger.save(ledger)
  })
}

export async function dispatchBarkosAssignmentOnRuntime(args: {
  ledger: BarkosWorkLedger
  assignmentId: string
  coordinator: BarkosWorkerSessionBinding
  coordinatorTerminalHandle: string
  worker: BarkosWorkerSessionBinding
  workerTerminalHandle: string
  memoryContext?: BarkosMemoryDispatchContext | null
}) {
  const controlPolicy = await window.api.barkosControlPolicy.load()
  if (!controlPolicy) {
    throw barkosAdapterError(
      'control-policy-mismatch',
      'BarkOS control policy is unavailable',
      'dispatch-control'
    )
  }
  const target = requireRuntimeTarget(args.coordinator)
  const workerTarget = requireRuntimeTarget(args.worker)
  if (!barkosRuntimeTargetsEqual(target, workerTarget)) {
    throw barkosAdapterError(
      'precondition-failed',
      'Existing worker dispatch requires coordinator and worker sessions on the same BarkOS runtime',
      'runtime-target'
    )
  }
  return dispatchBarkosAssignmentToOrca({
    ledger: args.ledger,
    controlPolicy,
    assignmentId: args.assignmentId,
    coordinatorTerminalHandle: args.coordinatorTerminalHandle,
    workerTerminalHandle: args.workerTerminalHandle,
    workspaceId: args.worker.workspaceId,
    executionHostId: args.worker.executionHostId,
    memoryContext: args.memoryContext,
    callRpc: (method, params) => callRuntimeRpc<unknown>(target, method, params),
    persist: (ledger) => window.api.barkosWorkLedger.save(ledger)
  })
}

export async function replaceBarkosCodexDispatchOnRuntime(args: {
  ledger: BarkosWorkLedger
  dispatchId: string
  coordinator: BarkosWorkerSessionBinding
  coordinatorTerminalHandle: string
  sourceWorker: BarkosWorkerSessionBinding
  sourceWorkerTerminalHandle: string
  rebindCoordinator: boolean
  launchReplacement: () => Promise<{ terminalHandle: string }>
}) {
  const target = requireRuntimeTarget(args.coordinator)
  const workerTarget = requireRuntimeTarget(args.sourceWorker)
  if (
    target.kind !== 'local' ||
    workerTarget.kind !== 'local' ||
    !barkosRuntimeTargetsEqual(target, workerTarget)
  ) {
    throw barkosAdapterError(
      'precondition-failed',
      'Codex account failover supports only coordinator and worker sessions on the local runtime',
      'failover-runtime-target'
    )
  }
  return replaceBarkosCodexDispatchAuthority({
    ledger: args.ledger,
    dispatchId: args.dispatchId,
    coordinatorTerminalHandle: args.coordinatorTerminalHandle,
    sourceWorkerTerminalHandle: args.sourceWorkerTerminalHandle,
    rebindCoordinator: args.rebindCoordinator,
    launchReplacement: args.launchReplacement,
    callRpc: (method, params) => callRuntimeRpc<unknown>(target, method, params),
    persist: (ledger) => window.api.barkosWorkLedger.save(ledger)
  })
}

export async function stopBarkosDispatchOnRuntime(args: {
  ledger: BarkosWorkLedger
  dispatchId: string
  worker: BarkosWorkerSessionBinding
  workerTerminalHandle: string
}) {
  const dispatch = args.ledger.dispatches.find((entry) => entry.id === args.dispatchId)
  if (
    !dispatch ||
    dispatch.workerId !== args.worker.workerId ||
    dispatch.workspaceId !== args.worker.workspaceId ||
    dispatch.executionHostId !== args.worker.executionHostId
  ) {
    throw barkosAdapterError(
      'precondition-failed',
      'Dispatch does not match the exact worker runtime binding',
      'dispatch-stop-runtime-target'
    )
  }
  const target = requireRuntimeTarget(args.worker)
  return stopBarkosDispatchAuthority({
    ledger: args.ledger,
    dispatchId: args.dispatchId,
    workerTerminalHandle: args.workerTerminalHandle,
    callRpc: (method, params) => callRuntimeRpc<unknown>(target, method, params),
    persist: (ledger) => window.api.barkosWorkLedger.save(ledger)
  })
}
