import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { token, login, logout } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    try {
      setError(null)
      await login(username, password)
      setUsername('')
      setPassword('')
    } catch (e) {
      setError('登录失败')
    }
  }

  if (token) {
    return (
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-brand-500 font-medium">管理员已登录</span>
        <button className="btn" onClick={() => logout()}>退出</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <input className="input" placeholder='用户名' value={username} onChange={e => setUsername(e.target.value)} />
        <input className="input" placeholder='密码' type='password' value={password} onChange={e => setPassword(e.target.value)} />
        <button className="btn" onClick={handleLogin}>登录</button>
      </div>
      {error && <div className="text-red-400 text-xs">{error}</div>}
    </div>
  )
}
