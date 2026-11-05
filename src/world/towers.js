// High-rise generators: art deco tower, glass tower, modernist slab, limestone office, hotel, cast-iron lofts.

import { T } from './layout.js';
import { MAT, GRP } from './mesh.js';
import { winCode } from '../core/painter.js';
import { shade, mixc, hash2i } from '../core/math.js';
import { PAL, stoneFill, brickFill, smoothFill, drawWindow, drawDoor, corniceBand, signBoard, drawShopfront, drawGate, glassDay } from './facades.js';
import { sharedTex, markHeight, waterTower, fireEscape, roofClutter, Frame, hvac, bladeSign } from './buildings.js';

function region(C, w, h, paint) {
  const r = C.atlas.alloc(w, h);
  paint(r.p, r);
  return r;
}

let seedCounter = 1;
// A tiled tower section: all four sides share a floor module texture
function section(C, x0, y0, x1, y1, z0, z1, side, top, opt = {}) {
  const seed = opt.seed ?? (seedCounter++ % 250) + 1;
  const mat = opt.mat ?? MAT.OFFICE;
  const f = { t: side, mat, seed };
  const faces = { px: f, nx: f, py: f, ny: f };
  if (top) faces.pz = { t: top, world: true };
  if (opt.faces) Object.assign(faces, opt.faces);
  C.mb.box(x0, y0, z0, x1, y1, z1, faces, { seed });
  markHeight(C.world, x0, y0, x1, y1, z1);
}

// Unique band around a box (lobby, crown) painted per face by fn(p, w, h, faceIndex)
function band(C, x0, y0, x1, y1, z0, z1, fn, top, opt = {}) {
  const h = Math.round((z1 - z0) * T);
  const wx = Math.round((x1 - x0) * T), wy = Math.round((y1 - y0) * T);
  const faces = {};
  const mk = (w, i) => ({ t: region(C, w, h, (p) => fn(p, w, h, i)), mat: opt.mat ?? MAT.OFFICE });
  faces.py = mk(wx, 0);
  faces.px = mk(wy, 1);
  faces.ny = mk(wx, 2);
  faces.nx = mk(wy, 3);
  if (top) faces.pz = { t: top, world: true };
  C.mb.box(x0, y0, z0, x1, y1, z1, faces);
  markHeight(C.world, x0, y0, x1, y1, z1);
}

function beacon(C, x, y, z) {
  C.world.beacons.push({ x, y, z });
}

// ---------------------------------------------------------------------------
export function decoTower(C, L) {
  const S = sharedTex(C);
  const { rng } = C;
  const z0 = C.z0;
  const stone = 0xe4d9c0, stoneD = 0xc9bea4, spandrel = 0x3b3a48;
  const module = C.atlas.shared('deco_mod', 16, 24, (p) => {
    stoneFill(p, 0, 0, 16, 24, [stone], 5, 0);
    p.rect(0, 0, 3, 24, shade(stone, 1.05));
    p.rect(13, 0, 3, 24, shade(stone, 0.95));
    p.vline(3, 0, 24, stoneD);
    drawWindow(p, 4, 2, 4, 16, { frame: 0x2b2b30, t: 0.5, rail: false }, rng);
    drawWindow(p, 8, 2, 4, 16, { frame: 0x2b2b30, t: 0.5, rail: false }, rng);
    for (let x = 4; x < 12; x++) for (let y = 18; y < 24; y++) p.set(x, y, (x + y) % 3 === 0 ? 0x55546a : spandrel);
  });
  const roofT = S.roofGravel;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  const tiers = [
    { r: 8, z: 11 }, { r: 6.5, z: 18 }, { r: 5, z: 12 }, { r: 3.5, z: 6 },
  ];
  // lobby
  band(C, cx - 8, cy - 8, cx + 8, cy + 8, z0, z0 + 2, (p, w, h, i) => {
    stoneFill(p, 0, 0, w, h, [0xd9cdb0], 7, 8, { blocks: 16 });
    p.rect(0, 0, w, 3, 0x8a6a3a);
    p.hline(0, 1, w, 0xc8a24a);
    for (let x = 4; x < w - 12; x += 16) {
      p.rect(x, 6, 10, h - 6, 0x6a4a22);
      p.rect(x + 1, 7, 8, h - 7, 0x40576d, winCode(0.05));
      p.vline(x + 5, 7, h - 7, 0x8a6a3a);
    }
    if (i === 0 || i === 1) signBoard(p, Math.floor(w / 2) - 30, 1, 60, 5, 'THE PIXEL BLDG', { bg: 0x8a6a3a, fg: 0xf2d27a, t: 0.03 });
  }, roofT);
  let z = z0 + 2;
  tiers.forEach((tr, i) => {
    section(C, cx - tr.r, cy - tr.r, cx + tr.r, cy + tr.r, z, z + tr.z, module, roofT, { seed: 40 + i });
    // setback parapet with decorative band
    const pr = tr.r;
    band(C, cx - pr, cy - pr, cx + pr, cy + pr, z + tr.z, z + tr.z + 0.5, (p, w, h) => {
      p.rect(0, 0, w, h, stone);
      for (let x = 0; x < w; x += 4) { p.set(x, 2, 0x8a7a5a); p.set(x + 1, 3, 0x8a7a5a); p.set(x + 2, 2, 0x8a7a5a); }
      p.hline(0, h - 1, w, stoneD);
    }, S.concrete, { mat: 0 });
    // corner eagles/ornaments
    if (i < 3) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ex = cx + sx * (pr - 0.25), ey = cy + sy * (pr - 0.25);
      C.mb.solid(ex - 0.2, ey - 0.2, z + tr.z + 0.5, ex + 0.2, ey + 0.2, z + tr.z + 1.1, S.limestone, S.limestone);
    }
    z += tr.z;
  });
  // crown: stepped arches with triangular windows (crown lights)
  const crown = (p, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0xc8ccd4, 0.9 + ((x + y) % 4 === 0 ? 0.2 : 0) + hash2i(x, y, 2) * 0.05));
    // sunburst triangles
    const tw = 10;
    for (let x0 = 1; x0 + tw <= w; x0 += tw + 2) {
      for (let row = 0; row < 3; row++) {
        const by = h - 4 - row * Math.floor(h / 3.5);
        for (let k = 0; k < 4; k++) {
          for (let xx = k; xx < tw - k; xx++) p.set(x0 + xx, by - k, 0xd8d2b8, 254);
        }
      }
    }
    p.hline(0, 0, w, 0xf0f2f6);
  };
  band(C, cx - 2.5, cy - 2.5, cx + 2.5, cy + 2.5, z + 0.5, z + 3.5, crown, S.metal, { mat: MAT.GLASS });
  band(C, cx - 1.5, cy - 1.5, cx + 1.5, cy + 1.5, z + 3.5, z + 6, crown, S.metal, { mat: MAT.GLASS });
  const spire = C.atlas.shared('spire', 16, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x % 4 === 0) ? 0xf0f2f6 : 0xb4bac4);
  });
  C.mb.pyramid(cx - 0.75, cy - 0.75, cx + 0.75, cy + 0.75, z + 6, z + 14, spire, { mat: MAT.GLASS });
  beacon(C, cx, cy, z + 14.1);
  C.world.perches.push({ x: cx + 2, y: cy + 2, z: z + 0.5 });
  // uplights glow at night onto the crown base
  C.world.lamps.push({ x: cx, y: cy + 3, z: z, r: 3, color: [1, 0.9, 0.7], k: 0.15, kind: 'up' });
  C.world.officeDoors.push(...lobbyDoors(cx, cy, 8, 8));
  plaza(C, L, { x0: cx - 8, y0: cy - 8, x1: cx + 8, y1: cy + 8 });
}

function lobbyDoors(cx, cy, rx, ry) {
  return [
    { x: cx, y: cy + ry + 0.9, dx: cx, dy: cy + ry - 0.2, kind: 'office' },
    { x: cx + rx + 0.9, y: cy, dx: cx + rx - 0.2, dy: cy, kind: 'office' },
    { x: cx, y: cy - ry - 0.9, dx: cx, dy: cy - ry + 0.2, kind: 'office' },
    { x: cx - rx - 0.9, y: cy, dx: cx - rx + 0.2, dy: cy, kind: 'office' },
  ];
}

// ---------------------------------------------------------------------------
export function glassTower(C, L) {
  const S = sharedTex(C);
  const { rng } = C;
  const z0 = C.z0;
  const module = C.atlas.shared('glass_mod', 12, 24, (p) => {
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 12; x++) {
        let c = shade(0x3e7ea3, 1.12 - (y / 24) * 0.28);
        if ((x + y) % 11 === 3 && y < 14) c = mixc(c, 0xa8d8f0, 0.6);
        p.set(x, y, c, winCode(0.5));
      }
    for (let y = 19; y < 24; y++) for (let x = 0; x < 12; x++) p.set(x, y, y === 19 ? 0x9fb6c4 : 0x2c4f66);
    p.vline(0, 0, 24, 0xb8c8d2);
  });
  const x0 = L.x0 + 4, x1 = L.x0 + 14, y0 = L.y0 + 2.5, y1 = L.y0 + 12.5;
  // double-height glass lobby
  band(C, x0, y0, x1, y1, z0, z0 + 2.5, (p, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0x5f8ea8, 1.1 - y / h * 0.2), winCode(0.03));
    for (let x = 0; x < w; x += 12) p.vline(x, 0, h, 0xc8d4dc);
    p.rect(0, 0, w, 3, 0xc8d4dc);
    p.rect(0, 18, w, 1, 0xc8d4dc);
    // people silhouettes/lobby desk
    for (let x = 6; x < w - 6; x += 23) { p.rect(x, h - 8, 10, 4, 0xd8d0c0, winCode(0.03, true)); }
    signBoard(p, Math.floor(w / 2) - 18, 4, 36, 7, 'ONE PARK', { bg: 0x1b2b38, fg: 0xd0eaff, t: 0.03 });
  }, S.concrete, { mat: MAT.GLASS | MAT.OFFICE });
  section(C, x0, y0, x1, y1, z0 + 2.5, z0 + 44.5, module, null, { mat: MAT.GLASS | MAT.OFFICE, seed: 61 });
  // mechanical crown with louvers
  const louv = C.atlas.shared('louver', 12, 12, (p) => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) p.set(x, y, y % 3 === 0 ? 0x5a6f7c : 0x8ca3b2);
    p.vline(0, 0, 12, 0xb8c8d2);
  });
  section(C, x0 + 0.75, y0 + 0.75, x1 - 0.75, y1 - 0.75, z0 + 44.5, z0 + 47.5, louv, S.roofSilver, { mat: MAT.GLASS, seed: 62 });
  // angled crown fin
  C.mb.solid(x0, y0, z0 + 44.5, x1, y0 + 0.25, z0 + 48.5, module, S.metal, { mat: MAT.GLASS });
  C.mb.solid(x0 + 4, y0 + 4, z0 + 47.5, x0 + 4.25, y0 + 4.25, z0 + 54, S.metal, S.metal);
  beacon(C, x0 + 4.1, y0 + 4.1, z0 + 54.1);
  hvacAt(C, x0 + 2, y0 + 3, z0 + 47.5);
  C.world.officeDoors.push({ x: (x0 + x1) / 2, y: y1 + 0.9, dx: (x0 + x1) / 2, dy: y1 - 0.2, kind: 'office' });
  C.world.officeDoors.push({ x: x1 + 0.9, y: (y0 + y1) / 2, dx: x1 - 0.2, dy: (y0 + y1) / 2, kind: 'office' });
  // low glass pavilion
  band(C, L.x0 + 1, L.y0 + 14, L.x0 + 7, L.y1 - 1, z0, z0 + 2.25, (p, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0x5f8ea8, 1.1 - y / h * 0.2), winCode(0.04));
    for (let x = 0; x < w; x += 12) p.vline(x, 0, h, 0xc8d4dc);
    p.rect(0, 0, w, 2, 0xc8d4dc);
    p.text(4, 4, 'CAFE', 0xffd84f, winCode(0.02, true));
  }, S.roofSilver, { mat: MAT.GLASS });
  plaza(C, L, { x0, y0, x1, y1 }, { sculpture: true, subway: { x: L.x1 - 1.5, y: L.y1 - 4 } });
}

function hvacAt(C, x, y, z) {
  const fr = new Frame(x, y, 0, 1, z);
  hvac(C, fr, 0, 0, z);
}

// ---------------------------------------------------------------------------
export function modernTower(C, L) {
  const S = sharedTex(C);
  const z0 = C.z0;
  const module = C.atlas.shared('bronze_mod', 12, 24, (p) => {
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 12; x++) {
        let c = shade(0x4a3f38, 1.1 - (y / 24) * 0.25);
        if ((x + y) % 13 === 5 && y < 15) c = mixc(c, 0x9a8a7a, 0.5);
        p.set(x, y, c, winCode(0.5));
      }
    for (let y = 20; y < 24; y++) for (let x = 0; x < 12; x++) p.set(x, y, 0x3a2e26);
    p.vline(0, 0, 24, 0x8a6a42);
    p.vline(6, 0, 24, 0x6a5232);
  });
  const x0 = L.x0 + 3, x1 = L.x0 + 15, y0 = L.y0 + 1.5, y1 = L.y0 + 10.5;
  band(C, x0, y0, x1, y1, z0, z0 + 2.25, (p, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0x7a6a5a, 1.05 - y / h * 0.15), winCode(0.03));
    for (let x = 0; x < w; x += 12) p.vline(x, 0, h, 0x8a6a42);
    p.rect(0, 0, w, 2, 0x8a6a42);
  }, S.concrete, { mat: MAT.GLASS | MAT.OFFICE });
  section(C, x0, y0, x1, y1, z0 + 2.25, z0 + 38.25, module, S.roofGravel, { mat: MAT.GLASS | MAT.OFFICE, seed: 71 });
  section(C, x0 + 1.5, y0 + 1.5, x1 - 1.5, y1 - 1.5, z0 + 38.25, z0 + 40.25, module, S.roofTar, { mat: MAT.GLASS | MAT.OFFICE, seed: 72 });
  C.mb.solid(x1 - 2, y0 + 2, z0 + 40.25, x1 - 1.8, y0 + 2.2, z0 + 45, S.metal, S.metal);
  beacon(C, x1 - 1.9, y0 + 2.1, z0 + 45.1);
  C.world.officeDoors.push({ x: (x0 + x1) / 2, y: y1 + 0.9, dx: (x0 + x1) / 2, dy: y1 - 0.2, kind: 'office' });
  plaza(C, L, { x0, y0, x1, y1 }, { pools: true });
}

// ---------------------------------------------------------------------------
export function limestoneOffice(C, L) {
  const S = sharedTex(C);
  const { rng } = C;
  const z0 = C.z0;
  const module = C.atlas.shared('lime_mod', 16, 24, (p) => {
    stoneFill(p, 0, 0, 16, 24, PAL.limestone, 33, 8, { blocks: 16 });
    drawWindow(p, 2, 5, 5, 14, { frame: 0xf2efe6, sill: 0xc9bea4, t: 0.5 }, rng);
    drawWindow(p, 9, 5, 5, 14, { frame: 0xf2efe6, sill: 0xc9bea4, t: 0.5 }, rng);
  });
  const x0 = L.x0 + 1, x1 = L.x1 - 1, y0 = L.y0 + 1, y1 = L.y0 + 11;
  band(C, x0, y0, x1, y1, z0, z0 + 2.5, (p, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0xb8ab8c, (y % 4 === 3 ? 0.8 : 1) * (0.95 + hash2i(x, y, 9) * 0.08)));
    for (let x = 6; x < w - 14; x += 32) {
      p.rect(x, 10, 12, h - 10, 0x8a7a5a);
      p.rect(x + 1, 11, 10, h - 11, 0x40576d, winCode(0.05));
      p.rect(x + 3, 4, 6, 5, 0xf0e6cc);
    }
  }, S.concrete, { mat: MAT.OFFICE });
  section(C, x0, y0, x1, y1, z0 + 2.5, z0 + 15.5, module, S.roofTar, { seed: 81 });
  section(C, x0 + 1.5, y0 + 1, x1 - 1.5, y1 - 1, z0 + 15.5, z0 + 24.5, module, S.roofTar, { seed: 82 });
  section(C, x0 + 4, y0 + 2, x1 - 4, y1 - 2, z0 + 24.5, z0 + 30.5, module, null, { seed: 83 });
  // copper pyramid roof
  const copper = C.atlas.shared('copper', 16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade((x % 4 === 0) ? 0x4f9a86 : 0x6cb8a0, 0.92 + hash2i(x, y, 4) * 0.12));
  });
  C.mb.pyramid(x0 + 4, y0 + 2, x1 - 4, y1 - 2, z0 + 30.5, z0 + 36, copper, { mat: MAT.SNOW });
  C.mb.solid((x0 + x1) / 2 - 0.05, (y0 + y1) / 2 - 0.05, z0 + 35.5, (x0 + x1) / 2 + 0.05, (y0 + y1) / 2 + 0.05, z0 + 38, S.metal, S.metal);
  beacon(C, (x0 + x1) / 2, (y0 + y1) / 2, z0 + 38.1);
  waterTower(C, x0 + 3, y0 + 2.5, z0 + 15.5, 0.9);
  C.world.officeDoors.push({ x: (x0 + x1) / 2, y: y0 - 0.9, dx: (x0 + x1) / 2, dy: y0 + 0.2, kind: 'office' });
  // hotel slab (south part)
  hotel(C, { x0: L.x0 + 1, y0: L.y0 + 12, x1: L.x1 - 1, y1: L.y1 - 0.5 });
}

function hotel(C, R) {
  const S = sharedTex(C);
  const { rng } = C;
  const z0 = C.z0;
  const brickMod = C.atlas.shared('hotel_mod', 16, 24, (p) => {
    brickFill(p, 0, 0, 16, 24, PAL.brickTan, 44);
    drawWindow(p, 4, 5, 8, 14, { frame: 0x2b2b30, lintel: 0xf0e6cc, sill: 0xf0e6cc, t: 0.5 }, rng);
  });
  const fr = new Frame(R.x0, R.y1, 0, 1, z0); // facade faces south
  const W = R.x1 - R.x0, D = R.y1 - R.y0;
  const lobby = region(C, Math.round(W * T), 40, (p) => {
    stoneFill(p, 0, 0, p.w, 40, [0x8a2a2a], 5, 4);
    p.rect(0, 0, p.w, 3, 0xd8b04a);
    for (let x = 6; x < p.w - 10; x += 22) {
      p.rect(x, 12, 14, 28, 0xd8b04a);
      p.rect(x + 1, 13, 12, 27, 0x40576d, winCode(0.02));
      p.vline(x + 7, 13, 27, 0xd8b04a);
    }
    signBoard(p, 8, 4, p.w - 16, 7, 'THE PIXEL HOTEL', { bg: 0x1b1b1b, fg: 0xffd84f, t: 0.02 });
  });
  const shaft = { t: brickMod, mat: 0, seed: 91 };
  const H = 2.5 + 12 * 1.5;
  C.mb.box(R.x0, R.y0, z0, R.x1, R.y1, z0 + 2.5, { py: { t: lobby, mat: 0 }, px: { t: S.brickTan }, nx: { t: S.brickTan } });
  C.mb.box(R.x0, R.y0, z0 + 2.5, R.x1, R.y1, z0 + H, { py: shaft, px: shaft, nx: shaft, ny: shaft, pz: { t: S.roofTar, world: true } });
  markHeight(C.world, R.x0, R.y0, R.x1, R.y1, z0 + H);
  // marquee canopy
  const can = region(C, Math.round((W - 4) * T), 5, (p) => {
    p.rect(0, 0, p.w, 5, 0x1b1b1b);
    for (let x = 1; x < p.w; x += 3) p.set(x, 1, 0xfff0a0, winCode(0.01, true)), p.set(x, 3, 0xfff0a0, winCode(0.01, true));
  });
  fr.box(C.mb, 2, W - 2, -1.6, 0, z0 + 2.3, z0 + 2.62, { front: can, left: can, right: can, top: { t: S.darkMetal } });
  for (const a of [2.2, W - 2.2]) fr.box(C.mb, a - 0.05, a + 0.05, -1.55, -1.45, z0, z0 + 2.3, { front: S.metal, left: S.metal, right: S.metal });
  C.world.lamps.push({ x: R.x0 + W / 2, y: R.y1 + 1.2, z: 0.5, r: 3.2, color: [1, 0.85, 0.55], k: 0.75, kind: 'marquee' });
  // vertical neon HOTEL sign on the corner
  const word = 'HOTEL';
  const hh = word.length * 12 + 6;
  const tex = region(C, 16, hh, (p) => {
    p.rect(0, 0, 16, hh, 0x1b1b1b);
    p.frame(0, 0, 16, hh, 0xff4f6a, winCode(0.01, true));
    for (let i = 0; i < word.length; i++) p.text(2, 3 + i * 12, word[i], 0xff4f6a, winCode(0.01, true), 2);
  });
  const sz = z0 + 6;
  const bx = R.x1 - 0.2;
  C.mb.vquad(bx, R.y1, bx, R.y1 + 1.2, sz, sz + hh / T, tex, { mat: MAT.NOSHADOW });
  C.mb.vquad(bx + 0.02, R.y1 + 1.2, bx + 0.02, R.y1, sz, sz + hh / T, tex, { mat: MAT.NOSHADOW });
  C.world.lamps.push({ x: R.x1, y: R.y1 + 1.4, z: sz, r: 2.5, color: [1, 0.3, 0.45], k: 0.4, kind: 'neon' });
  // flags over the entrance
  for (const a of [4, 7, 10]) C.addFlag(fr, a, -0.1, z0 + 3.2, a === 7 ? 'us' : 'hotel');
  C.world.doors.push({ x: R.x0 + W / 2, y: R.y1 + 0.9, dx: R.x0 + W / 2, dy: R.y1 - 0.2, kind: 'hotel', n: [0, 1] });
  roofClutter(C, fr, { a0: 0.5, a1: W - 0.5, d0: 0.5, d1: D - 0.5, z: z0 + H }, { waterTower: true });
}

// ---------------------------------------------------------------------------
// Cast-iron loft building (SoHo style)
export function loft(C, fr, a0, W, D, o = {}) {
  const { mb, rng } = C;
  const S = sharedTex(C);
  const nF = o.floors ?? rng.int(5, 7);
  const gH = 2, fH = 1.75, band = 0.75;
  const H = gH + nF * fH + band;
  const z0 = fr.z0;
  const tw = Math.round(W * T), th = Math.round(H * T);
  const paint = rng.pick([0xe8e2d0, 0xd8d4c8, 0xb8bcc0, 0xe0d0b0, 0x9aa8a0, 0xc8b8a0]);
  const front = region(C, tw, th, (p) => {
    smoothFill(p, 0, 0, tw, th, paint, rng.int(1, 99), 0.03);
    corniceBand(p, 0, 0, tw, 10, shade(paint, 0.85));
    const nb = Math.max(2, Math.round(tw / 20));
    const bw = tw / nb;
    for (let f = 0; f < nF; f++) {
      const fy = Math.round((band + f * fH) * T);
      p.rect(0, fy, tw, 2, shade(paint, 0.82));
      for (let b = 0; b < nb; b++) {
        const x = Math.round(bw * b);
        // fluted column
        p.rect(x, fy, 3, 28, shade(paint, 1.06));
        p.vline(x + 1, fy, 28, shade(paint, 0.88));
        const wx = x + 4, ww = Math.round(bw) - 6;
        drawWindow(p, wx, fy + 4, ww, 20, { frame: 0x2b2b30, t: rng.next(), panes: true, arch: true, wall: paint, curtain: rng.chance(0.15) ? rng.pick(PAL.curtains) : null }, rng);
      }
    }
    const gy = Math.round((band + nF * fH) * T);
    const kind = o.shop ?? rng.pick(['gallery', 'boutique', 'coffee', 'books', 'boutique', 'diner', 'pharmacy']);
    p.shopInfo = drawShopfront(p, 0, gy, tw, th - gy, kind, rng, { doorLeft: rng.chance(0.5), signH: 7 });
  });
  const side = S.brickRed;
  const aabb = fr.box(mb, a0, a0 + W, 0, D, z0, z0 + H, { front, back: side, left: side, right: side, top: { t: S.roofTar, world: true } });
  markHeight(C.world, ...aabb, z0 + H);
  const zTop = z0 + H;
  // cornice
  const corn = C.atlas.shared('loft_corn_' + paint, 32, 10, (p) => corniceBand(p, 0, 0, 32, 10, shade(paint, 0.9)));
  fr.box(mb, a0 - 0.0625, a0 + W + 0.0625, -0.35, 0.02, zTop - 0.6, zTop + 0.06, { front: corn, left: corn, right: corn, top: { t: S.concrete } });
  if (rng.chance(0.6)) fireEscape(C, fr, a0 + W * 0.2, a0 + W * 0.8, 0, z0 + gH, fH, nF);
  const kind = front.p.shopInfo?.kind || 'gallery';
  const gate = region(C, tw, Math.round((gH - 0.45) * T), (p) => drawGate(p, tw, Math.round((gH - 0.45) * T), rng));
  fr.facadeQuad(mb, a0, a0 + W, -0.03, z0, z0 + gH - 0.45, gate, { group: GRP.NIGHT, mat: 0 });
  const sp = fr.pt(a0 + W / 2, -0.8);
  C.world.shops.push({ kind, name: front.p.shopInfo?.name || '', x: sp[0], y: sp[1], n: fr.n });
  C.world.lamps.push({ x: sp[0], y: sp[1], z: 0.5, r: 2.2, color: [1, 0.88, 0.65], k: 0.5, kind: 'shop', group: GRP.DAY });
  roofClutter(C, fr, { a0, a1: a0 + W, d0: 0, d1: D, z: zTop }, { waterTower: rng.chance(0.6) });
  const dp = fr.pt(a0 + W - 1, -0.7);
  C.world.doors.push({ x: dp[0], y: dp[1], dx: dp[0], dy: dp[1], kind: 'home', n: fr.n });
  return { H: zTop };
}

// ---------------------------------------------------------------------------
// Plaza dressing around a tower footprint
function plaza(C, L, tower, o = {}) {
  const { rng } = C;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  // benches + planters + trees on the plaza edge (south and east sides are the most visible)
  const spots = [];
  for (let x = L.x0 + 1.5; x < L.x1 - 1; x += 3.2) spots.push([x, L.y1 - 1.0]);
  for (let y = L.y0 + 1.5; y < L.y1 - 1; y += 3.2) spots.push([L.x1 - 1.0, y]);
  for (const [x, y] of spots) {
    if (x > tower.x0 - 0.8 && x < tower.x1 + 0.8 && y > tower.y0 - 0.8 && y < tower.y1 + 0.8) continue;
    if (o.subway && Math.hypot(x - o.subway.x, y - o.subway.y) < 3) continue;
    const r = rng.next();
    if (r < 0.45) C.addTree(x, y, 'plane', true);
    else if (r < 0.75) C.addBench(x, y, Math.abs(y - (L.y1 - 1.0)) < 0.01 ? 'y' : 'x');
    else C.addPlanter(x, y);
  }
  if (o.sculpture) {
    const sx = L.x0 + 3.5, sy = L.y1 - 3.5;
    const red = C.atlas.shared('red_sculpt', 16, 16, (p) => smoothFill(p, 0, 0, 16, 16, 0xd8302c, 3, 0.04));
    C.mb.solid(sx - 0.9, sy - 0.9, C.z0, sx + 0.9, sy + 0.9, C.z0 + 0.25, sharedTex(C).concrete, sharedTex(C).concrete);
    C.mb.solid(sx - 0.6, sy - 0.6, C.z0 + 0.25, sx + 0.6, sy + 0.6, C.z0 + 1.45, red, red);
    C.mb.solid(sx - 0.2, sy - 0.2, C.z0 + 1.45, sx + 0.2, sy + 0.2, C.z0 + 2.2, red, red);
  }
  if (o.pools) {
    for (const px of [L.x0 + 4, L.x0 + 11]) {
      const py = L.y1 - 3.5;
      C.fountainPool(px, py, 2.4, 1.8);
    }
  }
  if (o.subway) C.addSubway(o.subway.x, o.subway.y, 'y');
}
