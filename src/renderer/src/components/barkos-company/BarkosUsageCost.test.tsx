import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyBarkosUsageCostLedger } from '../../../../shared/barkos/usage-cost-ledger'
import { BarkosUsageCost } from './BarkosUsageCost'

describe('BarkosUsageCost', () => {
  it('keeps provider tokens, estimates, and execution limits visibly separate', () => {
    const markup = renderToStaticMarkup(
      <BarkosUsageCost
        ledger={createEmptyBarkosUsageCostLedger('barkos-labs', 1)}
        workLedger={null}
        controller={{
          ledger: null,
          loadState: 'ready',
          error: null,
          sync: vi.fn(),
          reload: vi.fn()
        }}
      />
    )

    expect(markup).toContain('Provider tokens')
    expect(markup).toContain('API-equivalent estimate')
    expect(markup).toContain('not provider invoices')
    expect(markup).toContain('never change execution-unit limits')
  })
})
