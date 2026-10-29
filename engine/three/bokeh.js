import { THREE, BokehPass, Pass } from "./three-vendor.js";

// detailFocus(scene, camera, { blur = 0, range }) -> { pass, focusOn(point), set({ blur, range }), blur }: three.js's
// BokehPass (the WebGL depth of field, Martins Upitis' shader) as a pass of the pmndrs composer, for ONE beat that
// shows a detail (a rotor, a fastener, a section face). Put `pass` after the AO and before the last EffectPass(SMAA).
// Per frame, a pure function of t: focusOn(the part's world centre); set({ blur }) from the beat's ease.
//  - blur: the largest blur, a fraction of the frame width (0.005 soft ... 0.015 hard). 0 turns the pass OFF (skipped).
//  - range: the depth in world units from the focus plane at which the blur reaches `blur` (the detail's own depth).
//    Default 0.25 x the frame height (iso, ortho camera) or 0.25 x the focus distance (perspective).
// BokehPass draws depth with scene.overrideMaterial, which ignores a material's clipping plane (a section would blur as
// if uncut), draws ink Lines and lets x-ray glass write depth. This one swaps each mesh to a depth material that keeps
// the clipping planes and the side, and hides Lines, Points, Sprites and meshes with opacity < 0.95 for that render only.
const hidden = (o) => o.isLine || o.isPoints || o.isSprite || (o.isMesh && [].concat(o.material).some((m) => m.transparent && m.opacity < 0.95));

export class DepthBokeh extends BokehPass {
  constructor(...a) {
    super(...a); this.depthMats = new WeakMap();
    // alpha stays the film's own (a clear background stays clear, the silhouette stays crisp): taps are weighted by their
    // alpha, so the blur only mixes the colours of what is drawn, and a pixel keeps the alpha it had
    this.materialBokeh.fragmentShader = this.materialBokeh.fragmentShader.replaceAll("texture2D( tColor,", "tapColor(").replace("gl_FragColor.a = 1.0;", "")
      .replace("gl_FragColor = col / 41.0;", "vec4 c0 = texture2D(tColor, vUv); gl_FragColor = c0.a > 0.0 ? vec4(col.rgb / max(col.a, 1e-4), c0.a) : c0;")
      .replace("#include <packing>", "#include <packing>\nvec4 tapColor( vec2 uv ) { vec4 c = texture2D(tColor, uv); return vec4( c.rgb * c.a, c.a ); }");
  }
  depthOf(m) {
    let d = this.depthMats.get(m);
    if (!d) this.depthMats.set(m, d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, blending: THREE.NoBlending }));
    d.side = m.side; d.clippingPlanes = m.clippingPlanes; d.clipIntersection = m.clipIntersection;
    return d;
  }
  render(renderer, writeBuffer, readBuffer) {
    const { scene, camera, uniforms, materialBokeh } = this, undo = [], bg = scene.background, ov = scene.overrideMaterial, auto = renderer.autoClear, alpha = renderer.getClearAlpha();
    renderer.getClearColor(this._oldClearColor);
    try {
      scene.traverse((o) => {
        if (!o.visible) return;
        if (hidden(o)) { undo.push([o, "visible", true]); o.visible = false; }
        else if (o.isMesh) { undo.push([o, "material", o.material]); o.material = Array.isArray(o.material) ? o.material.map((m) => this.depthOf(m)) : this.depthOf(o.material); }
      });
      scene.background = null; scene.overrideMaterial = null; renderer.autoClear = false;
      renderer.setClearColor(0xffffff); renderer.setClearAlpha(1);
      renderer.setRenderTarget(this._renderTargetDepth); renderer.clear();
      renderer.render(scene, camera);
    } finally {
      for (const [o, k, v] of undo) o[k] = v;
      scene.background = bg; scene.overrideMaterial = ov; renderer.autoClear = auto;
      renderer.setClearColor(this._oldClearColor); renderer.setClearAlpha(alpha);
    }
    const persp = camera.isPerspectiveCamera ? 1 : 0;
    if (materialBokeh.defines.PERSPECTIVE_CAMERA !== persp) { materialBokeh.defines.PERSPECTIVE_CAMERA = persp; materialBokeh.needsUpdate = true; }
    uniforms.tColor.value = readBuffer.texture; uniforms.nearClip.value = camera.near; uniforms.farClip.value = camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (!this.renderToScreen) renderer.clear();
    this._fsQuad.render(renderer);
  }
}

class DetailPass extends Pass {
  constructor(bokeh, sync) { super("DetailFocusPass"); this.bokeh = bokeh; this.sync = sync; }
  render(renderer, input, output) { this.sync(); this.bokeh.renderToScreen = !output; this.bokeh.render(renderer, output, input); }
  setSize(w, h) { this.bokeh.setSize(w, h); }
  dispose() { this.bokeh.dispose(); super.dispose(); }
}

export function detailFocus(scene, camera, { blur = 0, range } = {}) {
  const bokeh = new DepthBokeh(scene, camera, { focus: 1, aperture: 0, maxblur: 0 }), u = bokeh.uniforms, dir = new THREE.Vector3(), eye = new THREE.Vector3(), s = { blur, range };
  u.aspect.value = u.aspect.value || 1;
  const sync = () => {
    const r = s.range ?? 0.25 * (camera.isPerspectiveCamera ? u.focus.value : (camera.top - camera.bottom) / camera.zoom), b = Math.max(s.blur, 0);
    u.maxblur.value = b; u.aperture.value = r > 0 ? b / r : 0; pass.enabled = b > 0;
  };
  const pass = new DetailPass(bokeh, sync);
  sync();
  return {
    pass,
    get blur() { return s.blur; },
    focusOn(point) { camera.updateMatrixWorld(); camera.getWorldDirection(dir); u.focus.value = point.clone().sub(camera.getWorldPosition(eye)).dot(dir); sync(); },
    set(o = {}) { if ("blur" in o) s.blur = o.blur; if ("range" in o) s.range = o.range; sync(); },
  };
}
