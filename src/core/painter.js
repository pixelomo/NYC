// Pixel painting on raw RGBA typed-array pages (no canvas => no premultiplied alpha issues).
// Alpha channel is used as a "code": 0 = transparent, 255 = opaque, 1..254 = lit-window codes.

import { R, G, B, hash2i, clamp, rgb } from './math.js';

export class Page {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
}

// Window code: t in [0,1] = order in which the window lights up at dusk.
export function winCode(t, selfColored = false) {
  const v = Math.round(clamp(t, 0, 1) * 126);
  return selfColored ? 128 + v : 1 + v;
}

// 3x5 pixel font -------------------------------------------------------------
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  ' ': '000000000000000', '-': '000000111000000', '.': '000000000000010', '!': '010010010000010',
  "'": '010010000000000', '$': '011110010011110', '%': '101001010100101', '#': '101111101111101',
  '*': '000101010101000', '+': '000010111010000', '/': '001001010100100', ':': '000010000010000',
  '@': '000101111111010', // heart
  '&': '010101010101011', '?': '110001010000010', ',': '000000000010100', '"': '101101000000000',
  '=': '000111000111000', '<': '001010100010001', '>': '100010001010100', '(': '010100100100010',
  ')': '010001001001010', '~': '000011110000000', '^': '010101000000000', '_': '000000000000111',
};

// 5x7 pixel font (used for signage at 2x density)
const G7 = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100',
  ' ': '00000000000000000000000000000000000', '-': '00000000000000011111000000000000000', '.': '00000000000000000000000000110001100',
  '!': '00100001000010000100001000000000100', "'": '00100001000100000000000000000000000', '$': '00100011111010001110001011111000100',
  '&': '01100100101010001000101011001001101', '@': '00000010101111111111011100010000000', '#': '01010010101111101010111110101001010',
  '%': '11000110010001000100010001001100011', '/': '00001000100001000100010000100010000', ':': '00000011000110000000011000110000000',
  ',': '00000000000000000000011000010001000', '+': '00000001000010011111001000010000000', '?': '01110100010000100010001000000000100',
  '*': '00000001001010101110101010010000000', '(': '00010001000100001000010000010000010', ')': '01000001000001000010000100010001000',
  '"': '01010010100000000000000000000000000', '=': '00000000001111100000111110000000000', '~': '00000000000100010101000100000000000',
  '<': '00010001000100010000010000010000010', '>': '01000001000001000001000100010001000', '_': '00000000000000000000000000000011111',
};

export function textWidth(str, scale = 1, big = false) {
  if (!str.length) return 0;
  return big ? (str.length * 6 - 1) * scale : (str.length * 4 - 1) * scale;
}

export class Painter {
  constructor(page, ox = 0, oy = 0, w = page.w, h = page.h) {
    this.page = page;
    this.ox = ox;
    this.oy = oy;
    this.w = w;
    this.h = h;
  }
  sub(x, y, w, h) {
    return new Painter(this.page, this.ox + x, this.oy + y, w, h);
  }
  idx(x, y) {
    return ((this.oy + y) * this.page.w + this.ox + x) * 4;
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const d = this.page.data, i = this.idx(x, y);
    d[i] = (c >> 16) & 255;
    d[i + 1] = (c >> 8) & 255;
    d[i + 2] = c & 255;
    d[i + 3] = a;
  }
  get(x, y) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return 0;
    const d = this.page.data, i = this.idx(x, y);
    return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
  }
  getA(x, y) {
    if (!this.inside(x | 0, y | 0)) return 0;
    return this.page.data[this.idx(x | 0, y | 0) + 3];
  }
  setA(x, y, a) {
    if (!this.inside(x | 0, y | 0)) return;
    this.page.data[this.idx(x | 0, y | 0) + 3] = a;
  }
  rect(x, y, w, h, c, a = 255) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    const d = this.page.data, r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    for (let yy = y0; yy < y1; yy++) {
      let i = this.idx(x0, yy);
      for (let xx = x0; xx < x1; xx++, i += 4) {
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
      }
    }
  }
  clear(x = 0, y = 0, w = this.w, h = this.h) {
    this.rect(x, y, w, h, 0, 0);
  }
  // per-pixel brightness noise
  noise(x, y, w, h, c, amt, seed = 1, a = 255, scale = 1) {
    x = Math.round(x); y = Math.round(y);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const n = hash2i(Math.floor((x + xx + this.ox) / scale), Math.floor((y + yy + this.oy) / scale), seed);
        const f = 1 + (n - 0.5) * 2 * amt;
        this.set(x + xx, y + yy, rgb(R(c) * f, G(c) * f, B(c) * f), a);
      }
    }
  }
  // sprinkle random pixels
  speckle(x, y, w, h, c, density, seed = 3, a = 255) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (hash2i(x + xx + this.ox, y + yy + this.oy, seed) < density) this.set(x + xx, y + yy, c, a);
      }
    }
  }
  hline(x, y, len, c, a = 255) { this.rect(x, y, len, 1, c, a); }
  vline(x, y, len, c, a = 255) { this.rect(x, y, 1, len, c, a); }
  frame(x, y, w, h, c, a = 255) {
    this.hline(x, y, w, c, a);
    this.hline(x, y + h - 1, w, c, a);
    this.vline(x, y, h, c, a);
    this.vline(x + w - 1, y, h, c, a);
  }
  line(x0, y0, x1, y1, c, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx, cy, rx, ry, c, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }
  ring(cx, cy, rx, ry, thick, c, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        const dx2 = (x + 0.5 - cx) / (rx - thick), dy2 = (y + 0.5 - cy) / (ry - thick);
        if (d <= 1 && dx2 * dx2 + dy2 * dy2 > 1) this.set(x, y, c, a);
      }
    }
  }
  // multiply existing pixels (keeps alpha)
  mul(x, y, w, h, f) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        if (!this.inside(xx, yy)) continue;
        const a = this.getA(xx, yy);
        if (a === 0) continue;
        const c = this.get(xx, yy);
        this.set(xx, yy, rgb(R(c) * f, G(c) * f, B(c) * f), a);
      }
  }
  tint(x, y, w, h, c, t) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.blend(xx, yy, c, t);
  }
  blend(x, y, c, t) {
    if (!this.inside(x, y)) return;
    const a = this.getA(x, y);
    const o = this.get(x, y);
    this.set(x, y, rgb(R(o) + (R(c) - R(o)) * t, G(o) + (G(c) - G(o)) * t, B(o) + (B(c) - B(o)) * t), a || 255);
  }
  vgrad(x, y, w, h, c0, c1, a = 255) {
    for (let yy = 0; yy < h; yy++) {
      const t = h > 1 ? yy / (h - 1) : 0;
      const c = rgb(R(c0) + (R(c1) - R(c0)) * t, G(c0) + (G(c1) - G(c0)) * t, B(c0) + (B(c1) - B(c0)) * t);
      this.rect(x, y + yy, w, 1, c, a);
    }
  }
  // 5x7 font text; returns width
  text7(x, y, str, c, a = 255, scale = 1) {
    str = String(str).toUpperCase();
    let cx = x;
    for (const ch of str) {
      const g = G7[ch] || G7[' '];
      for (let i = 0; i < 35; i++) {
        if (g[i] === '1') this.rect(cx + (i % 5) * scale, y + Math.floor(i / 5) * scale, scale, scale, c, a);
      }
      cx += 6 * scale;
    }
    return cx - x - scale;
  }
  text(x, y, str, c, a = 255, scale = 1) {
    str = String(str).toUpperCase();
    let cx = x;
    for (const ch of str) {
      const g = GLYPHS[ch] || GLYPHS[' '];
      for (let i = 0; i < 15; i++) {
        if (g[i] === '1') this.rect(cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale, c, a);
      }
      cx += 4 * scale;
    }
    return cx - x - scale;
  }
  // copy pixels from another painter region
  blit(src, sx, sy, w, h, dx, dy, skipTransparent = true) {
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const a = src.getA(sx + xx, sy + yy);
        if (skipTransparent && a === 0) continue;
        this.set(dx + xx, dy + yy, src.get(sx + xx, sy + yy), a);
      }
  }
}

// Palette-indexed sprite painter: R = palette slot, G = shade (128 = normal), B = alt slot, A = alpha
export class SPainter {
  constructor(page, ox, oy, w, h) {
    this.page = page;
    this.ox = ox;
    this.oy = oy;
    this.w = w;
    this.h = h;
  }
  set(x, y, slot, shade = 128, alt = 0) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const d = this.page.data, i = ((this.oy + y) * this.page.w + this.ox + x) * 4;
    d[i] = slot;
    d[i + 1] = shade;
    d[i + 2] = alt;
    d[i + 3] = 255;
  }
  setAlt(x, y, alt) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const d = this.page.data, i = ((this.oy + y) * this.page.w + this.ox + x) * 4;
    d[i + 2] = alt;
    if (d[i + 3] === 0) { d[i] = 0; d[i + 3] = 255; }
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    const d = this.page.data, i = ((this.oy + y) * this.page.w + this.ox + x) * 4;
    return d[i + 3] ? d[i] : -1;
  }
  rect(x, y, w, h, slot, shade = 128) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, slot, shade);
  }
  clearPx(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const d = this.page.data, i = ((this.oy + y) * this.page.w + this.ox + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
  }
  ellipse(cx, cy, rx, ry, slot, shade = 128) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, slot, shade);
      }
  }
  line(x0, y0, x1, y1, slot, shade = 128) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, slot, shade);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}

// Simple shelf packer over multiple pages
export class ShelfPacker {
  constructor(w, h, pad = 1) {
    this.w = w;
    this.h = h;
    this.pad = pad;
    this.x = 0;
    this.y = 0;
    this.rowH = 0;
  }
  alloc(w, h) {
    const p = this.pad;
    if (w + p > this.w) return null;
    if (this.x + w + p > this.w) {
      this.x = 0;
      this.y += this.rowH + p;
      this.rowH = 0;
    }
    if (this.y + h + p > this.h) return null;
    const r = { x: this.x, y: this.y, w, h };
    this.x += w + p;
    this.rowH = Math.max(this.rowH, h);
    return r;
  }
}

// A painter addressed at twice its page's resolution: callers paint as if the page were full size
// and every call lands on the matching texel of the half-size page (one-texel details survive as a
// single texel). Lets the 32-texels-per-unit ground code paint a 16-texels-per-unit ground, which
// is what keeps the big city's ground texture inside GPU limits.
export class HalfPainter extends Painter {
  constructor(page) {
    super(page, 0, 0, page.w * 2, page.h * 2);
    this.half = true;
  }
  sub() { throw new Error('HalfPainter.sub is not supported'); }
  idx(x, y) {
    return ((y >> 1) * this.page.w + (x >> 1)) * 4;
  }
  rect(x, y, w, h, c, a = 255) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    const d = this.page.data, r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, W = this.page.w;
    for (let Y = y0 >> 1; Y < (y1 + 1) >> 1; Y++) {
      let i = (Y * W + (x0 >> 1)) * 4;
      for (let X = x0 >> 1; X < (x1 + 1) >> 1; X++, i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; }
    }
  }
}
