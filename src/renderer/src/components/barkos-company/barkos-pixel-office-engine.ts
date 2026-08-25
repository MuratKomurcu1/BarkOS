import type { BarkosLiveOfficeStatus, BarkosLiveOfficeWorker } from '@/lib/barkos-live-office'
import {
  BARKOS_PIXEL_OFFICE_HEIGHT,
  BARKOS_PIXEL_OFFICE_WIDTH,
  BARKOS_PIXEL_TILE_SIZE,
  barkosPixelOfficeEntrance,
  barkosPixelOfficeSeat,
  barkosPixelOfficeStationTile,
  barkosPixelOfficeWanderTile,
  barkosPixelTileCenter,
  findBarkosPixelOfficePath,
  type BarkosPixelOfficeSeat,
  type BarkosPixelTile
} from './barkos-pixel-office-layout'

export { BARKOS_PIXEL_OFFICE_HEIGHT, BARKOS_PIXEL_OFFICE_WIDTH, barkosPixelOfficeSeat }

const WALK_SPEED_PX_PER_SECOND = 44
const ACTIVE_STATUSES = new Set<BarkosLiveOfficeStatus>([
  'working',
  'assigned',
  'awaiting-evidence',
  'awaiting-review',
  'runtime-unconfirmed',
  'starting'
])

export type BarkosPixelAvatarMode = 'idle' | 'walk' | 'type' | 'read'

export type BarkosPixelOfficeAvatar = {
  workerId: string
  x: number
  y: number
  tileCol: number
  tileRow: number
  targetCol: number
  targetRow: number
  targetX: number
  targetY: number
  path: BarkosPixelTile[]
  moveProgress: number
  direction: 'down' | 'left' | 'right' | 'up'
  mode: BarkosPixelAvatarMode
  frame: number
  frameElapsed: number
  wanderElapsed: number
  wanderStep: number
  status: BarkosLiveOfficeStatus
  seat: BarkosPixelOfficeSeat
}

function hashWorkerId(workerId: string): number {
  let hash = 2166136261
  for (const character of workerId) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function barkosPixelOfficePalette(workerId: string, paletteCount: number): number {
  return paletteCount > 0 ? hashWorkerId(workerId) % paletteCount : 0
}

export function isBarkosPixelOfficeWorkerActive(status: BarkosLiveOfficeStatus): boolean {
  return ACTIVE_STATUSES.has(status)
}

export function createBarkosPixelOfficeAvatar(
  worker: BarkosLiveOfficeWorker,
  index: number
): BarkosPixelOfficeAvatar {
  const seat = barkosPixelOfficeSeat(index)
  const entrance = barkosPixelOfficeEntrance(hashWorkerId(worker.workerId))
  const position = barkosPixelTileCenter(entrance)
  return {
    workerId: worker.workerId,
    ...position,
    tileCol: entrance.col,
    tileRow: entrance.row,
    targetCol: entrance.col,
    targetRow: entrance.row,
    targetX: position.x,
    targetY: position.y,
    path: [],
    moveProgress: 0,
    direction: 'up',
    mode: 'idle',
    frame: 0,
    frameElapsed: 0,
    wanderElapsed: 0,
    wanderStep: hashWorkerId(worker.workerId) % 7,
    status: worker.status,
    seat
  }
}

function isReadingTool(toolName: string | null): boolean {
  return Boolean(toolName && /read|search|find|list|grep|inspect|scan|incele|oku/i.test(toolName))
}

function desiredMode(worker: BarkosLiveOfficeWorker): BarkosPixelAvatarMode {
  if (!isBarkosPixelOfficeWorkerActive(worker.status)) {
    return 'idle'
  }
  return isReadingTool(worker.toolName) ||
    worker.station === 'analysis' ||
    worker.station === 'review'
    ? 'read'
    : 'type'
}

function setDestination(avatar: BarkosPixelOfficeAvatar, destination: BarkosPixelTile): void {
  if (avatar.targetCol === destination.col && avatar.targetRow === destination.row) {
    return
  }
  avatar.targetCol = destination.col
  avatar.targetRow = destination.row
  const target = barkosPixelTileCenter(destination)
  avatar.targetX = target.x
  avatar.targetY = target.y
  avatar.path = findBarkosPixelOfficePath({ col: avatar.tileCol, row: avatar.tileRow }, destination)
  avatar.moveProgress = 0
}

function moveAvatar(avatar: BarkosPixelOfficeAvatar, dt: number, motionEnabled: boolean): void {
  if (!motionEnabled) {
    avatar.tileCol = avatar.targetCol
    avatar.tileRow = avatar.targetRow
    avatar.x = avatar.targetX
    avatar.y = avatar.targetY
    avatar.path = []
    avatar.moveProgress = 0
    return
  }
  const next = avatar.path[0]
  if (!next) {
    return
  }
  const from = barkosPixelTileCenter({ col: avatar.tileCol, row: avatar.tileRow })
  const to = barkosPixelTileCenter(next)
  const colDelta = next.col - avatar.tileCol
  const rowDelta = next.row - avatar.tileRow
  avatar.direction = colDelta > 0 ? 'right' : colDelta < 0 ? 'left' : rowDelta > 0 ? 'down' : 'up'
  avatar.moveProgress += (WALK_SPEED_PX_PER_SECOND / BARKOS_PIXEL_TILE_SIZE) * dt
  const progress = Math.min(avatar.moveProgress, 1)
  avatar.x = from.x + (to.x - from.x) * progress
  avatar.y = from.y + (to.y - from.y) * progress
  if (avatar.moveProgress < 1) {
    return
  }
  avatar.tileCol = next.col
  avatar.tileRow = next.row
  avatar.x = to.x
  avatar.y = to.y
  avatar.path.shift()
  avatar.moveProgress = 0
}

export function updateBarkosPixelOfficeAvatar(args: {
  avatar: BarkosPixelOfficeAvatar
  worker: BarkosLiveOfficeWorker
  dt: number
  motionEnabled: boolean
}): void {
  const { avatar, worker } = args
  const active = isBarkosPixelOfficeWorkerActive(worker.status)
  const anchored = active || worker.status === 'blocked' || worker.status === 'waiting'
  const statusChanged = avatar.status !== worker.status
  avatar.status = worker.status

  if (anchored) {
    setDestination(
      avatar,
      barkosPixelOfficeStationTile(worker.station, hashWorkerId(worker.workerId), avatar.seat)
    )
  } else if (statusChanged || (avatar.path.length === 0 && avatar.wanderElapsed <= 0)) {
    avatar.wanderStep += 1
    setDestination(avatar, barkosPixelOfficeWanderTile(avatar.wanderStep))
    avatar.wanderElapsed = 2.8 + (avatar.wanderStep % 4) * 0.7
  }

  moveAvatar(avatar, args.dt, args.motionEnabled)
  if (avatar.path.length > 0) {
    avatar.mode = 'walk'
  } else {
    avatar.direction = active ? 'up' : 'down'
    avatar.mode = desiredMode(worker)
    avatar.wanderElapsed -= args.dt
  }

  avatar.frameElapsed += args.dt
  const frameDuration = avatar.mode === 'walk' ? 0.16 : 0.28
  if (avatar.frameElapsed >= frameDuration) {
    avatar.frameElapsed %= frameDuration
    avatar.frame += 1
  }
}

export function syncBarkosPixelOfficeAvatars(args: {
  avatars: Map<string, BarkosPixelOfficeAvatar>
  workers: readonly BarkosLiveOfficeWorker[]
}): void {
  const liveWorkerIds = new Set(args.workers.map((worker) => worker.workerId))
  for (const workerId of args.avatars.keys()) {
    if (!liveWorkerIds.has(workerId)) {
      args.avatars.delete(workerId)
    }
  }
  args.workers.forEach((worker, index) => {
    const avatar = args.avatars.get(worker.workerId)
    if (!avatar) {
      args.avatars.set(worker.workerId, createBarkosPixelOfficeAvatar(worker, index))
      return
    }
    avatar.seat = barkosPixelOfficeSeat(index)
  })
}

export function barkosPixelSpriteFrame(avatar: BarkosPixelOfficeAvatar): {
  column: number
  row: number
  flip: boolean
} {
  const row = avatar.direction === 'down' ? 0 : avatar.direction === 'up' ? 1 : 2
  if (avatar.mode === 'type') {
    return { column: 3 + (avatar.frame % 2), row, flip: false }
  }
  if (avatar.mode === 'read') {
    return { column: 5 + (avatar.frame % 2), row, flip: false }
  }
  if (avatar.mode === 'walk') {
    const sequence = [0, 1, 2, 1]
    return {
      column: sequence[avatar.frame % sequence.length],
      row,
      flip: avatar.direction === 'left'
    }
  }
  return { column: 1, row, flip: avatar.direction === 'left' }
}
