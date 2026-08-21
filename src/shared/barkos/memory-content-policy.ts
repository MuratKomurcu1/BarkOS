const CREDENTIAL_LIKE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*\S+/i,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/i
]

export function containsBarkosCredentialLikeContent(value: string): boolean {
  return CREDENTIAL_LIKE_PATTERNS.some((pattern) => pattern.test(value))
}
