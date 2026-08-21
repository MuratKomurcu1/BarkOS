import { Loader2 } from 'lucide-react'
import type { BarkosProviderFailoverAudit } from '../../../../shared/barkos/provider-capacity'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { BarkosProviderCapacityController } from './use-barkos-provider-capacity'

function conversationModeLabel(
  mode: BarkosProviderFailoverAudit['attempts'][number]['conversationMode']
): string {
  const labels = {
    'same-conversation': translate(
      'barkos.capacity.failover.sameConversation',
      'Same conversation'
    ),
    'new-session': translate('barkos.capacity.failover.newSession', 'New session'),
    unsupported: translate('barkos.capacity.failover.unsupported', 'Resume unsupported'),
    unknown: translate('barkos.capacity.failover.unknown', 'Resume state unknown')
  }
  return labels[mode]
}

function statusLabel(audit: BarkosProviderFailoverAudit): string {
  const labels = {
    active: translate('barkos.capacity.failover.active', 'Retry available'),
    succeeded: translate('barkos.capacity.failover.succeeded', 'Restarted'),
    stopped: translate('barkos.capacity.failover.stopped', 'Stopped'),
    uncertain: translate('barkos.capacity.failover.uncertain', 'Review required')
  }
  return labels[audit.state]
}

function statusVariant(
  audit: BarkosProviderFailoverAudit
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (audit.state === 'succeeded') {
    return 'default'
  }
  if (audit.state === 'uncertain') {
    return 'destructive'
  }
  return audit.state === 'stopped' ? 'secondary' : 'outline'
}

function FailoverAuditRow({ audit }: { audit: BarkosProviderFailoverAudit }) {
  const latest = audit.attempts.at(-1)
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium">{audit.taskId}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {latest?.account.accountId ??
            translate('barkos.capacity.systemDefault', 'System default')}
          {latest ? ` · ${conversationModeLabel(latest.conversationMode)}` : ''}
        </p>
      </div>
      <Badge variant={statusVariant(audit)}>{statusLabel(audit)}</Badge>
    </div>
  )
}

export function BarkosProviderFailover(props: {
  audits: readonly BarkosProviderFailoverAudit[]
  busy: boolean
  controller: BarkosProviderCapacityController
  run: (action: Promise<void>) => void
}): React.JSX.Element | null {
  const { audits, busy, controller, run } = props
  if (controller.checkableDispatches.length === 0 && audits.length === 0) {
    return null
  }
  const recoverableIds = new Set(controller.recoverableDispatches.map((dispatch) => dispatch.id))
  return (
    <div className="space-y-5">
      {controller.checkableDispatches.length > 0 ? (
        <section className="space-y-3" aria-labelledby="barkos-capacity-recovery-heading">
          <div className="space-y-1">
            <h3 id="barkos-capacity-recovery-heading" className="text-sm font-semibold">
              {translate('barkos.capacity.recoveryTitle', 'Codex Dispatch recovery')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {translate(
                'barkos.capacity.recoveryDescription',
                'A recovery check appears only after Codex reports a structured usage-limit failure for this exact Dispatch. The check re-reads BarkOS’s current account and usage state without refreshing the provider.'
              )}
            </p>
          </div>
          <div className="space-y-2">
            {controller.checkableDispatches.map((dispatch) => {
              const recoverable = recoverableIds.has(dispatch.id)
              const active =
                controller.operation?.kind !== 'syncing' &&
                controller.operation?.dispatchId === dispatch.id
              return (
                <div
                  key={dispatch.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{dispatch.taskTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dispatch.workerName} · {dispatch.id}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-40"
                    disabled={busy}
                    onClick={() =>
                      run(
                        recoverable
                          ? controller.recover(dispatch.id)
                          : controller.check(dispatch.id)
                      )
                    }
                  >
                    {active ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {active
                      ? controller.operation?.kind === 'checking'
                        ? translate('barkos.capacity.checkingRecovery', 'Checking…')
                        : translate('barkos.capacity.recovering', 'Recovering…')
                      : recoverable
                        ? translate('barkos.capacity.recover', 'Recover Dispatch')
                        : translate('barkos.capacity.checkRecovery', 'Check recovery')}
                  </Button>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {audits.length > 0 ? (
        <section className="space-y-3" aria-labelledby="barkos-capacity-history-heading">
          <h3 id="barkos-capacity-history-heading" className="text-sm font-semibold">
            {translate('barkos.capacity.historyTitle', 'Recovery history')}
          </h3>
          <div className="space-y-2">
            {audits
              .toReversed()
              .slice(0, 10)
              .map((audit) => (
                <FailoverAuditRow key={audit.id} audit={audit} />
              ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
