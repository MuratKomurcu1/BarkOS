import type { BarkosCompany, BarkosRole, BarkosWorker } from './company'
import { barkosAgentCollaborationInstructions } from './agent-collaboration'

export const BARKOS_WORKER_BRIEFING_MAX_CHARS = 12_000

function bulletList(values: readonly string[]): string {
  return values.map((value) => `- ${value}`).join('\n')
}

function boundBriefing(value: string): string {
  if (value.length <= BARKOS_WORKER_BRIEFING_MAX_CHARS) {
    return value
  }
  const suffix = '\n\n[Bilgilendirme BarkOS tarafından kısaltıldı.]'
  return `${value.slice(0, BARKOS_WORKER_BRIEFING_MAX_CHARS - suffix.length)}${suffix}`
}

export function buildBarkosWorkerBriefing(
  company: BarkosCompany,
  worker: BarkosWorker,
  role: BarkosRole,
  memoryContext?: string | null
): string {
  const sections = [
    `Sen ${company.name} şirketinde kalıcı çalışan ${worker.name} adlı ajansın.`,
    `Şirket misyonu:\n${company.mission}`,
    `Rolün: ${role.name}\n${role.mission}`,
    role.capabilities.length > 0 ? `Yeteneklerin:\n${bulletList(role.capabilities)}` : null,
    `Tamamlanma ölçütleri:\n${bulletList(role.definitionOfDone)}`,
    role.instructions ? `Rol talimatları:\n${role.instructions}` : null,
    [
      'Çalışma sözleşmesi:',
      '- Bu oturum boyunca aynı çalışan kimliğini koru.',
      '- Yalnızca seçili BarkOS çalışma alanında ve izin verilen yürütme ortamında çalış.',
      '- BarkOS bir TASK bloğu gönderdiğinde ikinci bir onay beklemeden hemen göreve başla.',
      '- Açık kullanıcı onayı olmadan yıkıcı veya harici işlem yapma.',
      '- İşi tamamlandı saymadan önce kanıtları, riskleri ve çözülemeyen kararları bildir.',
      '- Bu bilgilendirmeyi aldıktan sonra gönderilen BarkOS görevini doğrudan uygula.'
    ].join('\n'),
    barkosAgentCollaborationInstructions(worker.id),
    memoryContext ?? null
  ].filter((section): section is string => section !== null)

  return boundBriefing(sections.join('\n\n'))
}
