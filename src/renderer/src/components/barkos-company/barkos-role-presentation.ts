import type { BarkosRole } from '../../../../shared/barkos/company'
import { translate } from '@/i18n/i18n'

const CAPABILITY_LABELS: Readonly<Record<string, string>> = {
  planning: 'Planlama',
  delegation: 'Görev dağıtımı',
  review: 'İnceleme',
  'project-analysis': 'Proje analizi',
  'codebase-navigation': 'Dosya haritalama',
  reporting: 'Raporlama'
}

export function barkosRoleName(role: BarkosRole): string {
  if (role.id === 'lead' && role.name === 'Company Lead') {
    return translate('barkos.company.role.builtInLead', 'Baş Ajan')
  }
  return role.name
}

export function barkosRoleMission(role: BarkosRole): string {
  if (
    role.id === 'lead' &&
    role.mission === 'Turn the company mission into clear, verifiable work.'
  ) {
    return translate(
      'barkos.company.role.builtInLeadMission',
      'Şirket hedefini açık, doğrulanabilir ve bölünebilir işlere dönüştür.'
    )
  }
  return role.mission
}

export function barkosCapabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability.trim().toLocaleLowerCase('en-US')] ?? capability
}

export function barkosDefinitionOfDoneLabel(role: BarkosRole, value: string): string {
  if (
    role.id === 'lead' &&
    value === 'Work is delivered with evidence and the company state is current.'
  ) {
    return translate(
      'barkos.company.role.builtInLeadDone',
      'İş kanıtlarıyla teslim edildi ve şirket durumu güncel.'
    )
  }
  return value
}
