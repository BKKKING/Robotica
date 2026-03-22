import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { enqueueSequential, enqueueParallel } from '../services/api'
import type { JointAngles } from '../types'

interface ControlsProps {
  mode: 'sequential' | 'parallel'
  onAnglesChange?: (angles: JointAngles) => void
}

export function Controls({ mode, onAnglesChange }: ControlsProps) {
  const { token } = useAuth()
  const disabled = !token
  const [base, setBase] = useState(0)
  const [hombro, setHombro] = useState(0)
  const [codo, setCodo] = useState(0)
  const [joint, setJoint] = useState<'base' | 'hombro' | 'codo'>('base')
  const [angle, setAngle] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  const handleBaseChange = (value: number) => {
    setBase(value)
    onAnglesChange?.({ base: value, hombro, codo })
  }

  const handleHombroChange = (value: number) => {
    setHombro(value)
    onAnglesChange?.({ base, hombro: value, codo })
  }

  const handleCodoChange = (value: number) => {
    setCodo(value)
    onAnglesChange?.({ base, hombro, codo: value })
  }

  const handleAngleChange = (value: number) => {
    setAngle(value)
    const newAngles = { base, hombro, codo }
    newAngles[joint] = value
    onAnglesChange?.(newAngles)
  }

  const enqueue = async () => {
    if (!token) return
    try {
      if (mode === 'sequential') {
        await enqueueSequential({ joint, angle })
        setMessage(`已添加 ${joint}:${angle}°`)
      } else {
        await enqueueParallel({ base, hombro, codo })
        setMessage(`已添加并行任务 (${base}°,${hombro}°,${codo}°)`)
      }
    } catch {
      setMessage('添加失败')
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">控制面板 <span className="text-xs text-slate-400">({mode === 'sequential' ? '顺序模式' : '并行模式'})</span></h3>
      {mode === 'sequential' ? (
        <div className="space-y-2">
          <select className="input" value={joint} onChange={e => setJoint(e.target.value as any)} disabled={disabled}>
            <option value='base'>底座</option>
            <option value='hombro'>肩部</option>
            <option value='codo'>肘部</option>
          </select>
          <div className="flex items-center gap-3">
            <input className="flex-1" type='range' min={0} max={180} value={angle} onChange={e => handleAngleChange(Number(e.target.value))} disabled={disabled} />
            <span className="w-10 text-right text-xs text-slate-300">{angle}°</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1"><span>底座</span><span>{base}°</span></div>
            <input className="w-full" type='range' min={0} max={180} value={base} onChange={e => handleBaseChange(Number(e.target.value))} disabled={disabled} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span>肩部</span><span>{hombro}°</span></div>
            <input className="w-full" type='range' min={0} max={180} value={hombro} onChange={e => handleHombroChange(Number(e.target.value))} disabled={disabled} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span>肘部</span><span>{codo}°</span></div>
            <input className="w-full" type='range' min={0} max={180} value={codo} onChange={e => handleCodoChange(Number(e.target.value))} disabled={disabled} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button className="btn" onClick={enqueue} disabled={disabled}>添加到队列</button>
        {message && <div className="text-xs text-slate-400">{message}</div>}
      </div>
    </div>
  )
}
