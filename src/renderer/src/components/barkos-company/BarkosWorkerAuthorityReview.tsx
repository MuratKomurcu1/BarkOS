import { ShieldAlert, ShieldCheck } from 'lucide-react'
import type { AgentPermissionMode } from '../../../../shared/tui-agent-permissions'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'

function permissionLabel(mode: AgentPermissionMode): string {
  switch (mode) {
    case 'yolo':
      return translate('barkos.authority.worker.full', 'Full agent access')
    case 'manual':
      return translate('barkos.authority.worker.manual', 'Provider approval prompts')
    case 'mixed':
      return translate('barkos.authority.worker.custom', 'Custom agent access')
  }
}

function permissionDescription(mode: AgentPermissionMode, host: string): string {
  switch (mode) {
    case 'yolo':
      return translate(
        'barkos.authority.worker.fullDescription',
        'Provider permission prompts are bypassed. This agent may read and write files, run commands, use the network, and start processes with your operating-system account on {{value0}}.',
        { value0: host }
      )
    case 'manual':
      return translate(
        'barkos.authority.worker.manualDescription',
        'The provider keeps its permission prompts enabled and may pause work for approval on {{value0}}.',
        { value0: host }
      )
    case 'mixed':
      return translate(
        'barkos.authority.worker.customDescription',
        'Custom launch arguments or environment settings control this agent’s permissions on {{value0}}.',
        { value0: host }
      )
  }
}

export function BarkosWorkerAuthorityReview({
  mode,
  host
}: {
  mode: AgentPermissionMode
  host: string
}): React.JSX.Element {
  const AuthorityIcon = mode === 'yolo' ? ShieldAlert : ShieldCheck

  return (
    <section className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <AuthorityIcon className="size-4 text-amber-600" />
        <p className="text-sm font-medium text-foreground">
          {translate('barkos.authority.worker.title', 'Authority review')}
        </p>
        <Badge variant={mode === 'yolo' ? 'destructive' : 'secondary'}>
          {permissionLabel(mode)}
        </Badge>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {permissionDescription(mode, host)}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {translate(
          'barkos.authority.worker.containment',
          'BarkOS sends role and task boundaries, but it is not an operating-system sandbox. Choose an isolated workspace or host when stronger containment is required.'
        )}
      </p>
    </section>
  )
}
