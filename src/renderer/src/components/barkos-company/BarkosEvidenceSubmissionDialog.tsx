import { useMemo, useRef, useState, type FormEvent } from 'react'
import { FileDiff, Loader2, Plus, TerminalSquare } from 'lucide-react'
import { hasMaterialBarkosEvidence } from '../../../../shared/barkos/evidence-review'
import {
  buildBarkosEvidenceCapture,
  collectBarkosTerminalEvidence
} from '../../../../shared/barkos/evidence-capture'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import {
  BarkosTestEvidenceEditor,
  type BarkosTestEvidenceFormDraft
} from './BarkosTestEvidenceEditor'
import { BarkosScreenshotEvidenceEditor } from './BarkosScreenshotEvidenceEditor'
import { useBarkosScreenshotEvidence } from './use-barkos-screenshot-evidence'
import type {
  BarkosEvidenceSourceDraft,
  BarkosEvidenceSubmissionInput
} from './use-barkos-evidence-submission'

const UI_TEST_LIMIT = 10

function createTestDraft(sequence: number): BarkosTestEvidenceFormDraft {
  return {
    id: `test-${sequence}`,
    command: '',
    status: 'passed',
    summary: '',
    durationMs: ''
  }
}

type Props = {
  draft: BarkosEvidenceSourceDraft
  saving: boolean
  error: string | null
  onClose: () => void
  onRunTest: (command: string) => Promise<{
    status: 'passed' | 'failed'
    summary: string
    durationMs: number
  }>
  onSubmit: (input: BarkosEvidenceSubmissionInput) => Promise<void>
}

function testExecutionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (
    message.includes('barkos_test_paired_runtime_capability_missing') ||
    message.includes('barkos_test_paired_runtime_unavailable')
  ) {
    return translate(
      'barkos.evidence.test.pairedRuntimeUnsupported',
      'This paired host cannot run automatic test capture. Update the host or record the result manually.'
    )
  }
  if (
    message.includes('barkos_test_command_') ||
    message.includes('barkos_test_command_not_validation')
  ) {
    return translate(
      'barkos.evidence.test.commandRejected',
      'Use one validation command without shell operators or write/update flags.'
    )
  }
  if (
    message.includes('barkos_test_dispatch_authority_mismatch') ||
    message.includes('barkos_test_workspace_authority_mismatch') ||
    message.includes('barkos_test_paired_runtime_authority_')
  ) {
    return translate(
      'barkos.evidence.test.staleDispatch',
      'The worker or workspace changed. Close this dialog and reopen evidence collection.'
    )
  }
  return translate(
    'barkos.evidence.test.runFailed',
    'The test could not be run. Verify the command and active workspace, then try again.'
  )
}

function BarkosEvidenceSubmissionForm({
  draft,
  saving,
  error,
  onClose,
  onRunTest,
  onSubmit
}: Props): React.JSX.Element {
  const [tests, setTests] = useState<BarkosTestEvidenceFormDraft[]>([])
  const [diffSummary, setDiffSummary] = useState('')
  const [terminalExcerpt, setTerminalExcerpt] = useState(draft.terminalEvidence?.excerpt ?? '')
  const [risks, setRisks] = useState('')
  const [unresolvedDecisions, setUnresolvedDecisions] = useState('')
  const [runningTestId, setRunningTestId] = useState<string | null>(null)
  const [testRunError, setTestRunError] = useState<string | null>(null)
  const nextTestSequence = useRef(1)
  const intlLocale = getIntlLocale()
  const capturedAtFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale, {
        dateStyle: 'medium',
        timeStyle: 'medium'
      }),
    [intlLocale]
  )
  const screenshots = useBarkosScreenshotEvidence(saving)
  const testsComplete = tests.every(
    (test) => test.command.trim() !== '' && test.summary.trim() !== ''
  )
  const input: BarkosEvidenceSubmissionInput = {
    tests: tests.map((test) => ({
      command: test.command,
      status: test.status,
      summary: test.summary,
      durationMs: test.durationMs === '' ? null : Number(test.durationMs)
    })),
    screenshots: screenshots.screenshots.map((screenshot) => ({
      path: screenshot.path,
      caption: screenshot.caption,
      sha256: screenshot.sha256
    })),
    diffSummary,
    terminalExcerpt,
    risks,
    unresolvedDecisions
  }
  const preview = buildBarkosEvidenceCapture({
    changedFiles: draft.changedFiles,
    changedFilesTruncated: draft.changedFilesTruncated,
    terminalEvidence: collectBarkosTerminalEvidence(
      terminalExcerpt,
      `${draft.workerName} terminal`
    ),
    tests: input.tests,
    screenshots: input.screenshots,
    diffSummary,
    risks,
    unresolvedDecisions
  })
  const canSubmit =
    runningTestId === null &&
    testsComplete &&
    screenshots.complete &&
    hasMaterialBarkosEvidence(preview)

  const addTest = (): void => {
    if (tests.length >= UI_TEST_LIMIT) {
      return
    }
    const sequence = nextTestSequence.current
    nextTestSequence.current += 1
    setTests((current) => [...current, createTestDraft(sequence)])
  }
  const updateTest = (id: string, updates: Partial<BarkosTestEvidenceFormDraft>): void => {
    setTests((current) => current.map((test) => (test.id === id ? { ...test, ...updates } : test)))
  }
  const removeTest = (id: string): void => {
    setTests((current) => current.filter((test) => test.id !== id))
  }
  const runTest = async (id: string): Promise<void> => {
    const test = tests.find((entry) => entry.id === id)
    if (!test || runningTestId !== null || saving) {
      return
    }
    setRunningTestId(id)
    setTestRunError(null)
    try {
      const result = await onRunTest(test.command)
      updateTest(id, {
        status: result.status,
        summary: result.summary,
        durationMs: String(result.durationMs)
      })
    } catch (caught) {
      setTestRunError(testExecutionErrorMessage(caught))
    } finally {
      setRunningTestId(null)
    }
  }
  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canSubmit || saving) {
      return
    }
    await onSubmit(input)
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {translate('barkos.evidence.title', 'Submit completion evidence')}
        </DialogTitle>
        <DialogDescription>
          {translate(
            'barkos.evidence.description',
            'Submit {{value0}} for review. This settles the dispatch, but only acceptance completes the task.',
            { value0: draft.taskTitle }
          )}
        </DialogDescription>
      </DialogHeader>

      {error || testRunError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error ?? testRunError}
        </p>
      ) : null}
      {draft.collectionNotices.map((notice) => (
        <p
          key={notice}
          className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground"
        >
          {notice}
        </p>
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border/60 p-3">
          <div className="flex items-center gap-2">
            <FileDiff className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {translate('barkos.evidence.git.title', 'Git snapshot')}
            </p>
            <Badge variant="secondary">{draft.changedFiles.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {draft.gitSnapshotSource === 'fresh' && draft.gitCapturedAt !== null
              ? translate(
                  'barkos.evidence.git.fresh',
                  'Fresh workspace status captured at {{value0}}.',
                  { value0: capturedAtFormatter.format(new Date(draft.gitCapturedAt)) }
                )
              : draft.gitSnapshotSource === 'cached'
                ? translate(
                    'barkos.evidence.git.captured',
                    'Current cached workspace changes were captured.'
                  )
                : translate(
                    'barkos.evidence.git.unavailable',
                    'No Git snapshot was available for this workspace.'
                  )}
          </p>
        </div>
        <div className="rounded-md border border-border/60 p-3">
          <div className="flex items-center gap-2">
            <TerminalSquare className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {translate('barkos.evidence.terminal.title', 'Terminal excerpt')}
            </p>
            <Badge variant="secondary">{terminalExcerpt ? '1' : '0'}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate(
              'barkos.evidence.terminal.captured',
              'The bounded tail can be reviewed and edited before submission.'
            )}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="barkos-evidence-terminal">
          {translate('barkos.evidence.terminal.excerpt', 'Terminal excerpt (optional)')}
        </Label>
        <Textarea
          id="barkos-evidence-terminal"
          value={terminalExcerpt}
          onChange={(event) => setTerminalExcerpt(event.target.value)}
          maxLength={4_000}
          rows={5}
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {translate('barkos.evidence.tests', 'Test results')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate(
              'barkos.evidence.testsHelp',
              'Run a validation command starting from the exact active worker workspace, or record a result manually. Shell composition and write/update flags are rejected; project scripts still run with your normal user permissions.'
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving || tests.length >= UI_TEST_LIMIT}
          onClick={addTest}
        >
          <Plus className="size-3.5" />
          {translate('barkos.evidence.addTest', 'Add test')}
        </Button>
      </div>
      {tests.map((test, index) => (
        <BarkosTestEvidenceEditor
          key={test.id}
          test={test}
          number={index + 1}
          disabled={saving || runningTestId !== null}
          running={runningTestId === test.id}
          onChange={updateTest}
          onRemove={removeTest}
          onRun={(id) => void runTest(id)}
        />
      ))}

      <BarkosScreenshotEvidenceEditor controller={screenshots} disabled={saving} />

      <div className="space-y-2">
        <Label htmlFor="barkos-evidence-diff">
          {translate('barkos.evidence.diffSummary', 'Diff summary (optional)')}
        </Label>
        <Textarea
          id="barkos-evidence-diff"
          value={diffSummary}
          onChange={(event) => setDiffSummary(event.target.value)}
          maxLength={8_000}
          rows={3}
          disabled={saving}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="barkos-evidence-risks">
            {translate('barkos.evidence.risks', 'Risks (one per line)')}
          </Label>
          <Textarea
            id="barkos-evidence-risks"
            value={risks}
            onChange={(event) => setRisks(event.target.value)}
            maxLength={8_000}
            rows={3}
            disabled={saving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="barkos-evidence-decisions">
            {translate('barkos.evidence.decisions', 'Unresolved decisions (one per line)')}
          </Label>
          <Textarea
            id="barkos-evidence-decisions"
            value={unresolvedDecisions}
            onChange={(event) => setUnresolvedDecisions(event.target.value)}
            maxLength={8_000}
            rows={3}
            disabled={saving}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          {translate('barkos.company.action.cancel', 'Cancel')}
        </Button>
        <Button type="submit" disabled={!canSubmit || saving}>
          {saving
            ? translate('barkos.company.action.saving', 'Saving…')
            : translate('barkos.evidence.submit', 'Submit for review')}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function BarkosEvidenceSubmissionDialog(props: Props): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto scrollbar-sleek sm:max-w-3xl">
        {props.draft.collectingTerminal || props.draft.collectingGit ? (
          <div className="flex min-h-48 items-center justify-center" role="status">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="sr-only">
              {translate('barkos.evidence.collecting', 'Collecting bounded evidence')}
            </span>
          </div>
        ) : (
          <BarkosEvidenceSubmissionForm {...props} />
        )}
      </DialogContent>
    </Dialog>
  )
}
