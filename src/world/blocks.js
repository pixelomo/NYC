// Block-by-block city generation + street furniture.

import { T, PERIOD, CURB, BLOCK_TYPES, blockRect, roadCenter, lotStart, lotEnd, parkRect, blockInPark, isParkIntersection, MERGES, TSQ, roadEnd, WATER_Z, NBX, NBY, MAPX, MAPY, legOpen, isManhattan } from './layout.js';
import { quayEdges } from './ground.js';
import { RNG } from '../core/math.js';
import { GC, COL } from './ground.js';
import { MAT, GRP } from './mesh.js';
import { shade, mixc, hash2i, valueNoise } from '../core/math.js';
import { Frame, rowhouse, walkup, gardenWall, sharedTex, markHeight, deptStore } from './buildings.js';
import { loft } from './towers.js';
import {
  propTex, streetLamp, parkLamp, signalPole, hydrant, mailbox, newsBoxes, trashBasket, bench, steamGrate, kiosk,
  busShelter, subwayEntrance, parkWall, chainFence, hoop, bleachers, handballWall, playground, scaffolding,
} from './props.js';
import { smoothFill, stoneFill, brickFill, PAL, drawWindow, drawDoor, signBoard, SHOPPING, CHINATOWN } from './facades.js';
import * as LM from './landmarks.js';
import * as MH from './manhattan.js';
import { buildBridges } from './bridges.js';
import { greaterNewYork } from './greater.js';
import * as UP from './uptown.js';
import * as SK from './skyline.js';
import * as SG from './sights.js';
import { winCode, textWidth } from '../core/painter.js';
import { centralPark } from './centralpark.js';
import { billboardsBlock, timesSquareBlock, timesSquareDistrict } from './timessq.js';

export function makeContext(world, mb, atlas, rng) {
  const gp = world.ground.p;
  const C = {
    mb, atlas, rng, world, z0: CURB, ground: world.ground,
    paintGround(x0, y0, x1, y1, kind) {
      // (the ground painter may be half resolution: step over the texels it really has)
      const st = gp.half ? 2 : 1;
      const X0 = Math.round(Math.min(x0, x1) * T), X1 = Math.round(Math.max(x0, x1) * T);
      const Y0 = Math.round(Math.min(y0, y1) * T), Y1 = Math.round(Math.max(y0, y1) * T);
      const sx = gp.half ? X0 & ~1 : X0, sy = gp.half ? Y0 & ~1 : Y0;
      for (let y = sy; y < Y1; y += st)
        for (let x = sx; x < X1; x += st) {
          const r = groundFill(kind, x, y, X0, Y0, X1, Y1);
          if (r) gp.set(x, y, r[0], r[1]);
        }
    },
    // paint texels whose centre satisfies inside(wx, wy) within a bounding box
    paintWhere(x0, y0, x1, y1, inside, kind) {
      const st = gp.half ? 2 : 1;
      const X0 = Math.floor(Math.min(x0, x1) * T), X1 = Math.ceil(Math.max(x0, x1) * T);
      const Y0 = Math.floor(Math.min(y0, y1) * T), Y1 = Math.ceil(Math.max(y0, y1) * T);
      const sx = gp.half ? X0 & ~1 : X0, sy = gp.half ? Y0 & ~1 : Y0;
      for (let y = sy; y < Y1; y += st)
        for (let x = sx; x < X1; x += st) {
          if (!inside((x + st * 0.5) / T, (y + st * 0.5) / T)) continue;
          const r = groundFill(kind, x, y, X0, Y0, X1, Y1);
          if (r) gp.set(x, y, r[0], r[1]);
        }
    },
    addSprite(kind, x, y, z, o = {}) {
      world.props.push({ kind, x, y, z, ...o });
    },
    addTree(x, y, species, pit = false, o = {}) {
      world.trees.push({ x, y, z: CURB, species, variant: rng.int(0, 2), scale: o.scale ?? rng.range(0.9, 1.1) });
      if (pit) C.paintGround(x - 0.5, y - 0.5, x + 0.5, y + 0.5, 'treepit');
    },
    addBench(x, y, axis, facing = 1) {
      bench(C, x, y, axis, { facing });
    },
    addPlanter(x, y) {
      const P = propTex(C);
      mb.box(x - 0.5, y - 0.5, CURB, x + 0.5, y + 0.5, CURB + 0.5, { px: P.planter, nx: P.planter, py: P.planter, ny: P.planter, pz: { t: P.soilTop, world: true } });
      C.addSprite('bush', x, y, CURB + 0.5);
    },
    addFlag(fr, a, d, z, type = 'us') {
      const p = fr.pt(a, d);
      world.flags.push({ x: p[0], y: p[1], z, n: fr.n, type });
      // pole sticking out diagonally from the facade
      const P = propTex(C);
      const q = fr.pt(a, d - 0.9);
      mb.box(Math.min(p[0], q[0]) - 0.025, Math.min(p[1], q[1]) - 0.025, z, Math.max(p[0], q[0]) + 0.025, Math.max(p[1], q[1]) + 0.025, z + 0.05,
        { px: P.silver, nx: P.silver, py: P.silver, ny: P.silver, pz: P.silver });
      world.flags[world.flags.length - 1].tip = { x: q[0], y: q[1] };
    },
    fountainPool(x, y, w, d) {
      const P = propTex(C);
      const S = sharedTex(C);
      C.paintGround(x - w / 2, y - d / 2, x + w / 2, y + d / 2, 'water');
      const t = 0.18, h = 0.45;
      const rim = S.limestone;
      const top = { t: S.limeTop, world: true };
      mb.box(x - w / 2, y - d / 2, CURB, x + w / 2, y - d / 2 + t, CURB + h, { px: rim, nx: rim, py: rim, ny: rim, pz: top });
      mb.box(x - w / 2, y + d / 2 - t, CURB, x + w / 2, y + d / 2, CURB + h, { px: rim, nx: rim, py: rim, ny: rim, pz: top });
      mb.box(x - w / 2, y - d / 2, CURB, x - w / 2 + t, y + d / 2, CURB + h, { px: rim, nx: rim, py: rim, ny: rim, pz: top });
      mb.box(x + w / 2 - t, y - d / 2, CURB, x + w / 2, y + d / 2, CURB + h, { px: rim, nx: rim, py: rim, ny: rim, pz: top });
      // water surface slightly raised (samples the painted water)
      mb.box(x - w / 2 + t, y - d / 2 + t, CURB, x + w / 2 - t, y + d / 2 - t, CURB + h - 0.12,
        { pz: { t: world.ground, world: true, mat: MAT.GROUND | MAT.WET } });
      world.fountains.push({ x, y, z: CURB + h - 0.12, kind: 'pool', w, d });
      void P;
    },
    addSubway(x, y, axis) {
      subwayEntrance(C, x, y, axis);
    },
  };
  return C;
}

// Ground fills ---------------------------------------------------------------
function groundFill(kind, x, y, X0, Y0, X1, Y1) {
  const h = hash2i(x, y, 51);
  switch (kind) {
    case 'flowerbed': {
      const e = Math.min(x - X0, y - Y0, X1 - 1 - x, Y1 - 1 - y);
      if (e < 2) return [e === 0 ? 0xb0aca2 : 0x8a867c, GC.CURB];
      return [shade(hash2i(x >> 1, y >> 1, 8) > 0.5 ? 0x5a3e2a : 0x4e3424, 0.9 + h * 0.2), GC.FLOWERBED];
    }
    case 'soil':
      return [shade(0x5a3e2a, 0.88 + h * 0.24), GC.SOIL];
    case 'treepit': {
      const e = Math.min(x - X0, y - Y0, X1 - 1 - x, Y1 - 1 - y);
      if (e < 2) return [e === 0 ? 0x9a968e : 0x7a766e, GC.CURB];
      // iron tree grate ring around a mulch centre
      const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (r > 7 && e > 2 && ((x - X0) % 4 === 0 || (y - Y0) % 4 === 0)) return [0x3a3530, GC.SOIL];
      return [shade(hash2i(x >> 1, y >> 1, 6) > 0.6 ? 0x5e4230 : 0x4e3626, 0.88 + h * 0.24), GC.SOIL];
    }
    case 'patio': {
      // running-bond brick pavers
      const row = y >> 3, off = row % 2 ? 8 : 0;
      const jx = (x + off) % 16 === 0, jy = y % 8 === 0;
      let c = shade(mixc(0xa8927a, 0xb89a80, hash2i((x + off) >> 4, row, 3)), 0.95 + h * 0.08);
      if (jy) c = 0x7a6e62;
      else if (jx) c = 0x86796c;
      else if (y % 8 === 1) c = shade(c, 1.06);
      return [c, GC.PATIO];
    }
    case 'plaza': {
      const jx = x % 32 === 0, jy = y % 32 === 0;
      const tile = hash2i(x >> 5, y >> 5, 9);
      let c = shade(mixc(0xc9c6c0, 0xb5b2ac, tile), 0.97 + h * 0.05);
      if (jx || jy) c = 0x9a9790;
      else if (x % 32 === 1 || y % 32 === 1) c = shade(c, 1.05);
      return [c, GC.PLAZA];
    }
    case 'grass': {
      const n = valueNoise(x * 0.04, y * 0.04, 5);
      const n2 = valueNoise(x * 0.15, y * 0.15, 6);
      let c = n > 0.55 ? COL.grass : mixc(COL.grass, COL.grassDark, 0.55);
      c = shade(c, 0.9 + h * 0.12 + (n2 - 0.5) * 0.1);
      // blades: short vertical darker/lighter streaks
      const b = hash2i(x, y >> 1, 77);
      if (b > 0.9) c = shade(c, 1.16);
      else if (b < 0.08) c = shade(c, 0.84);
      if (h > 0.996) c = [0xf2f2e8, 0xf2d84a, 0xd8d0f0][Math.floor(hash2i(x, y, 3) * 3)]; // clover / dandelions
      return [c, GC.GRASS];
    }
    case 'falls': {
      // water pouring over the edge of a memorial pool: white foam streaks
      const c = hash2i(x >> 1, y >> 3, 63) > 0.5 ? 0xe8f0f4 : 0xb8ccd8;
      return [shade(c, 0.95 + h * 0.08), GC.RIVER];
    }
    case 'void': {
      return [shade(0x101418, 0.9 + h * 0.15), GC.METAL];
    }
    case 'rink': {
      // the ice at the rink: blue-white, scored by skates
      let c = shade(0xdcecf4, 0.95 + h * 0.05);
      if (hash2i(x >> 3, y >> 1, 61) > 0.94) c = 0xc4d8e6;
      else if (hash2i(x >> 1, y >> 3, 62) > 0.96) c = 0xeef6fa;
      return [c, GC.COURT];
    }
    case 'driveway': {
      // the park drive: smooth asphalt
      let c = shade(0x56595f, 0.93 + h * 0.1);
      if (h > 0.986) c = 0x6c6f75;
      return [c, GC.PATH];
    }
    case 'path': {
      // hexagonal asphalt pavers
      const hx = x / 12, hy = y / 10.4;
      const row = Math.floor(hy);
      const off = row % 2 ? 0.5 : 0;
      const fx = hx + off - Math.floor(hx + off), fy = hy - row;
      const edge = fx < 0.12 || fy < 0.15;
      let c = shade(0x6f6c68, 0.94 + h * 0.08);
      if (edge) c = 0x55524e;
      return [c, GC.PATH];
    }
    case 'court': {
      return [shade(0x3f8a5a, 0.97 + h * 0.05), GC.COURT];
    }
    case 'courtKey':
      return [shade(0xb0423a, 0.97 + h * 0.05), GC.COURT];
    case 'courtLine':
      return [0xf2f2ee, GC.COURT_LINE];
    case 'asphaltPlay':
      return [shade(0x50606e, 0.95 + h * 0.08), GC.COURT];
    case 'rubber': {
      const c = h < 0.33 ? 0x2a6aa0 : h < 0.66 ? 0x2f5f90 : 0x3a78b0;
      return [c, GC.RUBBER];
    }
    case 'water':
      return [0x2f6f88, GC.WATER];
    case 'sand':
      return [shade(0xdcc48a, 0.92 + h * 0.14), GC.SAND];
    case 'gravel': {
      const st = hash2i(x >> 1, y >> 1, 21);
      return [shade(st > 0.8 ? 0xb0a08a : st < 0.2 ? 0x7a6c5a : 0x9a8a74, 0.85 + h * 0.3), GC.GRAVEL];
    }
    case 'wood':
      return [shade(x % 6 === 0 ? 0x6a4630 : x % 6 === 1 ? 0xaa7a50 : 0x9a6a44, 0.95 + h * 0.08), GC.WOOD];
    case 'stairsX':
    case 'stairsY': {
      const t = kind === 'stairsX' ? (x - X0) / (X1 - X0) : (y - Y0) / (Y1 - Y0);
      const step = Math.floor((kind === 'stairsX' ? x - X0 : y - Y0) / 6);
      const edge = (kind === 'stairsX' ? x - X0 : y - Y0) % 6 === 0;
      let c = mixc(0x8a8680, 0x16161a, Math.min(1, t * 1.15));
      if (edge) c = shade(c, 1.25);
      void step;
      return [c, GC.STAIRS];
    }
    case 'dirt':
      return [shade(0x8a6a4a, 0.88 + h * 0.24), GC.GRAVEL];
    case 'lawn': {
      // freshly mown: alternating light/dark stripes, finer blades than rough grass
      const n = valueNoise(x * 0.03, y * 0.03, 15);
      const stripe = Math.floor(x / 48) % 2 === 0;
      let c = mixc(COL.grass, 0x6cc050, stripe ? 0.35 : 0.0);
      c = shade(c, (stripe ? 1.0 : 0.93) + h * 0.07 + (n - 0.5) * 0.08);
      const b = hash2i(x, y >> 1, 78);
      if (b > 0.94) c = shade(c, 1.1);
      else if (b < 0.05) c = shade(c, 0.88);
      return [c, GC.GRASS];
    }
    case 'woods': {
      // woodland floor: shady grass with patches of leaf litter and soil
      const n = valueNoise(x * 0.09, y * 0.09, 16), n2 = valueNoise(x * 0.3, y * 0.3, 17);
      let c = mixc(COL.grassDark, 0x2f6a28, 0.35);
      if (n > 0.66) c = mixc(c, n2 > 0.5 ? 0x5e6a34 : 0x6a5e38, Math.min(0.75, (n - 0.66) * 3.5));
      c = shade(c, 0.9 + h * 0.16);
      if (h > 0.985) c = n2 > 0.5 ? 0x8a6a3a : 0x4a7a32; // twigs, clover
      return [c, GC.GRASS];
    }
    case 'grateX':
    case 'grateY': {
      // steel bar grating over a dark shaft: frame, cross bars every 3 texels, two bearers
      const lx = x - X0, ly = y - Y0, w = X1 - X0, hh = Y1 - Y0;
      const e = Math.min(lx, ly, w - 1 - lx, hh - 1 - ly);
      if (e === 0) return [0x3e3f42, GC.METAL];
      if (e < 3) return [e === 1 ? 0x9a9ca0 : 0x74767a, GC.METAL];
      const along = kind === 'grateX' ? lx : ly, across = kind === 'grateX' ? ly - 3 : lx - 3, span = (kind === 'grateX' ? hh : w) - 6;
      if (across === Math.floor(span / 3) || across === Math.floor((2 * span) / 3)) return [0x55575b, GC.METAL];
      if (along % 3 === 0) return [shade(0x8c8e92, 0.95 + h * 0.1), GC.METAL];
      if (along % 3 === 1) return [0x5c5e62, GC.METAL];
      return [shade(0x17181a, 0.9 + h * 0.3), GC.METAL];
    }
    case 'tsq': {
      // Times Square plaza: rose-grey concrete pavers with pale joints
      const jx = x % 40 === 0, jy = y % 20 === 0;
      const tile = hash2i(Math.floor(x / 40), Math.floor(y / 20), 81);
      let c = shade(mixc(0xb89a98, 0xa88a88, tile), 0.96 + h * 0.07);
      if (jx || jy) c = 0xd2c8c4;
      return [c, GC.PLAZA];
    }
    case 'pathEdge':
      return [shade(0x9c978d, 0.92 + h * 0.12), GC.PATH];
    case 'shore': {
      // pebbles and rounded rocks at the water's edge
      const st = hash2i(x >> 2, y >> 2, 23), st2 = hash2i(x >> 1, y >> 1, 24);
      let c = st > 0.7 ? 0x9a9488 : st > 0.35 ? 0x7e786c : 0x6a6458;
      if (st2 > 0.85) c = 0xb0aa9c;
      if ((x & 3) === 0 && (y & 3) === 0) c = shade(c, 0.8);
      return [shade(c, 0.9 + h * 0.2), GC.GRAVEL];
    }
  }
  return null;
}

// Frames for the four sides of a lot
function frames(L) {
  return {
    N: new Frame(L.x1, L.y0, 0, -1),
    S: new Frame(L.x0, L.y1, 0, 1),
    E: new Frame(L.x1, L.y1, 1, 0),
    W: new Frame(L.x0, L.y0, -1, 0),
  };
}

// ---------------------------------------------------------------------------
// The common block types come in a few variants each: every copy of a variant is built from the
// same seed, so it can reuse the facade textures its first copy painted (see Atlas.beginReplay).
// That keeps a 4x city inside the texture budget; towers and landmarks stay one of a kind.
const VARIANTS = { brownstones: 4, walkups: 5, tenements: 4, redbrick: 5, shops: 4, commercial: 3, bodega: 3, lofts: 3, billboards: 2 };
const typeSeed = (t) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

export function buildBlocks(C) {
  const prof = {};
  const time = (name, fn) => { const t = performance.now(); fn(); prof[name] = (prof[name] || 0) + performance.now() - t; };
  const rng0 = C.rng;
  for (let by = 0; by < NBY; by++)
    for (let bx = 0; bx < NBX; bx++) {
      if (blockInPark(bx, by) || !isManhattan(bx, by)) continue;
      const type = BLOCK_TYPES[by][bx];
      const L = blockRect(bx, by);
      const fn = BLOCKS[type];
      if (!fn) continue;
      const nv = VARIANTS[type];
      const variant = nv ? (bx * 7 + by * 13 + ((bx * by) % 5)) % nv : 0;
      C.rng = new RNG(nv ? typeSeed(type) % 100000 + variant * 7919 : 4000 + bx * 97 + by * 31);
      if (nv) C.atlas.beginReplay(`${type}:${variant}`);
      time(type, () => fn(C, L, bx, by, variant));
      C.atlas.endReplay();
    }
  C.rng = rng0;
  time('park', () => centralPark(C));
  time('tsq', () => timesSquareDistrict(C, TSQ, blockRect, lotEnd, lotStart));
  time('waterfront', () => waterfront(C));
  time('furniture', () => streetFurniture(C));
  C.world.blockProfile = Object.entries(prof).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ') + `, replayed ${C.atlas.replayed || 0}`;
}


// A block of the given type somewhere off Manhattan (the other boroughs): built with the same
// builders and texture variants as Manhattan's own blocks, but nobody lives or shops there as far as
// the simulation is concerned (its doors and shops are dropped; the boroughs aren't walked).
export const blockOf = (type) => BLOCKS[type];
export function offIslandBlock(C, L, type, bx, by, z0 = CURB) {
  const W = C.world, fn = BLOCKS[type];
  if (!fn) return;
  const keep = { doors: W.doors.length, shops: W.shops.length, stoopSeats: W.stoopSeats.length, officeDoors: W.officeDoors.length, benches: W.benches.length, carts: W.carts.length, subways: W.subways.length };
  const rng0 = C.rng, zs = C.z0;
  const nv = VARIANTS[type];
  const variant = nv ? Math.abs(bx * 7 + by * 13 + ((bx * by) % 5)) % nv : 0;
  C.rng = new RNG(nv ? typeSeed(type) % 100000 + variant * 7919 : 4000 + bx * 97 + by * 31);
  C.z0 = z0;
  if (nv) C.atlas.beginReplay(`${type}:${variant}`);
  fn(C, L, bx, by, variant);
  C.atlas.endReplay();
  C.rng = rng0; C.z0 = zs;
  for (const [k, n] of Object.entries(keep)) W[k].length = n;
}

// The waterfront: the water is out of bounds, an iron railing runs along every quay, the Brooklyn
// Bridge crosses the East River to Brooklyn's shore and the Statue of Liberty stands in the harbour
function waterfront(C) {
  const W = C.world, mb = C.mb;
  const P = propTex(C);
  const iron = { px: P.black, nx: P.black, py: P.black, ny: P.black, pz: P.black };
  for (const [ax, ay, bx, by, n] of quayEdges()) {
    if (Math.abs(bx - ax) + Math.abs(by - ay) < 1.5) continue;
    // (just inside the land, along the edge)
    const ox = -n[0] * 0.12, oy = -n[1] * 0.12;
    const x0 = Math.min(ax, bx) + ox, x1 = Math.max(ax, bx) + ox, y0 = Math.min(ay, by) + oy, y1 = Math.max(ay, by) + oy;
    if (n[0]) {
      for (let y = y0 + 0.5; y < y1 - 0.3; y += 1.5) mb.box(x0 - 0.04, y - 0.04, CURB, x0 + 0.04, y + 0.04, CURB + 0.55, iron);
      mb.box(x0 - 0.05, y0 + 0.3, CURB + 0.5, x0 + 0.05, y1 - 0.3, CURB + 0.58, iron);
    } else {
      for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.5) mb.box(x - 0.04, y0 - 0.04, CURB, x + 0.04, y0 + 0.04, CURB + 0.55, iron);
      mb.box(x0 + 0.3, y0 - 0.05, CURB + 0.5, x1 - 0.3, y0 + 0.05, CURB + 0.58, iron);
    }
  }
  const tm = (k, f) => { const t = performance.now(); f(); (C.world._wfTimes || (C.world._wfTimes = {}))[k] = Math.round(performance.now() - t); };
  tm('bridges', () => buildBridges(C));
  tm('bkbridge', () => LM.brooklynBridge(C));
  tm('bkshore', () => LM.brooklynShore(C));
  tm('greater', () => greaterNewYork(C));
  LM.statueOfLiberty(C);
  void WATER_Z; void roadEnd;
}

const BLOCKS = {
  brownstones: (C, L) => brownstoneBlock(C, L),
  walkups: (C, L) => walkupBlock(C, L, {}),
  tenements: (C, L) => walkupBlock(C, L, { shops: 0.8, fireEscape: true }),
  commercial: (C, L) => walkupBlock(C, L, { shops: 1, theater: true }),
  bodega: (C, L) => walkupBlock(C, L, { bodegaCorner: true, shops: 0.6 }),
  firehouse: (C, L) => walkupBlock(C, L, { firehouse: true, shops: 0.5 }),
  lofts: (C, L) => loftBlock(C, L),
  deco: (C, L, bx, by) => SK.towerBlock(C, L, bx, by, 'deco'),
  glass: (C, L, bx, by) => SK.towerBlock(C, L, bx, by, 'glass'),
  modern: (C, L, bx, by) => SK.towerBlock(C, L, bx, by, 'modern'),
  office: (C, L, bx, by) => SK.towerBlock(C, L, bx, by, 'office'),
  seagram: (C, L) => SK.seagramLever(C, L),
  citigroup: (C, L) => SK.citigroup(C, L),
  hearst: (C, L) => SK.hearst(C, L),
  nyt: (C, L) => SK.nytimes(C, L),
  vanderbilt: (C, L) => SK.vanderbilt(C, L),
  fortywall: (C, L) => SK.fortyWall(C, L),
  seventypine: (C, L) => SK.seventyPine(C, L),
  spruce: (C, L) => SK.eightSpruce(C, L),
  leonard: (C, L) => SK.leonard(C, L),
  court: (C, L) => courtBlock(C, L),
  park: (C, L) => parkBlock(C, L),
  // pre-war red-brick apartment houses: taller, mostly residential, canopied entrances
  redbrick: (C, L) => walkupBlock(C, L, {
    shops: 0.15, residential: true, fireEscape: true, floors: [6, 7], canopy: 0.55, billboards: 0.1, waterTowers: 0.6,
    brick: ['brickRed', 'brickRed', 'brickBrown', 'brickOrange'], widths: [[6, 6, 6], [6.5, 5, 6.5], [9, 9], [4.5, 9, 4.5]],
  }),
  // shopping streets: a storefront in every building, and sometimes a department store
  shops: (C, L, bx, by, v) => walkupBlock(C, L, { shops: 1, shopKinds: SHOPPING, floors: [4, 6], dept: v % 2 === 0 ? 'S' : null, billboards: 0.5, awning: 1 }),
  // sign towers facing Times Square
  billboards: (C, L, bx, by, v) => billboardsBlock(C, L, 'E', 900 + v * 7),
  timessq: (C, L, bx, by) => timesSquareBlock(C, L, 950 + bx * 7 + by),
  river: () => {},
  // landmarks
  rockefeller: (C, L) => LM.rockefeller(C, L),
  library: (C, L) => LM.library(C, L),
  grandcentral: (C, L) => LM.grandCentral(C, L),
  chrysler: (C, L) => LM.chryslerTower(C, L),
  empire: (C, L) => LM.empireState(C, L),
  arena: (C, L) => LM.arena(C, L),
  flatiron: (C, L) => LM.flatiron(C, L),
  washsq: (C, L) => LM.washingtonSquare(C, L),
  chinatown: (C, L, bx, by) => { walkupBlock(C, L, { shops: 1, shopKinds: CHINATOWN, floors: [4, 6], fireEscape: true, awning: 1 }); LM.chinatownExtras(C, L, !C.world._ctGate && (C.world._ctGate = true)); },
  wtc: (C, L) => LM.oneWTC(C, L),
  exchange: (C, L) => LM.exchange(C, L),
  // the rest of Manhattan
  prewar: (C, L, bx, by) => MH.prewar(C, L, bx, by),
  hotel: (C, L, bx, by) => MH.hotelBlock(C, L, bx, by),
  supertall: (C, L, bx) => MH.supertall(C, L, bx),
  guggenheim: (C, L) => MH.guggenheim(C, L),
  museum: (C, L) => MH.metMuseum(C, L),
  naturalhistory: (C, L) => MH.naturalHistory(C, L),
  lincoln: (C, L) => MH.lincolnCenter(C, L),
  columbus: (C, L) => MH.columbusCircle(C, L),
  plazahotel: (C, L) => MH.plazaHotel(C, L),
  stpatricks: (C, L) => MH.stPatricks(C, L),
  un: (C, L) => MH.unHQ(C, L),
  hudsonyards: (C, L) => MH.hudsonYards(C, L),
  memorial: (C, L) => MH.memorial(C, L),
  battery: (C, L) => MH.batteryPark(C, L),
  bridge: (C, L) => MH.bridgeApproach(C, L),
  // uptown and the rest (the bridges' approaches are built with the bridges)
  riverside: (C, L) => UP.riverside(C, L),
  grantstomb: (C, L) => UP.riverside(C, L, 'grantstomb'),
  soldiers: (C, L) => UP.riverside(C, L, 'soldiers'),
  inwoodhill: (C, L) => UP.inwoodHill(C, L),
  cloisters: (C, L) => UP.cloisters(C, L),
  highbridge: (C, L) => UP.highbridgePark(C, L),
  columbia: (C, L) => UP.columbia(C, L),
  apollo: (C, L) => walkupBlock(C, L, { shops: 1, theater: 'APOLLO', fireEscape: true, widths: [[4.5, 9, 4.5]] }),
  unionsq: (C, L) => UP.unionSquare(C, L),
  cityhall: (C, L) => UP.cityHall(C, L),
  // more sights
  intrepid: (C, L, bx, by) => SG.intrepid(C, L, bx, by),
  highline: (C, L, bx, by) => SG.highLine(C, L, bx, by),
  littleisland: (C, L, bx, by) => SG.littleIsland(C, L, bx, by),
  radiocity: (C, L) => SG.radioCity(C, L),
  macys: (C, L) => SG.macys(C, L),
  carnegie: (C, L) => SG.carnegie(C, L),
  moma: (C, L) => SG.moma(C, L),
  chelseamarket: (C, L) => SG.chelseaMarket(C, L),
  trinity: (C, L, bx, by) => SG.trinity(C, L, bx, by),
  bowlinggreen: (C, L) => SG.bowlingGreen(C, L),
  ferry: (C, L) => SG.ferryTerminal(C, L),
  seaport: (C, L, bx, by) => SG.seaport(C, L, bx, by),
  dakota: (C, L) => SG.dakota(C, L),
  gracie: (C, L) => SG.gracie(C, L),
  stjohn: (C, L) => MH.stPatricks(C, L, { stone: 0xb8b0a0, key: 'sjd', spires: false, name: 'ST JOHN THE DIVINE' }),
  gwb: () => {}, tbridge: () => {}, qbridge: () => {}, wbridge: () => {}, mbridge: () => {},
};

// ---------------------------------------------------------------------------
function brownstoneBlock(C, L) {
  const { rng } = C;
  const F = frames(L);
  const style = rng.pick(['brownstone', 'brick', 'mixed', 'mixed']);
  // backyards first (ground)
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'grass');
  let num = rng.int(10, 80) * 2;
  for (const side of ['N', 'S']) {
    const fr = F[side];
    // corner walkups
    walkup(C, fr, 0, 4.5, 8, { cornerSide: 'L', floors: rng.int(4, 5), shop: rng.pick(['bodega', 'pizza', 'coffee', 'laundry', 'bar', 'diner', 'flowers', null]) });
    walkup(C, fr, 13.5, 4.5, 8, { cornerSide: 'R', floors: rng.int(4, 5), shop: rng.pick(['bodega', 'pizza', 'coffee', 'chinese', 'bar', 'nails', null]) });
    for (let k = 0; k < 3; k++) {
      const st = style === 'mixed' ? undefined : style;
      rowhouse(C, fr, 4.5 + k * 3, 3, 6, { style: st, floors: rng.chance(0.7) ? 3 : 4, number: num, flag: rng.chance(0.15) });
      num += 2;
    }
  }
  // garden walls on E/W between corner buildings
  for (const side of ['E', 'W']) {
    const fr = F[side];
    gardenWall(C, fr, 8, 10, 0, CURB, 1.4, 'brick');
    C.world.backyardGates = C.world.backyardGates || [];
  }
  // backyards: yard fences between houses + trees
  const ym0 = L.y0 + 7.5, ym1 = L.y1 - 7.5;
  C.paintGround(L.x0 + 4.5, ym0, L.x1 - 4.5, ym1, 'grass');
  for (let k = 0; k < 4; k++) {
    const x = L.x0 + 4.5 + k * 3;
    C.mb.box(x - 0.05, ym0, CURB, x + 0.05, ym1, CURB + 0.9, sideFaces(sharedTex(C).fenceWood, sharedTex(C).wood));
  }
  C.mb.box(L.x0 + 4.5, (ym0 + ym1) / 2 - 0.05, CURB, L.x1 - 4.5, (ym0 + ym1) / 2 + 0.05, CURB + 0.9, sideFaces(sharedTex(C).fenceWood, sharedTex(C).wood));
  for (let k = 0; k < 3; k++) {
    const x = L.x0 + 6 + k * 3;
    for (const y of [ym0 + 0.75, ym1 - 0.75]) {
      const r = rng.next();
      if (r < 0.45) C.addTree(x + rng.range(-0.6, 0.6), y, rng.pick(['plane', 'oak', 'cherry', 'locust']), false, { scale: rng.range(0.8, 1.05) });
      else if (r < 0.65) { C.paintGround(x - 1, y - 0.6, x + 0.6, y + 0.6, 'patio'); C.addSprite('grill', x, y, CURB); }
      else if (r < 0.8) C.addSprite('laundry', x, y, CURB, { group: 'warm' });
      else C.paintGround(x - 1.2, y - 0.6, x + 1.2, y + 0.6, 'flowerbed');
    }
  }
}

function sideFaces(side, top) {
  return { px: side, nx: side, py: side, ny: side, pz: top };
}

// ---------------------------------------------------------------------------
function walkupBlock(C, L, o) {
  const { rng } = C;
  const F = frames(L);
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'patio');
  const shopP = o.shops ?? 0.6;
  const kinds = o.shopKinds ?? ['bodega', 'pizza', 'laundry', 'coffee', 'bar', 'books', 'flowers', 'chinese', 'nails', 'hardware', 'bagels', 'diner', 'pharmacy'];
  const pickShop = () => (rng.chance(shopP) ? rng.pick(kinds) : null);
  const fl = o.floors ?? [4, 6];
  const brick = () => (o.brick ? rng.pick(o.brick) : undefined);
  let num = rng.int(100, 400);
  for (const side of ['N', 'S']) {
    const fr = F[side];
    if (o.dept === side) { deptStore(C, fr, 0, 18, 7); num += 8; continue; }
    const widths = rng.pick(o.widths ?? [[5, 4, 4, 5], [5, 3.5, 4.5, 5], [4.5, 4.5, 4.5, 4.5], [5, 8, 5]]);
    let a = 0;
    widths.forEach((w, k) => {
      const corner = k === 0 ? 'L' : k === widths.length - 1 ? 'R' : null;
      let shop = pickShop();
      if (o.bodegaCorner && side === 'S' && k === widths.length - 1) shop = 'bodega';
      if (o.firehouse && side === 'S' && k === 1) {
        firehouse(C, fr, a, w, 7);
      } else if (o.theater && side === 'S' && w >= 8) {
        theater(C, fr, a, w, 7, typeof o.theater === 'string' ? o.theater : 'RIALTO');
      } else {
        const sh = corner && !o.residential ? shop ?? pickShop() : shop;
        walkup(C, fr, a, w, 7, {
          cornerSide: corner, shop: sh, number: num, brick: brick(),
          billboard: corner && rng.chance(o.billboards ?? 0.35) ? rng.pick(['cola', 'bagel', 'jazz', 'show', 'taxi', 'sun', 'gin']) : null,
          floors: rng.int(fl[0], fl[1]), fireEscape: o.fireEscape ? true : undefined, resDoorLeft: corner === 'R',
          canopy: o.canopy && rng.chance(o.canopy), waterTower: o.waterTowers != null ? rng.chance(o.waterTowers) : undefined, awning: o.awning,
        });
      }
      num += 2;
      a += w;
    });
  }
  for (const side of ['E', 'W']) {
    const fr = F[side];
    walkup(C, fr, 7, 4, 6.5, { shop: pickShop(), floors: rng.int(fl[0], Math.max(fl[0], fl[1] - 1)), number: num++, brick: brick(), canopy: o.canopy && rng.chance(o.canopy * 0.5), awning: o.awning });
  }
  // courtyard tree
  C.addTree((L.x0 + L.x1) / 2, (L.y0 + L.y1) / 2, 'plane', false, { scale: 0.9 });
  C.addSprite('laundry', (L.x0 + L.x1) / 2 + 1.2, (L.y0 + L.y1) / 2 - 1, CURB, { group: 'warm' });
}

function firehouse(C, fr, a0, W, D) {
  const { mb, rng } = C;
  const S = sharedTex(C);
  const H = 2.75 + 2 * 1.5 + 0.75;
  const tw = Math.round(W * T), th = Math.round(H * T);
  const front = C.atlas.alloc(tw, th);
  const p = front.p;
  brickFill(p, 0, 0, tw, th, PAL.brickRed, 77);
  p.rect(0, 0, tw, 24, 0xe2d6ba);
  p.hline(0, 0, tw, 0xf2ead2); p.hline(0, 23, tw, 0xa89c80);
  { const tx = textWidth('ENGINE 7', 2, true); p.text7(Math.max(2, Math.floor((tw - tx) / 2)), 5, 'ENGINE 7', 0xc8302c, 255, 2); }
  for (let f = 0; f < 2; f++) {
    const fy = 24 + f * 48;
    for (let b = 0; b < 3; b++) drawWindow(p, Math.round((tw / 3) * b + tw / 6) - 8, fy + 10, 16, 28, { frame: 0xf2efe6, lintel: 0xe2d6ba, sill: 0xe2d6ba, t: rng.next(), wall: PAL.brickRed[0], keystone: true }, rng);
  }
  const gy = 24 + 96;
  p.rect(0, gy, tw, th - gy, 0xe2d6ba);
  p.hline(0, gy, tw, 0xf2ead2);
  const dw = tw - 40;
  p.rect(8, gy + 8, dw, th - gy - 8, 0xc8302c);
  p.frame(8, gy + 8, dw, th - gy - 8, 0x8a1a18);
  for (let y = gy + 12; y < th; y += 5) { p.hline(10, y, dw - 4, 0xa82420); p.hline(10, y + 1, dw - 4, 0xd84a3c); }
  for (let x = 14; x < 8 + dw - 16; x += 16) { p.rect(x, gy + 16, 10, 8, 0x40576d, winCode(0.1)); p.frame(x - 1, gy + 15, 12, 10, 0xf2efe6); }
  p.text7(Math.floor(8 + dw / 2 - 3), gy + 30, '7', 0xf2c230, 255, 2);
  drawDoor(p, tw - 26, gy + 12, 18, th - gy - 12, { color: 0xc8302c, glass: true });
  const back = S.brickRed;
  const aabb = mb.body(() => fr.box(mb, a0, a0 + W, 0, D, CURB, CURB + H, { front, back, left: back, right: back, top: { t: S.roofTar, world: true } }));
  markHeight(C.world, ...aabb, CURB + H);
  C.addFlag(fr, a0 + W - 1, -0.05, CURB + 4.2, 'us');
  const bay = fr.pt(a0 + (dw / 2 + 8) / T, -0.5);
  C.world.firehouse = { x: bay[0], y: bay[1], n: fr.n, door: fr.pt(a0 + (dw / 2 + 8) / T, 1.5) };
  C.world.lamps.push({ x: bay[0], y: bay[1], z: 2.5, r: 2.4, color: [1, 0.9, 0.7], k: 0.6, kind: 'shop' });
}

function theater(C, fr, a0, W, D, name = 'RIALTO') {
  const { mb, rng } = C;
  const S = sharedTex(C);
  const H = 7.5;
  const tw = Math.round(W * T), th = Math.round(H * T);
  const front = C.atlas.alloc(tw, th);
  const p = front.p;
  stoneFill(p, 0, 0, tw, th, PAL.limestone, 66, 16, { blocks: 32 });
  // ornate frieze
  p.rect(0, 0, tw, 8, 0xc8b890); p.hline(0, 8, tw, 0x9a8a68);
  for (let x = 2; x < tw; x += 8) { p.rect(x, 2, 4, 4, 0xe8dcc0); p.set(x + 1, 3, 0xb8a880); }
  for (let x = 8; x < tw - 8; x += 24) {
    // pilaster with capital, tall arched window between
    p.rect(x, 20, 12, 112, 0xc8b890);
    p.vline(x + 1, 20, 112, 0xe0d4b4); p.vline(x + 10, 20, 112, 0xa89870);
    p.rect(x - 2, 16, 16, 5, 0xe0d4b4);
    drawWindow(p, x + 2, 28, 8, 44, { frame: 0x2b2b30, t: rng.next() * 0.4, rail: false, panes: '1/1' }, rng);
  }
  const gy = th - 68;
  p.rect(0, gy, tw, 68, 0x5a1f1f);
  p.hline(0, gy, tw, 0x8a3a2a);
  for (let x = 12; x < tw - 24; x += 28) {
    p.rect(x, gy + 24, 20, 44, 0xd8b04a);
    p.rect(x + 2, gy + 26, 16, 42, 0x40576d, winCode(0.02));
    p.vline(x + 10, gy + 26, 42, 0xd8b04a);
    p.rect(x + 7, gy + 44, 2, 6, 0xf0d070); p.rect(x + 11, gy + 44, 2, 6, 0xf0d070);
  }
  // poster cases
  for (const x of [2, tw - 10]) { p.rect(x, gy + 24, 8, 30, 0xd8b04a); p.rect(x + 1, gy + 25, 6, 28, 0xf2e6c0, winCode(0.02, true)); p.rect(x + 2, gy + 28, 4, 10, 0xc8302c, winCode(0.02, true)); }
  const aabb = mb.body(() => fr.box(mb, a0, a0 + W, 0, D, CURB, CURB + H, { front, back: S.brickBrown, left: S.brickBrown, right: S.brickBrown, top: { t: S.roofTar, world: true } }));
  markHeight(C.world, ...aabb, CURB + H);
  // marquee with chasing bulbs
  const mw = Math.round((W - 1) * T);
  const MH = 28;
  const marq = C.atlas.alloc(mw, MH);
  const q = marq.p;
  q.rect(0, 0, mw, MH, 0xf2efe6);
  q.rect(0, 0, mw, 3, 0x2a2a2e); q.rect(0, MH - 3, mw, 3, 0x2a2a2e);
  const bulb = winCode(0.0, true);
  for (let x = 1; x < mw; x += 3) { q.set(x, 1, 0xffe27a, bulb); q.set(x, MH - 2, 0xffe27a, bulb); }
  const [l1, l2] = name === 'APOLLO' ? ['AMATEUR NIGHT', 'WEDNESDAYS'] : ['NOW SHOWING', 'PIXEL CITY 3'];
  q.text7(Math.floor((mw - textWidth(l1, 1, true)) / 2), 5, l1, 0x1b1b1b, bulb);
  q.text7(Math.floor((mw - textWidth(l2, 1, true)) / 2), 15, l2, 0xc8302c, bulb);
  fr.box(mb, a0 + 0.5, a0 + W - 0.5, -1.4, 0, CURB + 2.2, CURB + 3.1, { front: marq, left: S.darkMetal, right: S.darkMetal, top: { t: S.darkMetal } });
  // vertical sign
  const vt = C.atlas.alloc(32, 144);
  vt.p.rect(0, 0, 32, 144, 0xc8302c);
  for (let y = 0; y < 144; y += 3) { vt.p.set(1, y, 0xffe27a, winCode(0.0, true)); vt.p.set(30, y, 0xffe27a, winCode(0.0, true)); }
  vt.p.frame(3, 3, 26, 138, 0x8a1a18);
  name.split('').forEach((ch, i) => vt.p.text7(9, 6 + i * 23, ch, name === 'APOLLO' ? 0xffe27a : 0xffffff, winCode(0.0, true), 3));
  fr.sideQuad(mb, a0 + 1, -0.15, -1.15, CURB + 3.4, CURB + 3.4 + 4.5, vt, { mat: MAT.NOSHADOW });
  fr.sideQuad(mb, a0 + 1.01, -1.15, -0.15, CURB + 3.4, CURB + 3.4 + 4.5, vt, { mat: MAT.NOSHADOW });
  const lp = fr.pt(a0 + W / 2, -1.5);
  C.world.lamps.push({ x: lp[0], y: lp[1], z: 0.5, r: 3.4, color: [1, 0.85, 0.5], k: 0.9, kind: 'marquee' });
  C.world.marquees.push({ x: lp[0], y: lp[1] });
  C.world.shops.push({ kind: 'theater', name, x: lp[0], y: lp[1], n: fr.n });
}

function loftBlock(C, L) {
  const { rng } = C;
  const F = frames(L);
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'patio');
  for (const side of ['N', 'S']) {
    const fr = F[side];
    let a = 0;
    for (const w of [6, 6, 6]) {
      loft(C, fr, a, w, 8, { floors: rng.int(5, 7) });
      a += w;
    }
  }
  for (const side of ['E', 'W']) gardenWall(C, F[side], 8, 10, 0, CURB, 1.6, 'brick');
  // construction scaffolding on one facade
  scaffolding(C, F.S, 6.2, 11.8);
}

// ---------------------------------------------------------------------------
function courtBlock(C, L) {
  const { rng } = C;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'asphaltPlay');
  // court
  const cx0 = L.x0 + 2, cx1 = L.x1 - 2, cy0 = L.y0 + 1.5, cy1 = L.y0 + 9.5;
  C.paintGround(cx0, cy0, cx1, cy1, 'court');
  const ccx = (cx0 + cx1) / 2, ccy = (cy0 + cy1) / 2;
  // keys
  C.paintGround(cx0, ccy - 1.25, cx0 + 3, ccy + 1.25, 'courtKey');
  C.paintGround(cx1 - 3, ccy - 1.25, cx1, ccy + 1.25, 'courtKey');
  courtLines(C, cx0, cy0, cx1, cy1);
  // fence
  const fx0 = cx0 - 0.75, fx1 = cx1 + 0.75, fy0 = cy0 - 0.75, fy1 = cy1 + 0.75;
  chainFence(C, fx0, fy0, fx1, fy0, 2.6);
  chainFence(C, fx0, fy0, fx0, fy1, 2.6);
  chainFence(C, fx1, fy1, fx1, fy0, 2.6);
  chainFence(C, fx0, fy1, ccx - 1, fy1, 2.6);
  chainFence(C, ccx + 1, fy1, fx1, fy1, 2.6);
  // hoops
  hoop(C, cx0 + 0.3, ccy, 1, 0);
  hoop(C, cx1 - 0.3, ccy, -1, 0);
  C.world.court = { x0: cx0, y0: cy0, x1: cx1, y1: cy1, gate: { x: ccx, y: fy1 + 0.6 } };
  // court lights
  for (const [x, y] of [[fx0 + 0.2, fy1 - 0.2], [fx1 - 0.2, fy0 + 0.2], [fx0 + 0.2, fy0 + 0.2], [fx1 - 0.2, fy1 - 0.2]]) {
    const P = propTex(C);
    C.mb.box(x - 0.07, y - 0.07, CURB, x + 0.07, y + 0.07, CURB + 4.6, sideFaces(P.silver, P.silver));
    C.mb.box(x - 0.3, y - 0.3, CURB + 4.6, x + 0.3, y + 0.3, CURB + 4.85, sideFaces(P.lampHead, P.silver));
    C.world.lamps.push({ x: x + (ccx - x) * 0.25, y: y + (ccy - y) * 0.25, z: CURB + 4.5, r: 6, color: [0.95, 0.97, 1.0], k: 0.9, kind: 'flood' });
    C.world.lampHeads.push({ x, y, z: CURB + 4.6, kind: 'flood' });
  }
  // bleachers along the north fence outside? inside along south
  bleachers(C, cx0 + 1.5, cy1 + 1.0, cx0 + 5, cy1 + 2.4, 'x', 3);
  C.world.courtSeats = [];
  for (let k = 0; k < 6; k++) C.world.courtSeats.push({ x: cx0 + 1.8 + (k % 3) * 1.1, y: cy1 + 1.25 + Math.floor(k / 3) * 0.45, z: CURB + 0.3 + Math.floor(k / 3) * 0.3 });
  // handball wall
  handballWall(C, L.x0 + 1.5, L.y1 - 4.2, L.x0 + 8, L.y1 - 3.8, 2.4);
  C.world.handball = { x: L.x0 + 4.75, y: L.y1 - 2.8 };
  // playground
  playground(C, L.x0 + 9.5, L.y1 - 6.8, L.x1 - 1, L.y1 - 1);
  // sprinkler spray (summer)
  C.world.sprinklers.push({ x: L.x0 + 13.5, y: L.y1 - 3.6 });
  C.paintGround(L.x0 + 12.5, L.y1 - 4.6, L.x0 + 14.5, L.y1 - 2.6, 'asphaltPlay');
  // perimeter iron fence + trees + benches
  for (const [x, y] of [[L.x0 + 0.8, L.y1 - 1.0], [L.x0 + 3.5, L.y1 - 1.0], [L.x0 + 6.5, L.y1 - 1.0]]) C.addTree(x, y, rng.pick(['plane', 'oak']), false);
  C.addBench(L.x0 + 4.8, L.y1 - 2.0, 'x', -1);
  C.addBench(L.x1 - 1.0, cy1 + 3.0, 'y', -1);
  parkLamp(C, L.x0 + 9, L.y1 - 2.2);
  trashBasket(C, L.x0 + 9.5, L.y1 - 0.6);
  C.world.playground = { x0: L.x0 + 9.5, y0: L.y1 - 6.8, x1: L.x1 - 1, y1: L.y1 - 1 };
}

function courtLines(C, x0, y0, x1, y1) {
  const g = C.world.ground.p;
  const X0 = Math.round(x0 * T), X1 = Math.round(x1 * T), Y0 = Math.round(y0 * T), Y1 = Math.round(y1 * T);
  const line = (x, y) => g.set(x, y, 0xf2f2ee, GC.COURT_LINE);
  const k = T / 16;
  for (let x = X0; x < X1; x++) for (let w = 0; w < 3; w++) { line(x, Y0 + w); line(x, Y1 - 1 - w); }
  for (let y = Y0; y < Y1; y++) for (let w = 0; w < 3; w++) { line(X0 + w, y); line(X1 - 1 - w, y); }
  const mx = Math.round((X0 + X1) / 2), my = Math.round((Y0 + Y1) / 2);
  for (let y = Y0; y < Y1; y++) { line(mx, y); line(mx - 1, y); line(mx + 1, y); }
  g.ring(mx, my, 15 * k, 15 * k, 3, 0xf2f2ee, GC.COURT_LINE);
  // three point arcs + key outlines
  for (const [ex, dir] of [[X0, 1], [X1, -1]]) {
    const bx = ex + dir * 14 * k;
    const R = 58 * k;
    for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.004) {
      const px = Math.round(bx + dir * Math.cos(a) * R), py = Math.round(my + Math.sin(a) * R);
      if (py > Y0 + 6 * k && py < Y1 - 6 * k) { line(px, py); line(px + dir, py); line(px + 2 * dir, py); }
    }
    for (const sy of [my - 54 * k, my + 54 * k]) for (let x = Math.min(ex, bx); x <= Math.max(ex, bx); x++) { line(x, sy); line(x, sy + 1); line(x, sy + 2); }
    const kx = ex + dir * 48 * k;
    for (let y = my - 20 * k; y <= my + 20 * k; y++) { line(kx, y); line(kx + dir, y); line(kx + 2 * dir, y); }
    for (let x = Math.min(ex, kx); x <= Math.max(ex, kx); x++) for (let w = 0; w < 3; w++) { line(x, my - 20 * k + w); line(x, my + 20 * k - w); }
    g.ring(kx, my, 16 * k, 16 * k, 3, 0xf2f2ee, GC.COURT_LINE);
    // lane hash marks
    for (const d of [18, 26, 34]) for (const sy of [my - 20 * k - 4, my + 20 * k + 1]) for (let w = 0; w < 3; w++) for (let t = 0; t < 3; t++) line(ex + dir * (d * k + w), sy + t);
  }
}

// ---------------------------------------------------------------------------
function parkBlock(C, L) {
  const { rng } = C;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'grass');
  // paths: perimeter + diagonals + cross
  const pw = 1.4;
  C.paintGround(L.x0 + 0.6, L.y0 + 0.6, L.x1 - 0.6, L.y0 + 0.6 + pw, 'path');
  C.paintGround(L.x0 + 0.6, L.y1 - 0.6 - pw, L.x1 - 0.6, L.y1 - 0.6, 'path');
  C.paintGround(L.x0 + 0.6, L.y0 + 0.6, L.x0 + 0.6 + pw, L.y1 - 0.6, 'path');
  C.paintGround(L.x1 - 0.6 - pw, L.y0 + 0.6, L.x1 - 0.6, L.y1 - 0.6, 'path');
  C.paintGround(cx - pw / 2, L.y0, cx + pw / 2, L.y1, 'path');
  C.paintGround(L.x0, cy - pw / 2, L.x1, cy + pw / 2, 'path');
  // diagonal paths
  for (let t = 0; t <= 1; t += 0.004) {
    for (const [ax, ay, bx, by] of [[L.x0 + 1, L.y0 + 1, cx, cy], [L.x1 - 1, L.y1 - 1, cx, cy], [L.x1 - 1, L.y0 + 1, cx, cy], [L.x0 + 1, L.y1 - 1, cx, cy]]) {
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      C.paintGround(x - 0.55, y - 0.55, x + 0.55, y + 0.55, 'path');
    }
  }
  // central plaza + fountain
  circleGround(C, cx, cy, 3.2, 'plaza');
  circleGround(C, cx, cy, 2.1, 'water');
  ringWall(C, cx, cy, 2.1, 0.25, 0.5);
  // fountain centre column
  const S = sharedTex(C);
  C.mb.cylinder(cx, cy, CURB, CURB + 0.9, 0.35, 8, S.limestone, S.limeTop);
  C.mb.cylinder(cx, cy, CURB + 0.9, CURB + 1.0, 0.7, 8, S.limestone, S.limeTop);
  C.world.fountains.push({ x: cx, y: cy, z: CURB + 1.0, kind: 'center', r: 2.1 });
  C.world.parkCenter = { x: cx, y: cy };
  // benches around the fountain plaza
  for (let k = 0; k < 8; k++) {
    if (k % 2 === 0) continue;
    const a = (k / 8) * Math.PI * 2;
    const bx = cx + Math.cos(a) * 3.0, by = cy + Math.sin(a) * 3.0;
    C.addBench(bx, by, Math.abs(Math.cos(a)) > 0.7 ? 'y' : 'x', Math.cos(a) > 0.3 || Math.sin(a) > 0.3 ? 1 : -1);
  }
  // pond (NE quadrant) – ice rink in winter
  const px = L.x1 - 4.6, py = L.y0 + 4.6;
  ellipseGround(C, px, py, 2.9, 2.3, 'sand');
  ellipseGround(C, px, py, 2.6, 2.0, 'water');
  C.world.pond = { x: px, y: py, rx: 2.4, ry: 1.8 };
  // dog run (SE quadrant)
  const dx0 = L.x1 - 7.2, dy0 = L.y1 - 7.2, dx1 = L.x1 - 2.4, dy1 = L.y1 - 2.4;
  C.paintGround(dx0, dy0, dx1, dy1, 'gravel');
  chainFence(C, dx0, dy0, dx1, dy0, 1.1, true);
  chainFence(C, dx0, dy0, dx0, dy1, 1.1, true);
  chainFence(C, dx1, dy1, dx1, dy0, 1.1, true);
  chainFence(C, dx0, dy1, dx0 + 2, dy1, 1.1, true);
  chainFence(C, dx0 + 3, dy1, dx1, dy1, 1.1, true);
  C.world.dogRun = { x0: dx0, y0: dy0, x1: dx1, y1: dy1, gate: { x: dx0 + 2.5, y: dy1 + 0.5 } };
  // statue (SW quadrant) on pedestal with flowerbeds
  const sx = L.x0 + 4.6, sy = L.y1 - 4.6;
  circleGround(C, sx, sy, 1.9, 'flowerbed');
  C.mb.box(sx - 0.55, sy - 0.55, CURB, sx + 0.55, sy + 0.55, CURB + 1.3, sideFaces(S.greystone, { t: S.limeTop }));
  C.addSprite('statue', sx, sy, CURB + 1.3);
  // picnic lawn (NW) cherry trees
  // trees on lawns (avoid paths)
  const treeSpots = [
    [L.x0 + 3.4, L.y0 + 4.2, 'cherry'], [L.x0 + 5.8, L.y0 + 3.0, 'cherry'], [L.x0 + 3.0, L.y0 + 6.6, 'oak'],
    [L.x0 + 6.6, L.y0 + 6.4, 'elm'], [L.x1 - 7.2, L.y0 + 3.0, 'plane'], [L.x1 - 3.0, L.y0 + 7.6, 'elm'],
    [L.x1 - 7.8, L.y0 + 6.8, 'oak'], [L.x0 + 3.0, L.y1 - 7.8, 'plane'], [L.x0 + 7.0, L.y1 - 3.0, 'oak'],
    [L.x0 + 7.4, L.y1 - 7.0, 'cherry'], [L.x1 - 1.6, L.y1 - 9.6, 'pine'], [L.x0 + 1.7, L.y0 + 9.6 - 3, 'pine'],
    [L.x1 - 3.2, L.y1 - 1.4, 'locust'], [L.x0 + 9.6 + 2.2, L.y0 + 2.6, 'elm'],
  ];
  for (const [x, y, sp] of treeSpots) C.addTree(x, y, sp, false, { scale: rng.range(1.0, 1.25) });
  C.world.picnic = { x: L.x0 + 5, y: L.y0 + 5, r: 1.8 };
  C.world.lawns = [
    { x0: L.x0 + 2.2, y0: L.y0 + 2.2, x1: cx - 1.6, y1: cy - 1.6 },
    { x0: cx + 1.6, y0: cy + 1.6, x1: L.x1 - 7.6, y1: L.y1 - 2.2 },
    { x0: L.x0 + 2.2, y0: cy + 1.6, x1: cx - 1.6, y1: L.y1 - 2.2 },
  ];
  // low stone wall with entrances
  const w = 0.25;
  const gaps = (a0, a1, mid) => [[a0, mid - 1.2], [mid + 1.2, a1]];
  for (const [a, b] of gaps(L.x0 + 1.4, L.x1 - 1.4, cx)) {
    parkWall(C, a, L.y0, b, L.y0 + w);
    parkWall(C, a, L.y1 - w, b, L.y1);
  }
  for (const [a, b] of gaps(L.y0 + 1.4, L.y1 - 1.4, cy)) {
    parkWall(C, L.x0, a, L.x0 + w, b);
    parkWall(C, L.x1 - w, a, L.x1, b);
  }
  // lamps along paths
  for (const [x, y] of [[cx - 1.3, L.y0 + 2.6], [cx + 1.3, L.y1 - 2.6], [L.x0 + 2.6, cy + 1.3], [L.x1 - 2.6, cy - 1.3],
    [cx - 3.6, cy - 3.6], [cx + 3.6, cy + 3.6], [cx + 3.6, cy - 3.6], [cx - 3.6, cy + 3.6]]) parkLamp(C, x, y);
  // benches along paths
  C.addBench(L.x0 + 2.4, cy + 2.2, 'y', 1);
  C.addBench(L.x0 + 2.4, cy - 2.4, 'y', 1);
  C.addBench(cx + 2.4, L.y0 + 2.5, 'x', 1);
  C.addBench(cx - 2.6, L.y1 - 2.5, 'x', -1);
  C.addBench(L.x1 - 2.4, cy + 2.4, 'y', -1);
  trashBasket(C, cx + 1.2, L.y0 + 2.6);
  trashBasket(C, L.x0 + 2.6, cy - 1.2);
  // hot dog cart near the SW entrance (on the sidewalk)
  C.world.carts.push({ x: L.x0 - 0.9, y: cy + 3, kind: 'hotdog', axis: 'y' });
  C.world.park = { ...L, cx, cy };
}

function circleGround(C, cx, cy, r, kind) {
  const g = C.world.ground.p;
  for (let y = Math.floor((cy - r) * T); y < Math.ceil((cy + r) * T); y++)
    for (let x = Math.floor((cx - r) * T); x < Math.ceil((cx + r) * T); x++) {
      const dx = (x + 0.5) / T - cx, dy = (y + 0.5) / T - cy;
      if (dx * dx + dy * dy <= r * r) {
        const f = groundFill(kind, x, y, 0, 0, 1e9, 1e9);
        if (f) g.set(x, y, f[0], f[1]);
      }
    }
}
function ellipseGround(C, cx, cy, rx, ry, kind) {
  const g = C.world.ground.p;
  for (let y = Math.floor((cy - ry) * T); y < Math.ceil((cy + ry) * T); y++)
    for (let x = Math.floor((cx - rx) * T); x < Math.ceil((cx + rx) * T); x++) {
      const dx = ((x + 0.5) / T - cx) / rx, dy = ((y + 0.5) / T - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        const f = groundFill(kind, x, y, 0, 0, 1e9, 1e9);
        if (f) g.set(x, y, f[0], f[1]);
      }
    }
}
function ringWall(C, cx, cy, r, w, h) {
  const S = sharedTex(C);
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const x = cx + Math.cos(am) * r, y = cy + Math.sin(am) * r;
    const half = Math.PI * r / n + 0.02;
    const tx = -Math.sin(am), ty = Math.cos(am);
    const ex = Math.abs(tx) * half + Math.abs(Math.cos(am)) * w / 2;
    const ey = Math.abs(ty) * half + Math.abs(Math.sin(am)) * w / 2;
    C.mb.box(x - ex, y - ey, CURB, x + ex, y + ey, CURB + h, sideFaces(S.limestone, { t: S.limeTop }));
  }
}

// ---------------------------------------------------------------------------
const NOSUBWAY = new Set(['riverside', 'grantstomb', 'soldiers', 'inwoodhill', 'cloisters', 'gwb', 'highbridge', 'bridge', 'qbridge', 'wbridge', 'mbridge', 'tbridge', 'battery', 'memorial']);
// Street furniture along every sidewalk + signals at every intersection
function streetFurniture(C) {
  const { rng } = C;
  const W = C.world;
  // signals (none inside the park; T-junctions at its edge lose the heads facing the park)
  for (let i = 0; i <= NBX; i++)
    for (let j = 0; j <= NBY; j++) {
      if (isParkIntersection(i, j)) continue;
      const rx = roadCenter(i), ry = roadCenter(j);
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) signalPole(C, rx + sx * 2.85, ry + sy * 2.85, sx, sy, i, j, { closedX: !legOpen(i, j, sx, 0), closedY: !legOpen(i, j, 0, sy) });
    }
  // per block-side furniture
  for (let by = 0; by < NBY; by++)
    for (let bx = 0; bx < NBX; bx++) {
      if (blockInPark(bx, by) || !isManhattan(bx, by)) continue;
      const type = BLOCK_TYPES[by][bx];
      const L = blockRect(bx, by);
      const residential = ['brownstones', 'walkups', 'tenements', 'bodega', 'firehouse', 'commercial', 'lofts', 'redbrick', 'shops'].includes(type);
      // sides: [x0,y0,x1,y1 of the curb line], normal toward road
      const sides = [
        { ax: 'x', y: L.y0 - 2 + 0.35, x0: L.x0, x1: L.x1, ny: -1, nx: 0, name: 'N' },
        { ax: 'x', y: L.y1 + 2 - 0.35, x0: L.x0, x1: L.x1, ny: 1, nx: 0, name: 'S' },
        { ax: 'y', x: L.x0 - 2 + 0.35, y0: L.y0, y1: L.y1, nx: -1, ny: 0, name: 'W' },
        { ax: 'y', x: L.x1 + 2 - 0.35, y0: L.y0, y1: L.y1, nx: 1, ny: 0, name: 'E' },
      ];
      for (const s of sides) {
        const at = (t, off = 0) => (s.ax === 'x' ? [s.x0 + t, s.y - s.ny * off] : [s.x - s.nx * off, s.y0 + t]);
        const used = []; // [t, half-length] taken along this side
        // street lamps (with shopping-district banners on shopping blocks)
        for (const t of [5, 13]) {
          const [x, y] = at(t);
          streetLamp(C, x, y, s.nx, s.ny);
          if (type === 'shops') lampBanner(C, x, y, s.nx, s.ny, bx * 3 + by);
        }
        // trees
        const treeTs = residential ? [2.6, 7.6, 10.4, 15.4] : type === 'park' ? [3, 9, 15] : type === 'court' ? [3.0, 15.0] : [3.2, 14.8];
        for (const t of treeTs) {
          if (rng.chance(residential ? 0.9 : 0.8)) {
            const [x, y] = at(t, 0.35);
            if (W.canopies.some((c) => Math.hypot(c.x - x, c.y - y) < 1.1)) continue;
            C.addTree(x, y, residential ? rng.pick(['plane', 'locust', 'plane', 'oak']) : 'plane', true);
            used.push([t, 0.5]); // tree pit
          }
        }
        // hydrant
        {
          const t = rng.range(8.2, 9.6);
          const [x, y] = at(t, 0.0);
          hydrant(C, x, y);
        }
        // trash baskets near corners
        {
          const [x, y] = at(0.8, -0.05);
          if (rng.chance(0.7)) trashBasket(C, x, y);
        }
        if (rng.chance(0.35)) {
          const [x, y] = at(17.0, 0.1);
          mailbox(C, x, y);
          used.push([17.0, 0.4]);
        } else if (rng.chance(0.35)) {
          const [x, y] = at(16.6, 0.1);
          newsBoxes(C, x, y, s.ax);
          used.push([17.0, 0.7]);
        }
        if (!residential && rng.chance(0.5)) {
          const [x, y] = at(11.2, 0.0);
          kiosk(C, x, y);
        }
        // a steaming vent grate in the pavement on some sides
        if (rng.chance(0.42)) sidewalkGrate(C, s, at, used, rng);
      }
    }
  // sandwich boards outside some of the shopping streets' stores
  for (const sh of W.shops) {
    const bx = Math.floor((sh.x - 9) / PERIOD + 0.5), by = Math.floor((sh.y - 9) / PERIOD + 0.5);
    const near = [[bx, by], [bx - 1, by], [bx, by - 1], [bx - 1, by - 1]].some(([i, j]) => i >= 0 && j >= 0 && i < NBX && j < NBY && BLOCK_TYPES[j][i] === 'shops' && Math.abs(sh.x - (lotStart(i) + 9)) < 11.5 && Math.abs(sh.y - (lotStart(j) + 9)) < 11.5);
    if (!near || !SHOPPING.includes(sh.kind) || !rng.chance(0.45) || !sh.n) continue;
    sandwichBoard(C, sh.x - sh.n[0] * 0.15, sh.y - sh.n[1] * 0.15, sh.n[0], sh.n[1], rng);
  }
  // the sidewalks round the park
  const PR = parkRect();
  const pcx = (PR.x0 + PR.x1) / 2, pcy = (PR.y0 + PR.y1) / 2;
  // bus shelters on the loop round the park (eastbound on its north side, southbound on its east side)
  busShelter(C, PR.x0 + 9, PR.y0 - 2 + 0.8, 'x', -1);
  busShelter(C, PR.x1 + 2 - 0.8, PR.y0 + 9, 'y', 1);
  W.busRoute = true;
  // subway entrance by the park's west gate, food carts at its gates
  subwayEntrance(C, PR.x0 - 1.0, pcy - 7.5, 'y');
  W.carts.push({ x: PR.x1 + 1.1, y: pcy + 4.0, kind: 'pretzel', axis: 'y' });
  W.carts.push({ x: pcx - 4.2, y: PR.y1 + 1.1, kind: 'hotdog', axis: 'x' });
  parkSidewalks(C, PR, [[PR.x0 + 9, PR.y0 - 1], [PR.x1 + 1, PR.y0 + 9], [PR.x0 - 1, pcy - 7.5], [PR.x1 + 1, pcy + 4.0], [pcx - 4.2, PR.y1 + 1]]);
  // subway stations every couple of blocks (on a sidewalk of an ordinary block)
  const plain = (bx, by) => isManhattan(bx, by) && !blockInPark(bx, by) && !NOSUBWAY.has(BLOCK_TYPES[by][bx]);
  for (let by = 0; by < NBY; by += 2)
    for (let bx = (by / 2) % 2; bx < NBX - 1; bx += 2) {
      if (!plain(bx, by)) continue;
      if ((bx + by) % 4 === 0) subwayEntrance(C, lotStart(bx) + 13, lotEnd(by) + 1.0, 'x');
      else subwayEntrance(C, lotEnd(bx) + 1.0, lotStart(by) + 5, 'y');
    }
  // food carts on busy corners
  const kinds = ['halal', 'hotdog', 'pretzel', 'halal', 'hotdog'];
  let ck = 0;
  for (let by = 1; by < NBY; by += 3)
    for (let bx = 1; bx < NBX - 1; bx += 3) if (plain(bx, by)) W.carts.push({ x: lotStart(bx) + 14, y: lotEnd(by) + 1.3, kind: kinds[ck++ % kinds.length], axis: 'x' });
  // food cart geometry
  for (const c of W.carts) buildCart(C, c);
  // manhole steam sources
  for (const m of W.groundInfo.manholes) if (rng.chance(0.35)) W.steam.push({ x: m.x, y: m.y, z: 0.02, kind: 'manhole', rate: 0.4 });
  void PERIOD; void MAPX; void MAPY; void GRP; void smoothFill; void drawDoor; void signBoard;
}

// A pair of vertical banners hanging from a lamp post, the district's colour
function lampBanner(C, x, y, nx, ny, k) {
  const cols = [0x8a2a8a, 0x1f8a8a, 0xd8302c, 0x2a5fb8, 0xe88a1a];
  const col = cols[k % cols.length];
  const tex = C.atlas.shared(`banner_${col}`, 12, 30, (p) => {
    p.rect(0, 0, 12, 30, col); p.rect(0, 0, 12, 2, 0x2a2a2e); p.vline(0, 2, 28, shade(col, 1.2)); p.vline(11, 2, 28, shade(col, 0.75));
    // a shopping bag motif
    p.rect(3, 12, 6, 7, 0xf2efe6); p.frame(4, 9, 4, 4, 0xf2efe6); p.rect(3, 22, 6, 2, 0xf2c230);
    for (let yy = 26; yy < 30; yy++) p.set(yy % 2 ? 4 : 7, yy, 0xf2c230);
  });
  tex.cast = 'none';
  // hang along the kerb, either side of the pole
  const ux = ny, uy = -nx;
  for (const sgn of [-1, 1]) {
    const x0 = x + ux * 0.08 * sgn, y0 = y + uy * 0.08 * sgn;
    C.mb.vquad(x0, y0, x0 + ux * 0.375 * sgn, y0 + uy * 0.375 * sgn, CURB + 2.55, CURB + 2.55 + 30 / T, tex, { mat: MAT.FLAT });
  }
}

// Sandwich-board sign on the sidewalk in front of a shop
function sandwichBoard(C, x, y, nx, ny, rng) {
  const word = rng.pick(['SALE', 'OPEN', 'NEW', '50% OFF', 'HELLO']);
  const tex = C.atlas.shared(`board_${word}`, 16, 20, (p) => {
    p.rect(0, 0, 16, 20, 0x2a2a2e); p.rect(1, 1, 14, 18, 0x1e3a2a);
    const w = Math.min(14, word.length * 4);
    p.text(Math.max(1, Math.floor((16 - w) / 2)), 4, word.slice(0, 3), 0xf2efe6);
    if (word.length > 3) p.text(2, 11, word.slice(3).trim().slice(0, 3), 0xf2c230);
    p.hline(2, 17, 12, 0xf2c230);
  });
  tex.cast = 'none';
  const ux = ny, uy = -nx, h = 20 / T, w = 16 / T, lean = 0.12;
  const ax = x - ux * w / 2, ay = y - uy * w / 2, bx = x + ux * w / 2, by = y + uy * w / 2;
  // two leaning panels meeting at the top
  C.mb.quad([ax, ay, CURB + h], [bx, by, CURB + h], [bx + nx * lean, by + ny * lean, CURB], [ax + nx * lean, ay + ny * lean, CURB],
    [[0, 0], [16, 0], [16, 20], [0, 20]], tex, [nx, ny, 0.3], 0);
  C.mb.quad([bx, by, CURB + h], [ax, ay, CURB + h], [ax - nx * lean, ay - ny * lean, CURB], [bx - nx * lean, by - ny * lean, CURB],
    [[0, 0], [16, 0], [16, 20], [0, 20]], tex, [-nx, -ny, 0.3], 0);
}

// Try to fit a vent grate on a sidewalk side, clear of the furniture along it and of shelters,
// subway stairs, carts and benches. The grate sits under the walking line, ~1 unit from the kerb.
function sidewalkGrate(C, s, at, used, rng, tMax = 18) {
  const W = C.world;
  const len = rng.range(1.5, 2.1), half = len / 2;
  const others = [...W.busStops.map((b) => [b.x, b.y, 2.0]), ...W.subways.map((b) => [b.x, b.y, 2.2]), ...W.carts.map((c) => [c.x, c.y, 1.4]), ...W.benches.map((b) => [b.x, b.y, 1.2]), ...W.grates.map((g) => [g.x, g.y, 2.5])];
  const t0 = rng.range(1.6, tMax - 1.6);
  for (let k = 0; k < (tMax - 3) * 2; k++) {
    const t = 1.5 + ((t0 - 1.5 + k * 0.5) % (tMax - 3));
    if (t - half < 0.6 || t + half > tMax - 0.6) continue;
    if (used.some(([u, r]) => Math.abs(u - t) < half + r + 0.12)) continue;
    const [x, y] = at(t, 0.65);
    if (others.some(([ox, oy, r]) => Math.hypot(ox - x, oy - y) < r + half)) continue;
    steamGrate(C, x, y, s.ax, len);
    used.push([t, half]);
    return true;
  }
  return false;
}

// Furniture on the sidewalks round the park: lamps and trees at the curb, benches along the wall
function parkSidewalks(C, PR, avoid) {
  const { rng } = C;
  const len = PR.x1 - PR.x0;
  const sides = [
    { ax: 'x', y: PR.y0 - 2 + 0.35, x0: PR.x0, ny: -1, nx: 0, wall: PR.y0 },
    { ax: 'x', y: PR.y1 + 2 - 0.35, x0: PR.x0, ny: 1, nx: 0, wall: PR.y1 },
    { ax: 'y', x: PR.x0 - 2 + 0.35, y0: PR.y0, nx: -1, ny: 0, wall: PR.x0 },
    { ax: 'y', x: PR.x1 + 2 - 0.35, y0: PR.y0, nx: 1, ny: 0, wall: PR.x1 },
  ];
  for (const s of sides) {
    const at = (t, off = 0) => (s.ax === 'x' ? [s.x0 + t, s.y - s.ny * off] : [s.x - s.nx * off, s.y0 + t]);
    const free = (t, r) => { const [x, y] = at(t); return avoid.every(([ax, ay]) => Math.hypot(ax - x, ay - y) > r); };
    for (const t of [4.5, 13.5, 22.5 + 4.2, 31.5, 40.5]) if (free(t, 2.0)) { const [x, y] = at(t); streetLamp(C, x, y, s.nx, s.ny); }
    for (const t of [1.8, 9.0, 18.0, 22.5, 27.0 + 4.2, 36.0, 43.2]) {
      if (!free(t, 2.0) || !rng.chance(0.92)) continue;
      const [x, y] = at(t, 0.35);
      C.addTree(x, y, rng.pick(['plane', 'plane', 'locust', 'oak']), true);
    }
    const ht = rng.pick([11.2, 33.8]);
    { const [x, y] = at(ht); hydrant(C, x, y); }
    {
      // tree pits and the wall-side benches along this side
      const used = [...[1.8, 9.0, 18.0, 22.5, 31.2, 36.0, 43.2].map((t) => [t, 0.5]), ...[6.6, 15.6, 29.4, 38.4].map((t) => [t, 0.8])];
      for (let k = 0; k < 2; k++) sidewalkGrate(C, s, at, used, rng, len);
    }
    for (const t of [0.8, 44.2]) { const [x, y] = at(t, -0.05); if (rng.chance(0.8)) trashBasket(C, x, y); }
    // benches against the wall facing the street, Fifth Avenue style
    for (const t of [6.6, 15.6, 29.4, 38.4]) {
      if (!free(t, 2.4)) continue;
      const d = 0.42;
      if (s.ax === 'x') C.addBench(s.x0 + t, s.wall + (s.ny < 0 ? -d : d), 'x', s.ny);
      else C.addBench(s.wall + (s.nx < 0 ? -d : d), s.y0 + t, 'y', s.nx);
    }
    void len;
  }
}

function buildCart(C, c) {
  const P = propTex(C);
  const A = C.atlas;
  // cart faces the street (normal toward road)
  const n = cartNormal(c);
  c.nx = n[0]; c.ny = n[1];
  const along = c.axis === 'x' ? [1, 0] : [0, 1];
  const L = 1.3, D = 0.7, H = 0.95;
  const cx = c.x, cy = c.y;
  const x0 = cx - (along[0] * L + Math.abs(n[0]) * D) / 2, x1 = cx + (along[0] * L + Math.abs(n[0]) * D) / 2;
  const y0 = cy - (along[1] * L + Math.abs(n[1]) * D) / 2, y1 = cy + (along[1] * L + Math.abs(n[1]) * D) / 2;
  const sideFor = (len) => A.shared(`cart_side_${c.kind}_${len}`, len, 24, (p) => {
    const steel = 0xc8ccd2;
    for (let y = 0; y < 24; y++) for (let x = 0; x < len; x++) p.set(x, y, (x + y) % 7 === 0 ? 0xdde0e4 : x % 16 === 0 ? 0xa8acb2 : steel);
    const [bg, fg, word] = c.kind === 'halal' ? [0xc8302c, 0xf2c230, 'HALAL'] : c.kind === 'pretzel' ? [0x1f4fa0, 0xf2c230, 'PRETZEL'] : [0xf2c230, 0xc8302c, 'HOT DOG'];
    p.rect(0, 3, len, 11, bg);
    p.hline(0, 3, len, shade(bg, 1.2));
    p.hline(0, 13, len, shade(bg, 0.7));
    const tw = textWidth(word, 1, true);
    if (tw <= len - 1) p.text7(Math.floor((len - tw) / 2), 5, word, fg, 255);
    else {
      // icon instead of lettering on the short ends
      const cx = len >> 1;
      if (c.kind === 'hotdog') { p.ellipse(cx, 8, 7, 3, 0xd8a050); p.rect(cx - 7, 7, 14, 2, 0xb8502a); p.hline(cx - 5, 7, 10, 0xf2c230); }
      else if (c.kind === 'pretzel') { p.ring(cx - 2, 8, 3.5, 3.5, 1.4, 0x8a4a1a); p.ring(cx + 2, 8, 3.5, 3.5, 1.4, 0x8a4a1a); p.set(cx - 2, 7, 0xf2f2ee); p.set(cx + 3, 9, 0xf2f2ee); }
      else { p.ellipse(cx, 9, 7, 3, 0xf2f2ee); p.ellipse(cx - 2, 8, 3, 1.6, 0x9a5a2a); p.ellipse(cx + 3, 9, 2.5, 1.4, 0xf2e8b0); }
    }
    for (let k = 0; k * 14 + 4 < len - 8; k++) { p.rect(4 + k * 14, 16, 10, 5, [0xd89a50, 0xe8d8b0, 0x8a4a2a][k % 3]); p.frame(4 + k * 14, 16, 10, 5, 0xf2f2ee); }
    p.rect(0, 22, len, 2, 0x5a5d63);
  });
  const longSide = sideFor(42), shortSide = sideFor(22);
  const top = A.shared('cart_top', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, (x * 3 + y) % 9 === 0 ? 0x8a8e94 : 0xb4b8be);
    p.frame(0, 0, 32, 32, 0x8a8e94);
    p.rect(3, 3, 12, 11, 0x3a2a22);
    for (let k = 0; k < 4; k++) p.rect(5 + k * 2, 5, 1, 7, 0xc87a3a);
    p.rect(18, 4, 11, 9, 0xd8a050);
    for (let k = 0; k < 3; k++) p.ellipse(21 + k * 3, 8, 1.2, 1.2, 0x9a5a20);
    p.rect(4, 18, 24, 10, 0x9aa0a8);
    p.frame(4, 18, 24, 10, 0x6a6e74);
  });
  const F = c.axis === 'x' ? { py: longSide, ny: longSide, px: shortSide, nx: shortSide } : { px: longSide, nx: longSide, py: shortSide, ny: shortSide };
  C.mb.box(x0, y0, CURB + 0.2, x1, y1, CURB + H, { ...F, pz: { t: top } });
  for (const [wx, wy] of [[x0 + 0.1, y0 + 0.1], [x1 - 0.1, y1 - 0.1]]) C.mb.box(wx - 0.06, wy - 0.06, CURB, wx + 0.06, wy + 0.06, CURB + 0.25, { px: P.black, nx: P.black, py: P.black, ny: P.black, pz: P.black });
  C.addSprite('cartUmbrella', cx, cy, CURB + H, { cart: c.kind });
  C.world.steam.push({ x: cx, y: cy, z: CURB + H + 0.1, kind: 'cart', rate: 0.6 });
  C.world.lamps.push({ x: cx, y: cy, z: 1.5, r: 1.5, color: [1, 0.9, 0.7], k: 0.45, kind: 'shop', group: GRP.DAY });
}

function cartNormal(c) {
  const lx = ((c.x % 27) + 27) % 27, ly = ((c.y % 27) + 27) % 27;
  // road is where lx or ly in [2,7)
  if (c.axis === 'x') return ly < 4.5 ? [0, 1] : ly > 4.5 && ly < 9 ? [0, -1] : [0, 1];
  return lx < 4.5 ? [1, 0] : [-1, 0];
}
