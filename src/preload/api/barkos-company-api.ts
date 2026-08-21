import type { BarkosCompany } from '../../shared/barkos/company'
import type { BarkosBackupBundle } from '../../shared/barkos/backup-bundle'

export type BarkosCompanyExportResult = { status: 'cancelled' } | { status: 'exported' }

export type BarkosCompanyImportResult =
  | { status: 'cancelled' }
  | { status: 'selected'; backup: BarkosBackupBundle }

export type BarkosCompanyApi = {
  load: () => Promise<BarkosCompany | null>
  save: (company: BarkosCompany) => Promise<BarkosCompany>
  archive: () => Promise<BarkosCompany | null>
  exportCurrent: () => Promise<BarkosCompanyExportResult>
  pickImport: () => Promise<BarkosCompanyImportResult>
  applyImport: (backup: BarkosBackupBundle) => Promise<BarkosBackupBundle>
}
