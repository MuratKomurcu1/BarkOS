import { Gauge, Loader2, RotateCw, ShieldCheck } from 'lucide-react'
import type {
  BarkosProvider,
  BarkosProviderCapacityLedger,
  BarkosProviderCapacityObservation
} from '../../../../shared/barkos/provider-capacity'
import { barkosProviderAccountKey } from '../../../../shared/barkos/provider-capacity'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { BarkosProviderCapacityLoadState } from '@/store/slices/barkos-provider-capacity'
import type { BarkosProviderCapacityController } from './use-barkos-provider-capacity'
import { BarkosProviderFailover } from './BarkosProviderFailover'

type Props = {
  ledger: BarkosProviderCapacityLedger | null
  loadState: BarkosProviderCapacityLoadState
  error: string | null
  controller: BarkosProviderCapacityController
}

const PROVIDER_NAMES: Record<BarkosProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  'opencode-go': 'OpenCode Go',
  kimi: 'Kimi',
  minimax: 'MiniMax',
  grok: 'Grok',
  antigravity: 'Antigravity'
}

function statusLabel(status: BarkosProviderCapacityObservation['status']): string {
  const labels = {
    available: translate('barkos.capacity.status.available', 'Available'),
    limited: translate('barkos.capacity.status.limited', 'Limit reached'),
    cooldown: translate('barkos.capacity.status.cooldown', 'Cooling down'),
    unavailable: translate('barkos.capacity.status.unavailable', 'Unavailable'),
    unknown: translate('barkos.capacity.status.unknown', 'Unknown')
  }
  return labels[status]
}

function statusVariant(
  status: BarkosProviderCapacityObservation['status']
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'available') {
    return 'default'
  }
  if (status === 'limited' || status === 'unavailable') {
    return 'destructive'
  }
  return status === 'cooldown' ? 'secondary' : 'outline'
}

function reasonLabel(reason: BarkosProviderCapacityObservation['reason']): string {
  const labels: Record<BarkosProviderCapacityObservation['reason'], string> = {
    'within-limits': translate('barkos.capacity.reason.withinLimits', 'Usage is within limits'),
    'usage-exhausted': translate('barkos.capacity.reason.usageExhausted', 'Usage exhausted'),
    'provider-retry-after': translate(
      'barkos.capacity.reason.providerRetryAfter',
      'Provider requested a retry delay'
    ),
    'missing-credentials': translate(
      'barkos.capacity.reason.missingCredentials',
      'Credentials missing'
    ),
    'stale-credentials': translate(
      'barkos.capacity.reason.staleCredentials',
      'Credentials are stale'
    ),
    'provider-error': translate('barkos.capacity.reason.providerError', 'Provider error'),
    'usage-unavailable': translate('barkos.capacity.reason.usageUnavailable', 'Usage unavailable'),
    'missing-snapshot': translate('barkos.capacity.reason.missingSnapshot', 'No usage snapshot'),
    refreshing: translate('barkos.capacity.reason.refreshing', 'Usage refresh in progress'),
    'stale-snapshot': translate('barkos.capacity.reason.staleSnapshot', 'Snapshot is stale'),
    'usage-unknown': translate('barkos.capacity.reason.usageUnknown', 'Usage is unknown')
  }
  return labels[reason]
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(value)
}

function accountLabel(observation: BarkosProviderCapacityObservation): string {
  return (
    observation.account.accountId ?? translate('barkos.capacity.systemDefault', 'System default')
  )
}

function laneLabel(observation: BarkosProviderCapacityObservation): string {
  return observation.account.runtimeLane.kind === 'host'
    ? translate('barkos.capacity.hostLane', 'Host')
    : `WSL · ${observation.account.runtimeLane.distro}`
}

function CapacityCard({ observation }: { observation: BarkosProviderCapacityObservation }) {
  const wakeAt = observation.retryAt ?? observation.resetsAt
  return (
    <Card className="gap-3 py-4 shadow-none">
      <CardHeader className="grid-cols-[minmax(0,1fr)_auto] gap-3 px-4">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate text-sm">
            {PROVIDER_NAMES[observation.account.provider]}
          </CardTitle>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {accountLabel(observation)}
          </p>
        </div>
        <Badge variant={statusVariant(observation.status)}>{statusLabel(observation.status)}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 px-4 text-xs text-muted-foreground">
        <p>{reasonLabel(observation.reason)}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt>{translate('barkos.capacity.usage', 'Usage')}</dt>
          <dd className="text-right text-foreground">
            {observation.usedPercent === null ? '—' : `${Math.round(observation.usedPercent)}%`}
          </dd>
          <dt>{translate('barkos.capacity.execution', 'Execution')}</dt>
          <dd className="truncate text-right font-mono text-foreground">
            {observation.account.executionHostId} · {laneLabel(observation)}
          </dd>
          {wakeAt ? (
            <>
              <dt>{translate('barkos.capacity.nextWindow', 'Next window')}</dt>
              <dd className="text-right text-foreground">{formatTime(wakeAt)}</dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  )
}

export function BarkosProviderCapacity({
  ledger,
  loadState,
  error,
  controller
}: Props): React.JSX.Element {
  const busy = loadState === 'saving' || controller.operation !== null
  const syncing = controller.operation?.kind === 'syncing'
  const run = (action: Promise<void>): void => {
    void action.catch(() => {
      // The durable capacity store exposes the actionable error inline.
    })
  }

  if (loadState === 'idle' || loadState === 'loading') {
    return (
      <div className="flex min-h-48 items-center justify-center" role="status">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">
          {translate('barkos.capacity.loading', 'Loading provider capacity')}
        </span>
      </div>
    )
  }

  if (loadState === 'error' && !ledger) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
        <p role="alert" className="max-w-lg text-sm text-destructive">
          {error}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => run(controller.retry())}>
          <RotateCw className="size-3.5" />
          {translate('barkos.capacity.retry', 'Reload capacity')}
        </Button>
      </div>
    )
  }

  const accounts = ledger?.accounts.slice(0, 50) ?? []
  const displayedError = controller.error ?? error
  return (
    <section className="space-y-5" aria-labelledby="barkos-provider-capacity-heading">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2
            id="barkos-provider-capacity-heading"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <Gauge className="size-4" />
            {translate('barkos.capacity.title', 'Provider capacity')}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {translate(
              'barkos.capacity.description',
              'Sync only reads the current BarkOS account and usage snapshot for the selected host. It does not refresh a provider or change an account; recovery actions are separate and explicit.'
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || !ledger}
          onClick={() => run(controller.sync())}
        >
          {syncing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RotateCw className="size-3.5" />
          )}
          {syncing
            ? translate('barkos.capacity.syncing', 'Syncing snapshot…')
            : translate('barkos.capacity.sync', 'Sync BarkOS snapshot')}
        </Button>
      </header>

      <div className="flex gap-3 rounded-lg border border-border bg-card p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          {translate(
            'barkos.capacity.failoverNotice',
            'BarkOS can check an exact, still-dispatched Codex task only after its structured rollout reports a usage-limit failure. Account recovery runs only when you choose it and revalidates every boundary before changing an account.'
          )}
        </p>
      </div>

      {displayedError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {displayedError}
        </p>
      ) : null}

      <BarkosProviderFailover
        audits={ledger?.failovers ?? []}
        busy={busy}
        controller={controller}
        run={run}
      />

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          {translate(
            'barkos.capacity.empty',
            'No capacity snapshot is stored. Sync when you want BarkOS to read BarkOS’s current selected-host snapshot.'
          )}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((observation) => (
            <CapacityCard
              key={barkosProviderAccountKey(observation.account)}
              observation={observation}
            />
          ))}
        </div>
      )}
      {(ledger?.accounts.length ?? 0) > accounts.length ? (
        <p className="text-xs text-muted-foreground">
          {translate('barkos.capacity.more', '{{value0}} additional accounts are stored.', {
            value0: (ledger?.accounts.length ?? 0) - accounts.length
          })}
        </p>
      ) : null}
    </section>
  )
}
