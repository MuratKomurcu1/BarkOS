export type FeatureWallSetupStepId =
  | 'default-agent'
  | 'add-two-repos'
  | 'notifications'
  | 'two-worktrees'
  | 'browser'
  | 'task-sources'
  | 'agent-capabilities'
  | 'setup-script'

export type FeatureWallSetupStep = {
  readonly id: FeatureWallSetupStepId
  readonly name: string
  readonly subtitle: string
  readonly description: string
}

export const FEATURE_WALL_SETUP_PARALLEL_WORK_STEP_IDS = [
  'two-worktrees',
  'browser'
] as const satisfies readonly FeatureWallSetupStepId[]

export type FeatureWallSetupSectionId = 'parallel-work' | 'setup'

export const FEATURE_WALL_SETUP_STEPS: readonly FeatureWallSetupStep[] = [
  {
    id: 'two-worktrees',
    name: 'Çoklu görev',
    subtitle: 'Çoklu görev',
    description: 'Aynı projede bile birbirinden yalıtılmış iki çalışma alanında aynı anda çalışın.'
  },
  {
    id: 'browser',
    name: "BarkOS'un tarayıcısını kullan",
    subtitle: "BarkOS'un tarayıcısını kullan",
    description:
      'BarkOS’tan ayrılmadan web uygulamanızı açın; seçtiğiniz öğenin kaynağını ve stillerini ajana gönderin.'
  },
  {
    id: 'notifications',
    name: 'Bildirimleri aç',
    subtitle: 'Bildirimleri aç',
    description: 'Bir ajan tamamlandığında, ilgi beklediğinde veya engellendiğinde haber alın.'
  },
  {
    id: 'default-agent',
    name: 'Varsayılan ajanı seç',
    subtitle: 'Varsayılan ajanı seç',
    description: 'Tercih ettiğiniz ajan seçili olarak yeni işe daha hızlı başlayın.'
  },
  {
    id: 'agent-capabilities',
    name: 'BarkOS CLI’ı etkinleştir',
    subtitle: 'BarkOS CLI’ı etkinleştir',
    description:
      'BarkOS kabuk komutunu kaydedin; tarayıcı, bilgisayar ve orkestrasyon becerilerini kurun.'
  },
  {
    id: 'task-sources',
    name: 'Entegrasyonları bağla',
    subtitle: 'Entegrasyonları bağla',
    description: 'Bir görevden tek tıkla ajan başlatın ve değişiklik isteği durumunu izleyin.'
  },
  {
    id: 'setup-script',
    name: 'Çalışma alanı kurulumunu otomatikleştir',
    subtitle: 'Çalışma alanı kurulumunu otomatikleştir',
    description:
      'Her yeni çalışma alanını ajanlara hazırlamak için kurulum komutlarını otomatik çalıştırın.'
  },
  {
    id: 'add-two-repos',
    name: 'Birden fazla depoda çalış',
    subtitle: 'Birden fazla depoda çalış',
    description: 'Temel depolarınızı BarkOS’a ekleyin ve klasör aramadan ajan çalışması başlatın.'
  }
] as const

export const FEATURE_WALL_SETUP_STEP_IDS = FEATURE_WALL_SETUP_STEPS.map((step) => step.id)

export function getFeatureWallSetupSteps(): readonly FeatureWallSetupStep[] {
  return FEATURE_WALL_SETUP_STEPS
}

export function getFeatureWallSetupSectionId(
  stepId: FeatureWallSetupStepId
): FeatureWallSetupSectionId {
  return FEATURE_WALL_SETUP_PARALLEL_WORK_STEP_IDS.includes(
    stepId as (typeof FEATURE_WALL_SETUP_PARALLEL_WORK_STEP_IDS)[number]
  )
    ? 'parallel-work'
    : 'setup'
}

export function getFeatureWallSetupStepsForSection(
  sectionId: FeatureWallSetupSectionId
): readonly FeatureWallSetupStep[] {
  return FEATURE_WALL_SETUP_STEPS.filter(
    (step) => getFeatureWallSetupSectionId(step.id) === sectionId
  )
}

export function getFirstIncompleteFeatureWallSetupStepId(
  stepDone: Partial<Record<FeatureWallSetupStepId, boolean>>
): FeatureWallSetupStepId {
  // Why: onboarding should prioritize Setup, while durable definitions retain the original order.
  const setupStep = getFeatureWallSetupStepsForSection('setup').find((step) => !stepDone[step.id])
  if (setupStep) {
    return setupStep.id
  }
  const parallelStep = getFeatureWallSetupStepsForSection('parallel-work').find(
    (step) => !stepDone[step.id]
  )
  return parallelStep?.id ?? FEATURE_WALL_SETUP_STEPS[0].id
}

export function isFeatureWallSetupStepId(value: unknown): value is FeatureWallSetupStepId {
  return (
    typeof value === 'string' &&
    FEATURE_WALL_SETUP_STEP_IDS.includes(value as FeatureWallSetupStepId)
  )
}
