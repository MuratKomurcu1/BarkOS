import { Trash2 } from 'lucide-react'
import type { BarkosTask } from '../../../../shared/barkos/work-ledger'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { BarkosPlannerTaskDraft } from './barkos-objective-planner-form'

type Props = {
  task: BarkosPlannerTaskDraft
  taskNumber: number
  previousTasks: readonly BarkosPlannerTaskDraft[]
  removable: boolean
  onChange: (draftId: string, updates: Partial<BarkosPlannerTaskDraft>) => void
  onRemove: (draftId: string) => void
}

function workspacePolicyLabel(policy: BarkosTask['workspacePolicy']): string {
  switch (policy) {
    case 'inherit':
      return translate('barkos.planner.workspace.inherit', 'Çalışandan devral')
    case 'folder':
      return translate('barkos.planner.workspace.folder', 'Klasör')
    case 'worktree':
      return translate('barkos.planner.workspace.worktree', 'İş ağacı')
    case 'isolated-worktree':
      return translate('barkos.planner.workspace.isolated', 'Yalıtılmış iş ağacı')
  }
}

function riskLabel(risk: BarkosTask['risk']): string {
  switch (risk) {
    case 'low':
      return translate('barkos.planner.risk.low', 'Düşük')
    case 'medium':
      return translate('barkos.planner.risk.medium', 'Orta')
    case 'high':
      return translate('barkos.planner.risk.high', 'Yüksek')
    case 'critical':
      return translate('barkos.planner.risk.critical', 'Kritik')
  }
}

export function BarkosPlannerTaskEditor({
  task,
  taskNumber,
  previousTasks,
  removable,
  onChange,
  onRemove
}: Props): React.JSX.Element {
  const fieldId = (field: string): string => `barkos-planner-${task.draftId}-${field}`

  return (
    <section className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          {translate('barkos.planner.task.title', 'Görev {{value0}}', { value0: taskNumber })}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!removable}
          aria-label={translate('barkos.planner.task.remove', '{{value0}}. görevi kaldır', {
            value0: taskNumber
          })}
          onClick={() => onRemove(task.draftId)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId('title')}>
          {translate('barkos.planner.task.name', 'Görev adı')}
        </Label>
        <Input
          id={fieldId('title')}
          value={task.title}
          onChange={(event) => onChange(task.draftId, { title: event.target.value })}
          maxLength={80}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId('spec')}>
          {translate('barkos.planner.task.spec', 'Görev talimatı')}
        </Label>
        <Textarea
          id={fieldId('spec')}
          value={task.spec}
          onChange={(event) => onChange(task.draftId, { spec: event.target.value })}
          maxLength={12_000}
          rows={3}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={fieldId('capabilities')}>
            {translate('barkos.planner.task.capabilities', 'Gerekli yetenekler')}
          </Label>
          <Textarea
            id={fieldId('capabilities')}
            value={task.capabilitiesText}
            onChange={(event) => onChange(task.draftId, { capabilitiesText: event.target.value })}
            maxLength={1_600}
            rows={2}
            placeholder={translate(
              'barkos.planner.task.capabilitiesHelp',
              'Her satıra bir tane yazın veya virgülle ayırın'
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId('environment')}>
            {translate('barkos.planner.task.environment', 'Tercih edilen ortam (isteğe bağlı)')}
          </Label>
          <Input
            id={fieldId('environment')}
            value={task.preferredEnvironmentId}
            onChange={(event) =>
              onChange(task.draftId, { preferredEnvironmentId: event.target.value })
            }
            maxLength={160}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={fieldId('workspace')}>
            {translate('barkos.planner.task.workspace', 'Çalışma alanı ilkesi')}
          </Label>
          <Select
            value={task.workspacePolicy}
            onValueChange={(value) =>
              onChange(task.draftId, { workspacePolicy: value as BarkosTask['workspacePolicy'] })
            }
          >
            <SelectTrigger id={fieldId('workspace')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['inherit', 'folder', 'worktree', 'isolated-worktree'] as const).map((policy) => (
                <SelectItem key={policy} value={policy}>
                  {workspacePolicyLabel(policy)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId('risk')}>
            {translate('barkos.planner.task.risk', 'Risk düzeyi')}
          </Label>
          <Select
            value={task.risk}
            onValueChange={(value) => onChange(task.draftId, { risk: value as BarkosTask['risk'] })}
          >
            <SelectTrigger id={fieldId('risk')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['low', 'medium', 'high', 'critical'] as const).map((risk) => (
                <SelectItem key={risk} value={risk}>
                  {riskLabel(risk)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {previousTasks.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            {translate('barkos.planner.task.dependencies', 'Bağlı olduğu görevler')}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {previousTasks.map((previous) => {
              const checked = task.dependencyDraftIds.includes(previous.draftId)
              return (
                <label
                  key={previous.draftId}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      onChange(task.draftId, {
                        dependencyDraftIds: event.target.checked
                          ? [...task.dependencyDraftIds, previous.draftId]
                          : task.dependencyDraftIds.filter((id) => id !== previous.draftId)
                      })
                    }
                    className="size-4 accent-primary"
                  />
                  <span className="truncate">
                    {previous.title ||
                      translate('barkos.planner.task.untitled', 'Başlıksız önceki görev')}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={task.approvalPolicy === 'before-dispatch'}
          onChange={(event) =>
            onChange(task.draftId, {
              approvalPolicy: event.target.checked ? 'before-dispatch' : 'none'
            })
          }
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          {translate('barkos.planner.task.approval', 'Bu görev dağıtılmadan önce onayımı iste')}
        </span>
      </label>
      <p className="text-xs text-muted-foreground">
        {translate(
          'barkos.planner.task.riskApproval',
          'Yüksek ve kritik riskli görevler dağıtımdan önce her zaman onayınızı gerektirir.'
        )}
      </p>
    </section>
  )
}
