import { Camera, LoaderCircle, Trash2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BarkosScreenshotEvidenceController } from './use-barkos-screenshot-evidence'

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function BarkosScreenshotEvidenceEditor({
  controller,
  disabled
}: {
  controller: BarkosScreenshotEvidenceController
  disabled: boolean
}): React.JSX.Element {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {translate('barkos.evidence.screenshot.title', 'Screenshots')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate(
              'barkos.evidence.screenshot.help',
              'Choose existing images explicitly. BarkOS copies and hashes them; it never captures your screen.'
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || controller.picking || controller.atLimit}
          onClick={() => void controller.pick()}
        >
          {controller.picking ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Camera className="size-3.5" />
          )}
          {translate('barkos.evidence.screenshot.add', 'Add screenshot')}
        </Button>
      </div>

      {controller.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
        >
          {controller.error}
        </p>
      ) : null}

      {controller.screenshots.map((screenshot, index) => {
        const captionId = `barkos-evidence-screenshot-${index}-caption`
        return (
          <div key={screenshot.sha256} className="rounded-md border border-border/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground" title={screenshot.path}>
                  {screenshot.fileName}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatBytes(screenshot.bytes)} {' · '}
                  {translate('barkos.evidence.screenshot.sha256', 'SHA-256')}{' '}
                  <code>{screenshot.sha256.slice(0, 12)}…</code>
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={translate('barkos.evidence.screenshot.remove', 'Remove {{value0}}', {
                  value0: screenshot.fileName
                })}
                disabled={disabled}
                onClick={() => controller.remove(screenshot.sha256)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              <Label htmlFor={captionId}>
                {translate('barkos.evidence.screenshot.caption', 'Caption')}
              </Label>
              <Input
                id={captionId}
                value={screenshot.caption}
                maxLength={1_000}
                disabled={disabled}
                onChange={(event) =>
                  controller.updateCaption(screenshot.sha256, event.target.value)
                }
              />
            </div>
          </div>
        )
      })}
    </section>
  )
}
