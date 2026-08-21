import { z } from 'zod'
import { parseExecutionHostId, type ExecutionHostId } from '../execution-host'
import { isTuiAgent } from '../tui-agent-config'
import type { TuiAgent } from '../tui-agent'
import { BARKOS_MAX_WORKERS, barkosEntityIdSchema, type BarkosCompany } from './company'

export const BARKOS_WORKER_SESSION_SCHEMA_VERSION = 1 as const

const boundedRuntimeIdSchema = z.string().trim().min(1).max(512)
const executionHostIdSchema = z
  .string()
  .trim()
  .max(512)
  .refine((value): value is ExecutionHostId => parseExecutionHostId(value) !== null, {
    message: 'Invalid execution host ID'
  })
const tuiAgentSchema = z.custom<TuiAgent>((value) => isTuiAgent(value), 'Invalid TUI agent')

export const barkosWorkerSessionBindingSchema = z
  .object({
    workerId: barkosEntityIdSchema,
    agent: tuiAgentSchema,
    targetId: boundedRuntimeIdSchema,
    workspaceId: boundedRuntimeIdSchema,
    workspaceKind: z.enum(['folder', 'worktree']),
    executionHostId: executionHostIdSchema,
    tabId: boundedRuntimeIdSchema.nullable(),
    state: z.enum(['created', 'requested']),
    launchedAt: z.number().int().nonnegative()
  })
  .strict()
  .superRefine((binding, context) => {
    if (binding.state === 'created' && binding.tabId === null) {
      context.addIssue({
        code: 'custom',
        message: 'Created worker sessions require a terminal tab ID',
        path: ['tabId']
      })
    }
    if (binding.state === 'requested' && binding.tabId !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Requested worker sessions cannot claim a terminal tab ID',
        path: ['tabId']
      })
    }
  })

export const barkosWorkerSessionSnapshotSchema = z
  .object({
    schemaVersion: z.literal(BARKOS_WORKER_SESSION_SCHEMA_VERSION),
    companyId: barkosEntityIdSchema,
    companyCreatedAt: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    bindings: z.array(barkosWorkerSessionBindingSchema).max(BARKOS_MAX_WORKERS),
    updatedAt: z.number().int().nonnegative()
  })
  .strict()
  .superRefine((snapshot, context) => {
    const workerIds = new Set<string>()
    snapshot.bindings.forEach((binding, index) => {
      if (workerIds.has(binding.workerId)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate worker session binding: ${binding.workerId}`,
          path: ['bindings', index, 'workerId']
        })
      }
      workerIds.add(binding.workerId)
    })
  })

export type BarkosWorkerSessionBinding = z.infer<typeof barkosWorkerSessionBindingSchema>
export type BarkosWorkerSessionSnapshot = z.infer<typeof barkosWorkerSessionSnapshotSchema>

export function parseBarkosWorkerSessionBinding(value: unknown): BarkosWorkerSessionBinding {
  return barkosWorkerSessionBindingSchema.parse(value)
}

export function parseBarkosWorkerSessionSnapshot(value: unknown): BarkosWorkerSessionSnapshot {
  return barkosWorkerSessionSnapshotSchema.parse(value)
}

export function createEmptyBarkosWorkerSessionSnapshot(
  companyId: string,
  companyCreatedAt: number,
  now = Date.now()
): BarkosWorkerSessionSnapshot {
  return parseBarkosWorkerSessionSnapshot({
    schemaVersion: BARKOS_WORKER_SESSION_SCHEMA_VERSION,
    companyId,
    companyCreatedAt,
    revision: 0,
    bindings: [],
    updatedAt: now
  })
}

function companyWorkerForBinding(
  company: BarkosCompany,
  binding: BarkosWorkerSessionBinding
): BarkosCompany['workers'][number] {
  const worker = company.workers.find((candidate) => candidate.id === binding.workerId)
  if (!worker) {
    throw new Error(`Worker session references unknown worker ${binding.workerId}`)
  }
  if (worker.agentId !== binding.agent) {
    throw new Error(`Worker session agent does not match worker ${binding.workerId}`)
  }
  return worker
}

export function parseBarkosWorkerSessionSnapshotForCompany(
  value: unknown,
  company: BarkosCompany
): BarkosWorkerSessionSnapshot {
  const snapshot = parseBarkosWorkerSessionSnapshot(value)
  if (snapshot.companyId !== company.id) {
    throw new Error('Worker session snapshot does not match the active company')
  }
  if (snapshot.companyCreatedAt !== company.createdAt) {
    throw new Error('Worker session snapshot does not match the active company generation')
  }
  snapshot.bindings.forEach((binding) => companyWorkerForBinding(company, binding))
  return snapshot
}

export function reconcileBarkosWorkerSessionSnapshot(
  value: unknown,
  company: BarkosCompany,
  now = Date.now()
): { snapshot: BarkosWorkerSessionSnapshot; changed: boolean } {
  const snapshot = parseBarkosWorkerSessionSnapshot(value)
  if (snapshot.companyId !== company.id) {
    throw new Error('Worker session snapshot does not match the active company')
  }
  if (snapshot.companyCreatedAt !== company.createdAt) {
    return {
      snapshot: createEmptyBarkosWorkerSessionSnapshot(company.id, company.createdAt, now),
      changed: true
    }
  }
  const workersById = new Map(company.workers.map((worker) => [worker.id, worker]))
  const bindings = snapshot.bindings.filter(
    (binding) => workersById.get(binding.workerId)?.agentId === binding.agent
  )
  if (bindings.length === snapshot.bindings.length) {
    return { snapshot, changed: false }
  }
  return {
    snapshot: parseBarkosWorkerSessionSnapshot({
      ...snapshot,
      revision: snapshot.revision + 1,
      bindings,
      updatedAt: Math.max(now, snapshot.updatedAt + 1)
    }),
    changed: true
  }
}

export function upsertBarkosWorkerSessionBinding(args: {
  snapshot: BarkosWorkerSessionSnapshot | null
  company: BarkosCompany
  binding: BarkosWorkerSessionBinding
  now?: number
}): BarkosWorkerSessionSnapshot {
  const binding = parseBarkosWorkerSessionBinding(args.binding)
  companyWorkerForBinding(args.company, binding)
  const current = args.snapshot
    ? parseBarkosWorkerSessionSnapshotForCompany(args.snapshot, args.company)
    : createEmptyBarkosWorkerSessionSnapshot(args.company.id, args.company.createdAt, args.now)
  const bindings = current.bindings.filter((entry) => entry.workerId !== binding.workerId)
  const now = args.now ?? Date.now()
  return parseBarkosWorkerSessionSnapshotForCompany(
    {
      ...current,
      revision: current.revision + 1,
      bindings: [...bindings, binding],
      updatedAt: Math.max(now, current.updatedAt + 1)
    },
    args.company
  )
}
