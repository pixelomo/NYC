// Static collision for things that move freely (the player on foot, driven and chasing cars):
// a fine grid of solid cells rasterised from building footprints, walls and fences, plus the
// ground height (raised sidewalks and lots vs. road level).

import { MAP, CURB } from '../world/layout.js';
import { plinthRects } from '../world/ground.js';

const RES = 4; // cells per world unit

export class Collision {
  constructor(world) {
    this.n = MAP * RES;
    this.solid = new Uint8Array(this.n * this.n);
    // what you can't see over: everything above chest height (low walls, planters and benches
    // stop you but not your view)
    this.tall = new Uint8Array(this.n * this.n);
    for (const [x0, y0, x1, y1, h] of world.solids) {
      // cover every cell the box touches (thin lamp posts and fences included)
      const cx0 = Math.max(0, Math.floor(Math.min(x0, x1) * RES)), cx1 = Math.min(this.n - 1, Math.floor(Math.max(x0, x1) * RES - 1e-6));
      const cy0 = Math.max(0, Math.floor(Math.min(y0, y1) * RES)), cy1 = Math.min(this.n - 1, Math.floor(Math.max(y0, y1) * RES - 1e-6));
      const tall = !(h < 1.3);
      for (let y = cy0; y <= cy1; y++) {
        this.solid.fill(1, y * this.n + cx0, y * this.n + cx1 + 1);
        if (tall) this.tall.fill(1, y * this.n + cx0, y * this.n + cx1 + 1);
      }
    }
    // ground height on a unit grid: kerb height on the raised plinths, 0 on the road
    this.ground = new Uint8Array(MAP * MAP);
    for (const [x0, y0, x1, y1] of plinthRects())
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(MAP, Math.ceil(y1)); y++)
        this.ground.fill(1, y * MAP + Math.max(0, Math.floor(x0)), y * MAP + Math.min(MAP, Math.ceil(x1)));
  }
  isSolid(x, y) {
    if (x < 0.3 || y < 0.3 || x > MAP - 0.3 || y > MAP - 0.3) return true; // the slab's edge
    return this.solid[Math.floor(y * RES) * this.n + Math.floor(x * RES)] === 1;
  }
  // is the segment clear? Walks every grid cell it crosses (no step to slip through a thin wall);
  // the cells holding the two ends don't count. sight = only what you can't see over.
  segClear(x0, y0, x1, y1, sight = false) {
    const n = this.n, S = sight ? this.tall : this.solid;
    let cx = Math.floor(x0 * RES), cy = Math.floor(y0 * RES);
    const ex = Math.floor(x1 * RES), ey = Math.floor(y1 * RES);
    const dx = (x1 - x0) * RES, dy = (y1 - y0) * RES, sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity;
    let tx = dx ? (sx > 0 ? cx + 1 - x0 * RES : x0 * RES - cx) * tdx : Infinity;
    let ty = dy ? (sy > 0 ? cy + 1 - y0 * RES : y0 * RES - cy) * tdy : Infinity;
    for (;;) {
      if (cx === ex && cy === ey) return true;
      if (tx >= 1 && ty >= 1) return true;
      if (tx < ty) { cx += sx; tx += tdx; } else { cy += sy; ty += tdy; }
      if (cx === ex && cy === ey) return true;
      if (cx < 1 || cy < 1 || cx >= n - 1 || cy >= n - 1 || S[cy * n + cx]) return false;
    }
  }
  // is a circle of radius r at (x, y) clear of walls?
  free(x, y, r) {
    if (this.isSolid(x, y)) return false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (this.isSolid(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false;
    }
    return true;
  }
  groundZ(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= MAP || iy >= MAP) return 0;
    return this.ground[iy * MAP + ix] ? CURB : 0;
  }
  // is (x, y) on a roadway (not raised)?
  onRoad(x, y) { return this.groundZ(x, y) === 0; }
}
