import type { FeatureTip } from '../../../../shared/feature-tips'
import { translate } from '@/i18n/i18n'

export function localizeFeatureTip(tip: FeatureTip | null): FeatureTip | null {
  if (!tip) {
    return null
  }
  switch (tip.id) {
    case 'orca-cli':
      return {
        ...tip,
        eyebrow: translate('barkos.featureTip.eyebrow', 'İpucu'),
        title: translate(
          'barkos.featureTip.cli.title',
          'Ajanların BarkOS CLI ile çalışmasını sağlayın'
        ),
        description: translate(
          'barkos.featureTip.cli.description',
          'Ajanların alt iş ağaçlarını koordine etmesini ve birbirleriyle haberleşmesini sağlayın.'
        ),
        ctaLabel: translate('barkos.featureTip.cli.cta', 'BarkOS CLI ve yeteneklerini kur')
      }
    case 'cmd-j-palette':
      return {
        ...tip,
        eyebrow: translate('barkos.featureTip.eyebrow', 'İpucu'),
        title: translate('barkos.featureTip.palette.title', '<shortcut> ile bir iş ağacına geçin'),
        description: translate(
          'barkos.featureTip.palette.description',
          'Klavyeden ayrılmadan iş ağaçlarında arayın, sekme değiştirin, ayarları düzenleyin veya yeni bir iş ağacı açın.'
        ),
        ctaLabel: translate('barkos.featureTip.palette.cta', 'Anladım')
      }
    case 'voice-dictation':
      return {
        ...tip,
        eyebrow: translate('barkos.featureTip.eyebrow', 'İpucu'),
        title: translate('barkos.featureTip.voice.title', 'Herhangi bir bölmeye sesle yazdırın'),
        description: translate(
          'barkos.featureTip.voice.description',
          'Odaktaki bölmede sesle yazmayı başlatın; durdurmak için kısayolu yeniden kullanın.'
        ),
        ctaLabel: translate('barkos.featureTip.voice.cta', 'Sesle yazmayı ayarla')
      }
  }
}
