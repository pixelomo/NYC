// Static collision for things that move freely (the player on foot, driven and chasing cars):
// a fine grid of solid cells rasterised from building footprints, walls and fences, plus the
// ground height (raised sidewalks and lots vs. road level).

import { MAPX, MAPY, CURB } from '../world/layout.js';
import { landRaster, CL } from '../world/ground.js';

const RES = 4; // cells per world unit

export class Collision {
  constructor(world) {
    this.nx = MAPX * RES; this.ny = MAPY * RES;
    this.n = this.nx;
    const n = this.nx;
    this.solid = new Uint8Array(this.nx * this.ny);
    // what you can't see over: everything above chest height (low walls, planters and benches
    // stop you but not your view)
    this.tall = new Uint8Array(this.nx * this.ny);
    for (const [x0, y0, x1, y1, h] of world.solids) {
      // cover every cell the box touches (thin lamp posts and fences included)
      const cx0 = Math.max(0, Math.floor(Math.min(x0, x1) * RES)), cx1 = Math.min(this.nx - 1, Math.floor(Math.max(x0, x1) * RES - 1e-6));
      const cy0 = Math.max(0, Math.floor(Math.min(y0, y1) * RES)), cy1 = Math.min(this.ny - 1, Math.floor(Math.max(y0, y1) * RES - 1e-6));
      if (cx1 < cx0 || cy1 < cy0) continue;
      const tall = !(h < 1.3);
      for (let y = cy0; y <= cy1; y++) {
        this.solid.fill(1, y * n + cx0, y * n + cx1 + 1);
        if (tall) this.tall.fill(1, y * n + cx0, y * n + cx1 + 1);
      }
    }
    // the water and the other boroughs are out of bounds; the ground height on a unit grid is the
    // kerb on the raised sidewalks, 0 on the road
    const R = landRaster();
    this.ground = new Uint8Array(MAPX * MAPY);
    for (let y = 0; y < MAPY; y++)
      for (let x = 0; x < MAPX; x++) {
        const c = R.cls[y * MAPX + x];
        if (c === CL.RAISED || c === CL.BORO) this.ground[y * MAPX + x] = 1;
        if (c === CL.WATER || c === CL.BORO) for (let yy = 0; yy < RES; yy++) this.solid.fill(1, (y * RES + yy) * n + x * RES, (y * RES + yy) * n + x * RES + RES);
      }
  }
  // a walkway over the water (the bridges): clear it again
  clear(x0, y0, x1, y1) {
    const n = this.nx;
    for (let y = Math.max(0, Math.floor(y0 * RES)); y < Math.min(this.ny, Math.ceil(y1 * RES)); y++) this.solid.fill(0, y * n + Math.max(0, Math.floor(x0 * RES)), y * n + Math.min(n, Math.ceil(x1 * RES)));
  }
  isSolid(x, y) {
    if (x < 0.3 || y < 0.3 || x > MAPX - 0.3 || y > MAPY - 0.3) return true; // the slab's edge
    return this.solid[Math.floor(y * RES) * this.nx + Math.floor(x * RES)] === 1;
  }
  // is the segment clear? Walks every grid cell it crosses (no step to slip through a thin wall);
  // the cells holding the two ends don't count. sight = only what you can't see over.
  segClear(x0, y0, x1, y1, sight = false) {
    const n = this.nx, ny = this.ny, S = sight ? this.tall : this.solid;
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
      if (cx < 1 || cy < 1 || cx >= n - 1 || cy >= ny - 1 || S[cy * n + cx]) return false;
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
    if (ix < 0 || iy < 0 || ix >= MAPX || iy >= MAPY) return 0;
    return this.ground[iy * MAPX + ix] ? CURB : 0;
  }
  // is (x, y) on a roadway (not raised)?
  onRoad(x, y) { return this.groundZ(x, y) === 0; }
}
