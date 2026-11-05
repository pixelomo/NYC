// Ground texture (world-space, T texels / unit) + the raised sidewalk plinths and diorama base.

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
  const d = region.page.data;
  // 1. asphalt everywhere (direct writes: this is ~14M texels)
  const cells = Math.ceil(N / 64);
  const big = new Float32Array(cells * cells);
  for (let i = 0; i < big.length; i++) big[i] = hash2i(i % cells, (i / cells) | 0, 12) - 0.5;
  const ar = (COL.asphalt >> 16) & 255, ag = (COL.asphalt >> 8) & 255, ab = COL.asphalt & 255;
  for (let y = 0; y < N; y++) {
    const row = (y >> 6) * cells;
    let i = y * N * 4;
    for (let x = 0; x < N; x++, i += 4) {
      let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + 11) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      const r = (h >>> 0) / 4294967296;
      let f = 0.93 + r * 0.11 + big[row + (x >> 6)] * 0.06;
      if (r > 0.992) f += 0.16; // light aggregate
      else if (r < 0.006) f -= 0.12;
      d[i] = Math.min(255, ar * f); d[i + 1] = Math.min(255, ag * f); d[i + 2] = Math.min(255, ab * f); d[i + 3] = GC.ASPHALT;
    }
  }
  // repaving patches (slightly darker, with a seam outline) & cracks
  for (let i = 0; i < 170; i++) {
    const w = rng.int(24, 140), h = rng.int(20, 80);
    const x = rng.int(0, N - w), y = rng.int(0, N - h);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        if (p.getA(x + xx, y + yy) !== GC.ASPHALT) continue;
        const edge = xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1;
        const hh = hash2i(x + xx, y + yy, 19);
        p.set(x + xx, y + yy, edge ? 0x2f3138 : shade(COL.asphaltPatch, 0.95 + hh * 0.1), GC.ASPHALT);
      }
  }
  for (let i = 0; i < 420; i++) {
    let x = rng.int(0, N), y = rng.int(0, N);
    const len = rng.int(10, 60);
    let dx = rng.int(-1, 1), dy = rng.chance(0.5) ? 1 : -1;
    for (let k = 0; k < len; k++) {
      p.set(x, y, 0x30323a, GC.ASPHALT);
      if (rng.chance(0.3)) dx = rng.int(-1, 1);
      x += dx; y += dy;
      if (rng.chance(0.06)) { // branch
        let bx = x, by = y;
        for (let j = 0; j < 6; j++) { bx += rng.int(-1, 1); by += 1; p.set(bx, by, 0x34363d, GC.ASPHALT); }
      }
    }
  }
  // oil stains in lanes
  for (let i = 0; i < 260; i++) {
    const x = rng.int(0, N), y = rng.int(0, N);
    const rx = rng.range(4, 10), ry = rng.range(3, 8);
    p.ellipse(x, y, rx, ry, 0x41444d, GC.ASPHALT);
    p.ellipse(x + 1, y, rx * 0.6, ry * 0.6, COL.asphaltDark, GC.ASPHALT);
  }

  // 2. parking lanes (slightly different tone) + markings
  for (let k = 0; k <= NB; k++) {
    const rs = roadStart(k) * T, re = roadEnd(k) * T;
    const pw = Math.round(1.1 * T);
    markBand(p, 0, rs, N, pw, GC.PARKING);
    markBand(p, 0, re - pw, N, pw, GC.PARKING);
    markBand(p, rs, 0, pw, N, GC.PARKING);
    markBand(p, re - pw, 0, pw, N, GC.PARKING);
  }
  // centre double-yellow lines between intersections (3px lines, 4px gap)
  const paintLine = (x, y, w, h, c, code) => {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const worn = hash2i(xx >> 2, yy >> 2, 77) < 0.08;
        p.set(xx, yy, worn ? mixc(c, 0x55565c, 0.55) : shade(c, 0.94 + hash2i(xx, yy, 78) * 0.1), code);
      }
  };
  for (let k = 0; k <= NB; k++) {
    const rc = Math.round(roadCenter(k) * T);
    for (let i = 0; i < NB; i++) {
      const a = (i * PERIOD + SIDEWALK + ROAD + SIDEWALK) * T + 16;
      const b = ((i + 1) * PERIOD) * T - 16;
      paintLine(a, rc - 5, b - a, 3, COL.yellow, GC.PAINT_Y);
      paintLine(a, rc + 2, b - a, 3, COL.yellow, GC.PAINT_Y);
      paintLine(rc - 5, a, 3, b - a, COL.yellow, GC.PAINT_Y);
      paintLine(rc + 2, a, 3, b - a, COL.yellow, GC.PAINT_Y);
    }
  }
  // stop lines & crosswalks at every intersection
  for (let i = 0; i <= NB; i++) {
    for (let j = 0; j <= NB; j++) {
      const x0 = roadStart(i) * T, x1 = roadEnd(i) * T;
      const y0 = roadStart(j) * T, y1 = roadEnd(j) * T;
      const sx0 = (i * PERIOD) * T, sx1 = (i * PERIOD + 2 * SIDEWALK + ROAD) * T;
      const sy0 = (j * PERIOD) * T, sy1 = (j * PERIOD + 2 * SIDEWALK + ROAD) * T;
      zebra(p, x0, sy0 + 6, x1 - x0, y0 - sy0 - 12, 'v');
      zebra(p, x0, y1 + 6, x1 - x0, sy1 - y1 - 12, 'v');
      zebra(p, sx0 + 6, y0, x0 - sx0 - 12, y1 - y0, 'h');
      zebra(p, x1 + 6, y0, sx1 - x1 - 12, y1 - y0, 'h');
      const rcx = roadCenter(i) * T, rcy = roadCenter(j) * T;
      if (j > 0) paintLine(x0 + 4, sy0 - 9, rcx - x0 - 8, 6, COL.white, GC.PAINT_W);
      if (j < NB) paintLine(rcx + 4, sy1 + 3, x1 - rcx - 8, 6, COL.white, GC.PAINT_W);
      if (i > 0) paintLine(sx0 - 9, rcy + 4, 6, y1 - rcy - 8, COL.white, GC.PAINT_W);
      if (i < NB) paintLine(sx1 + 3, y0 + 4, 6, rcy - y0 - 8, COL.white, GC.PAINT_W);
    }
  }

  // 3. sidewalks (raised areas)
  const iv = raisedIntervals();
  for (const [ax, bx] of iv)
    for (const [ay, by] of iv) paintSidewalkRect(p, ax * T, ay * T, (bx - ax) * T, (by - ay) * T, rng);

  // 4. manholes + storm drains on roads
  const manholes = [];
  for (let k = 0; k <= NB; k++) {
    for (let s = 0; s < NB; s++) {
      const along = (s * PERIOD + 9 + rng.range(3, 15));
      const off = roadCenter(k) + rng.pick([-0.7, 0.7, 0]);
      for (const axis of ['x', 'y']) {
        const wx = axis === 'x' ? along : off;
        const wy = axis === 'x' ? off : along;
        manhole(p, wx * T, wy * T, rng);
        manholes.push({ x: wx, y: wy, axis });
      }
    }
  }
  // storm drain grates along curbs near intersections
  for (let i = 0; i <= NB; i++)
    for (let j = 0; j <= NB; j++) {
      const rcx = roadCenter(i) * T, rcy = roadCenter(j) * T;
      const h = (ROAD / 2) * T;
      for (const [gx, gy, vert] of [[rcx - h + 2, rcy - h - 70, true], [rcx + h - 14, rcy + h + 58, true], [rcx - h - 70, rcy + h - 14, false], [rcx + h + 58, rcy - h + 2, false]]) {
        const w = vert ? 12 : 22, hh = vert ? 22 : 12;
        p.rect(gx, gy, w, hh, 0x26272b, GC.METAL);
        for (let t = 2; t < (vert ? hh : w) - 1; t += 3) {
          if (vert) p.rect(gx + 2, gy + t, w - 4, 1, 0x4c4d52, GC.METAL);
          else p.rect(gx + t, gy + 2, 1, hh - 4, 0x4c4d52, GC.METAL);
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
  const put = (xx, yy) => {
    const worn = hash2i(xx >> 1, yy >> 1, 5) < 0.07 || hash2i(xx >> 3, yy >> 3, 6) < 0.05;
    p.set(xx, yy, worn ? 0xa8a8ac : shade(COL.white, 0.95 + hash2i(xx, yy, 7) * 0.06), GC.CROSSWALK);
  };
  if (dir === 'v') {
    for (let xx = 8; xx < w - 7; xx += 16) for (let yy = 0; yy < h; yy++) for (let k = 0; k < 8; k++) put(x + xx + k, y + yy);
  } else {
    for (let yy = 8; yy < h - 7; yy += 16) for (let xx = 0; xx < w; xx++) for (let k = 0; k < 8; k++) put(x + xx, y + yy + k);
  }
}

function paintSidewalkRect(p, x, y, w, h, rng) {
  const S = 24; // slab size (0.75 units)
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const gx = x + xx, gy = y + yy;
      const hh = hash2i(gx, gy, 31);
      const slab = hash2i(Math.floor(gx / S), Math.floor(gy / S), 33);
      let c = shade(COL.sidewalk, 0.955 + hh * 0.07);
      if (slab < 0.12) c = shade(c, 0.93);
      else if (slab > 0.94) c = mixc(c, 0xd9d2c0, 0.4);
      else if (slab > 0.9) c = mixc(c, 0xb8b4aa, 0.35);
      const lx = gx % S, ly = gy % S;
      if (lx === 0 || ly === 0) c = COL.sidewalkDark;
      else if (lx === 1 || ly === 1) c = shade(c, 1.05); // bevelled slab edge
      else if (lx === S - 1 || ly === S - 1) c = shade(c, 0.95);
      if (hh > 0.995) c = shade(c, 0.85); // grit
      p.set(gx, gy, c, GC.SIDEWALK);
    }
  // hairline cracks in some slabs
  const nc = Math.floor((w * h) / 2400);
  for (let i = 0; i < nc; i++) {
    let cx = x + rng.int(4, w - 5), cy = y + rng.int(4, h - 5);
    for (let k = 0; k < rng.int(5, 14); k++) {
      p.set(cx, cy, 0x9c998f, GC.SIDEWALK);
      cx += rng.int(-1, 1); cy += rng.chance(0.5) ? 1 : 0;
    }
  }
  // curb: bright top edge + darker inner line
  for (const [rx, ry, rw, rh] of [[x, y, w, 2], [x, y + h - 2, w, 2], [x, y, 2, h], [x + w - 2, y, 2, h]]) p.rect(rx, ry, rw, rh, COL.curb, GC.CURB);
  for (const [rx, ry, rw, rh] of [[x + 2, y + 2, w - 4, 1], [x + 2, y + h - 3, w - 4, 1], [x + 2, y + 2, 1, h - 4], [x + w - 3, y + 2, 1, h - 4]]) p.rect(rx, ry, rw, rh, 0xb4b1a9, GC.CURB);
  // gum spots
  const n = Math.floor((w * h) / 900);
  for (let i = 0; i < n; i++) {
    const gx = x + rng.int(4, w - 6), gy = y + rng.int(4, h - 6);
    const c = rng.chance(0.5) ? 0x9a978f : 0x8c8982;
    p.rect(gx, gy, 2, 2, c, GC.SIDEWALK);
    if (rng.chance(0.4)) p.set(gx + 2, gy + 1, c, GC.SIDEWALK);
  }
}

function manhole(p, cx, cy, rng) {
  p.ellipse(cx, cy, 14, 14, 0x2e2d2b, GC.METAL);
  p.ellipse(cx, cy, 12.5, 12.5, COL.metal, GC.METAL);
  // waffle pattern
  for (let yy = -11; yy <= 11; yy++)
    for (let xx = -11; xx <= 11; xx++) {
      if (xx * xx + yy * yy > 110) continue;
      if ((xx + 40) % 4 === 0 || (yy + 40) % 4 === 0) p.set(cx + xx, cy + yy, 0x4a4946, GC.METAL);
    }
  p.ring(cx, cy, 12.5, 12.5, 1.2, 0x76756f, GC.METAL);
  p.ring(cx, cy, 6, 6, 1, 0x6a6964, GC.METAL);
  p.rect(cx - 2, cy - 1, 4, 2, 0x2e2d2b, GC.METAL);
  void rng;
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
  mb.box(0, 0, -BASE_DEPTH, MAP, MAP, 0, { pz: g }, { topMat: MAT.GROUND | MAT.SNOW | MAT.WET });
  const iv = raisedIntervals();
  for (const [ax, bx] of iv)
    for (const [ay, by] of iv) {
      mb.box(ax, ay, 0, bx, by, CURB, {
        pz: { t: ground, u0: ax * T, v0: ay * T, mat: MAT.GROUND | MAT.SNOW | MAT.WET },
        px: tex.curb, nx: tex.curb, py: tex.curb, ny: tex.curb,
      });
    }
}

// ---------------------------------------------------------------------------
// Diorama sides with a subway tunnel cut-away running around the perimeter
export const TUNNEL = { z0: -4.4, z1: -0.75, depth: 2.4, a0: 3, a1: MAP - 3, station: [14, 34] };

export function buildSlabSides(mb, atlas, tex) {
  const T16 = T;
  const { z0: tz0, z1: tz1, depth: TD, a0, a1 } = TUNNEL;
  const WH = Math.round((tz1 - tz0) * T16);
  const wall = atlas.shared('tunnel_wall', 128, WH, (p) => {
    const H = p.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < 128; x++) {
      const bx = x >> 4, by = Math.floor(y / 12);
      let c = (x % 16 === 0 || y % 12 === 0) ? 0x3a3632 : (hash2i(bx, by, 3) < 0.15 ? 0x6a645a : 0x5a554c);
      c = shade(c, 0.93 + hash2i(x, y, 4) * 0.12);
      if (y < 60) c = shade(c, 0.5 + y / 120);
      if (y > H - 10) c = y === H - 10 ? 0x4a4642 : 0x34302c;
      p.set(x, y, c);
    }
    // steel columns
    for (const cx of [12, 76]) for (let y = 0; y < H - 10; y++) { p.set(cx, y, 0x1e2125); p.set(cx + 1, y, 0x2a2e33); p.set(cx + 2, y, 0x3a4048); p.set(cx + 3, y, 0x2a2e33); }
    // cables + rust drips
    for (let x = 0; x < 128; x++) { p.set(x, 66 + Math.round(Math.sin(x * 0.05) * 1.5), 0x1e1e20); p.set(x, 70, 0x2a2a2c); }
    for (let y = 88; y < H - 12; y += 2) p.set(80 + (y % 3), y, 0x7a3a2a);
    // caged tunnel lamps (always lit)
    for (const lx of [40, 104]) { p.rect(lx - 1, 79, 10, 6, 0x2a2a2c); p.rect(lx, 80, 8, 4, 0xffe2a0, 128); p.set(lx + 3, 80, 0x2a2a2c); }
  });
  const station = atlas.shared('station_wall', 256, WH, (p) => {
    const H = p.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < 256; x++) {
      let c = (x % 8 === 0 || y % 8 === 0) ? 0xc4c0b4 : shade(0xeae6da, 0.97 + hash2i(x >> 3, y >> 3, 9) * 0.05);
      if (y < 60) c = shade(c, 0.5 + y / 120);
      p.set(x, y, c);
    }
    // mosaic band
    for (let x = 0; x < 256; x++) {
      for (let y = 72; y < 76; y++) p.set(x, y, 0x2a6a4a);
      p.set(x, 76, 0xc8a040); p.set(x, 77, 0xc8a040);
      if (x % 8 < 4) { p.set(x, 73, 0x3f8a64); p.set(x, 74, 0x3f8a64); }
    }
    // name tablets
    for (const ox of [20, 148]) {
      p.rect(ox, 82, 88, 18, 0x2a6a4a);
      p.frame(ox, 82, 88, 18, 0xc8a040);
      p.frame(ox + 2, 84, 84, 14, 0x3f8a64);
      p.text7(ox + 30, 88, '23 ST', 0xf2efe6);
    }
    // lamps
    for (const lx of [122, 250]) p.rect(lx - 4, 60, 12, 3, 0xfff6d8, 128);
  });
  const track = atlas.shared('track', 64, Math.round(TD * T16), (p) => {
    const H = p.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < 64; x++) { const r = hash2i(x, y, 8); p.set(x, y, r < 0.25 ? 0x4a4440 : r > 0.92 ? 0x6e675e : 0x5a544c); }
    for (let x = 0; x < 64; x += 8) for (let y = 12; y < H - 12; y++) { p.set(x, y, 0x5a3e2a); p.set(x + 1, y, 0x6a4a32); p.set(x + 2, y, 0x4a3222); }
    for (const ry of [24, H - 28]) for (let x = 0; x < 64; x++) { p.set(x, ry, 0xd8dce2); p.set(x, ry + 1, 0x9aa0a8); p.set(x, ry + 2, 0x5a5e66); }
    for (let x = 0; x < 64; x++) { p.set(x, H - 12, 0xf2c230); p.set(x, H - 11, 0xd8a820); p.set(x, H - 10, 0x6a5a20); }
  });
  const platformTop = atlas.shared('platform_top', 64, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) p.set(x, y, (x % 16 === 0 || y % 16 === 0) ? 0x9a968c : shade(0xb4b0a6, 0.96 + hash2i(x, y, 5) * 0.08));
    for (let x = 0; x < 64; x++) for (let y = 0; y < 4; y++) p.set(x, y, (x + y) % 4 < 2 ? 0xf2c230 : 0xd8a820);
  });
  const concrete = atlas.shared('tunnel_conc', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x6a6660, 0.9 + hash2i(x, y, 2) * 0.2));
  });
  const soil = tex.soil;
  const sides = [
    // [normal, point(a,d)->[x,y]]  a runs left->right as seen from outside; d goes into the slab
    { key: 'py', n: [0, 1], pt: (a, d) => [a, MAP - d] },
    { key: 'ny', n: [0, -1], pt: (a, d) => [MAP - a, d] },
    { key: 'px', n: [1, 0], pt: (a, d) => [MAP - d, MAP - a] },
    { key: 'nx', n: [-1, 0], pt: (a, d) => [d, a] },
  ];
  const quadSide = (S, aa0, aa1, d, zz0, zz1, texr, mat = 0) => {
    const p0 = S.pt(aa0, d), p1 = S.pt(aa1, d);
    const u0 = aa0 * T16, u1 = aa1 * T16, v0 = -zz1 * T16, v1 = -zz0 * T16;
    mb.quad([p0[0], p0[1], zz1], [p1[0], p1[1], zz1], [p1[0], p1[1], zz0], [p0[0], p0[1], zz0],
      [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], texr, [S.n[0], S.n[1], 0], mat);
  };
  for (const S of sides) {
    // soil face around the opening
    quadSide(S, 0, MAP, 0, tz1, 0, soil);
    quadSide(S, 0, MAP, 0, -BASE_DEPTH, tz0, soil);
    quadSide(S, 0, a0, 0, tz0, tz1, soil);
    quadSide(S, a1, MAP, 0, tz0, tz1, soil);
    // tunnel back wall (station tiles on the south side)
    const st = TUNNEL.station;
    if (S.key === 'py') {
      quadSide(S, a0, st[0], TD, tz0, tz1, wall);
      quadSide(S, st[0], st[1], TD, tz0, tz1, station);
      quadSide(S, st[1], a1, TD, tz0, tz1, wall);
    } else quadSide(S, a0, a1, TD, tz0, tz1, wall);
    // floor (track bed): u along a, v across depth
    {
      const q0 = S.pt(a0, 0), q1 = S.pt(a1, 0), q2 = S.pt(a1, TD), q3 = S.pt(a0, TD);
      const L = (a1 - a0) * T16, D = TD * T16;
      mb.quad([q3[0], q3[1], tz0], [q2[0], q2[1], tz0], [q1[0], q1[1], tz0], [q0[0], q0[1], tz0],
        [[0, 0], [L, 0], [L, D], [0, D]], track, [0, 0, 1], 0);
    }
    // inner pillar faces at both ends of the opening
    {
      const e0 = S.pt(a0, 0), e1 = S.pt(a0, TD);
      const u = [S.n[1], -S.n[0]];
      mb.quad([e1[0], e1[1], tz1], [e0[0], e0[1], tz1], [e0[0], e0[1], tz0], [e1[0], e1[1], tz0],
        [[0, 0], [TD * T16, 0], [TD * T16, (tz1 - tz0) * T16], [0, (tz1 - tz0) * T16]], concrete, [u[0], u[1], 0], 0);
      const f0 = S.pt(a1, 0), f1 = S.pt(a1, TD);
      mb.quad([f0[0], f0[1], tz1], [f1[0], f1[1], tz1], [f1[0], f1[1], tz0], [f0[0], f0[1], tz0],
        [[0, 0], [TD * T16, 0], [TD * T16, (tz1 - tz0) * T16], [0, (tz1 - tz0) * T16]], concrete, [-u[0], -u[1], 0], 0);
    }
    // station platform on the south side
    if (S.key === 'py') {
      const st2 = TUNNEL.station;
      const [x0, y0] = S.pt(st2[0], TD), [x1, y1] = S.pt(st2[1], TD - 0.85);
      mb.box(Math.min(x0, x1), Math.min(y0, y1), tz0, Math.max(x0, x1), Math.max(y0, y1), tz0 + 0.5,
        { py: concrete, px: concrete, nx: concrete, pz: { t: platformTop, world: true } });
    }
  }
}
