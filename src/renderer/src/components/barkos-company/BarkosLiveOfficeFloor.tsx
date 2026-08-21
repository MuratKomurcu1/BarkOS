import { CircleAlert, Coffee, MonitorCog, Radio, UserRound } from 'lucide-react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import { translate } from '@/i18n/i18n'
import type { BarkosLiveOfficeStatus, BarkosLiveOfficeWorker } from '@/lib/barkos-live-office'
import { cn } from '@/lib/utils'
import {
  BARKOS_LIVE_OFFICE_ATTENTION_STATUSES,
  barkosLiveOfficeStatusLabel
} from './barkos-live-office-presentation'

type Worker = BarkosCompany['workers'][number]

const ACTIVE_STATUSES = new Set<BarkosLiveOfficeStatus>([
  'working',
  'waiting',
  'starting',
  'runtime-unconfirmed'
])

function activityLabel(status: BarkosLiveOfficeStatus): string {
  if (BARKOS_LIVE_OFFICE_ATTENTION_STATUSES.has(status)) {
    return translate('barkos.office.activityAttention', 'İlginizi bekliyor')
  }
  if (ACTIVE_STATUSES.has(status)) {
    return translate('barkos.office.activityWorking', 'Şimdi çalışıyor')
  }
  return translate('barkos.office.activityIdle', 'Masasında bekliyor')
}

function WorkerDesk(props: {
  entry: BarkosLiveOfficeWorker
  worker: Worker
  roleName: string
}): React.JSX.Element {
  const { entry, roleName, worker } = props
  const statusLabel = barkosLiveOfficeStatusLabel(entry.status)
  const taskTitle = entry.work[0]?.taskTitle ?? activityLabel(entry.status)
  const needsAttention = BARKOS_LIVE_OFFICE_ATTENTION_STATUSES.has(entry.status)
  const headingId = `barkos-office-desk-${worker.id}`

  return (
    <li className="min-w-0">
      <article
        className="barkos-office-desk group"
        data-status={entry.status}
        aria-labelledby={headingId}
        aria-label={translate('barkos.office.desk', '{{value0}} çalışma masası', {
          value0: worker.name
        })}
      >
        <div className="barkos-office-desk-scene" aria-hidden="true">
          <div className="barkos-office-monitor">
            <MonitorCog className="size-4" />
            <span className="barkos-office-monitor-scan" />
          </div>
          <div className="barkos-office-chair" />
          <div className="barkos-office-agent">
            <UserRound className="size-4" />
          </div>
          {needsAttention ? (
            <CircleAlert className="barkos-office-attention size-4" />
          ) : entry.status === 'idle' ? (
            <Coffee className="barkos-office-coffee size-4" />
          ) : (
            <Radio className="barkos-office-radio size-3.5" />
          )}
        </div>

        <div className="min-w-0 border-t border-border/60 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="barkos-office-status-dot" aria-hidden="true" />
            <h3 id={headingId} className="min-w-0 flex-1 truncate text-sm font-medium">
              {worker.name}
            </h3>
            <span className="shrink-0 text-[11px] text-muted-foreground">{statusLabel}</span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{roleName}</p>
          <p
            className={cn(
              'mt-1.5 truncate text-xs',
              entry.work.length > 0 ? 'text-foreground' : 'text-muted-foreground'
            )}
            title={taskTitle}
          >
            {taskTitle}
          </p>
          {entry.toolName ? (
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {entry.toolName}
            </p>
          ) : null}
        </div>
      </article>
    </li>
  )
}

export function BarkosLiveOfficeFloor(props: {
  entries: readonly BarkosLiveOfficeWorker[]
  workersById: ReadonlyMap<string, Worker>
  rolesById: ReadonlyMap<string, string>
}): React.JSX.Element {
  return (
    <section
      className="barkos-office-floor"
      aria-label={translate('barkos.office.floorLabel', 'Canlı ofis katı')}
    >
      <div className="barkos-office-floor-header" aria-hidden="true">
        <span className="h-px flex-1 bg-border/70" />
        <span className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          {translate('barkos.office.floorName', 'Operasyon katı')}
        </span>
        <span className="h-px flex-1 bg-border/70" />
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {props.entries.map((entry) => {
          const worker = props.workersById.get(entry.workerId)
          if (!worker) {
            return null
          }
          return (
            <WorkerDesk
              key={worker.id}
              entry={entry}
              worker={worker}
              roleName={props.rolesById.get(worker.roleId) ?? worker.roleId}
            />
          )
        })}
      </ol>
    </section>
  )
}
