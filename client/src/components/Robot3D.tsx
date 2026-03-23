import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import { useSocket } from '../context/SocketContext'
import { getRobotState } from '../services/api'

interface State { base: number; hombro: number; codo: number }

// Small helper for smoothing state transitions
function RobotScene({ target }: { target: State }) {
  const refTarget = useRef<State>(target)
  const [interp, setInterp] = useState<State>(target)
  useEffect(()=>{ refTarget.current = target }, [target])
  useFrame((_, delta) => {
    setInterp(prev => {
      const speed = 4
      const blend = Math.min(1, delta * speed)
      return {
        base: prev.base + (refTarget.current.base - prev.base) * blend,
        hombro: prev.hombro + (refTarget.current.hombro - prev.hombro) * blend,
        codo: prev.codo + (refTarget.current.codo - prev.codo) * blend,
      }
    })
  })

  // Geometría y longitudes escaladas para vista impactante
  const baseHeight = 1.5
  const baseRadius = 1.2
  const upperLen = 4.5
  const foreLen = 3.8
  const thickness = 0.8
  const jointRadius = 0.5

  // Conversión a radianes y ejes:
  // base: gira todo el brazo sobre Y (yaw)
  // hombro: pitch sobre X modificado para que 0° sea horizontal, 90° vertical y 180° horizontal opuesto
  // codo: pitch sobre X pero modificado para que 0° sea horizontal, 90° vertical y 180° horizontal opuesto
  const baseYaw = interp.base * Math.PI/180
  const shoulderPitch = -(interp.hombro - 90) * Math.PI/180  // Modificado: offset de 90 grados
  const elbowPitch = -(interp.codo - 90) * Math.PI/180  // Modificado: offset de 90 grados

  return (
    <group rotation={[0, baseYaw, 0]}>
      {/* Base masiva con detalles */}
      <mesh position={[0, baseHeight/2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[baseRadius, baseRadius * 1.2, baseHeight, 32]} />
        <meshStandardMaterial color='#ff6b35' metalness={0.3} roughness={0.2} />
      </mesh>
      {/* Anillo decorativo en la base */}
      <mesh position={[0, baseHeight * 0.8, 0]} castShadow>
        <torusGeometry args={[baseRadius * 0.9, 0.15, 16, 32]} />
        <meshStandardMaterial color='#ffcc02' metalness={0.8} roughness={0.1} />
      </mesh>
      
      {/* Articulación del hombro */}
      <group position={[0, baseHeight, 0]} rotation={[shoulderPitch,0,0]}>
        {/* Joint esférico del hombro */}
        <mesh position={[0, 0, 0]} castShadow>
          <sphereGeometry args={[jointRadius, 24, 16]} />
          <meshStandardMaterial color='#34495e' metalness={0.6} roughness={0.3} />
        </mesh>
        
        {/* Brazo superior robusto */}
        <mesh position={[0, upperLen/2, 0]} castShadow receiveShadow>
          <boxGeometry args={[thickness, upperLen, thickness * 0.8]} />
          <meshStandardMaterial color='#3498db' metalness={0.2} roughness={0.4} />
        </mesh>
        
        {/* Detalles en el brazo superior */}
        <mesh position={[0, upperLen * 0.3, thickness * 0.5]} castShadow>
          <boxGeometry args={[thickness * 0.4, upperLen * 0.6, 0.2]} />
          <meshStandardMaterial color='#2980b9' metalness={0.4} roughness={0.2} />
        </mesh>
        
        {/* Articulación del codo */}
        <group position={[0, upperLen, 0]} rotation={[elbowPitch,0,0]}>
          {/* Joint del codo */}
          <mesh position={[0, 0, 0]} castShadow>
            <sphereGeometry args={[jointRadius * 0.8, 20, 16]} />
            <meshStandardMaterial color='#2c3e50' metalness={0.7} roughness={0.2} />
          </mesh>
          
          {/* Antebrazo */}
          <mesh position={[0, foreLen/2, 0]} castShadow receiveShadow>
            <boxGeometry args={[thickness * 0.9, foreLen, thickness * 0.7]} />
            <meshStandardMaterial color='#9b59b6' metalness={0.3} roughness={0.3} />
          </mesh>
          
          {/* Detalles del antebrazo */}
          <mesh position={[thickness * 0.5, foreLen * 0.4, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, foreLen * 0.8, 12]} />
            <meshStandardMaterial color='#8e44ad' metalness={0.5} roughness={0.2} />
          </mesh>
          
          {/* Muñeca/Efector final detallado */}
          <group position={[0, foreLen, 0]}>
            <mesh position={[0, 0.3, 0]} castShadow>
              <sphereGeometry args={[0.4, 20, 16]} />
              <meshStandardMaterial color='#ecf0f1' metalness={0.9} roughness={0.1} />
            </mesh>
            
            {/* Pequeñas "garras" decorativas */}
            <mesh position={[0.3, 0.5, 0]} rotation={[0, 0, Math.PI/6]} castShadow>
              <boxGeometry args={[0.1, 0.6, 0.1]} />
              <meshStandardMaterial color='#95a5a6' metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[-0.3, 0.5, 0]} rotation={[0, 0, -Math.PI/6]} castShadow>
              <boxGeometry args={[0.1, 0.6, 0.1]} />
              <meshStandardMaterial color='#95a5a6' metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

export function Robot3D() {
  const { messages } = useSocket()
  const [targetState, setTargetState] = useState<State>({ base:0, hombro:0, codo:0 })

  // Cargar estado inicial de la base de datos al montar el componente
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const initialState = await getRobotState()
        setTargetState({
          base: initialState.base ?? 0,
          hombro: initialState.hombro ?? 0,
          codo: initialState.codo ?? 0
        })
      } catch (error) {
        console.warn('No se pudo cargar el estado inicial del robot:', error)
        // Si hay error, mantener el estado por defecto (0,0,0)
      }
    }
    
    loadInitialState()
  }, [])

  // Actualizar estado desde mensajes WebSocket
  useEffect(() => {
    for (const raw of messages.slice(-10)) {
      try {
        const evt = JSON.parse(raw)
        if (evt.type === 'STATE_UPDATE' && evt.payload) {
          const p = evt.payload
            ;['base','hombro','codo'].forEach(k=>{ if (typeof p[k]==='number'){} })
          setTargetState((prev)=>({
            base: p.base ?? prev.base,
            hombro: p.hombro ?? prev.hombro,
            codo: p.codo ?? prev.codo
          }))
        }
      } catch { /* ignore non-json */ }
    }
  }, [messages])

  return (
    <div className="h-full w-full rounded-lg overflow-hidden bg-gradient-to-b from-slate-800 to-slate-900 relative">
      <Canvas
        camera={{ 
          position: [8, 6, 8], 
          fov: 50,
          near: 0.1,
          far: 100
        }}
        shadows
        dpr={[1, 2]}
      >
        {/* Iluminación profesional */}
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[10, 15, 5]} 
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <pointLight position={[-10, -10, -5]} intensity={0.3} color="#3498db" />
        <pointLight position={[10, 5, -10]} intensity={0.2} color="#9b59b6" />
        
        {/* Reemplazo del plano negro con uno transparente que sólo recibe sombras */}
        <mesh 
          rotation={[-Math.PI/2, 0, 0]} 
          position={[0, -0.1, 0]}
          receiveShadow
        >
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial 
            color="#1a202c" 
            transparent={true} 
            opacity={0} 
            depthWrite={false}
            roughness={0.8}
          />
        </mesh>
        
        {/* Grid de referencia mejorado */}
        <gridHelper 
          args={[20, 20, '#5b67d8', '#374151']} 
          position={[0, 0, 0]} 
        />
        
        {/* Robot con sombras */}
        <RobotScene target={targetState} />
        
        {/* Controles de órbita para mejor zoom y navegación */}
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          zoomSpeed={1.2}
          panSpeed={0.8}
          rotateSpeed={0.8}
          minDistance={4}
          maxDistance={20}
        />
      </Canvas>
      <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur rounded-lg px-3 py-2 text-xs text-slate-300">
        <div className="font-mono">Base: {targetState.base.toFixed(1)}° | Hombro: {targetState.hombro.toFixed(1)}° | Codo: {targetState.codo.toFixed(1)}°</div>
      </div>
      
      {/* Instrucciones de zoom mejoradas */}
      <div className="absolute top-4 right-4 bg-indigo-900/40 backdrop-blur-md rounded-lg px-3 py-2 text-xs text-slate-300 pointer-events-none">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M15.707 4.293a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-5-5a1 1 0 011.414-1.414L10 8.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Scroll para zoom in/out</span>
          </div>
          <div className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
            <span>Click izquierdo + arrastrar para rotar</span>
          </div>
          <div className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
            </svg>
            <span>Click derecho + arrastrar para mover</span>
          </div>
        </div>
      </div>
    </div>
  )
}
