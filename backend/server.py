"""CassetteAI FastAPI server.

Serves the pipeline via SSE streaming on POST /api/chat.
Run with: uvicorn backend.server:app --reload --port 8000
"""

from dotenv import load_dotenv
load_dotenv()

import json
import logging
import os
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.orchestrator import run_pipeline

logger = logging.getLogger(__name__)

app = FastAPI(title="CassetteAI")

_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _check_env() -> None:
    if "ANTHROPIC_API_KEY" not in os.environ:
        logger.error(
            "ANTHROPIC_API_KEY is not set. "
            "The /api/chat endpoint will fail until it is configured."
        )


class ChatRequest(BaseModel):
    prompt: str
    history: list[dict[str, str]] = []


async def _event_stream(prompt: str, history: list[dict[str, str]]) -> AsyncGenerator[str, None]:
    async for event in run_pipeline(prompt, history=history):
        yield f"data: {json.dumps(event)}\n\n"


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        _event_stream(request.prompt, request.history),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# Serve frontend in production — must be last so API routes take priority
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="static")
