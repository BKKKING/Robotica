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
    try {
      const data = await apiLogin(username, password)
      setToken(data.access_token)
      setAuthToken(data.access_token)
    } catch (error: any) {
      console.error('登录错误:', error)
      if (error.response) {
        console.error('错误响应:', error.response.status, error.response.data)
        throw new Error(error.response.data?.detail || '登录失败')
      } else if (error.request) {
        console.error('请求未收到响应:', error.request)
        throw new Error('无法连接到服务器，请检查后端是否运行')
      } else {
        console.error('请求错误:', error.message)
        throw new Error('登录请求失败')
      }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      if (token) await apiLogout(token)
    } catch (error) {
      console.error('退出登录错误:', error)
    } finally {
      setToken(null)
      setAuthToken(undefined)
    }
  }, [token])

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
