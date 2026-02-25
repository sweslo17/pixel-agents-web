import type { LobbyLayout, LobbyRoom } from './lobbyState.js'
import {
  LOBBY_TILE_SIZE,
  LOBBY_BG_COLOR,
  LOBBY_WALL_COLOR,
  LOBBY_ROOM_FLOOR_COLOR,
  LOBBY_HIGHLIGHT_COLOR,
  LOBBY_AGENT_COLORS,
  LOBBY_TITLE_COLOR,
  LOBBY_TEXT_COLOR,
  LOBBY_DIM_TEXT_COLOR,
  LOBBY_DOOR_WIDTH_TILES,
  LOBBY_TITLE_FONT_MIN_PX,
  LOBBY_TITLE_FONT_FACTOR,
  LOBBY_ROOM_NAME_FONT_MIN_PX,
  LOBBY_ROOM_NAME_FONT_FACTOR,
  LOBBY_ROOM_NAME_GAP_FACTOR,
  LOBBY_EMPTY_LABEL_FONT_MIN_PX,
  LOBBY_EMPTY_LABEL_FONT_FACTOR,
  LOBBY_DOT_SIZE_MIN_PX,
  LOBBY_DOT_SIZE_FACTOR,
  LOBBY_DOT_SPACING_FACTOR,
  LOBBY_DOT_MARGIN_FACTOR,
  LOBBY_DOT_HEAD_FACTOR,
  LOBBY_DOT_HEAD_Y_FACTOR,
  LOBBY_DOT_BODY_W_FACTOR,
  LOBBY_HINT_FONT_MIN_PX,
  LOBBY_HINT_FONT_FACTOR,
  LOBBY_HINT_BOTTOM_GAP_FACTOR,
  LOBBY_TITLE_Y_OFFSET_PX,
} from '../constants.js'

export function renderLobby(
  ctx: CanvasRenderingContext2D,
  layout: LobbyLayout,
  zoom: number,
  hoveredRoom: string | null,
  offsetX: number,
  offsetY: number,
): void {
  const w = ctx.canvas.width
  const h = ctx.canvas.height

  // Clear
  ctx.fillStyle = LOBBY_BG_COLOR
  ctx.fillRect(0, 0, w, h)

  ctx.save()

  // Draw title
  renderTitle(ctx, layout, zoom, offsetX, offsetY)

  // Draw each room
  for (const room of layout.rooms) {
    renderRoom(ctx, room, zoom, hoveredRoom === room.projectHash, offsetX, offsetY)
  }

  ctx.restore()
}

function renderTitle(
  ctx: CanvasRenderingContext2D,
  layout: LobbyLayout,
  zoom: number,
  offsetX: number,
  offsetY: number,
): void {
  const centerX = offsetX + (layout.totalWidth * zoom) / 2
  const y = offsetY + LOBBY_TITLE_Y_OFFSET_PX * zoom
  ctx.fillStyle = LOBBY_TITLE_COLOR
  ctx.font = `bold ${Math.max(LOBBY_TITLE_FONT_MIN_PX, LOBBY_TITLE_FONT_FACTOR * zoom)}px "FS Pixel Sans", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('PIXEL AGENTS HQ', centerX, y)
}

function renderRoom(
  ctx: CanvasRenderingContext2D,
  room: LobbyRoom,
  zoom: number,
  isHovered: boolean,
  offsetX: number,
  offsetY: number,
): void {
  const x = offsetX + room.x * zoom
  const y = offsetY + room.y * zoom
  const w = room.width * zoom
  const h = room.height * zoom

  // Room floor
  ctx.fillStyle = LOBBY_ROOM_FLOOR_COLOR
  ctx.fillRect(x, y, w, h)

  // Room walls (border)
  ctx.strokeStyle = LOBBY_WALL_COLOR
  ctx.lineWidth = Math.max(1, zoom)
  ctx.strokeRect(x, y, w, h)

  // Door (bottom center gap)
  const doorW = LOBBY_TILE_SIZE * LOBBY_DOOR_WIDTH_TILES * zoom
  const doorX = x + (w - doorW) / 2
  ctx.fillStyle = LOBBY_BG_COLOR
  ctx.fillRect(doorX, y + h - Math.max(1, zoom), doorW, Math.max(2, zoom * 2))

  // Room name (above room)
  ctx.fillStyle = room.agentCount > 0 ? LOBBY_TEXT_COLOR : LOBBY_DIM_TEXT_COLOR
  ctx.font = `${Math.max(LOBBY_ROOM_NAME_FONT_MIN_PX, LOBBY_ROOM_NAME_FONT_FACTOR * zoom)}px "FS Pixel Sans", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(room.displayName, x + w / 2, y - LOBBY_ROOM_NAME_GAP_FACTOR * zoom)

  // Agent silhouettes (simple colored pixel figures inside the room)
  const dotSize = Math.max(LOBBY_DOT_SIZE_MIN_PX, LOBBY_TILE_SIZE * LOBBY_DOT_SIZE_FACTOR * zoom)
  const maxDotsPerRow = Math.floor((w - dotSize * LOBBY_DOT_MARGIN_FACTOR) / (dotSize * LOBBY_DOT_SPACING_FACTOR))
  for (let i = 0; i < room.agentCount; i++) {
    const col = i % maxDotsPerRow
    const row = Math.floor(i / maxDotsPerRow)
    const dotX = x + dotSize * LOBBY_DOT_MARGIN_FACTOR + col * dotSize * LOBBY_DOT_SPACING_FACTOR
    const dotY = y + h / 2 + row * dotSize * LOBBY_DOT_SPACING_FACTOR - (room.agentCount > maxDotsPerRow ? dotSize : 0)
    ctx.fillStyle = LOBBY_AGENT_COLORS[i % LOBBY_AGENT_COLORS.length]
    // Head
    const headSize = dotSize * LOBBY_DOT_HEAD_FACTOR
    ctx.fillRect(dotX - headSize / 2, dotY - dotSize * LOBBY_DOT_HEAD_Y_FACTOR, headSize, headSize)
    // Body
    ctx.fillRect(dotX - dotSize * LOBBY_DOT_BODY_W_FACTOR, dotY, dotSize * LOBBY_DOT_BODY_W_FACTOR * 2, dotSize)
  }

  // Empty room label
  if (room.agentCount === 0) {
    ctx.fillStyle = LOBBY_DIM_TEXT_COLOR
    ctx.font = `${Math.max(LOBBY_EMPTY_LABEL_FONT_MIN_PX, LOBBY_EMPTY_LABEL_FONT_FACTOR * zoom)}px "FS Pixel Sans", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('empty', x + w / 2, y + h / 2)
  }

  // Hover highlight
  if (isHovered) {
    ctx.fillStyle = LOBBY_HIGHLIGHT_COLOR
    ctx.fillRect(x, y, w, h)

    // "click to enter" hint
    ctx.fillStyle = LOBBY_TEXT_COLOR
    ctx.font = `${Math.max(LOBBY_HINT_FONT_MIN_PX, LOBBY_HINT_FONT_FACTOR * zoom)}px "FS Pixel Sans", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('click to enter', x + w / 2, y + h - LOBBY_HINT_BOTTOM_GAP_FACTOR * zoom)
  }
}
