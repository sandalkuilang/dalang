// Runs the island jobs in workers, at most one per spare core. A worker that cannot start (no Worker, a module worker
// refused, a crash) is not an error: that island is baked in this thread instead, with the same function and the same
// result, only slower.
import { islandBake } from "./bakecore.js";

const node = !!globalThis.process?.versions?.node;
const cores = async () => globalThis.navigator?.hardwareConcurrency || (node ? (await import("node:os")).availableParallelism?.() : 0) || 2;

async function spawn() {
  const url = new URL("./bake-worker.js", import.meta.url);
  if (node) return new (await import("node:worker_threads")).Worker(url);
  if (typeof Worker === "undefined") throw new Error("no Worker in this page");
  return new Worker(url, { type: "module" });
}

// One job in one worker; posted() is called once the job has left (the caller can then block this thread).
async function viaWorker(job, posted) {
  let w;
  try {
    w = await spawn();
    const reply = new Promise((resolve, reject) => {
      const got = (m) => (m.error ? reject(new Error(m.error)) : resolve(m.r));
      if (node) { w.on("message", got); w.on("error", reject); w.on("exit", (c) => reject(new Error(`worker exited (${c})`))); }
      else { w.onmessage = (e) => got(e.data); w.onerror = (e) => reject(new Error(e.message || "the worker did not load")); }
    });
    w.postMessage(job); posted();
    return await reply;
  } finally { w?.terminate(); }
}

// jobs: see islandBake. Resolves once every worker has its job, with finish(): a promise of the results in job order.
// workers === false bakes in this thread, one island after another, when finish() is called.
export async function startPool(RAPIER, jobs, workers = true) {
  if (workers === false || !jobs.length) return async () => jobs.map((j) => islandBake(RAPIER, j));
  let warned = false;
  const out = new Array(jobs.length), todo = jobs.map((job, i) => ({ job, i }));
  const lane = async (ping) => { // one worker at a time takes the next island
    for (let first = true; todo.length; first = false) {
      const { job, i } = todo.shift(), posted = first ? ping : () => {};
      try { out[i] = await viaWorker(job, posted); } catch (e) {
        if (!warned) { warned = true; console.warn(`[physics] island workers unavailable (${e.message}): baking in this thread`); }
        posted(); out[i] = islandBake(RAPIER, job);
      }
    }
    ping();
  };
  const lanes = Math.max(1, Math.min(jobs.length, (await cores()) - 1)), ready = [], running = [];
  for (let k = 0; k < lanes; k++) { let ping; ready.push(new Promise((r) => (ping = r))); running.push(lane(ping)); }
  running.forEach((p) => p.catch(() => {})); // a failed island is thrown by finish(), not as an unhandled rejection before it
  await Promise.all(ready);
  return () => Promise.all(running).then(() => out);
}
