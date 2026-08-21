import { useRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import type { BarkosObjectivePlanDraft } from '@/store/slices/barkos-work-ledger'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  BARKOS_PLANNER_UI_TASK_LIMIT,
  createBarkosPlannerTaskDraft,
  plannedTaskInput,
  type BarkosPlannerTaskDraft
} from './barkos-objective-planner-form'
import { BarkosPlannerTaskEditor } from './BarkosPlannerTaskEditor'

type Props = {
  leadName: string
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (draft: BarkosObjectivePlanDraft) => Promise<void>
}

export function BarkosObjectivePlannerDialog({
  leadName,
  saving,
  error,
  onClose,
  onSave
}: Props): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [tasks, setTasks] = useState<BarkosPlannerTaskDraft[]>(() => [
    createBarkosPlannerTaskDraft(1)
  ])
  const nextTaskSequence = useRef(2)
  const canSubmit =
    title.trim() !== '' &&
    brief.trim() !== '' &&
    tasks.length > 0 &&
    tasks.every((task) => task.title.trim() !== '' && task.spec.trim() !== '')

  const handleTaskChange = (draftId: string, updates: Partial<BarkosPlannerTaskDraft>): void => {
    setTasks((current) =>
      current.map((task) => (task.draftId === draftId ? { ...task, ...updates } : task))
    )
  }

  const handleAddTask = (): void => {
    if (tasks.length >= BARKOS_PLANNER_UI_TASK_LIMIT) {
      return
    }
    const sequence = nextTaskSequence.current
    nextTaskSequence.current += 1
    setTasks((current) => [...current, createBarkosPlannerTaskDraft(sequence)])
  }

  const handleRemoveTask = (draftId: string): void => {
    setTasks((current) =>
      current
        .filter((task) => task.draftId !== draftId)
        .map((task) => ({
          ...task,
          dependencyDraftIds: task.dependencyDraftIds.filter((id) => id !== draftId)
        }))
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canSubmit || saving) {
      return
    }
    await onSave({
      title: title.trim(),
      brief: brief.trim(),
      tasks: tasks.map(plannedTaskInput)
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto scrollbar-sleek sm:max-w-3xl">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{translate('barkos.planner.title', 'Hedef planı oluştur')}</DialogTitle>
            <DialogDescription>
              {translate(
                'barkos.planner.description',
                'Bu onaylı planın sorumlusu {{value0}} olacak. Kaydetmek çalışanları başlatmaz veya sağlayıcı kotasını tüketmez.',
                { value0: leadName }
              )}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="barkos-planner-title">
              {translate('barkos.planner.objectiveTitle', 'Hedef başlığı')}
            </Label>
            <Input
              id="barkos-planner-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="barkos-planner-brief">
              {translate('barkos.planner.brief', 'Hedef açıklaması')}
            </Label>
            <Textarea
              id="barkos-planner-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              maxLength={8_000}
              rows={4}
              required
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {translate('barkos.planner.tasks', 'Plan görevleri')}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {translate(
                  'barkos.planner.tasksHelp',
                  'Sonraki görevler önceki görevlere bağlanabilir; plan döngüsüz kalır.'
                )}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={tasks.length >= BARKOS_PLANNER_UI_TASK_LIMIT}
              onClick={handleAddTask}
            >
              <Plus className="size-3.5" />
              {translate('barkos.planner.addTask', 'Görev ekle')}
            </Button>
          </div>

          <div className="space-y-4">
            {tasks.map((task, index) => (
              <BarkosPlannerTaskEditor
                key={task.draftId}
                task={task}
                taskNumber={index + 1}
                previousTasks={tasks.slice(0, index)}
                removable={tasks.length > 1}
                onChange={handleTaskChange}
                onRemove={handleRemoveTask}
              />
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {translate('barkos.company.action.cancel', 'İptal')}
            </Button>
            <Button type="submit" disabled={!canSubmit || saving}>
              {saving
                ? translate('barkos.company.action.saving', 'Kaydediliyor…')
                : translate('barkos.planner.save', 'Onaylı planı oluştur')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
