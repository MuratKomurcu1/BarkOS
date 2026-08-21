import { useState, type FormEvent } from 'react'
import { BrainCircuit, FileSearch, LoaderCircle, Send, Sparkles } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BarkosDesktopAccessStatus } from './BarkosDesktopAccessStatus'

type Props = {
  busy: boolean
  onStart: (request: string) => Promise<boolean>
}

export function BarkosProjectCommandBar({ busy, onStart }: Props): React.JSX.Element {
  const [request, setRequest] = useState('')
  const canStart = request.trim().length > 0 && !busy

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canStart) {
      return
    }
    const accepted = await onStart(request.trim())
    if (accepted) {
      setRequest('')
    }
  }

  return (
    <form className="barkos-project-command" onSubmit={handleSubmit}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
          <Sparkles className="size-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor="barkos-project-request" className="text-xs font-semibold">
            {translate('barkos.intake.title', 'Projeyi veya istediğiniz değişikliği anlatın')}
          </label>
          <Textarea
            id="barkos-project-request"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            rows={2}
            maxLength={8_000}
            placeholder={translate(
              'barkos.intake.placeholder',
              'Örn. Bu klasörü incele, ödeme akışını yeniden tasarla ve testleri tamamla.'
            )}
            className="mt-2 min-h-16 resize-none bg-background/80"
            disabled={busy}
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              <FileSearch className="size-3" />
              {translate('barkos.intake.stage.analysis', 'Dosya okuyucu')}
            </Badge>
            <Badge variant="outline">
              <BrainCircuit className="size-3" />
              {translate('barkos.intake.stage.lead', 'Baş ajan kararı')}
            </Badge>
            <Badge variant="outline">
              <Send className="size-3" />
              {translate('barkos.intake.stage.dispatch', 'Otomatik görev dağıtımı')}
            </Badge>
            <BarkosDesktopAccessStatus />
          </div>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={!canStart} className="shrink-0">
        {busy ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
        {busy
          ? translate('barkos.intake.starting', 'Ekip hazırlanıyor…')
          : translate('barkos.intake.start', 'Ekibi kur ve başlat')}
      </Button>
    </form>
  )
}
