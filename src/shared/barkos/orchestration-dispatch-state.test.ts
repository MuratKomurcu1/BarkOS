import { describe, expect, it } from 'vitest'
import { barkosDispatchId } from './orchestration-dispatch-state'

describe('BarkOS dispatch kimlikleri', () => {
  it('kısa atama kimliğinin okunabilir biçimini korur', () => {
    expect(barkosDispatchId('assignment-analysis-1', 1)).toBe('dispatch-assignment-analysis-1-1')
  })

  it('aynı uzun öneke sahip farklı atamaları çakıştırmaz', () => {
    const prefix = 'assignment-proje-bu-projeyi-incele-isi-gorevlere-ayir-ve-uygulamayi-baslat'
    const first = barkosDispatchId(`${prefix}-1`, 1)
    const second = barkosDispatchId(`${prefix}-2`, 1)

    expect(first).not.toBe(second)
    expect(first.length).toBeLessThanOrEqual(64)
    expect(second.length).toBeLessThanOrEqual(64)
    expect(barkosDispatchId(`${prefix}-1`, 1)).toBe(first)
  })
})
