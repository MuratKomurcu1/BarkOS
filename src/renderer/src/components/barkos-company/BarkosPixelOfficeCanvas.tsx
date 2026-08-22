import { useEffect, useRef, useState } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosLiveOfficeWorker } from '@/lib/barkos-live-office'
import { translate } from '@/i18n/i18n'
import {
  loadBarkosPixelOfficeImages,
  type BarkosPixelOfficeImages
} from './barkos-pixel-office-assets'
import {
  drawBarkosPixelOfficePets,
  drawBarkosPixelOfficeZones,
  type BarkosPixelOfficeColors
} from './barkos-pixel-office-details'
import {
  BARKOS_PIXEL_OFFICE_HEIGHT,
  BARKOS_PIXEL_OFFICE_WIDTH,
  barkosPixelOfficePalette,
  barkosPixelOfficeSeat,
  barkosPixelSpriteFrame,
  isBarkosPixelOfficeWorkerActive,
  syncBarkosPixelOfficeAvatars,
  updateBarkosPixelOfficeAvatar,
  type BarkosPixelOfficeAvatar
} from './barkos-pixel-office-engine'

type Props = {
  company: BarkosCompany
  entries: readonly BarkosLiveOfficeWorker[]
}

function cssColor(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback
}

function readOfficeColors(canvas: HTMLCanvasElement): BarkosPixelOfficeColors {
  const style = getComputedStyle(canvas)
  return {
    background: cssColor(style, '--background', '#101010'),
    card: cssColor(style, '--card', '#181818'),
    border: cssColor(style, '--border', '#383838'),
    foreground: cssColor(style, '--foreground', '#f2f2f2'),
    muted: cssColor(style, '--muted', '#292929'),
    mutedForeground: cssColor(style, '--muted-foreground', '#a3a3a3'),
    primary: cssColor(style, '--primary', '#f2f2f2'),
    destructive: cssColor(style, '--destructive', '#ef4444')
  }
}

function drawImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number
): void {
  context.drawImage(image, Math.round(x), Math.round(y))
}

function drawCarpetArea(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  startCol: number,
  startRow: number,
  columns: number,
  rows: number
): void {
  const inside = (col: number, row: number): boolean =>
    col >= startCol && col < startCol + columns && row >= startRow && row < startRow + rows
  for (let junctionRow = startRow; junctionRow <= startRow + rows; junctionRow += 1) {
    for (let junctionCol = startCol; junctionCol <= startCol + columns; junctionCol += 1) {
      let carpetCase = 0
      if (inside(junctionCol - 1, junctionRow - 1)) {
        carpetCase |= 1
      }
      if (inside(junctionCol, junctionRow - 1)) {
        carpetCase |= 2
      }
      if (inside(junctionCol, junctionRow)) {
        carpetCase |= 4
      }
      if (inside(junctionCol - 1, junctionRow)) {
        carpetCase |= 8
      }
      if (carpetCase === 0) {
        continue
      }
      context.drawImage(
        image,
        (carpetCase % 4) * 16,
        Math.floor(carpetCase / 4) * 16,
        16,
        16,
        junctionCol * 16 - 8,
        junctionRow * 16 - 8,
        16,
        16
      )
    }
  }
}

function drawRoom(
  context: CanvasRenderingContext2D,
  images: BarkosPixelOfficeImages,
  colors: BarkosPixelOfficeColors,
  entries: readonly BarkosLiveOfficeWorker[],
  now: number
): void {
  context.fillStyle = colors.background
  context.fillRect(0, 0, BARKOS_PIXEL_OFFICE_WIDTH, BARKOS_PIXEL_OFFICE_HEIGHT)
  for (let y = 16; y < 272; y += 16) {
    for (let x = 16; x < 624; x += 16) {
      drawImage(context, images.floor, x, y)
    }
  }
  context.fillStyle = colors.muted
  context.fillRect(0, 0, BARKOS_PIXEL_OFFICE_WIDTH, 18)
  context.fillRect(0, 0, 16, BARKOS_PIXEL_OFFICE_HEIGHT)
  context.fillRect(624, 0, 16, BARKOS_PIXEL_OFFICE_HEIGHT)
  context.fillRect(0, 272, 304, 16)
  context.fillRect(336, 272, 304, 16)
  context.strokeStyle = colors.border
  context.lineWidth = 2
  context.strokeRect(15, 15, 610, 258)

  drawBarkosPixelOfficeZones(context, colors, [
    translate('barkos.office.zone.analysis', 'Analysis'),
    translate('barkos.office.zone.production', 'Production'),
    translate('barkos.office.zone.review', 'Review')
  ])

  drawCarpetArea(context, images.carpet, 17, 8, 7, 4)
  drawImage(context, images.bookshelf, 32, 4)
  drawImage(context, images.bookshelf, 72, 4)
  drawImage(context, images.hangingPlant, 144, 0)
  drawImage(context, images.whiteboard, 280, 0)
  drawImage(context, images.clock, 384, 0)
  drawImage(context, images.smallPainting, 448, 0)
  drawImage(context, images.largePainting, 512, 0)
  drawImage(context, images.plantLarge, 592, 14)
  drawImage(context, images.plant, 20, 240)
  drawImage(context, images.sofa, 288, 144)
  drawImage(context, images.coffeeTable, 336, 160)
  drawImage(context, images.coffee, 344, 153)
  drawImage(context, images.bin, 596, 248)

  const computerFrame = Math.floor(now / 360) % images.computerOn.length
  const deskCount = Math.min(Math.max(entries.length, 2), 12)
  for (let index = 0; index < deskCount; index += 1) {
    const seat = barkosPixelOfficeSeat(index)
    drawImage(context, images.chair, seat.x - 8, seat.y - 13)
    drawImage(context, images.desk, seat.x - 24, seat.y - 44)
    const entry = entries[index]
    const computer =
      entry && isBarkosPixelOfficeWorkerActive(entry.status)
        ? images.computerOn[computerFrame]
        : images.computerOff
    drawImage(context, computer, seat.x - 8, seat.y - 61)
  }
}

function drawRoundedLabel(
  context: CanvasRenderingContext2D,
  avatar: BarkosPixelOfficeAvatar,
  label: string,
  task: string | undefined,
  tool: string | null,
  colors: BarkosPixelOfficeColors
): void {
  const width = Math.min(112, Math.max(54, context.measureText(label).width + 16))
  const x = Math.max(24, Math.min(BARKOS_PIXEL_OFFICE_WIDTH - width - 24, avatar.x - width / 2))
  const y = avatar.y - 55
  context.fillStyle = colors.card
  context.strokeStyle =
    avatar.status === 'blocked' || avatar.status === 'stop-uncertain'
      ? colors.destructive
      : colors.border
  context.lineWidth = 1
  context.beginPath()
  const detailRows = Number(Boolean(task)) + Number(Boolean(tool))
  context.roundRect(x, y, width, 17 + detailRows * 10, 4)
  context.fill()
  context.stroke()
  context.fillStyle = colors.foreground
  context.font = '600 9px Geist, sans-serif'
  context.textAlign = 'center'
  context.fillText(label, x + width / 2, y + 11)
  if (task) {
    context.fillStyle = colors.mutedForeground
    context.font = '8px Geist, sans-serif'
    const compactTask = task.length > 20 ? `${task.slice(0, 19)}…` : task
    context.fillText(compactTask, x + width / 2, y + 22)
  }
  if (tool) {
    context.fillStyle = colors.primary
    context.font = '600 7px Geist, sans-serif'
    const compactTool = tool.length > 22 ? `${tool.slice(0, 21)}…` : tool
    context.fillText(compactTool, x + width / 2, y + (task ? 32 : 22))
  }
}

function drawStatusBubble(
  context: CanvasRenderingContext2D,
  avatar: BarkosPixelOfficeAvatar,
  colors: BarkosPixelOfficeColors
): void {
  if (avatar.status !== 'blocked' && avatar.status !== 'waiting') {
    return
  }
  context.fillStyle = colors.foreground
  context.beginPath()
  context.roundRect(avatar.x + 8, avatar.y - 40, 18, 16, 4)
  context.fill()
  context.fillStyle = avatar.status === 'blocked' ? colors.destructive : colors.background
  context.font = '700 10px Geist, sans-serif'
  context.textAlign = 'center'
  context.fillText(avatar.status === 'blocked' ? '!' : '…', avatar.x + 17, avatar.y - 29)
}

function drawAvatar(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  avatar: BarkosPixelOfficeAvatar
): void {
  const sprite = barkosPixelSpriteFrame(avatar)
  const sourceX = sprite.column * 16
  const sourceY = sprite.row * 32
  context.save()
  if (sprite.flip) {
    context.translate(Math.round(avatar.x) + 8, 0)
    context.scale(-1, 1)
    context.drawImage(image, sourceX, sourceY, 16, 32, 0, Math.round(avatar.y) - 29, 16, 32)
  } else {
    context.drawImage(
      image,
      sourceX,
      sourceY,
      16,
      32,
      Math.round(avatar.x) - 8,
      Math.round(avatar.y) - 29,
      16,
      32
    )
  }
  context.restore()
}

function renderOffice(args: {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  images: BarkosPixelOfficeImages
  company: BarkosCompany
  entries: readonly BarkosLiveOfficeWorker[]
  avatars: Map<string, BarkosPixelOfficeAvatar>
  colors: BarkosPixelOfficeColors
  now: number
  motionEnabled: boolean
}): void {
  const { canvas, context } = args
  const dpr = window.devicePixelRatio || 1
  const bounds = canvas.getBoundingClientRect()
  const width = Math.max(1, Math.round(bounds.width * dpr))
  const height = Math.max(1, Math.round(bounds.height * dpr))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const scale = Math.min(width / BARKOS_PIXEL_OFFICE_WIDTH, height / BARKOS_PIXEL_OFFICE_HEIGHT)
  const offsetX = (width - BARKOS_PIXEL_OFFICE_WIDTH * scale) / 2
  const offsetY = (height - BARKOS_PIXEL_OFFICE_HEIGHT * scale) / 2
  context.setTransform(scale, 0, 0, scale, offsetX, offsetY)
  context.imageSmoothingEnabled = false
  const colors = args.colors
  drawRoom(context, args.images, colors, args.entries, args.now)
  drawBarkosPixelOfficePets({
    context,
    images: args.images,
    now: args.now,
    motionEnabled: args.motionEnabled
  })

  const workersById = new Map(args.company.workers.map((worker) => [worker.id, worker]))
  const entriesById = new Map(args.entries.map((entry) => [entry.workerId, entry]))
  const ordered = [...args.avatars.values()].sort((left, right) => left.y - right.y)
  ordered.forEach((avatar) => {
    const entry = entriesById.get(avatar.workerId)
    const worker = workersById.get(avatar.workerId)
    if (!entry || !worker) {
      return
    }
    const palette = barkosPixelOfficePalette(avatar.workerId, args.images.characters.length)
    drawAvatar(context, args.images.characters[palette], avatar)
    drawStatusBubble(context, avatar, colors)
    drawRoundedLabel(context, avatar, worker.name, entry.work[0]?.taskTitle, entry.toolName, colors)
  })
  context.setTransform(1, 0, 0, 1, 0, 0)
}

export function BarkosPixelOfficeCanvas({ company, entries }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({ company, entries })
  const [error, setError] = useState<string | null>(null)
  stateRef.current = { company, entries }

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }
    let stopped = false
    let frameId = 0
    let previous = performance.now()
    const avatars = new Map<string, BarkosPixelOfficeAvatar>()
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let colors = readOfficeColors(canvas)
    const themeObserver = new MutationObserver(() => {
      colors = readOfficeColors(canvas)
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    void loadBarkosPixelOfficeImages()
      .then((images) => {
        const frame = (now: number): void => {
          if (stopped) {
            return
          }
          const current = stateRef.current
          const dt = Math.min((now - previous) / 1000, 0.05)
          previous = now
          syncBarkosPixelOfficeAvatars({ avatars, workers: current.entries })
          current.entries.forEach((worker) => {
            const avatar = avatars.get(worker.workerId)
            if (avatar) {
              updateBarkosPixelOfficeAvatar({
                avatar,
                worker,
                dt,
                motionEnabled: !motionQuery.matches
              })
            }
          })
          renderOffice({
            canvas,
            context,
            images,
            ...current,
            avatars,
            colors,
            now,
            motionEnabled: !motionQuery.matches
          })
          frameId = requestAnimationFrame(frame)
        }
        frameId = requestAnimationFrame(frame)
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught))
      })

    return () => {
      stopped = true
      themeObserver.disconnect()
      cancelAnimationFrame(frameId)
    }
  }, [])

  return (
    <div className="barkos-pixel-canvas-shell">
      <canvas
        ref={canvasRef}
        className="barkos-pixel-canvas"
        role="img"
        aria-label={translate(
          'barkos.office.canvas.label',
          'BarkOS çalışanlarının canlı piksel ofisi'
        )}
        data-barkos-pixel-office="true"
      />
      {error ? (
        <p className="barkos-pixel-canvas-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
