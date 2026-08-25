import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import {
  BARKOS_PROJECT_ANALYST_ROLE_ID,
  createBarkosProjectIntakePlan,
  ensureBarkosProjectAnalyst
} from './project-intake'

describe('BarkOS project intake', () => {
  it('adds one durable project analyst beside the lead and stays idempotent', () => {
    const company = createBarkosCompany({
      name: 'BarkOS',
      mission: 'Projeleri güvenilir şekilde teslim et.',
      leadName: 'Mira',
      now: 1
    })

    const first = ensureBarkosProjectAnalyst(company, 2)
    const second = ensureBarkosProjectAnalyst(first.company, 3)

    expect(first.changed).toBe(true)
    expect(first.analyst).toMatchObject({
      name: 'Atlas',
      roleId: BARKOS_PROJECT_ANALYST_ROLE_ID,
      agentId: 'codex',
      workspacePolicy: 'folder-compatible'
    })
    expect(second.changed).toBe(false)
    expect(second.company.workers).toHaveLength(2)
  })

  it('creates a dependency-gated analyst-to-lead plan', () => {
    const company = ensureBarkosProjectAnalyst(
      createBarkosCompany({
        name: 'BarkOS',
        mission: 'Projeleri güvenilir şekilde teslim et.',
        leadName: 'Mira',
        now: 1
      }),
      2
    ).company

    const plan = createBarkosProjectIntakePlan(company, 'Kimlik doğrulama akışını yenile.', [
      'codex',
      'claude',
      'opencode'
    ])

    expect(plan.title).toBe('Proje: Kimlik doğrulama akışını yenile.')
    expect(plan.tasks[0]).toMatchObject({
      draftId: 'project-analysis',
      dependencyDraftIds: [],
      requiredCapabilities: ['project-analysis', 'codebase-navigation', 'reporting'],
      workspacePolicy: 'folder'
    })
    expect(plan.tasks[1]).toMatchObject({
      draftId: 'lead-staffing-plan',
      dependencyDraftIds: ['project-analysis'],
      requiredCapabilities: ['planning', 'delegation', 'review']
    })
    expect(plan.tasks[1].spec).toContain(
      'Bu çalışma alanında başlatılabildiği doğrulanan ajanlar: codex, claude, opencode.'
    )
  })
})
