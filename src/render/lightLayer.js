// World-space XY light map accumulation (street lamps, shop windows, headlights, fireworks...).

import { createProgram } from '../core/gl.js';

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iA; // x, y, rx, ry
layout(location=2) in vec4 iB; // dirx, diry, k, unused
layout(location=3) in vec3 iC; // colour
out vec2 vL;
flat out vec3 vCol;
void main() {
  vec2 c = aCorner * 2.0 - 1.0;
  vec2 d = normalize(iB.xy + vec2(1e-5, 0.0));
  vec2 pp = vec2(-d.y, d.x);
  vec2 w = iA.xy + d * (c.x * iA.z) + pp * (c.y * iA.w);
  vL = c;
  vCol = iC * iB.z;
  gl_Position = vec4(w / 128.0 * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vL;
flat in vec3 vCol;
out vec4 o;
void main() {
  float d = dot(vL, vL);
  if (d > 1.0) discard;
  float f = (1.0 - d);
  f = f * f;
  // quantise into soft pixel-art bands
  f = floor(f * 6.0 + 0.5) / 6.0 * 0.85 + f * 0.15;
  o = vec4(vCol * f, 1.0);
}`;

const STRIDE = 11;

export class LightLayer {
  constructor(gl) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS, 'lights');
    this.cap = 4096;
    this.data = new Float32Array(this.cap * STRIDE);
    this.count = 0;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
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
    attr(1, 4, 0);
    attr(2, 4, 4);
    attr(3, 3, 8);
    gl.bindVertexArray(null);
  }
  begin() { this.count = 0; }
  // round light
  add(x, y, r, color, k) {
    this.addDir(x, y, r, r, 1, 0, color, k);
  }
  addDir(x, y, rx, ry, dx, dy, color, k) {
    if (this.count >= this.cap || k <= 0.001) return;
    const d = this.data, o = this.count * STRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = rx; d[o + 3] = ry;
    d[o + 4] = dx; d[o + 5] = dy; d[o + 6] = k; d[o + 7] = 0;
    d[o + 8] = color[0]; d[o + 9] = color[1]; d[o + 10] = color[2];
    this.count++;
  }
  end() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * STRIDE));
  }
  light(ctx) {
    if (!this.count) return;
    const gl = this.gl;
    gl.useProgram(this.prog.program);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
  }
}
