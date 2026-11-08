// The edges of greater New York round the island, and the islands in its rivers:
// - New Jersey across the Hudson: the Palisades' cliffs with Fort Lee's towers on top in the north,
//   Hoboken's brick and Jersey City's glass towers further down, Liberty State Park at the bottom
// - the Bronx across the Harlem River: Riverdale's green hill over Spuyten Duyvil, blocks of brick
//   apartment houses and Yankee Stadium
// - Queens across the East River: Astoria Park under the Triborough, Long Island City's glass towers,
//   Gantry Plaza with its two gantries and the red Pepsi-Cola sign
// - Randall's Island (Icahn Stadium and ballfields), Roosevelt Island (a strip of apartment towers,
//   the lighthouse and Four Freedoms Park), Governors Island (Castle Williams and Fort Jay) and
//   Ellis Island (the red-brick immigration station with its four domed towers)
// Brooklyn's waterfront is in landmarks.js (brooklynShore), by the Brooklyn Bridge.

import { T, CURB, WATER_Z, MAPX, MAPY, PERIOD, roadStart, roadEnd, lotStart, lotEnd, BOROUGHS, ISLANDS, ELLIS, ROWS, NBY, BLOCK_TYPES, eastShoreX, OY, OR, STREET } from './layout.js';
import { dominoSign } from './sights.js';
import { offIslandBlock } from './blocks.js';
import { MAT } from './mesh.js';
import { winCode } from '../core/painter.js';
import { shade, mixc, hash2i, RNG, valueNoise } from '../core/math.js';
import { PAL, stoneFill, signBoard } from './facades.js';
import { sharedTex, markHeight, waterTower } from './buildings.js';
import { section } from './towers.js';
import { propTex, parkLamp, beam, streetLamp, hydrant } from './props.js';
import { landmark, flagPole, wall } from './landmarks.js';
import { module } from './manhattan.js';
import { clsAt, CL } from './ground.js';

const PI = Math.PI;
const sides = (t, top) => (top ? { px: t, nx: t, py: t, ny: t, pz: top } : { px: t, nx: t, py: t, ny: t });
const region = (name) => BOROUGHS.find((b) => b.name === name) || ISLANDS.find((b) => b.name === name);

// ---- shared looks ----------------------------------------------------------------------------------
function looks(C) {
  if (C._greater) return C._greater;
  const A = C.atlas;
  const L = {
    brickRed: module(C, 'g_brick_red', { brick: PAL.brickRed, frame: 0xf2efe6, lintel: 0xd8ccb0, sill: 0xd8ccb0 }),
    brickBrown: module(C, 'g_brick_brown', { brick: PAL.brickBrown, frame: 0x2b2b30, lintel: 0xc8bca0, sill: 0xc8bca0 }),
    brickTan: module(C, 'g_brick_tan', { brick: PAL.brickTan, frame: 0x2b2b30, lintel: 0xe6dabe, sill: 0xe6dabe }),
    lime: module(C, 'g_lime', { wall: 0xdccfb2, frame: 0x2b2b30, lintel: 0xe6dabe, sill: 0xe6dabe }),
    glass: A.shared('g_glass', 32, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
        let c = shade(0x4a7a98, 1.12 - (y / 48) * 0.3);
        if ((x + y) % 22 < 2 && y < 30) c = mixc(c, 0xc8e4f0, 0.55);
        p.set(x, y, c, winCode(0.5));
      }
      for (let x = 0; x < 32; x++) { p.set(x, 44, 0x8aa0aa); p.set(x, 45, 0x6a8090); }
      p.vline(0, 0, 48, 0xc8d4dc); p.vline(16, 0, 44, 0x7a95a6);
    }),
    glassDark: A.shared('g_glass_d', 32, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
        let c = shade(0x2e3e4e, 1.1 - (y / 48) * 0.25);
        if ((x + y) % 26 < 2 && y < 28) c = mixc(c, 0x9ab8cc, 0.5);
        p.set(x, y, c, winCode(0.5));
      }
      for (let x = 0; x < 32; x++) p.set(x, 46, 0x5a6a78);
      p.vline(0, 0, 48, 0x8a9aa8);
    }),
    road: A.shared('boro_road', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x4a4d57, 0.92 + hash2i(x, y, 401) * 0.12)); }),
    grass: A.shared('boro_grass', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(hash2i(x >> 2, y >> 2, 402) > 0.5 ? 0x5aa648 : 0x4e9a3e, 0.92 + hash2i(x, y, 403) * 0.14)); }),
    // the Palisades' columns of grey-brown basalt, a fringe of green along the top, scree below
    rock: A.shared('palisade', 64, 96, (p) => {
      for (let y = 0; y < 96; y++) for (let x = 0; x < 64; x++) {
        const col = Math.floor((x + Math.floor(y / 24) * 3) / 6), f = hash2i(col, Math.floor((y + col * 7) / 14), 404);
        let c = mixc(0x8e8474, 0xb0a490, f);
        const lx = (x + Math.floor(y / 24) * 3) % 6;
        if (lx === 0) c = shade(c, 0.62); else if (lx === 1) c = shade(c, 1.12);
        if (hash2i(x >> 1, y >> 2, 406) > 0.93) c = mixc(c, 0x5a7a3a, 0.6);
        if (y < 8) c = mixc(c, 0x4e8a3a, 0.75 - y * 0.08);
        if (y > 84) c = mixc(c, 0x7a7266, 0.5);
        p.set(x, y, shade(c, 0.94 + hash2i(x, y, 405) * 0.1));
      }
    }),
    roofs: [sharedTex(C).roofTar, sharedTex(C).roofGravel, sharedTex(C).roofSilver],
  };
  C._greater = L;
  return L;
}

// a box of a building with a tiled facade and a roof
function bldg(C, x0, y0, x1, y1, h, face, roof, o = {}) {
  if (x1 - x0 < 1.5 || y1 - y0 < 1.5) return;
  const z0 = o.z0 ?? CURB;
  section(C, x0, y0, x1, y1, z0, z0 + h, face, roof, { seed: o.seed ?? (Math.round(x0 * 7 + y0 * 13) % 250) + 1, mat: o.glass ? MAT.GLASS | MAT.OFFICE : MAT.OFFICE });
  if (o.tank && h < 16) waterTower(C, x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.4, z0 + h, 0.8);
}
// a flat patch of ground on land that has no painted ground (New Jersey, the Bronx)
const patch = (C, x0, y0, x1, y1, t, z = CURB + 0.012) => C.mb.hquad(x0, y0, x1, y1, z, t, { u0: x0 * T, v0: y0 * T });
function addTreeAt(C, x, y, z, sp, scale = 1) {
  C.world.trees.push({ x, y, z, species: sp, variant: C.rng.int(0, 2), scale });
}

// a road's paint: the double yellow line down the middle, a zebra crossing at every street it meets
function markings(C, axis, c0, c1, a, b) {
  const yel = C.atlas.shared('boro_yel', 8, 8, (p) => p.rect(0, 0, 8, 8, 0xe8c040));
  const wht = C.atlas.shared('boro_wht', 8, 8, (p) => p.rect(0, 0, 8, 8, 0xe8e8e2));
  const cm = (c0 + c1) / 2, z = CURB + 0.02;
  const H = (x0, y0, x1, y1, t) => (axis === 'y' ? C.mb.hquad(x0, y0, x1, y1, z, t) : C.mb.hquad(y0, x0, y1, x1, z, t));
  // (between the crossings)
  for (let k = Math.ceil(a / PERIOD); k * PERIOD <= b; k++) {
    const s0 = Math.max(a, k * PERIOD - PERIOD + STREET + 2.2), s1 = Math.min(b, k * PERIOD - 2.2);
    if (s1 - s0 > 1) { H(cm - 0.16, s0, cm - 0.06, s1, yel); H(cm + 0.06, s0, cm + 0.16, s1, yel); }
    // the crossing just before the next street
    const zc = k * PERIOD - 1.9;
    if (zc > a + 0.5 && zc + 1.4 < b) for (let q = c0 + 0.3; q < c1 - 0.3; q += 0.6) H(q, zc, q + 0.32, zc + 1.4, wht);
    const zd = k * PERIOD + STREET + 0.5;
    if (zd > a + 0.5 && zd + 1.4 < b) for (let q = c0 + 0.3; q < c1 - 0.3; q += 0.6) H(q, zd, q + 0.32, zd + 1.4, wht);
  }
}

// street trees and lamps along the sidewalks round each lot, a hydrant here and there
function furnish(C, lots) {
  const rng = C.rng;
  const land = (x, y) => { const c = clsAt(x, y); return c === CL.BORO || c === CL.RAISED; };
  for (const L of lots) {
    const z = L.z0 ?? CURB;
    // south and east sides (the north and west ones are the neighbours' south and east)
    for (let x = L.x0 + 2; x < L.x1 - 1; x += rng.range(3.8, 5.2)) {
      const y = L.y1 + 1.0;
      if (land(x, y) && rng.chance(0.75)) addTreeAt(C, x, y, z, rng.pick(['plane', 'locust', 'locust', 'oak', 'cherry']), rng.range(0.75, 1.0));
    }
    for (let y = L.y0 + 2; y < L.y1 - 1; y += rng.range(3.8, 5.2)) {
      const x = L.x1 + 1.0;
      if (land(x, y) && rng.chance(0.6)) addTreeAt(C, x, y, z, rng.pick(['plane', 'locust', 'oak']), rng.range(0.75, 1.0));
    }
    if (land(L.x1 + 1.2, L.y1 + 1.2) && rng.chance(0.7)) streetLamp(C, L.x1 + 1.2, L.y1 + 1.2, 1, 0);
    if (rng.chance(0.3) && land(L.x0 + 4, L.y1 + 1.4)) hydrant(C, L.x0 + 4, L.y1 + 1.4);
  }
}

// the borough's own streets and lots, on the same grid as Manhattan's: roads drawn over the paving
// where the land runs along a street line, and the lots between them (keeping back from the water)
function boroGrid(C, R, keep) {
  const L = looks(C);
  const land = (x, y) => { const c = clsAt(x, y); return c === CL.BORO || c === CL.RAISED; };
  const iMin = Math.floor(R.x0 / PERIOD), iMax = Math.ceil(R.x1 / PERIOD), jMin = Math.floor(R.y0 / PERIOD), jMax = Math.ceil(R.y1 / PERIOD);
  if (R.streets !== false) {
    for (let i = iMin; i <= iMax; i++) {
      const xa = roadStart(i), xb = roadEnd(i), xc = (xa + xb) / 2;
      let y = Math.max(0, R.y0);
      while (y < Math.min(MAPY, R.y1)) {
        if (!land(xc, y + 0.5) || !land(xa - 2, y + 0.5) || !land(xb + 2, y + 0.5) || keep(xc, y + 0.5)) { y++; continue; }
        const a = y;
        while (y < Math.min(MAPY, R.y1) && land(xc, y + 0.5) && land(xa - 2, y + 0.5) && land(xb + 2, y + 0.5) && !keep(xc, y + 0.5)) y++;
        if (y - a > 4) { patch(C, xa, a, xb, y, L.road); markings(C, 'y', xa, xb, a, y); }
      }
    }
    for (let j = jMin; j <= jMax; j++) {
      const ya = roadStart(j), yb = roadEnd(j), yc = (ya + yb) / 2;
      let x = Math.max(0, R.x0);
      while (x < Math.min(MAPX, R.x1)) {
        if (!land(x + 0.5, yc) || !land(x + 0.5, ya - 2) || !land(x + 0.5, yb + 2) || keep(x + 0.5, yc)) { x++; continue; }
        const a = x;
        while (x < Math.min(MAPX, R.x1) && land(x + 0.5, yc) && land(x + 0.5, ya - 2) && land(x + 0.5, yb + 2) && !keep(x + 0.5, yc)) x++;
        if (x - a > 4) { patch(C, a, ya, x, yb, L.road, CURB + 0.014); markings(C, 'x', ya, yb, a, x); }
      }
    }
  }
  // lots: the part of each block that is land, two units back from the water, not kept clear
  const lots = [];
  const ok = (x, y) => land(x, y) && land(x - 2.5, y) && land(x + 2.5, y) && land(x, y - 2.5) && land(x, y + 2.5) && !keep(x, y);
  for (let i = iMin - 1; i <= iMax; i++)
    for (let j = jMin - 1; j <= jMax; j++) {
      const x0 = Math.max(R.x0, lotStart(i) - (R.streets === false ? 4.5 : 0)), x1 = Math.min(R.x1, lotEnd(i) + (R.streets === false ? 4.5 : 0));
      const y0 = Math.max(R.y0, lotStart(j) - (R.streets === false ? 4.5 : 0)), y1 = Math.min(R.y1, lotEnd(j) + (R.streets === false ? 4.5 : 0));
      if (x1 - x0 < 3 || y1 - y0 < 3) continue;
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) if (ok(x + 0.5, y + 0.5)) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x + 1); by1 = Math.max(by1, y + 1); }
      if (bx1 - bx0 >= 4 && by1 - by0 >= 4) lots.push({ x0: bx0 + 0.4, y0: by0 + 0.4, x1: bx1 - 0.4, y1: by1 - 0.4, i, j });
    }
  return lots;
}
// fill a lot with a few buildings side by side along its longer side
function fillLot(C, lot, pick) {
  const rng = C.rng, long = lot.x1 - lot.x0 > lot.y1 - lot.y0;
  const len = long ? lot.x1 - lot.x0 : lot.y1 - lot.y0;
  let a = 0;
  while (a < len - 2) {
    const w = Math.min(len - a, rng.range(4.5, 8.5));
    const b = pick(lot, a, w);
    if (b) {
      const [x0, y0, x1, y1] = long ? [lot.x0 + a, lot.y0, lot.x0 + a + w - 0.4, lot.y1] : [lot.x0, lot.y0 + a, lot.x1, lot.y0 + a + w - 0.4];
      bldg(C, x0, y0, x1, y1, b.h, b.face, b.roof, b);
    }
    a += w;
  }
}

// whole blocks of the borough's own: the lot of block (bx, by) if all of it (and a margin) is land
// and not kept clear
function wholeLots(C, R, keep) {
  const land = (x, y) => { const c = clsAt(x, y); return c === CL.BORO || c === CL.RAISED; };
  const out = [];
  for (let by = 0; by < NBY; by++)
    for (let bx = 0; bx < 16; bx++) {
      const L = { x0: lotStart(bx), y0: lotStart(by), x1: lotEnd(bx), y1: lotEnd(by) };
      if (L.x0 < R.x0 || L.x1 > R.x1 || L.y0 < R.y0 || L.y1 > R.y1) continue;
      let ok = true;
      for (let y = L.y0 - 2.5; y <= L.y1 + 2.5 && ok; y += 1.5) for (let x = L.x0 - 2.5; x <= L.x1 + 2.5; x += 1.5) if (!land(x, y) || keep(x, y)) { ok = false; break; }
      if (ok) out.push({ ...L, bx, by });
    }
  return out;
}

// ---- New Jersey ----------------------------------------------------------------------------------------
function newJersey(C) {
  const R = region('nj'), L = looks(C), mb = C.mb, rng = C.rng, W = C.world;
  const cliffEnd = lotStart(ROWS.palisadesEnd), zp = 9.0, xe = R.x1;
  const gwbY = (W.bridges || []).find((b) => b.name === 'GEORGE WASHINGTON BRIDGE')?.y ?? -100;
  // the Palisades: a wall of rock along the river, the wooded plateau on top
  mb.box(R.x0, R.y0, CURB, xe, cliffEnd, zp, { px: L.rock, py: L.rock, pz: { t: L.grass, world: true } });
  W.solids.push([R.x0, R.y0, xe, cliffEnd, zp]);
  markHeight(W, R.x0, R.y0, xe, cliffEnd, zp);
  for (let y = 3; y < cliffEnd - 2; y += 2.2) {
    if (Math.abs(y - gwbY) < 6) continue; // the bridge comes in here
    addTreeAt(C, xe - 1.4 - rng.range(0, 1.2), y + rng.range(-0.5, 0.5), zp, rng.pick(['oak', 'elm', 'locust', 'pine']), rng.range(0.9, 1.2));
    if (rng.chance(0.55)) addTreeAt(C, rng.range(1.5, xe - 4), y, zp, rng.pick(['oak', 'elm', 'pine']), rng.range(0.9, 1.2));
  }
  // Fort Lee's apartment towers on top of the cliffs either side of the bridge, Edgewater's down the row
  for (const by of [2, 3, 5, 6, 8, 10, 12, 14, 17, 19, 21]) {
    if (lotEnd(by) > cliffEnd) continue;
    const Lt = { x0: 2, y0: lotStart(by), x1: 20, y1: lotEnd(by) };
    if (Math.abs((Lt.y0 + Lt.y1) / 2 - gwbY) < 14) continue;
    offIslandBlock(C, Lt, by < 9 ? 'modern' : 'glass', 1, by + 7, zp);
  }
  // below the cliffs: Hoboken's brownstones and walk-ups, Jersey City's glass towers
  for (let by = ROWS.palisadesEnd; by < ROWS.harbor; by++) {
    const Lb = { x0: 2, y0: lotStart(by), x1: 20, y1: lotEnd(by) };
    if (by < ROWS.hobokenEnd) offIslandBlock(C, Lb, rng.pick(['brownstones', 'walkups', 'brownstones', 'shops', 'redbrick']), 0, by);
    else offIslandBlock(C, Lb, rng.pick(['glass', 'glass', 'modern', 'glass']), 0, OR(27));
  }
  // Liberty State Park: lawns and trees at the bottom, the old rail terminal's clock tower
  const lp = lotStart(ROWS.harbor);
  patch(C, R.x0, lp, xe, R.y1, L.grass);
  for (let y = lp + 3; y < R.y1 - 2; y += 3) for (let x = 2; x < xe - 2; x += 4.5) if (rng.chance(0.55)) addTreeAt(C, x + rng.range(-1, 1), y, CURB, rng.pick(['oak', 'plane', 'locust']));
  bldg(C, 4, lp + 4, 16, lp + 12, 4.5, L.brickRed, sharedTex(C).roofGreen);
  bldg(C, 13, lp + 5, 16, lp + 8, 9, L.brickRed, sharedTex(C).roofGreen);
  landmark(C, 'NEW JERSEY', 12, lotStart(26), 0);
}

// ---- the Bronx -----------------------------------------------------------------------------------------
function bronx(C) {
  const R = region('bronx'), L = looks(C), rng = C.rng;
  // Yankee Stadium, across the Harlem River from Washington Heights (161st Street)
  const ys = { x0: 272, y0: OY(136) + 40, x1: 310, y1: OY(136) + 78 };
  const keep = (x, y) => x > ys.x0 - 3 && x < ys.x1 + 3 && y > ys.y0 - 3 && y < ys.y1 + 3;
  // Riverdale: a green hill over Spuyten Duyvil, its rocky ridge carrying the Henry Hudson Bridge's
  // road on north
  patch(C, R.x0, R.y0, R.x1, 30, L.grass, CURB + 0.016);
  const hh = (C.world.bridges || []).find((b) => b.name === 'HENRY HUDSON BRIDGE');
  const ridge = hh ? { x0: Math.max(R.x0 + 0.5, hh.x - 10), x1: hh.x + 10, y0: 0, y1: hh.ridge, z: hh.z - 0.5 } : null;
  if (ridge) {
    C.mb.box(ridge.x0, ridge.y0, CURB, ridge.x1, ridge.y1, ridge.z, { px: L.rock, nx: L.rock, py: L.rock, pz: { t: L.grass, world: true } });
    markHeight(C.world, ridge.x0, ridge.y0, ridge.x1, ridge.y1, ridge.z);
    for (let x = ridge.x0 + 1.2; x < ridge.x1 - 1; x += 2.4) for (let y = 1.5; y < ridge.y1 - 1; y += 2.8) if (Math.abs(x - hh.x) > hh.hw + 1.2 && rng.chance(0.75)) addTreeAt(C, x + rng.range(-0.5, 0.5), y, ridge.z, rng.pick(['oak', 'pine', 'elm']));
  }
  const onRidge = (x, y) => ridge && x > ridge.x0 - 1 && x < ridge.x1 + 1 && y < ridge.y1 + 1;
  for (let x = R.x0 + 2; x < R.x1 - 2; x += 2.6) for (let y = 2; y < 26; y += 3.2) if (clsAt(x, y) === CL.BORO && !onRidge(x, y) && rng.chance(0.7)) addTreeAt(C, x + rng.range(-0.6, 0.6), y, CURB, rng.pick(['oak', 'elm', 'pine', 'locust']));
  // the Grand Concourse's apartment houses and the walk-up streets: whole blocks, as in Manhattan
  const lots = wholeLots(C, { ...R, y0: 34 }, keep);
  // the Grand Concourse's art deco apartment houses, walk-ups and tenements, shopping streets
  for (const lot of lots) offIslandBlock(C, lot, rng.pick(['redbrick', 'redbrick', 'tenements', 'walkups', 'shops', 'prewar', 'bodega', 'commercial', 'firehouse', 'redbrick']), lot.bx, lot.by);
  furnish(C, lots);
  // the streets between them
  boroGrid(C, { ...R, y0: 30 }, keep);
  yankeeStadium(C, ys);
  // trees along the Harlem River
  for (let y = 4; y < R.y1; y += 3) for (let x = R.x0; x < R.x1; x += 1) {
    if (clsAt(x, y) !== CL.BORO) continue;
    if (clsAt(x - 2, y) === CL.WATER && rng.chance(0.7)) addTreeAt(C, x + 1.2, y, CURB, rng.pick(['oak', 'elm', 'locust']));
    break;
  }
  landmark(C, 'THE BRONX', 330, 60, 0);
}
function yankeeStadium(C, r) {
  const mb = C.mb, S = sharedTex(C), W = C.world;
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, rx = (r.x1 - r.x0) / 2, ry = (r.y1 - r.y0) / 2;
  const lime = C.atlas.shared('ys_lime', 32, 48, (p) => {
    stoneFill(p, 0, 0, 32, 48, [0xe2d8c4], 411, 12, { blocks: 32 });
    for (let y = 10; y < 42; y++) for (let x = 6; x < 26; x++) { const top = y < 16 ? Math.abs(x - 15.5) < Math.sqrt(Math.max(0, 100 - (y - 16) ** 2)) : true; if (top) p.set(x, y, 0x2a3440, winCode(0.2, true)); }
  });
  const seats = C.atlas.shared('ys_seats', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, y % 4 === 0 ? 0x1a3a6a : shade(0x2a4a8a, 0.9 + hash2i(x, y, 412) * 0.2)); });
  const field = C.atlas.shared('ys_field', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade((x >> 3) % 2 ? 0x4e9e3e : 0x5aae48, 0.95 + hash2i(x, y, 413) * 0.08)); });
  // the outer wall: an oval of limestone arches
  const n = 28, z1 = CURB + 5.5, outer = [], inner = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * 2 * PI; outer.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); inner.push([cx + Math.cos(a) * (rx - 5), cy + Math.sin(a) * (ry - 5)]); }
  for (let k = 0; k < n; k++) {
    const a = outer[k], b = outer[(k + 1) % n], ai = inner[k], bi = inner[(k + 1) % n];
    wall(C, b, a, CURB, z1, lime, MAT.OFFICE);
    // the stands sloping down to the field
    mb.quad([a[0], a[1], z1], [b[0], b[1], z1], [bi[0], bi[1], CURB + 1.0], [ai[0], ai[1], CURB + 1.0], [[0, 0], [64, 0], [64, 64], [0, 64]], seats, [0, 0, 1], MAT.SNOW);
  }
  // the field: a diamond in the grass, the infield dirt
  mb.box(cx - rx + 5, cy - ry + 5, CURB, cx + rx - 5, cy + ry - 5, CURB + 0.95, { pz: { t: field, world: true } });
  const dirt = C.atlas.shared('ys_dirt', 8, 8, (p) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, shade(0xb07a4a, 0.92 + hash2i(x, y, 414) * 0.12)); });
  const hx = cx, hy = cy + ry - 9;
  for (let k = 0; k < 6; k++) { const s = 4 - k * 0.6; mb.hquad(hx - s, hy - 4 - s * 0.4, hx + s, hy - 4 + s * 0.4 - 1, CURB + 0.97 + k * 0.001, dirt); }
  markHeight(W, r.x0, r.y0, r.x1, r.y1, z1);
  // the white frieze round the top of the stands, the scoreboard over the bleachers
  const frieze = C.atlas.shared('ys_frieze', 32, 12, (p) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 32; x++) p.set(x, y, 0, 0); for (let x = 0; x < 32; x++) { p.set(x, 0, 0xf2f2f0); p.set(x, 1, 0xf2f2f0); } for (let x = 0; x < 32; x += 4) for (let y = 2; y < 11; y++) { const k = (y - 2) / 9; p.set(x + Math.round(k * 2), y, 0xe8e8e6); p.set(x + 3 - Math.round(k * 2), y, 0xe8e8e6); } });
  for (let k = 0; k < n; k++) {
    const a = outer[k], b = outer[(k + 1) % n], ai = [a[0] + (cx - a[0]) * 0.12, a[1] + (cy - a[1]) * 0.12], bi = [b[0] + (cx - b[0]) * 0.12, b[1] + (cy - b[1]) * 0.12];
    if (Math.sin((k / n) * 2 * PI) > 0.6) continue; // (open over the bleachers)
    wall(C, bi, ai, z1 + 1.4, z1 + 1.8, frieze, MAT.FLAT);
    for (const q of [ai]) mb.box(q[0] - 0.08, q[1] - 0.08, z1, q[0] + 0.08, q[1] + 0.08, z1 + 1.8, sides(propTex(C).silver));
  }
  const sb = C.atlas.alloc(96, 40);
  sb.p.rect(0, 0, 96, 40, 0x1b1b1b, 255);
  sb.p.rect(2, 2, 92, 22, 0x2a3a5a, winCode(0.0, true));
  sb.p.text7(16, 8, 'YANKEES', 0xf2f2f0, winCode(0.0, true), 2);
  for (let i = 0; i < 9; i++) sb.p.text7(4 + i * 10, 28, String((i * 7) % 10), 0xffd84f, winCode(0.0, true));
  const sbx = cx, sby = r.y1 - 2.6, sw = 96 / T;
  mb.box(sbx - 0.1, sby - 0.1, z1 - 1, sbx + 0.1, sby + 0.1, z1 + 1.5, sides(propTex(C).black));
  mb.vquad(sbx - sw / 2, sby - 0.15, sbx + sw / 2, sby - 0.15, z1 + 1.5, z1 + 1.5 + 40 / T, sb, { mat: MAT.FLAT | MAT.NOSHADOW, n: [0, -1, 0] });
  mb.vquad(sbx + sw / 2, sby + 0.15, sbx - sw / 2, sby + 0.15, z1 + 1.5, z1 + 1.5 + 40 / T, sb, { mat: MAT.FLAT | MAT.NOSHADOW, n: [0, 1, 0] });
  // the frieze round the top, light towers
  for (let k = 0; k < n; k += 4) { const a = outer[k]; mb.box(a[0] - 0.15, a[1] - 0.15, z1, a[0] + 0.15, a[1] + 0.15, z1 + 4, sides(propTex(C).silver)); W.lamps.push({ x: (a[0] + cx) / 2, y: (a[1] + cy) / 2, z: z1 + 3, r: 8, color: [0.95, 0.97, 1], k: 0.6, kind: 'flood' }); W.lampHeads.push({ x: a[0], y: a[1], z: z1 + 4, kind: 'flood' }); }
  landmark(C, 'YANKEE STADIUM', cx, r.y1 + 6, 0);
  void S;
}

// ---- Brooklyn: behind the waterfront's lofts and rowhouses, whole blocks of brownstones -----------------
function brooklyn(C) {
  const W = C.world, rng = C.rng;
  const bbRow = BLOCK_TYPES.findIndex((r) => r.includes('bridge'));
  const ys = [...(W.bridges || []).filter((b) => b.x1 >= MAPX - 1).map((b) => b.y), bbRow >= 0 ? (lotStart(bbRow) + lotEnd(bbRow)) / 2 : -100];
  for (const R of BOROUGHS.filter((b) => b.name === 'brooklyn')) {
    const front = R.x0 + 7.2 + (R.x1 - R.x0 > 40 ? 10 : 12);
    const keep = (x, y) => x < front || ys.some((by) => Math.abs(y - by) < 8);
    boroGrid(C, { ...R, x0: front + 1 }, keep);
    const blots = wholeLots(C, R, keep);
    furnish(C, blots);
    for (const lot of blots) {
      const dumbo = ys.some((by) => Math.abs(lot.y0 - by) < 40);
      offIslandBlock(C, lot, rng.pick(dumbo ? ['lofts', 'lofts', 'walkups', 'brownstones', 'commercial'] : ['brownstones', 'brownstones', 'walkups', 'shops', 'redbrick', 'tenements', 'bodega', 'firehouse', 'lofts']), lot.bx, lot.by);
    }
  }
  // the Domino Sugar sign on the old refinery, just south of the Williamsburg Bridge
  const wb = (W.bridges || []).find((b) => b.name === 'WILLIAMSBURG BRIDGE');
  if (wb) dominoSign(C, eastShoreX(wb.y + 13) + 9.5, wb.y + 13);
}

// ---- Queens ----------------------------------------------------------------------------------------------
function queens(C) {
  const R = region('queens'), L = looks(C), rng = C.rng, W = C.world;
  const bridgesY = (W.bridges || []).filter((b) => b.y > R.y0 && b.y < R.y1 && b.x1 >= MAPX - 1).map((b) => b.y);
  const gantry = { y0: lotStart(ROWS.gantry) - 2, y1: lotEnd(ROWS.gantry) + 2 };
  const parkY1 = OY(302);
  const keep = (x, y) => bridgesY.some((by) => Math.abs(y - by) < 7.5) || (y > gantry.y0 && y < gantry.y1) || y < parkY1 + 3;
  // the promenade along the river, Astoria Park's lawn by Hell Gate
  C.paintGround(R.x0, R.y0, R.x0 + 4, R.y1, 'plaza');
  C.paintGround(R.x0 + 4, R.y0, MAPX, parkY1, 'lawn');
  for (let y = R.y0 + 2; y < parkY1 - 2; y += 3.2) for (let x = R.x0 + 6; x < MAPX - 2; x += 4) if (rng.chance(0.6) && !bridgesY.some((by) => Math.abs(y - by) < 6)) C.addTree(x + rng.range(-0.8, 0.8), y, rng.pick(['oak', 'elm', 'plane']), false);
  // Astoria's streets of walk-ups and brownstones, then Long Island City's glass towers
  boroGrid(C, { ...R, x0: R.x0 + 4 }, keep);
  const qlots = wholeLots(C, R, keep);
  furnish(C, qlots);
  for (const lot of qlots) {
    if (lot.by < ROWS.lic - 1) offIslandBlock(C, lot, rng.pick(['walkups', 'brownstones', 'shops', 'walkups', 'redbrick', 'tenements', 'bodega', 'commercial', 'lofts']), lot.bx, lot.by);
    else offIslandBlock(C, lot, rng.pick(['glass', 'glass', 'modern', 'office', 'lofts']), lot.bx, ROWS.lic + 1);
  }
  // Gantry Plaza: the lawn and promenade, the two gantries, the Pepsi-Cola sign
  C.paintGround(R.x0, gantry.y0, MAPX, gantry.y1, 'lawn');
  C.paintGround(R.x0, gantry.y0, R.x0 + 4, gantry.y1, 'plaza');
  for (const gy of [gantry.y0 + 5, gantry.y0 + 11]) gantryCrane(C, R.x0 + 1.2, gy);
  pepsiSign(C, R.x0 + 2.5, gantry.y1 - 4.5);
  for (let y = gantry.y0 + 2; y < gantry.y1 - 1; y += 3) C.addTree(R.x0 + 8 + rng.range(0, 4), y, 'locust', false);
  for (let y = R.y0 + 6; y < R.y1 - 3; y += 7) { if (bridgesY.some((by) => Math.abs(y - by) < 8)) continue; parkLamp(C, R.x0 + 3.2, y); C.addBench(R.x0 + 3.4, y + 2.5, 'y', -1); }
  landmark(C, 'QUEENS', R.x0 + 12, lotStart(14), 0);
  landmark(C, 'PEPSI-COLA SIGN', R.x0 - 6, gantry.y1 + 2, 0);
}
function gantryCrane(C, x, y) {
  const mb = C.mb, black = propTex(C).black;
  const signT = C.atlas.shared('gantry_sign', 64, 10, (p) => { p.rect(0, 0, 64, 10, 0x1b1b1b); p.text7(4, 2, 'LONG ISLAND', 0xf2efe6, 255); });
  for (const dy of [-1.6, 1.6]) {
    beam(C, [x + 2.5, y + dy, CURB], [x + 0.5, y + dy, CURB + 5.5], 0.32, black);
    beam(C, [x + 4.5, y + dy, CURB], [x + 3.0, y + dy, CURB + 5.5], 0.32, black);
  }
  mb.box(x - 1.2, y - 1.9, CURB + 5.2, x + 3.4, y + 1.9, CURB + 6.0, sides(black, { t: black }));
  mb.vquad(x - 1.25, y + 1.6, x - 1.25, y - 1.6, CURB + 5.25, CURB + 5.25 + 10 / T, signT, { mat: MAT.FLAT });
  C.world.solids.push([x - 1.2, y - 1.9, x + 4.6, y + 1.9, 6]);
}
// the red neon script on its steel frame, facing Manhattan across the river
function pepsiSign(C, x, y) {
  const mb = C.mb, W = C.world;
  const w = 7.5, h = 2.2;
  const tex = C.atlas.alloc(Math.round(w * T), Math.round(h * T));
  const p = tex.p;
  p.rect(0, 0, tex.w, tex.h, 0, 0);
  const red = 0xe8202c, lit = winCode(0.01, true);
  // a script word, drawn as thick strokes, a bottle on the right
  const word = 'Pepsi-Cola';
  for (let k = 0; k < word.length; k++) p.text7(8 + k * 20, 14, word[k], red, lit, 3);
  for (let xx = 4; xx < tex.w - 40; xx++) { p.set(xx, 44, red, lit); p.set(xx, 45, red, lit); }
  p.rect(tex.w - 30, 6, 14, 48, red, lit); p.rect(tex.w - 27, 2, 8, 6, red, lit); p.rect(tex.w - 26, 18, 6, 18, 0xf2efe6, lit);
  const P = propTex(C);
  for (const dx of [0.6, w / 2, w - 0.6]) mb.box(x - 0.06, y - w / 2 + dx - 0.06, CURB, x + 0.06, y - w / 2 + dx + 0.06, CURB + 1.6 + h, sides(P.black));
  mb.vquad(x - 0.1, y + w / 2, x - 0.1, y - w / 2, CURB + 1.6, CURB + 1.6 + h, tex, { mat: MAT.FLAT | MAT.NOSHADOW });
  mb.vquad(x + 0.1, y - w / 2, x + 0.1, y + w / 2, CURB + 1.6, CURB + 1.6 + h, tex, { mat: MAT.FLAT | MAT.NOSHADOW });
  W.lamps.push({ x: x - 2, y, z: CURB + 2.5, r: 6, color: [1, 0.2, 0.15], k: 0.6, kind: 'neon' });
}

// ---- the islands ---------------------------------------------------------------------------------------------
function randalls(C) {
  const R = region('randalls'), rng = C.rng, mb = C.mb, W = C.world;
  C.paintGround(R.x0, R.y0, R.x1, R.y1, 'grass');
  const yb = (W.bridges || []).find((b) => b.name === 'TRIBOROUGH BRIDGE')?.y ?? 207;
  // Icahn Stadium: an oval running track with a grandstand
  const cx = R.x0 + 12, cy = R.y0 + (yb - R.y0) / 2 - 1, rx = 8, ry = 5.2;
  C.paintWhere(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1, 'rubber');
  C.paintWhere(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => ((x - cx) / (rx - 1.6)) ** 2 + ((y - cy) / (ry - 1.6)) ** 2 < 1, 'lawn');
  const stand = C.atlas.shared('icahn_stand', 32, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) p.set(x, y, y % 3 === 0 ? 0x8a8a8a : 0x2a5a9a); });
  for (let k = 0; k < 4; k++) mb.box(cx - 6, cy - ry - 1.4 - k * 0.5, CURB, cx + 6, cy - ry - 0.9 - k * 0.5, CURB + 0.4 * (k + 1), { ny: stand, pz: { t: stand } });
  // ballfields south of the bridge
  for (const fx of [R.x0 + 10, R.x0 + 26]) {
    const fy = yb + 12;
    C.paintWhere(fx - 6, fy - 6, fx + 6, fy + 6, (x, y) => { const d = Math.hypot(x - fx, y - (fy + 4)), a = Math.atan2(y - (fy + 4), x - fx); return d < 7 && a < -PI / 4 && a > (-3 * PI) / 4; }, 'lawn');
    C.paintWhere(fx - 3, fy - 3, fx + 3, fy + 5, (x, y) => { const u = (x - fx + (y - fy - 4)) / Math.SQRT2, v = (y - fy - 4 - (x - fx)) / Math.SQRT2; return u < -0.4 && v < -0.4 && u > -3.4 && v > -3.4; }, 'dirt');
  }
  for (let y = R.y0 + 1.5; y < R.y1 - 1; y += 2.8) for (const x of [R.x0 + 1.5, R.x1 - 1.5]) if (Math.abs(y - yb) > 5 && rng.chance(0.75)) C.addTree(x, y, rng.pick(['oak', 'elm', 'plane']), false);
  for (let x = R.x0 + 4; x < R.x1 - 3; x += 3.5) if (rng.chance(0.6)) C.addTree(x, R.y0 + 1.5, rng.pick(['oak', 'elm']), false);
  landmark(C, "RANDALL'S ISLAND", cx, R.y1 + 4, 0);
}
function roosevelt(C) {
  const R = region('roosevelt'), L = looks(C), rng = C.rng, mb = C.mb, W = C.world, S = sharedTex(C);
  const qb = (W.bridges || []).find((b) => b.name === 'QUEENSBORO BRIDGE')?.y ?? 369;
  C.paintGround(R.x0, R.y0, R.x1, R.y1, 'lawn');
  C.paintGround(R.x0, R.y0, R.x0 + 1.6, R.y1, 'plaza');
  // apartment towers down the middle of the island
  let y = R.y0 + 9;
  while (y < qb - 16) {
    const h = rng.range(9, 18), d = rng.range(5, 8);
    bldg(C, R.x0 + 2.4, y, R.x1 - 1.6, y + d, h, rng.pick([L.brickRed, L.brickTan, L.lime]), L.roofs[0]);
    y += d + rng.range(1.6, 3);
  }
  // the lighthouse at the north tip
  const lx = (R.x0 + R.x1) / 2, ly = R.y0 + 2.5;
  mb.cylinder(lx, ly, CURB, CURB + 4, 0.7, 8, S.greystone, null);
  mb.cone(lx, ly, CURB + 4, CURB + 5.2, 0.8, 8, S.roofTar ?? S.greystone);
  W.lamps.push({ x: lx, y: ly, z: CURB + 4.2, r: 3, color: [1, 0.9, 0.6], k: 0.7, kind: 'neon' });
  // Four Freedoms Park at the south tip: a lawn between rows of lindens, the granite room at the point
  const fy0 = qb + 12;
  C.paintGround(R.x0 + 1.5, fy0, R.x1 - 1.5, R.y1 - 4, 'lawn');
  C.paintGround(R.x0, R.y1 - 4, R.x1, R.y1, 'plaza');
  for (let yy = fy0 + 1; yy < R.y1 - 5; yy += 1.8) for (const x of [R.x0 + 1.0, R.x1 - 1.0]) C.addTree(x, yy, 'locust', false, { scale: 0.85 });
  mb.box(R.x0 + 2.5, R.y1 - 3.2, CURB, R.x1 - 2.5, R.y1 - 0.4, CURB + 1.2, sides(S.greystone, { t: S.limeTop }));
  landmark(C, 'ROOSEVELT ISLAND', R.x1 + 4, R.y1 - 10, 0);
}
function governors(C) {
  const R = region('governors'), L = looks(C), rng = C.rng, mb = C.mb, W = C.world, S = sharedTex(C);
  C.paintGround(R.x0, R.y0, R.x1, R.y1, 'grass');
  C.paintGround(R.x0, R.y0, R.x1, R.y0 + 1.6, 'plaza');
  // Castle Williams: a round red sandstone fort at the north-west point
  const cx = R.x0 + 6, cy = R.y0 + 6, r = 4.2;
  const sand = C.atlas.shared('castle_clinton', 32, 64, (p) => {
    stoneFill(p, 0, 0, 32, 64, [0xa8604a], 151, 8, { blocks: 16 });
    p.rect(12, 26, 8, 12, 0x2a1e18); p.rect(13, 27, 6, 10, 0x1a1210);
    p.rect(0, 0, 32, 4, 0xb87a62);
  });
  const n = 24;
  for (let k = 0; k < n; k++) {
    if (k === 6) continue;
    const a0 = (k / n) * 2 * PI, a1 = ((k + 1) / n) * 2 * PI;
    const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    const q0 = [cx + Math.cos(a0) * (r - 0.6), cy + Math.sin(a0) * (r - 0.6)], q1 = [cx + Math.cos(a1) * (r - 0.6), cy + Math.sin(a1) * (r - 0.6)];
    wall(C, p1, p0, CURB, CURB + 3.0, sand, 0);
    wall(C, q0, q1, CURB, CURB + 3.0, sand, 0);
    mb.quad([p0[0], p0[1], CURB + 3], [p1[0], p1[1], CURB + 3], [q1[0], q1[1], CURB + 3], [q0[0], q0[1], CURB + 3], [[0, 0], [8, 0], [8, 8], [0, 8]], sand, [0, 0, 1], MAT.SNOW);
  }
  W.solids.push([cx - r, cy - r, cx + r, cy + r, 3]);
  // Fort Jay: a star fort on the hill in the middle, its grassy ramparts
  const fx = (R.x0 + R.x1) / 2 + 4, fy = (R.y0 + R.y1) / 2, star = [];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * 2 * PI, rr = k % 2 ? 4.2 : 6.5; star.push([fx + Math.cos(a) * rr, fy + Math.sin(a) * rr]); }
  C.paintWhere(fx - 7, fy - 7, fx + 7, fy + 7, (x, y) => Math.hypot(x - fx, y - fy) < 3.2, 'lawn');
  for (let k = 0; k < 8; k++) wall(C, star[(k + 1) % 8], star[k], CURB, CURB + 1.4, S.greystone, 0);
  W.solids.push([fx - 6.5, fy - 6.5, fx + 6.5, fy + 6.5, 1.4]);
  flagPole(C, fx, fy, 4, 'us');
  // Nolan Park's yellow houses and the brick barracks along the east
  for (let k = 0; k < 4; k++) bldg(C, R.x1 - 9, R.y0 + 3 + k * 7, R.x1 - 3, R.y0 + 8 + k * 7, 4, k % 2 ? L.brickRed : L.brickTan, S.roofTar);
  for (let y = R.y0 + 2.5; y < R.y1 - 1; y += 2.6) for (let x = R.x0 + 2; x < R.x1 - 10; x += 3.2) {
    if (Math.hypot(x - cx, y - cy) < r + 1.5 || Math.hypot(x - fx, y - fy) < 8) continue;
    if (rng.chance(0.4)) C.addTree(x + rng.range(-0.8, 0.8), y, rng.pick(['oak', 'elm', 'plane', 'locust']), false);
  }
  landmark(C, 'GOVERNORS ISLAND', fx, R.y0 - 4, 0);
}
// Ellis Island: a little island of its own on the water, the great hall of red brick and limestone
// with its four copper-domed towers, the ferry slip in front
function ellis(C) {
  const R = ELLIS, mb = C.mb, W = C.world, S = sharedTex(C), gt = W.ground;
  const granite = C.atlas.shared('bb_granite', 64, 64, () => {});
  mb.box(R.x0, R.y0, WATER_Z - 0.1, R.x1, R.y1, CURB, { px: granite, nx: granite, py: granite, ny: granite, pz: { t: gt, world: true, mat: MAT.GROUND | MAT.SNOW | MAT.WET } });
  C.paintGround(R.x0, R.y0, R.x1, R.y1, 'lawn');
  C.paintGround(R.x0, R.y0, R.x1, R.y0 + 1.5, 'plaza');
  C.paintGround(R.x0 + 4, R.y1 - 5, R.x1 - 4, R.y1, 'plaza');
  const brick = C.atlas.shared('ellis_brick', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
      let c = shade((y % 3 === 2) ? 0xc8b8a0 : 0xa8483a, 0.94 + hash2i(x >> 3, y / 3 | 0, 421) * 0.1);
      p.set(x, y, c);
    }
    for (const wx of [5, 19]) { p.rect(wx - 1, 8, 10, 30, 0xe6dabe); p.rect(wx, 12, 8, 26, 0x2a3440, winCode(0.3, true)); for (let k = 0; k < 8; k++) { const dy = Math.round(Math.sqrt(Math.max(0, 16 - (k - 3.5) ** 2))); p.vline(wx + k, 12 - dy, dy, 0x2a3440, winCode(0.3, true)); } }
    p.rect(0, 0, 32, 4, 0xe6dabe); p.rect(0, 44, 32, 4, 0xe6dabe);
  });
  const copper = C.atlas.shared('copper', 32, 32, () => {});
  const x0 = R.x0 + 3, x1 = R.x1 - 3, y0 = R.y0 + 4, y1 = R.y1 - 6, h = 4.0;
  mb.box(x0, y0, CURB, x1, y1, CURB + h, sides(brick, { t: S.roofTar }), { mat: MAT.OFFICE });
  mb.gable(x0 - 0.2, y0 - 0.2, x1 + 0.2, y1 + 0.2, CURB + h, CURB + h + 1.4, 'x', S.slate ?? S.roofTar, brick);
  for (const [tx, ty] of [[x0 + 2.8, y1], [x1 - 2.8, y1], [x0 + 2.8, y0], [x1 - 2.8, y0]]) {
    mb.box(tx - 0.8, ty - 0.8, CURB, tx + 0.8, ty + 0.8, CURB + h + 2.6, sides(brick, { t: S.roofTar }));
    mb.cylinder(tx, ty, CURB + h + 2.6, CURB + h + 3.2, 0.6, 8, copper, null);
    mb.cone(tx, ty, CURB + h + 3.2, CURB + h + 4.4, 0.7, 8, copper);
  }
  W.solids.push([R.x0, R.y0, R.x1, R.y1, h]);
  markHeight(W, x0, y0, x1, y1, CURB + h);
  for (let x = R.x0 + 1.5; x < R.x1 - 1; x += 3) C.addTree(x, R.y0 + 2.6, 'plane', false, { scale: 0.85 });
  landmark(C, 'ELLIS ISLAND', (R.x0 + R.x1) / 2 + 8, R.y1 + 4, 0);
}

export function greaterNewYork(C) {
  const tm = (k, f) => { const t = performance.now(); f(); (C.world._wfTimes || (C.world._wfTimes = {}))[k] = Math.round(performance.now() - t); };
  tm('nj', () => newJersey(C));
  tm('bronx', () => bronx(C));
  tm('queens', () => queens(C));
  tm('brooklyn', () => brooklyn(C));
  tm('randalls', () => randalls(C));
  tm('roosevelt', () => roosevelt(C));
  tm('governors', () => governors(C));
  tm('ellis', () => ellis(C));
  void valueNoise; void RNG; void signBoard;
}
