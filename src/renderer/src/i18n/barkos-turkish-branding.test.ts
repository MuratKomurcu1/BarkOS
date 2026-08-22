import { describe, expect, it } from 'vitest'
import tr from './locales/tr.json'

function lookup(key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      tr
    )
  return typeof value === 'string' ? value : undefined
}

describe('BarkOS Türkçe marka sözlüğü', () => {
  it('görünür eski Orca markasını içermez', () => {
    expect(JSON.stringify(tr)).not.toMatch(/\bOrca\b/)
  })

  it('ana kabuk ve çalışma alanı metinlerini Türkçe tutar', () => {
    expect(lookup('auto.components.sidebar.SidebarRepositoryFilterSection.7679f0c268')).toBe(
      'Projeler'
    )
    expect(lookup('auto.components.sidebar.WorktreeTitleInlineRename.2f42ae024f')).toBe(
      'Okunmamış:'
    )
    expect(lookup('barkos.company.page.decisions')).toBe('Kararlar')
    expect(lookup('barkos.office.banner.title')).toBe('BarkOS canlı ofis')
  })
})
