import { BriefcaseBusiness, Crown, Plus, Radio, UserPlus } from 'lucide-react'
import type { BarkosCompany, BarkosWorker } from '../../../../shared/barkos/company'
import type { BarkosLiveOfficeWorker } from '@/lib/barkos-live-office'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { barkosLiveOfficeStatusLabel } from './barkos-live-office-presentation'
import { barkosRoleName } from './barkos-role-presentation'
import { BarkosProjectCommandBar } from './BarkosProjectCommandBar'
import { BarkosPixelOfficeCanvas } from './BarkosPixelOfficeCanvas'

type Props = {
  company: BarkosCompany
  entries: readonly BarkosLiveOfficeWorker[]
  onAddWorker: () => void
  onLaunchWorker: (worker: BarkosWorker) => void
  onOpenOffice: () => void
  projectIntakeBusy: boolean
  onStartProject: (request: string) => Promise<boolean>
}

export function BarkosOfficeBanner({
  company,
  entries,
  onAddWorker,
  onLaunchWorker,
  onOpenOffice,
  projectIntakeBusy,
  onStartProject
}: Props): React.JSX.Element {
  const workersById = new Map(company.workers.map((worker) => [worker.id, worker]))
  const activeCount = entries.filter((entry) => entry.status === 'working').length
  return (
    <section
      className="barkos-office-banner"
      aria-labelledby="barkos-office-banner-title"
      data-barkos-office-banner="true"
    >
      <div className="barkos-office-banner-main">
        <header className="barkos-office-banner-heading">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="size-3.5 text-primary" />
              <h2 id="barkos-office-banner-title" className="text-sm font-semibold">
                {translate('barkos.office.banner.title', 'BarkOS canlı ofis')}
              </h2>
              <Badge variant="secondary">
                {translate('barkos.office.banner.active', '{{value0}} aktif', {
                  value0: activeCount
                })}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {translate(
                'barkos.office.banner.description',
                'Her karakter gerçek ajan oturumu, görevi ve araç durumuyla hareket eder.'
              )}
            </p>
          </div>
          <Button type="button" variant="outline" size="xs" onClick={onOpenOffice}>
            <BriefcaseBusiness className="size-3.5" />
            {translate('barkos.office.banner.open', 'Ofisi aç')}
          </Button>
        </header>
        <BarkosProjectCommandBar busy={projectIntakeBusy} onStart={onStartProject} />
        <div className="barkos-office-window">
          <div className="barkos-office-window-toolbar" aria-hidden="true">
            <span className="barkos-office-traffic-lights">
              <i />
              <i />
              <i />
            </span>
            <span className="barkos-office-window-title">
              {translate('barkos.office.window.title', '{{value0}} · Canlı ofis', {
                value0: company.name
              })}
            </span>
            <span className="barkos-office-window-live">
              {translate('barkos.office.window.live', 'CANLI')}
            </span>
          </div>
          <BarkosPixelOfficeCanvas company={company} entries={entries} />
        </div>
      </div>

      <aside
        className="barkos-office-worker-rail"
        aria-label={translate('barkos.office.banner.rail', 'Aktif çalışanlar')}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {translate('barkos.office.banner.workers', 'Çalışanlar')}
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{company.workers.length}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onAddWorker}
            aria-label={translate('barkos.company.worker.add', 'Çalışan ekle')}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        <ul className="scrollbar-sleek mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {entries.map((entry) => {
            const worker = workersById.get(entry.workerId)
            if (!worker) {
              return null
            }
            const role = company.roles.find((candidate) => candidate.id === worker.roleId)
            return (
              <li
                key={worker.id}
                className="barkos-office-worker-rail-row"
                data-status={entry.status}
              >
                <span className="barkos-office-worker-rail-dot" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-xs font-medium">
                    {worker.id === company.leadWorkerId ? <Crown className="size-3" /> : null}
                    {worker.name}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {role ? barkosRoleName(role) : worker.roleId}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {barkosLiveOfficeStatusLabel(entry.status)}
                  </p>
                </div>
                {entry.status === 'unbound' || entry.status === 'relaunch-required' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onLaunchWorker(worker)}
                    aria-label={translate(
                      'barkos.company.worker.launch',
                      '{{value0}} adlı çalışanı başlat',
                      { value0: worker.name }
                    )}
                  >
                    <UserPlus className="size-3" />
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="mt-3 w-full"
          onClick={onAddWorker}
        >
          <Plus className="size-3.5" />
          {translate('barkos.company.worker.add', 'Çalışan ekle')}
        </Button>
      </aside>
    </section>
  )
}
