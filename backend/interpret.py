"""Biological interpretation of Sei scores for CassetteAI.

Performs sequence pathology checks in Python, then sends annotated Sei scores
to Claude Sonnet (claude-sonnet-4-20250514) via streaming for ranked biological
interpretation and cassette composition.
"""

import json
import logging
import os
import re
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

logger = logging.getLogger("cassetteai.interpret")

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
# Python re-ranking (replaces Claude-side re-ranking)
# ---------------------------------------------------------------------------

_ON_TARGET_CLASSES: dict[str, list[str]] = {
    "liver": ["E9 Liver / Intestine", "TF1 NANOG / FOXA1", "TF3 FOXA1 / AR / ESR1"],
    "cardiac": ["E12 Erythroblast-like", "P Promoter"],
    "neural": ["E3 Brain / Melanocyte", "E10 Brain"],
    "blood": ["E11 T-cell", "E5 B-cell-like", "E12 Erythroblast-like"],
    "immune": ["E5 B-cell-like", "E11 T-cell", "E7 Monocyte / Macrophage"],
    "stem cell": ["E1 Stem cell", "PC4 Polycomb / Bivalent stem cell Enh"],
}

_CRITICAL_FLAGS = {"CRYPTIC_POLYA", "HOMOPOLYMER"}

# Named Sei classes (exclude unnamed Group-XX from specificity calculations)
_NAMED_CLASS_PREFIX_EXCLUDE = "Group-"


def rerank_candidates(
    sequences_with_scores: list[dict],
    target_tissue: str,
) -> list[dict]:
    """Re-rank candidates to maximize the gap between on-target and off-target.

    Optimizes for histogram appearance: tall target bar, small everything else.

    For each candidate:
      1. Filter to named Sei classes only (exclude Group-XX).
      2. on_target_score = max(scores for on-target classes).
      3. off_target_max = max(scores for all other named classes).
      4. gap = on_target - off_target_max (positive = target dominates).
      5. specificity_ratio = on_target / off_target_max.
      6. Add pathology flags.
      7. Sort: no critical flags first, then gap DESC.

    Returns list of dicts with added keys: on_target_score, off_target_max,
    gap, specificity_ratio, gc_pct, cpg_density, flags, has_critical_flag.
    """
    on_target_keys = set(_ON_TARGET_CLASSES.get(target_tissue, []))
    ranked: list[dict] = []

    for item in sequences_with_scores:
        raw_scores = item.get("sei_scores", {})
        gc_pct, cpg_dens, flags = compute_pathology_flags(item["sequence"])

        # Only consider named Sei classes for specificity
        scores = {
            k: v for k, v in raw_scores.items()
            if not k.startswith(_NAMED_CLASS_PREFIX_EXCLUDE)
        }

        # On-target score = max across tissue-relevant classes
        on_target = max(
            (scores.get(k, 0.0) for k in on_target_keys), default=0.0
        )

        # Off-target max = highest score among non-target named classes
        off_target_max = max(
            (v for k, v in scores.items() if k not in on_target_keys),
            default=1e-9,
        )

        # Gap: positive means target bar is taller than everything else
        gap = on_target - max(off_target_max, 1e-9)

        specificity = on_target / max(off_target_max, 1e-9)

        has_critical = bool(set(flags) & _CRITICAL_FLAGS)

        ranked.append({
            **item,
            "on_target_score": round(on_target, 4),
            "off_target_max": round(off_target_max, 4),
            "gap": round(gap, 4),
            "specificity_ratio": round(specificity, 4),
            "combined_score": round(on_target * specificity, 4),
            "gc_pct": round(gc_pct, 2),
            "cpg_density": round(cpg_dens, 4),
            "flags": flags,
            "has_critical_flag": has_critical,
        })

    # Sort: no critical flags first, then by gap (on_target - off_target) DESC
    ranked.sort(
        key=lambda x: (
            not x["has_critical_flag"],  # True (no critical) sorts first
            x["gap"],
        ),
        reverse=True,
    )

    return ranked


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
    """Re-rank candidates in Python, then get Claude Sonnet recommendation for top 1.

    Steps:
        1. Python re-ranking via rerank_candidates() (pathology, specificity).
        2. Build ranking entry and cassette for top candidate.
        3. Send only top 1's key scores to Claude Sonnet (max_tokens=1024) for
           a focused 2-3 sentence scientific recommendation.

    Returns:
        Dict with keys 'ranking', 'recommendation', 'summary', 'cassette'.
    """
    client = get_anthropic_client()
    system_prompt = _load_interpret_prompt()

    # Step 1: Python re-ranking
    ranked = rerank_candidates(sequences_with_scores, target_tissue)
    top = ranked[0] if ranked else None

    if not top:
        return {"ranking": [], "recommendation": {}, "summary": "No candidates.", "cassette": {}}

    # Step 2: Build ranking entry + cassette
    seq = top["sequence"]
    seq_display = seq[:20] + "..." + seq[-20:] if len(seq) > 44 else seq
    cassette = compose_cassette(seq)

    ranking_entry = {
        "rank": 1,
        "sequence": seq,
        "sequence_display": seq_display,
        "on_target_score": top["on_target_score"],
        "specificity_ratio": top["specificity_ratio"],
        "combined_score": top["combined_score"],
        "top_class": top.get("top_class", ""),
        "flags": top["flags"],
    }

    # Step 3: Send only top 1 to Claude Sonnet for recommendation
    # Trim sei_scores to top 8 by value to keep token count low
    scores = top.get("sei_scores", {})
    top_keys = sorted(scores, key=lambda k: scores[k], reverse=True)[:8]
    trimmed_scores = {k: round(scores[k], 4) for k in top_keys}

    user_content = (
        f"Target tissue: {target_tissue}\n\n"
        f"Top candidate (rank 1 of {len(ranked)}):\n"
        f"- On-target score: {top['on_target_score']}\n"
        f"- Specificity ratio: {top['specificity_ratio']}\n"
        f"- Combined score (on-target × specificity): {top['combined_score']}\n"
        f"- Top Sei class: {top.get('top_class', 'N/A')}\n"
        f"- GC%: {top['gc_pct']}\n"
        f"- Flags: {', '.join(top['flags']) or 'none'}\n"
        f"- Key scores: {json.dumps(trimmed_scores)}\n"
    )

    logger.info("Claude Sonnet received message: %s", user_content[:200])
    full_response = ""
    async with client.messages.stream(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        async for text in stream.text_stream:
            full_response += text

    parsed = _extract_json(full_response)
    explanation = parsed.get("explanation", full_response.strip())
    summary = parsed.get("summary", explanation[:200])

    return {
        "ranking": [ranking_entry],
        "recommendation": {
            "rank": 1,
            "explanation": explanation,
            "cassette": cassette,
        },
        "summary": summary,
        "cassette": cassette,
    }


async def interpret_scores_streaming(
    sequences_with_scores: list[dict],
    target_tissue: str,
    result_out: dict[str, Any],
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream the Sonnet interpretation token-by-token, populating result_out.

    Yields:
        {"type": "stream_start", "stage": "interpreting"}
        {"type": "stream_delta", "delta": str}   (one per chunk)
        {"type": "stream_end",   "stage": "interpreting"}

    After streaming completes, result_out is populated with:
        ranking, recommendation, summary, cassette
    """
    client = get_anthropic_client()
    system_prompt = _load_interpret_prompt()

    # Python re-ranking (same as interpret_scores)
    ranked = rerank_candidates(sequences_with_scores, target_tissue)
    top = ranked[0] if ranked else None

    if not top:
        result_out.update({"ranking": [], "recommendation": {}, "summary": "No candidates.", "cassette": {}})
        return

    seq = top["sequence"]
    seq_display = seq[:20] + "..." + seq[-20:] if len(seq) > 44 else seq
    cassette = compose_cassette(seq)

    ranking_entry = {
        "rank": 1,
        "sequence": seq,
        "sequence_display": seq_display,
        "on_target_score": top["on_target_score"],
        "specificity_ratio": top["specificity_ratio"],
        "combined_score": top["combined_score"],
        "top_class": top.get("top_class", ""),
        "flags": top["flags"],
    }

    # Trimmed scores for Claude
    scores = top.get("sei_scores", {})
    top_keys = sorted(scores, key=lambda k: scores[k], reverse=True)[:8]
    trimmed_scores = {k: round(scores[k], 4) for k in top_keys}

    user_content = (
        f"Target tissue: {target_tissue}\n\n"
        f"Top candidate (rank 1 of {len(ranked)}):\n"
        f"- On-target score: {top['on_target_score']}\n"
        f"- Specificity ratio: {top['specificity_ratio']}\n"
        f"- Combined score (on-target × specificity): {top['combined_score']}\n"
        f"- Top Sei class: {top.get('top_class', 'N/A')}\n"
        f"- GC%: {top['gc_pct']}\n"
        f"- Flags: {', '.join(top['flags']) or 'none'}\n"
        f"- Key scores: {json.dumps(trimmed_scores)}\n"
    )

    logger.info("Claude Sonnet streaming: %s", user_content[:200])

    yield {"type": "stream_start", "stage": "interpreting"}

    full_response = ""
    try:
        async with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        ) as stream:
            async for text in stream.text_stream:
                full_response += text
                yield {"type": "stream_delta", "delta": text}
    except Exception as exc:
        logger.error("Interpretation stream failed: %s", exc)
        yield {"type": "stream_end", "stage": "interpreting"}
        return

    yield {"type": "stream_end", "stage": "interpreting"}

    # Populate result_out with structured data
    summary = full_response.strip()

    result_out.update({
        "ranking": [ranking_entry],
        "recommendation": {
            "rank": 1,
            "explanation": summary,
            "cassette": cassette,
        },
        "summary": summary,
        "cassette": cassette,
    })


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
        "parse_error": "Could not extract JSON from Claude Sonnet response",
    }
