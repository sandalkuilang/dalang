#!/usr/bin/env python3
"""CTC forced aligner: time every word of a KNOWN script against its audio.

  python align.py --audio narration.wav --text script.txt --lang id --out words.json

Output: JSON list of {text, start, end, score} for each whitespace word of the
text (original spelling kept; [tags] dropped). Words the model cannot spell
(e.g. bare digits "1999") get times interpolated from neighbours, score null.
Only commercial-OK (Apache-2.0) models are listed; add languages to MODELS.
A local copy in $ALIGN_MODELS/<lang>/ (default ~/.cache/dalang/align/<lang>) is preferred.
Without one it uses the HF Hub cache only; --download fetches the model (~0.4-1.3 GB) once.
Exit code 3 = no model for this language, 4 = model not downloaded (caller falls back).
"""
import argparse, json, os, re, sys, unicodedata
import numpy as np, soundfile as sf, torch, torchaudio
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

MODELS = {  # all Apache-2.0 on their HF cards
    "id": "cahya/wav2vec2-large-xlsr-indonesian",
    "en": "facebook/wav2vec2-base-960h",
    "es": "jonatasgrosman/wav2vec2-large-xlsr-53-spanish",
    "fr": "jonatasgrosman/wav2vec2-large-xlsr-53-french",
    "de": "jonatasgrosman/wav2vec2-large-xlsr-53-german",
    "pt": "jonatasgrosman/wav2vec2-large-xlsr-53-portuguese",
    "it": "jonatasgrosman/wav2vec2-large-xlsr-53-italian",
    "nl": "jonatasgrosman/wav2vec2-large-xlsr-53-dutch",
    "ru": "jonatasgrosman/wav2vec2-large-xlsr-53-russian",
    "ar": "jonatasgrosman/wav2vec2-large-xlsr-53-arabic",
}
SR = 16000
WIN, CTX = 30.0, 1.0  # emission window / context seconds (keeps attention memory bounded)


def emissions(model, wav):
    """Log-probs [frames, vocab], computed in 30 s windows with 1 s context each side."""
    win, ctx, out = int(WIN * SR), int(CTX * SR), []
    for s in range(0, len(wav), win):
        a, b = max(0, s - ctx), min(len(wav), s + win + ctx)
        with torch.inference_mode():
            lp = model(torch.from_numpy(wav[a:b])[None]).logits[0].log_softmax(-1)
        fps = lp.shape[0] / (b - a)  # frames per sample (~1/320)
        out.append(lp[round((s - a) * fps): round((min(s + win, len(wav)) - a) * fps)])
    return torch.cat(out).numpy()


def viterbi(lp, tokens, blank):
    """CTC forced alignment -> best state path; returns frame index span per token."""
    T, ext = lp.shape[0], [blank]
    for t in tokens:
        ext += [t, blank]
    S, NEG = len(ext), -1e30
    ext = np.array(ext)
    skip = np.zeros(S, bool)  # may jump blank over (s-2 -> s) when labels differ
    skip[2:] = (ext[2:] != blank) & (ext[2:] != ext[:-2])
    dp = np.full(S, NEG); dp[:2] = lp[0, ext[:2]]
    back = np.zeros((T, S), np.int8)
    for t in range(1, T):
        c1 = np.concatenate([[NEG], dp[:-1]])
        c2 = np.where(skip, np.concatenate([[NEG, NEG], dp[:-2]]), NEG)
        stack = np.stack([dp, c1, c2])
        back[t] = stack.argmax(0)
        dp = stack.max(0) + lp[t, ext]
    s = S - 1 if dp[S - 1] >= dp[S - 2] else S - 2
    path = np.empty(T, int)
    for t in range(T - 1, -1, -1):
        path[t] = s; s -= int(back[t, s])
    spans = [[None, None] for _ in tokens]
    for t, s in enumerate(path):
        if s % 2:  # odd states are tokens
            k = s // 2
            spans[k][0] = t if spans[k][0] is None else spans[k][0]
            spans[k][1] = t
    return spans


def normalize(word, vocab):
    out = []
    for ch in unicodedata.normalize("NFC", word.lower()):  # ñ, ä, й stay whole when the vocab has them
        for c in (ch if ch in vocab else unicodedata.normalize("NFKD", ch)):
            if c in vocab and c != "|" and not c.startswith("["):
                out.append(vocab[c])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True); ap.add_argument("--text", required=True)
    ap.add_argument("--lang", default="id"); ap.add_argument("--model")
    ap.add_argument("--out", required=True); ap.add_argument("--download", action="store_true")
    a = ap.parse_args()
    root = os.environ.get("ALIGN_MODELS") or os.path.expanduser("~/.cache/dalang/align")
    local = os.path.join(root, a.lang)
    name = a.model or (local if os.path.isfile(os.path.join(local, "config.json")) else MODELS.get(a.lang))
    if not name:
        print(f"no commercial-OK CTC model for lang '{a.lang}'", file=sys.stderr)
        sys.exit(3)  # caller falls back to transcribe-and-match
    torch.set_num_threads(4)
    try:
        proc = Wav2Vec2Processor.from_pretrained(name, local_files_only=not a.download)
        model = Wav2Vec2ForCTC.from_pretrained(name, dtype=torch.float32, local_files_only=not a.download).eval()
    except OSError:
        print(f"model {name} not downloaded; rerun with --download", file=sys.stderr)
        sys.exit(4)
    if a.download and name != local:  # keep a local copy so later runs never touch the Hub
        proc.save_pretrained(local); model.half().save_pretrained(local); model.float()  # local copy is fp16 on disk
    vocab = {k.lower(): v for k, v in proc.tokenizer.get_vocab().items()}
    blank = proc.tokenizer.pad_token_id

    text = re.sub(r"\[[^\]]*\]", " ", open(a.text, encoding="utf-8").read())
    words = text.split()
    wav, sr = sf.read(a.audio, dtype="float32", always_2d=True)
    wav = wav.mean(1)
    if sr != SR:
        wav = torchaudio.functional.resample(torch.from_numpy(wav), sr, SR).numpy()
    wav = (wav - wav.mean()) / (wav.std() + 1e-7)  # wav2vec2 feature-extractor normalisation

    lp = emissions(model, wav)
    sec = len(wav) / SR / lp.shape[0]
    toks = [normalize(w, vocab) for w in words]
    flat = [t for ts in toks for t in ts]
    spans = viterbi(lp, flat, blank)

    out, i = [], 0
    for w, ts in zip(words, toks):
        if not ts:
            out.append({"text": w, "start": None, "end": None, "score": None}); continue
        sp = spans[i:i + len(ts)]; i += len(ts)
        f0, f1 = sp[0][0], sp[-1][1] + 1
        score = float(np.exp(np.mean([lp[s0:s1 + 1, flat[j]].max()
                                      for j, (s0, s1) in zip(range(i - len(ts), i), sp)])))
        out.append({"text": w, "start": round(f0 * sec, 3), "end": round(f1 * sec, 3),
                    "score": round(score, 3)})
    for k, o in enumerate(out):  # unspellable words: fill the gap between neighbours
        if o["start"] is None:
            o["start"] = out[k - 1]["end"] if k else 0.0
            nxt = next((x["start"] for x in out[k + 1:] if x["start"] is not None), len(wav) / SR)
            o["end"] = nxt
    json.dump(out, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"aligned {len(out)} words, {len(wav)/SR:.2f}s audio, model {name}", file=sys.stderr)


if __name__ == "__main__":
    main()
