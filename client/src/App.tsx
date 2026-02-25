import { useState, useCallback, useEffect } from 'react'
import { LobbyCanvas } from './lobby/LobbyCanvas.js'
import { RoomView } from './RoomView.js'
import { send } from './wsClient.js'
import { useConnectionStatus } from './hooks/useConnectionStatus.js'

export function App() {
  const status = useConnectionStatus()

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

  if (status !== 'connected') {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--pixel-bg)',
        color: 'var(--pixel-text)',
        fontFamily: '"FS Pixel Sans", monospace',
        fontSize: '16px',
      }}>
        {status === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
      </div>
    )
  }

  if (currentRoom) {
    return <RoomView projectHash={currentRoom} onBack={exitRoom} />
  }
  return <LobbyCanvas onEnterRoom={enterRoom} />
}
