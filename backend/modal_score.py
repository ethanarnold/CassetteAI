"""Sei tissue-specificity scorer on Modal A100.

Scores 200 bp synthetic regulatory elements across 40 Sei sequence classes
(derived from 21,907 chromatin profiles). Each element is embedded in a
fixed GC-balanced 4,096 bp flanking context (seed=42) so scores are
comparable across all candidates in a run.

Weights: Zenodo record 4906996 (sei.pth + projvec_targets.npy).
"""

import modal

app = modal.App("sei-scorer")

sei_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "wget")
    .pip_install(
        "torch==2.1.0",
        "numpy==1.26.4",
        "scipy==1.12.0",
    )
    .run_commands(
        # Clone the sei-framework repo for the model class file and download script
        "git clone https://github.com/FunctionLab/sei-framework.git /opt/sei-framework",
        # Download pretrained weights from Zenodo record 4906996 via the repo script
        "cd /opt/sei-framework && bash download_data.sh",
    )
)

# ---------------------------------------------------------------------------
# Sei sequence class names — verbatim from model/seqclass.names in the repo
# (40 classes, 0-indexed, derived by clustering 21,907 Sei chromatin outputs)
# ---------------------------------------------------------------------------
SEI_SEQUENCE_CLASS_NAMES: list[str] = [
    "PC1 Polycomb / Heterochromatin",        # 0
    "L1 Low signal",                          # 1
    "TN1 Transcription",                      # 2
    "TN2 Transcription",                      # 3
    "L2 Low signal",                          # 4
    "E1 Stem cell",                           # 5
    "E2 Multi-tissue",                        # 6
    "E3 Brain / Melanocyte",                  # 7
    "L3 Low signal",                          # 8
    "E4 Multi-tissue",                        # 9
    "TF1 NANOG / FOXA1",                      # 10
    "HET1 Heterochromatin",                   # 11
    "E5 B-cell-like",                         # 12
    "E6 Weak epithelial",                     # 13
    "TF2 CEBPB",                              # 14
    "PC2 Weak Polycomb",                      # 15
    "E7 Monocyte / Macrophage",               # 16
    "E8 Weak multi-tissue",                   # 17
    "L4 Low signal",                          # 18
    "TF3 FOXA1 / AR / ESR1",                  # 19
    "PC3 Polycomb",                           # 20
    "TN3 Transcription",                      # 21
    "L5 Low signal",                          # 22
    "HET2 Heterochromatin",                   # 23
    "L6 Low signal",                          # 24
    "P Promoter",                             # 25
    "E9 Liver / Intestine",                   # 26  ← primary liver signal
    "CTCF CTCF-Cohesin",                      # 27
    "TN4 Transcription",                      # 28
    "HET3 Heterochromatin",                   # 29
    "E10 Brain",                              # 30
    "TF4 OTX2",                               # 31
    "HET4 Heterochromatin",                   # 32
    "L7 Low signal",                          # 33
    "PC4 Polycomb / Bivalent stem cell Enh",  # 34
    "HET5 Centromere",                        # 35
    "E11 T-cell",                             # 36
    "TF5 AR",                                 # 37
    "E12 Erythroblast-like",                  # 38
    "HET6 Centromere",                        # 39
]

# Fixed flanking context seed — must be identical across all scoring calls
# so candidates are scored on equal footing.
_FLANK_SEED = 42
_SEQ_LEN = 200
_CONTEXT_LEN = 4096
_FLANK_LEN = (_CONTEXT_LEN - _SEQ_LEN) // 2  # 1948 bp each side

_ALPHA_MAP = {"A": 0, "C": 1, "G": 2, "T": 3}


def _make_flanked_seq(element: str, seed: int = _FLANK_SEED) -> str:
    """Embed a 200 bp element in a fixed GC-balanced flanking context.

    The flanking sequence is generated once from a fixed RNG seed so all
    candidates receive identical context and scores are directly comparable.
    """
    import numpy as np

    rng = np.random.default_rng(seed)
    bases = ["A", "C", "G", "T"]
    left = "".join(rng.choice(bases, size=_FLANK_LEN))
    right = "".join(rng.choice(bases, size=_FLANK_LEN))
    return left + element + right


def _one_hot(seq: str):
    """One-hot encode a DNA sequence to float32 (4, len) numpy array."""
    import numpy as np

    arr = np.zeros((4, len(seq)), dtype=np.float32)
    for i, base in enumerate(seq.upper()):
        idx = _ALPHA_MAP.get(base)
        if idx is not None:
            arr[idx, i] = 1.0
        # Unknown bases (N, etc.) stay all-zero (silent)
    return arr


def _reverse_complement(seq: str) -> str:
    comp = {"A": "T", "T": "A", "C": "G", "G": "C"}
    return "".join(comp.get(b, "N") for b in reversed(seq.upper()))


def _sc_projection(chromatin_preds, projvec: "np.ndarray") -> "np.ndarray":
    """Project raw Sei 21,907-dim outputs onto the 40 sequence class vectors.

    Args:
        chromatin_preds: (n, 21907) float array — Sei sigmoid outputs
        projvec: (40, 21907) float array — loaded from projvec_targets.npy

    Returns:
        (n, 40) float array of sequence class scores
    """
    import numpy as np

    return np.dot(chromatin_preds, projvec.T) / np.linalg.norm(projvec, axis=1)


@app.function(gpu="A100", image=sei_image, timeout=600)
def score_elements(sequences: list[str]) -> list[dict]:
    """Score each 200 bp element with Sei across 40 sequence classes.

    Each element is embedded in a fixed GC-balanced flanking context (seed=42)
    to reach 4,096 bp. Predictions are averaged over forward and reverse-
    complement strands (non_strand_specific: mean, matching the Sei config).

    Args:
        sequences: List of 200 bp DNA strings (ACGT).

    Returns:
        List of dicts, one per input sequence:
        {
            "sequence": str,
            "sei_scores": {class_name: float, ...},  # 40 entries
            "top_class": str,
            "specificity_ratio": float,  # max_score / second_max_score
        }

    Raises:
        RuntimeError: If Sei weights or projection vectors fail to load.
    """
    import sys

    import numpy as np
    import torch

    # Make the Sei model class importable from the cloned repo
    sys.path.insert(0, "/opt/sei-framework/model")

    try:
        from sei import Sei  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError(
            "Could not import Sei model class from /opt/sei-framework/model/sei.py. "
            "Ensure the sei-framework repo was cloned successfully during image build."
        ) from exc

    # Load pretrained weights
    weights_path = "/opt/sei-framework/model/sei.pth"
    projvec_path = "/opt/sei-framework/model/projvec_targets.npy"

    try:
        model = Sei(sequence_length=4096, n_genomic_features=21907)
        state_dict = torch.load(weights_path, map_location="cuda")
        model.load_state_dict(state_dict)
    except FileNotFoundError:
        raise RuntimeError(
            f"Sei weights not found at {weights_path}. "
            "Run `cd /opt/sei-framework && bash download_data.sh` to fetch weights "
            "from Zenodo record 4906996, or rebuild the Modal image."
        )
    except Exception as exc:
        raise RuntimeError(
            f"Failed to load Sei model from {weights_path}: {exc}. "
            "Check that the weights file is complete and not corrupted."
        ) from exc

    try:
        projvec = np.load(projvec_path)  # (40, 21907)
    except FileNotFoundError:
        raise RuntimeError(
            f"Sei projection vectors not found at {projvec_path}. "
            "This file (projvec_targets.npy) should be in the same Zenodo tarball "
            "as sei.pth. Rebuild the Modal image after confirming download_data.sh "
            "fetches both files."
        )

    model.eval()
    model = model.cuda()

    results: list[dict] = []

    for seq in sequences:
        if len(seq) != _SEQ_LEN:
            raise ValueError(
                f"Expected {_SEQ_LEN} bp sequences, got {len(seq)} bp: {seq[:20]}..."
            )

        # Embed in flanking context → 4096 bp
        seq_4096 = _make_flanked_seq(seq)

        # Forward strand
        x_fwd = torch.from_numpy(_one_hot(seq_4096)).unsqueeze(0).cuda()  # (1,4,4096)
        # Reverse complement strand
        x_rev = torch.from_numpy(_one_hot(_reverse_complement(seq_4096))).unsqueeze(0).cuda()

        with torch.no_grad():
            preds_fwd = model(x_fwd).cpu().numpy()  # (1, 21907)
            preds_rev = model(x_rev).cpu().numpy()  # (1, 21907)

        # Average fwd + rev-comp (non_strand_specific: mean)
        preds = (preds_fwd + preds_rev) / 2.0  # (1, 21907)

        # Project onto 40 sequence class vectors
        sc_scores = _sc_projection(preds, projvec)[0]  # (40,)

        sei_scores = {
            SEI_SEQUENCE_CLASS_NAMES[i]: float(sc_scores[i])
            for i in range(len(SEI_SEQUENCE_CLASS_NAMES))
        }

        top_idx = int(np.argmax(sc_scores))
        top_class = SEI_SEQUENCE_CLASS_NAMES[top_idx]

        # Specificity ratio: top score / second-highest score
        sorted_scores = np.sort(sc_scores)[::-1]
        second = sorted_scores[1] if sorted_scores[1] > 0 else 1e-9
        specificity_ratio = float(sorted_scores[0] / second)

        results.append(
            {
                "sequence": seq,
                "sei_scores": sei_scores,
                "top_class": top_class,
                "specificity_ratio": round(specificity_ratio, 4),
            }
        )

    return results
