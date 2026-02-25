import { useState, useEffect, useCallback, useRef } from 'react'
import { onMessage } from '../wsClient.js'

const TOAST_DURATION_MS = 8000

interface PendingToast {
  projectHash: string
  displayName: string
}

interface NewRoomToastProps {
  /** Current room hash the user is viewing, or null if in lobby */
  currentRoom: string | null
  onNavigate: (projectHash: string) => void
}

export function NewRoomToast({ currentRoom, onNavigate }: NewRoomToastProps) {
  const [toast, setToast] = useState<PendingToast | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    setToast(null)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type !== 'newRoomNotification') return
      // Don't notify if we're already in that room
      if (currentRoom === msg.projectHash) return

      setToast({ projectHash: msg.projectHash, displayName: msg.displayName })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setToast(null), TOAST_DURATION_MS)
    })
  }, [currentRoom])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!toast) return null

  return (
    <div style={containerStyle}>
      <span style={textStyle}>
        New session: <strong>{toast.displayName}</strong>
      </span>
      <button
        onClick={() => { onNavigate(toast.projectHash); dismiss() }}
        style={goButtonStyle}
      >
        Go
      </button>
      <button onClick={dismiss} style={dismissStyle}>
        X
      </button>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 60,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-accent)',
  borderRadius: 0,
  padding: '8px 12px',
  boxShadow: 'var(--pixel-shadow)',
}

const textStyle: React.CSSProperties = {
  color: 'var(--pixel-text)',
  fontSize: '20px',
  whiteSpace: 'nowrap',
}

const goButtonStyle: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: '20px',
  color: '#fff',
  background: 'var(--pixel-accent)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const dismissStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '20px',
  color: 'var(--pixel-text)',
  background: 'transparent',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}
