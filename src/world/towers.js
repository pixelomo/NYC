// High-rise generators: art deco tower, glass tower, modernist slab, limestone office, hotel, cast-iron lofts.

import { T } from './layout.js';
import { MAT, GRP } from './mesh.js';
import { winCode } from '../core/painter.js';
import { shade, mixc, hash2i } from '../core/math.js';
import { PAL, stoneFill, brickFill, smoothFill, drawWindow, drawDoor, corniceBand, signBoard, drawShopfront, drawGate, glassDay } from './facades.js';
import { sharedTex, markHeight, waterTower, fireEscape, roofClutter, Frame, hvac, bladeSign } from './buildings.js';

export function region(C, w, h, paint) {
  const r = C.atlas.alloc(w, h);
  paint(r.p, r);
  return r;
}

let seedCounter = 1;
// A tiled tower section: all four sides share a floor module texture
export function section(C, x0, y0, x1, y1, z0, z1, side, top, opt = {}) {
  const seed = opt.seed ?? (seedCounter++ % 250) + 1;
  const mat = opt.mat ?? MAT.OFFICE;
  const f = { t: side, mat, seed };
  const faces = { px: f, nx: f, py: f, ny: f };
  if (top) faces.pz = { t: top, world: true };
  if (opt.faces) Object.assign(faces, opt.faces);
  C.mb.body(() => C.mb.box(x0, y0, z0, x1, y1, z1, faces, { seed }));
  markHeight(C.world, x0, y0, x1, y1, z1);
}

// Unique band around a box (lobby, crown) painted per face by fn(p, w, h, faceIndex)
export function band(C, x0, y0, x1, y1, z0, z1, fn, top, opt = {}) {
  const h = Math.round((z1 - z0) * T);
  const wx = Math.round((x1 - x0) * T), wy = Math.round((y1 - y0) * T);
  const faces = {};
  const mk = (w, i) => ({ t: region(C, w, h, (p) => fn(p, w, h, i)), mat: opt.mat ?? MAT.OFFICE });
  faces.py = mk(wx, 0);
  faces.px = mk(wy, 1);
  faces.ny = mk(wx, 2);
  faces.nx = mk(wy, 3);
  if (top) faces.pz = { t: top, world: true };
  C.mb.body(() => C.mb.box(x0, y0, z0, x1, y1, z1, faces));
  markHeight(C.world, x0, y0, x1, y1, z1);
}

export function beacon(C, x, y, z) {
  C.world.beacons.push({ x, y, z });
}

// ---------------------------------------------------------------------------
export function decoTower(C, L) {
  const S = sharedTex(C);
  const { rng } = C;
  const z0 = C.z0;
  const stone = 0xe4d9c0, stoneD = 0xc9bea4, spandrel = 0x3b3a48;
  const module = C.atlas.shared('deco_mod', 32, 48, (p) => {
    stoneFill(p, 0, 0, 32, 48, [stone], 5, 0);
    // piers: lit edge on the left, shadowed return on the right
    p.rect(0, 0, 6, 48, shade(stone, 1.05));
    p.vline(0, 0, 48, shade(stone, 1.14));
    p.rect(26, 0, 6, 48, shade(stone, 0.96));
    p.vline(31, 0, 48, shade(stone, 0.86));
    p.vline(6, 0, 48, stoneD);
    p.vline(25, 0, 48, shade(stoneD, 1.06));
    drawWindow(p, 7, 3, 9, 32, { frame: 0x2b2b30, t: 0.5, panes: '1/1' }, rng);
    drawWindow(p, 16, 3, 9, 32, { frame: 0x2b2b30, t: 0.5, panes: '1/1' }, rng);
    // dark spandrel panel with chevron relief
    for (let y = 36; y < 48; y++) for (let x = 7; x < 25; x++) {
      const v = Math.abs(((x - 7) % 6) - 3) + (y - 36);
      p.set(x, y, v % 4 === 0 ? 0x6a6880 : (x + y) % 3 === 0 ? 0x45445a : spandrel);
    }
    p.hline(7, 36, 18, 0x2a2934);
    p.hline(7, 47, 18, 0x5a5970);
  });
  const roofT = S.roofGravel;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  const tiers = [
    { r: 8, z: 11 }, { r: 6.5, z: 18 }, { r: 5, z: 12 }, { r: 3.5, z: 6 },
  ];
  // lobby
  band(C, cx - 8, cy - 8, cx + 8, cy + 8, z0, z0 + 2, (p, w, h, i) => {
    stoneFill(p, 0, 0, w, h, [0xd9cdb0], 7, 16, { blocks: 32 });
    p.rect(0, 0, w, 6, 0x8a6a3a);
    p.hline(0, 2, w, 0xc8a24a); p.hline(0, 3, w, 0xe0bc5a);
    for (let x = 8; x < w - 24; x += 32) {
      // bronze entrance bays with sunburst transoms
      p.rect(x, 12, 20, h - 12, 0x6a4a22);
      p.rect(x + 2, 14, 16, h - 14, 0x40576d, winCode(0.05));
      p.vline(x + 10, 25, h - 25, 0x8a6a3a);
      p.hline(x + 2, 24, 16, 0x8a6a3a);
      for (let k = 0; k < 5; k++) p.line(x + 10, 24, x + 2 + k * 4, 14, 0xc8a24a);
      p.rect(x + 7, h - 22, 2, 6, 0xc8a24a); p.rect(x + 11, h - 22, 2, 6, 0xc8a24a);
    }
    if (i === 0 || i === 1) signBoard(p, Math.floor(w / 2) - 60, 1, 120, 10, 'THE PIXEL BLDG', { bg: 0x8a6a3a, fg: 0xf2d27a, t: 0.03, shadow: false });
  }, roofT);
  let z = z0 + 2;
  tiers.forEach((tr, i) => {
    section(C, cx - tr.r, cy - tr.r, cx + tr.r, cy + tr.r, z, z + tr.z, module, roofT, { seed: 40 + i });
    // setback parapet with decorative band
    const pr = tr.r;
    band(C, cx - pr, cy - pr, cx + pr, cy + pr, z + tr.z, z + tr.z + 0.5, (p, w, h) => {
      p.rect(0, 0, w, h, stone);
      p.hline(0, 0, w, shade(stone, 1.12));
      for (let x = 0; x < w; x++) {
        const k = x % 8, yy = 4 + (k < 4 ? k : 8 - k);
        p.set(x, yy, 0x8a7a5a); p.set(x, yy + 1, 0xa8987a);
      }
      p.hline(0, h - 3, w, shade(stone, 0.9));
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
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0xc8ccd4, 0.9 + ((x + y) % 8 === 0 ? 0.2 : 0) + hash2i(x, y, 2) * 0.05));
    for (let x = 0; x < w; x += 10) { p.vline(x, 0, h, 0xe8ecf2); p.vline(x + 1, 0, h, 0x9aa0aa); }
    // stepped sunburst arches with triangular windows (crown lights)
    const tw = 20;
    for (let x0 = 2; x0 + tw <= w; x0 += tw + 4) {
      for (let row = 0; row < 3; row++) {
        const by = h - 6 - row * Math.floor(h / 3.4);
        for (let k = 0; k < 8; k++) for (let xx = k; xx < tw - k; xx++) p.set(x0 + xx, by - k, 0xd8d2b8, 254);
        for (let k = 0; k < 9; k++) { p.set(x0 + k - 1, by - k, 0x7a808a); p.set(x0 + tw - k, by - k, 0x7a808a); }
        p.hline(x0 - 1, by + 1, tw + 2, 0x7a808a);
      }
    }
    p.hline(0, 0, w, 0xf0f2f6);
    p.hline(0, 1, w, 0xd8dce4);
  };
  band(C, cx - 2.5, cy - 2.5, cx + 2.5, cy + 2.5, z + 0.5, z + 3.5, crown, S.metal, { mat: MAT.GLASS });
  band(C, cx - 1.5, cy - 1.5, cx + 1.5, cy + 1.5, z + 3.5, z + 6, crown, S.metal, { mat: MAT.GLASS });
  const spire = C.atlas.shared('spire', 32, 64, (p) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) p.set(x, y, x % 8 === 0 ? 0xf0f2f6 : x % 8 === 1 ? 0xd4d8e0 : y % 16 === 0 ? 0x9aa0aa : 0xb4bac4);
    for (let y = 8; y < 64; y += 16) for (let x = 4; x < 32; x += 8) p.set(x, y, 0xffffff, 254);
  });
  C.mb.body(() => C.mb.pyramid(cx - 0.75, cy - 0.75, cx + 0.75, cy + 0.75, z + 6, z + 14, spire, { mat: MAT.GLASS }));
  beacon(C, cx, cy, z + 14.1);
  C.world.perches.push({ x: cx + 2, y: cy + 2, z: z + 0.5 });
  // uplights glow at night onto the crown base
  C.world.lamps.push({ x: cx, y: cy + 3, z: z, r: 3, color: [1, 0.9, 0.7], k: 0.15, kind: 'up' });
  C.world.officeDoors.push(...lobbyDoors(cx, cy, 8, 8));
  plaza(C, L, { x0: cx - 8, y0: cy - 8, x1: cx + 8, y1: cy + 8 });
}

export function lobbyDoors(cx, cy, rx, ry) {
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
  const module = C.atlas.shared('glass_mod', 24, 48, (p) => {
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 24; x++) {
        let c = shade(0x3e7ea3, 1.12 - (y / 48) * 0.28);
        const d = (x + y) % 22;
        if ((d === 6 || d === 7) && y < 28) c = mixc(c, 0xa8d8f0, 0.6);
        else if (d === 8 && y < 20) c = mixc(c, 0xa8d8f0, 0.3);
        p.set(x, y, c, winCode(0.5));
      }
    for (let x = 2; x < 24; x++) p.set(x, 2, 0xb8d0e0, winCode(0.5)); // ceiling light strip
    // spandrel
    for (let y = 38; y < 48; y++) for (let x = 0; x < 24; x++) p.set(x, y, y === 38 ? 0x9fb6c4 : y === 39 ? 0x6f8a9a : x % 6 === 0 ? 0x355a72 : 0x2c4f66);
    p.vline(0, 0, 48, 0xb8c8d2);
    p.vline(1, 0, 48, 0x8aa0ae);
    p.vline(12, 0, 38, 0x7a95a6);
  });
  const x0 = L.x0 + 4, x1 = L.x0 + 14, y0 = L.y0 + 2.5, y1 = L.y0 + 12.5;
  // double-height glass lobby
  band(C, x0, y0, x1, y1, z0, z0 + 2.5, (p, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0x5f8ea8, 1.1 - y / h * 0.2), winCode(0.03));
    for (let x = 0; x < w; x += 24) { p.vline(x, 0, h, 0xc8d4dc); p.vline(x + 1, 0, h, 0x9aaab4); }
    p.rect(0, 0, w, 6, 0xc8d4dc);
    p.hline(0, 6, w, 0x8a9aa4);
    p.rect(0, 36, w, 2, 0xc8d4dc);
    // lobby desks with lamps
    for (let x = 12; x < w - 24; x += 46) {
      p.rect(x, h - 16, 20, 8, 0xd8d0c0, winCode(0.03, true));
      p.hline(x, h - 16, 20, 0xf0e8d8, winCode(0.03, true));
      p.rect(x + 4, h - 22, 2, 6, 0x2a2a2e); p.rect(x + 2, h - 24, 6, 2, 0xffe8b0, winCode(0.03, true));
    }
    signBoard(p, Math.floor(w / 2) - 36, 10, 72, 14, 'ONE PARK', { bg: 0x1b2b38, fg: 0xd0eaff, t: 0.03 });
  }, S.concrete, { mat: MAT.GLASS | MAT.OFFICE });
  section(C, x0, y0, x1, y1, z0 + 2.5, z0 + 44.5, module, null, { mat: MAT.GLASS | MAT.OFFICE, seed: 61 });
  // mechanical crown with louvers
  const louv = C.atlas.shared('louver', 24, 24, (p) => {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) p.set(x, y, y % 4 === 0 ? 0x4a5f6c : y % 4 === 1 ? 0x6a8392 : 0x8ca3b2);
    p.vline(0, 0, 24, 0xb8c8d2); p.vline(1, 0, 24, 0x9ab0be);
  });
  section(C, x0 + 0.75, y0 + 0.75, x1 - 0.75, y1 - 0.75, z0 + 44.5, z0 + 47.5, louv, S.roofSilver, { mat: MAT.GLASS, seed: 62 });
  // angled crown fin
  C.mb.body(() => C.mb.solid(x0, y0, z0 + 44.5, x1, y0 + 0.25, z0 + 48.5, module, S.metal, { mat: MAT.GLASS }));
  C.mb.solid(x0 + 4, y0 + 4, z0 + 47.5, x0 + 4.25, y0 + 4.25, z0 + 54, S.metal, S.metal);
  beacon(C, x0 + 4.1, y0 + 4.1, z0 + 54.1);
  hvacAt(C, x0 + 2, y0 + 3, z0 + 47.5);
  C.world.officeDoors.push({ x: (x0 + x1) / 2, y: y1 + 0.9, dx: (x0 + x1) / 2, dy: y1 - 0.2, kind: 'office' });
  C.world.officeDoors.push({ x: x1 + 0.9, y: (y0 + y1) / 2, dx: x1 - 0.2, dy: (y0 + y1) / 2, kind: 'office' });
  // low glass pavilion
  band(C, L.x0 + 1, L.y0 + 14, L.x0 + 7, L.y1 - 1, z0, z0 + 2.25, (p, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0x5f8ea8, 1.1 - y / h * 0.2), winCode(0.04));
    for (let x = 0; x < w; x += 24) { p.vline(x, 0, h, 0xc8d4dc); p.vline(x + 1, 0, h, 0x9aaab4); }
    p.rect(0, 0, w, 4, 0xc8d4dc);
    p.text7(8, 9, 'CAFE', 0xffd84f, winCode(0.02, true), 2);
    // tables and chairs inside
    for (let x = 10; x < w - 16; x += 28) {
      p.rect(x, h - 18, 12, 2, 0xe8e0d0, winCode(0.04, true)); p.rect(x + 5, h - 16, 2, 10, 0x2a2a2e);
      p.rect(x - 4, h - 14, 3, 8, 0x5c3b2a); p.rect(x + 13, h - 14, 3, 8, 0x5c3b2a);
    }
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
  const module = C.atlas.shared('bronze_mod', 24, 48, (p) => {
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 24; x++) {
        let c = shade(0x4a3f38, 1.1 - (y / 48) * 0.25);
        const d = (x + y) % 26;
        if ((d === 10 || d === 11) && y < 30) c = mixc(c, 0x9a8a7a, 0.5);
        p.set(x, y, c, winCode(0.5));
      }
    for (let y = 40; y < 48; y++) for (let x = 0; x < 24; x++) p.set(x, y, y === 40 ? 0x5a4a3a : 0x3a2e26);
    // bronze I-beam mullions
    p.vline(0, 0, 48, 0x8a6a42); p.vline(1, 0, 48, 0xa8844e); p.vline(2, 0, 48, 0x6a5232);
    p.vline(12, 0, 40, 0x6a5232); p.vline(13, 0, 40, 0x8a6a42);
  });
  const x0 = L.x0 + 3, x1 = L.x0 + 15, y0 = L.y0 + 1.5, y1 = L.y0 + 10.5;
  band(C, x0, y0, x1, y1, z0, z0 + 2.25, (p, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0x7a6a5a, 1.05 - y / h * 0.15), winCode(0.03));
    for (let x = 0; x < w; x += 24) { p.vline(x, 0, h, 0x8a6a42); p.vline(x + 1, 0, h, 0xa8844e); }
    p.rect(0, 0, w, 4, 0x8a6a42);
    p.hline(0, 4, w, 0x5a4428);
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
  const module = C.atlas.shared('lime_mod', 32, 48, (p) => {
    stoneFill(p, 0, 0, 32, 48, PAL.limestone, 33, 16, { blocks: 32 });
    drawWindow(p, 4, 10, 10, 28, { frame: 0xf2efe6, sill: 0xc9bea4, lintel: 0xd8ccb0, t: 0.5, panes: '1/1', wall: PAL.limestone[0] }, rng);
    drawWindow(p, 18, 10, 10, 28, { frame: 0xf2efe6, sill: 0xc9bea4, lintel: 0xd8ccb0, t: 0.5, panes: '1/1', wall: PAL.limestone[0] }, rng);
  });
  const x0 = L.x0 + 1, x1 = L.x1 - 1, y0 = L.y0 + 1, y1 = L.y0 + 11;
  band(C, x0, y0, x1, y1, z0, z0 + 2.5, (p, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0xb8ab8c, (y % 8 === 7 ? 0.8 : 1) * (0.95 + hash2i(x, y, 9) * 0.08)));
    for (let x = 12; x < w - 28; x += 64) {
      p.rect(x, 20, 24, h - 20, 0x8a7a5a);
      p.rect(x + 2, 22, 20, h - 22, 0x40576d, winCode(0.05));
      p.vline(x + 12, 22, h - 22, 0x8a7a5a);
      p.hline(x + 2, 34, 20, 0x8a7a5a);
      // carved cartouche over each entrance
      p.rect(x + 6, 5, 12, 11, 0xf0e6cc);
      p.frame(x + 6, 5, 12, 11, 0xc9bea4);
      p.rect(x + 10, 8, 4, 5, 0xd8ccb0);
    }
  }, S.concrete, { mat: MAT.OFFICE });
  section(C, x0, y0, x1, y1, z0 + 2.5, z0 + 15.5, module, S.roofTar, { seed: 81 });
  section(C, x0 + 1.5, y0 + 1, x1 - 1.5, y1 - 1, z0 + 15.5, z0 + 24.5, module, S.roofTar, { seed: 82 });
  section(C, x0 + 4, y0 + 2, x1 - 4, y1 - 2, z0 + 24.5, z0 + 30.5, module, null, { seed: 83 });
  // copper pyramid roof
  const copper = C.atlas.shared('copper', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      let c = shade(x % 8 === 0 ? 0x4f9a86 : x % 8 === 1 ? 0x7cc8b0 : 0x6cb8a0, 0.92 + hash2i(x, y, 4) * 0.12);
      if (hash2i(x >> 1, y >> 2, 7) > 0.86) c = mixc(c, 0x8ad8c0, 0.4); // verdigris streaks
      p.set(x, y, c);
    }
  });
  C.mb.body(() => C.mb.pyramid(x0 + 4, y0 + 2, x1 - 4, y1 - 2, z0 + 30.5, z0 + 36, copper, { mat: MAT.SNOW }));
  C.mb.solid((x0 + x1) / 2 - 0.05, (y0 + y1) / 2 - 0.05, z0 + 35.5, (x0 + x1) / 2 + 0.05, (y0 + y1) / 2 + 0.05, z0 + 38, S.metal, S.metal);
  beacon(C, (x0 + x1) / 2, (y0 + y1) / 2, z0 + 38.1);
  waterTower(C, x0 + 3, y0 + 2.5, z0 + 15.5, 0.9);
  C.world.officeDoors.push({ x: (x0 + x1) / 2, y: y0 - 0.9, dx: (x0 + x1) / 2, dy: y0 + 0.2, kind: 'office' });
  // hotel slab (south part)
  hotel(C, { x0: L.x0 + 1, y0: L.y0 + 12, x1: L.x1 - 1, y1: L.y1 - 0.5 });
}

export function hotel(C, R, o = {}) {
  const S = sharedTex(C);
  const { rng } = C;
  const z0 = C.z0;
  const brickMod = C.atlas.shared('hotel_mod', 32, 48, (p) => {
    brickFill(p, 0, 0, 32, 48, PAL.brickTan, 44);
    drawWindow(p, 8, 10, 16, 28, { frame: 0x2b2b30, lintel: 0xf0e6cc, sill: 0xf0e6cc, t: 0.5, wall: PAL.brickTan[0] }, rng);
  });
  const fr = new Frame(R.x0, R.y1, 0, 1, z0); // facade faces south
  const W = R.x1 - R.x0, D = R.y1 - R.y0;
  const LH = Math.round(2.5 * T);
  const lobby = region(C, Math.round(W * T), LH, (p) => {
    stoneFill(p, 0, 0, p.w, LH, [0x8a2a2a], 5, 8);
    p.rect(0, 0, p.w, 6, 0xd8b04a);
    p.hline(0, 6, p.w, 0x9a7a2a);
    for (let x = 12; x < p.w - 20; x += 44) {
      p.rect(x, 26, 28, LH - 26, 0xd8b04a);
      p.rect(x + 2, 28, 24, LH - 28, 0x40576d, winCode(0.02));
      p.vline(x + 14, 28, LH - 28, 0xd8b04a);
      p.hline(x + 2, 38, 24, 0xd8b04a);
      p.rect(x + 11, LH - 26, 2, 8, 0xf0d070); p.rect(x + 15, LH - 26, 2, 8, 0xf0d070);
    }
    signBoard(p, 16, 9, p.w - 32, 14, 'THE PIXEL HOTEL', { bg: 0x1b1b1b, fg: 0xffd84f, t: 0.02 });
  });
  const shaft = { t: brickMod, mat: 0, seed: 91 };
  const H = 2.5 + (o.floors ?? 12) * 1.5;
  C.mb.body(() => {
    C.mb.box(R.x0, R.y0, z0, R.x1, R.y1, z0 + 2.5, { py: { t: lobby, mat: 0 }, px: { t: S.brickTan }, nx: { t: S.brickTan } });
    C.mb.box(R.x0, R.y0, z0 + 2.5, R.x1, R.y1, z0 + H, { py: shaft, px: shaft, nx: shaft, ny: shaft, pz: { t: S.roofTar, world: true } });
  });
  markHeight(C.world, R.x0, R.y0, R.x1, R.y1, z0 + H);
  // marquee canopy
  const can = region(C, Math.round((W - 4) * T), 10, (p) => {
    p.rect(0, 0, p.w, 10, 0x1b1b1b);
    p.hline(0, 0, p.w, 0xd8b04a); p.hline(0, 9, p.w, 0x9a7a2a);
    for (let x = 2; x < p.w; x += 5) { p.rect(x, 3, 2, 1, 0xfff0a0, winCode(0.01, true)); p.rect(x + 2, 6, 2, 1, 0xfff0a0, winCode(0.01, true)); }
  });
  fr.box(C.mb, 2, W - 2, -1.6, 0, z0 + 2.3, z0 + 2.62, { front: can, left: can, right: can, top: { t: S.darkMetal } });
  for (const a of [2.2, W - 2.2]) fr.box(C.mb, a - 0.05, a + 0.05, -1.55, -1.45, z0, z0 + 2.3, { front: S.metal, left: S.metal, right: S.metal });
  C.world.lamps.push({ x: R.x0 + W / 2, y: R.y1 + 1.2, z: 0.5, r: 3.2, color: [1, 0.85, 0.55], k: 0.75, kind: 'marquee' });
  // vertical neon HOTEL sign on the corner
  const word = 'HOTEL';
  const hh = word.length * 24 + 10;
  const tex = region(C, 32, hh, (p) => {
    p.rect(0, 0, 32, hh, 0x1b1b1b);
    p.frame(0, 0, 32, hh, 0xff4f6a, winCode(0.01, true));
    p.frame(2, 2, 28, hh - 4, 0x4a1a24);
    for (let i = 0; i < word.length; i++) p.text7(9, 7 + i * 24, word[i], 0xff4f6a, winCode(0.01, true), 3);
  });
  const sz = z0 + 6;
  const bx = R.x1 - 0.2;
  C.mb.vquad(bx, R.y1, bx, R.y1 + 1.0, sz, sz + hh / T, tex, { mat: MAT.NOSHADOW });
  C.mb.vquad(bx + 0.02, R.y1 + 1.0, bx + 0.02, R.y1, sz, sz + hh / T, tex, { mat: MAT.NOSHADOW });
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
    corniceBand(p, 0, 0, tw, 20, shade(paint, 0.85));
    const nb = Math.max(2, Math.round(tw / 40));
    const bw = tw / nb;
    for (let f = 0; f < nF; f++) {
      const fy = Math.round((band + f * fH) * T);
      p.rect(0, fy, tw, 4, shade(paint, 0.82));
      p.hline(0, fy, tw, shade(paint, 1.1));
      for (let b = 0; b < nb; b++) {
        const x = Math.round(bw * b);
        // fluted cast-iron column with capital and base
        p.rect(x, fy + 4, 6, 52, shade(paint, 1.06));
        p.vline(x + 2, fy + 8, 44, shade(paint, 0.86));
        p.vline(x + 4, fy + 8, 44, shade(paint, 0.86));
        p.vline(x + 5, fy + 4, 52, shade(paint, 0.92));
        p.rect(x - 1, fy + 4, 8, 3, shade(paint, 1.14));
        p.hline(x - 1, fy + 7, 8, shade(paint, 0.8));
        p.rect(x - 1, fy + 53, 8, 3, shade(paint, 0.9));
        const wx = x + 9, ww = Math.round(bw) - 12, wy = fy + 10;
        drawWindow(p, wx, wy, ww, 40, { frame: 0x2b2b30, t: rng.next(), panes: '2/2', wall: paint, curtain: rng.chance(0.15) ? rng.pick(PAL.curtains) : null }, rng);
        // segmental arch head
        for (let k = 0; k < 4; k++) { p.hline(wx, wy + k, 4 - k, paint); p.hline(wx + ww - (4 - k), wy + k, 4 - k, paint); }
        p.hline(wx + 3, wy - 2, ww - 6, shade(paint, 0.8));
      }
    }
    const gy = Math.round((band + nF * fH) * T);
    const kind = o.shop ?? rng.pick(['gallery', 'boutique', 'coffee', 'books', 'boutique', 'diner', 'pharmacy']);
    p.shopInfo = drawShopfront(p, 0, gy, tw, th - gy, kind, rng, { doorLeft: rng.chance(0.5), signH: 14 });
  });
  const side = S.brickRed;
  const aabb = mb.body(() => fr.box(mb, a0, a0 + W, 0, D, z0, z0 + H, { front, back: side, left: side, right: side, top: { t: S.roofTar, world: true } }));
  markHeight(C.world, ...aabb, z0 + H);
  const zTop = z0 + H;
  // cornice
  const corn = C.atlas.shared('loft_corn_' + paint, 64, 21, (p) => corniceBand(p, 0, 0, 64, 21, shade(paint, 0.9)));
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
export function plaza(C, L, tower, o = {}) {
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
    const red = C.atlas.shared('red_sculpt', 32, 32, (p) => smoothFill(p, 0, 0, 32, 32, 0xd8302c, 3, 0.04));
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
