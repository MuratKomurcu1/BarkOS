const ORCA_PRODUCT_NAME = /\bOrca\b/g
const ORCA_PRODUCT_NAME_UPPERCASE = /\bORCA\b/g

export function brandBarkosVisibleCopy(value: string): string {
  return value.replace(ORCA_PRODUCT_NAME_UPPERCASE, 'BARKOS').replace(ORCA_PRODUCT_NAME, 'BarkOS')
}
