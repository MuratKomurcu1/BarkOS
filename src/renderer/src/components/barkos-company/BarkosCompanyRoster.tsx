import { CheckCircle2, Pencil, Play, Plus, UserRound, UsersRound } from 'lucide-react'
import type { BarkosCompany, BarkosRole, BarkosWorker } from '../../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import { translate } from '@/i18n/i18n'
import type { BarkosWorkerSessionState } from '@/lib/barkos-worker-session-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  barkosCapabilityLabel,
  barkosDefinitionOfDoneLabel,
  barkosRoleMission,
  barkosRoleName
} from './barkos-role-presentation'

function workerStatusLabel(status: BarkosWorker['status']): string {
  switch (status) {
    case 'available':
      return translate('barkos.company.worker.available', 'Available')
    case 'busy':
      return translate('barkos.company.worker.busy', 'Busy')
    case 'paused':
      return translate('barkos.company.worker.paused', 'Paused')
    case 'offline':
      return translate('barkos.company.worker.offline', 'Offline')
  }
}

function workerSessionStateLabel(state: BarkosWorkerSessionState): string {
  switch (state) {
    case 'ready':
      return translate('barkos.company.worker.sessionReady', 'Agent terminal ready')
    case 'starting':
      return translate('barkos.company.worker.sessionStarting', 'Waiting for agent terminal…')
    case 'relaunch-required':
      return translate(
        'barkos.company.worker.sessionRelaunchRequired',
        'Saved session needs relaunch'
      )
    case 'requested':
      return translate(
        'barkos.company.worker.launchUnconfirmed',
        'Remote launch identity unconfirmed'
      )
    case 'unbound':
      return translate('barkos.company.worker.sessionUnbound', 'No saved session target')
  }
}

type Props = {
  company: BarkosCompany
  workerSessions: Record<string, BarkosWorkerSessionBinding>
  workerSessionStates: Readonly<Record<string, BarkosWorkerSessionState>>
  onAddWorker: () => void
  onEditWorker: (worker: BarkosWorker) => void
  onLaunchWorker: (worker: BarkosWorker) => void
  onAddRole: () => void
  onEditRole: (role: BarkosRole) => void
}

export function BarkosCompanyRoster({
  company,
  workerSessions,
  workerSessionStates,
  onAddWorker,
  onEditWorker,
  onLaunchWorker,
  onAddRole,
  onEditRole
}: Props): React.JSX.Element {
  const rolesById = new Map(company.roles.map((role) => [role.id, role]))

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UsersRound className="size-4 text-muted-foreground" />
              <CardTitle role="heading" aria-level={2} className="text-base">
                {translate('barkos.company.roster.workers', 'Workers')}
              </CardTitle>
              <Badge variant="secondary">{company.workers.length}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={onAddWorker}>
              <Plus className="size-3.5" />
              {translate('barkos.company.worker.add', 'Add worker')}
            </Button>
          </div>
          <CardDescription>
            {translate(
              'barkos.company.roster.workersDescription',
              'The operating roster and each worker’s execution assignment.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {company.workers.map((worker) => {
            const role = rolesById.get(worker.roleId)
            const isLead = worker.id === company.leadWorkerId
            const session = workerSessions[worker.id]
            const sessionState = workerSessionStates[worker.id] ?? 'unbound'
            return (
              <div
                key={worker.id}
                className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/15 p-4 sm:flex-row sm:items-center"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                  <UserRound className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{worker.name}</p>
                    {isLead ? (
                      <Badge variant="outline">
                        {translate('barkos.company.roster.lead', 'Lead')}
                      </Badge>
                    ) : null}
                    <Badge variant="dot">{workerStatusLabel(worker.status)}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {role ? barkosRoleName(role) : worker.roleId} · {worker.agentId} ·{' '}
                    {worker.model ??
                      translate('barkos.company.roster.defaultModel', 'Default model')}
                  </p>
                  {session ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {workerSessionStateLabel(sessionState)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    aria-label={translate('barkos.company.worker.launch', 'Launch {{value0}}', {
                      value0: worker.name
                    })}
                    onClick={() => onLaunchWorker(worker)}
                  >
                    <Play className="size-3.5" />
                    {translate('barkos.company.worker.launchLabel', 'Launch')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={translate('barkos.company.worker.edit', 'Edit {{value0}}', {
                      value0: worker.name
                    })}
                    onClick={() => onEditWorker(worker)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle role="heading" aria-level={2} className="text-base">
              {translate('barkos.company.roster.roles', 'Roles')}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={onAddRole}>
              <Plus className="size-3.5" />
              {translate('barkos.company.role.add', 'Add role')}
            </Button>
          </div>
          <CardDescription>
            {translate(
              'barkos.company.roster.rolesDescription',
              'Reusable responsibility contracts for the company.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {company.roles.map((role) => (
            <section
              key={role.id}
              className="space-y-3 border-b border-border/60 pb-4 last:border-0 last:pb-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-foreground">{barkosRoleName(role)}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {barkosRoleMission(role)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate('barkos.company.role.edit', 'Edit {{value0}}', {
                    value0: role.name
                  })}
                  onClick={() => onEditRole(role)}
                >
                  <Pencil className="size-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {role.capabilities.map((capability) => (
                  <Badge key={capability} variant="outline">
                    {barkosCapabilityLabel(capability)}
                  </Badge>
                ))}
              </div>
              <ul className="space-y-1.5">
                {role.definitionOfDone.map((item) => (
                  <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                    <span>{barkosDefinitionOfDoneLabel(role, item)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
