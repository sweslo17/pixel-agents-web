import { useState, useCallback, useEffect } from 'react'
import { LobbyCanvas } from './lobby/LobbyCanvas.js'
import { RoomView } from './RoomView.js'
import { send } from './wsClient.js'

export function App() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(() => {
    const match = location.pathname.match(/^\/room\/(.+)$/)
    return match ? decodeURIComponent(match[1]) : null
  })

  const enterRoom = useCallback((projectHash: string) => {
    send({ type: 'joinRoom', projectHash })
    setCurrentRoom(projectHash)
    history.pushState(null, '', `/room/${encodeURIComponent(projectHash)}`)
  }, [])

  const exitRoom = useCallback(() => {
    send({ type: 'leaveRoom' })
    setCurrentRoom(null)
    history.pushState(null, '', '/')
  }, [])

  // Handle browser back/forward
  useEffect(() => {
    const handler = () => {
      const match = location.pathname.match(/^\/room\/(.+)$/)
      if (match) {
        const hash = decodeURIComponent(match[1])
        send({ type: 'joinRoom', projectHash: hash })
        setCurrentRoom(hash)
      } else {
        send({ type: 'leaveRoom' })
        setCurrentRoom(null)
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  // If starting on a room URL, send joinRoom
  useEffect(() => {
    if (currentRoom) {
      send({ type: 'joinRoom', projectHash: currentRoom })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (currentRoom) {
    return <RoomView projectHash={currentRoom} onBack={exitRoom} />
  }
  return <LobbyCanvas onEnterRoom={enterRoom} />
}
