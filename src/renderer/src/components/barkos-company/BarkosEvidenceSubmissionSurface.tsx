import { BarkosEvidenceSubmissionDialog } from './BarkosEvidenceSubmissionDialog'
import type { BarkosEvidenceSubmissionController } from './use-barkos-evidence-submission'

export function BarkosEvidenceSubmissionSurface({
  controller
}: {
  controller: BarkosEvidenceSubmissionController
}): React.JSX.Element | null {
  if (!controller.draft) {
    return null
  }

  return (
    <BarkosEvidenceSubmissionDialog
      draft={controller.draft}
      saving={controller.saving}
      error={controller.error}
      onClose={controller.close}
      onRunTest={controller.runTest}
      onSubmit={controller.submit}
    />
  )
}
