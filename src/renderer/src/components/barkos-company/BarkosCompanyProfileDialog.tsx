import { useState, type FormEvent } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
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

type Props = {
  company: BarkosCompany
  saving: boolean
  onClose: () => void
  onSave: (updates: Pick<BarkosCompany, 'name' | 'mission'>) => Promise<void>
}

export function BarkosCompanyProfileDialog({
  company,
  saving,
  onClose,
  onSave
}: Props): React.JSX.Element {
  const [name, setName] = useState(company.name)
  const [mission, setMission] = useState(company.mission)
  const canSubmit = name.trim() !== '' && mission.trim() !== ''

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canSubmit || saving) {
      return
    }
    await onSave({ name: name.trim(), mission: mission.trim() })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{translate('barkos.company.edit.title', 'Edit company')}</DialogTitle>
            <DialogDescription>
              {translate(
                'barkos.company.edit.description',
                'Keep the company identity and operating mission current.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="barkos-edit-company-name">
              {translate('barkos.company.edit.name', 'Company name')}
            </Label>
            <Input
              id="barkos-edit-company-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="barkos-edit-company-mission">
              {translate('barkos.company.edit.mission', 'Mission')}
            </Label>
            <Textarea
              id="barkos-edit-company-mission"
              value={mission}
              onChange={(event) => setMission(event.target.value)}
              maxLength={2_000}
              rows={5}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {translate('barkos.company.action.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit || saving}>
              {saving
                ? translate('barkos.company.action.saving', 'Saving…')
                : translate('barkos.company.action.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
