// Instanced billboard sprites (palette-indexed), with shadow-casting and lamp lighting.

import { createProgram } from '../core/gl.js';
import { T } from '../world/layout.js';

const TX = T.toFixed(1);

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
`;

const VS = HEAD + `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec4 iRect;
layout(location=3) in vec4 iA; // ax, ay, palRow, flags
layout(location=4) in vec2 iB; // alpha, depth bias
uniform mat4 uViewProj;
uniform vec2 uBuf;
uniform vec2 uRight; // world xy per art pixel along the screen's horizontal axis
out vec2 vUV;
flat out vec4 vInfo;
out vec3 vWorld;   // on the vertical axis through the anchor
out vec3 vWorldR;  // the pixel's own position on the billboard plane
void main() {
  vec4 c = uViewProj * vec4(iPos, 1.0);
  vec2 px = floor((c.xy * 0.5 + 0.5) * uBuf + 0.5);
  float flags = iA.w;
  bool flip = mod(flags, 2.0) >= 1.0;
  float w = iRect.z, h = iRect.w;
  float ax = flip ? w - iA.x : iA.x;
  vec2 off = vec2(aCorner.x * w - ax, iA.y - aCorner.y * h);
  vec2 sp = px + off;
  float tx = flip ? (1.0 - aCorner.x) * w : aCorner.x * w;
  vUV = iRect.xy + vec2(tx, aCorner.y * h);
  vInfo = vec4(iA.z, flags, iB.x, 0.0);
  vWorld = iPos + vec3(0.0, 0.0, (iA.y - aCorner.y * h) / ${TX});
  vWorldR = vWorld + vec3(uRight * (aCorner.x * w - ax), 0.0);
  gl_Position = vec4(sp / uBuf * 2.0 - 1.0, c.z - iB.y, 1.0);
}`;

const FS = HEAD + `
in vec2 vUV;
flat in vec4 vInfo;
in vec3 vWorld;
in vec3 vWorldR;
uniform sampler2D uSprites;
uniform sampler2DShadow uShadowS; // static geometry only
uniform vec2 uShadowKS;
uniform sampler2D uPal;
uniform sampler2DShadow uShadow;
uniform sampler2D uLightMap;
uniform sampler2D uNoise;
uniform mat4 uShadowMat;
uniform vec2 uShadowK;
uniform vec2 uDither;
uniform float uShadowOn;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform vec4 uCloud;
uniform float uFlash;
uniform float uEmis;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
void main() {
  vec4 t = texelFetch(uSprites, ivec2(floor(vUV)), 0);
  if (t.a < 0.5) discard;
  if (vInfo.z < 0.999 && bayer4(gl_FragCoord.xy) >= vInfo.z) discard;
  int row = int(vInfo.x + 0.5);
  int slot = int(t.r * 255.0 + 0.5);
  vec4 pc = texelFetch(uPal, ivec2(slot, row), 0);
  if (pc.a < 0.1) {
    int alt = int(t.b * 255.0 + 0.5);
    if (alt == 0) discard;
    pc = texelFetch(uPal, ivec2(alt, row), 0);
    if (pc.a < 0.1) discard;
  }
  float sh = t.g * 255.0 / 128.0;
  vec3 albedo = pc.rgb * sh;
  int flags = int(vInfo.y + 0.5);
  bool emissive = pc.a < 0.75 || (flags & 2) != 0;
  if (emissive) {
    float k = (flags & 2) != 0 ? 1.0 : uEmis;
    oColor = vec4(albedo * (0.6 + 0.6 * k), 1.0);
    oGlow = vec4(albedo * k, 1.0);
    return;
  }
  float s = 1.0;
  if (uShadowOn > 0.5 && (flags & 16) == 0) {
    float dith = bayer4(vec2(floor(gl_FragCoord.x) + uDither.x, uDither.y - floor(gl_FragCoord.y)));
    if ((flags & 8) != 0) {
      // tall sprites (trees): per-pixel lookup in the static-only map, so buildings shade the canopy
      // where they really do and neighbouring trees never band each other
      vec4 spos = uShadowMat * vec4(vWorldR + uSunDir * uShadowKS.x * 1.5, 1.0);
      vec3 sc = spos.xyz * 0.5 + 0.5;
      if (sc.x > 0.0 && sc.y > 0.0 && sc.x < 1.0 && sc.y < 1.0 && sc.z < 1.0)
        s = step(dith, texture(uShadowS, vec3(sc.xy, sc.z - uShadowKS.x * 2.0 * uShadowKS.y)));
    } else {
      vec4 spos = uShadowMat * vec4(vWorld + uSunDir * max(0.15, uShadowK.x * 3.0), 1.0);
      vec3 sc = spos.xyz * 0.5 + 0.5;
      if (sc.x > 0.0 && sc.y > 0.0 && sc.x < 1.0 && sc.y < 1.0 && sc.z < 1.0)
        s = step(dith, texture(uShadow, vec3(sc.xy, sc.z - max(0.25, uShadowK.x * 5.0) * uShadowK.y)));
    }
  }
  float cn = texture(uNoise, vWorldR.xy * 0.006 + uCloud.xy).r * 0.65 + texture(uNoise, vWorldR.xy * 0.017 + uCloud.xy * 1.7).r * 0.35;
  float cl = 1.0 - smoothstep(1.0 - uCloud.z - 0.08, 1.0 - uCloud.z + 0.08, cn) * uCloud.w;
  vec3 lm = vWorld.z < -0.5 ? vec3(0.0) : texture(uLightMap, vWorldR.xy / 128.0).rgb;
  float hf = clamp(1.0 - (vWorld.z - 0.3) / 8.0, 0.0, 1.0);
  vec3 light = uAmb * 0.92 + uSunCol * 0.8 * s * cl * smoothstep(0.0, 0.15, uSunDir.z + 0.05) + lm * hf * hf * 1.1 + vec3(uFlash);
  if (vWorld.z < -0.5) light = light * 0.5 + vec3(0.2, 0.19, 0.16);
  if ((flags & 32) != 0) light = max(light, vec3(0.55));
  oColor = vec4(albedo * light, 1.0);
  oGlow = vec4(0.0, 0.0, 0.0, 1.0);
}`;

const SHADOW_VS = HEAD + `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec4 iRect;
layout(location=3) in vec4 iA;
layout(location=4) in vec2 iB;
uniform mat4 uShadowVP;
uniform vec3 uSunDir;
out vec2 vUV;
void main() {
  float flags = iA.w;
  bool noShadow = mod(floor(flags / 4.0), 2.0) >= 1.0;
  if (noShadow) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 right = normalize(vec3(-uSunDir.y, uSunDir.x, 0.0) + vec3(1e-4, 0.0, 0.0));
  float w = iRect.z, h = iRect.w;
  vec3 wp = iPos + right * ((aCorner.x * w - iA.x) / ${TX}) + vec3(0.0, 0.0, (iA.y - aCorner.y * h) / ${TX});
  vUV = iRect.xy + vec2(aCorner.x * w, aCorner.y * h);
  gl_Position = uShadowVP * vec4(wp, 1.0);
}`;

const SHADOW_FS = HEAD + `
in vec2 vUV;
uniform sampler2D uSprites;
out vec4 o;
void main() {
  if (texelFetch(uSprites, ivec2(floor(vUV)), 0).a < 0.5) discard;
  o = vec4(1.0);
}`;

export const SF = { FLIP: 1, EMISSIVE: 2, NOSHADOW: 4, TALL: 8, NOSHADE: 16, BRIGHT: 32 };
const STRIDE = 13;

export class SpriteLayer {
  constructor(gl, atlas, pal) {
    this.gl = gl;
    this.atlas = atlas;
    this.pal = pal;
    this.prog = createProgram(gl, VS, FS, 'sprites');
    this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS, 'spriteShadow');
    this.cap = 8192;
    this.data = new Float32Array(this.cap * STRIDE);
    this.count = 0;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const B = STRIDE * 4;
    const attr = (loc, n, off) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, B, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr(1, 3, 0);
    attr(2, 4, 3);
    attr(3, 4, 7);
    attr(4, 2, 11);
    gl.bindVertexArray(null);
  }
  begin() { this.count = 0; }
  push(x, y, z, f, row, flags = 0, alpha = 1, bias = 0) {
    if (this.count >= this.cap) return;
    const d = this.data, o = this.count * STRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = f.x; d[o + 4] = f.y; d[o + 5] = f.w; d[o + 6] = f.h;
    d[o + 7] = f.ax; d[o + 8] = f.ay; d[o + 9] = row; d[o + 10] = flags;
    d[o + 11] = alpha; d[o + 12] = bias;
    this.count++;
  }
  end() {
    const gl = this.gl;
    this.atlas.upload(gl);
    this.pal.upload(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * STRIDE));
  }
  shadow(ctx) {
    if (!this.count) return;
    const gl = this.gl, p = this.shadowProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.uShadowVP, false, ctx.shadowMat);
    gl.uniform3fv(p.u.uSunDir, ctx.env.sunDir);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex);
    gl.uniform1i(p.u.uSprites, 0);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
  }
  draw(ctx) {
    if (!this.count) return;
    const gl = this.gl, p = this.prog, u = p.u, r = ctx.renderer, e = ctx.env;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(u.uViewProj, false, ctx.viewProj);
    gl.uniform2f(u.uBuf, ctx.bw, ctx.bh);
    gl.uniformMatrix4fv(u.uShadowMat, false, ctx.shadowMat);
    gl.uniform2fv(u.uShadowK, ctx.shadowK);
    gl.uniform2fv(u.uShadowKS, ctx.shadowKS);
    gl.uniform2fv(u.uRight, ctx.right);
    gl.uniform2fv(u.uDither, ctx.ditherOff);
    gl.uniform1f(u.uShadowOn, ctx.shadowOn ? 1 : 0);
    gl.uniform3fv(u.uSunDir, e.sunDir);
    gl.uniform3fv(u.uSunCol, e.sunCol);
    gl.uniform3fv(u.uAmb, e.amb);
    gl.uniform4fv(u.uCloud, e.cloud);
    gl.uniform1f(u.uFlash, e.flash);
    gl.uniform1f(u.uEmis, e.emis);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex);
    gl.uniform1i(u.uSprites, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.pal.tex);
    gl.uniform1i(u.uPal, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, r.shadowTex);
    gl.uniform1i(u.uShadow, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, r.lightTex);
    gl.uniform1i(u.uLightMap, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, r.noiseTex);
    gl.uniform1i(u.uNoise, 4);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, r.shadowTexS);
    gl.uniform1i(u.uShadowS, 5);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
  }
}
