import {
  addBarkosRole,
  addBarkosWorker,
  updateBarkosRole,
  type BarkosCompany,
  type BarkosWorker
} from './company'
import type { BarkosObjectivePlanInput } from './objective-planner'

export const BARKOS_PROJECT_ANALYST_ROLE_ID = 'proje-analisti'
export const BARKOS_PROJECT_ANALYST_CAPABILITIES = [
  'project-analysis',
  'codebase-navigation',
  'reporting'
] as const

export type BarkosProjectTeamResult = {
  company: BarkosCompany
  analyst: BarkosWorker
  changed: boolean
}

function hasAllCapabilities(values: readonly string[]): boolean {
  const normalized = new Set(values.map((value) => value.trim().toLocaleLowerCase('en-US')))
  return BARKOS_PROJECT_ANALYST_CAPABILITIES.every((capability) => normalized.has(capability))
}

export function ensureBarkosProjectAnalyst(
  company: BarkosCompany,
  now = Date.now()
): BarkosProjectTeamResult {
  let next = company
  const existingRole = next.roles.find((role) => role.id === BARKOS_PROJECT_ANALYST_ROLE_ID)
  if (!existingRole) {
    next = addBarkosRole(
      next,
      {
        name: 'Proje Analisti',
        mission: 'Projeyi değiştirmeden incele, mimariyi çıkar ve uygulanabilir iş paketleri öner.',
        capabilities: [...BARKOS_PROJECT_ANALYST_CAPABILITIES],
        definitionOfDone: [
          'Mimari, çalışma komutları, riskler ve önerilen görev bölümü kanıtlarla raporlandı.'
        ],
        instructions:
          'İlk incelemede kaynak dosyaları değiştirme. Bulguları baş ajana BarkOS orkestrasyon kanalıyla ilet.'
      },
      now
    )
  } else if (!hasAllCapabilities(existingRole.capabilities)) {
    next = updateBarkosRole(
      next,
      existingRole.id,
      {
        ...existingRole,
        capabilities: [
          ...new Set([...existingRole.capabilities, ...BARKOS_PROJECT_ANALYST_CAPABILITIES])
        ]
      },
      now
    )
  }

  const existingAnalyst = next.workers.find(
    (worker) => worker.roleId === BARKOS_PROJECT_ANALYST_ROLE_ID
  )
  if (existingAnalyst) {
    return { company: next, analyst: existingAnalyst, changed: next !== company }
  }

  const lead = next.workers.find((worker) => worker.id === next.leadWorkerId) ?? next.workers[0]
  next = addBarkosWorker(
    next,
    {
      name: 'Atlas',
      roleId: BARKOS_PROJECT_ANALYST_ROLE_ID,
      agentId: lead.agentId,
      model: lead.model,
      preferredEnvironmentId: lead.preferredEnvironmentId,
      workspacePolicy: 'folder-compatible',
      status: 'available'
    },
    now
  )
  const analyst = next.workers.at(-1)
  if (!analyst) {
    throw new Error('barkos_project_analyst_creation_failed')
  }
  return { company: next, analyst, changed: true }
}

function objectiveTitle(request: string): string {
  const firstLine = request.split(/\r?\n/, 1)[0]?.trim().replace(/\s+/g, ' ')
  const title = firstLine ? `Proje: ${firstLine}` : 'Yeni proje isteği'
  return title.slice(0, 80).trim()
}

export function createBarkosProjectIntakePlan(
  company: BarkosCompany,
  request: string
): Omit<BarkosObjectivePlanInput, 'createdByWorkerId'> {
  const normalizedRequest = request.trim()
  if (!normalizedRequest) {
    throw new TypeError('Proje isteği boş olamaz')
  }
  const lead = company.workers.find((worker) => worker.id === company.leadWorkerId)
  if (!lead) {
    throw new Error('barkos_company_lead_not_found')
  }
  return {
    title: objectiveTitle(normalizedRequest),
    brief: normalizedRequest,
    tasks: [
      {
        draftId: 'project-analysis',
        title: 'Projeyi incele ve çalışma haritasını çıkar',
        spec: [
          `Kullanıcı isteği:\n${normalizedRequest}`,
          'Projeyi değiştirmeden incele. Mimariyi, giriş noktalarını, bağımlılıkları, test ve paketleme komutlarını, riskleri ve mevcut kısıtları belirle.',
          'İsteği uygulanabilir iş paketlerine ayır; her paket için gereken uzmanlıkları ve olası dosya kapsamını yaz.',
          `Raporu BarkOS üzerinden baş ajan ${lead.name} ile paylaş. Uzun raporu proje içindeki .barkos/reports dizinine kaydet ve worker_done mesajında reportPath alanını gönder.`
        ].join('\n\n'),
        requiredCapabilities: [...BARKOS_PROJECT_ANALYST_CAPABILITIES],
        dependencyDraftIds: [],
        workspacePolicy: 'folder',
        preferredEnvironmentId: null,
        risk: 'low',
        approvalPolicy: 'none'
      },
      {
        draftId: 'lead-staffing-plan',
        title: 'Ekibi ve uygulama planını kararlaştır',
        spec: [
          `Kullanıcı isteği:\n${normalizedRequest}`,
          'Proje analistinin raporunu ve tamamlanma mesajını incele.',
          'Gerekli iş paketlerini, bağımlılıkları, riskleri ve her paket için gereken çalışan yeteneklerini kararlaştır.',
          'Mevcut çalışanlar yeterliyse onları kullan; yetersizse hangi rollerin eklenmesi veya çıkarılması gerektiğini gerekçeli bir ekip önerisi olarak raporla.',
          'Her yeni çalışan için görevin niteliğine göre agentId seç: genel uygulama, koordinasyon ve son karar için codex; derin inceleme, büyük refactor ve dokümantasyon için claude; bağımsız paralel uygulama veya sağlayıcı yedeği için opencode. Yalnız codex, claude veya opencode kullan. Kullanıcı izinleri ve risk kapıları her sağlayıcı seçiminden üstündür.',
          'Uygulamaya başlamadan önce çakışmayan çalışma alanları ve doğrulama ölçütleri olan yürütülebilir planı hazırla.',
          'Kararını .barkos/staffing-proposal.json dosyasına version, summary, roles, workers ve tasks alanlarıyla yaz. Her rol key/name/mission/capabilities/definitionOfDone/instructions; her çalışan name/roleKey/agentId; her görev key/title/spec/roleKey/dependencyKeys/workspacePolicy/risk alanlarını içermeli.',
          'worker_done komutuna --staffing-proposal-file .barkos/staffing-proposal.json ekle. BarkOS yalnızca doğrulanan bu sözleşmedeki yeni çalışanları ve uygulama görevlerini oluşturur.'
        ].join('\n\n'),
        requiredCapabilities: ['planning', 'delegation', 'review'],
        dependencyDraftIds: ['project-analysis'],
        workspacePolicy: 'inherit',
        preferredEnvironmentId: null,
        risk: 'low',
        approvalPolicy: 'none'
      }
    ]
  }
}
