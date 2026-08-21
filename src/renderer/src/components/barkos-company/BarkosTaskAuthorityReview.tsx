import { ShieldCheck } from 'lucide-react'
import { reviewBarkosTaskAuthority } from '../../../../shared/barkos/task-authority'
import type { BarkosTask } from '../../../../shared/barkos/work-ledger'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'

function workspacePolicyLabel(policy: BarkosTask['workspacePolicy']): string {
  switch (policy) {
    case 'inherit':
      return translate('barkos.authority.workspace.inherit', 'Worker workspace')
    case 'folder':
      return translate('barkos.authority.workspace.folder', 'Existing folder')
    case 'worktree':
      return translate('barkos.authority.workspace.worktree', 'Existing worktree')
    case 'isolated-worktree':
      return translate('barkos.authority.workspace.isolated', 'Isolated worktree')
  }
}

export function BarkosTaskAuthorityReview({ task }: { task: BarkosTask }): React.JSX.Element {
  const review = reviewBarkosTaskAuthority(task)

  return (
    <details className="mt-3 rounded-md border border-border/60 bg-background/40 p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
        <ShieldCheck className="size-3.5 text-muted-foreground" />
        {translate('barkos.authority.task.title', 'Task and authority review')}
      </summary>
      <div className="mt-3 space-y-3 text-xs">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {translate('barkos.authority.task.risk', 'Risk: {{value0}}', {
              value0: review.risk
            })}
          </Badge>
          <Badge variant="outline">
            {translate('barkos.authority.task.workspace', 'Scope: {{value0}}', {
              value0: workspacePolicyLabel(review.workspacePolicy)
            })}
          </Badge>
          <Badge variant={review.dispatchApprovalRequired ? 'secondary' : 'outline'}>
            {review.dispatchApprovalRequired
              ? translate('barkos.authority.task.protected', 'Approval before start')
              : translate('barkos.authority.task.direct', 'Direct start allowed')}
          </Badge>
        </div>
        <div>
          <p className="font-medium text-foreground">
            {translate('barkos.authority.task.instruction', 'Exact instruction sent to the agent')}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{task.spec}</p>
        </div>
        <p className="text-muted-foreground">
          {translate(
            'barkos.authority.task.boundary',
            'The agent is instructed to request approval before destructive or external actions. Full-access provider mode is not an operating-system sandbox.'
          )}
        </p>
      </div>
    </details>
  )
}
