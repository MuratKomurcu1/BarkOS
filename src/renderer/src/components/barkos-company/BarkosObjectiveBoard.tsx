import { useMemo } from 'react'
import { CheckCircle2, ClipboardCheck, ListTodo, LoaderCircle, Plus, RotateCw } from 'lucide-react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type {
  BarkosApprovalGate,
  BarkosAssignment,
  BarkosDispatch,
  BarkosEvidenceManifest,
  BarkosTask,
  BarkosWorkLedger
} from '../../../../shared/barkos/work-ledger'
import type { BarkosWorkLedgerLoadState } from '@/store/slices/barkos-work-ledger'
import { translate } from '@/i18n/i18n'
import type { BarkosWorkerSessionState } from '@/lib/barkos-worker-session-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarkosEvidenceReviewCard } from './BarkosEvidenceReviewCard'
import { BarkosObjectiveCard } from './BarkosObjectiveCard'
import type {
  BarkosOrchestrationActions,
  BarkosOrchestrationOperation
} from './use-barkos-orchestration-actions'

const VISIBLE_REVIEW_LIMIT = 20

type Props = {
  company: BarkosCompany
  ledger: BarkosWorkLedger | null
  loadState: BarkosWorkLedgerLoadState
  error: string | null
  onRetry: () => void
  onCreateObjective: () => void
  onReview: (evidenceId: string, decision: 'accepted' | 'rejected') => Promise<void>
  operation: BarkosOrchestrationOperation
  terminalReadyWorkerIds: readonly string[]
  workerSessionStates: Readonly<Record<string, BarkosWorkerSessionState>>
  onMaterializeObjective: BarkosOrchestrationActions['materializeObjective']
  onAssignTask: BarkosOrchestrationActions['assignTask']
  onDecideDispatch: BarkosOrchestrationActions['decideDispatch']
  onDispatchAssignment: BarkosOrchestrationActions['dispatchAssignment']
  onStopDispatch: BarkosOrchestrationActions['stopDispatch']
  onReassignDispatch: BarkosOrchestrationActions['reassignDispatch']
  onSubmitEvidence: (dispatchId: string) => Promise<void>
}

type BoardIndex = {
  tasksById: Map<string, BarkosTask>
  workerNameByTaskId: Map<string, string>
  workersById: Map<string, string>
  activeAssignmentByTaskId: Map<string, BarkosAssignment>
  dispatchGateByAssignmentId: Map<string, BarkosApprovalGate>
  runningDispatchByAssignmentId: Map<string, BarkosDispatch>
  stopDispatchByTaskId: Map<string, BarkosDispatch>
  pendingEvidence: BarkosEvidenceManifest[]
}

function createBoardIndex(company: BarkosCompany, ledger: BarkosWorkLedger): BoardIndex {
  const tasksById = new Map(
    ledger.plans.flatMap((plan) => plan.tasks.map((task) => [task.id, task] as const))
  )
  const workersById = new Map(company.workers.map((worker) => [worker.id, worker.name]))
  const assignmentsById = new Map(
    ledger.assignments.map((assignment) => [assignment.id, assignment])
  )
  const activeAssignmentByTaskId = new Map<string, BarkosAssignment>()
  const latestAssignments = new Map<string, (typeof ledger.assignments)[number]>()
  for (const assignment of ledger.assignments) {
    const current = latestAssignments.get(assignment.taskId)
    if (!current || current.assignedAt <= assignment.assignedAt) {
      latestAssignments.set(assignment.taskId, assignment)
    }
    if (['proposed', 'approved', 'dispatched'].includes(assignment.status)) {
      const active = activeAssignmentByTaskId.get(assignment.taskId)
      if (!active || active.assignedAt <= assignment.assignedAt) {
        activeAssignmentByTaskId.set(assignment.taskId, assignment)
      }
    }
  }
  const workerNameByTaskId = new Map(
    [...latestAssignments].map(([taskId, assignment]) => [
      taskId,
      workersById.get(assignment.workerId) ?? assignment.workerId
    ])
  )
  const stopDispatchByTaskId = new Map<string, BarkosDispatch>()
  for (const dispatch of ledger.dispatches) {
    const sourceAssignment = assignmentsById.get(dispatch.assignmentId)
    if (
      (dispatch.state !== 'running' && dispatch.stop === null) ||
      (dispatch.stop?.state === 'completed' && sourceAssignment?.status === 'reassigned')
    ) {
      continue
    }
    const current = stopDispatchByTaskId.get(dispatch.taskId)
    if (
      !current ||
      current.attempt < dispatch.attempt ||
      (current.attempt === dispatch.attempt && current.createdAt <= dispatch.createdAt)
    ) {
      stopDispatchByTaskId.set(dispatch.taskId, dispatch)
    }
  }
  return {
    tasksById,
    workerNameByTaskId,
    workersById,
    activeAssignmentByTaskId,
    dispatchGateByAssignmentId: new Map(
      ledger.approvalGates
        .filter((gate) => gate.kind === 'dispatch' && gate.assignmentId !== null)
        .map((gate) => [gate.assignmentId as string, gate])
    ),
    runningDispatchByAssignmentId: new Map(
      ledger.dispatches
        .filter((dispatch) => dispatch.state === 'running')
        .map((dispatch) => [dispatch.assignmentId, dispatch])
    ),
    stopDispatchByTaskId,
    pendingEvidence: ledger.evidence.filter((manifest) => manifest.status === 'submitted')
  }
}

export function BarkosObjectiveBoard({
  company,
  ledger,
  loadState,
  error,
  onRetry,
  onCreateObjective,
  onReview,
  operation,
  terminalReadyWorkerIds,
  workerSessionStates,
  onMaterializeObjective,
  onAssignTask,
  onDecideDispatch,
  onDispatchAssignment,
  onStopDispatch,
  onReassignDispatch,
  onSubmitEvidence
}: Props): React.JSX.Element | null {
  const index = useMemo(
    () => (ledger ? createBoardIndex(company, ledger) : null),
    [company, ledger]
  )
  const taskCount = ledger?.plans.reduce((total, plan) => total + plan.tasks.length, 0) ?? 0
  const completedTaskCount =
    ledger?.plans.reduce(
      (total, plan) => total + plan.tasks.filter((task) => task.status === 'completed').length,
      0
    ) ?? 0
  const busy = loadState !== 'ready' || operation !== null
  const terminalReadyWorkerIdSet = useMemo(
    () => new Set(terminalReadyWorkerIds),
    [terminalReadyWorkerIds]
  )
  const coordinatorReady = terminalReadyWorkerIdSet.has(company.leadWorkerId)
  const coordinatorSessionState = workerSessionStates[company.leadWorkerId] ?? 'unbound'

  if ((loadState === 'idle' || loadState === 'loading') && !ledger) {
    return (
      <div className="flex min-h-48 items-center justify-center" role="status">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">
          {translate('barkos.board.loading', 'Hedef panosu yükleniyor')}
        </span>
      </div>
    )
  }

  if (loadState === 'error' && !ledger) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader>
          <CardTitle className="text-sm">
            {translate('barkos.board.loadFailed', 'Hedef panosu yüklenemedi')}
          </CardTitle>
          <CardDescription role="alert">{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCw className="size-3.5" />
            {translate('barkos.board.retry', 'Yeniden dene')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!ledger || !index) {
    return null
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCw className="size-3.5" />
            {translate('barkos.board.reload', 'Panoyu yenile')}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ListTodo className="size-5 text-muted-foreground" />
            <div>
              <p className="text-xl font-semibold text-foreground">{ledger.objectives.length}</p>
              <p className="text-xs text-muted-foreground">
                {translate('barkos.board.summary.objectives', 'Hedefler')}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="size-5 text-muted-foreground" />
            <div>
              <p className="text-xl font-semibold text-foreground">
                {completedTaskCount}/{taskCount}
              </p>
              <p className="text-xs text-muted-foreground">
                {translate('barkos.board.summary.tasks', 'Tamamlanan görevler')}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ClipboardCheck className="size-5 text-muted-foreground" />
            <div>
              <p className="text-xl font-semibold text-foreground">
                {index.pendingEvidence.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {translate('barkos.board.summary.reviews', 'Kanıt incelemeleri')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">
              {translate('barkos.board.reviewQueue.title', 'Kanıt inceleme kuyruğu')}
            </CardTitle>
            <Badge variant="secondary">{index.pendingEvidence.length}</Badge>
          </div>
          <CardDescription>
            {translate(
              'barkos.board.reviewQueue.description',
              'Tamamlanmayı yalnızca testler, değişiklikler, riskler ve çözülemeyen kararlar açık olduğunda kabul edin.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {index.pendingEvidence.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              {translate('barkos.board.reviewQueue.empty', 'İnceleme bekleyen kanıt yok.')}
            </p>
          ) : (
            index.pendingEvidence
              .slice(0, VISIBLE_REVIEW_LIMIT)
              .map((manifest) => (
                <BarkosEvidenceReviewCard
                  key={manifest.id}
                  manifest={manifest}
                  taskTitle={index.tasksById.get(manifest.taskId)?.title ?? manifest.taskId}
                  workerName={
                    index.workerNameByTaskId.get(manifest.taskId) ?? manifest.assignmentId
                  }
                  busy={busy}
                  onReview={onReview}
                />
              ))
          )}
          {index.pendingEvidence.length > VISIBLE_REVIEW_LIMIT ? (
            <p className="text-xs text-muted-foreground">
              {translate('barkos.board.reviewQueue.more', '{{value0}} ek inceleme kuyrukta.', {
                value0: index.pendingEvidence.length - VISIBLE_REVIEW_LIMIT
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="barkos-objectives-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="barkos-objectives-heading" className="text-base font-semibold text-foreground">
              {translate('barkos.board.objectives.title', 'Hedefler')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {translate(
                'barkos.board.objectives.description',
                'Bağımlılıkları gözeten planlar, atamalar ve yürütme durumu tek yerde.'
              )}
            </p>
          </div>
          <Button type="button" size="sm" onClick={onCreateObjective} disabled={busy}>
            <Plus className="size-3.5" />
            {translate('barkos.board.objectives.create', 'Hedef oluştur')}
          </Button>
        </div>
        {ledger.objectives.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <ListTodo className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">
                {translate('barkos.board.objectives.emptyTitle', 'Henüz hedef yok')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {translate(
                  'barkos.board.objectives.emptyDescription',
                  'Onaylanan planlar ve dağıtılan işler burada görünecek.'
                )}
              </p>
            </CardContent>
          </Card>
        ) : (
          ledger.objectives.map((objective) => (
            <BarkosObjectiveCard
              key={objective.id}
              objective={objective}
              plan={ledger.plans.find((item) => item.id === objective.activePlanId)}
              workersById={index.workersById}
              activeAssignmentByTaskId={index.activeAssignmentByTaskId}
              dispatchGateByAssignmentId={index.dispatchGateByAssignmentId}
              runningDispatchByAssignmentId={index.runningDispatchByAssignmentId}
              stopDispatchByTaskId={index.stopDispatchByTaskId}
              terminalReadyWorkerIds={terminalReadyWorkerIdSet}
              coordinatorReady={coordinatorReady}
              coordinatorSessionState={coordinatorSessionState}
              workerSessionStates={workerSessionStates}
              busy={busy}
              operation={operation}
              onMaterializeObjective={onMaterializeObjective}
              onAssignTask={onAssignTask}
              onDecideDispatch={onDecideDispatch}
              onDispatchAssignment={onDispatchAssignment}
              onStopDispatch={onStopDispatch}
              onReassignDispatch={onReassignDispatch}
              onSubmitEvidence={onSubmitEvidence}
            />
          ))
        )}
      </section>
    </div>
  )
}
