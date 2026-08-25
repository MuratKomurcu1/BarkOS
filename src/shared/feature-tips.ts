import {
  hasFeatureInteraction,
  type FeatureInteractionId,
  type FeatureInteractionState
} from './feature-interactions'

export type FeatureTipId = 'voice-dictation' | 'barkos-cli' | 'cmd-j-palette'

export type FeatureTipPriority = 'new' | 'unseen'

export type FeatureTipAction = 'enable-voice' | 'setup-cli' | 'learn-cmd-j-palette'

export type FeatureTip = {
  id: FeatureTipId
  priority: FeatureTipPriority
  eyebrow: string
  title: string
  description: string
  action: FeatureTipAction
  ctaLabel: string
  /** Feature interactions that mean this tip is no longer useful to show. */
  completedByFeatureInteractions?: readonly FeatureInteractionId[]
}

export type CompletedFeatureTipState = {
  cliInstalled: boolean
  voiceDictationEnabled: boolean
  featureInteractions?: FeatureInteractionState
}

export const FEATURE_TIPS = [
  {
    id: 'barkos-cli',
    priority: 'new',
    eyebrow: 'İpucu',
    title: 'Ajanların BarkOS CLI ile çalışmasını sağlayın',
    description:
      'Ajanların alt iş ağaçlarını koordine etmesini ve birbirleriyle haberleşmesini sağlayın.',
    action: 'setup-cli',
    ctaLabel: 'BarkOS CLI ve yeteneklerini kur',
    completedByFeatureInteractions: []
  },
  {
    id: 'cmd-j-palette',
    priority: 'new',
    eyebrow: 'İpucu',
    // Why: "<shortcut>" is a placeholder token; the cmd-j dialog splits the
    // title on it and inlines the live, platform-correct keybinding as a <kbd>.
    title: '<shortcut> ile bir iş ağacına geçin',
    description:
      'Klavyeden ayrılmadan iş ağaçlarında arayın, sekme değiştirin, ayarları düzenleyin veya yeni bir iş ağacı açın.',
    action: 'learn-cmd-j-palette',
    ctaLabel: 'Anladım',
    completedByFeatureInteractions: []
  },
  {
    id: 'voice-dictation',
    priority: 'unseen',
    eyebrow: 'İpucu',
    title: 'Herhangi bir bölmeye sesle yazdırın',
    description:
      'Odaktaki bölmede sesle yazmayı başlatın; durdurmak için kısayolu yeniden kullanın.',
    action: 'enable-voice',
    ctaLabel: 'Sesle yazmayı ayarla',
    completedByFeatureInteractions: ['voice-dictation']
  }
] as const satisfies readonly FeatureTip[]

export const FEATURE_TIP_IDS = FEATURE_TIPS.map((tip) => tip.id)

export function isFeatureTipId(value: unknown): value is FeatureTipId {
  return typeof value === 'string' && FEATURE_TIP_IDS.includes(value as FeatureTipId)
}

export function normalizeFeatureTipIds(value: unknown): FeatureTipId[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<FeatureTipId>()
  for (const item of value) {
    if (isFeatureTipId(item)) {
      seen.add(item)
    }
  }
  return [...seen]
}

export function getCompletedFeatureTipIds(state: CompletedFeatureTipState): Set<FeatureTipId> {
  const completedIds = new Set<FeatureTipId>()
  if (state.cliInstalled) {
    completedIds.add('barkos-cli')
  }
  if (state.voiceDictationEnabled) {
    completedIds.add('voice-dictation')
  }
  for (const tip of FEATURE_TIPS) {
    if (
      tip.completedByFeatureInteractions?.some((id) =>
        hasFeatureInteraction(state.featureInteractions, id)
      )
    ) {
      completedIds.add(tip.id)
    }
  }
  return completedIds
}

export function getOrderedUnseenFeatureTips(args: {
  seenTipIds: ReadonlySet<FeatureTipId>
  completedTipIds?: ReadonlySet<FeatureTipId>
}): FeatureTip[] {
  const completedTipIds = args.completedTipIds ?? new Set<FeatureTipId>()
  const unseenTips = FEATURE_TIPS.filter(
    (tip) => !args.seenTipIds.has(tip.id) && !completedTipIds.has(tip.id)
  )
  return [
    ...unseenTips.filter((tip) => tip.priority === 'new'),
    ...unseenTips.filter((tip) => tip.priority !== 'new')
  ]
}
