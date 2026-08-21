import { LoaderCircle, Workflow } from 'lucide-react'
import type {
  BarkosApprovalGate,
  BarkosAssignment,
  BarkosDispatch,
  BarkosObjective,
  BarkosPlan
} from '../../../../shared/barkos/work-ledger'
import { translate } from '@/i18n/i18n'
import type { BarkosWorkerSessionState } from '@/lib/barkos-worker-session-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarkosObjectiveTaskRow } from './BarkosObjectiveTaskRow'
import type {
  BarkosOrchestrationActions,
  BarkosOrchestrationOperation
} from './use-barkos-orchestration-actions'

const VISIBLE_TASK_LIMIT = 20

function objectiveStatusLabel(status: BarkosObjective['status']): string {
  const labels: Record<BarkosObjective['status'], string> = {
    draft: 'Taslak',
    planned: 'Planlandı',
    active: 'Etkin',
    review: 'İncelemede',
    completed: 'Tamamlandı',
    failed: 'Başarısız',
    cancelled: 'İptal edildi'
  }
  return labels[status]
}

type Props = {
  objective: BarkosObjective
  plan: BarkosPlan | undefined
  workersById: ReadonlyMap<string, string>
  activeAssignmentByTaskId: ReadonlyMap<string, BarkosAssignment>
  dispatchGateByAssignmentId: ReadonlyMap<string, BarkosApprovalGate>
  runningDispatchByAssignmentId: ReadonlyMap<string, BarkosDispatch>
  stopDispatchByTaskId: ReadonlyMap<string, BarkosDispatch>
  terminalReadyWorkerIds: ReadonlySet<string>
  coordinatorReady: boolean
  coordinatorSessionState: BarkosWorkerSessionState
  workerSessionStates: Readonly<Record<string, BarkosWorkerSessionState>>
  busy: boolean
  operation: BarkosOrchestrationOperation
  onMaterializeObjective: BarkosOrchestrationActions['materializeObjective']
  onAssignTask: BarkosOrchestrationActions['assignTask']
  onDecideDispatch: BarkosOrchestrationActions['decideDispatch']
  onDispatchAssignment: BarkosOrchestrationActions['dispatchAssignment']
  onStopDispatch: BarkosOrchestrationActions['stopDispatch']
  onReassignDispatch: BarkosOrchestrationActions['reassignDispatch']
  onSubmitEvidence: (dispatchId: string) => Promise<void>
}

export function BarkosObjectiveCard({
  objective,
  plan,
  workersById,
  activeAssignmentByTaskId,
  dispatchGateByAssignmentId,
  runningDispatchByAssignmentId,
  stopDispatchByTaskId,
  terminalReadyWorkerIds,
  coordinatorReady,
  coordinatorSessionState,
  workerSessionStates,
  busy,
  operation,
  onMaterializeObjective,
  onAssignTask,
  onDecideDispatch,
  onDispatchAssignment,
  onStopDispatch,
  onReassignDispatch,
  onSubmitEvidence
}: Props): React.JSX.Element {
  const completed = plan?.tasks.filter((task) => task.status === 'completed').length ?? 0
  const total = plan?.tasks.length ?? 0
  const planPrepared = Boolean(
    objective.orchestrationBinding && plan?.tasks.every((task) => task.orchestrationTaskId !== null)
  )
  const materializing = operation?.kind === 'materialize' && operation.id === objective.id
  const coordinatorCanStart =
    coordinatorReady ||
    coordinatorSessionState === 'starting' ||
    coordinatorSessionState === 'relaunch-required'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{objective.title}</CardTitle>
              <Badge variant="outline">{objectiveStatusLabel(objective.status)}</Badge>
            </div>
            <CardDescription className="mt-1">{objective.brief}</CardDescription>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {translate('barkos.board.objectives.progress', '{{value0}}/{{value1}} tamamlandı', {
              value0: completed,
              value1: total
            })}
          </span>
        </div>
        {plan ? (
          <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">
                {planPrepared
                  ? translate('barkos.board.orca.ready', 'BarkOS planı hazır')
                  : translate('barkos.board.orca.notReady', 'BarkOS hazırlığı gerekiyor')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {planPrepared
                  ? translate(
                      'barkos.board.orca.readyDescription',
                      'Çalışma ve görev kayıtları bağlandı. Uygun işi atamak görevi hemen başlatır.'
                    )
                  : translate(
                      'barkos.board.orca.prepareDescription',
                      'Yalnızca çalışma ve görev kayıtlarını oluşturur; ajan başlatmaz.'
                    )}
              </p>
            </div>
            {planPrepared ? (
              <Badge variant="secondary" className="w-fit shrink-0">
                {translate('barkos.board.orca.linked', 'Bağlandı')}
              </Badge>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit shrink-0"
                disabled={busy || !coordinatorCanStart}
                onClick={() => void onMaterializeObjective(objective.id)}
              >
                {materializing ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Workflow className="size-3.5" />
                )}
                {objective.orchestrationBinding
                  ? translate('barkos.board.orca.resumePreparation', 'Hazırlığa devam et')
                  : translate('barkos.board.orca.prepare', 'BarkOS içinde hazırla')}
              </Button>
            )}
            {!planPrepared && !coordinatorCanStart ? (
              <span className="text-xs text-muted-foreground sm:max-w-48">
                {translate(
                  'barkos.board.orca.launchLeadFirst',
                  'Önce Şirket bölümünden baş ajanı çalıştırın.'
                )}
              </span>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {!plan ? (
          <p className="text-sm text-muted-foreground">
            {translate('barkos.board.objectives.noPlan', 'Etkin plan yok.')}
          </p>
        ) : (
          <div className="space-y-2">
            {plan.tasks.slice(0, VISIBLE_TASK_LIMIT).map((task) => {
              const assignment = activeAssignmentByTaskId.get(task.id) ?? null
              const stopDispatch = stopDispatchByTaskId.get(task.id) ?? null
              const workerId = assignment?.workerId ?? stopDispatch?.workerId ?? null
              return (
                <BarkosObjectiveTaskRow
                  key={task.id}
                  task={task}
                  assignment={assignment}
                  dispatchGate={
                    assignment ? (dispatchGateByAssignmentId.get(assignment.id) ?? null) : null
                  }
                  runningDispatch={
                    assignment ? (runningDispatchByAssignmentId.get(assignment.id) ?? null) : null
                  }
                  stopDispatch={stopDispatch}
                  workerName={workerId ? (workersById.get(workerId) ?? workerId) : null}
                  coordinatorReady={coordinatorReady}
                  coordinatorSessionState={coordinatorSessionState}
                  workerSessionState={
                    workerId ? (workerSessionStates[workerId] ?? 'unbound') : 'unbound'
                  }
                  workerTerminalReady={Boolean(workerId && terminalReadyWorkerIds.has(workerId))}
                  busy={busy}
                  operation={operation}
                  onAssign={onAssignTask}
                  onDecideDispatch={onDecideDispatch}
                  onDispatch={onDispatchAssignment}
                  onStopDispatch={onStopDispatch}
                  onReassignDispatch={onReassignDispatch}
                  onSubmitEvidence={onSubmitEvidence}
                />
              )
            })}
            {plan.tasks.length > VISIBLE_TASK_LIMIT ? (
              <p className="text-xs text-muted-foreground">
                {translate('barkos.board.task.more', 'Bu planda {{value0}} ek görev var.', {
                  value0: plan.tasks.length - VISIBLE_TASK_LIMIT
                })}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
