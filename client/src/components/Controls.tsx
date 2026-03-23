import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { enqueueSequential, enqueueParallel } from '../services/api'

interface ControlsProps {
  mode: 'sequential' | 'parallel'
}

interface JointAngles {
  joint1: number
  joint2: number
  joint3: number
}

type TrajectoryState = 'idle' | 'recording' | 'playing' | 'paused'

export function Controls({ mode }: ControlsProps) {
  const { token } = useAuth()
  const { send } = useSocket()
  const disabled = !token

  // 关节角度状态
  const [base, setBase] = useState(0)
  const [hombro, setHombro] = useState(0)
  const [codo, setCodo] = useState(0)
  const [joint, setJoint] = useState<'base' | 'hombro' | 'codo'>('base')
  const [angle, setAngle] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  // 轨迹记录状态
  const [trajectory, setTrajectory] = useState<JointAngles[]>([])
  const [trajectoryState, setTrajectoryState] = useState<TrajectoryState>('idle')
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0)

  // 使用 ref 来存储定时器 ID，避免闭包问题
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 获取当前关节角度
  const getCurrentAngles = useCallback((): JointAngles => {
    if (mode === 'sequential') {
      // 在顺序模式下，根据当前选中的关节返回对应角度
      return {
        joint1: joint === 'base' ? angle : base,
        joint2: joint === 'hombro' ? angle : hombro,
        joint3: joint === 'codo' ? angle : codo
      }
    }
    return { joint1: base, joint2: hombro, joint3: codo }
  }, [mode, base, hombro, codo, joint, angle])

  // 开始记录轨迹
  const startRecording = () => {
    if (trajectoryState === 'recording') return

    // 清空之前的轨迹
    setTrajectory([])
    setTrajectoryState('recording')
    setMessage('开始记录轨迹...')

    // 每 0.2 秒记录一次
    recordIntervalRef.current = setInterval(() => {
      const angles = getCurrentAngles()
      setTrajectory(prev => [...prev, angles])
    }, 200)
  }

  // 停止记录轨迹
  const stopRecording = () => {
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current)
      recordIntervalRef.current = null
    }
    setTrajectoryState('idle')
    setMessage(`已记录 ${trajectory.length} 个点`)
  }

  // 播放轨迹
  const playTrajectory = () => {
    if (trajectory.length === 0) {
      setMessage('没有可播放的轨迹')
      return
    }

    setTrajectoryState('playing')
    setCurrentPlayIndex(0)
    setMessage('正在播放轨迹...')

    let index = 0
    playIntervalRef.current = setInterval(() => {
      if (index >= trajectory.length) {
        // 播放完成
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current)
          playIntervalRef.current = null
        }
        setTrajectoryState('idle')
        setCurrentPlayIndex(0)
        setMessage('轨迹播放完成')
        return
      }

      const point = trajectory[index]

      // 通过 WebSocket 发送角度数据
      send({
        joint1: point.joint1,
        joint2: point.joint2,
        joint3: point.joint3
      })

      // 更新 UI 上的滑块
      setBase(point.joint1)
      setHombro(point.joint2)
      setCodo(point.joint3)

      setCurrentPlayIndex(index)
      index++
    }, 200)
  }

  // 暂停播放
  const pauseTrajectory = () => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current)
      playIntervalRef.current = null
    }
    setTrajectoryState('paused')
    setMessage('轨迹播放已暂停')
  }

  // 停止播放
  const stopTrajectory = () => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current)
      playIntervalRef.current = null
    }
    setTrajectoryState('idle')
    setCurrentPlayIndex(0)
    setMessage('轨迹播放已停止')
  }

  // 清空轨迹
  const clearTrajectory = () => {
    if (trajectoryState === 'recording') {
      stopRecording()
    }
    if (trajectoryState === 'playing' || trajectoryState === 'paused') {
      stopTrajectory()
    }
    setTrajectory([])
    setMessage('轨迹已清空')
  }

  // 继续播放（从暂停处）
  const resumeTrajectory = () => {
    if (trajectory.length === 0 || currentPlayIndex >= trajectory.length) {
      setMessage('没有可播放的轨迹')
      return
    }

    setTrajectoryState('playing')
    setMessage('继续播放轨迹...')

    let index = currentPlayIndex
    playIntervalRef.current = setInterval(() => {
      if (index >= trajectory.length) {
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current)
          playIntervalRef.current = null
        }
        setTrajectoryState('idle')
        setCurrentPlayIndex(0)
        setMessage('轨迹播放完成')
        return
      }

      const point = trajectory[index]

      send({
        joint1: point.joint1,
        joint2: point.joint2,
        joint3: point.joint3
      })

      setBase(point.joint1)
      setHombro(point.joint2)
      setCodo(point.joint3)

      setCurrentPlayIndex(index)
      index++
    }, 200)
  }

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current)
      }
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
      }
    }
  }, [])

  const enqueue = async () => {
    if (!token) return
    try {
      if (mode === 'sequential') {
        await enqueueSequential({ joint, angle })
        setMessage(`已加入队列 ${joint}:${angle}`)
      } else {
        await enqueueParallel({ base, hombro, codo })
        setMessage(`已加入并行队列 (${base},${hombro},${codo})`)
      }
    } catch {
      setMessage('加入队列失败')
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">控制面板 <span className="text-xs text-slate-400">({mode === 'sequential' ? '顺序' : '并行'})</span></h3>

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

      {/* 轨迹记录控制区域 */}
      <div className="border-t border-slate-600 pt-4 mt-4">
        <h4 className="text-md font-semibold mb-3 text-indigo-300">轨迹记录</h4>

        {/* 记录控制按钮 */}
        <div className="flex flex-wrap gap-2 mb-3">
          {trajectoryState !== 'recording' ? (
            <button
              className="btn bg-green-600 hover:bg-green-700"
              onClick={startRecording}
              disabled={disabled || trajectoryState === 'playing'}
            >
              开始记录
            </button>
          ) : (
            <button
              className="btn bg-red-600 hover:bg-red-700"
              onClick={stopRecording}
              disabled={disabled}
            >
              停止记录
            </button>
          )}

          <button
            className="btn bg-blue-600 hover:bg-blue-700"
            onClick={playTrajectory}
            disabled={disabled || trajectory.length === 0 || trajectoryState === 'playing' || trajectoryState === 'recording'}
          >
            播放轨迹
          </button>

          {trajectoryState === 'playing' && (
            <button
              className="btn bg-yellow-600 hover:bg-yellow-700"
              onClick={pauseTrajectory}
              disabled={disabled}
            >
              暂停
            </button>
          )}

          {trajectoryState === 'paused' && (
            <button
              className="btn bg-blue-600 hover:bg-blue-700"
              onClick={resumeTrajectory}
              disabled={disabled}
            >
              继续
            </button>
          )}

          {(trajectoryState === 'playing' || trajectoryState === 'paused') && (
            <button
              className="btn bg-red-600 hover:bg-red-700"
              onClick={stopTrajectory}
              disabled={disabled}
            >
              停止播放
            </button>
          )}

          <button
            className="btn bg-gray-600 hover:bg-gray-700"
            onClick={clearTrajectory}
            disabled={disabled || (trajectory.length === 0 && trajectoryState === 'idle')}
          >
            清空轨迹
          </button>
        </div>

        {/* 轨迹状态显示 */}
        <div className="text-xs text-slate-400 space-y-1">
          <div>状态: <span className={
            trajectoryState === 'recording' ? 'text-red-400' :
            trajectoryState === 'playing' ? 'text-green-400' :
            trajectoryState === 'paused' ? 'text-yellow-400' : 'text-slate-300'
          }>
            {trajectoryState === 'idle' && '空闲'}
            {trajectoryState === 'recording' && '正在记录'}
            {trajectoryState === 'playing' && '正在播放'}
            {trajectoryState === 'paused' && '已暂停'}
          </span></div>
          <div>已记录点数: <span className="text-indigo-300">{trajectory.length}</span></div>
          {trajectoryState === 'playing' && (
            <div>播放进度: <span className="text-indigo-300">{currentPlayIndex + 1} / {trajectory.length}</span></div>
          )}
          {trajectoryState === 'paused' && (
            <div>暂停位置: <span className="text-indigo-300">{currentPlayIndex + 1} / {trajectory.length}</span></div>
          )}
        </div>
      </div>
    </div>
  )
}
