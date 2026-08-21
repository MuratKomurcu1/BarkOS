import { useCallback } from 'react'
import { translate } from '@/i18n/i18n'
import type { BarkosBackupBundle } from '../../../../shared/barkos/backup-bundle'
import type { BarkosCompanyEditorState } from './BarkosCompanyDialogs'

type Args = {
  company: { id: string } | null
  editor: BarkosCompanyEditorState
  setEditor: (editor: BarkosCompanyEditorState) => void
  setActionMessage: (message: string | null) => void
  archiveCompany: () => Promise<unknown>
  exportCompany: () => Promise<'cancelled' | 'exported'>
  pickImport: () => Promise<BarkosBackupBundle | null>
  importBackup: (backup: BarkosBackupBundle) => Promise<unknown>
}

/** Backup file actions (export, import pick/confirm, archive) shared by the
 * company page; extracted to keep the page component under the line budget. */
export function useBarkosCompanyBackupActions(args: Args): {
  handleExport: () => Promise<void>
  handleImport: () => Promise<void>
  handleConfirmImport: () => Promise<void>
  handleArchive: () => Promise<void>
} {
  const handleExport = useCallback(async (): Promise<void> => {
    try {
      const result = await args.exportCompany()
      args.setActionMessage(
        result === 'exported'
          ? translate('barkos.company.message.exported', 'BarkOS backup exported.')
          : translate('barkos.company.message.exportCancelled', 'Export cancelled.')
      )
    } catch {
      // The store publishes a user-visible error.
    }
  }, [args])

  const handleImport = useCallback(async (): Promise<void> => {
    try {
      const backup = await args.pickImport()
      if (!backup) {
        return
      }
      if (args.company) {
        args.setEditor({ kind: 'import', backup })
        return
      }
      await args.importBackup(backup)
      args.setActionMessage(translate('barkos.company.message.imported', 'BarkOS backup imported.'))
    } catch {
      // The store publishes validation and file errors.
    }
  }, [args])

  const handleConfirmImport = useCallback(async (): Promise<void> => {
    if (args.editor?.kind !== 'import') {
      return
    }
    try {
      await args.importBackup(args.editor.backup)
      args.setEditor(null)
      args.setActionMessage(translate('barkos.company.message.imported', 'BarkOS backup imported.'))
    } catch {
      // The current company remains intact when persistence fails.
    }
  }, [args])

  const handleArchive = useCallback(async (): Promise<void> => {
    try {
      await args.archiveCompany()
      args.setEditor(null)
      args.setActionMessage(
        translate('barkos.company.message.archived', 'Company archived. You can create a new one.')
      )
    } catch {
      // The store publishes a user-visible error and leaves the company intact.
    }
  }, [args])

  return { handleExport, handleImport, handleConfirmImport, handleArchive }
}
