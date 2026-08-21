import { useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
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
  previousWorkerName: string
  busy: boolean
  reassigning: boolean
  onReassign: (dispatchId: string) => Promise<void>
}

export function BarkosTaskReassignmentControl({
  dispatch,
  previousWorkerName,
  busy,
  reassigning,
  onReassign
}: Props): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (dispatch.state !== 'cancelled' || dispatch.stop?.state !== 'completed') {
    return null
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={busy}>
            {reassigning ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {translate('barkos.board.task.reassign', 'Reassign and start')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {translate('barkos.board.task.reassignTitle', 'Reassign this stopped task?')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'barkos.board.task.reassignDescription',
                'BarkOS will preserve {{value0}}’s confirmed stop as audit history, select a different eligible worker under the current limits, and persist the new Assignment before starting it.',
                { value0: previousWorkerName }
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
            {translate(
              'barkos.board.task.reassignAuthority',
              'Protected work receives a fresh approval gate. Paused execution, missing capacity, or no different eligible worker blocks reassignment before launch.'
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {translate('barkos.board.task.reassignCancel', 'Keep cancelled')}
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                setOpen(false)
                void onReassign(dispatch.id)
              }}
            >
              <RefreshCw className="size-3.5" />
              {translate('barkos.board.task.reassignConfirm', 'Reassign and start')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <span className="text-xs text-muted-foreground">
        {translate(
          'barkos.board.task.reassignHelp',
          'The stopped worker is excluded from replacement selection.'
        )}
      </span>
    </div>
  )
}
