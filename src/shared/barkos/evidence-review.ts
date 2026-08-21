import { nextBarkosLedgerRevision } from './orchestration-adapter-support'
import type {
  BarkosDispatch,
  BarkosEvidenceManifest,
  BarkosPlan,
  BarkosTask,
  BarkosWorkLedger
} from './work-ledger'

export type BarkosEvidenceCapture = Pick<
  BarkosEvidenceManifest,
  | 'tests'
  | 'changedFiles'
  | 'diffSummary'
  | 'terminalExcerpts'
  | 'screenshots'
  | 'risks'
  | 'unresolvedDecisions'
>

export type BarkosEvidenceDecision = 'accepted' | 'rejected'
export type BarkosEvidenceReviewErrorCode =
  | 'dispatch-not-found'
  | 'dispatch-not-running'
  | 'assignment-not-found'
  | 'task-not-found'
  | 'evidence-not-found'
  | 'evidence-not-submitted'
  | 'evidence-already-exists'
  | 'evidence-empty'

export class BarkosEvidenceReviewError extends Error {
  constructor(
    readonly code: BarkosEvidenceReviewErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'BarkosEvidenceReviewError'
  }
}

function reviewError(code: BarkosEvidenceReviewErrorCode, message: string): never {
  throw new BarkosEvidenceReviewError(code, message)
}

export function hasMaterialBarkosEvidence(capture: BarkosEvidenceCapture): boolean {
  return (
    capture.tests.length > 0 ||
    capture.changedFiles.length > 0 ||
    capture.diffSummary !== null ||
    capture.terminalExcerpts.length > 0 ||
    capture.screenshots.length > 0 ||
    capture.risks.length > 0 ||
    capture.unresolvedDecisions.length > 0
  )
}

function findTask(ledger: BarkosWorkLedger, taskId: string): BarkosTask {
  const task = ledger.plans.flatMap((plan) => plan.tasks).find((item) => item.id === taskId)
  return task ?? reviewError('task-not-found', `Task ${taskId} was not found`)
}

function findDispatch(ledger: BarkosWorkLedger, dispatchId: string): BarkosDispatch {
  const dispatch = ledger.dispatches.find((item) => item.id === dispatchId)
  return dispatch ?? reviewError('dispatch-not-found', `Dispatch ${dispatchId} was not found`)
}

function markTaskForReview(plan: BarkosPlan, taskId: string, now: number): BarkosPlan {
  const tasks = plan.tasks.map((task) =>
    task.id === taskId
      ? { ...task, status: 'review' as const, updatedAt: Math.max(now, task.updatedAt + 1) }
      : task
  )
  return { ...plan, tasks }
}

export function submitBarkosEvidence(args: {
  ledger: BarkosWorkLedger
  manifestId: string
  dispatchId: string
  capture: BarkosEvidenceCapture
  now: number
}): BarkosWorkLedger {
  const dispatch = findDispatch(args.ledger, args.dispatchId)
  if (dispatch.state !== 'running') {
    reviewError('dispatch-not-running', `Dispatch ${dispatch.id} is not running`)
  }
  const assignment = args.ledger.assignments.find((item) => item.id === dispatch.assignmentId)
  if (!assignment) {
    reviewError('assignment-not-found', `Assignment ${dispatch.assignmentId} was not found`)
  }
  const task = findTask(args.ledger, dispatch.taskId)
  if (task.status !== 'running' || assignment.status !== 'dispatched') {
    reviewError('dispatch-not-running', `Dispatch ${dispatch.id} is not active`)
  }
  if (
    args.ledger.evidence.some(
      (manifest) => manifest.id === args.manifestId || manifest.dispatchId === dispatch.id
    )
  ) {
    reviewError('evidence-already-exists', `Dispatch ${dispatch.id} already has evidence`)
  }
  if (!hasMaterialBarkosEvidence(args.capture)) {
    reviewError('evidence-empty', 'Submitted evidence must contain at least one bounded artifact')
  }

  const manifest: BarkosEvidenceManifest = {
    ...args.capture,
    id: args.manifestId,
    taskId: task.id,
    assignmentId: assignment.id,
    dispatchId: dispatch.id,
    status: 'submitted',
    producedAt: args.now,
    reviewedAt: null
  }
  return nextBarkosLedgerRevision(
    args.ledger,
    {
      plans: args.ledger.plans.map((plan) =>
        plan.id === task.planId ? markTaskForReview(plan, task.id, args.now) : plan
      ),
      dispatches: args.ledger.dispatches.map((item) =>
        item.id === dispatch.id
          ? { ...item, state: 'succeeded' as const, finishedAt: args.now }
          : item
      ),
      evidence: [...args.ledger.evidence, manifest]
    },
    args.now
  )
}

function completeAndUnlockTasks(
  tasks: readonly BarkosTask[],
  completedTaskId: string,
  now: number
): BarkosTask[] {
  const completed = tasks.map((task) =>
    task.id === completedTaskId
      ? { ...task, status: 'completed' as const, updatedAt: Math.max(now, task.updatedAt + 1) }
      : task
  )
  const completedIds = new Set(
    completed.filter((task) => task.status === 'completed').map((task) => task.id)
  )
  return completed.map((task) =>
    task.status === 'blocked' && task.dependencyIds.every((id) => completedIds.has(id))
      ? { ...task, status: 'ready' as const, updatedAt: Math.max(now, task.updatedAt + 1) }
      : task
  )
}

function reviewPlan(
  plan: BarkosPlan,
  taskId: string,
  decision: BarkosEvidenceDecision,
  now: number
): BarkosPlan {
  const tasks =
    decision === 'accepted'
      ? completeAndUnlockTasks(plan.tasks, taskId, now)
      : plan.tasks.map((task) =>
          task.id === taskId
            ? { ...task, status: 'ready' as const, updatedAt: Math.max(now, task.updatedAt + 1) }
            : task
        )
  const completed = tasks.every((task) => task.status === 'completed')
  return { ...plan, tasks, status: completed ? 'completed' : plan.status }
}

export function reviewBarkosEvidence(args: {
  ledger: BarkosWorkLedger
  evidenceId: string
  decision: BarkosEvidenceDecision
  now: number
}): BarkosWorkLedger {
  const manifest = args.ledger.evidence.find((item) => item.id === args.evidenceId)
  if (!manifest) {
    reviewError('evidence-not-found', `Evidence ${args.evidenceId} was not found`)
  }
  if (manifest.status !== 'submitted') {
    reviewError('evidence-not-submitted', `Evidence ${manifest.id} is not awaiting review`)
  }
  const task = findTask(args.ledger, manifest.taskId)
  const assignment = args.ledger.assignments.find((item) => item.id === manifest.assignmentId)
  if (!assignment) {
    reviewError('assignment-not-found', `Assignment ${manifest.assignmentId} was not found`)
  }

  const plans = args.ledger.plans.map((plan) =>
    plan.id === task.planId ? reviewPlan(plan, task.id, args.decision, args.now) : plan
  )
  const reviewedPlan = plans.find((plan) => plan.id === task.planId)
  const objectiveCompleted = reviewedPlan?.status === 'completed'
  return nextBarkosLedgerRevision(
    args.ledger,
    {
      objectives: args.ledger.objectives.map((objective) =>
        objective.id === task.objectiveId
          ? {
              ...objective,
              status: objectiveCompleted
                ? ('completed' as const)
                : args.decision === 'rejected'
                  ? ('active' as const)
                  : objective.status,
              updatedAt: Math.max(args.now, objective.updatedAt + 1)
            }
          : objective
      ),
      plans,
      assignments: args.ledger.assignments.map((item) =>
        item.id === assignment.id
          ? {
              ...item,
              status: args.decision === 'accepted' ? ('completed' as const) : ('rejected' as const)
            }
          : item
      ),
      evidence: args.ledger.evidence.map((item) =>
        item.id === manifest.id ? { ...item, status: args.decision, reviewedAt: args.now } : item
      )
    },
    args.now
  )
}
