// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BarkosObjectivePlannerDialog } from './BarkosObjectivePlannerDialog'

let root: Root | null = null
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

async function fillField(label: string, value: string, index = 0): Promise<void> {
  const fields = screen.getAllByLabelText<HTMLInputElement | HTMLTextAreaElement>(label)
  await act(async () => fireEvent.change(fields[index], { target: { value } }))
}

describe('BarkosObjectivePlannerDialog', () => {
  it('submits a dependency-aware approved plan without an execution action', async () => {
    const onSave = vi.fn(() => Promise.resolve())
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <BarkosObjectivePlannerDialog
          leadName="Ada"
          saving={false}
          error={null}
          onClose={vi.fn()}
          onSave={onSave}
        />
      )
    })

    expect(screen.getByText(/does not launch workers or consume provider quota/)).toBeTruthy()
    await fillField('Objective title', '  Ship release  ')
    await fillField('Objective brief', '  Prepare and verify the release.  ')
    await fillField('Task name', 'Design release')
    await fillField('Task specification', 'Define the release contract.')
    await fillField('Required capabilities', 'planning, review')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add task' })))
    await fillField('Task name', 'Build release', 1)
    await fillField('Task specification', 'Implement and test the contract.', 1)
    await fillField('Required capabilities', 'coding\ntesting', 1)
    await act(async () => fireEvent.click(screen.getByLabelText('Design release')))
    const approvals = screen.getAllByLabelText('Require my approval before this task is dispatched')
    await act(async () => fireEvent.click(approvals[1]))
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Create approved plan' }))
    )

    expect(onSave).toHaveBeenCalledWith({
      title: 'Ship release',
      brief: 'Prepare and verify the release.',
      tasks: [
        expect.objectContaining({
          draftId: 'task-1',
          title: 'Design release',
          requiredCapabilities: ['planning', 'review'],
          dependencyDraftIds: []
        }),
        expect.objectContaining({
          draftId: 'task-2',
          title: 'Build release',
          requiredCapabilities: ['coding', 'testing'],
          dependencyDraftIds: ['task-1'],
          approvalPolicy: 'before-dispatch'
        })
      ]
    })
  })
})
