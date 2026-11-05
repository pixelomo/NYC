// Block-by-block city generation + street furniture.

import { T, NB, PERIOD, CURB, MAP, BLOCK_TYPES, blockRect, roadCenter, lotStart, lotEnd } from './layout.js';
import { GC, COL } from './ground.js';
import { MAT, GRP } from './mesh.js';
import { shade, mixc, hash2i, valueNoise } from '../core/math.js';
import { Frame, rowhouse, walkup, gardenWall, sharedTex, markHeight } from './buildings.js';
import { decoTower, glassTower, modernTower, limestoneOffice, loft } from './towers.js';
import {
  propTex, streetLamp, parkLamp, signalPole, hydrant, mailbox, newsBoxes, trashBasket, bench, steamStack, kiosk,
  busShelter, subwayEntrance, parkWall, chainFence, hoop, bleachers, handballWall, playground, scaffolding,
} from './props.js';
import { smoothFill, stoneFill, brickFill, PAL, drawWindow, drawDoor, signBoard } from './facades.js';
import { winCode } from '../core/painter.js';

export function makeContext(world, mb, atlas, rng) {
  const gp = world.ground.p;
  const C = {
    mb, atlas, rng, world, z0: CURB, ground: world.ground,
    paintGround(x0, y0, x1, y1, kind) {
      const X0 = Math.round(Math.min(x0, x1) * T), X1 = Math.round(Math.max(x0, x1) * T);
      const Y0 = Math.round(Math.min(y0, y1) * T), Y1 = Math.round(Math.max(y0, y1) * T);
      for (let y = Y0; y < Y1; y++)
        for (let x = X0; x < X1; x++) {
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
      const edge = x === X0 || y === Y0 || x === X1 - 1 || y === Y1 - 1;
      if (edge) return [0x9a968c, GC.CURB];
      return [shade(0x5a3e2a, 0.9 + h * 0.2), GC.FLOWERBED];
    }
    case 'soil':
      return [shade(0x5a3e2a, 0.88 + h * 0.24), GC.SOIL];
    case 'treepit': {
      const edge = x === X0 || y === Y0 || x === X1 - 1 || y === Y1 - 1;
      if (edge) return [0x8a8680, GC.CURB];
      return [shade(0x4e3626, 0.88 + h * 0.24), GC.SOIL];
    }
    case 'patio': {
      const jx = x % 8 === 0, jy = y % 8 === 0;
      const c = jx || jy ? 0x7a6e62 : shade(mixc(0xa8927a, 0xb89a80, hash2i(x >> 3, y >> 3, 3)), 0.95 + h * 0.08);
      return [c, GC.PATIO];
    }
    case 'plaza': {
      const jx = x % 16 === 0, jy = y % 16 === 0;
      const tile = hash2i(x >> 4, y >> 4, 9);
      let c = shade(mixc(0xc9c6c0, 0xb5b2ac, tile), 0.97 + h * 0.05);
      if (jx || jy) c = 0x9a9790;
      return [c, GC.PLAZA];
    }
    case 'grass': {
      const n = valueNoise(x * 0.08, y * 0.08, 5);
      let c = n > 0.55 ? COL.grass : mixc(COL.grass, COL.grassDark, 0.55);
      c = shade(c, 0.92 + h * 0.14);
      if (h > 0.97) c = shade(c, 1.2);
      return [c, GC.GRASS];
    }
    case 'path': {
      // hexagonal asphalt pavers
      const hx = x / 6, hy = y / 5.2;
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
    case 'gravel':
      return [shade(0x9a8a74, 0.85 + h * 0.3), GC.GRAVEL];
    case 'wood':
      return [shade(x % 3 === 0 ? 0x7a5236 : 0x9a6a44, 0.95 + h * 0.08), GC.WOOD];
    case 'stairsX':
    case 'stairsY': {
      const t = kind === 'stairsX' ? (x - X0) / (X1 - X0) : (y - Y0) / (Y1 - Y0);
      const step = Math.floor((kind === 'stairsX' ? x - X0 : y - Y0) / 3);
      const edge = (kind === 'stairsX' ? x - X0 : y - Y0) % 3 === 0;
      let c = mixc(0x8a8680, 0x16161a, Math.min(1, t * 1.15));
      if (edge) c = shade(c, 1.25);
      void step;
      return [c, GC.STAIRS];
    }
    case 'dirt':
      return [shade(0x8a6a4a, 0.88 + h * 0.24), GC.GRAVEL];
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
export function buildBlocks(C) {
  for (let by = 0; by < NB; by++)
    for (let bx = 0; bx < NB; bx++) {
      const type = BLOCK_TYPES[by][bx];
      const L = blockRect(bx, by);
      const fn = BLOCKS[type];
      if (fn) fn(C, L, bx, by);
    }
  streetFurniture(C);
}

const BLOCKS = {
  brownstones: (C, L) => brownstoneBlock(C, L),
  walkups: (C, L) => walkupBlock(C, L, {}),
  tenements: (C, L) => walkupBlock(C, L, { shops: 0.8, fireEscape: true }),
  commercial: (C, L) => walkupBlock(C, L, { shops: 1, theater: true }),
  bodega: (C, L) => walkupBlock(C, L, { bodegaCorner: true, shops: 0.6 }),
  firehouse: (C, L) => walkupBlock(C, L, { firehouse: true, shops: 0.5 }),
  lofts: (C, L) => loftBlock(C, L),
  deco: (C, L) => decoTower(C, L),
  glass: (C, L) => glassTower(C, L),
  modern: (C, L) => modernTower(C, L),
  office: (C, L) => limestoneOffice(C, L),
  court: (C, L) => courtBlock(C, L),
  park: (C, L) => parkBlock(C, L),
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
  const pickShop = () => (rng.chance(shopP) ? rng.pick(['bodega', 'pizza', 'laundry', 'coffee', 'bar', 'books', 'flowers', 'chinese', 'nails', 'hardware', 'bagels', 'diner', 'pharmacy']) : null);
  let num = rng.int(100, 400);
  for (const side of ['N', 'S']) {
    const fr = F[side];
    const widths = rng.pick([[5, 4, 4, 5], [5, 3.5, 4.5, 5], [4.5, 4.5, 4.5, 4.5], [5, 8, 5]]);
    let a = 0;
    widths.forEach((w, k) => {
      const corner = k === 0 ? 'L' : k === widths.length - 1 ? 'R' : null;
      let shop = pickShop();
      if (o.bodegaCorner && side === 'S' && k === widths.length - 1) shop = 'bodega';
      if (o.firehouse && side === 'S' && k === 1) {
        firehouse(C, fr, a, w, 7);
      } else if (o.theater && side === 'S' && w >= 8) {
        theater(C, fr, a, w, 7);
      } else {
        walkup(C, fr, a, w, 7, {
          cornerSide: corner, shop: corner ? shop ?? pickShop() : shop, number: num,
          billboard: corner && rng.chance(0.35) ? rng.pick(['cola', 'bagel', 'jazz', 'show', 'taxi', 'sun', 'gin']) : null,
          floors: rng.int(4, 6), fireEscape: o.fireEscape ? true : undefined, resDoorLeft: corner === 'R',
        });
      }
      num += 2;
      a += w;
    });
  }
  for (const side of ['E', 'W']) {
    const fr = F[side];
    walkup(C, fr, 7, 4, 6.5, { shop: pickShop(), floors: rng.int(4, 5), number: num++ });
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
  p.rect(0, 0, tw, 12, 0xe2d6ba);
  p.text(Math.max(1, Math.floor((tw - 40) / 2)), 3, 'ENGINE 7', 0xc8302c, 255, 1);
  for (let f = 0; f < 2; f++) {
    const fy = 12 + f * 24;
    for (let b = 0; b < 3; b++) drawWindow(p, Math.round((tw / 3) * b + tw / 6) - 4, fy + 5, 8, 14, { frame: 0xf2efe6, lintel: 0xe2d6ba, sill: 0xe2d6ba, t: rng.next() }, rng);
  }
  const gy = 12 + 48;
  p.rect(0, gy, tw, th - gy, 0xe2d6ba);
  const dw = tw - 20;
  p.rect(4, gy + 4, dw, th - gy - 4, 0xc8302c);
  for (let y = gy + 6; y < th; y += 3) p.hline(5, y, dw - 2, 0xa82420);
  for (let x = 6; x < 4 + dw - 4; x += 8) p.rect(x, gy + 8, 5, 4, 0x40576d, winCode(0.1));
  drawDoor(p, tw - 13, gy + 6, 8, th - gy - 6, { color: 0xc8302c, glass: true });
  const back = S.brickRed;
  const aabb = fr.box(mb, a0, a0 + W, 0, D, CURB, CURB + H, { front, back, left: back, right: back, top: { t: S.roofTar, world: true } });
  markHeight(C.world, ...aabb, CURB + H);
  C.addFlag(fr, a0 + W - 1, -0.05, CURB + 4.2, 'us');
  const bay = fr.pt(a0 + (dw / 2 + 4) / T, -0.5);
  C.world.firehouse = { x: bay[0], y: bay[1], n: fr.n, door: fr.pt(a0 + (dw / 2 + 4) / T, 1.5) };
  C.world.lamps.push({ x: bay[0], y: bay[1], z: 2.5, r: 2.4, color: [1, 0.9, 0.7], k: 0.6, kind: 'shop' });
}

function theater(C, fr, a0, W, D) {
  const { mb, rng } = C;
  const S = sharedTex(C);
  const H = 7.5;
  const tw = Math.round(W * T), th = Math.round(H * T);
  const front = C.atlas.alloc(tw, th);
  const p = front.p;
  stoneFill(p, 0, 0, tw, th, PAL.limestone, 66, 8, { blocks: 16 });
  for (let x = 4; x < tw - 4; x += 12) {
    p.rect(x, 10, 6, 56, 0xc8b890);
    drawWindow(p, x + 1, 14, 4, 22, { frame: 0x2b2b30, t: rng.next() * 0.4, rail: false }, rng);
  }
  const gy = th - 34;
  p.rect(0, gy, tw, 34, 0x5a1f1f);
  for (let x = 6; x < tw - 6; x += 14) { p.rect(x, gy + 12, 10, 22, 0xd8b04a); p.rect(x + 1, gy + 13, 8, 21, 0x40576d, winCode(0.02)); }
  const aabb = fr.box(mb, a0, a0 + W, 0, D, CURB, CURB + H, { front, back: S.brickBrown, left: S.brickBrown, right: S.brickBrown, top: { t: S.roofTar, world: true } });
  markHeight(C.world, ...aabb, CURB + H);
  // marquee with chasing bulbs
  const mw = Math.round((W - 1) * T);
  const marq = C.atlas.alloc(mw, 14);
  const q = marq.p;
  q.rect(0, 0, mw, 14, 0xf2efe6);
  for (let x = 1; x < mw; x += 2) { q.set(x, 0, 0xffe27a, winCode(0.0, true)); q.set(x, 13, 0xffe27a, winCode(0.0, true)); }
  q.text(Math.floor((mw - 39) / 2), 2, 'NOW SHOWING', 0x1b1b1b, winCode(0.0, true));
  q.text(Math.floor((mw - 47) / 2), 8, 'PIXEL CITY 3', 0xc8302c, winCode(0.0, true));
  fr.box(mb, a0 + 0.5, a0 + W - 0.5, -1.4, 0, CURB + 2.2, CURB + 3.1, { front: marq, left: S.darkMetal, right: S.darkMetal, top: { t: S.darkMetal } });
  // vertical sign
  const vt = C.atlas.alloc(16, 72);
  vt.p.rect(0, 0, 16, 72, 0xc8302c);
  vt.p.frame(0, 0, 16, 72, 0xffe27a, winCode(0.0, true));
  'RIALTO'.split('').forEach((ch, i) => vt.p.text(2, 4 + i * 11, ch, 0xffffff, winCode(0.0, true), 2));
  fr.sideQuad(mb, a0 + 1, -0.15, -1.3, CURB + 3.4, CURB + 3.4 + 4.5, vt, { mat: MAT.NOSHADOW });
  fr.sideQuad(mb, a0 + 1.01, -1.3, -0.15, CURB + 3.4, CURB + 3.4 + 4.5, vt, { mat: MAT.NOSHADOW });
  const lp = fr.pt(a0 + W / 2, -1.5);
  C.world.lamps.push({ x: lp[0], y: lp[1], z: 0.5, r: 3.4, color: [1, 0.85, 0.5], k: 0.9, kind: 'marquee' });
  C.world.marquees.push({ x: lp[0], y: lp[1] });
  C.world.shops.push({ kind: 'theater', name: 'RIALTO', x: lp[0], y: lp[1], n: fr.n });
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
  for (let x = X0; x < X1; x++) { line(x, Y0); line(x, Y0 + 1); line(x, Y1 - 1); line(x, Y1 - 2); }
  for (let y = Y0; y < Y1; y++) { line(X0, y); line(X0 + 1, y); line(X1 - 1, y); line(X1 - 2, y); }
  const mx = Math.round((X0 + X1) / 2), my = Math.round((Y0 + Y1) / 2);
  for (let y = Y0; y < Y1; y++) { line(mx, y); line(mx - 1, y); }
  g.ring(mx, my, 15, 15, 2, 0xf2f2ee, GC.COURT_LINE);
  // three point arcs + key outlines
  for (const [ex, dir] of [[X0, 1], [X1, -1]]) {
    const bx = ex + dir * 14;
    for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.01) {
      const px = Math.round(bx + dir * Math.cos(a) * 58), py = Math.round(my + Math.sin(a) * 58);
      if (py > Y0 + 6 && py < Y1 - 6) { line(px, py); line(px + dir, py); }
    }
    for (const sy of [my - 54, my + 54]) for (let x = Math.min(ex, bx); x <= Math.max(ex, bx); x++) { line(x, sy); line(x, sy + 1); }
    const kx = ex + dir * 48;
    for (let y = my - 20; y <= my + 20; y++) { line(kx, y); line(kx + dir, y); }
    for (let x = Math.min(ex, kx); x <= Math.max(ex, kx); x++) { line(x, my - 20); line(x, my + 20); }
    g.ring(kx, my, 16, 16, 2, 0xf2f2ee, GC.COURT_LINE);
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
// Street furniture along every sidewalk + signals at every intersection
function streetFurniture(C) {
  const { rng } = C;
  const W = C.world;
  // signals
  for (let i = 0; i <= NB; i++)
    for (let j = 0; j <= NB; j++) {
      const rx = roadCenter(i), ry = roadCenter(j);
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) signalPole(C, rx + sx * 2.85, ry + sy * 2.85, sx, sy, i, j);
    }
  // per block-side furniture
  for (let by = 0; by < NB; by++)
    for (let bx = 0; bx < NB; bx++) {
      const type = BLOCK_TYPES[by][bx];
      const L = blockRect(bx, by);
      const residential = ['brownstones', 'walkups', 'tenements', 'bodega', 'firehouse', 'commercial', 'lofts'].includes(type);
      // sides: [x0,y0,x1,y1 of the curb line], normal toward road
      const sides = [
        { ax: 'x', y: L.y0 - 2 + 0.35, x0: L.x0, x1: L.x1, ny: -1, nx: 0, name: 'N' },
        { ax: 'x', y: L.y1 + 2 - 0.35, x0: L.x0, x1: L.x1, ny: 1, nx: 0, name: 'S' },
        { ax: 'y', x: L.x0 - 2 + 0.35, y0: L.y0, y1: L.y1, nx: -1, ny: 0, name: 'W' },
        { ax: 'y', x: L.x1 + 2 - 0.35, y0: L.y0, y1: L.y1, nx: 1, ny: 0, name: 'E' },
      ];
      for (const s of sides) {
        const at = (t, off = 0) => (s.ax === 'x' ? [s.x0 + t, s.y - s.ny * off] : [s.x - s.nx * off, s.y0 + t]);
        // street lamps
        for (const t of [5, 13]) {
          const [x, y] = at(t);
          streetLamp(C, x, y, s.nx, s.ny);
        }
        // trees
        const treeTs = residential ? [2.6, 7.6, 10.4, 15.4] : type === 'park' ? [3, 9, 15] : type === 'court' ? [3.0, 15.0] : [3.2, 14.8];
        for (const t of treeTs) {
          if (rng.chance(residential ? 0.9 : 0.8)) {
            const [x, y] = at(t, 0.35);
            C.addTree(x, y, residential ? rng.pick(['plane', 'locust', 'plane', 'oak']) : 'plane', true);
          }
        }
        // hydrant
        {
          const [x, y] = at(rng.range(8.2, 9.6), 0.0);
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
        } else if (rng.chance(0.35)) {
          const [x, y] = at(16.6, 0.1);
          newsBoxes(C, x, y, s.ax);
        }
        if (!residential && rng.chance(0.5)) {
          const [x, y] = at(11.2, 0.0);
          kiosk(C, x, y);
        }
      }
    }
  // bus shelters
  busShelter(C, lotStart(1) + 9, lotEnd(1) + 2 - 0.8, 'x', 1);
  busShelter(C, lotEnd(2) + 2 - 0.8, lotStart(3) + 9, 'y', 1);
  W.busRoute = true;
  // steam stacks (in parking lanes)
  steamStack(C, lotStart(1) + 5.5, roadCenter(2) - 1.85);
  steamStack(C, roadCenter(3) + 1.85, lotStart(1) + 6);
  steamStack(C, lotStart(2) + 12, roadCenter(4) + 1.85);
  W.stacksBlock = [
    { x: lotStart(1) + 5.5, y: roadCenter(2) - 1.85 },
    { x: roadCenter(3) + 1.85, y: lotStart(1) + 6 },
    { x: lotStart(2) + 12, y: roadCenter(4) + 1.85 },
  ];
  // subway entrance by the park
  subwayEntrance(C, lotStart(2) - 1.0, lotStart(2) + 4.5, 'y');
  subwayEntrance(C, lotStart(0) + 14, lotEnd(3) + 1.0, 'x');
  // food carts
  W.carts.push({ x: lotStart(1) + 14, y: lotEnd(0) + 1.3, kind: 'halal', axis: 'x' });
  W.carts.push({ x: lotEnd(1) + 0.9, y: lotStart(2) + 14.5, kind: 'pretzel', axis: 'y' });
  // food cart geometry
  for (const c of W.carts) buildCart(C, c);
  // manhole steam sources
  for (const m of W.groundInfo.manholes) if (rng.chance(0.35)) W.steam.push({ x: m.x, y: m.y, z: 0.02, kind: 'manhole', rate: 0.4 });
  void PERIOD; void MAP; void GRP; void smoothFill; void drawDoor; void signBoard;
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
  const side = A.shared('cart_side_' + c.kind, 24, 16, (p) => {
    const steel = 0xc8ccd2;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++) p.set(x, y, (x + y) % 5 === 0 ? 0xdde0e4 : steel);
    if (c.kind === 'halal') { p.rect(0, 2, 24, 6, 0xc8302c); p.text(2, 3, 'HALAL', 0xf2c230, 255); }
    else if (c.kind === 'pretzel') { p.rect(0, 2, 24, 6, 0x1f4fa0); p.text(2, 3, 'PRTZL', 0xf2c230, 255); }
    else { p.rect(0, 2, 24, 6, 0xf2c230); p.text(2, 3, 'HOTDG', 0xc8302c, 255); }
    p.rect(0, 15, 24, 1, 0x5a5d63);
  });
  const top = A.shared('cart_top', 16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x * 3 + y) % 7 === 0 ? 0x8a8e94 : 0xb4b8be);
    p.rect(2, 2, 5, 5, 0x5a3a2a); p.rect(9, 3, 5, 4, 0xd8a050);
  });
  C.mb.box(x0, y0, CURB + 0.2, x1, y1, CURB + H, { px: side, nx: side, py: side, ny: side, pz: { t: top } });
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
