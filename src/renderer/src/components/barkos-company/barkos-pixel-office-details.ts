import type { BarkosPixelOfficeImages } from './barkos-pixel-office-assets'

export type BarkosPixelOfficeColors = {
  background: string
  card: string
  border: string
  foreground: string
  muted: string
  mutedForeground: string
  primary: string
  destructive: string
}

export function drawBarkosPixelOfficeZones(
  context: CanvasRenderingContext2D,
  colors: BarkosPixelOfficeColors,
  labels: readonly [string, string, string]
): void {
  const zones = [
    { label: labels[0], x: 28, width: 210 },
    { label: labels[1], x: 246, width: 148 },
    { label: labels[2], x: 402, width: 210 }
  ]
  context.save()
  context.globalAlpha = 0.62
  context.font = '600 7px Geist, sans-serif'
  context.textAlign = 'left'
  zones.forEach((zone) => {
    context.fillStyle = colors.card
    context.fillRect(zone.x, 31, zone.width, 12)
    context.strokeStyle = colors.border
    context.strokeRect(zone.x + 0.5, 31.5, zone.width - 1, 11)
    context.fillStyle = colors.mutedForeground
    context.fillText(zone.label, zone.x + 6, 39)
  })
  context.restore()
}

export function drawBarkosPixelOfficePets(args: {
  context: CanvasRenderingContext2D
  images: BarkosPixelOfficeImages
  now: number
  motionEnabled: boolean
}): void {
  const { context, images, now, motionEnabled } = args
  images.pets.forEach((pet, index) => {
    const phase = motionEnabled ? now / (5_000 + index * 1_400) + index * 0.42 : index * 0.42
    const x = 270 + Math.sin(phase * Math.PI * 2) * (64 + index * 18)
    const y = 210 + Math.cos(phase * Math.PI * 2) * (22 + index * 6)
    const movingRight = Math.cos(phase * Math.PI * 2) >= 0
    const frame = motionEnabled ? Math.floor(now / 170 + index * 2) % 6 : 0
    context.save()
    if (!movingRight) {
      context.translate(Math.round(x) + 8, 0)
      context.scale(-1, 1)
      context.drawImage(pet, frame * 16, 64, 16, 32, 0, Math.round(y) - 24, 16, 32)
    } else {
      context.drawImage(pet, frame * 16, 64, 16, 32, Math.round(x) - 8, Math.round(y) - 24, 16, 32)
    }
    context.restore()
  })
}
