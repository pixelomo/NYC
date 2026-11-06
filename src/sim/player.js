// Play mode: take over one of the city's people. Walk about, climb into parked cars or haul drivers
// out of moving ones, and drive, arcade style, on real car physics (see vehicles.js): hits push, spin
// and dent, a wrecked engine smokes, burns and blows up. A pistol shoots people, police and cars.
// Crimes make you WANTED: one star the moment the police come after you, more the longer the chase
// runs and the more damage you do. Police cars leave their patrols (or arrive from out of sight),
// steer along the streets by a distance field that flows toward you, ram you at high wanted levels,
// and stop to let officers out to chase you on foot. Get grabbed or boxed in and you're busted;
// stay out of sight long enough and they lose you.

import { MAP } from '../world/layout.js';
import { clamp, dist, dist2, RNG } from '../core/math.js';
import { personPose } from '../render/sprites.js';

const WALK = 1.3, RUN = 2.8, R_FOOT = 0.2;
const STAR_PTS = [0, 0, 60, 150, 300, 520]; // points for each star (the first comes with any chase)
const CARS_FOR = [0, 2, 3, 4, 6, 8]; // police cars on your tail at each wanted level
const CLIP = 12;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const NAMES = { sedan: 'SEDAN', taxi: 'TAXI', suv: 'SUV', van: 'VAN', police: 'POLICE CAR', bus: 'BUS', truck: 'TRUCK', fire: 'FIRE TRUCK', icecream: 'ICE-CREAM TRUCK', garbage: 'GARBAGE TRUCK', plow: 'SNOW PLOW' };

export class Player {
  constructor(city) {
    this.city = city;
    this.coll = city.coll;
    this.rng = new RNG(4321);
    this.active = false;
    this.p = null; // the person under control
    this.car = null; // the car they are driving
    this.stars = 0; this.pts = 0; this.unseenT = 0; this.report = 0; this.reportT = null;
    this.knownT = 0; this.lastKnown = { x: 0, y: 0 };
    this.chasers = [];
    this.leaving = [];
    this.officers = [];
    this.recruitT = 0;
    this.flowT = 0;
    this.bustT = 0;
    this.busted = 0;
    this.knockT = 0;
    this.msgs = [];
    this.input = { x: 0, y: 0, run: false, brake: false, space: false };
    this.aim = { x: 0, y: 0, t: -1e9 };
    this.trigger = false;
    this.gun = { clip: CLIP, reload: 0, cd: 0 };
    this.aimT = 0; this.recoilT = 0; this.aimDx = 1; this.aimDy = 0;
    this.camTarget = { x: 0, y: 0, z: 0 };
    this.ramT = 0;
    this.speedT = 0;
    this.seenT = 0;
    this.seen = false;
    this.buildCells();
  }
  get heat() { return this.stars; }

  // ---- control --------------------------------------------------------------------------------
  start(p) {
    const P = this.city.people;
    if (!p || p.state === 'vanish' || p.dead || p.state === 'dead' || p.state === 'cop') return false;
    if (this.active) this.stop();
    P.detachPerson(p);
    p.state = 'player'; p.plan = []; p.path = null; p.alpha = 1; p.anim = 'idle'; p.animFrame = null; p.forceFace = false;
    p.z = this.coll.groundZ(p.x, p.y); p.thought = '';
    personPose(this.city.atlas, p.frames, 'aim');
    personPose(this.city.atlas, p.frames, 'down');
    this.p = p;
    this.active = true;
    this.clearWanted(true);
    this.bustT = 0; this.busted = 0; this.knockT = 0;
    this.gun = { clip: CLIP, reload: 0, cd: 0 };
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
      p.state = 'idle'; p.timer = 0.4; p.alpha = 1; p.inCar = false; p.forceFace = false; p.animFrame = null; p.anim = 'idle';
      p.node = P.nearestOf(P.nav.nodes, p.x, p.y);
      const home = p.home || P.pickHome();
      p.plan = [{ t: 'go', node: home, thought: 'What a day' }, { t: 'enter' }];
    }
    this.clearWanted(true);
    this.active = false;
    this.p = null;
    this.trigger = false;
    if (this.city.camera.follow === this.camTarget) this.city.camera.follow = null;
  }
  // F / Enter: get in or out
  action() {
    if (!this.active || this.busted > 0 || this.knockT > 0) return;
    if (this.car) { this.exitCar(); return; }
    const c = this.nearCar();
    if (!c) { this.say('No car close enough', 1.5); return; }
    if (c.wreck) { this.say("It's a burnt-out wreck", 1.6); return; }
    if (c.fireT != null) { this.say("It's on fire!", 1.6); return; }
    this.enterCar(c);
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
  // where the mouse points (world), and the trigger
  aimAt(x, y) { this.aim.x = x; this.aim.y = y; this.aim.t = this.city.time; }
  reload() {
    const g = this.gun;
    if (g.reload > 0 || g.clip >= CLIP) return;
    g.reload = 1.25;
    this.city.audio?.event('reload', this.target());
  }

  // ---- cars -----------------------------------------------------------------------------------
  enterCar(c) {
    const V = this.city.vehicles;
    const was = c.state;
    this.forget(c);
    if (!c.free) { this.city.traffic.detach(c); V.launch(c); }
    V.init(c);
    const occupied = was === 'drive' || was === 'pullin' || was === 'pullout' || was === 'chase' || was === 'leaving' || was === 'crashed';
    if (occupied) {
      this.ejectDriver(c, 'jack');
      if (c.type === 'police') this.crime(60, 'Stole a police car!');
      else this.crime(25, 'Carjacked!', this.policeSee());
    } else if (was === 'parked' || was === 'loose') {
      if (this.rng.chance(0.35)) {
        this.city.audio?.event('alarm', c); this.say('Car alarm!', 1.6);
        if (this.policeSee(26)) this.crime(15, 'Somebody saw that!');
      } else this.say(`Got into a ${NAMES[c.type] || 'car'}`, 1.6);
      if (c.type === 'police') this.crime(40, 'Took a police car!', this.policeSee());
    }
    c.state = 'player'; c.special = c.type === 'icecream' ? 'icecream' : null; c.siren = false;
    c.fadeIn = 0; c.fadeOut = null; c.life = 1e9; c.idleT = 0; c.crewOut = false;
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
    if (!c.wreck) c.state = 'abandoned';
    c.brake = false; c.siren = false; c.idleT = 0; c.free = true;
    this.car = null;
  }
  // whoever was at the wheel gets out (and is not happy about it)
  ejectDriver(c, why = 'jack') {
    if (c.type === 'police') { this.deployOfficers(c, 2); return; }
    const P = this.city.people;
    const q = P.create(this.rng.chance(0.15) ? 'elder' : 'resident');
    const hx = Math.cos(c.h), hy = Math.sin(c.h);
    let x = c.x + hy * (c.wid / 2 + 0.4), y = c.y - hx * (c.wid / 2 + 0.4);
    if (!this.coll.free(x, y, 0.2)) { x = c.x - hy * (c.wid / 2 + 0.4); y = c.y + hx * (c.wid / 2 + 0.4); }
    q.x = x; q.y = y; q.z = this.coll.groundZ(x, y); q.alpha = 1;
    q.home = P.pickHome();
    q.state = 'flee'; q.timer = why === 'crash' ? 1.2 : 2.4; q.fleeFrom = { x: c.x, y: c.y };
    q.plan = [{ t: 'go', node: q.home, thought: why === 'jack' ? 'Somebody stole my car!' : 'My poor car...' }, { t: 'enter' }];
    q.thought = this.rng.pick(why === 'jack' ? ['HEY! MY CAR!', 'STOP! THIEF!', 'Not again...', 'Call the cops!'] : why === 'fire' ? ['FIRE!', "It's gonna blow!", 'RUN!'] : why === 'shot' ? ["DON'T SHOOT!", 'AAAH!', 'Get down!'] : ['My car!!', 'Are you crazy?!', 'Learn to drive!', 'Insurance is gonna love this']);
    P.list.push(q);
  }

  // ---- update ---------------------------------------------------------------------------------
  update(dt) {
    this.msgs = this.msgs.filter((m) => (m.t -= dt) > 0);
    this.updateLeaving(dt);
    if (!this.active) return;
    const p = this.p;
    if (!p || p.dead || p.state === 'dead') { this.active = false; return; }
    const g = this.gun;
    g.cd -= dt; this.aimT -= dt; this.recoilT -= dt; this.ramT -= dt;
    if (g.reload > 0) { g.reload -= dt; if (g.reload <= 0) { g.reload = 0; g.clip = CLIP; } }
    if (this.busted > 0) {
      this.busted -= dt;
      p.anim = 'wave'; p.animFrame = null; p.forceFace = false;
      const V = this.city.vehicles;
      for (const c of this.chasers) { V.init(c); V.steer(c, dt, V.fwd(c) * (1 - Math.min(1, dt * 3)), 0, 10); V.move(c, dt); }
      for (const o of this.officers) if (o.state === 'cop') { o.anim = 'idle'; o.animFrame = null; }
      if (this.busted <= 0) this.release();
    } else if (this.knockT > 0) {
      this.knockT -= dt;
      p.anim = 'down'; p.animFrame = 0; p.forceFace = false;
      this.city.people.slide(p, dt);
      if (this.knockT <= 0) { p.anim = 'idle'; p.animFrame = null; }
    } else if (this.car) this.drive(dt);
    else this.walk(dt);
    // the pistol: mouse trigger, or Space when on foot
    // (a click shorter than a frame still fires once)
    const wantFire = this.trigger || this.clickShot || (!this.car && this.input.space);
    if (wantFire && g.cd <= 0 && this.busted <= 0 && this.knockT <= 0) {
      const mouse = this.city.time - this.aim.t < 4;
      if (this.trigger || this.clickShot || mouse) this.fireAt(this.aim.x, this.aim.y, false);
      else this.fireAt(p.x + (p.dx || 1), p.y + (p.dy || 0), true);
      this.clickShot = false;
    }
    if (this.busted > 0 || this.knockT > 0) this.clickShot = false;
    this.updateWanted(dt);
    this.updatePolice(dt);
    this.updateOfficers(dt);
    if (this.busted <= 0) this.checkBust(dt);
    // camera leads a little in the direction of travel
    const t = this.car || p;
    const lead = this.car ? 0.55 : 0.25;
    const vx = this.car ? this.car.vx || 0 : 0, vy = this.car ? this.car.vy || 0 : 0;
    this.camTarget.x = t.x + vx * lead; this.camTarget.y = t.y + vy * lead;
    if (this.city.camera.follow !== this.camTarget) this.city.camera.follow = this.camTarget;
  }
  walk(dt) {
    const p = this.p, inp = this.input;
    let mx = inp.x, my = inp.y;
    const aiming = this.aimT > 0;
    if (mx || my) {
      const l = Math.hypot(mx, my); mx /= l; my /= l;
      const [wx, wy] = this.city.camera.unprojectDelta(mx * 32, my * 32);
      const wl = Math.hypot(wx, wy) || 1;
      const dx = wx / wl, dy = wy / wl;
      const sp = (inp.run && !aiming ? RUN : WALK) * dt;
      this.moveFoot(p, dx * sp, dy * sp);
      p.dx = dx; p.dy = dy;
      p.anim = inp.run && !aiming ? 'run' : 'walk'; p.dist += sp; p.animFrame = null;
    } else { p.anim = 'idle'; p.animFrame = null; }
    p.forceFace = aiming;
    if (aiming) {
      p.dx = this.aimDx; p.dy = this.aimDy;
      if (!mx && !my) { p.anim = 'aim'; p.animFrame = this.recoilT > 0 ? 1 : 0; }
    }
    p.z += (this.coll.groundZ(p.x, p.y) - p.z) * Math.min(1, dt * 14);
  }
  moveFoot(p, dx, dy) {
    const C = this.coll, V = this.city.vehicles, me = this.car;
    const blocked = (x, y) => !C.free(x, y, R_FOOT) || this.city.traffic.cars.some((c) => c !== me && c.type !== 'subway' && c.fadeOut == null && dist2(c.x, c.y, x, y) < (c.len / 2 + 0.6) ** 2 && V.inBox(c, x, y, R_FOOT));
    if (!blocked(p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; return true; }
    if (!blocked(p.x + dx, p.y)) { p.x += dx; return true; }
    if (!blocked(p.x, p.y + dy)) { p.y += dy; return true; }
    return false;
  }
  drive(dt) {
    const c = this.car, p = this.p, inp = this.input, V = this.city.vehicles;
    V.init(c);
    if (c.wreck) { this.exitCar(true); return; }
    const frac = c.hp / c.maxHp;
    const maxF = (c.type === 'bus' || c.type === 'garbage' || c.type === 'fire' ? 5.2 : c.type === 'police' ? 8.4 : c.type === 'taxi' ? 8.0 : 7.6) * (frac < 0.3 ? 0.7 : frac < 0.5 ? 0.86 : 1) * (c.fireT != null ? 0.8 : 1);
    const accel = c.type === 'bus' ? 3.2 : 5.6;
    const throttle = -inp.y; // screen up = forward
    let v = V.fwd(c);
    if (throttle > 0) v += (v >= 0 ? accel : 10) * dt;
    else if (throttle < 0) v -= (v > 0.05 ? 10 : accel * 0.6) * dt;
    else v -= Math.sign(v) * Math.min(Math.abs(v), (0.35 * Math.abs(v) + 1.0) * dt);
    if (inp.brake) v -= Math.sign(v) * Math.min(Math.abs(v), 9 * dt);
    v = clamp(v, -3.2, Math.max(maxF, v - 10 * dt));
    // steering grows with speed (no turning on the spot); the handbrake tightens it and lets the tail slide
    const yaw = inp.x * (1.9 + (inp.brake ? 1.3 : 0)) * clamp(Math.abs(v) / 3, inp.y ? 0.3 : 0, 1) * (v < -0.05 ? -1 : 1);
    V.steer(c, dt, v, yaw, inp.brake ? 2.2 : 12);
    V.move(c, dt);
    c.z += (this.coll.groundZ(c.x, c.y) - c.z) * Math.min(1, dt * 10);
    c.brake = (throttle < 0 && v > 0.2) || inp.brake;
    p.x = c.x; p.y = c.y; p.z = c.z;
    // speeding right past a patrol car gets noticed
    this.speedT -= dt;
    if (Math.abs(v) > 6.4 && this.speedT <= 0 && this.policeNear(c.x, c.y, 9, true)) { this.crime(8, 'Speeding past the cops!'); this.speedT = 6; }
  }
  knockDown(ux = 0, uy = 0, t = 1.8) {
    const p = this.p;
    if (!p) return;
    if (this.car) this.exitCar(true);
    this.knockT = t;
    p.kvx = ux * 3; p.kvy = uy * 3;
    this.trigger = false;
  }

  // ---- the pistol -----------------------------------------------------------------------------
  fireAt(tx, ty, auto) {
    const g = this.gun, p = this.p, c = this.car, P = this.city.particles, people = this.city.people;
    if (g.reload > 0 || g.cd > 0) return false;
    if (g.clip <= 0) { this.reload(); return false; }
    let ox, oy, oz;
    let dx = tx - p.x, dy = ty - p.y;
    if (auto) {
      const fl = Math.hypot(p.dx || 0, p.dy || 0) || 1;
      const tg = this.autoTarget(p.x, p.y, (p.dx || 1) / fl, (p.dy || 0) / fl);
      if (tg) { dx = tg[0] - p.x; dy = tg[1] - p.y; }
    } else {
      // a little help: snap onto someone standing right where the cursor is
      let best = null, bd = 0.65 * 0.65;
      for (const q of people.near(tx, ty, 0.8)) {
        if (q === p || q.state === 'dead' || q.alpha < 0.5 || q.inCar) continue;
        const d = dist2(q.x, q.y, tx, ty);
        if (d < bd) { bd = d; best = q; }
      }
      if (best) { dx = best.x - p.x; dy = best.y - p.y; }
    }
    let l = Math.hypot(dx, dy);
    if (l < 0.05) { dx = p.dx || 1; dy = p.dy || 0; l = Math.hypot(dx, dy) || 1; }
    dx /= l; dy /= l;
    if (c) {
      // out of the side window, on the side of the target
      const side = Math.cos(c.h) * dy - Math.sin(c.h) * dx > 0 ? 1 : -1;
      ox = c.x - Math.sin(c.h) * side * (c.wid / 2 + 0.12); oy = c.y + Math.cos(c.h) * side * (c.wid / 2 + 0.12); oz = (c.z || 0) + 0.75;
    } else { ox = p.x; oy = p.y; oz = p.z + (p.kid ? 0.62 : 0.9); }
    const sp = this.rng.range(-0.022, 0.022), cs = Math.cos(sp), sn = Math.sin(sp);
    [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs];
    g.clip--; g.cd = 0.24;
    this.aimDx = dx; this.aimDy = dy; this.aimT = 0.8; this.recoilT = 0.09;
    const hit = this.trace(ox + dx * 0.3, oy + dy * 0.3, dx, dy, 24, c);
    const mx = ox + dx * 0.34, my = oy + dy * 0.34;
    const hz = hit.kind === 'person' ? hit.q.z + (hit.q.kid ? 0.55 : 0.8) : hit.kind === 'car' ? (hit.c.z || 0) + 0.55 : oz;
    P?.muzzle(mx, my, oz, dx, dy);
    P?.tracer(mx, my, oz, hit.x, hit.y, hz);
    if (!c) P?.shell(ox, oy, oz, dx, dy);
    this.city.audio?.event('gunshot', { x: ox, y: oy, z: oz });
    const seen = this.policeSee();
    if (hit.kind === 'person') this.shootPerson(hit.q, dx, dy, seen);
    else if (hit.kind === 'car') this.shootCar(hit.c, hit.x, hit.y, dx, dy);
    else if (hit.kind === 'wall') {
      P?.dust(hit.x - dx * 0.05, hit.y - dy * 0.05, hz, 4);
      P?.sparks(hit.x - dx * 0.05, hit.y - dy * 0.05, hz, 3);
      if (this.rng.chance(0.35)) this.city.audio?.event('ricochet', { x: hit.x, y: hit.y, z: hz });
    }
    // everyone around runs for it; the pigeons are gone
    for (const q of people.near(ox, oy, 15)) if (q !== p && this.rng.chance(0.9)) people.panic(q, ox, oy, this.rng.range(3, 6));
    this.city.animals?.scare?.(ox, oy, 12);
    if (seen) this.crime(6, this.stars ? null : 'Shots fired!');
    if (g.clip <= 0) this.reload();
    return true;
  }
  // first thing a bullet from (x, y) heading (dx, dy) runs into
  trace(x, y, dx, dy, range, ignore) {
    let best = { t: range, kind: 'none' };
    for (let t = 0; t < range; t += 0.1) if (this.coll.isSolid(x + dx * t, y + dy * t)) { best = { t, kind: 'wall' }; break; }
    for (const q of this.city.people.list) {
      if (q === this.p || q.alpha < 0.5 || q.inCar || q.state === 'dead' || q.state === 'vanish' || q.state === 'inside') continue;
      const rx = q.x - x, ry = q.y - y;
      const t = rx * dx + ry * dy;
      if (t < 0 || t > best.t) continue;
      const r = q.state === 'knocked' ? 0.45 : q.kid ? 0.22 : 0.28;
      if (Math.abs(rx * dy - ry * dx) < r) best = { t, kind: 'person', q };
    }
    for (const c of this.city.traffic.cars) {
      if (c === ignore || c.type === 'subway' || c.fadeOut != null) continue;
      if ((c.x - x) ** 2 + (c.y - y) ** 2 > (best.t + c.len) ** 2) continue;
      const t = this.rayBox(x, y, dx, dy, c);
      if (t != null && t < best.t) best = { t, kind: 'car', c };
    }
    best.x = x + dx * best.t; best.y = y + dy * best.t;
    return best;
  }
  rayBox(x, y, dx, dy, c) {
    const ch = Math.cos(c.h), sh = Math.sin(c.h);
    const o = [(x - c.x) * ch + (y - c.y) * sh, -(x - c.x) * sh + (y - c.y) * ch];
    const u = [dx * ch + dy * sh, -dx * sh + dy * ch];
    const hs = [c.len / 2, c.wid / 2];
    let t0 = -1e9, t1 = 1e9;
    for (let k = 0; k < 2; k++) {
      if (Math.abs(u[k]) < 1e-9) { if (Math.abs(o[k]) > hs[k]) return null; continue; }
      let a = (-hs[k] - o[k]) / u[k], b = (hs[k] - o[k]) / u[k];
      if (a > b) { const tt = a; a = b; b = tt; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    if (t1 < 0) return null;
    return Math.max(0, t0);
  }
  // keyboard aiming: whoever is roughly in front, in sight and nearest
  autoTarget(ox, oy, fx, fy) {
    let best = null, bs = 1e9;
    const consider = (x, y, pri) => {
      const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
      if (d < 0.3 || d > 16) return;
      const cos = (dx * fx + dy * fy) / d;
      if (cos < 0.8) return;
      const sc = d * (2.2 - cos) * pri;
      if (sc < bs && this.lineClear(ox, oy, x, y)) { bs = sc; best = [x, y]; }
    };
    for (const o of this.officers) if (o.state === 'cop') consider(o.x, o.y, 0.6);
    for (const c of this.chasers) consider(c.x, c.y, 0.8);
    for (const q of this.city.people.near(ox, oy, 16)) if (q !== this.p && q.state !== 'dead' && q.state !== 'cop' && q.alpha > 0.5 && !q.inCar) consider(q.x, q.y, 1);
    return best;
  }
  shootPerson(q, dx, dy, seen) {
    const P = this.city.people;
    if (q.state === 'cop' && (q.hp ?? 2) > 1) {
      // the vest takes the first one
      q.hp = (q.hp ?? 2) - 1;
      this.city.particles?.blood(q.x, q.y, q.z + 0.85, dx, dy, 6);
      this.city.audio?.event('hit', q);
      q.staggerT = 0.5; q.kvx = dx * 0.8; q.kvy = dy * 0.8;
      this.crime(40, 'You shot an officer!');
      return;
    }
    const cop = q.state === 'cop' || q.role === 'cop';
    if (!P.kill(q, dx, dy, 'shot')) return;
    if (!cop) this.crime(50, seen ? 'Somebody got shot!' : 'Witnesses are calling 911!', seen);
  }
  shootCar(c, x, y, dx, dy) {
    const V = this.city.vehicles, P = this.city.particles;
    V.hurt(c, this.rng.range(5, 9), x, y, -dx, -dy, 'player');
    P?.sparks(x, y, 0.55, 5);
    if (this.rng.chance(0.3)) P?.glass(x, y, 0.7, 4);
    this.city.audio?.event('ping', { x, y, z: 0.5 });
    if (c.type === 'police' && (c.state === 'chase' || c.state === 'drive' || c.state === 'stopped')) this.crime(14, this.stars ? null : 'You shot at the police!');
    if (c.wreck || c.fireT != null) return;
    // a driver under fire bails out
    if (!c.free && c.state !== 'parked') {
      if (c.type === 'police') { this.makeChaser(c); return; }
      if (this.rng.chance(0.6)) { V.loosen(c); this.ejectDriver(c, 'shot'); c.state = 'abandoned'; }
    } else if (c.state === 'crashed') { this.ejectDriver(c, 'shot'); c.state = 'abandoned'; }
    else if (c.state === 'parked' && this.rng.chance(0.3)) this.city.audio?.event('alarm', c);
  }

  // ---- wanted ---------------------------------------------------------------------------------
  // a crime: points toward the wanted level, starting a chase if the police know about it
  crime(pts, why, witnessed = true) {
    if (!this.active || this.busted > 0) return;
    if (!witnessed && this.stars === 0) {
      // nobody in uniform saw it, but somebody will call it in
      this.report += pts;
      if (this.reportT == null) this.reportT = this.rng.range(2.5, 5);
      if (why) this.say(why, 2.2);
      return;
    }
    this.pts += pts;
    // the police know where it happened: they come straight there for a while
    const t = this.target();
    this.knownT = Math.max(this.knownT, 14); this.unseenT = 0;
    if (t) { this.lastKnown.x = t.x; this.lastKnown.y = t.y; }
    if (this.stars === 0) { this.stars = 1; this.say('WANTED!', 2.6, true); this.city.audio?.event('star', this.target()); }
    if (why) this.say(why, 2.2);
    this.updateStars();
  }
  updateStars() {
    let s = this.stars;
    while (s < 5 && this.pts >= STAR_PTS[s + 1]) s++;
    if (s > this.stars) { this.stars = s; this.say(`WANTED LEVEL ${s}`, 2.4); this.city.audio?.event('star', this.target()); }
  }
  clearWanted(now = false) {
    this.stars = 0; this.pts = 0; this.unseenT = 0; this.report = 0; this.reportT = null; this.knownT = 0;
    this.endChase(now);
    for (const o of [...this.officers]) this.standDown(o);
    this.officers = [];
    // patrol cars left at the kerb by their crews switch the lights off
    for (const c of this.city.traffic.cars) if (c.state === 'stopped') { c.siren = false; c.crewOut = false; }
  }
  // police who can see the player (or a spot): chasers, officers on foot, patrol cars
  policeSee(r = 30, at = null) {
    const t = at || this.target();
    if (!t) return false;
    const sees = (x, y) => { const d = dist(x, y, t.x, t.y); return d < 7 || (d < r && this.lineClear(x, y, t.x, t.y)); };
    for (const c of this.chasers) if (sees(c.x, c.y)) return true;
    for (const o of this.officers) if (o.state === 'cop' && sees(o.x, o.y)) return true;
    for (const c of this.city.traffic.cars) if (c.type === 'police' && !c.free && c.state !== 'parked' && dist2(c.x, c.y, t.x, t.y) < r * r && sees(c.x, c.y)) return true;
    return false;
  }
  policeNear(x, y, r, patrolOnly = false) {
    for (const c of this.city.traffic.cars) if (c.type === 'police' && c.state !== 'parked' && c.state !== 'player' && !c.wreck && (!patrolOnly || !c.free) && dist2(c.x, c.y, x, y) < r * r) return c;
    return null;
  }
  target() { return this.car || this.p; }
  updateWanted(dt) {
    if (this.reportT != null) {
      this.reportT -= dt;
      if (this.reportT <= 0) { const pts = this.report; this.report = 0; this.reportT = null; this.crime(pts, 'Someone called the cops!'); }
    }
    if (this.stars <= 0) return;
    // twice a second: can they see you?
    this.seenT -= dt;
    if (this.seenT <= 0) { this.seenT = 0.5; this.seen = this.policeSee(28); }
    const t = this.target();
    if (this.seen) {
      this.unseenT = 0;
      this.knownT = Math.max(this.knownT, 3);
      this.lastKnown.x = t.x; this.lastKnown.y = t.y;
      this.pts += dt; // a long chase raises the stakes
      this.updateStars();
    } else if (this.knownT > 0) {
      // out of sight, but radio calls still put you here
      this.knownT -= dt;
      this.lastKnown.x = t.x; this.lastKnown.y = t.y;
    } else {
      // searching around where you were last seen
      this.unseenT += dt;
      if (this.unseenT > 6 + this.stars * 3) { this.clearWanted(); this.say('You lost them!', 3); }
    }
  }

  // ---- police in cars -------------------------------------------------------------------------
  updatePolice(dt) {
    this.chasers = this.chasers.filter((c) => c.state === 'chase' && c.fadeOut == null && !c.wreck);
    const want = this.busted > 0 ? 0 : CARS_FOR[this.stars];
    this.recruitT -= dt;
    if (this.chasers.length < want && this.recruitT <= 0) {
      this.recruitT = this.chasers.length ? 3.0 : 0.8;
      const t = this.target();
      let best = null, bd = 60 * 60;
      for (const c of this.city.traffic.cars) {
        if (c.type !== 'police' || c.free || c.state === 'parked' || c.fadeOut != null || c.wreck) continue;
        const d = dist2(c.x, c.y, t.x, t.y);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) this.makeChaser(best); else this.spawnChaser();
    }
    if (this.stars > 0) {
      this.flowT -= dt;
      if (this.flowT <= 0) { this.flowT = 0.5; this.buildFlow(this.lastKnown.x, this.lastKnown.y); }
    }
    for (const c of [...this.chasers]) this.drivePolice(c, dt);
  }
  makeChaser(c) {
    const V = this.city.vehicles;
    this.forget(c);
    if (!c.free) { this.city.traffic.detach(c); V.launch(c); }
    V.init(c);
    c.state = 'chase'; c.siren = true; c.special = null; c.revT = 0; c.stuckT = 0; c.life = 1e9; c.fadeIn = 0; c.idleT = 0;
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
    for (const c of this.chasers) { c.state = 'leaving'; c.siren = false; c.leaveT = now ? 0.01 : 7; c.reT = 0; }
    this.leaving.push(...this.chasers);
    this.chasers = [];
  }
  // stood-down police drive off, rejoining traffic when they can, or fade away out of sight
  updateLeaving(dt) {
    const view = this.city.view, V = this.city.vehicles;
    for (const c of [...this.leaving]) {
      if (c.fadeOut != null || c.state !== 'leaving' || !c.free) { this.leaving.splice(this.leaving.indexOf(c), 1); continue; }
      c.leaveT -= dt;
      V.init(c);
      let v = V.fwd(c);
      v += (2.4 - v) * Math.min(1, dt);
      V.steer(c, dt, v, 0, 10);
      V.move(c, dt);
      c.reT = (c.reT || 0) - dt;
      if (c.reT <= 0) {
        c.reT = 0.25;
        if (this.city.traffic.reattach(c)) { this.leaving.splice(this.leaving.indexOf(c), 1); continue; }
      }
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
    const V = this.city.vehicles, t = this.target();
    V.init(c);
    // at three stars and up they cut you off instead of following
    let tx = t.x, ty = t.y;
    if (this.car && this.stars >= 3) { const lead = Math.min(0.9, dist(c.x, c.y, t.x, t.y) / 10); tx += (this.car.vx || 0) * lead; ty += (this.car.vy || 0) * lead; }
    const d = dist(c.x, c.y, tx, ty), dTrue = dist(c.x, c.y, t.x, t.y);
    let dir;
    if (d < 12 && this.lineClear(c.x, c.y, tx, ty)) dir = [(tx - c.x) / (d || 1), (ty - c.y) / (d || 1)];
    else dir = this.flowDir(c.x, c.y);
    if (!dir[0] && !dir[1]) dir = [(tx - c.x) / (d || 1), (ty - c.y) / (d || 1)];
    const dh = wrap(Math.atan2(dir[1], dir[0]) - c.h);
    let v = V.fwd(c), yaw;
    if (c.stuckT > 0.9) { c.revT = 0.9; c.stuckT = 0; }
    if (c.revT > 0) {
      c.revT -= dt;
      v = Math.max(v - 7 * dt, -2.6);
      yaw = clamp(-dh, -1, 1) * 2.2;
    } else {
      const ram = this.stars >= 4 && this.car && V.speed(this.car) > 2;
      const top = 8.0 + this.stars * 0.25;
      // a suspect on foot: pull up a few metres short; one in a car: right up to the bumper (or into it)
      const close = this.busted > 0 ? 0 : !this.car ? clamp((dTrue - 3.5) * 1.3, 0, top) : dTrue < 3.2 ? (ram ? 6.5 : Math.max(0.8, dTrue - 1.4)) : top;
      const vmax = close * (1 - Math.min(0.62, (Math.abs(dh) / Math.PI) * 1.3));
      v += clamp(vmax - v, -10 * dt, 5 * dt);
      yaw = clamp(dh, -1, 1) * 2.8 * clamp(Math.abs(v) / 2, 0.35, 1);
    }
    if (c.hp < c.maxHp * 0.3) v = Math.min(v, 5);
    V.steer(c, dt, v, yaw, 10);
    const imp = V.move(c, dt);
    c.stuckT = (imp > 0 || V.speed(c) < 0.35) && dTrue > 4 && c.revT <= 0 ? (c.stuckT || 0) + dt : 0;
    c.z += (this.coll.groundZ(c.x, c.y) - c.z) * Math.min(1, dt * 10);
    c.brake = v < 0.3 || Math.abs(dh) > 1.2;
    // pulled up next to a suspect on foot (or one who has stopped): officers out
    const reach = this.car ? 9 : 13;
    if (!c.crewOut && this.busted <= 0 && dTrue < reach && (V.speed(c) < 1.6 || c.stuckT > 0.4 || c.revT > 0) && (!this.car || V.speed(this.car) < 1.2)) this.deployOfficers(c);
  }

  // ---- police on foot -------------------------------------------------------------------------
  deployOfficers(c, n = 2) {
    if (c.crewOut) return;
    const P = this.city.people;
    c.crewOut = true; c.crew = 0;
    for (let k = 0; k < n; k++) {
      const o = P.createCop();
      const side = k ? 1 : -1;
      let x = c.x - Math.sin(c.h) * side * (c.wid / 2 + 0.35), y = c.y + Math.cos(c.h) * side * (c.wid / 2 + 0.35);
      if (!this.coll.free(x, y, 0.2)) { x = c.x + Math.sin(c.h) * side * (c.wid / 2 + 0.35); y = c.y - Math.cos(c.h) * side * (c.wid / 2 + 0.35); }
      if (!this.coll.free(x, y, 0.15)) { x = c.x - Math.cos(c.h) * (c.len / 2 + 0.4); y = c.y - Math.sin(c.h) * (c.len / 2 + 0.4); }
      o.x = x; o.y = y; o.z = this.coll.groundZ(x, y); o.car = c;
      o.thought = this.rng.pick(['FREEZE!', 'POLICE! STOP!', 'Hands where I can see them!', "Don't move!"]);
      P.list.push(o);
      this.officers.push(o);
      c.crew++;
    }
    if (c.state === 'chase') { const i = this.chasers.indexOf(c); if (i >= 0) this.chasers.splice(i, 1); c.state = 'stopped'; c.siren = true; c.idleT = 0; }
  }
  // off duty: walk away and vanish into the nearest subway
  standDown(o) {
    if (o.state !== 'cop') return;
    const P = this.city.people;
    o.state = 'idle'; o.timer = 0.5; o.anim = 'idle'; o.animFrame = null; o.forceFace = false;
    o.node = P.nearestOf(P.nav.nodes, o.x, o.y);
    o.plan = [{ t: 'go', node: P.nearestOf(P.poi().subways, o.x, o.y), thought: 'Back to the precinct' }, { t: 'enter' }];
  }
  updateOfficers(dt) {
    const t = this.target(), C = this.coll;
    for (const o of [...this.officers]) {
      if (o.state === 'knocked') continue;
      if (o.state !== 'cop' || o.dead) { this.officers.splice(this.officers.indexOf(o), 1); continue; }
      if (this.stars === 0) { this.standDown(o); this.officers.splice(this.officers.indexOf(o), 1); continue; }
      o.animT += dt;
      if (o.staggerT > 0) { o.staggerT -= dt; o.anim = 'idle'; this.city.people.slide(o, dt); continue; }
      if (this.busted > 0) { o.anim = 'idle'; o.animFrame = null; continue; }
      const d = dist(o.x, o.y, t.x, t.y);
      const car = o.car;
      // the suspect has driven off: back to the car to give chase
      const back = car && !car.wreck && car.fireT == null && car.state === 'stopped' && d > 20;
      let gx = t.x, gy = t.y;
      if (back) { gx = car.x; gy = car.y; }
      const dd = dist(o.x, o.y, gx, gy);
      if (back && dd < car.len / 2 + 0.9) {
        // climbs back in
        o.dead = true; o.alpha = 0;
        this.officers.splice(this.officers.indexOf(o), 1);
        car.crew--;
        if (car.crew <= 0) { car.crewOut = false; this.makeChaser(car); }
        continue;
      }
      const reach = this.car ? this.car.wid / 2 + 0.75 : 0.75;
      if (!back && d < reach) { o.anim = 'idle'; o.animFrame = null; this.faceTo(o, t.x, t.y); continue; }
      let dx, dy;
      if (dd < 14 && this.lineClear(o.x, o.y, gx, gy)) { dx = (gx - o.x) / (dd || 1); dy = (gy - o.y) / (dd || 1); }
      else if (!back) { [dx, dy] = this.flowDir(o.x, o.y); if (!dx && !dy) { dx = (gx - o.x) / (dd || 1); dy = (gy - o.y) / (dd || 1); } }
      else { dx = (gx - o.x) / (dd || 1); dy = (gy - o.y) / (dd || 1); }
      // close to a suspect on foot: gun drawn, closing in at a walk
      const covering = !back && !this.car && d < 4.5;
      const sp = (covering ? 1.5 : 2.55) * dt;
      if (!this.moveFoot(o, dx * sp, dy * sp)) {
        // blocked: sidestep
        if (!this.moveFoot(o, -dy * sp, dx * sp)) this.moveFoot(o, dy * sp, -dx * sp);
      }
      o.dx = dx; o.dy = dy; o.dist += sp;
      if (covering) { o.anim = 'aim'; o.animFrame = 0; o.forceFace = true; o.dx = (t.x - o.x) / (d || 1); o.dy = (t.y - o.y) / (d || 1); }
      else { o.anim = 'run'; o.animFrame = null; o.forceFace = false; }
      o.z += (C.groundZ(o.x, o.y) - o.z) * Math.min(1, dt * 12);
      if (this.rng.chance(dt * 0.25)) o.thought = this.rng.pick(['FREEZE!', 'STOP RIGHT THERE!', 'POLICE!', 'Get on the ground!']);
    }
  }
  faceTo(o, x, y) { o.dx = x - o.x; o.dy = y - o.y; o.forceFace = true; }

  // ---- busted ---------------------------------------------------------------------------------
  checkBust(dt) {
    const t = this.target();
    if (!this.chasers.length && !this.officers.length) { this.bustT = 0; return; }
    let near = false;
    if (this.car) {
      const V = this.city.vehicles;
      const slow = V.speed(this.car) < 0.9;
      const half = this.car.len / 2;
      near = slow && (this.chasers.some((c) => { const r = half + c.len / 2 + 1.3; return dist2(c.x, c.y, t.x, t.y) < r * r && V.speed(c) < 3; })
        || this.officers.some((o) => o.state === 'cop' && !(o.staggerT > 0) && V.inBox(this.car, o.x, o.y, 0.8)));
    } else near = this.knockT <= 0 && this.officers.some((o) => o.state === 'cop' && !(o.staggerT > 0) && dist2(o.x, o.y, t.x, t.y) < 0.85 * 0.85);
    if (near) this.bustT += dt; else this.bustT = Math.max(0, this.bustT - dt * 0.6);
    if (this.bustT > (this.car ? 2.0 : 1.0)) this.bust();
  }
  bust() {
    this.busted = 3.4; this.bustT = 0;
    this.say('BUSTED!', 3.4, true);
    if (this.car) this.exitCar(true);
    this.trigger = false;
    this.city.audio?.event('busted', this.p);
  }
  // after a night downtown: released a few blocks away, the slate wiped clean
  release() {
    const P = this.city.people, p = this.p;
    const nodes = P.nav.nodes.filter((n) => (n.kind === 'walk' || n.kind === 'corner') && dist(n.x, n.y, p.x, p.y) > 30);
    const n = nodes.length ? this.rng.pick(nodes) : null;
    if (n) { p.x = n.x; p.y = n.y; p.z = n.z; }
    this.clearWanted(true);
    this.gun = { clip: CLIP, reload: 0, cd: 0 };
    this.camTarget.x = p.x; this.camTarget.y = p.y;
    const cam = this.city.camera; cam.x = p.x; cam.y = p.y;
    this.say('Released. Keep your nose clean!', 3);
  }

  // ---- what the vehicles and people report back ---------------------------------------------
  forget(c) {
    for (const L of [this.chasers, this.leaving]) { const i = L.indexOf(c); if (i >= 0) L.splice(i, 1); }
  }
  onCrash(a, b, closing) {
    if (!this.active || !this.car || (a !== this.car && b !== this.car)) return;
    const o = a === this.car ? b : a;
    if (o.type === 'police' && closing > 2.5 && o.state !== 'parked' && this.ramT <= 0) { this.crime(12, 'Rammed the police!'); this.ramT = 3; }
    else if (closing > 3 && o.state === 'crashed' && this.ramT <= 0 && this.policeSee(24)) { this.crime(10, 'Hit and run!'); this.ramT = 3; }
  }
  onCarHurt(c, amount, blame) {
    if (!this.active || !blame || amount <= 0) return;
    if (this.stars > 0) { this.pts += amount * (c.type === 'police' ? 0.5 : 0.2); this.updateStars(); }
  }
  onIgnite(c) {
    const V = this.city.vehicles;
    if (c === this.car) { this.say('Your car is on fire! GET OUT!', 3.5); return; }
    if (!c.free) { V.loosen(c); this.ejectDriver(c, 'fire'); c.state = 'abandoned'; return; }
    if (c.state === 'crashed') { this.ejectDriver(c, 'fire'); c.state = 'abandoned'; return; }
    if (c.state === 'chase' || c.state === 'leaving') { this.forget(c); if (!c.crewOut) this.deployOfficers(c); c.state = 'stopped'; }
  }
  beforeExplode(c) {
    this.forget(c);
    if (this.active && c === this.car) {
      const p = this.p;
      this.exitCar(true);
      const a = this.rng.range(0, 6.28);
      this.knockDown(Math.cos(a), Math.sin(a), 2.2);
      p.x += Math.cos(a) * 0.5; p.y += Math.sin(a) * 0.5;
      this.say('You barely made it out!', 3);
    }
    if (c.blameT != null && this.city.time - c.blameT < 20) this.crime(c.type === 'police' ? 90 : 40, c.type === 'police' ? 'Blew up a police car!' : 'Car explosion!', this.policeSee(34, c));
  }
  blast(c, R, blamed) {
    const P = this.city.people;
    for (const q of P.near(c.x, c.y, R)) {
      if (q === this.p || q.state === 'dead' || q.alpha < 0.5 || q.inCar) continue;
      const d = dist(q.x, q.y, c.x, c.y), ux = (q.x - c.x) / (d || 1), uy = (q.y - c.y) / (d || 1);
      if (d < 2.3) {
        const cop = q.state === 'cop';
        if (P.kill(q, ux, uy, 'blast') && blamed && !cop) this.crime(45, null, true);
      } else P.knock(q, ux * 1.6, uy * 1.6);
    }
    if (this.active && !this.car && this.p && this.knockT <= 0) {
      const d = dist(this.p.x, this.p.y, c.x, c.y);
      if (d < 3.4) { const ux = (this.p.x - c.x) / (d || 1), uy = (this.p.y - c.y) / (d || 1); this.knockDown(ux, uy, 1.6); }
    }
    this.city.animals?.scare?.(c.x, c.y, 18);
    for (const q of P.near(c.x, c.y, 16)) if (q !== this.p) P.panic(q, c.x, c.y, this.rng.range(3, 6));
  }
  onRunOver(c, q, lethal) {
    if (!this.active || c !== this.car) return;
    if (q.role === 'cop') { if (!lethal) this.crime(30, 'Ran down an officer!'); return; }
    const seen = this.policeSee();
    this.crime(lethal ? 45 : 15, lethal ? (seen ? null : 'Witnesses are calling 911!') : 'Hit and run!', seen);
  }
  onCopDown(o) {
    const i = this.officers.indexOf(o);
    if (i >= 0) this.officers.splice(i, 1);
    if (o.car && o.car.crew) o.car.crew--;
    if (this.active) this.crime(110, 'Officer down!');
  }

  // ---- HUD ------------------------------------------------------------------------------------
  hud() {
    if (!this.active) return null;
    const c = this.car;
    let prompt = '';
    if (this.busted > 0 || this.knockT > 0) prompt = '';
    else if (c) prompt = 'F · GET OUT';
    else {
      const n = this.nearCar();
      if (n) prompt = n.wreck ? 'WRECKED' : n.fireT != null ? 'ON FIRE!' : n.state === 'parked' || n.state === 'abandoned' || n.state === 'loose' || n.state === 'stopped' ? 'F · GET IN' : 'F · STEAL IT';
    }
    const V = this.city.vehicles;
    return {
      stars: this.stars, searching: this.stars > 0 && this.knownT <= 0 && this.unseenT > 0.5,
      status: c ? `${NAMES[c.type] || 'CAR'} · ${Math.round(Math.abs(V.fwd(c)) * 2 * 2.237)} MPH` : this.knockT > 0 ? 'KNOCKED DOWN' : this.input.run ? 'ON FOOT · RUNNING' : 'ON FOOT',
      prompt, msgs: this.msgs, busted: this.busted > 0, name: this.p ? this.p.name : '',
      gun: { clip: this.gun.clip, cap: CLIP, reloading: this.gun.reload > 0 },
      car: c ? { hp: c.mass ? c.hp / c.maxHp : 1, fire: c.fireT != null } : null,
    };
  }
}
