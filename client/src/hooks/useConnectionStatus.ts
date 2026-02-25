import { useState, useEffect } from 'react'
import { type ConnectionStatus, getConnectionStatus, onStatusChange } from '../wsClient.js'

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(getConnectionStatus())

  useEffect(() => {
    return onStatusChange(setStatus)
  }, [])

  return status
}
