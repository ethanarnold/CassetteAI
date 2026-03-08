import hashlib
import json
from pathlib import Path

# Relative to project root (one level up from backend/)
CACHE_DIR = Path(__file__).parent.parent / "cache"

# Maps synonym → canonical cache key directory name
_TISSUE_MAP: dict[str, str] = {
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
}


def cache_key(prompt: str) -> str:
    """Return canonical cache key for a prompt.

    Known tissues → 'liver' | 'cardiac' | 'neural'.
    Unknown prompts → first 16 hex chars of SHA-256.
    """
    normalized = prompt.lower().strip()
    for synonym, canonical in _TISSUE_MAP.items():
        if synonym in normalized:
            return canonical
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def get_cached(prompt: str, stage: str) -> dict | list | None:
    """Read a pipeline stage result from disk cache.

    Returns parsed JSON or None if not cached.
    Stage names: 'generation', 'scoring', 'interpretation', 'cassette'.
    """
    key = cache_key(prompt)
    path = CACHE_DIR / key / f"{stage}.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None


def set_cache(prompt: str, stage: str, data: dict | list) -> None:
    """Write a pipeline stage result to disk cache."""
    key = cache_key(prompt)
    stage_dir = CACHE_DIR / key
    stage_dir.mkdir(parents=True, exist_ok=True)
    path = stage_dir / f"{stage}.json"
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
