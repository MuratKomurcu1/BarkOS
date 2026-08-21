import { Brain, Loader2, RotateCw } from 'lucide-react'
import type { BarkosMemoryVault as BarkosMemoryVaultSnapshot } from '../../../../shared/barkos/memory-vault'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { BarkosMemoryVaultLoadState } from '@/store/slices/barkos-memory-vault'
import { BarkosMemoryCandidateCard } from './BarkosMemoryCandidateCard'
import { BarkosMemoryEntryCard } from './BarkosMemoryEntryCard'
import type { BarkosMemoryVaultController } from './use-barkos-memory-vault'

type Props = {
  vault: BarkosMemoryVaultSnapshot | null
  loadState: BarkosMemoryVaultLoadState
  error: string | null
  controller: BarkosMemoryVaultController
}

export function BarkosMemoryVault({
  vault,
  loadState,
  error,
  controller
}: Props): React.JSX.Element {
  const pending = vault?.candidates.filter((candidate) => candidate.status === 'pending') ?? []
  const active = vault?.entries.filter((memory) => memory.status === 'active') ?? []
  const busy = loadState === 'saving' || controller.operation !== null
  const run = (action: Promise<void>): void => {
    void action.catch(() => {
      // The persistent store exposes the actionable error inline.
    })
  }

  if (loadState === 'idle' || loadState === 'loading') {
    return (
      <div className="flex min-h-48 items-center justify-center" role="status">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">{translate('barkos.memory.loading', 'Loading memory')}</span>
      </div>
    )
  }

  if (loadState === 'error' && !vault) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
        <p role="alert" className="max-w-lg text-sm text-destructive">
          {error}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => run(controller.retry())}>
          <RotateCw className="size-3.5" />
          {translate('barkos.memory.retry', 'Reload memory')}
        </Button>
      </div>
    )
  }

  return (
    <section className="space-y-6" aria-labelledby="barkos-memory-heading">
      <header className="space-y-1">
        <h2 id="barkos-memory-heading" className="flex items-center gap-2 text-base font-semibold">
          <Brain className="size-4" />
          {translate('barkos.memory.title', 'Company memory')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {translate(
            'barkos.memory.description',
            'Accepted evidence becomes a proposal. Credential-like text is omitted, and only memory you promote can enter a worker briefing.'
          )}
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => run(controller.retry())}>
            <RotateCw className="size-3.5" />
            {translate('barkos.memory.retry', 'Reload memory')}
          </Button>
        </div>
      ) : null}

      <section className="space-y-3" aria-labelledby="barkos-memory-proposals-heading">
        <h3 id="barkos-memory-proposals-heading" className="text-sm font-semibold">
          {translate('barkos.memory.proposals', 'Promotion proposals')} ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            {translate(
              'barkos.memory.proposalsEmpty',
              'No memory proposals yet. Accepted evidence will appear here for review.'
            )}
          </p>
        ) : (
          <div className="grid gap-3">
            {pending.map((candidate) => (
              <BarkosMemoryCandidateCard
                key={candidate.id}
                candidate={candidate}
                activeMemories={active}
                busy={busy}
                onPromote={(id, settings) => run(controller.promote(id, settings))}
                onReject={(id) => run(controller.reject(id))}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="barkos-active-memory-heading">
        <h3 id="barkos-active-memory-heading" className="text-sm font-semibold">
          {translate('barkos.memory.active', 'Active memory')} ({active.length})
        </h3>
        {active.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            {translate('barkos.memory.activeEmpty', 'No promoted memory is active.')}
          </p>
        ) : (
          <div className="grid gap-3">
            {active.map((memory) => (
              <BarkosMemoryEntryCard
                key={memory.id}
                memory={memory}
                busy={busy}
                onRevoke={(id) => run(controller.revoke(id))}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
