import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosLiveOfficeWorker } from '@/lib/barkos-live-office'
import { BarkosLiveOfficeWorkerRow } from './BarkosLiveOfficeWorkerRow'

const worker = {
  id: 'worker-one',
  name: 'Ada',
  roleId: 'engineer',
  agentId: 'codex',
  model: null,
  preferredEnvironmentId: null,
  workspacePolicy: 'inherit',
  status: 'available'
} satisfies BarkosCompany['workers'][number]

const entry: BarkosLiveOfficeWorker = {
  workerId: worker.id,
  status: 'working',
  work: [
    {
      assignmentId: 'assignment-one',
      taskId: 'task-one',
      taskTitle: 'Verify release',
      taskStatus: 'running',
      dispatchId: 'dispatch-one',
      dispatchState: 'running'
    }
  ],
  workspaceId: 'workspace-one',
  executionHostId: 'local',
  toolName: 'Bash',
  toolInput: 'pnpm test',
  activityUpdatedAt: 10,
  station: 'verification'
}

describe('BarkosLiveOfficeWorkerRow', () => {
  it('renders compact worker and work records as labelled semantic lists', () => {
    const markup = renderToStaticMarkup(
      <BarkosLiveOfficeWorkerRow entry={entry} worker={worker} roleName="Engineer" compact />
    )

    expect(markup).toContain('<li>')
    expect(markup).toContain('<article')
    expect(markup).toContain('aria-label="Ada active work"')
    expect(markup).toContain('aria-label="Status: Working"')
    expect(markup).toContain('Current tool:')
    expect(markup).toContain('p-2.5')
  })
})
