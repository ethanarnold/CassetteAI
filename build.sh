#!/usr/bin/env bash
###############################################################################
# CassetteAI — One-Shot Build Script
#
# Each phase invokes a fresh Claude Code agent with a scoped prompt.
# Agents read SPEC.md themselves and run their own commands.
# Phases are sequential because later phases depend on earlier artifacts.
###############################################################################
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

CLAUDE="claude --dangerously-skip-permissions -p"

log() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE $1: $2"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

###############################################################################
# PHASE 1: Project Scaffold
###############################################################################
log 1 "Project Scaffold"

$CLAUDE "$(cat <<'PROMPT'
You are setting up the project scaffold for CassetteAI. Read SPEC.md for the full project structure.

Do the following:

1. Initialize a git repo if not already done (git init).

2. Create a .gitignore with:
   - .env, secrets/, *.pem, *.key
   - __pycache__/, *.pyc, .pytest_cache/
   - node_modules/, dist/, .vite/
   - .DS_Store
   - pipeline_cache/ (runtime cache, not the golden cache/)

3. Create the directory structure from SPEC.md:
   - backend/
   - frontend/src/
   - prompts/
   - cache/liver/, cache/cardiac/, cache/neural/

4. Create backend/requirements.txt with UNPINNED versions (no ==, just the package names):
   - fastapi
   - uvicorn[standard]
   - anthropic
   - modal
   - numpy
   - biopython

5. A .env.example file exists at the project root. For local development:
   - cp .env.example .env
   - Fill in ANTHROPIC_API_KEY in .env
   - The server loads .env automatically via python-dotenv
   - Modal auth: already configured via `python3 -m modal setup` which stores tokens in ~/.modal.toml

6. Create frontend using Vite + React + Tailwind:
   - Run: npm create vite@latest frontend -- --template react
     (if frontend/ already exists with files, skip this step)
   - cd frontend && npm install
   - Install and configure Tailwind CSS v4 (follow current Tailwind v4 + Vite setup)
   - Install recharts: npm install recharts

7. Create a Python virtual environment:
   - python3 -m venv .venv
   - .venv/bin/pip install -r backend/requirements.txt

8. Make an initial git commit with message "chore: project scaffold with backend and frontend deps"

Do NOT write any application code yet — just scaffold and dependencies.
PROMPT
)"

###############################################################################
# PHASE 2: Cache Layer + Prompts + Modal Stubs
###############################################################################
log 2 "Cache Layer, Prompts, and Modal Stubs"

$CLAUDE "$(cat <<'PROMPT'
You are building the foundational backend modules for CassetteAI. Read SPEC.md for full specs.

## Task 1: Cache Layer (backend/cache.py)

Implement exactly as specified in SPEC.md Phase 1C:
- cache_key() with tissue-synonym normalization (liver/hepatocyte/hepatic, heart/cardiac/cardiomyocyte, brain/neuron/neural/cns)
- get_cached(prompt, stage) — reads from cache/{tissue}/
- set_cache(prompt, stage, data) — writes to cache/{tissue}/
- The cache directory should be "cache" (relative to project root), NOT "pipeline_cache"
- Stage names: "generation", "scoring", "interpretation", "cassette"

## Task 2: System Prompt (prompts/system.md)

Write the CassetteAI system prompt as specified in SPEC.md Phase 2A:
- Role: CassetteAI designs tissue-specific regulatory elements for AAV gene therapy
- Extraction: target_tissue, length_constraint_bp, special requirements
- Tissue mapping table (liver→HepG2, heart→K562 proxy, brain→GM12878 proxy, blood→K562)
- Limitation disclosure for unsupported tissues
- Pipeline steps: parse → generate → score → interpret → compose cassette

## Task 3: Interpretation Prompt (prompts/interpret.md)

Write the interpretation prompt as specified in SPEC.md Phase 2B:
- Rank candidates by specificity ratio (on-target / max off-target)
- Flag sequence pathologies: GC% outside 40-60%, homopolymer runs >6nt, AATAAA/ATTAAA cryptic polyA, extreme CpG density
- Present top 5 candidates with rank, truncated sequence, on-target score, specificity ratio, flags
- Recommend #1 with 2-3 sentence scientific explanation
- Include output format: structured JSON + natural language summary
- Include cassette composition instructions (pair with minTBG promoter)

## Task 4: Modal Functions (backend/modal_generate.py and backend/modal_score.py)

IMPORTANT: DO NOT create any local fallback function. No generate_elements_local(), no score_elements_local(). All biological data must come from real models (CLAUDE.md Rule 7).

### modal_generate.py
- Create the Modal app with proper image definition (as in SPEC.md Phase 1A)
- Clone the DNA-Diffusion repo INTO the Modal image via .run_commands()
- Inspect the repo (README, training scripts, inference code) to determine:
  - How to load pretrained weights / checkpoints
  - How to run inference conditioned on a cell type
  - Which dependencies are needed (pin versions)
- Implement generate_elements(cell_type: str, n_samples: int = 200) -> list[str]
- If weights cannot be loaded, raise a clear RuntimeError with an actionable message (e.g., "DNA-Diffusion weights not found at /opt/dna-diffusion/checkpoints — check README for download instructions")
- DO NOT create any local fallback function that fabricates sequences

### modal_score.py
- Create the Modal app with proper image definition (as in SPEC.md Phase 1B)
- Clone the Sei repo INTO the Modal image via .run_commands()
- Inspect the repo to determine model loading and inference procedure
- Implement score_elements(sequences: list[str]) -> list[dict]
- Implement neutral flanking context padding (200bp → 4096bp)
- Return structure: {sequence, sei_scores: {tissue: score}, top_class, specificity_ratio}
- If model fails to load, raise a clear RuntimeError with an actionable message
- DO NOT create any local fallback function that fabricates scores

### Lazy Anthropic client init
In any file that uses the Anthropic SDK, use this pattern instead of module-level initialization:
```python
_client = None
def get_anthropic_client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
    return _client
```
This ensures import-time tests pass without API keys set.

All files must use type hints.
Credentials: ANTHROPIC_API_KEY is read from os.environ (loaded from .env via python-dotenv in server.py). Modal auth is handled automatically by the Modal SDK via ~/.modal.toml (set up via `python3 -m modal setup`).

Commit with message "feat: cache layer, prompts, and real modal functions"
PROMPT
)"

###############################################################################
# PHASE 3: Backend Core — Orchestrator + Interpreter
###############################################################################
log 3 "Backend Core — Orchestrator and Interpreter"

$CLAUDE "$(cat <<'PROMPT'
You are building the core backend logic for CassetteAI. Read SPEC.md for full specs.
Read the existing files before writing: backend/cache.py, backend/modal_generate.py, backend/modal_score.py, prompts/system.md, prompts/interpret.md

## Task 1: Interpretation Logic (backend/interpret.py)

As specified in SPEC.md Phase 2D:
- Function: interpret_scores(sequences_with_scores: list[dict], target_tissue: str) -> dict
- Sequence pathology checks IN CODE (not Claude): GC content, homopolymer detection, AATAAA/ATTAAA scan, CpG density
- Send Sei scores + pathology flags to Claude (claude-opus-4-6) with the interpretation prompt from prompts/interpret.md
- Parse Claude's response into structured ranking: top_candidates list with rank, sequence, scores, flags, rationale
- Cassette composition function: compose_cassette(element_seq, promoter="minTBG") returning:
  - Components: 5'ITR (145bp), enhancer (200bp), minTBG (~300bp), transgene placeholder, bGH polyA (250bp), 3'ITR (145bp)
  - Total length calculation
  - Warning if total > 4700bp (AAV packaging limit)
- Use streaming for the Claude interpretation call
- Use anthropic SDK with ANTHROPIC_API_KEY from os.environ (already exported in the shell, no dotenv needed)

## Task 2: Orchestrator (backend/orchestrator.py)

As specified in SPEC.md Phase 2C:
- Main function: run_pipeline(user_prompt: str) -> AsyncGenerator that yields status updates and results
- Step 1: Parse intent with Claude (claude-sonnet-4-20250514) — extract target_tissue, length_bp, constraints
- Step 2: Map tissue to DNA-Diffusion cell type + Sei target classes
- Step 3: Check cache (using backend/cache.py)
- Step 4: If cache miss, call generation via Modal. If Modal call fails, yield {"type": "error", "message": "..."} SSE event with actionable message (e.g., "Modal function not deployed — run: modal deploy backend/modal_generate.py") and stop pipeline
- Step 5: If cache miss, call scoring via Modal. If Modal call fails, yield {"type": "error", "message": "..."} SSE event with actionable message and stop pipeline
- Step 6: Call interpretation (backend/interpret.py)
- Step 7: Compose cassette
- Yield SSE-compatible status messages at each stage:
  - {"type": "status", "stage": "parsing", "message": "Understanding your design request..."}
  - {"type": "status", "stage": "generating", "message": "Generating 200 candidate elements for {cell_type}..."}
  - {"type": "status", "stage": "scoring", "message": "Scoring tissue specificity across 40 tissue classes..."}
  - {"type": "status", "stage": "interpreting", "message": "Analyzing results..."}
  - {"type": "results", "data": {generation, scoring, interpretation, cassette}}
- Use async throughout
- Use anthropic SDK for Claude calls — ANTHROPIC_API_KEY is in os.environ (no dotenv). Modal auth is automatic via ~/.modal.toml.
- Use the lazy Anthropic client init pattern (get_anthropic_client() function, not module-level client) in both orchestrator.py and interpret.py. This ensures import-time tests pass without API keys.

Both files must have type hints and be async-compatible. Import from the other backend modules.

Commit with message "feat: orchestrator pipeline and interpretation logic"
PROMPT
)"

###############################################################################
# PHASE 4: API Server
###############################################################################
log 4 "API Server"

$CLAUDE "$(cat <<'PROMPT'
You are building the FastAPI server for CassetteAI. Read SPEC.md Phase 3A for specs.
Read these existing files first: backend/orchestrator.py, backend/cache.py, backend/interpret.py

## Build backend/server.py

As specified in SPEC.md Phase 3A:

1. FastAPI app with CORS middleware (allow localhost:5173 for Vite dev server, and *)

2. POST /api/chat
   - Request body: { "prompt": str }
   - Returns Server-Sent Events (SSE) stream using StreamingResponse
   - Wire to orchestrator.run_pipeline()
   - Each SSE event is a JSON object: {"type": "status"|"results", ...}
   - Format: "data: {json}\n\n" for each event

3. GET /api/health
   - Returns {"status": "ok"}

4. Serve frontend static files in production:
   - Mount frontend/dist/ at / if the directory exists (for production)
   - This should be the LAST route so API routes take priority

5. python-dotenv is loaded in server.py to read .env automatically. Modal auth is via ~/.modal.toml.
6. The SSE stream must handle {"type": "error", "message": "..."} events from the orchestrator and pass them through to the frontend so the user sees Modal/API errors clearly.
7. All routes must be async
7. Type hints on everything
8. Run with: uvicorn backend.server:app --reload --port 8000

Add a convenience script run_dev.sh at project root:
```bash
#!/usr/bin/env bash
# Terminal 1: Backend
cd "$(dirname "$0")"
source .venv/bin/activate
uvicorn backend.server:app --reload --port 8000
```

Commit with message "feat: FastAPI server with SSE streaming"
PROMPT
)"

###############################################################################
# PHASE 5: Frontend — All Components
###############################################################################
log 5 "Frontend Components"

$CLAUDE "$(cat <<'PROMPT'
You are building the complete frontend for CassetteAI. Read SPEC.md Phase 4 for full specs.
Read backend/server.py to understand the API contract (SSE events from POST /api/chat).
Read backend/orchestrator.py to understand the data shapes (generation, scoring, interpretation, cassette stages).
Read backend/modal_score.py to see the score_elements() output structure.

## Tech Stack
- React + Vite (already scaffolded in frontend/)
- Tailwind CSS (already installed)
- Recharts (already installed)

## Theme
- Dark mode, projector-friendly
- Background: dark gray/near-black (#0f1117 or similar)
- Text: light gray/white
- Accent colors: teal/cyan for primary, amber for highlights
- Large readable fonts

## Layout (App.jsx)
- Three-panel layout as in SPEC.md:
  - Left 40%: Chat panel
  - Right top 50%: Heatmap panel
  - Right bottom 50%: Cassette diagram panel
- Header bar with "CassetteAI" branding and a DNA helix or cassette icon (use Unicode/emoji or simple SVG)
- Responsive: stack vertically on small screens

## Chat Component (Chat.jsx)
- Message list with user/assistant message bubbles
- User messages: right-aligned, teal background
- Assistant messages: left-aligned, dark card background
- Input box at bottom with send button
- On submit: POST to /api/chat with {prompt: text}
- Read SSE stream from response
- Show pipeline status indicators with icons as they stream in:
  - "Generating 200 candidate elements..." with a DNA icon
  - "Scoring tissue specificity..." with a chart icon
  - "Analyzing results..." with a microscope icon
- When results arrive (type: "results"), pass data to parent App to update Heatmap and Cassette panels
- Show the interpretation's natural language summary as the final assistant message

## Heatmap Component (Heatmap.jsx)
- Receives scoring data from App state
- Use Recharts to render a heatmap-style visualization
- Since Recharts doesn't have a native heatmap, build one using a grid of colored cells (divs or SVG rects)
- X-axis: tissue/cell types (group by: Liver, Blood, Brain, Heart, Muscle, Kidney, Lung, Other)
- Y-axis: top 10 candidates (ranked by target tissue score)
- Color scale: deep blue (0.0) → red (1.0)
- Show a color scale legend
- Tooltip on hover showing: candidate #, tissue name, exact score
- Title: "Tissue Specificity Scores"
- When no data: show placeholder text "Submit a design prompt to see tissue specificity scores"

## Cassette Diagram (CassetteDiagram.jsx)
- Receives cassette data from App state
- Pure SVG rendering of the AAV cassette:
  5'ITR ── [Enhancer] ── [minTBG] ── [Transgene] ── [bGH polyA] ── 3'ITR
- Each component is a colored rectangle with:
  - Label text inside or above
  - Length in bp below
- Color scheme:
  - ITRs: gray
  - Enhancer (designed element): bright teal/cyan with glow or highlight
  - minTBG: blue
  - Transgene: purple
  - polyA: orange
- Below the cassette: a progress bar showing total length vs 4.7kb limit
  - Green if under limit, red if over
  - Label: "Total: {n}bp / 4,700bp AAV limit"
- When no data: show placeholder

## API Integration (api.js)
- Function: sendChatMessage(prompt) that:
  - POSTs to http://localhost:8000/api/chat with {prompt}
  - Returns a ReadableStream or async iterator of parsed SSE events
  - Handles connection errors gracefully
- Parse each SSE "data: {...}\n\n" line into JSON objects
- Handle {"type": "error"} events: display the error message to the user in the chat as a red/warning-styled assistant message (e.g., "Modal function not deployed — run: modal deploy backend/modal_generate.py")

## Important Details
- Use functional components with hooks (useState, useEffect, useCallback)
- The SSE parsing must handle the "data: " prefix and split on double newlines
- Proxy config: add "proxy": "http://localhost:8000" to vite.config or configure the Vite proxy in vite.config.js so /api requests go to port 8000
- Make sure the app works with `npm run dev` pointing at the backend on port 8000

Commit with message "feat: complete frontend with chat, heatmap, and cassette diagram"
PROMPT
)"

###############################################################################
# PHASE 6: Integration and Polish
###############################################################################
log 6 "Integration and Polish"

$CLAUDE "$(cat <<'PROMPT'
You are doing final integration and polish for CassetteAI. Read SPEC.md Phase 6 for requirements.

## Your tasks:

1. READ all existing code first:
   - backend/server.py, backend/orchestrator.py, backend/interpret.py, backend/cache.py
   - frontend/src/App.jsx, frontend/src/Chat.jsx, frontend/src/Heatmap.jsx, frontend/src/CassetteDiagram.jsx, frontend/src/api.js
   - NOTE: cache/ is empty — that's correct. Cache is populated by running prompts through the app.

2. FIX any import issues or wiring bugs:
   - Make sure backend modules can import each other (add __init__.py files if needed)
   - Make sure the orchestrator correctly calls cache.get_cached() with the right cache directory
   - Make sure the server correctly streams SSE events
   - Make sure the frontend correctly parses SSE and updates all panels

3. TEST the backend imports work WITHOUT ANTHROPIC_API_KEY set (validates lazy init):
   - Run: cd /Users/ethan/hackathon/CassetteAI && env -u ANTHROPIC_API_KEY .venv/bin/python -c "from backend.cache import get_cached, cache_key; from backend.orchestrator import run_pipeline; from backend.server import app; print('All imports OK')"
   - This MUST pass without any API keys — the lazy init pattern ensures no client is created at import time
   - Fix any issues found
   - NOTE: cache/ is empty until user runs prompts through the app — that's expected

4. TEST the frontend builds:
   - Run: cd /Users/ethan/hackathon/CassetteAI/frontend && npm run build
   - Fix any build errors

5. POLISH the UI:
   - Ensure fonts are large enough for projector (base 16px minimum, headers 24px+)
   - Ensure the dark theme is consistent
   - Add a subtle loading animation for the chat (pulsing dots or similar CSS animation)
   - Add the header: "CassetteAI" with subtitle "AI-Powered Gene Therapy Cassette Design"

6. Add a README.md with:
   - Project name and one-liner from SPEC.md
   - Quick start instructions:
     - export ANTHROPIC_API_KEY=...
     - python3 -m modal setup (for Modal auth)
     - install deps, run backend + frontend
   - Architecture diagram (text-based from SPEC.md)
   - Do NOT mention .env files — credentials come from shell env and modal setup

7. VERIFY code paths are wired correctly (cache is empty — that's correct):
   - Confirm the orchestrator checks cache, then calls real Modal functions (no local fallbacks)
   - Confirm the orchestrator yields {"type": "error"} SSE events when Modal/API calls fail
   - Confirm the server streams SSE events from the orchestrator (including error events)
   - Confirm the frontend parses SSE (including {"type": "error"} events) and shows errors to user
   - Confirm the frontend passes data to Heatmap and CassetteDiagram on success

8. Update SPEC.md: check off all completed checklist items.

Commit with message "feat: integration, polish, and end-to-end verification"
PROMPT
)"

###############################################################################
# DONE
###############################################################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  BUILD COMPLETE"
echo ""
echo "  Cache is empty — that's correct. The app works without cached data"
echo "  (it calls real Modal + Claude endpoints for live pipeline runs)."
echo ""
echo "  Start the app:"
echo "    cd $PROJECT_DIR"
echo "    source .venv/bin/activate"
echo "    uvicorn backend.server:app --reload --port 8000 &"
echo "    cd frontend && npm run dev"
echo ""
echo "  Type a prompt (e.g., 'Design a liver-specific enhancer') and the"
echo "  live pipeline will run through real Modal + Claude endpoints."
echo ""
echo "  To populate cache for demo reliability:"
echo "    modal deploy backend/modal_generate.py"
echo "    modal deploy backend/modal_score.py"
echo "    Then submit demo prompts through the app — results are cached automatically."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
