import { ClipboardCheck, LoaderCircle, Play, ShieldCheck, UserRoundCheck, X } from 'lucide-react'
import type {
  BarkosApprovalGate,
  BarkosAssignment,
  BarkosDispatch,
  BarkosTask
} from '../../../../shared/barkos/work-ledger'
import { barkosTaskRequiresDispatchApproval } from '../../../../shared/barkos/task-authority'
import { translate } from '@/i18n/i18n'
import type { BarkosWorkerSessionState } from '@/lib/barkos-worker-session-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BarkosOrchestrationOperation } from './use-barkos-orchestration-actions'
import { BarkosDispatchStopControl } from './BarkosDispatchStopControl'
import { BarkosTaskAuthorityReview } from './BarkosTaskAuthorityReview'
import { BarkosTaskReassignmentControl } from './BarkosTaskReassignmentControl'

type Props = {
  task: BarkosTask
  assignment: BarkosAssignment | null
  dispatchGate: BarkosApprovalGate | null
  runningDispatch: BarkosDispatch | null
  stopDispatch: BarkosDispatch | null
  workerName: string | null
  coordinatorReady: boolean
  coordinatorSessionState: BarkosWorkerSessionState
  workerSessionState: BarkosWorkerSessionState
  workerTerminalReady: boolean
  busy: boolean
  operation: BarkosOrchestrationOperation
  onAssign: (taskId: string) => Promise<void>
  onDecideDispatch: (assignmentId: string, decision: 'approved' | 'rejected') => Promise<void>
  onDispatch: (assignmentId: string) => Promise<void>
  onStopDispatch: (dispatchId: string) => Promise<void>
  onReassignDispatch: (dispatchId: string) => Promise<void>
  onSubmitEvidence: (dispatchId: string) => Promise<void>
}

function taskStatusLabel(status: BarkosTask['status']): string {
  switch (status) {
    case 'draft':
      return translate('barkos.board.status.draft', 'Taslak')
    case 'blocked':
      return translate('barkos.board.status.blocked', 'Engellendi')
    case 'ready':
      return translate('barkos.board.status.ready', 'Hazır')
    case 'assigned':
      return translate('barkos.board.status.assigned', 'Atandı')
    case 'running':
      return translate('barkos.board.status.running', 'Çalışıyor')
    case 'review':
      return translate('barkos.board.status.review', 'İncelemede')
    case 'completed':
      return translate('barkos.board.status.completed', 'Tamamlandı')
    case 'failed':
      return translate('barkos.board.status.failed', 'Başarısız')
    case 'cancelled':
      return translate('barkos.board.status.cancelled', 'İptal edildi')
  }
}

function taskBadgeVariant(status: BarkosTask['status']): 'secondary' | 'outline' | 'destructive' {
  if (status === 'failed' || status === 'cancelled') {
    return 'destructive'
  }
  return status === 'completed' ? 'secondary' : 'outline'
}

function memoryDeliveryLabel(dispatch: BarkosDispatch): string | null {
  const delivery = dispatch.memoryDelivery
  if (!delivery) {
    return null
  }
  if (delivery.state === 'delivered') {
    return translate('barkos.board.task.memoryDelivered', '{{value0}} hafıza kaydı iletildi', {
      value0: delivery.memoryIds.length
    })
  }
  if (delivery.state === 'unconfirmed') {
    return translate('barkos.board.task.memoryUnconfirmed', 'Hafıza iletimi doğrulanmadı')
  }
  return translate('barkos.board.task.memoryPrepared', 'Hafıza iletimi hazırlandı')
}

export function BarkosObjectiveTaskRow({
  task,
  assignment,
  dispatchGate,
  runningDispatch,
  stopDispatch,
  workerName,
  coordinatorReady,
  coordinatorSessionState,
  workerSessionState,
  workerTerminalReady,
  busy,
  operation,
  onAssign,
  onDecideDispatch,
  onDispatch,
  onStopDispatch,
  onReassignDispatch,
  onSubmitEvidence
}: Props): React.JSX.Element {
  const assigning = operation?.kind === 'assign' && operation.id === task.id
  const approving = operation?.kind === 'approve' && operation.id === assignment?.id
  const dispatching = operation?.kind === 'dispatch' && operation.id === assignment?.id
  const stopping = operation?.kind === 'stop' && operation.id === stopDispatch?.id
  const reassigning = operation?.kind === 'reassign' && operation.id === stopDispatch?.id
  const gateAllowsDispatch =
    !barkosTaskRequiresDispatchApproval(task) || dispatchGate?.status === 'approved'
  const canOfferAssignment = task.status === 'ready' && !assignment
  const coordinatorCanStart =
    coordinatorReady ||
    coordinatorSessionState === 'starting' ||
    coordinatorSessionState === 'relaunch-required'
  const workerCanStart =
    workerTerminalReady ||
    workerSessionState === 'starting' ||
    workerSessionState === 'relaunch-required'
  const memoryLabel = runningDispatch ? memoryDeliveryLabel(runningDispatch) : null

  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {workerName ?? translate('barkos.board.task.unassigned', 'Atanmadı')}
            {task.dependencyIds.length > 0
              ? translate('barkos.board.task.dependencies', ' · {{value0}} bağımlılık', {
                  value0: task.dependencyIds.length
                })
              : ''}
          </p>
        </div>
        <Badge variant={taskBadgeVariant(task.status)}>{taskStatusLabel(task.status)}</Badge>
      </div>

      {assignment ? (
        <p className="mt-2 text-xs text-muted-foreground">{assignment.reason}</p>
      ) : null}

      <BarkosTaskAuthorityReview task={task} />

      {canOfferAssignment ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !coordinatorCanStart}
            onClick={() => void onAssign(task.id)}
          >
            {assigning ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <UserRoundCheck className="size-3.5" />
            )}
            {translate('barkos.board.task.assignAndStart', 'Ata ve başlat')}
          </Button>
          {!coordinatorCanStart ? (
            <span className="text-xs text-muted-foreground">
              {translate(
                'barkos.board.task.launchLeadFirst',
                'İşi başlatmadan önce şirketin baş ajanını çalıştırın.'
              )}
            </span>
          ) : null}
        </div>
      ) : null}

      {assignment?.status === 'approved' && dispatchGate?.status === 'pending' ? (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs text-foreground">{dispatchGate.question}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onDecideDispatch(assignment.id, 'approved')}
            >
              {approving ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              {translate('barkos.board.task.approveAndStart', 'Onayla ve başlat')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void onDecideDispatch(assignment.id, 'rejected')}
            >
              <X className="size-3.5" />
              {translate('barkos.board.task.rejectDispatch', 'Reddet')}
            </Button>
          </div>
        </div>
      ) : null}

      {assignment?.status === 'approved' && gateAllowsDispatch ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy || !coordinatorCanStart || !workerCanStart}
            onClick={() => void onDispatch(assignment.id)}
          >
            {dispatching ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {translate('barkos.board.task.startWork', 'İşi başlat')}
          </Button>
          {!workerCanStart ? (
            <span className="text-xs text-muted-foreground">
              {translate(
                'barkos.board.task.launchWorkerFirst',
                'Önce Şirket bölümünden atanan çalışanı başlatın.'
              )}
            </span>
          ) : null}
          {!workerTerminalReady && workerCanStart ? (
            <span className="text-xs text-muted-foreground">
              {translate(
                'barkos.board.task.restoreWorkerBeforeDispatch',
                'Başlatma işlemi, dağıtımdan önce kayıtlı çalışan hedefini doğrular veya yeniden açar.'
              )}
            </span>
          ) : null}
        </div>
      ) : null}

      {assignment?.status === 'dispatched' &&
      task.status === 'running' &&
      runningDispatch &&
      !runningDispatch.stop ? (
        <div className="mt-3 space-y-2">
          {memoryLabel ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              {memoryLabel} · {runningDispatch.memoryDelivery?.receiptId}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onSubmitEvidence(runningDispatch.id)}
            >
              <ClipboardCheck className="size-3.5" />
              {translate('barkos.board.task.submitEvidence', 'Kanıt gönder')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {translate(
                'barkos.board.task.submitEvidenceHelp',
                'Çalışma alanındaki sınırlı kanıtları toplayın ve incelemeye gönderin.'
              )}
            </span>
          </div>
        </div>
      ) : null}

      {stopDispatch ? (
        <>
          <BarkosDispatchStopControl
            dispatch={stopDispatch}
            workerName={workerName ?? stopDispatch.workerId}
            busy={busy}
            stopping={stopping}
            onStop={onStopDispatch}
          />
          {task.status === 'cancelled' && !assignment ? (
            <BarkosTaskReassignmentControl
              dispatch={stopDispatch}
              previousWorkerName={workerName ?? stopDispatch.workerId}
              busy={busy}
              reassigning={reassigning}
              onReassign={onReassignDispatch}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
