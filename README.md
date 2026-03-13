# CassetteAI

**Natural language → Claude → generative DNA → tissue scoring → interpretation → cassette design.**

A gene therapy design tool where you describe what you need in plain English and get back ranked, scored regulatory element candidates composed into a ready-to-use AAV cassette — in minutes.

The pipeline: Claude parses your intent, DNA-Diffusion generates candidate 200 bp regulatory elements on Modal GPUs, Sei scores them across 21,907 chromatin profiles, then Claude interprets the results, ranks candidates, and assembles a final AAV cassette with a natural-language explanation.

---

## Quick Start

### 1. Prerequisites

- Python 3.10+
- Node.js 18+
- [Modal](https://modal.com) account

### 2. Credentials

```bash
export ANTHROPIC_API_KEY=sk-ant-...
python3 -m modal setup   # authenticate Modal (one-time)
```

### 3. Install dependencies

```bash
# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn anthropic modal

# Frontend
cd frontend && npm install && cd ..
```

### 4. Deploy Modal GPU functions

```bash
modal deploy backend/modal_generate.py
modal deploy backend/modal_score.py
```

### 5. Run the app

```bash
# Terminal 1 — backend
uvicorn backend.server:app --reload --port 8000

# Terminal 2 — frontend dev server
cd frontend && npm run dev
```

Open http://localhost:5173 and try:

> "Design a liver-specific enhancer for AAV delivery"

---

## Cache

The first run populates a local cache under `cache/`. Subsequent runs with the same (or synonymous) tissue prompt return instantly from cache — no GPU cold starts during demos.

Cache directories:
- `cache/liver/` — HepG2-conditioned elements
- `cache/cardiac/` — K562 proxy
- `cache/neural/` — GM12878 proxy

---

## Project Structure

```
CassetteAI/
├── backend/
│   ├── modal_generate.py   # DNA-Diffusion on Modal (A100)
│   ├── modal_score.py       # Sei on Modal (A100)
│   ├── orchestrator.py      # Claude Sonnet intent parsing + pipeline dispatch
│   ├── cache.py             # Tissue-keyed cache layer
│   ├── interpret.py         # Claude Opus biological interpretation
│   └── server.py            # FastAPI + SSE streaming
├── frontend/src/
│   ├── App.jsx              # Three-panel layout
│   ├── Chat.jsx             # Streaming chat interface
│   ├── Heatmap.jsx          # Sei score heatmap
│   ├── CassetteDiagram.jsx  # SVG AAV cassette
│   └── api.js               # SSE client
├── prompts/
│   ├── system.md            # CassetteAI system prompt
│   └── interpret.md         # Sei interpretation prompt
└── cache/                   # Populated by running prompts through the app
```

---

## Models

| Model | Purpose | Where |
|-------|---------|-------|
| DNA-Diffusion | Generate 200 bp regulatory elements conditioned on cell type | Modal A100 |
| Sei | Score 21,907 chromatin profiles across 40 tissue classes | Modal A100 |
| Claude Sonnet | Parse user intent, orchestrate pipeline | Anthropic API |
| Claude Opus | Rank candidates, flag pathologies, compose cassette | Anthropic API |

---

## Known Limitations

- DNA-Diffusion pretrained weights only condition on HepG2, K562, GM12878 cell types
- Cardiac and neural generation uses cell-type proxies (K562, GM12878 respectively)
- Only liver (HepG2) is biologically accurate end-to-end
- Sei scores all tissues accurately regardless of generation proxy
