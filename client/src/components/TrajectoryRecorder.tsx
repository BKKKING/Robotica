import { useState, useRef, useCallback, useEffect } from 'react'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import type { JointAngles } from '../types'

interface TrajectoryRecorderProps {
  currentAngles: JointAngles
  onPlayStateChange?: (angles: JointAngles | null) => void
}

type RecorderState = 'idle' | 'recording' | 'playing' | 'paused'

export function TrajectoryRecorder({ currentAngles, onPlayStateChange }: TrajectoryRecorderProps) {
  const { send } = useSocket()
  const { token } = useAuth()
  const disabled = !token

  const [trajectory, setTrajectory] = useState<JointAngles[]>([])
  const [recorderState, setRecorderState] = useState<RecorderState>('idle')
  const [playbackIndex, setPlaybackIndex] = useState(0)

  const recordIntervalRef = useRef<number | null>(null)
  const playbackIntervalRef = useRef<number | null>(null)

  const clearAllIntervals = useCallback(() => {
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current)
      recordIntervalRef.current = null
    }
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current)
      playbackIntervalRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => clearAllIntervals()
  }, [clearAllIntervals])

  const startRecording = useCallback(() => {
    clearAllIntervals()
    setTrajectory([])
    setRecorderState('recording')

    recordIntervalRef.current = window.setInterval(() => {
      setTrajectory(prev => [...prev, { ...currentAngles }])
    }, 200)
  }, [currentAngles, clearAllIntervals])

  const stopRecording = useCallback(() => {
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current)
      recordIntervalRef.current = null
    }
    setRecorderState('idle')
  }, [])

  const startPlayback = useCallback(() => {
    if (trajectory.length === 0) return

    clearAllIntervals()
    setRecorderState('playing')
    setPlaybackIndex(0)

    let currentIndex = 0

    const playNextFrame = () => {
      if (currentIndex >= trajectory.length) {
        clearAllIntervals()
        setRecorderState('idle')
        setPlaybackIndex(0)
        onPlayStateChange?.(null)
        return
      }

      const angles = trajectory[currentIndex]
      send(JSON.stringify({
        type: 'STATE_UPDATE',
        payload: angles
      }))
      onPlayStateChange?.(angles)
      setPlaybackIndex(currentIndex)
      currentIndex++
    }

    playNextFrame()
    playbackIntervalRef.current = window.setInterval(playNextFrame, 200)
  }, [trajectory, send, clearAllIntervals, onPlayStateChange])

  const pausePlayback = useCallback(() => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current)
      playbackIntervalRef.current = null
    }
    setRecorderState('paused')
  }, [])

  const resumePlayback = useCallback(() => {
    if (trajectory.length === 0 || playbackIndex >= trajectory.length) return

    clearAllIntervals()
    setRecorderState('playing')

    let currentIndex = playbackIndex

    const playNextFrame = () => {
      if (currentIndex >= trajectory.length) {
        clearAllIntervals()
        setRecorderState('idle')
        setPlaybackIndex(0)
        onPlayStateChange?.(null)
        return
      }

      const angles = trajectory[currentIndex]
      send(JSON.stringify({
        type: 'STATE_UPDATE',
        payload: angles
      }))
      onPlayStateChange?.(angles)
      setPlaybackIndex(currentIndex)
      currentIndex++
    }

    playbackIntervalRef.current = window.setInterval(playNextFrame, 200)
  }, [trajectory, playbackIndex, send, clearAllIntervals, onPlayStateChange])

  const stopPlayback = useCallback(() => {
    clearAllIntervals()
    setRecorderState('idle')
    setPlaybackIndex(0)
    onPlayStateChange?.(null)
  }, [clearAllIntervals, onPlayStateChange])

  const clearTrajectory = useCallback(() => {
    clearAllIntervals()
    setTrajectory([])
    setRecorderState('idle')
    setPlaybackIndex(0)
    onPlayStateChange?.(null)
  }, [clearAllIntervals, onPlayStateChange])

  const renderButtons = () => {
    if (disabled) {
      return <div className="text-xs text-slate-500">请先登录以使用轨迹记录功能</div>
    }

    switch (recorderState) {
      case 'idle':
        return (
          <div className="flex flex-wrap gap-2">
            <button
              className="btn bg-green-600 hover:bg-green-700"
              onClick={startRecording}
            >
              开始记录
            </button>
            <button
              className="btn"
              onClick={startPlayback}
              disabled={trajectory.length === 0}
            >
              播放轨迹
            </button>
            <button
              className="btn bg-red-600 hover:bg-red-700"
              onClick={clearTrajectory}
              disabled={trajectory.length === 0}
            >
              清空轨迹
            </button>
          </div>
        )

      case 'recording':
        return (
          <div className="flex flex-wrap gap-2">
            <button
              className="btn bg-red-600 hover:bg-red-700"
              onClick={stopRecording}
            >
              停止记录
            </button>
          </div>
        )

      case 'playing':
        return (
          <div className="flex flex-wrap gap-2">
            <button
              className="btn bg-yellow-600 hover:bg-yellow-700"
              onClick={pausePlayback}
            >
              暂停
            </button>
            <button
              className="btn bg-red-600 hover:bg-red-700"
              onClick={stopPlayback}
            >
              停止
            </button>
          </div>
        )

      case 'paused':
        return (
          <div className="flex flex-wrap gap-2">
            <button
              className="btn bg-green-600 hover:bg-green-700"
              onClick={resumePlayback}
            >
              继续
            </button>
            <button
              className="btn bg-red-600 hover:bg-red-700"
              onClick={stopPlayback}
            >
              停止
            </button>
          </div>
        )
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">轨迹记录</h3>
      
      <div className="flex flex-wrap gap-2">
        {renderButtons()}
      </div>

      <div className="text-sm text-slate-400 space-y-1">
        <div>
          状态: 
          <span className={`ml-2 font-medium ${
            recorderState === 'recording' ? 'text-red-400' :
            recorderState === 'playing' ? 'text-green-400' :
            recorderState === 'paused' ? 'text-yellow-400' :
            'text-slate-400'
          }`}>
            {recorderState === 'idle' ? '空闲' :
             recorderState === 'recording' ? '记录中...' :
             recorderState === 'playing' ? '播放中...' :
             '已暂停'}
          </span>
        </div>
        <div>已记录轨迹点: <span className="font-medium text-purple-400">{trajectory.length}</span> 个</div>
        {recorderState === 'playing' || recorderState === 'paused' ? (
          <div>播放进度: <span className="font-medium text-blue-400">{playbackIndex + 1}</span> / {trajectory.length}</div>
        ) : null}
      </div>
    </div>
  )
}
