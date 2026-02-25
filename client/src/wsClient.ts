import type { ClientMessage, ServerMessage } from '@pixel-agents/shared'

type MessageHandler = (msg: ServerMessage) => void

let ws: WebSocket | null = null
let handlers: MessageHandler[] = []
let reconnectAttempt = 0
let pendingRoom: string | null = null
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000]

export function connect(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/ws`)

  ws.onopen = () => {
    reconnectAttempt = 0
    if (pendingRoom) {
      send({ type: 'joinRoom', projectHash: pendingRoom })
    }
  }

  ws.onmessage = (e: MessageEvent) => {
    const msg: ServerMessage = JSON.parse(e.data as string)
    for (const h of handlers) h(msg)
  }

  ws.onclose = () => {
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
  return () => { handlers = handlers.filter(h => h !== handler) }
}

export function disconnect(): void {
  ws?.close()
  ws = null
}
