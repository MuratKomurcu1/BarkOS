import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { translate } from '@/i18n/i18n'
import type { BarkosLiveOfficeWorker } from '@/lib/barkos-live-office'
import { BARKOS_LIVE_OFFICE_ATTENTION_STATUSES } from './barkos-live-office-presentation'
import { BarkosLiveOfficeViewOptions } from './BarkosLiveOfficeViewOptions'
import { BarkosLiveOfficeWorkerRow } from './BarkosLiveOfficeWorkerRow'
import { BarkosPixelOfficeCanvas } from './BarkosPixelOfficeCanvas'
import { useBarkosLiveOfficeViewPreferences } from './use-barkos-live-office-view-preferences'

type Props = {
  company: BarkosCompany
  entries: readonly BarkosLiveOfficeWorker[]
}

export function BarkosLiveOffice({ company, entries: workers }: Props): React.JSX.Element {
  const preferences = useBarkosLiveOfficeViewPreferences()
  const prefersReducedMotion = usePrefersReducedMotion()
  const workersById = useMemo(
    () => new Map(company.workers.map((worker) => [worker.id, worker])),
    [company.workers]
  )
  const rolesById = useMemo(
    () => new Map(company.roles.map((role) => [role.id, role.name])),
    [company.roles]
  )
  const activeCount = workers.filter((worker) => worker.work.length > 0).length
  const attentionCount = workers.filter((worker) =>
    BARKOS_LIVE_OFFICE_ATTENTION_STATUSES.has(worker.status)
  ).length
  const motionOff = preferences.motion === 'off' || prefersReducedMotion
  const compact = preferences.density === 'compact'

  return (
    <Card
      className="barkos-live-office mx-auto w-full max-w-6xl"
      role="region"
      aria-labelledby="barkos-live-office-title"
      aria-describedby="barkos-live-office-description"
      data-barkos-live-office="true"
      data-density={preferences.density}
      data-motion={motionOff ? 'off' : 'system'}
    >
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              <CardTitle
                id="barkos-live-office-title"
                role="heading"
                aria-level={2}
                className="text-base"
              >
                {translate('barkos.office.title', 'Canlı ofis')}
              </CardTitle>
            </div>
            <CardDescription id="barkos-live-office-description" className="mt-1">
              {translate(
                'barkos.office.description',
                'Her piksel karakter, gerçek ajan oturumu ve görev durumuyla eş zamanlı hareket eder.'
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex flex-wrap gap-2"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="sr-only">{translate('barkos.office.summary', 'Ofis özeti:')} </span>
              <Badge variant="secondary">
                {translate('barkos.office.activeCount', '{{value0}} aktif çalışan', {
                  value0: activeCount
                })}
              </Badge>
              <Badge variant={attentionCount > 0 ? 'destructive' : 'outline'}>
                {translate('barkos.office.attentionCount', '{{value0}} çalışan ilgi bekliyor', {
                  value0: attentionCount
                })}
              </Badge>
            </div>
            <BarkosLiveOfficeViewOptions preferences={preferences} motionOff={motionOff} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <BarkosPixelOfficeCanvas company={company} entries={workers} />
        </div>
        <ul
          className={compact ? 'space-y-1.5' : 'space-y-2'}
          aria-label={translate('barkos.office.workers', 'Çalışanlar')}
        >
          {workers.map((entry) => {
            const worker = workersById.get(entry.workerId)
            if (!worker) {
              return null
            }
            return (
              <BarkosLiveOfficeWorkerRow
                key={worker.id}
                entry={entry}
                worker={worker}
                roleName={rolesById.get(worker.roleId) ?? worker.roleId}
                compact={compact}
              />
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
