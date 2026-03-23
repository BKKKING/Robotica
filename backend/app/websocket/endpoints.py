"""WebSocket endpoints."""
from __future__ import annotations
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .manager import manager
import asyncio
import logging

logger = logging.getLogger("app.websocket")
ws_router = APIRouter()


@ws_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    logger.info(f"New WebSocket connection. Active connections: {len(manager.active_connections)}")
    try:
        # 这个循环只是为了保持连接存活
        # 服务器可以在任何时候独立调用 manager.broadcast()
        while True:
            # 我们不关心客户端发送的消息，只是保持连接打开
            # 使用长超时来减少循环
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=3600)
            except asyncio.TimeoutError:
                # 每小时超时一次，只是为了保持连接活跃
                await asyncio.sleep(1)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"WebSocket disconnected. Active connections: {len(manager.active_connections)}")
