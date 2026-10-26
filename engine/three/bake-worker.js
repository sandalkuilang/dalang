// A worker (Web Worker in a page, worker_threads in Node) that bakes one declared island: it gets the job pool.js
// posts and answers with the baked data, its pose buffers handed over rather than copied.
import { RAPIER } from "./rapier.js";
import { islandBake } from "./bakecore.js";

const node = !!globalThis.process?.versions?.node, port = node ? (await import("node:worker_threads")).parentPort : self;
let ready;
const run = async (job) => {
  try {
    await (ready ??= RAPIER.init());
    const r = islandBake(RAPIER, job);
    port.postMessage({ r }, [...r.poses.flatMap((x) => [x.s.buffer, x.p.buffer]), ...r.pre.map((x) => x.buffer)]);
  } catch (e) { port.postMessage({ error: String(e?.message || e) }); }
};
if (node) port.on("message", run); else port.onmessage = (e) => run(e.data);
