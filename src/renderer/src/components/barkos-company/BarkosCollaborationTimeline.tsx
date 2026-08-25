import { AlertTriangle, ArrowRight, Mail, Send, SquareCheckBig } from 'lucide-react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { projectBarkosCollaborationTimeline } from '../../../../shared/barkos/collaboration-timeline'
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'

type Props = {
  company: BarkosCompany
  ledger: BarkosWorkLedger | null
  motionOff: boolean
}

const timeFormatter = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' })

export function BarkosCollaborationTimeline({
  company,
  ledger,
  motionOff
}: Props): React.JSX.Element {
  const entries = projectBarkosCollaborationTimeline({ company, ledger })
  const workerNames = new Map(company.workers.map((worker) => [worker.id, worker.name]))

  return (
    <section
      className="rounded-xl border border-border bg-card"
      aria-labelledby="barkos-agent-flow-title"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 id="barkos-agent-flow-title" className="flex items-center gap-2 text-sm font-medium">
            <Mail className="size-4 text-muted-foreground" />
            {translate('barkos.office.collaboration.title', 'Ajan iletişim akışı')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate(
              'barkos.office.collaboration.description',
              'Kalıcı görev gönderimleri ve çalışan raporları burada görünür.'
            )}
          </p>
        </div>
        <Badge variant="outline">
          {translate('barkos.office.collaboration.count', '{{value0}} kayıt', {
            value0: entries.length
          })}
        </Badge>
      </header>
      {entries.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          {translate(
            'barkos.office.collaboration.empty',
            'İlk görev bir çalışana gönderildiğinde iletişim akışı burada başlayacak.'
          )}
        </div>
      ) : (
        <ol className="scrollbar-sleek max-h-72 divide-y divide-border overflow-y-auto">
          {entries.map((entry, index) => {
            const Icon =
              entry.kind === 'handoff'
                ? Send
                : entry.kind === 'report'
                  ? SquareCheckBig
                  : AlertTriangle
            return (
              <li key={entry.id} className="flex gap-3 px-4 py-3">
                <span
                  className={
                    index === 0 && !motionOff
                      ? 'mt-0.5 rounded-full border border-border p-1.5 motion-safe:animate-pulse'
                      : 'mt-0.5 rounded-full border border-border p-1.5'
                  }
                  aria-hidden="true"
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-medium">
                      {workerNames.get(entry.fromWorkerId) ?? entry.fromWorkerId}
                    </span>
                    <ArrowRight className="size-3 text-muted-foreground" />
                    <span className="font-medium">
                      {workerNames.get(entry.toWorkerId) ?? entry.toWorkerId}
                    </span>
                    <time className="ml-auto text-[11px] text-muted-foreground">
                      {timeFormatter.format(entry.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 truncate text-xs text-foreground" title={entry.subject}>
                    {entry.subject}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                    {entry.body}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
