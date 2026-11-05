// Pixel-art facade painters (authored at 32 texels per world unit). y = 0 is the TOP of the facade.

import { winCode, textWidth } from '../core/painter.js';
import { hash2i, shade, mixc, RNG, rgb, R, G, B } from '../core/math.js';

export const PAL = {
  brickRed: [0xb04a32, 0xa8432d, 0xbd5538, 0x9c3f2b],
  brickBrown: [0x8a4b33, 0x7d4430, 0x96553a],
  brickOrange: [0xc4693e, 0xb85f37, 0xcf7448],
  brickTan: [0xd0a46a, 0xc49860, 0xdab27a],
  brickPurple: [0x6e3a35, 0x643430, 0x784540],
  brownstone: [0x7a4d3c, 0x6f4535, 0x855646],
  limestone: [0xdcceaf, 0xd2c3a2, 0xe6dabe],
  greystone: [0xa8a7a0, 0x9c9b94, 0xb5b4ad],
  cream: [0xe8dcc0, 0xdccfb2],
  frames: [0xf2efe6, 0xf2efe6, 0x2b2b30, 0x2f4a3a, 0x5c3b2a, 0x7a1f1f, 0x1f3a5f],
  curtains: [0xd94f4f, 0xe8c24a, 0xf2efe6, 0x5aa0d8, 0x7fc06a, 0xe58fb5, 0xb07ad6, 0xf09a4a, 0xece2c8, 0xd8d0c0],
  awning: [0xc8302c, 0x2f8a46, 0x1f4f9a, 0x1b1b1b, 0xe0a020, 0x8a2a6a, 0x0f6f6a],
  neon: [0xff4f6a, 0x4fd2ff, 0xffd84f, 0x7dff6a, 0xff7ae0, 0xffffff, 0xff9a3a],
};

export const glassDay = 0x35506b;
export const glassHi = 0x86aecb;

// ---- wall fills -------------------------------------------------------------
// Running-bond brick: 3-texel courses (2 brick + 1 mortar), 8-texel bricks (7 + 1 mortar)
export function brickFill(p, x, y, w, h, pal, seed = 1, opt = {}) {
  const base = pal[0];
  const mortar = mixc(base, 0xd8ccbc, 0.42);
  const mortarD = shade(mortar, 0.9);
  for (let yy = 0; yy < h; yy++) {
    const gy = y + yy + (opt.oy || 0) + p.oy;
    const course = Math.floor(gy / 3);
    const ry = gy % 3;
    for (let xx = 0; xx < w; xx++) {
      const gx = x + xx + (opt.ox || 0) + p.ox;
      if (ry === 2) { p.set(x + xx, y + yy, hash2i(gx, gy, seed) < 0.5 ? mortar : mortarD); continue; }
      const bx = gx + (course & 1) * 4;
      if (bx % 8 === 7) { p.set(x + xx, y + yy, mortar); continue; }
      const cell = Math.floor(bx / 8);
      const hc = hash2i(cell, course, seed + 7);
      let c = pal[Math.floor(hc * pal.length)];
      if (hc > 0.955) c = shade(c, 0.74);
      else if (hc < 0.035) c = shade(c, 1.16);
      c = shade(c, (ry === 0 ? 1.05 : 0.97) * (0.97 + hash2i(gx, gy, seed + 1) * 0.06));
      p.set(x + xx, y + yy, c);
    }
  }
}

// Ashlar stone: horizontal courses with offset vertical joints and bevelled edges
export function stoneFill(p, x, y, w, h, pal, seed = 1, course = 12, opt = {}) {
  const bl = opt.blocks || 0;
  for (let yy = 0; yy < h; yy++) {
    const gy = y + yy + (opt.oy || 0);
    const ci = course ? Math.floor(gy / course) : 0;
    const ly = course ? gy % course : 1;
    for (let xx = 0; xx < w; xx++) {
      const gx = x + xx;
      const hh = hash2i(gx + p.ox, gy + p.oy, seed);
      const bi = bl ? Math.floor((gx + ci * 13) / bl) : 0;
      const lx = bl ? (gx + ci * 13) % bl : 1;
      const tone = hash2i(bi, ci, seed + 3);
      let c = shade(pal[0], 0.95 + hh * 0.07 + (tone - 0.5) * 0.06);
      if (course && ly === course - 1) c = shade(pal[0], 0.8);
      else if (course && ly === 0) c = shade(pal[0], 1.08);
      else if (bl && lx === 0) c = shade(pal[0], 0.86);
      else if (bl && lx === 1) c = shade(pal[0], 1.05);
      p.set(x + xx, y + yy, c);
    }
  }
}

export function smoothFill(p, x, y, w, h, c, seed = 1, amt = 0.05) {
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const hh = hash2i(x + xx + p.ox, y + yy + p.oy, seed);
      p.set(x + xx, y + yy, shade(c, 1 - amt + hh * amt * 2));
    }
}

export function rustication(p, x, y, w, h, c, step = 6) {
  for (let yy = 0; yy < h; yy++) {
    const ly = yy % step;
    for (let xx = 0; xx < w; xx++) {
      const hh = hash2i(x + xx + p.ox, y + yy + p.oy, 77);
      let col = shade(c, 0.95 + hh * 0.08);
      if (ly === step - 1) col = shade(c, 0.62);
      else if (ly === step - 2) col = shade(c, 0.82);
      else if (ly === 0) col = shade(c, 1.1);
      p.set(x + xx, y + yy, col);
    }
  }
}

// ---- windows ----------------------------------------------------------------
// o: { frame, lintel, sill, t, curtain, blinds, plant, rail, arch, panes ('2/2','6/6','1/1'), keystone, wall }
export function drawWindow(p, x, y, w, h, o = {}, rng) {
  const frame = o.frame ?? 0xf2efe6;
  const frameD = shade(frame, 0.78);
  const t = o.t ?? 0.5;
  if (o.lintel != null) {
    const L = o.lintel;
    p.rect(x - 2, y - 5, w + 4, 5, L);
    p.hline(x - 2, y - 5, w + 4, shade(L, 1.12));
    p.hline(x - 2, y - 1, w + 4, shade(L, 0.72));
    p.vline(x - 2, y - 5, 5, shade(L, 1.05));
    if (o.keystone) {
      const kx = x + (w >> 1) - 2;
      p.rect(kx, y - 7, 4, 7, shade(L, 1.06));
      p.vline(kx + 3, y - 7, 7, shade(L, 0.8));
      p.hline(kx, y - 7, 4, shade(L, 1.18));
    }
  }
  // reveal shadow (window is recessed)
  if (o.wall != null) p.hline(x, y - 1, w, shade(o.wall, 0.55));
  p.rect(x, y, w, h, frame);
  p.vline(x, y, h, shade(frame, 1.06));
  p.vline(x + w - 1, y, h, frameD);
  p.hline(x, y + h - 1, w, frameD);
  const gx = x + 2, gy = y + 2, gw = w - 4, gh = h - 4;
  const glass = o.glass ?? glassDay;
  const code = winCode(t);
  for (let yy = 0; yy < gh; yy++) {
    for (let xx = 0; xx < gw; xx++) {
      let c = shade(glass, 1.16 - (yy / gh) * 0.32);
      const d = xx + yy;
      if ((d % 14 === 3 || d % 14 === 4) && yy < gh * 0.55) c = mixc(c, glassHi, 0.65);
      else if (d % 14 === 5 && yy < gh * 0.4) c = mixc(c, glassHi, 0.3);
      p.set(gx + xx, gy + yy, c, code);
    }
  }
  // interior details
  if (o.curtain != null) {
    const cc = winCode(t, true);
    const cw = Math.max(2, Math.floor(gw / 3));
    for (let yy = 0; yy < gh; yy++) {
      const sway = yy > gh * 0.6 ? 1 : 0;
      for (let xx = 0; xx < cw + sway; xx++) {
        const fold = xx % 3 === 1 ? 0.85 : xx === cw + sway - 1 ? 0.78 : 1;
        const c = shade(o.curtain, fold);
        p.set(gx + xx, gy + yy, c, cc);
        p.set(gx + gw - 1 - xx, gy + yy, c, cc);
      }
    }
    for (let xx = 0; xx < gw; xx++) p.set(gx + xx, gy, shade(o.curtain, 0.9), cc);
  }
  if (o.blinds) {
    const cc = winCode(t, true);
    const bh = Math.floor(gh * (0.25 + (rng ? rng.next() * 0.55 : 0.3)));
    for (let yy = 0; yy < bh; yy++)
      for (let xx = 0; xx < gw; xx++) p.set(gx + xx, gy + yy, yy % 3 === 2 ? 0xbcb6a6 : yy % 3 === 0 ? 0xf2ecdc : 0xe2dccc, cc);
    p.hline(gx, gy + bh, gw, 0x8a8478);
  }
  // sashes / muntins
  const panes = o.panes ?? (w >= 14 ? '2/2' : '1/1');
  if (o.rail !== false && h >= 18) {
    const my = y + Math.floor(h / 2);
    p.rect(x, my - 1, w, 2, frame);
    p.hline(x, my + 1, w, frameD);
  }
  if (panes === '2/2' && gw >= 8) p.vline(x + Math.floor(w / 2), y + 1, h - 2, frame);
  if (panes === '6/6' && gw >= 10) {
    for (let k = 1; k < 3; k++) p.vline(gx + Math.round((gw * k) / 3), gy, gh, frame);
    for (const fy of [gy + Math.round(gh / 4), gy + Math.round((gh * 3) / 4)]) p.hline(gx, fy, gw, frame);
  }
  if (o.arch) {
    const wallC = o.wall ?? frame;
    p.set(x, y, wallC); p.set(x + 1, y, wallC); p.set(x, y + 1, wallC);
    p.set(x + w - 1, y, wallC); p.set(x + w - 2, y, wallC); p.set(x + w - 1, y + 1, wallC);
  }
  if (o.plant) {
    const py = y + h - 7;
    for (let xx = 0; xx < gw; xx++) {
      p.set(gx + xx, py + 3, 0x6b4a32);
      p.set(gx + xx, py + 2, 0x3f8a35);
      if (hash2i(xx + x, py, 3) < 0.6) p.set(gx + xx, py + 1, 0x58ac43);
      if (hash2i(xx + x, py, 4) < 0.3) p.set(gx + xx, py, 0x6cc050);
    }
    if (o.plant === 'flower') for (let k = 1; k < gw; k += 3) p.set(gx + k, py, [0xe84a5f, 0xf2c230, 0xe58fb5][k % 3]);
  }
  if (o.cat) {
    const cx = gx + 2, cy = y + h - 9;
    const cc = o.cat;
    p.rect(cx, cy + 2, 6, 4, cc);
    p.rect(cx + 1, cy, 4, 3, cc);
    p.set(cx + 1, cy - 1, cc); p.set(cx + 4, cy - 1, cc);
    p.set(cx + 2, cy + 1, 0xf2d040); p.set(cx + 4, cy + 1, 0xf2d040);
    p.set(cx + 6, cy + 4, cc); p.set(cx + 7, cy + 3, cc);
  }
  if (o.sill != null) {
    const S = o.sill;
    p.rect(x - 2, y + h, w + 4, 3, S);
    p.hline(x - 2, y + h, w + 4, shade(S, 1.15));
    p.hline(x - 2, y + h + 2, w + 4, shade(S, 0.7));
    if (o.wall != null) p.hline(x - 1, y + h + 3, w + 2, shade(o.wall, 0.6));
  }
}

export function drawDoor(p, x, y, w, h, o = {}) {
  const c = o.color ?? 0x5c3b2a;
  const frame = o.frame ?? shade(c, 0.7);
  p.rect(x, y, w, h, frame);
  p.rect(x + 2, y + 2, w - 4, h - 2, c);
  let py = y + 2;
  if (o.transom !== false) {
    // fanlight with radial muntins
    const th = 7;
    for (let yy = 0; yy < th; yy++) for (let xx = 0; xx < w - 4; xx++) p.set(x + 2 + xx, y + 2 + yy, shade(glassDay, 1.15 - yy * 0.04), winCode(o.t ?? 0.15));
    const cx = x + w / 2, cy = y + 2 + th;
    for (let k = 1; k < 4; k++) {
      const a = Math.PI * (k / 4);
      for (let r = 2; r < th; r++) p.set(Math.round(cx - Math.cos(a) * r * 1.4), Math.round(cy - Math.sin(a) * r), frame);
    }
    p.hline(x + 2, y + 2 + th, w - 4, frame);
    py = y + 2 + th + 2;
  }
  const lw = w - 4;
  if (o.glass) {
    const gh = Math.floor((h - (py - y)) * 0.5);
    p.rect(x + 4, py + 1, lw - 4, gh, shade(glassDay, 1.1), winCode(o.t ?? 0.15));
    p.hline(x + 4, py + 2, lw - 4, glassHi, winCode(o.t ?? 0.15));
    py += gh + 3;
  }
  // raised panels
  const half = Math.floor((lw - 2) / 2);
  for (let yy = py; yy < y + h - 4; yy += 9) {
    for (const px of [x + 3, x + 3 + half + 1]) {
      const ph = Math.min(7, y + h - 4 - yy);
      if (ph < 3) continue;
      p.rect(px, yy, half - 1, ph, shade(c, 0.88));
      p.hline(px, yy, half - 1, shade(c, 0.7));
      p.vline(px, yy, ph, shade(c, 0.7));
      p.hline(px, yy + ph - 1, half - 1, shade(c, 1.15));
      p.vline(px + half - 2, yy, ph, shade(c, 1.15));
    }
  }
  // knob, kick plate
  p.rect(x + w - 5, y + Math.floor(h * 0.58), 2, 2, 0xe6c34a);
  p.set(x + w - 5, y + Math.floor(h * 0.58), 0xfff0a0);
  p.rect(x + 2, y + h - 3, w - 4, 2, 0xb89a50);
  if (o.number != null) {
    const s = String(o.number);
    const tw = textWidth(s, 1, true);
    p.text7(x + Math.floor((w - tw) / 2), y - 9, s, 0xe6c34a);
  }
  if (o.wreath) {
    const cx = x + (w >> 1), cy = py + 6;
    p.ring(cx, cy, 5, 5, 2, 0x2f7a3a);
    p.set(cx - 2, cy - 4, 0xd8302c); p.set(cx + 3, cy + 2, 0xd8302c);
    p.rect(cx - 1, cy + 4, 3, 3, 0xd8302c);
  }
}

// Bracketed sheet-metal / stone cornice (used for frieze bands and cornice boxes)
export function corniceBand(p, x, y, w, h, c) {
  const hi = shade(c, 1.2), lo = shade(c, 0.66), mid = shade(c, 0.86);
  p.rect(x, y, w, h, c);
  // crown molding
  p.hline(x, y, w, hi);
  if (h > 4) p.hline(x, y + 1, w, shade(c, 1.08));
  if (h > 6) p.hline(x, y + 3, w, lo);
  if (h >= 10) {
    // dentils
    const dy = y + h - 5;
    for (let xx = 1; xx < w - 1; xx += 4) { p.rect(x + xx, dy, 2, 3, mid); p.set(x + xx, dy + 2, lo); }
  }
  p.hline(x, y + h - 2, w, shade(c, 0.78));
  p.hline(x, y + h - 1, w, lo);
  if (h >= 10) {
    // scroll brackets
    const step = Math.max(16, Math.floor(w / 6));
    for (let xx = 4; xx < w - 4; xx += step) {
      p.rect(x + xx, y + 4, 4, h - 6, mid);
      p.vline(x + xx, y + 4, h - 6, hi);
      p.vline(x + xx + 3, y + 4, h - 6, lo);
      p.set(x + xx + 1, y + h - 4, lo); p.set(x + xx + 2, y + h - 3, lo);
    }
  }
}

// ---- signs ------------------------------------------------------------------
export function signBoard(p, x, y, w, h, text, o = {}) {
  const bg = o.bg ?? 0x1b1b1b;
  const fg = o.fg ?? 0xffd84f;
  const lit = o.lit ?? true;
  p.rect(x, y, w, h, bg);
  p.hline(x, y, w, shade(bg, 1.35));
  p.hline(x, y + h - 1, w, shade(bg, 0.6));
  if (o.border) p.frame(x, y, w, h, o.border);
  const a = lit ? winCode(o.t ?? 0.02, true) : 255;
  let scale = o.scale ?? (h >= 18 && textWidth(text, 2, true) <= w - 6 ? 2 : 1);
  if (textWidth(text, scale, true) <= w - 4 && h >= 7 * scale + 2) {
    const tw = textWidth(text, scale, true);
    const tx = x + Math.floor((w - tw) / 2), ty = y + Math.floor((h - 7 * scale) / 2);
    if (o.shadow !== false) p.text7(tx + scale, ty + scale, text, shade(bg, 0.55), a, scale);
    p.text7(tx, ty, text, fg, a, scale);
  } else {
    // fall back to the small font
    scale = h >= 12 && textWidth(text, 2) <= w - 4 ? 2 : 1;
    const tw = textWidth(text, scale);
    const tx = x + Math.floor((w - tw) / 2), ty = y + Math.floor((h - 5 * scale) / 2);
    p.text(tx, ty, text, fg, a, scale);
  }
}

// ---- shopfronts ---------------------------------------------------------------
export const SHOPS = {
  bodega: { name: ['DELI', 'GROCERY', 'BODEGA', 'DELI & GROCERY', 'MINI MART'], bg: 0xf2c230, fg: 0xc8302c, awn: 0xc8302c, goods: 'snacks' },
  pizza: { name: ['PIZZA', '$1 PIZZA', 'NY SLICE', 'SLICE'], bg: 0xc8302c, fg: 0xffffff, awn: 0x2f8a46, goods: 'pizza' },
  laundry: { name: ['LAUNDROMAT', 'WASH & FOLD', 'LAUNDRY'], bg: 0x1f4f9a, fg: 0xffffff, awn: 0x1f4f9a, goods: 'washers' },
  coffee: { name: ['COFFEE', 'ESPRESSO', 'CAFE'], bg: 0x3b2a20, fg: 0xf2d9a6, awn: 0x0f6f6a, goods: 'cafe' },
  bar: { name: ['BAR', 'PUB', 'TAVERN', 'COCKTAILS'], bg: 0x1b1b1b, fg: 0xff4f6a, awn: 0x1b1b1b, goods: 'bar' },
  books: { name: ['BOOKS', 'USED BOOKS'], bg: 0x2f4a3a, fg: 0xf2efe6, awn: 0x2f4a3a, goods: 'books' },
  flowers: { name: ['FLOWERS', 'FLORIST'], bg: 0xf2efe6, fg: 0x2f8a46, awn: 0x2f8a46, goods: 'flowers' },
  bagels: { name: ['BAGELS', 'BAGEL BROS'], bg: 0xe0a020, fg: 0x3b2a20, awn: 0xe0a020, goods: 'bagels' },
  hardware: { name: ['HARDWARE', 'KEYS MADE'], bg: 0xc8302c, fg: 0xf2c230, awn: 0x1b1b1b, goods: 'tools' },
  nails: { name: ['NAILS', 'NAIL SALON'], bg: 0xe58fb5, fg: 0xffffff, awn: 0xe58fb5, goods: 'salon' },
  chinese: { name: ['CHINESE FOOD', 'WOK & ROLL', 'TAKE OUT'], bg: 0xc8302c, fg: 0xf2c230, awn: 0xc8302c, goods: 'food' },
  gallery: { name: ['GALLERY', 'ART'], bg: 0xf2efe6, fg: 0x1b1b1b, awn: 0x1b1b1b, goods: 'art' },
  boutique: { name: ['BOUTIQUE', 'VINTAGE', 'SHOES'], bg: 0x1b1b1b, fg: 0xf2efe6, awn: 0x8a2a6a, goods: 'clothes' },
  pharmacy: { name: ['PHARMACY', 'DRUGS'], bg: 0xf2efe6, fg: 0x2f8a46, awn: 0x1f4f9a, goods: 'pharmacy' },
  diner: { name: ['DINER', 'EAT', 'LUNCHEONETTE'], bg: 0x0f6f6a, fg: 0xff4f6a, awn: 0xc8302c, goods: 'diner' },
};

function goods(p, x, y, w, h, kind, rng, t) {
  const cc = winCode(t, true);
  const put = (xx, yy, c) => { if (xx >= 0 && yy >= 0 && xx < w && yy < h) p.set(x + xx, y + yy, c, cc); };
  const box = (xx, yy, bw, bh, c) => { for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) put(xx + i, yy + j, i === 0 ? shade(c, 1.15) : j === bh - 1 ? shade(c, 0.75) : c); };
  const colors = [0xd94f4f, 0xe8c24a, 0x5aa0d8, 0x7fc06a, 0xe58fb5, 0xf09a4a, 0xffffff, 0xb07ad6, 0x4a8a5a];
  if (kind === 'washers') {
    for (let xx = 1; xx + 9 <= w; xx += 11) {
      box(xx, h - 13, 9, 12, 0xe8e8ea);
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if ((i - 2) ** 2 + (j - 2) ** 2 <= 5) put(xx + 2 + i, h - 10 + j, j < 2 ? 0x8ab0d8 : 0x4a5a70);
      put(xx + 7, h - 12, 0x2a2a2c);
    }
    for (let xx = 0; xx < w; xx += 3) put(xx, 2, 0xf2efe6);
    return;
  }
  if (kind === 'pizza' || kind === 'food' || kind === 'diner' || kind === 'cafe' || kind === 'bagels') {
    // counter, menu boards, lamps, a customer
    for (let xx = 0; xx < w; xx++) { put(xx, h - 7, kind === 'cafe' ? 0x8a5a3a : 0xd8d4cc); put(xx, h - 6, 0xa8a49c); for (let j = h - 5; j < h; j++) put(xx, j, 0x6a4a3a); }
    for (let xx = 2; xx + 10 < w; xx += 14) { box(xx, 2, 10, 6, 0x1e1e20); for (let k = 1; k < 9; k += 2) put(xx + k, 4, 0xf2efe6); put(xx + 2, 6, 0xf2c230); }
    for (let xx = 4; xx < w; xx += 12) { put(xx, 0, 0x2a2a2c); put(xx, 9, 0xfff0b0); put(xx - 1, 10, 0xffe090); put(xx + 1, 10, 0xffe090); }
    if (kind === 'pizza') for (let k = 0; k < 2; k++) { for (let i = 0; i < 7; i++) put(4 + k * 10 + i, h - 8, 0xe8b040); put(6 + k * 10, h - 9, 0xc8302c); put(8 + k * 10, h - 9, 0xc8302c); }
    if (kind === 'bagels') for (let k = 2; k < w - 2; k += 5) { put(k, h - 8, 0xc49860); put(k + 1, h - 8, 0xb07840); put(k + 2, h - 8, 0xc49860); }
    const cx = w - 10;
    for (let j = h - 18; j < h - 7; j++) { put(cx, j, 0x2a5fb8); put(cx + 1, j, 0x2a5fb8); }
    put(cx, h - 20, 0xd8a078); put(cx + 1, h - 20, 0xd8a078); put(cx, h - 21, 0x2a1a10); put(cx + 1, h - 21, 0x2a1a10);
    return;
  }
  if (kind === 'bar') {
    for (let xx = 0; xx < w; xx++) { put(xx, h - 7, 0x5a3a22); for (let j = h - 6; j < h; j++) put(xx, j, 0x3a2416); }
    for (let row = 0; row < 2; row++) for (let xx = 1; xx < w - 1; xx += 3) {
      const c = colors[(xx * 3 + row) % colors.length];
      put(xx, 4 + row * 6, c); put(xx, 5 + row * 6, shade(c, 0.8)); put(xx, 6 + row * 6, shade(c, 0.7)); put(xx, 3 + row * 6, 0x2a2a2a);
    }
    for (let xx = 0; xx < w; xx++) { put(xx, 7, 0x8a6a4a); put(xx, 13, 0x8a6a4a); }
    return;
  }
  if (kind === 'flowers') {
    for (let xx = 0; xx < w; xx++) for (let yy = h - 12; yy < h; yy++) {
      const r = hash2i(xx + x, yy + y, 9);
      put(xx, yy, yy > h - 4 ? 0x6b4a32 : r < 0.45 ? (r < 0.2 ? 0x3f8a35 : 0x58ac43) : colors[Math.floor(r * 9) % 6]);
    }
    return;
  }
  if (kind === 'art') {
    for (let xx = 2; xx + 10 < w; xx += 14) {
      const c = colors[rng.int(0, colors.length - 1)];
      box(xx, 3, 11, 9, 0xf2efe6);
      for (let j = 1; j < 8; j++) for (let i = 1; i < 10; i++) put(xx + i, 3 + j, hash2i(i, j + xx, 5) < 0.5 ? c : shade(c, 0.7));
      put(xx + 5, 13, 0x2a2a2c);
    }
    return;
  }
  if (kind === 'clothes') {
    for (let xx = 0; xx < w; xx++) put(xx, 3, 0x9a9a9a);
    for (let xx = 2; xx + 5 < w; xx += 7) {
      const c = colors[rng.int(0, colors.length - 1)];
      for (let j = 4; j < 14; j++) for (let i = 0; i < 5; i++) if (!(j < 6 && (i === 0 || i === 4))) put(xx + i, j, i === 0 ? shade(c, 1.1) : c);
    }
    return;
  }
  // generic shelves of products
  for (let yy = 2; yy < h - 4; yy += 7) {
    for (let xx = 0; xx < w; xx++) { put(xx, yy + 6, 0x9a968e); put(xx, yy + 7, 0x6a665e); }
    for (let xx = 1; xx < w - 2;) {
      const bw = rng.int(2, 4), bh = rng.int(3, 6);
      if (rng.chance(0.85)) box(xx, yy + 6 - bh, bw, bh, colors[rng.int(0, colors.length - 1)]);
      xx += bw + 1;
    }
  }
}

// Shopfront occupying [x, x+w) x [y, y+h). Returns info about sign.
export function drawShopfront(p, x, y, w, h, kind, rng, o = {}) {
  const S = SHOPS[kind] || SHOPS.bodega;
  const frameC = o.frame ?? rng.pick([0x1b1b1b, 0x2f4a3a, 0x5c3b2a, 0x7a1f1f, 0x1f3a5f, 0xe8e2d0]);
  const signH = o.signH ?? 14;
  const name = o.name ?? rng.pick(S.name);
  signBoard(p, x, y, w, signH, name, { bg: S.bg, fg: S.fg, t: 0.02 });
  const by = y + signH;
  const bh = h - signH;
  p.rect(x, by, w, bh, frameC);
  p.hline(x, by, w, shade(frameC, 0.6));
  const dw = 11;
  const dx = o.doorLeft ? x + 2 : x + w - dw - 2;
  const t = 0.02 + rng.next() * 0.04;
  const wx0 = o.doorLeft ? dx + dw + 2 : x + 2;
  const wx1 = o.doorLeft ? x + w - 2 : dx - 2;
  const wy = by + 2, wh = bh - 9;
  for (let yy = wy; yy < wy + wh; yy++)
    for (let xx = wx0; xx < wx1; xx++) {
      let c = shade(0x40576d, 1.18 - ((yy - wy) / wh) * 0.34);
      if ((xx + yy) % 19 === 3 && yy < wy + wh * 0.5) c = mixc(c, glassHi, 0.5);
      p.set(xx, yy, c, winCode(t));
    }
  goods(p, wx0, wy, wx1 - wx0, wh, S.goods, rng, t);
  for (let xx = wx0 + 15; xx < wx1 - 4; xx += 16) { p.rect(xx, wy, 2, wh, frameC); p.vline(xx + 1, wy, wh, shade(frameC, 0.7)); }
  // bulkhead with panels
  const bky = by + bh - 7;
  p.rect(x, bky, w, 7, shade(frameC, 0.82));
  for (let xx = x + 3; xx < x + w - 8; xx += 12) { p.frame(xx, bky + 2, 9, 4, shade(frameC, 0.62)); p.hline(xx + 1, bky + 2, 7, shade(frameC, 1.1)); }
  p.hline(x, bky, w, shade(frameC, 1.15));
  // door
  p.rect(dx, by + 2, dw, bh - 2, shade(frameC, 0.85));
  p.rect(dx + 2, by + 4, dw - 4, bh - 12, 0x40576d, winCode(t));
  p.hline(dx + 2, by + 5, dw - 4, glassHi, winCode(t));
  p.rect(dx + 2, by + Math.floor(bh * 0.55), dw - 4, 2, 0xc8c8c4);
  // neon "OPEN" and hours sticker
  if (o.open !== false && wx1 - wx0 > 26) {
    p.text7(wx0 + 3, wy + 3, 'OPEN', 0xff4f6a, winCode(0.01, true));
    p.rect(wx1 - 6, wy + wh - 8, 4, 5, 0xf2efe6);
  }
  return { name, color: S.awn, kind };
}

// Roll-down security gate (shown at night)
export function drawGate(p, w, h, rng) {
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      let c = yy % 3 === 0 ? 0x7d8087 : yy % 3 === 1 ? 0xa4a7ad : 0x96999f;
      if (xx % 18 === 0) c = 0x6a6d74;
      p.set(xx, yy, shade(c, 0.95 + hash2i(xx, yy, 5) * 0.08));
    }
  p.rect(0, 0, w, 4, 0x5a5d63);
  p.hline(0, 0, w, 0x7a7d83);
  p.rect(0, h - 2, w, 2, 0x4a4d52);
  graffiti(p, 2, 6, w - 4, h - 10, rng, 0.8);
}

export function graffiti(p, x, y, w, h, rng, density = 1) {
  const cols = [0xff4f6a, 0x4fd2ff, 0xffd84f, 0x7dff6a, 0xff7ae0, 0xffffff, 0x1b1b1b, 0xff9a3a, 0x7a4fff];
  const n = Math.floor(((w * h) / 240) * density);
  for (let i = 0; i < n; i++) {
    const c = rng.pick(cols);
    const kind = rng.int(0, 3);
    const gx = x + rng.int(0, Math.max(0, w - 12)), gy = y + rng.int(0, Math.max(0, h - 9));
    if (kind === 0) {
      const s = rng.pick(['NYC', 'ZEPH', 'REVS', 'SKY', 'BOMB', 'YO', 'ART', 'LOVE', 'KO', 'DMZ', 'TAKI', 'JOY']);
      const fit = s.slice(0, Math.max(1, Math.floor((w - (gx - x)) / 6)));
      p.text7(gx + 1, gy + 1, fit, shade(c, 0.4));
      p.text7(gx, gy, fit, c);
    } else if (kind === 1) {
      let sx = gx, sy = gy + 4;
      for (let k = 0; k < 16; k++) { p.set(sx, sy, c); p.set(sx, sy + 1, c); sx++; sy += rng.int(-1, 1); }
    } else if (kind === 2) {
      p.ellipse(gx + 4, gy + 4, 4.5, 4.5, c);
      p.ellipse(gx + 4, gy + 4, 2, 2, shade(c, 0.55));
    } else {
      p.rect(gx, gy, rng.int(6, 14), 3, c);
      p.hline(gx, gy + 3, 6, shade(c, 0.5));
    }
  }
}

// Mural (handball wall etc.)
export function mural(p, x, y, w, h, rng) {
  const skies = [[0x4fd2ff, 0xff7ae0], [0xffd84f, 0xff4f6a], [0x7dff6a, 0x4f7aff]];
  const [c1, c2] = rng.pick(skies);
  for (let yy = 0; yy < h; yy++) {
    const c = mixc(c1, c2, yy / h);
    for (let xx = 0; xx < w; xx++) p.set(x + xx, y + yy, (xx + yy) % 2 && (yy % 8 === 0) ? shade(c, 1.05) : c);
  }
  // sun with rays
  const sx = x + w * 0.7, sy = y + h * 0.35, sr = h * 0.2;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) for (let r = sr + 2; r < sr + 6; r++) p.set(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r), 0xffe27a);
  p.ellipse(sx, sy, sr, sr, 0xffe27a);
  p.ellipse(sx - sr * 0.2, sy - sr * 0.2, sr * 0.6, sr * 0.6, 0xfff2b0);
  // skyline silhouette with lit windows
  let bx = x;
  while (bx < x + w) {
    const bw = rng.int(6, 14), bh = rng.int(Math.floor(h * 0.25), Math.floor(h * 0.7));
    p.rect(bx, y + h - bh, bw, bh, 0x2a1f4a);
    p.vline(bx, y + h - bh, bh, 0x3a2f5a);
    for (let k = 3; k < bh - 3; k += 4) for (let j = 2; j < bw - 2; j += 3) if (rng.chance(0.45)) p.set(bx + j, y + h - bh + k, 0xffd84f);
    if (rng.chance(0.3)) p.vline(bx + (bw >> 1), y + h - bh - 6, 6, 0x2a1f4a);
    bx += bw;
  }
  const word = rng.pick(['NYC', 'PEACE', 'HOOPS', 'BKLYN', 'LOVE']);
  const sc = h > 52 ? 2 : 1;
  p.text7(x + 5, y + 5, word, 0x2a1f4a, 255, sc);
  p.text7(x + 4, y + 4, word, 0xffffff, 255, sc);
}

// ---- roofs -------------------------------------------------------------------
export function roofFill(p, w, h, kind, rng) {
  const base = kind === 'silver' ? 0xc4c6c9 : kind === 'gravel' ? 0x8e8b86 : kind === 'green' ? 0x5f8f45 : kind === 'deck' ? 0x9a6a44 : 0x5b5c62;
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const hh = hash2i(xx + p.ox, yy + p.oy, 41);
      let c = shade(base, 0.93 + hh * 0.12);
      if (kind === 'tar' && (yy % 20 === 0)) c = shade(base, 0.82);
      if (kind === 'tar' && (yy % 20 === 1)) c = shade(base, 1.06);
      if (kind === 'silver' && (xx % 24 === 0)) c = shade(base, 0.88);
      if (kind === 'silver' && (xx % 24 === 1)) c = shade(base, 1.05);
      if (kind === 'deck' && (xx % 6 === 0)) c = shade(base, 0.76);
      if (kind === 'gravel' && hh > 0.86) c = shade(base, hh > 0.95 ? 1.3 : 0.75);
      if (kind === 'green' && hh > 0.8) c = shade(base, hh > 0.93 ? 1.25 : 0.8);
      p.set(xx, yy, c);
    }
  for (let i = 0; i < Math.floor((w * h) / 1600); i++) {
    const x = rng.int(0, w - 12), y = rng.int(0, h - 8);
    const pw = rng.int(6, 16), ph = rng.int(4, 10);
    const c = shade(base, rng.range(0.85, 1.1));
    p.rect(x, y, pw, ph, c);
    p.hline(x, y, pw, shade(c, 1.08));
  }
}

// ---- small shared textures ------------------------------------------------------
export function railingTex(p, w, h, c = 0x1e1e22, step = 4) {
  p.clear();
  p.rect(0, 0, w, 2, c);
  p.hline(0, 0, w, shade(c, 1.8));
  p.rect(0, h - 2, w, 2, c);
  for (let x = 0; x < w; x += step) {
    p.rect(x, 0, 1, h, c);
    if (h > 12) p.set(x, 3, shade(c, 1.6)); // finials
  }
  if (h > 14) for (let x = 0; x < w; x++) if (x % step === Math.floor(step / 2)) p.set(x, Math.floor(h / 2), c);
}

export function chainLinkTex(p, w, h) {
  p.clear();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d1 = (x + y) % 8 === 0, d2 = (x - y + 800) % 8 === 0;
      if (d1 || d2) p.set(x, y, d1 && d2 ? 0xb8bec6 : (x + y) % 16 < 8 ? 0x8a9199 : 0x7a8189);
    }
  p.rect(0, 0, w, 2, 0x9aa0a8);
}

export function ladderTex(p, w, h, c = 0x1e1e22) {
  p.clear();
  p.rect(0, 0, 2, h, c);
  p.rect(w - 2, 0, 2, h, c);
  for (let y = 2; y < h; y += 5) p.rect(0, y, w, 1, c);
}

export function plankTex(p, w, h, c, hoops = true) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const plank = Math.floor(x / 4);
      let col = shade(c, 0.88 + hash2i(plank, y >> 4, 9) * 0.22);
      if (x % 4 === 3) col = shade(col, 0.72);
      else if (x % 4 === 0) col = shade(col, 1.08);
      if (hash2i(x, y, 11) > 0.97) col = shade(col, 0.8); // knots/grain
      p.set(x, y, col);
    }
  if (hoops) for (let y = 6; y < h; y += 12) { p.rect(0, y, w, 1, 0x2e2e32); p.rect(0, y + 1, w, 1, 0x4a4a50); }
}

export function grilleTex(p, w, h, c) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) p.set(x, y, y % 3 === 2 ? shade(c, 0.66) : y % 3 === 0 ? shade(c, 1.08) : c);
  p.frame(0, 0, w, h, shade(c, 0.55));
  p.frame(1, 1, w - 2, h - 2, shade(c, 1.12));
}

export function awningTex(p, w, h, c, striped, text, rng) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let col = c;
      if (striped && Math.floor(x / 8) % 2 === 1) col = 0xf2efe6;
      col = shade(col, 1 - (y / h) * 0.14 + (x % 8 === 0 ? -0.04 : 0));
      p.set(x, y, col);
    }
  if (text) {
    const tw = textWidth(text, 1, true);
    if (tw < w - 4) p.text7(Math.floor((w - tw) / 2), Math.max(0, Math.floor((h - 7) / 2)), text, 0xffffff);
  }
  void rng;
}

// Billboard advert art
export function billboardArt(p, w, h, kind, rng) {
  const t = winCode(0.03, true); // self-lit at dusk
  const S = (x, y, ww, hh, c) => {
    for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < ww; xx++) p.set(Math.round(x) + xx, Math.round(y) + yy, c, t);
  };
  const txt = (x, y, s, c, sc = 1, sh = null) => { if (sh != null) p.text7(x + sc, y + sc, s, sh, t, sc); p.text7(x, y, s, c, t, sc); };
  const disc = (cx, cy, r, c) => p.ellipse(cx, cy, r, r, c, t);
  if (kind === 'cola') {
    S(0, 0, w, h, 0xd8202c);
    for (let x = 0; x < w; x++) { const wy = Math.floor(h * 0.66 + Math.sin(x * 0.1) * 3); for (let k = 0; k < 3; k++) p.set(x, wy + k, 0xffffff, t); }
    S(w - 26, 6, 12, h - 12, 0x5a0e0e); S(w - 24, 8, 3, h - 16, 0xb84040); S(w - 23, 2, 6, 5, 0xd8d8d8); S(w - 26, h / 2 - 3, 12, 6, 0xf2efe6);
    txt(6, 6, 'FIZZ', 0xffffff, 2, 0x6a0e14);
    txt(6, h - 14, 'COLA', 0xffd84f, 1, 0x6a0e14);
  } else if (kind === 'bagel') {
    S(0, 0, w, h, 0xf2c230);
    disc(w - 24, h / 2, 14, 0x9a5a24); disc(w - 24, h / 2, 12, 0xc4783a); disc(w - 26, h / 2 - 3, 6, 0xd89a58); disc(w - 24, h / 2, 5, 0xf2c230);
    for (let k = 0; k < 10; k++) p.set(w - 32 + rng.int(0, 16), Math.round(h / 2) - 8 + rng.int(0, 16), 0xf2efe6, t);
    txt(6, 6, 'BAGEL', 0x3b2a20, 2);
    txt(6, h - 14, 'BROS', 0x3b2a20);
  } else if (kind === 'jazz') {
    S(0, 0, w, h, 0x1d1a4a);
    for (let i = 0; i < 30; i++) p.set(rng.int(0, w - 1), rng.int(0, h - 1), 0x4a4a8a, t);
    txt(6, 6, 'JAZZ', 0xffd84f, 2, 0x0a0a2a);
    txt(6, h - 14, 'TONIGHT', 0x4fd2ff);
    for (let i = 0; i < 14; i++) { p.set(w - 22 + Math.floor(i * 0.6), 8 + i, 0xe0a020, t); p.set(w - 21 + Math.floor(i * 0.6), 8 + i, 0xc88a18, t); }
    S(w - 16, 20, 8, 5, 0xe0a020); S(w - 14, 22, 4, 2, 0x8a5a10);
  } else if (kind === 'show') {
    S(0, 0, w, h, 0x0b0b0b);
    for (let x = 2; x < w; x += 6) { S(x, 1, 2, 2, 0xffd84f); S(x, h - 3, 2, 2, 0xffd84f); }
    txt(8, 7, 'BIG', 0xff4f6a, 2, 0x4a0010);
    txt(8, h - 14, 'APPLE SHOW', 0xffffff);
    disc(w - 18, h / 2, 9, 0xd8202c); S(w - 19, h / 2 - 12, 2, 4, 0x6a4a2a); S(w - 17, h / 2 - 12, 4, 2, 0x58ac43);
  } else if (kind === 'taxi') {
    S(0, 0, w, h, 0xffcf2f);
    for (let x = 0; x < w; x += 8) { S(x, h - 6, 4, 3, 0x1b1b1b); S(x + 4, h - 3, 4, 3, 0x1b1b1b); }
    txt(6, 6, 'RIDE', 0x1b1b1b, 2);
    txt(6, h - 16, 'CITY CAB', 0x1b1b1b);
  } else if (kind === 'sun') {
    S(0, 0, w, h, 0x4fc8ff);
    disc(w - 20, 14, 11, 0xffe27a); disc(w - 22, 12, 6, 0xfff2b0);
    S(0, h - 12, w, 12, 0xf2d9a6);
    for (let x = 0; x < w; x += 5) p.set(x, h - 12, 0xe8c88a, t);
    txt(6, 6, 'SPF 50', 0xffffff, 2, 0x1a6a9a);
    txt(6, h - 10, 'SUMMER', 0xd94f4f);
  } else {
    S(0, 0, w, h, 0x2f8a46);
    txt(6, 6, 'GOTHAM', 0xffffff, 2, 0x0e3a1a);
    txt(6, h - 14, 'GIN', 0xffd84f);
    S(w - 18, 8, 10, h - 14, 0xd8e8e0); S(w - 16, 4, 6, 5, 0x1b1b1b); S(w - 18, h / 2, 10, 6, 0xc8302c);
  }
  p.frame(0, 0, w, h, 0xe8e8e8, t);
  p.frame(1, 1, w - 2, h - 2, 0x9a9a9a, t);
}

export function makeRng(seed) { return new RNG(seed); }
export { rgb, R, G, B };
