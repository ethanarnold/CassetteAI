<p align="center">
  <img src="frontend/src/assets/cassetteai-banner.png" alt="CassetteAI" />
</p>

---

**Live demo:** [cassetteai.dev](https://cassetteai.dev)

Life science has produced a **lot** of machine learning models, but most of them don't have a user-friendly interface, and this slows adoption. This project is my contribution to this problem. :)

DNA-based drugs are an important category of therapeutics, but getting them to activate in the right tissue, and only that tissue, remains a major challenge. Short DNA sequences called enhancers act as molecular zip codes, telling a gene where and when to turn on.

CassetteAI is a no-code way to design these DNA elements: Just describe the tissue type you'd like to target, and CassetteAI deploys multiple genomics models on serverless GPUs to translate your natural language prompt into tissue-specific enhancers, score them, and present the best ones.

---

## Features

- **Conversational design** — describe your gene therapy goal in plain English and get a complete cassette design back
- **Biological reasoning** — CassetteAI can reason over and explain the data and designs it generates
- **Real generative models** — [DNA-Diffusion](https://github.com/pinellolab/DNA-Diffusion) generates novel 200 bp regulatory elements conditioned on cell type (HepG2, K562, GM12878, hESCT0)
- **Genome-wide scoring** — [Sei](https://github.com/FunctionLab/sei-framework) evaluates each candidate across 21,907 chromatin profiles grouped into 40 tissue/cell-type classes
- **AI interpretation** — Claude Sonnet ranks candidates by tissue specificity, flags sequence pathologies (GC content, homopolymers, cryptic polyA), and recommends a final element
- **Cassette composition** — automatically pairs the top element with a minimal promoter, transgene placeholder, polyA signal, and ITRs, with a size check against the 4.7 kb AAV limit
- **Interactive heatmap** — Tissue-specificity scores are visualized in a clean histogram
- **SVG cassette diagram** — rendered AAV cassette with labeled components and base-pair lengths
- **Streaming UI** — real-time status updates as the pipeline progresses (generating → scoring → analyzing)
- **Chat history** — sidebar with persistent chat sessions, automatic naming, and multi-conversation support

---

## Currently Supported Tissues

| User input | Cell line | Notes |
|-----------|-----------|-------|
| liver / hepatocyte / hepatic | HepG2 | Biologically accurate end-to-end |
| blood / hematopoietic / myeloid | K562 | Myeloid lineage |
| immune / lymphoid / B-cell / T-cell | GM12878 | Lymphoblastoid |
| stem cell / pluripotent / embryonic | hESCT0 | Embryonic stem cell |

For unsupported tissues, CassetteAI explains the limitation and offers the closest available proxy.

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

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for local setup, Modal deployment, and Docker instructions.

---

## Models

| Model | Purpose | Runtime |
|-------|---------|---------|
| DNA-Diffusion | Generate 200 bp regulatory elements conditioned on cell type | Modal A100 |
| Sei | Score 21,907 chromatin profiles across 40 tissue classes | Modal A100 |
| Claude Sonnet | Parse intent, orchestrate pipeline, interpret results, compose cassette | Anthropic API |
