import type { BarkosCompany } from '../../shared/barkos/company'
import {
  BARKOS_REMOTE_USAGE_COST_MAX_DISPATCHES,
  BARKOS_REMOTE_USAGE_COST_METHOD,
  BARKOS_REMOTE_USAGE_COST_RUNTIME_CAPABILITY,
  BARKOS_REMOTE_USAGE_COST_VERSION,
  parseBarkosRemoteUsageCostResponse,
  type BarkosRemoteUsageCostRecord
} from '../../shared/barkos/remote-usage-cost'
import {
  barkosUsageCostRecordSchema,
  type BarkosUsageCostCandidate,
  type BarkosUsageCostRecord
} from '../../shared/barkos/usage-cost-ledger'
import type { BarkosDispatch, BarkosWorkLedger } from '../../shared/barkos/work-ledger'
import { parseExecutionHostId } from '../../shared/execution-host'
import {
  callRuntimeEnvironment,
  getRuntimeEnvironmentStatus
} from '../ipc/runtime-environment-transport-routing'
import { createUnavailableBarkosUsageCostRecord } from './usage-cost-collector'

type SupportedProvider = 'claude' | 'codex'
type RemoteDispatch = Readonly<{
  dispatch: BarkosDispatch
  provider: SupportedProvider
  orchestrationDispatchId: string
}>

const TERMINAL_DISPATCH_STATES = new Set<BarkosDispatch['state']>([
  'succeeded',
  'failed',
  'circuit-broken',
  'cancelled'
])

function providerForDispatch(
  company: BarkosCompany,
  dispatch: BarkosDispatch
): SupportedProvider | null {
  const agentId = company.workers.find((worker) => worker.id === dispatch.workerId)?.agentId
  return agentId === 'claude' || agentId === 'codex' ? agentId : null
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function mapRemoteRecord(
  remote: BarkosRemoteUsageCostRecord,
  target: RemoteDispatch,
  now: number
): BarkosUsageCostRecord | null {
  if (remote.status === 'unavailable') {
    return createUnavailableBarkosUsageCostRecord({
      dispatch: target.dispatch,
      provider: target.provider,
      reason: 'remote-usage-unavailable',
      detail: `Remote host: ${remote.reason}`,
      now
    })
  }
  if (remote.workspaceId !== target.dispatch.workspaceId || remote.provider !== target.provider) {
    return null
  }
  return barkosUsageCostRecordSchema.parse({
    dispatchId: target.dispatch.id,
    taskId: target.dispatch.taskId,
    workerId: target.dispatch.workerId,
    provider: remote.provider,
    status: 'known',
    providerSessionId: remote.providerSessionId,
    model: remote.model,
    inputTokens: remote.inputTokens,
    outputTokens: remote.outputTokens,
    cacheReadTokens: remote.cacheReadTokens,
    cacheWriteTokens: remote.cacheWriteTokens,
    reasoningOutputTokens: remote.reasoningOutputTokens,
    totalTokens: remote.totalTokens,
    estimatedCostMicrousd: remote.estimatedCostMicrousd,
    estimatedCostSource: remote.estimatedCostSource,
    attribution: remote.attribution,
    unavailableReason: null,
    detail: null,
    periodStartedAt: remote.periodStartedAt,
    periodEndedAt: remote.periodEndedAt,
    collectedAt: now
  })
}

async function collectEnvironment(args: {
  userDataPath: string
  environmentId: string
  targets: RemoteDispatch[]
  now: number
}): Promise<BarkosUsageCostRecord[]> {
  const status = await getRuntimeEnvironmentStatus(args.userDataPath, args.environmentId, 15_000)
  if (
    status.ok === false ||
    status.result.runtimeId !== status._meta.runtimeId ||
    !status.result.capabilities?.includes(BARKOS_REMOTE_USAGE_COST_RUNTIME_CAPABILITY)
  ) {
    return []
  }
  const expectedRuntimeId = status.result.runtimeId
  const records: BarkosUsageCostRecord[] = []
  for (const targetChunk of chunks(args.targets, BARKOS_REMOTE_USAGE_COST_MAX_DISPATCHES)) {
    const response = await callRuntimeEnvironment(
      args.userDataPath,
      args.environmentId,
      BARKOS_REMOTE_USAGE_COST_METHOD,
      {
        version: BARKOS_REMOTE_USAGE_COST_VERSION,
        orchestrationDispatchIds: targetChunk.map((target) => target.orchestrationDispatchId)
      },
      30_000
    )
    if (response.ok === false || response._meta.runtimeId !== expectedRuntimeId) {
      return []
    }
    const parsed = parseBarkosRemoteUsageCostResponse(response.result)
    if (parsed.runtimeId !== expectedRuntimeId) {
      return []
    }
    for (const remote of parsed.records) {
      const matches = targetChunk.filter(
        (target) => target.orchestrationDispatchId === remote.orchestrationDispatchId
      )
      if (matches.length !== 1) {
        continue
      }
      const record = mapRemoteRecord(remote, matches[0], args.now)
      if (record) {
        records.push(record)
      }
    }
  }
  return records
}

export async function collectBarkosPairedRemoteUsageCosts(args: {
  userDataPath: string
  company: BarkosCompany
  workLedger: BarkosWorkLedger
  candidates: BarkosUsageCostCandidate[]
  now?: number
}): Promise<Map<string, BarkosUsageCostRecord>> {
  const now = args.now ?? Date.now()
  const candidates = new Map(args.candidates.map((candidate) => [candidate.dispatchId, candidate]))
  const targetsByEnvironment = new Map<string, RemoteDispatch[]>()
  for (const dispatch of args.workLedger.dispatches) {
    const host = parseExecutionHostId(dispatch.executionHostId)
    const candidate = candidates.get(dispatch.id)
    const provider = providerForDispatch(args.company, dispatch)
    if (
      host?.kind !== 'runtime' ||
      !provider ||
      !TERMINAL_DISPATCH_STATES.has(dispatch.state) ||
      dispatch.finishedAt === null ||
      !dispatch.orchestrationDispatchId ||
      candidate?.orchestrationDispatchId !== dispatch.orchestrationDispatchId
    ) {
      continue
    }
    const targets = targetsByEnvironment.get(host.environmentId) ?? []
    targets.push({ dispatch, provider, orchestrationDispatchId: dispatch.orchestrationDispatchId })
    targetsByEnvironment.set(host.environmentId, targets)
  }

  const records = new Map<string, BarkosUsageCostRecord>()
  for (const [environmentId, targets] of targetsByEnvironment) {
    try {
      for (const record of await collectEnvironment({
        userDataPath: args.userDataPath,
        environmentId,
        targets,
        now
      })) {
        records.set(record.dispatchId, record)
      }
    } catch {
      // Remote usage evidence is optional; local synchronization remains available offline.
    }
  }
  return records
}
