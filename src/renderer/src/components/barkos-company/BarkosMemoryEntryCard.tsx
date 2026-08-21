import { Ban } from 'lucide-react'
import type { BarkosMemoryEntry } from '../../../../shared/barkos/memory-vault'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { translate } from '@/i18n/i18n'

export function BarkosMemoryEntryCard(props: {
  memory: BarkosMemoryEntry
  busy: boolean
  onRevoke: (memoryId: string) => void
}): React.JSX.Element {
  const { memory, busy, onRevoke } = props
  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-sm">{memory.title}</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{memory.scope.kind}</Badge>
            <Badge variant="secondary">{memory.confidence}%</Badge>
          </div>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">{memory.scope.targetId}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap text-sm text-foreground">{memory.content}</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {translate('barkos.memory.promotedFrom', 'Promoted from evidence:')}{' '}
            <span className="font-mono">{memory.source.evidenceId}</span>
          </p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => onRevoke(memory.id)}
          >
            <Ban className="size-3.5" />
            {translate('barkos.memory.revoke', 'Revoke memory')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
