import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface SocketContextType {
  status: string
  messages: string[]
  latestMessage: string | null
  send: (msg: string) => void
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

export function SocketProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState('desconectado')
  const [messages, setMessages] = useState<string[]>([])
  const [latestMessage, setLatestMessage] = useState<string | null>(null)

  useEffect(() => {
    let retry: number | null = null
    let cancelled = false
    
    const handleMessage = (ev: MessageEvent) => {
      setLatestMessage(ev.data)
      setMessages(prev => [...prev.slice(-99), ev.data])
    }
    
    const connect = () => {
      if (cancelled) return
      setStatus('conectando')
      const ws = new WebSocket('ws://localhost:8000/ws')
      wsRef.current = ws
      ws.onopen = () => setStatus('conectado')
      ws.onmessage = handleMessage
      ws.onerror = () => setStatus('error')
      ws.onclose = () => {
        setStatus('desconectado')
        if (!cancelled && retry === null) {
          retry = window.setTimeout(() => { retry = null; connect() }, 1500)
        }
      }
    }
    connect()
    return () => {
      cancelled = true
      if (retry) window.clearTimeout(retry)
      wsRef.current?.close()
    }
  }, [])

  const send = (msg: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(msg)
  }

  return (
    <SocketContext.Provider value={{ status, messages, latestMessage, send }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket debe usarse dentro de SocketProvider')
  return ctx
}
