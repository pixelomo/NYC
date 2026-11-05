// Static mesh builder: boxes, quads, prisms, cylinders with atlas-mapped textures.
// UVs are in texel units relative to a region; the shader wraps them (mod) inside the region,
// so a face larger than its region tiles the texture.

import { T } from './layout.js';

export const MAT = {
  SNOW: 1, // accumulates snow on up-facing surfaces
  GLASS: 2, // reflective
  GROUND: 4, // alpha = ground material code
  OFFICE: 8, // windows follow office lighting schedule
  WET: 16, // darkens in rain
  WATER: 32, // animated water
  NOSHADOW: 64, // does not receive sun shadow (e.g. emissive signage)
  FLAT: 128, // no directional face shading (sprites-like)
};

// Visibility groups (bit index). CPU sets a 32-bit mask each frame.
export const GRP = {
  ALWAYS: 0, SPRING: 1, SUMMER: 2, AUTUMN: 3, WINTER: 4, NOT_WINTER: 5, NIGHT: 6, DAY: 7,
  SUMMER_DAY: 8, FOUNTAIN: 9, NOT_SUMMER: 10, XMAS: 11, NOT_XMAS: 12, ICE: 13, NO_ICE: 14,
  CONSTRUCTION: 15, GATE_OPEN: 16, GATE_CLOSED: 17, SUMMER_OR_SPRING: 18, WARM: 19,
};

function grow(arr, need) {
  if (need <= arr.length) return arr;
  let n = arr.length * 2;
  while (n < need) n *= 2;
  const a = new arr.constructor(n);
  a.set(arr);
  return a;
}

export class MeshBuilder {
  constructor() {
    this.pos = new Float32Array(3 * 4096);
    this.uv = new Float32Array(2 * 4096);
    this.rect = new Uint16Array(4 * 4096);
    this.nrm = new Int8Array(4 * 4096);
    this.info = new Uint8Array(4 * 4096);
    this.idx = new Uint32Array(6 * 2048);
    this.nv = 0;
    this.ni = 0;
    this.defaultGroup = GRP.ALWAYS;
  }
  _ensure(nv, ni) {
    const v = this.nv + nv, i = this.ni + ni;
    this.pos = grow(this.pos, v * 3);
    this.uv = grow(this.uv, v * 2);
    this.rect = grow(this.rect, v * 4);
    this.nrm = grow(this.nrm, v * 4);
    this.info = grow(this.info, v * 4);
    this.idx = grow(this.idx, i);
  }
  _v(p, u, v, tex, n, mat, group, seed) {
    const k = this.nv++;
    this.pos[k * 3] = p[0];
    this.pos[k * 3 + 1] = p[1];
    this.pos[k * 3 + 2] = p[2];
    this.uv[k * 2] = u;
    this.uv[k * 2 + 1] = v;
    this.rect[k * 4] = tex.x;
    this.rect[k * 4 + 1] = tex.y;
    this.rect[k * 4 + 2] = tex.w;
    this.rect[k * 4 + 3] = tex.h;
    this.nrm[k * 4] = Math.round(n[0] * 127);
    this.nrm[k * 4 + 1] = Math.round(n[1] * 127);
    this.nrm[k * 4 + 2] = Math.round(n[2] * 127);
    this.nrm[k * 4 + 3] = 0;
    this.info[k * 4] = tex.layer;
    this.info[k * 4 + 1] = mat;
    this.info[k * 4 + 2] = group;
    this.info[k * 4 + 3] = seed & 255;
    return k;
  }
  // p0..p3: TL, TR, BR, BL as seen from the front. uvs: [[u,v] x4]
  quad(p0, p1, p2, p3, uvs, tex, n, mat = 0, group = this.defaultGroup, seed = 0) {
    if (!tex) return;
    if (!n) n = quadNormal(p0, p1, p3);
    this._ensure(4, 6);
    const a = this._v(p0, uvs[0][0], uvs[0][1], tex, n, mat, group, seed);
    const b = this._v(p1, uvs[1][0], uvs[1][1], tex, n, mat, group, seed);
    const c = this._v(p2, uvs[2][0], uvs[2][1], tex, n, mat, group, seed);
    const d = this._v(p3, uvs[3][0], uvs[3][1], tex, n, mat, group, seed);
    const I = this.idx;
    I[this.ni++] = a; I[this.ni++] = b; I[this.ni++] = c;
    I[this.ni++] = a; I[this.ni++] = c; I[this.ni++] = d;
  }
  tri(p0, p1, p2, uvs, tex, n, mat = 0, group = this.defaultGroup, seed = 0) {
    if (!tex) return;
    if (!n) n = quadNormal(p0, p1, p2);
    this._ensure(3, 3);
    const a = this._v(p0, uvs[0][0], uvs[0][1], tex, n, mat, group, seed);
    const b = this._v(p1, uvs[1][0], uvs[1][1], tex, n, mat, group, seed);
    const c = this._v(p2, uvs[2][0], uvs[2][1], tex, n, mat, group, seed);
    this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c;
  }

  // Axis-aligned box. faces: {px,nx,py,ny,pz} -> face spec (region or {t, mat, group, u0, v0})
  box(x0, y0, z0, x1, y1, z1, faces, opt = {}) {
    const g = opt.group ?? this.defaultGroup;
    const seed = opt.seed ?? 0;
    const sideMat = opt.mat ?? 0;
    const topMat = opt.topMat ?? (MAT.SNOW | MAT.WET);
    const H = (z1 - z0) * T;
    const f = (spec) => (spec && spec.t ? spec : spec ? { t: spec } : null);
    let s;
    // +y (south): u along +x
    if ((s = f(faces.py))) {
      const W = (x1 - x0) * T, u0 = s.u0 || 0, v0 = s.v0 || 0;
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0],
        [[u0, v0], [u0 + W, v0], [u0 + W, v0 + H], [u0, v0 + H]], s.t, [0, 1, 0], s.mat ?? sideMat, s.group ?? g, s.seed ?? seed);
    }
    // -y (north): u along -x
    if ((s = f(faces.ny))) {
      const W = (x1 - x0) * T, u0 = s.u0 || 0, v0 = s.v0 || 0;
      this.quad([x1, y0, z1], [x0, y0, z1], [x0, y0, z0], [x1, y0, z0],
        [[u0, v0], [u0 + W, v0], [u0 + W, v0 + H], [u0, v0 + H]], s.t, [0, -1, 0], s.mat ?? sideMat, s.group ?? g, s.seed ?? seed);
    }
    // +x (east): u along -y
    if ((s = f(faces.px))) {
      const W = (y1 - y0) * T, u0 = s.u0 || 0, v0 = s.v0 || 0;
      this.quad([x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0],
        [[u0, v0], [u0 + W, v0], [u0 + W, v0 + H], [u0, v0 + H]], s.t, [1, 0, 0], s.mat ?? sideMat, s.group ?? g, s.seed ?? seed);
    }
    // -x (west): u along +y
    if ((s = f(faces.nx))) {
      const W = (y1 - y0) * T, u0 = s.u0 || 0, v0 = s.v0 || 0;
      this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0],
        [[u0, v0], [u0 + W, v0], [u0 + W, v0 + H], [u0, v0 + H]], s.t, [-1, 0, 0], s.mat ?? sideMat, s.group ?? g, s.seed ?? seed);
    }
    // top: u along +x, v along +y
    if ((s = f(faces.pz))) {
      const W = (x1 - x0) * T, D = (y1 - y0) * T;
      const u0 = s.u0 ?? (s.world ? x0 * T : 0), v0 = s.v0 ?? (s.world ? y0 * T : 0);
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
        [[u0, v0], [u0 + W, v0], [u0 + W, v0 + D], [u0, v0 + D]], s.t, [0, 0, 1], s.mat ?? topMat, s.group ?? g, s.seed ?? seed);
    }
    // bottom (rarely needed)
    if ((s = f(faces.nz))) {
      const W = (x1 - x0) * T, D = (y1 - y0) * T;
      this.quad([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0],
        [[0, 0], [W, 0], [W, D], [0, D]], s.t, [0, 0, -1], s.mat ?? sideMat, s.group ?? g, s.seed ?? seed);
    }
  }

  // Box where every side face uses the same region (tiled) and the top another.
  solid(x0, y0, z0, x1, y1, z1, side, top, opt = {}) {
    this.box(x0, y0, z0, x1, y1, z1, { px: side, nx: side, py: side, ny: side, pz: top }, opt);
  }

  // Vertical quad between (xa,ya) and (xb,yb), from z0 to z1. Texture u runs a->b.
  vquad(xa, ya, xb, yb, z0, z1, tex, opt = {}) {
    const len = Math.hypot(xb - xa, yb - ya) * T, H = (z1 - z0) * T;
    const u0 = opt.u0 || 0, v0 = opt.v0 || 0;
    const nx = (yb - ya), ny = -(xb - xa);
    const l = Math.hypot(nx, ny) || 1;
    // normal convention: u_dir = (ny, -nx) => n = (-u_y, u_x)... derive from u direction
    const ux = (xb - xa) / (l || 1), uy = (yb - ya) / (l || 1);
    const n = [-uy, ux, 0];
    void nx; void ny;
    this.quad([xa, ya, z1], [xb, yb, z1], [xb, yb, z0], [xa, ya, z0],
      [[u0, v0], [u0 + len, v0], [u0 + len, v0 + H], [u0, v0 + H]], tex, opt.n || n, opt.mat ?? MAT.FLAT, opt.group ?? this.defaultGroup, opt.seed || 0);
  }

  // Horizontal quad (decal) at height z
  hquad(x0, y0, x1, y1, z, tex, opt = {}) {
    const W = (x1 - x0) * T, D = (y1 - y0) * T;
    const u0 = opt.u0 ?? 0, v0 = opt.v0 ?? 0;
    this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z],
      [[u0, v0], [u0 + W, v0], [u0 + W, v0 + D], [u0, v0 + D]], tex, [0, 0, 1], opt.mat ?? (MAT.SNOW | MAT.WET), opt.group ?? this.defaultGroup, opt.seed || 0);
  }

  // Sloped quad from a low edge to a high edge (awnings, roofs). edge a: (xa0,ya0,za)->(xa1,ya1,za), edge b at zb
  slope(a0, a1, b0, b1, tex, opt = {}) {
    const W = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]) * T;
    const H = Math.hypot(b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]) * T;
    const u0 = opt.u0 || 0, v0 = opt.v0 || 0;
    // b is the "top" edge
    this.quad(b0, b1, a1, a0, [[u0, v0], [u0 + W, v0], [u0 + W, v0 + H], [u0, v0 + H]], tex, null,
      opt.mat ?? (MAT.SNOW | MAT.WET), opt.group ?? this.defaultGroup, opt.seed || 0);
  }

  // Gable roof over [x0,x1]x[y0,y1] from z0 up to ridge zr; ridge along 'x' or 'y'
  gable(x0, y0, x1, y1, z0, zr, axis, roofTex, endTex, opt = {}) {
    const g = opt.group ?? this.defaultGroup;
    if (axis === 'x') {
      const ym = (y0 + y1) / 2;
      // north slope (faces -y, up), south slope
      this.slope([x1, y0, z0], [x0, y0, z0], [x1, ym, zr], [x0, ym, zr], roofTex, opt);
      this.slope([x0, y1, z0], [x1, y1, z0], [x0, ym, zr], [x1, ym, zr], roofTex, opt);
      const D = (y1 - y0) * T, Hh = (zr - z0) * T;
      // gable ends (triangles) at x0 (faces -x) and x1 (faces +x)
      this.tri([x0, y0, z0], [x0, ym, zr], [x0, y1, z0], [[0, Hh], [D / 2, 0], [D, Hh]], endTex, [-1, 0, 0], 0, g);
      this.tri([x1, y1, z0], [x1, ym, zr], [x1, y0, z0], [[0, Hh], [D / 2, 0], [D, Hh]], endTex, [1, 0, 0], 0, g);
    } else {
      const xm = (x0 + x1) / 2;
      this.slope([x0, y0, z0], [x0, y1, z0], [xm, y0, zr], [xm, y1, zr], roofTex, opt);
      this.slope([x1, y1, z0], [x1, y0, z0], [xm, y1, zr], [xm, y0, zr], roofTex, opt);
      const W = (x1 - x0) * T, Hh = (zr - z0) * T;
      this.tri([x1, y0, z0], [xm, y0, zr], [x0, y0, z0], [[0, Hh], [W / 2, 0], [W, Hh]], endTex, [0, -1, 0], 0, g);
      this.tri([x0, y1, z0], [xm, y1, zr], [x1, y1, z0], [[0, Hh], [W / 2, 0], [W, Hh]], endTex, [0, 1, 0], 0, g);
    }
  }

  // N-sided cylinder (water towers, columns). Side texture wraps around.
  cylinder(cx, cy, z0, z1, r, sides, tex, capTex, opt = {}) {
    const H = (z1 - z0) * T;
    const circ = 2 * Math.PI * r * T;
    const g = opt.group ?? this.defaultGroup;
    const off = opt.angle ?? Math.PI / sides;
    for (let i = 0; i < sides; i++) {
      const a0 = off + (i / sides) * Math.PI * 2, a1 = off + ((i + 1) / sides) * Math.PI * 2;
      const p0x = cx + Math.cos(a0) * r, p0y = cy + Math.sin(a0) * r;
      const p1x = cx + Math.cos(a1) * r, p1y = cy + Math.sin(a1) * r;
      const am = (a0 + a1) / 2;
      const n = [Math.cos(am), Math.sin(am), 0];
      const u0 = (i / sides) * circ, u1 = ((i + 1) / sides) * circ;
      // orientation: going around with increasing angle in a left-handed frame; order TL,TR as seen from outside
      this.quad([p1x, p1y, z1], [p0x, p0y, z1], [p0x, p0y, z0], [p1x, p1y, z0],
        [[u0, 0], [u1, 0], [u1, H], [u0, H]], tex, n, opt.mat ?? 0, g, opt.seed || 0);
    }
    if (capTex) {
      for (let i = 0; i < sides; i++) {
        const a0 = off + (i / sides) * Math.PI * 2, a1 = off + ((i + 1) / sides) * Math.PI * 2;
        const pts = [[cx, cy], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r]];
        this.tri([pts[0][0], pts[0][1], z1], [pts[1][0], pts[1][1], z1], [pts[2][0], pts[2][1], z1],
          pts.map((p) => [(p[0] - cx + r) * T, (p[1] - cy + r) * T]), capTex, [0, 0, 1], opt.capMat ?? (MAT.SNOW | MAT.WET), g);
      }
    }
  }

  cone(cx, cy, z0, z1, r, sides, tex, opt = {}) {
    const g = opt.group ?? this.defaultGroup;
    const off = opt.angle ?? Math.PI / sides;
    const H = Math.hypot(z1 - z0, r) * T;
    const circ = 2 * Math.PI * r * T;
    for (let i = 0; i < sides; i++) {
      const a0 = off + (i / sides) * Math.PI * 2, a1 = off + ((i + 1) / sides) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const slope = r / (z1 - z0);
      const n = [Math.cos(am), Math.sin(am), slope];
      const l = Math.hypot(n[0], n[1], n[2]);
      const u0 = (i / sides) * circ, u1 = ((i + 1) / sides) * circ;
      this.tri([cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z0], [cx, cy, z1], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z0],
        [[u0, H], [(u0 + u1) / 2, 0], [u1, H]], tex, [n[0] / l, n[1] / l, n[2] / l], opt.mat ?? (MAT.SNOW), g);
    }
  }

  // Square pyramid
  pyramid(x0, y0, x1, y1, z0, z1, tex, opt = {}) {
    const g = opt.group ?? this.defaultGroup;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const W = (x1 - x0) * T, Hs = Math.hypot(z1 - z0, (y1 - y0) / 2) * T;
    const top = [cx, cy, z1];
    const mat = opt.mat ?? MAT.SNOW;
    this.tri([x0, y1, z0], top, [x1, y1, z0], [[0, Hs], [W / 2, 0], [W, Hs]], tex, null, mat, g);
    this.tri([x1, y0, z0], top, [x0, y0, z0], [[0, Hs], [W / 2, 0], [W, Hs]], tex, null, mat, g);
    this.tri([x1, y1, z0], top, [x1, y0, z0], [[0, Hs], [W / 2, 0], [W, Hs]], tex, null, mat, g);
    this.tri([x0, y0, z0], top, [x0, y1, z0], [[0, Hs], [W / 2, 0], [W, Hs]], tex, null, mat, g);
  }

  finish() {
    return {
      pos: this.pos.subarray(0, this.nv * 3),
      uv: this.uv.subarray(0, this.nv * 2),
      rect: this.rect.subarray(0, this.nv * 4),
      nrm: this.nrm.subarray(0, this.nv * 4),
      info: this.info.subarray(0, this.nv * 4),
      idx: this.idx.subarray(0, this.ni),
      vertexCount: this.nv,
      indexCount: this.ni,
    };
  }
}

function quadNormal(a, b, d) {
  // (b - a) x (d - a) gives the outward normal for TL,TR,..,BL ordering in this left-handed world
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
