import { useState, type FormEvent } from 'react'
import type { CreateBarkosCompanyInput } from '../../../../shared/barkos/company'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type BarkosCompanyCreateFormProps = {
  saving: boolean
  error: string | null
  onCreate: (input: CreateBarkosCompanyInput) => Promise<void>
}

export function BarkosCompanyCreateForm({
  saving,
  error,
  onCreate
}: BarkosCompanyCreateFormProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [mission, setMission] = useState('')
  const [leadName, setLeadName] = useState('')
  const canSubmit = name.trim() !== '' && mission.trim() !== '' && leadName.trim() !== ''

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canSubmit || saving) {
      return
    }
    try {
      await onCreate({
        name: name.trim(),
        mission: mission.trim(),
        leadName: leadName.trim()
      })
    } catch {
      // The parent store publishes the durable save error beside this form.
    }
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="text-base">
          {translate('barkos.company.create.title', 'Create your company')}
        </CardTitle>
        <CardDescription>
          {translate(
            'barkos.company.create.description',
            'Start with one mission and one lead worker. Roles and more workers come next.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="barkos-company-name">
              {translate('barkos.company.create.name', 'Company name')}
            </Label>
            <Input
              id="barkos-company-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={translate('barkos.company.create.namePlaceholder', 'BarkOS Labs')}
              maxLength={80}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="barkos-company-mission">
              {translate('barkos.company.create.mission', 'Mission')}
            </Label>
            <Textarea
              id="barkos-company-mission"
              value={mission}
              onChange={(event) => setMission(event.target.value)}
              placeholder={translate(
                'barkos.company.create.missionPlaceholder',
                'What should this company accomplish?'
              )}
              maxLength={2_000}
              rows={4}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="barkos-company-lead">
              {translate('barkos.company.create.lead', 'Lead worker name')}
            </Label>
            <Input
              id="barkos-company-lead"
              value={leadName}
              onChange={(event) => setLeadName(event.target.value)}
              placeholder={translate('barkos.company.create.leadPlaceholder', 'Ada')}
              maxLength={80}
              required
            />
            <p className="text-xs text-muted-foreground">
              {translate(
                'barkos.company.create.leadHelp',
                'The lead starts available with the Codex agent and inherits the active workspace.'
              )}
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit || saving}>
              {saving
                ? translate('barkos.company.create.saving', 'Creating…')
                : translate('barkos.company.create.submit', 'Create company')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
