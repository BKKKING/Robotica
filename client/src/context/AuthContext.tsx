import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { login as apiLogin, logout as apiLogout, setAuthToken } from '../services/api'

interface AuthContextType {
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiLogin(username, password)
  setToken(data.access_token)
  setAuthToken(data.access_token)
  }, [])

  const logout = useCallback(async () => {
  if (token) await apiLogout(token)
  setToken(null)
  setAuthToken(undefined)
  }, [token])

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内部使用')
  return ctx
}
