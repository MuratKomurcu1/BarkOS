export type VoiceAssistantIntent =
  | { kind: 'chat' }
  | { kind: 'sleep' }
  | { kind: 'work'; requiresConfirmation: boolean }

function foldTurkish(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (letter) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[letter]!)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const WORK_SUBJECTS = [
  'proje',
  'klasor',
  'dosya',
  'kod',
  'uygulama',
  'repo',
  'test',
  'hata',
  'arayuz',
  'website',
  'site',
  'veritabani',
  'ekip',
  'ajan',
  'branch',
  'commit'
]
const WORK_ACTIONS = [
  'incele',
  'duzelt',
  'gelistir',
  'ekle',
  'kaldir',
  'degistir',
  'tasarla',
  'yaz',
  'kur',
  'baslat',
  'calistir',
  'test et',
  'guncelle',
  'entegre et',
  'dagit',
  'olustur',
  'yap',
  'hazirla',
  'coz',
  'tamamla',
  'uygula'
]
const SENSITIVE_ACTIONS = [
  'sil',
  'push',
  'yayinla',
  'deploy',
  'odeme',
  'sudo',
  'yetki',
  'arsivle',
  'kapat',
  'durdur',
  'production',
  'prod'
]

export function classifyVoiceAssistantIntent(text: string): VoiceAssistantIntent {
  const normalized = foldTurkish(text)
  if (!normalized) {
    return { kind: 'chat' }
  }
  if (
    ['uykuya gec', 'dinlemeyi birak', 'asistani kapat', 'gorusuruz barkos'].some((phrase) =>
      normalized.includes(phrase)
    )
  ) {
    return { kind: 'sleep' }
  }

  const hasSubject = WORK_SUBJECTS.some((subject) => normalized.includes(subject))
  const hasAction = [...WORK_ACTIONS, ...SENSITIVE_ACTIONS].some((action) =>
    normalized.includes(action)
  )
  if (!hasSubject || !hasAction) {
    return { kind: 'chat' }
  }
  return {
    kind: 'work',
    requiresConfirmation: SENSITIVE_ACTIONS.some((action) => normalized.includes(action))
  }
}

export function isVoiceAssistantInterruption(text: string): boolean {
  const normalized = foldTurkish(text)
  return [
    'dur',
    'sus',
    'bekle',
    'kes',
    'barkos dur',
    'barkos sus',
    'barkos bekle',
    'barkos kes',
    'konusmayi durdur',
    'yaniti durdur'
  ].includes(normalized)
}

export function extractWakePhraseRemainder(transcript: string): string | null {
  const patterns = [
    // Turkish alternatives make the wake phrase easier for multilingual local models.
    /(?:^|[^\p{L}\p{N}])(?:merhaba|selam)[^\p{L}\p{N}]+b[ae]r[ck](?:(?:[^\p{L}\p{N}]*[ou])?(?:[^\p{L}\p{N}]*[sz])?(?:se)?|er)\b/iu,
    // Local models commonly render the branded pronunciation as Barkosse, Barco, Barkus, or Bark O S.
    /(?:^|[^\p{L}\p{N}])hey[^\p{L}\p{N}]+b[ae]r[ck](?:(?:[^\p{L}\p{N}]*[ou])?(?:[^\p{L}\p{N}]*[sz])?(?:se)?|er)\b/iu,
    // Parakeet has repeatedly rendered the same Turkish-accented phrase as "Hey/Hello Marcos".
    /(?:^|[^\p{L}\p{N}])(?:hey|hello)(?:[^\p{L}\p{N}]+hey)?[^\p{L}\p{N}]+mar[ck]os(?:[^\p{L}\p{N}]+johnny)?\b/iu,
    // Parakeet can map the Turkish-accented wake phrase to this stable English phonetic result.
    /(?:^|[^\p{L}\p{N}])(?:hey|yeah)[^\p{L}\p{N}]+(?:it[^\p{L}\p{N}]*s[^\p{L}\p{N}]+)?almost\b/iu
  ]
  const match = patterns
    .map((pattern) => pattern.exec(transcript))
    .filter((candidate): candidate is RegExpExecArray => candidate !== null)
    .sort((left, right) => left.index - right.index)[0]
  if (!match) {
    return null
  }
  return transcript
    .slice(match.index + match[0].length)
    .replace(/^[\s,.:;!?—-]+/, '')
    .trim()
}
