import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface SocketContextType {
  status: string
  messages: string[]
  send: (msg: string | object) => void
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

export function SocketProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState('已断开')
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    let retry: number | null = null
    let cancelled = false
    const connect = () => {
      if (cancelled) return
      setStatus('连接中')
      const ws = new WebSocket('ws://localhost:8000/ws')
      wsRef.current = ws
      ws.onopen = () => setStatus('已连接')
      ws.onmessage = ev => setMessages(prev => [...prev, ev.data])
      ws.onerror = () => setStatus('错误')
      ws.onclose = () => {
        setStatus('已断开')
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

  const send = (msg: string | object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = typeof msg === 'string' ? msg : JSON.stringify(msg)
      wsRef.current.send(message)
    }
  }

  return (
    <SocketContext.Provider value={{ status, messages, send }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket 必须在 SocketProvider 内使用')
  return ctx
}
