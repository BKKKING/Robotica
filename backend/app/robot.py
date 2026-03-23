"""Robot state & queue endpoints (sequential & parallel).

Ahora también persiste el estado en Firebase (si está inicializado) en la ruta:
Realtime DB: /robotica/{base,hombro,codo}
Firestore:   collection "robotica" -> documento "state" con campos base,hombro,codo
"""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends, Request
import asyncio
import time
from pydantic import BaseModel, Field
from typing import List
from .auth import get_current_admin
from app.websocket.manager import manager
from app.core.config import Settings
import json
import firebase_admin  # type: ignore
from firebase_admin import db as firebase_rtdb, firestore as firebase_fs  # type: ignore

settings = Settings()
router = APIRouter(prefix="/robot", tags=["robot"])

# In-memory storage (replace with Firebase persistence as needed)
robot_state = {"base": 0, "hombro": 0, "codo": 0}
sequential_queue: List[dict] = []  # each item: {joint: str, angle: int, duration_ms: int}
parallel_queue: List[dict] = []    # each item: {base: int, hombro: int, codo: int, duration_ms: int}
_simulation_lock = asyncio.Lock()
_simulation_running = False
_simulation_mode: str | None = None

class State(BaseModel):
    base: int = Field(ge=0, le=180)
    hombro: int = Field(ge=0, le=180)
    codo: int = Field(ge=0, le=180)

class SequentialItem(BaseModel):
    joint: str
    angle: int = Field(ge=0, le=180)
    duration_ms: int = Field(default=1000, ge=50, le=60000)


class ParallelItem(State):
    duration_ms: int = Field(default=1000, ge=50, le=60000)

AdminDep = Depends(get_current_admin)

class SequentialProgram(BaseModel):
    name: str
    items: List[SequentialItem]
    created_at: float = Field(default_factory=lambda: __import__('time').time())

class ParallelProgram(BaseModel):
    name: str
    items: List[ParallelItem]
    created_at: float = Field(default_factory=lambda: __import__('time').time())


# --- Programas guardados en Firebase (inmutables) ---
@router.post("/programs/sequential", response_model=SequentialProgram)
async def save_sequential_program(program: SequentialProgram, request: Request, _admin: str = AdminDep):
    """Guarda un programa secuencial en Firebase."""
    db = getattr(request.app.state, "db", None)
    if not db:
        raise HTTPException(503, "Firestore no disponible")
    doc_id = f"seq_{int(program.created_at)}_{program.name}"
    try:
        db.collection("programas").document(doc_id).set({
            **program.dict(),
            "type": "sequential"
        })
    except Exception as e:
        raise HTTPException(500, f"Error guardando programa: {e}")
    return program

@router.post("/programs/parallel", response_model=ParallelProgram)
async def save_parallel_program(program: ParallelProgram, request: Request, _admin: str = AdminDep):
    """Guarda un programa paralelo en Firebase."""
    db = getattr(request.app.state, "db", None)
    if not db:
        raise HTTPException(503, "Firestore no disponible")
    doc_id = f"par_{int(program.created_at)}_{program.name}"
    try:
        db.collection("programas").document(doc_id).set({
            **program.dict(),
            "type": "parallel"
        })
    except Exception as e:
        raise HTTPException(500, f"Error guardando programa: {e}")
    return program

@router.get("/programs/list")
async def list_programs(request: Request):
    """Lista todos los programas guardados."""
    db = getattr(request.app.state, "db", None)
    if not db:
        raise HTTPException(503, "Firestore no disponible")
    docs = db.collection("programas").stream()
    programs = []
    for doc in docs:
        data = doc.to_dict()
        programs.append({
            "id": doc.id,
            "name": data.get("name"),
            "type": data.get("type"),
            "created_at": data.get("created_at"),
            "items_count": len(data.get("items", []))
        })
    return programs

@router.post("/programs/{program_id}/execute")
async def execute_program(program_id: str, request: Request, _admin: str = AdminDep):
    """Ejecuta un programa guardado sin borrarlo."""
    db = getattr(request.app.state, "db", None)
    if not db:
        raise HTTPException(503, "Firestore no disponible")
    
    global _simulation_running, _simulation_mode
    if _simulation_running:
        raise HTTPException(409, detail="Simulación en curso")
    
    # Obtener el programa de Firebase
    try:
        doc = db.collection("programas").document(program_id).get()
        if not doc.exists:
            raise HTTPException(404, "Programa no encontrado")
        data = doc.to_dict()
    except Exception as e:
        raise HTTPException(500, f"Error obteniendo programa: {e}")
    
    program_type = data.get("type")
    items = data.get("items", [])
    
    if not items:
        return {"detail": "Programa vacío", "executed": []}
    
    _simulation_running = True
    _simulation_mode = f"{program_type}_program"
    
    async def runner():
        executed = []
        try:
            if program_type == "sequential":
                for item in items:
                    await _animate_sequential_step(item)
                    executed.append(item)
            elif program_type == "parallel":
                for item in items:
                    await _animate_parallel_block(item)
                    executed.append(item)
            await _broadcast_event("STATE_UPDATE", robot_state)
            await _broadcast_event("PROGRAM_COMPLETED", {
                "program_id": program_id,
                "name": data.get("name"),
                "type": program_type
            })
        finally:
            _end_simulation()
    
    asyncio.create_task(runner())
    return {
        "detail": f"Ejecutando programa {data.get('name')} ({program_type})",
        "program_id": program_id,
        "items_count": len(items)
    }



@router.get("/state", response_model=State)
async def get_state():
    return State(**robot_state)

@router.post("/state", response_model=State)
async def set_state(new_state: State, request: Request, _admin: str = AdminDep):
    robot_state.update(new_state.dict())
    await _broadcast_event("STATE_UPDATE", robot_state)
    await _persist_state(request)
    return new_state

# Sequential
@router.post("/sequential/enqueue")
async def enqueue_seq(item: SequentialItem, _admin: str = AdminDep):
    if item.joint not in robot_state:
        raise HTTPException(400, detail="Joint inválido")
    sequential_queue.append(item.dict())
    return {"queued": item}

@router.get("/sequential/list")
async def list_seq():
    return sequential_queue

@router.post("/sequential/reset")
async def reset_seq(_admin: str = AdminDep):
    sequential_queue.clear()
    return {"detail": "cola secuencial vacía"}

@router.post("/sequential/start")
async def start_seq(_admin: str = AdminDep):
    global _simulation_running, _simulation_mode
    if _simulation_running:
        raise HTTPException(409, detail="Simulación en curso")
    if not sequential_queue:
        return {"executed": [], "state": robot_state}
    _simulation_running = True
    _simulation_mode = "sequential"
    async def runner():
        ran = []
        try:
            while sequential_queue:
                step = sequential_queue.pop(0)
                await _animate_sequential_step(step)
                ran.append(step)
            await _broadcast_event("STATE_UPDATE", robot_state)
        finally:
            nonlocal_ran[:] = ran  # store result
            _end_simulation()
    nonlocal_ran: List[dict] = []
    asyncio.create_task(runner())
    return {"detail": "Simulación secuencial iniciada"}

# Parallel
@router.post("/parallel/enqueue")
async def enqueue_parallel(item: ParallelItem, _admin: str = AdminDep):
    parallel_queue.append(item.dict())
    return {"queued": item}

@router.get("/parallel/list")
async def list_parallel():
    return parallel_queue

@router.post("/parallel/reset")
async def reset_parallel(_admin: str = AdminDep):
    parallel_queue.clear()
    return {"detail": "cola paralela vacía"}

@router.post("/parallel/start")
async def start_parallel(_admin: str = AdminDep):
    global _simulation_running, _simulation_mode
    if _simulation_running:
        raise HTTPException(409, detail="Simulación en curso")
    if not parallel_queue:
        return {"executed": [], "state": robot_state}
    _simulation_running = True
    _simulation_mode = "parallel"
    async def runner():
        ran = []
        try:
            while parallel_queue:
                block = parallel_queue.pop(0)
                await _animate_parallel_block(block)
                ran.append(block)
            await _broadcast_event("STATE_UPDATE", robot_state)
        finally:
            _end_simulation()
    asyncio.create_task(runner())
    return {"detail": "Simulación paralela iniciada"}

# ----- Simulation helpers -----

def _end_simulation():
    global _simulation_running, _simulation_mode
    _simulation_running = False
    _simulation_mode = None

async def _animate_sequential_step(step: dict):
    joint = step['joint']
    target = step['angle']
    duration = step.get('duration_ms', 1000)
    start_angle = robot_state[joint]
    await _broadcast_event("MOVE_SEQ_START", step)
    if duration <= 0 or target == start_angle:
        robot_state[joint] = target
        await _broadcast_event("STATE_UPDATE", robot_state)
        await _broadcast_event("MOVE_SEQ_END", step)
        return
    interval = 0.05  # 50 ms
    steps = max(1, int(duration / (interval * 1000)))
    for i in range(1, steps + 1):
        factor = i / steps
        robot_state[joint] = round(start_angle + (target - start_angle) * factor)
        await _broadcast_event("STATE_UPDATE", robot_state)
        _persist_state_light()  # persist cada frame (ver notas de rendimiento)
        await asyncio.sleep(interval)
    await _broadcast_event("MOVE_SEQ_END", step)

async def _animate_parallel_block(block: dict):
    duration = block.get('duration_ms', 1000)
    start_state = robot_state.copy()
    targets = {k: block[k] for k in ['base','hombro','codo'] if k in block}
    await _broadcast_event("MOVE_PAR_START", block)
    if duration <= 0:
        robot_state.update(targets)
        await _broadcast_event("STATE_UPDATE", robot_state)
        await _broadcast_event("MOVE_PAR_END", block)
        return
    interval = 0.05
    steps = max(1, int(duration / (interval * 1000)))
    for i in range(1, steps + 1):
        factor = i / steps
        for joint, target in targets.items():
            s = start_state[joint]
            robot_state[joint] = round(s + (target - s) * factor)
        await _broadcast_event("STATE_UPDATE", robot_state)
        _persist_state_light()
        await asyncio.sleep(interval)
    await _broadcast_event("MOVE_PAR_END", block)

@router.get("/status")
async def simulation_status():
    return {
        "running": _simulation_running,
        "mode": _simulation_mode,
        "sequential_queue_len": len(sequential_queue),
        "parallel_queue_len": len(parallel_queue),
        "state": robot_state,
    }

async def _broadcast_event(event_type: str, payload: dict):
    message = json.dumps({"type": event_type, "payload": payload})
    await manager.broadcast(message)


# ---------------- Firebase persistence helpers -----------------
async def _persist_state(request: Request) -> None:
    """Persiste el estado actual del robot en Firebase (si está disponible).

    - Realtime Database: /robotica/{base,hombro,codo}
    - Firestore: collection("robotica").document("state")
    Cualquier error se ignora silenciosamente para no romper el flujo.
    """
    # Firestore (cargado en app.state.db en lifespan si credenciales existen)
    firestore_db = getattr(request.app.state, "db", None)
    if firestore_db:
        try:  # collection robotica / doc state
            firestore_db.collection("robotica").document("state").set(robot_state)
        except Exception:  # pragma: no cover - tolerante
            pass
    # Realtime DB (usa firebase_admin.db.reference)
    try:
        ref = firebase_rtdb.reference("/robotica")  # type: ignore
        ref.update(robot_state)
    except Exception:  # pragma: no cover - tolerante
        pass

def _persist_state_light() -> None:
    """Persistencia sincrónica ligera (sin Request) para actualizaciones frecuentes.

    Nota: Firestore tiene costos por escritura; si esto resulta costoso se puede
    limitar a cada N frames o solo al final. Realtime DB está mejor para updates
    frecuentes. Aquí intentamos ambas pero ignoramos errores.
    """
    if not firebase_admin._apps:  # type: ignore
        return
    try:  # Realtime DB
        firebase_rtdb.reference("/robotica").update(robot_state)  # type: ignore
    except Exception:
        pass
    try:  # Firestore (opcional, podría comentarse si hay muchas escrituras)
        firebase_fs.client().collection("robotica").document("state").set(robot_state)
    except Exception:
        pass

