import type { ClientMessage, ServerMessage } from '@pixel-agents/shared'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

type MessageHandler = (msg: ServerMessage) => void
type StatusHandler = (status: ConnectionStatus) => void

let ws: WebSocket | null = null
let handlers: MessageHandler[] = []
let statusHandlers: StatusHandler[] = []
let currentStatus: ConnectionStatus = 'disconnected'
let reconnectAttempt = 0
let pendingRoom: string | null = null
let messageBuffer: ServerMessage[] = []
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000]

export function getConnectionStatus(): ConnectionStatus {
  return currentStatus
}

export function onStatusChange(handler: StatusHandler): () => void {
  statusHandlers.push(handler)
  return () => { statusHandlers = statusHandlers.filter(h => h !== handler) }
}

function setStatus(status: ConnectionStatus): void {
  currentStatus = status
  for (const h of statusHandlers) h(status)
}

export function connect(): void {
  setStatus('connecting')
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/ws`)

  ws.onopen = () => {
    setStatus('connected')
    reconnectAttempt = 0
    if (pendingRoom) {
      send({ type: 'joinRoom', projectHash: pendingRoom })
    }
  }

  ws.onmessage = (e: MessageEvent) => {
    const msg: ServerMessage = JSON.parse(e.data as string)
    if (handlers.length === 0) {
      // Buffer messages received before any handler registers (race with React mount)
      messageBuffer.push(msg)
    } else {
      for (const h of handlers) h(msg)
    }
  }

  ws.onclose = () => {
    setStatus('disconnected')
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    reconnectAttempt++
    setTimeout(connect, delay)
  }
}

export function send(msg: ClientMessage): void {
  if (msg.type === 'joinRoom') pendingRoom = msg.projectHash
  if (msg.type === 'leaveRoom') pendingRoom = null
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

export function onMessage(handler: MessageHandler): () => void {
  handlers.push(handler)
  // Flush any messages buffered before this handler was registered
  if (messageBuffer.length > 0) {
    const buffered = messageBuffer
    messageBuffer = []
    for (const msg of buffered) {
      for (const h of handlers) h(msg)
    }
  }
  return () => { handlers = handlers.filter(h => h !== handler) }
}

export function disconnect(): void {
  ws?.close()
  ws = null
}
