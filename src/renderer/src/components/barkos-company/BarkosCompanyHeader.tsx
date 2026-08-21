import { Archive, ArrowLeft, Building2, Download, Pencil, Upload } from 'lucide-react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Props = {
  company: BarkosCompany | null
  loading: boolean
  saving: boolean
  fileBusy: boolean
  onBack: () => void
  onImport: () => void
  onExport: () => void
  onEdit: () => void
  onArchive: () => void
}

export function BarkosCompanyHeader({
  company,
  loading,
  saving,
  fileBusy,
  onBack,
  onImport,
  onExport,
  onEdit,
  onArchive
}: Props): React.JSX.Element {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3">
      <Button variant="outline" size="sm" onClick={onBack} className="shrink-0 gap-1.5">
        <ArrowLeft className="size-3.5" />
        {translate('barkos.company.page.back', 'Back')}
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30">
          <Building2 className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold text-foreground">
              {company?.name ?? translate('barkos.company.page.title', 'Company')}
            </h1>
            <Badge variant="secondary">
              {translate('barkos.company.page.foundation', 'Foundation')}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {company?.mission ??
              translate(
                'barkos.company.page.description',
                'Define the organization that your AI workers will operate.'
              )}
          </p>
        </div>
      </div>
      {!loading ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onImport} disabled={fileBusy || saving}>
            <Upload className="size-3.5" />
            {translate('barkos.company.action.import', 'Import')}
          </Button>
          {company ? (
            <>
              <Button variant="outline" size="sm" onClick={onExport} disabled={fileBusy || saving}>
                <Download className="size-3.5" />
                {translate('barkos.company.action.export', 'Export')}
              </Button>
              <Button variant="outline" size="sm" onClick={onEdit} disabled={fileBusy || saving}>
                <Pencil className="size-3.5" />
                {translate('barkos.company.action.edit', 'Edit company')}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={translate('barkos.company.action.archive', 'Archive company')}
                onClick={onArchive}
                disabled={fileBusy || saving}
              >
                <Archive className="size-3.5" />
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
