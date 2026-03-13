"""CassetteAI FastAPI server.

Serves the pipeline via SSE streaming on POST /api/chat.
Run with: uvicorn backend.server:app --reload --port 8000
"""

import json
import os
from pathlib import Path
from typing import AsyncGenerator

# Fail fast at import time if the key is missing — much clearer than a
# mid-stream KeyError buried inside an SSE response.
if "ANTHROPIC_API_KEY" not in os.environ:
    raise RuntimeError(
        "ANTHROPIC_API_KEY is not set. "
        "Export it in the SAME shell that runs uvicorn:\n"
        "  export ANTHROPIC_API_KEY='sk-...'\n"
        "  uvicorn backend.server:app --reload --port 8000"
    )

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.orchestrator import run_pipeline

app = FastAPI(title="CassetteAI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
