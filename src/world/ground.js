// Ground texture (world-space, 16 texels / unit) + the raised sidewalk plinths and diorama base.

import { T, MAP, NB, PERIOD, SIDEWALK, ROAD, CURB, BASE_DEPTH, roadStart, roadEnd, roadCenter } from './layout.js';
import { MAT } from './mesh.js';
import { RNG, hash2i, shade, mixc } from '../core/math.js';

export const GC = {
  ASPHALT: 1, PARKING: 2, PAINT_W: 3, PAINT_Y: 4, CROSSWALK: 5, SIDEWALK: 6, CURB: 7, GRASS: 8,
  SOIL: 9, FLOWERBED: 10, PATH: 11, COURT: 12, COURT_LINE: 13, RUBBER: 14, WATER: 15, PLAZA: 16,
  PATIO: 17, METAL: 18, BUSLANE: 19, BIKELANE: 20, SAND: 21, GRAVEL: 22, WOOD: 23, STAIRS: 24,
};

export const COL = {
  asphalt: 0x4a4d57,
  asphaltDark: 0x3d4049,
  asphaltPatch: 0x40434c,
  white: 0xeeeef0,
  yellow: 0xf2c230,
  sidewalk: 0xc3c0b8,
  sidewalkDark: 0xaeaba3,
  curb: 0xd8d5ce,
  grass: 0x58ac43,
  grassDark: 0x3f8c33,
  soil: 0x6b4a32,
  metal: 0x5b5a58,
};

// x-intervals that are raised (not road): returns [[a,b], ...]
export function raisedIntervals() {
  const out = [];
  let x = 0;
  for (let k = 0; k <= NB; k++) {
    const rs = roadStart(k), re = roadEnd(k);
    if (rs > x) out.push([x, rs]);
    x = re;
  }
  if (x < MAP) out.push([x, MAP]);
  return out;
}

export function paintGround(region, rng) {
  const p = region.p;
  const N = MAP * T;
  // 1. asphalt everywhere
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const h = hash2i(x, y, 11);
      const big = hash2i(x >> 5, y >> 5, 12);
      let c = COL.asphalt;
      const f = 0.94 + h * 0.1 + (big - 0.5) * 0.04;
      p.set(x, y, shade(c, f), GC.ASPHALT);
    }
  }
  // repaving patches & cracks on roads
  for (let i = 0; i < 160; i++) {
    const w = rng.int(12, 70), h = rng.int(10, 40);
    const x = rng.int(0, N - w), y = rng.int(0, N - h);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        if (p.getA(x + xx, y + yy) !== GC.ASPHALT) continue;
        const hh = hash2i(x + xx, y + yy, 19);
        p.set(x + xx, y + yy, shade(COL.asphaltPatch, 0.95 + hh * 0.1), GC.ASPHALT);
      }
  }
  for (let i = 0; i < 240; i++) {
    let x = rng.int(0, N), y = rng.int(0, N);
    const len = rng.int(6, 30);
    for (let k = 0; k < len; k++) {
      p.set(x, y, 0x34363d, GC.ASPHALT);
      x += rng.int(-1, 1);
      y += rng.int(-1, 1) || 1;
    }
  }
  // oil stains in lanes
  for (let i = 0; i < 200; i++) {
    const x = rng.int(0, N), y = rng.int(0, N);
    p.ellipse(x, y, rng.range(2, 5), rng.range(2, 4), COL.asphaltDark, GC.ASPHALT);
  }

  // 2. parking lanes (slightly different tone) + markings
  for (let k = 0; k <= NB; k++) {
    const rs = roadStart(k) * T, re = roadEnd(k) * T, rc = roadCenter(k) * T;
    const pw = Math.round(1.1 * T);
    // horizontal street (runs along x) => y band
    markBand(p, 0, rs, N, pw, GC.PARKING);
    markBand(p, 0, re - pw, N, pw, GC.PARKING);
    markBand(p, rs, 0, pw, N, GC.PARKING);
    markBand(p, re - pw, 0, pw, N, GC.PARKING);
    void rc;
  }
  // centre double-yellow lines between intersections
  for (let k = 0; k <= NB; k++) {
    const rc = Math.round(roadCenter(k) * T);
    for (let i = 0; i < NB + 1; i++) {
      // segment from end of intersection i crosswalk to start of next
      const a = (i * PERIOD + SIDEWALK + ROAD + SIDEWALK) * T + 8;
      const b = ((i + 1) * PERIOD) * T - 8;
      if (i === NB) continue;
      // along x at y = rc
      p.rect(a, rc - 3, b - a, 2, COL.yellow, GC.PAINT_Y);
      p.rect(a, rc + 1, b - a, 2, COL.yellow, GC.PAINT_Y);
      // along y at x = rc
      p.rect(rc - 3, a, 2, b - a, COL.yellow, GC.PAINT_Y);
      p.rect(rc + 1, a, 2, b - a, COL.yellow, GC.PAINT_Y);
      // dashed white lane edge lines near parking
    }
  }
  // stop lines & crosswalks at every intersection
  for (let i = 0; i <= NB; i++) {
    for (let j = 0; j <= NB; j++) {
      const x0 = roadStart(i) * T, x1 = roadEnd(i) * T; // vertical road i
      const y0 = roadStart(j) * T, y1 = roadEnd(j) * T; // horizontal road j
      const sx0 = (i * PERIOD) * T, sx1 = (i * PERIOD + 2 * SIDEWALK + ROAD) * T;
      const sy0 = (j * PERIOD) * T, sy1 = (j * PERIOD + 2 * SIDEWALK + ROAD) * T;
      // crosswalk across vertical road (north side: y in [sy0, y0)) & south side
      zebra(p, x0, sy0 + 3, x1 - x0, y0 - sy0 - 6, 'v');
      zebra(p, x0, y1 + 3, x1 - x0, sy1 - y1 - 6, 'v');
      // crosswalks across horizontal road (west: x in [sx0, x0)) & east
      zebra(p, sx0 + 3, y0, x0 - sx0 - 6, y1 - y0, 'h');
      zebra(p, x1 + 3, y0, sx1 - x1 - 6, y1 - y0, 'h');
      // stop lines (right-hand traffic). Southbound on vertical road uses the west lane, stops north of north crosswalk
      const rcx = roadCenter(i) * T, rcy = roadCenter(j) * T;
      if (j > 0) p.rect(x0 + 2, sy0 - 4, rcx - x0 - 4, 3, COL.white, GC.PAINT_W); // southbound, west half
      if (j < NB) p.rect(rcx + 2, sy1 + 1, x1 - rcx - 4, 3, COL.white, GC.PAINT_W); // northbound east half
      if (i > 0) p.rect(sx0 - 4, rcy + 2, 3, y1 - rcy - 4, COL.white, GC.PAINT_W); // eastbound (south half) stops west
      if (i < NB) p.rect(sx1 + 1, y0 + 2, 3, rcy - y0 - 4, COL.white, GC.PAINT_W); // westbound north half
    }
  }

  // 3. sidewalks (raised areas)
  const iv = raisedIntervals();
  for (const [ax, bx] of iv)
    for (const [ay, by] of iv) paintSidewalkRect(p, ax * T, ay * T, (bx - ax) * T, (by - ay) * T, rng);

  // 4. manholes + utility covers on roads
  const manholes = [];
  for (let k = 0; k <= NB; k++) {
    for (let s = 0; s < NB; s++) {
      const along = (s * PERIOD + 9 + rng.range(3, 15));
      const off = roadCenter(k) + rng.pick([-0.7, 0.7, 0]);
      for (const axis of ['x', 'y']) {
        const wx = axis === 'x' ? along : off;
        const wy = axis === 'x' ? off : along;
        manhole(p, wx * T, wy * T);
        manholes.push({ x: wx, y: wy, axis });
      }
    }
  }
  return { manholes };
}

function markBand(p, x, y, w, h, code) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      const a = p.getA(xx, yy);
      if (a === GC.ASPHALT) p.setA(xx, yy, code);
    }
}

function zebra(p, x, y, w, h, dir) {
  // dir 'v': stripes run along y (traffic on vertical road), stacked along x
  if (dir === 'v') {
    for (let xx = 4; xx < w - 3; xx += 8) p.rect(x + xx, y, 4, h, COL.white, GC.CROSSWALK);
  } else {
    for (let yy = 4; yy < h - 3; yy += 8) p.rect(x, y + yy, w, 4, COL.white, GC.CROSSWALK);
  }
  // wear
  for (let i = 0; i < (w * h) / 40; i++) {
    const xx = x + Math.floor(hash2i(i, x, 5) * w), yy = y + Math.floor(hash2i(i, y, 6) * h);
    if (p.getA(xx, yy) === GC.CROSSWALK) p.set(xx, yy, 0xc9c9cc, GC.CROSSWALK);
  }
}

function paintSidewalkRect(p, x, y, w, h, rng) {
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const gx = x + xx, gy = y + yy;
      const hh = hash2i(gx, gy, 31);
      let c = shade(COL.sidewalk, 0.96 + hh * 0.07);
      // slab joints every 12 texels
      if (gx % 12 === 0 || gy % 12 === 0) c = COL.sidewalkDark;
      // slab tone variation
      const slab = hash2i(Math.floor(gx / 12), Math.floor(gy / 12), 33);
      if (slab < 0.12) c = shade(c, 0.93);
      else if (slab > 0.94) c = mixc(c, 0xd9d2c0, 0.4);
      p.set(gx, gy, c, GC.SIDEWALK);
    }
  // curb highlight on the edges (only edges that touch roads are visible anyway)
  p.rect(x, y, w, 1, COL.curb, GC.CURB);
  p.rect(x, y + h - 1, w, 1, COL.curb, GC.CURB);
  p.rect(x, y, 1, h, COL.curb, GC.CURB);
  p.rect(x + w - 1, y, 1, h, COL.curb, GC.CURB);
  // gum spots
  const n = Math.floor((w * h) / 260);
  for (let i = 0; i < n; i++) {
    const gx = x + rng.int(2, w - 3), gy = y + rng.int(2, h - 3);
    p.rect(gx, gy, 2, 2, rng.chance(0.5) ? 0x9a978f : 0x8c8982, GC.SIDEWALK);
  }
}

function manhole(p, cx, cy) {
  p.ellipse(cx, cy, 7, 7, 0x3a3936, GC.METAL);
  p.ellipse(cx, cy, 6, 6, COL.metal, GC.METAL);
  for (let i = -4; i <= 4; i += 2) p.rect(cx - 5, cy + i, 10, 1, 0x4a4946, GC.METAL);
  p.ring(cx, cy, 6, 6, 1, 0x6a6966, GC.METAL);
}

// Paint a rectangular lot area with a fill function f(x,y)->[color, code]
export function paintLot(p, x0, y0, x1, y1, fn) {
  for (let y = Math.round(y0 * T); y < Math.round(y1 * T); y++)
    for (let x = Math.round(x0 * T); x < Math.round(x1 * T); x++) {
      const r = fn(x, y);
      if (r) p.set(x, y, r[0], r[1]);
    }
}

// Geometry for ground, plinths and the diorama base
export function buildGroundGeometry(mb, ground, tex) {
  // road surface over entire map + diorama base sides
  const g = { t: ground, world: true, mat: MAT.GROUND | MAT.SNOW | MAT.WET };
  mb.box(0, 0, -BASE_DEPTH, MAP, MAP, 0, {
    pz: g,
    px: tex.soil, nx: tex.soil, py: tex.soil, ny: tex.soil,
  }, { topMat: MAT.GROUND | MAT.SNOW | MAT.WET });
  const iv = raisedIntervals();
  for (const [ax, bx] of iv)
    for (const [ay, by] of iv) {
      mb.box(ax, ay, 0, bx, by, CURB, {
        pz: { t: ground, u0: ax * T, v0: ay * T, mat: MAT.GROUND | MAT.SNOW | MAT.WET },
        px: tex.curb, nx: tex.curb, py: tex.curb, ny: tex.curb,
      });
    }
}
