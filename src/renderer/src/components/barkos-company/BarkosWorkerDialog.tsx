import { useState, type FormEvent } from 'react'
import type { BarkosRole, BarkosWorker, BarkosWorkerInput } from '../../../../shared/barkos/company'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

type Props = {
  roles: BarkosRole[]
  worker?: BarkosWorker
  isLead: boolean
  saving: boolean
  onClose: () => void
  onSave: (input: BarkosWorkerInput, makeLead: boolean) => Promise<void>
}

export function BarkosWorkerDialog({
  roles,
  worker,
  isLead,
  saving,
  onClose,
  onSave
}: Props): React.JSX.Element {
  const [name, setName] = useState(worker?.name ?? '')
  const [roleId, setRoleId] = useState(worker?.roleId ?? roles[0]?.id ?? '')
  const [agentId, setAgentId] = useState(worker?.agentId ?? 'codex')
  const [model, setModel] = useState(worker?.model ?? '')
  const [workspacePolicy, setWorkspacePolicy] = useState<BarkosWorker['workspacePolicy']>(
    worker?.workspacePolicy ?? 'inherit'
  )
  const [status, setStatus] = useState<BarkosWorker['status']>(worker?.status ?? 'available')
  const [makeLead, setMakeLead] = useState(isLead)
  const canSubmit = name.trim() !== '' && roleId !== '' && agentId.trim() !== ''

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canSubmit || saving) {
      return
    }
    await onSave(
      {
        name: name.trim(),
        roleId,
        agentId: agentId.trim(),
        model: model.trim() || null,
        preferredEnvironmentId: worker?.preferredEnvironmentId ?? null,
        workspacePolicy,
        status
      },
      makeLead
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto scrollbar-sleek sm:max-w-xl">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {worker
                ? translate('barkos.company.worker.editTitle', 'Edit worker')
                : translate('barkos.company.worker.addTitle', 'Add worker')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'barkos.company.worker.description',
                'Assign an agent, role, model preference, and workspace policy.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="barkos-worker-name">
                {translate('barkos.company.worker.name', 'Name')}
              </Label>
              <Input
                id="barkos-worker-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="barkos-worker-agent">
                {translate('barkos.company.worker.agent', 'Agent ID')}
              </Label>
              <Input
                id="barkos-worker-agent"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                maxLength={80}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="barkos-worker-role">
              {translate('barkos.company.worker.role', 'Role')}
            </Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="barkos-worker-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="barkos-worker-model">
              {translate('barkos.company.worker.model', 'Model override (optional)')}
            </Label>
            <Input
              id="barkos-worker-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              maxLength={160}
              placeholder={translate('barkos.company.worker.defaultModel', 'Use agent default')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="barkos-worker-workspace">
                {translate('barkos.company.worker.workspace', 'Workspace policy')}
              </Label>
              <Select
                value={workspacePolicy}
                onValueChange={(value) =>
                  setWorkspacePolicy(value as BarkosWorker['workspacePolicy'])
                }
              >
                <SelectTrigger id="barkos-worker-workspace" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">
                    {translate('barkos.company.worker.workspaceInherit', 'Inherit')}
                  </SelectItem>
                  <SelectItem value="isolated-worktree">
                    {translate('barkos.company.worker.workspaceIsolated', 'Isolated worktree')}
                  </SelectItem>
                  <SelectItem value="folder-compatible">
                    {translate(
                      'barkos.company.worker.workspaceFolderCompatible',
                      'Folder compatible'
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="barkos-worker-status">
                {translate('barkos.company.worker.status', 'Status')}
              </Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as BarkosWorker['status'])}
              >
                <SelectTrigger id="barkos-worker-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">
                    {translate('barkos.company.worker.available', 'Available')}
                  </SelectItem>
                  <SelectItem value="busy">
                    {translate('barkos.company.worker.busy', 'Busy')}
                  </SelectItem>
                  <SelectItem value="paused">
                    {translate('barkos.company.worker.paused', 'Paused')}
                  </SelectItem>
                  <SelectItem value="offline">
                    {translate('barkos.company.worker.offline', 'Offline')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={makeLead}
              onChange={(event) => setMakeLead(event.target.checked)}
              disabled={isLead}
              className="size-4 accent-primary"
            />
            {isLead
              ? translate('barkos.company.worker.currentLead', 'This worker is the company lead')
              : translate('barkos.company.worker.makeLead', 'Make this worker the company lead')}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {translate('barkos.company.action.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit || saving}>
              {saving
                ? translate('barkos.company.action.saving', 'Saving…')
                : translate('barkos.company.action.saveWorker', 'Save worker')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
