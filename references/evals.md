# Evals: is the skill getting better?

Read this only when changing the skill. Run the golden briefs in autonomous mode (one fresh session each, the skill invoked as a user would), then `node scripts/score_run.mjs video/<slug>` per project and compare with the previous run's scorecards. A change that lowers a score without a reason is a regression.

## Golden briefs

Each brief stresses a different part. Pick fresh topics each time (never reuse a test topic), but keep the shape.

| # | Brief (user's words, in the user's language) | Stresses |
|---|---|---|
| 1 | "A 30–45 s Short on <a physical, real-world subject>, autonomous." | real-footage sourcing, realism ladder, 9:16 safe zones |
| 2 | "A 60–90 s landscape explainer on <a number-led topic>, autonomous." | data look, facts, every number tagged (none untagged at Gate 1), `beats_per_10s` (one beat every 2–4 s ≈ 2.5–5) |
| 3 | "A 45 s dialogue scene between two people about <an everyday situation>, autonomous." | people (hyperreal, no puppets), multi-voice, `LINES` |
| 4 | "Turn this recording into a 60 s video: <user audio file>, autonomous." | `--from-audio`, timing from a real voice |
| 5 | "A 60 s stylized explainer of <a process too small, too large or too slow to film>, autonomous." | a subject outside `engine/three`: its own law, scale changes shown, a self-check, nothing borrowed from earlier sets; the style frames built from their reference boards (the board check below) |
| 6 | "A 60 s Short on why <a common thing that fails: a part, a plant, a battery, a tool> breaks, autonomous." | the failure-explainer arc (`script-voice.md` "Arc templates"): the script's beats map to it (cold open with a quoted verdict, path, thesis with N, N enemies each with name · mechanism · tagged number · visible cause, cost, checklist, bookend), none untagged at Gate 1, the bookend shows the opening setting working, night-graded story parts vs bright explanation |
| 7 | "A 60 s Short on which <size, plan, model or option> to pick for <an everyday case>, autonomous." | the choice-explainer arc (`script-voice.md` "Arc templates"): the script's beats map 1:1 to it (hook with an open loop, misread unit, unit ladder, rule applied to the viewer's own case, both failure modes by physical cause, payoff that answers the hook, decision as conditions, reframe that returns to the first frame), every number with its comparison and tag, none untagged at Gate 1, the sign-off said only when the Brief has one |
| 8 | "A 90 s landscape explainer of <a process or machine with six distinct stages>, autonomous." | the Step 6 parallel build (`look-build.md` "Parallel build"): six shot groups (shots sharing one bake or one continuous camera move in one group), the pilot group rendered and checked against the style frames before any other group is built, the other five built by parallel subagents in one message, the main context writes and reads no scene code (a failed check goes back to that group's builder); Step 7's `timing_lint.mjs` reports a cut inside a word that sits in a group file (plant one to confirm); compare Step 6's logged minutes, tool calls and tokens with the previous run's |
| 9 | "A 45 s landscape explainer of <one mechanism with two stages>, autonomous." | fewer than 3 shot groups: one builder subagent builds the whole film (`look-build.md` "Parallel build"), each QC fix round goes to a builder subagent that returns fixed / not fixed per finding, the main transcript passes the scene-code check below |

## What to compare

From `score_run.mjs`: `still_pct` (≤ 10), `lufs` (≈ −14 ± 1), `true_peak` (≤ −1), `qc_problems` (0), `timing_problems` (0), `est_words` (0 is best), `assets_ok` (true), `gates_approved` (4 at a finished draft), `review_p0` (0 open), `logged_minutes`, `logged_problems`, `quiz_score` / `quiz_pct` (Clarity: correct = 1, partly correct = 0.5; compare per skill version, a drop without a reason is a regression).

Not measurable by script, judged on the review sheets: Realism and Reality (`visual-direction.md` §11), the people test, whether the voice sounds human (a human listens). Record these by hand next to the scorecard. `POST.md` (`qc.md`, "Post description"): its part 4 formula, run on the film's example inputs, reproduces the film's number (check it by hand when the film has a `numbers.json`), it is at most about 1,800 characters, and it carries no credit line the user did not choose.

Also compare the cost of the run: tool calls and tokens per step (from the session's usage), and whether any reference file was read in full when only a section was needed.

**Scene code stays out of the main context** (every autonomous run): the main session's transcript holds no `Write` or `Edit` to the film's `src/` or `assets/*.js` (any tool given a path, `Read` aside, counts as a write); every scene write sits in a builder subagent's. The Step 5 style frames (`style-frames/src/`, `look-build.md` §5) are the main agent's own and are not flagged. A path is the film's by what is on disk, never by its spelling: it or the nearest folder above it is the same file (device and inode) as the film's folder `<project>` (the one holding `BRIEF.md`) or a folder in its `src/` or `assets/`, and the rest of the path decides: `src/…` and `assets/<name>.js`. So a parent folder's name (videos kept under `~/src/`) never flags `BRIEF.md`, while a symlinked or other-case spelling of the folder and a symlinked `src/` inside it still match. **Clean needs evidence:** exit 0 with nothing printed only when the transcripts hold a builder's write to the film's scene code, so they hold the build; anything else that flags nothing (no `<project>`, no `BRIEF.md` in it, an empty transcript, another film's session, a Steps 1–4 session whose build went on after a resume) exits 2 with the usage line. Give it every session of the run (a resume starts a new JSONL) and the builders' own files. Claude Code keeps a session in `~/.claude/projects/<slug>/<session>.jsonl`, its subagents in `<session>/subagents/*.jsonl` (sidechain lines: builders):

```bash
node -e 'const P=require("path"),F=require("fs"),[,t,d,...o]=process.argv,u=m=>{console.error(m+"; usage: <session>.jsonl <project> [<more>.jsonl ...] (the film folder, the one holding BRIEF.md; then the other sessions of the run and the subagent files)");process.exit(2)};if(!t||!d)u("missing argument");const root=P.resolve(d);if(!F.existsSync(P.join(root,"BRIEF.md")))u("no BRIEF.md in "+root);const K=p=>{const s=F.statSync(p,{bigint:true});return s.dev+":"+s.ino},M=new Map([[K(root),""]]),W=(p,r,z)=>{let k;try{k=K(p)}catch{return}if(M.has(k))return;M.set(k,r);if(z)try{for(const e of F.readdirSync(p))W(P.join(p,e),r+"/"+e,z-1)}catch{}},own=f=>{const k=[];for(let p=P.resolve(root,f);;p=P.dirname(p)){let r;try{r=M.get(K(p))}catch{}if(r!==undefined)return[r,...k.reverse()].filter(Boolean).join("/");if(P.dirname(p)===p)return null;k.push(P.basename(p))}};W(P.join(root,"src"),"src",1/0);W(P.join(root,"assets"),"assets",1);let n=0;for(const x of[t,...o]){const s=F.readFileSync(x,"utf8");if(!s.trim())u("empty transcript "+x);for(const l of s.split("\n")){if(!l)continue;const e=JSON.parse(l),c=e.message?.content;if(!Array.isArray(c))continue;for(const b of c){const f=b.input?.file_path;if(b.type!=="tool_use"||b.name==="Read"||typeof f!=="string")continue;const r=own(f);if(r===null||!/^(src\/|assets\/[^/]+\.js$)/.test(r))continue;n++;if(!e.isSidechain)console.log(f)}}}if(!n)u("no path of the film scene code (src/, assets/*.js) written in "+[t,...o].join(" ")+": unknown, not clean")' <session>.jsonl <project> [<more>.jsonl …]   # prints nothing
node -e 'let p=0,r=0;const s=new Set();for(const l of require("fs").readFileSync(process.argv[1],"utf8").split("\n")){if(!l)continue;const e=JSON.parse(l),u=e.message?.usage;if(e.isSidechain||!u||s.has(e.message.id))continue;s.add(e.message.id);r+=u.cache_read_input_tokens||0;p=Math.max(p,(u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0))}console.log({peak:p,cache_read:r})' <session>.jsonl
```

The second prints the main context's peak (one call's input) and total cache-read: compare with the previous run's (target: peak ≤ about 150k tokens, total cache-read per film down from before builders owned the fix rounds).

**Style frames are built from their reference** (a stylized run, `look-build.md` Step 5): every transcript that writes under `style-frames/src/` reads a `refs-board-*.jpg` before its first write (a resumed session counts on its own; a read that came back as an error, the board not landed yet, is no read), and the main session starts no `Agent` that builds style frames before a call that wrote the board has returned (a background command's result is only its start; a board it read itself, successfully, already existed). Give the main session first, then its subagent files. Nothing printed = clean, exit 1 = a flagged line, exit 2 = unknown, not clean (no style-frame write found, or a transcript that is missing, empty or has a partial or malformed line: a session still being written, rerun):

```bash
node -e 'const F=require("fs"),a=process.argv.slice(1),u=m=>{console.error(m+"; usage: <session>.jsonl [<more>.jsonl ...] (the main session first, then its subagent files)");process.exit(2)};if(!a.length)u("missing argument");const S="/style-frames/src/",B=/refs-board-[^/]*\.jpg$/,ag=n=>n==="Agent"||n==="Task";let w=0,bad=0;const T=a.map(x=>{let s;try{s=F.readFileSync(x,"utf8")}catch{u("unreadable transcript "+x)}if(!s.trim())u("empty transcript "+x);return s.split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{u("unreadable line in "+x+" (a partial or malformed JSONL line)")}})});a.forEach((x,k)=>{let seen=false,made=false;const mk=new Set(),rd=new Set();for(const e of T[k]){const c=e?.message?.content;if(!Array.isArray(c))continue;for(const b of c){if(b.type==="tool_result"){if(!b.is_error){if(mk.has(b.tool_use_id))made=true;if(rd.has(b.tool_use_id))seen=true}continue}if(b.type!=="tool_use")continue;const i=b.input||{},f=i.file_path,p=String(i.prompt||"");if(typeof f==="string"){if(b.name==="Read"){if(B.test(f))rd.add(b.id)}else if(f.includes(S)){w++;if(!seen){bad++;console.log(x+": "+f+" written before a refs-board read")}}}if(k)continue;if(ag(b.name)&&p.includes("style-frames/src")){if(!made&&!seen){bad++;console.log(x+": a style-frame builder started before a refs-board existed")}}else if(!i.run_in_background&&(b.name==="Bash"&&/refs-board-/.test(String(i.command||""))||ag(b.name)&&/refs-board-/.test(p)))mk.add(b.id)}}});if(!w)u("no write under style-frames/src/ in "+a.join(" ")+": unknown, not clean");process.exit(bad?1:0)' <session>.jsonl [<subagent>.jsonl …]   # prints nothing
```

## Golden scene by skill version

`examples/golden/` is one fixed scene built only from engine parts (an opened flask, three stations, caption, labels,
a dimension line). `node scripts/golden.mjs --version x.y.z` renders one 6 s / 30 fps clip, cuts the three style
frames from that clip (what the viewer gets), and writes `evals/golden/x.y.z/` (frames, `sheet.jpg`, `metrics.json`,
`diff.md`). It records render time, stillness, detail density in the macro, shadow texel size per station, and a
per-frame perceptual (SSIM) difference against the previous version (`--against` picks another).

Tolerances: render time +25 %, macro detail -15 %, shadow texel +25 %, stillness +5 points. Beyond one is a FLAG,
exit 3: the release waits until it is explained (`--explained "<why>"`, recorded in `metrics.json`). Render time only
compares on the same machine; across hosts it is a WARN. A baseline of another size or fps is "not comparable" (a WARN that blocks); one of another scene `CONFIG.revision` is "not comparable" too, a WARN that does not block: the run becomes the new baseline. An
unreadable baseline or a failed render is a WARN: rerun, never "none".

A changed `examples/golden/scene.js` bumps `CONFIG.revision` (written to `metrics.json`): it moves every baseline, so the run against an older revision is "not comparable" and no metric is judged; say so in the release notes.

## Clarity quiz by skill version

Append a row per run (`quiz_score` / `quiz_questions` from `score_run.mjs`, and the beats of the wrong answers).

| Skill version | Brief # | quiz_score / quiz_questions | Wrong beats |
|---|---|---|---|
