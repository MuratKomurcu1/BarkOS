import { z } from 'zod'

const ENTITY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const BARKOS_COMPANY_SCHEMA_VERSION = 1 as const
export const BARKOS_MAX_ROLES = 50
export const BARKOS_MAX_WORKERS = 100

export const barkosEntityIdSchema = z.string().min(1).max(64).regex(ENTITY_ID_PATTERN)
export const barkosLabelSchema = z.string().trim().min(1).max(80)
export const barkosStatementSchema = z.string().trim().min(1).max(2_000)
const optionalStatementSchema = z.string().trim().max(2_000).nullable()
const capabilitySchema = z.string().trim().min(1).max(80)

export const barkosRoleSchema = z
  .object({
    id: barkosEntityIdSchema,
    name: barkosLabelSchema,
    mission: barkosStatementSchema,
    capabilities: z.array(capabilitySchema).max(50),
    definitionOfDone: z.array(barkosStatementSchema).min(1).max(20),
    instructions: optionalStatementSchema
  })
  .strict()

export const barkosWorkerSchema = z
  .object({
    id: barkosEntityIdSchema,
    name: barkosLabelSchema,
    roleId: barkosEntityIdSchema,
    agentId: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(160).nullable(),
    preferredEnvironmentId: z.string().trim().min(1).max(160).nullable(),
    workspacePolicy: z.enum(['inherit', 'isolated-worktree', 'folder-compatible']),
    status: z.enum(['available', 'busy', 'paused', 'offline'])
  })
  .strict()

export const barkosCompanySchema = z
  .object({
    schemaVersion: z.literal(BARKOS_COMPANY_SCHEMA_VERSION),
    id: barkosEntityIdSchema,
    name: barkosLabelSchema,
    mission: barkosStatementSchema,
    leadWorkerId: barkosEntityIdSchema,
    roles: z.array(barkosRoleSchema).min(1).max(BARKOS_MAX_ROLES),
    workers: z.array(barkosWorkerSchema).min(1).max(BARKOS_MAX_WORKERS),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative()
  })
  .strict()
  .superRefine((company, context) => {
    const roleIds = new Set<string>()
    for (const [index, role] of company.roles.entries()) {
      if (roleIds.has(role.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate role id: ${role.id}`,
          path: ['roles', index, 'id']
        })
      }
      roleIds.add(role.id)
    }

    const workerIds = new Set<string>()
    for (const [index, worker] of company.workers.entries()) {
      if (workerIds.has(worker.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate worker id: ${worker.id}`,
          path: ['workers', index, 'id']
        })
      }
      workerIds.add(worker.id)
      if (!roleIds.has(worker.roleId)) {
        context.addIssue({
          code: 'custom',
          message: `Unknown role id: ${worker.roleId}`,
          path: ['workers', index, 'roleId']
        })
      }
    }

    if (!workerIds.has(company.leadWorkerId)) {
      context.addIssue({
        code: 'custom',
        message: `Unknown lead worker id: ${company.leadWorkerId}`,
        path: ['leadWorkerId']
      })
    }

    if (company.updatedAt < company.createdAt) {
      context.addIssue({
        code: 'custom',
        message: 'updatedAt must not be earlier than createdAt',
        path: ['updatedAt']
      })
    }
  })

export type BarkosRole = z.infer<typeof barkosRoleSchema>
export type BarkosWorker = z.infer<typeof barkosWorkerSchema>
export type BarkosCompany = z.infer<typeof barkosCompanySchema>

export type CreateBarkosCompanyInput = {
  name: string
  mission: string
  leadName: string
  agentId?: string
  now?: number
}

export type BarkosRoleInput = Omit<BarkosRole, 'id'>
export type BarkosWorkerInput = Omit<BarkosWorker, 'id'>

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

function uniqueEntityId(value: string, fallback: string, existingIds: Set<string>): string {
  const base = entityIdFromLabel(value, fallback)
  if (!existingIds.has(base)) {
    return base
  }

  for (let suffix = 2; suffix <= 10_000; suffix += 1) {
    const suffixText = `-${suffix}`
    const candidate = `${base.slice(0, 64 - suffixText.length).replace(/-+$/g, '')}${suffixText}`
    if (!existingIds.has(candidate)) {
      return candidate
    }
  }
  throw new Error('barkos_entity_id_capacity_exhausted')
}

function nextUpdatedAt(company: BarkosCompany, now = Date.now()): number {
  return Math.max(now, company.updatedAt + 1)
}

export function createBarkosCompany(input: CreateBarkosCompanyInput): BarkosCompany {
  const now = input.now ?? Date.now()
  const leadWorkerId = entityIdFromLabel(input.leadName, 'lead-worker')

  return parseBarkosCompany({
    schemaVersion: BARKOS_COMPANY_SCHEMA_VERSION,
    id: entityIdFromLabel(input.name, 'company'),
    name: input.name,
    mission: input.mission,
    leadWorkerId,
    roles: [
      {
        id: 'lead',
        name: 'Baş Ajan',
        mission: 'Şirket hedefini açık, doğrulanabilir ve bölünebilir işlere dönüştür.',
        capabilities: ['planning', 'delegation', 'review'],
        definitionOfDone: ['İş kanıtlarıyla teslim edildi ve şirket durumu güncel.'],
        instructions: null
      }
    ],
    workers: [
      {
        id: leadWorkerId,
        name: input.leadName,
        roleId: 'lead',
        agentId: input.agentId ?? 'codex',
        model: null,
        preferredEnvironmentId: null,
        workspacePolicy: 'inherit',
        status: 'available'
      }
    ],
    createdAt: now,
    updatedAt: now
  })
}

export function updateBarkosCompanyProfile(
  company: BarkosCompany,
  updates: Pick<BarkosCompany, 'name' | 'mission'>,
  now?: number
): BarkosCompany {
  return parseBarkosCompany({
    ...company,
    name: updates.name,
    mission: updates.mission,
    updatedAt: nextUpdatedAt(company, now)
  })
}

export function addBarkosRole(
  company: BarkosCompany,
  input: BarkosRoleInput,
  now?: number
): BarkosCompany {
  const id = uniqueEntityId(input.name, 'role', new Set(company.roles.map((role) => role.id)))
  return parseBarkosCompany({
    ...company,
    roles: [...company.roles, { id, ...input }],
    updatedAt: nextUpdatedAt(company, now)
  })
}

export function updateBarkosRole(
  company: BarkosCompany,
  roleId: string,
  input: BarkosRoleInput,
  now?: number
): BarkosCompany {
  if (!company.roles.some((role) => role.id === roleId)) {
    throw new Error('barkos_role_not_found')
  }
  return parseBarkosCompany({
    ...company,
    roles: company.roles.map((role) => (role.id === roleId ? { id: roleId, ...input } : role)),
    updatedAt: nextUpdatedAt(company, now)
  })
}

export function addBarkosWorker(
  company: BarkosCompany,
  input: BarkosWorkerInput,
  now?: number
): BarkosCompany {
  const id = uniqueEntityId(
    input.name,
    'worker',
    new Set(company.workers.map((worker) => worker.id))
  )
  return parseBarkosCompany({
    ...company,
    workers: [...company.workers, { id, ...input }],
    updatedAt: nextUpdatedAt(company, now)
  })
}

export function updateBarkosWorker(
  company: BarkosCompany,
  workerId: string,
  input: BarkosWorkerInput,
  now?: number
): BarkosCompany {
  if (!company.workers.some((worker) => worker.id === workerId)) {
    throw new Error('barkos_worker_not_found')
  }
  return parseBarkosCompany({
    ...company,
    workers: company.workers.map((worker) =>
      worker.id === workerId ? { id: workerId, ...input } : worker
    ),
    updatedAt: nextUpdatedAt(company, now)
  })
}

export function setBarkosCompanyLead(
  company: BarkosCompany,
  workerId: string,
  now?: number
): BarkosCompany {
  if (!company.workers.some((worker) => worker.id === workerId)) {
    throw new Error('barkos_worker_not_found')
  }
  return parseBarkosCompany({
    ...company,
    leadWorkerId: workerId,
    updatedAt: nextUpdatedAt(company, now)
  })
}

export function parseBarkosCompany(value: unknown): BarkosCompany {
  return barkosCompanySchema.parse(value)
}

export function safeParseBarkosCompany(value: unknown): z.ZodSafeParseResult<BarkosCompany> {
  return barkosCompanySchema.safeParse(value)
}
