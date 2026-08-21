import {
  AlertTriangle,
  Camera,
  Check,
  FileCode2,
  FlaskConical,
  FolderOpen,
  SquareTerminal,
  X
} from 'lucide-react'
import type { BarkosEvidenceManifest } from '../../../../shared/barkos/work-ledger'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const VISIBLE_ITEM_LIMIT = 8

type Props = {
  manifest: BarkosEvidenceManifest
  taskTitle: string
  workerName: string
  busy: boolean
  onReview: (evidenceId: string, decision: 'accepted' | 'rejected') => Promise<void>
}

function hiddenCountLabel(total: number): string | null {
  const hidden = total - VISIBLE_ITEM_LIMIT
  return hidden > 0
    ? translate('barkos.board.evidence.moreItems', '+{{value0}} öğe daha', { value0: hidden })
    : null
}

function testStatusLabel(status: BarkosEvidenceManifest['tests'][number]['status']): string {
  return status === 'passed' ? 'Geçti' : status === 'failed' ? 'Başarısız' : 'Atlandı'
}

function fileChangeLabel(change: BarkosEvidenceManifest['changedFiles'][number]['change']): string {
  const labels: Record<BarkosEvidenceManifest['changedFiles'][number]['change'], string> = {
    added: 'eklendi',
    modified: 'değiştirildi',
    deleted: 'silindi',
    renamed: 'yeniden adlandırıldı'
  }
  return labels[change]
}

function evidenceFileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}

export function BarkosEvidenceReviewCard({
  manifest,
  taskTitle,
  workerName,
  busy,
  onReview
}: Props): React.JSX.Element {
  const hiddenTests = hiddenCountLabel(manifest.tests.length)
  const hiddenFiles = hiddenCountLabel(manifest.changedFiles.length)
  const hiddenScreenshots = hiddenCountLabel(manifest.screenshots.length)
  const testKeyOccurrences = new Map<string, number>()
  const visibleTests = manifest.tests.slice(0, VISIBLE_ITEM_LIMIT).map((test) => {
    const signature = `${test.command}\u0000${test.status}\u0000${test.summary}`
    const occurrence = (testKeyOccurrences.get(signature) ?? 0) + 1
    testKeyOccurrences.set(signature, occurrence)
    return { test, key: `${signature}\u0000${occurrence}` }
  })
  const screenshotKeyOccurrences = new Map<string, number>()
  const visibleScreenshots = manifest.screenshots.slice(0, VISIBLE_ITEM_LIMIT).map((screenshot) => {
    const signature = `${screenshot.path}\u0000${screenshot.caption}\u0000${screenshot.sha256 ?? ''}`
    const occurrence = (screenshotKeyOccurrences.get(signature) ?? 0) + 1
    screenshotKeyOccurrences.set(signature, occurrence)
    return { screenshot, key: `${signature}\u0000${occurrence}` }
  })

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{taskTitle}</h3>
            <Badge variant="secondary">
              {translate('barkos.board.evidence.awaitingReview', 'İnceleme bekliyor')}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate('barkos.board.evidence.submittedBy', '{{value0}} tarafından gönderildi', {
              value0: workerName
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onReview(manifest.id, 'rejected')}
          >
            <X className="size-3.5" />
            {translate('barkos.board.evidence.reject', 'Reddet')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void onReview(manifest.id, 'accepted')}
          >
            <Check className="size-3.5" />
            {translate('barkos.board.evidence.accept', 'Kabul et')}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md bg-muted/40 p-2">
          <FlaskConical className="mb-1 size-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">{manifest.tests.length}</span>{' '}
          <span className="text-muted-foreground">
            {translate('barkos.board.evidence.tests', 'test')}
          </span>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <FileCode2 className="mb-1 size-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">{manifest.changedFiles.length}</span>{' '}
          <span className="text-muted-foreground">
            {translate('barkos.board.evidence.files', 'dosya')}
          </span>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <SquareTerminal className="mb-1 size-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">
            {manifest.terminalExcerpts.length}
          </span>{' '}
          <span className="text-muted-foreground">
            {translate('barkos.board.evidence.logs', 'günlük')}
          </span>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <Camera className="mb-1 size-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">{manifest.screenshots.length}</span>{' '}
          <span className="text-muted-foreground">
            {translate('barkos.board.evidence.screenshots', 'ekran görüntüsü')}
          </span>
        </div>
      </div>

      {manifest.diffSummary ? (
        <section className="mt-4">
          <h4 className="text-xs font-medium text-foreground">
            {translate('barkos.board.evidence.diffSummary', 'Değişiklik özeti')}
          </h4>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {manifest.diffSummary}
          </p>
        </section>
      ) : null}

      {manifest.tests.length > 0 ? (
        <section className="mt-4">
          <h4 className="text-xs font-medium text-foreground">
            {translate('barkos.board.evidence.testResults', 'Test sonuçları')}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {visibleTests.map(({ test, key }) => (
              <li
                key={key}
                className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-2.5 py-2 text-xs"
              >
                <div className="min-w-0">
                  <code className="break-all text-foreground">{test.command}</code>
                  <p className="mt-0.5 text-muted-foreground">{test.summary}</p>
                </div>
                <Badge variant={test.status === 'failed' ? 'destructive' : 'outline'}>
                  {testStatusLabel(test.status)}
                </Badge>
              </li>
            ))}
          </ul>
          {hiddenTests ? <p className="mt-2 text-xs text-muted-foreground">{hiddenTests}</p> : null}
        </section>
      ) : null}

      {manifest.changedFiles.length > 0 ? (
        <details className="mt-4 rounded-md border border-border/60 p-3">
          <summary className="cursor-pointer text-xs font-medium text-foreground">
            {translate('barkos.board.evidence.changedFiles', 'Değiştirilen dosyalar')}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {manifest.changedFiles.slice(0, VISIBLE_ITEM_LIMIT).map((file) => (
              <li key={file.path} className="text-xs">
                <code className="break-all text-foreground">{file.path}</code>
                <span className="ml-2 text-muted-foreground">{fileChangeLabel(file.change)}</span>
                {file.summary ? (
                  <p className="mt-0.5 text-muted-foreground">{file.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {hiddenFiles ? <p className="mt-2 text-xs text-muted-foreground">{hiddenFiles}</p> : null}
        </details>
      ) : null}

      {manifest.screenshots.length > 0 ? (
        <section className="mt-4">
          <h4 className="text-xs font-medium text-foreground">
            {translate('barkos.board.evidence.screenshotEvidence', 'Ekran görüntüsü kanıtları')}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {visibleScreenshots.map(({ screenshot, key }) => {
              const fileName = evidenceFileName(screenshot.path)
              return (
                <li
                  key={key}
                  className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{screenshot.caption}</p>
                    <p className="mt-0.5 truncate text-muted-foreground" title={screenshot.path}>
                      {fileName}
                    </p>
                    {screenshot.sha256 ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {translate('barkos.evidence.screenshot.sha256', 'SHA-256')}{' '}
                        <code title={screenshot.sha256}>{screenshot.sha256.slice(0, 12)}…</code>
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void window.api.shell.openInFileManager(screenshot.path)}
                  >
                    <FolderOpen className="size-3.5" />
                    {translate('barkos.board.evidence.revealScreenshot', 'Dosyada göster')}
                  </Button>
                </li>
              )
            })}
          </ul>
          {hiddenScreenshots ? (
            <p className="mt-2 text-xs text-muted-foreground">{hiddenScreenshots}</p>
          ) : null}
        </section>
      ) : null}

      {manifest.risks.length > 0 || manifest.unresolvedDecisions.length > 0 ? (
        <section className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <h4 className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <AlertTriangle className="size-3.5 text-amber-600" />
            {translate('barkos.board.evidence.openConcerns', 'Açık konular')}
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {[...manifest.risks, ...manifest.unresolvedDecisions]
              .slice(0, VISIBLE_ITEM_LIMIT)
              .map((item) => (
                <li key={item}>{item}</li>
              ))}
          </ul>
        </section>
      ) : null}
    </article>
  )
}
