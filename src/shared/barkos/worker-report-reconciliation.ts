import { z } from 'zod'
import { submitBarkosEvidence, reviewBarkosEvidence } from './evidence-review'
import { nextBarkosLedgerRevision } from './orchestration-adapter-support'
import { barkosStaffingProposalSchema, type BarkosStaffingProposal } from './staffing-proposal'
import type { BarkosTask, BarkosWorkLedger } from './work-ledger'

const workerReportSchema = z
  .object({
    provenance: z.literal('worker_report'),
    outcome: z.enum(['succeeded', 'failed']),
    messageId: z.string().trim().min(1).max(512),
    subject: z.string().trim().min(1).max(1_000),
    body: z.string().trim().min(1).max(8_000),
    filesModified: z.array(z.string().trim().min(1).max(2_048)).max(500),
    reportPath: z.string().trim().min(1).max(2_048).nullable(),
    staffingProposal: barkosStaffingProposalSchema.nullable().optional()
  })
  .passthrough()

export type BarkosWorkerReportReconciliation = {
  ledger: BarkosWorkLedger
  changed: boolean
  accepted: boolean
  staffingProposal: BarkosStaffingProposal | null
}

function evidenceId(dispatchId: string): string {
  return dispatchId.startsWith('dispatch-')
    ? `evidence-${dispatchId.slice('dispatch-'.length)}`
    : dispatchId
}

function isAutoReviewableTask(
  ledger: BarkosWorkLedger,
  task: BarkosTask,
  filesModified: readonly string[]
): boolean {
  if (task.risk !== 'low') {
    return false
  }
  const isProjectAnalysis = task.requiredCapabilities.includes('project-analysis')
  const isStaffingDecision =
    task.requiredCapabilities.includes('planning') &&
    task.requiredCapabilities.includes('delegation')
  if (isProjectAnalysis || isStaffingDecision) {
    return filesModified.every(
      (path) => path.startsWith('.barkos/reports/') || path === '.barkos/staffing-proposal.json'
    )
  }
  return ledger.plans.some((plan) =>
    plan.tasks.some(
      (candidate) =>
        candidate.dependencyIds.includes(task.id) &&
        candidate.requiredCapabilities.includes('review')
    )
  )
}

function failDispatch(args: {
  ledger: BarkosWorkLedger
  dispatchId: string
  taskId: string
  assignmentId: string
  error: string
  now: number
}): BarkosWorkLedger {
  return nextBarkosLedgerRevision(
    args.ledger,
    {
      objectives: args.ledger.objectives.map((objective) =>
        objective.id ===
        args.ledger.plans.flatMap((plan) => plan.tasks).find((task) => task.id === args.taskId)
          ?.objectiveId
          ? { ...objective, status: 'failed' as const, updatedAt: args.now }
          : objective
      ),
      plans: args.ledger.plans.map((plan) => ({
        ...plan,
        tasks: plan.tasks.map((task) =>
          task.id === args.taskId
            ? { ...task, status: 'failed' as const, updatedAt: args.now }
            : task
        )
      })),
      assignments: args.ledger.assignments.map((assignment) =>
        assignment.id === args.assignmentId
          ? { ...assignment, status: 'rejected' as const }
          : assignment
      ),
      dispatches: args.ledger.dispatches.map((dispatch) =>
        dispatch.id === args.dispatchId
          ? {
              ...dispatch,
              state: 'failed' as const,
              error: args.error.slice(0, 2_000),
              finishedAt: args.now
            }
          : dispatch
      )
    },
    args.now
  )
}

export function reconcileBarkosWorkerReport(args: {
  ledger: BarkosWorkLedger
  orchestrationTaskId: string
  result: unknown
  now?: number
}): BarkosWorkerReportReconciliation {
  let resultValue = args.result
  if (typeof resultValue === 'string') {
    try {
      resultValue = JSON.parse(resultValue)
    } catch {
      return { ledger: args.ledger, changed: false, accepted: false, staffingProposal: null }
    }
  }
  const report = workerReportSchema.safeParse(resultValue)
  if (!report.success) {
    return { ledger: args.ledger, changed: false, accepted: false, staffingProposal: null }
  }
  const task = args.ledger.plans
    .flatMap((plan) => plan.tasks)
    .find((entry) => entry.orchestrationTaskId === args.orchestrationTaskId)
  const dispatch = task
    ? args.ledger.dispatches.find((entry) => entry.taskId === task.id && entry.state === 'running')
    : null
  const assignment = dispatch
    ? args.ledger.assignments.find((entry) => entry.id === dispatch.assignmentId)
    : null
  if (!task || !dispatch || !assignment) {
    return { ledger: args.ledger, changed: false, accepted: false, staffingProposal: null }
  }
  const now = args.now ?? Date.now()
  if (report.data.outcome === 'failed') {
    return {
      ledger: failDispatch({
        ledger: args.ledger,
        dispatchId: dispatch.id,
        taskId: task.id,
        assignmentId: assignment.id,
        error: report.data.body,
        now
      }),
      changed: true,
      accepted: false,
      staffingProposal: null
    }
  }

  const captured = submitBarkosEvidence({
    ledger: args.ledger,
    manifestId: evidenceId(dispatch.id),
    dispatchId: dispatch.id,
    capture: {
      tests: [],
      changedFiles: report.data.filesModified.map((path) => ({
        path,
        change: 'modified' as const,
        summary: 'Ajan tamamlama raporunda bildirildi.'
      })),
      diffSummary: report.data.reportPath ? `Ajan raporu: ${report.data.reportPath}` : null,
      terminalExcerpts: [{ label: report.data.subject, excerpt: report.data.body }],
      screenshots: [],
      risks: [],
      unresolvedDecisions: []
    },
    now
  })
  const accepted = isAutoReviewableTask(args.ledger, task, report.data.filesModified)
  const reviewed = accepted
    ? reviewBarkosEvidence({
        ledger: captured,
        evidenceId: evidenceId(dispatch.id),
        decision: 'accepted',
        now: now + 1
      })
    : captured
  return {
    // Why: report capture and its policy-driven auto-review are one persisted transaction.
    ledger: accepted ? { ...reviewed, revision: captured.revision } : reviewed,
    changed: true,
    accepted,
    staffingProposal: accepted ? (report.data.staffingProposal ?? null) : null
  }
}
