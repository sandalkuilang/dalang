#!/usr/bin/env python3
"""Kokoro-82M (Apache-2.0) for DALANG: one clip per call, checked and downloaded only on request.

Usage:
  python kokoro_tts.py --check
      Is Kokoro usable here? Prints {"ok": true, "version": ..., "english_model": ...} and exits 0 when the packages
      import and the weights are in the local cache. english_model: is the spaCy text model that en and en-gb need
      (en_core_web_sm) installed; true / false, or null = could not tell.
  python kokoro_tts.py --text s.txt --lang a --voice af_heart --speed 1 --out s.wav
      Speak the text of s.txt as one 24 kHz mono 16-bit WAV (one sentence per call; the caller joins them).
  python kokoro_tts.py --download [--lang a] [--voice af_heart]
      The ONLY mode that may touch the network: fetches the weights (~330 MB), one voice (~0.5 MB) and the spaCy model
      en_core_web_sm that the English text front end needs (about 13 MB, a pip install from GitHub). It then speaks
      one short sentence, so that anything else the front end fetches on first use comes now. Run it once, and only
      with the user's consent.

LANGUAGES: only en-US (a) and en-GB (b). Their text front end is the one proven offline-safe (the spaCy model is
checked, and the guard below stops anything else). Every other language Kokoro can speak (es, fr, hi, it, ja, pt-BR,
zh) has a front end that fetches dictionaries or models on first use and that is not proven offline-safe here, so
it is refused with exit 2, naming VoiceStudio, before anything runs: nothing is spoken, checked for or downloaded.
Support for them is a recorded follow-up.

THE RULE: outside --download this process reaches no network and starts no program that could. One audit hook
(sys.addaudithook), installed below before any other import and impossible to remove, sees every socket connect,
host lookup, URL open and child process of this Python, whichever library asks (misaki's spaCy pip install,
a hub fetch, a dictionary download, one not written yet). The first one that is not local ends the
process at once with exit 6: no library can catch it and go on. Local is judged by address: a loopback literal or
the name localhost, never a name by how it looks. A child through multiprocessing is refused too (its start raises
only _posixsubprocess.fork_exec, and audit hooks are not inherited). Allowed: loopback and Unix sockets, and the few
read-only local probes the standard library runs (uname, ldconfig, a C compiler asked for a library path).

Language codes: a = en-US, b = en-GB.

Exit codes: 0 ok, 1 any other error (message on stderr), 2 bad input (a language other than a or b included),
4 weights or voice not downloaded (huggingface_hub's LocalEntryNotFoundError only), 5 package not installed (a
ModuleNotFoundError for kokoro or soundfile only), 6 the spaCy model en_core_web_sm is not installed, or the guard
refused a network reach. Anything else, a broken torch or numpy, an unreadable cache, a missing libsndfile, is
exit 1: an error to rerun, never "not installed" or "not downloaded".
"""
import ipaddress
import os
import sys
from urllib.parse import urlsplit

FETCH = "--download" in sys.argv[1:]  # main() refuses --download beside --check or --text: it is a mode of its own
LANG = None  # set by main(), for the refusal's command

# Read-only probes the standard library itself runs (platform: uname, sw_vers, sysctl; ctypes.util.find_library:
# ldconfig, a C compiler, ld, objdump). None of them fetches.
PROBES = frozenset({"uname", "sw_vers", "sysctl", "ldconfig", "ldconfig.real", "gcc", "cc", "ld", "objdump"})
SOCKETS = frozenset({"socket.connect", "socket.sendto", "socket.sendmsg", "socket.getnameinfo"})
LOOKUPS = frozenset({"socket.getaddrinfo", "socket.gethostbyname", "socket.gethostbyname_ex", "socket.gethostbyaddr"})
SPAWNS = {"subprocess.Popen": 0, "os.exec": 0, "os.posix_spawn": 0, "os.spawn": 1}  # event -> index of the path
# multiprocessing (spawn, forkserver, ProcessPoolExecutor) and its resource tracker start their child through this
# event alone: no subprocess.Popen precedes it, and the child is an unguarded Python (audit hooks are not inherited).
FORK_EXEC = "_posixsubprocess.fork_exec"  # (executable list, argv, cwd, env)
WATCHED = SOCKETS | LOOKUPS | frozenset(SPAWNS) | {FORK_EXEC, "urllib.Request", "os.system", "os.startfile"}


def _local(host):
    """True only for an ADDRESS that is this machine (a loopback literal) or the one name `localhost`. A host name is
    never judged by how it looks: the socket.connect event carries the name as the caller passed it, unresolved
    (CPython resolves it in C, with no getaddrinfo event), so "127.mirror.example" or "x.localhost" can resolve to a
    public address."""
    if host is None:
        return True
    h = (bytes(host).decode("ascii", "replace") if isinstance(host, (bytes, bytearray)) else str(host)).strip().strip("[]").lower()
    if h in ("", "localhost"):
        return True
    try:
        ip = ipaddress.ip_address(h.split("%", 1)[0])  # a scope id (fe80::1%lo0) is not part of the address
    except ValueError:
        return False  # a name: not proven local
    return (getattr(ip, "ipv4_mapped", None) or ip).is_loopback  # ::ffff:127.0.0.1 is loopback too


def _reach(event, args):
    """What this event reaches that is not local, or None when it stays on this machine."""
    if event in SOCKETS:
        addr = args[1] if event != "socket.getnameinfo" else args[0]
        if isinstance(addr, (str, bytes, bytearray)) or addr is None:
            return None  # a Unix socket path, or sendmsg on a connected socket (its connect was checked)
        return None if _local(addr[0]) else f"a connection to {addr[0]}"
    if event in LOOKUPS:
        return None if _local(args[0]) else f"a network lookup of {args[0]}"
    if event == "urllib.Request":
        u = urlsplit(str(args[0]))
        return None if u.scheme in ("file", "data") or (u.scheme and _local(u.hostname)) else f"a download of {args[0]}"
    if event in SPAWNS or event == FORK_EXEC:
        if event == FORK_EXEC:  # the program is the executable list's first candidate, whatever argv[0] says
            path, argv = (args[0][0] if args[0] else None), args[1]
        else:
            i = SPAWNS[event]
            path, argv = args[i], args[i + 1]
        name = os.path.basename(os.fsdecode(path if path is not None else argv[0]))
        if name in PROBES:
            return None
        shown = " ".join(os.fsdecode(x) if isinstance(x, (str, bytes, os.PathLike)) else str(x) for x in (argv or [name]))
        return f"starting the program {shown[:160]}"
    return f"a shell command ({str(args[0])[:160]})"  # os.system, os.startfile


def _guard(event, args):
    if event not in WATCHED:
        return
    try:
        what = _reach(event, args)
    except Exception:  # noqa: BLE001 - arguments the guard cannot read: refuse, never let it through
        what = f"{event} (arguments it could not read)"
    if what:
        cmd = f"kokoro_tts.py --download --lang {LANG or '<code>'}"
        sys.stderr.write(f"refused {what}: without --download this helper reaches no network and starts no program. "
                         f"Something this language needs may not be installed here (--check names what it can see); once, with the "
                         f"user's consent: {cmd} (references/voice.md \"Setup — Kokoro\"). Install nothing else.\n")
        sys.stderr.flush()
        os._exit(6)  # at once: no library's except clause can swallow it and go on


if not FETCH:
    sys.addaudithook(_guard)
    # The hub's own offline switch too, so a weights miss is the hub's clear "not in the cache" (exit 4).
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"

import argparse  # noqa: E402 - after the guard, on purpose
import importlib  # noqa: E402
import json  # noqa: E402

EN_MODEL = "en_core_web_sm"
EN_LANGS = ("a", "b")  # the only languages spoken: see LANGUAGES above
EN_NOTE = f"the spaCy English text model {EN_MODEL} (about 13 MB, a pip install from GitHub)"
PACKAGES = ("kokoro", "soundfile")  # what a user installs: a ModuleNotFoundError for one of these is "not installed"
REPO = "hexgrad/Kokoro-82M"
WEIGHTS = "kokoro-v1_0.pth"
SR = 24000


def fail(code, msg):
    print(msg, file=sys.stderr)
    sys.exit(code)


def not_installed(e):
    """True only for a package really absent: a ModuleNotFoundError naming kokoro or soundfile. An ImportError from
    inside an installed package (a libtorch that will not load, a numpy ABI mismatch) is a broken install, not a
    missing one."""
    return isinstance(e, ModuleNotFoundError) and e.name in PACKAGES


def not_cached(e):
    """True only for the hub's "not in the local cache" error. Any other OSError (an unreadable cache, a full disk)
    says nothing about whether the weights are downloaded."""
    for mod in ("huggingface_hub.errors", "huggingface_hub.utils"):
        try:
            t = getattr(importlib.import_module(mod), "LocalEntryNotFoundError", None)
        except ImportError:
            continue
        if isinstance(t, type) and isinstance(e, t):
            return True
    return False


def english_model():
    """True / False: is the spaCy English model installed. None: spaCy itself is not there to ask."""
    try:
        import spacy
    except ImportError:
        return None
    return bool(spacy.util.is_package(EN_MODEL))


def missing_text_model(lang):
    """The note for a text model this language needs that is known to be absent, else None (present or unknown: the
    guard still refuses any fetch)."""
    if lang in EN_LANGS and english_model() is False:
        return EN_NOTE
    return None


def refuse_language(lang):
    """Exit 2 for any language but en and en-gb, before a package is imported: nothing is spoken or fetched, and no
    download is offered for it."""
    if lang not in EN_LANGS:
        fail(2, f"language {lang!r} is not spoken here: this Kokoro helper speaks only en (a) and en-gb (b), the "
                f"languages whose text front end is proven to need nothing fetched. For another language use VoiceStudio.")


def check():
    try:
        import kokoro
        import soundfile  # noqa: F401
        from huggingface_hub import try_to_load_from_cache
    except ImportError as e:
        if not_installed(e):
            fail(5, f"package not installed: {e}")
        raise
    cached = try_to_load_from_cache(REPO, WEIGHTS)
    if not isinstance(cached, str):
        fail(4, f"weights {REPO}/{WEIGHTS} are not downloaded")
    print(json.dumps({"ok": True, "version": getattr(kokoro, "__version__", "?"), "english_model": english_model()}))


def pipeline(lang, fetch=False):
    need = None if fetch else missing_text_model(lang)
    if need:
        fail(6, f"{need} is not installed, and a take does not fetch it; once, with the user's consent, run "
                f"kokoro_tts.py --download --lang {lang} (it fetches it, and the weights if absent)")
    try:
        from kokoro import KPipeline
    except ImportError as e:
        if not_installed(e):
            fail(5, f"package not installed: {e}")
        raise
    try:
        return KPipeline(lang_code=lang, repo_id=REPO)
    except Exception as e:  # noqa: BLE001
        if not_cached(e):
            fail(4, f"weights not downloaded: {e}")
        raise


def speak(a):
    try:
        text = open(a.text, encoding="utf-8").read().strip()
    except OSError as e:
        fail(2, f"cannot read --text {a.text}: {e}")
    if not text:
        fail(2, "empty text")
    if not a.lang or not a.out:
        fail(2, "--lang and --out are required")
    refuse_language(a.lang)
    try:
        import numpy as np
        import soundfile as sf
    except ImportError as e:
        if not_installed(e):
            fail(5, f"package not installed: {e}")
        raise
    pipe = pipeline(a.lang)
    chunks = []
    try:
        for _, _, audio in pipe(text, voice=a.voice, speed=a.speed):
            if audio is None:
                continue
            chunks.append(audio.numpy() if hasattr(audio, "numpy") else audio)
    except Exception as e:  # noqa: BLE001
        if not_cached(e):
            fail(4, f"voice {a.voice} not downloaded: {e}")
        raise
    if not chunks:
        fail(1, "Kokoro produced no audio")
    sf.write(a.out, np.concatenate(chunks), SR, subtype="PCM_16")


def download(a):
    lang = a.lang or "a"
    refuse_language(lang)
    pipe = pipeline(lang, fetch=True)  # the user agreed to this: the language's text model may be fetched too
    voice = a.voice or "af_heart"
    pipe.load_voice(voice)
    for _ in pipe("Hello.", voice=voice):  # first use: whatever the front end fetches, now
        pass
    print(f"downloaded {REPO} ({WEIGHTS}) and voice {voice}; {EN_NOTE} installed")


def main():
    global LANG
    p = argparse.ArgumentParser(description="Kokoro-82M helper for DALANG")
    p.add_argument("--check", action="store_true")
    p.add_argument("--download", action="store_true")
    p.add_argument("--text")
    p.add_argument("--lang")
    p.add_argument("--voice")
    p.add_argument("--speed", type=float, default=1.0)
    p.add_argument("--out")
    a = p.parse_args()
    LANG = a.lang
    if a.download and (a.check or a.text or not FETCH):
        fail(2, "--download goes alone (with --lang and --voice): it is the one unguarded mode")
    if a.check:
        check()
    elif a.download:
        download(a)
    elif a.text:
        if not a.voice:
            fail(2, "--voice is required")
        speak(a)
    else:
        fail(2, "give --check, --download or --text (see the module docstring)")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 - an ImportError from inside an installed package too: rerun, not install
        fail(1, f"{type(e).__name__}: {e}")
