import { useId, useState, type FormEvent } from 'react'
import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react'
import type {
  BarkosDecisionRequest,
  BarkosDecisionResolutionKind
} from '../../../../shared/barkos/decision-inbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { BarkosDecisionInboxController } from './use-barkos-decision-inbox'

type Props = {
  request: BarkosDecisionRequest
  taskTitle: string
  workerName: string
  currentRunId: string | null
  onResolve: BarkosDecisionInboxController['resolve']
}

function formatDecisionTime(value: number): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function sourceLabel(request: BarkosDecisionRequest): string {
  if (request.sourceKind === 'gate') {
    return translate('barkos.decisions.source.gate', 'Onay kapısı')
  }
  if (request.sourceKind === 'decision_gate') {
    return translate('barkos.decisions.source.decisionGate', 'Ajan karar kapısı')
  }
  if (request.sourceKind === 'escalation') {
    return translate('barkos.decisions.source.escalation', 'Yükseltme')
  }
  if (request.sourceKind === 'side-effect') {
    return translate('barkos.decisions.source.sideEffect', 'Araç yan etkisi')
  }
  return translate('barkos.decisions.source.question', 'Ajan sorusu')
}

function RequestStatus({ request }: { request: BarkosDecisionRequest }): React.JSX.Element {
  if (request.status === 'resolving') {
    return (
      <Badge variant="outline">
        <LoaderCircle className="animate-spin" />
        {translate('barkos.decisions.status.resolving', 'Gönderiliyor')}
      </Badge>
    )
  }
  if (request.status === 'resolved') {
    return (
      <Badge variant="secondary">
        <CheckCircle2 />
        {translate('barkos.decisions.status.resolved', 'Çözüldü')}
      </Badge>
    )
  }
  if (request.status === 'resolution-uncertain') {
    return (
      <Badge variant="destructive">
        <TriangleAlert />
        {translate('barkos.decisions.status.uncertain', 'Sonuç belirsiz')}
      </Badge>
    )
  }
  if (request.status === 'expired') {
    return (
      <Badge variant="outline">
        {translate('barkos.decisions.status.expired', 'Süresi doldu')}
      </Badge>
    )
  }
  return <Badge variant="default">{translate('barkos.decisions.status.pending', 'Bekliyor')}</Badge>
}

export function BarkosDecisionRequestCard({
  request,
  taskTitle,
  workerName,
  currentRunId,
  onResolve
}: Props): React.JSX.Element {
  const [response, setResponse] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const responseId = useId()
  const canResolve =
    request.status === 'pending' &&
    (request.sourceKind === 'side-effect' || currentRunId === request.orchestrationRunId)

  const submitResolution = async (
    kind: BarkosDecisionResolutionKind,
    resolution: string
  ): Promise<void> => {
    if (!canResolve || submitting || !resolution.trim()) {
      return
    }
    setSubmitting(true)
    try {
      await onResolve(request, kind, resolution.trim())
      setResponse('')
    } catch {
      // The persistent inbox error and uncertain state explain recovery.
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    void submitResolution('answered', response)
  }

  return (
    <Card className="gap-4 py-5" data-decision-request-id={request.id}>
      <CardHeader className="gap-3 px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{sourceLabel(request)}</Badge>
          <Badge variant={request.risk === 'critical' ? 'destructive' : 'secondary'}>
            {translate('barkos.decisions.risk', 'Risk')}:{' '}
            {translate(`barkos.planner.risk.${request.risk}`, request.risk)}
          </Badge>
          <RequestStatus request={request} />
          {request.sideEffect?.consumedAt ? (
            <Badge variant="outline">
              {translate('barkos.decisions.status.consumed', 'Onay kullanıldı')}
            </Badge>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDecisionTime(request.createdAt)}
          </span>
        </div>
        <CardTitle className="text-sm leading-5">{request.question}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {taskTitle} · {workerName}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        {request.details ? (
          <p className="whitespace-pre-wrap text-sm text-foreground">{request.details}</p>
        ) : null}

        {request.status === 'resolution-uncertain' ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {translate(
              'barkos.decisions.uncertainHelp',
              'BarkOS bu yanıtı kabul etmiş olabilir. Başka yanıt göndermeden önce ajanı ve çalışmayı inceleyin.'
            )}
          </p>
        ) : null}

        {request.status === 'resolved' && request.resolution ? (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              {translate('barkos.decisions.resolution', 'Kaydedilen yanıt')}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{request.resolution}</p>
          </div>
        ) : null}

        {request.status === 'pending' ? (
          <form className="space-y-3" onSubmit={handleSubmit}>
            {request.options.length > 0 ? (
              <div
                className="flex flex-wrap gap-2"
                aria-label={translate('barkos.decisions.options', 'Yanıt seçenekleri')}
              >
                {request.options.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canResolve || submitting}
                    onClick={() => void submitResolution('answered', option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            ) : request.sourceKind === 'gate' ||
              request.sourceKind === 'decision_gate' ||
              request.sourceKind === 'side-effect' ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!canResolve || submitting}
                  onClick={() =>
                    void submitResolution(
                      'approved',
                      translate(
                        'barkos.decisions.approvedResolution',
                        'Kullanıcı tarafından onaylandı.'
                      )
                    )
                  }
                >
                  {translate('barkos.decisions.approve', 'Onayla')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canResolve || submitting}
                  onClick={() =>
                    void submitResolution(
                      'rejected',
                      translate(
                        'barkos.decisions.rejectedResolution',
                        'Kullanıcı tarafından reddedildi.'
                      )
                    )
                  }
                >
                  {translate('barkos.decisions.reject', 'Reddet')}
                </Button>
              </div>
            ) : null}
            {request.sourceKind !== 'side-effect' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor={responseId}>
                    {translate('barkos.decisions.response', 'Yanıt')}
                  </Label>
                  <Textarea
                    id={responseId}
                    value={response}
                    maxLength={8_000}
                    rows={3}
                    disabled={!canResolve || submitting}
                    placeholder={translate(
                      'barkos.decisions.responsePlaceholder',
                      'Ajana açık bir karar veya talimat verin.'
                    )}
                    onChange={(event) => setResponse(event.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  {!canResolve ? (
                    <span className="text-xs text-muted-foreground">
                      {translate(
                        'barkos.decisions.currentRunRequired',
                        'Yanıtlamak için bu hedefi baş ajanın etkin BarkOS çalışmasında açın.'
                      )}
                    </span>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!canResolve || submitting || !response.trim()}
                  >
                    {submitting ? <LoaderCircle className="animate-spin" /> : null}
                    {translate('barkos.decisions.send', 'Yanıtı gönder')}
                  </Button>
                </div>
              </>
            ) : null}
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}
