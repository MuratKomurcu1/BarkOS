import { CircleDollarSign, Database, RefreshCw } from 'lucide-react'
import {
  summarizeBarkosUsageCosts,
  type BarkosUsageCostLedger,
  type BarkosUsageCostUnavailableReason
} from '../../../../shared/barkos/usage-cost-ledger'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { translate } from '@/i18n/i18n'
import type { BarkosUsageCostController } from './use-barkos-usage-cost'

const tokenFormatter = new Intl.NumberFormat()
const costFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6
})

function unavailableReasonCopy(reason: BarkosUsageCostUnavailableReason): string {
  const copy: Record<BarkosUsageCostUnavailableReason, string> = {
    'provider-unsupported': translate(
      'barkos.cost.reason.providerUnsupported',
      'This worker provider does not expose accounting records to BarkOS.'
    ),
    'remote-usage-unavailable': translate(
      'barkos.cost.reason.remoteUnavailable',
      'The execution ran on a host whose local usage log is unavailable here.'
    ),
    'provider-session-missing': translate(
      'barkos.cost.reason.sessionMissing',
      'No exact provider session remains attached to this Dispatch.'
    ),
    'usage-not-enabled': translate(
      'barkos.cost.reason.trackingDisabled',
      'Usage tracking is disabled for this provider.'
    ),
    'scan-failed': translate(
      'barkos.cost.reason.scanFailed',
      'The provider usage log could not be scanned.'
    ),
    'session-not-found': translate(
      'barkos.cost.reason.sessionNotFound',
      'The exact provider session was not found in the usage log.'
    ),
    'shared-provider-session': translate(
      'barkos.cost.reason.sharedSession',
      'This provider session was reused, so task-level totals would be ambiguous.'
    ),
    'workspace-mismatch': translate(
      'barkos.cost.reason.workspaceMismatch',
      'The provider record does not belong to the Dispatch workspace.'
    ),
    'session-outside-dispatch-window': translate(
      'barkos.cost.reason.outsideWindow',
      'The provider session contains activity outside this Dispatch.'
    )
  }
  return copy[reason]
}

function taskTitle(ledger: BarkosWorkLedger | null, taskId: string): string {
  return (
    ledger?.plans.flatMap((plan) => plan.tasks).find((task) => task.id === taskId)?.title ?? taskId
  )
}

function SummaryCard(props: { label: string; value: string; detail: string }): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{props.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold tabular-nums text-foreground">{props.value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{props.detail}</p>
      </CardContent>
    </Card>
  )
}

export function BarkosUsageCost(props: {
  ledger: BarkosUsageCostLedger | null
  workLedger: BarkosWorkLedger | null
  controller: BarkosUsageCostController
}): React.JSX.Element {
  const { controller } = props
  const summary = props.ledger ? summarizeBarkosUsageCosts(props.ledger) : null
  const busy = controller.loadState === 'loading' || controller.loadState === 'syncing'
  return (
    <section className="space-y-4" aria-labelledby="barkos-usage-cost-title">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle
              id="barkos-usage-cost-title"
              role="heading"
              aria-level={2}
              className="flex items-center gap-2"
            >
              <CircleDollarSign className="size-4 text-muted-foreground" />
              {translate('barkos.cost.title', 'Usage & cost')}
            </CardTitle>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {translate(
                'barkos.cost.description',
                'Token totals come from local provider logs. Dollar values are API-equivalent estimates, not provider invoices. They never change execution-unit limits.'
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={controller.sync}
          >
            <RefreshCw
              className={`size-3.5 ${controller.loadState === 'syncing' ? 'animate-spin' : ''}`}
            />
            {translate('barkos.cost.sync', 'Sync usage records')}
          </Button>
        </CardHeader>
      </Card>

      {controller.error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <span>{controller.error}</span>
          <Button type="button" variant="outline" size="sm" onClick={controller.reload}>
            {translate('barkos.cost.retry', 'Retry')}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label={translate('barkos.cost.tokens', 'Provider tokens')}
          value={summary ? tokenFormatter.format(summary.totalTokens) : '—'}
          detail={translate('barkos.cost.tokensDetail', 'Only exclusive, attributable sessions')}
        />
        <SummaryCard
          label={translate('barkos.cost.estimate', 'API-equivalent estimate')}
          value={
            summary?.estimatedCostMicrousd == null
              ? '—'
              : costFormatter.format(summary.estimatedCostMicrousd / 1_000_000)
          }
          detail={
            summary
              ? translate(
                  'barkos.cost.estimateCoverage',
                  'Estimated for {{value0}} of {{value1}} attributed Dispatches; not an invoice',
                  {
                    value0: summary.estimatedDispatches,
                    value1: summary.knownDispatches
                  }
                )
              : translate('barkos.cost.estimateDetail', 'Pricing-table estimate; not an invoice')
          }
        />
        <SummaryCard
          label={translate('barkos.cost.coverage', 'Attribution coverage')}
          value={summary ? `${summary.knownDispatches}/${props.ledger?.records.length ?? 0}` : '—'}
          detail={translate('barkos.cost.coverageDetail', 'Known Dispatch records')}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Database className="size-4 text-muted-foreground" />
            {translate('barkos.cost.records', 'Dispatch accounting records')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {props.ledger?.records.length ? (
            props.ledger.records.map((record) => (
              <article key={record.dispatchId} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      {taskTitle(props.workLedger, record.taskId)}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {record.provider ??
                        translate('barkos.cost.unsupportedProvider', 'Unsupported provider')}{' '}
                      · {record.dispatchId}
                    </p>
                  </div>
                  <Badge variant={record.status === 'known' ? 'secondary' : 'outline'}>
                    {record.status === 'known'
                      ? translate('barkos.cost.known', 'Attributed')
                      : translate('barkos.cost.unavailable', 'Unavailable')}
                  </Badge>
                </div>
                {record.status === 'known' ? (
                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">
                        {translate('barkos.cost.totalTokens', 'Total tokens')}
                      </dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {tokenFormatter.format(record.totalTokens ?? 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {translate('barkos.cost.model', 'Model')}
                      </dt>
                      <dd className="font-medium text-foreground">{record.model ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {translate('barkos.cost.dispatchEstimate', 'Cost estimate')}
                      </dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {record.estimatedCostMicrousd === null
                          ? '—'
                          : costFormatter.format(record.estimatedCostMicrousd / 1_000_000)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {record.unavailableReason
                      ? unavailableReasonCopy(record.unavailableReason)
                      : null}
                    {record.detail ? ` ${record.detail}` : ''}
                  </p>
                )}
              </article>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {busy
                ? translate('barkos.cost.loading', 'Loading accounting records…')
                : translate(
                    'barkos.cost.empty',
                    'No completed Dispatch has been synchronized yet.'
                  )}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
