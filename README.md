# CassetteAI

**Live demo:** Deployed on [Railway](https://railway.app) — Dockerized FastAPI backend serving the React frontend as static files.

**Natural language → Claude → generative DNA → tissue scoring → interpretation → cassette design.**

A gene therapy design tool where you describe what you need in plain English and get back ranked, scored regulatory element candidates composed into a ready-to-use AAV cassette — in minutes.

The pipeline: Claude parses your intent, DNA-Diffusion generates candidate 200 bp regulatory elements on Modal GPUs, Sei scores them across 21,907 chromatin profiles, then Claude interprets the results, ranks candidates, and assembles a final AAV cassette with a natural-language explanation.

---

## Features

- **Conversational design** — describe your gene therapy goal in plain English and get a complete cassette design back
- **Real generative models** — DNA-Diffusion generates novel 200 bp regulatory elements conditioned on cell type (HepG2, K562, GM12878, hESCT0)
- **Genome-wide scoring** — Sei evaluates each candidate across 21,907 chromatin profiles grouped into 40 tissue/cell-type classes
- **AI interpretation** — Claude Sonnet ranks candidates by tissue specificity, flags sequence pathologies (GC content, homopolymers, cryptic polyA), and recommends a final element
- **Cassette composition** — automatically pairs the top element with a minimal promoter (minTBG), transgene placeholder, polyA signal, and ITRs, with a size check against the 4.7 kb AAV packaging limit
- **Interactive heatmap** — Sei scores visualized as a color-coded grid (blue = silent, red = active) with hover tooltips
- **SVG cassette diagram** — rendered AAV cassette with labeled components and base-pair lengths
- **Streaming UI** — real-time status updates as the pipeline progresses (generating → scoring → analyzing)
- **Chat history** — sidebar with persistent chat sessions, automatic naming, and multi-conversation support
- **Dark mode** — projector-friendly theme

---

## Supported Tissues

| User input | Cell line | Notes |
|-----------|-----------|-------|
| liver / hepatocyte / hepatic | HepG2 | Biologically accurate end-to-end |
| blood / hematopoietic / myeloid | K562 | Myeloid lineage |
| immune / lymphoid / B-cell / T-cell | GM12878 | Lymphoblastoid |
| stem cell / pluripotent / embryonic | hESCT0 | Embryonic stem cell |

For unsupported tissues, CassetteAI explains the limitation and offers the closest available proxy. Sei scoring is accurate for all tissues regardless of which cell type was used for generation.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + Tailwind CSS 4 |
| Backend | FastAPI + SSE streaming |
| AI | Claude Sonnet (Anthropic API) |
| DNA generation | DNA-Diffusion (Modal A100) |
| Sequence scoring | Sei (Modal A100) |
| Routing | wouter |
| Charts | Recharts |
| Deployment | Docker → Railway |

---

## Quick Start (Local Development)

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Modal](https://modal.com) account
- Anthropic API key

### Setup

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

### Deploy Modal GPU functions

```bash
modal deploy backend/modal_generate.py
modal deploy backend/modal_score.py
```

### Run

```bash
# Terminal 1 — backend
uvicorn backend.server:app --reload --port 8000

# Terminal 2 — frontend dev server
cd frontend && npm run dev
```

Open http://localhost:5173 and try:

> "Design a liver-specific enhancer for AAV delivery"

### Docker

```bash
docker build -t cassette-ai .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... cassette-ai
```

---

## Project Structure

```
CassetteAI/
├── backend/
│   ├── server.py            # FastAPI + SSE streaming + static file serving
│   ├── orchestrator.py      # Claude Sonnet intent parsing + pipeline dispatch
│   ├── interpret.py         # Pathology checks, Claude interpretation, cassette composition
│   ├── modal_generate.py    # DNA-Diffusion on Modal (A100)
│   └── modal_score.py       # Sei on Modal (A100)
├── frontend/src/
│   ├── App.jsx              # Layout, routing, sidebar integration
│   ├── Sidebar.jsx          # Collapsible chat list with persistence
│   ├── Chat.jsx             # Streaming chat interface
│   ├── Heatmap.jsx          # Sei score heatmap (Recharts)
│   ├── CassetteDiagram.jsx  # SVG AAV cassette diagram
│   ├── api.js               # SSE client + chat name generation
│   ├── chatIndex.js         # Chat list index (localStorage)
│   └── storage.js           # Chat persistence (localStorage)
├── prompts/
│   ├── system.md            # CassetteAI system prompt
│   └── interpret.md         # Sei score interpretation prompt
├── Dockerfile               # Multi-stage build (Node + Python)
└── SPEC.md                  # Full specification and build progress
```

---

## Models

| Model | Purpose | Runtime |
|-------|---------|---------|
| DNA-Diffusion | Generate 200 bp regulatory elements conditioned on cell type | Modal A100 |
| Sei | Score 21,907 chromatin profiles across 40 tissue classes | Modal A100 |
| Claude Sonnet | Parse intent, orchestrate pipeline, interpret results, compose cassette | Anthropic API |

---

## Known Limitations

- DNA-Diffusion pretrained weights condition on 4 cell types: HepG2, K562, GM12878, hESCT0
- Only liver (HepG2) generation is biologically validated end-to-end
- Other tissues use the closest available cell-type proxy for generation
- Sei scores all tissues accurately regardless of generation proxy
- No fabricated data — if a model is unavailable, the pipeline returns a clear error
