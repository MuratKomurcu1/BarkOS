// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BarkosCompanyCreateForm } from './BarkosCompanyCreateForm'

let root: Root | null = null
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('BarkosCompanyCreateForm', () => {
  it('submits trimmed company foundation fields', async () => {
    const onCreate = vi.fn(() => Promise.resolve())
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<BarkosCompanyCreateForm saving={false} error={null} onCreate={onCreate} />)
    })

    const setValue = async (selector: string, value: string): Promise<void> => {
      const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
      if (!input) {
        throw new Error(`Missing form field: ${selector}`)
      }
      fireEvent.change(input, { target: { value } })
    }

    await setValue('#barkos-company-name', '  BarkOS Labs  ')
    await setValue('#barkos-company-mission', '  Build reliable teams.  ')
    await setValue('#barkos-company-lead', '  Ada  ')
    const form = container.querySelector('form')
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(onCreate).toHaveBeenCalledWith({
      name: 'BarkOS Labs',
      mission: 'Build reliable teams.',
      leadName: 'Ada'
    })
  })
})
