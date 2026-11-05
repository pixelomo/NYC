// Palette-indexed sprite atlas: trees, people, animals, props, particles.
// Texel: R = palette slot, G = shade (128 = 1.0), B = alt slot (used when the main slot is hidden), A = alpha.

import { Page, SPainter } from '../core/painter.js';
import { RNG, hash2i, clamp } from '../core/math.js';

const SIZE = 2048;

export class SpriteAtlas {
  constructor() {
    this.page = new Page(SIZE, SIZE);
    this.frames = new Map();
    this.x = 0; this.y = 0; this.rowH = 0;
    this.dirtyY0 = 0; this.dirtyY1 = SIZE;
    this.tex = null;
  }
  alloc(w, h) {
    if (this.x + w + 1 > SIZE) { this.x = 0; this.y += this.rowH + 1; this.rowH = 0; }
    if (this.y + h + 1 > SIZE) throw new Error('sprite atlas full');
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
  upload(gl) {
    if (!this.tex) {
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.page.data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.dirtyY0 = SIZE; this.dirtyY1 = 0;
      return;
    }
    if (this.dirtyY1 > this.dirtyY0) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      const y0 = this.dirtyY0, h = this.dirtyY1 - y0;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, SIZE, h, gl.RGBA, gl.UNSIGNED_BYTE, this.page.data.subarray(y0 * SIZE * 4, (y0 + h) * SIZE * 4));
      this.dirtyY0 = SIZE; this.dirtyY1 = 0;
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
// TREES
export const TREE_SPECIES = {
  plane: { w: 44, h: 58, trunkH: 20, canopy: [20, 17], blobs: 16, bark: 0x8a8a74 },
  locust: { w: 38, h: 54, trunkH: 22, canopy: [17, 15], blobs: 22, small: true, bark: 0x5a4a3a },
  oak: { w: 48, h: 56, trunkH: 18, canopy: [22, 18], blobs: 14, bark: 0x5a4636 },
  elm: { w: 60, h: 70, trunkH: 26, canopy: [28, 20], blobs: 18, vase: true, bark: 0x5e5246 },
  cherry: { w: 42, h: 44, trunkH: 14, canopy: [19, 13], blobs: 16, bark: 0x4a3030 },
  pine: { w: 30, h: 60, trunkH: 8, pine: true, bark: 0x4a3626 },
  xmas: { w: 40, h: 76, trunkH: 6, pine: true, xmas: true, bark: 0x4a3626 },
};

export function paintTree(sp, spec, seed) {
  const rng = new RNG(seed);
  const { w, h } = spec;
  const cx = Math.floor(w / 2);
  const base = h - 1;
  if (spec.pine) return paintPine(sp, spec, rng);
  const th = spec.trunkH;
  // trunk
  for (let y = base; y > base - th; y--) {
    const t = (base - y) / th;
    const half = t < 0.15 ? 2 : 1;
    for (let x = cx - half; x <= cx + half - (half === 1 ? 0 : 1); x++) {
      const sh = x < cx ? 150 : x === cx ? 128 : 100;
      sp.set(x, y, S.TRUNK, sh, S.TRUNK);
    }
  }
  // branches (recursive), drawn into alt + main
  const tips = [];
  const branch = (x, y, ang, len, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y - Math.sin(ang) * len;
    const steps = Math.ceil(len);
    for (let i = 0; i <= steps; i++) {
      const px = Math.round(x + ((x2 - x) * i) / steps), py = Math.round(y + ((y2 - y) * i) / steps);
      const above = sp.get(px, py - 1);
      const slot = above < 0 && depth >= 1 ? S.BR_TOP : S.BRANCH;
      sp.set(px, py, slot, 128, slot);
      if (depth < 2 && i < steps * 0.5) sp.set(px + 1, py, S.BRANCH, 100, S.BRANCH);
    }
    if (depth >= 3 || len < 3) { tips.push([x2, y2]); return; }
    const n = depth === 0 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const spread = spec.vase ? 0.55 : 0.75;
      const na = ang + (k - (n - 1) / 2) * spread + rng.range(-0.25, 0.25);
      branch(x2, y2, na, len * rng.range(0.6, 0.8), depth + 1);
    }
  };
  const topY = base - th;
  const L0 = spec.canopy[1] * 0.75;
  branch(cx, topY + 1, Math.PI / 2 + rng.range(-0.15, 0.15), L0 * 0.7, 0);
  if (spec.vase) { branch(cx, topY + 4, Math.PI / 2 + 0.6, L0 * 0.8, 1); branch(cx, topY + 4, Math.PI / 2 - 0.6, L0 * 0.8, 1); }
  // canopy blobs around tips + centre
  const [rx, ry] = spec.canopy;
  const ccy = topY - ry * 0.55;
  const blobs = [];
  for (const t of tips) blobs.push([t[0], t[1], rng.range(3.5, 6)]);
  for (let i = 0; i < spec.blobs; i++) {
    const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next());
    blobs.push([cx + Math.cos(a) * r * rx * 0.75, ccy + Math.sin(a) * r * ry * 0.7, rng.range(4, 7)]);
  }
  // paint leaves: shading by position in canopy (light from upper-left)
  const leafPix = (x, y, nx, ny) => {
    const prev = sp.get(x, y);
    const alt = prev === S.BRANCH || prev === S.BR_TOP || prev === S.TRUNK ? prev : 0;
    const l = -nx * 0.6 - ny * 0.8 + (hash2i(x, y, seed) - 0.5) * 0.7;
    let slot = l > 0.45 ? S.LEAF_L : l > -0.25 ? S.LEAF_M : S.LEAF_D;
    if (spec.small && hash2i(x, y, seed + 3) < 0.25) slot = S.LEAF_D;
    if (hash2i(x, y, seed + 9) < 0.11) slot = S.BLOSSOM;
    sp.set(x, y, slot, 128, alt);
  };
  for (const [bx, by, br] of blobs) {
    for (let y = Math.floor(by - br); y <= Math.ceil(by + br); y++)
      for (let x = Math.floor(bx - br); x <= Math.ceil(bx + br); x++) {
        const dx = (x + 0.5 - bx) / br, dy = (y + 0.5 - by) / (br * 0.85);
        const d = dx * dx + dy * dy;
        const edge = d > 0.75 && hash2i(x, y, seed + 1) < 0.5;
        if (d <= 1 && !edge && x >= 0 && y >= 0 && x < w && y < h) {
          const nx = (x - cx) / rx, ny = (y - ccy) / ry;
          leafPix(x, y, nx * 0.6 + dx * 0.4, ny * 0.6 + dy * 0.4);
        }
      }
  }
  // dark underside band
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = sp.get(x, y);
      if ((s === S.LEAF_M || s === S.LEAF_L) && sp.get(x, y + 1) < 0) sp.set(x, y, S.LEAF_D, 128, 0);
    }
}

function paintPine(sp, spec, rng) {
  const { w, h } = spec;
  const cx = Math.floor(w / 2), base = h - 1;
  for (let y = base; y > base - spec.trunkH - 4; y--) { sp.set(cx, y, S.TRUNK, 128, S.TRUNK); sp.set(cx - 1, y, S.TRUNK, 150, S.TRUNK); }
  const layers = spec.xmas ? 7 : 6;
  const top = 2, bottom = base - spec.trunkH;
  for (let l = 0; l < layers; l++) {
    const ly = top + ((bottom - top) * (l + 1)) / layers;
    const lw = ((w / 2 - 1) * (l + 1.5)) / (layers + 0.5);
    const lh = (bottom - top) / layers + 4;
    for (let y = Math.floor(ly - lh); y <= ly; y++) {
      const t = (y - (ly - lh)) / lh;
      const half = lw * t;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        if (x < 0 || x >= w || y < 0) continue;
        const edgeTop = sp.get(x, y - 1) < 0;
        let slot = x < cx - half * 0.3 ? S.LEAF_L : x > cx + half * 0.4 ? S.LEAF_D : S.LEAF_M;
        if (y > ly - 1.5) slot = S.LEAF_D;
        if (edgeTop) slot = S.BR_TOP;
        sp.set(x, y, slot, 128, slot === S.BR_TOP ? S.BR_TOP : 0);
      }
    }
  }
  if (spec.xmas) {
    for (let i = 0; i < 70; i++) {
      const y = rng.int(6, bottom - 1), x = rng.int(1, w - 2);
      const s = sp.get(x, y);
      if (s === S.LEAF_M || s === S.LEAF_D || s === S.LEAF_L) sp.set(x, y, rng.pick([S.LIGHT1, S.LIGHT2, S.LIGHT3]), 128, 0);
    }
    for (const [dx, dy] of [[0, 0], [-1, 1], [1, 1], [0, 1], [0, 2], [-2, 1], [2, 1]]) sp.set(cx + dx, top - 1 + dy, S.STAR, 128, 0);
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
  pal.set(r, S.TRUNK, barkColor);
  pal.set(r, S.BRANCH, shadeHex(barkColor, 0.9));
  pal.set(r, S.BR_TOP, snowy ? 0xf2f6fa : shadeHex(barkColor, 1.1));
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
// PEOPLE
// template: { body: 'adult'|'kid'|'elder', female, hair, hat, top, bottom, coat, bag, scarf }
export const POSES = {
  walk: 4, run: 4, idle: 2, sit: 1, dribble: 2, shoot: 2, throw: 2, crouch: 1, wave: 1, skate: 2, phone: 1, lie: 1,
};

function poseParams(anim, f) {
  // returns { lx, rx (foot x offsets), ll, rl (foot lift), la, ra (arm states), bob, sit, crouch, jump, lean }
  const P = { lx: 0, rx: 0, ll: 0, rl: 0, la: 'down', ra: 'down', bob: 0, sit: false, crouch: false, jump: 0, lean: 0 };
  switch (anim) {
    case 'walk': {
      const ph = [[-1, 1, 'fwd', 'back', 0], [0, 0, 'down', 'down', 1], [1, -1, 'back', 'fwd', 0], [0, 0, 'down', 'down', 1]][f];
      P.lx = ph[0]; P.rx = ph[1]; P.la = ph[2]; P.ra = ph[3]; P.bob = ph[4];
      if (f === 1) P.rl = 1; if (f === 3) P.ll = 1;
      break;
    }
    case 'run': {
      const ph = [[-2, 2, 'fwdb', 'backb', 0], [0, 0, 'bent', 'bent', 1], [2, -2, 'backb', 'fwdb', 0], [0, 0, 'bent', 'bent', 1]][f];
      P.lx = ph[0]; P.rx = ph[1]; P.la = ph[2]; P.ra = ph[3]; P.bob = ph[4]; P.lean = 1;
      if (f === 1) P.rl = 2; if (f === 3) P.ll = 2;
      break;
    }
    case 'idle': P.bob = f; break;
    case 'sit': P.sit = true; P.la = 'lap'; P.ra = 'lap'; break;
    case 'dribble': P.ra = f ? 'low' : 'fwd'; P.la = 'down'; P.lx = -1; P.rx = 1; P.bob = f; break;
    case 'shoot': P.la = 'up'; P.ra = 'up'; P.jump = f ? 3 : 0; P.ll = f; P.rl = f; break;
    case 'throw': P.ra = f ? 'fwd' : 'upback'; P.la = f ? 'back' : 'fwd'; P.lx = -1; P.rx = 1; break;
    case 'crouch': P.crouch = true; P.la = 'low'; P.ra = 'low'; break;
    case 'wave': P.ra = 'up'; break;
    case 'skate': P.la = 'out'; P.ra = 'out'; P.lx = f ? -1 : 1; P.rx = f ? 2 : -2; P.lean = 1; break;
    case 'phone': P.ra = 'phone'; break;
    case 'lie': P.lie = true; break;
  }
  return P;
}

export function paintPerson(sp, tpl, anim, f, view) {
  const P = poseParams(anim, f);
  const kid = tpl.body === 'kid', elder = tpl.body === 'elder';
  const W = sp.w;
  const ax = Math.floor(W / 2) - 1; // body centre column (left of centre)
  const ground = sp.h - 1;
  if (P.lie) return paintLying(sp, tpl);
  const legH = kid ? 3 : 5;
  const torsoH = kid ? 4 : 5;
  const headH = 4;
  let y0 = ground - P.jump; // feet row
  const crouchDrop = P.crouch ? 3 : 0;
  const sitDrop = P.sit ? legH - 1 : 0;
  const hipY = y0 - 1 - legH + (P.bob ? -1 : 0) + crouchDrop + sitDrop; // first leg row is hipY+1
  const shoulderY = hipY - torsoH + 1 + (elder ? 1 : 0);
  const headY = shoulderY - headH;
  const front = view === 'front';
  const coat = tpl.coat;
  const longCoat = coat === 'long';
  const puffer = coat === 'puffer';
  const topSlot = coat ? S.COAT : S.TOP;
  const sleeveSlot = coat ? S.COAT : tpl.top === 'tee' || tpl.top === 'tank' || tpl.top === 'jersey' ? S.SKIN : S.TOP;
  const upperArmSlot = coat ? S.COAT : tpl.top === 'tank' || tpl.top === 'jersey' ? S.SKIN : S.TOP;

  // ---- legs / feet
  const legSlotUpper = tpl.bottom === 'shorts' ? S.BOTTOM : tpl.bottom === 'dress' || tpl.bottom === 'skirt' ? S.BOTTOM : S.BOTTOM;
  const legSlotLower = tpl.bottom === 'shorts' || tpl.bottom === 'skirt' || tpl.bottom === 'dress' ? S.SKIN : S.BOTTOM;
  if (P.sit) {
    // thighs forward (to the right), shins down
    for (let x = ax; x <= ax + 3; x++) { sp.set(x, hipY + 1, legSlotUpper, 120); sp.set(x, hipY + 2, legSlotUpper, 100); }
    for (let y = hipY + 2; y <= hipY + 3; y++) { sp.set(ax + 3, y, legSlotLower, 110); sp.set(ax + 4, y, legSlotLower, 100); }
    sp.set(ax + 4, hipY + 4, S.SHOES, 128); sp.set(ax + 5, hipY + 4, S.SHOES, 110);
  } else {
    const legs = [
      { x: ax + P.lx, lift: P.ll, back: true },
      { x: ax + 2 + P.rx, lift: P.rl, back: false },
    ];
    for (const L of legs) {
      const top = hipY + 1, bottom = y0 - 1 - L.lift;
      for (let y = top; y <= bottom; y++) {
        const t = (y - top) / Math.max(1, bottom - top);
        const xx = Math.round(ax + (L.x - ax) * t) + (L.x > ax + 1 ? 0 : 0);
        const slot = t < 0.45 ? legSlotUpper : legSlotLower;
        const sh = L.back ? 100 : 130;
        sp.set(xx, y, slot, sh);
        sp.set(xx + 1, y, slot, sh - 12);
      }
      const fx = Math.round(L.x);
      sp.set(fx, bottom + 1 - (P.crouch ? 0 : 0), S.SHOES, L.back ? 100 : 128);
      sp.set(fx + 1, bottom + 1, S.SHOES, L.back ? 90 : 128);
      if (front && !L.back) sp.set(fx + 2, bottom + 1, S.SHOES, 110);
    }
  }
  // skirt / dress flare
  if (tpl.bottom === 'skirt' || tpl.bottom === 'dress') {
    const sy = hipY + 1;
    for (let y = sy; y < sy + (kid ? 2 : 3); y++)
      for (let x = ax - 1 - (y - sy > 1 ? 1 : 0); x <= ax + 4; x++) sp.set(x, y, S.BOTTOM, x <= ax ? 140 : 120);
  }
  if (longCoat && !P.sit) {
    for (let y = hipY + 1; y < hipY + 1 + (kid ? 2 : 3); y++)
      for (let x = ax - 1; x <= ax + 3; x++) sp.set(x, y, S.COAT, x <= ax ? 140 : 115);
  }
  // ---- torso
  const tw = puffer ? 5 : 4;
  const tx0 = ax - (puffer ? 1 : 0);
  for (let y = shoulderY; y <= hipY; y++) {
    for (let x = tx0; x < tx0 + tw; x++) {
      const sh = x === tx0 ? 150 : x === tx0 + tw - 1 ? 108 : 128;
      let slot = tpl.bottom === 'dress' ? S.BOTTOM : topSlot;
      if (y === hipY && !coat && tpl.bottom !== 'dress') slot = S.BOTTOM; // belt line
      sp.set(x + (P.lean && y < shoulderY + 2 ? 1 : 0), y, slot, sh);
    }
  }
  // stripes on jersey / top2 accents
  if (tpl.top === 'jersey' && !coat) for (let x = tx0; x < tx0 + tw; x++) sp.set(x, shoulderY + 1, S.TOP2, 128);
  if (tpl.top === 'stripe' && !coat) for (let y = shoulderY + 1; y < hipY; y += 2) for (let x = tx0; x < tx0 + tw; x++) sp.set(x, y, S.TOP2, x === tx0 ? 150 : 120);
  if (tpl.top === 'suit' && front) { sp.set(ax + 1, shoulderY, S.WHITE, 128); sp.set(ax + 2, shoulderY, S.WHITE, 128); sp.set(ax + 1, shoulderY + 1, S.TOP2, 128); sp.set(ax + 1, shoulderY + 2, S.TOP2, 110); }
  if (coat === 'jacket' && front) for (let y = shoulderY + 1; y <= hipY; y++) sp.set(ax + 2, y, S.TOP, 128);
  if (tpl.scarf) { sp.set(ax, shoulderY, S.SCARF, 128); sp.set(ax + 1, shoulderY, S.SCARF, 128); sp.set(ax + 2, shoulderY, S.SCARF, 110); if (front) sp.set(ax + 2, shoulderY + 1, S.SCARF, 110); }
  // backpack (visible on back view, sliver on front)
  if (tpl.bag === 'back') {
    if (!front) for (let y = shoulderY + 1; y <= hipY - 1; y++) for (let x = ax; x <= ax + 2; x++) sp.set(x, y, S.BAG, x === ax ? 140 : 115);
    else for (let y = shoulderY + 1; y <= hipY - 1; y++) sp.set(tx0 - 1, y, S.BAG, 100);
  }
  // ---- arms
  const arm = (side, state) => {
    // side: 'back' (left col) or 'front' (right col)
    const bx = side === 'back' ? tx0 - 1 : tx0 + tw;
    const dir = side === 'back' ? -1 : 1;
    const sh = side === 'back' ? 95 : 135;
    const pts = [];
    const len = kid ? 3 : 4;
    switch (state) {
      case 'down': for (let i = 0; i < len; i++) pts.push([bx, shoulderY + 1 + i]); break;
      case 'fwd': for (let i = 0; i < len; i++) pts.push([bx + (i >= 2 ? dir : 0), shoulderY + 1 + i]); break;
      case 'back': for (let i = 0; i < len; i++) pts.push([bx - (i >= 2 ? dir : 0), shoulderY + 1 + i]); break;
      case 'fwdb': pts.push([bx, shoulderY + 1], [bx + dir, shoulderY + 2], [bx + dir * 2, shoulderY + 2]); break;
      case 'backb': pts.push([bx, shoulderY + 1], [bx - dir, shoulderY + 2], [bx - dir, shoulderY + 3]); break;
      case 'bent': pts.push([bx, shoulderY + 1], [bx, shoulderY + 2], [bx + dir, shoulderY + 2]); break;
      case 'up': for (let i = 0; i < len; i++) pts.push([bx + (i > 1 ? dir : 0), shoulderY - i]); break;
      case 'upback': pts.push([bx, shoulderY], [bx - dir, shoulderY - 1], [bx - dir, shoulderY - 2]); break;
      case 'out': pts.push([bx, shoulderY + 1], [bx + dir, shoulderY + 1], [bx + dir * 2, shoulderY + 1]); break;
      case 'low': for (let i = 0; i < len; i++) pts.push([bx + (i >= 1 ? dir : 0), shoulderY + 1 + i + (i > 1 ? 1 : 0)]); break;
      case 'lap': pts.push([bx, shoulderY + 1], [bx, shoulderY + 2], [bx + dir, shoulderY + 3]); break;
      case 'phone': pts.push([bx, shoulderY + 1], [bx, shoulderY], [bx, shoulderY - 1]); break;
    }
    pts.forEach(([x, y], i) => {
      const last = i === pts.length - 1;
      const slot = last ? S.SKIN : i === 0 ? upperArmSlot : sleeveSlot;
      sp.set(x, y, slot, sh);
      if (puffer && i < pts.length - 1) sp.set(x + dir * 0, y, S.COAT, sh);
    });
    if (state === 'phone') sp.set(bx + dir, shoulderY - 1, S.DARK, 128);
    return pts[pts.length - 1];
  };
  arm('back', P.la);
  const hand = arm('front', P.ra);
  // briefcase / shoulder bag / held items
  if (tpl.bag === 'brief' && (P.ra === 'down' || P.ra === 'fwd' || P.ra === 'back')) {
    sp.set(hand[0], hand[1] + 1, S.BAG, 128); sp.set(hand[0] + 1, hand[1] + 1, S.BAG, 110); sp.set(hand[0], hand[1] + 2, S.BAG, 110); sp.set(hand[0] + 1, hand[1] + 2, S.BAG, 90);
  }
  if (tpl.bag === 'shoulder') {
    for (let y = shoulderY + 2; y <= hipY; y++) sp.set(front ? tx0 + tw : tx0 - 1, y, S.BAG, 110);
  }
  if (tpl.bag === 'shopping' && (P.ra === 'down' || P.ra === 'fwd' || P.ra === 'back')) {
    sp.set(hand[0], hand[1] + 1, S.BAG, 140); sp.set(hand[0] + 1, hand[1] + 1, S.BAG, 120); sp.set(hand[0], hand[1] + 2, S.BAG, 120); sp.set(hand[0] + 1, hand[1] + 2, S.BAG, 100); sp.set(hand[0], hand[1] + 3, S.BAG, 100);
  }
  // ---- head
  const hx0 = ax;
  for (let y = headY; y < headY + headH; y++) {
    for (let x = hx0; x < hx0 + 4; x++) {
      let slot = S.SKIN;
      let sh = x === hx0 ? 140 : x === hx0 + 3 ? 110 : 128;
      if (y === headY + headH - 1 && (x === hx0 || x === hx0 + 3)) continue; // rounded jaw
      sp.set(x, y, slot, sh);
    }
  }
  // neck
  sp.set(ax + 1, shoulderY - 0, tpl.scarf ? S.SCARF : sp.get(ax + 1, shoulderY) >= 0 ? sp.get(ax + 1, shoulderY) : S.SKIN, 110);
  // hair
  const hair = tpl.hair;
  const H = (x, y, sh = 128) => sp.set(x, y, S.HAIR, sh);
  if (hair !== 'bald') {
    for (let x = hx0; x < hx0 + 4; x++) H(x, headY - 1, 140);
    if (front) {
      H(hx0, headY, 120); H(hx0 + 1, headY, 128); H(hx0 + 2, headY, 120);
      H(hx0, headY + 1, 110);
    } else {
      for (let y = headY; y < headY + headH - 1; y++) for (let x = hx0; x < hx0 + 4; x++) H(x, y, x === hx0 ? 140 : 115);
    }
    if (hair === 'long' || hair === 'pony') {
      const len = hair === 'long' ? 4 : 3;
      for (let y = headY; y < headY + len; y++) H(hx0 - 1, y + 1, 110);
      if (!front) for (let y = headY + 3; y < headY + 3 + (hair === 'long' ? 2 : 1); y++) for (let x = hx0; x < hx0 + 3; x++) H(x, y + 1, 105);
      if (hair === 'pony') H(hx0 - 2, headY + 2, 100);
    }
    if (hair === 'afro') {
      for (let x = hx0 - 1; x < hx0 + 5; x++) H(x, headY - 1, 130);
      for (let x = hx0; x < hx0 + 4; x++) H(x, headY - 2, 140);
      H(hx0 - 1, headY, 115); H(hx0 - 1, headY + 1, 110); if (!front) H(hx0 + 4, headY, 100);
    }
    if (hair === 'bun') { H(hx0 + 1, headY - 2, 140); H(hx0 + 2, headY - 2, 120); }
    if (hair === 'spiky') { H(hx0, headY - 2, 140); H(hx0 + 2, headY - 2, 140); }
  } else if (!front) {
    for (let x = hx0; x < hx0 + 4; x++) sp.set(x, headY + 1, S.HAIR, 110);
  }
  // face
  if (front) {
    sp.set(hx0 + 3, headY + 1, S.DARK, 128); // eye
    if (tpl.glasses) { sp.set(hx0 + 2, headY + 1, S.DARK, 128); sp.set(hx0 + 3, headY + 1, S.DARK, 128); }
  }
  // hats
  const hat = tpl.hat;
  if (hat === 'beanie') {
    for (let x = hx0; x < hx0 + 4; x++) { sp.set(x, headY - 1, S.HAT, 140); sp.set(x, headY, S.HAT, 115); }
    sp.set(hx0 + 1, headY - 2, S.HAT, 150); sp.set(hx0 + 2, headY - 2, S.HAT, 130);
    sp.set(hx0 + 1, headY - 3, S.WHITE, 128);
  } else if (hat === 'cap') {
    for (let x = hx0; x < hx0 + 4; x++) sp.set(x, headY - 1, S.HAT, 140);
    sp.set(hx0, headY, S.HAT, 120);
    if (front) { sp.set(hx0 + 4, headY, S.HAT, 110); sp.set(hx0 + 3, headY, S.HAT, 110); }
    else sp.set(hx0 - 1, headY, S.HAT, 110);
  } else if (hat === 'fedora') {
    for (let x = hx0 - 1; x < hx0 + 5; x++) sp.set(x, headY, S.HAT, 110);
    for (let x = hx0; x < hx0 + 4; x++) { sp.set(x, headY - 1, S.HAT, 140); sp.set(x, headY - 2, S.HAT, 128); }
  } else if (hat === 'hood') {
    for (let x = hx0 - 1; x < hx0 + 4; x++) sp.set(x, headY - 1, S.TOP, 130);
    sp.set(hx0 - 1, headY, S.TOP, 115); sp.set(hx0 - 1, headY + 1, S.TOP, 110);
    if (!front) for (let y = headY; y < headY + 3; y++) for (let x = hx0; x < hx0 + 4; x++) sp.set(x, y, S.TOP, 120);
  } else if (hat === 'witch') {
    for (let x = hx0 - 2; x < hx0 + 6; x++) sp.set(x, headY, S.HAT, 110);
    for (let k = 0; k < 4; k++) for (let x = hx0 + k * 0.5; x < hx0 + 4 - k * 0.5; x++) sp.set(Math.round(x), headY - 1 - k, S.HAT, 130);
  } else if (hat === 'helmet') {
    for (let x = hx0 - 1; x < hx0 + 5; x++) sp.set(x, headY, S.HAT, 120);
    for (let x = hx0; x < hx0 + 4; x++) sp.set(x, headY - 1, S.HAT, 140);
  }
  // elder: cane
  if (elder && tpl.cane) for (let y = hipY - 1; y <= y0; y++) sp.set(tx0 + tw + 1, y, S.DARK, 110);
}

function paintLying(sp, tpl) {
  // lying on a towel, seen at 3/4: horizontal figure
  const y = sp.h - 3;
  for (let x = 1; x < sp.w - 1; x++) sp.set(x, y + 1, S.ITEM2, x % 2 ? 128 : 110); // towel
  for (let x = 2; x < 6; x++) sp.set(x, y, S.SKIN, 128);
  for (let x = 6; x < 10; x++) sp.set(x, y, S.TOP, 128);
  for (let x = 10; x < 14 && x < sp.w - 1; x++) sp.set(x, y, S.BOTTOM, 128);
  sp.set(2, y - 1, S.HAIR, 128); sp.set(3, y - 1, S.HAIR, 128); sp.set(4, y - 1, S.SKIN, 128);
  void tpl;
}

// Generates all frames for a template; returns map anim -> [front frames], [back frames]
export function personTemplate(atlas, tpl) {
  const key = 'p:' + JSON.stringify(tpl);
  const cached = atlas.frames.get(key);
  if (cached) return cached;
  const out = { front: {}, back: {} };
  const w = 14, h = 22;
  for (const anim in POSES) {
    for (const view of ['front', 'back']) {
      if (anim === 'lie' && view === 'back') { out.back.lie = out.front.lie; continue; }
      const arr = [];
      for (let f = 0; f < POSES[anim]; f++) {
        const fw = anim === 'lie' ? 16 : w;
        arr.push(atlas.add(null, fw, h, (sp) => paintPerson(sp, tpl, anim, f, view), Math.floor(fw / 2), h - 1));
      }
      out[view][anim] = arr;
    }
  }
  atlas.frames.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// ANIMALS
export const DOG_BREEDS = {
  small: { len: 5, hgt: 3, leg: 2, head: 3, ears: 'up', tail: 'up' },
  terrier: { len: 6, hgt: 3, leg: 2, head: 3, ears: 'up', tail: 'up' },
  medium: { len: 7, hgt: 4, leg: 3, head: 3, ears: 'flop', tail: 'up' },
  large: { len: 9, hgt: 4, leg: 4, head: 4, ears: 'flop', tail: 'out' },
  dachshund: { len: 9, hgt: 3, leg: 1, head: 3, ears: 'flop', tail: 'out' },
  poodle: { len: 6, hgt: 4, leg: 3, head: 3, ears: 'flop', tail: 'pom', fluffy: true },
  husky: { len: 8, hgt: 4, leg: 3, head: 4, ears: 'up', tail: 'curl' },
};

export function paintDog(sp, breed, anim, f) {
  const B = DOG_BREEDS[breed];
  const ground = sp.h - 1;
  const x0 = 2;
  const legY = ground - B.leg + 1;
  const bodyTop = legY - B.hgt;
  const sit = anim === 'sit';
  const sniff = anim === 'sniff';
  const run = anim === 'run';
  // body
  for (let y = bodyTop; y < legY; y++)
    for (let x = x0; x < x0 + B.len; x++) {
      if (sit && x < x0 + 2 && y < bodyTop + 1) continue;
      const sh = y === bodyTop ? 145 : y === legY - 1 ? 105 : 128;
      const slot = y === legY - 1 && x > x0 + 1 && x < x0 + B.len - 1 ? S.BODY_L : S.BODY;
      sp.set(x, y + (sit && x < x0 + 3 ? 1 : 0), slot, sh);
      if (B.fluffy && (x + y) % 2 === 0) sp.set(x, y - 1, S.BODY, 150);
    }
  // legs
  const legsX = [x0, x0 + 1, x0 + B.len - 2, x0 + B.len - 1];
  const phase = anim === 'walk' || run ? f % 2 : -1;
  legsX.forEach((lx, i) => {
    if (sit && i < 2) return;
    const off = phase >= 0 ? ((i + phase) % 2 === 0 ? (run ? 1 : 0) : (run ? -1 : 0)) : 0;
    const lift = phase >= 0 && (i + phase) % 2 === 0 ? 1 : 0;
    for (let y = legY; y < ground + 1 - lift; y++) sp.set(lx + off * (y === ground - lift ? 1 : 0), y, i % 2 ? S.BODY : S.BODY_D, i % 2 ? 128 : 100);
  });
  if (sit) for (let x = x0; x < x0 + 3; x++) sp.set(x, ground, S.BODY_D, 100);
  // head
  const hx = x0 + B.len - 1, hy = (sniff ? legY - 1 : bodyTop - B.head + 2) + (sit ? -1 : 0);
  for (let y = hy; y < hy + B.head; y++)
    for (let x = hx; x < hx + 3; x++) sp.set(x, y, S.BODY, y === hy ? 145 : 128);
  sp.set(hx + 3, hy + B.head - 2, S.BODY, 120); // snout
  sp.set(hx + 3, hy + B.head - 2 - 0, S.NOSE, 128);
  sp.set(hx + 2, hy + 1, S.EYE, 128);
  if (B.ears === 'up') { sp.set(hx, hy - 1, S.BODY_D, 128); sp.set(hx + 1, hy - 1, S.BODY_D, 110); }
  else { sp.set(hx, hy, S.BODY_D, 100); sp.set(hx, hy + 1, S.BODY_D, 100); }
  sp.set(hx, hy + B.head - 1, S.COLLAR, 128);
  // tail
  const ty = bodyTop;
  const wag = f % 2;
  if (B.tail === 'up') { sp.set(x0 - 1, ty - 1 - wag, S.BODY, 128); sp.set(x0 - 1, ty, S.BODY, 128); }
  else if (B.tail === 'out') { sp.set(x0 - 1, ty + wag, S.BODY, 128); sp.set(x0 - 2, ty + wag, S.BODY, 110); }
  else if (B.tail === 'pom') { sp.set(x0 - 1, ty - 1, S.BODY, 150); sp.set(x0 - 2, ty - 1 - wag, S.BODY, 150); }
  else { sp.set(x0 - 1, ty - 1, S.BODY_L, 128); sp.set(x0, ty - 2, S.BODY_L, 128); sp.set(x0 + 1, ty - 2 + wag, S.BODY_L, 128); }
}

export function paintPigeon(sp, anim, f) {
  const g = sp.h - 1;
  if (anim === 'fly') {
    const up = f % 2 === 0;
    // body
    for (let x = 2; x < 6; x++) sp.set(x, g - 3, S.BODY, 128);
    sp.set(6, g - 4, S.BODY_D, 128); sp.set(7, g - 4, S.BEAK, 128);
    sp.set(1, g - 3, S.BODY_D, 110);
    if (up) { sp.set(3, g - 4, S.BODY_L, 140); sp.set(3, g - 5, S.BODY_L, 150); sp.set(4, g - 6, S.BODY_L, 150); sp.set(2, g - 6, S.BODY_L, 150); }
    else { sp.set(3, g - 2, S.BODY_L, 120); sp.set(3, g - 1, S.BODY_L, 110); sp.set(4, g - 1, S.BODY_D, 110); }
    return;
  }
  const peck = anim === 'peck' && f === 1;
  const bob = anim === 'walk' && f === 1 ? 1 : 0;
  // body
  for (let x = 1; x < 5; x++) sp.set(x, g - 2, S.BODY, 128);
  for (let x = 2; x < 5; x++) sp.set(x, g - 3, S.BODY_L, 140);
  sp.set(0, g - 3, S.BODY_D, 110); // tail
  sp.set(1, g - 3, S.BODY_D, 120);
  // neck & head
  const hx = 4 + bob, hy = peck ? g - 2 : g - 4;
  sp.set(4, g - 3, S.ACCENT, 128);
  sp.set(hx, hy, S.BODY_D, 128);
  sp.set(hx + 1, hy, S.BODY_D, 128);
  sp.set(hx + 2, hy + (peck ? 1 : 0), S.BEAK, 128);
  sp.set(hx + 1, hy, S.EYE, 128);
  // feet
  sp.set(2, g - 1, S.BEAK, 110);
  sp.set(3 + (anim === 'walk' ? f % 2 : 0), g - 1, S.BEAK, 110);
}

export function paintCat(sp, anim, f) {
  const g = sp.h - 1;
  if (anim === 'sit') {
    for (let y = g - 4; y <= g; y++) for (let x = 1; x < 4; x++) sp.set(x, y, S.BODY, x === 1 ? 140 : 120);
    sp.set(3, g - 5, S.BODY, 128); sp.set(4, g - 5, S.BODY, 128); sp.set(3, g - 6, S.BODY_D, 128); sp.set(4, g - 6, S.BODY_D, 128);
    sp.set(4, g - 5, S.EYE, 128);
    sp.set(0, g, S.BODY, 120); sp.set(0, g - 1 - (f % 2), S.BODY, 120);
    return;
  }
  for (let x = 1; x < 6; x++) { sp.set(x, g - 2, S.BODY, 128); sp.set(x, g - 3, S.BODY, 145); }
  sp.set(6, g - 3, S.BODY, 128); sp.set(6, g - 4, S.BODY, 128); sp.set(7, g - 4, S.BODY, 128); sp.set(6, g - 5, S.BODY_D, 128); sp.set(7, g - 5, S.BODY_D, 128);
  sp.set(7, g - 4, S.EYE, 128);
  const ph = f % 2;
  sp.set(1 + ph, g - 1, S.BODY_D, 110); sp.set(2 - ph, g, S.BODY_D, 110); sp.set(5 - ph, g - 1, S.BODY_D, 110); sp.set(5 + ph, g, S.BODY_D, 110);
  sp.set(1, g, S.BODY_D, 100); sp.set(5, g, S.BODY_D, 100);
  sp.set(0, g - 4, S.BODY, 120); sp.set(0, g - 5, S.BODY, 120);
}

export function paintSquirrel(sp, anim, f) {
  const g = sp.h - 1;
  const hop = anim === 'run' && f === 1 ? 1 : 0;
  for (let x = 2; x < 5; x++) sp.set(x, g - 1 - hop, S.BODY, 128);
  sp.set(3, g - 2 - hop, S.BODY, 140); sp.set(4, g - 2 - hop, S.BODY, 128);
  sp.set(5, g - 2 - hop, S.BODY, 128); sp.set(5, g - 3 - hop, S.BODY_D, 128); sp.set(5, g - 2 - hop, S.EYE, 128);
  // bushy tail
  sp.set(1, g - 2 - hop, S.BODY_L, 140); sp.set(0, g - 3 - hop, S.BODY_L, 150); sp.set(1, g - 3 - hop, S.BODY_L, 150); sp.set(1, g - 4 - hop, S.BODY_L, 150); sp.set(2, g - 4 - hop, S.BODY_L, 140);
  sp.set(2, g, S.BODY_D, 100); sp.set(4, g, S.BODY_D, 100);
  if (anim === 'stand') { sp.set(4, g - 3, S.BODY, 128); sp.set(4, g - 4, S.BODY, 128); }
}

export function paintDuck(sp, anim, f) {
  const g = sp.h - 1;
  for (let x = 1; x < 5; x++) sp.set(x, g - 1, S.BODY, x === 1 ? 110 : 128);
  for (let x = 2; x < 5; x++) sp.set(x, g - 2, S.BODY_L, 140);
  sp.set(0, g - 2, S.BODY_D, 120);
  sp.set(4, g - 3 + (f % 2 && anim === 'swim' ? 0 : 0), S.ACCENT, 128); sp.set(5, g - 3, S.ACCENT, 128);
  sp.set(5, g - 4, S.ACCENT, 128); sp.set(6, g - 3, S.BEAK, 128);
  sp.set(5, g - 4, S.EYE, 128);
  if (anim === 'swim') for (let x = 0; x < 6; x++) if ((x + f) % 3 === 0) sp.set(x, g, S.WHITE, 120);
}

// ---------------------------------------------------------------------------
// PROPS (generic slot colours supplied by a shared palette row)
export function buildPropSprites(atlas) {
  const A = atlas;
  // satellite dish: slots C1 dish light, C2 dish dark, C3 pole
  A.add('dish', 8, 9, (sp) => {
    for (let y = 1; y < 6; y++) for (let x = 1 + Math.abs(3 - y) * 0; x < 6; x++) if ((x - 3.5) ** 2 / 9 + (y - 3.5) ** 2 / 6 <= 1) sp.set(x, y, x < 3 ? S.C1 : S.C2, 128);
    sp.set(6, 3, S.C3, 128); sp.set(7, 3, S.C3, 128);
    for (let y = 6; y < 9; y++) sp.set(4, y, S.C3, 110);
  });
  A.add('antenna', 9, 18, (sp) => {
    for (let y = 2; y < 18; y++) sp.set(4, y, S.C3, 120);
    for (let k = 0; k < 4; k++) for (let x = 1 + k; x < 8 - k; x++) sp.set(x, 2 + k * 3, S.C3, 140);
  });
  A.add('deckchair', 9, 6, (sp) => {
    for (let x = 0; x < 7; x++) sp.set(x, 3, S.C5, x % 2 ? 128 : 150);
    for (let y = 0; y < 3; y++) sp.set(6 + Math.floor(y / 2), y, S.C5, 140);
    sp.set(0, 4, S.C3, 110); sp.set(0, 5, S.C3, 110); sp.set(5, 4, S.C3, 110); sp.set(5, 5, S.C3, 110);
  });
  A.add('bush', 12, 9, (sp) => {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) {
      const d = ((x - 5.5) / 6) ** 2 + ((y - 5) / 4.5) ** 2;
      if (d <= 1 && hash2i(x, y, 9) > 0.08) sp.set(x, y, d < 0.3 && x < 6 ? S.C8 : x + y < 10 ? S.C8 : x > 7 ? S.C10 : S.C9, 128);
    }
  });
  A.add('grill', 6, 7, (sp) => {
    for (let x = 0; x < 6; x++) { sp.set(x, 1, S.C4, 128); sp.set(x, 2, S.C4, 110); }
    for (let x = 1; x < 5; x++) sp.set(x, 0, S.C4, 140);
    sp.set(1, 3, S.C4, 100); sp.set(4, 3, S.C4, 100); sp.set(1, 4, S.C3, 100); sp.set(4, 4, S.C3, 100); sp.set(0, 6, S.C3, 100); sp.set(5, 6, S.C3, 100); sp.set(1, 5, S.C3, 100); sp.set(4, 5, S.C3, 100);
  });
  A.add('laundry', 26, 16, (sp) => {
    for (let y = 2; y < 16; y++) { sp.set(0, y, S.C3, 110); sp.set(25, y, S.C3, 110); }
    for (let x = 0; x < 26; x++) sp.set(x, 2 + Math.round(Math.sin((x / 25) * Math.PI) * 2), S.C4, 128);
    const cols = [S.C5, S.C6, S.C7, S.C1, S.C5];
    for (let k = 0; k < 5; k++) {
      const x0 = 2 + k * 5, sag = Math.round(Math.sin(((x0 + 1) / 25) * Math.PI) * 2);
      const hgt = 4 + (k % 2) * 2;
      for (let y = 3 + sag; y < 3 + sag + hgt; y++) for (let x = x0; x < x0 + 3; x++) sp.set(x, y, cols[k], x === x0 ? 140 : 120);
    }
  });
  A.add('statue', 12, 24, (sp) => {
    // bronze figure with raised torch/arm, patina green
    const c = S.C9;
    for (let y = 8; y < 24; y++) for (let x = 3; x < 8; x++) sp.set(x, y, c, x === 3 ? 150 : x === 7 ? 100 : 128);
    for (let y = 20; y < 24; y++) for (let x = 2; x < 9; x++) sp.set(x, y, c, 110);
    for (let y = 4; y < 8; y++) for (let x = 4; x < 7; x++) sp.set(x, y, c, 140);
    for (let y = 0; y < 8; y++) sp.set(8, y + 1, c, 120);
    sp.set(8, 0, S.C10, 150); sp.set(9, 0, S.C10, 128);
  });
  A.add('xmas', 40, 76, (sp) => paintTree(sp, TREE_SPECIES.xmas, 77), 20, 75);
  A.add('snowman', 9, 13, (sp) => {
    sp.ellipse(4.5, 10, 4, 3, S.C1, 128);
    sp.ellipse(4.5, 5.5, 3, 2.5, S.C1, 140);
    sp.ellipse(4.5, 2, 2, 2, S.C1, 150);
    sp.set(5, 2, S.C3, 128); sp.set(6, 2, S.C7, 128);
    sp.set(4, 5, S.C3, 128); sp.set(4, 7, S.C3, 128);
    sp.set(1, 5, S.C4, 110); sp.set(0, 4, S.C4, 110); sp.set(8, 5, S.C4, 110);
    for (let x = 3; x < 7; x++) sp.set(x, 3, S.C5, 128);
    for (let x = 3; x < 6; x++) sp.set(x, 0, S.C3, 128);
  }, 4, 12);
  A.add('umbrella', 11, 6, (sp) => {
    for (let y = 0; y < 4; y++) for (let x = 5 - (y + 2); x <= 5 + (y + 2); x++) if (x >= 0 && x < 11) sp.set(x, y, S.ITEM, x < 5 ? 150 : 115);
    for (let x = 0; x < 11; x += 2) sp.set(x, 3, S.ITEM, 90);
    sp.set(5, 4, S.DARK, 128); sp.set(5, 5, S.DARK, 128);
  }, 5, 5);
  A.add('ball', 2, 2, (sp) => { sp.set(0, 0, S.C1, 150); sp.set(1, 0, S.C1, 128); sp.set(0, 1, S.C1, 128); sp.set(1, 1, S.C1, 100); }, 1, 1);
  A.add('snowball', 2, 2, (sp) => { sp.set(0, 0, S.C2, 150); sp.set(1, 0, S.C2, 128); sp.set(0, 1, S.C2, 128); sp.set(1, 1, S.C2, 110); }, 1, 1);
  A.add('frisbee', 3, 1, (sp) => { sp.set(0, 0, S.C6, 128); sp.set(1, 0, S.C6, 150); sp.set(2, 0, S.C6, 110); }, 1, 0);
  for (const [n, w, h] of [['puff1', 5, 4], ['puff2', 8, 6], ['puff3', 11, 8], ['puff4', 14, 10]]) {
    A.add(n, w, h, (sp) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = ((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2;
        if (d <= 1 && hash2i(x, y, w) > (d > 0.6 ? 0.35 : 0)) sp.set(x, y, S.C1, x + y < (w + h) / 2.2 ? 150 : d > 0.55 ? 108 : 128);
      }
    }, Math.floor(w / 2), h - 1);
  }
  A.add('leaf', 2, 1, (sp) => { sp.set(0, 0, S.C1, 128); sp.set(1, 0, S.C1, 100); }, 1, 0);
  A.add('glow', 3, 2, (sp) => { sp.set(0, 0, S.C1, 110); sp.set(1, 0, S.C1, 150); sp.set(2, 0, S.C1, 110); sp.set(1, 1, S.C1, 120); }, 1, 0);
  A.add('dot', 1, 1, (sp) => sp.set(0, 0, S.C1, 128), 0, 0);
  A.add('dot2', 2, 2, (sp) => { sp.set(0, 0, S.C1, 140); sp.set(1, 0, S.C1, 128); sp.set(0, 1, S.C1, 128); sp.set(1, 1, S.C1, 110); }, 1, 1);
  A.add('cartUmbrella', 20, 12, (sp) => {
    for (let y = 0; y < 5; y++) for (let x = 9 - y * 2; x <= 10 + y * 2; x++) if (x >= 0 && x < 20) sp.set(x, y, Math.floor(x / 3) % 2 ? S.C1 : S.C2, x < 10 ? 150 : 115);
    for (let y = 5; y < 12; y++) sp.set(10, y, S.C3, 110);
  }, 10, 11);
  A.add('bike', 11, 7, (sp) => {
    const wheel = (cx) => { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) sp.set(cx + dx * 1, 4 + dy * 1, S.C3, 110); };
    wheel(2); wheel(8);
    for (let x = 2; x <= 8; x++) sp.set(x, 3, S.C5, 128);
    sp.set(5, 2, S.C5, 128); sp.set(4, 1, S.C3, 110); sp.set(8, 1, S.C3, 110); sp.set(8, 2, S.C5, 128); sp.set(9, 1, S.C3, 110);
  }, 5, 6);
  A.add('stroller', 7, 7, (sp) => {
    for (let y = 1; y < 4; y++) for (let x = 1; x < 6; x++) sp.set(x, y, S.ITEM, x < 3 ? 150 : 120);
    for (let x = 0; x < 3; x++) sp.set(x, 0, S.ITEM, 140);
    sp.set(6, 0, S.DARK, 110); sp.set(6, 1, S.DARK, 110);
    sp.set(1, 5, S.DARK, 110); sp.set(5, 5, S.DARK, 110); sp.set(1, 6, S.DARK, 100); sp.set(5, 6, S.DARK, 100);
    sp.set(3, 4, S.DARK, 110);
  }, 3, 6);
  // flags (4 wave frames)
  for (let f = 0; f < 4; f++) {
    A.add('flag_us' + f, 13, 10, (sp) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) {
        const wy = y + Math.round(Math.sin((x * 0.6) + f * 1.57) * 1);
        const slot = x < 5 && y < 4 ? S.C7 : Math.floor(y / 1) % 2 ? S.C2 : S.C1;
        const sh = 110 + Math.round(Math.sin(x * 0.6 + f * 1.57) * 25);
        sp.set(x + 1, wy + 1, slot, sh);
        if (x < 5 && y < 4 && (x + y) % 2 === 0) sp.set(x + 1, wy + 1, S.C2, sh);
      }
      for (let y = 0; y < 10; y++) sp.set(0, y, S.C3, 128);
    }, 0, 9);
    A.add('flag_hotel' + f, 13, 10, (sp) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) {
        const wy = y + Math.round(Math.sin((x * 0.6) + f * 1.57) * 1);
        sp.set(x + 1, wy + 1, S.C6, 110 + Math.round(Math.sin(x * 0.6 + f * 1.57) * 25));
      }
      for (let y = 0; y < 10; y++) sp.set(0, y, S.C3, 128);
    }, 0, 9);
  }
  // signal lamps 2x2
  A.add('lamp2', 2, 2, (sp) => { sp.set(0, 0, S.C1, 128); sp.set(1, 0, S.C1, 128); sp.set(0, 1, S.C1, 128); sp.set(1, 1, S.C1, 128); }, 0, 1);
  A.add('lamp1', 1, 2, (sp) => { sp.set(0, 0, S.C1, 128); sp.set(0, 1, S.C1, 128); }, 0, 1);
  A.add('beacon', 3, 3, (sp) => { sp.set(1, 0, S.C1, 128); sp.set(0, 1, S.C1, 128); sp.set(1, 1, S.C1, 160); sp.set(2, 1, S.C1, 128); sp.set(1, 2, S.C1, 128); }, 1, 1);
  // christmas tree bundle (seller)
  A.add('treeBundle', 8, 14, (sp) => {
    for (let y = 0; y < 14; y++) { const w = Math.floor(y / 3) + 1; for (let x = 4 - w; x < 4 + w; x++) if (x >= 0 && x < 8) sp.set(x, y, (x + y) % 3 ? S.C8 : S.C10, 128); }
    sp.set(3, 13, S.C4, 100); sp.set(4, 13, S.C4, 100);
  }, 4, 13);
  A.add('firefly', 1, 1, (sp) => sp.set(0, 0, S.C1, 128), 0, 0);
  A.add('pumpkinSmall', 4, 3, (sp) => { for (let x = 0; x < 4; x++) { sp.set(x, 1, S.C5, 128); sp.set(x, 2, S.C5, 110); } sp.set(1, 0, S.C5, 140); sp.set(2, 0, S.C8, 128); });
  A.add('coffee', 2, 3, (sp) => { sp.set(0, 0, S.C2, 128); sp.set(1, 0, S.C2, 128); sp.set(0, 1, S.C4, 128); sp.set(1, 1, S.C4, 110); sp.set(0, 2, S.C4, 128); sp.set(1, 2, S.C4, 110); });
}

export const PROP_COLORS = {
  // generic prop palette slots
  [S.C1]: 0xf2f2f0, [S.C2]: 0xc8302c, [S.C3]: 0x3a3a3e, [S.C4]: 0x9a9da3, [S.C5]: 0x2a5fb8,
  [S.C6]: 0xe8c030, [S.C7]: 0x1f3a7a, [S.C8]: 0x5aa83c, [S.C9]: 0x4f9a86, [S.C10]: 0x2f6a28,
};
