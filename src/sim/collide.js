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
    for (const [x0, y0, x1, y1] of world.solids) {
      // cover every cell the box touches (thin lamp posts and fences included)
      const cx0 = Math.max(0, Math.floor(Math.min(x0, x1) * RES)), cx1 = Math.min(this.n - 1, Math.floor(Math.max(x0, x1) * RES - 1e-6));
      const cy0 = Math.max(0, Math.floor(Math.min(y0, y1) * RES)), cy1 = Math.min(this.n - 1, Math.floor(Math.max(y0, y1) * RES - 1e-6));
      for (let y = cy0; y <= cy1; y++) this.solid.fill(1, y * this.n + cx0, y * this.n + cx1 + 1);
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
