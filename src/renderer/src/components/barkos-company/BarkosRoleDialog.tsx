import { useState, type FormEvent } from 'react'
import type { BarkosRole, BarkosRoleInput } from '../../../../shared/barkos/company'
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
  role?: BarkosRole
  saving: boolean
  onClose: () => void
  onSave: (input: BarkosRoleInput) => Promise<void>
}

function distinctLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ]
}

export function BarkosRoleDialog({ role, saving, onClose, onSave }: Props): React.JSX.Element {
  const [name, setName] = useState(role?.name ?? '')
  const [mission, setMission] = useState(role?.mission ?? '')
  const [capabilities, setCapabilities] = useState(role?.capabilities.join('\n') ?? '')
  const [definitionOfDone, setDefinitionOfDone] = useState(role?.definitionOfDone.join('\n') ?? '')
  const [instructions, setInstructions] = useState(role?.instructions ?? '')
  const doneItems = distinctLines(definitionOfDone)
  const canSubmit = name.trim() !== '' && mission.trim() !== '' && doneItems.length > 0

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canSubmit || saving) {
      return
    }
    await onSave({
      name: name.trim(),
      mission: mission.trim(),
      capabilities: distinctLines(capabilities),
      definitionOfDone: doneItems,
      instructions: instructions.trim() || null
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto scrollbar-sleek sm:max-w-xl">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {role
                ? translate('barkos.company.role.editTitle', 'Edit role')
                : translate('barkos.company.role.addTitle', 'Add role')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'barkos.company.role.description',
                'Define responsibility, capabilities, and the evidence required for completion.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="barkos-role-name">
              {translate('barkos.company.role.name', 'Name')}
            </Label>
            <Input
              id="barkos-role-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="barkos-role-mission">
              {translate('barkos.company.role.mission', 'Mission')}
            </Label>
            <Textarea
              id="barkos-role-mission"
              value={mission}
              onChange={(event) => setMission(event.target.value)}
              maxLength={2_000}
              rows={3}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="barkos-role-capabilities">
              {translate('barkos.company.role.capabilities', 'Capabilities')}
            </Label>
            <Textarea
              id="barkos-role-capabilities"
              value={capabilities}
              onChange={(event) => setCapabilities(event.target.value)}
              placeholder={translate(
                'barkos.company.role.capabilitiesHelp',
                'One per line, or separated by commas'
              )}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="barkos-role-done">
              {translate('barkos.company.role.done', 'Definition of done')}
            </Label>
            <Textarea
              id="barkos-role-done"
              value={definitionOfDone}
              onChange={(event) => setDefinitionOfDone(event.target.value)}
              placeholder={translate(
                'barkos.company.role.doneHelp',
                'One verifiable outcome per line'
              )}
              rows={3}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="barkos-role-instructions">
              {translate('barkos.company.role.instructions', 'Instructions (optional)')}
            </Label>
            <Textarea
              id="barkos-role-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              maxLength={2_000}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {translate('barkos.company.action.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit || saving}>
              {saving
                ? translate('barkos.company.action.saving', 'Saving…')
                : translate('barkos.company.action.saveRole', 'Save role')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
