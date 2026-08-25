import { z } from 'zod'
import {
  addBarkosRole,
  addBarkosWorker,
  barkosEntityIdSchema,
  barkosLabelSchema,
  barkosStatementSchema,
  type BarkosCompany,
  type BarkosRole
} from './company'
import type { BarkosObjectivePlanInput } from './objective-planner'
import { OPENCODE_FREE_MODEL_ID } from '../opencode-free-model'
import { barkosAutonomousAgentSchema, type BarkosAutonomousAgent } from './provider-capabilities'

const capabilitySchema = z.string().trim().min(1).max(80)

const staffingRoleSchema = z
  .object({
    key: barkosEntityIdSchema,
    name: barkosLabelSchema,
    mission: barkosStatementSchema,
    capabilities: z.array(capabilitySchema).min(1).max(20),
    definitionOfDone: z.array(barkosStatementSchema).min(1).max(10),
    instructions: z.string().trim().min(1).max(2_000).nullable()
  })
  .strict()

const staffingWorkerSchema = z
  .object({
    name: barkosLabelSchema,
    roleKey: barkosEntityIdSchema,
    agentId: barkosAutonomousAgentSchema.nullable().optional()
  })
  .strict()

const staffingTaskSchema = z
  .object({
    key: barkosEntityIdSchema,
    title: barkosLabelSchema,
    spec: z.string().trim().min(1).max(12_000),
    roleKey: barkosEntityIdSchema,
    dependencyKeys: z.array(barkosEntityIdSchema).max(20),
    workspacePolicy: z.enum(['inherit', 'folder', 'worktree', 'isolated-worktree']),
    risk: z.enum(['low', 'medium', 'high', 'critical'])
  })
  .strict()

export const barkosStaffingProposalSchema = z
  .object({
    version: z.literal(1),
    summary: z.string().trim().min(1).max(2_000),
    roles: z.array(staffingRoleSchema).max(20),
    workers: z.array(staffingWorkerSchema).max(30),
    tasks: z.array(staffingTaskSchema).min(1).max(50)
  })
  .strict()
  .superRefine((proposal, context) => {
    const roleKeys = new Set(proposal.roles.map((role) => role.key))
    const knownRoleKeys = new Set([...roleKeys, 'lead'])
    proposal.workers.forEach((worker, index) => {
      if (!knownRoleKeys.has(worker.roleKey)) {
        context.addIssue({
          code: 'custom',
          message: `Unknown staffing role key: ${worker.roleKey}`,
          path: ['workers', index, 'roleKey']
        })
      }
    })
    const taskKeys = new Set(proposal.tasks.map((task) => task.key))
    proposal.tasks.forEach((task, index) => {
      if (!knownRoleKeys.has(task.roleKey)) {
        context.addIssue({
          code: 'custom',
          message: `Unknown task role key: ${task.roleKey}`,
          path: ['tasks', index, 'roleKey']
        })
      }
      if (
        task.dependencyKeys.some(
          (dependencyKey) => dependencyKey === task.key || !taskKeys.has(dependencyKey)
        )
      ) {
        context.addIssue({
          code: 'custom',
          message: `Invalid task dependency for ${task.key}`,
          path: ['tasks', index, 'dependencyKeys']
        })
      }
    })
  })

export type BarkosStaffingProposal = z.infer<typeof barkosStaffingProposalSchema>

export type BarkosStaffingApplication = {
  company: BarkosCompany
  addedWorkerIds: string[]
  plan: Omit<BarkosObjectivePlanInput, 'createdByWorkerId'>
}

export function parseBarkosStaffingProposal(value: unknown): BarkosStaffingProposal {
  return barkosStaffingProposalSchema.parse(value)
}

function roleCapabilityMap(roleByKey: ReadonlyMap<string, BarkosRole>): Map<string, string[]> {
  return new Map([...roleByKey].map(([key, role]) => [key, [...new Set(role.capabilities)]]))
}

function staffingAgentId(value: unknown): BarkosAutonomousAgent {
  const parsed = barkosAutonomousAgentSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`barkos_staffing_provider_not_supported:${String(value)}`)
  }
  return parsed.data
}

export function applyBarkosStaffingProposal(args: {
  company: BarkosCompany
  proposal: BarkosStaffingProposal
  objectiveTitle: string
  objectiveBrief: string
  now?: number
}): BarkosStaffingApplication {
  const proposal = parseBarkosStaffingProposal(args.proposal)
  let company = args.company
  const roleByKey = new Map<string, BarkosRole>()
  const leadRole = company.roles.find((role) => role.id === 'lead')
  if (leadRole) {
    roleByKey.set('lead', leadRole)
  }

  for (const proposalRole of proposal.roles) {
    const existing = company.roles.find((role) => role.id === proposalRole.key)
    if (existing) {
      roleByKey.set(proposalRole.key, existing)
      continue
    }
    company = addBarkosRole(
      company,
      {
        name: proposalRole.name,
        mission: proposalRole.mission,
        capabilities: [...new Set(proposalRole.capabilities)],
        definitionOfDone: proposalRole.definitionOfDone,
        instructions: proposalRole.instructions
      },
      args.now
    )
    roleByKey.set(proposalRole.key, company.roles.at(-1) as BarkosRole)
  }

  const lead = company.workers.find((worker) => worker.id === company.leadWorkerId)
  if (!lead) {
    throw new Error('barkos_company_lead_not_found')
  }
  const addedWorkerIds: string[] = []
  for (const proposalWorker of proposal.workers) {
    const role = roleByKey.get(proposalWorker.roleKey)
    if (!role) {
      throw new Error(`barkos_staffing_role_not_found:${proposalWorker.roleKey}`)
    }
    const duplicate = company.workers.some(
      (worker) =>
        worker.roleId === role.id &&
        worker.name.toLocaleLowerCase('tr-TR') === proposalWorker.name.toLocaleLowerCase('tr-TR')
    )
    if (duplicate) {
      continue
    }
    const agentId = staffingAgentId(proposalWorker.agentId ?? lead.agentId)
    company = addBarkosWorker(
      company,
      {
        name: proposalWorker.name,
        roleId: role.id,
        agentId,
        model:
          agentId === 'opencode'
            ? OPENCODE_FREE_MODEL_ID
            : agentId !== lead.agentId
              ? null
              : lead.model,
        preferredEnvironmentId: lead.preferredEnvironmentId,
        workspacePolicy: 'folder-compatible',
        status: 'available'
      },
      args.now
    )
    const worker = company.workers.at(-1)
    if (worker) {
      addedWorkerIds.push(worker.id)
    }
  }

  const capabilities = roleCapabilityMap(roleByKey)
  return {
    company,
    addedWorkerIds,
    plan: {
      title: args.objectiveTitle.slice(0, 80),
      brief: args.objectiveBrief.slice(0, 8_000),
      tasks: proposal.tasks.map((task) => ({
        draftId: task.key,
        title: task.title,
        spec: task.spec,
        requiredCapabilities: capabilities.get(task.roleKey) ?? [],
        dependencyDraftIds: task.dependencyKeys,
        workspacePolicy: task.workspacePolicy,
        preferredEnvironmentId: null,
        risk: task.risk,
        approvalPolicy:
          task.risk === 'high' || task.risk === 'critical' ? 'before-dispatch' : 'none'
      }))
    }
  }
}
