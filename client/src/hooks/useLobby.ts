import { useState, useEffect } from 'react'
import type { RoomSummary } from '@pixel-agents/shared'
import { onMessage } from '../wsClient.js'

export function useLobby() {
  const [rooms, setRooms] = useState<RoomSummary[]>([])

  useEffect(() => {
    const unsub = onMessage((msg) => {
      if ('type' in msg) {
        switch (msg.type) {
          case 'lobbyState':
            setRooms(msg.rooms)
            break
          case 'lobbyAgentUpdate':
            setRooms(prev => prev.map(r =>
              r.projectHash === msg.projectHash ? msg.summary : r
            ))
            break
          case 'roomAppeared':
            setRooms(prev => [...prev, msg.room])
            break
          case 'roomDisappeared':
            setRooms(prev => prev.filter(r => r.projectHash !== msg.projectHash))
            break
        }
      }
    })
    return unsub
  }, [])

  const sortedRooms = [...rooms].sort((a, b) => {
    if (a.activeAgentCount > 0 && b.activeAgentCount === 0) return -1
    if (a.activeAgentCount === 0 && b.activeAgentCount > 0) return 1
    return b.lastActivityTime - a.lastActivityTime
  })

  return { rooms: sortedRooms }
}
