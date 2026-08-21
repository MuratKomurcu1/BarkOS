import type { BarkosCompany, BarkosWorker } from './company'
import type { BarkosAssignment, BarkosTask } from './work-ledger'

const ACTIVE_ASSIGNMENT_STATUSES = new Set<BarkosAssignment['status']>([
  'proposed',
  'approved',
  'dispatched'
])

export const BARKOS_DEFAULT_MAX_ACTIVE_ASSIGNMENTS = 2

export type BarkosAssignmentPolicyDecision =
  | {
      ok: true
      workerId: string
      roleId: string
      matchedCapabilities: string[]
      activeAssignments: number
      environmentMatched: boolean
      consideredWorkerIds: string[]
      rationale: string
    }
  | {
      ok: false
      reason:
        | 'task-already-assigned'
        | 'no-eligible-workers'
        | 'no-worker-capacity'
        | 'capabilities-uncovered'
      consideredWorkerIds: string[]
      missingCapabilities: string[]
    }

type Candidate = {
  worker: BarkosWorker
  capabilities: Set<string>
  activeAssignments: number
  effectiveLoad: number
  environmentMatched: boolean
  missingCapabilities: string[]
}

function normalizeCapability(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

function activeAssignmentCount(assignments: readonly BarkosAssignment[], workerId: string): number {
  return assignments.filter(
    (assignment) =>
      assignment.workerId === workerId && ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)
  ).length
}

function eligibleCandidates(args: {
  company: BarkosCompany
  task: BarkosTask
  assignments: readonly BarkosAssignment[]
  excludedWorkerIds: ReadonlySet<string>
}): Candidate[] {
  const rolesById = new Map(args.company.roles.map((role) => [role.id, role]))
  const required = args.task.requiredCapabilities.map(normalizeCapability)
  return args.company.workers
    .filter(
      (worker) =>
        !args.excludedWorkerIds.has(worker.id) &&
        (worker.status === 'available' || worker.status === 'busy')
    )
    .flatMap((worker) => {
      const role = rolesById.get(worker.roleId)
      if (!role) {
        return []
      }
      const capabilities = new Set(role.capabilities.map(normalizeCapability))
      const activeAssignments = activeAssignmentCount(args.assignments, worker.id)
      return [
        {
          worker,
          capabilities,
          activeAssignments,
          effectiveLoad: activeAssignments + (worker.status === 'busy' ? 1 : 0),
          environmentMatched:
            args.task.preferredEnvironmentId === null ||
            worker.preferredEnvironmentId === args.task.preferredEnvironmentId,
          missingCapabilities: required.filter((capability) => !capabilities.has(capability))
        }
      ]
    })
}

function sortCandidates(left: Candidate, right: Candidate): number {
  if (left.effectiveLoad !== right.effectiveLoad) {
    return left.effectiveLoad - right.effectiveLoad
  }
  if (left.environmentMatched !== right.environmentMatched) {
    return left.environmentMatched ? -1 : 1
  }
  if (left.worker.status !== right.worker.status) {
    return left.worker.status === 'available' ? -1 : 1
  }
  return left.worker.id.localeCompare(right.worker.id)
}

function closestMissingCapabilities(candidates: readonly Candidate[]): string[] {
  return (
    candidates.toSorted(
      (left, right) =>
        left.missingCapabilities.length - right.missingCapabilities.length ||
        left.worker.id.localeCompare(right.worker.id)
    )[0]?.missingCapabilities ?? []
  )
}

export function selectBarkosWorkerForTask(args: {
  company: BarkosCompany
  task: BarkosTask
  assignments: readonly BarkosAssignment[]
  maxActiveAssignments?: number
  excludedWorkerIds?: readonly string[]
}): BarkosAssignmentPolicyDecision {
  const maxActiveAssignments = args.maxActiveAssignments ?? BARKOS_DEFAULT_MAX_ACTIVE_ASSIGNMENTS
  if (
    !Number.isInteger(maxActiveAssignments) ||
    maxActiveAssignments < 1 ||
    maxActiveAssignments > 100
  ) {
    throw new RangeError('maxActiveAssignments must be an integer between 1 and 100')
  }
  const activeForTask = args.assignments.find(
    (assignment) =>
      assignment.taskId === args.task.id && ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)
  )
  if (activeForTask) {
    return {
      ok: false,
      reason: 'task-already-assigned',
      consideredWorkerIds: [activeForTask.workerId],
      missingCapabilities: []
    }
  }

  const eligible = eligibleCandidates({
    ...args,
    excludedWorkerIds: new Set(args.excludedWorkerIds ?? [])
  })
  if (eligible.length === 0) {
    return {
      ok: false,
      reason: 'no-eligible-workers',
      consideredWorkerIds: [],
      missingCapabilities: [...args.task.requiredCapabilities]
    }
  }
  const capable = eligible.filter((candidate) => candidate.missingCapabilities.length === 0)
  if (capable.length === 0) {
    return {
      ok: false,
      reason: 'capabilities-uncovered',
      consideredWorkerIds: eligible.map((candidate) => candidate.worker.id).toSorted(),
      missingCapabilities: closestMissingCapabilities(eligible)
    }
  }
  const withCapacity = capable
    .filter((candidate) => candidate.activeAssignments < maxActiveAssignments)
    .toSorted(sortCandidates)
  if (withCapacity.length === 0) {
    return {
      ok: false,
      reason: 'no-worker-capacity',
      consideredWorkerIds: capable.map((candidate) => candidate.worker.id).toSorted(),
      missingCapabilities: []
    }
  }

  const selected = withCapacity[0]
  const matchedCapabilities = [...args.task.requiredCapabilities]
  const environmentReason = selected.environmentMatched
    ? 'preferred environment matched'
    : 'no preferred-environment match was available'
  return {
    ok: true,
    workerId: selected.worker.id,
    roleId: selected.worker.roleId,
    matchedCapabilities,
    activeAssignments: selected.activeAssignments,
    environmentMatched: selected.environmentMatched,
    consideredWorkerIds: withCapacity.map((candidate) => candidate.worker.id),
    rationale: `Matched ${matchedCapabilities.length}/${matchedCapabilities.length} required capabilities with active load ${selected.activeAssignments}; ${environmentReason}.`
  }
}
