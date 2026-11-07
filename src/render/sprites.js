// Palette-indexed sprite atlas: trees, people, animals, props, particles.
// Texel: R = palette slot, G = shade (128 = 1.0), B = alt slot (used when the main slot is hidden), A = alpha.

import { Page, SPainter } from '../core/painter.js';
import { RNG, hash2i, clamp } from '../core/math.js';

const SIZE = 2048;
const HEIGHT = 4096;

export class SpriteAtlas {
  constructor() {
    this.page = new Page(SIZE, HEIGHT);
    this.templates = [];
    this.frames = new Map();
    this.x = 0; this.y = 0; this.rowH = 0;
    this.dirtyY0 = 0; this.dirtyY1 = HEIGHT;
    this.tex = null;
  }
  alloc(w, h) {
    if (this.x + w + 1 > SIZE) { this.x = 0; this.y += this.rowH + 1; this.rowH = 0; }
    if (this.y + h + 1 > HEIGHT) throw new Error('sprite atlas full');
    const r = { x: this.x, y: this.y, w, h };
    this.x += w + 1;
    this.rowH = Math.max(this.rowH, h);
    this.dirtyY0 = Math.min(this.dirtyY0, r.y);
    this.dirtyY1 = Math.max(this.dirtyY1, r.y + h);
    return r;
  }
  // add a frame: paint(sp) draws into a w*h SPainter. anchor default bottom-centre
  add(name, w, h, paint, ax = Math.floor(w / 2), ay = h - 1) {
    const r = this.alloc(w, h);
    const sp = new SPainter(this.page, r.x, r.y, w, h);
    paint(sp);
    const f = { x: r.x, y: r.y, w, h, ax, ay: ay + 1 };
    if (name) this.frames.set(name, f);
    return f;
  }
  get(name) { return this.frames.get(name); }
  get full() { return this.y > HEIGHT - 400; }
  upload(gl) {
    if (!this.tex) {
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SIZE, HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.page.data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.dirtyY0 = HEIGHT; this.dirtyY1 = 0;
      return;
    }
    if (this.dirtyY1 > this.dirtyY0) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      const y0 = this.dirtyY0, h = this.dirtyY1 - y0;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, SIZE, h, gl.RGBA, gl.UNSIGNED_BYTE, this.page.data.subarray(y0 * SIZE * 4, (y0 + h) * SIZE * 4));
      this.dirtyY0 = HEIGHT; this.dirtyY1 = 0;
    }
  }
}

// Palette rows: 32 slots each. alpha 255 = lit colour, 128 = emissive, 0 = hidden (fall back to alt slot)
export class PaletteBank {
  constructor(rows = 1024) {
    this.rows = rows;
    this.data = new Uint8Array(32 * rows * 4);
    this.next = 0;
    this.free = [];
    this.dirty = true;
    this.tex = null;
  }
  alloc(colors = {}) {
    const row = this.free.length ? this.free.pop() : this.next++;
    if (row >= this.rows) throw new Error('palette full');
    this.data.fill(0, row * 128, row * 128 + 128);
    for (const k in colors) this.set(row, +k, colors[k]);
    return row;
  }
  release(row) { this.free.push(row); }
  set(row, slot, c, a = 255) {
    const i = (row * 32 + slot) * 4;
    if (Array.isArray(c)) { a = c[1]; c = c[0]; }
    if (c == null) { this.data[i + 3] = 0; this.dirty = true; return; }
    this.data[i] = (c >> 16) & 255; this.data[i + 1] = (c >> 8) & 255; this.data[i + 2] = c & 255; this.data[i + 3] = a;
    this.dirty = true;
  }
  upload(gl) {
    if (!this.tex) {
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 32, this.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.dirty = false;
      return;
    }
    if (this.dirty) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 32, this.next, gl.RGBA, gl.UNSIGNED_BYTE, this.data.subarray(0, this.next * 128));
      this.dirty = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Slots
export const S = {
  // people
  SKIN: 1, HAIR: 2, TOP: 3, TOP2: 4, BOTTOM: 5, SHOES: 6, COAT: 7, HAT: 8, SCARF: 9, BAG: 10, DARK: 11, WHITE: 12, ITEM: 13, ITEM2: 14, SOCK: 15,
  // trees
  TRUNK: 1, BRANCH: 2, LEAF_D: 3, LEAF_M: 4, LEAF_L: 5, BLOSSOM: 6, BR_TOP: 7, LIGHT1: 8, LIGHT2: 9, LIGHT3: 10, STAR: 11,
  // animals
  BODY: 1, BODY_D: 2, BODY_L: 3, EYE: 4, NOSE: 5, COLLAR: 6, ACCENT: 7, BEAK: 8,
  // generic
  C1: 1, C2: 2, C3: 3, C4: 4, C5: 5, C6: 6, C7: 7, C8: 8, C9: 9, C10: 10,
};

// ---------------------------------------------------------------------------
// Shared helpers
function shadeMul(sp, x, y, f) {
  if (x < 0 || y < 0 || x >= sp.w || y >= sp.h) return;
  const d = sp.page.data, i = ((sp.oy + y) * sp.page.w + sp.ox + x) * 4;
  if (!d[i + 3] || !d[i]) return;
  d[i + 1] = clamp(Math.round(d[i + 1] * f), 30, 255);
}

// Selective outline: silhouette pixels on the shadow side get darker, the lit rim a touch brighter.
export function selOut(sp, dark = 0.74, lit = 1.08) {
  const W = sp.w, H = sp.h;
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = sp.get(x, y) > 0 ? 1 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      if (!at(x + 1, y) || !at(x, y + 1)) shadeMul(sp, x, y, dark);
      else if (!at(x - 1, y) || !at(x, y - 1)) shadeMul(sp, x, y, lit);
    }
}

// ---------------------------------------------------------------------------
// TREES (2x density: 32 texels per world unit)
export const TREE_SPECIES = {
  plane: { w: 88, h: 116, trunkH: 40, canopy: [40, 34], blobs: 30, bark: 0x8a8a74, camo: true },
  locust: { w: 76, h: 108, trunkH: 44, canopy: [34, 30], blobs: 40, small: true, bark: 0x5a4a3a },
  oak: { w: 96, h: 112, trunkH: 36, canopy: [44, 36], blobs: 26, bark: 0x5a4636 },
  elm: { w: 120, h: 140, trunkH: 52, canopy: [56, 40], blobs: 34, vase: true, bark: 0x5e5246 },
  cherry: { w: 84, h: 88, trunkH: 28, canopy: [38, 26], blobs: 30, bark: 0x4a3030 },
  pine: { w: 72, h: 108, trunkH: 12, pine: true, bark: 0x4a3626 },
  xmas: { w: 80, h: 152, trunkH: 12, pine: true, xmas: true, bark: 0x4a3626 },
};

export function paintTree(sp, spec, seed) {
  const rng = new RNG(seed);
  const { w, h } = spec;
  const cx = Math.floor(w / 2);
  const base = h - 1;
  if (spec.pine) return paintPine(sp, spec, rng, seed);
  const th = spec.trunkH;
  // trunk: root flare, bark furrows, plane-tree camouflage patches
  for (let y = base; y > base - th; y--) {
    const t = (base - y) / th;
    const half = t < 0.05 ? 4 : t < 0.14 ? 3 : 2.5;
    const xa = Math.round(cx - half), xb = Math.round(cx + half) - 1;
    for (let x = xa; x <= xb; x++) {
      const rel = (x - xa) / Math.max(1, xb - xa);
      let sh = rel < 0.25 ? 150 : rel < 0.6 ? 126 : 98;
      if (hash2i(x, y >> 2, seed + 5) < 0.2) sh -= 22;
      if (spec.camo && hash2i(x >> 1, (y >> 1) + 3, seed + 6) > 0.6) sh += 30;
      sp.set(x, y, S.TRUNK, clamp(sh, 56, 210), S.TRUNK);
    }
  }
  // branches (recursive), drawn into alt + main so bare winter trees show their structure
  const tips = [];
  const branch = (x, y, ang, len, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y - Math.sin(ang) * len;
    const steps = Math.ceil(len);
    const thick = depth === 0 ? 4 : depth === 1 ? 3 : depth <= 3 ? 2 : 1;
    for (let i = 0; i <= steps; i++) {
      const px = Math.round(x + ((x2 - x) * i) / steps), py = Math.round(y + ((y2 - y) * i) / steps);
      for (let k = 0; k < thick; k++) {
        const above = sp.get(px + k, py - 1);
        const slot = above < 0 && depth >= 1 ? S.BR_TOP : S.BRANCH;
        sp.set(px + k, py, slot, k === 0 ? 138 : k === thick - 1 ? 98 : 118, slot);
      }
    }
    if (depth >= 5 || len < 4) {
      tips.push([x2, y2]);
      for (let k = 0; k < 3; k++) {
        const ta = ang + rng.range(-1.0, 1.0), tl = rng.range(3, 6);
        const tx = Math.round(x2 + Math.cos(ta) * tl), ty = Math.round(y2 - Math.sin(ta) * tl);
        const n = Math.max(1, Math.abs(tx - x2), Math.abs(ty - y2));
        for (let i = 0; i <= n; i++) {
          const qx = Math.round(x2 + ((tx - x2) * i) / n), qy = Math.round(y2 + ((ty - y2) * i) / n);
          if (sp.get(qx, qy) < 0) sp.set(qx, qy, S.BR_TOP, 116, S.BR_TOP);
        }
      }
      return;
    }
    const n = depth === 0 ? 3 : rng.chance(0.35) ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const spread = spec.vase ? 0.5 : 0.66;
      const na = ang + (k - (n - 1) / 2) * spread + rng.range(-0.25, 0.25);
      branch(x2, y2, na, len * rng.range(0.64, 0.8), depth + 1);
    }
  };
  const topY = base - th;
  const L0 = spec.canopy[1] * 0.75;
  branch(cx - 2, topY + 2, Math.PI / 2 + rng.range(-0.15, 0.15), L0 * 0.7, 0);
  if (spec.vase) { branch(cx - 1, topY + 8, Math.PI / 2 + 0.6, L0 * 0.8, 1); branch(cx - 1, topY + 8, Math.PI / 2 - 0.6, L0 * 0.8, 1); }
  // canopy: leaf clumps around branch tips + random fill, lit from the upper left
  const [rx, ry] = spec.canopy;
  const ccy = topY - ry * 0.55;
  const blobs = [];
  for (const t of tips) blobs.push([t[0], t[1], rng.range(5, 9)]);
  for (let i = 0; i < spec.blobs; i++) {
    const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next());
    blobs.push([cx + Math.cos(a) * r * rx * 0.75, ccy + Math.sin(a) * r * ry * 0.7, rng.range(7, 12)]);
  }
  const leafPix = (x, y, nx, ny) => {
    const prev = sp.get(x, y);
    const alt = prev === S.BRANCH || prev === S.BR_TOP || prev === S.TRUNK ? prev : 0;
    const n = (hash2i(x >> 1, y >> 1, seed) - 0.5) * 0.6 + (hash2i(x >> 2, y >> 2, seed + 7) - 0.5) * 0.5;
    const l = -nx * 0.6 - ny * 0.8 + n;
    let slot = l > 0.42 ? S.LEAF_L : l > -0.26 ? S.LEAF_M : S.LEAF_D;
    if (spec.small && hash2i(x, y, seed + 3) < 0.22) slot = S.LEAF_D;
    if (hash2i(x >> 1, y >> 1, seed + 9) < 0.08) slot = S.BLOSSOM;
    const sh = slot === S.LEAF_L && hash2i(x, y, seed + 11) < 0.12 ? 146 : 128;
    sp.set(x, y, slot, sh, alt);
  };
  for (const [bx, by, br] of blobs) {
    for (let y = Math.floor(by - br); y <= Math.ceil(by + br); y++)
      for (let x = Math.floor(bx - br); x <= Math.ceil(bx + br); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dx = (x + 0.5 - bx) / br, dy = (y + 0.5 - by) / (br * 0.85);
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        if (d > 0.66 && hash2i(x >> 1, y >> 1, seed + 1) < 0.42) continue; // ragged clump edges
        const nx = (x - cx) / rx, ny = (y - ccy) / ry;
        leafPix(x, y, nx * 0.6 + dx * 0.4, ny * 0.6 + dy * 0.4);
      }
  }
  // shadowed underside (2 px)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = sp.get(x, y);
      if ((s === S.LEAF_M || s === S.LEAF_L || s === S.BLOSSOM) && (sp.get(x, y + 1) < 0 || sp.get(x, y + 2) < 0)) sp.set(x, y, S.LEAF_D, 118, 0);
    }
}

function paintPine(sp, spec, rng, seed) {
  const { w, h } = spec;
  const cx = Math.floor(w / 2), base = h - 1;
  for (let y = base; y > base - spec.trunkH - 8; y--) for (let x = cx - 2; x < cx + 2; x++) sp.set(x, y, S.TRUNK, x === cx - 2 ? 150 : x === cx + 1 ? 96 : 124, S.TRUNK);
  const layers = spec.xmas ? 9 : 7;
  const top = 3, bottom = base - spec.trunkH;
  for (let l = 0; l < layers; l++) {
    const ly = top + ((bottom - top) * (l + 1)) / layers;
    const lw = (w / 2 - 2) * (0.3 + (0.7 * (l + 1)) / layers);
    const lh = (bottom - top) / layers + 10;
    for (let y = Math.floor(ly - lh); y <= ly; y++) {
      const t = clamp((y - (ly - lh)) / lh, 0, 1);
      const half = lw * Math.pow(t, 0.8);
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        if (x < 0 || x >= w || y < 0) continue;
        const edge = Math.abs(x + 0.5 - cx) / Math.max(1, half);
        if (y > ly - 4 && hash2i(x >> 1, y, seed + 5) < 0.3 + (y - (ly - 4)) * 0.15) continue; // drooping tips
        if (edge > 0.82 && hash2i(x, y >> 1, seed + 6) < 0.5) continue; // needle clusters
        const n = (hash2i(x >> 1, y >> 1, seed) - 0.5) * 0.5;
        const rel = (x - cx) / Math.max(1, half) + n;
        let slot = rel < -0.3 ? S.LEAF_L : rel > 0.35 ? S.LEAF_D : S.LEAF_M;
        if (y > ly - 3) slot = S.LEAF_D;
        if (sp.get(x, y - 1) < 0 || sp.get(x, y - 2) < 0) slot = S.BR_TOP;
        sp.set(x, y, slot, 128, slot === S.BR_TOP ? S.BR_TOP : 0);
      }
    }
  }
  if (spec.xmas) {
    for (let i = 0; i < 240; i++) {
      const y = rng.int(10, bottom - 2), x = rng.int(2, w - 3);
      const s = sp.get(x, y);
      if (s === S.LEAF_M || s === S.LEAF_D || s === S.LEAF_L) {
        const L = rng.pick([S.LIGHT1, S.LIGHT2, S.LIGHT3]);
        sp.set(x, y, L, 128, 0);
        if (rng.chance(0.3) && sp.get(x + 1, y) > 0) sp.set(x + 1, y, L, 100, 0);
      }
    }
    for (const [dx, dy] of [[0, -3], [0, -2], [-1, -1], [0, -1], [1, -1], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0], [-1, 1], [0, 1], [1, 1], [-2, 2], [2, 2], [-2, 3], [2, 3]]) sp.set(cx + dx, top + dy, S.STAR, 128, 0);
  }
}

export const TREE_PALETTES = {
  // [season] => slots
  plane: [
    { L: [0x78c850, 0x5aa83c, 0x3e8a32], B: 0x8ccc5c },
    { L: [0x5aa83c, 0x3f8a32, 0x2a6a28], B: 0x4f9a36 },
    { L: [0xf0b030, 0xd88a28, 0xa85a20], B: 0xe8c040 },
    null,
  ],
  locust: [
    { L: [0xb8e070, 0x8cc858, 0x5f9a3c], B: 0xa8d860 },
    { L: [0x8cc858, 0x6aa83e, 0x4a8030], B: 0x7ab848 },
    { L: [0xf8e050, 0xf0c030, 0xc89a28], B: 0xf8f080 },
    null,
  ],
  oak: [
    { L: [0x88c858, 0x60a83c, 0x3e8030], B: 0x88c858 },
    { L: [0x4f9a36, 0x3a7a2c, 0x285a22], B: 0x4f9a36 },
    { L: [0xd85a28, 0xb83a1e, 0x80281a], B: 0xe88a30 },
    null,
  ],
  elm: [
    { L: [0x90d060, 0x68b040, 0x48883a], B: 0x90d060 },
    { L: [0x58a83c, 0x3e8a30, 0x2c6a26], B: 0x58a83c },
    { L: [0xf0c838, 0xd89a2a, 0xa86a22], B: 0xe08a30 },
    null,
  ],
  cherry: [
    { L: [0xffd0e0, 0xf8a8c8, 0xe080a8], B: 0xffffff },
    { L: [0x68b040, 0x4a9034, 0x2f6a28], B: 0x5aa03a },
    { L: [0xe0603a, 0xc04030, 0x902a28], B: 0xf09040 },
    null,
  ],
  pine: [
    { L: [0x3f8a4a, 0x2a6a3a, 0x1e4e2e], B: 0x3f8a4a },
    { L: [0x3f8a4a, 0x2a6a3a, 0x1e4e2e], B: 0x3f8a4a },
    { L: [0x3a7a44, 0x2a6436, 0x1e4a2a], B: 0x3a7a44 },
    { L: [0x3a7a44, 0x2a6436, 0x1e4a2a], B: 0x3a7a44 },
  ],
};

export function treePalette(pal, species, season, snowy, barkColor, row = null) {
  const P = TREE_PALETTES[species] || TREE_PALETTES.plane;
  const r = row ?? pal.alloc();
  const s = P[season];
  const bare = !s;
  const bark = bare ? shadeHex(barkColor, 0.62) : barkColor;
  pal.set(r, S.TRUNK, bark);
  pal.set(r, S.BRANCH, shadeHex(bark, 0.9));
  pal.set(r, S.BR_TOP, snowy ? 0xf2f6fa : shadeHex(bark, bare ? 1.0 : 1.1));
  if (s) {
    pal.set(r, S.LEAF_L, s.L[0]);
    pal.set(r, S.LEAF_M, s.L[1]);
    pal.set(r, S.LEAF_D, s.L[2]);
    pal.set(r, S.BLOSSOM, s.B);
    if (species === 'pine' && snowy) { pal.set(r, S.LEAF_L, 0xe8f0f8); pal.set(r, S.BR_TOP, 0xffffff); }
    else if (species === 'pine') pal.set(r, S.BR_TOP, s.L[0]);
  } else {
    for (const k of [S.LEAF_L, S.LEAF_M, S.LEAF_D, S.BLOSSOM]) pal.set(r, k, 0, 0);
  }
  pal.set(r, S.LIGHT1, 0xff3a3a, 128);
  pal.set(r, S.LIGHT2, 0x40ff70, 128);
  pal.set(r, S.LIGHT3, 0xffd040, 128);
  pal.set(r, S.STAR, 0xfff2a0, 128);
  return r;
}

function shadeHex(c, f) {
  const r = clamp(Math.round(((c >> 16) & 255) * f), 0, 255), g = clamp(Math.round(((c >> 8) & 255) * f), 0, 255), b = clamp(Math.round((c & 255) * f), 0, 255);
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------------------
// PEOPLE (26x42 frames; drawn facing right in 3/4 view, flipped for left)
// template: { body: 'adult'|'kid'|'elder', hair, hat, top, bottom, coat, bag, scarf, glasses, cane }
export const POSES = {
  walk: 4, run: 4, idle: 2, sit: 1, dribble: 2, shoot: 2, throw: 2, crouch: 1, wave: 1, skate: 2, phone: 1, lie: 1,
};
// poses that get a separate back view (the rest reuse the front view)
const BACK_POSES = { walk: 1, run: 1, idle: 1, sit: 1 };
const PW = 26, PH = 42, SIT_EXT = 10;

function poseParams(anim, f) {
  const P = { lx: 0, rx: 0, ll: 0, rl: 0, la: 'down', ra: 'down', bob: 0, sit: false, crouch: false, jump: 0, lean: 0, dip: 0 };
  switch (anim) {
    case 'walk': {
      const ph = [[-3, 3, 'fwd', 'back', 0], [0, 0, 'down', 'down', 1], [3, -3, 'back', 'fwd', 0], [0, 0, 'down', 'down', 1]][f];
      P.lx = ph[0]; P.rx = ph[1]; P.la = ph[2]; P.ra = ph[3]; P.bob = ph[4];
      if (f === 1) P.rl = 2;
      if (f === 3) P.ll = 2;
      break;
    }
    case 'run': {
      const ph = [[-5, 5, 'fwdb', 'backb', 0], [0, 0, 'bent', 'bent', 2], [5, -5, 'backb', 'fwdb', 0], [0, 0, 'bent', 'bent', 2]][f];
      P.lx = ph[0]; P.rx = ph[1]; P.la = ph[2]; P.ra = ph[3]; P.bob = ph[4]; P.lean = 1;
      if (f === 1) P.rl = 4;
      if (f === 3) P.ll = 4;
      break;
    }
    case 'idle': P.bob = f; break;
    case 'sit': P.sit = true; P.la = 'lap'; P.ra = 'lap'; break;
    case 'dribble': P.ra = f ? 'low' : 'fwdlow'; P.la = 'back'; P.lx = -3; P.rx = 3; P.dip = 2 - f; break;
    case 'shoot': P.la = 'up'; P.ra = 'up'; P.jump = f ? 6 : 0; P.ll = f * 2; P.rl = f * 2; P.dip = f ? 0 : 2; break;
    case 'throw': P.ra = f ? 'fwd' : 'upback'; P.la = f ? 'back' : 'fwd'; P.lx = -3; P.rx = 4; break;
    case 'crouch': P.crouch = true; P.la = 'low'; P.ra = 'low'; break;
    case 'wave': P.ra = 'up'; break;
    case 'skate': P.la = 'out'; P.ra = 'out'; P.lx = f ? -3 : 3; P.rx = f ? 5 : -5; P.lean = 1; break;
    case 'phone': P.ra = 'phone'; break;
    case 'lie': P.lie = true; break;
    case 'aim': P.ra = f ? 'aim2' : 'aim'; P.la = 'aimL'; break;
    case 'down': P.down = true; break;
  }
  return P;
}

const HEADS = {
  adult: ['.XXXXX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXXX', '..XXXX.'],
  kid: ['.XXXX.', 'XXXXXX', 'XXXXXX', 'XXXXXX', 'XXXXXX', '.XXXXX', '..XXX.'],
};
// arm poses: [elbow, hand] offsets from the shoulder (+x = facing direction)
const ARMS = {
  down: [[0, 4], [0, 8]], fwd: [[1, 4], [3, 7]], back: [[-1, 4], [-3, 7]],
  fwdb: [[2, 3], [5, 1]], backb: [[-3, 3], [-4, 6]], bent: [[0, 4], [3, 3]],
  up: [[1, -4], [2, -8]], upback: [[-2, -3], [-4, -6]], low: [[1, 4], [3, 9]], fwdlow: [[2, 4], [5, 6]],
  lap: [[0, 4], [4, 5]], phone: [[1, 4], [3, 1]],
  aim: [[3, 0], [6, -1]], aim2: [[2, -1], [5, -3]], aimL: [[5, 1], [12, 0]],
};

export function paintPerson(sp, tpl, anim, f, view, ext = 0) {
  const P = poseParams(anim, f);
  if (P.lie) return paintLying(sp, tpl);
  if (P.down) return paintDown(sp, tpl);
  const kid = tpl.body === 'kid', elder = tpl.body === 'elder';
  const shorts = tpl.bottom === 'shorts', skirt = tpl.bottom === 'skirt', dress = tpl.bottom === 'dress';
  const fem = skirt || dress;
  const front = view === 'front';
  const coat = tpl.coat, puffer = coat === 'puffer', longCoat = coat === 'long';
  const cx = Math.floor(sp.w / 2);
  const ground = sp.h - 1 - ext;
  const legH = kid ? 7 : 11, torsoH = kid ? 7 : 10;
  const headRows = HEADS[kid ? 'kid' : 'adult'];
  const headH = headRows.length, headW = headRows[0].length;
  const tw = (kid ? 6 : fem ? 7 : 8) + (puffer ? 2 : 0);
  const tx0 = cx - Math.ceil(tw / 2);
  const y0 = ground - P.jump; // shoe sole row
  const hipY = y0 - 2 - legH - P.bob + (P.crouch ? 5 : P.dip) + (P.sit ? legH - 2 : 0);
  const shoulderY = hipY - torsoH + 1 + (elder ? 1 : 0);
  const lean = P.lean;
  const headY = shoulderY - 1 - headH;
  const hx0 = cx - Math.floor(headW / 2) + (elder ? 1 : 0) + lean;
  const topSlot = coat ? S.COAT : S.TOP;
  const bareArms = !coat && (tpl.top === 'tank' || tpl.top === 'jersey');
  const shortSleeve = !coat && tpl.top === 'tee';
  const upperArmSlot = bareArms ? S.SKIN : topSlot;
  const foreArmSlot = bareArms || shortSleeve ? S.SKIN : topSlot;
  const legW = kid ? 2 : 3;
  const ls = (y) => (lean && y < shoulderY + torsoH / 2 ? 1 : 0);
  const tset = (x, y, slot, sh = 128) => sp.set(x + ls(y), y, slot, sh);
  const limbShade = (base, k, n) => base + (k === 0 ? 14 : k === n - 1 ? -16 : 0);

  // ---- legs
  const drawLeg = (hx, dx, lift, far) => {
    const base = far ? 96 : 128;
    if (P.sit) {
      const kneeX = hx + (kid ? 5 : 7);
      for (let x = hx; x <= kneeX; x++) for (let k = 0; k < legW; k++) sp.set(x, hipY + 1 + k, (skirt || dress) && x > hx + 3 ? S.SKIN : S.BOTTOM, limbShade(base, k, legW));
      const shinTop = hipY + 1 + legW, shinBot = sp.h - 3;
      const sx = kneeX - legW + 1;
      for (let y = shinTop; y <= shinBot; y++) {
        let slot = shorts || skirt || dress ? S.SKIN : S.BOTTOM;
        if (shorts && y >= shinBot - 1) slot = S.SOCK;
        for (let k = 0; k < legW; k++) sp.set(sx + k, y, slot, limbShade(base, k, legW));
      }
      for (let k = 0; k <= legW; k++) sp.set(sx + k, shinBot + 1, S.SHOES, base + 8);
      for (let k = -1; k <= legW + 1; k++) sp.set(sx + k, shinBot + 2, S.SHOES, base - 18);
      return;
    }
    const top = hipY + 1, bot = y0 - 2 - lift;
    const n = Math.max(1, bot - top);
    const kneeY = top + Math.round(n * 0.5);
    const kx = hx + dx * 0.5 + lift * 0.8 + (P.crouch ? 3 : 0);
    const fx = hx + dx - lift * 0.6;
    let lastX = hx;
    for (let y = top; y <= bot; y++) {
      const x = Math.round(y <= kneeY ? hx + (kx - hx) * ((y - top) / Math.max(1, kneeY - top)) : kx + (fx - kx) * ((y - kneeY) / Math.max(1, bot - kneeY)));
      const t = (y - top) / n;
      let slot = S.BOTTOM;
      if (shorts && t > 0.42) slot = S.SKIN;
      if ((skirt || dress) && t > 0.2) slot = S.SKIN;
      if (shorts && y >= bot - 1) slot = S.SOCK;
      for (let k = 0; k < legW; k++) sp.set(x + k, y, slot, limbShade(base, k, legW));
      lastX = x;
    }
    // shoe: toe forward, sole one row longer
    for (let k = 0; k <= legW; k++) sp.set(lastX + k, bot + 1, S.SHOES, base + 8);
    for (let k = -1; k <= legW + 1; k++) sp.set(lastX + k, bot + 2, S.SHOES, base - 18);
  };

  // ---- arms
  const drawArm = (far, state) => {
    const sx = (far ? tx0 - 1 : tx0 + tw - 1) + lean;
    const sy = shoulderY + 1;
    let e, hnd;
    if (state === 'out') { const s = far ? -1 : 1; e = [3 * s, 1]; hnd = [6 * s, 2]; }
    else [e, hnd] = ARMS[state] || ARMS.down;
    const k = kid ? 0.72 : 1;
    const E = [sx + Math.round(e[0] * k), sy + Math.round(e[1] * k)];
    const H = [sx + Math.round(hnd[0] * k), sy + Math.round(hnd[1] * k)];
    const base = far ? 94 : 130;
    const seg = (a, b, slot) => {
      const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
      for (let i = 0; i <= n; i++) {
        const x = Math.round(a[0] + ((b[0] - a[0]) * i) / n), y = Math.round(a[1] + ((b[1] - a[1]) * i) / n);
        sp.set(x, y, slot, base + 10);
        sp.set(x + 1, y, slot, base - 14);
      }
    };
    seg([sx, sy], E, upperArmSlot);
    if (puffer) seg([sx - 1, sy], [E[0] - 1, E[1]], S.COAT);
    seg(E, H, foreArmSlot);
    if (!coat && !bareArms && !shortSleeve) { sp.set(H[0], H[1] + (H[1] >= E[1] ? -1 : 1), topSlot, base - 22); }
    sp.set(H[0], H[1], S.SKIN, base + 6); sp.set(H[0] + 1, H[1], S.SKIN, base - 10);
    sp.set(H[0], H[1] + 1, S.SKIN, base - 4); sp.set(H[0] + 1, H[1] + 1, S.SKIN, base - 20);
    if (state === 'phone') {
      sp.set(H[0] + 1, H[1] - 1, S.DARK, 128); sp.set(H[0] + 1, H[1] - 2, S.DARK, 128); sp.set(H[0] + 2, H[1] - 2, S.DARK, 110);
      sp.set(H[0] + 2, H[1] - 1, S.WHITE, 120);
    }
    return H;
  };

  drawArm(true, P.la);
  drawLeg(tx0 + 1, P.lx, P.ll, true);
  drawLeg(cx, P.rx, P.rl, false);
  // skirt / dress flare and long-coat skirts over the thighs
  if (skirt || dress) {
    const len = kid ? 3 : dress ? 6 : 5;
    for (let r = 0; r < len; r++) {
      const flare = Math.floor(r / 2);
      for (let x = tx0 - flare; x <= tx0 + tw - 1 + flare; x++) sp.set(x, hipY + 1 + r, S.BOTTOM, x <= tx0 - flare + 1 ? 146 : x >= tx0 + tw - 2 + flare ? 100 : (x + r) % 4 === 0 ? 112 : 124);
    }
  }
  if (longCoat && !P.sit) {
    const len = kid ? 3 : 6;
    for (let r = 0; r < len; r++) for (let x = tx0 - (r > 2 ? 1 : 0); x <= tx0 + tw - 1; x++) sp.set(x, hipY + 1 + r, S.COAT, x <= tx0 ? 146 : x >= tx0 + tw - 2 ? 100 : 122);
  }
  // ---- torso
  for (let y = shoulderY; y <= hipY; y++) {
    const r = y - shoulderY;
    let x0 = tx0, x1 = tx0 + tw - 1;
    if (r === 0) { x0++; x1--; }
    if (fem && !coat && r > torsoH * 0.35 && r < torsoH * 0.75) x0++;
    for (let x = x0; x <= x1; x++) {
      const rel = (x - tx0) / (tw - 1);
      let sh = rel < 0.18 ? 150 : rel > 0.82 ? 98 : rel > 0.6 ? 114 : 130;
      let slot = dress ? S.BOTTOM : topSlot;
      if (y === hipY && !coat && !dress) slot = S.BOTTOM;
      if (puffer && r % 3 === 2) sh -= 20;
      tset(x, y, slot, sh);
    }
  }
  // ---- clothing details
  if (!coat) {
    if (front && (tpl.top === 'tee' || tpl.top === 'tank' || tpl.top === 'jersey' || dress)) {
      tset(cx - 1, shoulderY, S.SKIN, 122); tset(cx, shoulderY, S.SKIN, 112);
      if (tpl.top === 'tank') tset(cx + 1, shoulderY, S.SKIN, 104);
    }
    if (tpl.top === 'stripe' && !dress) {
      for (let y = shoulderY + 1; y < hipY; y++) if ((y - shoulderY) % 3 === 1) for (let x = tx0; x < tx0 + tw; x++) if (sp.get(x + ls(y), y) === S.TOP) tset(x, y, S.TOP2, x === tx0 ? 146 : x >= tx0 + tw - 2 ? 100 : 124);
    }
    if (tpl.top === 'jersey') {
      for (let x = tx0 + 1; x < tx0 + tw - 1; x++) if (!front || x < cx - 1 || x > cx) tset(x, shoulderY, S.TOP2, 120);
      const glyph = front ? ['XX', '.X', 'X.', 'XX'] : ['XXX', '..X', '.XX', '..X', 'XXX'];
      glyph.forEach((row, j) => [...row].forEach((c, i) => { if (c === 'X') tset(cx - 1 + i, shoulderY + (kid ? 2 : 3) + j, S.TOP2, 140); }));
    }
    if (tpl.top === 'suit') {
      if (front) {
        for (let j = 0; j < 4; j++) for (let x = cx - 1 + Math.floor(j / 2); x <= cx + 1 - Math.floor(j / 2); x++) tset(x, shoulderY + j, S.WHITE, 132);
        for (let j = 1; j < 7; j++) tset(cx, shoulderY + j, S.TOP2, j === 1 ? 140 : 122);
        tset(cx + 1, shoulderY + 1, S.TOP2, 110);
        tset(cx + 2, hipY - 3, S.DARK, 128); tset(cx + 2, hipY - 1, S.DARK, 128);
      } else for (let y = shoulderY + 2; y < hipY; y++) tset(cx, y, S.TOP, 104);
    }
    if (tpl.top === 'uniform') {
      // duty belt with a gold buckle; badge and shoulder patch on the front
      for (let x = tx0; x < tx0 + tw; x++) tset(x, hipY - 1, S.DARK, x === tx0 ? 120 : 96);
      if (front) {
        tset(cx + 1, hipY - 1, S.ITEM, 150);
        tset(cx + 2, shoulderY + 2, S.ITEM, 165); tset(cx + 2, shoulderY + 3, S.ITEM, 128);
        for (let y = shoulderY + 1; y < hipY - 1; y++) if ((y - shoulderY) % 2 === 0) tset(cx, y, S.TOP2, 140);
        tset(tx0 + tw - 2, hipY - 2, S.DARK, 110);
      } else {
        for (let y = shoulderY + 1; y < hipY - 1; y++) tset(cx, y, S.TOP, 108);
        tset(tx0 + 1, shoulderY + 1, S.ITEM2, 120);
      }
    }
  } else {
    if (coat === 'jacket' && front) {
      for (let y = shoulderY + 1; y <= hipY; y++) { tset(cx, y, S.TOP, 128); tset(cx + 1, y, S.TOP, 112); }
      tset(cx - 1, shoulderY, S.COAT, 150); tset(cx + 2, shoulderY, S.COAT, 150);
    }
    if (puffer) {
      if (front) for (let y = shoulderY + 1; y <= hipY; y++) tset(cx + 1, y, S.COAT, 96);
      for (let x = cx - 2; x <= cx + 2; x++) tset(x, shoulderY - 1, S.COAT, x === cx - 2 ? 146 : 124);
    }
    if (longCoat) {
      if (front) for (const y of [shoulderY + 3, shoulderY + 6]) tset(cx + 1, y, S.DARK, 120);
      for (let x = tx0; x < tx0 + tw; x++) tset(x, hipY - 2, S.COAT, 92);
    }
  }
  // bags worn on the body
  if (tpl.bag === 'back') {
    if (!front) {
      const bh = kid ? 6 : 8;
      for (let y = shoulderY + 1; y <= shoulderY + bh; y++) for (let x = tx0 + 1; x < tx0 + tw - 1; x++) tset(x, y, S.BAG, x === tx0 + 1 ? 146 : x >= tx0 + tw - 2 ? 100 : 124);
      for (let x = tx0 + 2; x < tx0 + tw - 2; x++) tset(x, shoulderY + Math.round(bh * 0.6), S.BAG, 100);
      tset(cx - 1, shoulderY, S.BAG, 110); tset(cx, shoulderY, S.BAG, 110);
    } else {
      for (let y = shoulderY; y <= shoulderY + 3; y++) { tset(tx0 + 1, y, S.BAG, 104); tset(tx0 + tw - 2, y, S.BAG, 104); }
      for (let y = shoulderY + 1; y <= shoulderY + (kid ? 5 : 7); y++) { tset(tx0 - 1, y, S.BAG, 112); tset(tx0 - 2, y, S.BAG, 96); }
    }
  }
  if (tpl.bag === 'shoulder') {
    for (let j = 0; j < torsoH - 2; j++) tset(tx0 + 1 + Math.round((j * (tw - 3)) / (torsoH - 3)), shoulderY + j, S.BAG, 100);
    const bx = front ? tx0 + tw - 2 : tx0 - 2, by = hipY - 2;
    for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 4; x++) sp.set(x, y, S.BAG, x === bx ? 146 : y === by + 3 ? 100 : 120);
  }
  if (tpl.scarf) {
    for (let x = cx - 2; x <= cx + 2; x++) { tset(x, shoulderY - 1, S.SCARF, x === cx - 2 ? 146 : 124); tset(x, shoulderY, S.SCARF, x === cx - 2 ? 140 : 112); }
    if (front) for (let j = 1; j <= 4; j++) { tset(cx + 1, shoulderY + j, S.SCARF, 120); tset(cx + 2, shoulderY + j, S.SCARF, 100); }
    else for (let j = 1; j <= 3; j++) tset(cx - 2, shoulderY + j, S.SCARF, 112);
  }
  // ---- head
  if (!tpl.scarf && !puffer) for (let x = cx - 1; x <= cx + 1; x++) sp.set(x + lean + (elder ? 1 : 0), shoulderY - 1, S.SKIN, x === cx + 1 ? 104 : 120);
  headRows.forEach((row, r) => {
    for (let c = 0; c < headW; c++) if (row[c] === 'X') sp.set(hx0 + c, headY + r, S.SKIN, c === 0 ? 144 : c >= headW - 2 ? 112 : 130);
  });
  const ey = headY + 3;
  if (front) {
    sp.set(hx0 + headW - 2, ey, S.DARK, 128);
    sp.set(hx0 + headW - 4, ey, S.DARK, 128);
    sp.set(hx0 + headW, ey + 1, S.SKIN, 112); // nose in profile
    sp.set(hx0 + headW - 3, headY + headH - 2, S.SKIN, 92); // mouth
    sp.set(hx0 + 1, ey + 1, S.SKIN, 100); // ear
    if (tpl.glasses) {
      for (let c = headW - 5; c < headW; c++) sp.set(hx0 + c, ey, S.DARK, 128);
      sp.set(hx0 + headW - 4, ey, S.WHITE, 104); sp.set(hx0 + headW - 2, ey, S.WHITE, 104);
    }
  }
  // hair
  const H = (c, r, sh = 128) => sp.set(hx0 + c, headY + r, S.HAIR, sh);
  const hair = tpl.hair;
  if (hair !== 'bald') {
    for (let c = 1; c < headW - 1; c++) H(c, -1, 146);
    if (front) {
      for (let c = 0; c < headW; c++) H(c, 0, c < 2 ? 142 : 126);
      for (let c = 0; c < headW - 1; c++) H(c, 1, c < 2 ? 130 : 116);
      for (let c = 0; c < 3; c++) H(c, 2, 112);
      H(0, 3, 108); H(1, 3, 100); H(0, 4, 100);
    } else {
      for (let r = 0; r < headH - 2; r++) for (let c = 0; c < headW; c++) if (headRows[r][c] === 'X') H(c, r, c === 0 ? 140 : c >= headW - 2 ? 104 : 122 - r * 2);
    }
    if (hair === 'long') {
      if (front) for (let r = 1; r < headH + 3; r++) { H(-1, r, 110); H(0, r, 120); if (r < headH + 1) H(1, r, r > 4 ? 112 : 120); }
      else for (let r = headH - 2; r < headH + 3; r++) for (let c = 0; c < headW - 1; c++) H(c, r, c === 0 ? 136 : 112);
    }
    if (hair === 'pony') {
      const pts = front ? [[-1, 1], [-2, 2], [-2, 3], [-2, 4], [-1, 5], [-2, 6]] : [[2, headH - 2], [3, headH - 2], [2, headH - 1], [3, headH - 1], [3, headH], [3, headH + 1]];
      for (const [c, r] of pts) { H(c, r, 124); H(c + 1, r, 104); }
    }
    if (hair === 'afro') {
      const ccx = headW / 2 - (front ? 0.5 : 0), ccy = 1.5;
      for (let r = -4; r < (front ? 5 : headH - 1); r++)
        for (let c = -2; c < headW + 2; c++) {
          const dx = (c + 0.5 - ccx) / (headW / 2 + 1.6), dy = (r + 0.5 - ccy) / 4.6;
          if (dx * dx + dy * dy > 1) continue;
          if (front && c >= 3 && r >= 2) continue;
          H(c, r, (c * 3 + r * 5) % 7 === 0 ? 108 : dx < -0.3 || dy < -0.5 ? 146 : 124);
        }
    }
    if (hair === 'bun') for (const [c, r] of [[1, -3], [2, -3], [0, -2], [1, -2], [2, -2], [3, -2]]) H(c + (front ? 0 : 1), r, r === -3 ? 146 : 124);
    if (hair === 'spiky') { for (const c of [1, 3, 5]) H(c, -2, 140); H(3, -3, 146); H(1, -3, 120); }
  } else if (front) { H(0, 3, 110); H(0, 4, 104); H(1, 3, 100); }
  else for (let c = 0; c < headW; c++) { H(c, 3, 108); H(c, 4, 100); }
  // hats
  const hat = tpl.hat;
  const HT = (c, r, sh = 128, slot = S.HAT) => sp.set(hx0 + c, headY + r, slot, sh);
  if (hat === 'beanie') {
    for (let r = -2; r <= 1; r++) for (let c = r === -2 ? 1 : 0; c < headW - (r === -2 ? 1 : 0); c++) HT(c, r, r <= -1 ? 146 - c * 3 : 122 - c * 2);
    for (let c = 0; c < headW; c++) HT(c, 2, c === 0 ? 128 : 104);
    for (const [c, r] of [[2, -4], [3, -4], [4, -4], [2, -3], [3, -3], [4, -3]]) HT(c, r, r === -4 ? 150 : 120, S.WHITE);
  } else if (hat === 'cap') {
    for (let r = -2; r <= 0; r++) for (let c = r === -2 ? 1 : 0; c < headW - (r === -2 ? 1 : 0); c++) HT(c, r, r === -2 ? 148 : 128 - c * 2);
    if (front) for (let c = 3; c <= headW + 1; c++) HT(c, 1, c > headW - 1 ? 104 : 112);
    else { HT(2, 0, 90, S.DARK); HT(3, 0, 90, S.DARK); }
    HT(3, -3, 150);
  } else if (hat === 'fedora') {
    for (let c = -2; c <= headW + 1; c++) HT(c, 0, c < 0 ? 120 : 104);
    for (let r = -4; r <= -1; r++) for (let c = r === -4 ? 1 : 0; c < headW - (r === -4 ? 1 : 0); c++) HT(c, r, r === -4 ? 146 : c === 0 ? 140 : 122);
    for (let c = 0; c < headW; c++) HT(c, -1, 100, S.DARK);
    HT(3, -4, 110);
  } else if (hat === 'hood') {
    const hs = coat ? S.COAT : S.TOP;
    for (let c = 0; c < headW; c++) HT(c, -1, 140, hs);
    for (let r = 0; r < headH + 1; r++) HT(-1, r, 124, hs);
    if (front) {
      for (let r = 0; r < headH; r++)
        for (let c = 0; c < headW; c++) {
          if (headRows[r][c] !== 'X') continue;
          if (c >= 3 && r >= 2) continue;
          HT(c, r, c === 0 ? 136 : 118, hs);
        }
      HT(headW - 1, 1, 104, hs); HT(headW, 1, 96, hs);
    } else for (let r = 0; r < headH + 1; r++) for (let c = 0; c < headW; c++) HT(c, r, c === 0 ? 136 : c >= headW - 2 ? 104 : 120, hs);
  } else if (hat === 'witch') {
    for (let c = -3; c <= headW + 2; c++) HT(c, 0, c < 0 ? 120 : 104);
    for (let k = 0; k < 8; k++) {
      const half = Math.max(0, 3 - k * 0.4), ccx = 3 - k * 0.35;
      for (let c = Math.round(ccx - half); c <= Math.round(ccx + half); c++) HT(c, -1 - k, c < ccx ? 140 : 118);
    }
    for (let c = 0; c < headW; c++) HT(c, -1, 128, S.ITEM);
  } else if (hat === 'police') {
    // peaked uniform cap: flat crown a touch wider than the head, black band and visor, gold badge
    for (let c = -1; c <= headW; c++) HT(c, -2, c < 1 ? 150 : 134);
    for (let r = -1; r <= 0; r++) for (let c = 0; c < headW; c++) HT(c, r, r === -1 ? 130 - c * 2 : 114);
    for (let c = 0; c < headW; c++) HT(c, 1, 84, S.DARK);
    if (front) { for (let c = 3; c <= headW + 1; c++) HT(c, 2, 70, S.DARK); HT(headW - 2, -1, 165, S.ITEM); }
  } else if (hat === 'helmet') {
    for (let r = -2; r <= 1; r++) for (let c = r === -2 ? 1 : -1; c <= headW - (r === -2 ? 1 : 0); c++) HT(c, r, r === -2 ? 150 : c < 2 ? 140 : 118);
    if (front) for (let c = headW - 1; c <= headW + 1; c++) HT(c, 2, 100);
    HT(1, -1, 170, S.WHITE);
  }
  // ---- near arm, held items
  const hand = drawArm(false, P.ra);
  if (P.ra === 'aim' || P.ra === 'aim2') {
    // a black pistol held out, kicked up a pixel on the recoil frame
    const [hx, hy] = hand, up = P.ra === 'aim2' ? 1 : 0;
    sp.set(hx + 1, hy - up, S.DARK, 132); sp.set(hx + 2, hy - up, S.DARK, 150); sp.set(hx + 3, hy - up - (up ? 1 : 0), S.DARK, 140);
    sp.set(hx + 1, hy + 1 - up, S.DARK, 92); sp.set(hx, hy + 1, S.DARK, 84);
  }
  const carrying = P.ra === 'down' || P.ra === 'fwd' || P.ra === 'back';
  if (tpl.bag === 'brief' && carrying) {
    const [hx, hy] = hand;
    sp.set(hx, hy + 2, S.BAG, 96); sp.set(hx + 1, hy + 2, S.BAG, 96);
    for (let y = hy + 3; y < hy + 7; y++) for (let x = hx - 2; x < hx + 4; x++) sp.set(x, y, S.BAG, x === hx - 2 ? 140 : y === hy + 6 ? 96 : 120);
    sp.set(hx, hy + 4, S.ITEM2, 150);
  }
  if (tpl.bag === 'shopping' && carrying) {
    const [hx, hy] = hand;
    sp.set(hx - 1, hy + 2, S.BAG, 100); sp.set(hx + 2, hy + 2, S.BAG, 100);
    for (let y = hy + 3; y < hy + 9; y++) for (let x = hx - 1; x < hx + 4; x++) sp.set(x, y, S.BAG, x === hx - 1 ? 146 : x === hx + 3 ? 100 : y === hy + 3 ? 136 : 122);
  }
  if (elder && tpl.cane) {
    const [hx, hy] = hand;
    sp.set(hx + 1, hy - 1, S.DARK, 120); sp.set(hx + 2, hy - 1, S.DARK, 110);
    for (let y = hy; y <= y0; y++) sp.set(hx + 2, y, S.DARK, 110);
  }
}

function paintLying(sp, tpl) {
  // lying on a towel, head to the left
  const g = sp.h - 1;
  for (let x = 1; x < sp.w - 1; x++) for (let y = g - 2; y <= g; y++) sp.set(x, y, S.ITEM2, (x >> 2) % 2 ? 128 : 100);
  const y = g - 6;
  const legC = tpl.bottom === 'pants' ? S.BOTTOM : S.SKIN;
  sp.ellipse(5.5, y + 2, 3, 2.6, S.SKIN, 128);
  for (let x = 3; x <= 6; x++) sp.set(x, y - 1, S.HAIR, 128);
  sp.set(2, y, S.HAIR, 120); sp.set(2, y + 1, S.HAIR, 110); sp.set(2, y + 2, S.HAIR, 104);
  sp.set(6, y + 1, S.DARK, 128); sp.set(7, y + 1, S.DARK, 128); sp.set(8, y + 2, S.SKIN, 110);
  for (let x = 9; x <= 17; x++) for (let r = 0; r < 4; r++) sp.set(x, y + r, S.TOP, r === 0 ? 146 : r === 3 ? 100 : 124);
  for (let x = 18; x <= 21; x++) for (let r = 0; r < 4; r++) sp.set(x, y + r, S.BOTTOM, r === 0 ? 140 : 110);
  for (let x = 22; x <= 28; x++) { sp.set(x, y + 1, legC, 136); sp.set(x, y + 2, legC, 116); sp.set(x, y + 3, legC, 100); }
  sp.set(29, y, S.SKIN, 128); sp.set(29, y + 1, S.SKIN, 116);
  for (let x = 10; x <= 16; x++) sp.set(x, y + 3, S.SKIN, 112);
}

// sprawled on the ground (knocked down, or worse), head to the left, nothing underneath
function paintDown(sp, tpl) {
  const g = sp.h - 1, kid = tpl.body === 'kid';
  const k = kid ? 0.74 : 1, X = (v) => Math.round(3 + v * k);
  const y = g - 4;
  const topC = tpl.coat ? S.COAT : S.TOP;
  const legC = tpl.bottom === 'shorts' || tpl.bottom === 'skirt' || tpl.bottom === 'dress' ? S.SKIN : S.BOTTOM;
  const bare = !tpl.coat && (tpl.top === 'tank' || tpl.top === 'jersey' || tpl.top === 'tee');
  // far arm flung up past the head, far leg bent at the knee
  for (let i = 0; i <= 5; i++) sp.set(X(7 + i * 0.45), y - 1 - i, i > 2 && bare ? S.SKIN : topC, 100);
  sp.set(X(9.7), y - 7, S.SKIN, 110); sp.set(X(10.2), y - 7, S.SKIN, 94);
  for (let i = 0; i <= 4; i++) sp.set(X(18 + i), y - Math.min(i, 2), legC, 98);
  for (let i = 0; i <= 3; i++) sp.set(X(22 + i), y - 2 + i, legC, 94);
  sp.set(X(26), y + 1, S.SHOES, 110); sp.set(X(26.7), y + 1, S.SHOES, 90);
  // torso and hips
  for (let x = X(7); x <= X(15); x++) for (let r = -1; r <= 2; r++) sp.set(x, y + r, topC, r === -1 ? 146 : r === 2 ? 98 : 124);
  if (tpl.top === 'uniform') { for (let r = -1; r <= 2; r++) sp.set(X(15), y + r, S.DARK, 100); sp.set(X(10), y - 1, S.ITEM, 165); }
  for (let x = X(15) + 1; x <= X(18); x++) for (let r = -1; r <= 2; r++) sp.set(x, y + r, S.BOTTOM, r === -1 ? 138 : 108);
  // near leg straight out, near arm along the side
  for (let x = X(18) + 1; x <= X(26); x++) { sp.set(x, y + 1, legC, 132); sp.set(x, y + 2, legC, 108); }
  sp.set(X(27), y + 1, S.SHOES, 128); sp.set(X(27), y + 2, S.SHOES, 100); sp.set(X(27.7), y + 2, S.SHOES, 90);
  for (let x = X(8); x <= X(13); x++) sp.set(x, y + 3, bare && x > X(10) ? S.SKIN : topC, 112);
  sp.set(X(14), y + 3, S.SKIN, 120); sp.set(X(14.6), y + 3, S.SKIN, 100);
  // head on its side
  sp.ellipse(X(4.2), y + 0.5, 2.7 * (kid ? 0.9 : 1), 2.3, S.SKIN, 124);
  if (tpl.hair !== 'bald') {
    for (let x = X(1.6); x <= X(4); x++) { sp.set(x, y - 2, S.HAIR, 136); sp.set(x - 1, y - 1, S.HAIR, 120); }
    sp.set(X(1.6) - 1, y, S.HAIR, 110); sp.set(X(1.6) - 1, y + 1, S.HAIR, 104);
    if (tpl.hair === 'long' || tpl.hair === 'pony' || tpl.hair === 'afro') for (let x = X(0.6); x <= X(3.5); x++) sp.set(x, y + 3, S.HAIR, 108);
  }
  sp.set(X(5.3), y, S.DARK, 104);
  // a hat knocked off beside the head
  if (tpl.hat) for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, -1]]) sp.set(X(-0.6) + dx, g - 1 + dy, S.HAT, 120);
}

// poses only some people ever need, painted the first time they are asked for
const LAZY_POSES = { aim: { n: 2, back: true }, down: { n: 1, back: false, w: 32 } };
export function personPose(atlas, frames, anim) {
  if (frames.front[anim]) return frames;
  const L = LAZY_POSES[anim];
  try {
    if (!L || !frames.tpl) throw new Error('no pose');
    for (const view of ['front', 'back']) {
      if (view === 'back' && !L.back) { frames.back[anim] = frames.front[anim]; continue; }
      const arr = [], fw = L.w || PW;
      for (let f = 0; f < L.n; f++) arr.push(atlas.add(null, fw, PH, (sp) => { paintPerson(sp, frames.tpl, anim, f, view, 0); selOut(sp); }, Math.floor(fw / 2), PH - 1));
      frames[view][anim] = arr;
    }
  } catch (e) {
    // atlas full: make do with an existing pose
    const alt = anim === 'down' ? 'lie' : 'idle';
    frames.front[anim] = frames.front[alt]; frames.back[anim] = frames.back[alt] || frames.front[alt];
  }
  return frames;
}

// Generates all frames for a template; returns { front: {anim: [frames]}, back: {...} }
const TEMPLATE_BUDGET = 110;
export function personTemplate(atlas, tpl) {
  const key = 'p:' + JSON.stringify(tpl);
  const cached = atlas.frames.get(key);
  if (cached) return cached;
  if (atlas.templates.length >= TEMPLATE_BUDGET || atlas.full) {
    // reuse the most similar existing template (palettes keep people looking different)
    let best = null, bs = -1;
    for (const t of atlas.templates) {
      let sc = 0;
      if (t.tpl.body === tpl.body) sc += 10;
      if (!!t.tpl.coat === !!tpl.coat) sc += 6;
      if (t.tpl.hat === tpl.hat) sc += 3;
      if (t.tpl.bottom === tpl.bottom) sc += 2;
      if (t.tpl.top === tpl.top) sc += 2;
      if (t.tpl.hair === tpl.hair) sc += 1;
      if (t.tpl.bag === tpl.bag) sc += 1;
      if (sc > bs) { bs = sc; best = t; }
    }
    if (best) return best.out;
  }
  const out = { front: {}, back: {}, tpl };
  for (const anim in POSES) {
    for (const view of ['front', 'back']) {
      if (view === 'back' && !BACK_POSES[anim]) { out.back[anim] = out.front[anim]; continue; }
      const arr = [];
      for (let f = 0; f < POSES[anim]; f++) {
        const fw = anim === 'lie' ? 32 : PW;
        const ext = anim === 'sit' ? SIT_EXT : 0;
        arr.push(atlas.add(null, fw, PH + ext, (sp) => { paintPerson(sp, tpl, anim, f, view, ext); selOut(sp); }, Math.floor(fw / 2), PH - 1));
      }
      out[view][anim] = arr;
    }
  }
  atlas.frames.set(key, out);
  atlas.templates.push({ tpl, out });
  return out;
}

// ---------------------------------------------------------------------------
// ANIMALS (2x)
export const DOG_BREEDS = {
  small: { len: 10, hgt: 6, leg: 4, head: 6, ears: 'up', tail: 'up' },
  terrier: { len: 12, hgt: 6, leg: 4, head: 6, ears: 'up', tail: 'up', wiry: true },
  medium: { len: 14, hgt: 7, leg: 6, head: 6, ears: 'flop', tail: 'up' },
  large: { len: 18, hgt: 8, leg: 8, head: 7, ears: 'flop', tail: 'out' },
  dachshund: { len: 18, hgt: 6, leg: 2, head: 6, ears: 'flop', tail: 'out' },
  poodle: { len: 12, hgt: 7, leg: 6, head: 6, ears: 'flop', tail: 'pom', fluffy: true },
  husky: { len: 16, hgt: 8, leg: 6, head: 7, ears: 'up', tail: 'curl', mask: true },
};
export const dogFrameSize = (breed) => {
  const B = DOG_BREEDS[breed];
  return [B.len + 16, B.hgt + B.leg + B.head + 6];
};

export function paintDog(sp, breed, anim, f) {
  const B = DOG_BREEDS[breed];
  const g = sp.h - 1;
  const x0 = 5;
  const legTop = g - B.leg + 1;
  const bodyTop = legTop - B.hgt;
  const sit = anim === 'sit', sniff = anim === 'sniff', run = anim === 'run', walk = anim === 'walk';
  const xEnd = x0 + B.len - 1;
  // when sitting the rump drops to the ground
  const drop = (x) => (sit ? Math.round((1 - (x - x0) / B.len) * (B.leg + 1)) : 0);
  // legs (far pair first, then body, then near pair)
  const legs = [
    { x: x0 + 1, far: true, ph: 0 }, { x: xEnd - 4, far: true, ph: 1 },
    { x: x0 + 3, far: false, ph: 2 }, { x: xEnd - 2, far: false, ph: 3 },
  ];
  const drawLeg = (L) => {
    if (sit && L.x < x0 + B.len / 2) return;
    let dx = 0, lift = 0;
    if (walk) { const p = (f + L.ph) % 4; dx = [1, 0, -1, 0][p]; lift = p === 1 ? 1 : 0; }
    if (run) { const p = (f + (L.ph >> 1)) % 2; dx = p ? 2 : -2; lift = p ? 1 : 0; }
    const sh = L.far ? 96 : 124, slot = L.far ? S.BODY_D : S.BODY;
    for (let y = legTop - 1; y <= g - lift; y++) {
      const t = (y - legTop) / Math.max(1, g - legTop);
      const xx = L.x + Math.round(dx * Math.max(0, t));
      sp.set(xx, y, slot, sh + 10); sp.set(xx + 1, y, slot, sh - 12);
    }
    sp.set(L.x + dx + 2, g - lift, slot, sh - 6); // paw
  };
  legs.filter((L) => L.far).forEach(drawLeg);
  // body
  for (let x = x0; x <= xEnd; x++)
    for (let y = bodyTop; y < legTop; y++) {
      const ry = (y - bodyTop) / Math.max(1, B.hgt - 1);
      if ((x === x0 || x === xEnd) && (y === bodyTop || y === legTop - 1)) continue;
      let slot = ry > 0.72 && x > x0 + 2 && x < xEnd - 2 ? S.BODY_L : S.BODY;
      if (B.mask && ry > 0.6) slot = S.BODY_L;
      let sh = ry < 0.2 ? 148 : ry > 0.8 ? 104 : 126;
      if (B.fluffy || B.wiry) sh += hash2i(x, y, 3) < 0.35 ? 16 : hash2i(x, y, 4) < 0.25 ? -14 : 0;
      sp.set(x, y + drop(x), slot, sh);
    }
  if (B.fluffy) for (let x = x0 + 1; x < xEnd; x++) if (hash2i(x, 0, 5) < 0.6) sp.set(x, bodyTop - 1 + drop(x), S.BODY, 150);
  if (sit) for (let x = x0; x < x0 + 5; x++) sp.set(x, g, S.BODY_D, 100); // folded hind leg
  legs.filter((L) => !L.far).forEach(drawLeg);
  // head
  const hw = B.head + 1;
  const hx = xEnd - 2, hy = (sniff ? legTop - 2 : bodyTop - B.head + 3) - (sit ? 2 : 0);
  for (let y = hy; y < hy + B.head; y++)
    for (let x = hx; x < hx + hw; x++) {
      if ((x === hx || x === hx + hw - 1) && (y === hy || y === hy + B.head - 1)) continue;
      sp.set(x, y, B.mask && y > hy + 2 ? S.BODY_L : S.BODY, y === hy ? 148 : x === hx + hw - 1 ? 110 : 130);
    }
  // snout + nose
  const sy = hy + B.head - 3;
  for (let x = hx + hw - 1; x < hx + hw + 2; x++) { sp.set(x, sy, S.BODY, 132); sp.set(x, sy + 1, S.BODY_L, 116); }
  sp.set(hx + hw + 2, sy, S.NOSE, 128); sp.set(hx + hw + 1, sy - 1, S.BODY, 120);
  sp.set(hx + hw - 2, hy + 2, S.EYE, 128);
  if (run) sp.set(hx + hw, sy + 2, S.COLLAR, 150); // tongue out (collar slot is bright)
  if (B.ears === 'up') { sp.set(hx + 1, hy - 1, S.BODY_D, 128); sp.set(hx + 2, hy - 1, S.BODY_D, 116); sp.set(hx + 1, hy - 2, S.BODY_D, 110); }
  else for (let y = hy + 1; y < hy + 5; y++) { sp.set(hx, y, S.BODY_D, 104); sp.set(hx + 1, y, S.BODY_D, 116); }
  for (let y = hy + B.head - 2; y < Math.min(legTop, hy + B.head + 2); y++) { sp.set(hx - 1, y, S.COLLAR, 128); sp.set(hx, y, S.COLLAR, 110); }
  // tail
  const ty = bodyTop + drop(x0);
  const wag = f % 2;
  if (B.tail === 'up') for (let k = 0; k < 4; k++) { sp.set(x0 - 1 - (k >> 1) + (k === 3 ? wag : 0), ty - k, S.BODY, 134); sp.set(x0 - (k >> 1), ty - k, S.BODY, 116); }
  else if (B.tail === 'out') for (let k = 0; k < 5; k++) sp.set(x0 - 1 - k, ty + 1 + (k > 2 ? wag : 0), S.BODY, 128 - k * 4);
  else if (B.tail === 'pom') { sp.set(x0 - 1, ty, S.BODY, 128); sp.set(x0 - 2, ty - 1, S.BODY, 128); sp.ellipse(x0 - 3, ty - 3 - wag, 1.6, 1.6, S.BODY, 150); }
  else for (const [dx, dy] of [[-1, 0], [-1, -1], [0, -2], [1, -3], [2, -3], [3, -2 + wag]]) { sp.set(x0 + dx, ty + dy, S.BODY_L, 140); sp.set(x0 + dx, ty + dy + 1, S.BODY, 120); }
}

export function paintPigeon(sp, anim, f) {
  const g = sp.h - 1;
  if (anim === 'fly') {
    const up = f % 2 === 0;
    const by = g - 7;
    sp.ellipse(8.5, by, 5, 2.2, S.BODY, 128);
    for (let x = 5; x < 12; x++) sp.set(x, by + 2, S.BODY_L, 112);
    for (const [x, y] of [[3, by - 1], [2, by - 1], [2, by], [1, by], [2, by + 1], [3, by + 1]]) sp.set(x, y, S.BODY_D, 110);
    sp.ellipse(14, by - 1, 1.8, 1.6, S.BODY_D, 124);
    sp.set(12, by, S.ACCENT, 128); sp.set(13, by, S.ACCENT, 112);
    sp.set(15, by - 2, S.EYE, 128); sp.set(16, by - 1, S.BEAK, 128); sp.set(17, by - 1, S.BEAK, 110);
    if (up) {
      for (let k = 0; k < 6; k++) { const x = 8 - (k >> 1); sp.set(x - 1, by - 2 - k, S.BODY_L, 150 - k * 4); sp.set(x, by - 2 - k, S.BODY_L, 136); sp.set(x + 1, by - 2 - k, S.BODY_D, 116); }
      sp.set(4, by - 8, S.BODY_D, 110); sp.set(5, by - 8, S.BODY_D, 110);
    } else {
      for (let k = 0; k < 5; k++) { const x = 8 - (k >> 1); sp.set(x - 1, by + 1 + k, S.BODY_L, 124); sp.set(x, by + 1 + k, S.BODY_D, 110); }
    }
    return;
  }
  const peck = anim === 'peck' && f === 1;
  const bob = anim === 'walk' && f === 1 ? 1 : 0;
  const by = g - 4;
  sp.ellipse(6.5, by, 4.6, 2.6, S.BODY, 128);
  for (let x = 4; x <= 9; x++) { sp.set(x, by - 1, S.BODY_L, 140); sp.set(x, by, S.BODY_L, 126); }
  sp.set(6, by, S.BODY_D, 104); sp.set(8, by, S.BODY_D, 104); sp.set(7, by - 1, S.BODY_D, 112);
  for (let x = 4; x <= 9; x++) sp.set(x, by + 2, S.BODY_L, 104);
  sp.set(1, by - 1, S.BODY_D, 120); sp.set(2, by - 1, S.BODY_D, 120); sp.set(1, by, S.BODY_D, 104); sp.set(0, by - 1, S.BODY_D, 100);
  const hx = 10 + bob, hy = peck ? by + 1 : by - 3;
  sp.set(10, by - 1, S.ACCENT, 136); sp.set(10, by - 2, S.ACCENT, 120); sp.set(11, by - 1, S.ACCENT, 112);
  sp.ellipse(hx + 1.5, hy, 1.9, 1.7, S.BODY_D, 126);
  sp.set(hx + 2, hy - 1, S.EYE, 128);
  sp.set(hx + 3, hy + (peck ? 1 : 0), S.BEAK, 128); sp.set(hx + 4, hy + (peck ? 1 : 0), S.BEAK, 108);
  sp.set(hx + 3, hy - 1 + (peck ? 1 : 0), S.BODY_L, 150);
  const st = anim === 'walk' ? f % 2 : 0;
  sp.set(5, by + 3, S.BEAK, 110); sp.set(5 - st, by + 4, S.BEAK, 104); sp.set(6 - st, by + 4, S.BEAK, 96);
  sp.set(8, by + 3, S.BEAK, 120); sp.set(8 + st, by + 4, S.BEAK, 110); sp.set(9 + st, by + 4, S.BEAK, 100);
}

export function paintCat(sp, anim, f) {
  const g = sp.h - 1;
  if (anim === 'sit') {
    sp.ellipse(5, g - 4, 3.6, 4.2, S.BODY, 124);
    sp.ellipse(5.5, g - 1.5, 3.2, 1.8, S.BODY, 116);
    for (let y = g - 7; y <= g - 2; y++) sp.set(2, y, S.BODY, 146);
    sp.ellipse(7, g - 10, 2.6, 2.3, S.BODY, 130);
    sp.set(5, g - 13, S.BODY_D, 128); sp.set(5, g - 12, S.BODY, 128); sp.set(6, g - 12, S.BODY, 120);
    sp.set(8, g - 13, S.BODY_D, 128); sp.set(8, g - 12, S.BODY, 128);
    sp.set(8, g - 10, S.EYE, 128); sp.set(6, g - 10, S.EYE, 110);
    sp.set(9, g - 9, S.BODY_L, 140);
    for (let y = g - 3; y <= g; y++) sp.set(7, y, S.BODY_L, 122);
    sp.set(8, g, S.BODY_L, 116);
    const w = f % 2;
    for (let x = 1; x <= 6; x++) sp.set(x, g, S.BODY_D, 104);
    sp.set(0, g - 1 - w, S.BODY_D, 110); sp.set(1, g - 1, S.BODY_D, 110); sp.set(0, g - 2 - w, S.BODY_D, 104);
    return;
  }
  const ph = f % 2;
  const by = g - 6;
  sp.ellipse(8, by, 6, 2.6, S.BODY, 126);
  for (let x = 4; x <= 12; x++) sp.set(x, by - 2, S.BODY, 146);
  for (let x = 5; x <= 11; x++) sp.set(x, by + 2, S.BODY_L, 112);
  [[4, -1], [6, 1], [10, 1], [12, -1]].forEach(([lx, s], i) => {
    const off = ph ? s : -s;
    for (let y = by + 2; y <= g; y++) sp.set(lx + (y === g ? off : 0), y, i % 2 ? S.BODY : S.BODY_D, i % 2 ? 124 : 100);
  });
  sp.ellipse(14, by - 2, 2.6, 2.2, S.BODY, 130);
  sp.set(12, by - 5, S.BODY_D, 128); sp.set(12, by - 4, S.BODY, 128); sp.set(15, by - 5, S.BODY_D, 128); sp.set(15, by - 4, S.BODY, 128);
  sp.set(15, by - 2, S.EYE, 128); sp.set(13, by - 2, S.EYE, 110);
  sp.set(16, by - 1, S.BODY_L, 140);
  for (let k = 0; k < 6; k++) sp.set(2 - (k > 3 ? k - 3 : 0), by - 1 - k, S.BODY, 122 - k * 2);
  sp.set(0, by - 6, S.BODY_D, 110);
}

export function paintSquirrel(sp, anim, f) {
  const g = sp.h - 1;
  if (anim === 'stand') {
    sp.ellipse(7, g - 4, 2.4, 3.6, S.BODY, 126);
    sp.ellipse(8, g - 9, 2, 1.8, S.BODY, 132);
    sp.set(7, g - 11, S.BODY_D, 120);
    sp.set(9, g - 9, S.EYE, 128);
    sp.set(9, g - 6, S.BODY_L, 130); sp.set(9, g - 7, S.BODY_L, 130);
    for (let y = g - 4; y <= g - 1; y++) sp.set(8, y, S.BODY_L, 112);
    for (let k = 0; k < 9; k++) { const x = 4 - Math.round(Math.sin((k / 8) * Math.PI) * 2.5), y = g - 1 - k; sp.set(x, y, S.BODY_L, 146); sp.set(x - 1, y, S.BODY_L, 126); sp.set(x + 1, y, S.BODY_D, 112); }
    sp.set(7, g, S.BODY_D, 100); sp.set(8, g, S.BODY_D, 100);
    return;
  }
  const hop = anim === 'run' && f === 1 ? 2 : 0;
  const by = g - 3 - hop;
  sp.ellipse(7, by, 3.4, 2, S.BODY, 126);
  sp.ellipse(10.5, by - 1.5, 1.9, 1.7, S.BODY, 132);
  sp.set(10, by - 3, S.BODY_D, 120);
  sp.set(11, by - 2, S.EYE, 128);
  for (let k = 0; k < 7; k++) { const x = 3 - Math.round(Math.sin((k / 6) * Math.PI) * 2), y = by - k; sp.set(x, y, S.BODY_L, 146); sp.set(x + 1, y, S.BODY_L, 124); }
  sp.set(5 - f, by + 2, S.BODY_D, 104); sp.set(5 - f, by + 3, S.BODY_D, 96); sp.set(9 + f, by + 2, S.BODY_D, 104); sp.set(9 + f, by + 3, S.BODY_D, 96);
}

export function paintDuck(sp, anim, f) {
  const g = sp.h - 1;
  const by = g - 3;
  sp.ellipse(7, by, 5, 2.4, S.BODY, 126);
  for (let x = 4; x <= 10; x++) sp.set(x, by - 2, S.BODY_L, 142);
  for (let x = 5; x <= 9; x++) sp.set(x, by - 1, S.BODY_L, 126);
  sp.set(1, by - 2, S.BODY_D, 120); sp.set(2, by - 2, S.BODY_D, 110); sp.set(1, by - 1, S.BODY_D, 104);
  sp.set(11, by - 2, S.ACCENT, 120); sp.set(11, by - 3, S.ACCENT, 128);
  sp.ellipse(12.5, by - 5, 2, 1.8, S.ACCENT, 130);
  sp.set(13, by - 6, S.EYE, 128);
  sp.set(14, by - 5, S.BEAK, 128); sp.set(15, by - 5, S.BEAK, 116); sp.set(14, by - 4, S.BEAK, 104);
  if (anim === 'swim') for (let x = 0; x < sp.w; x++) if ((x + f * 2) % 5 < 2) sp.set(x, g, S.WHITE, 120);
}

export function paintRat(sp, f) {
  const g = sp.h - 1;
  sp.ellipse(6.5, g - 2.5, 3.6, 1.8, S.BODY, 124);
  for (let x = 4; x <= 8; x++) sp.set(x, g - 4, S.BODY, 140);
  sp.ellipse(10.5, g - 2.5, 1.6, 1.3, S.BODY, 130);
  sp.set(12, g - 2, S.BODY_L, 128);
  sp.set(10, g - 4, S.BODY_L, 120);
  sp.set(11, g - 3, S.EYE, 128);
  for (let k = 0; k < 4; k++) sp.set(2 - k, g - 2 + (k > 1 ? f : 0), S.BODY_L, 110);
  sp.set(4 + f, g, S.BODY_D, 100); sp.set(8 - f, g, S.BODY_D, 100);
}

// ---------------------------------------------------------------------------
// PROPS (generic slot colours supplied by a shared palette row)
const PI = Math.PI;
export function buildPropSprites(atlas) {
  const A = atlas;
  A.add('dish', 16, 18, (sp) => {
    for (let y = 1; y < 12; y++) for (let x = 1; x < 13; x++) {
      const d = ((x - 6.5) / 5.6) ** 2 + ((y - 6) / 4.8) ** 2;
      if (d <= 1) sp.set(x, y, x + y < 11 ? S.C1 : S.C4, d > 0.7 ? 110 : 140 - Math.round(d * 30));
    }
    for (let k = 0; k < 4; k++) sp.set(9 + k, 6 - (k >> 1), S.C3, 120);
    sp.set(13, 4, S.C3, 140); sp.set(14, 4, S.C3, 128); sp.set(13, 5, S.C3, 110);
    for (let y = 11; y < 18; y++) { sp.set(7, y, S.C3, 124); sp.set(8, y, S.C3, 96); }
    sp.set(6, 17, S.C3, 110); sp.set(9, 17, S.C3, 100);
  });
  A.add('antenna', 18, 36, (sp) => {
    for (let y = 3; y < 36; y++) { sp.set(9, y, S.C3, 124); sp.set(10, y, S.C3, 96); }
    for (let k = 0; k < 5; k++) {
      const half = 7 - k, yy = 4 + k * 5;
      for (let x = 9 - half; x <= 10 + half; x++) sp.set(x, yy, S.C3, 140 - k * 4);
      sp.set(9 - half, yy + 1, S.C3, 110); sp.set(10 + half, yy + 1, S.C3, 110);
    }
    sp.set(9, 2, S.C2, 150); sp.set(10, 2, S.C2, 128);
  });
  A.add('deckchair', 18, 12, (sp) => {
    for (let x = 1; x < 13; x++) { const y = 7 - Math.floor(x / 6); sp.set(x, y, S.C5, (x >> 1) % 2 ? 128 : 150); sp.set(x, y + 1, S.C5, 104); }
    for (let k = 0; k < 6; k++) { sp.set(13 + (k >> 1), 6 - k, S.C5, 140); sp.set(14 + (k >> 1), 6 - k, S.C5, 112); }
    for (let k = 0; k < 4; k++) { sp.set(2, 8 + k, S.C3, 110); sp.set(11, 8 + k, S.C3, 110); sp.set(15, 7 + k, S.C3, 100); }
  });
  A.add('bush', 24, 18, (sp) => {
    const blobs = [[7, 11, 6], [15, 10, 7], [11, 7, 6], [19, 12, 4.5], [4, 13, 4]];
    for (const [bx, by, r] of blobs)
      for (let y = 0; y < 18; y++)
        for (let x = 0; x < 24; x++) {
          const d = ((x + 0.5 - bx) / r) ** 2 + ((y + 0.5 - by) / (r * 0.85)) ** 2;
          if (d > 1 || (d > 0.7 && hash2i(x >> 1, y >> 1, 9) < 0.4)) continue;
          const l = (-(x - 12) / 12) * 0.5 - ((y - 9) / 9) * 0.7 + (hash2i(x >> 1, y >> 1, 4) - 0.5) * 0.6;
          sp.set(x, y, l > 0.3 ? S.C8 : l > -0.25 ? S.C9 : S.C10, 128);
        }
    for (let x = 0; x < 24; x++) for (let y = 17; y >= 10; y--) if (sp.get(x, y) >= 0 && (sp.get(x, y + 1) < 0 || sp.get(x, y + 2) < 0)) sp.set(x, y, S.C10, 110);
  });
  A.add('grill', 12, 14, (sp) => {
    for (let y = 1; y < 9; y++) for (let x = 0; x < 12; x++) {
      const d = ((x + 0.5 - 6) / 5.6) ** 2 + ((y + 0.5 - 5) / 4) ** 2;
      if (d <= 1) sp.set(x, y, S.C3, x < 4 ? 150 : x > 8 ? 100 : 124);
    }
    for (let x = 1; x < 11; x++) sp.set(x, 5, S.C4, 120);
    sp.set(5, 0, S.C4, 140); sp.set(6, 0, S.C4, 128);
    for (let k = 0; k < 5; k++) { sp.set(3 - (k >> 1), 9 + k, S.C4, 110); sp.set(8 + (k >> 1), 9 + k, S.C4, 100); sp.set(6, 9 + k, S.C4, 96); }
  });
  A.add('laundry', 52, 32, (sp) => {
    for (let y = 3; y < 32; y++) { sp.set(0, y, S.C3, 128); sp.set(1, y, S.C3, 100); sp.set(50, y, S.C3, 128); sp.set(51, y, S.C3, 100); }
    const sag = (x) => 4 + Math.round(Math.sin((x / 51) * Math.PI) * 4);
    for (let x = 1; x < 51; x++) sp.set(x, sag(x), S.C4, 128);
    const cols = [S.C5, S.C6, S.C7, S.C1, S.C2];
    const widths = [8, 6, 7, 3, 9], heights = [10, 11, 13, 5, 14];
    let x = 4;
    for (let k = 0; k < 5; k++) {
      const c = cols[k], wdt = widths[k], hgt = heights[k];
      const top = sag(x + wdt / 2) + 1;
      for (let yy = 0; yy < hgt; yy++)
        for (let xx = 0; xx < wdt; xx++) {
          if (k === 0 && yy > 3 && (xx < 2 || xx > wdt - 3)) continue;
          if (k === 2 && yy < 4 && (xx < 1 || xx > wdt - 2)) continue;
          sp.set(x + xx, top + yy, c, xx === 0 ? 146 : xx === wdt - 1 ? 104 : (xx + yy) % 5 === 0 ? 116 : 128);
        }
      sp.set(x + 1, top - 1, S.C4, 150); sp.set(x + wdt - 2, top - 1, S.C4, 150);
      x += wdt + 2;
    }
  });
  // ---- landmark statues ----
  // The Statue of Liberty: copper-green gown in folds, the stola across the body, the tablet in her
  // left arm, the torch held high in her right (its flame glows at night), the seven-rayed crown.
  A.add('liberty', 64, 184, (sp) => {
    const G = S.C1, D = S.C2, Lt = S.C3, F1 = S.C4, F2 = S.C5, Tb = S.C6;
    const g = 183;
    // gown from the bust to the hem, widening, with drapery folds; lit left edge, shadowed right
    for (let y = 66; y <= g; y++) {
      const t = (y - 66) / (g - 66);
      const half = 10 + t * 7, cx = 33 + Math.sin(t * 2.2) * 1.2;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const u = (x - (cx - half)) / (2 * half);
        const fold = Math.sin(u * 17 + t * 5 + Math.sin(t * 9) * 0.6);
        let slot = G, sh = 126;
        if (fold > 0.82) { slot = Lt; sh = 136; } else if (fold < -0.78) { slot = D; sh = 112; }
        if (u < 0.1) { slot = Lt; sh = 132; } else if (u > 0.9) { slot = D; sh = 104; }
        if (y > g - 3) { slot = D; sh = 110; }
        sp.set(x, y, slot, sh);
      }
    }
    // the stola, draped from the left shoulder across to the right hip
    for (let k = 0; k < 46; k++) for (let w = 0; w < 6; w++) sp.set(Math.round(26 + k * 0.42 + w), 70 + k, w < 2 ? Lt : w > 4 ? D : G, w < 2 ? 140 : 120);
    // shoulders, neck and head
    for (let y = 58; y < 70; y++) for (let x = 22; x < 45; x++) if (((x + 0.5 - 33) / 11.5) ** 2 + ((y + 0.5 - 70) / 11) ** 2 <= 1) sp.set(x, y, x < 28 ? Lt : x > 39 ? D : G, 128);
    for (let y = 52; y < 59; y++) for (let x = 30; x < 36; x++) sp.set(x, y, x < 32 ? Lt : G, 124);
    for (let y = 40; y < 54; y++) for (let x = 27; x < 39; x++) if (((x + 0.5 - 33) / 5.6) ** 2 + ((y + 0.5 - 47) / 6.8) ** 2 <= 1) sp.set(x, y, x < 31 ? Lt : x > 36 ? D : G, x < 31 ? 136 : 122);
    sp.set(31, 46, D, 100); sp.set(35, 46, D, 100); sp.set(33, 48, D, 110); sp.set(32, 51, D, 104); sp.set(33, 51, D, 104);
    // the crown: a band and seven rays
    for (let x = 27; x < 39; x++) { sp.set(x, 40, Lt, 140); sp.set(x, 41, G, 122); }
    for (let k = 0; k < 7; k++) {
      const a = PI * (1.12 + (k / 6) * 0.76);
      for (let r = 0; r < 10; r++) sp.set(Math.round(33 + Math.cos(a) * (5 + r)), Math.round(41 + Math.sin(a) * (5 + r)), r < 6 ? G : Lt, 132);
    }
    // raised right arm (on our left) up to the torch
    for (let y = 16; y < 64; y++) {
      const t = (y - 16) / 48, x = 17 + t * 8;
      for (let w = -3; w <= 2; w++) sp.set(Math.round(x + w), y, w < -1 ? Lt : w > 1 ? D : G, 126);
    }
    for (let y = 14; y < 19; y++) for (let x = 14; x < 21; x++) sp.set(x, y, x < 16 ? Lt : G, 130);
    // the torch: a cup on a handle, and the flame
    for (let y = 6; y < 14; y++) for (let x = 15; x < 21; x++) sp.set(x, y, y < 8 ? Lt : D, y < 8 ? 150 : 116);
    for (let y = 0; y < 8; y++) for (let x = 12; x < 24; x++) {
      const dx = (x + 0.5 - 18) / 4.2, dy = (y + 0.5 - 5) / 5;
      const d = dx * dx + dy * dy;
      if (d <= 1) sp.set(x, y, d < 0.35 ? F1 : F2, d < 0.35 ? 150 : 128);
    }
    // left arm bent, holding the tablet against the body (on our right)
    for (let y = 70; y < 84; y++) for (let x = 41; x < 46; x++) sp.set(x, y, x > 44 ? D : G, 120);
    for (let y = 72; y < 102; y++) for (let x = 0; x < 10; x++) {
      const xx = Math.round(43 + x - (y - 72) * 0.12);
      sp.set(xx, y, Tb, x === 0 ? 146 : x === 9 ? 104 : 124);
    }
    for (let x = 0; x < 9; x++) sp.set(Math.round(43 + x - 3), 98, D, 96);
  }, 32, 183);
  // a stone lion lying on its plinth, head up, as at the library steps
  A.add('lion', 48, 32, (sp) => {
    const G = S.C1, D = S.C2, Lt = S.C3;
    for (let y = 16; y < 30; y++) for (let x = 4; x < 40; x++) if (((x + 0.5 - 22) / 18) ** 2 + ((y + 0.5 - 25) / 6.5) ** 2 <= 1) sp.set(x, y, y < 21 ? Lt : x > 32 ? D : G, 126);
    for (let x = 30; x < 46; x++) for (let y = 27; y < 31; y++) sp.set(x, y, y === 27 ? Lt : G, 120);
    for (let y = 4; y < 22; y++) for (let x = 28; x < 46; x++) if (((x + 0.5 - 37) / 8.5) ** 2 + ((y + 0.5 - 13) / 9) ** 2 <= 1) sp.set(x, y, (x + y) % 3 === 0 ? D : x < 33 ? Lt : G, 128);
    for (let y = 9; y < 19; y++) for (let x = 38; x < 46; x++) if (((x + 0.5 - 42) / 4) ** 2 + ((y + 0.5 - 14) / 5) ** 2 <= 1) sp.set(x, y, x < 40 ? Lt : G, 136);
    sp.set(41, 12, D, 90); sp.set(44, 15, D, 100); sp.set(43, 17, D, 100);
    for (let x = 1; x < 6; x++) sp.set(x, 22 - (x >> 1), D, 110);
    for (let x = 0; x < 48; x++) sp.set(x, 31, D, 96);
  }, 24, 31);
  // the golden statue over the sunken plaza: a figure flying with fire, before a ring
  A.add('goldStatue', 48, 40, (sp) => {
    const G = S.C1, D = S.C2, Lt = S.C3;
    for (let k = 0; k < 120; k++) {
      const a = PI * (0.85 + (k / 120) * 1.3), x = Math.round(24 + Math.cos(a) * 20), y = Math.round(30 + Math.sin(a) * 20);
      sp.set(x, y, G, 120); sp.set(x, y + 1, D, 100);
    }
    for (let y = 18; y < 28; y++) for (let x = 8; x < 38; x++) if (((x + 0.5 - 23) / 14) ** 2 + ((y + 0.5 - 23) / 4) ** 2 <= 1) sp.set(x, y, y < 21 ? Lt : x > 30 ? D : G, 130);
    for (let y = 14; y < 22; y++) for (let x = 34; x < 42; x++) if (((x + 0.5 - 38) / 3.6) ** 2 + ((y + 0.5 - 18) / 3.8) ** 2 <= 1) sp.set(x, y, x < 37 ? Lt : G, 134);
    for (let k = 0; k < 10; k++) sp.set(12 - k * 0.3 | 0, 20 - k, G, 128);
    for (let y = 4; y < 11; y++) for (let x = 7; x < 14; x++) if (((x + 0.5 - 10.5) / 3) ** 2 + ((y + 0.5 - 7) / 3.5) ** 2 <= 1) sp.set(x, y, S.C4, 150);
    for (let x = 20; x < 30; x++) sp.set(x, 39, D, 110);
  }, 24, 39);
  // a red paper lantern with gold caps and a tassel
  A.add('redLantern', 12, 18, (sp) => {
    for (let y = 2; y < 13; y++) for (let x = 0; x < 12; x++) if (((x + 0.5 - 6) / 6) ** 2 + ((y + 0.5 - 7.5) / 5.5) ** 2 <= 1) sp.set(x, y, (x + 1) % 4 === 0 ? S.C2 : S.C1, x < 4 ? 146 : 124);
    for (let x = 3; x < 9; x++) { sp.set(x, 1, S.C3, 140); sp.set(x, 13, S.C3, 120); }
    sp.set(6, 0, S.C3, 110);
    for (let y = 14; y < 18; y++) sp.set(6, y, S.C3, 120 - (y - 14) * 6);
  }, 6, 0);
  A.add('statue', 32, 40, (sp) => {
    // equestrian bronze: prancing horse and rider pointing ahead, patina green with gilded trim
    const c = S.C9;
    const shadeAt = (x, y, cx, cy) => (x + y < cx + cy - 4 ? 150 : x > cx + 3 || y > cy + 2 ? 100 : 126);
    // horse body, neck and head
    for (let y = 20; y < 32; y++) for (let x = 5; x < 26; x++) {
      const d = ((x + 0.5 - 15) / 9.5) ** 2 + ((y + 0.5 - 26) / 4.6) ** 2;
      if (d <= 1) sp.set(x, y, c, shadeAt(x, y, 15, 26));
    }
    for (let k = 0; k < 10; k++) for (let w = 0; w < 4; w++) sp.set(21 + Math.round(k * 0.45) + w, 24 - k, c, w === 0 ? 146 : w === 3 ? 100 : 126);
    for (let y = 12; y < 18; y++) for (let x = 25; x < 31; x++) if (((x + 0.5 - 27.5) / 3.2) ** 2 + ((y + 0.5 - 14.5) / 2.4) ** 2 <= 1) sp.set(x, y, c, x < 27 ? 144 : 118);
    sp.set(26, 11, c, 140); sp.set(27, 10, c, 132); sp.set(30, 16, c, 104);
    for (let k = 0; k < 6; k++) sp.set(22 + (k >> 1), 22 - k, c, 92); // mane
    // legs: hind legs planted, one foreleg raised
    for (let y = 30; y < 38; y++) { sp.set(8, y, c, 120); sp.set(9, y, c, 100); sp.set(11, y, c, 110); sp.set(12, y, c, 96); sp.set(21, y, c, 120); sp.set(22, y, c, 100); }
    for (let k = 0; k < 5; k++) { sp.set(23 + (k >> 1), 30 + k - (k > 2 ? 2 : 0), c, 126); sp.set(24 + (k >> 1), 30 + k - (k > 2 ? 2 : 0), c, 104); }
    // tail
    for (let k = 0; k < 8; k++) { sp.set(5 - (k >> 2), 23 + k, c, 112); sp.set(4 - (k >> 2), 23 + k, c, 130); }
    // rider: torso, head with hat, coat tails, arm pointing forward
    for (let y = 13; y < 22; y++) for (let x = 13; x < 18; x++) sp.set(x, y, c, x === 13 ? 148 : x === 17 ? 100 : 126);
    for (let y = 21; y < 25; y++) { sp.set(12, y, c, 120); sp.set(13, y, c, 110); }
    sp.ellipse(15.5, 10, 2.2, 2.4, c, 136);
    for (let x = 12; x < 20; x++) sp.set(x, 8, c, 116);
    for (let x = 13; x < 18; x++) sp.set(x, 7, c, 132);
    for (let k = 0; k < 7; k++) { sp.set(17 + k, 15 - (k >> 1), c, 136); sp.set(17 + k, 16 - (k >> 1), c, 108); }
    sp.set(24, 12, S.C10, 150);
    for (let x = 14; x < 18; x++) sp.set(x, 18, S.C10, 128); // gilded sash
    // plinth
    for (let x = 3; x < 29; x++) { sp.set(x, 38, c, 116); sp.set(x, 39, c, 94); }
  });
  const X = TREE_SPECIES.xmas;
  A.add('xmas', X.w, X.h, (sp) => paintTree(sp, X, 77), X.w / 2, X.h - 1);
  A.add('snowman', 18, 26, (sp) => {
    const balls = [[9, 20.5, 7, 5.5], [9, 11.5, 5.2, 4.4], [9, 4.8, 3.6, 3.4]];
    for (const [bx, by, rx, ry] of balls)
      for (let y = Math.floor(by - ry); y <= Math.ceil(by + ry); y++)
        for (let x = Math.floor(bx - rx); x <= Math.ceil(bx + rx); x++) {
          const dx = (x + 0.5 - bx) / rx, dy = (y + 0.5 - by) / ry;
          if (dx * dx + dy * dy > 1) continue;
          sp.set(x, y, S.C1, dx + dy * 0.6 < -0.4 ? 150 : dx > 0.45 || dy > 0.6 ? 104 : 128);
        }
    for (let x = 6; x <= 12; x++) sp.set(x, 2, S.C3, 110);
    for (let y = -1; y < 2; y++) for (let x = 7; x <= 11; x++) sp.set(x, y, S.C3, x === 7 ? 140 : 120);
    sp.set(8, 4, S.C3, 128); sp.set(10, 4, S.C3, 128);
    sp.set(11, 5, S.C7, 140); sp.set(12, 5, S.C7, 120); sp.set(13, 6, S.C7, 110);
    for (let x = 6; x <= 12; x++) sp.set(x, 8, S.C5, x === 6 ? 140 : 120);
    sp.set(11, 9, S.C5, 120); sp.set(11, 10, S.C5, 110); sp.set(12, 11, S.C5, 104);
    sp.set(9, 11, S.C3, 128); sp.set(9, 14, S.C3, 128); sp.set(9, 18, S.C3, 128);
    for (let k = 0; k < 4; k++) { sp.set(4 - k, 11 - k, S.C4, 110); sp.set(14 + k, 11 - k, S.C4, 110); }
    sp.set(1, 6, S.C4, 100); sp.set(16, 6, S.C4, 100);
  }, 9, 25);
  A.add('umbrella', 22, 12, (sp) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 22; x++) {
        const dx = (x + 0.5 - 11) / 10.8, dy = (y + 0.5 - 7) / 7;
        if (dx * dx + dy * dy > 1) continue;
        if (y === 6 && x % 5 === 2) continue;
        const panel = Math.floor((x + 0.5 - 11) / 3.6);
        sp.set(x, y, S.ITEM, (x < 11 ? 146 : 112) + (panel % 2 ? -10 : 6));
      }
    for (let x = 2; x < 22; x += 5) sp.set(x, 6, S.DARK, 110);
    for (let y = 7; y < 12; y++) sp.set(11, y, S.DARK, 128);
    sp.set(10, 11, S.DARK, 110); sp.set(11, 0, S.DARK, 128);
  }, 11, 11);
  A.add('ball', 4, 4, (sp) => {
    for (const [x, y, sh] of [[1, 0, 150], [2, 0, 136], [0, 1, 146], [1, 1, 136], [2, 1, 120], [3, 1, 108], [0, 2, 128], [1, 2, 116], [2, 2, 104], [3, 2, 96], [1, 3, 100], [2, 3, 92]]) sp.set(x, y, S.C1, sh);
    sp.set(1, 2, S.C3, 110); sp.set(2, 1, S.C3, 110);
  }, 2, 3);
  A.add('snowball', 3, 3, (sp) => { sp.set(1, 0, S.C2, 150); sp.set(0, 1, S.C2, 140); sp.set(1, 1, S.C2, 128); sp.set(2, 1, S.C2, 110); sp.set(1, 2, S.C2, 104); }, 1, 2);
  A.add('frisbee', 6, 2, (sp) => { for (let x = 0; x < 6; x++) sp.set(x, 0, S.C6, x < 2 ? 150 : 128); for (let x = 1; x < 5; x++) sp.set(x, 1, S.C6, 100); }, 3, 1);
  for (const [n, w, h] of [['puff1', 10, 8], ['puff2', 16, 12], ['puff3', 22, 16], ['puff4', 28, 20]]) {
    A.add(n, w, h, (sp) => {
      const rr = new RNG(w * 7 + 3);
      const blobs = [[w / 2, h * 0.6, w * 0.3, h * 0.36]];
      for (let k = 0; k < 4; k++) blobs.push([w * rr.range(0.28, 0.72), h * rr.range(0.38, 0.62), w * rr.range(0.18, 0.27), h * rr.range(0.22, 0.32)]);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let best = 0;
          for (const [bx, by, rx, ry] of blobs) { const d = 1 - (((x + 0.5 - bx) / rx) ** 2 + ((y + 0.5 - by) / ry) ** 2); if (d > best) best = d; }
          if (best <= 0) continue;
          if (best < 0.22 && hash2i(x, y, w) < 0.5) continue;
          const lit = x + y < (w + h) * 0.42;
          sp.set(x, y, S.C1, lit ? 150 : best < 0.3 ? 106 : 126);
        }
    }, Math.floor(w / 2), h - 1);
  }
  A.add('leaf', 3, 2, (sp) => { sp.set(0, 0, S.C1, 140); sp.set(1, 0, S.C1, 128); sp.set(1, 1, S.C1, 110); sp.set(2, 1, S.C1, 96); }, 1, 1);
  A.add('glow', 7, 3, (sp) => {
    for (let x = 1; x < 6; x++) { sp.set(x, 0, S.C1, 110); sp.set(x, 2, S.C1, 110); }
    for (let x = 0; x < 7; x++) sp.set(x, 1, S.C1, x === 0 || x === 6 ? 110 : x >= 2 && x <= 4 ? 160 : 140);
  }, 3, 0);
  A.add('dot', 1, 1, (sp) => sp.set(0, 0, S.C1, 128), 0, 0);
  // faceted crystal ball for the Times Square tower mast
  A.add('tsqBall', 14, 14, (sp) => {
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
      const dx = x - 6.5, dy = y - 6.5, d = Math.hypot(dx, dy);
      if (d > 6.6) continue;
      const facet = ((x + y) % 4 === 0) || ((x - y + 28) % 4 === 0);
      const lit = 150 - Math.round((dx + dy) * 3) - (facet ? 22 : 0);
      sp.set(x, y, S.C1, Math.max(90, Math.min(170, lit)));
    }
    sp.set(4, 3, S.C2, 170); sp.set(5, 3, S.C2, 160); sp.set(4, 4, S.C2, 160);
  }, 7, 13);
  // rubber strap swing seat, seen from the playground's usual angle
  A.add('swingSeat', 12, 4, (sp) => {
    for (let x = 1; x < 11; x++) { sp.set(x, 0, S.C2, 150); sp.set(x, 1, S.C2, 128); sp.set(x, 2, S.C2, 112); }
    for (let x = 2; x < 10; x++) sp.set(x, 3, S.C2, 96);
    sp.set(0, 0, S.C1, 140); sp.set(11, 0, S.C1, 140); sp.set(0, 1, S.C1, 120); sp.set(11, 1, S.C1, 120);
  }, 6, 1);
  A.add('dot2', 2, 2, (sp) => { sp.set(0, 0, S.C1, 140); sp.set(1, 0, S.C1, 128); sp.set(0, 1, S.C1, 128); sp.set(1, 1, S.C1, 110); }, 1, 1);
  A.add('flake', 3, 3, (sp) => { sp.set(1, 0, S.C1, 128); sp.set(0, 1, S.C1, 128); sp.set(1, 1, S.C1, 150); sp.set(2, 1, S.C1, 128); sp.set(1, 2, S.C1, 128); }, 1, 1);
  A.add('cartUmbrella', 40, 24, (sp) => {
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 40; x++) {
        const dx = (x + 0.5 - 20) / 19.5, dy = (y + 0.5 - 10) / 10;
        if (dx * dx + dy * dy > 1) continue;
        if (y === 9 && x % 6 === 3) continue;
        const seg = Math.floor((Math.atan2(x + 0.5 - 20, 10.5 - y) + Math.PI) / (Math.PI / 7));
        sp.set(x, y, seg % 2 ? S.C1 : S.C2, x < 20 ? 146 : 112);
      }
    for (let y = 10; y < 24; y++) { sp.set(19, y, S.C3, 120); sp.set(20, y, S.C3, 96); }
    sp.set(19, 0, S.C3, 128);
  }, 20, 23);
  A.add('bike', 22, 14, (sp) => {
    const wheel = (cx) => {
      for (let a = 0; a < 28; a++) { const ang = (a / 28) * Math.PI * 2; sp.set(Math.round(cx + Math.cos(ang) * 4), Math.round(9 + Math.sin(ang) * 4), S.C3, 110); }
      sp.set(cx, 9, S.C4, 128);
    };
    wheel(5); wheel(17);
    sp.line(5, 9, 10, 9, S.C5); sp.line(10, 9, 15, 4, S.C5); sp.line(8, 4, 15, 4, S.C5); sp.line(8, 4, 10, 9, S.C5); sp.line(5, 9, 8, 4, S.C5); sp.line(15, 4, 17, 9, S.C5);
    sp.set(7, 3, S.C3, 128); sp.set(8, 3, S.C3, 128); sp.set(9, 3, S.C3, 128);
    sp.set(15, 2, S.C3, 128); sp.set(16, 2, S.C3, 128); sp.set(15, 3, S.C3, 110);
  }, 11, 13);
  A.add('stroller', 14, 14, (sp) => {
    for (let y = 3; y < 9; y++) for (let x = 2; x < 11; x++) sp.set(x, y, S.ITEM, x < 4 ? 150 : y === 8 ? 100 : 122);
    for (let y = 0; y < 5; y++) for (let x = 1; x < 6; x++) if (((x + 0.5 - 6) / 5) ** 2 + ((y + 0.5 - 5) / 5) ** 2 <= 1) sp.set(x, y, S.ITEM, 144);
    sp.line(11, 4, 13, 0, S.DARK);
    sp.line(3, 9, 11, 9, S.DARK);
    sp.ellipse(3.5, 11.5, 2, 2, S.DARK, 120); sp.ellipse(10.5, 11.5, 2, 2, S.DARK, 120);
    sp.set(3, 11, S.C4, 140); sp.set(10, 11, S.C4, 140);
  }, 6, 13);
  // flags (4 wave frames)
  for (let f = 0; f < 4; f++) {
    A.add('flag_us' + f, 26, 20, (sp) => {
      for (let y = 0; y < 14; y++)
        for (let x = 0; x < 24; x++) {
          const wv = Math.sin(x * 0.32 + f * 1.57);
          const wy = y + Math.round(wv * 1.6 * (x / 24));
          const canton = x < 10 && y < 7;
          let slot = canton ? S.C7 : y % 2 ? S.C2 : S.C1;
          if (canton && x % 2 === 1 && y % 2 === 1) slot = S.C2;
          sp.set(x + 2, wy + 2, slot, 116 + Math.round(wv * 24));
        }
      for (let y = 0; y < 20; y++) { sp.set(0, y, S.C3, 128); sp.set(1, y, S.C3, 100); }
      sp.set(0, 0, S.C6, 150); sp.set(1, 0, S.C6, 128);
    }, 0, 19);
    A.add('flag_hotel' + f, 26, 20, (sp) => {
      for (let y = 0; y < 14; y++)
        for (let x = 0; x < 24; x++) {
          const wv = Math.sin(x * 0.32 + f * 1.57);
          const wy = y + Math.round(wv * 1.6 * (x / 24));
          sp.set(x + 2, wy + 2, y === 2 || y === 11 ? S.C2 : S.C6, 116 + Math.round(wv * 24));
        }
      for (let y = 0; y < 20; y++) { sp.set(0, y, S.C3, 128); sp.set(1, y, S.C3, 100); }
    }, 0, 19);
  }
  // signal lamps
  A.add('lamp2', 4, 4, (sp) => { for (const [x, y] of [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3]]) sp.set(x, y, S.C1, x === 1 && y === 1 ? 160 : 128); }, 2, 3);
  A.add('lamp1', 2, 4, (sp) => { for (let y = 0; y < 4; y++) { sp.set(0, y, S.C1, 128); sp.set(1, y, S.C1, 128); } }, 0, 3);
  A.add('pedHand', 5, 6, (sp) => {
    for (const [x, y] of [[0, 0], [2, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [1, 4], [2, 4], [3, 4], [1, 5], [2, 5], [3, 5]]) sp.set(x, y, S.C1, 128);
  }, 2, 5);
  A.add('pedWalk', 5, 7, (sp) => {
    for (const [x, y] of [[2, 0], [1, 1], [2, 1], [3, 1], [0, 2], [2, 2], [4, 2], [2, 3], [1, 4], [3, 4], [1, 5], [4, 5], [0, 6], [4, 6]]) sp.set(x, y, S.C1, 128);
  }, 2, 6);
  A.add('beacon', 5, 5, (sp) => { for (const [x, y, s] of [[2, 0, 128], [1, 1, 140], [2, 1, 160], [3, 1, 140], [0, 2, 128], [1, 2, 160], [2, 2, 180], [3, 2, 160], [4, 2, 128], [1, 3, 140], [2, 3, 160], [3, 3, 140], [2, 4, 128]]) sp.set(x, y, S.C1, s); }, 2, 2);
  // bundled christmas trees for sale
  A.add('treeBundle', 16, 28, (sp) => {
    for (let y = 0; y < 26; y++) {
      const half = Math.min(7, 1 + y / 3.5);
      for (let x = Math.round(8 - half); x < Math.round(8 + half); x++) sp.set(x, y, (x * 3 + y * 2) % 7 < 3 ? S.C10 : S.C8, x < 8 ? 140 : 110);
    }
    for (let y = 4; y < 26; y += 6) for (let x = 2; x < 14; x++) if (sp.get(x, y) >= 0) sp.set(x, y, S.C4, 120);
    sp.set(7, 26, S.C4, 100); sp.set(8, 26, S.C4, 100); sp.set(7, 27, S.C4, 90); sp.set(8, 27, S.C4, 90);
  }, 8, 27);
  A.add('firefly', 1, 1, (sp) => sp.set(0, 0, S.C1, 128), 0, 0);
  A.add('pumpkinSmall', 8, 6, (sp) => {
    sp.ellipse(4, 3.5, 3.8, 2.5, S.C5, 128);
    sp.set(2, 2, S.C5, 150); sp.set(3, 1, S.C5, 146);
    sp.set(4, 0, S.C8, 128);
  });
  A.add('coffee', 4, 6, (sp) => {
    for (let x = 0; x < 4; x++) sp.set(x, 0, S.C2, 128);
    for (let y = 1; y < 6; y++) for (let x = 0; x < 4; x++) sp.set(x, y, S.C4, x === 0 ? 140 : x === 3 ? 104 : 124);
    sp.set(1, 3, S.C3, 110); sp.set(2, 3, S.C3, 110);
  });
}

export const PROP_COLORS = {
  // generic prop palette slots
  [S.C1]: 0xf2f2f0, [S.C2]: 0xc8302c, [S.C3]: 0x3a3a3e, [S.C4]: 0x9a9da3, [S.C5]: 0x2a5fb8,
  [S.C6]: 0xe8c030, [S.C7]: 0x1f3a7a, [S.C8]: 0x5aa83c, [S.C9]: 0x4f9a86, [S.C10]: 0x2f6a28,
};
