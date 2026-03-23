import { useState } from 'react'
import './App.css'
import { AuthProvider } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'
import { Login } from './components/Login'
import { Controls } from './components/Controls'
import { MovementList } from './components/MovementList'
import { Robot3D } from './components/Robot3D'

function App() {
  const [mode, setMode] = useState<'sequential' | 'parallel'>('sequential')

  return (
    <AuthProvider>
      <SocketProvider>
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 text-slate-200">
          <header className="px-8 py-4 border-b border-indigo-500/20 flex items-center justify-between bg-black/40 backdrop-blur-xl sticky top-0 z-50 shadow-lg shadow-indigo-900/20">
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 tracking-tight">机械臂控制面板</h1>
            <div className="flex items-center gap-6">
              <div className="px-4 py-2 rounded-full bg-indigo-900/30 border border-indigo-700/30 backdrop-blur-md">
                <span className="text-sm text-slate-300">模式: <span className="text-purple-300 font-semibold ml-1">{mode === 'sequential' ? '顺序' : '并行'}</span></span>
              </div>
              <Login />
            </div>
          </header>

          <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
            {/* 控制面板 - 左列 */}
            <section className="space-y-6 overflow-y-auto">
              <div className="rounded-2xl bg-slate-800/40 backdrop-blur-lg border border-indigo-500/10 shadow-xl shadow-indigo-900/10 p-6 space-y-4 transition-all duration-300 hover:shadow-indigo-800/20 hover:bg-slate-800/50">
                <div className="flex items-center gap-3 mb-2">
                  <label className="text-sm font-medium text-indigo-300">控制模式</label>
                  <select
                    className="flex-1 px-4 py-2 rounded-full bg-slate-700/50 border border-indigo-500/30 text-indigo-100 outline-none focus:ring-2 focus:ring-purple-500/50 transition-all cursor-pointer hover:bg-slate-700/70"
                    value={mode}
                    onChange={e => setMode(e.target.value as any)}
                  >
                    <option value='sequential'>顺序</option>
                    <option value='parallel'>并行</option>
                  </select>
                </div>
                <Controls mode={mode} />
              </div>

              <div className="rounded-2xl bg-slate-800/40 backdrop-blur-lg border border-indigo-500/10 shadow-xl shadow-indigo-900/10 p-6 flex flex-col h-[calc(100vh-25rem)] transition-all duration-300 hover:shadow-indigo-800/20 hover:bg-slate-800/50">
                <h2 className="text-xl font-semibold text-indigo-200 mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  运动历史
                </h2>
                <MovementList mode={mode} />
              </div>
            </section>

            {/* 3D 面板 - 右列 */}
            <section className="min-h-0">
              <div className="rounded-2xl bg-slate-800/40 backdrop-blur-lg border border-indigo-500/10 shadow-xl shadow-indigo-900/10 p-6 h-full flex flex-col transition-all duration-300 hover:shadow-indigo-800/20 hover:bg-slate-800/50">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-indigo-200 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
                    </svg>
                    机械臂 3D 视图
                  </h2>
                  <div className="px-4 py-2 rounded-full bg-slate-700/50 border border-indigo-500/20 text-xs text-slate-300 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                    点击+拖动旋转，滚动缩放
                  </div>
                </div>
                <div className="flex-1 min-h-0 bg-gradient-to-br from-slate-900 to-indigo-950 rounded-xl overflow-hidden border border-indigo-500/10">
                  {/* 注意: Robot3D 组件需要修改以移除黑色平面 */}
                  <Robot3D />
                </div>
              </div>
            </section>
          </main>

          <footer className="text-center py-4 text-slate-500 text-sm bg-black/20 backdrop-blur-md border-t border-indigo-500/10">
            机器人技术 - 第八学期 💫
          </footer>
        </div>
      </SocketProvider>
    </AuthProvider>
  )
}

export default App
