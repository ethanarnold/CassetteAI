"""DNA-Diffusion sequence generator on Modal A100.

Generates 200 bp synthetic regulatory elements conditioned on cell type,
using the pretrained DNA-Diffusion UNet from HuggingFace (ssenan/DNA-Diffusion).

Cell type labels (1-indexed, as trained):
  GM12878 = 1
  HepG2   = 2  (liver proxy)
  K562    = 3  (cardiac / blood proxy)
  hESCT0  = 4
"""

import modal

app = modal.App("dna-diffusion")

# Python 3.12 is required by the dnadiffusion package (pyproject.toml constraint).
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git")
    .pip_install(
        "torch>=2.6.0",
        "torchvision>=0.21.0",
        "transformers>=4.52.4",
        "safetensors>=0.5.3",
        "einops>=0.8.1",
        "memory-efficient-attention-pytorch>=0.1.6",
        "numpy>=1.26.0",
        "tqdm>=4.67.1",
        "pandas>=2.2.3",
        "huggingface_hub>=0.23.0",
    )
    .run_commands(
        # Install dnadiffusion from the pinellolab GitHub repo
        "pip install git+https://github.com/pinellolab/DNA-Diffusion.git",
        # Pre-download the pretrained weights into the image cache so cold starts
        # don't need to fetch ~378 MB at inference time.
        "python -c \""
        "from dnadiffusion.models.pretrained_unet import PretrainedUNet; "
        "PretrainedUNet.from_pretrained('ssenan/DNA-Diffusion'); "
        "print('DNA-Diffusion weights cached successfully')"
        "\"",
    )
)

# Cell type label mapping (1-indexed, matches training data enumerate(..., 1))
CELL_TYPE_LABELS: dict[str, int] = {
    "GM12878": 1,
    "HepG2": 2,
    "K562": 3,
    "hESCT0": 4,
}

SEQUENCE_LENGTH = 200
NUCLEOTIDES = ["A", "C", "G", "T"]


@app.function(gpu="A100", image=image, timeout=300)
def generate_elements(cell_type: str, n_samples: int = 200) -> list[str]:
    """Generate n_samples 200 bp regulatory elements conditioned on cell_type.

    Args:
        cell_type: One of 'HepG2', 'K562', 'GM12878', 'hESCT0'.
        n_samples: Number of sequences to generate (default 200).

    Returns:
        List of n_samples DNA sequence strings, each exactly 200 bp (ACGT).

    Raises:
        ValueError: If cell_type is not a supported conditioning label.
        RuntimeError: If pretrained weights fail to load from HuggingFace.
    """
    import numpy as np
    import torch
    from dnadiffusion.models.diffusion import Diffusion
    from dnadiffusion.models.pretrained_unet import PretrainedUNet

    if cell_type not in CELL_TYPE_LABELS:
        raise ValueError(
            f"Unsupported cell_type '{cell_type}'. "
            f"Must be one of: {list(CELL_TYPE_LABELS.keys())}. "
            f"Map your target tissue to one of these labels before calling."
        )

    cell_type_int = CELL_TYPE_LABELS[cell_type]

    # Load pretrained UNet (weights cached in image from build step)
    try:
        pretrained_unet = PretrainedUNet.from_pretrained("ssenan/DNA-Diffusion")
    except Exception as exc:
        raise RuntimeError(
            "DNA-Diffusion weights failed to load from HuggingFace (ssenan/DNA-Diffusion). "
            "Ensure the model is accessible and the image was built with weights pre-cached. "
            f"Original error: {exc}"
        ) from exc

    unet = pretrained_unet.model

    # Wrap in Diffusion scheduler (50 DDPM denoising steps, matches training config)
    diffusion = Diffusion(
        model=unet,
        timesteps=50,
        beta_start=0.0001,
        beta_end=0.2,
    )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    diffusion = diffusion.to(device)
    diffusion.eval()

    # Build class conditioning tensor — shape (n_samples,), float
    classes = torch.tensor(
        [cell_type_int] * n_samples, dtype=torch.float32, device=device
    )

    # Run classifier-free guidance sampling over 50 denoising steps.
    # Returns a list of tensors (one per timestep); [-1] is the final output.
    # Each tensor has shape (n_samples, 1, 4, SEQUENCE_LENGTH).
    with torch.no_grad():
        sampled_images = diffusion.sample(
            classes,
            shape=(n_samples, 1, 4, SEQUENCE_LENGTH),
            cond_weight=1.0,
        )

    # Decode one-hot to ACGT strings
    sequences: list[str] = []
    for x in sampled_images[-1]:
        # x shape: (1, 4, 200) — argmax over nucleotide axis (axis 0 after reshape)
        decoded = np.argmax(x.reshape(4, SEQUENCE_LENGTH), axis=0)
        seq = "".join(NUCLEOTIDES[i] for i in decoded)
        sequences.append(seq)

    assert all(len(s) == SEQUENCE_LENGTH for s in sequences), (
        f"One or more generated sequences is not {SEQUENCE_LENGTH} bp — "
        "check DNA-Diffusion model output shape"
    )
    assert all(set(s).issubset(set(NUCLEOTIDES)) for s in sequences), (
        "Generated sequences contain characters outside ACGT"
    )

    return sequences
