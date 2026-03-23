import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { enqueueSequential, enqueueParallel } from '../services/api'

interface JointAngles {
  base: number
  hombro: number
  codo: number
}

interface ControlsProps {
  mode: 'sequential' | 'parallel'
}

export function Controls({ mode }: ControlsProps) {
  const { token } = useAuth()
  const { send } = useSocket()
  const disabled = !token
  const [base, setBase] = useState(0)
  const [hombro, setHombro] = useState(0)
  const [codo, setCodo] = useState(0)
  const [joint, setJoint] = useState<'base' | 'hombro' | 'codo'>('base')
  const [angle, setAngle] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  // 轨迹记录状态
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [trajectory, setTrajectory] = useState<JointAngles[]>([])
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0)
  
  const recordIntervalRef = useRef<number | null>(null)
  const playIntervalRef = useRef<number | null>(null)

  // 获取当前关节角度
  const getCurrentAngles = useCallback((): JointAngles => {
    if (mode === 'sequential') {
      switch (joint) {
        case 'base':
          return { base: angle, hombro: hombro, codo: codo }
        case 'hombro':
          return { base: base, hombro: angle, codo: codo }
        case 'codo':
          return { base: base, hombro: hombro, codo: angle }
        default:
          return { base: base, hombro: hombro, codo: codo }
      }
    }
    return { base: base, hombro: hombro, codo: codo }
  }, [mode, joint, angle, base, hombro, codo])

  // 开始记录
  const startRecording = useCallback(() => {
    if (isRecording) return
    setIsRecording(true)
    setMessage('开始记录轨迹...')
    
    // 立即记录第一个点
    const firstPoint = getCurrentAngles()
    setTrajectory(prev => [...prev, firstPoint])
    
    recordIntervalRef.current = window.setInterval(() => {
      const currentAngles = getCurrentAngles()
      setTrajectory(prev => [...prev, currentAngles])
    }, 200)
  }, [isRecording, getCurrentAngles])

  // 停止记录
  const stopRecording = useCallback(() => {
    if (recordIntervalRef.current) {
      window.clearInterval(recordIntervalRef.current)
      recordIntervalRef.current = null
    }
    setIsRecording(false)
    setMessage(`已记录 ${trajectory.length} 个点`)
  }, [trajectory.length])

  // 发送关节角度到WebSocket
  const sendJointAngles = useCallback((angles: JointAngles) => {
    const message = JSON.stringify({
      type: 'STATE_UPDATE',
      payload: {
        base: angles.base,
        hombro: angles.hombro,
        codo: angles.codo
      }
    })
    send(message)
  }, [send])

  // 播放轨迹
  const startPlayback = useCallback(() => {
    if (trajectory.length === 0) {
      setMessage('没有可播放的轨迹点')
      return
    }
    
    if (isPaused) {
      setIsPaused(false)
      setMessage('继续播放...')
      return
    }
    
    setIsPlaying(true)
    setCurrentPlayIndex(0)
    setMessage('开始播放轨迹...')
  }, [trajectory.length, isPaused])

  // 处理播放逻辑
  useEffect(() => {
    if (!isPlaying || isPaused) {
      if (playIntervalRef.current) {
        window.clearInterval(playIntervalRef.current)
        playIntervalRef.current = null
      }
      return
    }

    if (currentPlayIndex >= trajectory.length) {
      setIsPlaying(false)
      setMessage('轨迹播放完成')
      return
    }

    // 发送当前帧
    const currentAngles = trajectory[currentPlayIndex]
    sendJointAngles(currentAngles)
    
    // 更新UI显示当前角度
    setBase(currentAngles.base)
    setHombro(currentAngles.hombro)
    setCodo(currentAngles.codo)
    // 在顺序模式下同步更新当前选中关节的角度滑块
    if (mode === 'sequential') {
      switch (joint) {
        case 'base':
          setAngle(currentAngles.base)
          break
        case 'hombro':
          setAngle(currentAngles.hombro)
          break
        case 'codo':
          setAngle(currentAngles.codo)
          break
      }
    }

    playIntervalRef.current = window.setTimeout(() => {
      setCurrentPlayIndex(prev => prev + 1)
    }, 200)

    return () => {
      if (playIntervalRef.current) {
        window.clearTimeout(playIntervalRef.current)
      }
    }
  }, [isPlaying, isPaused, currentPlayIndex, trajectory, sendJointAngles])

  // 暂停播放
  const pausePlayback = useCallback(() => {
    setIsPaused(true)
    setMessage('播放暂停')
  }, [])

  // 停止播放
  const stopPlayback = useCallback(() => {
    if (playIntervalRef.current) {
      window.clearTimeout(playIntervalRef.current)
      playIntervalRef.current = null
    }
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentPlayIndex(0)
    setMessage('播放已停止')
  }, [])

  // 清空轨迹
  const clearTrajectory = useCallback(() => {
    if (isRecording) {
      stopRecording()
    }
    if (isPlaying) {
      stopPlayback()
    }
    setTrajectory([])
    setCurrentPlayIndex(0)
    setMessage('轨迹已清空')
  }, [isRecording, isPlaying, stopRecording, stopPlayback])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (recordIntervalRef.current) {
        window.clearInterval(recordIntervalRef.current)
      }
      if (playIntervalRef.current) {
        window.clearTimeout(playIntervalRef.current)
      }
    }
  }, [])

  const enqueue = async () => {
    if (!token) return
    try {
      if (mode === 'sequential') {
        await enqueueSequential({ joint, angle })
        const jointName = joint === 'base' ? '底座' : joint === 'hombro' ? '肩部' : '肘部'
        setMessage(`已加入队列 ${jointName}:${angle}`)
      } else {
        await enqueueParallel({ base, hombro, codo })
        setMessage(`已加入并行队列 (${base},${hombro},${codo})`)
      }
    } catch {
      setMessage('加入队列失败')
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">控制器 <span className="text-xs text-slate-400">({mode === 'sequential' ? '顺序' : '并行'})</span></h3>
      
      {/* 轨迹记录控制区域 */}
      <div className="p-4 bg-slate-700/30 rounded-xl border border-indigo-500/20">
        <h4 className="text-sm font-medium text-indigo-300 mb-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H7v4h6v-4zm2 0h1V9h-1v2zm1-4V5h-1v2h1zM5 5v2H4V5h1zm0 4H4v2h1V9zm-1 4h1v2H4v-2z" clipRule="evenodd" />
          </svg>
          轨迹记录与回放
        </h4>
        
        {/* 状态显示 */}
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-slate-300">
            已记录 <span className="text-purple-400 font-bold">{trajectory.length}</span> 个点
          </span>
          {isPlaying && (
            <span className="text-green-400">
              播放进度: {currentPlayIndex + 1}/{trajectory.length}
            </span>
          )}
        </div>

        {/* 记录控制按钮 */}
        <div className="flex flex-wrap gap-2 mb-3">
          {!isRecording ? (
            <button 
              className="px-3 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              onClick={startRecording}
              disabled={disabled || isPlaying}
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              开始记录
            </button>
          ) : (
            <button 
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-600 hover:bg-slate-500 text-white transition-colors flex items-center gap-1"
              onClick={stopRecording}
            >
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              停止记录
            </button>
          )}
          
          {!isPlaying ? (
            <button 
              className="px-3 py-1.5 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              onClick={startPlayback}
              disabled={disabled || trajectory.length === 0}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              {isPaused ? '继续' : '播放轨迹'}
            </button>
          ) : (
            <>
              {!isPaused ? (
                <button 
                  className="px-3 py-1.5 text-xs rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white transition-colors flex items-center gap-1"
                  onClick={pausePlayback}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  暂停
                </button>
              ) : (
                <button 
                  className="px-3 py-1.5 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors flex items-center gap-1"
                  onClick={startPlayback}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  继续
                </button>
              )}
              <button 
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-600 hover:bg-slate-500 text-white transition-colors flex items-center gap-1"
                onClick={stopPlayback}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                </svg>
                停止
              </button>
            </>
          )}
          
          <button 
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            onClick={clearTrajectory}
            disabled={disabled || trajectory.length === 0}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            清空轨迹
          </button>
        </div>

        {/* 进度条 */}
        {isPlaying && (
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all duration-200"
              style={{ width: `${((currentPlayIndex + 1) / trajectory.length) * 100}%` }}
            ></div>
          </div>
        )}
      </div>

      {/* 原有控制区域 */}
      {mode === 'sequential' ? (
        <div className="space-y-2">
          <select className="input" value={joint} onChange={e => setJoint(e.target.value as any)} disabled={disabled}>
            <option value='base'>底座</option>
            <option value='hombro'>肩部</option>
            <option value='codo'>肘部</option>
          </select>
          <div className="flex items-center gap-3">
            <input className="flex-1" type='range' min={0} max={180} value={angle} onChange={e => setAngle(Number(e.target.value))} disabled={disabled} />
            <span className="w-10 text-right text-xs text-slate-300">{angle}°</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1"><span>底座</span><span>{base}°</span></div>
            <input className="w-full" type='range' min={0} max={180} value={base} onChange={e => setBase(Number(e.target.value))} disabled={disabled} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span>肩部</span><span>{hombro}°</span></div>
            <input className="w-full" type='range' min={0} max={180} value={hombro} onChange={e => setHombro(Number(e.target.value))} disabled={disabled} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span>肘部</span><span>{codo}°</span></div>
            <input className="w-full" type='range' min={0} max={180} value={codo} onChange={e => setCodo(Number(e.target.value))} disabled={disabled} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button className="btn" onClick={enqueue} disabled={disabled}>加入队列</button>
        {message && <div className="text-xs text-slate-400">{message}</div>}
      </div>
    </div>
  )
}