import { TileType, FurnitureType, TILE_SIZE, Direction } from '../types.js'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture, Seat, FurnitureInstance, FloorColor } from '../types.js'
import { getCatalogEntry } from './furnitureCatalog.js'
import { getColorizedSprite } from '../colorize.js'

/** Convert flat tile array from layout into 2D grid */
export function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][] {
  const map: TileTypeVal[][] = []
  for (let r = 0; r < layout.rows; r++) {
    const row: TileTypeVal[] = []
    for (let c = 0; c < layout.cols; c++) {
      row.push(layout.tiles[r * layout.cols + c])
    }
    map.push(row)
  }
  return map
}

/** Convert placed furniture into renderable FurnitureInstance[] */
export function layoutToFurnitureInstances(furniture: PlacedFurniture[]): FurnitureInstance[] {
  // Pre-compute desk zY per tile so surface items can sort in front of desks
  const deskZByTile = new Map<string, number>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    const deskZY = item.row * TILE_SIZE + entry.sprite.length
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        const prev = deskZByTile.get(key)
        if (prev === undefined || deskZY > prev) deskZByTile.set(key, deskZY)
      }
    }
  }

  const instances: FurnitureInstance[] = []
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const x = item.col * TILE_SIZE
    const y = item.row * TILE_SIZE
    const spriteH = entry.sprite.length
    let zY = y + spriteH

    // Chair z-sorting: ensure characters sitting on chairs render correctly
    if (entry.category === 'chairs') {
      if (entry.orientation === 'back') {
        // Back-facing chairs render IN FRONT of the seated character
        // (the chair back visually occludes the character behind it)
        zY = (item.row + 1) * TILE_SIZE + 1
      } else {
        // All other chairs: cap zY to first row bottom so characters
        // at any seat tile render in front of the chair
        zY = (item.row + 1) * TILE_SIZE
      }
    }

    // Surface items render in front of the desk they sit on
    if (entry.canPlaceOnSurfaces) {
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          const deskZ = deskZByTile.get(`${item.col + dc},${item.row + dr}`)
          if (deskZ !== undefined && deskZ + 0.5 > zY) zY = deskZ + 0.5
        }
      }
    }

    // Colorize sprite if this furniture has a color override
    let sprite = entry.sprite
    if (item.color) {
      const { h, s, b: bv, c: cv } = item.color
      sprite = getColorizedSprite(`furn-${item.type}-${h}-${s}-${bv}-${cv}-${item.color.colorize ? 1 : 0}`, entry.sprite, item.color)
    }

    instances.push({ sprite, x, y, zY })
  }
  return instances
}

/** Get all tiles blocked by furniture footprints, optionally excluding a set of tiles.
 *  Skips top backgroundTiles rows so characters can walk through them. */
export function getBlockedTiles(furniture: PlacedFurniture[], excludeTiles?: Set<string>): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows — characters can walk through
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        if (excludeTiles && excludeTiles.has(key)) continue
        tiles.add(key)
      }
    }
  }
  return tiles
}

/** Get tiles blocked for placement purposes — skips top backgroundTiles rows per item */
export function getPlacementBlockedTiles(furniture: PlacedFurniture[], excludeUid?: string): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    if (item.uid === excludeUid) continue
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows
      for (let dc = 0; dc < entry.footprintW; dc++) {
        tiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }
  return tiles
}

/** Map chair orientation to character facing direction */
function orientationToFacing(orientation: string): Direction {
  switch (orientation) {
    case 'front': return Direction.DOWN
    case 'back': return Direction.UP
    case 'left': return Direction.LEFT
    case 'right': return Direction.RIGHT
    default: return Direction.DOWN
  }
}

/** Generate seats from chair furniture.
 *  Facing priority: 1) chair orientation, 2) adjacent desk, 3) forward (DOWN). */
export function layoutToSeats(furniture: PlacedFurniture[]): Map<string, Seat> {
  const seats = new Map<string, Seat>()

  // Build set of all desk tiles
  const deskTiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        deskTiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }

  const dirs: Array<{ dc: number; dr: number; facing: Direction }> = [
    { dc: 0, dr: -1, facing: Direction.UP },    // desk is above chair → face UP
    { dc: 0, dr: 1, facing: Direction.DOWN },   // desk is below chair → face DOWN
    { dc: -1, dr: 0, facing: Direction.LEFT },   // desk is left of chair → face LEFT
    { dc: 1, dr: 0, facing: Direction.RIGHT },   // desk is right of chair → face RIGHT
  ]

  // For each chair, every footprint tile becomes a seat.
  // Multi-tile chairs (e.g. 2-tile couches) produce multiple seats.
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || entry.category !== 'chairs') continue

    let seatCount = 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const tileCol = item.col + dc
        const tileRow = item.row + dr

        // Determine facing direction:
        // 1) Chair orientation takes priority
        // 2) Adjacent desk direction
        // 3) Default forward (DOWN)
        let facingDir: Direction = Direction.DOWN
        if (entry.orientation) {
          facingDir = orientationToFacing(entry.orientation)
        } else {
          for (const d of dirs) {
            if (deskTiles.has(`${tileCol + d.dc},${tileRow + d.dr}`)) {
              facingDir = d.facing
              break
            }
          }
        }

        // First seat uses chair uid (backward compat), subsequent use uid:N
        const seatUid = seatCount === 0 ? item.uid : `${item.uid}:${seatCount}`
        seats.set(seatUid, {
          uid: seatUid,
          seatCol: tileCol,
          seatRow: tileRow,
          facingDir,
          assigned: false,
        })
        seatCount++
      }
    }
  }

  return seats
}

/** Get the set of tiles occupied by seats (so they can be excluded from blocked tiles) */
export function getSeatTiles(seats: Map<string, Seat>): Set<string> {
  const tiles = new Set<string>()
  for (const seat of seats.values()) {
    tiles.add(`${seat.seatCol},${seat.seatRow}`)
  }
  return tiles
}

// ── Layout helpers ─────────────────────────────────────────────

/** Fill a rectangular region of the flat tile/color arrays */
function fillRect(
  tiles: TileTypeVal[], tileColors: Array<FloorColor | null>,
  cols: number,
  c1: number, r1: number, c2: number, r2: number,
  tile: TileTypeVal, color: FloorColor | null,
): void {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const idx = r * cols + c
      tiles[idx] = tile
      tileColors[idx] = color
    }
  }
}

/** Create a grid filled entirely with walls */
function createWallGrid(cols: number, rows: number): { tiles: TileTypeVal[]; tileColors: Array<FloorColor | null> } {
  return {
    tiles: new Array<TileTypeVal>(cols * rows).fill(TileType.WALL),
    tileColors: new Array<FloorColor | null>(cols * rows).fill(null),
  }
}

// ── Layout templates ──────────────────────────────────────────

/** Layout A: Two-Room Office (20×11) — two rooms with dividing wall and doorway */
function createTwoRoomLayout(): OfficeLayout {
  const cols = 20, rows = 11
  const { tiles, tileColors } = createWallGrid(cols, rows)

  const beige: FloorColor = { h: 35, s: 30, b: 15, c: 0 }
  const brown: FloorColor = { h: 25, s: 45, b: 5, c: 10 }
  const carpet: FloorColor = { h: 280, s: 40, b: -5, c: 0 }
  const doorway: FloorColor = { h: 35, s: 25, b: 10, c: 0 }

  // Left room
  fillRect(tiles, tileColors, cols, 1, 1, 9, 9, TileType.FLOOR_1, beige)
  // Right room
  fillRect(tiles, tileColors, cols, 11, 1, 18, 9, TileType.FLOOR_2, brown)
  // Doorway (col 10, rows 4-6)
  fillRect(tiles, tileColors, cols, 10, 4, 10, 6, TileType.FLOOR_4, doorway)
  // Carpet area in right room
  fillRect(tiles, tileColors, cols, 15, 7, 18, 9, TileType.FLOOR_3, carpet)

  const furniture: PlacedFurniture[] = [
    { uid: 'desk-left', type: FurnitureType.DESK, col: 4, row: 3 },
    { uid: 'desk-right', type: FurnitureType.DESK, col: 13, row: 3 },
    { uid: 'bookshelf-1', type: FurnitureType.BOOKSHELF, col: 1, row: 5 },
    { uid: 'plant-left', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'cooler-1', type: FurnitureType.COOLER, col: 17, row: 7 },
    { uid: 'plant-right', type: FurnitureType.PLANT, col: 18, row: 1 },
    { uid: 'whiteboard-1', type: FurnitureType.WHITEBOARD, col: 15, row: 0 },
    // Left desk chairs
    { uid: 'chair-l-top', type: FurnitureType.CHAIR, col: 4, row: 2 },
    { uid: 'chair-l-bottom', type: FurnitureType.CHAIR, col: 5, row: 5 },
    { uid: 'chair-l-left', type: FurnitureType.CHAIR, col: 3, row: 4 },
    { uid: 'chair-l-right', type: FurnitureType.CHAIR, col: 6, row: 3 },
    // Right desk chairs
    { uid: 'chair-r-top', type: FurnitureType.CHAIR, col: 13, row: 2 },
    { uid: 'chair-r-bottom', type: FurnitureType.CHAIR, col: 14, row: 5 },
    { uid: 'chair-r-left', type: FurnitureType.CHAIR, col: 12, row: 4 },
    { uid: 'chair-r-right', type: FurnitureType.CHAIR, col: 15, row: 3 },
  ]

  return { version: 1, cols, rows, tiles, tileColors, furniture }
}

/** Layout B: Open Plan (18×12) — single room with two desk clusters */
function createOpenPlanLayout(): OfficeLayout {
  const cols = 18, rows = 12
  const { tiles, tileColors } = createWallGrid(cols, rows)

  const blueGray: FloorColor = { h: 210, s: 20, b: 10, c: 0 }
  const teal: FloorColor = { h: 170, s: 30, b: -5, c: 0 }

  // Main floor
  fillRect(tiles, tileColors, cols, 1, 1, 16, 10, TileType.FLOOR_2, blueGray)
  // Break zone carpet (bottom-right)
  fillRect(tiles, tileColors, cols, 12, 8, 15, 10, TileType.FLOOR_3, teal)

  const furniture: PlacedFurniture[] = [
    // Desk A (left area)
    { uid: 'desk-a', type: FurnitureType.DESK, col: 3, row: 3 },
    { uid: 'chair-a1', type: FurnitureType.CHAIR, col: 3, row: 2 },
    { uid: 'chair-a2', type: FurnitureType.CHAIR, col: 4, row: 5 },
    { uid: 'chair-a3', type: FurnitureType.CHAIR, col: 2, row: 4 },
    { uid: 'chair-a4', type: FurnitureType.CHAIR, col: 5, row: 3 },
    // Desk B (right area)
    { uid: 'desk-b', type: FurnitureType.DESK, col: 11, row: 3 },
    { uid: 'chair-b1', type: FurnitureType.CHAIR, col: 11, row: 2 },
    { uid: 'chair-b2', type: FurnitureType.CHAIR, col: 12, row: 5 },
    { uid: 'chair-b3', type: FurnitureType.CHAIR, col: 10, row: 4 },
    { uid: 'chair-b4', type: FurnitureType.CHAIR, col: 13, row: 3 },
    // Decor
    { uid: 'bookshelf-1', type: FurnitureType.BOOKSHELF, col: 1, row: 1 },
    { uid: 'bookshelf-2', type: FurnitureType.BOOKSHELF, col: 7, row: 1 },
    { uid: 'plant-1', type: FurnitureType.PLANT, col: 16, row: 1 },
    { uid: 'plant-2', type: FurnitureType.PLANT, col: 1, row: 9 },
    { uid: 'plant-3', type: FurnitureType.PLANT, col: 8, row: 8 },
    { uid: 'cooler-1', type: FurnitureType.COOLER, col: 15, row: 9 },
    { uid: 'whiteboard-1', type: FurnitureType.WHITEBOARD, col: 7, row: 0 },
    { uid: 'lamp-1', type: FurnitureType.LAMP, col: 12, row: 8 },
    { uid: 'pc-1', type: FurnitureType.PC, col: 6, row: 7 },
  ]

  return { version: 1, cols, rows, tiles, tileColors, furniture }
}

/** Layout C: Compact Studio (14×10) — small focused workspace */
function createCompactLayout(): OfficeLayout {
  const cols = 14, rows = 10
  const { tiles, tileColors } = createWallGrid(cols, rows)

  const sage: FloorColor = { h: 120, s: 25, b: 10, c: 0 }
  const honey: FloorColor = { h: 45, s: 35, b: 5, c: 0 }

  // Main floor
  fillRect(tiles, tileColors, cols, 1, 1, 12, 8, TileType.FLOOR_1, sage)
  // Warm carpet zone (center-bottom)
  fillRect(tiles, tileColors, cols, 5, 6, 8, 8, TileType.FLOOR_5, honey)

  const furniture: PlacedFurniture[] = [
    // Desk A (left)
    { uid: 'desk-a', type: FurnitureType.DESK, col: 2, row: 2 },
    { uid: 'chair-a1', type: FurnitureType.CHAIR, col: 2, row: 1 },
    { uid: 'chair-a2', type: FurnitureType.CHAIR, col: 3, row: 4 },
    { uid: 'chair-a3', type: FurnitureType.CHAIR, col: 1, row: 3 },
    { uid: 'chair-a4', type: FurnitureType.CHAIR, col: 4, row: 2 },
    // Desk B (right)
    { uid: 'desk-b', type: FurnitureType.DESK, col: 8, row: 2 },
    { uid: 'chair-b1', type: FurnitureType.CHAIR, col: 8, row: 1 },
    { uid: 'chair-b2', type: FurnitureType.CHAIR, col: 9, row: 4 },
    { uid: 'chair-b3', type: FurnitureType.CHAIR, col: 7, row: 3 },
    { uid: 'chair-b4', type: FurnitureType.CHAIR, col: 10, row: 2 },
    // Decor
    { uid: 'bookshelf-1', type: FurnitureType.BOOKSHELF, col: 12, row: 1 },
    { uid: 'plant-1', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'plant-2', type: FurnitureType.PLANT, col: 12, row: 7 },
    { uid: 'cooler-1', type: FurnitureType.COOLER, col: 1, row: 7 },
    { uid: 'whiteboard-1', type: FurnitureType.WHITEBOARD, col: 5, row: 0 },
    { uid: 'lamp-1', type: FurnitureType.LAMP, col: 6, row: 6 },
  ]

  return { version: 1, cols, rows, tiles, tileColors, furniture }
}

/** Layout D: Conference Room (16×10) — central table with chairs around it */
function createConferenceLayout(): OfficeLayout {
  const cols = 16, rows = 10
  const { tiles, tileColors } = createWallGrid(cols, rows)

  const warm: FloorColor = { h: 30, s: 15, b: 20, c: 5 }

  // Single open room
  fillRect(tiles, tileColors, cols, 1, 1, 14, 8, TileType.FLOOR_4, warm)

  const furniture: PlacedFurniture[] = [
    // Central conference table (two desks side by side = 4×2)
    { uid: 'desk-a', type: FurnitureType.DESK, col: 5, row: 3 },
    { uid: 'desk-b', type: FurnitureType.DESK, col: 7, row: 3 },
    // Chairs along top
    { uid: 'chair-t1', type: FurnitureType.CHAIR, col: 5, row: 2 },
    { uid: 'chair-t2', type: FurnitureType.CHAIR, col: 6, row: 2 },
    { uid: 'chair-t3', type: FurnitureType.CHAIR, col: 7, row: 2 },
    { uid: 'chair-t4', type: FurnitureType.CHAIR, col: 8, row: 2 },
    // Chairs along bottom
    { uid: 'chair-b1', type: FurnitureType.CHAIR, col: 5, row: 5 },
    { uid: 'chair-b2', type: FurnitureType.CHAIR, col: 6, row: 5 },
    { uid: 'chair-b3', type: FurnitureType.CHAIR, col: 7, row: 5 },
    { uid: 'chair-b4', type: FurnitureType.CHAIR, col: 8, row: 5 },
    // Chairs on sides
    { uid: 'chair-l1', type: FurnitureType.CHAIR, col: 4, row: 3 },
    { uid: 'chair-l2', type: FurnitureType.CHAIR, col: 4, row: 4 },
    { uid: 'chair-r1', type: FurnitureType.CHAIR, col: 9, row: 3 },
    { uid: 'chair-r2', type: FurnitureType.CHAIR, col: 9, row: 4 },
    // Decor
    { uid: 'plant-1', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'plant-2', type: FurnitureType.PLANT, col: 14, row: 1 },
    { uid: 'plant-3', type: FurnitureType.PLANT, col: 1, row: 8 },
    { uid: 'plant-4', type: FurnitureType.PLANT, col: 14, row: 8 },
    { uid: 'whiteboard-1', type: FurnitureType.WHITEBOARD, col: 6, row: 0 },
    { uid: 'bookshelf-1', type: FurnitureType.BOOKSHELF, col: 1, row: 3 },
    { uid: 'cooler-1', type: FurnitureType.COOLER, col: 14, row: 6 },
    { uid: 'lamp-1', type: FurnitureType.LAMP, col: 2, row: 6 },
  ]

  return { version: 1, cols, rows, tiles, tileColors, furniture }
}

/** Layout E: Three-Zone Office (22×11) — work zone, transition, lounge */
function createThreeZoneLayout(): OfficeLayout {
  const cols = 22, rows = 11
  const { tiles, tileColors } = createWallGrid(cols, rows)

  const beige: FloorColor = { h: 35, s: 30, b: 15, c: 0 }
  const gray: FloorColor = { h: 240, s: 10, b: 15, c: 0 }
  const green: FloorColor = { h: 150, s: 35, b: 0, c: 0 }

  // Work zone (left)
  fillRect(tiles, tileColors, cols, 1, 1, 8, 9, TileType.FLOOR_1, beige)
  // Transition zone (center)
  fillRect(tiles, tileColors, cols, 9, 1, 13, 9, TileType.FLOOR_2, gray)
  // Lounge zone (right)
  fillRect(tiles, tileColors, cols, 14, 1, 20, 9, TileType.FLOOR_3, green)

  const furniture: PlacedFurniture[] = [
    // Work zone — two desks
    { uid: 'desk-a', type: FurnitureType.DESK, col: 2, row: 2 },
    { uid: 'chair-a1', type: FurnitureType.CHAIR, col: 2, row: 1 },
    { uid: 'chair-a2', type: FurnitureType.CHAIR, col: 3, row: 4 },
    { uid: 'chair-a3', type: FurnitureType.CHAIR, col: 1, row: 3 },
    { uid: 'chair-a4', type: FurnitureType.CHAIR, col: 4, row: 2 },
    { uid: 'desk-b', type: FurnitureType.DESK, col: 5, row: 5 },
    { uid: 'chair-b1', type: FurnitureType.CHAIR, col: 5, row: 4 },
    { uid: 'chair-b2', type: FurnitureType.CHAIR, col: 6, row: 7 },
    { uid: 'chair-b3', type: FurnitureType.CHAIR, col: 4, row: 6 },
    { uid: 'chair-b4', type: FurnitureType.CHAIR, col: 7, row: 5 },
    // Transition zone
    { uid: 'bookshelf-1', type: FurnitureType.BOOKSHELF, col: 10, row: 1 },
    { uid: 'pc-1', type: FurnitureType.PC, col: 10, row: 7 },
    { uid: 'lamp-1', type: FurnitureType.LAMP, col: 12, row: 5 },
    // Lounge zone — one casual desk
    { uid: 'desk-c', type: FurnitureType.DESK, col: 16, row: 4 },
    { uid: 'chair-c1', type: FurnitureType.CHAIR, col: 16, row: 3 },
    { uid: 'chair-c2', type: FurnitureType.CHAIR, col: 17, row: 6 },
    { uid: 'chair-c3', type: FurnitureType.CHAIR, col: 15, row: 5 },
    { uid: 'chair-c4', type: FurnitureType.CHAIR, col: 18, row: 4 },
    { uid: 'plant-1', type: FurnitureType.PLANT, col: 15, row: 1 },
    { uid: 'plant-2', type: FurnitureType.PLANT, col: 20, row: 1 },
    { uid: 'plant-3', type: FurnitureType.PLANT, col: 15, row: 8 },
    { uid: 'cooler-1', type: FurnitureType.COOLER, col: 18, row: 7 },
    { uid: 'whiteboard-1', type: FurnitureType.WHITEBOARD, col: 16, row: 0 },
  ]

  return { version: 1, cols, rows, tiles, tileColors, furniture }
}

// ── Layout template registry ──────────────────────────────────

const LAYOUT_TEMPLATES = [
  createTwoRoomLayout,
  createOpenPlanLayout,
  createCompactLayout,
  createConferenceLayout,
  createThreeZoneLayout,
]

/** Create a default office layout, randomly chosen from available templates */
export function createDefaultLayout(): OfficeLayout {
  const pick = Math.floor(Math.random() * LAYOUT_TEMPLATES.length)
  return LAYOUT_TEMPLATES[pick]()
}

/** Serialize layout to JSON string */
export function serializeLayout(layout: OfficeLayout): string {
  return JSON.stringify(layout)
}

/** Deserialize layout from JSON string, migrating old tile types if needed */
export function deserializeLayout(json: string): OfficeLayout | null {
  try {
    const obj = JSON.parse(json)
    if (obj && obj.version === 1 && Array.isArray(obj.tiles) && Array.isArray(obj.furniture)) {
      return migrateLayout(obj as OfficeLayout)
    }
  } catch { /* ignore parse errors */ }
  return null
}

/**
 * Ensure layout has tileColors. If missing, generate defaults based on tile types.
 * Exported for use by message handlers that receive layouts over the wire.
 */
export function migrateLayoutColors(layout: OfficeLayout): OfficeLayout {
  return migrateLayout(layout)
}

/**
 * Migrate old layouts that use legacy tile types (TILE_FLOOR=1, WOOD_FLOOR=2, CARPET=3, DOORWAY=4)
 * to the new pattern-based system. If tileColors is already present, no migration needed.
 */
function migrateLayout(layout: OfficeLayout): OfficeLayout {
  if (layout.tileColors && layout.tileColors.length === layout.tiles.length) {
    return layout // Already migrated
  }

  // Legacy color mappings for migration (these were the original default colors)
  const legacyColors: Record<number, FloorColor> = {
    1: { h: 35, s: 30, b: 15, c: 0 },   // TILE_FLOOR → beige
    2: { h: 25, s: 45, b: 5, c: 10 },    // WOOD_FLOOR → brown
    3: { h: 280, s: 40, b: -5, c: 0 },   // CARPET → purple
    4: { h: 35, s: 25, b: 10, c: 0 },    // DOORWAY → tan
  }

  const tileColors: Array<FloorColor | null> = []
  for (const tile of layout.tiles) {
    if (tile === 0) {
      tileColors.push(null)
    } else if (legacyColors[tile]) {
      tileColors.push(legacyColors[tile])
    } else {
      tileColors.push(tile > 0 ? { h: 0, s: 0, b: 0, c: 0 } : null)
    }
  }

  return { ...layout, tileColors }
}
