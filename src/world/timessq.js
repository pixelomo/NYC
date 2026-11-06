// A mini Times Square: a paved pedestrian square with a screen-covered tower and red bleacher
// steps, framed by towers whose facades are covered in billboards, video screens and a news ticker.
// All the advertising is invented.

import { T, CURB } from './layout.js';
import { MAT, GRP } from './mesh.js';
import { RNG, shade, mixc, hash2i } from '../core/math.js';
import { winCode, textWidth } from '../core/painter.js';
import { sharedTex, markHeight, Frame } from './buildings.js';
import { propTex, chainFence, subwayEntrance } from './props.js';
import { drawShopfront, smoothFill, billboardArt } from './facades.js';

const PI = Math.PI;

// ---- artwork ------------------------------------------------------------------------------------
// Draw text centred in a box at the largest pixel-font scale that fits
function fitText(p, s, x, y, w, h, c, a, sh = null, maxScale = 4) {
  for (let sc = maxScale; sc >= 1; sc--) {
    const tw = textWidth(s, sc, true);
    if (tw <= w && 7 * sc <= h) {
      const tx = x + Math.floor((w - tw) / 2), ty = y + Math.floor((h - 7 * sc) / 2);
      if (sh != null) p.text7(tx + Math.max(1, sc >> 1), ty + Math.max(1, sc >> 1), s, sh, a, sc);
      p.text7(tx, ty, s, c, a, sc);
      return sc;
    }
  }
  return 0;
}

const AD_KINDS = ['cola', 'musical', 'noodles', 'phone', 'sale', 'news', 'movie', 'perfume', 'game', 'jeans', 'hello', 'wave', 'burger', 'cruise'];

// One advertisement filling [x, x+w) x [y, y+h), every texel written with alpha code a
function paintAd(p, x, y, w, h, kind, rng, a) {
  const R = (xx, yy, ww, hh, c) => p.rect(x + Math.round(xx), y + Math.round(yy), Math.round(ww), Math.round(hh), c, a);
  const E = (cx, cy, rx, ry, c) => p.ellipse(x + cx, y + cy, rx, ry, c, a);
  const G = (c0, c1) => p.vgrad(x, y, w, h, c0, c1, a);
  const big = h > 70;
  switch (kind) {
    case 'cola': {
      R(0, 0, w, h, 0xd8202c);
      for (let xx = 0; xx < w; xx++) { const wy = Math.floor(h * 0.68 + Math.sin(xx * 0.08) * h * 0.05); R(xx, wy, 1, Math.max(2, h * 0.06), 0xffffff); }
      const bw = Math.max(8, w * 0.12), bx = w - bw * 1.8;
      R(bx, h * 0.18, bw, h * 0.7, 0x5a0e0e); R(bx + bw * 0.2, h * 0.22, bw * 0.2, h * 0.6, 0xb84040); R(bx + bw * 0.25, h * 0.08, bw * 0.5, h * 0.12, 0xd8d8d8); R(bx, h * 0.45, bw, h * 0.12, 0xf2efe6);
      fitText(p, 'PIXEL', x + 4, y + 2, bx - 8, h * 0.32, 0xffffff, a, 0x6a0e14);
      fitText(p, 'COLA', x + 4, y + h * 0.32, bx - 8, h * 0.34, 0xffd84f, a, 0x6a0e14);
      break;
    }
    case 'musical': {
      G(0x3a1060, 0x10051e);
      for (let k = 0; k < Math.floor(w * h / 120); k++) { const sx = rng.int(0, w - 1), sy = rng.int(0, h - 1); R(sx, sy, 1, 1, rng.chance(0.5) ? 0xffe27a : 0xb090ff); }
      for (let k = 0; k < 5; k++) { const sx = (k + 0.5) * w / 5, sy = h * 0.15 + (k % 2) * h * 0.08; R(sx - 1, sy - 3, 2, 6, 0xffd84f); R(sx - 3, sy - 1, 6, 2, 0xffd84f); }
      fitText(p, 'SKYLINE', x + 3, y + h * 0.28, w - 6, h * 0.36, 0xffd84f, a, 0x6a3a00);
      fitText(p, 'THE MUSICAL', x + 3, y + h * 0.66, w - 6, h * 0.22, 0xffffff, a, null, 2);
      break;
    }
    case 'noodles': {
      R(0, 0, w, h, 0xf07a1a);
      const cx = w * 0.72, cy = h * 0.62, r = Math.min(w, h) * 0.26;
      E(cx, cy, r, r * 0.55, 0xf2efe6); E(cx, cy - r * 0.1, r * 0.85, r * 0.35, 0xe8c060);
      for (let k = 0; k < 6; k++) R(cx - r * 0.6 + k * r * 0.22, cy - r * 0.25, 1, r * 0.25, 0xd8a040);
      R(cx - r * 0.3, cy - r * 1.3, 2, r, 0x6a3a1a); R(cx + r * 0.1, cy - r * 1.35, 2, r, 0x6a3a1a);
      for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) R(cx - r * 0.6 + k * r * 0.5 + Math.sin(j) * 2, cy - r * 0.9 - j * 3, 1, 2, 0xfff2d0);
      fitText(p, 'NEON', x + 3, y + 3, w * 0.5, h * 0.4, 0xffffff, a, 0x8a3a00);
      fitText(p, 'NOODLES', x + 3, y + h * 0.45, w * 0.5, h * 0.3, 0x2a1a10, a);
      break;
    }
    case 'phone': {
      R(0, 0, w, h, 0x0b0b10);
      const pw = Math.max(10, w * 0.18), ph = h * 0.8, px = w * 0.68, py = h * 0.1;
      R(px - 1, py - 1, pw + 2, ph + 2, 0x6a6a74);
      for (let yy = 0; yy < ph; yy++) R(px, py + yy, pw, 1, mixc(0x2ae0ff, 0xff3ad8, yy / ph));
      fitText(p, 'ROCKET X', x + 3, y + h * 0.18, px - 8, h * 0.3, 0xffffff, a);
      fitText(p, 'NEW', x + 3, y + h * 0.55, px - 8, h * 0.22, 0x2ae0ff, a, null, 2);
      break;
    }
    case 'sale': {
      R(0, 0, w, h, 0xffd800);
      for (let k = -h; k < w; k += 12) for (let yy = 0; yy < h; yy++) { const xx = k + yy; if (xx >= 0 && xx < w && (yy & 1)) R(xx, yy, 1, 1, 0xffc400); }
      fitText(p, 'SALE', x + 3, y + 2, w - 6, h * 0.5, 0xd8202c, a, 0x7a1010);
      fitText(p, '50% OFF', x + 3, y + h * 0.52, w - 6, h * 0.4, 0x1b1b1b, a);
      break;
    }
    case 'news': {
      G(0x0c3a8a, 0x041a4a);
      R(0, h * 0.62, w, h * 0.12, 0xd8202c);
      fitText(p, 'NEWS 24', x + 3, y + h * 0.08, w - 6, h * 0.5, 0xffffff, a, 0x02102a);
      fitText(p, 'LIVE', x + 3, y + h * 0.62, w * 0.4, h * 0.12, 0xffffff, a, null, 2);
      R(w * 0.75, h * 0.8, w * 0.2, h * 0.12, 0xffffff);
      break;
    }
    case 'movie': {
      G(0x1a0505, 0x5a0a10);
      E(w * 0.7, h * 0.35, h * 0.22, h * 0.22, 0xf2e6c0);
      for (let k = 0; k < 9; k++) { const bw = w / 9, bh = h * (0.18 + hash2i(k, 3, 9) * 0.3); R(k * bw, h - bh, bw - 1, bh, 0x0a0505); }
      fitText(p, 'LAST TAXI', x + 3, y + h * 0.05, w * 0.62, h * 0.3, 0xffcf2f, a, 0x3a0000);
      fitText(p, 'FRIDAY', x + 3, y + h * 0.4, w * 0.5, h * 0.16, 0xffffff, a, null, 2);
      break;
    }
    case 'perfume': {
      G(0xf6a8d0, 0xb090f0);
      const bx = w * 0.62, bw = Math.max(10, w * 0.16);
      R(bx, h * 0.38, bw, h * 0.48, 0xf8f0ff); R(bx + 2, h * 0.42, bw - 4, h * 0.4, 0xe070b0); R(bx + bw * 0.3, h * 0.24, bw * 0.4, h * 0.14, 0xc8a050);
      fitText(p, 'BLOSSOM', x + 3, y + h * 0.3, bx - 6, h * 0.3, 0xffffff, a, 0x8a3a6a);
      break;
    }
    case 'game': {
      R(0, 0, w, h, 0x2f8a46);
      for (let xx = 0; xx < w; xx += 10) R(xx, 0, 5, h, 0x339a4c);
      R(0, h * 0.5, w, 1, 0xffffff); E(w * 0.5, h * 0.5, h * 0.18, h * 0.18, 0xffffff); E(w * 0.5, h * 0.5, h * 0.16, h * 0.16, 0x2f8a46);
      E(w * 0.78, h * 0.3, h * 0.1, h * 0.1, 0xf2efe6); R(w * 0.78 - 1, h * 0.3 - 1, 2, 2, 0x1b1b1b);
      fitText(p, 'GAME NIGHT', x + 3, y + h * 0.05, w - 6, h * 0.3, 0xffffff, a, 0x0a3a1a);
      break;
    }
    case 'jeans': {
      R(0, 0, w, h, 0x2a4a8a);
      for (let yy = 0; yy < h; yy++) for (let xx = (yy * 3) % 4; xx < w; xx += 4) R(xx, yy, 1, 1, 0x34569a);
      R(0, h * 0.85, w, 1, 0xe8a040); R(w * 0.06, 0, 1, h, 0xe8a040);
      fitText(p, 'SUNSET', x + 3, y + h * 0.12, w - 6, h * 0.38, 0xff9a3a, a, 0x10204a);
      fitText(p, 'JEANS', x + 3, y + h * 0.52, w - 6, h * 0.3, 0xffffff, a);
      break;
    }
    case 'hello': {
      R(0, 0, w, h, 0xf8f8f4);
      fitText(p, 'HELLO', x + 3, y + 3, w * 0.62, h * 0.42, 0x1b1b1b, a);
      fitText(p, 'PIXEL CITY', x + 3, y + h * 0.52, w * 0.62, h * 0.32, 0x1b1b1b, a);
      fitText(p, '@', x + w * 0.62, y + 2, w * 0.36, h - 4, 0xd8202c, a, null, 8);
      break;
    }
    case 'wave': {
      const cols = [0xff3a5a, 0xff9a2a, 0xffe03a, 0x4ae06a, 0x2ab8ff, 0x8a5aff];
      for (let xx = 0; xx < w; xx++) for (let yy = 0; yy < h; yy++) {
        const k = Math.floor(((yy + Math.sin(xx * 0.09) * h * 0.18) / h) * cols.length + 6) % cols.length;
        R(xx, yy, 1, 1, cols[k]);
      }
      fitText(p, 'LIVE', x + 3, y + 3, w - 6, h - 6, 0xffffff, a, 0x1b1b1b);
      break;
    }
    case 'burger': {
      R(0, 0, w, h, 0xffcf2f);
      const cx = w * 0.72, cy = h * 0.58, r = Math.min(w * 0.18, h * 0.32);
      E(cx, cy - r * 0.45, r, r * 0.55, 0xd88a30); R(cx - r, cy - r * 0.1, r * 2, r * 0.25, 0x4a8a2a); R(cx - r, cy + r * 0.12, r * 2, r * 0.3, 0x6a2a1a); E(cx, cy + r * 0.55, r, r * 0.3, 0xd88a30);
      for (let k = 0; k < 6; k++) R(cx - r * 0.6 + k * r * 0.25, cy - r * 0.7, 1, 1, 0xf8f0d0);
      fitText(p, 'BIG BITE', x + 3, y + h * 0.15, w * 0.5, h * 0.4, 0xc8302c, a, 0x6a1a00);
      break;
    }
    default: { // cruise
      G(0x7ad0ff, 0x2a7ab8);
      R(0, h * 0.7, w, h * 0.3, 0x1a5a9a);
      for (let xx = 0; xx < w; xx += 6) R(xx, h * 0.72 + (xx % 12 ? 1 : 3), 3, 1, 0xd8f0ff);
      R(w * 0.5, h * 0.52, w * 0.36, h * 0.18, 0xf8f8f4); R(w * 0.58, h * 0.42, w * 0.2, h * 0.1, 0xf8f8f4); R(w * 0.66, h * 0.32, w * 0.04, h * 0.1, 0xd8202c);
      fitText(p, 'SAIL AWAY', x + 3, y + h * 0.06, w - 6, h * 0.34, 0xffffff, a, 0x10305a);
      break;
    }
  }
  if (big) { p.rect(x, y, w, 1, 0x2a2a30, a); p.rect(x, y + h - 1, w, 1, 0x2a2a30, a); }
}

// An animated screen texture: K frames stacked vertically, cycled by the static shader
function screenTex(C, w, h, rng, K = 4) {
  const kinds = [];
  while (kinds.length < K) { const k = rng.pick(AD_KINDS); if (!kinds.includes(k) || kinds.length >= AD_KINDS.length) kinds.push(k); }
  const r = C.atlas.alloc(w, h * K);
  for (let f = 0; f < K; f++) paintAd(r.p, 0, f * h, w, h, kinds[f], rng, 255);
  r.cast = 'none';
  return r;
}
// A static billboard (lit by floodlights at night)
function billboardTex(C, w, h, rng) {
  const r = C.atlas.alloc(w, h);
  if (rng.chance(0.35)) billboardArt(r.p, w, h, rng.pick(['cola', 'bagel', 'jazz', 'show', 'taxi', 'sun', 'gin']), rng);
  else paintAd(r.p, 0, 0, w, h, rng.pick(AD_KINDS), rng, winCode(0.0, true));
  r.cast = 'none';
  return r;
}
// Scrolling news ticker: amber pixel letters on black, repeating along the band
function tickerTex(C, len, rng) {
  const h = 18;
  const lines = ['PIXEL CITY 72F SUNNY', 'STOCKS UP', 'SUBWAY RUNNING ON TIME', 'NEW SHOW OPENS FRIDAY', 'HOT DOGS 2 FOR $5', 'PIGEONS SPOTTED IN THE PARK', 'TAXI FARES UNCHANGED', 'BAGEL OF THE YEAR'];
  const r = C.atlas.alloc(len, h);
  const p = r.p;
  p.rect(0, 0, len, h, 0x0a0a0c, 255);
  p.rect(0, 0, len, 1, 0x3a3a40, 255); p.rect(0, h - 1, len, 1, 0x3a3a40, 255);
  let x = 4;
  while (x < len - 20) {
    const s = rng.pick(lines);
    const tw = textWidth(s, 2, true);
    if (x + tw > len - 4) break;
    p.text7(x, 2, s, 0xffb020, 255, 2);
    x += tw + 10;
    p.rect(x, 8, 4, 4, 0xd8202c, 255);
    x += 14;
  }
  r.cast = 'none';
  return r;
}

const SCREEN = MAT.SCREEN | MAT.FLAT | MAT.NOSHADOW;

// Cover a facade (frame fr, from a0 to a1, z0 to z1) with stacked screens and billboards
function coverFace(C, fr, a0, a1, z0, z1, rng, o = {}) {
  const { mb } = C;
  const S = sharedTex(C);
  const W = a1 - a0;
  const back = S.darkMetal;
  let z = z0;
  let row = 0;
  while (z < z1 - 1.5) {
    const ph = Math.min(z1 - z, rng.pick(o.heights ?? [2.5, 3, 3.5, 4]));
    if (ph < 1.5) break;
    const split = W > 5 && rng.chance(o.split ?? 0.45);
    const cols = split ? 2 : 1;
    const gap = 0.25;
    const pw = (W - 0.3 - gap * (cols - 1)) / cols;
    for (let c = 0; c < cols; c++) {
      const pa0 = a0 + 0.15 + c * (pw + gap), pa1 = pa0 + pw;
      // steel frame standing proud of the wall
      fr.box(mb, pa0 - 0.06, pa1 + 0.06, -0.14, 0, z - 0.06, z + ph + 0.06, { front: back, left: back, right: back, top: { t: back } });
      const tw = Math.round(pw * T), th = Math.round(ph * T);
      const screen = rng.chance(o.screens ?? 0.6);
      if (screen) {
        const K = 4;
        const tex = screenTex(C, tw, th, rng, K);
        fr.facadeQuad(mb, pa0, pa0 + tw / T, -0.15, z, z + th / T, tex, { mat: SCREEN, seed: (K - 1) | (rng.int(0, 15) << 4) });
      } else {
        const tex = billboardTex(C, tw, th, rng);
        fr.facadeQuad(mb, pa0, pa0 + tw / T, -0.15, z, z + th / T, tex, { mat: MAT.FLAT | MAT.NOSHADOW });
        // floodlights on a little gantry
        for (let k = 0; k < 3; k++) {
          const la = pa0 + (k + 0.5) * pw / 3;
          fr.box(mb, la - 0.08, la + 0.08, -0.45, -0.15, z + ph + 0.06, z + ph + 0.16, { front: S.darkMetal, left: S.darkMetal, right: S.darkMetal, top: { t: S.darkMetal } });
        }
      }
    }
    // light thrown onto the square below
    const mid = fr.pt((a0 + a1) / 2, -3.0);
    if (row < 3) C.world.lamps.push({ x: mid[0], y: mid[1], z: 1.5, r: 5.5 + W * 0.15, color: [1, 1, 1], k: 0.55, kind: 'screen' });
    z += ph + 0.35;
    row++;
  }
}

// A tower clad in signs: shops at street level, a news ticker, then screens and billboards
function signTower(C, fr, a0, W, D, floors, rng, o = {}) {
  const { mb } = C;
  const S = sharedTex(C);
  const z0 = fr.z0;
  const gH = 2.6, fH = 1.5;
  const H = gH + floors * fH + 0.6;
  // office facade behind the signs: one floor per tile, windows on the office lighting schedule
  const style = o.style ?? rng.int(0, 2);
  const wall = C.atlas.shared(`tsq_wall${style}`, 64, 48, (p) => {
    const [base, glass, mull] = [[0x5a6270, 0x24384e, 0x8a929e], [0xc8bca4, 0x2e3e52, 0xe0d6c0], [0x8a4a3a, 0x2a3446, 0xb8a890]][style];
    smoothFill(p, 0, 0, 64, 48, base, 41 + style, 0.05);
    for (let b = 0; b < 4; b++) {
      const t = hash2i(b, style, 7);
      if (style === 0) { p.rect(b * 16 + 1, 4, 14, 40, glass, winCode(t)); p.rect(b * 16 + 1, 4, 14, 1, 0x6a8aa8); p.vline(b * 16 + 8, 4, 40, mull); }
      else { p.rect(b * 16 + 3, 10, 10, 26, glass, winCode(t)); p.rect(b * 16 + 2, 36, 12, 2, mull); p.rect(b * 16 + 3, 9, 10, 1, mull); }
    }
    p.rect(0, 0, 64, 2, mull); p.hline(0, 47, 64, shade(base, 0.8));
  });
  const aabb = mb.body(() => fr.box(mb, a0, a0 + W, 0, D, z0, z0 + H, { front: wall, back: wall, left: wall, right: wall, top: { t: S.roofTar, world: true } }, { mat: MAT.OFFICE }));
  markHeight(C.world, ...aabb, z0 + H);
  // street level: two bright shopfronts
  const tw = Math.round(W * T), gh = Math.round(gH * T);
  const base = C.atlas.alloc(tw, gh);
  base.p.rect(0, 0, tw, gh, 0x1b1b1b);
  const kinds = o.shops ?? ['electronics', 'toys', 'pizza', 'jewelry', 'shoes', 'coffee'];
  const n = W > 6 ? 2 : 1;
  for (let k = 0; k < n; k++) drawShopfront(base.p, Math.round(k * tw / n) + 1, 0, Math.round(tw / n) - 2, gh, rng.pick(kinds), rng, { signH: 18, frame: 0x1b1b1b });
  fr.facadeQuad(mb, a0, a0 + W, -0.03, z0, z0 + gH, base, { mat: 0 });
  for (let k = 0; k < n; k++) {
    const st = fr.pt(a0 + (k + 0.5) * W / n, -0.8), dp = fr.pt(a0 + (k + 0.5) * W / n, 0.3);
    C.world.shops.push({ kind: 'electronics', name: 'SHOP', x: st[0], y: st[1], dx: dp[0], dy: dp[1], n: fr.n });
  }
  // marquee canopy over the shops
  fr.box(mb, a0 + 0.1, a0 + W - 0.1, -0.9, 0, z0 + gH - 0.25, z0 + gH, { front: S.darkMetal, left: S.darkMetal, right: S.darkMetal, top: { t: S.darkMetal } });
  // ticker band wrapping the front
  const tk = tickerTex(C, Math.round(W * T), rng);
  fr.box(mb, a0 - 0.05, a0 + W + 0.05, -0.25, 0, z0 + gH + 0.15, z0 + gH + 0.15 + 18 / T, { left: S.darkMetal, right: S.darkMetal, top: { t: S.darkMetal } });
  fr.facadeQuad(mb, a0, a0 + tk.w / T, -0.26, z0 + gH + 0.15, z0 + gH + 0.15 + 18 / T, tk, { mat: SCREEN, seed: 8 });
  // the rest of the front is signs, wrapping round any outer corners
  coverFace(C, fr, a0, a0 + W, z0 + gH + 1.0, z0 + H - 0.5, rng, o);
  for (const side of o.sides ?? []) {
    const sf = side === 'left' ? new Frame(...fr.pt(a0, D), -fr.ux, -fr.uy) : new Frame(...fr.pt(a0 + W, 0), fr.ux, fr.uy);
    const top = z0 + gH + 1.0 + Math.min(H - gH - 2, rng.range(8, 14));
    coverFace(C, sf, 0, D, z0 + gH + 1.0, Math.min(z0 + H - 0.5, top), rng, { ...o, split: 0.2 });
  }
  // shop light on the sidewalk
  const lp = fr.pt(a0 + W / 2, -1.0);
  C.world.lamps.push({ x: lp[0], y: lp[1], z: 0.6, r: 3.0, color: [1.0, 0.92, 0.8], k: 0.6, kind: 'shop' });
  return { H: z0 + H };
}

// ---- billboard blocks either side of the square ------------------------------------------------
// sq: which side of this block faces the square ('E' or 'W')
export function billboardsBlock(C, L, sq, seed) {
  const rng = new RNG(seed);
  const F = {
    N: new Frame(L.x1, L.y0, 0, -1), S: new Frame(L.x0, L.y1, 0, 1),
    E: new Frame(L.x1, L.y1, 1, 0), W: new Frame(L.x0, L.y0, -1, 0),
  };
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'patio');
  const D = 8;
  // two sign towers on the square side; signs wrap round their outer ends
  signTower(C, F[sq], 0, 9, D, rng.int(14, 16), rng, { sides: ['left'] });
  signTower(C, F[sq], 9, 9, D, rng.int(11, 13), rng, { sides: ['right'] });
  // the street side toward the city: a shorter sign tower
  const sSide = F.S;
  if (sq === 'E') signTower(C, sSide, 0, 10, 7, rng.int(8, 10), rng, { heights: [2.5, 3], split: 0.6, sides: ['left'] });
  else signTower(C, sSide, 8, 10, 7, rng.int(8, 10), rng, { heights: [2.5, 3], split: 0.6, sides: ['right'] });
  // north side (the map edge): plainer
  const nSide = F.N;
  if (sq === 'E') signTower(C, nSide, 8, 10, 7, rng.int(7, 9), rng, { screens: 0.3, sides: ['right'] });
  else signTower(C, nSide, 0, 10, 7, rng.int(7, 9), rng, { screens: 0.3, sides: ['left'] });
}

// ---- the square -------------------------------------------------------------------------------------
export function timesSquareBlock(C, L, seed) {
  const rng = new RNG(seed);
  const { mb } = C;
  const W = C.world;
  const S = sharedTex(C), P = propTex(C);
  const cx = (L.x0 + L.x1) / 2;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'tsq');
  // tower at the north end, screens on every face, a ball on a mast
  const tx0 = cx - 2.3, tx1 = cx + 2.3, ty0 = L.y0 + 0.6, ty1 = L.y0 + 4.4;
  const faces = [
    new Frame(tx0, ty1, 0, 1), new Frame(tx1, ty1, 1, 0), new Frame(tx1, ty0, 0, -1), new Frame(tx0, ty0, -1, 0),
  ];
  const floors = 16;
  const res = signTower(C, faces[0], 0, tx1 - tx0, ty1 - ty0, floors, rng, { heights: [3, 3.5, 4], split: 0.2, screens: 0.8 });
  const top = res.H;
  coverFace(C, faces[1], 0, ty1 - ty0, CURB + 3.6, top - 0.6, rng, { heights: [3, 4, 5], split: 0, screens: 0.7 });
  coverFace(C, faces[3], 0, ty1 - ty0, CURB + 3.6, top - 0.6, rng, { heights: [3, 4, 5], split: 0, screens: 0.7 });
  coverFace(C, faces[2], 0, tx1 - tx0, CURB + 3.6, top - 0.6, rng, { heights: [3, 4], split: 0.3, screens: 0.5 });
  // crown + mast; the glowing ball is a sprite (statics) so it can drop on winter midnights
  mb.box(tx0 + 0.6, ty0 + 0.6, top, tx1 - 0.6, ty1 - 0.6, top + 1.2, { px: S.darkMetal, nx: S.darkMetal, py: S.darkMetal, ny: S.darkMetal, pz: { t: S.darkMetal } });
  mb.box(cx - 0.08, (ty0 + ty1) / 2 - 0.08, top + 1.2, cx + 0.08, (ty0 + ty1) / 2 + 0.08, top + 4.6, { px: P.silver, nx: P.silver, py: P.silver, ny: P.silver, pz: P.silver });
  W.ball = { x: cx, y: (ty0 + ty1) / 2, z0: top + 1.3, z1: top + 4.4 };
  W.beacons.push({ x: cx, y: (ty0 + ty1) / 2, z: top + 4.7 });

  // red steps facing the tower; people sit on them
  const sx0 = cx - 3.6, sx1 = cx + 3.6, sy0 = L.y1 - 7.0, steps = 7, sd = 0.5, rise = 0.32;
  const red = C.atlas.shared('red_step', 32, 10, (p) => {
    p.rect(0, 0, 32, 10, 0xc81e2a, winCode(0.0, true));
    p.rect(0, 0, 32, 2, 0xff6a6a, winCode(0.0, true));
    p.rect(0, 8, 32, 2, 0x8a1018, winCode(0.0, true));
  });
  const redTop = C.atlas.shared('red_step_t', 32, 16, (p) => { p.rect(0, 0, 32, 16, 0xb81a26, winCode(0.0, true)); for (let x = 0; x < 32; x += 8) p.vline(x, 0, 16, 0xd83040, winCode(0.0, true)); });
  for (let k = 0; k < steps; k++) {
    mb.box(sx0, sy0 + k * sd, CURB, sx1, sy0 + steps * sd, CURB + (k + 1) * rise, { py: S.darkMetal, ny: red, px: S.darkMetal, nx: S.darkMetal, pz: { t: redTop } }, { mat: MAT.NOSHADOW });
    // seats along this step, facing north
    for (let s = 0; s < 4; s++) {
      const bx = sx0 + 0.9 + s * ((sx1 - sx0 - 1.8) / 3), by = sy0 + k * sd + sd * 0.55, bz = CURB + (k + 1) * rise;
      const seats = [-0.45, 0, 0.45].map((t) => ({ x: bx + t, y: by, z: bz, face: [0, -1] }));
      W.benches.push({ x: bx, y: by, axis: 'x', seats, used: [false, false, false], steps: true });
    }
  }
  // a video screen on the back of the steps, facing the city
  {
    const fb2 = new Frame(sx0, sy0 + steps * sd, 0, 1);
    const sw = Math.round((sx1 - sx0 - 0.6) * T), sh = Math.round((steps * rise - 0.5) * T);
    fb2.facadeQuad(mb, 0.3, 0.3 + sw / T, -0.02, CURB + 0.25, CURB + 0.25 + sh / T, screenTex(C, sw, sh, rng, 4), { mat: SCREEN, seed: 3 | (rng.int(0, 15) << 4) });
  }
  // the glow of the steps at night
  W.lamps.push({ x: cx, y: sy0 - 0.5, z: 0.6, r: 4.5, color: [1.0, 0.25, 0.25], k: 0.5, kind: 'neon' });
  // ticket booth under the front of the steps
  mb.box(cx - 1.0, sy0 - 1.3, CURB, cx + 1.0, sy0 - 0.2, CURB + 1.6, { px: S.darkMetal, nx: S.darkMetal, py: S.darkMetal, ny: S.glassBlue, pz: { t: S.darkMetal } });
  const sign = C.atlas.alloc(64, 12);
  sign.p.rect(0, 0, 64, 12, 0x1b1b1b, 255);
  sign.p.text7(Math.floor((64 - textWidth('TICKETS', 1, true)) / 2), 2, 'TICKETS', 0xffd84f, winCode(0.0, true));
  // two-sided sign on the booth roof, readable from both ways
  const yb = sy0 - 0.75;
  mb.vquad(cx + 1.0, yb - 0.02, cx - 1.0, yb - 0.02, CURB + 1.6, CURB + 1.6 + 12 / T, sign, { mat: MAT.FLAT | MAT.NOSHADOW });
  mb.vquad(cx - 1.0, yb + 0.02, cx + 1.0, yb + 0.02, CURB + 1.6, CURB + 1.6 + 12 / T, sign, { mat: MAT.FLAT | MAT.NOSHADOW });
  // café tables with umbrellas in the middle of the square
  const tables = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const x = cx - 4.8 + i * 4.8 + (j ? 1.2 : -1.2), y = L.y0 + 7.0 + j * 2.6;
    tables.push([x, y]);
    mb.cylinder(x, y, CURB, CURB + 0.7, 0.06, 6, S.darkMetal, null);
    mb.cylinder(x, y, CURB + 0.7, CURB + 0.74, 0.4, 10, P.silver, P.silver);
    mb.cylinder(x, y, CURB + 0.74, CURB + 1.75, 0.03, 4, P.silver, null);
    for (const [dx, dy] of [[0.55, 0], [-0.55, 0], [0, 0.55]]) {
      mb.box(x + dx - 0.15, y + dy - 0.15, CURB, x + dx + 0.15, y + dy + 0.15, CURB + 0.42, { px: P.silver, nx: P.silver, py: P.silver, ny: P.silver, pz: P.wood });
    }
    C.addSprite('cartUmbrella', x, y, CURB + 1.75, { cart: ['hotdog', 'halal', 'pretzel'][(i + j) % 3] });
  }
  // planters along the edges, carts, floodlights at the corners
  for (const [x, y] of [[L.x0 + 0.8, L.y0 + 6], [L.x0 + 0.8, L.y1 - 4], [L.x1 - 0.8, L.y0 + 6], [L.x1 - 0.8, L.y1 - 4], [cx - 5.5, L.y1 - 1.0], [cx + 5.5, L.y1 - 1.0]]) C.addPlanter(x, y);
  subwayEntrance(C, L.x0 - 1.0, L.y1 - 4.5, 'y');
  W.carts.push({ x: L.x0 + 2.2, y: L.y0 + 12.0, kind: 'pretzel', axis: 'y' });
  W.carts.push({ x: L.x1 - 2.2, y: L.y0 + 12.5, kind: 'halal', axis: 'y' });
  for (const [x, y] of [[L.x0 + 0.5, L.y0 + 0.5], [L.x1 - 0.5, L.y0 + 0.5], [L.x0 + 0.5, L.y1 - 0.5], [L.x1 - 0.5, L.y1 - 0.5]]) {
    mb.box(x - 0.08, y - 0.08, CURB, x + 0.08, y + 0.08, CURB + 5.2, { px: P.silver, nx: P.silver, py: P.silver, ny: P.silver, pz: P.silver });
    mb.box(x - 0.3, y - 0.3, CURB + 5.2, x + 0.3, y + 0.3, CURB + 5.45, { px: P.lampHead, nx: P.lampHead, py: P.lampHead, ny: P.lampHead, pz: P.silver });
    W.lamps.push({ x: x + (cx - x) * 0.2, y: y + ((L.y0 + L.y1) / 2 - y) * 0.2, z: CURB + 5, r: 7, color: [0.95, 0.97, 1.0], k: 0.8, kind: 'flood' });
    W.lampHeads.push({ x, y, z: CURB + 5.2, kind: 'flood' });
  }
  // walking net across the square, joined to the sidewalks all round
  const nodes = [], edges = [], gates = [];
  const block = (x, y) => (x > tx0 - 0.6 && x < tx1 + 0.6 && y < ty1 + 0.6) || (x > sx0 - 0.4 && x < sx1 + 0.4 && y > sy0 - 1.5) || tables.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 0.9);
  const idx = new Map();
  const step = 2.6;
  for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 7; gx++) {
    const x = L.x0 + 1.2 + gx * step, y = L.y0 + 1.2 + gy * step;
    if (block(x, y)) continue;
    idx.set(`${gx},${gy}`, nodes.length);
    nodes.push({ x, y });
    if (gx === 0) gates.push({ node: nodes.length - 1, sx: L.x0 - 1, sy: y });
    if (gx === 6) gates.push({ node: nodes.length - 1, sx: L.x1 + 1, sy: y });
    if (gy === 0) gates.push({ node: nodes.length - 1, sx: x, sy: L.y0 - 1 });
    if (gy === 6) gates.push({ node: nodes.length - 1, sx: x, sy: L.y1 + 1 });
  }
  for (const [k, i] of idx) {
    const [gx, gy] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const j = idx.get(`${gx + dx},${gy + dy}`);
      if (j != null) edges.push([i, j]);
    }
  }
  W.extraNets.push({ name: 'tsq', rect: { ...L }, nodes, edges, gates });
  W.timesSquare = { x: cx, y: (L.y0 + L.y1) / 2, x0: L.x0, y0: L.y0, x1: L.x1, y1: L.y1 };
  void GRP; void shade; void PI; void chainFence;
}
