import type { FeatureInteractionId } from './feature-interactions'

export type ContextualTourId =
  | 'workspace-board'
  | 'workspace-agent-sessions'
  | 'browser'
  | 'tasks'
  | 'automations'
  | 'floating-workspace'
  | 'workspace-creation'

export type ContextualTourStepControl = {
  kind: 'auto-rename-branch-from-work'
}

export type ContextualTourStepActionKind =
  | 'next'
  | 'complete'
  | 'split-terminal-pane'
  | 'create-worktree'
  | 'show-worktrees'
  | 'open-tasks'
  | 'open-getting-started'

export type ContextualTourStepAction = {
  kind: ContextualTourStepActionKind
  label: string
}

export type ContextualTourStepPlacement = 'top' | 'right' | 'bottom' | 'left'

export type ContextualTourStep = {
  // Stable anchor for localized copy — position-keyed translations shift onto the wrong step when one is inserted.
  id?: string
  title: string
  body: string
  targetSelector: string
  requiredForStart?: boolean
  fallbackCopy?: string
  preferredPlacement?: ContextualTourStepPlacement
  targetPulse?: boolean
  hidePrimaryAction?: boolean
  control?: ContextualTourStepControl
  primaryAction?: ContextualTourStepAction
  secondaryAction?: ContextualTourStepAction
  advanceOnFeatureInteraction?: FeatureInteractionId
}

export type ContextualTour = {
  id: ContextualTourId
  allowedActiveModals?: readonly string[]
  steps: readonly ContextualTourStep[]
}

export const CONTEXTUAL_TOURS = [
  {
    id: 'workspace-board',
    steps: [
      {
        title: 'İşi panoda planlayın',
        body: 'Çalışma alanlarını proje yerine durumlarına göre görmek için bu panoyu kullanın.',
        targetSelector: '[data-contextual-tour-target="workspace-board-center"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        title: 'İşi aşamalar arasında taşıyın',
        body: 'Durumları değiştikçe çalışma alanlarını sütunlar arasında sürükleyin.',
        targetSelector:
          '[data-contextual-tour-target="workspace-board-done-lane"], [data-contextual-tour-target="workspace-board-lanes"]'
      }
    ]
  },
  {
    id: 'workspace-agent-sessions',
    steps: [
      {
        title: 'Terminal bölmesi açın',
        body: '{terminal.splitRight} ile ikinci bir terminal açın veya bölme seçenekleri için terminale sağ tıklayın.',
        targetSelector:
          '[data-contextual-tour-target="terminal-pane-split-target"], [data-contextual-tour-target="workspace-agent-terminal-tip"]',
        requiredForStart: true,
        preferredPlacement: 'bottom',
        primaryAction: { kind: 'split-terminal-pane', label: 'Terminali böl' },
        advanceOnFeatureInteraction: 'terminal-pane-split'
      },
      {
        title: 'Başka bir görevi paralel başlatın',
        body: 'Her çalışma alanı kendi dalını kullanır; paralel işler birbirinden ayrı kalır.',
        targetSelector: '[data-contextual-tour-target="workspace-create-control"]',
        preferredPlacement: 'right',
        targetPulse: true,
        hidePrimaryAction: true
      }
    ]
  },
  {
    id: 'browser',
    steps: [
      {
        title: 'Sayfa bağlamını ajanlara aktarın',
        body: 'Bir sayfa öğesinin bağlamını ajanlara kopyalamak için yakalama aracını kullanın.',
        targetSelector: '[data-contextual-tour-target="browser-grab-control"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        title: 'Tasarım geri bildirimini yerinde işaretleyin',
        body: 'Öğelere açıklama ekleyin ve notları bir ajana gönderin.',
        targetSelector: '[data-contextual-tour-target="browser-annotation-control"]',
        preferredPlacement: 'bottom'
      },
      {
        title: 'Oturumlarınızı açık tutun',
        body: 'Mevcut oturumlarınızı BarkOS’a aktarın ve yeniden giriş yapmadan çalışın.',
        // Prefer the always-visible Import button; fall back to the overflow-menu
        // item only once the user has dismissed the import hint.
        targetSelector:
          '[data-contextual-tour-target="browser-import-hint"], [data-contextual-tour-target="browser-import-cookies-control"]',
        // Sit below the Import button with the arrow pointing up at it.
        preferredPlacement: 'bottom'
      }
    ]
  },
  {
    id: 'tasks',
    steps: [
      {
        title: 'İş kaynağını seçin',
        body: 'Sayfadan ayrılmadan bağlı sağlayıcılar ve proje filtreleri arasında geçiş yapın.',
        targetSelector: '[data-contextual-tour-target="tasks-source-filters"]',
        requiredForStart: true
      },
      {
        title: 'İhtiyacınız olan işi süzün',
        body: 'Sorunları, incelemeleri, birleştirme isteklerini veya görevleri arama ve hazır filtrelerle daraltın.',
        targetSelector: '[data-contextual-tour-target="tasks-search-presets"]'
      },
      {
        title: 'İş kaydından çalışma başlatın',
        body: 'Bir görev, sorun, inceleme veya birleştirme isteğinin bağlamını çalışma alanına taşımak için Başlat ya da Aç’ı kullanın.',
        targetSelector:
          '[data-contextual-tour-target="tasks-start-workspace"], [data-contextual-tour-target="tasks-actions"], [data-contextual-tour-target="tasks-search-presets"]'
      }
    ]
  },
  {
    id: 'automations',
    steps: [
      {
        id: 'automations-intro',
        title: 'Otomasyon nedir?',
        body: 'Otomasyonlar ajan işlerini bir programa göre çalıştırır. Bu düğmeyle yeni bir otomasyon ekleyin.',
        targetSelector: '[data-contextual-tour-target="automations-create"]',
        requiredForStart: true
      },
      {
        id: 'automations-results',
        title: 'Sonuçları bulun',
        body: 'Çalıştırmalar; otomasyonun ne zaman çalıştığını, ne yaptığını ve çıktının nerede olduğunu gösterir.',
        targetSelector: '[data-contextual-tour-target="automations-runs"]'
      }
    ]
  },
  {
    id: 'floating-workspace',
    steps: [
      {
        title: 'Bir ajanı tüm depolarda çalıştırın',
        body: 'Ajanlar seçtiğiniz klasörde çalışır. Tüm depolarda birlikte çalışması için servislerin üst klasörünü seçin.',
        // Why: the per-action anchors only render in the empty state; fall back
        // to the panel surface when floating tabs already exist.
        targetSelector:
          '[data-contextual-tour-target="floating-workspace-new-terminal"], [data-contextual-tour-target="floating-workspace-surface"]',
        requiredForStart: true,
        preferredPlacement: 'left'
      },
      {
        title: 'Veya geçici çalışma alanı olarak kullanın',
        body: 'Odaklandığınız çalışma alanını dağıtmadan ajan, terminal, not ve tarayıcı sekmeleri açın.',
        targetSelector:
          '[data-contextual-tour-target="floating-workspace-new-markdown"], [data-contextual-tour-target="floating-workspace-surface"]',
        preferredPlacement: 'left'
      }
    ]
  },
  {
    id: 'workspace-creation',
    allowedActiveModals: ['new-workspace-composer'],
    steps: [
      {
        title: 'Bir proje seçin',
        body: 'BarkOS her görevi temel dalınızdan ayrılan kendi çalışma alanında yalıtır.',
        targetSelector: '[data-contextual-tour-target="workspace-creation-project"]',
        requiredForStart: true
      },
      {
        title: 'Adlandırın veya mevcut bir işten başlayın',
        body: 'Kısa bir ad için bağlı görevden başlayın ya da ilk ajan mesajından otomatik adlandırmak için boş bırakın.',
        targetSelector: '[data-contextual-tour-target="workspace-creation-name"]',
        control: { kind: 'auto-rename-branch-from-work' }
      },
      {
        title: 'İşi başlatacak ajanı seçin',
        body: 'Bu çalışma alanı oluşturulduğunda açılacak ajanı seçin.',
        targetSelector: '[data-contextual-tour-target="workspace-creation-agent"]'
      }
    ]
  }
] as const satisfies readonly ContextualTour[]

export const CONTEXTUAL_TOUR_IDS = CONTEXTUAL_TOURS.map((tour) => tour.id)

export function isContextualTourId(value: unknown): value is ContextualTourId {
  return typeof value === 'string' && CONTEXTUAL_TOUR_IDS.includes(value as ContextualTourId)
}

export function getContextualTour(id: ContextualTourId): ContextualTour {
  return CONTEXTUAL_TOURS.find((tour) => tour.id === id)!
}

export function normalizeContextualTourIds(value: unknown): ContextualTourId[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<ContextualTourId>()
  for (const item of value) {
    if (isContextualTourId(item)) {
      seen.add(item)
    }
  }
  return [...seen]
}
