// The command that reruns the step that just ran (express.mjs measure's WARN): the runner the agent actually called,
// with the options it was given. studio.mjs final runs express.mjs final --quality high and then qc_all, so a Studio film
// is rerun through studio.mjs; a bare `express.mjs final .` would render at the default quality and skip qc_all.
//   rerunHint({ cmd, studio, quality, defaultQuality }) -> 'node studio.mjs final .' | 'node express.mjs final . --quality high' | …
export function rerunHint({ cmd, studio = false, quality, defaultQuality = 'looks' }) {
  if (studio) return `node studio.mjs ${cmd} .`;
  return `node express.mjs ${cmd} .${cmd === 'final' && quality && quality !== defaultQuality ? ` --quality ${quality}` : ''}`;
}
