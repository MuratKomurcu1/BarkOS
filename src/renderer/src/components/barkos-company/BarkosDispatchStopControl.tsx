import { useState } from 'react'
import { AlertTriangle, LoaderCircle, Square } from 'lucide-react'
import type { BarkosDispatch } from '../../../../shared/barkos/work-ledger'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'

type Props = {
  dispatch: BarkosDispatch
  workerName: string
  busy: boolean
  stopping: boolean
  onStop: (dispatchId: string) => Promise<void>
}

function incompleteStopLabel(stop: NonNullable<BarkosDispatch['stop']>): string {
  if (stop.state === 'dispatch-stopped') {
    return translate(
      'barkos.board.task.stopDispatchStopped',
      'Dispatch authority stop was confirmed, but worker terminal termination is unconfirmed.'
    )
  }
  if (stop.state === 'uncertain') {
    return translate(
      'barkos.board.task.stopUncertain',
      'Stop result is uncertain. BarkOS will not retry automatically or claim this work stopped.'
    )
  }
  return translate(
    'barkos.board.task.stopRequested',
    'A durable stop request exists, but its effects are not confirmed.'
  )
}

export function BarkosDispatchStopControl({
  dispatch,
  workerName,
  busy,
  stopping,
  onStop
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const stop = dispatch.stop

  if (stop?.state === 'completed') {
    return (
      <div className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        {translate(
          'barkos.board.task.stopCompleted',
          'Stopped · Dispatch authority and worker terminal termination confirmed.'
        )}
      </div>
    )
  }

  if (stop) {
    return (
      <div
        role="alert"
        className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0 space-y-1">
            <p>{incompleteStopLabel(stop)}</p>
            {stop.error ? <p className="break-words font-mono text-[11px]">{stop.error}</p> : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" size="sm" disabled={busy}>
            {stopping ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Square className="size-3.5" />
            )}
            {translate('barkos.board.task.stop', 'Stop work')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate('barkos.board.task.stopTitle', 'Stop this work?')}</DialogTitle>
            <DialogDescription>
              {translate(
                'barkos.board.task.stopDescription',
                'BarkOS will stop the exact BarkOS Dispatch authority, then close {{value0}}’s live worker terminal. The agent and any shell process in that terminal will end.',
                { value0: workerName }
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {translate(
              'barkos.board.task.stopWarning',
              'This cannot preserve the running terminal session. If either stop proof is ambiguous, BarkOS records the uncertainty and blocks automatic retry.'
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {translate('barkos.board.task.stopCancel', 'Keep running')}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setOpen(false)
                void onStop(dispatch.id)
              }}
            >
              <Square className="size-3.5" />
              {translate('barkos.board.task.stopConfirm', 'Stop and close terminal')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
