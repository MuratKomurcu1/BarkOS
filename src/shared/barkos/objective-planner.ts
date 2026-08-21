import { z } from 'zod'
import { barkosEntityIdSchema, barkosLabelSchema } from './company'
import { nextBarkosLedgerRevision } from './orchestration-adapter-support'
import { barkosRiskRequiresDispatchApproval } from './task-authority'
import { BARKOS_MAX_TASKS_PER_PLAN, type BarkosTask, type BarkosWorkLedger } from './work-ledger'

const capabilitySchema = z.string().trim().min(1).max(80)

export const barkosPlannedTaskInputSchema = z
  .object({
    draftId: barkosEntityIdSchema,
    title: barkosLabelSchema,
    spec: z.string().trim().min(1).max(12_000),
    requiredCapabilities: z.array(capabilitySchema).max(20),
    dependencyDraftIds: z.array(barkosEntityIdSchema).max(50),
    workspacePolicy: z.enum(['inherit', 'folder', 'worktree', 'isolated-worktree']),
    preferredEnvironmentId: z.string().trim().min(1).max(160).nullable(),
    risk: z.enum(['low', 'medium', 'high', 'critical']),
    approvalPolicy: z.enum(['none', 'before-dispatch'])
  })
  .strict()

export const barkosObjectivePlanInputSchema = z
  .object({
    title: barkosLabelSchema,
    brief: z.string().trim().min(1).max(8_000),
    createdByWorkerId: barkosEntityIdSchema,
    tasks: z.array(barkosPlannedTaskInputSchema).min(1).max(BARKOS_MAX_TASKS_PER_PLAN)
  })
  .strict()
  .superRefine((input, context) => {
    const draftIds = new Set<string>()
    input.tasks.forEach((task, index) => {
      if (draftIds.has(task.draftId)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate planner task id: ${task.draftId}`,
          path: ['tasks', index, 'draftId']
        })
      }
      draftIds.add(task.draftId)
    })
    const taskById = new Map(input.tasks.map((task) => [task.draftId, task]))
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (draftId: string): boolean => {
      if (visiting.has(draftId)) {
        return true
      }
      if (visited.has(draftId)) {
        return false
      }
      visiting.add(draftId)
      const cyclic = (taskById.get(draftId)?.dependencyDraftIds ?? []).some(visit)
      visiting.delete(draftId)
      visited.add(draftId)
      return cyclic
    }
    input.tasks.forEach((task, index) => {
      if (new Set(task.dependencyDraftIds).size !== task.dependencyDraftIds.length) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate planner task dependency',
          path: ['tasks', index, 'dependencyDraftIds']
        })
      }
      if (
        task.dependencyDraftIds.some(
          (dependencyId) => dependencyId === task.draftId || !taskById.has(dependencyId)
        )
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Invalid planner task dependency',
          path: ['tasks', index, 'dependencyDraftIds']
        })
      }
    })
    for (const [index, task] of input.tasks.entries()) {
      if (visit(task.draftId)) {
        context.addIssue({
          code: 'custom',
          message: 'Planner task dependency cycle',
          path: ['tasks', index, 'dependencyDraftIds']
        })
        break
      }
    }
  })

export type BarkosPlannedTaskInput = z.infer<typeof barkosPlannedTaskInputSchema>
export type BarkosObjectivePlanInput = z.infer<typeof barkosObjectivePlanInputSchema>

function entityIdFromLabel(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll('ı', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
  return normalized || fallback
}

function uniqueEntityId(label: string, fallback: string, existingIds: Set<string>): string {
  const base = entityIdFromLabel(label, fallback)
  if (!existingIds.has(base)) {
    existingIds.add(base)
    return base
  }
  for (let suffix = 2; suffix <= 10_000; suffix += 1) {
    const suffixText = `-${suffix}`
    const id = `${base.slice(0, 64 - suffixText.length).replace(/-+$/g, '')}${suffixText}`
    if (!existingIds.has(id)) {
      existingIds.add(id)
      return id
    }
  }
  throw new Error('barkos_entity_id_capacity_exhausted')
}

export function createBarkosObjectivePlan(args: {
  ledger: BarkosWorkLedger
  input: BarkosObjectivePlanInput
  now: number
}): BarkosWorkLedger {
  const input = barkosObjectivePlanInputSchema.parse(args.input)
  const objectiveIds = new Set(args.ledger.objectives.map((objective) => objective.id))
  const planIds = new Set(args.ledger.plans.map((plan) => plan.id))
  const taskIds = new Set(args.ledger.plans.flatMap((plan) => plan.tasks.map((task) => task.id)))
  const objectiveId = uniqueEntityId(input.title, 'objective', objectiveIds)
  const planId = uniqueEntityId(`${objectiveId}-plan`, 'objective-plan', planIds)
  const finalTaskIds = new Map<string, string>()
  for (const task of input.tasks) {
    finalTaskIds.set(
      task.draftId,
      uniqueEntityId(`${objectiveId}-${task.title}`, `${objectiveId}-task`, taskIds)
    )
  }
  const tasks: BarkosTask[] = input.tasks.map((task) => {
    const dependencyIds = task.dependencyDraftIds.map((id) => finalTaskIds.get(id) as string)
    return {
      id: finalTaskIds.get(task.draftId) as string,
      objectiveId,
      planId,
      title: task.title,
      spec: task.spec,
      requiredCapabilities: [...new Set(task.requiredCapabilities)],
      dependencyIds,
      status: dependencyIds.length === 0 ? 'ready' : 'blocked',
      workspacePolicy: task.workspacePolicy,
      preferredEnvironmentId: task.preferredEnvironmentId,
      risk: task.risk,
      approvalPolicy:
        task.approvalPolicy === 'before-dispatch' || barkosRiskRequiresDispatchApproval(task.risk)
          ? 'before-dispatch'
          : 'none',
      orchestrationTaskId: null,
      createdAt: args.now,
      updatedAt: args.now
    }
  })
  return nextBarkosLedgerRevision(
    args.ledger,
    {
      objectives: [
        ...args.ledger.objectives,
        {
          id: objectiveId,
          companyId: args.ledger.companyId,
          title: input.title,
          brief: input.brief,
          status: 'planned',
          activePlanId: planId,
          orchestrationBinding: null,
          createdByWorkerId: input.createdByWorkerId,
          createdAt: args.now,
          updatedAt: args.now
        }
      ],
      plans: [
        ...args.ledger.plans,
        {
          id: planId,
          objectiveId,
          version: 1,
          status: 'approved',
          createdByWorkerId: input.createdByWorkerId,
          tasks,
          createdAt: args.now,
          approvedAt: args.now
        }
      ]
    },
    args.now
  )
}
