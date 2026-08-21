import { LoaderCircle, RotateCw } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'

type BarkosCompanyPageFeedbackProps = {
  actionMessage: string | null
  error: string | null
  hasCompany: boolean
  workerSessionError: string | null
  onRetryWorkerSessions: () => void
  loading: boolean
  loadFailedWithoutCompany: boolean
  onLoadRetry: () => void
}

export function BarkosCompanyPageFeedback({
  actionMessage,
  error,
  hasCompany,
  workerSessionError,
  onRetryWorkerSessions,
  loading,
  loadFailedWithoutCompany,
  onLoadRetry
}: BarkosCompanyPageFeedbackProps): React.JSX.Element {
  return (
    <>
      {actionMessage ? (
        <p className="mx-auto mb-4 max-w-6xl text-xs text-muted-foreground" aria-live="polite">
          {actionMessage}
        </p>
      ) : null}
      {error && hasCompany ? (
        <p
          role="alert"
          className="mx-auto mb-4 max-w-6xl rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {workerSessionError && hasCompany ? (
        <div
          role="alert"
          className="mx-auto mb-4 flex max-w-6xl flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{workerSessionError}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetryWorkerSessions}>
            <RotateCw className="size-3.5" />
            {translate('barkos.company.workerSessions.retry', 'Reload worker sessions')}
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-full min-h-48 items-center justify-center" role="status">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          <span className="sr-only">
            {translate('barkos.company.page.loading', 'Loading company')}
          </span>
        </div>
      ) : null}

      {loadFailedWithoutCompany ? (
        <div className="mx-auto flex max-w-lg flex-col items-center rounded-lg border border-border bg-card p-8 text-center">
          <h2 className="text-sm font-semibold text-foreground">
            {translate('barkos.company.page.loadFailed', 'Company data could not be loaded')}
          </h2>
          <p role="alert" className="mt-2 text-sm text-muted-foreground">
            {error}
          </p>
          <Button variant="outline" size="sm" className="mt-5" onClick={onLoadRetry}>
            <RotateCw className="size-3.5" />
            {translate('barkos.company.page.retry', 'Try again')}
          </Button>
        </div>
      ) : null}
    </>
  )
}
