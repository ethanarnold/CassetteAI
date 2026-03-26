# Development

## Prerequisites

- Python 3.10+
- Node.js 18+
- [Modal](https://modal.com) account
- Anthropic API key

## Setup

```bash
# Clone
git clone https://github.com/your-org/CassetteAI.git
cd CassetteAI

# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Frontend
cd frontend && npm install && cd ..

# Credentials
export ANTHROPIC_API_KEY=sk-ant-...
python3 -m modal setup   # one-time Modal auth
```

## Deploy Modal GPU functions

```bash
modal deploy backend/modal_generate.py
modal deploy backend/modal_score.py
```

## Run

```bash
# Terminal 1 — backend
uvicorn backend.server:app --reload --port 8000

# Terminal 2 — frontend dev server
cd frontend && npm run dev
```

Open http://localhost:5173 and try:

> "Design a liver-specific enhancer for AAV delivery"

## Docker

```bash
docker build -t cassette-ai .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... cassette-ai
```
