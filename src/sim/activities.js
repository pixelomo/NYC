// Group activities: basketball, snowball fights, open hydrant, skating, lawns, playground, dog run.

import { RNG, clamp, dist, dist2 } from '../core/math.js';
import { CURB } from '../world/layout.js';
import { SF } from '../render/spriteLayer.js';
import { S } from '../render/sprites.js';

const G = 5.0; // gravity in units/s^2 (1 unit = 2 m)

export class Activities {
  constructor(city) {
    this.city = city;
    this.people = city.people;
    this.rng = new RNG(777);
    const W = city.world;
    this.court = W.court;
    this.hoops = W.hoops.filter((h) => this.court && h.x > this.court.x0 - 1 && h.x < this.court.x1 + 1 && h.y > this.court.y0 - 1 && h.y < this.court.y1 + 1);
    this.groups = { basketball: [], snowball: [], hydrant: [], skate: [], lawn: [], playground: [], dogrun: [] };
    this.ball = null;
    this.snowballs = [];
    this.snowmen = [];
    this.hydrantOpen = null;
    this.hydrantTimer = 5;
    this.frisbee = null;
    const A = city.atlas;
    this.frames = { ball: A.get('ball'), snowball: A.get('snowball'), snowman: A.get('snowman'), frisbee: A.get('frisbee') };
    this.row = city.pal.alloc({ [S.C1]: 0xe8701a, [S.C2]: 0xf4f8ff, [S.C3]: 0x1e1e22, [S.C4]: 0x6a4a2a, [S.C5]: 0xd8302c, [S.C6]: 0xf2c230, [S.C7]: 0xf08a1a });
    this.possession = 0;
    this.score = [0, 0];
    this.shotClock = 0;
    this.season = city.env.season;
  }
  // Populate activities at start / season change so the city feels alive immediately
  seed() {
    const env = this.city.env, P = this.people, r = this.rng, poi = P.nav.poi;
    const h = env.hour, s = env.season;
    const day = h > 7.5 && h < 20.5;
    const mk = (role, kind, node, x, y, dur, z = CURB) => {
      const p = P.create(role);
      p.home = P.pickHome();
      p.node = node;
      p.x = x; p.y = y; p.z = z;
      p.plan = [{ t: 'go', node: p.home, thought: 'Heading home' }, { t: 'enter' }];
      P.list.push(p);
      if (kind && !this.join(p, kind, dur)) { p.state = 'idle'; p.timer = 0.1; }
      return p;
    };
    const C = this.court;
    if (C && day && !env.raining && !(s === 3 && env.snowCover > 0.3)) {
      const n = s === 1 ? r.int(5, 7) : r.int(3, 4);
      for (let k = 0; k < n; k++) mk('player', 'basketball', poi.court.gate, r.range(C.x0 + 1, C.x1 - 1), r.range(C.y0 + 1, C.y1 - 1), r.range(60, 140));
    }
    if (s === 3 && env.snowCover > 0.3 && day) {
      const a = this.snowArea();
      if (a) for (let k = 0; k < 8; k++) mk('kid', 'snowball', poi.park.lawnNodes?.[0] || poi.court.gate, r.range(a.x0, a.x1), r.range(a.y0, a.y1), r.range(50, 120));
      const pond = this.city.world.pond;
      if (pond) for (let k = 0; k < 5; k++) mk(r.chance(0.5) ? 'kid' : 'resident', 'skate', poi.park.pond, pond.x, pond.y, r.range(40, 100));
      for (let k = 0; k < 3; k++) {
        const a2 = this.snowArea();
        if (a2) this.snowmen.push({ x: r.range(a2.x0 + 0.5, a2.x1 - 0.5), y: r.range(a2.y0 + 0.5, a2.y1 - 0.5) });
      }
    }
    if (day && poi.court.playground && !env.raining) for (let k = 0; k < 3; k++) mk('kid', 'playground', poi.court.playground, poi.court.playground.x, poi.court.playground.y, r.range(30, 70));
    const lawnN = poi.park.lawnNodes || [];
    if (s === 1 && day && !env.raining && lawnN.length) for (let k = 0; k < 6; k++) { const n = lawnN[k % lawnN.length]; mk('resident', 'lawn', n, n.x, n.y, r.range(40, 90)); }
    if (day && poi.park.dogGate) for (let k = 0; k < 2; k++) {
      const p = mk('dogwalker', null, poi.park.dogGate, poi.park.dogGate.x, poi.park.dogGate.y, 0);
      p.dogName = r.pick(['Biscuit', 'Lola', 'Rocco', 'Pretzel']);
      this.city.animals?.spawnDog(p);
      this.join(p, 'dogrun', r.range(30, 60));
    }
    // benches
    const nb = day ? 8 : 2;
    for (let k = 0; k < nb; k++) {
      const b = P.freeBench(k % 2 === 0);
      if (!b) break;
      const p = mk(r.chance(0.35) ? 'elder' : 'resident', null, b.node, b.node.x, b.node.y, 0);
      const bb = b.bench, i = bb.used.findIndex((u) => !u);
      bb.used[i] = p.id;
      p.seat = { b: bb, k: i };
      const st = bb.seats[i];
      p.x = st.x; p.y = st.y; p.z = st.z; p.state = 'sit'; p.anim = 'sit'; p.timer = r.range(20, 80);
      p.feeding = p.elder; p.thought = p.elder ? 'Feeding the pigeons' : 'People watching';
      P.faceSeat(p);
    }
    // stoop sitters on summer evenings
    if ((s === 1 && h > 16) || (s === 0 && h > 17 && h < 21)) for (let k = 0; k < 8; k++) {
      const st = P.freeStoop();
      if (!st) break;
      const p = mk(r.chance(0.3) ? 'elder' : 'resident', null, st.door, st.seat.x, st.seat.y, 0, st.seat.z);
      st.seat.used = p.id;
      p.stoopSeat = st.seat; p.state = 'sit'; p.anim = 'sit'; p.timer = r.range(40, 120); p.node = st.door;
      p.thought = r.pick(['Catching up with the neighbors', 'Too hot inside', 'Watching the block']);
      P.faceSeat(p);
    }
    this.seedVendors();
  }
  seedVendors() {
    const P = this.people, env = this.city.env;
    const open = env.hour > 7 && env.hour < 21.5;
    for (const c of this.city.world.carts) {
      if (open && !c.vendor) {
        const p = P.create('vendor');
        p.x = c.x - c.nx * 0.55; p.y = c.y - c.ny * 0.55; p.z = CURB;
        p.state = 'vendor'; p.anim = 'idle'; p.thought = c.kind === 'halal' ? 'Chicken over rice! Lamb over rice!' : c.kind === 'pretzel' ? 'Hot pretzels!' : 'Hot dogs! Get your hot dogs!';
        p.forceFace = false;
        P.faceTo(p, c.x + c.nx * 3, c.y + c.ny * 3);
        c.vendor = p;
        P.list.push(p);
      } else if (!open && c.vendor) {
        c.vendor.state = 'vanish';
        c.vendor = null;
      }
    }
  }
  join(p, kind, dur) {
    const g = this.groups[kind];
    if (!g) return false;
    const env = this.city.env;
    p.actTimer = dur;
    p.actKind = kind;
    switch (kind) {
      case 'basketball': {
        if (!this.court || g.length >= 8 || env.raining || (env.season === 3 && env.snowCover > 0.3)) return false;
        p.team = g.filter((q) => q.team === 0).length <= g.filter((q) => q.team === 1).length ? 0 : 1;
        p.tx = this.rng.range(this.court.x0 + 1, this.court.x1 - 1);
        p.ty = this.rng.range(this.court.y0 + 1, this.court.y1 - 1);
        p.thought = this.rng.pick(['Ball is life', 'Pass it!', 'Nothing but net', 'Next game, I got winners', 'Check ball']);
        break;
      }
      case 'snowball': {
        const area = this.snowArea();
        if (!area || g.length >= 10) return false;
        p.team = g.filter((q) => q.team === 0).length <= g.filter((q) => q.team === 1).length ? 0 : 1;
        p.area = area;
        this.placeInArea(p, area, p.team);
        p.sbState = 'make';
        p.sbTimer = this.rng.range(0.5, 2);
        p.thought = this.rng.pick(['SNOWBALL FIGHT!', 'Take cover!', 'Got you!', 'My hands are frozen']);
        break;
      }
      case 'hydrant': {
        if (!this.hydrantOpen || g.length >= 8) return false;
        const h = this.hydrantOpen.h;
        p.hy = { a: { x: h.x + h.nx * 0.2 - h.ux * 1.6, y: h.y + h.ny * 0.2 - h.uy * 1.6 }, b: { x: h.x + h.nx * 0.2 + h.ux * 1.6, y: h.y + h.ny * 0.2 + h.uy * 1.6 } };
        p.hyDir = this.rng.chance(0.5) ? 1 : 0;
        p.thought = 'SO COLD! SO GOOD!';
        break;
      }
      case 'skate': {
        const pond = this.city.world.pond;
        if (!pond || env.season !== 3 || g.length >= 10) return false;
        p.ang = this.rng.range(0, Math.PI * 2);
        p.rad = this.rng.range(0.45, 0.95);
        p.angV = this.rng.range(0.35, 0.6);
        p.thought = this.rng.pick(['Wheee!', 'Don\'t fall, don\'t fall', 'Figure eight!']);
        break;
      }
      case 'lawn': {
        const lawns = this.city.world.lawns;
        if (!lawns || !lawns.length) return false;
        const l = this.rng.pick(lawns);
        p.tx = this.rng.range(l.x0 + 0.5, l.x1 - 0.5);
        p.ty = this.rng.range(l.y0 + 0.5, l.y1 - 0.5);
        p.lawnPose = this.city.env.season === 1 && this.rng.chance(0.6) ? 'lie' : 'sit';
        p.thought = p.lawnPose === 'lie' ? 'Working on my tan' : 'Reading a good book';
        break;
      }
      case 'playground': {
        const W = this.city.world;
        const opts = [];
        for (const s of W.swings) if (!s.used) opts.push({ kind: 'swing', s });
        for (const s of W.slides) opts.push({ kind: 'slide', s });
        if (!opts.length) return false;
        const o = this.rng.pick(opts);
        p.pg = o;
        if (o.kind === 'swing') o.s.used = p.id;
        p.pgPhase = this.rng.range(0, 6);
        p.thought = o.kind === 'swing' ? 'Higher! Higher!' : 'Slide!';
        break;
      }
      case 'dogrun': {
        const dr = this.city.world.dogRun;
        if (!dr) return false;
        p.tx = dr.gate.x + this.rng.range(-0.6, 0.6);
        p.ty = dr.gate.y - 0.2;
        if (p.dog) { p.dog.mode = 'play'; p.dog.area = dr; }
        p.thought = `${p.dogName || 'Buddy'}, go get it!`;
        break;
      }
    }
    p.state = 'activity';
    p.joinNode = p.node;
    g.push(p);
    return true;
  }
  leave(p) {
    const g = this.groups[p.actKind];
    if (g) {
      const i = g.indexOf(p);
      if (i >= 0) g.splice(i, 1);
    }
    if (this.ball && this.ball.holder === p) { this.ball.holder = null; this.ball.state = 'loose'; }
    if (p.pg && p.pg.kind === 'swing') p.pg.s.used = false;
    p.pg = null;
    if (p.dog) { p.dog.mode = 'follow'; }
    p.animFrame = null;
    p.forceFace = false;
    const back = p.joinNode;
    p.actKind = null;
    if (back) { p.walkTo = { x: back.x, y: back.y, z: back.z }; p.state = 'return'; }
    else this.people.nextStep(p);
  }
  snowArea() {
    const W = this.city.world;
    const areas = [];
    if (W.lawns) for (const l of W.lawns) areas.push(l);
    if (W.court) areas.push({ x0: W.court.x0 + 0.5, y0: W.court.y0 + 0.5, x1: W.court.x1 - 0.5, y1: W.court.y1 - 0.5 });
    if (!this.snowAreaPick) this.snowAreaPick = areas[0];
    return this.snowAreaPick;
  }
  placeInArea(p, a, team) {
    const midx = (a.x0 + a.x1) / 2;
    p.tx = team === 0 ? this.rng.range(a.x0 + 0.3, midx - 1.2) : this.rng.range(midx + 1.2, a.x1 - 0.3);
    p.ty = this.rng.range(a.y0 + 0.3, a.y1 - 0.3);
  }
  moveTo(p, tx, ty, speed, dt) {
    const d = dist(p.x, p.y, tx, ty);
    if (d < 0.05) return true;
    const s = Math.min(d, speed * dt);
    p.dx = tx - p.x; p.dy = ty - p.y;
    p.x += ((tx - p.x) / d) * s;
    p.y += ((ty - p.y) / d) * s;
    p.dist += s;
    return d < 0.08;
  }
  face(p, x, y) {
    const d = this.city.camera.screenDir(x - p.x, y - p.y);
    p.front = d[1] >= 0;
    if (Math.abs(d[0]) > 0.01) p.flip = d[0] < 0;
  }
  // ---- update ----------------------------------------------------------------
  update(dt) {
    const env = this.city.env;
    if (env.season !== this.season) { this.season = env.season; this.snowmen = []; this.snowAreaPick = null; }
    this.vendorT = (this.vendorT ?? 0) - dt;
    if (this.vendorT <= 0) { this.vendorT = 5; this.seedVendors(); }
    this.updateHydrant(dt, env);
    for (const kind in this.groups) {
      const g = this.groups[kind];
      for (let i = g.length - 1; i >= 0; i--) {
        const p = g[i];
        p.actTimer -= dt;
        const h = env.hour;
        const late = kind === 'basketball' ? (env.season === 1 ? h > 22 || h < 7 : env.darkness > 0.6 || h < 7)
          : kind === 'dogrun' || kind === 'lawn' ? env.darkness > 0.75 && (h > 22 || h < 6)
          : (kind === 'snowball' || kind === 'playground' || kind === 'skate' || kind === 'hydrant') ? (env.darkness > 0.55 && h > 18) || h < 7 || h > 21 : false;
        const quit = p.actTimer <= 0 || late || (kind === 'basketball' && env.raining) || (kind === 'hydrant' && !this.hydrantOpen) || p.dead;
        if (quit) this.leave(p);
      }
    }
    this.updateBasketball(dt, env);
    this.updateSnowball(dt, env);
    this.updateSimple(dt, env);
  }
  updateHydrant(dt, env) {
    const W = this.city.world;
    this.hydrantTimer -= dt;
    const hot = env.season === 1 && env.hour > 11 && env.hour < 19.5 && !env.raining && env.temperature() > 80;
    if (this.hydrantOpen && !hot) { this.hydrantOpen = null; }
    if (!this.hydrantOpen && hot && this.hydrantTimer <= 0) {
      this.hydrantTimer = 60;
      // choose a hydrant on a residential street, prefer near the court
      const P = this.people.nav.poi.hydrants;
      if (P.length) {
        const sorted = P.slice().sort((a, b) => dist2(a.h.x, a.h.y, 60, 90) - dist2(b.h.x, b.h.y, 60, 90));
        const pick = sorted[this.rng.int(0, Math.min(3, sorted.length - 1))];
        // spray direction: toward the road (perpendicular to sidewalk)
        const h = pick.h;
        const n = this.roadNormal(h.x, h.y);
        h.nx = n[0]; h.ny = n[1]; h.ux = -n[1]; h.uy = n[0];
        this.hydrantOpen = { h, node: pick.node };
        this.city.particles?.addEmitter('hydrant', h);
      }
    }
  }
  roadNormal(x, y) {
    // find which way the road is from a sidewalk point
    const zone = (xx, yy) => {
      const lx = ((xx % 27) + 27) % 27, ly = ((yy % 27) + 27) % 27;
      return (lx >= 2 && lx < 7) || (ly >= 2 && ly < 7);
    };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (zone(x + dx * 1.2, y + dy * 1.2)) return [dx, dy];
    return [0, 1];
  }
  updateBasketball(dt, env) {
    const g = this.groups.basketball;
    const C = this.court;
    if (!g.length || !C) { this.ball = null; return; }
    const audio = this.city.audio;
    let b = this.ball;
    if (!b) {
      b = this.ball = { x: (C.x0 + C.x1) / 2, y: (C.y0 + C.y1) / 2, z: CURB + 0.2, vx: 0, vy: 0, vz: 0, holder: null, state: 'loose', t: 0, bounceSnd: 0 };
    }
    const shootaround = g.length < 4;
    const attackHoop = (team) => (shootaround ? this.hoops[0] : this.hoops[team % this.hoops.length]);
    b.t += dt;
    // ball physics
    if (b.state === 'held' && b.holder) {
      const p = b.holder;
      const fx = Math.cos(p.faceAng || 0), fy = Math.sin(p.faceAng || 0);
      const ph = (b.t * 7.5) % Math.PI;
      const prevZ = b.z;
      b.x = p.x + fx * 0.25; b.y = p.y + fy * 0.25;
      b.z = CURB + 0.08 + Math.abs(Math.cos(ph)) * 0.55;
      if (prevZ > CURB + 0.2 && b.z <= CURB + 0.2) audio?.event('dribble', b);
      p.animFrame = b.z > CURB + 0.4 ? 0 : 1;
    } else if (b.state === 'shot') {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= G * dt;
      b.flight -= dt;
      if (b.flight <= 0) {
        const hoop = b.target;
        if (b.make) {
          b.state = 'drop'; b.x = hoop.x; b.y = hoop.y; b.z = hoop.z - 0.05; b.vx = 0; b.vy = 0; b.vz = -0.5;
          audio?.event('swish', b);
          if (!shootaround) { this.score[b.team]++; this.possession = 1 - b.team; }
          this.city.particles?.netShake?.(hoop);
        } else {
          b.state = 'loose';
          const a = this.rng.range(0, Math.PI * 2);
          b.vx = Math.cos(a) * 1.6 - hoop.fx * 1.2; b.vy = Math.sin(a) * 1.6 - hoop.fy * 1.2; b.vz = 1.6;
          audio?.event('rim', b);
        }
      }
    } else {
      // loose / drop: bouncing
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= G * dt;
      if (b.z < CURB + 0.08) {
        b.z = CURB + 0.08;
        if (Math.abs(b.vz) > 0.6) audio?.event('bounce', b);
        b.vz = Math.abs(b.vz) * 0.55;
        if (b.vz < 0.3) b.vz = 0;
        b.vx *= 0.82; b.vy *= 0.82;
      }
      // keep within fence
      if (b.x < C.x0 - 0.6 || b.x > C.x1 + 0.6) { b.vx *= -0.6; b.x = clamp(b.x, C.x0 - 0.6, C.x1 + 0.6); }
      if (b.y < C.y0 - 0.6 || b.y > C.y1 + 0.6) { b.vy *= -0.6; b.y = clamp(b.y, C.y0 - 0.6, C.y1 + 0.6); }
      if (b.state === 'drop' && b.z <= CURB + 0.1) b.state = 'loose';
    }
    // players
    for (const p of g) {
      const hoop = attackHoop(p.team);
      if (!hoop) continue;
      p.forceFace = true;
      if (b.holder === p) {
        // dribble toward the hoop and shoot
        const d = dist(p.x, p.y, hoop.x, hoop.y);
        p.shootT = (p.shootT ?? this.rng.range(1.5, 4)) - dt;
        if (d < 1.6 || (p.shootT <= 0 && d < 5.5)) {
          // shoot
          p.anim = 'shoot'; p.animFrame = 1;
          p.shootPose = 0.45;
          b.state = 'shot'; b.holder = null; b.team = p.team;
          b.target = hoop;
          b.make = this.rng.chance(clamp(0.75 - d * 0.08, 0.3, 0.75));
          const T = 0.65 + d * 0.08;
          b.flight = T;
          b.x = p.x; b.y = p.y; b.z = p.z + 1.1;
          b.vx = (hoop.x - b.x) / T; b.vy = (hoop.y - b.y) / T;
          b.vz = (hoop.z + 0.05 - b.z + 0.5 * G * T * T) / T;
          p.shootT = null;
          this.face(p, hoop.x, hoop.y);
          continue;
        }
        const tx = hoop.x - hoop.fx * -1.4 + Math.sin(b.t + p.id) * 1.2;
        const ty = hoop.y + Math.cos(b.t * 0.7 + p.id) * 1.6;
        this.moveTo(p, clamp(tx, C.x0 + 0.3, C.x1 - 0.3), clamp(ty, C.y0 + 0.3, C.y1 - 0.3), 1.1, dt);
        p.faceAng = Math.atan2(hoop.y - p.y, hoop.x - p.x);
        p.anim = 'dribble';
        this.face(p, hoop.x, hoop.y);
      } else if (p.shootPose > 0) {
        p.shootPose -= dt;
        p.anim = 'shoot'; p.animFrame = p.shootPose > 0.2 ? 1 : 0;
      } else if (b.state === 'loose' || b.state === 'drop') {
        // chase the ball (closest few)
        const d = dist(p.x, p.y, b.x, b.y);
        const rank = g.filter((q) => dist(q.x, q.y, b.x, b.y) < d).length;
        if (rank < 2) {
          this.moveTo(p, b.x, b.y, 2.1, dt);
          p.anim = 'run'; p.animFrame = null;
          this.face(p, b.x, b.y);
          if (d < 0.35 && b.z < CURB + 1.0) {
            if (!shootaround && b.state === 'loose' && this.possession !== p.team && this.rng.chance(0.4)) this.possession = p.team;
            b.holder = p; b.state = 'held';
          }
        } else {
          p.anim = 'idle'; p.animFrame = null;
          this.face(p, b.x, b.y);
        }
      } else {
        // move to spots around the active hoop
        const active = b.holder ? attackHoop(b.holder.team) : hoop;
        p.spotT = (p.spotT ?? 0) - dt;
        if (p.spotT <= 0 || p.sx == null) {
          p.spotT = this.rng.range(1.2, 3);
          const ang = this.rng.range(-1.2, 1.2) + Math.atan2(-active.fy, -active.fx);
          const r = this.rng.range(1.2, 3.8);
          p.sx = clamp(active.x + Math.cos(ang) * r, C.x0 + 0.3, C.x1 - 0.3);
          p.sy = clamp(active.y + Math.sin(ang) * r, C.y0 + 0.3, C.y1 - 0.3);
        }
        const arrived = this.moveTo(p, p.sx, p.sy, 1.6, dt);
        p.anim = arrived ? 'idle' : 'run';
        p.animFrame = null;
        this.face(p, b.x, b.y);
      }
    }
  }
  updateSnowball(dt, env) {
    const g = this.groups.snowball;
    const audio = this.city.audio;
    for (const p of g) {
      p.forceFace = true;
      const a = p.area;
      if (!a) continue;
      if (dist(p.x, p.y, p.tx, p.ty) > 0.1 && p.sbState !== 'throw') {
        this.moveTo(p, p.tx, p.ty, 1.6, dt);
        p.anim = 'run'; p.animFrame = null;
        continue;
      }
      p.sbTimer -= dt;
      const foes = g.filter((q) => q.team !== p.team);
      const foe = foes.length ? foes[(p.id + Math.floor(p.animT)) % foes.length] : null;
      if (foe) this.face(p, foe.x, foe.y);
      if (p.sbState === 'make') {
        p.anim = 'crouch'; p.animFrame = 0;
        if (p.sbTimer <= 0) { p.sbState = 'throw'; p.sbTimer = 0.5; }
      } else if (p.sbState === 'throw') {
        p.anim = 'throw'; p.animFrame = p.sbTimer > 0.25 ? 0 : 1;
        if (p.sbTimer <= 0.25 && !p.thrown) {
          p.thrown = true;
          if (foe) {
            const T = 0.55 + dist(p.x, p.y, foe.x, foe.y) * 0.06;
            const tx = foe.x + this.rng.range(-0.5, 0.5), ty = foe.y + this.rng.range(-0.5, 0.5);
            this.snowballs.push({ x: p.x, y: p.y, z: p.z + 0.9, vx: (tx - p.x) / T, vy: (ty - p.y) / T, vz: (foe.z + 0.5 - p.z - 0.9 + 0.5 * G * T * T) / T, t: T, target: foe });
            audio?.event('throw', p);
          }
        }
        if (p.sbTimer <= 0) {
          p.thrown = false;
          p.sbState = this.rng.chance(0.3) ? 'move' : 'make';
          p.sbTimer = this.rng.range(0.8, 2.2);
          if (p.sbState === 'move') { this.placeInArea(p, a, p.team); p.sbState = 'make'; }
        }
      } else if (p.sbState === 'hit') {
        p.anim = 'idle'; p.animFrame = 0;
        if (p.sbTimer <= 0) { p.sbState = 'make'; p.sbTimer = this.rng.range(0.6, 1.5); }
      }
    }
    for (let i = this.snowballs.length - 1; i >= 0; i--) {
      const s = this.snowballs[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vz -= G * dt; s.t -= dt;
      if (s.t <= 0 || s.z < CURB) {
        const hit = s.target && dist(s.x, s.y, s.target.x, s.target.y) < 0.55;
        if (hit && s.target.sbState) { s.target.sbState = 'hit'; s.target.sbTimer = 0.7; s.target.thought = this.rng.pick(['Oof!', 'Hey!!', 'Right in the face', 'You\'re going down']); }
        this.city.particles?.puff(s.x, s.y, Math.max(CURB, s.z), hit ? 8 : 5, [0.96, 0.98, 1.0]);
        audio?.event('splat', s);
        this.snowballs.splice(i, 1);
      }
    }
    // snowmen appear in winter lawns over time
    if (env.season === 3 && env.snowCover > 0.4 && this.snowmen.length < 4 && g.length && this.rng.chance(dt * 0.05)) {
      const a = this.snowArea();
      if (a) this.snowmen.push({ x: this.rng.range(a.x0 + 0.5, a.x1 - 0.5), y: this.rng.range(a.y0 + 0.5, a.y1 - 0.5) });
    }
  }
  updateSimple(dt, env) {
    // hydrant
    for (const p of this.groups.hydrant) {
      p.forceFace = true;
      const t = p.hyDir ? p.hy.b : p.hy.a;
      if (this.moveTo(p, t.x, t.y, 1.9, dt)) {
        p.hyPause = (p.hyPause ?? this.rng.range(0.3, 1.2)) - dt;
        p.anim = 'wave'; p.animFrame = 0;
        if (p.hyPause <= 0) { p.hyDir = 1 - p.hyDir; p.hyPause = null; if (this.rng.chance(0.1)) this.city.audio?.event('giggle', p); }
      } else { p.anim = 'run'; p.animFrame = null; }
    }
    // skating around the pond
    const pond = this.city.world.pond;
    for (const p of this.groups.skate) {
      if (!pond) break;
      p.forceFace = true;
      p.ang += p.angV * dt;
      const tx = pond.x + Math.cos(p.ang) * pond.rx * p.rad, ty = pond.y + Math.sin(p.ang) * pond.ry * p.rad;
      if (dist(p.x, p.y, tx, ty) > 0.3) { this.moveTo(p, tx, ty, 1.5, dt); p.anim = 'walk'; }
      else { p.dx = tx - p.x; p.dy = ty - p.y; p.x = tx; p.y = ty; p.anim = 'skate'; p.animFrame = Math.floor(p.ang * 3) % 2; }
      p.z = CURB;
    }
    // lawns
    for (const p of this.groups.lawn) {
      if (dist(p.x, p.y, p.tx, p.ty) > 0.08) { this.moveTo(p, p.tx, p.ty, p.speed, dt); p.anim = 'walk'; p.forceFace = true; }
      else { p.anim = p.lawnPose; p.animFrame = 0; p.forceFace = false; }
    }
    // playground
    for (const p of this.groups.playground) {
      const o = p.pg;
      if (!o) continue;
      if (o.kind === 'swing') {
        const s = o.s;
        if (dist(p.x, p.y, s.x, s.y) > 0.6 && !p.onSwing) { this.moveTo(p, s.x, s.y, p.speed, dt); p.anim = 'walk'; p.forceFace = true; continue; }
        p.onSwing = true;
        p.pgPhase += dt * 2.6;
        const sw = Math.sin(p.pgPhase) * 0.55;
        p.x = s.x; p.y = s.y + sw; p.z = s.z + (1 - Math.cos(p.pgPhase * 1)) * 0.05 + Math.abs(sw) * 0.25;
        p.anim = 'sit'; p.animFrame = 0; p.forceFace = false;
        this.face(p, s.x, s.y + 1);
      } else {
        const s = o.s;
        p.pgT = (p.pgT ?? 0) + dt;
        const cyc = p.pgT % 6;
        if (cyc < 2.5) { this.moveTo(p, s.x, s.y + 0.6, p.speed, dt); p.z = CURB + Math.min(1, cyc / 2.5) * 0.2; p.anim = 'walk'; p.forceFace = true; }
        else if (cyc < 3.5) { p.x = s.x; p.y = s.y; p.z = s.z; p.anim = 'wave'; p.animFrame = 0; }
        else { const t = Math.min(1, (cyc - 3.5) / 0.9); p.x = s.x + (s.ex - s.x) * t; p.y = s.y + (s.ey - s.y) * t; p.z = s.z + (CURB + 0.05 - s.z) * t; p.anim = 'sit'; p.animFrame = 0; p.forceFace = false; this.face(p, s.ex, s.ey + 1); }
        p.onSwing = false;
      }
    }
    // dog run: owner waits at the gate
    for (const p of this.groups.dogrun) {
      if (dist(p.x, p.y, p.tx, p.ty) > 0.08) { this.moveTo(p, p.tx, p.ty, p.speed, dt); p.anim = 'walk'; p.forceFace = true; }
      else { p.anim = this.rng.chance(dt * 0.3) ? 'throw' : 'idle'; p.animFrame = null; p.forceFace = false; if (p.dog) this.face(p, p.dog.x, p.dog.y); }
    }
  }
  emit(L, view) {
    const b = this.ball;
    if (b && this.groups.basketball.length && view.visible(b.x, b.y, b.z, 1)) L.push(b.x, b.y, b.z, this.frames.ball, this.row, 0, 1, 0.006);
    for (const s of this.snowballs) L.push(s.x, s.y, s.z, this.frames.snowball, this.row, 0, 1, 0.006);
    if (this.city.env.season === 3) for (const s of this.snowmen) if (view.visible(s.x, s.y, CURB, 1)) L.push(s.x, s.y, CURB, this.frames.snowman, this.snowmanRow(), 0);
  }
  snowmanRow() {
    if (this._smRow == null) this._smRow = this.city.pal.alloc({ [S.C1]: 0xf4f8ff, [S.C3]: 0x1e1e22, [S.C4]: 0x6a4a2a, [S.C5]: 0xd8302c, [S.C7]: 0xf08a1a });
    return this._smRow;
  }
}
