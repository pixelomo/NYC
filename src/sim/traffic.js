// Traffic: lanes, signals, cars (IDM following), parking, buses, taxis and special vehicles.

import { NB, MAP, roadCenter, LANE_OFF, PARK_OFF } from '../world/layout.js';
import { RNG, clamp, dist2 } from '../core/math.js';

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N
const right = (d) => (d + 1) % 4;
const left = (d) => (d + 3) % 4;
const STOP = 4.8, EXIT = 4.5;
const CYCLE = { green: 15, yellow: 3, red: 1.5 };
const CYCLE_LEN = 2 * (CYCLE.green + CYCLE.yellow + CYCLE.red);

function bezier(p0, p1, p2, p3, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}

class Piece {
  constructor(pts, kind) {
    this.pts = pts;
    this.kind = kind;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
    this.cars = [];
  }
  at(s) {
    s = clamp(s, 0, this.len);
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const a = this.pts[i - 1], b = this.pts[i];
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const t = (s - this.cum[i - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
}

export const CAR_TYPES = {
  sedan: { len: 2.25, wid: 0.875, speed: 4.6 },
  taxi: { len: 2.25, wid: 0.875, speed: 4.9 },
  suv: { len: 2.375, wid: 1.0, speed: 4.5 },
  van: { len: 2.75, wid: 1.0, speed: 4.2 },
  police: { len: 2.375, wid: 0.875, speed: 5.0 },
  bus: { len: 6.5, wid: 1.25, speed: 3.6 },
  truck: { len: 4.0, wid: 1.125, speed: 3.8 },
  fire: { len: 5.0, wid: 1.125, speed: 4.8 },
  icecream: { len: 3.25, wid: 1.0, speed: 2.6 },
  garbage: { len: 4.25, wid: 1.125, speed: 3.0 },
  plow: { len: 4.25, wid: 1.125, speed: 3.2 },
};

export class Traffic {
  constructor(city) {
    this.city = city;
    this.rng = new RNG(321);
    this.cars = [];
    this.clock = 0;
    this.links = new Map(); // key `${i},${j},${d}` = link leaving intersection (i,j) in direction d
    this.inLinks = new Map(); // key -> link arriving at intersection (i,j) travelling d
    this.connectors = new Map();
    this.offsets = [];
    for (let i = 0; i <= NB; i++) {
      this.offsets.push([]);
      for (let j = 0; j <= NB; j++) this.offsets[i].push(((i * 7 + j * 3) % 5) * 4.3 + (i + j) * 2.1);
    }
    this.exitLock = new Map();
    this.buildNetwork();
    this.buildParking();
    this.nextId = 1;
    this.special = { fireTimer: 90, iceTimer: 20, garbageTimer: 5, plowTimer: 10 };
    this.honks = [];
  }
  center(i, j) { return [roadCenter(i), roadCenter(j)]; }
  buildNetwork() {
    for (let i = 0; i <= NB; i++)
      for (let j = 0; j <= NB; j++) {
        for (let d = 0; d < 4; d++) {
          const [dx, dy] = DIRS[d];
          const ni = i + dx, nj = j + dy;
          if (ni < 0 || nj < 0 || ni > NB || nj > NB) continue;
          const [cx, cy] = this.center(i, j);
          const [ex, ey] = this.center(ni, nj);
          // lane offset to the right of travel direction
          const rx = -dy * LANE_OFF, ry = dx * LANE_OFF;
          const p0 = [cx + dx * EXIT + rx, cy + dy * EXIT + ry];
          const p1 = [ex - dx * STOP + rx, ey - dy * STOP + ry];
          const L = new Piece([p0, p1], 'link');
          Object.assign(L, { i, j, d, ti: ni, tj: nj, id: `${i},${j},${d}`, park: [] });
          this.links.set(L.id, L);
          this.inLinks.set(`${ni},${nj},${d}`, L);
        }
      }
    // connectors
    for (const L of this.links.values()) {
      const { ti, tj, d } = L;
      for (const nd of [d, right(d), left(d)]) {
        const out = this.links.get(`${ti},${tj},${nd}`);
        if (!out) continue;
        const p0 = L.pts[1], p3 = out.pts[0];
        let pts;
        if (nd === d) pts = [p0, p3];
        else {
          const k = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) * 0.52;
          const [ax, ay] = DIRS[d], [bx, by] = DIRS[nd];
          pts = bezier(p0, [p0[0] + ax * k, p0[1] + ay * k], [p3[0] - bx * k, p3[1] - by * k], p3, 14);
        }
        const C = new Piece(pts, 'conn');
        Object.assign(C, { from: L, to: out, turn: nd === d ? 's' : nd === right(d) ? 'r' : 'l', i: ti, j: tj, d, nd });
        this.connectors.set(`${L.id}>${out.id}`, C);
      }
    }
  }
  buildParking() {
    const W = this.city.world;
    const blockers = [];
    for (const h of W.hydrants) blockers.push([h.x, h.y, 1.3]);
    for (const b of W.busStops) blockers.push([b.x, b.y, 3.2]);
    for (const s of W.stacksBlock || []) blockers.push([s.x, s.y, 2.2]);
    for (const c of W.carts) blockers.push([c.x, c.y, 1.5]);
    if (W.firehouse) blockers.push([W.firehouse.x, W.firehouse.y, 3]);
    for (const L of this.links.values()) {
      const [dx, dy] = DIRS[L.d];
      const px = -dy * (PARK_OFF - LANE_OFF), py = dx * (PARK_OFF - LANE_OFF);
      for (let s = 1.6; s < L.len - 1.4; s += 2.75) {
        const x = L.pts[0][0] + dx * s + px, y = L.pts[0][1] + dy * s + py;
        if (blockers.some(([bx, by, r]) => dist2(x, y, bx, by) < r * r)) continue;
        if (x < 0.5 || y < 0.5 || x > MAP - 0.5 || y > MAP - 0.5) continue;
        L.park.push({ s, x, y, car: null, link: L });
      }
    }
  }
  // ---- signals -------------------------------------------------------------
  get flashing() {
    const h = this.city.env.hour;
    return h >= 1 && h < 5;
  }
  movingCarNear(x, y, r) {
    for (const c of this.cars) if (c.state !== 'parked' && c.v > 0.4 && dist2(c.x, c.y, x, y) < r * r) return true;
    return false;
  }
  signalState(i, j) {
    if (this.flashing) {
      // late night: avenues (N-S) flash yellow, streets (E-W) flash red; pedestrians cross with care
      return { ew: 'fr', ns: 'fy', walkEW: 'walk', walkNS: 'walk', ewT: 0, nsT: 0, flash: true };
    }
    const t = (this.clock + this.offsets[i][j]) % CYCLE_LEN;
    const g = CYCLE.green, y = CYCLE.yellow, r = CYCLE.red;
    const half = g + y + r;
    let ew = 'r', ns = 'r', walkEW = 'dont', walkNS = 'dont', ewT = 0, nsT = 0;
    if (t < g) { ew = 'g'; ewT = g - t; } else if (t < g + y) ew = 'y';
    else if (t >= half && t < half + g) { ns = 'g'; nsT = half + g - t; } else if (t >= half + g && t < half + g + y) ns = 'y';
    if (ew === 'g') walkEW = t < g - 5 ? 'walk' : 'flash';
    if (ew === 'y') walkEW = 'flash';
    if (ns === 'g') walkNS = t - half < g - 5 ? 'walk' : 'flash';
    if (ns === 'y') walkNS = 'flash';
    return { ew, ns, walkEW, walkNS, ewT, nsT };
  }
  // ---- cars ----------------------------------------------------------------
  pickType(env) {
    const r = this.rng;
    const opts = [['sedan', 30], ['taxi', 34], ['suv', 16], ['van', 8], ['truck', 5], ['police', 2]];
    return r.weighted(opts);
  }
  makeCar(type, link, s, opts = {}) {
    const T = CAR_TYPES[type];
    const car = {
      id: this.nextId++, type, len: T.len, wid: T.wid, v0: T.speed * this.rng.range(0.9, 1.08), v: 0,
      piece: link, s, lat: 0, latTarget: 0, next: null, state: 'drive', x: 0, y: 0, h: 0,
      color: opts.color ?? null, brake: false, life: this.rng.range(60, 200), wait: 0, honked: 0,
      route: opts.route ?? null, routeIdx: 0, stopAt: opts.stopAt ?? null, palRow: -1, siren: !!opts.siren, special: opts.special ?? null,
    };
    this.chooseNext(car);
    return car;
  }
  chooseNext(car) {
    const L = car.piece;
    if (L.kind !== 'link') return;
    let nd;
    if (car.route) {
      nd = car.route[car.routeIdx % car.route.length](L);
    } else {
      const opts = [];
      for (const [d, w] of [[L.d, 6], [right(L.d), 2.2], [left(L.d), 1.6]]) if (this.links.get(`${L.ti},${L.tj},${d}`)) opts.push([d, w]);
      nd = this.rng.weighted(opts);
    }
    car.next = this.connectors.get(`${L.id}>${L.ti},${L.tj},${nd}`) || null;
    if (!car.next) {
      // fall back to any available exit
      for (const d of [L.d, right(L.d), left(L.d)]) {
        const c = this.connectors.get(`${L.id}>${L.ti},${L.tj},${d}`);
        if (c) { car.next = c; break; }
      }
    }
  }
  addCar(car) {
    this.cars.push(car);
    car.piece.cars.push(car);
    this.city.carLayer && this.city.carLayer.assignPalette(car);
    this.place(car);
  }
  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    if (car.piece) {
      const k = car.piece.cars.indexOf(car);
      if (k >= 0) car.piece.cars.splice(k, 1);
    }
    for (const [k, v] of this.exitLock) if (v === car) this.exitLock.delete(k);
    this.city.carLayer && this.city.carLayer.releasePalette(car);
  }
  init() {
    const env = this.city.env;
    // parked cars
    for (const L of this.links.values()) {
      for (const p of L.park) {
        if (this.rng.chance(0.5)) {
          const car = this.makeCar(this.rng.weighted([['sedan', 40], ['suv', 25], ['van', 10], ['taxi', 6], ['police', 2]]), L, p.s);
          car.state = 'parked'; car.v = 0; car.spot = p; p.car = car;
          car.lat = PARK_OFF - LANE_OFF;
          L.cars.splice(L.cars.indexOf(car), 1);
          this.cars.push(car);
          this.city.carLayer && this.city.carLayer.assignPalette(car);
          this.place(car);
        }
      }
    }
    // moving cars
    const target = this.targetCount(env);
    for (let k = 0; k < target; k++) this.spawnMoving(true);
    // buses
    for (let k = 0; k < 2; k++) this.spawnBus(k);
  }
  targetCount(env) {
    const h = env.hour;
    let base = h < 5 ? 14 : h < 7 ? 30 : h < 10 ? 60 : h < 16 ? 46 : h < 19.5 ? 62 : h < 23 ? 40 : 22;
    if (env.snowing) base *= 0.7;
    return Math.round(base);
  }
  spawnMoving(anywhere = false) {
    const links = [...this.links.values()];
    for (let tries = 0; tries < 20; tries++) {
      const L = this.rng.pick(links);
      if (anywhere) {
        const s = this.rng.range(1, L.len - 3);
        if (L.cars.some((c) => Math.abs(c.s - s) < 4)) continue;
        const car = this.makeCar(this.pickType(), L, s);
        car.v = car.v0 * 0.6;
        this.addCar(car);
        return car;
      }
      // pull out of a parked spot
      const spots = L.park.filter((p) => p.car && p.car.state === 'parked');
      if (!spots.length) continue;
      const p = this.rng.pick(spots);
      if (L.cars.some((c) => c.s < p.s + 2 && c.s > p.s - 9)) continue;
      const car = p.car;
      p.car = null;
      car.spot = null;
      car.state = 'pullout';
      car.latTarget = 0;
      car.s = p.s;
      L.cars.push(car);
      car.piece = L;
      this.chooseNext(car);
      car.life = this.rng.range(50, 160);
      return car;
    }
    return null;
  }
  spawnBus(k) {
    // clockwise loop: east on j=2 (i 0->3), south on i=3 (j 2->4), west on j=4 (i 3->0), north on i=0 (j 4->2)
    const route = [
      (L) => (L.d === 0 ? (L.ti === 3 && L.tj === 2 ? 1 : 0) : L.d === 1 ? (L.ti === 3 && L.tj === 4 ? 2 : 1) : L.d === 2 ? (L.ti === 0 && L.tj === 4 ? 3 : 2) : (L.ti === 0 && L.tj === 2 ? 0 : 3)),
    ];
    const L = k === 0 ? this.links.get('0,2,0') : this.links.get('3,3,1');
    if (!L) return;
    const car = this.makeCar('bus', L, 2, { route, color: 0 });
    car.v = 2;
    car.life = 1e9;
    car.busStops = this.city.world.busStops;
    this.addCar(car);
  }
  spawnSpecial(type, opts = {}) {
    const links = [...this.links.values()].filter((L) => !L.cars.some((c) => c.s < 7));
    if (!links.length) return null;
    let L = opts.link || this.rng.pick(links);
    const car = this.makeCar(type, L, 0.5, opts);
    car.v = car.v0 * 0.5;
    car.life = opts.life ?? 120;
    car.fadeIn = 1;
    this.addCar(car);
    return car;
  }
  place(car) {
    const [x, y, h] = car.piece.at(car.s);
    let lx = 0, ly = 0;
    if (car.lat) {
      const nx = -Math.sin(h), ny = Math.cos(h);
      lx = nx * car.lat; ly = ny * car.lat;
    }
    car.x = x + lx; car.y = y + ly; car.h = h;
    if (car.state === 'pullout' || car.state === 'pullin') car.h += (car.lat - car.latTarget) * 0.25 * (car.state === 'pullout' ? -1 : 1);
  }
  leaderGap(car) {
    // distance to the nearest obstacle ahead along the route and its speed
    const P = car.piece;
    let best = 1e9, bestV = 0;
    for (const o of P.cars) {
      if (o === car || o.state === 'parked') continue;
      const ds = o.s - car.s;
      if (ds > 0 && ds - o.len * 0.5 - car.len * 0.5 < best) { best = ds - o.len * 0.5 - car.len * 0.5; bestV = o.v; }
    }
    if (best < 1e8) return [best, bestV];
    const rest = P.len - car.s;
    const nxt = P.kind === 'link' ? car.next : P.to;
    if (nxt) {
      for (const o of nxt.cars) {
        if (o === car || o.state === 'parked') continue;
        const ds = rest + o.s;
        if (ds - o.len * 0.5 - car.len * 0.5 < best) { best = ds - o.len * 0.5 - car.len * 0.5; bestV = o.v; }
      }
      if (best < 1e8) return [best, bestV];
      if (nxt.kind === 'conn') {
        for (const o of nxt.to.cars) {
          const ds = rest + nxt.len + o.s;
          if (ds - o.len * 0.5 - car.len * 0.5 < best) { best = ds - o.len * 0.5 - car.len * 0.5; bestV = o.v; }
        }
      }
    }
    return [best, bestV];
  }
  canEnter(car, C) {
    // signals
    const st = this.signalState(C.i, C.j);
    const axisEW = C.d === 0 || C.d === 2;
    const light = axisEW ? st.ew : st.ns;
    if (car.special === 'fire' && car.siren) {
      // emergency vehicles proceed carefully through reds
      if (light !== 'g' && car.wait < 1.5) return false;
    } else if (light === 'fr') {
      // flashing red: full stop, then go when the box is clear and no cross traffic is coming
      if (car.wait < 1.0) return false;
      if (this.boxBusy(C, car)) return false;
      const a = this.inLinks.get(`${C.i},${C.j},1`), b = this.inLinks.get(`${C.i},${C.j},3`);
      for (const L of [a, b]) if (L) for (const o of L.cars) if (o.state !== 'parked' && L.len - o.s < 9 && o.v > 1) return false;
    } else if (light === 'fy') {
      if (this.boxBusy(C, car)) return false;
    } else {
      if (light === 'r') return false;
      if (light === 'y') {
        const rest = car.piece.len - car.s;
        if (rest > 0.6 || car.v < 2.5) return false;
      }
    }
    // exit lock
    const lk = this.exitLock.get(C.to.id);
    if (lk && lk !== car) return false;
    // space on exit link
    for (const o of C.to.cars) if (o.s < car.len + 1.5 && o.state !== 'parked') return false;
    // left turn: yield to oncoming
    if (C.turn === 'l') {
      const opp = this.inLinks.get(`${C.i},${C.j},${(C.d + 2) % 4}`);
      if (opp) for (const o of opp.cars) if (o.state !== 'parked' && opp.len - o.s < 9 && (o.v > 0.5 || opp.len - o.s < 3)) return false;
      for (const c2 of this.connectors.values()) if (c2.i === C.i && c2.j === C.j && c2.d === (C.d + 2) % 4 && c2.cars.length) return false;
    }
    // pedestrians on the exit-side crosswalk when turning
    if (C.turn !== 's' && this.city.people && this.city.people.crosswalkBusy(C.i, C.j, C.nd)) return false;
    return true;
  }
  update(dt) {
    this.clock += dt;
    const env = this.city.env;
    const dark = env.darkness > 0.45;
    // population control
    const moving = this.cars.filter((c) => c.state !== 'parked' && !c.special && c.type !== 'bus').length;
    const target = this.targetCount(env);
    if (moving < target && this.rng.chance(dt * 1.2)) this.spawnMoving(false) || (this.rng.chance(0.2) && this.spawnMoving(true));
    this.updateSpecials(dt, env);
    for (const car of [...this.cars]) {
      if (car.state === 'parked') continue;
      this.stepCar(car, dt, moving > target + 3);
    }
    // lights/palette states
    for (const car of this.cars) {
      car.lights = car.state !== 'parked' && dark;
    }
  }
  updateSpecials(dt, env) {
    const sp = this.special, W = this.city.world;
    const h = env.hour;
    sp.fireTimer -= dt;
    if (sp.fireTimer <= 0) {
      sp.fireTimer = this.rng.range(150, 320);
      if (W.firehouse && !this.cars.some((c) => c.special === 'fire')) {
        const car = this.spawnSpecial('fire', { special: 'fire', siren: true, life: 70 });
        if (car) this.city.audio?.event('siren', car);
      }
    }
    sp.iceTimer -= dt;
    if (env.season === 1 && h > 12 && h < 20 && sp.iceTimer <= 0 && !this.cars.some((c) => c.special === 'icecream')) {
      sp.iceTimer = this.rng.range(80, 160);
      const L = this.links.get('1,2,0') || this.rng.pick([...this.links.values()]);
      this.spawnSpecial('icecream', { special: 'icecream', link: L, life: 150, stopAt: { link: '1,2,0', s: 9 } });
    }
    sp.garbageTimer -= dt;
    if (h > 5 && h < 8.5 && sp.garbageTimer <= 0 && !this.cars.some((c) => c.special === 'garbage')) {
      sp.garbageTimer = this.rng.range(60, 120);
      this.spawnSpecial('garbage', { special: 'garbage', life: 120 });
    }
    sp.plowTimer -= dt;
    if (env.season === 3 && (env.snowing || env.snowCover > 0.5) && sp.plowTimer <= 0 && !this.cars.some((c) => c.special === 'plow')) {
      sp.plowTimer = this.rng.range(70, 140);
      this.spawnSpecial('plow', { special: 'plow', life: 100 });
    }
  }
  stepCar(car, dt, overPop) {
    const P = car.piece;
    car.life -= dt;
    if (car.fadeIn) car.fadeIn = Math.max(0, car.fadeIn - dt * 1.5);
    // decide to park when over population / life over
    if (P.kind === 'link' && car.state === 'drive' && !car.special && car.type !== 'bus' && (car.life < 0 || overPop)) {
      const spot = P.park.find((p) => !p.car && p.s > car.s + 4 && p.s < car.s + 12);
      if (spot) { car.state = 'pullin'; car.spot = spot; spot.car = car; car.latTarget = PARK_OFF - LANE_OFF; }
    }
    if (car.fadeOut != null) {
      car.fadeOut -= dt;
      if (car.fadeOut <= 0) { this.removeCar(car); return; }
    }
    // special vehicles end of life: fade out on a link
    if (car.special && car.life < 0 && car.fadeOut == null) car.fadeOut = 1;
    // target speed
    let vMax = car.v0;
    if (car.state === 'pullout') vMax = 1.8;
    if (car.state === 'pullin') {
      const rem = car.spot.s - car.s;
      vMax = Math.max(0.4, Math.min(2.2, rem * 0.8));
    }
    if (car.special === 'icecream' || car.special === 'garbage') vMax *= 0.8;
    let [gap, lv] = this.leaderGap(car);
    // red light / stop line
    if (P.kind === 'link' && car.next) {
      const rest = P.len - car.s;
      if (rest < 12 && !this.canEnter(car, car.next)) {
        if (rest < gap) { gap = rest; lv = 0; }
      }
    }
    // bus stops / special stops
    if (car.type === 'bus' && P.kind === 'link') {
      for (const b of car.busStops || []) {
        const along = P.d === 0 || P.d === 2 ? b.x : b.y;
        const cross = P.d === 0 || P.d === 2 ? b.y : b.x;
        const lanePos = P.d === 0 || P.d === 2 ? P.pts[0][1] : P.pts[0][0];
        if (Math.abs(cross - lanePos) > 3) continue;
        const sStop = P.d === 0 ? along - P.pts[0][0] : P.d === 2 ? P.pts[0][0] - along : P.d === 1 ? along - P.pts[0][1] : P.pts[0][1] - along;
        const rem = sStop - car.s;
        if (car.dwell == null && rem > -0.5 && rem < gap) { gap = rem; lv = 0; if (rem < 0.4 && car.v < 0.3) { car.dwell = 6; this.city.audio?.event('bus', car); } }
      }
      if (car.dwell != null) { car.dwell -= dt; gap = 0; lv = 0; if (car.dwell <= 0) { car.dwell = null; car.leftStop = 3; } }
      if (car.leftStop) { car.leftStop -= dt; if (car.leftStop <= 0) car.leftStop = 0; }
    }
    if (car.stopAt && P.kind === 'link' && P.id === car.stopAt.link && car.stopDone == null) {
      const rem = car.stopAt.s - car.s;
      if (rem > -0.3 && rem < gap) { gap = rem; lv = 0; if (rem < 0.4 && car.v < 0.2) { car.stopDone = 0; car.dwell = 35; this.city.onIceCreamStop?.(car); } }
    }
    if (car.stopDone === 0 && car.dwell != null) {
      car.dwell -= dt; gap = 0; lv = 0;
      if (car.dwell <= 0) { car.dwell = null; car.stopDone = 1; this.city.onIceCreamLeave?.(car); }
    }
    if (car.leftStop && car.type === 'bus') gap = Math.max(gap, 0);
    // IDM
    const a = 2.6, b = 4.0, s0 = 0.9, T = 0.9;
    const v = car.v;
    const sStar = s0 + v * T + (v * (v - lv)) / (2 * Math.sqrt(a * b));
    let acc = a * (1 - Math.pow(v / vMax, 4) - Math.pow(Math.max(0, sStar) / Math.max(0.05, gap), 2));
    acc = clamp(acc, -9, a);
    car.v = Math.max(0, v + acc * dt);
    if (gap < 0.05) car.v = 0;
    car.brake = acc < -0.6 || (car.v < 0.1 && gap < 3);
    // waiting & honking
    if (car.v < 0.1) {
      car.wait += dt;
      if (P.kind === 'link' && car.next && car.wait > 1.2 && gap > 1.5 && gap < 4 && lv < 0.1 && this.rng.chance(dt * 0.12) && car.honked <= 0) {
        this.honks.push(car); car.honked = 8;
      }
    } else car.wait = 0;
    car.honked -= dt;
    // move
    car.s += car.v * dt;
    if (car.state === 'pullout' || car.state === 'pullin') {
      const k = Math.min(1, dt * (car.state === 'pullout' ? 0.9 : 1.1) * Math.max(0.6, car.v));
      car.lat += (car.latTarget - car.lat) * k;
      if (car.state === 'pullout' && Math.abs(car.lat) < 0.05) { car.lat = 0; car.state = 'drive'; }
      if (car.state === 'pullin' && car.s >= car.spot.s - 0.05) {
        car.s = car.spot.s; car.lat = car.latTarget; car.state = 'parked'; car.v = 0; car.brake = false;
        const k2 = P.cars.indexOf(car); if (k2 >= 0) P.cars.splice(k2, 1);
        this.place(car);
        return;
      }
    }
    // piece transitions
    while (car.s >= car.piece.len) {
      const cur = car.piece;
      const over = car.s - cur.len;
      let nxt = null;
      if (cur.kind === 'link') {
        if (!car.next || !this.canEnterNow(car, car.next)) { car.s = cur.len; car.v = 0; break; }
        nxt = car.next;
        this.exitLock.set(nxt.to.id, car);
      } else {
        nxt = cur.to;
        if (this.exitLock.get(nxt.id) === car) this.exitLock.delete(nxt.id);
        if (car.route) car.routeIdx++;
      }
      cur.cars.splice(cur.cars.indexOf(car), 1);
      nxt.cars.push(car);
      car.piece = nxt;
      car.s = over;
      if (nxt.kind === 'link') this.chooseNext(car);
    }
    this.place(car);
  }
  boxBusy(C, car) {
    for (const c2 of this.connectors.values()) if (c2.i === C.i && c2.j === C.j && c2.cars.some((o) => o !== car)) return true;
    return false;
  }
  canEnterNow(car, C) {
    // final check at the stop line (ignores yellow-distance rule)
    const st = this.signalState(C.i, C.j);
    const light = C.d === 0 || C.d === 2 ? st.ew : st.ns;
    if (light === 'r' && !(car.special === 'fire' && car.wait > 1.5)) return false;
    if (light === 'fr' && (car.wait < 1.0 || this.boxBusy(C, car))) return false;
    const lk = this.exitLock.get(C.to.id);
    if (lk && lk !== car) return false;
    return true;
  }
  carAt(x, y, r = 1.2) {
    for (const c of this.cars) if (dist2(c.x, c.y, x, y) < r * r) return c;
    return null;
  }
}
