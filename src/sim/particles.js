// Particle systems: steam, rain, snow, leaves, petals, water spray, fountains, fireworks, fireflies.

import { RNG, clamp, dist2 } from '../core/math.js';
import { CURB, MAP } from '../world/layout.js';
import { SF } from '../render/spriteLayer.js';
import { S } from '../render/sprites.js';

const MAXP = 4200;

export class Particles {
  constructor(city) {
    this.city = city;
    this.rng = new RNG(1234);
    const A = city.atlas;
    this.fr = { puff: [A.get('puff1'), A.get('puff2'), A.get('puff3'), A.get('puff4')], dot: A.get('dot'), dot2: A.get('dot2'), leaf: A.get('leaf'), glow: A.get('glow') };
    this.fr.rain = A.add('rain', 1, 7, (sp) => { for (let y = 0; y < 7; y++) sp.set(0, y, S.C2, 80 + y * 14); }, 0, 6);
    this.fr.splash = A.add('splash', 3, 2, (sp) => { sp.set(0, 0, S.C2, 128); sp.set(2, 0, S.C2, 128); sp.set(1, 1, S.C2, 150); }, 1, 1);
    const pal = city.pal;
    this.row = pal.alloc({ [S.C1]: 0xf0f2f6, [S.C2]: 0xd0e4f8, [S.C3]: 0xffffff, [S.C4]: 0xe07a20, [S.C5]: 0xc8402a, [S.C6]: 0xf0c030, [S.C7]: 0xffb8d8, [S.C8]: 0xd8f0ff, [S.C9]: 0x9a9a9a });
    this.fwRows = [0xff4040, 0x40ff80, 0x5080ff, 0xffd040, 0xff70e0, 0xffffff, 0xff9030, 0x60f0ff].map((c) => pal.alloc({ [S.C1]: [c, 128] }));
    this.flyRow = pal.alloc({ [S.C1]: [0xd8ff60, 128] });
    this.p = [];
    this.emitters = [];
    this.rain = [];
    this.fireworkTimer = 3;
    this.flashes = [];
    this.fireflies = [];
    this.steamAcc = new Map();
  }
  add(o) {
    if (this.p.length >= MAXP) return null;
    this.p.push(o);
    return o;
  }
  puff(x, y, z, n, color) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, 6.28), s = this.rng.range(0.3, 1.2);
      this.add({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: this.rng.range(0.5, 1.6), g: 4, life: 0.5, max: 0.5, f: this.fr.dot2, row: this.row, slot: 0, kind: 'spark' });
    }
    void color;
  }
  addEmitter(kind, data) {
    this.emitters = this.emitters.filter((e) => e.kind !== kind);
    this.emitters.push({ kind, data, acc: 0 });
  }
  // random point currently on screen at height z
  screenPoint(view, z) {
    const cam = this.city.camera;
    const sx = view.tsx + this.rng.range(-view.bw / 2, view.bw / 2);
    const sy = view.tsy + this.rng.range(-view.bh / 2 - 40, view.bh / 2);
    const a = sx / 16, b = (sy + z * 16) / 8;
    const xr = (a + b) / 2, yr = (b - a) / 2;
    const c = Math.cos(cam.angle), s = Math.sin(cam.angle);
    return [MAP / 2 + c * xr + s * yr, MAP / 2 - s * xr + c * yr];
  }
  groundZ(x, y) {
    const W = this.city.world;
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= MAP || iy >= MAP) return -99;
    return Math.max(W.heights[iy * MAP + ix], 0);
  }
  update(dt) {
    const env = this.city.env, view = this.city.view, r = this.rng;
    const wind = env.wind;
    const wx = Math.cos(env.windDir) * wind * 0.8, wy = Math.sin(env.windDir) * wind * 0.8;
    if (!view || !view.bw) return;
    // --- precipitation ---
    const want = env.precip > 0.05 ? Math.floor((env.snowing ? 1400 : 1700) * env.precip * Math.min(1.6, (view.bw * view.bh) / 600000)) : 0;
    while (this.rain.length < want) {
      const z = r.range(0, 26);
      const [x, y] = this.screenPoint(view, z);
      this.rain.push({ x, y, z, snow: env.snowing, ph: r.range(0, 6.28), sp: env.snowing ? r.range(0.7, 1.3) : r.range(9, 13) });
    }
    if (this.rain.length > want) this.rain.length = want;
    for (const d of this.rain) {
      if (d.snow) {
        d.ph += dt * 1.5;
        d.x += (wx * 0.8 + Math.sin(d.ph) * 0.35) * dt;
        d.y += (wy * 0.8 + Math.cos(d.ph * 0.7) * 0.2) * dt;
        d.z -= d.sp * dt;
      } else {
        d.x += wx * 2.2 * dt; d.y += wy * 2.2 * dt;
        d.z -= d.sp * dt;
      }
      const gz = this.groundZ(d.x, d.y);
      if (d.z <= gz || !view.visible(d.x, d.y, d.z, 3)) {
        if (!d.snow && d.z <= gz && gz > -50 && r.chance(0.5)) this.add({ x: d.x, y: d.y, z: gz + 0.02, vx: 0, vy: 0, vz: 0, g: 0, life: 0.18, max: 0.18, f: this.fr.splash, row: this.row, kind: 'splash' });
        const z = r.range(14, 26);
        const [x, y] = this.screenPoint(view, z);
        d.x = x; d.y = y; d.z = z; d.snow = env.snowing;
      }
    }
    // --- steam emitters ---
    const W = this.city.world;
    const cold = env.season === 3 ? 1.8 : env.season === 2 || env.season === 0 ? 1.15 : 0.75;
    for (let i = 0; i < W.steam.length; i++) {
      const s = W.steam[i];
      if (!view.visible(s.x, s.y, s.z, 4)) continue;
      let rate = s.rate * cold;
      if (s.kind === 'chimney') rate = env.season === 3 ? 0.5 : env.season === 2 ? 0.15 : 0;
      if (s.kind === 'roof') rate *= env.season === 3 ? 1.6 : 0.5;
      if (s.kind === 'manhole') rate *= 0.5 + 0.5 * Math.sin(this.city.time * 0.4 + i * 1.7);
      if (rate <= 0) continue;
      let acc = (this.steamAcc.get(i) || 0) + dt * rate * 6;
      while (acc > 1) {
        acc -= 1;
        const big = s.kind === 'stack' || s.kind === 'manhole';
        this.add({ x: s.x + r.range(-0.1, 0.1), y: s.y + r.range(-0.1, 0.1), z: s.z, vx: wx * 0.6 + r.range(-0.12, 0.12), vy: wy * 0.6 + r.range(-0.12, 0.12), vz: big ? r.range(0.7, 1.2) : r.range(0.35, 0.6), g: -0.05,
          life: big ? r.range(2.5, 4) : r.range(1.5, 2.6), max: 0, kind: 'steam', grow: big ? 4 : 2, row: this.row });
        const q = this.p[this.p.length - 1];
        if (q) q.max = q.life;
      }
      this.steamAcc.set(i, acc);
    }
    // food cart steam
    for (const c of W.carts) if (view.visible(c.x, c.y, 1, 3) && r.chance(dt * 2)) this.add({ x: c.x, y: c.y, z: CURB + 1.2, vx: wx * 0.3, vy: wy * 0.3, vz: 0.4, g: 0, life: 1.6, max: 1.6, kind: 'steam', grow: 2, row: this.row });
    // winter car exhaust
    if (env.season === 3) for (const c of this.city.traffic.cars) {
      if (c.state === 'parked' || !r.chance(dt * 1.5) || !view.visible(c.x, c.y, 0, 2)) continue;
      const bx = c.x - Math.cos(c.h) * (c.len / 2 + 0.1), by = c.y - Math.sin(c.h) * (c.len / 2 + 0.1);
      this.add({ x: bx, y: by, z: 0.15, vx: -Math.cos(c.h) * 0.3, vy: -Math.sin(c.h) * 0.3, vz: 0.3, g: 0, life: 1.2, max: 1.2, kind: 'steam', grow: 2, row: this.row });
    }
    // falling leaves / petals
    if ((env.season === 2 || env.season === 0) && W.trees.length) {
      const n = env.season === 2 ? 3 + wind * 6 : 1.5;
      for (let k = 0; k < n * dt * 10; k++) {
        if (!r.chance(0.1)) continue;
        const t = W.trees[r.int(0, W.trees.length - 1)];
        if (env.season === 0 && t.species !== 'cherry') continue;
        if (!view.visible(t.x, t.y, 3, 2)) continue;
        this.add({ x: t.x + r.range(-1.2, 1.2), y: t.y + r.range(-1.2, 1.2), z: r.range(2, 3.5), vx: wx + r.range(-0.3, 0.3), vy: wy + r.range(-0.3, 0.3), vz: -r.range(0.4, 0.7), g: 0, life: 6, max: 6, kind: 'leaf', f: this.fr.leaf, row: this.row, slot: env.season === 0 ? S.C7 : r.pick([S.C4, S.C5, S.C6]), ph: r.range(0, 6) });
      }
    }
    // hydrant spray
    for (const e of this.emitters) {
      if (e.kind === 'hydrant') {
        const h = e.data;
        if (!this.city.activities || this.city.activities.hydrantOpen?.h !== h) continue;
        e.acc += dt * 70;
        while (e.acc > 1) {
          e.acc -= 1;
          const sp = r.range(2.2, 3.6);
          this.add({ x: h.x + h.nx * 0.25, y: h.y + h.ny * 0.25, z: CURB + 0.28, vx: h.nx * sp + h.ux * r.range(-0.6, 0.6), vy: h.ny * sp + h.uy * r.range(-0.6, 0.6), vz: r.range(1.2, 2.4), g: 5, life: 1.2, max: 1.2, kind: 'water', f: r.chance(0.5) ? this.fr.dot : this.fr.dot2, row: this.row, slot: S.C8 });
        }
      }
    }
    // fountains
    const fountainOn = env.season !== 3 && env.hour >= 7 && env.hour < 23;
    if (fountainOn) for (const f of W.fountains) {
      if (!view.visible(f.x, f.y, f.z, 3)) continue;
      const n = f.kind === 'center' ? 26 : 10;
      for (let k = 0; k < n * dt * 3; k++) {
        if (f.kind === 'center') {
          const a = r.range(0, 6.28), s = r.range(0.2, 0.55);
          this.add({ x: f.x, y: f.y, z: f.z + 0.1, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(2.2, 3.0), g: 5, life: 1.2, max: 1.2, kind: 'water', f: this.fr.dot, row: this.row, slot: S.C8, floor: f.z - 0.5 });
        } else {
          const ox = r.range(-f.w / 2 + 0.4, f.w / 2 - 0.4), oy = r.range(-f.d / 2 + 0.4, f.d / 2 - 0.4);
          this.add({ x: f.x + ox, y: f.y + oy, z: f.z, vx: 0, vy: 0, vz: r.range(1.4, 2.0), g: 5, life: 0.8, max: 0.8, kind: 'water', f: this.fr.dot, row: this.row, slot: S.C8, floor: f.z });
        }
      }
    }
    // playground sprinklers (summer daytime)
    if (env.season === 1 && env.hour > 10 && env.hour < 19) for (const s of W.sprinklers) {
      if (!view.visible(s.x, s.y, 1, 3)) continue;
      for (let k = 0; k < 12 * dt * 3; k++) {
        const a = r.range(0, 6.28), sp = r.range(0.3, 1.0);
        this.add({ x: s.x, y: s.y, z: CURB + 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: r.range(1.8, 2.6), g: 5, life: 1, max: 1, kind: 'water', f: this.fr.dot, row: this.row, slot: S.C8, floor: CURB });
      }
    }
    // fireworks on summer nights
    this.fireworkTimer -= dt;
    const fwNight = env.season === 1 && (env.hour > 21 || env.hour < 0.5) && env.precip < 0.2;
    if ((fwNight || this.forceFireworks > 0) && this.fireworkTimer <= 0) {
      this.fireworkTimer = r.range(0.6, 2.4);
      if (this.forceFireworks > 0) this.forceFireworks--;
      const c = W.parkCenter || { x: MAP / 2, y: MAP / 2 };
      this.add({ x: c.x + r.range(-4, 4), y: c.y + r.range(-4, 4), z: CURB + 1, vx: r.range(-0.4, 0.4), vy: r.range(-0.4, 0.4), vz: r.range(9.5, 12), g: 4, life: r.range(1.8, 2.4), max: 2, kind: 'rocket', f: this.fr.dot2, row: this.fwRows[5] });
      this.city.audio?.event('launch', c);
    }
    // fireflies
    const ffOn = env.season === 1 && env.hour > 20 && env.hour < 23.5 && !env.raining;
    if (ffOn && this.fireflies.length < 40 && W.lawns) {
      const l = r.pick(W.lawns);
      this.fireflies.push({ x: r.range(l.x0, l.x1), y: r.range(l.y0, l.y1), z: r.range(0.4, 1.8), ph: r.range(0, 6), sp: r.range(0.6, 1.4) });
    }
    if (!ffOn) this.fireflies.length = 0;
    for (const f of this.fireflies) { f.ph += dt * f.sp; f.x += Math.sin(f.ph * 0.7) * 0.25 * dt; f.y += Math.cos(f.ph * 0.5) * 0.25 * dt; f.z += Math.sin(f.ph) * 0.1 * dt; }
    // integrate particles
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life -= dt;
      if (q.kind === 'leaf') {
        q.ph += dt * 3;
        q.x += (q.vx + Math.sin(q.ph) * 0.4) * dt; q.y += (q.vy + Math.cos(q.ph * 0.8) * 0.3) * dt; q.z += q.vz * dt;
        if (q.z <= this.groundZ(q.x, q.y) + 0.02) { q.vz = 0; q.vx = 0; q.vy = 0; q.life = Math.min(q.life, 1.5); }
      } else {
        q.vz -= (q.g || 0) * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        if (q.kind === 'water') {
          const fl = q.floor ?? CURB;
          if (q.z < fl) { q.life = 0; if (r.chance(0.15)) this.add({ x: q.x, y: q.y, z: fl + 0.02, vx: 0, vy: 0, vz: 0, g: 0, life: 0.15, max: 0.15, f: this.fr.splash, row: this.row, kind: 'splash' }); }
        }
        if (q.kind === 'spark') { q.vx *= 0.97; q.vy *= 0.97; q.vz *= 0.97; }
      }
      if (q.kind === 'rocket') {
        if (r.chance(0.6)) this.add({ x: q.x, y: q.y, z: q.z, vx: 0, vy: 0, vz: -0.5, g: 0, life: 0.35, max: 0.35, kind: 'spark', f: this.fr.dot, row: this.fwRows[3] });
        if (q.vz < 2 || q.life <= 0) {
          q.life = 0;
          this.burst(q.x, q.y, q.z);
        }
      }
      if (q.life <= 0) this.p.splice(i, 1);
    }
    // light flashes decay
    for (let i = this.flashes.length - 1; i >= 0; i--) { this.flashes[i].k -= dt * 2.2; if (this.flashes[i].k <= 0) this.flashes.splice(i, 1); }
  }
  burst(x, y, z) {
    const r = this.rng;
    const rowA = r.pick(this.fwRows), rowB = r.chance(0.4) ? r.pick(this.fwRows) : rowA;
    const n = r.int(50, 90);
    const kind = r.int(0, 2);
    for (let i = 0; i < n; i++) {
      const a = r.range(0, 6.28), b = Math.acos(r.range(-1, 1));
      const s = kind === 1 ? 3.6 : r.range(2.0, 4.0);
      this.add({ x, y, z, vx: Math.cos(a) * Math.sin(b) * s, vy: Math.sin(a) * Math.sin(b) * s, vz: Math.cos(b) * s * 0.8 + 0.5, g: 1.6, life: r.range(1.1, 1.9), max: 1.9, kind: 'spark', f: r.chance(0.3) ? this.fr.dot2 : this.fr.dot, row: i % 2 ? rowA : rowB });
    }
    const colors = { 0: [1, 0.3, 0.3] };
    this.flashes.push({ x, y, k: 1.2, color: colors[0] && [r.range(0.6, 1), r.range(0.4, 1), r.range(0.4, 1)] });
    this.city.audio?.event('boom', { x, y, z });
  }
  emit(L, view) {
    const env = this.city.env;
    const pf = this.fr.puff;
    for (const q of this.p) {
      if (!view.visible(q.x, q.y, q.z, 2)) continue;
      const t = q.max ? q.life / q.max : 1;
      if (q.kind === 'steam') {
        const age = 1 - t;
        const si = Math.min(pf.length - 1, Math.floor(age * q.grow));
        L.push(q.x, q.y, q.z, pf[si], q.row, SF.NOSHADOW | SF.BRIGHT, Math.min(1, t * 1.4) * 0.85, 0.001);
      } else if (q.kind === 'spark' || q.kind === 'rocket') {
        L.push(q.x, q.y, q.z, q.f || this.fr.dot, q.row, SF.EMISSIVE | SF.NOSHADOW, Math.min(1, t * 1.6), 0.001);
      } else if (q.kind === 'leaf' || q.kind === 'water') {
        L.push(q.x, q.y, q.z, q.f, this.slotRow(q.slot), SF.NOSHADOW, q.kind === 'leaf' ? Math.min(1, q.life) : 1, 0.001);
      } else {
        L.push(q.x, q.y, q.z, q.f, q.row, SF.NOSHADOW, t, 0.001);
      }
    }
    for (const d of this.rain) {
      if (d.snow) L.push(d.x, d.y, d.z, d.sp > 1.1 ? this.fr.dot2 : this.fr.dot, this.slotRow(S.C3), SF.NOSHADOW | SF.BRIGHT, 1, 0);
      else L.push(d.x, d.y, d.z, this.fr.rain, this.row, SF.NOSHADOW | SF.BRIGHT, 0.9, 0);
    }
    for (const f of this.fireflies) {
      if ((Math.sin(f.ph * 2.3) + Math.sin(f.ph * 1.1)) < 0.6) continue;
      if (!view.visible(f.x, f.y, f.z, 1)) continue;
      L.push(f.x, f.y, f.z, this.fr.dot, this.flyRow, SF.EMISSIVE | SF.NOSHADOW, 1, 0);
    }
    void env;
  }
  // palette rows that map C1 to another slot colour (for single-slot sprites)
  slotRow(slot) {
    if (!this._slotRows) this._slotRows = {};
    if (this._slotRows[slot] == null) {
      const colors = { [S.C2]: 0xb8d0e8, [S.C3]: 0xffffff, [S.C4]: 0xe07a20, [S.C5]: 0xc8402a, [S.C6]: 0xf0c030, [S.C7]: 0xffb8d8, [S.C8]: 0xd8f0ff };
      this._slotRows[slot] = this.city.pal.alloc({ [S.C1]: colors[slot] ?? 0xffffff, [S.C2]: colors[slot] ?? 0xffffff });
    }
    return this._slotRows[slot];
  }
  lights(LL, env) {
    for (const f of this.flashes) LL.add(f.x, f.y, 14, f.color, f.k * 0.8);
    for (const q of this.p) if (q.kind === 'rocket') LL.add(q.x, q.y, 1.2, [1, 0.8, 0.5], 0.5);
    void env;
  }
}
