import { useState, type FormEvent } from 'react'
import { Loader2, Play } from 'lucide-react'
import type { BarkosRole, BarkosWorker } from '../../../../shared/barkos/company'
import { TUI_AGENT_DISPLAY_NAMES } from '../../../../shared/tui-agent-display-names'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../../shared/tui-agent-launch-defaults'
import { resolveTuiAgentPermissionMode } from '../../../../shared/tui-agent-permissions'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { BarkosWorkerLaunchTarget } from '@/lib/barkos-worker-launch-targets'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { BarkosWorkerAuthorityReview } from './BarkosWorkerAuthorityReview'

type Props = {
  worker: BarkosWorker
  role: BarkosRole | null
  targets: BarkosWorkerLaunchTarget[]
  defaultTargetId: string | null
  error: string | null
  launching: boolean
  onClose: () => void
  onLaunch: (target: BarkosWorkerLaunchTarget) => Promise<void>
}

function targetHostLabel(target: BarkosWorkerLaunchTarget): string {
  if (target.hostLabel) {
    return target.hostLabel
  }
  return target.hostKind === 'local'
    ? translate('barkos.company.launch.localHost', 'Local computer')
    : target.executionHostId
}

function targetLabel(target: BarkosWorkerLaunchTarget): string {
  return `${target.projectName} / ${target.workspaceName} · ${targetHostLabel(target)}`
}

function targetIssueLabel(target: BarkosWorkerLaunchTarget): string | null {
  if (!target.compatible) {
    return translate('barkos.company.launch.incompatible', 'workspace policy incompatible')
  }
  if (!target.agentAvailable) {
    return translate('barkos.company.launch.agentUnavailable', 'agent unavailable')
  }
  return null
}

export function BarkosWorkerLaunchDialog({
  worker,
  role,
  targets,
  defaultTargetId,
  error,
  launching,
  onClose,
  onLaunch
}: Props): React.JSX.Element {
  const agentDefaultArgs = useAppStore((state) => state.settings?.agentDefaultArgs)
  const agentDefaultEnv = useAppStore((state) => state.settings?.agentDefaultEnv)
  const [targetId, setTargetId] = useState(defaultTargetId ?? '')
  const selectedTarget = targets.find((target) => target.id === targetId) ?? null
  const targetEligible = Boolean(
    selectedTarget?.compatible && selectedTarget.agentAvailable && role !== null
  )
  const canLaunch = targetEligible && !launching
  const agentName = isTuiAgent(worker.agentId)
    ? TUI_AGENT_DISPLAY_NAMES[worker.agentId]
    : worker.agentId
  const permissionMode = isTuiAgent(worker.agentId)
    ? resolveTuiAgentPermissionMode({
        agent: worker.agentId,
        agentArgs: resolveTuiAgentLaunchArgs(worker.agentId, agentDefaultArgs),
        agentEnv: resolveTuiAgentLaunchEnv(worker.agentId, agentDefaultEnv)
      })
    : 'manual'

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (canLaunch && selectedTarget) {
      void onLaunch(selectedTarget)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !launching && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {translate('barkos.company.launch.title', 'Launch {{value0}}', {
                value0: worker.name
              })}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'barkos.company.launch.description',
                'Starts {{value0}} in the selected workspace and automatically sends the BarkOS identity and role briefing.',
                { value0: agentName }
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">{role?.name ?? worker.roleId}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {translate('barkos.company.launch.agent', 'Agent: {{value0}}', {
                value0: agentName
              })}
            </p>
          </div>

          {targets.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="barkos-worker-launch-target">
                {translate('barkos.company.launch.target', 'Launch target')}
              </Label>
              <Select value={targetId} onValueChange={setTargetId} disabled={launching}>
                <SelectTrigger id="barkos-worker-launch-target" className="w-full">
                  <SelectValue
                    placeholder={translate(
                      'barkos.company.launch.selectTarget',
                      'Select an eligible workspace'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((target) => {
                    const issue = targetIssueLabel(target)
                    return (
                      <SelectItem key={target.id} value={target.id} disabled={issue !== null}>
                        {targetLabel(target)}
                        {issue ? ` — ${issue}` : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'barkos.company.launch.targetHelp',
                  'Availability is checked separately for each local, SSH, or runtime host.'
                )}
              </p>
            </div>
          ) : (
            <p
              role="alert"
              className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground"
            >
              {translate(
                'barkos.company.launch.noTargets',
                'No workspace targets are currently available. Add or connect a workspace first.'
              )}
            </p>
          )}

          {selectedTarget ? (
            <BarkosWorkerAuthorityReview
              mode={permissionMode}
              host={targetHostLabel(selectedTarget)}
            />
          ) : null}

          {!targetEligible && targets.length > 0 ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {translate(
                'barkos.company.launch.noEligibleTarget',
                'No eligible target has this agent available and matches the worker workspace policy.'
              )}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={launching} onClick={onClose}>
              {translate('barkos.company.action.cancel', 'Cancel')}
            </Button>
            <Button type="submit" className="w-36" disabled={!canLaunch}>
              {launching ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              {launching
                ? translate('barkos.company.launch.launching', 'Launching worker…')
                : translate('barkos.company.launch.confirm', 'Launch worker')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
