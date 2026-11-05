// Subway trains looping through the tunnel cut-away around the diorama, with a station platform.

import { MAP } from '../world/layout.js';
import { TUNNEL } from '../world/ground.js';
import { personTemplate, S } from '../render/sprites.js';
import { SF } from '../render/spriteLayer.js';
import { RNG, clamp } from '../core/math.js';

const CAR_LEN = 3.25, GAP = 0.15, NCARS = 5;
const OFF = 0.9; // train centre distance from the slab edge

export class Subway {
  constructor(city) {
    this.city = city;
    this.rng = new RNG(23);
    // clockwise loop (map view): north side eastward, east side southward, south side westward, west side northward
    const c = OFF, r = 0.9, M = MAP;
    const pts = [];
    const arc = (cx, cy, a0, a1) => { for (let k = 0; k <= 6; k++) { const a = a0 + ((a1 - a0) * k) / 6; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    arc(c + r, c + r, Math.PI, Math.PI * 1.5);
    arc(M - c - r, c + r, -Math.PI / 2, 0);
    arc(M - c - r, M - c - r, 0, Math.PI / 2);
    arc(c + r, M - c - r, Math.PI / 2, Math.PI);
    pts.push(pts[0]);
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
    this.z = TUNNEL.z0 + 0.02;
    // station stop: south side (y = M - c), travelling west; front car centre at x = station[0] + 1.6
    this.stopS = this.sAt(TUNNEL.station[0] + 1.8, M - c);
    this.trains = [0, 1].map((k) => ({ s: (this.stopS + 30 + (k * this.len) / 2) % this.len, v: 5, dwell: 0, served: false, cars: [] }));
    for (const t of this.trains) {
      for (let k = 0; k < NCARS; k++) {
        const car = { type: 'subway', x: 0, y: 0, z: this.z, h: 0, len: CAR_LEN, state: 'drive', lights: true, brake: false, palRow: -1, special: 'subway' };
        city.carLayer.assignPalette(car);
        t.cars.push(car);
      }
    }
    this.cars = this.trains.flatMap((t) => t.cars);
    this.waiting = [];
    this.leaving = [];
    this.spawnT = 2;
  }
  sAt(x, y) {
    let best = 0, bd = Infinity;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L2, 0, 1);
      const px = a[0] + dx * t, py = a[1] + dy * t;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = this.cum[i - 1] + Math.sqrt(L2) * t; }
    }
    return best;
  }
  // position object for positional sounds
  soundAt(s) {
    const [x, y] = this.at(s);
    return { x, y, z: this.z };
  }
  at(s) {
    s = ((s % this.len) + this.len) % this.len;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const a = this.pts[i - 1], b = this.pts[i];
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const t = (s - this.cum[i - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  ahead(a, b) { return ((b - a) % this.len + this.len) % this.len; }
  update(dt) {
    const audio = this.city.audio;
    for (let i = 0; i < this.trains.length; i++) {
      const t = this.trains[i];
      const other = this.trains[(i + 1) % this.trains.length];
      if (t.dwell > 0) {
        t.dwell -= dt;
        t.v = 0;
        if (t.dwell < 4 && this.waiting.length && this.rng.chance(dt * 3)) this.board();
        if (t.dwell <= 0) { t.served = true; audio?.event('trainGo', this.soundAt(t.s)); }
      } else {
        const toStop = this.ahead(t.s, this.stopS);
        const gap = this.ahead(t.s, other.s) - (CAR_LEN + GAP) * NCARS - 4;
        let vT = 6.5;
        if (!t.served || toStop < this.len / 2) {
          if (toStop < 22) vT = Math.max(0.6, Math.sqrt(2 * 1.6 * toStop));
        }
        if (gap < 12) vT = Math.min(vT, Math.max(0, gap * 0.4));
        t.v += clamp(vT - t.v, -3.2 * dt, 1.6 * dt);
        if (toStop < 0.15 && !t.served) {
          t.dwell = 7; t.v = 0;
          audio?.event('trainStop', this.soundAt(t.s));
          this.alight();
        }
        if (toStop > 30 && toStop < this.len - 30) t.served = false;
        t.s = (t.s + t.v * dt) % this.len;
        t.brake = vT < t.v - 0.2;
        if (t.v > 3 && this.rng.chance(dt * 0.6)) audio?.event('train', this.soundAt(t.s));
      }
      t.cars.forEach((car, k) => {
        const [x, y, h] = this.at(t.s - k * (CAR_LEN + GAP));
        car.x = x; car.y = y; car.h = h; car.v = t.v; car.brake = t.brake && k === 0;
      });
    }
    // platform passengers
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.waiting.length < 7) {
      this.spawnT = this.rng.range(2.5, 7);
      this.waiting.push(this.makePassenger(this.rng.range(TUNNEL.station[0] + 1, TUNNEL.station[1] - 1), 0));
    }
    for (const p of this.waiting) { p.alpha = Math.min(1, p.alpha + dt * 1.5); p.t += dt; }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const p = this.leaving[i];
      p.t += dt;
      if (p.boarding) { p.alpha -= dt * 2; }
      else { p.x -= dt * 0.9; p.dist += dt * 0.9; if (p.x < TUNNEL.station[0] + 0.6) p.alpha -= dt * 2.5; }
      if (p.alpha <= 0) { this.city.pal.release(p.pal); this.leaving.splice(i, 1); }
    }
  }
  makePassenger(x, alpha) {
    const P = this.city.people;
    const role = this.rng.pick(['resident', 'worker', 'tourist', 'resident']);
    const p = P.create(role);
    p.x = x; p.y = MAP - TUNNEL.depth + 0.42; p.z = TUNNEL.z0 + 0.5;
    p.alpha = alpha; p.t = this.rng.range(0, 3); p.front = true; p.flip = this.rng.chance(0.5);
    return p;
  }
  board() {
    const p = this.waiting.shift();
    if (!p) return;
    p.boarding = true;
    this.leaving.push(p);
  }
  alight() {
    const n = this.rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const p = this.makePassenger(this.rng.range(TUNNEL.station[0] + 6, TUNNEL.station[1] - 2), 1);
      p.walking = true;
      this.leaving.push(p);
    }
  }
  emit(L, view) {
    const cam = this.city.camera;
    const draw = (p, walking) => {
      if (!view.visible(p.x, p.y, p.z, 2)) return;
      let f;
      if (walking) {
        const d = cam.screenDir(-1, 0);
        const set = d[1] >= 0 ? p.frames.front : p.frames.back;
        f = set.walk[Math.floor(p.dist / 0.16) % 4];
        p.flip = d[0] < 0;
      } else f = p.frames.front.idle[Math.floor(p.t * 1.3) % 2];
      L.push(p.x, p.y, p.z, f, p.pal, (p.flip ? SF.FLIP : 0) | SF.NOSHADE | SF.BRIGHT, clamp(p.alpha, 0, 1), 0.003);
    };
    for (const p of this.waiting) draw(p, false);
    for (const p of this.leaving) draw(p, !p.boarding);
  }
  lights(LL) {
    // nothing above ground
    void LL;
  }
}

export { personTemplate, S };
