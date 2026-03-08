#!/usr/bin/env bash
# Terminal 1: Backend
cd "$(dirname "$0")"
source .venv/bin/activate
uvicorn backend.server:app --reload --port 8000
