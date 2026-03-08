"""Biological interpretation of Sei scores for CassetteAI.

Performs sequence pathology checks in Python, then sends annotated Sei scores
to Claude Opus (claude-opus-4-6) via streaming for ranked biological
interpretation and cassette composition.
"""

import json
import os
import re
from pathlib import Path
from typing import Any

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


_INTERPRET_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "interpret.md"
_INTERPRET_PROMPT: str | None = None


def _load_interpret_prompt() -> str:
    global _INTERPRET_PROMPT
    if _INTERPRET_PROMPT is None:
        _INTERPRET_PROMPT = _INTERPRET_PROMPT_PATH.read_text()
    return _INTERPRET_PROMPT


# ---------------------------------------------------------------------------
# Sequence pathology checks (pure Python — no Claude)
# ---------------------------------------------------------------------------


def _gc_content(seq: str) -> float:
    """Return GC percentage (0–100)."""
    if not seq:
        return 0.0
    upper = seq.upper()
    gc = sum(1 for b in upper if b in ("G", "C"))
    return gc / len(upper) * 100.0


def _has_homopolymer(seq: str) -> bool:
    """Return True if any single nucleotide has a consecutive run > 6 nt."""
    return bool(re.search(r"(.)\1{6,}", seq, re.IGNORECASE))


def _has_cryptic_polya(seq: str) -> bool:
    """Return True if canonical polyA signal AATAAA or ATTAAA is present."""
    upper = seq.upper()
    return "AATAAA" in upper or "ATTAAA" in upper


def _cpg_obs_expected(seq: str) -> float:
    """Return CpG observed/expected ratio.

    Formula: (CpG_count × N) / (C_count × G_count).
    Returns 0.0 if the sequence is too short or has no C or G bases.
    """
    upper = seq.upper()
    n = len(upper)
    if n < 2:
        return 0.0
    cpg = upper.count("CG")
    c_count = upper.count("C")
    g_count = upper.count("G")
    if c_count == 0 or g_count == 0:
        return 0.0
    expected = (c_count * g_count) / n
    return cpg / expected if expected > 0 else 0.0


def compute_pathology_flags(seq: str) -> tuple[float, float, list[str]]:
    """Compute GC% and CpG obs/expected, return (gc_pct, cpg_oe, flags).

    Flag definitions (matching interpret.md):
        HIGH_GC      GC content > 60 %
        LOW_GC       GC content < 40 %
        HOMOPOLYMER  Any nucleotide run > 6 nt
        CRYPTIC_POLYA  AATAAA or ATTAAA present
        HIGH_CPG     CpG obs/expected > 0.6 (methylation silencing risk)
        LOW_CPG      CpG obs/expected < 0.05
    """
    gc = _gc_content(seq)
    cpg = _cpg_obs_expected(seq)
    flags: list[str] = []

    if gc > 60.0:
        flags.append("HIGH_GC")
    elif gc < 40.0:
        flags.append("LOW_GC")

    if _has_homopolymer(seq):
        flags.append("HOMOPOLYMER")

    if _has_cryptic_polya(seq):
        flags.append("CRYPTIC_POLYA")

    if cpg > 0.6:
        flags.append("HIGH_CPG")
    elif cpg < 0.05:
        flags.append("LOW_CPG")

    return gc, cpg, flags


# ---------------------------------------------------------------------------
# Cassette composition
# ---------------------------------------------------------------------------

_ITR_LEN = 145
_PROMOTER_LENS: dict[str, int] = {"minTBG": 300, "minCMV": 227}
_TRANSGENE_LEN = 1500   # placeholder
_BGH_POLYA_LEN = 230
_AAV_LIMIT_BP = 4700


def compose_cassette(element_seq: str, promoter: str = "minTBG") -> dict[str, Any]:
    """Assemble the designed element into a minimal AAV cassette.

    Components (in order):
        5'ITR (145 bp) — enhancer — promoter — transgene placeholder (1500 bp)
        — bGH polyA (230 bp) — 3'ITR (145 bp)

    Args:
        element_seq: The designed enhancer/regulatory element sequence.
        promoter:    Minimal promoter name; 'minTBG' (default, liver) or 'minCMV'.

    Returns:
        Dict with component names, lengths, total bp, AAV headroom, and an
        optional 'warning' if total exceeds the 4,700 bp packaging limit.
    """
    promoter_len = _PROMOTER_LENS.get(promoter, 300)
    element_len = len(element_seq)

    elements = ["5'ITR", "enhancer", promoter, "transgene", "bGH_polyA", "3'ITR"]
    lengths_bp = [
        _ITR_LEN,
        element_len,
        promoter_len,
        _TRANSGENE_LEN,
        _BGH_POLYA_LEN,
        _ITR_LEN,
    ]
    total = sum(lengths_bp)
    headroom = _AAV_LIMIT_BP - total

    result: dict[str, Any] = {
        "elements": elements,
        "lengths_bp": lengths_bp,
        "total_bp": total,
        "aav_limit_bp": _AAV_LIMIT_BP,
        "headroom_bp": headroom,
        "promoter": promoter,
        "enhancer_sequence": element_seq,
    }

    if total > _AAV_LIMIT_BP:
        result["warning"] = (
            f"Total cassette length ({total} bp) exceeds the AAV packaging limit "
            f"of {_AAV_LIMIT_BP} bp by {abs(headroom)} bp. "
            "Consider a shorter transgene or removing non-essential elements."
        )

    return result


# ---------------------------------------------------------------------------
# Main interpretation function
# ---------------------------------------------------------------------------


async def interpret_scores(
    sequences_with_scores: list[dict],
    target_tissue: str,
) -> dict[str, Any]:
    """Annotate sequences with pathology flags, then stream Claude Opus interpretation.

    Steps:
        1. Compute GC%, CpG density, and pathology flags for each candidate.
        2. Send annotated data to Claude Opus (claude-opus-4-6) using interpret.md
           as the system prompt, streaming the response.
        3. Extract structured JSON from the streamed response.
        4. Attach code-computed cassette composition for the top-ranked candidate.

    Args:
        sequences_with_scores: Output from score_elements() — each dict must have
            'sequence', 'sei_scores', 'top_class', 'specificity_ratio'.
        target_tissue: Canonical tissue name ('liver', 'cardiac', 'neural', 'blood').

    Returns:
        Dict with keys 'ranking', 'recommendation', 'summary', 'cassette'.
    """
    client = get_anthropic_client()
    system_prompt = _load_interpret_prompt()

    # Annotate each candidate with pre-computed pathology data
    annotated: list[dict] = []
    for item in sequences_with_scores:
        gc_pct, cpg_dens, flags = compute_pathology_flags(item["sequence"])
        annotated.append(
            {
                **item,
                "gc_pct": round(gc_pct, 2),
                "cpg_density": round(cpg_dens, 4),
                "flags": flags,
            }
        )

    # Pre-filter: sort by specificity_ratio and keep top 20 candidates.
    # The prompt only needs top 5; sending 20 gives Claude enough to re-rank.
    annotated.sort(key=lambda x: x.get("specificity_ratio", 0), reverse=True)
    annotated = annotated[:20]

    # Trim sei_scores to tissue-relevant classes + top scorers to reduce tokens.
    _TISSUE_CLASSES: dict[str, list[str]] = {
        "liver": [
            "E9 Liver / Intestine", "TF1 NANOG / FOXA1",
            "TF3 FOXA1 / AR / ESR1", "TF2 CEBPB", "P Promoter",
        ],
        "cardiac": [
            "E12 Erythroblast-like", "P Promoter",
            "E4 Multi-tissue", "E2 Multi-tissue",
        ],
        "neural": [
            "E3 Brain / Melanocyte", "E10 Brain",
            "E4 Multi-tissue", "P Promoter",
        ],
        "blood": [
            "E11 T-cell", "E5 B-cell-like", "E12 Erythroblast-like",
            "P Promoter",
        ],
    }
    keep_classes = set(_TISSUE_CLASSES.get(target_tissue, []))
    for item in annotated:
        scores = item.get("sei_scores", {})
        # Always include tissue-relevant classes + top 5 by value
        top_keys = sorted(scores, key=lambda k: scores[k], reverse=True)[:5]
        trimmed = {k: round(v, 4) for k, v in scores.items()
                   if k in keep_classes or k in top_keys}
        item["sei_scores"] = trimmed

    user_content = (
        f"Target tissue: {target_tissue}\n\n"
        f"Candidate elements (JSON):\n```json\n"
        f"{json.dumps(annotated, indent=2)}\n```"
    )

    # Stream from Claude Opus
    full_response = ""
    async with client.messages.stream(
        model="claude-opus-4-6",
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        async for text in stream.text_stream:
            full_response += text

    # Parse structured JSON from response
    parsed = _extract_json(full_response)

    # Override cassette with code-computed values (authoritative source of truth)
    ranking = parsed.get("ranking", [])
    if ranking:
        top_seq = ranking[0].get("sequence", "")
        if top_seq:
            cassette = compose_cassette(top_seq)
            parsed["cassette"] = cassette
            if "recommendation" in parsed:
                parsed["recommendation"]["cassette"] = cassette

    return parsed


def _extract_json(text: str) -> dict[str, Any]:
    """Extract the first valid JSON object from Claude's response text."""
    # Direct parse (Claude may return clean JSON)
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Markdown-fenced JSON block
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except json.JSONDecodeError:
            pass

    # Outermost { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    return {
        "raw_response": text,
        "parse_error": "Could not extract JSON from Claude Opus response",
    }
