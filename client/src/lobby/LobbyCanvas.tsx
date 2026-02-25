import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useLobby } from '../hooks/useLobby.js'
import { buildLobbyLayout, hitTestRoom } from './lobbyState.js'
import { renderLobby } from './lobbyRenderer.js'
import { LOBBY_EMPTY_MESSAGE_FONT_SIZE_PX, LOBBY_EMPTY_MESSAGE_COLOR, LOBBY_MIN_CANVAS_OFFSET_Y } from '../constants.js'

interface LobbyCanvasProps {
  onEnterRoom: (projectHash: string) => void
}

export function LobbyCanvas({ onEnterRoom }: LobbyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { rooms } = useLobby()
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null)
  const panRef = useRef({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })

  // Compute zoom from device pixel ratio
  const zoom = Math.max(2, Math.round(2 * devicePixelRatio))

  const layout = useMemo(() => buildLobbyLayout(rooms), [rooms])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId: number

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = devicePixelRatio
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
    }

    const resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(canvas)

    const frame = () => {
      ctx.imageSmoothingEnabled = false
      const offsetX = (ctx.canvas.width - layout.totalWidth * zoom) / 2 + panRef.current.x
      const offsetY = Math.max(LOBBY_MIN_CANVAS_OFFSET_Y, (ctx.canvas.height - layout.totalHeight * zoom) / 2) + panRef.current.y
      renderLobby(ctx, layout, zoom, hoveredRoom, offsetX, offsetY)
      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
    }
  }, [layout, zoom, hoveredRoom])

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const dpr = devicePixelRatio
    const canvasX = (clientX - rect.left) * dpr
    const canvasY = (clientY - rect.top) * dpr
    const offsetX = (canvas.width - layout.totalWidth * zoom) / 2 + panRef.current.x
    const offsetY = Math.max(LOBBY_MIN_CANVAS_OFFSET_Y, (canvas.height - layout.totalHeight * zoom) / 2) + panRef.current.y
    return {
      x: (canvasX - offsetX) / zoom,
      y: (canvasY - offsetY) / zoom,
    }
  }, [layout, zoom])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      const dpr = devicePixelRatio
      panRef.current.x += (e.clientX - lastMouseRef.current.x) * dpr
      panRef.current.y += (e.clientY - lastMouseRef.current.y) * dpr
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      return
    }
    const world = screenToWorld(e.clientX, e.clientY)
    const hit = hitTestRoom(layout, world.x, world.y)
    setHoveredRoom(hit)
  }, [layout, screenToWorld])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      isPanningRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      e.preventDefault()
    }
  }, [])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      isPanningRef.current = false
    }
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const world = screenToWorld(e.clientX, e.clientY)
    const hit = hitTestRoom(layout, world.x, world.y)
    if (hit) onEnterRoom(hit)
  }, [layout, screenToWorld, onEnterRoom])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: hoveredRoom ? 'pointer' : 'default',
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onContextMenu={e => e.preventDefault()}
      />
      {rooms.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: LOBBY_EMPTY_MESSAGE_COLOR,
          fontFamily: '"FS Pixel Sans", monospace',
          fontSize: `${LOBBY_EMPTY_MESSAGE_FONT_SIZE_PX}px`,
          textAlign: 'center',
        }}>
          No active Claude Code sessions found.<br />
          Start a Claude Code session to see it here.
        </div>
      )}
    </div>
  )
}
