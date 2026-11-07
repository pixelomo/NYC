// The ground: a raster of what every unit of the map is (water, road, sidewalk, the other
// boroughs), the ground texture painted at T texels per unit into tiles at GT texels per unit
// (only where there's land: the renderer fills in the water), the raised sidewalks, the quays, and
// the diorama slab with its subway cut-away.

import { T, GT, MAPX, MAPY, NBX, NBY, PERIOD, SIDEWALK, ROAD, STREET, CURB, BASE_DEPTH, roadStart, roadEnd, roadCenter, interExists, legOpen, WATER_Z, BOROUGHS, ISLANDS, GROUND_EXTRA, SHORE, isManhattan } from './layout.js';
import { MAT } from './mesh.js';
import { hash2i, shade, mixc } from '../core/math.js';
import { TiledPainter } from '../core/painter.js';

export const GC = {
  ASPHALT: 1, PARKING: 2, PAINT_W: 3, PAINT_Y: 4, CROSSWALK: 5, SIDEWALK: 6, CURB: 7, GRASS: 8,
  SOIL: 9, FLOWERBED: 10, PATH: 11, COURT: 12, COURT_LINE: 13, RUBBER: 14, WATER: 15, PLAZA: 16,
  PATIO: 17, METAL: 18, BUSLANE: 19, BIKELANE: 20, SAND: 21, GRAVEL: 22, WOOD: 23, STAIRS: 24, RIVER: 25,
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

// ---- the land raster: one cell per unit -------------------------------------------------------
export const CL = { WATER: 0, ROAD: 1, RAISED: 2, BORO: 3 };
let RASTER = null;
export function landRaster() {
  if (RASTER) return RASTER;
  const W = MAPX, H = MAPY, cls = new Uint8Array(W * H);
  const fill = (x0, y0, x1, y1, v, only = -1) => {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    for (let y = y0; y < y1; y++) for (let x = x0, i = y * W + x0; x < x1; x++, i++) if (only < 0 || cls[i] === only) cls[i] = v;
  };
  const P = PERIOD;
  // Manhattan: every block with the streets round it, raised to the kerb...
  for (let by = 0; by < NBY; by++) for (let bx = 0; bx < NBX; bx++) if (isManhattan(bx, by)) fill(bx * P, by * P, bx * P + P + STREET, by * P + P + STREET, CL.RAISED);
  // ...but for the roadways: the intersections and the stretches of road between them
  for (let i = 0; i <= NBX; i++)
    for (let j = 0; j <= NBY; j++) {
      if (!interExists(i, j)) continue;
      fill(roadStart(i), roadStart(j), roadEnd(i), roadEnd(j), CL.ROAD);
      if (legOpen(i, j, 1, 0)) fill(roadEnd(i), roadStart(j), roadStart(i + 1), roadEnd(j), CL.ROAD);
      if (legOpen(i, j, 0, 1)) fill(roadStart(i), roadEnd(j), roadEnd(i), roadStart(j + 1), CL.ROAD);
    }
  for (const r of ISLANDS) fill(r.x0, r.y0, r.x1, r.y1, CL.RAISED, CL.WATER);
  // the other boroughs fill their regions, keeping a river's width from Manhattan and the islands
  const near = dilate(cls, W, H, SHORE);
  for (const b of BOROUGHS) {
    const x0 = Math.max(0, b.x0), x1 = Math.min(W, b.x1), y0 = Math.max(0, b.y0), y1 = Math.min(H, b.y1);
    const v = b.ground ? CL.RAISED : CL.BORO;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (cls[i] === CL.WATER && !near[i]) cls[i] = v; }
  }
  RASTER = { W, H, cls };
  return RASTER;
}
// cells within r (in either axis) of land
function dilate(cls, W, H, r) {
  const a = new Uint8Array(W * H), b = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = -r; x < W; x++) {
      if (x + r < W && cls[y * W + x + r]) n++;
      if (x - r - 1 >= 0 && cls[y * W + x - r - 1]) n--;
      if (x >= 0) a[y * W + x] = n > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < W; x++) {
    let n = 0;
    for (let y = -r; y < H; y++) {
      if (y + r < H && a[(y + r) * W + x]) n++;
      if (y - r - 1 >= 0 && a[(y - r - 1) * W + x]) n--;
      if (y >= 0) b[y * W + x] = n > 0 ? 1 : 0;
    }
  }
  return b;
}
export function clsAt(x, y) {
  const R = landRaster();
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= R.W || y >= R.H) return CL.WATER;
  return R.cls[y * R.W + x];
}
// height of the ground's top in each class
export const clsZ = (c) => (c === CL.WATER ? WATER_Z : c === CL.ROAD ? 0 : CURB);
// no road here: water, the other boroughs, or a sidewalk (within m of one)
export const inParkPlinth = (x, y, m = 0) => {
  for (const [dx, dy] of [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]]) if (clsAt(x + dx, y + dy) !== CL.ROAD) return true;
  return false;
};
// The cells of the classes pred accepts, as rectangles [x0, y0, x1, y1] (runs along each row,
// merged down the rows while they keep the same ends)
export function rectsOf(pred) {
  const { W, H, cls } = landRaster();
  const out = [];
  let open = new Map();
  for (let y = 0; y <= H; y++) {
    const next = new Map();
    if (y < H) {
      let x = 0;
      while (x < W) {
        if (!pred(cls[y * W + x])) { x++; continue; }
        const a = x;
        while (x < W && pred(cls[y * W + x])) x++;
        const k = a * 65536 + x;
        if (open.has(k)) { next.set(k, open.get(k)); open.delete(k); } else next.set(k, y);
      }
    }
    for (const [k, y0] of open) out.push([Math.floor(k / 65536), y0, k % 65536, y]);
    open = next;
  }
  return out;
}
// Where the class changes: [x0, y0, x1, y1, a, b] with a the class on the low side (-x or -y) and
// b on the high side, runs merged along each line
export function boundaries() {
  const { W, H, cls } = landRaster();
  const out = [];
  for (let x = 1; x < W; x++) {
    let y = 0;
    while (y < H) {
      const a = cls[y * W + x - 1], b = cls[y * W + x];
      if (a === b) { y++; continue; }
      const y0 = y;
      while (y < H && cls[y * W + x - 1] === a && cls[y * W + x] === b) y++;
      out.push([x, y0, x, y, a, b]);
    }
  }
  for (let y = 1; y < H; y++) {
    let x = 0;
    while (x < W) {
      const a = cls[(y - 1) * W + x], b = cls[y * W + x];
      if (a === b) { x++; continue; }
      const x0 = x;
      while (x < W && cls[(y - 1) * W + x] === a && cls[y * W + x] === b) x++;
      out.push([x0, y, x, y, a, b]);
    }
  }
  return out;
}
// (for the collision grid's kerbs and for anything else that wants the raised areas as boxes)
export const plinthRects = () => rectsOf((c) => c === CL.RAISED || c === CL.BORO);

// ---- the ground texture's tiles -----------------------------------------------------------------
export const GTILE = 32; // units per tile
export function makeGroundTiles() {
  const { W, H, cls } = landRaster();
  const ntx = Math.ceil(MAPX / GTILE), nty = Math.ceil(MAPY / GTILE), size = GTILE * GT;
  const slots = new Int32Array(ntx * nty).fill(-1), data = [];
  for (let ty = 0; ty < nty; ty++)
    for (let tx = 0; tx < ntx; tx++) {
      const x0 = tx * GTILE, y0 = ty * GTILE, x1 = Math.min(W, x0 + GTILE), y1 = Math.min(H, y0 + GTILE);
      let need = GROUND_EXTRA.some((r) => r.x1 > x0 && r.x0 < x1 && r.y1 > y0 && r.y0 < y1);
      for (let y = y0; y < y1 && !need; y++) for (let x = x0; x < x1; x++) { const c = cls[y * W + x]; if (c === CL.ROAD || c === CL.RAISED) { need = true; break; } }
      if (!need) continue;
      slots[ty * ntx + tx] = data.length;
      data.push(new Uint8Array(size * size * 4));
    }
  return { ntx, nty, size, slots, data };
}
export function makeGroundPainter(tiles) { return new TiledPainter(tiles, MAPX * T, MAPY * T); }

// ---- painting -----------------------------------------------------------------------------------
export function paintGround(region, rng) {
  const p = region.p, tiles = region.tiles;
  const _t = [performance.now()], _m = (n) => { _t.push(performance.now()); _t.push(n); };
  const NX = MAPX * T, NY = MAPY * T;
  const { W, cls } = landRaster();
  const at = (x, y) => cls[Math.floor(y) * W + Math.floor(x)];
  // 1. asphalt everywhere there are texels (written straight into the tiles: one texel = two art texels)
  const cellsX = Math.ceil(NX / 64), cellsY = Math.ceil(NY / 64);
  const big = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < big.length; i++) big[i] = hash2i(i % cellsX, (i / cellsX) | 0, 12) - 0.5;
  const ar = (COL.asphalt >> 16) & 255, ag = (COL.asphalt >> 8) & 255, ab = COL.asphalt & 255;
  const S = tiles.size;
  for (let ty = 0; ty < tiles.nty; ty++)
    for (let tx = 0; tx < tiles.ntx; tx++) {
      const slot = tiles.slots[ty * tiles.ntx + tx];
      if (slot < 0) continue;
      const d = tiles.data[slot];
      for (let Y = 0; Y < S; Y++) {
        const y = (ty * S + Y) * 2, row = (y >> 6) * cellsX;
        let i = Y * S * 4;
        for (let X = 0; X < S; X++, i += 4) {
          const x = (tx * S + X) * 2;
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
    }
  // repaving patches, cracks and oil stains, on the roads
  const roadPick = () => {
    for (let k = 0; k < 30; k++) { const x = rng.range(0, MAPX), y = rng.range(0, MAPY); if (at(x, y) === CL.ROAD) return [x * T, y * T]; }
    return null;
  };
  for (let i = 0; i < 420; i++) {
    const q = roadPick(); if (!q) continue;
    const w = rng.int(24, 140), h = rng.int(20, 80), x = Math.round(q[0]), y = Math.round(q[1]);
    for (let yy = 0; yy < h; yy += 2)
      for (let xx = 0; xx < w; xx += 2) {
        if (p.getA(x + xx, y + yy) !== GC.ASPHALT) continue;
        const edge = xx < 2 || yy < 2 || xx >= w - 2 || yy >= h - 2;
        p.set(x + xx, y + yy, edge ? 0x2f3138 : shade(COL.asphaltPatch, 0.95 + hash2i(x + xx, y + yy, 19) * 0.1), GC.ASPHALT);
      }
  }
  for (let i = 0; i < 1000; i++) {
    const q = roadPick(); if (!q) continue;
    let [x, y] = q.map(Math.round);
    const len = rng.int(10, 60);
    let dx = rng.int(-1, 1);
    const dy = rng.chance(0.5) ? 1 : -1;
    for (let k = 0; k < len; k++) {
      if (p.getA(x, y) === GC.ASPHALT) p.set(x, y, 0x30323a, GC.ASPHALT);
      if (rng.chance(0.3)) dx = rng.int(-1, 1);
      x += dx; y += dy;
    }
  }
  for (let i = 0; i < 640; i++) {
    const q = roadPick(); if (!q) continue;
    const rx = rng.range(4, 10), ry = rng.range(3, 8);
    p.ellipse(q[0], q[1], rx, ry, 0x41444d, GC.ASPHALT);
    p.ellipse(q[0] + 1, q[1], rx * 0.6, ry * 0.6, COL.asphaltDark, GC.ASPHALT);
  }

  _m('asphalt');
  // 2. parking lanes along every stretch of road
  const pw = Math.round(1.1 * T);
  for (let i = 0; i <= NBX; i++)
    for (let j = 0; j <= NBY; j++) {
      if (legOpen(i, j, 1, 0)) {
        const a = roadEnd(i) * T, b = roadStart(i + 1) * T, rs = roadStart(j) * T, re = roadEnd(j) * T;
        markBand(p, a, rs, b - a, pw, GC.PARKING); markBand(p, a, re - pw, b - a, pw, GC.PARKING);
      }
      if (legOpen(i, j, 0, 1)) {
        const a = roadEnd(j) * T, b = roadStart(j + 1) * T, rs = roadStart(i) * T, re = roadEnd(i) * T;
        markBand(p, rs, a, pw, b - a, GC.PARKING); markBand(p, re - pw, a, pw, b - a, GC.PARKING);
      }
    }
  // centre double-yellow lines between intersections (3px lines, 4px gap)
  const paintLine = (x, y, w, h, c, code) => {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const worn = hash2i(xx >> 2, yy >> 2, 77) < 0.08;
        p.set(xx, yy, worn ? mixc(c, 0x55565c, 0.55) : shade(c, 0.94 + hash2i(xx, yy, 78) * 0.1), code);
      }
  };
  for (let i = 0; i <= NBX; i++)
    for (let j = 0; j <= NBY; j++) {
      if (legOpen(i, j, 1, 0)) {
        const rc = Math.round(roadCenter(j) * T), a = (i * PERIOD + STREET) * T + 16, b = (i + 1) * PERIOD * T - 16;
        paintLine(a, rc - 5, b - a, 3, COL.yellow, GC.PAINT_Y); paintLine(a, rc + 2, b - a, 3, COL.yellow, GC.PAINT_Y);
      }
      if (legOpen(i, j, 0, 1)) {
        const rc = Math.round(roadCenter(i) * T), a = (j * PERIOD + STREET) * T + 16, b = (j + 1) * PERIOD * T - 16;
        paintLine(rc - 5, a, 3, b - a, COL.yellow, GC.PAINT_Y); paintLine(rc + 2, a, 3, b - a, COL.yellow, GC.PAINT_Y);
      }
    }
  // stop lines & crosswalks wherever a road leaves an intersection
  for (let i = 0; i <= NBX; i++)
    for (let j = 0; j <= NBY; j++) {
      if (!interExists(i, j)) continue;
      const x0 = roadStart(i) * T, x1 = roadEnd(i) * T;
      const y0 = roadStart(j) * T, y1 = roadEnd(j) * T;
      const sx0 = (i * PERIOD) * T, sx1 = (i * PERIOD + 2 * SIDEWALK + ROAD) * T;
      const sy0 = (j * PERIOD) * T, sy1 = (j * PERIOD + 2 * SIDEWALK + ROAD) * T;
      const rcx = roadCenter(i) * T, rcy = roadCenter(j) * T;
      if (legOpen(i, j, 0, -1)) { zebra(p, x0, sy0 + 6, x1 - x0, y0 - sy0 - 12, 'v'); paintLine(x0 + 4, sy0 - 9, rcx - x0 - 8, 6, COL.white, GC.PAINT_W); }
      if (legOpen(i, j, 0, 1)) { zebra(p, x0, y1 + 6, x1 - x0, sy1 - y1 - 12, 'v'); paintLine(rcx + 4, sy1 + 3, x1 - rcx - 8, 6, COL.white, GC.PAINT_W); }
      if (legOpen(i, j, -1, 0)) { zebra(p, sx0 + 6, y0, x0 - sx0 - 12, y1 - y0, 'h'); paintLine(sx0 - 9, rcy + 4, 6, y1 - rcy - 8, COL.white, GC.PAINT_W); }
      if (legOpen(i, j, 1, 0)) { zebra(p, x1 + 6, y0, sx1 - x1 - 12, y1 - y0, 'h'); paintLine(sx1 + 3, y0 + 4, 6, rcy - y0 - 8, COL.white, GC.PAINT_W); }
    }

  _m('markings');
  // 3. sidewalks over everything raised, then the kerbs along the roads and the coping along the quays
  for (const [ax, ay, bx, by] of rectsOf((c) => c === CL.RAISED)) paintSidewalkRect(p, ax * T, ay * T, (bx - ax) * T, (by - ay) * T, rng);
  for (const [x0, y0, x1, y1, a, b] of boundaries()) {
    const lo = a === CL.RAISED ? 'a' : b === CL.RAISED ? 'b' : null;
    if (!lo || (a !== CL.ROAD && b !== CL.ROAD && a !== CL.WATER && b !== CL.WATER)) continue;
    if (x0 === x1) {
      const X = x0 * T, w = (y1 - y0) * T;
      if (lo === 'a') { p.rect(X - 2, y0 * T, 2, w, COL.curb, GC.CURB); p.rect(X - 3, y0 * T, 1, w, 0xb4b1a9, GC.CURB); }
      else { p.rect(X, y0 * T, 2, w, COL.curb, GC.CURB); p.rect(X + 2, y0 * T, 1, w, 0xb4b1a9, GC.CURB); }
    } else {
      const Y = y0 * T, w = (x1 - x0) * T;
      if (lo === 'a') { p.rect(x0 * T, Y - 2, w, 2, COL.curb, GC.CURB); p.rect(x0 * T, Y - 3, w, 1, 0xb4b1a9, GC.CURB); }
      else { p.rect(x0 * T, Y, w, 2, COL.curb, GC.CURB); p.rect(x0 * T, Y + 2, w, 1, 0xb4b1a9, GC.CURB); }
    }
  }

  _m('sidewalks');
  // 4. manholes in the roads, storm drains along the kerbs by the corners
  const manholes = [];
  for (let i = 0; i <= NBX; i++)
    for (let j = 0; j <= NBY; j++) {
      for (const axis of ['x', 'y']) {
        const open = axis === 'x' ? legOpen(i, j, 1, 0) : legOpen(i, j, 0, 1);
        if (!open) continue;
        const along = (axis === 'x' ? i : j) * PERIOD + 9 + rng.range(3, 15);
        const off = roadCenter(axis === 'x' ? j : i) + rng.pick([-0.7, 0.7, 0]);
        const wx = axis === 'x' ? along : off, wy = axis === 'x' ? off : along;
        if (inParkPlinth(wx, wy, 0.5)) continue;
        manhole(p, wx * T, wy * T, rng);
        manholes.push({ x: wx, y: wy, axis });
      }
    }
  for (let i = 0; i <= NBX; i++)
    for (let j = 0; j <= NBY; j++) {
      if (!interExists(i, j)) continue;
      const rcx = roadCenter(i) * T, rcy = roadCenter(j) * T;
      const h = (ROAD / 2) * T;
      for (const [gx, gy, vert] of [[rcx - h + 2, rcy - h - 70, true], [rcx + h - 14, rcy + h + 58, true], [rcx - h - 70, rcy + h - 14, false], [rcx + h + 58, rcy - h + 2, false]]) {
        if (inParkPlinth((gx + 6) / T, (gy + 6) / T, 0.2)) continue;
        const w = vert ? 12 : 22, hh = vert ? 22 : 12;
        p.rect(gx, gy, w, hh, 0x26272b, GC.METAL);
        for (let t = 2; t < (vert ? hh : w) - 1; t += 3) {
          if (vert) p.rect(gx + 2, gy + t, w - 4, 1, 0x4c4d52, GC.METAL);
          else p.rect(gx + t, gy + 2, 1, hh - 4, 0x4c4d52, GC.METAL);
        }
      }
    }
  // 5. the water in tiles that also hold land (the shader animates it; the rivers never freeze)
  for (let ty = 0; ty < tiles.nty; ty++)
    for (let tx = 0; tx < tiles.ntx; tx++) {
      if (tiles.slots[ty * tiles.ntx + tx] < 0) continue;
      for (let y = ty * GTILE; y < Math.min(MAPY, (ty + 1) * GTILE); y++)
        for (let x = tx * GTILE; x < Math.min(MAPX, (tx + 1) * GTILE); x++) {
          const c = cls[y * W + x];
          if (c === CL.WATER || c === CL.BORO) p.rect(x * T, y * T, T, T, 0x2a5a70, GC.RIVER);
        }
    }
  _m('water');
  const prof = []; for (let k = 1; k < _t.length; k += 2) prof.push(`${_t[k + 1]} ${Math.round(_t[k] - _t[k - 1 > 0 ? k - 2 : 0])}`);
  void NY;
  return { manholes, prof: prof.join(', ') };
}

function markBand(p, x, y, w, h, code) {
  const st = p.half ? 2 : 1;
  for (let yy = y; yy < y + h; yy += st)
    for (let xx = x; xx < x + w; xx += st) {
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

const SWP = 768;
let SWT = null;
function sidewalkPatch() {
  if (SWT) return SWT;
  SWT = new Int32Array(SWP * SWP);
  for (let y = 0; y < SWP; y++) for (let x = 0; x < SWP; x++) SWT[y * SWP + x] = sidewalkTexel(x * 2, y * 2);
  return SWT;
}
function sidewalkTexel(gx, gy) {
  const S = 24; // slab size (0.75 units)
  const hh = hash2i(gx, gy, 31);
  const slab = hash2i(Math.floor(gx / S), Math.floor(gy / S), 33);
  let c = shade(COL.sidewalk, 0.955 + hh * 0.07);
  if (slab < 0.12) c = shade(c, 0.93);
  else if (slab > 0.94) c = mixc(c, 0xd9d2c0, 0.4);
  else if (slab > 0.9) c = mixc(c, 0xb8b4aa, 0.35);
  const lx = gx % S, ly = gy % S;
  if (lx < 2 || ly < 2) c = lx === 0 || ly === 0 ? COL.sidewalkDark : shade(c, 1.05);
  else if (lx >= S - 2 || ly >= S - 2) c = shade(c, 0.95);
  if (hh > 0.995) c = shade(c, 0.85); // grit
  return c;
}
function paintSidewalkRect(p, x, y, w, h, rng) {
  const S = 24; // slab size (0.75 units)
  const st = p.half ? 2 : 1;
  if (p.tiles) {
    // straight into the tiles (one ground texel per two art texels), from a precomputed patch of
    // paving 48 units square
    const t = p.tiles, sh = p.shift, m = p.mask, SW = sidewalkPatch(), PP = SWP;
    for (let GY = Math.max(0, y >> 1); GY < (y + h) >> 1; GY++) {
      const row = (GY >> sh) * t.ntx, base = (GY & m) << sh;
      for (let GX = Math.max(0, x >> 1); GX < (x + w) >> 1; GX++) {
        const slot = t.slots[row + (GX >> sh)];
        if (slot < 0) continue;
        const d = t.data[slot], i = (base + (GX & m)) * 4, c = SW[(GY % PP) * PP + (GX % PP)];
        d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = GC.SIDEWALK;
      }
    }
  } else for (let yy = 0; yy < h; yy += st)
    for (let xx = 0; xx < w; xx += st) {
      const gx = x + xx, gy = y + yy;
      const hh = hash2i(gx, gy, 31);
      const slab = hash2i(Math.floor(gx / S), Math.floor(gy / S), 33);
      let c = shade(COL.sidewalk, 0.955 + hh * 0.07);
      if (slab < 0.12) c = shade(c, 0.93);
      else if (slab > 0.94) c = mixc(c, 0xd9d2c0, 0.4);
      else if (slab > 0.9) c = mixc(c, 0xb8b4aa, 0.35);
      const lx = gx % S, ly = gy % S;
      if (lx < 2 || ly < 2) c = lx === 0 || ly === 0 ? COL.sidewalkDark : shade(c, 1.05);
      else if (lx >= S - 2 || ly >= S - 2) c = shade(c, 0.95);
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
  // gum spots
  const n = Math.floor((w * h) / 900);
  for (let i = 0; i < n; i++) {
    const gx = x + rng.int(4, w - 6), gy = y + rng.int(4, h - 6);
    p.rect(gx, gy, 2, 2, rng.chance(0.5) ? 0x9a978f : 0x8c8982, GC.SIDEWALK);
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
  const st = p.half ? 2 : 1;
  for (let y = Math.round(y0 * T); y < Math.round(y1 * T); y += st)
    for (let x = Math.round(x0 * T); x < Math.round(x1 * T); x += st) {
      const r = fn(x, y);
      if (r) p.set(x, y, r[0], r[1]);
    }
}

// Geometry for the ground: the roads at 0, the sidewalks and the other boroughs raised to the kerb,
// the water a little below, and between them the kerbs and the granite quays
export function buildGroundGeometry(mb, ground, tex, quay, boroTex) {
  const gm = MAT.GROUND | MAT.SNOW | MAT.WET;
  for (const [x0, y0, x1, y1] of rectsOf((c) => c === CL.ROAD)) mb.box(x0, y0, -BASE_DEPTH, x1, y1, 0, { pz: { t: ground, world: true, mat: gm } });
  for (const [x0, y0, x1, y1] of rectsOf((c) => c === CL.RAISED)) mb.box(x0, y0, -BASE_DEPTH, x1, y1, CURB, { pz: { t: ground, world: true, mat: gm } });
  for (const [x0, y0, x1, y1] of rectsOf((c) => c === CL.BORO)) mb.box(x0, y0, -BASE_DEPTH, x1, y1, CURB, { pz: { t: boroTex, world: true, mat: MAT.SNOW | MAT.WET } });
  for (const [x0, y0, x1, y1] of rectsOf((c) => c === CL.WATER)) mb.box(x0, y0, -BASE_DEPTH, x1, y1, WATER_Z, { pz: { t: ground, world: true, mat: MAT.GROUND } });
  for (const [x0, y0, x1, y1, a, b] of boundaries()) {
    const za = clsZ(a), zb = clsZ(b);
    if (za === zb) continue;
    const hi = Math.max(za, zb), lo = Math.min(za, zb), H = (hi - lo) * T, L = (x1 - x0 + y1 - y0) * T;
    const t = lo === WATER_Z ? quay : tex.curb;
    const uv = [[0, 0], [L, 0], [L, H], [0, H]];
    if (x0 === x1) {
      if (za > zb) mb.quad([x0, y1, hi], [x0, y0, hi], [x0, y0, lo], [x0, y1, lo], uv, t, [1, 0, 0], 0); // facing +x
      else mb.quad([x0, y0, hi], [x0, y1, hi], [x0, y1, lo], [x0, y0, lo], uv, t, [-1, 0, 0], 0);
    } else if (za > zb) mb.quad([x0, y0, hi], [x1, y0, hi], [x1, y0, lo], [x0, y0, lo], uv, t, [0, 1, 0], 0); // facing +y
    else mb.quad([x1, y0, hi], [x0, y0, hi], [x0, y0, lo], [x1, y0, lo], uv, t, [0, -1, 0], 0);
  }
}
// The edges of the land that face the water, as [ax, ay, bx, by, normal] (the normal points out
// over the water), for the railings along the quays
export function quayEdges() {
  const out = [];
  for (const [x0, y0, x1, y1, a, b] of boundaries()) {
    const wa = a === CL.WATER, wb = b === CL.WATER;
    if (wa === wb) continue;
    if (!(a === CL.RAISED || b === CL.RAISED || a === CL.BORO || b === CL.BORO)) continue;
    const boro = a === CL.BORO || b === CL.BORO;
    out.push(x0 === x1 ? [x0, y0, x1, y1, [wb ? 1 : -1, 0], boro] : [x0, y0, x1, y1, [0, wb ? 1 : -1], boro]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diorama sides with a subway tunnel cut-away running around the perimeter
export const TUNNEL = { z0: -4.4, z1: -0.75, depth: 2.4, a0: 3, station: [14, 34] };

export function buildSlabSides(mb, atlas, tex) {
  const T16 = T;
  const { z0: tz0, z1: tz1, depth: TD, a0 } = TUNNEL;
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
    { key: 'py', n: [0, 1], len: MAPX, pt: (a, d) => [a, MAPY - d] },
    { key: 'ny', n: [0, -1], len: MAPX, pt: (a, d) => [MAPX - a, d] },
    { key: 'px', n: [1, 0], len: MAPY, pt: (a, d) => [MAPX - d, MAPY - a] },
    { key: 'nx', n: [-1, 0], len: MAPY, pt: (a, d) => [d, a] },
  ];
  const quadSide = (S, aa0, aa1, d, zz0, zz1, texr, mat = 0) => {
    const p0 = S.pt(aa0, d), p1 = S.pt(aa1, d);
    const u0 = aa0 * T16, u1 = aa1 * T16, v0 = -zz1 * T16, v1 = -zz0 * T16;
    mb.quad([p0[0], p0[1], zz1], [p1[0], p1[1], zz1], [p1[0], p1[1], zz0], [p0[0], p0[1], zz0],
      [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], texr, [S.n[0], S.n[1], 0], mat);
  };
  for (const S of sides) {
    const MAP = S.len, a1 = MAP - 3;
    // soil face above the tunnel, up to whatever meets the edge: the water, a road, a sidewalk
    let a = 0;
    while (a < MAP) {
      const [x, y] = S.pt(a + 0.5, 0.5), z = clsZ(clsAt(x, y));
      let b = a + 1;
      while (b < MAP) { const [x2, y2] = S.pt(b + 0.5, 0.5); if (clsZ(clsAt(x2, y2)) !== z) break; b++; }
      quadSide(S, a, b, 0, tz1, z, soil);
      a = b;
    }
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
