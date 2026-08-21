import type { BarkosLiveOfficeStatus } from '@/lib/barkos-live-office'
import { translate } from '@/i18n/i18n'

export const BARKOS_LIVE_OFFICE_ATTENTION_STATUSES = new Set<BarkosLiveOfficeStatus>([
  'blocked',
  'stop-pending',
  'stop-uncertain',
  'runtime-unconfirmed',
  'relaunch-required'
])

export function barkosLiveOfficeStatusLabel(status: BarkosLiveOfficeStatus): string {
  switch (status) {
    case 'working':
      return translate('barkos.office.status.working', 'Çalışıyor')
    case 'blocked':
      return translate('barkos.office.status.blocked', 'Engellendi')
    case 'waiting':
      return translate('barkos.office.status.waiting', 'Bekliyor')
    case 'assigned':
      return translate('barkos.office.status.assigned', 'Atandı · başlamadı')
    case 'awaiting-evidence':
      return translate('barkos.office.status.awaitingEvidence', 'Kanıt bekliyor')
    case 'awaiting-review':
      return translate('barkos.office.status.awaitingReview', 'İnceleme bekliyor')
    case 'stop-pending':
      return translate('barkos.office.status.stopPending', 'Durdurma kanıtı bekliyor')
    case 'stop-uncertain':
      return translate('barkos.office.status.stopUncertain', 'Durdurma belirsiz')
    case 'runtime-unconfirmed':
      return translate('barkos.office.status.runtimeUnconfirmed', 'Çalışma durumu doğrulanmadı')
    case 'starting':
      return translate('barkos.office.status.starting', 'Ajan oturumu başlatılıyor')
    case 'relaunch-required':
      return translate('barkos.office.status.relaunch', 'Yeniden başlatma gerekiyor')
    case 'unbound':
      return translate('barkos.office.status.unbound', 'Oturum hedefi yok')
    case 'paused':
      return translate('barkos.office.status.paused', 'Çalışan duraklatıldı')
    case 'offline':
      return translate('barkos.office.status.offline', 'Çalışan çevrimdışı')
    case 'idle':
      return translate('barkos.office.status.idle', 'Boşta')
  }
}

export function barkosLiveOfficeStatusVariant(
  status: BarkosLiveOfficeStatus
): 'destructive' | 'secondary' | 'outline' | 'dot' {
  if (status === 'stop-uncertain') {
    return 'destructive'
  }
  if (status === 'working') {
    return 'secondary'
  }
  return status === 'idle' ? 'dot' : 'outline'
}
