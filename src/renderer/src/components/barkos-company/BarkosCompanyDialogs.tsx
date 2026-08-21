import type {
  BarkosCompany,
  BarkosRole,
  BarkosRoleInput,
  BarkosWorker,
  BarkosWorkerInput
} from '../../../../shared/barkos/company'
import type { BarkosBackupBundle } from '../../../../shared/barkos/backup-bundle'
import { translate } from '@/i18n/i18n'
import type { BarkosCompanyFileAction } from '@/store/slices/barkos-company'
import type {
  BarkosObjectivePlanDraft,
  BarkosWorkLedgerLoadState
} from '@/store/slices/barkos-work-ledger'
import { BarkosCompanyConfirmDialog } from './BarkosCompanyConfirmDialog'
import { BarkosCompanyProfileDialog } from './BarkosCompanyProfileDialog'
import { BarkosEvidenceSubmissionSurface } from './BarkosEvidenceSubmissionSurface'
import { BarkosObjectivePlannerDialog } from './BarkosObjectivePlannerDialog'
import { BarkosRoleDialog } from './BarkosRoleDialog'
import { BarkosWorkerDialog } from './BarkosWorkerDialog'
import { BarkosWorkerLaunchDialog } from './BarkosWorkerLaunchDialog'
import type { BarkosEvidenceSubmissionController } from './use-barkos-evidence-submission'
import type { useBarkosWorkerLaunch } from './use-barkos-worker-launch'

export type BarkosCompanyEditorState =
  | { kind: 'profile' }
  | { kind: 'role'; role?: BarkosRole }
  | { kind: 'worker'; worker?: BarkosWorker }
  | { kind: 'archive' }
  | { kind: 'import'; backup: BarkosBackupBundle }
  | { kind: 'objective' }
  | null

type Props = {
  company: BarkosCompany | null
  editor: BarkosCompanyEditorState
  saving: boolean
  fileAction: BarkosCompanyFileAction
  workLedgerLoadState: BarkosWorkLedgerLoadState
  workLedgerError: string | null
  workerLaunch: ReturnType<typeof useBarkosWorkerLaunch>
  evidenceSubmission: BarkosEvidenceSubmissionController
  onCloseEditor: () => void
  onSaveProfile: (updates: Pick<BarkosCompany, 'name' | 'mission'>) => Promise<void>
  onSaveRole: (input: BarkosRoleInput) => Promise<void>
  onSaveWorker: (input: BarkosWorkerInput, makeLead: boolean) => Promise<void>
  onSaveObjectivePlan: (draft: BarkosObjectivePlanDraft) => Promise<void>
  onArchive: () => Promise<void>
  onConfirmImport: () => Promise<void>
}

export function BarkosCompanyDialogs(props: Props): React.JSX.Element {
  const { company, editor, workerLaunch } = props
  return (
    <>
      {company && editor?.kind === 'profile' ? (
        <BarkosCompanyProfileDialog
          company={company}
          saving={props.saving}
          onClose={props.onCloseEditor}
          onSave={props.onSaveProfile}
        />
      ) : null}
      {company && editor?.kind === 'role' ? (
        <BarkosRoleDialog
          role={editor.role}
          saving={props.saving}
          onClose={props.onCloseEditor}
          onSave={props.onSaveRole}
        />
      ) : null}
      {company && editor?.kind === 'worker' ? (
        <BarkosWorkerDialog
          roles={company.roles}
          worker={editor.worker}
          isLead={editor.worker?.id === company.leadWorkerId}
          saving={props.saving}
          onClose={props.onCloseEditor}
          onSave={props.onSaveWorker}
        />
      ) : null}
      {workerLaunch.worker ? (
        <BarkosWorkerLaunchDialog
          worker={workerLaunch.worker}
          role={workerLaunch.role}
          targets={workerLaunch.targets}
          defaultTargetId={workerLaunch.defaultTargetId}
          error={workerLaunch.error}
          launching={workerLaunch.launching}
          onClose={workerLaunch.close}
          onLaunch={workerLaunch.launch}
        />
      ) : null}
      {company && editor?.kind === 'objective' ? (
        <BarkosObjectivePlannerDialog
          leadName={
            company.workers.find((worker) => worker.id === company.leadWorkerId)?.name ??
            company.leadWorkerId
          }
          saving={props.workLedgerLoadState === 'saving'}
          error={props.workLedgerError}
          onClose={props.onCloseEditor}
          onSave={props.onSaveObjectivePlan}
        />
      ) : null}
      <BarkosEvidenceSubmissionSurface controller={props.evidenceSubmission} />
      {company && editor?.kind === 'archive' ? (
        <BarkosCompanyConfirmDialog
          title={translate('barkos.company.archive.title', 'Archive company?')}
          description={translate(
            'barkos.company.archive.description',
            'The active company will move to BarkOS local archives. Its JSON data will not be deleted.'
          )}
          confirmLabel={translate('barkos.company.archive.confirm', 'Archive company')}
          busy={props.fileAction === 'archiving'}
          destructive
          onClose={props.onCloseEditor}
          onConfirm={props.onArchive}
        />
      ) : null}
      {editor?.kind === 'import' ? (
        <BarkosCompanyConfirmDialog
          title={translate('barkos.company.import.title', 'Replace active company?')}
          description={translate(
            'barkos.company.import.description',
            'Importing {{value0}} will replace the active company and restore {{value1}} memory items. Export the current BarkOS backup first if you need it.',
            {
              value0: editor.backup.company.name,
              value1:
                editor.backup.memoryVault.entries.length +
                editor.backup.memoryVault.candidates.length
            }
          )}
          confirmLabel={translate('barkos.company.import.confirm', 'Replace and import')}
          busy={props.fileAction === 'importing'}
          destructive
          onClose={props.onCloseEditor}
          onConfirm={props.onConfirmImport}
        />
      ) : null}
    </>
  )
}
