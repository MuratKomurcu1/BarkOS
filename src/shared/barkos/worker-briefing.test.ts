import { describe, expect, it } from 'vitest'
import { createBarkosCompany, addBarkosRole, addBarkosWorker } from './company'
import { BARKOS_WORKER_BRIEFING_MAX_CHARS, buildBarkosWorkerBriefing } from './worker-briefing'

function companyWithWorker() {
  const company = createBarkosCompany({
    name: 'BarkOS Labs',
    mission: 'Ship dependable systems.',
    leadName: 'Ada',
    now: 1
  })
  const withRole = addBarkosRole(
    company,
    {
      name: 'Researcher',
      mission: 'Turn evidence into decisions.',
      capabilities: ['research', 'synthesis'],
      definitionOfDone: ['Sources are recorded.', 'Findings are reviewed.'],
      instructions: 'Prefer primary sources.'
    },
    2
  )
  return addBarkosWorker(
    withRole,
    {
      name: 'Grace',
      roleId: 'researcher',
      agentId: 'codex',
      model: null,
      preferredEnvironmentId: null,
      workspacePolicy: 'inherit',
      status: 'available'
    },
    3
  )
}

describe('BarkOS worker briefing', () => {
  it('binds persistent worker and role identity into a launch briefing', () => {
    const company = companyWithWorker()
    const worker = company.workers.at(-1)!
    const role = company.roles.at(-1)!

    expect(buildBarkosWorkerBriefing(company, worker, role)).toContain(
      'Sen BarkOS Labs şirketinde kalıcı çalışan Grace adlı ajansın.'
    )
    expect(buildBarkosWorkerBriefing(company, worker, role)).toContain(
      'Rol talimatları:\nPrefer primary sources.'
    )
    expect(buildBarkosWorkerBriefing(company, worker, role)).toContain(
      'gönderilen BarkOS görevini doğrudan uygula'
    )
    expect(buildBarkosWorkerBriefing(company, worker, role)).toContain(
      'ikinci bir onay beklemeden hemen göreve başla'
    )
  })

  it('bounds the generated prompt even when valid role fields are near their limits', () => {
    const company = companyWithWorker()
    const worker = company.workers.at(-1)!
    const role = {
      ...company.roles.at(-1)!,
      definitionOfDone: Array.from({ length: 20 }, (_, index) => `${index}-${'x'.repeat(1_990)}`)
    }

    const briefing = buildBarkosWorkerBriefing(company, worker, role)

    expect(briefing).toHaveLength(BARKOS_WORKER_BRIEFING_MAX_CHARS)
    expect(briefing.endsWith('[Bilgilendirme BarkOS tarafından kısaltıldı.]')).toBe(true)
  })
})
