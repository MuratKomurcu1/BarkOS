import { useState } from 'react'
import { Loader2, Pause, Play, RotateCw, ShieldCheck } from 'lucide-react'
import type {
  BarkosControlPolicy,
  BarkosControlPolicyUpdates
} from '../../../../shared/barkos/control-policy'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import type { BarkosControlPolicyLoadState } from '@/store/slices/barkos-control-policy'

type Props = {
  policy: BarkosControlPolicy | null
  ledger: BarkosWorkLedger | null
  loadState: BarkosControlPolicyLoadState
  error: string | null
  onRetry: () => Promise<BarkosControlPolicy | null>
  onUpdate: (updates: BarkosControlPolicyUpdates) => Promise<BarkosControlPolicy>
}

const ACTIVE_DISPATCH_STATES = new Set(['prepared', 'requested', 'running'])

function numericFormValue(form: FormData, name: string): number {
  return Number(form.get(name))
}

export function BarkosControlCenter({
  policy,
  ledger,
  loadState,
  error,
  onRetry,
  onUpdate
}: Props): React.JSX.Element {
  const [validationError, setValidationError] = useState<string | null>(null)
  const busy = loadState === 'saving'
  const activeDispatches =
    ledger?.dispatches.filter((dispatch) => ACTIVE_DISPATCH_STATES.has(dispatch.state)).length ?? 0
  const run = (action: Promise<unknown>): void => {
    void action.catch(() => {
      // The durable control-policy store exposes the actionable error inline.
    })
  }

  if (loadState === 'idle' || loadState === 'loading') {
    return (
      <div className="flex min-h-48 items-center justify-center" role="status">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">
          {translate('barkos.control.loading', 'Loading company controls')}
        </span>
      </div>
    )
  }

  if (!policy) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
        <p role="alert" className="max-w-lg text-sm text-destructive">
          {error ?? translate('barkos.control.unavailable', 'Company controls are unavailable.')}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => run(onRetry())}>
          <RotateCw className="size-3.5" />
          {translate('barkos.control.retry', 'Reload controls')}
        </Button>
      </div>
    )
  }

  const paused = policy.executionState === 'paused'
  const updateExecutionState = (): void => {
    setValidationError(null)
    run(
      onUpdate({
        executionState: paused ? 'running' : 'paused',
        maxConcurrentDispatches: policy.maxConcurrentDispatches,
        maxActiveAssignmentsPerWorker: policy.maxActiveAssignmentsPerWorker,
        maxDispatchesPerObjective: policy.maxDispatchesPerObjective
      })
    )
  }

  const submitLimits = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const updates: BarkosControlPolicyUpdates = {
      executionState: policy.executionState,
      maxConcurrentDispatches: numericFormValue(form, 'maxConcurrentDispatches'),
      maxActiveAssignmentsPerWorker: numericFormValue(form, 'maxActiveAssignmentsPerWorker'),
      maxDispatchesPerObjective: numericFormValue(form, 'maxDispatchesPerObjective')
    }
    if (
      !Number.isInteger(updates.maxConcurrentDispatches) ||
      !Number.isInteger(updates.maxActiveAssignmentsPerWorker) ||
      !Number.isInteger(updates.maxDispatchesPerObjective)
    ) {
      setValidationError(translate('barkos.control.integerError', 'Limits must be whole numbers.'))
      return
    }
    setValidationError(null)
    run(onUpdate(updates))
  }

  return (
    <section className="space-y-5" aria-labelledby="barkos-control-heading">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2
            id="barkos-control-heading"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <ShieldCheck className="size-4" />
            {translate('barkos.control.title', 'Company controls')}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {translate(
              'barkos.control.description',
              'Bound new BarkOS assignments and Dispatches started from this client without changing BarkOS’s terminal engine.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={paused ? 'secondary' : 'default'}>
            {paused
              ? translate('barkos.control.paused', 'Paused')
              : translate('barkos.control.running', 'Running')}
          </Badge>
          <Button
            type="button"
            variant={paused ? 'default' : 'outline'}
            size="sm"
            disabled={busy}
            onClick={updateExecutionState}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : paused ? (
              <Play className="size-3.5" />
            ) : (
              <Pause className="size-3.5" />
            )}
            {paused
              ? translate('barkos.control.resume', 'Resume new work')
              : translate('barkos.control.pause', 'Pause new work')}
          </Button>
        </div>
      </header>

      <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        {translate(
          'barkos.control.pauseScope',
          'Pause blocks new task assignments, Dispatches, and Codex recovery started from this client. It does not terminate agents or terminals that are already running.'
        )}
      </p>

      {error || validationError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {validationError ?? error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>{translate('barkos.control.limits', 'Execution limits')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form key={policy.revision} className="space-y-4" onSubmit={submitLimits}>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="barkos-max-concurrent-dispatches">
                    {translate('barkos.control.concurrent', 'Active Dispatches')}
                  </Label>
                  <Input
                    id="barkos-max-concurrent-dispatches"
                    name="maxConcurrentDispatches"
                    type="number"
                    min={1}
                    max={100}
                    required
                    defaultValue={policy.maxConcurrentDispatches}
                    disabled={busy}
                  />
                  <p className="text-xs text-muted-foreground">
                    {translate('barkos.control.concurrentHelp', 'Company-wide maximum: 1–100.')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barkos-max-worker-assignments">
                    {translate('barkos.control.workerAssignments', 'Assignments per worker')}
                  </Label>
                  <Input
                    id="barkos-max-worker-assignments"
                    name="maxActiveAssignmentsPerWorker"
                    type="number"
                    min={1}
                    max={100}
                    required
                    defaultValue={policy.maxActiveAssignmentsPerWorker}
                    disabled={busy}
                  />
                  <p className="text-xs text-muted-foreground">
                    {translate(
                      'barkos.control.workerAssignmentsHelp',
                      'Per-worker maximum: 1–100.'
                    )}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barkos-max-objective-dispatches">
                    {translate('barkos.control.objectiveBudget', 'Dispatch budget')}
                  </Label>
                  <Input
                    id="barkos-max-objective-dispatches"
                    name="maxDispatchesPerObjective"
                    type="number"
                    min={1}
                    max={10_000}
                    required
                    defaultValue={policy.maxDispatchesPerObjective}
                    disabled={busy}
                  />
                  <p className="text-xs text-muted-foreground">
                    {translate(
                      'barkos.control.objectiveBudgetHelp',
                      'Total attempts per objective: 1–10,000.'
                    )}
                  </p>
                </div>
              </div>
              <Button type="submit" variant={paused ? 'outline' : 'default'} disabled={busy}>
                {translate('barkos.control.save', 'Save limits')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>{translate('barkos.control.currentLoad', 'Current load')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">
                {translate('barkos.control.activeDispatches', 'Active Dispatches')}
              </dt>
              <dd className="text-right font-medium">
                {activeDispatches} / {policy.maxConcurrentDispatches}
              </dd>
              <dt className="text-muted-foreground">
                {translate('barkos.control.revision', 'Policy revision')}
              </dt>
              <dd className="text-right font-mono text-xs">{policy.revision}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
