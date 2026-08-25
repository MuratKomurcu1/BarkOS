import type { BarkosLiveOfficeStation } from '@/lib/barkos-live-office'

export const BARKOS_PIXEL_TILE_SIZE = 16
export const BARKOS_PIXEL_OFFICE_COLUMNS = 40
export const BARKOS_PIXEL_OFFICE_ROWS = 18
export const BARKOS_PIXEL_OFFICE_WIDTH = BARKOS_PIXEL_OFFICE_COLUMNS * BARKOS_PIXEL_TILE_SIZE
export const BARKOS_PIXEL_OFFICE_HEIGHT = BARKOS_PIXEL_OFFICE_ROWS * BARKOS_PIXEL_TILE_SIZE

export type BarkosPixelTile = {
  col: number
  row: number
}

export type BarkosPixelOfficeSeat = BarkosPixelTile & {
  x: number
  y: number
}

const SEAT_TILES: readonly BarkosPixelTile[] = [
  { col: 4, row: 7 },
  { col: 9, row: 7 },
  { col: 14, row: 7 },
  { col: 25, row: 7 },
  { col: 30, row: 7 },
  { col: 35, row: 7 },
  { col: 4, row: 14 },
  { col: 9, row: 14 },
  { col: 14, row: 14 },
  { col: 25, row: 14 },
  { col: 30, row: 14 },
  { col: 35, row: 14 }
]

const LOUNGE_BLOCKS: readonly BarkosPixelTile[] = [
  { col: 18, row: 9 },
  { col: 19, row: 9 },
  { col: 21, row: 10 },
  { col: 22, row: 10 }
]

export function barkosPixelTileCenter(tile: BarkosPixelTile): { x: number; y: number } {
  return {
    x: tile.col * BARKOS_PIXEL_TILE_SIZE + BARKOS_PIXEL_TILE_SIZE / 2,
    y: tile.row * BARKOS_PIXEL_TILE_SIZE + BARKOS_PIXEL_TILE_SIZE / 2
  }
}

export function barkosPixelOfficeSeat(index: number): BarkosPixelOfficeSeat {
  const tile = SEAT_TILES[index % SEAT_TILES.length]
  return { ...tile, ...barkosPixelTileCenter(tile) }
}

export function barkosPixelOfficeEntrance(offset = 0): BarkosPixelTile {
  return { col: 19 + (offset % 2), row: BARKOS_PIXEL_OFFICE_ROWS - 1 }
}

const STATION_TILES: Readonly<
  Record<Exclude<BarkosLiveOfficeStation, 'implementation'>, readonly BarkosPixelTile[]>
> = {
  analysis: [
    { col: 5, row: 3 },
    { col: 10, row: 3 },
    { col: 15, row: 3 }
  ],
  research: [
    { col: 3, row: 10 },
    { col: 8, row: 10 },
    { col: 13, row: 10 }
  ],
  planning: [
    { col: 18, row: 7 },
    { col: 20, row: 7 },
    { col: 22, row: 7 }
  ],
  verification: [
    { col: 26, row: 3 },
    { col: 31, row: 3 },
    { col: 36, row: 3 }
  ],
  review: [
    { col: 26, row: 10 },
    { col: 31, row: 10 },
    { col: 36, row: 10 }
  ],
  communication: [
    { col: 17, row: 13 },
    { col: 20, row: 15 },
    { col: 23, row: 13 }
  ]
}

export function barkosPixelOfficeStationTile(
  station: BarkosLiveOfficeStation,
  offset: number,
  seat: BarkosPixelOfficeSeat
): BarkosPixelTile {
  if (station === 'implementation') {
    return seat
  }
  const candidates = STATION_TILES[station]
  return candidates[offset % candidates.length]
}

export function barkosPixelOfficeBlockedTiles(): Set<string> {
  const blocked = new Set<string>()
  for (let col = 0; col < BARKOS_PIXEL_OFFICE_COLUMNS; col += 1) {
    blocked.add(`${col},0`)
    if (col !== 19 && col !== 20) {
      blocked.add(`${col},${BARKOS_PIXEL_OFFICE_ROWS - 1}`)
    }
  }
  for (let row = 0; row < BARKOS_PIXEL_OFFICE_ROWS; row += 1) {
    blocked.add(`0,${row}`)
    blocked.add(`${BARKOS_PIXEL_OFFICE_COLUMNS - 1},${row}`)
  }
  for (const seat of SEAT_TILES) {
    for (let row = seat.row - 2; row < seat.row; row += 1) {
      for (let col = seat.col - 1; col <= seat.col + 1; col += 1) {
        blocked.add(`${col},${row}`)
      }
    }
  }
  for (const tile of LOUNGE_BLOCKS) {
    blocked.add(`${tile.col},${tile.row}`)
  }
  return blocked
}

export function isBarkosPixelOfficeTileWalkable(
  tile: BarkosPixelTile,
  blocked = barkosPixelOfficeBlockedTiles()
): boolean {
  return (
    tile.col >= 0 &&
    tile.col < BARKOS_PIXEL_OFFICE_COLUMNS &&
    tile.row >= 0 &&
    tile.row < BARKOS_PIXEL_OFFICE_ROWS &&
    !blocked.has(`${tile.col},${tile.row}`)
  )
}

export function findBarkosPixelOfficePath(
  start: BarkosPixelTile,
  end: BarkosPixelTile,
  blocked = barkosPixelOfficeBlockedTiles()
): BarkosPixelTile[] {
  if (start.col === end.col && start.row === end.row) {
    return []
  }
  if (!isBarkosPixelOfficeTileWalkable(end, blocked)) {
    return []
  }

  const key = (tile: BarkosPixelTile): string => `${tile.col},${tile.row}`
  const startKey = key(start)
  const endKey = key(end)
  const visited = new Set([startKey])
  const parents = new Map<string, string>()
  const queue: BarkosPixelTile[] = [start]
  const directions = [
    { col: 0, row: -1 },
    { col: 0, row: 1 },
    { col: -1, row: 0 },
    { col: 1, row: 0 }
  ]

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]
    const currentKey = key(current)
    if (currentKey === endKey) {
      const path: BarkosPixelTile[] = []
      let stepKey = endKey
      while (stepKey !== startKey) {
        const [col, row] = stepKey.split(',').map(Number)
        path.unshift({ col, row })
        const parent = parents.get(stepKey)
        if (!parent) {
          return []
        }
        stepKey = parent
      }
      return path
    }
    for (const direction of directions) {
      const next = {
        col: current.col + direction.col,
        row: current.row + direction.row
      }
      const nextKey = key(next)
      if (visited.has(nextKey) || !isBarkosPixelOfficeTileWalkable(next, blocked)) {
        continue
      }
      visited.add(nextKey)
      parents.set(nextKey, currentKey)
      queue.push(next)
    }
  }
  return []
}

export function barkosPixelOfficeWanderTile(step: number): BarkosPixelTile {
  const tiles = [
    { col: 20, row: 7 },
    { col: 17, row: 11 },
    { col: 23, row: 12 },
    { col: 2, row: 16 },
    { col: 37, row: 16 },
    { col: 20, row: 15 },
    { col: 17, row: 3 },
    { col: 22, row: 3 }
  ]
  return tiles[step % tiles.length]
}
