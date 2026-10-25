#!/usr/bin/env python3
"""Instrumental music bed with ACE-Step 1.5 (MIT, free, local) — no Gradio, no wizard.

  <ACESTEP_DIR>/.venv/bin/python music_acestep.py --caption "calm documentary underscore, felt piano, no drums" \
      --bpm 85 --duration 60 --out assets/music [--no-lm]

ACESTEP_DIR = the ACE-Step-1.5 checkout (`git clone --depth 1 https://github.com/ace-step/ACE-Step-1.5 && uv sync`),
with checkpoints acestep-v15-turbo, vae, Qwen3-Embedding-0.6B and (unless --no-lm) acestep-5Hz-lm-0.6B.
The bundled 1.7B LM (3.8 GB) is not needed; the check below stops ACE-Step from downloading it.
On a 16 GB Mac: ~90 s load + ~8 min per 30 s of music with CPU offload (without offload it runs out of
memory); run it in the background with nothing else heavy loaded. Output: one .wav (48 kHz stereo) in --out;
the last line is "DONE <path>".
"""
import argparse, os, sys, time
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--caption", required=True, help="style, instruments, mood; end with 'no vocals'")
ap.add_argument("--bpm", type=int, default=90)
ap.add_argument("--duration", type=float, default=30)
ap.add_argument("--out", default="assets/music")
ap.add_argument("--no-lm", action="store_true", help="skip the 0.6B planning LM (faster, less structured)")
a = ap.parse_args()

root = os.environ.get("ACESTEP_DIR")
if not root or not Path(root, "acestep").is_dir():
    sys.exit("Set ACESTEP_DIR to the ACE-Step-1.5 checkout (references/look-build.md §6, audio).")
sys.path.insert(0, root)
from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music
import acestep.model_downloader as md
import acestep.core.generation.handler.init_service_downloads as isd

def main_ok(d=None):  # the main model is complete without the 1.7B LM
    d = Path(d) if d else md.get_checkpoints_dir()
    return all(md._contains_model_weights(d / c) for c in ("acestep-v15-turbo", "vae", "Qwen3-Embedding-0.6B"))
isd.check_main_model_exists = md.check_main_model_exists = main_ok

Path(a.out).mkdir(parents=True, exist_ok=True)
t0 = time.time()
dit = AceStepHandler()
dit.initialize_service(project_root=root, config_path="acestep-v15-turbo", device="auto",
                       offload_to_cpu=True, offload_dit_to_cpu=True)
llm = LLMHandler()
if not a.no_lm:
    llm.initialize(checkpoint_dir=f"{root}/checkpoints", lm_model_path="acestep-5Hz-lm-0.6B", backend="mlx", device="auto")
params = GenerationParams(caption=a.caption, lyrics="[Instrumental]", instrumental=True,
                          bpm=a.bpm, duration=a.duration, thinking=not a.no_lm)
res = generate_music(dit, llm, params, GenerationConfig(batch_size=1, audio_format="wav"), save_dir=a.out)
if not res.success or not res.audios:
    sys.exit(f"FAILED: {getattr(res, 'error', 'no audio')}")
print(f"{time.time() - t0:.0f} s")
print("DONE", res.audios[0].get("path"))
