export const BARKOS_LINK_PROTOCOL = 'barkos:' as const
export const LEGACY_ORCA_LINK_PROTOCOL = 'orca:' as const

export function isBarkosCompatibleLinkProtocol(protocol: string): boolean {
  return protocol === BARKOS_LINK_PROTOCOL || protocol === LEGACY_ORCA_LINK_PROTOCOL
}

export function startsWithBarkosCompatibleLink(value: string): boolean {
  const normalized = value.trimStart().toLowerCase()
  return normalized.startsWith('barkos://') || normalized.startsWith('orca://')
}
