import type { RoomSummary } from '@pixel-agents/shared'
import {
  LOBBY_TILE_SIZE,
  LOBBY_ROOM_TILE_W,
  LOBBY_ROOM_TILE_H,
  LOBBY_CORRIDOR_TILES,
  LOBBY_MAX_PER_ROW,
  LOBBY_PADDING_TILES,
  LOBBY_TITLE_TOP_MARGIN_PX,
  LOBBY_MIN_WIDTH_PX,
} from '../constants.js'

export interface LobbyRoom {
  projectHash: string
  displayName: string
  agentCount: number
  /** Pixel position of top-left corner */
  x: number
  y: number
  width: number
  height: number
}

export interface LobbyLayout {
  rooms: LobbyRoom[]
  totalWidth: number
  totalHeight: number
}

export function buildLobbyLayout(rooms: RoomSummary[]): LobbyLayout {
  const roomW = LOBBY_ROOM_TILE_W * LOBBY_TILE_SIZE
  const roomH = LOBBY_ROOM_TILE_H * LOBBY_TILE_SIZE
  const corridorW = LOBBY_CORRIDOR_TILES * LOBBY_TILE_SIZE
  const padding = LOBBY_PADDING_TILES * LOBBY_TILE_SIZE

  const lobbyRooms: LobbyRoom[] = rooms.map((r, i) => {
    const col = i % LOBBY_MAX_PER_ROW
    const row = Math.floor(i / LOBBY_MAX_PER_ROW)
    return {
      projectHash: r.projectHash,
      displayName: r.displayName,
      agentCount: r.activeAgentCount,
      x: padding + col * (roomW + corridorW),
      y: padding + LOBBY_TITLE_TOP_MARGIN_PX + row * (roomH + corridorW),
      width: roomW,
      height: roomH,
    }
  })

  const maxCol = Math.min(rooms.length, LOBBY_MAX_PER_ROW)
  const maxRow = Math.ceil(rooms.length / LOBBY_MAX_PER_ROW) || 1
  return {
    rooms: lobbyRooms,
    totalWidth: Math.max(
      padding * 2 + maxCol * roomW + Math.max(0, maxCol - 1) * corridorW,
      LOBBY_MIN_WIDTH_PX,
    ),
    totalHeight: padding * 2 + LOBBY_TITLE_TOP_MARGIN_PX + maxRow * roomH + Math.max(0, maxRow - 1) * corridorW,
  }
}

export function hitTestRoom(layout: LobbyLayout, worldX: number, worldY: number): string | null {
  for (const room of layout.rooms) {
    if (
      worldX >= room.x && worldX < room.x + room.width &&
      worldY >= room.y && worldY < room.y + room.height
    ) {
      return room.projectHash
    }
  }
  return null
}
