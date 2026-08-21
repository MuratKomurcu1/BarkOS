import { AlertTriangle, BriefcaseBusiness } from 'lucide-react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'
import type { BarkosLiveOfficeWorker } from '@/lib/barkos-live-office'
import { cn } from '@/lib/utils'
import {
  BARKOS_LIVE_OFFICE_ATTENTION_STATUSES,
  barkosLiveOfficeStatusLabel,
  barkosLiveOfficeStatusVariant
} from './barkos-live-office-presentation'

type Worker = BarkosCompany['workers'][number]

export function BarkosLiveOfficeWorkerRow(props: {
  entry: BarkosLiveOfficeWorker
  worker: Worker
  roleName: string
  compact: boolean
}): React.JSX.Element {
  const { compact, entry, roleName, worker } = props
  const headingId = `barkos-office-${worker.id}`
  const statusLabel = barkosLiveOfficeStatusLabel(entry.status)
  const workLabel = translate(
    'barkos.office.workerActiveWork',
    '{{value0}} adlı çalışanın etkin işleri',
    {
      value0: worker.name
    }
  )
  return (
    <li>
      <article
        className={cn('rounded-lg border border-border/60 bg-muted/10', compact ? 'p-2.5' : 'p-4')}
        aria-labelledby={headingId}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={headingId} className="text-sm font-medium">
                {worker.name}
              </h3>
              <Badge
                variant={barkosLiveOfficeStatusVariant(entry.status)}
                aria-label={translate('barkos.office.workerStatus', 'Durum: {{value0}}', {
                  value0: statusLabel
                })}
              >
                {statusLabel}
              </Badge>
            </div>
            <p className={cn('text-xs text-muted-foreground', compact ? 'mt-0.5' : 'mt-1')}>
              {roleName} · {worker.agentId}
            </p>
          </div>
          {entry.workspaceId ? (
            <p className="max-w-full truncate font-mono text-[11px] text-muted-foreground">
              {entry.executionHostId} · {entry.workspaceId}
            </p>
          ) : null}
        </div>

        {entry.work.length > 0 ? (
          <ul className={cn(compact ? 'mt-2 space-y-1' : 'mt-3 space-y-2')} aria-label={workLabel}>
            {entry.work.slice(0, 3).map((work) => (
              <li key={work.assignmentId} className="flex items-start gap-2 text-xs">
                <BriefcaseBusiness className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">{work.taskTitle}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {work.dispatchId ?? work.assignmentId} · {work.taskStatus}
                  </p>
                </div>
              </li>
            ))}
            {entry.work.length > 3 ? (
              <li className="text-xs text-muted-foreground">
                {translate('barkos.office.moreWork', '{{value0}} etkin görev daha', {
                  value0: entry.work.length - 3
                })}
              </li>
            ) : null}
          </ul>
        ) : (
          <p className={cn('text-xs text-muted-foreground', compact ? 'mt-2' : 'mt-3')}>
            {translate('barkos.office.noActiveWork', 'İş defterinde etkin görev yok.')}
          </p>
        )}

        {entry.toolName ? (
          <p
            className={cn(
              'rounded-md border border-border/60 bg-background font-mono text-[11px] text-muted-foreground',
              compact ? 'mt-2 p-1.5' : 'mt-3 p-2'
            )}
          >
            <span className="sr-only">
              {translate('barkos.office.currentTool', 'Kullanılan araç:')}{' '}
            </span>
            <span className="text-foreground">{entry.toolName}</span>
            {entry.toolInput ? ` · ${entry.toolInput}` : ''}
          </p>
        ) : null}
        {BARKOS_LIVE_OFFICE_ATTENTION_STATUSES.has(entry.status) ? (
          <p
            className={cn(
              'flex items-start gap-2 text-xs text-muted-foreground',
              compact ? 'mt-2' : 'mt-3'
            )}
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {translate(
              'barkos.office.attentionHelp',
              'Yeni bir işlem yapmadan önce hedef panosunu veya çalışan oturumunu inceleyin.'
            )}
          </p>
        ) : null}
      </article>
    </li>
  )
}
