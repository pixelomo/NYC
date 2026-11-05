// Instanced 3D vehicles. Meshes are boxes textured from the palette-indexed sprite atlas.

import { createProgram, makeBuffer } from '../core/gl.js';
import { MeshBuilder, MAT } from '../world/mesh.js';
import { RNG } from '../core/math.js';

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
`;

const VS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in uvec4 aRect;
layout(location=3) in vec4 aNrm;
layout(location=4) in uvec4 aInfo;
layout(location=5) in vec4 iA; // x, y, z, heading
layout(location=6) in vec4 iB; // palRow, alpha, snow, lift
uniform mat4 uViewProj;
uniform vec2 uBuf;
out vec2 vUV;
flat out uvec4 vRect;
flat out vec3 vNrm;
out vec3 vWorld;
flat out vec4 vB;
flat out uint vMat;
void main() {
  float c = cos(iA.w), s = sin(iA.w);
  vec3 lp = aPos;
  vec3 wp = vec3(iA.x + lp.x * c - lp.y * s, iA.y + lp.x * s + lp.y * c, iA.z + lp.z + iB.w);
  vNrm = vec3(aNrm.x * c - aNrm.y * s, aNrm.x * s + aNrm.y * c, aNrm.z);
  vUV = aUV; vRect = aRect; vWorld = wp; vB = iB; vMat = aInfo.y;
  vec4 cc = uViewProj * vec4(iA.xyz, 1.0);
  vec2 px = (cc.xy * 0.5 + 0.5) * uBuf;
  vec2 snap = (floor(px + 0.5) - px) / uBuf * 2.0;
  vec4 p = uViewProj * vec4(wp, 1.0);
  p.xy += snap;
  gl_Position = p;
}`;

const FS = HEAD + `
in vec2 vUV;
flat in uvec4 vRect;
flat in vec3 vNrm;
in vec3 vWorld;
flat in vec4 vB;
flat in uint vMat;
uniform sampler2D uSprites;
uniform sampler2D uPal;
uniform sampler2DShadow uShadow;
uniform sampler2D uLightMap;
uniform sampler2D uNoise;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform vec3 uSunDir, uSunCol, uAmb, uFace;
uniform vec2 uRot;
uniform vec4 uCloud;
uniform float uFlash, uEmis;
uniform vec3 uSkyTop, uSkyHor, uViewDir;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
float faceShade(vec3 n) {
  vec2 r = vec2(uRot.x * n.x - uRot.y * n.y, uRot.y * n.x + uRot.x * n.y);
  float wl = max(r.y, 0.0), wr = max(r.x, 0.0);
  float side = mix(uFace.y, uFace.z, wr / (wl + wr + 1e-4));
  return mix(side, uFace.x, clamp(n.z, 0.0, 1.0));
}
void main() {
  if (vB.y < 0.999 && bayer4(gl_FragCoord.xy) >= vB.y) discard;
  ivec2 tc = ivec2(vRect.xy) + ivec2(mod(floor(vUV), vec2(vRect.zw)));
  vec4 t = texelFetch(uSprites, tc, 0);
  if (t.a < 0.5) discard;
  int row = int(vB.x + 0.5);
  int slot = int(t.r * 255.0 + 0.5);
  vec4 pc = texelFetch(uPal, ivec2(slot, row), 0);
  if (pc.a < 0.1) discard;
  vec3 albedo = pc.rgb * (t.g * 255.0 / 128.0);
  vec3 n = normalize(vNrm);
  if (pc.a < 0.75) {
    oColor = vec4(albedo * 1.15, 1.0);
    oGlow = vec4(albedo, 1.0);
    return;
  }
  // snow on roofs of parked cars
  if (vB.z > 0.0 && n.z > 0.6) {
    float h = fract(sin(dot(floor(vWorld.xy * 16.0), vec2(12.9898, 78.233))) * 43758.5453);
    float nn = texture(uNoise, vWorld.xy * 0.35).r;
    if (nn * 0.85 + h * 0.15 < vB.z * 1.35) albedo = mix(vec3(0.86, 0.9, 0.97), vec3(0.98, 0.99, 1.0), smoothstep(0.3, 0.7, nn));
  }
  float ndl = dot(n, uSunDir);
  float sh = 1.0;
  if (uShadowOn > 0.5 && ndl > 0.0) {
    vec4 sp = uShadowMat * vec4(vWorld + n * 0.06 + uSunDir * 0.03, 1.0);
    vec3 s = sp.xyz * 0.5 + 0.5;
    if (s.x > 0.0 && s.y > 0.0 && s.x < 1.0 && s.y < 1.0 && s.z < 1.0) sh = step(bayer4(gl_FragCoord.xy), texture(uShadow, vec3(s.xy, s.z - 0.0008)));
  } else if (ndl <= 0.0) sh = 0.0;
  float cn = texture(uNoise, vWorld.xy * 0.006 + uCloud.xy).r * 0.65 + texture(uNoise, vWorld.xy * 0.017 + uCloud.xy * 1.7).r * 0.35;
  float cl = 1.0 - smoothstep(1.0 - uCloud.z - 0.08, 1.0 - uCloud.z + 0.08, cn) * uCloud.w;
  vec3 lm = vWorld.z < -0.5 ? vec3(0.0) : texture(uLightMap, vWorld.xy / 128.0).rgb;
  vec3 light = uAmb * faceShade(n) + uSunCol * max(ndl, 0.0) * sh * cl + lm * (0.6 + 0.4 * max(n.z, 0.0)) + vec3(uFlash);
  if (vWorld.z < -0.5) light = light * 0.5 + vec3(0.16, 0.15, 0.13);
  vec3 col = albedo * light;
  // glossy paint / glass reflection
  if (slot == 3) {
    vec3 r = reflect(-uViewDir, n);
    vec3 sky = mix(uSkyHor, uSkyTop, clamp(r.z * 1.4, 0.0, 1.0));
    col = mix(col, sky * 0.8, 0.45) + lm * 0.3;
  } else if (n.z > 0.6) {
    col += uSunCol * pow(max(dot(reflect(-uViewDir, n), uSunDir), 0.0), 24.0) * 0.35 * sh;
  }
  oColor = vec4(col, 1.0);
  oGlow = vec4(0.0, 0.0, 0.0, 1.0);
}`;

const SHADOW_VS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=5) in vec4 iA;
layout(location=6) in vec4 iB;
uniform mat4 uShadowVP;
void main() {
  float c = cos(iA.w), s = sin(iA.w);
  vec3 wp = vec3(iA.x + aPos.x * c - aPos.y * s, iA.y + aPos.x * s + aPos.y * c, iA.z + aPos.z + iB.w);
  gl_Position = uShadowVP * vec4(wp, 1.0);
}`;
const SHADOW_FS = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(1.0); }`;

// Car palette slots
export const CS = { BODY: 1, TRIM: 2, GLASS: 3, TIRE: 4, HEAD: 5, TAIL: 6, CHROME: 7, SIGN: 8, ACCENT: 9, SIREN_R: 10, SIREN_B: 11, INTERIOR: 12, WHITE: 13, BLACK: 14, PLATE: 15, LED: 16 };

const BODY_COLORS = [0xc8302c, 0x2a5fb8, 0xf2f2ee, 0x1e1e22, 0x8d9097, 0x2f6a3a, 0x7a1f1f, 0xd8d0c0, 0x3a4a6a, 0xe08a30, 0x5a3a6a, 0xb8bcc2, 0x1f3a5f];

export class CarLayer {
  constructor(gl, city) {
    this.gl = gl;
    this.city = city;
    this.atlas = city.atlas;
    this.pal = city.pal;
    this.prog = createProgram(gl, VS, FS, 'cars');
    this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS, 'carShadow');
    this.rng = new RNG(88);
    this.types = {};
    this.buildMeshes();
  }

  // paint a palette-indexed region of the sprite atlas
  reg(w, h, paint) {
    const f = this.atlas.add(null, w, h, paint, 0, 0);
    return { x: f.x, y: f.y, w, h, layer: 0 };
  }

  buildMeshes() {
    const A = this;
    const solid = (slot, shade = 128) => A.reg(2, 2, (sp) => sp.rect(0, 0, 2, 2, slot, shade));
    this.solid = {
      body: solid(CS.BODY), bodyTop: solid(CS.BODY, 140), trim: solid(CS.TRIM), glass: solid(CS.GLASS), tire: solid(CS.TIRE),
      chrome: solid(CS.CHROME), sign: solid(CS.SIGN), accent: solid(CS.ACCENT), red: solid(CS.SIREN_R), blue: solid(CS.SIREN_B),
      white: solid(CS.WHITE), black: solid(CS.BLACK), led: solid(CS.LED),
    };
    const T = 16;
    // generic side of a lower body with wheels at given texel positions
    const bodySide = (len, h, wheels, opts = {}) => A.reg(len, h, (sp) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < len; x++) sp.set(x, y, CS.BODY, y === 0 ? 150 : y >= h - 3 ? 108 : 128);
      if (opts.stripe != null) for (let x = 0; x < len; x++) sp.set(x, opts.stripe, CS.ACCENT, 128);
      if (opts.checker) for (let x = 0; x < len; x += 2) { sp.set(x, opts.checker, CS.BLACK, 128); sp.set(x + 1, opts.checker + 1, CS.BLACK, 128); }
      for (const wx of wheels) {
        for (let x = wx - 3; x <= wx + 3; x++) sp.set(x, h - 3, CS.BLACK, 100);
        for (let y = h - 3; y < h; y++) for (let x = wx - 2; x <= wx + 2; x++) sp.set(x, y, CS.TIRE, 110);
        sp.set(wx, h - 2, CS.CHROME, 128);
      }
      if (opts.door) for (const dx of opts.door) for (let y = 1; y < h - 3; y++) sp.set(dx, y, CS.BODY, 96);
      for (let x = 0; x < len; x++) sp.set(x, h - 1, CS.TRIM, 80);
    });
    const cabinSide = (len, h, opts = {}) => A.reg(len, h, (sp) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < len; x++) sp.set(x, y, CS.BODY, 135);
      const gx0 = 2, gx1 = len - 2;
      for (let y = 1; y < h; y++) for (let x = gx0 + (y < 2 ? 1 : 0); x < gx1 - (y < 2 ? 1 : 0); x++) sp.set(x, y, CS.GLASS, y < 2 ? 140 : 118);
      for (const px of opts.pillars || [Math.floor(len / 2)]) for (let y = 1; y < h; y++) sp.set(px, y, CS.BODY, 120);
    });
    const front = (w, h, opts = {}) => A.reg(w, h, (sp) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sp.set(x, y, CS.BODY, y === 0 ? 150 : 125);
      for (let x = 3; x < w - 3; x++) for (let y = 2; y < h - 3; y++) sp.set(x, y, CS.BLACK, x % 2 ? 110 : 90);
      for (const hx of [1, w - 3]) { sp.set(hx, 2, CS.HEAD, 128); sp.set(hx + 1, 2, CS.HEAD, 128); sp.set(hx, 3, CS.HEAD, 110); sp.set(hx + 1, 3, CS.HEAD, 110); }
      for (let x = 0; x < w; x++) sp.set(x, h - 2, CS.CHROME, 120);
      for (let x = 0; x < w; x++) sp.set(x, h - 1, CS.TRIM, 80);
      if (opts.plate) for (let x = (w >> 1) - 2; x < (w >> 1) + 2; x++) sp.set(x, h - 3, CS.PLATE, 128);
    });
    const back = (w, h) => A.reg(w, h, (sp) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sp.set(x, y, CS.BODY, y === 0 ? 150 : 118);
      for (const tx of [0, w - 3]) for (let x = tx; x < tx + 3; x++) { sp.set(x, 2, CS.TAIL, 128); sp.set(x, 3, CS.TAIL, 110); }
      for (let x = (w >> 1) - 2; x < (w >> 1) + 2; x++) sp.set(x, h - 3, CS.PLATE, 128);
      for (let x = 0; x < w; x++) sp.set(x, h - 2, CS.CHROME, 110);
      for (let x = 0; x < w; x++) sp.set(x, h - 1, CS.TRIM, 80);
    });
    const glassFace = (w, h) => A.reg(w, h, (sp) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sp.set(x, y, CS.BODY, 135);
      for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) sp.set(x, y, CS.GLASS, y === 1 ? 145 : 120);
    });
    const top = (w, h, opts = {}) => A.reg(w, h, (sp) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sp.set(x, y, CS.BODY, 140 + (y === 1 || y === h - 2 ? -12 : 0));
      if (opts.lines) for (let x = 0; x < w; x += opts.lines) for (let y = 0; y < h; y++) sp.set(x, y, CS.BODY, 118);
    });

    const box = (mb, x0, y0, z0, x1, y1, z1, F, mat = 0) => {
      mb.box(x0, y0, z0, x1, y1, z1, F, { topMat: mat || MAT.SNOW, mat: 0 });
    };
    // F: faces mapped for a car pointing +x: front = px, back = nx, sides = py/ny
    const faces = (side, fr, bk, tp) => ({ px: fr, nx: bk, py: side, ny: side, pz: tp });

    // --- sedan-like
    const sedan = (o = {}) => {
      const mb = new MeshBuilder();
      const L = o.len ?? 2.25, W = o.wid ?? 0.875, bh = o.bodyH ?? 0.5, ch = o.cabH ?? 0.3125;
      const cl = o.cabLen ?? 1.25, cw = W - 0.125, coff = o.cabOff ?? -0.125;
      const Lt = Math.round(L * T), Wt = Math.round(W * T), bht = Math.round(bh * T);
      const side = bodySide(Lt, bht, [Math.round(Lt * 0.2), Math.round(Lt * 0.8)], { door: [Math.round(Lt * 0.42), Math.round(Lt * 0.62)], stripe: o.stripe, checker: o.checker });
      box(mb, -L / 2, -W / 2, 0, L / 2, W / 2, bh, faces(side, front(Wt, bht, { plate: true }), back(Wt, bht), top(Lt, Wt)));
      const clt = Math.round(cl * T), cwt = Math.round(cw * T), cht = Math.round(ch * T);
      box(mb, coff - cl / 2, -cw / 2, bh, coff + cl / 2, cw / 2, bh + ch, faces(cabinSide(clt, cht, { pillars: [Math.round(clt * 0.48)] }), glassFace(cwt, cht), glassFace(cwt, cht), top(clt, cwt)));
      if (o.taxiSign) box(mb, coff - 0.19, -0.19, bh + ch, coff + 0.19, 0.19, bh + ch + 0.15, faces(this.solid.sign, this.solid.sign, this.solid.sign, this.solid.sign));
      if (o.lightBar) {
        box(mb, coff - 0.12, -0.32, bh + ch, coff + 0.12, -0.02, bh + ch + 0.1, faces(this.solid.red, this.solid.red, this.solid.red, this.solid.red));
        box(mb, coff - 0.12, 0.02, bh + ch, coff + 0.12, 0.32, bh + ch + 0.1, faces(this.solid.blue, this.solid.blue, this.solid.blue, this.solid.blue));
      }
      return mb.finish();
    };
    const van = (o = {}) => {
      const mb = new MeshBuilder();
      const L = o.len ?? 2.75, W = o.wid ?? 1.0, H = o.h ?? 1.25;
      const Lt = Math.round(L * T), Wt = Math.round(W * T), Ht = Math.round(H * T);
      const side = A.reg(Lt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.BODY, y < 2 ? 145 : 125);
        for (let y = 2; y < 7; y++) for (let x = Lt - 10; x < Lt - 3; x++) sp.set(x, y, CS.GLASS, 125);
        if (o.stripe != null) for (let x = 0; x < Lt; x++) { sp.set(x, o.stripe, CS.ACCENT, 128); sp.set(x, o.stripe + 1, CS.ACCENT, 115); }
        if (o.text) for (let x = 3; x < Lt - 14; x += 2) sp.set(x, 6, CS.ACCENT, 128);
        if (o.window) for (let y = 3; y < 8; y++) for (let x = 6; x < 14; x++) sp.set(x, y, CS.INTERIOR, 128);
        for (const wx of [Math.round(Lt * 0.18), Math.round(Lt * 0.82)]) for (let y = Ht - 3; y < Ht; y++) for (let x = wx - 2; x <= wx + 2; x++) sp.set(x, y, CS.TIRE, 110);
        for (let x = 0; x < Lt; x++) sp.set(x, Ht - 1, CS.TRIM, 80);
      });
      const fr = A.reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.BODY, 125);
        for (let y = 2; y < 8; y++) for (let x = 1; x < Wt - 1; x++) sp.set(x, y, CS.GLASS, y < 3 ? 140 : 118);
        for (const hx of [1, Wt - 3]) { sp.set(hx, Ht - 6, CS.HEAD, 128); sp.set(hx + 1, Ht - 6, CS.HEAD, 128); }
        for (let x = 0; x < Wt; x++) sp.set(x, Ht - 2, CS.CHROME, 110);
      });
      const bk = A.reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.BODY, 118);
        sp.set(Wt >> 1, 2, CS.BODY, 90);
        for (let y = 1; y < Ht - 2; y++) sp.set(Wt >> 1, y, CS.BODY, 96);
        for (const tx of [0, Wt - 2]) for (let y = Ht - 8; y < Ht - 5; y++) { sp.set(tx, y, CS.TAIL, 128); sp.set(tx + 1, y, CS.TAIL, 128); }
      });
      box(mb, -L / 2, -W / 2, 0, L / 2, W / 2, H, faces(side, fr, bk, top(Lt, Wt, { lines: 6 })));
      if (o.cone) {
        // ice cream cone on the roof
        box(mb, -0.2, -0.15, H, 0.1, 0.15, H + 0.3, faces(this.solid.accent, this.solid.accent, this.solid.accent, this.solid.white));
        box(mb, -0.22, -0.18, H + 0.3, 0.12, 0.18, H + 0.55, faces(this.solid.white, this.solid.white, this.solid.white, this.solid.white));
      }
      if (o.beacon) box(mb, 0.4, -0.12, H, 0.6, 0.12, H + 0.15, faces(this.solid.sign, this.solid.sign, this.solid.sign, this.solid.sign));
      return mb.finish();
    };
    const bus = () => {
      const mb = new MeshBuilder();
      const L = 6.5, W = 1.25, H = 1.6;
      const Lt = Math.round(L * T), Wt = Math.round(W * T), Ht = Math.round(H * T);
      const side = A.reg(Lt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.WHITE, y < 2 ? 145 : 125);
        for (let y = 4; y < 13; y++) for (let x = 4; x < Lt - 6; x++) sp.set(x, y, x % 11 === 0 ? CS.BLACK : CS.INTERIOR, y < 6 ? 135 : 118);
        for (let x = 0; x < Lt; x++) { sp.set(x, 15, CS.ACCENT, 128); sp.set(x, 16, CS.ACCENT, 115); sp.set(x, 17, CS.ACCENT, 128); }
        for (let y = 4; y < Ht - 3; y++) for (let x = Lt - 13; x < Lt - 9; x++) sp.set(x, y, CS.GLASS, 120);
        for (const wx of [14, Lt - 22]) for (let y = Ht - 4; y < Ht; y++) for (let x = wx - 3; x <= wx + 3; x++) sp.set(x, y, CS.TIRE, 110);
        for (let x = 0; x < Lt; x++) sp.set(x, Ht - 1, CS.TRIM, 80);
      });
      const fr = A.reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.WHITE, 125);
        for (let x = 1; x < Wt - 1; x++) { sp.set(x, 1, CS.BLACK, 110); sp.set(x, 2, CS.LED, 128); }
        for (let y = 4; y < 14; y++) for (let x = 1; x < Wt - 1; x++) sp.set(x, y, CS.GLASS, y < 6 ? 140 : 118);
        for (const hx of [1, Wt - 3]) { sp.set(hx, Ht - 6, CS.HEAD, 128); sp.set(hx + 1, Ht - 6, CS.HEAD, 128); }
        for (let x = 0; x < Wt; x++) sp.set(x, 17, CS.ACCENT, 128);
      });
      const bk = A.reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.WHITE, 118);
        for (let y = 3; y < 9; y++) for (let x = 2; x < Wt - 2; x++) sp.set(x, y, CS.GLASS, 118);
        for (const tx of [0, Wt - 2]) for (let y = Ht - 9; y < Ht - 5; y++) { sp.set(tx, y, CS.TAIL, 128); sp.set(tx + 1, y, CS.TAIL, 128); }
      });
      const roof = A.reg(Lt, Wt, (sp) => { for (let y = 0; y < Wt; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.WHITE, 140); });
      box(mb, -L / 2, -W / 2, 0, L / 2, W / 2, H, faces(side, fr, bk, roof));
      box(mb, -1.5, -0.4, H, 0.2, 0.4, H + 0.2, faces(this.solid.chrome, this.solid.chrome, this.solid.chrome, this.solid.chrome));
      return mb.finish();
    };
    const truck = (o = {}) => {
      const mb = new MeshBuilder();
      const L = o.len ?? 4.0, W = o.wid ?? 1.125;
      const cabL = 1.1, cabH = 1.25, boxH = 1.75;
      const Wt = Math.round(W * T);
      const cabT = Math.round(cabL * T), cabHt = Math.round(cabH * T);
      const cabSide = A.reg(cabT, cabHt, (sp) => {
        for (let y = 0; y < cabHt; y++) for (let x = 0; x < cabT; x++) sp.set(x, y, CS.BODY, y < 2 ? 145 : 125);
        for (let y = 2; y < 8; y++) for (let x = 4; x < cabT - 2; x++) sp.set(x, y, CS.GLASS, 120);
        for (let y = cabHt - 3; y < cabHt; y++) for (let x = 4; x < 9; x++) sp.set(x, y, CS.TIRE, 110);
      });
      const cabFr = A.reg(Wt, cabHt, (sp) => {
        for (let y = 0; y < cabHt; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.BODY, 125);
        for (let y = 2; y < 8; y++) for (let x = 1; x < Wt - 1; x++) sp.set(x, y, CS.GLASS, 120);
        for (let y = 10; y < cabHt - 3; y++) for (let x = 3; x < Wt - 3; x++) sp.set(x, y, CS.BLACK, x % 2 ? 110 : 90);
        for (const hx of [1, Wt - 3]) { sp.set(hx, 11, CS.HEAD, 128); sp.set(hx + 1, 11, CS.HEAD, 128); }
      });
      const bodyL = L - cabL - 0.1;
      const bLt = Math.round(bodyL * T), bHt = Math.round((boxH - 0.2) * T);
      const boxSide = A.reg(bLt, bHt, (sp) => {
        for (let y = 0; y < bHt; y++) for (let x = 0; x < bLt; x++) sp.set(x, y, o.cargo ?? CS.WHITE, y < 1 ? 145 : 122);
        if (o.ladder) for (let x = 0; x < bLt; x++) { sp.set(x, 3, CS.CHROME, 128); if (x % 3 === 0) sp.set(x, 4, CS.CHROME, 110); sp.set(x, 5, CS.CHROME, 128); }
        if (o.stripe != null) for (let x = 0; x < bLt; x++) { sp.set(x, o.stripe, CS.ACCENT, 128); sp.set(x, o.stripe + 1, CS.ACCENT, 110); }
        if (o.hopper) for (let y = 4; y < bHt - 2; y++) for (let x = 0; x < 6; x++) sp.set(x, y, CS.BLACK, 100);
        for (const wx of [8, bLt - 8]) for (let y = bHt - 4; y < bHt; y++) for (let x = wx - 2; x <= wx + 2; x++) sp.set(x, y, CS.TIRE, 110);
        for (let x = 0; x < bLt; x++) sp.set(x, bHt - 1, CS.TRIM, 80);
      });
      const boxBack = A.reg(Wt, bHt, (sp) => {
        for (let y = 0; y < bHt; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, o.cargo ?? CS.WHITE, 115);
        for (let y = 1; y < bHt - 3; y++) sp.set(Wt >> 1, y, CS.TRIM, 90);
        for (const tx of [0, Wt - 2]) for (let y = bHt - 6; y < bHt - 3; y++) { sp.set(tx, y, CS.TAIL, 128); sp.set(tx + 1, y, CS.TAIL, 128); }
      });
      const boxTop = A.reg(bLt, Wt, (sp) => { for (let y = 0; y < Wt; y++) for (let x = 0; x < bLt; x++) sp.set(x, y, o.cargo ?? CS.WHITE, 138); });
      box(mb, L / 2 - cabL, -W / 2, 0, L / 2, W / 2, cabH, faces(cabSide, cabFr, this.solid.body, top(cabT, Wt)));
      box(mb, -L / 2, -W / 2, 0.2, L / 2 - cabL - 0.1, W / 2, boxH, faces(boxSide, this.solid.trim, boxBack, boxTop));
      box(mb, -L / 2, -W / 2 + 0.1, 0, L / 2 - cabL, W / 2 - 0.1, 0.2, faces(this.solid.black, this.solid.black, this.solid.black, this.solid.black));
      if (o.lightBar) {
        box(mb, L / 2 - 0.7, -0.4, cabH, L / 2 - 0.5, -0.02, cabH + 0.12, faces(this.solid.red, this.solid.red, this.solid.red, this.solid.red));
        box(mb, L / 2 - 0.7, 0.02, cabH, L / 2 - 0.5, 0.4, cabH + 0.12, faces(this.solid.red, this.solid.red, this.solid.red, this.solid.red));
      }
      if (o.beacon) box(mb, L / 2 - 0.65, -0.12, cabH, L / 2 - 0.45, 0.12, cabH + 0.16, faces(this.solid.sign, this.solid.sign, this.solid.sign, this.solid.sign));
      if (o.plow) box(mb, L / 2 + 0.05, -0.75, 0.0, L / 2 + 0.3, 0.75, 0.55, faces(this.solid.sign, this.solid.sign, this.solid.sign, this.solid.sign));
      if (o.ladderTop) box(mb, -L / 2 + 0.2, -0.25, boxH, L / 2 - cabL, 0.25, boxH + 0.12, faces(this.solid.chrome, this.solid.chrome, this.solid.chrome, this.solid.chrome));
      return mb.finish();
    };

    const subway = () => {
      const mb = new MeshBuilder();
      const L = 3.25, W = 1.125, H = 1.5;
      const Lt = Math.round(L * T), Wt = Math.round(W * T), Ht = Math.round(H * T);
      const side = A.reg(Lt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.BODY, (x % 6 === 0 ? 118 : 132) - (y > Ht - 5 ? 20 : 0));
        for (let y = 4; y < 11; y++) for (let x = 3; x < Lt - 3; x++) {
          const door = (x > 9 && x < 15) || (x > Lt - 16 && x < Lt - 10);
          sp.set(x, y, door ? CS.BODY : (x % 8 === 0 ? CS.BLACK : CS.INTERIOR), door ? 110 : y < 6 ? 140 : 120);
        }
        for (const dx of [9, 15, Lt - 16, Lt - 10]) for (let y = 3; y < Ht - 5; y++) sp.set(dx, y, CS.BLACK, 100);
        for (let x = 0; x < Lt; x++) { sp.set(x, 13, CS.ACCENT, 128); sp.set(x, 14, CS.ACCENT, 110); }
        for (const wx of [8, Lt - 9]) for (let y = Ht - 4; y < Ht; y++) for (let x = wx - 4; x <= wx + 4; x++) sp.set(x, y, CS.TIRE, 100);
      });
      const end = A.reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.BODY, 120);
        for (let y = 4; y < 10; y++) for (let x = 2; x < Wt - 2; x++) sp.set(x, y, CS.GLASS, 125);
        for (let x = 5; x < Wt - 5; x++) sp.set(x, 2, CS.LED, 128);
        sp.set(2, Ht - 6, CS.HEAD, 128); sp.set(Wt - 3, Ht - 6, CS.HEAD, 128); sp.set(3, Ht - 6, CS.HEAD, 128); sp.set(Wt - 4, Ht - 6, CS.HEAD, 128);
      });
      const roof = A.reg(Lt, Wt, (sp) => { for (let y = 0; y < Wt; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.BODY, y === 0 || y === Wt - 1 ? 110 : 140); });
      box(mb, -L / 2, -W / 2, 0, L / 2, W / 2, H, faces(side, end, end, roof));
      return mb.finish();
    };
    const defs = {
      subway: subway(),
      sedan: sedan(),
      taxi: sedan({ taxiSign: true, checker: 3 }),
      suv: sedan({ len: 2.375, wid: 1.0, bodyH: 0.5625, cabH: 0.375, cabLen: 1.5, cabOff: -0.25 }),
      police: sedan({ len: 2.375, lightBar: true, stripe: 3 }),
      van: van({ text: true }),
      icecream: van({ len: 3.25, h: 1.375, stripe: 12, window: true, cone: true }),
      bus: bus(),
      truck: truck({ stripe: 4 }),
      fire: truck({ len: 5.0, cargo: CS.BODY, ladder: true, lightBar: true, ladderTop: true }),
      garbage: truck({ len: 4.25, hopper: true, stripe: 8 }),
      plow: truck({ len: 4.25, hopper: true, stripe: 8, beacon: true, plow: true }),
    };
    const gl = this.gl;
    for (const k in defs) {
      const m = defs[k];
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      makeBuffer(gl, m.pos); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      makeBuffer(gl, m.uv); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      makeBuffer(gl, m.rect); gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_SHORT, 0, 0);
      makeBuffer(gl, m.nrm); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.BYTE, true, 0, 0);
      makeBuffer(gl, m.info); gl.enableVertexAttribArray(4); gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, 0, 0);
      makeBuffer(gl, m.idx, gl.ELEMENT_ARRAY_BUFFER);
      const ibuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
      gl.bufferData(gl.ARRAY_BUFFER, 256 * 8 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(5, 1);
      gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(6, 1);
      gl.bindVertexArray(null);
      this.types[k] = { vao, count: m.indexCount, ibuf, data: new Float32Array(256 * 8), n: 0 };
    }
  }

  assignPalette(car) {
    const r = this.rng;
    let body = car.color != null && car.color !== 0 ? car.color : r.pick(BODY_COLORS);
    const P = { [CS.TRIM]: 0x2a2a2e, [CS.GLASS]: 0x3d5a78, [CS.TIRE]: 0x1e1e20, [CS.HEAD]: 0xe8e4d0, [CS.TAIL]: 0x8a1a1a, [CS.CHROME]: 0xb8bcc2,
      [CS.SIGN]: 0xf2e8c0, [CS.ACCENT]: 0x2a5fb8, [CS.SIREN_R]: 0xa82020, [CS.SIREN_B]: 0x2040a8, [CS.INTERIOR]: 0x5a6a7a, [CS.WHITE]: 0xf0f0ec,
      [CS.BLACK]: 0x1e1e22, [CS.PLATE]: 0xf2c230, [CS.LED]: 0x6a4a1a };
    switch (car.type) {
      case 'taxi': body = 0xf2c018; P[CS.SIGN] = 0xf8f0d0; break;
      case 'police': body = 0xf2f2ee; P[CS.ACCENT] = 0x1f4fa0; break;
      case 'bus': body = 0xf2f2ee; P[CS.ACCENT] = 0x1f5fb0; break;
      case 'fire': body = 0xc8201c; P[CS.WHITE] = 0xc8201c; break;
      case 'icecream': body = 0xf8f6f0; P[CS.ACCENT] = 0xf07ab0; P[CS.INTERIOR] = 0xffe2a0; P[CS.WHITE] = 0xfff0d8; break;
      case 'garbage': case 'plow': body = 0xf2f2ee; P[CS.ACCENT] = 0x2f8a46; P[CS.SIGN] = 0xf08a1a; break;
      case 'truck': P[CS.ACCENT] = r.pick([0xc8302c, 0x2a5fb8, 0x2f8a46, 0xe08a30]); break;
      case 'subway': body = 0xc4c8ce; P[CS.ACCENT] = 0x2a6ad8; P[CS.INTERIOR] = 0xf8f0d0; P[CS.LED] = 0xff9a30; break;
    }
    P[CS.BODY] = body;
    car.palRow = this.pal.alloc(P);
    car.palBase = P;
    car.palState = '';
  }
  releasePalette(car) {
    if (car.palRow >= 0) this.pal.release(car.palRow);
    car.palRow = -1;
  }
  updatePalette(car, time) {
    const lights = car.lights;
    const siren = car.siren && Math.floor(time * 6) % 2;
    const beacon = (car.special === 'plow' || car.special === 'garbage') && Math.floor(time * 4) % 2;
    const busLit = car.type === 'bus' || car.type === 'icecream' || car.type === 'subway';
    const key = `${lights ? 1 : 0}${car.brake ? 1 : 0}${car.siren ? (siren ? 2 : 1) : 0}${beacon ? 1 : 0}${car.type === 'taxi' ? (car.taxiFree ? 1 : 0) : 0}`;
    if (key === car.palState) return;
    car.palState = key;
    const P = car.palBase, row = car.palRow, pal = this.pal;
    pal.set(row, CS.HEAD, lights ? 0xfff6d8 : P[CS.HEAD], lights ? 128 : 255);
    pal.set(row, CS.TAIL, car.brake ? 0xff3030 : lights ? 0xd02020 : P[CS.TAIL], car.brake || lights ? 128 : 255);
    if (car.siren) {
      pal.set(row, CS.SIREN_R, siren ? 0xff3030 : 0x701010, siren ? 128 : 255);
      pal.set(row, CS.SIREN_B, !siren ? (car.type === 'fire' ? 0xff3030 : 0x3070ff) : 0x102060, !siren ? 128 : 255);
    }
    if (car.special === 'plow' || car.special === 'garbage') pal.set(row, CS.SIGN, beacon ? 0xffa020 : 0x8a5010, beacon ? 128 : 255);
    if (car.type === 'taxi') pal.set(row, CS.SIGN, lights ? 0xfff2b0 : P[CS.SIGN], lights ? 128 : 255);
    if (busLit) pal.set(row, CS.INTERIOR, lights ? 0xfff0c0 : P[CS.INTERIOR], lights ? 128 : 255);
    if (car.type === 'bus' || car.type === 'subway') pal.set(row, CS.LED, 0xffa020, 128);
    if (car.type === 'subway') pal.set(row, CS.INTERIOR, 0xfff2cc, 128);
  }

  prepare(cars, time, env, view) {
    for (const k in this.types) this.types[k].n = 0;
    const snow = env.snowCover;
    for (const c of cars) {
      if (!view.visible(c.x, c.y, (c.z || 0) + 1, 6)) continue;
      const t = this.types[c.type];
      if (!t || t.n >= 256) continue;
      this.updatePalette(c, time);
      const o = t.n * 8, d = t.data;
      d[o] = c.x; d[o + 1] = c.y; d[o + 2] = c.z || 0; d[o + 3] = c.h;
      d[o + 4] = c.palRow; d[o + 5] = c.fadeOut != null ? Math.max(0, c.fadeOut) : 1 - (c.fadeIn || 0);
      d[o + 6] = c.state === 'parked' ? snow : snow * 0.25; d[o + 7] = 0.02;
      t.n++;
    }
    const gl = this.gl;
    for (const k in this.types) {
      const t = this.types[k];
      if (!t.n) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, t.ibuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, t.data.subarray(0, t.n * 8));
    }
  }
  lights(LL, cars, env) {
    if (env.darkness < 0.4) return;
    const k = Math.min(1, (env.darkness - 0.4) * 3);
    for (const c of cars) {
      if (c.state === 'parked') continue;
      const dx = Math.cos(c.h), dy = Math.sin(c.h);
      LL.addDir(c.x + dx * (c.len * 0.5 + 1.8), c.y + dy * (c.len * 0.5 + 1.8), 2.4, 0.95, dx, dy, [1, 0.95, 0.8], 0.55 * k);
      LL.add(c.x - dx * (c.len * 0.5 + 0.3), c.y - dy * (c.len * 0.5 + 0.3), c.brake ? 1.0 : 0.7, [1, 0.15, 0.1], (c.brake ? 0.6 : 0.25) * k);
      if (c.siren) {
        const ph = Math.floor(performance.now() / 160) % 2;
        LL.add(c.x, c.y, 3.5, ph ? [1, 0.1, 0.1] : c.type === 'fire' ? [1, 0.2, 0.1] : [0.1, 0.3, 1], 0.7);
      }
    }
  }
  shadow(ctx) {
    const gl = this.gl, p = this.shadowProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.uShadowVP, false, ctx.shadowMat);
    for (const k in this.types) {
      const t = this.types[k];
      if (!t.n) continue;
      gl.bindVertexArray(t.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, t.count, gl.UNSIGNED_INT, 0, t.n);
    }
  }
  draw(ctx) {
    const gl = this.gl, p = this.prog, u = p.u, r = ctx.renderer, e = ctx.env;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(u.uViewProj, false, ctx.viewProj);
    gl.uniform2f(u.uBuf, ctx.bw, ctx.bh);
    gl.uniformMatrix4fv(u.uShadowMat, false, ctx.shadowMat);
    gl.uniform1f(u.uShadowOn, ctx.shadowOn ? 1 : 0);
    gl.uniform3fv(u.uSunDir, e.sunDir);
    gl.uniform3fv(u.uSunCol, e.sunCol);
    gl.uniform3fv(u.uAmb, e.amb);
    gl.uniform3fv(u.uFace, e.face);
    gl.uniform2f(u.uRot, Math.cos(ctx.camera.angle), Math.sin(ctx.camera.angle));
    gl.uniform4fv(u.uCloud, e.cloud);
    gl.uniform1f(u.uFlash, e.flash);
    gl.uniform1f(u.uEmis, e.emis);
    gl.uniform3fv(u.uSkyTop, e.skyTop);
    gl.uniform3fv(u.uSkyHor, e.skyBottom);
    gl.uniform3fv(u.uViewDir, ctx.camera.viewDir());
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex); gl.uniform1i(u.uSprites, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.pal.tex); gl.uniform1i(u.uPal, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, r.shadowTex); gl.uniform1i(u.uShadow, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, r.lightTex); gl.uniform1i(u.uLightMap, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, r.noiseTex); gl.uniform1i(u.uNoise, 4);
    for (const k in this.types) {
      const t = this.types[k];
      if (!t.n) continue;
      gl.bindVertexArray(t.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, t.count, gl.UNSIGNED_INT, 0, t.n);
    }
  }
}
