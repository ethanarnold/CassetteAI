"""CassetteAI pipeline orchestrator.

Parses user intent via Claude Sonnet, checks the cache, calls Modal GPU
functions (DNA-Diffusion → Sei), interprets results via Claude Opus, and
yields SSE-compatible status events as an async generator.
"""

import asyncio
import json
import logging
import os
import re
from collections.abc import AsyncGenerator
from typing import Any

logger = logging.getLogger("cassetteai.pipeline")
logging.basicConfig(level=logging.DEBUG, format="%(name)s | %(message)s")

from backend.cache import get_cached, set_cache
from backend.interpret import compose_cassette, interpret_scores

# ---------------------------------------------------------------------------
# Lazy Anthropic client (avoids import-time API key requirement)
# ---------------------------------------------------------------------------

_anthropic_client = None


def get_anthropic_client():
    """Return a shared AsyncAnthropic instance, creating it on first call."""
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic

        _anthropic_client = anthropic.AsyncAnthropic(
            api_key=os.environ["ANTHROPIC_API_KEY"]
        )
    return _anthropic_client


# ---------------------------------------------------------------------------
# Tissue mapping
# ---------------------------------------------------------------------------

# Canonical tissue → DNA-Diffusion cell type string
_TISSUE_TO_CELL_TYPE: dict[str, str] = {
    "liver": "HepG2",
    "cardiac": "K562",
    "neural": "GM12878",
    "blood": "K562",
}

# Synonym → canonical tissue key (mirrors cache.py _TISSUE_MAP)
_TISSUE_SYNONYMS: dict[str, str] = {
    "liver": "liver",
    "hepatocyte": "liver",
    "hepatic": "liver",
    "heart": "cardiac",
    "cardiac": "cardiac",
    "cardiomyocyte": "cardiac",
    "brain": "neural",
    "neuron": "neural",
    "neural": "neural",
    "cns": "neural",
    "blood": "blood",
    "hematopoietic": "blood",
    "b-cell": "blood",
    "t-cell": "blood",
    "erythrocyte": "blood",
    "monocyte": "blood",
}


def _normalize_tissue(raw: str) -> str:
    return _TISSUE_SYNONYMS.get(raw.lower().strip(), raw.lower().strip())


# ---------------------------------------------------------------------------
# Thought narration (template-based, zero API calls)
# ---------------------------------------------------------------------------


def _make_thought(stage: str, *, tissue: str = "") -> dict[str, Any]:
    """Return a thought event dict — short spinner text for a pipeline stage."""
    templates = {
        "parsing": "I'll first confirm I understand your design request.",
        "designing": f"Designing DNADiffusion inputs for {tissue}-specific enhancers.",
        "generating": "DNADiffusion: Inference is running on Modal.",
        "scoring": "Sei: Scoring tissue specificity across 40 tissue classes.",
        "interpreting": "Analyzing results.",
    }
    return {"type": "thought", "stage": stage, "message": templates[stage]}


def _make_message(
    stage: str,
    *,
    paraphrase: str = "",
    plan_text: str = "",
    n_sequences: int = 0,
    scored_count: int = 0,
    tissue: str = "",
) -> dict[str, Any]:
    """Return a message event dict — substantive content after a stage completes."""
    templates = {
        "parsing": f"{paraphrase}\n\n{plan_text}".strip(),
        "designing": "I've designed the prompts for the diffusion model. Let me send them off.",
        "generating": (
            f"Good. DNA-Diffusion successfully generated {n_sequences:,} candidate "
            f"regulatory elements. I'll send them to Sei for scoring."
        ),
        "scoring": (
            f"Scoring is complete — all {scored_count:,} candidates have been evaluated "
            f"across 40 tissue classes. I'll finalize my analysis to identify the top "
            f"{tissue}-specific element and generate the figures."
        ),
    }
    return {"type": "message", "stage": stage, "message": templates[stage]}


# ---------------------------------------------------------------------------
# Intent parsing
# ---------------------------------------------------------------------------


async def _classify_and_parse(user_prompt: str) -> dict[str, Any]:
    """Classify user message as conversation or design request via Claude Sonnet.

    Returns either:
        {"type": "conversation", "response": str}
        {"type": "design", "target_tissue": str, "length_bp": int, "constraints": [str]}

    Falls back to design with liver defaults if JSON parsing fails.
    """
    client = get_anthropic_client()
    logger.info("Claude Opus received message: %s", user_prompt)
    response = await client.messages.create(
        model="claude-opus-4-20250514",
        max_tokens=512,
        system=(
            "You are CassetteAI, a gene therapy design tool that generates "
            "synthetic regulatory DNA elements (enhancers) optimized for "
            "tissue-specific expression. You support liver, cardiac, neural, "
            "and blood tissues. You use DNA-Diffusion for generation and Sei "
            "for scoring tissue specificity.\n\n"
            "Classify the user's message as either a design request or a "
            "conversational message. Return ONLY a raw JSON object (no "
            "markdown fences).\n\n"
            "If the message is a design request (specifies a tissue or element "
            "to design), return:\n"
            '  {"type": "design", "target_tissue": "<tissue>", '
            '"length_bp": <int, default 200>, "constraints": [<strings>]}\n\n'
            "If the message is conversational (greeting, question about "
            "capabilities, general biology question, or anything that is not "
            "a concrete design request), return:\n"
            '  {"type": "conversation", "response": "<2-4 sentence friendly '
            "reply; no emoji, no markdown; may suggest trying a design "
            'request>"}\n\n'
            "Examples:\n"
            '- "Hello" -> conversation\n'
            '- "What do you do?" -> conversation\n'
            '- "What tissues do you support?" -> conversation\n'
            '- "Tell me about AAV" -> conversation\n'
            '- "Can you design something?" -> conversation (no tissue specified)\n'
            '- "Design a liver enhancer" -> design\n'
            '- "I need a cardiac-specific regulatory element" -> design\n'
            '- "Generate neural enhancers for AAV delivery" -> design'
        ),
        messages=[{"role": "user", "content": user_prompt}],
    )
    raw = response.content[0].text.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {"type": "design", "target_tissue": "liver", "length_bp": 200, "constraints": []}


async def _paraphrase_request(
    user_prompt: str,
    tissue: str,
    length_bp: int,
    constraints: list[str],
) -> str:
    """Use Claude Sonnet to paraphrase the user's request into a brief
    explanation of what we understood and what we'll do."""
    client = get_anthropic_client()
    logger.info("Claude Sonnet received message: %s", user_prompt)
    constraint_note = f" Constraints: {', '.join(constraints)}." if constraints else ""
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        system=(
            "You are a gene therapy design assistant. The user asked you to "
            "design a synthetic regulatory element. Paraphrase their request "
            "in 1-2 sentences, confirming the target tissue, element length, "
            "and any special constraints. Be concise and conversational. "
            "Do not use emojis. Do not use markdown formatting. "
            "Speak in the first person (e.g. 'I understand you want...')."
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Original request: {user_prompt}\n\n"
                    f"Parsed parameters: tissue={tissue}, "
                    f"length={length_bp} bp.{constraint_note}"
                ),
            }
        ],
    )
    return response.content[0].text.strip()


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


async def run_pipeline(
    user_prompt: str,
) -> AsyncGenerator[dict[str, Any], None]:
    """Run the full CassetteAI pipeline and yield SSE-compatible event dicts.

    Yield shapes:
        {"type": "thought", "stage": str, "message": str}
        {"type": "message", "stage": str, "message": str}
        {"type": "results", "data": {"generation": ..., "scoring": ...,
                                      "interpretation": ..., "cassette": ...}}
        {"type": "error",   "message": str}

    Flow: thought (spinner) → message (substantive) for each pipeline stage.
    On error the generator yields the error event then stops.
    """
    # ── Step 1: Classify and route ─────────────────────────────────────────
    result = await _classify_and_parse(user_prompt)

    if result.get("type") == "conversation":
        yield {"type": "message", "stage": "conversation", "message": result.get("response", "")}
        return

    # ── Design path ──────────────────────────────────────────────────────
    raw_tissue = result.get("target_tissue", "liver")
    tissue = _normalize_tissue(raw_tissue)
    length_bp: int = int(result.get("length_bp", 200))
    constraints: list[str] = result.get("constraints", [])

    # Map tissue before paraphrase so we can fail fast
    cell_type = _TISSUE_TO_CELL_TYPE.get(tissue)
    if cell_type is None:
        yield {
            "type": "error",
            "message": (
                f"Unsupported tissue '{tissue}'. "
                "Supported tissues: liver, cardiac, neural, blood. "
                "Please rephrase your request using one of these."
            ),
        }
        return

    paraphrase = await _paraphrase_request(user_prompt, tissue, length_bp, constraints)
    constraint_note = f" Constraints: {', '.join(constraints)}." if constraints else ""
    plan_text = (
        f"I'll design {length_bp} bp {tissue}-specific enhancers by generating "
        f"300 candidates with DNA-Diffusion (conditioned on {cell_type}), "
        f"then scoring each one with Sei across 40 regulatory tissue classes "
        f"to find the most tissue-specific element.{constraint_note}"
    )
    yield _make_message("parsing", paraphrase=paraphrase, plan_text=plan_text)

    # ── Step 2: Cache probe (results used inline per-stage below) ────────
    cached_gen: dict | None = get_cached(user_prompt, "generation")
    cached_score: list | None = get_cached(user_prompt, "scoring")
    cached_interp: dict | None = get_cached(user_prompt, "interpretation")
    cached_cassette: dict | None = get_cached(user_prompt, "cassette")

    # ── Step 3: Design (UX pacing beat) ───────────────────────────────────
    yield _make_thought("designing", tissue=tissue)
    yield _make_message("designing")

    # ── Step 4: Generation ────────────────────────────────────────────────
    yield _make_thought("generating")

    sequences: list[str]
    if cached_gen:
        sequences = cached_gen["sequences"]
    else:
        try:
            import modal  # type: ignore[import]

            generate_fn = modal.Function.from_name("dna-diffusion", "generate_elements")
            logger.debug("── DNA-Diffusion INPUT ──")
            logger.debug("  cell_type=%s  n_samples=300", cell_type)
            sequences = await asyncio.to_thread(generate_fn.remote, cell_type, 300)
        except Exception as exc:
            yield {
                "type": "error",
                "message": (
                    f"DNA-Diffusion generation failed: {exc}. "
                    "Ensure the Modal function is deployed: "
                    "`modal deploy backend/modal_generate.py`"
                ),
            }
            return

        logger.debug("── DNA-Diffusion OUTPUT ──")
        logger.debug("  %d sequences generated, first 5:", len(sequences))
        for i, s in enumerate(sequences[:5]):
            logger.debug("    [%d] %s...%s", i, s[:30], s[-10:])

        generation_data: dict[str, Any] = {
            "sequences": sequences,
            "cell_type": cell_type,
            "n_sequences": len(sequences),
        }
        set_cache(user_prompt, "generation", generation_data)
        cached_gen = generation_data

    yield _make_message("generating", n_sequences=len(sequences))

    # ── Step 5: Scoring ───────────────────────────────────────────────────
    yield _make_thought("scoring")

    scored: list[dict]
    if cached_score:
        scored = cached_score
    else:
        try:
            import modal  # type: ignore[import]

            score_fn = modal.Function.from_name("sei-scorer", "score_elements")
            logger.debug("── Sei INPUT ──")
            logger.debug("  Sending %d sequences to Sei scorer", len(sequences))
            for i, s in enumerate(sequences[:3]):
                logger.debug("    [%d] %s...%s", i, s[:30], s[-10:])
            scored = await asyncio.to_thread(score_fn.remote, sequences)
        except Exception as exc:
            yield {
                "type": "error",
                "message": (
                    f"Sei scoring failed: {exc}. "
                    "Ensure the Modal function is deployed: "
                    "`modal deploy backend/modal_score.py`"
                ),
            }
            return

        logger.debug("── Sei OUTPUT (top 20 by top_class score) ──")
        ranked = sorted(scored, key=lambda d: max(d["sei_scores"].values()), reverse=True)
        for i, entry in enumerate(ranked[:20]):
            top3 = sorted(entry["sei_scores"].items(), key=lambda kv: kv[1], reverse=True)[:3]
            top3_str = ", ".join(f"{n}: {v:.4f}" for n, v in top3)
            logger.debug(
                "    [%d] seq=%s...  top_class=%s  ratio=%.2f  | %s",
                i, entry["sequence"][:20], entry["top_class"],
                entry["specificity_ratio"], top3_str,
            )

        set_cache(user_prompt, "scoring", scored)
        cached_score = scored

    yield _make_message("scoring", scored_count=len(scored), tissue=tissue)

    # ── Step 6: Interpretation ────────────────────────────────────────────
    yield _make_thought("interpreting")

    interpretation: dict[str, Any]
    if cached_interp:
        interpretation = cached_interp
    else:
        interpretation = await interpret_scores(scored, tissue)
        set_cache(user_prompt, "interpretation", interpretation)
        cached_interp = interpretation

    # ── Step 7: Cassette ──────────────────────────────────────────────────
    cassette: dict[str, Any]
    if cached_cassette:
        cassette = cached_cassette
    else:
        ranking = interpretation.get("ranking", [])
        top_seq = ranking[0].get("sequence", "") if ranking else ""
        cassette = compose_cassette(top_seq) if top_seq else {}
        set_cache(user_prompt, "cassette", cassette)
        cached_cassette = cassette

    yield {
        "type": "results",
        "data": {
            "tissue": tissue,
            "generation": cached_gen,
            "scoring": cached_score,
            "interpretation": cached_interp,
            "cassette": cached_cassette,
        },
    }
