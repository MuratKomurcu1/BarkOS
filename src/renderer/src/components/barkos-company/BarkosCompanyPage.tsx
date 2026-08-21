import { useCallback, useEffect, useState } from 'react'
import {
  addBarkosRole,
  addBarkosWorker,
  createBarkosCompany,
  setBarkosCompanyLead,
  updateBarkosCompanyProfile,
  updateBarkosRole,
  updateBarkosWorker,
  type BarkosCompany,
  type BarkosRoleInput,
  type BarkosWorkerInput,
  type CreateBarkosCompanyInput
} from '../../../../shared/barkos/company'
import { resolveBarkosDefaultCompanyAgentId } from '../../../../shared/barkos/company-agent-default'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { BarkosCompanyCreateForm } from './BarkosCompanyCreateForm'
import { BarkosCompanyDialogs, type BarkosCompanyEditorState } from './BarkosCompanyDialogs'
import { BarkosCompanyPageFeedback } from './BarkosCompanyPageFeedback'
import { BarkosCompanyHeader } from './BarkosCompanyHeader'
import { BarkosCompanyWorkspace } from './BarkosCompanyWorkspace'
import { useBarkosWorkerLaunch } from './use-barkos-worker-launch'
import { useBarkosOrchestrationActions } from './use-barkos-orchestration-actions'
import { useBarkosEvidenceSubmission } from './use-barkos-evidence-submission'
import { useBarkosCompanySnapshots } from './use-barkos-company-snapshots'
import { useBarkosDecisionInbox } from './use-barkos-decision-inbox'
import { useBarkosMemoryVault } from './use-barkos-memory-vault'
import { useBarkosProviderCapacity } from './use-barkos-provider-capacity'
import { useBarkosUsageCost } from './use-barkos-usage-cost'
import { useBarkosCompanyBackupActions } from './use-barkos-company-backup-actions'
import { startBarkosProjectIntake } from '@/lib/barkos-project-intake-runtime'

export default function BarkosCompanyPage(): React.JSX.Element {
  const company = useAppStore((state) => state.barkosCompany)
  const loadState = useAppStore((state) => state.barkosCompanyLoadState)
  const fileAction = useAppStore((state) => state.barkosCompanyFileAction)
  const error = useAppStore((state) => state.barkosCompanyError)
  const loadCompany = useAppStore((state) => state.loadBarkosCompany)
  const saveCompany = useAppStore((state) => state.saveBarkosCompany)
  const archiveCompany = useAppStore((state) => state.archiveBarkosCompany)
  const exportCompany = useAppStore((state) => state.exportBarkosCompany)
  const pickImport = useAppStore((state) => state.pickBarkosCompanyImport)
  const importBackup = useAppStore((state) => state.importBarkosCompanyBackup)
  const clearError = useAppStore((state) => state.clearBarkosCompanyError)
  const closeCompanyPage = useAppStore((state) => state.closeCompanyPage)
  const {
    workerSessions,
    workerSessionError,
    loadWorkerSessions,
    clearWorkerSessionError,
    controlPolicy,
    controlPolicyLoadState,
    controlPolicyError,
    loadControlPolicy,
    updateControlPolicy,
    decisionInbox,
    decisionInboxLoadState,
    decisionInboxError,
    memoryVault,
    memoryVaultLoadState,
    memoryVaultError,
    workLedger,
    workLedgerLoadState,
    workLedgerError,
    loadWorkLedger,
    reviewWorkEvidence,
    createObjectivePlan,
    clearWorkLedgerError,
    providerCapacity,
    providerCapacityLoadState,
    providerCapacityError
  } = useBarkosCompanySnapshots(company, loadState)
  const [editor, setEditor] = useState<BarkosCompanyEditorState>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [projectIntakeBusy, setProjectIntakeBusy] = useState(false)
  const workerLaunch = useBarkosWorkerLaunch(company)
  const orchestration = useBarkosOrchestrationActions({
    company,
    ledger: workLedger,
    workerSessions,
    onMessage: setActionMessage
  })
  const evidenceSubmission = useBarkosEvidenceSubmission({ onMessage: setActionMessage })
  const decisionInboxController = useBarkosDecisionInbox({
    company,
    ledger: workLedger,
    workerSessions
  })
  const memoryVaultController = useBarkosMemoryVault({ company, ledger: workLedger })
  const providerCapacityController = useBarkosProviderCapacity({
    company,
    ledger: providerCapacity,
    workLedger,
    onMessage: setActionMessage
  })
  const usageCostController = useBarkosUsageCost({
    company,
    workLedger,
    workerSessions,
    onMessage: setActionMessage
  })
  const backupActions = useBarkosCompanyBackupActions({
    company,
    editor,
    setEditor,
    setActionMessage,
    archiveCompany,
    exportCompany,
    pickImport,
    importBackup
  })

  useEffect(() => {
    if (loadState === 'idle') {
      void loadCompany()
    }
  }, [loadCompany, loadState])

  const closeEditor = useCallback(() => {
    setEditor(null)
    clearError()
    clearWorkLedgerError()
  }, [clearError, clearWorkLedgerError])

  const handleCreate = useCallback(
    async (input: CreateBarkosCompanyInput): Promise<void> => {
      const state = useAppStore.getState()
      await saveCompany(
        createBarkosCompany({
          ...input,
          // Why: the hardcoded codex default broke the whole intake chain on
          // machines without the Codex CLI; launch what this machine actually has.
          agentId:
            input.agentId ??
            resolveBarkosDefaultCompanyAgentId({
              detectedAgentIds: state.detectedAgentIds,
              disabledTuiAgents: state.settings?.disabledTuiAgents ?? null
            })
        })
      )
      await window.api.onboarding
        .update({ closedAt: Date.now(), outcome: 'completed', lastCompletedStep: 5 })
        .catch((error) =>
          console.warn('BarkOS first-run completion could not be persisted:', error)
        )
      setActionMessage(translate('barkos.company.message.created', 'Company created.'))
    },
    [saveCompany]
  )

  const handleProfileSave = useCallback(
    async (updates: Pick<BarkosCompany, 'name' | 'mission'>): Promise<void> => {
      if (!company) {
        return
      }
      try {
        await saveCompany(updateBarkosCompanyProfile(company, updates))
        setEditor(null)
        setActionMessage(translate('barkos.company.message.updated', 'Company updated.'))
      } catch {
        // The durable store error remains visible while the dialog stays open.
      }
    },
    [company, saveCompany]
  )

  const handleRoleSave = useCallback(
    async (input: BarkosRoleInput): Promise<void> => {
      if (!company || editor?.kind !== 'role') {
        return
      }
      try {
        const updated = editor.role
          ? updateBarkosRole(company, editor.role.id, input)
          : addBarkosRole(company, input)
        await saveCompany(updated)
        setEditor(null)
        setActionMessage(translate('barkos.company.message.roleSaved', 'Role saved.'))
      } catch {
        // The durable store or schema error remains visible beside the editor.
      }
    },
    [company, editor, saveCompany]
  )

  const handleWorkerSave = useCallback(
    async (input: BarkosWorkerInput, makeLead: boolean): Promise<void> => {
      if (!company || editor?.kind !== 'worker') {
        return
      }
      try {
        let updated: BarkosCompany
        let workerId: string
        if (editor.worker) {
          workerId = editor.worker.id
          updated = updateBarkosWorker(company, workerId, input)
        } else {
          updated = addBarkosWorker(company, input)
          workerId = updated.workers.at(-1)?.id ?? ''
        }
        if (makeLead && workerId !== updated.leadWorkerId) {
          updated = setBarkosCompanyLead(updated, workerId)
        }
        await saveCompany(updated)
        setEditor(null)
        setActionMessage(translate('barkos.company.message.workerSaved', 'Worker saved.'))
      } catch {
        // The durable store or schema error remains visible beside the editor.
      }
    },
    [company, editor, saveCompany]
  )

  const handleExport = backupActions.handleExport
  const handleImport = backupActions.handleImport
  const handleConfirmImport = backupActions.handleConfirmImport
  const handleArchive = backupActions.handleArchive

  const handleEvidenceReview = useCallback(
    async (evidenceId: string, decision: 'accepted' | 'rejected'): Promise<void> => {
      try {
        await reviewWorkEvidence(evidenceId, decision)
        setActionMessage(
          decision === 'accepted'
            ? translate('barkos.board.message.accepted', 'Evidence accepted and task completed.')
            : translate('barkos.board.message.rejected', 'Evidence rejected and task returned.')
        )
      } catch {
        // The durable work-ledger error stays visible on the board.
      }
    },
    [reviewWorkEvidence]
  )

  const handleObjectivePlanSave = useCallback(
    async (draft: Parameters<typeof createObjectivePlan>[0]): Promise<void> => {
      try {
        await createObjectivePlan(draft)
        setEditor(null)
        setActionMessage(
          translate(
            'barkos.planner.message.created',
            'Objective plan created. No workers were launched.'
          )
        )
      } catch {
        // The durable work-ledger error remains visible inside the planner.
      }
    },
    [createObjectivePlan]
  )

  const handleProjectStart = useCallback(
    async (request: string): Promise<boolean> => {
      if (!company || projectIntakeBusy) {
        return false
      }
      setProjectIntakeBusy(true)
      setActionMessage(null)
      try {
        const result = await startBarkosProjectIntake({ company, request })
        if (result.state === 'cancelled') {
          setActionMessage(
            translate(
              'barkos.intake.message.cancelled',
              'Proje klasörü seçilmedi. İsteğiniz silinmedi; hazır olduğunuzda tekrar başlatın.'
            )
          )
          return false
        }
        setActionMessage(
          result.state === 'started'
            ? translate(
                'barkos.intake.message.started',
                'Dosya okuyucu ajan başladı. Baş ajan, inceleme tamamlanınca ekip planını devralacak.'
              )
            : translate(
                'barkos.intake.message.planned',
                'Plan hazırlandı; başlatma için gereken onay Kararlar bölümünde bekliyor.'
              )
        )
        return true
      } catch (caught) {
        setActionMessage(caught instanceof Error ? caught.message : String(caught))
        return false
      } finally {
        setProjectIntakeBusy(false)
      }
    },
    [company, projectIntakeBusy]
  )

  const loading = loadState === 'idle' || loadState === 'loading'
  const saving = loadState === 'saving'
  const fileBusy = fileAction !== 'idle'

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <BarkosCompanyHeader
        company={company}
        loading={loading}
        saving={saving}
        fileBusy={fileBusy}
        onBack={closeCompanyPage}
        onImport={() => void handleImport()}
        onExport={() => void handleExport()}
        onEdit={() => setEditor({ kind: 'profile' })}
        onArchive={() => setEditor({ kind: 'archive' })}
      />

      <main className="flex-1 overflow-y-auto p-5 scrollbar-sleek">
        <BarkosCompanyPageFeedback
          actionMessage={actionMessage}
          error={error}
          hasCompany={Boolean(company)}
          workerSessionError={workerSessionError}
          onRetryWorkerSessions={() => {
            clearWorkerSessionError()
            if (company) {
              void loadWorkerSessions(company.id)
            }
          }}
          loading={loading}
          loadFailedWithoutCompany={loadState === 'error' && !company}
          onLoadRetry={loadCompany}
        />

        {!loading && !(loadState === 'error' && !company) && !company ? (
          <BarkosCompanyCreateForm saving={saving} error={error} onCreate={handleCreate} />
        ) : null}

        {!loading && company ? (
          <BarkosCompanyWorkspace
            company={company}
            controlPolicy={controlPolicy}
            controlPolicyLoadState={controlPolicyLoadState}
            controlPolicyError={controlPolicyError}
            onReloadControlPolicy={() => loadControlPolicy(company.id)}
            onUpdateControlPolicy={updateControlPolicy}
            workerSessions={workerSessions}
            workLedger={workLedger}
            workLedgerLoadState={workLedgerLoadState}
            workLedgerError={orchestration.error ?? workLedgerError}
            decisionInbox={decisionInbox}
            decisionInboxLoadState={decisionInboxLoadState}
            decisionInboxError={decisionInboxError}
            decisionInboxController={decisionInboxController}
            memoryVault={memoryVault}
            memoryVaultLoadState={memoryVaultLoadState}
            memoryVaultError={memoryVaultError}
            memoryVaultController={memoryVaultController}
            providerCapacity={providerCapacity}
            providerCapacityLoadState={providerCapacityLoadState}
            providerCapacityError={providerCapacityError}
            providerCapacityController={providerCapacityController}
            usageCost={usageCostController.ledger}
            usageCostController={usageCostController}
            onAddWorker={() => setEditor({ kind: 'worker' })}
            onEditWorker={(worker) => setEditor({ kind: 'worker', worker })}
            onLaunchWorker={workerLaunch.open}
            onAddRole={() => setEditor({ kind: 'role' })}
            onEditRole={(role) => setEditor({ kind: 'role', role })}
            onReloadWorkLedger={() => {
              orchestration.clearError()
              void loadWorkLedger(company.id)
            }}
            onCreateObjective={() => setEditor({ kind: 'objective' })}
            onReviewEvidence={handleEvidenceReview}
            orchestration={orchestration}
            onSubmitEvidence={evidenceSubmission.open}
            projectIntakeBusy={projectIntakeBusy}
            onStartProject={handleProjectStart}
          />
        ) : null}
      </main>

      <BarkosCompanyDialogs
        company={company}
        editor={editor}
        saving={saving}
        fileAction={fileAction}
        workLedgerLoadState={workLedgerLoadState}
        workLedgerError={workLedgerError}
        workerLaunch={workerLaunch}
        evidenceSubmission={evidenceSubmission}
        onCloseEditor={closeEditor}
        onSaveProfile={handleProfileSave}
        onSaveRole={handleRoleSave}
        onSaveWorker={handleWorkerSave}
        onSaveObjectivePlan={handleObjectivePlanSave}
        onArchive={handleArchive}
        onConfirmImport={handleConfirmImport}
      />
    </div>
  )
}
