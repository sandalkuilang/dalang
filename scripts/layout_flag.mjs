// assets/layout_on.js, the switch of engine/three/type.js layoutFrame()'s posts, read and written in this one place
// (strips.mjs turns it on for its capture, express.mjs final switches off one a killed capture left on).
// The engine's copy carries the `// layout_on: receiver url` line: during a capture it holds the URL of that capture's own
// receiver, a port of its own, so two captures on one machine never share a receiver. An older copy in a film (no such
// line) gets `true`, and its page posts to the old fixed port, LEGACY_PORT.
export const LEGACY_PORT = 47614;
const MARK = /^\/\/ layout_on: receiver url$/m, ON = /export default (?:true|"[^"\n]*");/;
export const ownsPort = (text) => MARK.test(text);
export const isOn = (text) => ON.test(text);
export const flagOn = (text, url) => text.replace(/export default false;/, ownsPort(text) ? `export default ${JSON.stringify(url)};` : 'export default true;');
export const flagOff = (text) => text.replace(ON, 'export default false;');
