#!/usr/bin/env node
// node tests/kokoro-helper.mjs — the REAL scripts/kokoro_tts.py against fake kokoro / spacy / huggingface_hub /
// soundfile / numpy packages on PYTHONPATH (no model, no network). Covers the helper's two promises:
//  1. Without --download it fetches nothing: not the weights, not the spaCy English text model that misaki's English
//     G2P would pip-install on its own (spacy.cli.download), and nothing any other library reaches for (one audit-hook
//     guard: sockets, lookups, URLs, child processes). The fakes do the real operation, on targets that stay
//     network-free even unguarded. --download is the only path that may.
//  1b. Only en and en-gb are spoken: their G2P is the one proven offline-safe. Every other language is refused with a
//     message naming VoiceStudio, and nothing is spoken, checked for or offered for download.
//  2. Exit 5 (package not installed) and 4 (weights / voice not downloaded) are earned only by a ModuleNotFoundError
//     for kokoro or soundfile, and a LocalEntryNotFoundError. Any other ImportError / OSError (a broken torch, a numpy
//     ABI mismatch, an unreadable cache, a missing libsndfile) is exit 1: "rerun", never "install" or "download".
// Each case also has the legitimate side (the model present, the real missing package) so the guard cannot be a
// blanket refusal. Skipped without python3.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("../scripts/kokoro_tts.py", import.meta.url));
if (spawnSync("python3", ["--version"]).status !== 0) { console.log("kokoro-helper: python3 not found, skipped"); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-kokoro-helper-"));
const pk = path.join(tmp, "pkgs");
const w = (rel, body) => { const f = path.join(pk, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };

// The fakes read FAKE_* from the environment, so one set of files serves every case.
w("huggingface_hub/__init__.py", `import os
def try_to_load_from_cache(repo, name):
    if os.environ.get("FAKE_CACHE") == "perm":
        raise PermissionError(13, "Permission denied", "/hf-cache")
    return "/hf-cache/" + name if os.environ.get("FAKE_WEIGHTS", "1") == "1" else None
`);
w("huggingface_hub/errors.py", `class LocalEntryNotFoundError(FileNotFoundError):
    pass
`);
w("spacy/__init__.py", `from . import util, cli
`);
w("spacy/util.py", `import os
_calls = []
def is_package(name):
    m = os.environ.get("FAKE_SPACY_MODEL")
    if m == "flip":
        # present when the helper asks first, gone when the G2P asks: only the download guard stops the fetch
        _calls.append(1)
        return len(_calls) == 1
    return m == "1"
`);
w("spacy/cli/__init__.py", `import os, subprocess, sys
def download(name, *a, **k):
    # misaki's G2P calls this when the model is absent. The real one runs "python -m pip install <url>" in a child
    # process (the network fetch); this one starts a real child too, one that does nothing, then logs the "fetch".
    subprocess.run([sys.executable, "-c", "pass"], check=True)
    with open(os.environ["FAKE_LOG"], "a") as f:
        f.write("spacy-download " + name + "\\n")
`);
// Any library reaching for the network or a program, the way a real one would (FAKE_NET names how, FAKE_NET_AT when).
// Every target is network-free even unguarded: a documentation address, a numeric lookup, a child that does nothing.
w("netprobe.py", `import os, socket, subprocess, sys
def log(x):
    with open(os.environ["FAKE_LOG"], "a") as f:
        f.write(x + "\\n")
def child_ran():
    log("child-ran")
def run(kind):
    try:
        if kind == "socket":
            socket.create_connection(("192.0.2.1", 9), timeout=0.3)
        elif kind == "dns":
            socket.getaddrinfo("192.0.2.1", 443)
        elif kind == "urllib":
            import urllib.request
            urllib.request.urlopen("http://192.0.2.1:9/model.bin", timeout=0.3)
        elif kind == "child":
            subprocess.run([sys.executable, "-c", "pass"], check=True)
        elif kind == "system":
            os.system("true")
        elif kind == "loopback":
            srv = socket.socket()
            srv.bind(("127.0.0.1", 0))
            srv.listen(1)
            socket.create_connection(srv.getsockname(), timeout=2).close()
            srv.close()
        elif kind == "probe":
            subprocess.run(["uname"], check=True, stdout=subprocess.DEVNULL)
        elif kind == "loopback-name":
            # the name "localhost" resolves on this machine: a connection by that name stays local
            srv = socket.socket()
            srv.bind(("127.0.0.1", 0))
            srv.listen(1)
            socket.create_connection(("localhost", srv.getsockname()[1]), timeout=2).close()
            srv.close()
        elif kind == "name127":
            # a NAME that merely starts with 127. is not an address: socket.connect resolves a name in C and raises its
            # audit event with the name as the caller passed it, only if it RESOLVED. A name that resolves needs a
            # network, so this raises the very same event by hand (no connection is made)
            sys.audit("socket.connect", socket.socket(), ("127.mirror.invalid", 443))
        elif kind == "namelocalhost":
            sys.audit("socket.connect", socket.socket(), ("mirror.invalid.localhost", 443))
        elif kind == "dns127":
            socket.getaddrinfo("127.mirror.invalid", 443)
        elif kind == "urllib127":
            import urllib.request
            urllib.request.urlopen("http://127.mirror.invalid:9/model.bin", timeout=0.3)
        elif kind == "mp":
            # a worker through multiprocessing (spawn: the macOS default, and every ProcessPoolExecutor there) is
            # started by _posixsubprocess.fork_exec alone, no subprocess.Popen event: the child has no audit hook
            import multiprocessing
            p = multiprocessing.get_context("spawn").Process(target=child_ran)
            p.start()
            p.join(10)
        elif kind == "forkserver":
            import multiprocessing
            p = multiprocessing.get_context("forkserver").Process(target=child_ran)
            p.start()
            p.join(10)
    except Exception:
        pass  # a library that swallows the error and goes on
    if kind == "swallow":
        try:
            subprocess.run([sys.executable, "-c", "pass"], check=True)
        except BaseException:
            pass  # even a bare except: the take must still not go on
    log("net-" + kind)
`);
w("numpy/__init__.py", `def concatenate(parts):
    out = []
    for p in parts:
        out.extend(p)
    return out
`);
w("soundfile/__init__.py", `import os
if os.environ.get("FAKE_SF") == "nolib":
    raise OSError("sndfile library not found")
def write(path, data, sr, subtype=None):
    with open(path, "wb") as f:
        f.write(b"RIFFfake")
`);
w("kokoro/__init__.py", `import os
mode = os.environ.get("FAKE_KOKORO", "ok")
if mode == "libtorch":
    raise ImportError("dlopen(libtorch_cpu.dylib): image not found")
if mode == "abi":
    raise ImportError("numpy.core.multiarray failed to import")
if mode == "torch-missing":
    raise ModuleNotFoundError("No module named 'torch'", name="torch")
if os.environ.get("FAKE_NET") and os.environ.get("FAKE_NET_AT") == "import":
    import netprobe
    netprobe.run(os.environ["FAKE_NET"])
__version__ = "0.9.4"
from huggingface_hub.errors import LocalEntryNotFoundError

class KPipeline:
    def __init__(self, lang_code="a", repo_id=None, **k):
        if mode == "noweights":
            raise LocalEntryNotFoundError("Cannot find the requested files in the disk cache")
        if mode == "permcache":
            raise PermissionError(13, "Permission denied", "/hf-cache")
        if lang_code in ("a", "b"):
            # misaki.en G2P.__init__: fetch the spaCy model on its own when it is absent
            import spacy
            if not spacy.util.is_package("en_core_web_sm"):
                spacy.cli.download("en_core_web_sm")
        self.lang = lang_code
        if os.environ.get("FAKE_NET") and os.environ.get("FAKE_NET_AT", "init") == "init":
            import netprobe
            netprobe.run(os.environ["FAKE_NET"])
    def load_voice(self, v):
        return None
    def __call__(self, text, voice=None, speed=1):
        if mode == "novoice":
            raise LocalEntryNotFoundError("voice " + str(voice))
        yield ("", "", [0.0, 0.1])
`);

let n = 0;
function call(args, env = {}) {
  const dir = path.join(tmp, `case-${++n}`);
  fs.mkdirSync(dir);
  const log = path.join(dir, "log.txt");
  fs.writeFileSync(log, "");
  const text = path.join(dir, "s.txt"), out = path.join(dir, "s.wav");
  fs.writeFileSync(text, "Hello there.");
  const a = args.map((x) => (x === "TEXT" ? text : x === "OUT" ? out : x));
  const r = spawnSync("python3", [helper, ...a], { encoding: "utf8", timeout: 30000, env: { PATH: process.env.PATH, HOME: tmp, PYTHONPATH: pk, FAKE_LOG: log, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr, log: fs.readFileSync(log, "utf8"), wav: fs.existsSync(out) };
}
const speak = (lang, env) => call(["--text", "TEXT", "--lang", lang, "--voice", "af_heart", "--out", "OUT"], env);

const failures = [];
let count = 0;
const test = (name, fn) => { count++; try { fn(); } catch (e) { failures.push(`✗ ${name}: ${e.message}`); } };

// 1. No unconsented fetch.
test("H1. an English take without the spaCy model fetches nothing: exit 6, no spacy download, no audio", () => {
  for (const lang of ["a", "b"]) {
    const r = speak(lang, { FAKE_SPACY_MODEL: "0" });
    assert.equal(r.code, 6, `${lang}: ${r.err}`);
    assert.doesNotMatch(r.log, /spacy-download/, `${lang}: the model was fetched`);
    assert.match(r.err, /en_core_web_sm.*--download/, "names the consented command");
    assert.ok(!r.wav, "no audio");
  }
});
test("H1a. a model that vanishes between the helper's look and the G2P's is still not fetched", () => {
  const r = speak("a", { FAKE_SPACY_MODEL: "flip" });
  assert.equal(r.code, 6, r.err);
  assert.doesNotMatch(r.log, /spacy-download/);
});
test("H1b. the spaCy model present: an English take speaks, no download", () => {
  const r = speak("a", { FAKE_SPACY_MODEL: "1" });
  assert.equal(r.code, 0, r.err);
  assert.ok(r.wav);
  assert.doesNotMatch(r.log, /spacy-download/);
});
test("H1d. --check reports the English model, OK either way", () => {
  const a = call(["--check"], { FAKE_SPACY_MODEL: "0" });
  assert.equal(a.code, 0, a.err);
  assert.equal(JSON.parse(a.out).english_model, false);
  const b = call(["--check"], { FAKE_SPACY_MODEL: "1" });
  assert.equal(JSON.parse(b.out).english_model, true);
  assert.doesNotMatch(a.log + b.log, /spacy-download/, "--check fetches nothing");
});
test("H1e. --download is the one path that may fetch the English model", () => {
  const r = call(["--download", "--lang", "a"], { FAKE_SPACY_MODEL: "0" });
  assert.equal(r.code, 0, r.err);
  assert.match(r.log, /spacy-download en_core_web_sm/);
});

// 3. The class, not one instance: without --download, whatever library reaches for the network or starts a program
// (a socket, a lookup, a URL, a child process, a shell), the helper refuses it, exit 6, no audio, and a library that
// swallows the refusal does not let the take go on.
const NET = ["socket", "dns", "urllib", "child", "system", "swallow", "name127", "namelocalhost", "dns127", "urllib127", "mp", "forkserver"];
test("H3. any network reach or child process outside --download is refused: exit 6, no audio, nothing done", () => {
  const bad = [];
  for (const kind of NET) {
    const r = speak("a", { FAKE_NET: kind, FAKE_SPACY_MODEL: "1" });
    if (r.code !== 6 || /net-|child-ran/.test(r.log) || !/refused[\s\S]*--download/.test(r.err) || r.wav) {
      bad.push(`${kind}: exit ${r.code}, log ${JSON.stringify(r.log)}, wav ${r.wav}, ${r.err.slice(0, 200)}`);
    }
  }
  assert.deepEqual(bad, [], "not refused (or the library went on)");
});
test("H3a. --check is guarded too: a fetch at import is refused, never reported OK", () => {
  for (const kind of ["urllib", "child"]) {
    const r = call(["--check"], { FAKE_NET: kind, FAKE_NET_AT: "import" });
    assert.equal(r.code, 6, `${kind}: exit ${r.code} ${r.err}`);
    assert.doesNotMatch(r.out, /"ok"/);
    assert.doesNotMatch(r.log, /net-/);
  }
});
test("H3b. the legitimate side: a loopback socket and a read-only local probe pass; --download may reach out", () => {
  for (const kind of ["loopback", "loopback-name", "probe"]) {
    const r = speak("a", { FAKE_NET: kind, FAKE_SPACY_MODEL: "1" });
    assert.equal(r.code, 0, `${kind}: ${r.err}`);
    assert.match(r.log, new RegExp(`net-${kind}`));
    assert.ok(r.wav);
  }
  for (const kind of ["socket", "child", "urllib"]) {
    const r = call(["--download", "--lang", "a"], { FAKE_NET: kind, FAKE_SPACY_MODEL: "1" });
    assert.equal(r.code, 0, `download ${kind}: ${r.err}`);
    assert.match(r.log, new RegExp(`net-${kind}`));
  }
});
test("H3d. a host is local by its ADDRESS, never by how its name looks (and the real loopback forms still pass)", () => {
  const code = [
    "import sys; sys.path.insert(0, sys.argv[1]); sys.argv = ['kokoro_tts.py']",
    "import kokoro_tts as k",
    "local = ['localhost', 'LOCALHOST', '127.0.0.1', '127.0.0.2', '::1', '[::1]', '::ffff:127.0.0.1', b'127.0.0.1', '', None]",
    "named = ['127.mirror.example', '127.0.0.1.example.com', 'x.localhost', 'a.b.localhost', 'localhost.example.com', '10.0.0.5', '192.0.2.1', '8.8.8.8', '::ffff:8.8.8.8', '2001:db8::1']",
    "bad = [h for h in local if k._reach('socket.connect', (None, (h, 1)))]",
    "bad += [h for h in named if not k._reach('socket.connect', (None, (h, 1)))]",
    "bad += [h for h in named if not k._reach('socket.getaddrinfo', (h, 1))]",
    "bad += [h for h in named if not k._reach('urllib.Request', ('http://%s/x' % h,)) and ':' not in h]",
    "bad += [h for h in local if isinstance(h, str) and h and ':' not in h and k._reach('urllib.Request', ('http://%s:9/x' % h,))]",
    "bad += [e for e in ('/usr/bin/uname',) if k._reach('_posixsubprocess.fork_exec', ([e.encode()], [e], None, None))]",
    "bad += [e for e in ('/usr/bin/python3', '/bin/sh', '/usr/bin/curl') if not k._reach('_posixsubprocess.fork_exec', ([e.encode()], [e, '-c', 'x'], None, None))]",
    "print(repr(bad))",
  ].join("\n");
  const r = spawnSync("python3", ["-c", code, path.dirname(helper)], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: tmp } });
  assert.equal(r.stdout.trim(), "[]", r.stdout + r.stderr);
});
test("H3c. --download goes alone: with --check or --text it is bad input, not an unguarded take", () => {
  assert.equal(call(["--check", "--download"]).code, 2);
  assert.equal(call(["--download", "--text", "TEXT", "--lang", "a", "--voice", "af_heart", "--out", "OUT"]).code, 2);
});

// 4. Only en and en-gb. Any other language is refused before anything runs: exit 2, VoiceStudio named, no audio, no
// fetch, no download offer. --download refuses it too (it would fetch weights for a language that cannot be spoken).
const OTHER = ["e", "f", "h", "i", "j", "p", "z", "x"];
test("H4. a take in any other language is refused: exit 2, VoiceStudio named, no audio, nothing fetched or offered", () => {
  for (const lang of OTHER) {
    const r = speak(lang, { FAKE_SPACY_MODEL: "1" });
    assert.equal(r.code, 2, `${lang}: exit ${r.code} ${r.err}`);
    assert.match(r.err, /only en.*en-gb.*VoiceStudio/s, `${lang}: names the other engine`);
    assert.doesNotMatch(r.err, /MISSING|not installed|pip |--download/, `${lang}: offers nothing`);
    assert.ok(!r.wav, `${lang}: no audio`);
    assert.equal(r.log, "", `${lang}: the library was not even started`);
  }
});
test("H4a. --download in any other language is refused too: exit 2, nothing fetched", () => {
  for (const lang of OTHER) {
    const r = call(["--download", "--lang", lang], { FAKE_SPACY_MODEL: "0", FAKE_NET: "urllib" });
    assert.equal(r.code, 2, `${lang}: exit ${r.code} ${r.err}`);
    assert.match(r.err, /only en.*en-gb.*VoiceStudio/s);
    assert.equal(r.log, "", `${lang}: nothing ran`);
  }
});
test("H4b. the refusal comes before the packages: with a broken kokoro it is still exit 2, never 1 or 5", () => {
  const r = speak("j", { FAKE_KOKORO: "torch-missing" });
  assert.equal(r.code, 2, r.err);
});
test("H4c. en and en-gb still speak, and --check names no Japanese dictionary", () => {
  for (const lang of ["a", "b"]) {
    const r = speak(lang, { FAKE_SPACY_MODEL: "1" });
    assert.equal(r.code, 0, `${lang}: ${r.err}`);
    assert.ok(r.wav);
  }
  const c = call(["--check"], { FAKE_SPACY_MODEL: "1" });
  assert.equal(c.code, 0, c.err);
  assert.ok(!("japanese_dictionary" in JSON.parse(c.out)), c.out);
});

// 2. Unknown is not missing.
test("H2. a broken install is exit 1 (rerun), never 5 (not installed)", () => {
  for (const m of ["libtorch", "abi", "torch-missing"]) {
    const c = call(["--check"], { FAKE_KOKORO: m });
    assert.equal(c.code, 1, `check ${m}: exit ${c.code} ${c.err}`);
    const s = speak("a", { FAKE_KOKORO: m, FAKE_SPACY_MODEL: "1" });
    assert.equal(s.code, 1, `speak ${m}: exit ${s.code} ${s.err}`);
  }
});
test("H2b. the package really absent is exit 5 (kokoro, then soundfile)", () => {
  const none = path.join(tmp, "empty");
  fs.mkdirSync(none, { recursive: true });
  const base = { PATH: process.env.PATH, HOME: tmp, FAKE_LOG: path.join(tmp, "x.log") };
  const noKokoro = spawnSync("python3", [helper, "--check"], { encoding: "utf8", env: { ...base, PYTHONPATH: none } });
  assert.equal(noKokoro.status, 5, noKokoro.stderr);
  const partial = path.join(tmp, "partial");
  fs.cpSync(path.join(pk, "kokoro"), path.join(partial, "kokoro"), { recursive: true });
  fs.cpSync(path.join(pk, "huggingface_hub"), path.join(partial, "huggingface_hub"), { recursive: true });
  const noSf = spawnSync("python3", [helper, "--check"], { encoding: "utf8", env: { ...base, PYTHONPATH: partial } });
  assert.equal(noSf.status, 5, noSf.stderr);
});
test("H2c. libsndfile missing or an unreadable cache is exit 1, not 5 or 4", () => {
  const a = call(["--check"], { FAKE_SF: "nolib" });
  assert.equal(a.code, 1, a.err);
  const b = call(["--check"], { FAKE_CACHE: "perm" });
  assert.equal(b.code, 1, b.err);
  const c = speak("a", { FAKE_KOKORO: "permcache", FAKE_SPACY_MODEL: "1" });
  assert.equal(c.code, 1, c.err);
  const d = speak("a", { FAKE_SF: "nolib", FAKE_SPACY_MODEL: "1" });
  assert.equal(d.code, 1, d.err);
});
test("H2d. weights or a voice really not in the cache is exit 4", () => {
  assert.equal(call(["--check"], { FAKE_WEIGHTS: "0" }).code, 4);
  assert.equal(speak("a", { FAKE_KOKORO: "noweights", FAKE_SPACY_MODEL: "1" }).code, 4);
  assert.equal(speak("a", { FAKE_KOKORO: "novoice", FAKE_SPACY_MODEL: "1" }).code, 4);
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); console.error(`kokoro-helper: ${failures.length} of ${count} failed`); process.exit(1); }
console.log(`kokoro-helper: ${count} cases passed`);
