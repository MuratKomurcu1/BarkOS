import { Loader2, Play, Trash2 } from 'lucide-react'
import type { BarkosTestEvidenceDraft } from '../../../../shared/barkos/evidence-capture'
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

export type BarkosTestEvidenceFormDraft = Omit<BarkosTestEvidenceDraft, 'durationMs'> & {
  id: string
  durationMs: string
}

type Props = {
  test: BarkosTestEvidenceFormDraft
  number: number
  disabled: boolean
  running: boolean
  onChange: (id: string, updates: Partial<BarkosTestEvidenceFormDraft>) => void
  onRemove: (id: string) => void
  onRun: (id: string) => void
}

export function BarkosTestEvidenceEditor({
  test,
  number,
  disabled,
  running,
  onChange,
  onRemove,
  onRun
}: Props): React.JSX.Element {
  const fieldId = (name: string): string => `barkos-evidence-test-${test.id}-${name}`
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-foreground">
          {translate('barkos.evidence.test.title', 'Test {{value0}}', { value0: number })}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={translate('barkos.evidence.test.remove', 'Remove test {{value0}}', {
            value0: number
          })}
          disabled={disabled}
          onClick={() => onRemove(test.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor={fieldId('command')}>
          {translate('barkos.evidence.test.command', 'Command')}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={fieldId('command')}
            value={test.command}
            onChange={(event) => onChange(test.id, { command: event.target.value })}
            maxLength={2_000}
            placeholder={translate('barkos.evidence.test.commandPlaceholder', 'pnpm test')}
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-28"
            disabled={disabled || test.command.trim() === ''}
            onClick={() => onRun(test.id)}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {running
              ? translate('barkos.evidence.test.running', 'Running…')
              : translate('barkos.evidence.test.run', 'Run test')}
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label htmlFor={fieldId('status')}>
            {translate('barkos.evidence.test.status', 'Result')}
          </Label>
          <Select
            value={test.status}
            onValueChange={(value) =>
              onChange(test.id, { status: value as BarkosTestEvidenceDraft['status'] })
            }
            disabled={disabled}
          >
            <SelectTrigger id={fieldId('status')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="passed">
                {translate('barkos.evidence.test.passed', 'Passed')}
              </SelectItem>
              <SelectItem value="failed">
                {translate('barkos.evidence.test.failed', 'Failed')}
              </SelectItem>
              <SelectItem value="skipped">
                {translate('barkos.evidence.test.skipped', 'Skipped')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId('duration')}>
            {translate('barkos.evidence.test.duration', 'Duration (ms, optional)')}
          </Label>
          <Input
            id={fieldId('duration')}
            type="number"
            min={0}
            max={86_400_000}
            step={1}
            value={test.durationMs}
            onChange={(event) => onChange(test.id, { durationMs: event.target.value })}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={fieldId('summary')}>
          {translate('barkos.evidence.test.summary', 'Result summary')}
        </Label>
        <Input
          id={fieldId('summary')}
          value={test.summary}
          onChange={(event) => onChange(test.id, { summary: event.target.value })}
          maxLength={1_000}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
