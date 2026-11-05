// Pixel-art facade painters. Coordinates: texels, y = 0 at the TOP of the facade.

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
export const glassHi = 0x7fa5c4;

// ---- wall fills -------------------------------------------------------------
export function brickFill(p, x, y, w, h, pal, seed = 1, opt = {}) {
  const base = pal[0];
  const mortar = mixc(base, 0xd6c9b8, 0.22);
  for (let yy = 0; yy < h; yy++) {
    const gy = y + yy + (opt.oy || 0);
    const row = gy >> 1;
    const isMortar = (gy & 1) === 1;
    for (let xx = 0; xx < w; xx++) {
      const gx = x + xx + (opt.ox || 0);
      if (isMortar) {
        const hh = hash2i(gx, gy, seed);
        p.set(x + xx, y + yy, shade(mortar, 0.95 + hh * 0.08));
      } else {
        const cell = Math.floor((gx + (row & 1) * 2) / 4);
        const hc = hash2i(cell, row, seed + 7);
        let c = pal[Math.floor(hc * pal.length)];
        if (hc > 0.965) c = shade(c, 0.78);
        else if (hc < 0.03) c = shade(c, 1.15);
        p.set(x + xx, y + yy, shade(c, 0.97 + hash2i(gx, gy, seed + 1) * 0.06));
      }
    }
  }
}

export function stoneFill(p, x, y, w, h, pal, seed = 1, course = 6, opt = {}) {
  for (let yy = 0; yy < h; yy++) {
    const gy = y + yy + (opt.oy || 0);
    for (let xx = 0; xx < w; xx++) {
      const gx = x + xx;
      const hh = hash2i(gx, gy, seed);
      let c = shade(pal[0], 0.96 + hh * 0.07);
      if (course && gy % course === course - 1) c = shade(pal[0], 0.86);
      else if (opt.blocks && course && (gx + Math.floor(gy / course) * 7) % opt.blocks === 0) c = shade(pal[0], 0.9);
      p.set(x + xx, y + yy, c);
    }
  }
}

export function smoothFill(p, x, y, w, h, c, seed = 1, amt = 0.05) {
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const hh = hash2i(x + xx, y + yy, seed);
      p.set(x + xx, y + yy, shade(c, 1 - amt + hh * amt * 2));
    }
}

export function rustication(p, x, y, w, h, c, step = 3) {
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const hh = hash2i(x + xx, y + yy, 77);
      let col = shade(c, 0.95 + hh * 0.08);
      if (yy % step === step - 1) col = shade(c, 0.7);
      else if (yy % step === 0) col = shade(c, 1.08);
      p.set(x + xx, y + yy, col);
    }
  }
}

// ---- windows ----------------------------------------------------------------
// o: { frame, lintel, sill, t, curtain, blinds, plant, rail(bool), arch, panes, glass, deep }
export function drawWindow(p, x, y, w, h, o = {}, rng) {
  const frame = o.frame ?? 0xf2efe6;
  const t = o.t ?? 0.5;
  if (o.lintel != null) {
    const lw = w + 2;
    p.rect(x - 1, y - 2, lw, 2, o.lintel);
    p.hline(x - 1, y - 1, lw, shade(o.lintel, 0.8));
    if (o.keystone) p.rect(x + (w >> 1) - 1, y - 3, 2, 3, shade(o.lintel, 1.08));
  }
  if (o.arch) {
    // rounded top: shave corners
    p.rect(x, y, w, h, frame);
  } else p.rect(x, y, w, h, frame);
  const gx = x + 1, gy = y + 1, gw = w - 2, gh = h - 2;
  const glass = o.glass ?? glassDay;
  const code = winCode(t);
  for (let yy = 0; yy < gh; yy++) {
    for (let xx = 0; xx < gw; xx++) {
      let c = shade(glass, 1.12 - (yy / gh) * 0.25);
      // reflection streak
      if ((xx + yy) % 7 === 2 && yy < gh * 0.6 && xx < gw - 1) c = mixc(c, glassHi, 0.7);
      p.set(gx + xx, gy + yy, c, code);
    }
  }
  if (o.arch) {
    p.set(x, y, o.wall ?? frame);
    p.set(x + w - 1, y, o.wall ?? frame);
  }
  // interior details
  if (o.curtain != null) {
    const cc = winCode(t, true);
    const cw = Math.max(1, Math.floor(gw / 3));
    for (let yy = 0; yy < gh; yy++) {
      for (let xx = 0; xx < cw; xx++) {
        const c = shade(o.curtain, xx === cw - 1 ? 0.85 : 1);
        p.set(gx + xx, gy + yy, c, cc);
        p.set(gx + gw - 1 - xx, gy + yy, c, cc);
      }
    }
    if (o.valance) for (let xx = 0; xx < gw; xx++) p.set(gx + xx, gy, o.curtain, cc);
  }
  if (o.blinds) {
    const cc = winCode(t, true);
    const bh = Math.floor(gh * (0.3 + (rng ? rng.next() * 0.5 : 0.3)));
    for (let yy = 0; yy < bh; yy++)
      for (let xx = 0; xx < gw; xx++) p.set(gx + xx, gy + yy, yy % 2 ? 0xd8d2c2 : 0xeee8d8, cc);
  }
  if (o.rail !== false && h >= 9) {
    const my = y + Math.floor(h / 2);
    p.hline(x, my, w, frame);
  }
  if (o.panes && gw >= 5) {
    p.vline(x + Math.floor(w / 2), y, h, frame);
  }
  if (o.plant) {
    const py = y + h - 3;
    p.rect(gx, py, gw, 2, 0x3f8a35);
    p.set(gx + 1, py - 1, 0x58ac43);
    p.set(gx + gw - 2, py - 1, 0x58ac43);
    if (o.plant === 'flower') { p.set(gx + 1, py - 1, 0xe84a5f); p.set(gx + gw - 2, py - 2, 0xf2c230); }
  }
  if (o.cat) {
    const cx = gx + 1, cy = y + h - 4;
    const cc = o.cat;
    p.rect(cx, cy, 3, 2, cc);
    p.set(cx, cy - 1, cc); p.set(cx + 2, cy - 1, cc);
  }
  if (o.sill != null) {
    p.rect(x - 1, y + h, w + 2, 1, o.sill);
  }
}

export function drawDoor(p, x, y, w, h, o = {}) {
  const c = o.color ?? 0x5c3b2a;
  const frame = o.frame ?? shade(c, 0.7);
  p.rect(x, y, w, h, frame);
  p.rect(x + 1, y + 1, w - 2, h - 1, c);
  if (o.transom !== false) {
    p.rect(x + 1, y + 1, w - 2, 3, glassDay, winCode(o.t ?? 0.15));
    p.hline(x + 1, y + 4, w - 2, frame);
  }
  // panels
  const py = y + (o.transom !== false ? 6 : 2);
  if (o.glass) {
    p.rect(x + 2, py, w - 4, Math.floor((h - (py - y)) * 0.55), glassDay, winCode(o.t ?? 0.15));
  } else {
    for (let yy = py; yy < y + h - 2; yy += 4) {
      p.frame(x + 2, yy, Math.max(1, Math.floor((w - 4) / 2)), 3, shade(c, 0.82));
      p.frame(x + 2 + Math.ceil((w - 4) / 2), yy, Math.max(1, Math.floor((w - 4) / 2)), 3, shade(c, 0.82));
    }
  }
  p.set(x + w - 3, y + Math.floor(h * 0.6), 0xe6c34a);
  if (o.number != null) p.text(x + 1, y - 6, String(o.number), 0xe6c34a);
  if (o.wreath) {
    const cx = x + (w >> 1), cy = py + 3;
    p.ring(cx, cy, 3, 3, 1, 0x2f7a3a);
    p.set(cx, cy + 2, 0xd8302c);
  }
}

// Classic NYC cornice band painted on the facade top
export function corniceBand(p, x, y, w, h, c) {
  p.rect(x, y, w, h, c);
  p.hline(x, y, w, shade(c, 1.15));
  p.hline(x, y + h - 1, w, shade(c, 0.7));
  // dentils
  for (let xx = 1; xx < w - 1; xx += 3) p.rect(x + xx, y + h - 3, 2, 2, shade(c, 0.82));
  // brackets
  for (let xx = 2; xx < w - 2; xx += Math.max(8, Math.floor(w / 6))) {
    p.rect(x + xx, y + 1, 2, h - 2, shade(c, 0.9));
    p.set(x + xx, y + h - 2, shade(c, 0.6));
  }
}

// ---- signs ------------------------------------------------------------------
export function signBoard(p, x, y, w, h, text, o = {}) {
  const bg = o.bg ?? 0x1b1b1b;
  const fg = o.fg ?? 0xffd84f;
  const lit = o.lit ?? true;
  p.rect(x, y, w, h, bg);
  if (o.border) p.frame(x, y, w, h, o.border);
  const scale = o.scale ?? (h >= 12 && textWidth(text, 2) <= w - 4 ? 2 : 1);
  const tw = textWidth(text, scale);
  const tx = x + Math.floor((w - tw) / 2), ty = y + Math.floor((h - 5 * scale) / 2);
  p.text(tx, ty, text, fg, lit ? winCode(o.t ?? 0.02, true) : 255, scale);
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
  const put = (xx, yy, c) => p.set(x + xx, y + yy, c, cc);
  const colors = [0xd94f4f, 0xe8c24a, 0x5aa0d8, 0x7fc06a, 0xe58fb5, 0xf09a4a, 0xffffff, 0xb07ad6];
  // shelves
  if (kind === 'washers') {
    for (let xx = 0; xx + 4 <= w; xx += 5) {
      for (let yy = h - 6; yy < h; yy++) for (let k = 0; k < 4; k++) put(xx + k, yy, 0xe8e8ea);
      put(xx + 1, h - 4, 0x4a5a70); put(xx + 2, h - 4, 0x4a5a70); put(xx + 1, h - 3, 0x4a5a70); put(xx + 2, h - 3, 0x6a8ab0);
    }
    return;
  }
  if (kind === 'pizza' || kind === 'food' || kind === 'diner' || kind === 'cafe' || kind === 'bagels') {
    // counter + menu board + people silhouettes
    for (let xx = 0; xx < w; xx++) put(xx, h - 3, kind === 'cafe' ? 0x6b4a32 : 0xc8c4bc);
    for (let xx = 0; xx < w; xx++) put(xx, h - 2, 0x8a8680);
    for (let xx = 1; xx < w - 1; xx += 4) put(xx, 1, 0xf2efe6), put(xx + 1, 1, 0xf2efe6);
    if (kind === 'pizza') { for (let k = 0; k < 3; k++) put(2 + k, h - 4, 0xe8c24a); put(3, h - 4, 0xc8302c); }
    if (kind === 'bagels') for (let k = 1; k < w - 1; k += 3) put(k, h - 4, 0xc49860);
    return;
  }
  if (kind === 'bar') {
    for (let xx = 0; xx < w; xx++) put(xx, h - 3, 0x4a2a1a);
    for (let xx = 1; xx < w - 1; xx += 2) put(xx, 2, colors[(xx * 3) % colors.length]);
    put(1, 1, 0xff4f6a); put(2, 1, 0xff4f6a);
    return;
  }
  if (kind === 'flowers') {
    for (let xx = 0; xx < w; xx++) for (let yy = h - 5; yy < h; yy++) put(xx, yy, rng.chance(0.5) ? 0x3f8a35 : colors[rng.int(0, 4)]);
    return;
  }
  if (kind === 'art') {
    for (let xx = 1; xx + 4 < w; xx += 6) {
      const c = colors[rng.int(0, colors.length - 1)];
      for (let yy = 2; yy < 6; yy++) for (let k = 0; k < 4; k++) put(xx + k, yy, c);
    }
    return;
  }
  // generic shelves of products
  for (let yy = 1; yy < h - 1; yy += 3) {
    for (let xx = 0; xx < w; xx++) {
      put(xx, yy + 2, 0x8a8680);
      if (rng.chance(0.75)) put(xx, yy + 1, colors[rng.int(0, colors.length - 1)]);
    }
  }
}

// Shopfront occupying [x, x+w) x [y, y+h). Returns info about sign.
export function drawShopfront(p, x, y, w, h, kind, rng, o = {}) {
  const S = SHOPS[kind] || SHOPS.bodega;
  const frameC = o.frame ?? rng.pick([0x1b1b1b, 0x2f4a3a, 0x5c3b2a, 0x7a1f1f, 0x1f3a5f, 0xe8e2d0]);
  const signH = o.signH ?? 6;
  // sign band
  const name = o.name ?? rng.pick(S.name);
  signBoard(p, x, y, w, signH, name, { bg: S.bg, fg: S.fg, t: 0.02 });
  // body
  const by = y + signH;
  const bh = h - signH;
  p.rect(x, by, w, bh, frameC);
  // door position
  const dw = 5;
  const dx = o.doorLeft ? x + 1 : x + w - dw - 1;
  const t = 0.02 + rng.next() * 0.04;
  // display windows
  const wx0 = o.doorLeft ? dx + dw + 1 : x + 1;
  const wx1 = o.doorLeft ? x + w - 1 : dx - 1;
  const wy = by + 1, wh = bh - 4;
  for (let yy = wy; yy < wy + wh; yy++)
    for (let xx = wx0; xx < wx1; xx++) {
      const c = shade(0x40576d, 1.15 - ((yy - wy) / wh) * 0.3);
      p.set(xx, yy, c, winCode(t));
    }
  goods(p, wx0, wy, wx1 - wx0, wh, S.goods, rng, t);
  // mullions
  for (let xx = wx0 + 7; xx < wx1 - 2; xx += 8) p.vline(xx, wy, wh, frameC);
  // bulkhead
  p.rect(x, by + bh - 3, w, 3, shade(frameC, 0.8));
  // door
  p.rect(dx, by + 1, dw, bh - 1, shade(frameC, 0.85));
  p.rect(dx + 1, by + 2, dw - 2, bh - 5, 0x40576d, winCode(t));
  p.set(dx + dw - 2, by + Math.floor(bh * 0.55), 0xe6c34a);
  // neon "OPEN" in window
  if (o.open !== false && wx1 - wx0 > 10) {
    const ox = wx0 + 2, oy = wy + 2;
    p.text(ox, oy, 'OPEN', 0xff4f6a, winCode(0.01, true));
  }
  return { name, color: S.awn, kind };
}

// Roll-down security gate (shown at night)
export function drawGate(p, w, h, rng) {
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      let c = yy % 2 ? 0x8d9097 : 0xa4a7ad;
      if (xx % 9 === 0) c = 0x7a7d84;
      p.set(xx, yy, shade(c, 0.95 + hash2i(xx, yy, 5) * 0.08));
    }
  p.rect(0, 0, w, 2, 0x5a5d63);
  p.rect(0, h - 1, w, 1, 0x4a4d52);
  graffiti(p, 1, 3, w - 2, h - 5, rng, 0.8);
}

export function graffiti(p, x, y, w, h, rng, density = 1) {
  const cols = [0xff4f6a, 0x4fd2ff, 0xffd84f, 0x7dff6a, 0xff7ae0, 0xffffff, 0x1b1b1b, 0xff9a3a, 0x7a4fff];
  const n = Math.floor(((w * h) / 60) * density);
  for (let i = 0; i < n; i++) {
    const c = rng.pick(cols);
    const kind = rng.int(0, 3);
    const gx = x + rng.int(0, Math.max(0, w - 6)), gy = y + rng.int(0, Math.max(0, h - 5));
    if (kind === 0) {
      // tag letters
      const s = rng.pick(['NYC', 'ZEPH', 'KAWS', 'REVS', 'SKY', 'BOMB', 'YO', 'ART', 'LOVE', 'KO', 'DMZ', 'TAKI']);
      p.text(gx, gy, s.slice(0, Math.max(1, Math.floor((w - (gx - x)) / 4))), c);
    } else if (kind === 1) {
      // squiggle
      let sx = gx, sy = gy + 2;
      for (let k = 0; k < 8; k++) { p.set(sx, sy, c); sx++; sy += rng.int(-1, 1); }
    } else if (kind === 2) {
      p.ellipse(gx + 2, gy + 2, 2.2, 2.2, c);
      p.set(gx + 2, gy + 2, shade(c, 0.6));
    } else {
      p.rect(gx, gy, rng.int(3, 7), 2, c);
    }
  }
}

// Mural (handball wall etc.)
export function mural(p, x, y, w, h, rng) {
  const skies = [[0x4fd2ff, 0xff7ae0], [0xffd84f, 0xff4f6a], [0x7dff6a, 0x4f7aff]];
  const [c1, c2] = rng.pick(skies);
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) p.set(x + xx, y + yy, mixc(c1, c2, yy / h));
  // sun
  p.ellipse(x + w * 0.7, y + h * 0.35, h * 0.22, h * 0.22, 0xffe27a);
  // skyline silhouette
  let sx = x;
  while (sx < x + w) {
    const bw = rng.int(3, 7), bh = rng.int(Math.floor(h * 0.25), Math.floor(h * 0.7));
    p.rect(sx, y + h - bh, bw, bh, 0x2a1f4a);
    for (let k = 0; k < bh - 2; k += 3) if (rng.chance(0.5)) p.set(sx + 1, y + h - bh + 1 + k, 0xffd84f);
    sx += bw;
  }
  p.text(x + 2, y + 2, rng.pick(['NYC', 'PEACE', 'HOOPS', 'BKLYN', 'LOVE']), 0xffffff, 255, h > 26 ? 2 : 1);
}

// ---- roofs -------------------------------------------------------------------
export function roofFill(p, w, h, kind, rng) {
  const base = kind === 'silver' ? 0xc7c9cc : kind === 'gravel' ? 0x8e8b86 : kind === 'green' ? 0x5f8f45 : kind === 'deck' ? 0x9a6a44 : 0x5b5c62;
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const hh = hash2i(xx + p.ox, yy + p.oy, 41);
      let c = shade(base, 0.93 + hh * 0.12);
      if (kind === 'tar' && (yy + p.oy) % 10 === 0) c = shade(base, 0.85);
      if (kind === 'silver' && (xx + p.ox) % 12 === 0) c = shade(base, 0.9);
      if (kind === 'deck' && (xx + p.ox) % 3 === 0) c = shade(base, 0.8);
      if (kind === 'gravel' && hh > 0.9) c = shade(base, 1.2);
      p.set(xx, yy, c);
    }
  // patches and drains
  for (let i = 0; i < Math.floor((w * h) / 400); i++) {
    const x = rng.int(0, w - 6), y = rng.int(0, h - 4);
    p.rect(x, y, rng.int(3, 8), rng.int(2, 5), shade(base, rng.range(0.85, 1.1)));
  }
}

// ---- small shared textures ------------------------------------------------------
export function railingTex(p, w, h, c = 0x1e1e22, step = 3) {
  p.clear();
  p.rect(0, 0, w, 1, c);
  p.rect(0, h - 1, w, 1, c);
  for (let x = 0; x < w; x += step) p.rect(x, 0, 1, h, c);
}

export function chainLinkTex(p, w, h) {
  p.clear();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) p.set(x, y, 0xb8bcc2);
    }
  p.rect(0, 0, w, 1, 0x9aa0a8);
}

export function ladderTex(p, w, h, c = 0x1e1e22) {
  p.clear();
  p.rect(0, 0, 1, h, c);
  p.rect(w - 1, 0, 1, h, c);
  for (let y = 1; y < h; y += 3) p.rect(0, y, w, 1, c);
}

export function plankTex(p, w, h, c, hoops = true) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let col = shade(c, 0.9 + hash2i(Math.floor(x / 2), y >> 3, 9) * 0.2);
      if (x % 2 === 1) col = shade(col, 0.92);
      p.set(x, y, col);
    }
  if (hoops) for (let y = 3; y < h; y += 6) p.rect(0, y, w, 1, 0x3a3a3e);
}

export function grilleTex(p, w, h, c) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) p.set(x, y, y % 2 ? shade(c, 0.75) : c);
  p.frame(0, 0, w, h, shade(c, 0.6));
}

export function awningTex(p, w, h, c, striped, text, rng) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let col = c;
      if (striped && Math.floor(x / 4) % 2 === 1) col = 0xf2efe6;
      p.set(x, y, shade(col, 1 - (y / h) * 0.12));
    }
  if (text) {
    const tw = textWidth(text);
    if (tw < w - 2) p.text(Math.floor((w - tw) / 2), Math.max(0, Math.floor((h - 5) / 2)), text, 0xffffff);
  }
  void rng;
}

// Billboard advert art
export function billboardArt(p, w, h, kind, rng) {
  const t = winCode(0.03, true); // self-lit at dusk
  const S = (x, y, ww, hh, c) => {
    for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < ww; xx++) p.set(x + xx, y + yy, c, t);
  };
  const txt = (x, y, s, c, sc = 1) => p.text(x, y, s, c, t, sc);
  if (kind === 'cola') {
    S(0, 0, w, h, 0xd8202c);
    for (let x = 0; x < w; x++) p.set(x, Math.floor(h * 0.62 + Math.sin(x * 0.2) * 2), 0xffffff, t);
    S(w - 14, 3, 7, h - 6, 0x6a1010);
    S(w - 13, 4, 2, h - 8, 0xb84040);
    txt(3, 4, 'FIZZ', 0xffffff, 2);
    txt(3, h - 8, 'COLA', 0xffd84f);
  } else if (kind === 'bagel') {
    S(0, 0, w, h, 0xf2c230);
    p.ellipse(w - 12, h / 2, 8, 6, 0xc4783a, t);
    p.ellipse(w - 12, h / 2, 3, 2, 0xf2c230, t);
    txt(3, 4, 'BAGEL', 0x3b2a20, 2);
    txt(3, h - 8, 'BROS', 0x3b2a20);
  } else if (kind === 'jazz') {
    S(0, 0, w, h, 0x1d1a4a);
    txt(3, 3, 'JAZZ', 0xffd84f, 2);
    txt(3, h - 8, 'TONIGHT', 0x4fd2ff);
    for (let i = 0; i < 6; i++) p.set(w - 10 + i, 6 + i, 0xe0a020, t);
    S(w - 6, 11, 4, 3, 0xe0a020);
  } else if (kind === 'show') {
    S(0, 0, w, h, 0x0b0b0b);
    for (let x = 1; x < w; x += 3) { p.set(x, 0, 0xffd84f, t); p.set(x, h - 1, 0xffd84f, t); }
    txt(4, 3, 'BIG', 0xff4f6a, 2);
    txt(4, h - 8, 'APPLE SHOW', 0xffffff);
  } else if (kind === 'taxi') {
    S(0, 0, w, h, 0xffcf2f);
    for (let x = 0; x < w; x += 4) S(x, h - 3, 2, 2, 0x1b1b1b);
    txt(3, 3, 'RIDE', 0x1b1b1b, 2);
    txt(3, h - 9, 'CITY CAB', 0x1b1b1b);
  } else if (kind === 'sun') {
    S(0, 0, w, h, 0x4fc8ff);
    p.ellipse(w - 10, 8, 6, 6, 0xffe27a, t);
    S(0, h - 6, w, 6, 0xf2d9a6);
    txt(3, 3, 'SPF 50', 0xffffff, 2);
    txt(3, h - 5, 'SUMMER', 0xd94f4f);
  } else {
    S(0, 0, w, h, 0x2f8a46);
    txt(3, 3, 'GOTHAM', 0xffffff, 2);
    txt(3, h - 8, 'GIN', 0xffd84f);
  }
  p.frame(0, 0, w, h, 0xe8e8e8, t);
}

export function makeRng(seed) { return new RNG(seed); }
export { rgb, R, G, B };
