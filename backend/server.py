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

from backend.orchestrator import get_anthropic_client, run_pipeline

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


class ChatNameRequest(BaseModel):
    prompt: str


@app.post("/api/chat-name")
async def chat_name(request: ChatNameRequest) -> dict[str, str]:
    client = get_anthropic_client()
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=20,
        system="Generate a 2-5 word title for this chat. Return ONLY the title.",
        messages=[{"role": "user", "content": request.prompt}],
    )
    name = response.content[0].text.strip().strip('"').strip("'")
    return {"name": name}


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


# ---------------------------------------------------------------------------
# SPA static files — serves index.html for any path that doesn't match a
# real file (needed for client-side routing under /chat/*).
# ---------------------------------------------------------------------------
class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except Exception:
            # Fall back to index.html for SPA client-side routes
            return await super().get_response("index.html", scope)


# Serve frontend in production — must be last so API routes take priority
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", SPAStaticFiles(directory=str(_frontend_dist), html=True), name="static")
