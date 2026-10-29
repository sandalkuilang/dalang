// One typeface for every film, so type never reads as mixed: Kohinoor Bangla when the machine has it, else Helvetica.
// Only the weight changes, by role: title Bold, heading Semibold, sub-heading Medium, body Regular. No module, template
// or film names another family.
//   import { FAMILY, WEIGHT, font, FACES } from "./font.js";   ctx.font = font("heading", 48);   // "600 48px ..."
export const FAMILY = '"Kohinoor Bangla", Helvetica, Arial, sans-serif';
export const WEIGHT = { title: 700, heading: 600, sub: 500, body: 400 };
export const font = (role, px) => `${WEIGHT[role]} ${px}px ${FAMILY}`;

// The host's @font-face rules (scaffold.mjs writes them): HyperFrames fails a family it does not bundle without one.
// local() matches the installed file; when the font is absent the rule does nothing and the stack falls to Helvetica.
const FACES_BY_WEIGHT = [[WEIGHT.body, "Kohinoor Bangla", "KohinoorBangla-Regular"], [WEIGHT.sub, "Kohinoor Bangla Medium", "KohinoorBangla-Medium"],
  [WEIGHT.heading, "Kohinoor Bangla Semibold", "KohinoorBangla-Semibold"], [WEIGHT.title, "Kohinoor Bangla Bold", "KohinoorBangla-Bold"]];
export const FACES = FACES_BY_WEIGHT.map(([w, full, ps]) => `@font-face{font-family:"Kohinoor Bangla";font-weight:${w};src:local("${full}"),local("${ps}")}`).join("\n");
