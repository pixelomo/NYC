// Vehicle physics for every car that has left the lane graph: the one the player drives, police in
// pursuit, cars knocked off their lane in a crash, abandoned cars and burnt-out wrecks. Each is a
// rigid box with momentum and spin; tyres grip sideways; walls come from the collision grid and
// other cars are boxes too, so a hit pushes, spins and dents instead of the two overlapping.
// Damage collects on the side that took it; a badly hurt engine smokes, then catches fire, and a
// burning car finally explodes, throwing its neighbours about.

import { clamp, RNG } from '../core/math.js';

export const MASS = { sedan: 1, taxi: 1, police: 1.15, suv: 1.35, van: 1.6, icecream: 1.8, truck: 3, garbage: 3.6, plow: 3.6, fire: 4.2, bus: 5 };
const KNOCK_V = 1.6; // closing speed that knocks a lane car off its lane
const REST = 0.2; // restitution of car bodies
const DRIVEN = new Set(['player', 'chase', 'leaving']);

export class Vehicles {
  constructor(city) {
    this.city = city;
    this.coll = city.coll;
    this.rng = new RNG(9157);
    this.samples = new Map();
    this.damaged = new Set(); // cars that smoke, burn or smoulder
    this.grid = new Map();
  }

  // ---- bodies -----------------------------------------------------------------------------------
  init(c) {
    if (c.mass) return c;
    c.mass = MASS[c.type] || 1;
    c.inertia = (c.mass * (c.len * c.len + c.wid * c.wid)) / 12;
    c.maxHp = c.hp = Math.round(100 * Math.sqrt(c.mass));
    c.dmg = [0, 0, 0, 0]; // front, rear, left, right (0..1, drawn as crumple)
    c.dentL = 0; c.dentR = 0; // where along each side the dent sits (-1 rear .. 1 front)
    c.vx = Math.cos(c.h) * (c.v || 0); c.vy = Math.sin(c.h) * (c.v || 0); c.w = 0;
    c.seed = (c.id * 0.6180339) % 1;
    return c;
  }
  // set a car's world velocity from its lane speed (when it leaves the lanes)
  launch(c) {
    this.init(c);
    c.vx = Math.cos(c.h) * (c.v || 0); c.vy = Math.sin(c.h) * (c.v || 0); c.w = 0;
  }
  fwd(c) { return c.vx * Math.cos(c.h) + c.vy * Math.sin(c.h); }
  speed(c) { return c.free && c.mass ? Math.hypot(c.vx, c.vy) : Math.abs(c.v || 0); }
  pointVel(c, px, py) {
    if (c.free && c.mass) return [c.vx - c.w * (py - c.y), c.vy + c.w * (px - c.x)];
    const v = c.state === 'parked' ? 0 : c.v || 0;
    return [Math.cos(c.h) * v, Math.sin(c.h) * v];
  }
  applyImpulse(c, jx, jy, rx, ry) {
    c.vx += jx / c.mass; c.vy += jy / c.mass;
    c.w += (rx * jy - ry * jx) / c.inertia;
  }
  // a driver's input for this step: new forward speed, wanted yaw rate, sideways grip
  steer(c, dt, fwd, yaw, grip) {
    const ch = Math.cos(c.h), sh = Math.sin(c.h);
    const lat = (-c.vx * sh + c.vy * ch) * Math.exp(-grip * dt);
    c.vx = fwd * ch - lat * sh; c.vy = fwd * sh + lat * ch;
    c.w += (yaw - c.w) * Math.min(1, dt * (grip > 6 ? 9 : 3));
    c.v = fwd;
    c.drivenAt = this.city.time;
  }
  // no one at the wheel: roll to a stop
  coast(c, dt) {
    const ch = Math.cos(c.h), sh = Math.sin(c.h);
    let f = c.vx * ch + c.vy * sh, l = -c.vx * sh + c.vy * ch;
    const brake = c.state === 'wreck' ? 7 : c.state === 'crashed' || c.state === 'loose' || c.state === 'stopped' ? 4 : 2.5;
    f -= Math.sign(f) * Math.min(Math.abs(f), (brake + 0.3 * Math.abs(f)) * dt);
    l *= Math.exp(-(c.state === 'wreck' ? 4 : 6) * dt);
    c.vx = f * ch - l * sh; c.vy = f * sh + l * ch;
    c.w *= Math.exp(-2.4 * dt);
    c.v = f;
    if (Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.w) > 0.015) this.move(c, dt);
    else { c.vx = 0; c.vy = 0; c.w = 0; c.v = 0; }
  }

  // ---- walls ------------------------------------------------------------------------------------
  // perimeter sample points of a car's box in its own frame
  samplesFor(c) {
    const key = c.type;
    let s = this.samples.get(key);
    if (!s) {
      const pts = [], L = c.len, W = c.wid;
      const nL = Math.max(2, Math.ceil(L / 0.22)), nW = Math.max(2, Math.ceil(W / 0.22));
      for (let i = 0; i <= nL; i++) { const x = -L / 2 + (L * i) / nL; pts.push(x, -W / 2, x, W / 2); }
      for (let j = 1; j < nW; j++) { const y = -W / 2 + (W * j) / nW; pts.push(-L / 2, y, L / 2, y); }
      s = new Float32Array(pts);
      this.samples.set(key, s);
    }
    return s;
  }
  boxFree(c, x, y, h) {
    const S = this.samplesFor(c), C = this.coll;
    const ch = Math.cos(h), sh = Math.sin(h);
    for (let i = 0; i < S.length; i += 2) if (C.isSolid(x + S[i] * ch - S[i + 1] * sh, y + S[i] * sh + S[i + 1] * ch)) return false;
    return true;
  }
  // where a box at (x, y, h) touches walls, and which way is out
  wallHit(c, x, y, h) {
    const S = this.samplesFor(c), C = this.coll;
    const ch = Math.cos(h), sh = Math.sin(h);
    let n = 0, sx = 0, sy = 0, gx = 0, gy = 0;
    for (let i = 0; i < S.length; i += 2) {
      const px = x + S[i] * ch - S[i + 1] * sh, py = y + S[i] * sh + S[i + 1] * ch;
      if (!C.isSolid(px, py)) continue;
      n++; sx += px; sy += py;
      gx += (C.isSolid(px - 0.2, py) ? 1 : 0) - (C.isSolid(px + 0.2, py) ? 1 : 0);
      gy += (C.isSolid(px, py - 0.2) ? 1 : 0) - (C.isSolid(px, py + 0.2) ? 1 : 0);
    }
    if (!n) return null;
    sx /= n; sy /= n;
    let l = Math.hypot(gx, gy);
    if (l < 1e-6) { gx = x - sx; gy = y - sy; l = Math.hypot(gx, gy); }
    if (l < 1e-6) { gx = -Math.cos(h); gy = -Math.sin(h); l = 1; }
    return { nx: gx / l, ny: gy / l, px: sx, py: sy };
  }
  // integrate a free car, sub-stepping fast ones; returns the hardest wall impact (as a speed change)
  move(c, dt) {
    const reach = Math.hypot(c.vx, c.vy) * dt + Math.abs(c.w) * dt * c.len * 0.5;
    const n = Math.min(5, Math.max(1, Math.ceil(reach / 0.16)));
    let worst = 0;
    for (let k = 0; k < n; k++) worst = Math.max(worst, this.moveStep(c, dt / n));
    return worst;
  }
  moveStep(c, dt) {
    const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt, nh = c.h + c.w * dt;
    if (this.boxFree(c, nx, ny, nh)) { c.x = nx; c.y = ny; c.h = nh; return 0; }
    if (!this.boxFree(c, c.x, c.y, c.h)) {
      // already overlapping a wall (shoved into one): ease out along its normal, stop pushing in
      const hit = this.wallHit(c, c.x, c.y, c.h);
      if (hit) {
        c.x += hit.nx * 0.05; c.y += hit.ny * 0.05;
        const vn = c.vx * hit.nx + c.vy * hit.ny;
        if (vn < 0) { c.vx -= vn * hit.nx; c.vy -= vn * hit.ny; }
      }
      c.w *= 0.6;
      return 0;
    }
    const hit = this.wallHit(c, nx, ny, nh);
    let impact = 0;
    if (hit) {
      const wx = hit.nx, wy = hit.ny, rx = hit.px - c.x, ry = hit.py - c.y;
      const vpx = c.vx - c.w * ry, vpy = c.vy + c.w * rx;
      const vn = vpx * wx + vpy * wy;
      if (vn < 0) {
        const rn = rx * wy - ry * wx;
        const j = (-(1 + REST) * vn) / (1 / c.mass + (rn * rn) / c.inertia);
        this.applyImpulse(c, j * wx, j * wy, rx, ry);
        // scrape along the wall
        const tx = -wy, ty = wx;
        const vt = (c.vx - c.w * ry) * tx + (c.vy + c.w * rx) * ty;
        const rt = rx * ty - ry * tx;
        const jt = clamp(-vt / (1 / c.mass + (rt * rt) / c.inertia), -0.35 * j, 0.35 * j);
        this.applyImpulse(c, jt * tx, jt * ty, rx, ry);
        impact = j / c.mass;
        this.damage(c, hit.px, hit.py, -wx, -wy, impact, null);
        if (impact > 2.2) this.city.audio?.event('crash', { x: hit.px, y: hit.py, z: 0.4, k: impact });
        if (impact > 1.5) this.city.particles?.sparks(hit.px, hit.py, 0.35, Math.min(14, impact * 2));
      }
    }
    // slide on with what is left of the velocity
    const sx = c.x + c.vx * dt, sy = c.y + c.vy * dt, sh = c.h + c.w * dt;
    if (this.boxFree(c, sx, sy, sh)) { c.x = sx; c.y = sy; c.h = sh; }
    else if (this.boxFree(c, sx, sy, c.h)) { c.x = sx; c.y = sy; c.w *= 0.5; }
    else if (this.boxFree(c, c.x, c.y, sh)) c.h = sh;
    else c.w *= 0.5;
    return impact;
  }

  // ---- car against car --------------------------------------------------------------------------
  inBox(c, x, y, pad = 0) {
    const dx = x - c.x, dy = y - c.y, ch = Math.cos(c.h), sh = Math.sin(c.h);
    return Math.abs(dx * ch + dy * sh) <= c.len / 2 + pad && Math.abs(-dx * sh + dy * ch) <= c.wid / 2 + pad;
  }
  // separating-axis test of two boxes: normal (from b to a), depth and a contact point
  sat(a, b) {
    const ac = Math.cos(a.h), as = Math.sin(a.h), bc = Math.cos(b.h), bs = Math.sin(b.h);
    const dx = a.x - b.x, dy = a.y - b.y;
    let best = 1e9, nx = 0, ny = 0;
    for (let k = 0; k < 4; k++) {
      const ux = k === 0 ? ac : k === 1 ? -as : k === 2 ? bc : -bs;
      const uy = k === 0 ? as : k === 1 ? ac : k === 2 ? bs : bc;
      const ra = (a.len / 2) * Math.abs(ac * ux + as * uy) + (a.wid / 2) * Math.abs(-as * ux + ac * uy);
      const rb = (b.len / 2) * Math.abs(bc * ux + bs * uy) + (b.wid / 2) * Math.abs(-bs * ux + bc * uy);
      const d = dx * ux + dy * uy;
      const o = ra + rb - Math.abs(d);
      if (o <= 0) return null;
      if (o < best) { best = o; const s = d < 0 ? -1 : 1; nx = ux * s; ny = uy * s; }
    }
    let cx = 0, cy = 0, n = 0;
    for (let pass = 0; pass < 2; pass++) {
      const P = pass ? b : a, Q = pass ? a : b, pc = Math.cos(P.h), ps = Math.sin(P.h);
      for (let k = 0; k < 4; k++) {
        const sx = k & 1 ? 1 : -1, sy = k & 2 ? 1 : -1;
        const px = P.x + pc * sx * P.len * 0.5 - ps * sy * P.wid * 0.5, py = P.y + ps * sx * P.len * 0.5 + pc * sy * P.wid * 0.5;
        if (this.inBox(Q, px, py, 0.03)) { cx += px; cy += py; n++; }
      }
    }
    if (n) { cx /= n; cy /= n; } else { cx = (a.x + b.x) / 2; cy = (a.y + b.y) / 2; }
    return { nx, ny, depth: best, cx, cy };
  }
  buildGrid() {
    const g = this.grid;
    g.clear();
    for (const c of this.city.traffic.cars) {
      if (c.type === 'subway' || c.fadeOut != null) continue;
      const k = (Math.floor(c.x / 4) << 16) | Math.floor(c.y / 4);
      let l = g.get(k);
      if (!l) g.set(k, (l = []));
      l.push(c);
    }
  }
  // cars in the grid cells around (x, y) (the grid is rebuilt every frame by contacts())
  carsNear(x, y) {
    const out = [], cx = Math.floor(x / 4), cy = Math.floor(y / 4);
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const l = this.grid.get((gx << 16) | gy);
        if (l) for (const c of l) out.push(c);
      }
    return out;
  }
  contacts() {
    this.buildGrid();
    const done = new Set();
    for (const a of this.city.traffic.cars) {
      if (!a.free || a.fadeOut != null) continue;
      this.init(a);
      const cx = Math.floor(a.x / 4), cy = Math.floor(a.y / 4);
      for (let gx = cx - 2; gx <= cx + 2; gx++)
        for (let gy = cy - 2; gy <= cy + 2; gy++) {
          const l = this.grid.get((gx << 16) | gy);
          if (!l) continue;
          for (const b of l) {
            if (b === a) continue;
            if (b.free) { const key = a.id < b.id ? a.id * 100003 + b.id : b.id * 100003 + a.id; if (done.has(key)) continue; done.add(key); }
            const R = (a.len + b.len) / 2 + 0.1;
            if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > R * R) continue;
            const m = this.sat(a, b);
            if (m) this.resolve(a, b, m);
          }
        }
    }
  }
  resolve(a, b, m) {
    const { nx, ny, depth, cx, cy } = m;
    const pa = this.pointVel(a, cx, cy), pb = this.pointVel(b, cx, cy);
    const closing = -((pa[0] - pb[0]) * nx + (pa[1] - pb[1]) * ny);
    // a lane car (or parked car) stays on its rails for a nudge, but a real hit knocks it loose
    if (!b.free) {
      const thr = b.state === 'parked' ? 0.7 : KNOCK_V;
      if (closing > thr || !this.boxFree(a, a.x + nx * depth, a.y + ny * depth, a.h)) this.loosen(b, a);
    }
    this.init(b);
    const ia = 1 / a.mass, ib = b.free ? 1 / b.mass : 0;
    // push apart, by mass; whoever is against a wall stays put
    const wa = ia / (ia + ib), wb = 1 - wa;
    const ax = a.x + nx * depth * wa, ay = a.y + ny * depth * wa;
    const bx = b.x - nx * depth * wb, by = b.y - ny * depth * wb;
    const okA = this.boxFree(a, ax, ay, a.h), okB = !b.free || this.boxFree(b, bx, by, b.h);
    if (okA && okB) { a.x = ax; a.y = ay; if (b.free) { b.x = bx; b.y = by; } }
    else if (okA || !b.free) { if (this.boxFree(a, a.x + nx * depth, a.y + ny * depth, a.h)) { a.x += nx * depth; a.y += ny * depth; } }
    else if (b.free && this.boxFree(b, b.x - nx * depth, b.y - ny * depth, b.h)) { b.x -= nx * depth; b.y -= ny * depth; }
    if (closing <= 0) return;
    // impulse at the contact point, with spin
    const rax = cx - a.x, ray = cy - a.y, rbx = cx - b.x, rby = cy - b.y;
    const rna = rax * ny - ray * nx, rnb = rbx * ny - rby * nx;
    const Ia = 1 / a.inertia, Ib = b.free ? 1 / b.inertia : 0;
    const j = ((1 + REST) * closing) / (ia + ib + rna * rna * Ia + rnb * rnb * Ib);
    this.applyImpulse(a, j * nx, j * ny, rax, ray);
    if (b.free) this.applyImpulse(b, -j * nx, -j * ny, rbx, rby);
    // friction along the contact
    const tx = -ny, ty = nx;
    const qa = this.pointVel(a, cx, cy), qb = this.pointVel(b, cx, cy);
    const vt = (qa[0] - qb[0]) * tx + (qa[1] - qb[1]) * ty;
    const rta = rax * ty - ray * tx, rtb = rbx * ty - rby * tx;
    const jt = clamp(-vt / (ia + ib + rta * rta * Ia + rtb * rtb * Ib), -0.3 * j, 0.3 * j);
    this.applyImpulse(a, jt * tx, jt * ty, rax, ray);
    if (b.free) this.applyImpulse(b, -jt * tx, -jt * ty, rbx, rby);
    // damage: the speed change each car felt
    const dva = j / a.mass, dvb = j / b.mass;
    this.damage(a, cx, cy, -nx, -ny, dva, b);
    this.damage(b, cx, cy, nx, ny, dvb, a);
    if (closing > 2) this.city.audio?.event('crash', { x: cx, y: cy, z: 0.4, k: closing });
    if (closing > 2.5) this.city.particles?.sparks(cx, cy, 0.45, Math.min(18, closing * 2));
    if (closing > 3.5 && this.rng.chance(0.5)) this.city.particles?.glass(cx, cy, 0.7, 6);
    this.city.player?.onCrash(a, b, closing);
  }
  // take a car off the lane graph and hand it to physics
  loosen(c, by) {
    if (c.free) return;
    const was = c.state;
    this.city.traffic.detach(c);
    this.launch(c);
    c.state = was === 'parked' ? 'loose' : 'crashed';
    c.crashT = 0; c.idleT = 0; c.life = 1e9; c.fadeIn = 0; c.siren = c.state === 'crashed' && c.siren;
    if (was === 'parked' && this.rng.chance(0.45)) this.city.audio?.event('alarm', c);
    void by;
  }

  // ---- damage, fire, explosions -----------------------------------------------------------------
  // a hit that changed the car's speed by dv; (dx, dy) points from the car toward the face hit
  damage(c, px, py, dx, dy, dv, by) {
    const amount = Math.max(0, dv - 2.0) * 6.5;
    if (amount > 0) this.hurt(c, amount, px, py, dx, dy, by);
  }
  hurt(c, amount, px, py, dx, dy, by) {
    if (c.type === 'subway' || amount <= 0) return;
    this.init(c);
    const ch = Math.cos(c.h), sh = Math.sin(c.h);
    const lx = dx * ch + dy * sh, ly = -dx * sh + dy * ch;
    const z = Math.abs(lx) * c.wid > Math.abs(ly) * c.len * 0.42 ? (lx > 0 ? 0 : 1) : ly > 0 ? 2 : 3;
    const share = amount / (c.maxHp * 0.75);
    const old = c.dmg[z];
    c.dmg[z] = Math.min(1, old + share);
    if (z >= 2) {
      const u = clamp(((px - c.x) * ch + (py - c.y) * sh) / (c.len / 2), -0.85, 0.85);
      const key = z === 2 ? 'dentL' : 'dentR';
      c[key] = old > 0.02 ? (c[key] * old + u * share) / (old + share) : u;
    }
    const pl = this.city.player;
    const blame = by === 'player' || (pl && pl.car && by === pl.car) || (by && by.blameT != null && this.city.time - by.blameT < 4 && by.state === 'wreck');
    if (blame && c !== pl?.car) c.blameT = this.city.time;
    const before = c.hp;
    c.hp = Math.max(0, c.hp - amount);
    if (c.hp < c.maxHp * 0.5) this.damaged.add(c);
    if (c.hp <= 0 && c.fireT == null && !c.wreck) this.ignite(c);
    pl?.onCarHurt(c, before - c.hp, blame);
  }
  ignite(c) {
    c.fireT = 0;
    c.fuse = this.rng.range(4.5, 7.5);
    this.damaged.add(c);
    this.city.player?.onIgnite(c);
  }
  explode(c) {
    const city = this.city, pl = city.player;
    c.fireT = null; c.wreck = true; c.burnT = this.rng.range(8, 13); c.smolderT = 45;
    if (!c.free) this.loosen(c);
    this.init(c);
    pl?.beforeExplode(c);
    c.state = 'wreck'; c.siren = false; c.brake = false; c.lights = false; c.hp = 0; c.idleT = 0; c.wreckT = 0;
    for (let k = 0; k < 4; k++) c.dmg[k] = Math.max(c.dmg[k], 0.55);
    c.hopV = 3.4 / Math.sqrt(c.mass); c.w += this.rng.range(-2.4, 2.4) / c.mass;
    this.damaged.add(c);
    const R = 5.5;
    const blamed = c.blameT != null && city.time - c.blameT < 20;
    for (const o of city.traffic.cars) {
      if (o === c || o.type === 'subway' || o.fadeOut != null) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d > R + o.len / 2) continue;
      const k = clamp(1 - (d - o.len / 4) / R, 0, 1);
      if (k <= 0) continue;
      if (!o.free) this.loosen(o);
      this.init(o);
      const ux = (o.x - c.x) / (d || 1), uy = (o.y - c.y) / (d || 1);
      const kick = (7.5 * k) / Math.sqrt(o.mass);
      o.vx += ux * kick; o.vy += uy * kick; o.w += (this.rng.range(-1.6, 1.6) * k) / o.mass;
      o.hopV = Math.max(o.hopV || 0, (2.4 * k) / o.mass);
      if (blamed) o.blameT = city.time;
      this.hurt(o, 75 * k, o.x - ux * o.len * 0.3, o.y - uy * o.len * 0.3, -ux, -uy, blamed ? 'player' : null);
      if (o.state === 'crashed' && k > 0.3) { o.crashT = 9; }
    }
    pl?.blast(c, R, blamed);
    city.particles?.explosion(c.x, c.y, (c.z || 0) + 0.5, c);
    city.decals?.add('scorch', c.x, c.y, (c.z || 0), this.rng.range(0, 6.28), 1.7 + c.len * 0.18, 1);
    city.audio?.event('explosion', c);
    const cam = city.camera, dd = Math.hypot(cam.x - c.x, cam.y - c.y);
    cam.shake?.(clamp(0.5 - dd / 50, 0, 0.5));
  }

  // ---- per frame --------------------------------------------------------------------------------
  update(dt) {
    const city = this.city, tr = city.traffic, now = city.time, pl = city.player, view = city.view;
    const P = city.people;
    // cars nobody is driving this frame
    for (const c of tr.cars) {
      if (!c.free || c.fadeOut != null) continue;
      this.init(c);
      if (c.drivenAt !== now) this.coast(c, dt);
      // explosions make cars hop
      if (c.hopV || c.hopZ) {
        c.hopV = (c.hopV || 0) - 9.8 * dt; c.hopZ = (c.hopZ || 0) + c.hopV * dt;
        if (c.hopZ <= 0) { c.hopZ = 0; c.hopV = c.hopV < -1.6 ? -c.hopV * 0.25 : 0; }
      }
      c.z += (this.coll.groundZ(c.x, c.y) - c.z) * Math.min(1, dt * 10);
      if (Math.abs(c.v) > 1 || Math.hypot(c.vx, c.vy) > 1) this.runOver(c, P);
      city.poles?.carHit(c);
    }
    this.contacts();
    // fires, smoke and the cars nobody needs any more
    for (const c of [...this.damaged]) {
      if (c.fadeOut != null && c.fadeOut <= 0) { this.damaged.delete(c); continue; }
      if (c.fireT != null) { c.fireT += dt; if (c.fireT >= c.fuse) this.explode(c); }
      if (c.wreck) {
        if (c.burnT > 0) c.burnT -= dt;
        else if (c.smolderT > 0) c.smolderT -= dt;
      }
    }
    for (const c of [...tr.cars]) {
      if (!c.free) continue;
      if (c.fadeOut != null) {
        if (c === pl?.car) { c.fadeOut = null; continue; }
        c.fadeOut -= dt;
        if (c.fadeOut <= 0) this.remove(c);
        continue;
      }
      if (DRIVEN.has(c.state)) continue;
      c.idleT = (c.idleT || 0) + dt;
      if (c.state === 'crashed') {
        // a dazed driver: back onto the lane if the car still runs, otherwise out and off on foot
        c.crashT = (c.crashT || 0) + dt;
        if (this.speed(c) < 0.3 && c.crashT > 1.6) {
          if (c.hp > c.maxHp * 0.55 && c.crashT < 6 && c.fireT == null && tr.reattach(c)) continue;
          if (c.crashT > 2.6) { pl?.ejectDriver(c, c.fireT != null ? 'fire' : 'crash'); c.state = 'abandoned'; c.idleT = 0; }
        }
        continue;
      }
      const seen = view.visible(c.x, c.y, 0, 4);
      const blocking = c.blockT != null && now - c.blockT < 1.5;
      const limit = c.state === 'wreck' ? (c.smolderT > 0 ? 1e9 : 30) : 40;
      if ((!seen && (c.idleT > limit || (blocking && c.idleT > 8))) || c.idleT > 160) c.fadeOut = 1;
    }
    // things off the lanes that lane traffic must stop for
    const obs = [];
    if (pl && pl.active && !pl.car && pl.p && pl.p.z < 0.05) obs.push({ x: pl.p.x, y: pl.p.y, r: 0.3, v: 1 });
    for (const c of tr.cars) if (c.free && c.fadeOut == null) obs.push({ x: c.x, y: c.y, r: c.len / 2, v: this.speed(c), car: c });
    if (pl) for (const o of pl.officers) if (o.z < 0.05 && o.state === 'cop') obs.push({ x: o.x, y: o.y, r: 0.3, v: 1 });
    this.obstacles = obs;
  }
  remove(c) {
    this.damaged.delete(c);
    this.city.player?.forget(c);
    this.city.traffic.removeCar(c);
  }
  // people in the path of a moving car dive aside, get knocked flat, or worse
  runOver(c, P) {
    const v = this.fwd(c), sp = Math.hypot(c.vx, c.vy);
    if (sp < 1) return;
    const sg = v >= 0 ? 1 : -1, hx = Math.cos(c.h) * sg, hy = Math.sin(c.h) * sg;
    const pl = this.city.player;
    const mine = pl && c === pl.car;
    for (const q of P.near(c.x, c.y, c.len / 2 + 2.6)) {
      if (q === pl?.p || q.alpha < 0.5 || q.inCar) continue;
      const st = q.state;
      if (!(st === 'walk' || st === 'idle' || st === 'wait' || st === 'return' || st === 'busWait' || st === 'arrived' || st === 'flee' || st === 'cop' || st === 'approach' || st === 'activity' && !q.seat)) continue;
      const dx = q.x - c.x, dy = q.y - c.y;
      const ahead = dx * hx + dy * hy, lat = hx * dy - hy * dx;
      if (ahead < -c.len / 2 || ahead > c.len / 2 + 2.2 || Math.abs(lat) > c.wid / 2 + 0.55) continue;
      const s = lat >= 0 ? 1 : -1;
      if (ahead < c.len / 2 + 0.15 && Math.abs(lat) < c.wid / 2 + 0.12 && sp > 2.6) {
        const lethal = mine && sp > 6.2;
        if (st === 'activity') this.city.activities?.leave(q);
        if (lethal) P.kill(q, hx, hy, 'car');
        else P.knock(q, hx * 1.2 + -hy * s * 0.6, hy * 1.2 + hx * s * 0.6);
        pl?.onRunOver(c, q, lethal);
      } else if (st !== 'activity' && st !== 'cop') {
        q.dodge = { x: -hy * s, y: hx * s, t: 0.55, back: st };
        q.state = 'dodge'; q.thought = this.rng.pick(['WHOA!', 'HEY!', 'Look out!', 'Crazy driver!']);
      }
    }
  }
}
