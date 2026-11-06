// Particle systems: steam, rain, snow, leaves, petals, water spray, fountains, fireworks, fireflies.

import { RNG, clamp, dist2 } from '../core/math.js';
import { CURB, MAP, T } from '../world/layout.js';
import { SF } from '../render/spriteLayer.js';
import { S } from '../render/sprites.js';

const MAXP = 4200;

export class Particles {
  constructor(city) {
    this.city = city;
    this.rng = new RNG(1234);
    const A = city.atlas;
    this.fr = { puff: [A.get('puff1'), A.get('puff2'), A.get('puff3'), A.get('puff4')], dot: A.get('dot'), dot2: A.get('dot2'), flake: A.get('flake'), leaf: A.get('leaf'), glow: A.get('glow') };
    this.fr.rain = A.add('rain', 1, 14, (sp) => { for (let y = 0; y < 14; y++) sp.set(0, y, S.C2, 76 + y * 7); }, 0, 13);
    this.fr.splash = A.add('splash', 5, 3, (sp) => { sp.set(0, 0, S.C2, 120); sp.set(4, 0, S.C2, 120); sp.set(1, 1, S.C2, 136); sp.set(3, 1, S.C2, 136); sp.set(2, 2, S.C2, 150); sp.set(1, 2, S.C2, 120); sp.set(3, 2, S.C2, 120); }, 2, 2);
    const pal = city.pal;
    this.row = pal.alloc({ [S.C1]: 0xf0f2f6, [S.C2]: 0xd0e4f8, [S.C3]: 0xffffff, [S.C4]: 0xe07a20, [S.C5]: 0xc8402a, [S.C6]: 0xf0c030, [S.C7]: 0xffb8d8, [S.C8]: 0xd8f0ff, [S.C9]: 0x9a9a9a });
    this.fwRows = [0xff4040, 0x40ff80, 0x5080ff, 0xffd040, 0xff70e0, 0xffffff, 0xff9030, 0x60f0ff].map((c) => pal.alloc({ [S.C1]: [c, 128] }));
    this.flyRow = pal.alloc({ [S.C1]: [0xd8ff60, 128] });
    // smoke, fire and the rest of the mayhem
    const row = (c) => pal.alloc({ [S.C1]: c, [S.C2]: c, [S.C3]: c });
    this.rows = {
      smokeGrey: row(0x8e8b88), smokeDark: row(0x3e3a36), smokeBlack: row(0x201e1c), dust: row(0x9c9488),
      fire: pal.alloc({ [S.C1]: [0xffe070, 128], [S.C2]: [0xffa030, 128], [S.C3]: [0xe8501c, 128] }),
      fbYellow: row([0xffe890, 128]), fbOrange: row([0xffa040, 128]), fbRed: row([0xd8481a, 128]),
      debris: row(0x2c2824), blood: row(0x8c0c0e), brass: row(0xdcaa34), glass: row(0xcdeaff), tracer: row([0xfff2b8, 128]),
    };
    // flickering flame tongues: yellow core, orange body, red tips
    this.fr.flame = [[8, 12], [6, 10], [5, 8]].map(([w, h], k) => A.add('flame' + k, w, h, (sp) => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const v = y / (h - 1), half = (w / 2) * Math.pow(v, 0.7) * (1 - 0.25 * Math.max(0, v - 0.75) * 4);
          const dx = Math.abs(x + 0.5 - w / 2 + Math.sin(y * 1.7 + k) * 0.6);
          if (dx > half) continue;
          const t = dx / Math.max(0.5, half) * 0.6 + (1 - v) * 0.7;
          sp.set(x, y, t < 0.45 ? S.C1 : t < 0.8 ? S.C2 : S.C3, 128);
        }
    }, w >> 1, h - 1));
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
  // ---- mayhem ---------------------------------------------------------------------------------
  sparks(x, y, z, n) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, 6.28), s = r.range(1, 4);
      this.add({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(0.5, 2.5), g: 9, life: r.range(0.2, 0.45), max: 0.45, f: this.fr.dot, row: this.fwRows[3], kind: 'spark' });
    }
  }
  glass(x, y, z, n) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, 6.28), s = r.range(0.6, 2.4);
      this.add({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(0.5, 2), g: 9, life: r.range(1.2, 2.2), max: 2.2, f: this.fr.dot, row: this.rows.glass, kind: 'bit' });
    }
  }
  dust(x, y, z, n) {
    const r = this.rng;
    for (let i = 0; i < n; i++) this.add({ x: x + r.range(-0.1, 0.1), y: y + r.range(-0.1, 0.1), z, vx: r.range(-0.5, 0.5), vy: r.range(-0.5, 0.5), vz: r.range(0.2, 0.7), g: 0.5, life: r.range(0.4, 0.8), max: 0.8, kind: 'smoke', row: this.rows.dust, grow: 1.5 });
  }
  blood(x, y, z, dx, dy, n) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const s = r.range(0.8, 3.2), a = r.range(-0.7, 0.7), ca = Math.cos(a), sa = Math.sin(a);
      const vx = (dx * ca - dy * sa) * s + r.range(-0.4, 0.4), vy = (dx * sa + dy * ca) * s + r.range(-0.4, 0.4);
      this.add({ x, y, z: z + r.range(-0.15, 0.15), vx, vy, vz: r.range(0.2, 1.8), g: 9, life: 2, max: 2, f: r.chance(0.4) ? this.fr.dot2 : this.fr.dot, row: this.rows.blood, kind: 'blood', splat: i % 3 === 0 });
    }
  }
  muzzle(x, y, z, dx, dy) {
    const r = this.rng;
    for (let i = 0; i < 4; i++) {
      const s = r.range(0.5, 3);
      this.add({ x: x + dx * 0.05 * i, y: y + dy * 0.05 * i, z, vx: dx * s + r.range(-0.4, 0.4), vy: dy * s + r.range(-0.4, 0.4), vz: r.range(-0.3, 0.3), g: 0, life: 0.06, max: 0.06, f: i ? this.fr.dot : this.fr.dot2, row: this.rows.fbYellow, kind: 'spark' });
    }
    this.add({ x: x + dx * 0.1, y: y + dy * 0.1, z, vx: r.range(-0.2, 0.2), vy: r.range(-0.2, 0.2), vz: 0.4, g: 0, life: 0.5, max: 0.5, kind: 'smoke', row: this.rows.smokeGrey, grow: 1.2, a: 0.5 });
    this.flashes.push({ x, y, k: 0.9, color: [1, 0.8, 0.45], r: 3.2, decay: 12 });
  }
  tracer(x0, y0, z0, x1, y1, z1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(d / 0.3));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      this.add({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, z: z0 + (z1 - z0) * t, vx: 0, vy: 0, vz: 0, g: 0, life: 0.03 + t * 0.05, max: 0.08, f: this.fr.dot, row: this.rows.tracer, kind: 'spark' });
    }
  }
  shell(x, y, z, dx, dy) {
    const r = this.rng;
    this.add({ x, y, z, vx: -dy * r.range(1, 1.8) + dx * 0.2, vy: dx * r.range(1, 1.8) + dy * 0.2, vz: r.range(1.2, 2), g: 9, life: 1.6, max: 1.6, f: this.fr.dot, row: this.rows.brass, kind: 'bit' });
  }
  explosion(x, y, z, car) {
    const r = this.rng, R = this.rows;
    // fireball: a ball of flame puffs that balloons out and lifts, then rolls into black smoke
    for (let i = 0; i < 34; i++) {
      const a = r.range(0, 6.28), b = Math.acos(r.range(-0.2, 1)), s = r.range(1.2, 4.2);
      this.add({ x, y, z: z + r.range(0, 0.4), vx: Math.cos(a) * Math.sin(b) * s, vy: Math.sin(a) * Math.sin(b) * s, vz: Math.cos(b) * s * 0.8 + 0.8, g: -0.4, drag: 3.2,
        life: r.range(0.45, 1.0), max: 1.0, kind: 'fireball', row: i % 3 === 0 ? R.fbYellow : i % 3 === 1 ? R.fbOrange : R.fbRed, grow: 4, delay: r.range(0, 0.12) });
    }
    for (let i = 0; i < 22; i++) {
      const a = r.range(0, 6.28), s = r.range(0.3, 1.6);
      this.add({ x: x + Math.cos(a) * 0.4, y: y + Math.sin(a) * 0.4, z: z + r.range(0.3, 1.2), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(0.8, 2.2), g: -0.1, drag: 0.8,
        life: r.range(2.4, 4.5), max: 4.5, kind: 'smoke', row: i % 2 ? R.smokeBlack : R.smokeDark, grow: 4, delay: r.range(0.25, 0.7) });
    }
    // debris: dark chunks and bits of the body in its own paint
    for (let i = 0; i < 26; i++) {
      const a = r.range(0, 6.28), s = r.range(1.5, 6);
      this.add({ x, y, z: z + 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(2, 6.5), g: 9.8, life: r.range(1.6, 3), max: 3,
        f: r.chance(0.5) ? this.fr.dot2 : this.fr.dot, row: car && car.palRow >= 0 && i % 3 === 0 ? car.palRow : R.debris, kind: 'bit' });
    }
    this.sparks(x, y, z + 0.4, 34);
    this.glass(x, y, z + 0.6, 14);
    // a ring of dust kicked along the ground
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.28, s = r.range(3, 5);
      this.add({ x, y, z: 0.05, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 0.1, g: 0, drag: 3.5, life: 0.9, max: 0.9, kind: 'smoke', row: R.dust, grow: 3 });
    }
    this.flashes.push({ x, y, k: 2.2, color: [1, 0.6, 0.25], r: 11, decay: 2.4 });
  }
  // engines that smoke, cars on fire, wrecks smouldering
  carFx(dt, view) {
    const V = this.city.vehicles, r = this.rng, R = this.rows;
    if (!V) return;
    const wx = Math.cos(this.city.env.windDir) * this.city.env.wind * 0.5, wy = Math.sin(this.city.env.windDir) * this.city.env.wind * 0.5;
    for (const c of V.damaged) {
      if (c.fadeOut != null || !view.visible(c.x, c.y, 1, 4)) continue;
      const ch = Math.cos(c.h), sh = Math.sin(c.h);
      const big = c.type === 'bus' || c.type === 'truck' || c.type === 'fire' || c.type === 'garbage' || c.type === 'plow';
      const ef = c.type === 'bus' ? -0.4 : 0.36; // engine at the front (the bus has it at the back)
      const ex = c.x + ch * c.len * ef, ey = c.y + sh * c.len * ef;
      const ez = (c.z || 0) + (c.hopZ || 0) + (big ? 1.0 : c.type === 'van' || c.type === 'icecream' ? 0.8 : 0.55);
      const frac = c.hp / c.maxHp;
      let smoke = 0, fire = 0, row = R.smokeGrey;
      if (c.wreck) {
        if (c.burnT > 0) { fire = 10 + c.burnT * 2; smoke = 9; row = R.smokeBlack; }
        else if (c.smolderT > 0) { smoke = 2 + c.smolderT * 0.08; row = R.smokeDark; }
      } else if (c.fireT != null) { fire = 14 + (c.fireT / c.fuse) * 26; smoke = 10; row = R.smokeBlack; }
      else if (frac < 0.3) { smoke = 7; row = R.smokeDark; }
      else if (frac < 0.5) smoke = 3.5;
      c.fxSmoke = (c.fxSmoke || 0) + smoke * dt;
      while (c.fxSmoke > 1) {
        c.fxSmoke -= 1;
        this.add({ x: ex + r.range(-0.15, 0.15), y: ey + r.range(-0.15, 0.15), z: ez, vx: wx + r.range(-0.15, 0.15), vy: wy + r.range(-0.15, 0.15), vz: r.range(0.6, 1.1), g: -0.05, drag: 0.3,
          life: r.range(1.6, 2.8) * (row === R.smokeGrey ? 0.8 : 1), max: 2.8, kind: 'smoke', row, grow: 3.2, a: row === R.smokeGrey ? 0.75 : 1 });
      }
      c.fxFire = (c.fxFire || 0) + fire * dt;
      // flames start at the engine and spread over the whole car as it burns
      const spread = c.wreck ? 1 : Math.min(1, 0.25 + (c.fireT || 0) / (c.fuse || 1));
      while (c.fxFire > 1) {
        c.fxFire -= 1;
        const u = r.range(-0.5, 0.5) * spread, v = r.range(-0.4, 0.4) * spread;
        const fx = c.wreck ? c.x + ch * u * c.len - sh * v * c.wid : ex + ch * u * c.len * 0.6 - sh * v * c.wid, fy = c.wreck ? c.y + sh * u * c.len + ch * v * c.wid : ey + sh * u * c.len * 0.6 + ch * v * c.wid;
        this.add({ x: fx, y: fy, z: ez - 0.15 + r.range(0, 0.2), vx: wx * 0.5 + r.range(-0.1, 0.1), vy: wy * 0.5 + r.range(-0.1, 0.1), vz: r.range(1.0, 2.0), g: 0, life: r.range(0.25, 0.55), max: 0.55, kind: 'fire', f: r.pick(this.fr.flame), row: R.fire });
        if (r.chance(0.08)) this.add({ x: fx, y: fy, z: ez + 0.3, vx: r.range(-0.6, 0.6), vy: r.range(-0.6, 0.6), vz: r.range(1.5, 3), g: 1, life: 0.6, max: 0.6, f: this.fr.dot, row: this.fwRows[3], kind: 'spark' });
      }
    }
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
    return cam.artToWorld(sx, sy, z);
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
    this.carFx(dt, view);
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
      // sidewalk grates breathe out in slow puffs (trains passing underneath)
      if (s.kind === 'grate') rate *= 0.35 + 0.65 * Math.max(0, Math.sin(this.city.time * 0.33 + i * 2.3));
      if (rate <= 0) continue;
      let acc = (this.steamAcc.get(i) || 0) + dt * rate * 6;
      while (acc > 1) {
        acc -= 1;
        const big = s.kind === 'grate' || s.kind === 'manhole';
        const ox = s.ax ? r.range(-s.ax, s.ax) : r.range(-0.1, 0.1), oy = s.ay ? r.range(-s.ay, s.ay) : r.range(-0.1, 0.1);
        this.add({ x: s.x + ox, y: s.y + oy, z: s.z, vx: wx * 0.6 + r.range(-0.12, 0.12), vy: wy * 0.6 + r.range(-0.12, 0.12), vz: big ? r.range(0.6, 1.1) : r.range(0.35, 0.6), g: -0.05,
          life: big ? r.range(2.2, 3.6) : r.range(1.5, 2.6), max: 0, kind: 'steam', grow: big ? 4 : 2, row: this.row });
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
    // winter breath vapour from nearby pedestrians (only when zoomed in)
    if (env.season === 3 && this.city.camera.scale / (window.devicePixelRatio || 1) >= 2.5) {
      for (const p of this.city.people.list) {
        if (p.alpha < 1 || !r.chance(dt * 0.6) || !view.visible(p.x, p.y, p.z, 0)) continue;
        const d = this.city.camera.screenDir(p.dx || 0, p.dy || 1);
        const fx = p.flip ? -1 : 1;
        void d;
        this.add({ x: p.x + fx * 0.05, y: p.y, z: p.z + (p.kid ? 0.7 : 0.85), vx: wx * 0.3, vy: wy * 0.3, vz: 0.15, g: 0, life: 0.9, max: 0.9, kind: 'steam', grow: 1, row: this.row });
      }
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
      const n = f.kind === 'center' ? 26 : f.kind === 'tiered' ? 46 : 10;
      for (let k = 0; k < n * dt * 3; k++) {
        if (f.kind === 'tiered') {
          const u = r.next(), a = r.range(0, 6.28), ca = Math.cos(a), sa = Math.sin(a);
          if (u < 0.4) {
            // jet from the finial, falling back into the top bowl
            const s = r.range(0.1, 0.32);
            this.add({ x: f.x, y: f.y, z: f.z + 0.05, vx: ca * s, vy: sa * s, vz: r.range(1.8, 2.5), g: 5, life: 1.0, max: 1.0, kind: 'water', f: this.fr.dot, row: this.row, slot: S.C8, floor: f.bowls[0].z });
          } else {
            // curtains spilling over the bowl rims into the tier below
            const top = u < 0.65;
            const b = top ? f.bowls[0] : f.bowls[1];
            const s = r.range(0.12, 0.35);
            this.add({ x: f.x + ca * b.r, y: f.y + sa * b.r, z: b.z + 0.02, vx: ca * s, vy: sa * s, vz: r.range(0, 0.25), g: 5, life: 0.8, max: 0.8, kind: 'water', f: this.fr.dot, row: this.row, slot: S.C8, floor: top ? f.bowls[1].z : f.floor });
          }
        } else if (f.kind === 'center') {
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
    // summer nights, and a burst every winter midnight when the ball has dropped
    const fwNight = (env.season === 1 && (env.hour > 21 || env.hour < 0.5) && env.precip < 0.2) || (env.season === 3 && env.hour >= 0 && env.hour < 0.25);
    if ((fwNight || this.forceFireworks > 0) && this.fireworkTimer <= 0) {
      this.fireworkTimer = r.range(0.6, 2.4);
      if (this.forceFireworks > 0) this.forceFireworks--;
      const c = (env.season === 3 && W.timesSquare) || W.parkCenter || { x: MAP / 2, y: MAP / 2 };
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
      if (q.delay > 0) { q.delay -= dt; continue; }
      q.life -= dt;
      if (q.drag) { const k = Math.exp(-q.drag * dt); q.vx *= k; q.vy *= k; q.vz *= k; }
      if (q.kind === 'bit' || q.kind === 'blood') {
        q.vz -= q.g * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        const gz = this.groundZ(q.x, q.y);
        if (q.z <= gz + 0.01 && q.vz < 0) {
          q.z = gz + 0.01;
          if (q.kind === 'blood') {
            if (q.splat && gz > -50) this.city.decals?.add('splat', q.x, q.y, gz, r.range(0, 6.28), r.range(0.1, 0.18), 1);
            q.life = 0;
          } else if (q.vz < -1.5) { q.vz = -q.vz * 0.3; q.vx *= 0.5; q.vy *= 0.5; } else { q.vz = 0; q.vx = 0; q.vy = 0; q.g = 0; }
        }
        if (q.life <= 0) this.p.splice(i, 1);
        continue;
      }
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
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.k -= dt * (f.decay || 2.2); if (f.k <= 0) this.flashes.splice(i, 1); }
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
      if (q.delay > 0 || !view.visible(q.x, q.y, q.z, 2)) continue;
      const t = q.max ? q.life / q.max : 1;
      if (q.kind === 'smoke' || q.kind === 'fireball') {
        const age = 1 - t;
        const si = Math.min(pf.length - 1, Math.floor(age * q.grow));
        const a = (q.a ?? 1) * Math.min(1, t * (q.kind === 'smoke' ? 2.2 : 3));
        L.push(q.x, q.y, q.z, pf[si], q.row, q.kind === 'fireball' ? SF.EMISSIVE | SF.NOSHADOW : SF.NOSHADOW, a, 0.001);
        continue;
      }
      if (q.kind === 'fire') { L.push(q.x, q.y, q.z, q.f, q.row, SF.EMISSIVE | SF.NOSHADOW, Math.min(1, t * 2.5), 0.002); continue; }
      if (q.kind === 'bit' || q.kind === 'blood') { L.push(q.x, q.y, q.z, q.f, q.row, SF.NOSHADOW, Math.min(1, q.life * 2), 0.002); continue; }
      if (q.kind === 'steam') {
        const age = 1 - t;
        const si = Math.min(pf.length - 1, Math.floor(age * q.grow));
        L.push(q.x, q.y, q.z, pf[si], q.row, SF.NOSHADOW | SF.BRIGHT, Math.min(1, t * 2.6), 0.001);
      } else if (q.kind === 'spark' || q.kind === 'rocket') {
        L.push(q.x, q.y, q.z, q.f || this.fr.dot, q.row, SF.EMISSIVE | SF.NOSHADOW, Math.min(1, t * 1.6), 0.001);
      } else if (q.kind === 'leaf' || q.kind === 'water') {
        L.push(q.x, q.y, q.z, q.f, this.slotRow(q.slot), SF.NOSHADOW, q.kind === 'leaf' ? Math.min(1, q.life) : 1, 0.001);
      } else {
        L.push(q.x, q.y, q.z, q.f, q.row, SF.NOSHADOW, t, 0.001);
      }
    }
    for (const d of this.rain) {
      if (d.snow) L.push(d.x, d.y, d.z, d.sp > 1.1 ? this.fr.flake : this.fr.dot2, this.slotRow(S.C3), SF.NOSHADOW | SF.BRIGHT, 1, 0);
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
    for (const f of this.flashes) LL.add(f.x, f.y, f.r || 14, f.color, f.k * 0.8);
    const V = this.city.vehicles;
    if (V) for (const c of V.damaged) {
      const burning = c.fireT != null || (c.wreck && c.burnT > 0);
      if (!burning || c.fadeOut != null) continue;
      const fl = 0.75 + 0.25 * Math.sin(this.city.time * 23 + c.id) * Math.sin(this.city.time * 7.3 + c.id * 2);
      LL.add(c.x, c.y, 3.6, [1, 0.55, 0.2], 0.6 * fl);
    }
    for (const q of this.p) if (q.kind === 'rocket') LL.add(q.x, q.y, 1.2, [1, 0.8, 0.5], 0.5);
    void env;
  }
}
