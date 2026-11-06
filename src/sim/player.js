// Play mode: take over one of the city's people. Walk about, climb into parked cars or haul drivers
// out of moving ones, and drive, arcade style, on a static collision grid. Crimes raise the HEAT;
// police cars leave their patrols (or arrive from out of sight) and give chase, steered along the
// streets by a distance field that flows toward the player. Get boxed in and you're busted; stay out
// of their way and the heat cools off. No weapons and no harm: people dive out of the way (or land
// on their backs and get up grumbling), and the worst that happens to the player is a ride downtown.

import { MAP } from '../world/layout.js';
import { clamp, dist, dist2, RNG } from '../core/math.js';
import { Collision } from './collide.js';

const WALK = 1.3, RUN = 2.8, R_FOOT = 0.2;
const MAX_HEAT = 5;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const NAMES = { sedan: 'SEDAN', taxi: 'TAXI', suv: 'SUV', van: 'VAN', police: 'POLICE CAR', bus: 'BUS', truck: 'TRUCK', fire: 'FIRE TRUCK', icecream: 'ICE-CREAM TRUCK', garbage: 'GARBAGE TRUCK', plow: 'SNOW PLOW' };

export class Player {
  constructor(city) {
    this.city = city;
    this.coll = new Collision(city.world);
    this.rng = new RNG(4321);
    this.active = false;
    this.p = null; // the person under control
    this.car = null; // the car they are driving
    this.heat = 0;
    this.cool = 0;
    this.chasers = [];
    this.leaving = [];
    this.abandoned = [];
    this.recruitT = 0;
    this.flowT = 0;
    this.bustT = 0;
    this.busted = 0;
    this.msgs = [];
    this.input = { x: 0, y: 0, run: false, brake: false };
    this.camTarget = { x: 0, y: 0, z: 0 };
    this.obstacles = [];
    this.ramT = 0;
    this.speedT = 0;
    this.buildCells();
  }

  // ---- control --------------------------------------------------------------------------------
  start(p) {
    const P = this.city.people;
    if (!p || p.state === 'vanish' || p.dead) return false;
    if (this.active) this.stop();
    if (p.actKind) this.city.activities.leave(p);
    if (p.seat) { p.seat.b.used[p.seat.k] = false; p.seat = null; }
    if (p.stoopSeat) { p.stoopSeat.used = false; p.stoopSeat = null; }
    if (p.crossing) P.endCross(p);
    p.state = 'player'; p.plan = []; p.path = null; p.alpha = 1; p.anim = 'idle'; p.animFrame = null; p.forceFace = false;
    p.z = this.coll.groundZ(p.x, p.y); p.thought = '';
    this.p = p;
    this.active = true;
    this.heat = 0; this.cool = 0; this.bustT = 0; this.busted = 0;
    this.camTarget.x = p.x; this.camTarget.y = p.y;
    this.city.camera.follow = this.camTarget;
    this.say(`You are ${p.name}`, 3);
    return true;
  }
  stop() {
    if (!this.active) return;
    if (this.car) this.exitCar(true);
    const p = this.p, P = this.city.people;
    if (p) {
      p.state = 'idle'; p.timer = 0.4; p.alpha = 1; p.inCar = false;
      p.node = P.nearestOf(P.nav.nodes, p.x, p.y);
      const home = p.home || P.pickHome();
      p.plan = [{ t: 'go', node: home, thought: 'What a day' }, { t: 'enter' }];
    }
    this.endChase(true);
    this.heat = 0;
    this.active = false;
    this.p = null;
    if (this.city.camera.follow === this.camTarget) this.city.camera.follow = null;
  }
  // F / Enter: get in or out
  action() {
    if (!this.active || this.busted > 0) return;
    if (this.car) { this.exitCar(); return; }
    const c = this.nearCar();
    if (c) this.enterCar(c);
    else this.say('No car close enough', 1.5);
  }
  nearCar() {
    const p = this.p;
    let best = null, bd = 2.4 * 2.4;
    for (const c of this.city.traffic.cars) {
      if (c.fadeOut != null || c.type === 'subway') continue;
      const d = dist2(c.x, c.y, p.x, p.y) - (c.len * 0.35) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  say(text, t = 2.2, big = false) {
    this.msgs = this.msgs.filter((m) => m.text !== text);
    this.msgs.push({ text, t, big });
    if (this.msgs.length > 3) this.msgs.shift();
  }

  // ---- cars -----------------------------------------------------------------------------------
  detach(c) {
    const tr = this.city.traffic;
    if (c.piece && c.piece.cars) { const i = c.piece.cars.indexOf(c); if (i >= 0) c.piece.cars.splice(i, 1); }
    for (const [k, v] of tr.exitLock) if (v === c) tr.exitLock.delete(k);
    if (c.spot) { c.spot.car = null; c.spot = null; }
    c.piece = null; c.next = null; c.route = null; c.lat = 0; c.latTarget = 0; c.dwell = null; c.stopAt = null;
    c.free = true;
  }
  enterCar(c) {
    const was = c.state;
    const ci = this.chasers.indexOf(c);
    if (ci >= 0) this.chasers.splice(ci, 1);
    const li = this.leaving.indexOf(c); if (li >= 0) this.leaving.splice(li, 1);
    const ai = this.abandoned.indexOf(c); if (ai >= 0) this.abandoned.splice(ai, 1);
    this.detach(c);
    const occupied = was === 'drive' || was === 'pullin' || was === 'pullout' || was === 'chase' || was === 'leaving';
    if (occupied) {
      this.ejectDriver(c);
      this.addHeat(c.type === 'police' ? 2 : 1, c.type === 'police' ? 'Stole a police car!' : 'Carjacked!');
    } else if (was === 'parked') {
      if (this.rng.chance(0.35)) { this.city.audio?.event('alarm', c); this.say('Car alarm!', 1.6); if (this.policeNear(c.x, c.y, 26)) this.addHeat(1, 'Somebody saw that!'); }
      else this.say(`Got into a ${NAMES[c.type] || 'car'}`, 1.6);
    }
    c.state = 'player'; c.special = c.type === 'icecream' ? 'icecream' : null; c.siren = false; c.v = Math.max(0, c.v * 0.3);
    c.fadeIn = 0; c.fadeOut = null; c.life = 1e9;
    this.car = c;
    const p = this.p;
    p.alpha = 0; p.inCar = true; p.anim = 'idle';
    if (p.dog) { p.dog.gone = true; p.dog = null; }
  }
  exitCar(force = false) {
    const c = this.car, p = this.p;
    if (!c) return;
    const hx = Math.cos(c.h), hy = Math.sin(c.h);
    const cands = [[hy, -hx], [-hy, hx], [hx, hy], [-hx, -hy]];
    let spot = null;
    for (const [nx, ny] of cands) {
      const off = (Math.abs(nx * hx + ny * hy) > 0.5 ? c.len / 2 : c.wid / 2) + 0.45;
      const x = c.x + nx * off, y = c.y + ny * off;
      if (this.coll.free(x, y, R_FOOT)) { spot = [x, y]; break; }
    }
    if (!spot && !force) { this.say("Can't open the door here", 1.5); return; }
    if (!spot) spot = [c.x, c.y];
    p.x = spot[0]; p.y = spot[1]; p.z = this.coll.groundZ(p.x, p.y);
    p.alpha = 1; p.inCar = false; p.state = 'player';
    c.state = 'abandoned'; c.v = 0; c.brake = false; c.siren = false; c.abandonT = 0; c.free = true;
    this.abandoned.push(c);
    this.car = null;
  }
  ejectDriver(c) {
    const P = this.city.people;
    const q = P.create(this.rng.chance(0.15) ? 'elder' : 'resident');
    const hx = Math.cos(c.h), hy = Math.sin(c.h);
    let x = c.x + hy * (c.wid / 2 + 0.4), y = c.y - hx * (c.wid / 2 + 0.4);
    if (!this.coll.free(x, y, 0.2)) { x = c.x - hy * (c.wid / 2 + 0.4); y = c.y + hx * (c.wid / 2 + 0.4); }
    q.x = x; q.y = y; q.z = this.coll.groundZ(x, y); q.alpha = 1;
    q.home = P.pickHome();
    q.state = 'flee'; q.timer = 2.2; q.fleeFrom = { x: c.x, y: c.y };
    q.plan = [{ t: 'go', node: q.home, thought: 'Somebody stole my car!' }, { t: 'enter' }];
    q.thought = this.rng.pick(['HEY! MY CAR!', 'STOP! THIEF!', 'Not again...', 'Call the cops!']);
    P.list.push(q);
  }
  // collision circles along a car's length
  circles(c, x, y, h) {
    const L = c.len, r = c.wid * 0.5;
    const n = Math.max(2, Math.ceil(L / (c.wid * 0.9)));
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = -L / 2 + r + ((L - 2 * r) * k) / (n - 1);
      out.push([x + Math.cos(h) * t, y + Math.sin(h) * t, r]);
    }
    return out;
  }
  carFree(c, x, y, h) {
    for (const [cx, cy, r] of this.circles(c, x, y, h)) if (!this.coll.free(cx, cy, r * 0.9)) return false;
    return true;
  }
  // move a free car along its heading; slide along walls, bounce off them head-on
  physMove(c, dt) {
    const dx = Math.cos(c.h) * c.v * dt, dy = Math.sin(c.h) * c.v * dt;
    if (!this.carFree(c, c.x, c.y, c.h) || this.carFree(c, c.x + dx, c.y + dy, c.h)) { c.x += dx; c.y += dy; return 0; }
    if (Math.abs(dx) > 1e-4 && this.carFree(c, c.x + dx, c.y, c.h)) { c.x += dx; c.v *= 1 - Math.min(1, dt * 4); return 1; }
    if (Math.abs(dy) > 1e-4 && this.carFree(c, c.x, c.y + dy, c.h)) { c.y += dy; c.v *= 1 - Math.min(1, dt * 4); return 1; }
    const hit = Math.abs(c.v);
    c.v = -c.v * 0.3;
    if (hit > 2.5) this.city.audio?.event('crash', c);
    return hit > 2.5 ? 2 : 1;
  }
  // push this car out of any other car it overlaps; returns what it hit
  collideCars(c) {
    const mine = this.circles(c, c.x, c.y, c.h);
    let hitCar = null;
    for (const o of this.city.traffic.cars) {
      if (o === c || o.fadeOut != null || o.type === 'subway') continue;
      const R = (c.len + o.len) / 2 + 0.4;
      if (dist2(o.x, o.y, c.x, c.y) > R * R) continue;
      let best = 0, nx = 0, ny = 0;
      for (const [ax, ay, ar] of mine) for (const [bx, by, br] of this.circles(o, o.x, o.y, o.h)) {
        const d = Math.hypot(ax - bx, ay - by), pen = ar + br - d;
        if (pen > best) { best = pen; nx = (ax - bx) / (d || 1); ny = (ay - by) / (d || 1); }
      }
      if (best <= 0) continue;
      const movable = o.free || o.state === 'parked';
      const share = movable ? 0.55 : 1;
      const px = nx * best * share, py = ny * best * share;
      if (this.carFree(c, c.x + px, c.y + py, c.h)) { c.x += px; c.y += py; }
      if (movable) {
        const qx = o.x - nx * best * 0.45, qy = o.y - ny * best * 0.45;
        if (this.carFree(o, qx, qy, o.h)) { o.x = qx; o.y = qy; }
        if (o.free && o !== this.car) o.v *= 0.6;
      } else { o.v = 0; }
      if (Math.abs(c.v) > 2.5) this.city.audio?.event('crash', c);
      // shoving a parked car costs less speed than hitting a moving one
      c.v *= movable ? 0.82 : 0.55;
      hitCar = o;
    }
    return hitCar;
  }
  // people in front of a moving car dive out of the way (or get knocked over and get back up)
  shovePeople(c) {
    if (Math.abs(c.v) < 1.0) return;
    const sg = Math.sign(c.v), hx = Math.cos(c.h) * sg, hy = Math.sin(c.h) * sg;
    for (const q of this.city.people.list) {
      if (q === this.p || q.alpha < 0.5 || q.inCar) continue;
      const dx = q.x - c.x, dy = q.y - c.y;
      if (dx * dx + dy * dy > 20) continue;
      if (!(q.state === 'walk' || q.state === 'idle' || q.state === 'wait' || q.state === 'return' || q.state === 'busWait' || q.state === 'arrived' || q.state === 'flee')) continue;
      const ahead = dx * hx + dy * hy, lat = hx * dy - hy * dx;
      if (ahead < -c.len / 2 || ahead > c.len / 2 + 2.2 || Math.abs(lat) > c.wid / 2 + 0.55) continue;
      const s = lat >= 0 ? 1 : -1;
      if (ahead < c.len / 2 + 0.15 && Math.abs(lat) < c.wid / 2 + 0.1 && Math.abs(c.v) > 3) {
        q.state = 'knocked'; q.timer = 2.4; q.anim = 'lie'; q.animFrame = 0;
        q.thought = this.rng.pick(['OUCH!', 'Watch it!', 'My back...', 'Hey!']);
        if (c === this.car) this.addHeat(1, 'Hit and run!');
      } else {
        q.dodge = { x: -hy * s, y: hx * s, t: 0.55, back: q.state };
        q.state = 'dodge'; q.thought = this.rng.pick(['WHOA!', 'HEY!', 'Look out!', 'Crazy driver!']);
      }
    }
  }

  // ---- update ---------------------------------------------------------------------------------
  update(dt) {
    this.msgs = this.msgs.filter((m) => (m.t -= dt) > 0);
    this.updateAbandoned(dt);
    this.updateLeaving(dt);
    if (!this.active) { this.obstacles = this.abandoned.map((c) => ({ x: c.x, y: c.y, r: c.len / 2, v: 0, car: c })); return; }
    const p = this.p;
    if (!p || p.dead) { this.active = false; return; }
    if (this.busted > 0) {
      this.busted -= dt;
      p.anim = 'wave';
      for (const c of this.chasers) { c.v *= 1 - Math.min(1, dt * 3); }
      if (this.busted <= 0) this.release();
    } else if (this.car) this.drive(dt);
    else this.walk(dt);
    this.updateHeat(dt);
    this.updatePolice(dt);
    if (this.busted <= 0) this.checkBust(dt);
    // camera leads a little in the direction of travel
    const t = this.car || p;
    const lead = this.car ? 0.55 : 0.25;
    const vx = this.car ? Math.cos(this.car.h) * this.car.v : 0, vy = this.car ? Math.sin(this.car.h) * this.car.v : 0;
    this.camTarget.x = t.x + vx * lead; this.camTarget.y = t.y + vy * lead;
    if (this.city.camera.follow !== this.camTarget) this.city.camera.follow = this.camTarget;
    // things off the lanes that traffic must not drive into
    const obs = [];
    if (this.car) obs.push({ x: this.car.x, y: this.car.y, r: this.car.len / 2, v: Math.abs(this.car.v), car: this.car });
    else if (p.z < 0.05) obs.push({ x: p.x, y: p.y, r: 0.3, v: 1 });
    for (const c of this.chasers) obs.push({ x: c.x, y: c.y, r: c.len / 2, v: Math.abs(c.v), car: c });
    for (const c of this.abandoned) obs.push({ x: c.x, y: c.y, r: c.len / 2, v: 0, car: c });
    this.obstacles = obs;
  }
  walk(dt) {
    const p = this.p, inp = this.input;
    let mx = inp.x, my = inp.y;
    if (mx || my) {
      const l = Math.hypot(mx, my); mx /= l; my /= l;
      const [wx, wy] = this.city.camera.unprojectDelta(mx * 32, my * 32);
      const wl = Math.hypot(wx, wy) || 1;
      const dx = wx / wl, dy = wy / wl;
      const sp = (inp.run ? RUN : WALK) * dt;
      this.moveFoot(p, dx * sp, dy * sp);
      p.dx = dx; p.dy = dy;
      p.anim = inp.run ? 'run' : 'walk'; p.dist += sp; p.animFrame = null;
    } else { p.anim = 'idle'; p.animFrame = null; }
    p.z += (this.coll.groundZ(p.x, p.y) - p.z) * Math.min(1, dt * 14);
  }
  moveFoot(p, dx, dy) {
    const C = this.coll;
    const blocked = (x, y) => !C.free(x, y, R_FOOT) || this.city.traffic.cars.some((c) => c !== this.car && c.type !== 'subway' && dist2(c.x, c.y, x, y) < (c.len / 2 + 0.3) ** 2 && this.circles(c, c.x, c.y, c.h).some(([cx, cy, r]) => dist2(cx, cy, x, y) < (r + R_FOOT) ** 2));
    if (!blocked(p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; return; }
    if (!blocked(p.x + dx, p.y)) { p.x += dx; return; }
    if (!blocked(p.x, p.y + dy)) p.y += dy;
  }
  drive(dt) {
    const c = this.car, p = this.p, inp = this.input;
    const maxF = c.type === 'bus' || c.type === 'garbage' || c.type === 'fire' ? 5.2 : c.type === 'police' ? 8.4 : c.type === 'taxi' ? 8.0 : 7.6;
    const accel = c.type === 'bus' ? 3.2 : 5.6;
    const throttle = -inp.y; // screen up = forward
    let v = c.v;
    if (throttle > 0) v += (v >= 0 ? accel : 10) * dt;
    else if (throttle < 0) v -= (v > 0.05 ? 10 : accel * 0.6) * dt;
    else v -= Math.sign(v) * Math.min(Math.abs(v), (0.35 * Math.abs(v) + 1.0) * dt);
    if (inp.brake) v -= Math.sign(v) * Math.min(Math.abs(v), 9 * dt);
    c.v = clamp(v, -3.2, maxF);
    // steering grows with speed (no turning on the spot); the handbrake tightens it
    const steer = inp.x * (1.9 + (inp.brake ? 1.3 : 0)) * clamp(Math.abs(c.v) / 3, inp.y ? 0.3 : 0, 1) * (c.v < -0.05 ? -1 : 1) * dt;
    const nh = c.h + steer;
    if (this.carFree(c, c.x, c.y, nh) || !this.carFree(c, c.x, c.y, c.h)) c.h = nh;
    const vBefore = Math.abs(c.v);
    this.physMove(c, dt);
    const hit = this.collideCars(c);
    if (hit && vBefore > 2.5 && hit.type === 'police' && hit.state !== 'parked' && this.ramT <= 0) { this.addHeat(0.6, 'Rammed the police!'); this.ramT = 3; }
    this.ramT -= dt;
    this.shovePeople(c);
    c.z += (this.coll.groundZ(c.x, c.y) - c.z) * Math.min(1, dt * 10);
    c.brake = (throttle < 0 && c.v > 0.2) || inp.brake;
    p.x = c.x; p.y = c.y; p.z = c.z;
    // speeding right past a patrol car gets noticed
    this.speedT -= dt;
    if (Math.abs(c.v) > 6.4 && this.speedT <= 0 && this.policeNear(c.x, c.y, 9, true)) { this.addHeat(0.5, 'Speeding past the cops!'); this.speedT = 6; }
  }
  updateAbandoned(dt) {
    const view = this.city.view;
    for (let i = this.abandoned.length - 1; i >= 0; i--) {
      const c = this.abandoned[i];
      c.abandonT = (c.abandonT || 0) + dt;
      if (c.fadeOut != null) { c.fadeOut -= dt; if (c.fadeOut <= 0) { this.city.traffic.removeCar(c); this.abandoned.splice(i, 1); } continue; }
      if ((c.abandonT > 40 && !view.visible(c.x, c.y, 0, 4)) || c.abandonT > 150) c.fadeOut = 1;
    }
  }

  // ---- heat and the police -------------------------------------------------------------------
  addHeat(v, why) {
    const before = Math.ceil(this.heat - 1e-6);
    this.heat = Math.min(MAX_HEAT, this.heat + v);
    this.cool = 0;
    if (why) this.say(why, 2.2);
    if (Math.ceil(this.heat - 1e-6) > before && before === 0) this.say('The police are on to you!', 2.5);
  }
  policeNear(x, y, r, patrolOnly = false) {
    for (const c of this.city.traffic.cars) if (c.type === 'police' && c.state !== 'parked' && c.state !== 'player' && (!patrolOnly || !c.free) && dist2(c.x, c.y, x, y) < r * r) return c;
    return null;
  }
  target() { return this.car || this.p; }
  updateHeat(dt) {
    if (this.heat <= 0) return;
    const t = this.target();
    let dmin = 1e9;
    for (const c of this.chasers) dmin = Math.min(dmin, dist(c.x, c.y, t.x, t.y));
    if (dmin > 30) this.cool += dt; else this.cool = 0;
    if (this.cool > 8) {
      this.heat = Math.max(0, this.heat - dt / 5);
      if (this.heat <= 0) { this.endChase(); this.say('You lost them!', 3); }
    }
  }
  updatePolice(dt) {
    const want = this.heat > 0 ? Math.min(7, Math.ceil(this.heat - 1e-6) + (this.heat > 2.5 ? 1 : 0)) : 0;
    this.recruitT -= dt;
    if (this.chasers.length < want && this.recruitT <= 0 && this.busted <= 0) {
      this.recruitT = this.chasers.length ? 3.0 : 0.8;
      const t = this.target();
      let best = null, bd = 60 * 60;
      for (const c of this.city.traffic.cars) {
        if (c.type !== 'police' || c.free || c.state === 'parked' || c.fadeOut != null) continue;
        const d = dist2(c.x, c.y, t.x, t.y);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) this.makeChaser(best); else this.spawnChaser();
    }
    if (!this.chasers.length) return;
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.5; const t = this.target(); this.buildFlow(t.x, t.y); }
    for (const c of this.chasers) this.drivePolice(c, dt);
  }
  makeChaser(c) {
    this.detach(c);
    c.state = 'chase'; c.siren = true; c.special = null; c.revT = 0; c.stuckT = 0; c.life = 1e9; c.fadeIn = 0;
    if (c.v < 0) c.v = 0;
    this.chasers.push(c);
    this.city.audio?.event('siren', c);
  }
  spawnChaser() {
    const tr = this.city.traffic, t = this.target();
    const links = [...tr.links.values()].filter((L) => { const d = Math.hypot(L.pts[0][0] - t.x, L.pts[0][1] - t.y); return d > 30 && d < 58 && !L.cars.some((o) => o.s < 4); });
    if (!links.length) return;
    const L = this.rng.pick(links);
    const car = tr.makeCar('police', L, 0.6, { siren: true });
    car.v = 3;
    tr.addCar(car);
    this.makeChaser(car);
  }
  endChase(now = false) {
    for (const c of this.chasers) { c.state = 'leaving'; c.siren = false; c.leaveT = now ? 0.01 : 7; }
    this.leaving.push(...this.chasers);
    this.chasers = [];
  }
  updateLeaving(dt) {
    const view = this.city.view;
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const c = this.leaving[i];
      if (c.fadeOut != null) { c.fadeOut -= dt; if (c.fadeOut <= 0) { this.city.traffic.removeCar(c); this.leaving.splice(i, 1); } continue; }
      c.leaveT -= dt;
      c.v += (2.5 - c.v) * Math.min(1, dt);
      this.physMove(c, dt);
      if (c.leaveT <= 0 && (!view.visible(c.x, c.y, 0, 4) || c.leaveT < -12)) c.fadeOut = 1;
    }
  }
  // per-cell travel cost for pursuit: 0 = blocked, 1 = road, 3 = sidewalk / plaza / park
  buildCells() {
    const C = this.coll;
    this.cells = new Uint8Array(MAP * MAP);
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++) {
        let solid = false;
        for (const [ox, oy] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) if (C.isSolid(x + ox, y + oy)) { solid = true; break; }
        this.cells[y * MAP + x] = solid ? 0 : C.onRoad(x + 0.5, y + 0.5) ? 1 : 3;
      }
    this.flow = new Float32Array(MAP * MAP);
    this.queue = new Int32Array(MAP * MAP * 4);
  }
  // distance field (Dial's algorithm, 4-neighbour, integer costs) from the player's cell
  buildFlow(tx, ty) {
    const N = MAP, D = this.flow, cells = this.cells;
    D.fill(1e9);
    const s = clamp(Math.floor(ty), 0, N - 1) * N + clamp(Math.floor(tx), 0, N - 1);
    const buckets = [[s]];
    D[s] = 0;
    for (let d = 0; d < buckets.length; d++) {
      const b = buckets[d];
      if (!b) continue;
      for (let k = 0; k < b.length; k++) {
        const i = b[k];
        if (D[i] < d) continue;
        const x = i % N, y = (i / N) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1]) {
          if (j < 0) continue;
          const cst = cells[j];
          if (!cst) continue;
          const nd = d + cst;
          if (nd < D[j]) { D[j] = nd; (buckets[nd] || (buckets[nd] = [])).push(j); }
        }
      }
    }
  }
  flowAt(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= MAP || iy >= MAP) return 1e9;
    return this.flow[iy * MAP + ix];
  }
  // which way the distance field falls fastest around (x, y)
  flowDir(x, y) {
    let best = this.flowAt(x, y), bx = 0, by = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const r of [1.4, 2.6]) {
        const v = this.flowAt(x + Math.cos(a) * r, y + Math.sin(a) * r) + r * 0.05;
        if (v < best) { best = v; bx = Math.cos(a); by = Math.sin(a); }
      }
    }
    return [bx, by];
  }
  lineClear(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.5);
    for (let k = 1; k < n; k++) if (this.coll.isSolid(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n)) return false;
    return true;
  }
  drivePolice(c, dt) {
    const t = this.target();
    const d = dist(c.x, c.y, t.x, t.y);
    let dir;
    if (d < 10 && this.lineClear(c.x, c.y, t.x, t.y)) dir = [(t.x - c.x) / (d || 1), (t.y - c.y) / (d || 1)];
    else dir = this.flowDir(c.x, c.y);
    if (!dir[0] && !dir[1]) dir = [(t.x - c.x) / (d || 1), (t.y - c.y) / (d || 1)];
    const dh = wrap(Math.atan2(dir[1], dir[0]) - c.h);
    if (c.stuckT > 0.9) { c.revT = 0.9; c.stuckT = 0; }
    let turn;
    if (c.revT > 0) {
      c.revT -= dt;
      c.v = Math.max(c.v - 7 * dt, -2.6);
      turn = clamp(-dh, -1, 1) * 2.2 * dt;
    } else {
      const close = this.busted > 0 ? 0 : d < 3.2 ? Math.max(0.8, d - 1.4) : 8.0;
      const vmax = close * (1 - Math.min(0.62, (Math.abs(dh) / Math.PI) * 1.3));
      c.v += clamp(vmax - c.v, -10 * dt, 5 * dt);
      turn = clamp(dh, -1, 1) * 2.8 * dt * clamp(Math.abs(c.v) / 2, 0.35, 1);
    }
    const nh = c.h + turn;
    if (this.carFree(c, c.x, c.y, nh) || !this.carFree(c, c.x, c.y, c.h)) c.h = nh;
    const res = this.physMove(c, dt);
    const hit = this.collideCars(c);
    c.stuckT = (res > 0 || (hit && Math.abs(c.v) < 1.5) || (Math.abs(c.v) < 0.35 && d > 4)) && c.revT <= 0 ? (c.stuckT || 0) + dt : 0;
    this.shovePeople(c);
    c.z += (this.coll.groundZ(c.x, c.y) - c.z) * Math.min(1, dt * 10);
    c.brake = c.v < 0.3 || Math.abs(dh) > 1.2;
  }
  checkBust(dt) {
    if (!this.chasers.length) { this.bustT = 0; return; }
    const t = this.target();
    const slow = this.car ? Math.abs(this.car.v) < 0.9 : true;
    const half = this.car ? this.car.len / 2 : 0.25;
    const near = this.chasers.some((c) => { const r = half + c.len / 2 + (this.car ? 1.3 : 1.0); return dist2(c.x, c.y, t.x, t.y) < r * r && Math.abs(c.v) < 3; });
    if (near && slow) this.bustT += dt; else this.bustT = Math.max(0, this.bustT - dt * 0.6);
    if (this.bustT > (this.car ? 2.0 : 1.1)) this.bust();
  }
  bust() {
    this.busted = 3.4; this.bustT = 0;
    this.say('BUSTED!', 3.4, true);
    if (this.car) this.exitCar(true);
    this.city.audio?.event('busted', this.p);
  }
  // after a night downtown: released a few blocks away, the slate wiped clean
  release() {
    const P = this.city.people, p = this.p;
    const nodes = P.nav.nodes.filter((n) => (n.kind === 'walk' || n.kind === 'corner') && dist(n.x, n.y, p.x, p.y) > 30);
    const n = nodes.length ? this.rng.pick(nodes) : null;
    if (n) { p.x = n.x; p.y = n.y; p.z = n.z; }
    this.heat = 0; this.cool = 0;
    this.endChase(true);
    this.camTarget.x = p.x; this.camTarget.y = p.y;
    const cam = this.city.camera; cam.x = p.x; cam.y = p.y;
    this.say('Released. Keep your nose clean!', 3);
  }

  // ---- HUD ------------------------------------------------------------------------------------
  hud() {
    if (!this.active) return null;
    const c = this.car;
    let prompt = '';
    if (this.busted > 0) prompt = '';
    else if (c) prompt = 'F · GET OUT';
    else {
      const n = this.nearCar();
      if (n) prompt = n.state === 'parked' || n.state === 'abandoned' ? 'F · GET IN' : 'F · STEAL IT';
    }
    return {
      heat: this.heat,
      status: c ? `${NAMES[c.type] || 'CAR'} · ${Math.round(Math.abs(c.v) * 2 * 2.237)} MPH` : this.input.run ? 'ON FOOT · RUNNING' : 'ON FOOT',
      prompt, msgs: this.msgs, busted: this.busted > 0, name: this.p ? this.p.name : '',
    };
  }
}
