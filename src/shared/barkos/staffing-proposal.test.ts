import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import { applyBarkosStaffingProposal, parseBarkosStaffingProposal } from './staffing-proposal'

const proposal = {
  version: 1 as const,
  summary: 'Kimlik doğrulama işi iki uzmanlık gerektiriyor.',
  roles: [
    {
      key: 'frontend',
      name: 'Arayüz Mühendisi',
      mission: 'Erişilebilir arayüzleri uygula.',
      capabilities: ['react', 'testing'],
      definitionOfDone: ['Arayüz ve testler tamamlandı.'],
      instructions: null
    }
  ],
  workers: [{ name: 'Lina', roleKey: 'frontend', agentId: 'claude' as const }],
  tasks: [
    {
      key: 'login-ui',
      title: 'Giriş arayüzünü yenile',
      spec: 'Giriş arayüzünü uygula ve test et.',
      roleKey: 'frontend',
      dependencyKeys: [],
      workspacePolicy: 'folder' as const,
      risk: 'medium' as const
    },
    {
      key: 'review-login',
      title: 'Giriş akışını incele',
      spec: 'Değişikliği ve kanıtları incele.',
      roleKey: 'lead',
      dependencyKeys: ['login-ui'],
      workspacePolicy: 'inherit' as const,
      risk: 'low' as const
    }
  ]
}

describe('BarkOS staffing proposal', () => {
  it('validates role and task references', () => {
    expect(parseBarkosStaffingProposal(proposal)).toEqual(proposal)
    expect(() =>
      parseBarkosStaffingProposal({
        ...proposal,
        tasks: [{ ...proposal.tasks[0], roleKey: 'unknown' }]
      })
    ).toThrow('Unknown task role key')
  })

  it('adds workers and produces a capability-matched implementation plan', () => {
    const company = createBarkosCompany({
      name: 'BarkOS',
      mission: 'Güvenilir ürünler geliştir.',
      leadName: 'Mira',
      now: 1
    })

    const result = applyBarkosStaffingProposal({
      company,
      proposal,
      objectiveTitle: 'Kimlik doğrulama uygulaması',
      objectiveBrief: 'Planı uygula.',
      now: 2
    })

    expect(result.addedWorkerIds).toHaveLength(1)
    expect(result.company.workers.at(-1)).toMatchObject({
      name: 'Lina',
      agentId: 'claude',
      model: null
    })
    expect(result.plan.tasks[0]).toMatchObject({
      draftId: 'login-ui',
      requiredCapabilities: ['react', 'testing'],
      approvalPolicy: 'none'
    })
    expect(result.plan.tasks[1]).toMatchObject({
      dependencyDraftIds: ['login-ui'],
      requiredCapabilities: ['planning', 'delegation', 'review']
    })
  })

  it('rejects providers outside the audited BarkOS worker pool', () => {
    expect(() =>
      parseBarkosStaffingProposal({
        ...proposal,
        workers: [{ name: 'Lina', roleKey: 'frontend', agentId: 'unknown-provider' }]
      })
    ).toThrow()
  })
})
