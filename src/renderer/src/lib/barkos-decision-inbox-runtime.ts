import { z } from 'zod'
import type { BarkosDecisionRequest } from '../../../shared/barkos/decision-inbox'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
import { discoverBarkosDecisionRequests } from './barkos-decision-inbox-discovery'
import { runtimeTargetForBarkosExecutionHost } from './barkos-orchestration-target'

const runCurrentResponseSchema = z
  .object({
    run: z
      .object({ id: z.string().trim().min(1).max(512) })
      .passthrough()
      .nullable()
  })
  .passthrough()
const gateResolveResponseSchema = z
  .object({
    gate: z
      .object({
        id: z.string().trim().min(1).max(512),
        status: z.literal('resolved'),
        resolution: z.string().trim().min(1).max(8_000)
      })
      .passthrough()
  })
  .passthrough()
const replyResponseSchema = z
  .object({ message: z.object({ id: z.string().trim().min(1).max(512) }).passthrough() })
  .passthrough()

function runtimeTarget(binding: BarkosWorkerSessionBinding) {
  const target = runtimeTargetForBarkosExecutionHost(binding.executionHostId)
  if (!target) {
    throw new Error('BarkOS coordinator has an invalid execution host')
  }
  return target
}

function targetEnvironmentId(binding: BarkosWorkerSessionBinding): string | null {
  const target = runtimeTarget(binding)
  return target.kind === 'environment' ? target.environmentId : null
}

function ledgerOwnsRun(
  ledger: BarkosWorkLedger,
  runId: string,
  runtimeEnvironmentId: string | null
): boolean {
  return ledger.objectives.some(
    (objective) =>
      objective.orchestrationBinding?.runId === runId &&
      objective.orchestrationBinding.runtimeEnvironmentId === runtimeEnvironmentId
  )
}

async function currentRunId(args: {
  coordinator: BarkosWorkerSessionBinding
  coordinatorTerminalHandle: string
}): Promise<string | null> {
  const response = runCurrentResponseSchema.parse(
    await callRuntimeRpc<unknown>(
      runtimeTarget(args.coordinator),
      'orchestration.runCurrent',
      { from: args.coordinatorTerminalHandle },
      { timeoutMs: 10_000 }
    )
  )
  return response.run?.id ?? null
}

export async function refreshBarkosDecisionRequestsOnRuntime(args: {
  ledger: BarkosWorkLedger
  coordinator: BarkosWorkerSessionBinding
  coordinatorTerminalHandle: string
  now?: number
}): Promise<{
  requests: BarkosDecisionRequest[]
  currentRunId: string | null
  skipped: number
}> {
  const runId = await currentRunId(args)
  if (!runId || !ledgerOwnsRun(args.ledger, runId, targetEnvironmentId(args.coordinator))) {
    return { requests: [], currentRunId: null, skipped: 0 }
  }
  const target = runtimeTarget(args.coordinator)
  const [gateListResponse, messageListResponse] = await Promise.all([
    callRuntimeRpc<unknown>(
      target,
      'orchestration.gateList',
      { run: runId },
      { timeoutMs: 10_000 }
    ),
    callRuntimeRpc<unknown>(
      target,
      'orchestration.check',
      {
        terminal: args.coordinatorTerminalHandle,
        run: runId,
        all: true,
        types: 'question,decision_gate,escalation'
      },
      { timeoutMs: 10_000 }
    )
  ])
  const discovered = discoverBarkosDecisionRequests({
    ledger: args.ledger,
    runId,
    gateListResponse,
    messageListResponse,
    now: args.now
  })
  return { ...discovered, currentRunId: runId }
}

export async function resolveBarkosDecisionRequestOnRuntime(args: {
  ledger: BarkosWorkLedger
  request: BarkosDecisionRequest
  resolution: string
  coordinator: BarkosWorkerSessionBinding
  coordinatorTerminalHandle: string
}): Promise<void> {
  const runId = await currentRunId(args)
  if (
    runId !== args.request.orchestrationRunId ||
    !ledgerOwnsRun(
      args.ledger,
      args.request.orchestrationRunId,
      targetEnvironmentId(args.coordinator)
    )
  ) {
    throw new Error('This request does not belong to the coordinator’s current Orca Run')
  }
  const target = runtimeTarget(args.coordinator)
  if (args.request.sourceKind === 'gate') {
    const response = gateResolveResponseSchema.parse(
      await callRuntimeRpc<unknown>(
        target,
        'orchestration.gateResolve',
        {
          id: args.request.orchestrationGateId,
          resolution: args.resolution,
          from: args.coordinatorTerminalHandle,
          run: args.request.orchestrationRunId
        },
        { timeoutMs: 15_000 }
      )
    )
    if (
      response.gate.id !== args.request.orchestrationGateId ||
      response.gate.resolution !== args.resolution
    ) {
      throw new Error('BarkOS returned a mismatched gate resolution receipt')
    }
    return
  }

  const response = replyResponseSchema.safeParse(
    await callRuntimeRpc<unknown>(
      target,
      'orchestration.reply',
      {
        id: args.request.orchestrationMessageId,
        body: args.resolution,
        from: args.coordinatorTerminalHandle,
        run: args.request.orchestrationRunId
      },
      { timeoutMs: 15_000 }
    )
  )
  if (!response.success) {
    throw new Error('BarkOS returned an invalid decision reply receipt')
  }
}
