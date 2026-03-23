import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { token, login, logout } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async () => {
    if (!username || !password) {
      setError('请输入用户名和密码')
      return
    }
    
    try {
      setIsLoading(true)
      setError(null)
      await login(username, password)
      setUsername('')
      setPassword('')
    } catch (e: any) {
      setError(e.message || '登录失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 支持按回车键登录
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin()
    }
  }

  if (token) {
    return (
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-brand-500 font-medium">管理员已连接</span>
        <button className="btn" onClick={() => logout()}>退出</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <input 
          className="input" 
          placeholder='用户名' 
          value={username} 
          onChange={e => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <input 
          className="input" 
          placeholder='密码' 
          type='password' 
          value={password} 
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button 
          className="btn" 
          onClick={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? '登录中...' : '登录'}
        </button>
      </div>
      {error && <div className="text-red-400 text-xs">{error}</div>}
    </div>
  )
}
