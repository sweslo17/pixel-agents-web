import { useState, useEffect, useRef, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { OfficeLayout, ToolActivity } from '../office/types.js'
import type { AgentSnapshot } from '@pixel-agents/shared'
import { extractToolName } from '../office/toolUtils.js'
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js'
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js'
import { setFloorSprites } from '../office/floorTiles.js'
import { setWallSprites } from '../office/wallTiles.js'
import { setCharacterTemplates } from '../office/sprites/spriteData.js'
import { onMessage, send } from '../wsClient.js'
import { loadAllAssets } from '../assetFetcher.js'
import { playDoneSound, setSoundEnabled } from '../notificationSound.js'

export interface SubagentCharacter {
  id: number
  parentAgentId: string
  parentToolId: string
  label: string
}

export interface FurnitureAsset {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnWalls: boolean
  partOfGroup?: boolean
  groupId?: string
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
}

export interface WebSocketState {
  agents: string[]
  agentTools: Record<string, ToolActivity[]>
  agentStatuses: Record<string, string>
  subagentTools: Record<string, Record<string, ToolActivity[]>>
  subagentCharacters: SubagentCharacter[]
  layoutReady: boolean
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> }
}

/**
 * Per-room agent ID mapping. Maps string session UUIDs to stable positive
 * integers for OfficeState. Scoped per room to prevent cross-room leaks.
 */
class AgentIdMapper {
  private map = new Map<string, number>()
  private next = 1

  toNumericId(stringId: string): number {
    let num = this.map.get(stringId)
    if (num === undefined) {
      num = this.next++
      this.map.set(stringId, num)
    }
    return num
  }

  reverseNumericId(numId: number): string | undefined {
    for (const [strId, n] of this.map) {
      if (n === numId) return strId
    }
    return undefined
  }

  clear(): void {
    this.map.clear()
    this.next = 1
  }
}

function buildSeatPayload(
  os: OfficeState,
  mapper: AgentIdMapper,
  projectHash: string,
): void {
  const seats: Record<string, { palette: number; hueShift: number; seatId: string | null }> = {}
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue
    const strId = mapper.reverseNumericId(ch.id)
    if (strId) {
      seats[strId] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId }
    }
  }
  send({ type: 'saveAgentSeats', projectHash, seats })
}

export function useWebSocket(
  projectHash: string,
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): WebSocketState {
  const [agents, setAgents] = useState<string[]>([])
  const [agentTools, setAgentTools] = useState<Record<string, ToolActivity[]>>({})
  const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({})
  const [subagentTools, setSubagentTools] = useState<Record<string, Record<string, ToolActivity[]>>>({})
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([])
  const [layoutReady, setLayoutReady] = useState(false)
  const [loadedAssets, setLoadedAssets] = useState<{ catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined>()

  const layoutReadyRef = useRef(false)
  const projectHashRef = useRef(projectHash)
  projectHashRef.current = projectHash

  // Per-room agent ID mapping — cleared when room changes
  const mapperRef = useRef<AgentIdMapper>(new AgentIdMapper())

  // Stable callback for saving seats
  const saveSeats = useCallback(() => {
    const os = getOfficeState()
    if (os.characters.size > 0) {
      buildSeatPayload(os, mapperRef.current, projectHashRef.current)
    }
  }, [getOfficeState])

  useEffect(() => {
    // Clear ID mapping when room changes and set active mapper
    mapperRef.current.clear()
    activeMapper = mapperRef.current

    // Buffer agents from roomState until layout is applied
    let pendingAgents: AgentSnapshot[] = []
    let assetsLoaded = false

    // Load all assets via HTTP (replaces extension postMessage asset loading)
    loadAllAssets().then((assets) => {
      if (assets.characters) {
        const characters = assets.characters as Array<{ down: string[][][]; up: string[][][]; right: string[][][] }>
        console.log(`[Client] Loaded ${characters.length} pre-colored character sprites`)
        setCharacterTemplates(characters)
      }

      if (assets.floors) {
        const floors = assets.floors as string[][][]
        console.log(`[Client] Loaded ${floors.length} floor tile patterns`)
        setFloorSprites(floors)
      }

      if (assets.walls) {
        const walls = assets.walls as string[][][]
        console.log(`[Client] Loaded ${walls.length} wall tile sprites`)
        setWallSprites(walls)
      }

      if (assets.furniture) {
        const furniture = assets.furniture as { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> }
        console.log(`[Client] Loaded ${furniture.catalog.length} furniture assets`)
        buildDynamicCatalog(furniture)
        setLoadedAssets(furniture)
      }

      assetsLoaded = true
    }).catch((err) => {
      console.error('[Client] Failed to load assets:', err)
      // Mark as loaded even on failure so agents aren't buffered forever
      assetsLoaded = true
    })

    const unsub = onMessage((msg) => {
      if (!('type' in msg)) return
      const os = getOfficeState()

      if (msg.type === 'roomState') {
        // Initial state when joining a room
        const rawLayout = msg.layout as OfficeLayout | null
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null
        if (layout) {
          os.rebuildFromLayout(layout)
          onLayoutLoaded?.(layout)
        } else {
          // No saved layout — persist the randomly-generated default so it stays fixed
          const generated = os.getLayout()
          send({ type: 'saveLayout', projectHash: projectHashRef.current, layout: generated as unknown as Record<string, unknown> })
          onLayoutLoaded?.(generated)
        }

        // Process agents from roomState
        const incoming = msg.agents as AgentSnapshot[]
        if (!assetsLoaded) {
          // Assets not loaded yet -- buffer agents
          pendingAgents = incoming
        } else {
          for (const agent of incoming) {
            const numId = mapperRef.current.toNumericId(agent.id)
            os.addAgent(numId, agent.palette, agent.hueShift, agent.seatId ?? undefined, true)
            // Apply existing tool state
            for (const tool of agent.activeTools) {
              const toolName = extractToolName(tool.status)
              os.setAgentTool(numId, toolName)
              os.setAgentActive(numId, true)
            }
            if (agent.isWaiting) {
              os.showWaitingBubble(numId)
            }
          }
        }
        setAgents(incoming.map((a) => a.id))
        // Set up initial tool state from snapshots
        const initialTools: Record<string, ToolActivity[]> = {}
        const initialStatuses: Record<string, string> = {}
        for (const agent of incoming) {
          if (agent.activeTools.length > 0) {
            initialTools[agent.id] = agent.activeTools.map((t) => ({
              toolId: t.toolId,
              status: t.status,
              done: false,
            }))
          }
          if (agent.isWaiting) {
            initialStatuses[agent.id] = 'waiting'
          }
        }
        setAgentTools(initialTools)
        setAgentStatuses(initialStatuses)

        layoutReadyRef.current = true
        setLayoutReady(true)
        if (os.characters.size > 0) {
          buildSeatPayload(os, mapperRef.current, projectHashRef.current)
        }
      } else if (msg.type === 'layoutLoaded') {
        // External layout update (from another client editing)
        if (layoutReadyRef.current && isEditDirty?.()) {
          console.log('[Client] Skipping external layout update -- editor has unsaved changes')
          return
        }
        const rawLayout = msg.layout as OfficeLayout | null
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null
        if (layout) {
          os.rebuildFromLayout(layout)
          onLayoutLoaded?.(layout)
        }
      } else if (msg.type === 'agentCreated') {
        const id = msg.id
        const numId = mapperRef.current.toNumericId(id)
        setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]))
        os.addAgent(numId)
        buildSeatPayload(os, mapperRef.current, projectHashRef.current)
      } else if (msg.type === 'agentClosed') {
        const id = msg.id
        const numId = mapperRef.current.toNumericId(id)
        setAgents((prev) => prev.filter((a) => a !== id))
        setAgentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentStatuses((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        os.removeAllSubagents(numId)
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id))
        os.removeAgent(numId)
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id
        const numId = mapperRef.current.toNumericId(id)
        const toolId = msg.toolId
        const status = msg.status
        setAgentTools((prev) => {
          const list = prev[id] || []
          if (list.some((t) => t.toolId === toolId)) return prev
          return { ...prev, [id]: [...list, { toolId, status, done: false }] }
        })
        const toolName = extractToolName(status)
        os.setAgentTool(numId, toolName)
        os.setAgentActive(numId, true)
        os.clearPermissionBubble(numId)
        // Create sub-agent character for Task tool subtasks
        if (status.startsWith('Subtask:')) {
          const label = status.slice('Subtask:'.length).trim()
          const subId = os.addSubagent(numId, toolId)
          setSubagentCharacters((prev) => {
            if (prev.some((s) => s.id === subId)) return prev
            return [...prev, { id: subId, parentAgentId: id, parentToolId: toolId, label }]
          })
        }
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id
        const toolId = msg.toolId
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
          }
        })
      } else if (msg.type === 'agentToolsClear') {
        const id = msg.id
        const numId = mapperRef.current.toNumericId(id)
        setAgentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        os.removeAllSubagents(numId)
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id))
        os.setAgentTool(numId, null)
        os.clearPermissionBubble(numId)
      } else if (msg.type === 'agentStatus') {
        const id = msg.id
        const numId = mapperRef.current.toNumericId(id)
        const status = msg.status
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          }
          return { ...prev, [id]: status }
        })
        os.setAgentActive(numId, status === 'active')
        if (status === 'waiting') {
          os.showWaitingBubble(numId)
          playDoneSound()
        }
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id
        const numId = mapperRef.current.toNumericId(id)
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          }
        })
        os.showPermissionBubble(numId)
      } else if (msg.type === 'subagentToolPermission') {
        const id = msg.id
        const numId = mapperRef.current.toNumericId(id)
        const parentToolId = msg.parentToolId
        const subId = os.getSubagentId(numId, parentToolId)
        if (subId !== null) {
          os.showPermissionBubble(subId)
        }
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = msg.id
        const numId = mapperRef.current.toNumericId(id)
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          const hasPermission = list.some((t) => t.permissionWait)
          if (!hasPermission) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          }
        })
        os.clearPermissionBubble(numId)
        // Also clear permission bubbles on all sub-agent characters of this parent
        for (const [subId, meta] of os.subagentMeta) {
          if (meta.parentAgentId === numId) {
            os.clearPermissionBubble(subId)
          }
        }
      } else if (msg.type === 'subagentToolStart') {
        const id = msg.id
        const numId = mapperRef.current.toNumericId(id)
        const parentToolId = msg.parentToolId
        const toolId = msg.toolId
        const status = msg.status
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {}
          const list = agentSubs[parentToolId] || []
          if (list.some((t) => t.toolId === toolId)) return prev
          return { ...prev, [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] } }
        })
        const subId = os.getSubagentId(numId, parentToolId)
        if (subId !== null) {
          const subToolName = extractToolName(status)
          os.setAgentTool(subId, subToolName)
          os.setAgentActive(subId, true)
        }
      } else if (msg.type === 'subagentToolDone') {
        const id = msg.id
        const parentToolId = msg.parentToolId
        const toolId = msg.toolId
        setSubagentTools((prev) => {
          const agentSubs = prev[id]
          if (!agentSubs) return prev
          const list = agentSubs[parentToolId]
          if (!list) return prev
          return {
            ...prev,
            [id]: { ...agentSubs, [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)) },
          }
        })
      } else if (msg.type === 'subagentClear') {
        const id = msg.id
        const numId = mapperRef.current.toNumericId(id)
        const parentToolId = msg.parentToolId
        setSubagentTools((prev) => {
          const agentSubs = prev[id]
          if (!agentSubs || !(parentToolId in agentSubs)) return prev
          const next = { ...agentSubs }
          delete next[parentToolId]
          if (Object.keys(next).length === 0) {
            const outer = { ...prev }
            delete outer[id]
            return outer
          }
          return { ...prev, [id]: next }
        })
        os.removeSubagent(numId, parentToolId)
        setSubagentCharacters((prev) => prev.filter((s) => !(s.parentAgentId === id && s.parentToolId === parentToolId)))
      } else if (msg.type === 'settingsLoaded') {
        const soundOn = msg.soundEnabled
        setSoundEnabled(soundOn)
      }
    })

    // Flush buffered agents once assets have loaded
    // Poll briefly in case assets load after roomState
    const flushInterval = setInterval(() => {
      if (assetsLoaded && pendingAgents.length > 0) {
        const os = getOfficeState()
        for (const agent of pendingAgents) {
          const numId = mapperRef.current.toNumericId(agent.id)
          os.addAgent(numId, agent.palette, agent.hueShift, agent.seatId ?? undefined, true)
          for (const tool of agent.activeTools) {
            const toolName = extractToolName(tool.status)
            os.setAgentTool(numId, toolName)
            os.setAgentActive(numId, true)
          }
          if (agent.isWaiting) {
            os.showWaitingBubble(numId)
          }
        }
        pendingAgents = []
        clearInterval(flushInterval)
        // Persist seat assignments so characters stay consistent across re-entries
        if (os.characters.size > 0) {
          buildSeatPayload(os, mapperRef.current, projectHashRef.current)
        }
      }
    }, 100)

    return () => {
      unsub()
      clearInterval(flushInterval)
      activeMapper = null
    }
  }, [getOfficeState, onLayoutLoaded, isEditDirty, saveSeats])

  return { agents, agentTools, agentStatuses, subagentTools, subagentCharacters, layoutReady, loadedAssets }
}

/**
 * Module-level reference to the active room's mapper.
 * Only one room is active at a time, so this is safe.
 */
let activeMapper: AgentIdMapper | null = null

/** Convert a string agent ID to its numeric counterpart for OfficeState */
export function getNumericAgentId(stringId: string): number {
  if (!activeMapper) return 0
  return activeMapper.toNumericId(stringId)
}
