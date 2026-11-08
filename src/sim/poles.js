// Street lamps and traffic-signal poles that a car can knock over. Their geometry lives in the
// static mesh (tagged per kind); a knocked one is hidden there by the renderer and redrawn here,
// falling in the direction the car was going and lying across the sidewalk or the street. Its lamp
// goes dark, its signals go out, and after a while (out of sight) the city puts it back up.

import { CURB } from '../world/layout.js';
import { MeshBuilder } from '../world/mesh.js';
import { beam } from '../world/props.js';
import { RNG } from '../core/math.js';

const CELL = 4;
const MAX_DOWN = 48;
const LIE = 1.5; // radians from upright when it lies on the ground

export class Poles {
  constructor(city) {
    this.city = city;
    this.rng = new RNG(4242);
    this.list = city.world.poles || [];
    this.grid = new Map();
    for (const p of this.list) {
      p.down = false;
      const k = this.key(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
      (this.grid.get(k) || this.grid.set(k, []).get(k)).push(p);
    }
    this.fallen = []; // knocked, in the order they fell
    this.dirty = false;
  }
  key(i, j) { return i * 100003 + j; }
  near(x, y, r) {
    const out = [];
    for (let j = Math.floor((y - r) / CELL); j <= Math.floor((y + r) / CELL); j++)
      for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
        const l = this.grid.get(this.key(i, j));
        if (l) for (const p of l) out.push(p);
      }
    return out;
  }
  // a free car moving through: knock over any pole its body overlaps (a slow nudge just stops it)
  carHit(c) {
    const sp = Math.hypot(c.vx || 0, c.vy || 0);
    if (sp < 0.4) return;
    const ch = Math.cos(c.h), sh = Math.sin(c.h), hl = c.len / 2 + 0.1, hw = c.wid / 2 + 0.1;
    for (const p of this.near(c.x, c.y, hl + 0.5)) {
      if (p.down) continue;
      const dx = p.x - c.x, dy = p.y - c.y;
      const lx = dx * ch + dy * sh, ly = -dx * sh + dy * ch;
      if (Math.abs(lx) > hl || Math.abs(ly) > hw) continue;
      if (sp < 2.5) {
        // too slow to bring it down: bump off it
        const d = Math.hypot(dx, dy) || 1, vn = (c.vx * dx + c.vy * dy) / d;
        if (vn > 0) { c.vx -= (vn * 1.3 * dx) / d; c.vy -= (vn * 1.3 * dy) / d; }
        continue;
      }
      this.knock(p, Math.atan2(c.vy, c.vx) + this.rng.range(-0.35, 0.35), sp);
      // it costs the car some speed and a dent
      c.vx *= 0.82; c.vy *= 0.82;
      this.city.vehicles?.damage?.(c, p.x, p.y, -c.vx / sp, -c.vy / sp, Math.min(4, sp * 0.25), null);
      this.city.particles?.sparks(p.x, p.y, CURB + 0.4, 8);
      this.city.audio?.event('crash', { x: p.x, y: p.y, z: 0.5, k: 2.6 });
    }
  }
  knock(p, ang, sp) {
    p.down = true;
    p.dir = ang; p.th = 0.05; p.om = 0.6 + sp * 0.12; p.settled = false; p.downAt = this.city.time;
    if (p.lamp) p.lamp.off = true;
    if (p.head) p.head.off = true;
    if (p.signals) for (const s of p.signals) s.off = true;
    if (p.perch) p.perch.off = true;
    this.fallen.push(p);
    while (this.fallen.length > MAX_DOWN) this.raise(this.fallen[0]);
    this.dirty = true;
  }
  raise(p) {
    p.down = false;
    if (p.lamp) p.lamp.off = false;
    if (p.head) p.head.off = false;
    if (p.signals) for (const s of p.signals) s.off = false;
    if (p.perch) p.perch.off = false;
    this.fallen.splice(this.fallen.indexOf(p), 1);
    this.dirty = true;
  }
  update(dt) {
    const t = this.city.time, cam = this.city.camera;
    for (const p of [...this.fallen]) {
      if (!p.settled) {
        // topple: gravity pulls harder the further over it leans; a little bounce when it lands
        p.om += (9 / p.h) * Math.sin(p.th + 0.08) * dt * 1.6;
        p.th += p.om * dt;
        if (p.th >= LIE) {
          p.th = LIE;
          if (p.om > 1.2) { p.om = -p.om * 0.22; this.city.audio?.event('crash', { x: p.x, y: p.y, z: 0.3, k: 1.4 }); }
          else { p.om = 0; p.settled = true; }
        }
        this.dirty = true;
      } else if (t - p.downAt > 150 && Math.hypot(p.x - cam.x, p.y - cam.y) > 90) this.raise(p);
    }
    if (this.dirty) { this.rebuild(); this.dirty = false; }
  }
  // the hidden list for the shader and the fallen poles' mesh
  rebuild() {
    const R = this.city.renderer, W = this.city.world, T = W.poleTex;
    const n = Math.min(MAX_DOWN, this.fallen.length);
    R.down.fill(0);
    for (let i = 0; i < n; i++) {
      const p = this.fallen[i];
      R.down.set([p.x, p.y, p.kind === 'lamp' ? 1.5 : 0.75, p.tag], i * 4);
    }
    R.downN = n;
    if (!T || !n) { R.setDynamic(null); return; }
    const mb = new MeshBuilder();
    const C = { mb };
    for (let i = 0; i < n; i++) {
      const p = this.fallen[i];
      // upright-frame point (relative to the base) -> world, leaning by th towards dir
      const fx = Math.cos(p.dir), fy = Math.sin(p.dir), ct = Math.cos(p.th), st = Math.sin(p.th);
      const W2 = (u, v, z) => {
        const a = u * fx + v * fy, b = -u * fy + v * fx; // along / across the fall
        const a2 = a * ct + z * st, z2 = -a * st + z * ct;
        return [p.x + a2 * fx - b * fy, p.y + a2 * fy + b * fx, CURB + Math.max(-CURB + 0.05, z2)];
      };
      const bm = (a, b, w, tex) => beam(C, W2(...a), W2(...b), w, tex);
      if (p.kind === 'lamp') {
        bm([0, 0, 0], [0, 0, p.h], 0.14, T.pole);
        bm([0, 0, 0], [0, 0, 0.5], 0.22, T.pole);
        bm([0, 0, p.h - 0.04], [p.ax * 1.1, p.ay * 1.1, p.h - 0.04], 0.08, T.pole);
        bm([p.ax * 0.85, p.ay * 0.85, p.h - 0.11], [p.ax * 1.22, p.ay * 1.22, p.h - 0.11], 0.2, T.lampHead);
      } else {
        bm([0, 0, 0], [0, 0, p.h], 0.12, T.poleDark);
        bm([-0.5, 0, p.h - 0.07], [0.5, 0, p.h - 0.07], 0.14, T.streetSign);
        bm([0, -0.5, p.h + 0.1], [0, 0.5, p.h + 0.1], 0.14, T.streetSign);
        const hz = p.h - 1.05;
        if (!p.closedX) bm([p.sx * 0.05, -p.sy * 0.18, hz], [p.sx * 0.05, -p.sy * 0.18, hz + 0.75], 0.24, T.sigHead);
        if (!p.closedY) bm([-p.sx * 0.18, p.sy * 0.05, hz - 0.1], [-p.sx * 0.18, p.sy * 0.05, hz + 0.65], 0.24, T.sigHead);
        bm([-p.sx * 0.12, 0, 1.6], [-p.sx * 0.12, 0, 1.98], 0.2, T.pedHead);
      }
    }
    R.setDynamic(mb.finish());
  }
}
