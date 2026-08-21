import { useCallback, useRef, useState } from 'react'
import {
  buildBarkosEvidenceCapture,
  collectBarkosChangedFileEvidence,
  collectBarkosTerminalEvidence,
  nextBarkosEvidenceId,
  type BarkosTestEvidenceDraft
} from '../../../../shared/barkos/evidence-capture'
import type { BarkosEvidenceCapture } from '../../../../shared/barkos/evidence-review'
import {
  BARKOS_TEST_EVIDENCE_RUN_VERSION,
  type BarkosTestEvidenceRunResult
} from '../../../../shared/barkos/test-evidence-run'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { readFreshBarkosGitStatus } from '@/lib/barkos-git-evidence'
import { resolveBarkosWorkerPtyId } from '@/lib/barkos-orchestration-target'
import { readBarkosTerminalEvidenceSnapshot } from '@/lib/barkos-terminal-evidence'

export type BarkosGitSnapshotSource = 'fresh' | 'cached' | 'unavailable'

export type BarkosEvidenceSourceDraft = {
  dispatchId: string
  taskTitle: string
  workerName: string
  changedFiles: BarkosEvidenceCapture['changedFiles']
  changedFilesTruncated: boolean
  gitSnapshotSource: BarkosGitSnapshotSource
  gitCapturedAt: number | null
  terminalEvidence: BarkosEvidenceCapture['terminalExcerpts'][number] | null
  collectingTerminal: boolean
  collectingGit: boolean
  collectionNotices: string[]
}

export type BarkosEvidenceSubmissionInput = {
  tests: readonly BarkosTestEvidenceDraft[]
  screenshots: BarkosEvidenceCapture['screenshots']
  diffSummary: string
  terminalExcerpt: string
  risks: string
  unresolvedDecisions: string
}

export type BarkosEvidenceSubmissionController = {
  draft: BarkosEvidenceSourceDraft | null
  saving: boolean
  error: string | null
  open: (dispatchId: string) => Promise<void>
  close: () => void
  runTest: (command: string) => Promise<BarkosTestEvidenceRunResult>
  submit: (input: BarkosEvidenceSubmissionInput) => Promise<void>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useBarkosEvidenceSubmission(args: {
  onMessage: (message: string) => void
}): BarkosEvidenceSubmissionController {
  const { onMessage } = args
  const [draft, setDraft] = useState<BarkosEvidenceSourceDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const collectionSequence = useRef(0)
  const gitAbortController = useRef<AbortController | null>(null)
  const activeTestDispatchId = useRef<string | null>(null)

  const close = useCallback((): void => {
    collectionSequence.current += 1
    gitAbortController.current?.abort()
    gitAbortController.current = null
    if (activeTestDispatchId.current) {
      void window.api?.barkosWorkLedger?.cancelTest(activeTestDispatchId.current)
      activeTestDispatchId.current = null
    }
    setDraft(null)
    setError(null)
  }, [])

  const open = useCallback(async (dispatchId: string): Promise<void> => {
    gitAbortController.current?.abort()
    gitAbortController.current = null
    const state = useAppStore.getState()
    const ledger = state.barkosWorkLedger
    const company = state.barkosCompany
    const dispatch = ledger?.dispatches.find((entry) => entry.id === dispatchId)
    const assignment = dispatch
      ? ledger?.assignments.find((entry) => entry.id === dispatch.assignmentId)
      : null
    const task = dispatch
      ? ledger?.plans.flatMap((plan) => plan.tasks).find((entry) => entry.id === dispatch.taskId)
      : null
    const worker = assignment
      ? company?.workers.find((entry) => entry.id === assignment.workerId)
      : null
    if (!ledger || !dispatch || !assignment || !task || !worker) {
      setError('The active BarkOS dispatch could not be resolved')
      return
    }

    const sequence = collectionSequence.current + 1
    collectionSequence.current = sequence
    const abortController = new AbortController()
    gitAbortController.current = abortController
    const binding = state.barkosWorkerSessions[worker.id]
    const cachedGitSnapshotKnown = Boolean(
      binding && Object.hasOwn(state.gitStatusByWorktree, binding.workspaceId)
    )
    const cachedGitEvidence = collectBarkosChangedFileEvidence(
      binding ? (state.gitStatusByWorktree[binding.workspaceId] ?? []) : []
    )
    const cachedChangedFilesTruncated = Boolean(
      cachedGitEvidence.truncated ||
      (binding && state.gitStatusHugeByWorktree[binding.workspaceId] !== undefined)
    )
    const base: BarkosEvidenceSourceDraft = {
      dispatchId,
      taskTitle: task.title,
      workerName: worker.name,
      changedFiles: cachedGitEvidence.changedFiles,
      changedFilesTruncated: cachedChangedFilesTruncated,
      gitSnapshotSource: cachedGitSnapshotKnown ? 'cached' : 'unavailable',
      gitCapturedAt: null,
      terminalEvidence: null,
      collectingTerminal: Boolean(binding),
      collectingGit: Boolean(binding),
      collectionNotices: binding
        ? []
        : [
            translate(
              'barkos.evidence.notice.noSession',
              'No active worker session was found. Add evidence manually.'
            )
          ]
    }
    activeTestDispatchId.current = dispatchId
    setError(null)
    setDraft(base)
    if (!binding) {
      gitAbortController.current = null
      return
    }

    const ptyId = resolveBarkosWorkerPtyId(
      binding,
      state.agentStatusByPaneKey,
      state.terminalLayoutsByTabId
    )
    const terminalPromise = ptyId
      ? readBarkosTerminalEvidenceSnapshot(ptyId)
          .then((rawTerminal) => {
            const evidence = collectBarkosTerminalEvidence(rawTerminal, `${worker.name} terminal`)
            return {
              evidence,
              notice: evidence
                ? null
                : translate(
                    'barkos.evidence.notice.emptyTerminal',
                    'The terminal snapshot contained no readable text.'
                  )
            }
          })
          .catch(() => ({
            evidence: null,
            notice: translate(
              'barkos.evidence.notice.captureFailed',
              'Terminal capture failed. Git and manual evidence remain available.'
            )
          }))
      : Promise.resolve({
          evidence: null,
          notice: translate(
            'barkos.evidence.notice.noTerminal',
            'The exact worker terminal was unavailable. Add other evidence manually if needed.'
          )
        })
    const gitPromise = readFreshBarkosGitStatus(state, binding, abortController.signal)
      .then((status) => {
        if (!status) {
          return {
            evidence: cachedGitEvidence,
            truncated: cachedChangedFilesTruncated,
            source: cachedGitSnapshotKnown ? ('cached' as const) : ('unavailable' as const),
            capturedAt: null,
            notice: translate(
              'barkos.evidence.notice.noGitTarget',
              'The exact Git workspace was unavailable; any displayed snapshot is cached.'
            )
          }
        }
        return {
          evidence: collectBarkosChangedFileEvidence(status.entries),
          truncated: status.didHitLimit === true,
          source: 'fresh' as const,
          capturedAt: Date.now(),
          notice: null
        }
      })
      .catch(() => ({
        evidence: cachedGitEvidence,
        truncated: cachedChangedFilesTruncated,
        source: cachedGitSnapshotKnown ? ('cached' as const) : ('unavailable' as const),
        capturedAt: null,
        notice: cachedGitSnapshotKnown
          ? translate(
              'barkos.evidence.notice.gitRefreshFailedCached',
              'Fresh Git status failed; the current cached snapshot is shown.'
            )
          : translate(
              'barkos.evidence.notice.gitRefreshFailed',
              'Fresh Git status failed and no cached snapshot was available.'
            )
      }))
    const [terminalResult, gitResult] = await Promise.all([terminalPromise, gitPromise])
    if (collectionSequence.current !== sequence) {
      return
    }
    gitAbortController.current = null
    setDraft({
      ...base,
      changedFiles: gitResult.evidence.changedFiles,
      changedFilesTruncated: gitResult.truncated || gitResult.evidence.truncated,
      gitSnapshotSource: gitResult.source,
      gitCapturedAt: gitResult.capturedAt,
      terminalEvidence: terminalResult.evidence,
      collectingTerminal: false,
      collectingGit: false,
      collectionNotices: [terminalResult.notice, gitResult.notice].filter(
        (notice): notice is string => notice !== null
      )
    })
  }, [])

  const runTest = useCallback(
    async (command: string): Promise<BarkosTestEvidenceRunResult> => {
      if (!draft || draft.collectingTerminal || draft.collectingGit || saving) {
        throw new Error('BarkOS evidence is not ready for test execution')
      }
      return window.api.barkosWorkLedger.runTest({
        version: BARKOS_TEST_EVIDENCE_RUN_VERSION,
        dispatchId: draft.dispatchId,
        command
      })
    },
    [draft, saving]
  )

  const submit = useCallback(
    async (input: BarkosEvidenceSubmissionInput): Promise<void> => {
      if (!draft || draft.collectingTerminal || draft.collectingGit || saving) {
        return
      }
      const state = useAppStore.getState()
      const ledger = state.barkosWorkLedger
      if (!ledger) {
        setError('BarkOS work ledger is not ready')
        return
      }
      setSaving(true)
      setError(null)
      try {
        const capture = buildBarkosEvidenceCapture({
          changedFiles: draft.changedFiles,
          changedFilesTruncated: draft.changedFilesTruncated,
          terminalEvidence: collectBarkosTerminalEvidence(
            input.terminalExcerpt,
            `${draft.workerName} terminal`
          ),
          tests: input.tests,
          screenshots: input.screenshots,
          diffSummary: input.diffSummary,
          risks: input.risks,
          unresolvedDecisions: input.unresolvedDecisions
        })
        await state.submitBarkosWorkEvidence({
          manifestId: nextBarkosEvidenceId(ledger, draft.dispatchId),
          dispatchId: draft.dispatchId,
          capture
        })
        collectionSequence.current += 1
        setDraft(null)
        onMessage(
          translate(
            'barkos.evidence.message.submitted',
            'Evidence submitted for review. Completion still requires acceptance.'
          )
        )
      } catch (caught) {
        setError(errorMessage(caught))
      } finally {
        setSaving(false)
      }
    },
    [draft, onMessage, saving]
  )

  return { draft, saving, error, open, close, runTest, submit }
}
