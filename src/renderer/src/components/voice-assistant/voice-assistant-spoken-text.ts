export function voiceAssistantSpokenText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' kod bloğu ')
    .replace(/[*_#>`~[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
