import { useMemo } from 'react'
import { CircleHelp, Inbox, LoaderCircle, RefreshCw, ShieldAlert } from 'lucide-react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosDecisionInbox as BarkosDecisionInboxSnapshot } from '../../../../shared/barkos/decision-inbox'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { BarkosDecisionInboxLoadState } from '@/store/slices/barkos-decision-inbox'
import { BarkosDecisionRequestCard } from './BarkosDecisionRequestCard'
import type { BarkosDecisionInboxController } from './use-barkos-decision-inbox'

const VISIBLE_REQUEST_LIMIT = 50

type Props = {
  company: BarkosCompany
  ledger: BarkosWorkLedger | null
  inbox: BarkosDecisionInboxSnapshot | null
  loadState: BarkosDecisionInboxLoadState
  error: string | null
  controller: BarkosDecisionInboxController
}

function BarkosDecisionInboxEmpty({ currentRunId }: { currentRunId: string | null }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center">
      {currentRunId ? (
        <CircleHelp className="size-7 text-muted-foreground" />
      ) : (
        <ShieldAlert className="size-7 text-muted-foreground" />
      )}
      <h3 className="mt-3 text-sm font-semibold text-foreground">
        {currentRunId
          ? translate('barkos.decisions.empty', 'Bekleyen karar yok')
          : translate('barkos.decisions.noRun', 'Etkin BarkOS çalışması yok')}
      </h3>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">
        {currentRunId
          ? translate(
              'barkos.decisions.emptyDescription',
              'Yeni ajan soruları, onaylar ve yükseltmeler bu sayfa açıkken burada görünür.'
            )
          : translate(
              'barkos.decisions.noRunDescription',
              'Bu kutuyu yenilemeden önce baş ajanı çalıştırın ve BarkOS içinde bir hedef hazırlayın.'
            )}
      </p>
    </div>
  )
}

export function BarkosDecisionInbox({
  company,
  ledger,
  inbox,
  loadState,
  error,
  controller
}: Props): React.JSX.Element {
  const workers = useMemo(
    () => new Map(company.workers.map((worker) => [worker.id, worker.name])),
    [company.workers]
  )
  const tasks = useMemo(
    () =>
      new Map(
        (ledger?.plans ?? []).flatMap((plan) =>
          plan.tasks.map((task) => [task.id, task.title] as const)
        )
      ),
    [ledger?.plans]
  )
  const requests = (inbox?.requests ?? []).slice(0, VISIBLE_REQUEST_LIMIT)
  const pendingCount = inbox?.requests.filter((request) => request.status === 'pending').length ?? 0
  const loading = loadState === 'idle' || loadState === 'loading'
  const refreshing = controller.refreshState === 'refreshing'
  const visibleError = controller.error ?? error

  return (
    <section className="space-y-4" aria-labelledby="barkos-decision-inbox-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" />
            <h2 id="barkos-decision-inbox-title" className="text-sm font-semibold text-foreground">
              {translate('barkos.decisions.title', 'Karar gelen kutusu')}
            </h2>
            {pendingCount > 0 ? <Badge variant="default">{pendingCount}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate(
              'barkos.decisions.description',
              'Ajan sorularını, onayları ve yükseltmeleri kayıt altına alınan bir yanıtla çözün.'
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || refreshing || loadState === 'saving'}
          onClick={() => void controller.refresh()}
        >
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
          {translate('barkos.decisions.refresh', 'Yenile')}
        </Button>
      </div>

      {visibleError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {visibleError}
        </p>
      ) : null}

      {controller.skipped > 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'barkos.decisions.skipped',
            '{{value0}} bozuk veya eşleşmeyen BarkOS isteği yok sayıldı.',
            { value0: controller.skipped }
          )}
        </p>
      ) : null}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center" role="status">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          <span className="sr-only">
            {translate('barkos.decisions.loading', 'Karar kutusu yükleniyor')}
          </span>
        </div>
      ) : requests.length === 0 ? (
        <BarkosDecisionInboxEmpty currentRunId={controller.currentRunId} />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <BarkosDecisionRequestCard
              key={request.id}
              request={request}
              taskTitle={tasks.get(request.taskId) ?? request.taskId}
              workerName={
                request.requestedByWorkerId
                  ? (workers.get(request.requestedByWorkerId) ?? request.requestedByWorkerId)
                  : translate('barkos.decisions.coordinator', 'Çalışma koordinatörü')
              }
              currentRunId={controller.currentRunId}
              onResolve={controller.resolve}
            />
          ))}
        </div>
      )}
    </section>
  )
}
