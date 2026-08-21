import { Check, X } from 'lucide-react'
import { useState } from 'react'
import {
  barkosMemoryCandidateScope,
  type BarkosMemoryPromotionSettings
} from '../../../../shared/barkos/memory-promotion'
import type {
  BarkosMemoryCandidate,
  BarkosMemoryEntry,
  BarkosMemoryScope
} from '../../../../shared/barkos/memory-vault'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'

const MEMORY_SCOPE_KINDS: BarkosMemoryScope['kind'][] = [
  'company',
  'role',
  'worker',
  'project',
  'task'
]

type Props = {
  candidate: BarkosMemoryCandidate
  activeMemories: readonly BarkosMemoryEntry[]
  busy: boolean
  onPromote: (candidateId: string, settings: BarkosMemoryPromotionSettings) => void
  onReject: (candidateId: string) => void
}

function localDateTime(timestamp: number | null): string {
  if (timestamp === null) {
    return ''
  }
  const date = new Date(timestamp)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function sameScope(left: BarkosMemoryScope, right: BarkosMemoryScope): boolean {
  return left.kind === right.kind && left.targetId === right.targetId
}

export function BarkosMemoryCandidateCard({
  candidate,
  activeMemories,
  busy,
  onPromote,
  onReject
}: Props): React.JSX.Element {
  const [scopeKind, setScopeKind] = useState<BarkosMemoryScope['kind']>(candidate.scope.kind)
  const [confidence, setConfidence] = useState(String(candidate.confidence))
  const [expiry, setExpiry] = useState(localDateTime(candidate.expiresAt))
  const [contradictionIds, setContradictionIds] = useState<string[]>([])
  const scope = barkosMemoryCandidateScope(candidate, scopeKind)
  const parsedConfidence = Number(confidence)
  const expiresAt = expiry ? new Date(expiry).getTime() : null
  const validConfidence =
    confidence.trim() !== '' &&
    Number.isInteger(parsedConfidence) &&
    parsedConfidence >= 0 &&
    parsedConfidence <= 100
  const validExpiry = expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > Date.now())
  const contradictions = activeMemories.filter((memory) => sameScope(memory.scope, scope))

  function toggleContradiction(memoryId: string, checked: boolean): void {
    setContradictionIds((current) =>
      checked ? [...new Set([...current, memoryId])] : current.filter((id) => id !== memoryId)
    )
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!validConfidence || !validExpiry) {
      return
    }
    onPromote(candidate.id, {
      scope,
      confidence: parsedConfidence,
      expiresAt,
      contradictsMemoryIds: contradictionIds
    })
  }

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-sm">{candidate.title}</CardTitle>
          <Badge variant="secondary">{candidate.confidence}%</Badge>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">{candidate.source.evidenceId}</p>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <p className="whitespace-pre-wrap text-sm text-foreground">{candidate.content}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${candidate.id}-scope`}>
                {translate('barkos.memory.scope', 'Memory scope')}
              </Label>
              <Select
                value={scopeKind}
                disabled={busy}
                onValueChange={(value) => {
                  setScopeKind(value as BarkosMemoryScope['kind'])
                  setContradictionIds([])
                }}
              >
                <SelectTrigger id={`${candidate.id}-scope`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_SCOPE_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {scope.targetId ?? candidate.source.evidenceId}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${candidate.id}-confidence`}>
                {translate('barkos.memory.confidence', 'Confidence (0–100)')}
              </Label>
              <Input
                id={`${candidate.id}-confidence`}
                type="number"
                min={0}
                max={100}
                step={1}
                value={confidence}
                disabled={busy}
                aria-invalid={!validConfidence}
                onChange={(event) => setConfidence(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${candidate.id}-expiry`}>
              {translate('barkos.memory.expiry', 'Expiry (optional)')}
            </Label>
            <Input
              id={`${candidate.id}-expiry`}
              type="datetime-local"
              value={expiry}
              disabled={busy}
              aria-invalid={!validExpiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
            {!validExpiry ? (
              <p className="text-xs text-destructive">
                {translate('barkos.memory.expiryFuture', 'Expiry must be in the future.')}
              </p>
            ) : null}
          </div>

          {contradictions.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {translate('barkos.memory.contradictions', 'Supersede conflicting memory')}
              </legend>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'barkos.memory.contradictionsHelp',
                  'Only active memory in the selected scope can be superseded.'
                )}
              </p>
              {contradictions.map((memory) => (
                <Label key={memory.id} className="items-start rounded-md border p-3 font-normal">
                  <Checkbox
                    checked={contradictionIds.includes(memory.id)}
                    disabled={busy}
                    onCheckedChange={(checked) => toggleContradiction(memory.id, checked === true)}
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">{memory.title}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {memory.id}
                    </span>
                  </span>
                </Label>
              ))}
            </fieldset>
          ) : null}

          <div className="space-y-1 text-[11px] text-muted-foreground">
            <p>
              {translate('barkos.memory.source', 'Evidence source:')}{' '}
              <span className="font-mono">{candidate.source.evidenceId}</span>
            </p>
            <p>
              {translate('barkos.memory.worker', 'Worker:')}{' '}
              <span className="font-mono">{candidate.source.workerId}</span>
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onReject(candidate.id)}
            >
              <X className="size-3.5" />
              {translate('barkos.memory.reject', 'Reject')}
            </Button>
            <Button type="submit" size="sm" disabled={busy || !validConfidence || !validExpiry}>
              <Check className="size-3.5" />
              {translate('barkos.memory.promote', 'Promote to memory')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
