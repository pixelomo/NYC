// Flat marks on the ground: blood pools and splatters, scorch marks left by explosions. Instanced
// quads lying on the ground plane (so they sit right in both camera views and under any rotation),
// textured from the palette-indexed sprite atlas and lit like the cars. A pool spreads by revealing
// its palette slots from the centre outward.

import { createProgram, makeBuffer } from '../core/gl.js';
import { LIGHT_EXT_X, LIGHT_EXT_Y } from '../world/layout.js';
import { RNG, clamp } from '../core/math.js';

const CAP = 400;
const STRIDE = 12;

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
`;
const VS = HEAD + `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iA; // x, y, z, angle
layout(location=2) in vec4 iB; // half size, palRow, alpha, grow
layout(location=3) in vec4 iR; // atlas rect
uniform mat4 uViewProj;
out vec2 vUV;
flat out vec4 vR;
flat out vec3 vB;
out vec3 vWorld;
void main() {
  float c = cos(iA.w), s = sin(iA.w);
  vec2 q = (aCorner * 2.0 - 1.0) * iB.x;
  vec3 wp = vec3(iA.x + q.x * c - q.y * s, iA.y + q.x * s + q.y * c, iA.z + 0.01);
  vUV = aCorner * iR.zw; vR = iR; vB = iB.yzw; vWorld = wp;
  gl_Position = uViewProj * vec4(wp, 1.0);
}`;
const FS = HEAD + `
in vec2 vUV;
flat in vec4 vR;
flat in vec3 vB;
in vec3 vWorld;
uniform sampler2D uSprites;
uniform sampler2D uPal;
uniform sampler2DShadow uShadow;
uniform sampler2D uLightMap;
uniform sampler2D uNoise;
uniform mat4 uShadowMat;
uniform vec2 uShadowK;
uniform vec2 uDither;
uniform float uShadowOn;
uniform vec3 uSunDir, uSunCol, uAmb, uFace;
uniform vec4 uCloud;
uniform float uFlash;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
void main() {
  ivec2 tc = ivec2(vR.xy) + ivec2(clamp(floor(vUV), vec2(0.0), vR.zw - 1.0));
  vec4 t = texelFetch(uSprites, tc, 0);
  if (t.a < 0.5) discard;
  int slot = int(t.r * 255.0 + 0.5);
  if (float(slot) > vB.z * 8.0 + 0.5) discard;
  if (vB.y < 0.999 && bayer4(gl_FragCoord.xy) >= vB.y) discard;
  vec4 pc = texelFetch(uPal, ivec2(slot, int(vB.x + 0.5)), 0);
  if (pc.a < 0.1) discard;
  vec3 albedo = pc.rgb * (t.g * 255.0 / 128.0);
  float sh = 1.0;
  float ndl = uSunDir.z;
  if (uShadowOn > 0.5 && ndl > 0.0) {
    vec4 sp = uShadowMat * vec4(vWorld + vec3(0.0, 0.0, uShadowK.x * 1.5) + uSunDir * uShadowK.x * 0.5, 1.0);
    vec3 s = sp.xyz * 0.5 + 0.5;
    if (s.x > 0.0 && s.y > 0.0 && s.x < 1.0 && s.y < 1.0 && s.z < 1.0) sh = step(bayer4(vec2(floor(gl_FragCoord.x) + uDither.x, uDither.y - floor(gl_FragCoord.y))), texture(uShadow, vec3(s.xy, s.z - uShadowK.x * 0.8 * uShadowK.y)));
  } else if (ndl <= 0.0) sh = 0.0;
  float cn = texture(uNoise, vWorld.xy * 0.006 + uCloud.xy).r * 0.65 + texture(uNoise, vWorld.xy * 0.017 + uCloud.xy * 1.7).r * 0.35;
  float cl = 1.0 - smoothstep(1.0 - uCloud.z - 0.08, 1.0 - uCloud.z + 0.08, cn) * uCloud.w;
  vec3 lm = texture(uLightMap, vWorld.xy / vec2(${LIGHT_EXT_X.toFixed(1)}, ${LIGHT_EXT_Y.toFixed(1)})).rgb;
  vec3 light = uAmb * uFace.x + uSunCol * max(ndl, 0.0) * sh * cl + lm + vec3(uFlash);
  oColor = vec4(albedo * light, 1.0);
  oGlow = vec4(0.0, 0.0, 0.0, 1.0);
}`;

export class DecalLayer {
  constructor(gl, city) {
    this.gl = gl;
    this.city = city;
    this.atlas = city.atlas;
    this.pal = city.pal;
    this.rng = new RNG(5150);
    this.list = [];
    this.data = new Float32Array(CAP * STRIDE);
    this.n = 0;
    this.prog = createProgram(gl, VS, FS, 'decals');
    this.paint();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    makeBuffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]));
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, CAP * STRIDE * 4, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 3; k++) {
      gl.enableVertexAttribArray(1 + k);
      gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, STRIDE * 4, k * 16);
      gl.vertexAttribDivisor(1 + k, 1);
    }
    gl.bindVertexArray(null);
    this.vao = vao;
  }
  // textures: slots 1..8 rise from the middle out, so a pool can spread by revealing them in turn
  paint() {
    const A = this.atlas;
    const blob = (name, D, lobes, rough, seed) => {
      const rr = new RNG(seed);
      const L = [];
      for (let k = 0; k < lobes; k++) { const a = rr.range(0, 6.28), d = rr.range(0.05, 0.25); L.push([0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, rr.range(0.12, 0.22)]); }
      L.push([0.5, 0.5, 0.3]);
      return A.add(name, D, D, (sp) => {
        for (let y = 0; y < D; y++)
          for (let x = 0; x < D; x++) {
            const u = (x + 0.5) / D, v = (y + 0.5) / D;
            let best = -1;
            for (const [cx, cy, R] of L) best = Math.max(best, 1 - Math.hypot(u - cx, v - cy) / R);
            const n = ((((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0) % 97) / 97;
            if (best + (n - 0.5) * rough <= 0) continue;
            const dc = Math.hypot(u - 0.5, v - 0.5) / 0.5;
            const slot = clamp(1 + Math.floor(dc * 7.2 + n * 0.8), 1, 8);
            sp.set(x, y, slot, best < 0.12 ? 92 : n < 0.12 ? 150 : 118 + Math.round(best * 18));
          }
      }, D >> 1, D >> 1);
    };
    this.tex = {
      pool: [blob('decalPool1', 44, 5, 0.06, 11), blob('decalPool2', 44, 6, 0.07, 23)],
      splat: [blob('decalSplat1', 10, 4, 0.5, 31), blob('decalSplat2', 12, 5, 0.6, 37), blob('decalSplat3', 8, 3, 0.5, 41)],
      scorch: [blob('decalScorch1', 128, 9, 0.45, 53), blob('decalScorch2', 128, 8, 0.5, 59)],
    };
    const blood = {}, scorch = {};
    for (let k = 1; k <= 8; k++) {
      blood[k] = k < 3 ? 0x7c0c0e : k < 6 ? 0x6a0a0c : 0x560809;
      scorch[k] = [0x141210, 0x161412, 0x1c1916, 0x221e1a, 0x2a2520, 0x322c26, 0x3a332c, 0x433a32][k - 1];
    }
    this.rows = { pool: this.pal.alloc(blood), splat: this.pal.alloc(blood), scorch: this.pal.alloc(scorch) };
  }
  // size: half width in world units; grow: seconds for a pool to spread (0 = at once)
  add(kind, x, y, z, angle, size, alpha = 1, grow = 0) {
    if (this.list.length >= CAP) this.list.shift();
    const tex = this.rng.pick(this.tex[kind]);
    const life = kind === 'scorch' ? 300 : kind === 'pool' ? 180 : 100;
    const d = { kind, x, y, z, ang: Math.round(angle / (Math.PI / 2)) * (Math.PI / 2), size, alpha, grow, age: 0, life, tex };
    this.list.push(d);
    return d;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt;
      if (d.age > d.life) this.list.splice(i, 1);
    }
  }
  prepare(view) {
    const D = this.data;
    let n = 0;
    for (const d of this.list) {
      if (n >= CAP) break;
      if (!view.visible(d.x, d.y, d.z, 3 + d.size)) continue;
      const o = n * STRIDE, f = d.tex;
      const g = d.grow > 0 ? Math.min(1, Math.sqrt(d.age / d.grow) * 1.05 + 0.08) : 1;
      const fade = d.age > d.life - 8 ? (d.life - d.age) / 8 : 1;
      D[o] = d.x; D[o + 1] = d.y; D[o + 2] = d.z; D[o + 3] = d.ang;
      D[o + 4] = d.size; D[o + 5] = this.rows[d.kind]; D[o + 6] = clamp(d.alpha * fade, 0, 1); D[o + 7] = g;
      D[o + 8] = f.x; D[o + 9] = f.y; D[o + 10] = f.w; D[o + 11] = f.h;
      n++;
    }
    this.n = n;
    if (n) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, D.subarray(0, n * STRIDE));
    }
  }
  draw(ctx) {
    if (!this.n) return;
    const gl = this.gl, p = this.prog, u = p.u, r = ctx.renderer, e = ctx.env;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(u.uViewProj, false, ctx.viewProj);
    gl.uniformMatrix4fv(u.uShadowMat, false, ctx.shadowMat);
    gl.uniform2fv(u.uShadowK, ctx.shadowK);
    gl.uniform2fv(u.uDither, ctx.ditherOff);
    gl.uniform1f(u.uShadowOn, ctx.shadowOn ? 1 : 0);
    gl.uniform3fv(u.uSunDir, e.sunDir);
    gl.uniform3fv(u.uSunCol, e.sunCol);
    gl.uniform3fv(u.uAmb, e.amb);
    gl.uniform3fv(u.uFace, e.face);
    gl.uniform4fv(u.uCloud, e.cloud);
    gl.uniform1f(u.uFlash, e.flash);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex); gl.uniform1i(u.uSprites, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.pal.tex); gl.uniform1i(u.uPal, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, r.shadowTex); gl.uniform1i(u.uShadow, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, r.lightTex); gl.uniform1i(u.uLightMap, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, r.noiseTex); gl.uniform1i(u.uNoise, 4);
    gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1.0, -2.0);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.n);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
  }
}
