// Animals: pigeons, dogs, squirrels, cats, ducks, rats, geese.

import { paintPigeon, paintDog, paintCat, paintSquirrel, paintDuck, paintRat, DOG_BREEDS, dogFrameSize, selOut, S } from '../render/sprites.js';
import { SF } from '../render/spriteLayer.js';
import { RNG, clamp, dist, dist2 } from '../core/math.js';
import { CURB, MAPX, MAPY } from '../world/layout.js';

export class Animals {
  constructor(city) {
    this.city = city;
    this.rng = new RNG(99);
    const A = city.atlas;
    const mk = (name, w, h, fn) => A.add(name, w, h, (sp) => { fn(sp); selOut(sp, 0.8, 1.05); });
    this.f = {
      pigeon: { walk: [0, 1].map((f) => mk(null, 16, 14, (sp) => paintPigeon(sp, 'walk', f))), peck: [0, 1].map((f) => mk(null, 16, 14, (sp) => paintPigeon(sp, 'peck', f))), fly: [0, 1].map((f) => mk(null, 18, 16, (sp) => paintPigeon(sp, 'fly', f))) },
      cat: { walk: [0, 1].map((f) => mk(null, 18, 14, (sp) => paintCat(sp, 'walk', f))), sit: [0, 1].map((f) => mk(null, 12, 16, (sp) => paintCat(sp, 'sit', f))) },
      squirrel: { run: [0, 1].map((f) => mk(null, 14, 14, (sp) => paintSquirrel(sp, 'run', f))), stand: [mk(null, 14, 14, (sp) => paintSquirrel(sp, 'stand', 0))] },
      duck: { swim: [0, 1].map((f) => mk(null, 16, 12, (sp) => paintDuck(sp, 'swim', f))) },
      rat: { run: [0, 1].map((f) => mk(null, 14, 8, (sp) => paintRat(sp, f))) },
    };
    this.dogFrames = {};
    for (const breed in DOG_BREEDS) {
      const [w, h] = dogFrameSize(breed);
      this.dogFrames[breed] = {
        walk: [0, 1, 2, 3].map((f) => mk(null, w, h, (sp) => paintDog(sp, breed, 'walk', f))),
        run: [0, 1].map((f) => mk(null, w, h, (sp) => paintDog(sp, breed, 'run', f))),
        sit: [0, 1].map((f) => mk(null, w, h, (sp) => paintDog(sp, breed, 'sit', f))),
        sniff: [0, 1].map((f) => mk(null, w, h, (sp) => paintDog(sp, breed, 'sniff', f))),
      };
    }
    const pal = city.pal;
    this.pigeonRows = [
      pal.alloc({ [S.BODY]: 0x8a92a0, [S.BODY_D]: 0x4a5060, [S.BODY_L]: 0xb4bcc8, [S.EYE]: 0xd8501a, [S.BEAK]: 0xc87a6a, [S.ACCENT]: 0x5aa07a }),
      pal.alloc({ [S.BODY]: 0x6a7080, [S.BODY_D]: 0x3a3e48, [S.BODY_L]: 0x9aa0ac, [S.EYE]: 0xd8501a, [S.BEAK]: 0xc87a6a, [S.ACCENT]: 0x8a5aa0 }),
      pal.alloc({ [S.BODY]: 0xe8e4dc, [S.BODY_D]: 0xa89a8a, [S.BODY_L]: 0xf8f6f0, [S.EYE]: 0x8a3a1a, [S.BEAK]: 0xd8a090, [S.ACCENT]: 0xc8c0b0 }),
      pal.alloc({ [S.BODY]: 0x8a6a5a, [S.BODY_D]: 0x5a4034, [S.BODY_L]: 0xb89a88, [S.EYE]: 0xd8501a, [S.BEAK]: 0xc87a6a, [S.ACCENT]: 0x6a9a7a }),
    ];
    this.catRows = [0x1e1e22, 0xe08a3a, 0xf2efe6, 0x8a8a90].map((c) => pal.alloc({ [S.BODY]: c, [S.BODY_D]: shadeHex(c, 0.75), [S.BODY_L]: shadeHex(c, 1.2), [S.EYE]: 0x8ad84a }));
    this.squirrelRow = pal.alloc({ [S.BODY]: 0x8a8580, [S.BODY_D]: 0x5a5550, [S.BODY_L]: 0xaaa49c, [S.EYE]: 0x1e1e22 });
    this.duckRows = [pal.alloc({ [S.BODY]: 0x8a6a4a, [S.BODY_D]: 0x5a4030, [S.BODY_L]: 0xa8885a, [S.EYE]: 0x1e1e22, [S.ACCENT]: 0x2f7a4a, [S.BEAK]: 0xf2c230, [S.WHITE]: 0xd8eef8 }),
      pal.alloc({ [S.BODY]: 0xf2f2ee, [S.BODY_D]: 0xc8c8c4, [S.BODY_L]: 0xffffff, [S.EYE]: 0x1e1e22, [S.ACCENT]: 0xf2f2ee, [S.BEAK]: 0xf2a030, [S.WHITE]: 0xd8eef8 })];
    this.ratRow = pal.alloc({ [S.BODY]: 0x4a4440, [S.BODY_D]: 0x2a2624, [S.BODY_L]: 0xc89a9a, [S.EYE]: 0x1e1e22 });
    this.gooseRow = pal.alloc({ [S.BODY]: 0x8a7a6a, [S.BODY_D]: 0x2a2624, [S.BODY_L]: 0xd8d0c4, [S.EYE]: 0x1e1e22, [S.BEAK]: 0x2a2624, [S.ACCENT]: 0x1e1e22 });
    this.dogs = [];
    this.pigeons = [];
    this.flocks = [];
    this.squirrels = [];
    this.cats = [];
    this.ducks = [];
    this.rats = [];
    this.geese = null;
    this.gooseTimer = 30;
    this.planes = [];
    this.planeTimer = 8;
    this.planeRows = { body: city.pal.alloc({ [S.BODY]: 0xd8dce2, [S.BODY_D]: 0x8a9098, [S.BODY_L]: 0xf2f4f8, [S.EYE]: 0x2a2a30, [S.BEAK]: 0xd8dce2, [S.ACCENT]: 0x2a5fb8 }),
      red: city.pal.alloc({ [S.C1]: [0xff3030, 128] }), white: city.pal.alloc({ [S.C1]: [0xffffff, 128] }), green: city.pal.alloc({ [S.C1]: [0x30ff60, 128] }) };
    this.planeFrame = city.atlas.add('plane', 26, 10, (sp) => {
      // airliner in side view: fuselage, swept wing, tail fin, cabin windows
      for (let x = 3; x < 23; x++) { sp.set(x, 4, S.BODY, x < 7 ? 150 : 136); sp.set(x, 5, S.BODY, 122); sp.set(x, 6, S.BODY_D, 100); }
      sp.set(23, 5, S.BODY_L, 150); sp.set(23, 4, S.BODY_L, 140); sp.set(24, 5, S.BODY_L, 128); sp.set(23, 6, S.BODY_D, 110);
      for (let k = 0; k < 4; k++) { sp.set(3 + k, 3 - k, S.ACCENT, 136); sp.set(4 + k, 3 - k, S.ACCENT, 116); }
      sp.set(2, 4, S.ACCENT, 120); sp.set(2, 3, S.ACCENT, 128);
      for (let k = 0; k < 5; k++) { sp.set(11 + k, 7 + (k >> 1), S.BODY_D, 110); sp.set(12 + k, 7 + (k >> 1), S.BODY_D, 96); }
      sp.set(13, 9, S.BODY_D, 90); sp.set(14, 9, S.BODY_D, 90);
      for (let x = 8; x < 22; x += 2) sp.set(x, 4, S.EYE, 128);
      sp.set(21, 4, S.EYE, 140); sp.set(22, 4, S.EYE, 140);
      for (let x = 5; x < 22; x++) sp.set(x, 5, S.ACCENT, 96);
    });
    this.initPigeons();
    this.initOthers();
  }
  // ---- pigeons ---------------------------------------------------------------
  initPigeons() {
    const W = this.city.world, r = this.rng;
    const spots = [];
    // flock home spots: park plaza, sidewalks near benches, carts, plazas
    if (W.parkCenter) { const [fx, fy] = W.parkCenter.flock || [W.parkCenter.x + 2.4, W.parkCenter.y + 1.0]; spots.push({ x: fx, y: fy, r: 0.9 }); }
    for (const c of W.carts) spots.push({ x: c.x + 0.8, y: c.y + 0.6, r: 1.0 });
    for (const b of W.benches.filter((_, i) => i % 3 === 0).slice(0, 6)) spots.push({ x: b.x + 0.6, y: b.y + 0.6, r: 1.0 });
    for (const s of W.subways) spots.push({ x: s.x + 0.6, y: s.y, r: 0.9 });
    for (const sp of spots.slice(0, 12)) {
      const flock = { home: sp, members: [], state: 'ground', timer: r.range(10, 40), cx: sp.x, cy: sp.y, wheelA: 0, coop: null };
      const n = r.int(5, 11);
      for (let k = 0; k < n; k++) {
        const pg = { flock, x: sp.x + r.range(-sp.r, sp.r), y: sp.y + r.range(-sp.r, sp.r), z: CURB, vx: 0, vy: 0, vz: 0, state: 'ground', t: r.range(0, 3), tx: 0, ty: 0, tz: 0, flip: r.chance(0.5), row: r.pick(this.pigeonRows), anim: 'walk', f: 0 };
        flock.members.push(pg);
        this.pigeons.push(pg);
      }
      this.flocks.push(flock);
    }
    // rooftop coop flock
    for (const c of W.pigeonCoops.slice(0, 2)) {
      const flock = { home: { x: c.x, y: c.y, r: 0.8, z: c.z }, members: [], state: 'perch', timer: r.range(20, 60), cx: c.x, cy: c.y, coop: c, wheelA: 0 };
      for (let k = 0; k < 14; k++) {
        const pg = { flock, x: c.x + r.range(-0.8, 0.8), y: c.y + r.range(-0.8, 0.8), z: c.z, vx: 0, vy: 0, vz: 0, state: 'perched', t: r.range(0, 3), row: r.pick(this.pigeonRows), anim: 'walk', f: 0 };
        flock.members.push(pg);
        this.pigeons.push(pg);
      }
      this.flocks.push(flock);
    }
  }
  takeOff(pg, target) {
    pg.state = 'fly';
    pg.tx = target.x; pg.ty = target.y; pg.tz = target.z;
    pg.ft = 0;
    pg.sx = pg.x; pg.sy = pg.y; pg.sz = pg.z;
    const d = dist(pg.x, pg.y, target.x, target.y), dz = target.z - pg.z;
    // a short hop is a quick, low flutter; longer flights take longer and rise a little more
    pg.dur = clamp(Math.hypot(d, dz) / 3.4, 0.35, 4.5);
    // height above the straight line: none to speak of when gliding down from a roof or a wheel
    pg.arc = clamp(0.08 + d * 0.11, 0.12, 1.3) * this.rng.range(0.8, 1.2) * (dz < -0.5 ? 0.2 : 1);
  }
  // a gunshot or a blast: every pigeon on the ground nearby takes to the air
  scare(x, y, r) {
    let n = 0;
    for (const pg of this.pigeons) {
      if (pg.state !== 'ground' || dist2(pg.x, pg.y, x, y) > r * r) continue;
      const perch = this.rng.chance(0.6) ? this.perchFor(pg) : null;
      const a = Math.atan2(pg.y - y, pg.x - x) + this.rng.range(-0.5, 0.5);
      this.takeOff(pg, perch || { x: pg.x + Math.cos(a) * this.rng.range(4, 8), y: pg.y + Math.sin(a) * this.rng.range(4, 8), z: CURB });
      if (n++ < 2) this.city.audio?.event('flutter', pg);
    }
  }
  perchFor(pg) {
    const W = this.city.world;
    let best = null, bd = 900;
    for (const p of W.perches) {
      const d = dist2(p.x, p.y, pg.x, pg.y) * this.rng.range(0.6, 1.4);
      if (d < bd && d > 4) { bd = d; best = p; }
    }
    return best ? { x: best.x + this.rng.range(-0.15, 0.15), y: best.y + this.rng.range(-0.15, 0.15), z: best.z } : null;
  }
  updatePigeons(dt) {
    const people = this.city.people?.list || [];
    const cars = this.city.traffic.cars;
    const P = this.city.people, V = this.city.vehicles && this.city.vehicles.grid.size ? this.city.vehicles : null;
    const audio = this.city.audio;
    const env = this.city.env;
    for (const fl of this.flocks) {
      fl.timer -= dt;
      // feeding attraction
      const feeder = people.find((p) => p.feeding && p.state === 'sit' && dist2(p.x, p.y, fl.home.x, fl.home.y) < 120);
      if (feeder) { fl.cx = feeder.x + 0.6; fl.cy = feeder.y + 0.6; } else { fl.cx = fl.home.x; fl.cy = fl.home.y; }
      if (fl.coop) {
        // coop flock periodically wheels over the rooftops
        if (fl.state === 'perch' && fl.timer <= 0) { fl.state = 'wheel'; fl.timer = this.rng.range(14, 24); fl.wheelA = 0; audio?.event('flutter', fl.home); }
        else if (fl.state === 'wheel' && fl.timer <= 0) { fl.state = 'land'; fl.timer = this.rng.range(30, 70); }
      } else if (fl.state === 'ground' && fl.timer <= 0 && env.darkness < 0.6) {
        if (this.rng.chance(0.35)) { fl.state = 'wheel'; fl.timer = this.rng.range(6, 12); fl.wheelA = this.rng.range(0, 6); audio?.event('flutter', fl.home); }
        else fl.timer = this.rng.range(15, 40);
      } else if (fl.state === 'wheel' && fl.timer <= 0) { fl.state = 'land'; fl.timer = this.rng.range(25, 60); }
      if (fl.state === 'wheel') fl.wheelA += dt * 0.9;
    }
    for (const pg of this.pigeons) {
      pg.t += dt;
      const fl = pg.flock;
      if (fl.state === 'wheel' && pg.state !== 'wheel') { pg.state = 'wheel'; pg.ph = this.rng.range(0, 6.28); pg.rr = this.rng.range(2.5, 5); }
      if (pg.state === 'wheel') {
        const hz = (fl.home.z || CURB) + 7 + Math.sin(fl.wheelA * 0.7 + pg.ph) * 1.5;
        const a = fl.wheelA + pg.ph * 0.15;
        const tx = fl.home.x + Math.cos(a) * pg.rr, ty = fl.home.y + Math.sin(a) * pg.rr * 0.8;
        pg.vx = (tx - pg.x) * 2; pg.vy = (ty - pg.y) * 2;
        pg.x += pg.vx * dt; pg.y += pg.vy * dt; pg.z += (hz - pg.z) * Math.min(1, dt * 1.5);
        pg.anim = 'fly'; pg.f = Math.floor(pg.t * 10) % 2;
        if (fl.state === 'land') {
          const tgt = fl.coop ? { x: fl.home.x + this.rng.range(-0.8, 0.8), y: fl.home.y + this.rng.range(-0.8, 0.8), z: fl.home.z } : { x: fl.cx + this.rng.range(-fl.home.r, fl.home.r), y: fl.cy + this.rng.range(-fl.home.r, fl.home.r), z: CURB };
          this.takeOff(pg, tgt);
        }
        continue;
      }
      if (pg.state === 'fly') {
        pg.ft += dt;
        const t = clamp(pg.ft / pg.dur, 0, 1);
        // quick launch, gentle landing
        const e = 0.35 * t + 0.65 * t * t * (3 - 2 * t);
        const px = pg.x;
        pg.x = pg.sx + (pg.tx - pg.sx) * e;
        pg.y = pg.sy + (pg.ty - pg.sy) * e;
        // climbing to a perch: rise early then glide in; dropping to the ground: glide down
        const dz = pg.tz - pg.sz;
        const g = dz > 0.5 ? 1 - (1 - t) * (1 - t) * (1 - t) : dz < -0.5 ? t * t * (3 - 2 * t) : e;
        pg.z = pg.sz + dz * g + Math.sin(t * Math.PI) * pg.arc;
        pg.vx = pg.x - px;
        pg.anim = 'fly'; pg.f = Math.floor(pg.t * 12) % 2;
        if (t >= 1) { pg.state = pg.tz > CURB + 0.5 ? 'perched' : 'ground'; pg.z = pg.tz; pg.perchT = this.rng.range(6, 25); }
        continue;
      }
      if (pg.state === 'perched') {
        pg.anim = 'walk'; pg.f = 0;
        pg.perchT = (pg.perchT ?? 10) - dt;
        if (fl.coop) continue;
        if (pg.perchT <= 0) this.takeOff(pg, { x: fl.cx + this.rng.range(-fl.home.r, fl.home.r), y: fl.cy + this.rng.range(-fl.home.r, fl.home.r), z: CURB });
        continue;
      }
      // ground behaviour: walk & peck around flock centre
      pg.moveT = (pg.moveT ?? 0) - dt;
      if (pg.moveT <= 0) {
        pg.moveT = this.rng.range(0.6, 2.5);
        if (this.rng.chance(0.55)) {
          pg.gx = fl.cx + this.rng.range(-fl.home.r, fl.home.r);
          pg.gy = fl.cy + this.rng.range(-fl.home.r, fl.home.r);
          pg.mode = 'walk';
        } else pg.mode = 'peck';
      }
      if (pg.mode === 'walk' && pg.gx != null) {
        const d = dist(pg.x, pg.y, pg.gx, pg.gy);
        if (d > 0.05) {
          const s = Math.min(d, 0.45 * dt);
          pg.vx = ((pg.gx - pg.x) / d) * s;
          pg.x += pg.vx; pg.y += ((pg.gy - pg.y) / d) * s;
          pg.anim = 'walk'; pg.f = Math.floor(pg.t * 6) % 2;
        } else { pg.mode = 'peck'; }
      }
      if (pg.mode === 'peck') { pg.anim = 'peck'; pg.f = Math.floor(pg.t * 4 + pg.x) % 2; }
      // scare
      let scared = false;
      for (const p of P ? P.near(pg.x, pg.y, 0.9) : people) if (p.state === 'walk' && dist2(p.x, p.y, pg.x, pg.y) < 0.8) { scared = true; break; }
      if (!scared) for (const c of V ? V.carsNear(pg.x, pg.y) : cars) if (Math.abs(c.v) > 1 && dist2(c.x, c.y, pg.x, pg.y) < 2.2) { scared = true; break; }
      if (scared) {
        audio?.event('flutter', pg);
        const perch = this.rng.chance(0.4) ? this.perchFor(pg) : null;
        this.takeOff(pg, perch || { x: fl.cx + this.rng.range(-fl.home.r * 1.5, fl.home.r * 1.5), y: fl.cy + this.rng.range(-fl.home.r * 1.5, fl.home.r * 1.5), z: CURB });
      } else if (this.rng.chance(dt * 0.02)) audio?.event('coo', pg);
    }
  }
  // ---- dogs -----------------------------------------------------------------------
  spawnDog(owner) {
    const r = this.rng;
    const breed = r.pick(Object.keys(DOG_BREEDS));
    const colors = [0x8a5a2a, 0x1e1e22, 0xf2efe6, 0xc8a060, 0x5a4a3a, 0xd8c8a8, 0x9a9a9a, 0xb06a2a];
    const c = r.pick(colors);
    const dog = {
      owner, breed, x: owner.x, y: owner.y, z: CURB, row: this.city.pal.alloc({ [S.BODY]: c, [S.BODY_D]: shadeHex(c, 0.72), [S.BODY_L]: shadeHex(c, 1.25), [S.EYE]: 0x1e1e22, [S.NOSE]: 0x1e1e22, [S.COLLAR]: r.pick([0xd8302c, 0x2a5fb8, 0xf2c230, 0x2f8a46]) }),
      mode: 'follow', t: r.range(0, 5), dist: 0, anim: 'walk', flip: false, sniffing: false, sniffT: 0, nextSniff: r.range(4, 12), gone: false, name: owner.dogName,
    };
    owner.dog = dog;
    this.dogs.push(dog);
    return dog;
  }
  followOwner(dog, p, dt) {
    if (dog.mode === 'play') return;
    dog.t += dt;
    // target: beside & slightly ahead of the owner
    const ang = Math.atan2(p.dy, p.dx);
    const tx = p.x + Math.cos(ang) * 0.55 - Math.sin(ang) * 0.3, ty = p.y + Math.sin(ang) * 0.55 + Math.cos(ang) * 0.3;
    if (dog.sniffing) {
      dog.sniffT -= dt;
      dog.anim = 'sniff';
      if (dog.sniffT <= 0) { dog.sniffing = false; dog.nextSniff = this.rng.range(5, 14); }
      return;
    }
    if (p.state === 'walk') {
      dog.nextSniff -= dt;
      if (dog.nextSniff <= 0) { dog.sniffing = true; dog.sniffT = this.rng.range(1.2, 2.5); if (this.rng.chance(0.25)) this.city.audio?.event('bark', dog); return; }
    }
    const d = dist(dog.x, dog.y, tx, ty);
    if (d > 0.05) {
      const s = Math.min(d, Math.max(p.speed * 1.1, d * 3) * dt);
      dog.dx = tx - dog.x; dog.dy = ty - dog.y;
      dog.x += ((tx - dog.x) / d) * s; dog.y += ((ty - dog.y) / d) * s;
      dog.dist += s;
      dog.anim = s / dt > 1.5 ? 'run' : 'walk';
    } else dog.anim = p.state === 'sit' || p.state === 'idle' ? 'sit' : dog.anim === 'sit' ? 'sit' : 'walk';
    if (p.state !== 'walk' && d < 0.1) dog.anim = 'sit';
    dog.z = p.z;
  }
  updateDogs(dt) {
    for (let i = this.dogs.length - 1; i >= 0; i--) {
      const d = this.dogs[i];
      if (d.gone || d.owner.dead) { this.city.pal.release(d.row); this.dogs.splice(i, 1); continue; }
      if (d.mode === 'play' && d.area) {
        const a = d.area;
        d.t += dt;
        d.pt = (d.pt ?? 0) - dt;
        if (d.pt <= 0 || d.px == null) { d.pt = this.rng.range(0.8, 2.5); d.px = this.rng.range(a.x0 + 0.4, a.x1 - 0.4); d.py = this.rng.range(a.y0 + 0.4, a.y1 - 0.4); if (this.rng.chance(0.1)) this.city.audio?.event('bark', d); }
        const dd = dist(d.x, d.y, d.px, d.py);
        if (dd > 0.08) { const s = Math.min(dd, 2.6 * dt); d.dx = d.px - d.x; d.dy = d.py - d.y; d.x += ((d.px - d.x) / dd) * s; d.y += ((d.py - d.y) / dd) * s; d.dist += s; d.anim = 'run'; }
        else d.anim = 'sit';
        d.z = CURB;
      }
    }
  }
  // ---- others ---------------------------------------------------------------------
  initOthers() {
    const W = this.city.world, r = this.rng;
    if (W.lawns) for (let k = 0; k < 7; k++) {
      const l = r.pick(W.lawns);
      this.squirrels.push({ x: r.range(l.x0, l.x1), y: r.range(l.y0, l.y1), z: CURB, area: l, t: r.range(0, 5), state: 'stand', tx: 0, ty: 0, flip: false });
    }
    // cats: bodega cats & stoop cats
    const shops = W.shops.filter((s) => s.kind === 'bodega');
    for (const s of shops.slice(0, 4)) this.cats.push({ x: s.x - s.n[0] * 0.6, y: s.y - s.n[1] * 0.6, z: CURB, row: r.pick(this.catRows), state: 'sit', t: r.range(0, 5), home: s });
    for (const s of W.stoopSeats.filter((_, i) => i % 9 === 4).slice(0, 4)) this.cats.push({ x: s.x, y: s.y, z: s.z, row: r.pick(this.catRows), state: 'sit', t: r.range(0, 5), stoop: true });
    if (W.pond) for (let k = 0; k < 5; k++) this.ducks.push({ a: r.range(0, 6.28), rad: r.range(0.2, 0.8), v: r.range(0.08, 0.2) * (r.chance(0.5) ? 1 : -1), row: r.pick(this.duckRows), t: r.range(0, 4) });
    for (const t of W.trash.slice(0, 10)) this.rats.push({ x: t.x, y: t.y, z: CURB, home: t, t: r.range(0, 10), state: 'hide', tx: t.x, ty: t.y });
  }
  updateOthers(dt) {
    const env = this.city.env;
    const people = this.city.people?.list || [];
    for (const s of this.squirrels) {
      s.t += dt;
      if (env.season === 3 && env.snowCover > 0.5) continue;
      const near = this.city.people ? this.city.people.near(s.x, s.y, 1.1).length > 0 : people.some((p) => dist2(p.x, p.y, s.x, s.y) < 1.2);
      if (s.state === 'stand') {
        if (near || this.rng.chance(dt * 0.4)) {
          s.state = 'run';
          const a = s.area;
          s.tx = clamp(s.x + this.rng.range(-3, 3), a.x0, a.x1); s.ty = clamp(s.y + this.rng.range(-3, 3), a.y0, a.y1);
        }
      } else {
        const d = dist(s.x, s.y, s.tx, s.ty);
        if (d < 0.05) s.state = 'stand';
        else { const k = Math.min(d, 2.4 * dt); s.dx = s.tx - s.x; s.dy = s.ty - s.y; s.x += ((s.tx - s.x) / d) * k; s.y += ((s.ty - s.y) / d) * k; }
      }
    }
    for (const d of this.ducks) { d.a += d.v * dt; d.t += dt; }
    // rats at night
    const night = env.hour > 22 || env.hour < 5;
    for (const rt of this.rats) {
      rt.t += dt;
      if (!night) { rt.state = 'hide'; continue; }
      if (rt.state === 'hide' && this.rng.chance(dt * 0.08)) { rt.state = 'run'; const a = this.rng.range(0, 6.28); rt.tx = rt.home.x + Math.cos(a) * 1.5; rt.ty = rt.home.y + Math.sin(a) * 1.5; }
      if (rt.state === 'run') {
        const d = dist(rt.x, rt.y, rt.tx, rt.ty);
        if (d < 0.05) { rt.state = this.rng.chance(0.5) ? 'hide' : 'run'; rt.x = rt.state === 'hide' ? rt.home.x : rt.x; rt.y = rt.state === 'hide' ? rt.home.y : rt.y; rt.tx = rt.home.x; rt.ty = rt.home.y; }
        else { const k = Math.min(d, 2.8 * dt); rt.dx = rt.tx - rt.x; rt.dy = rt.ty - rt.y; rt.x += ((rt.tx - rt.x) / d) * k; rt.y += ((rt.ty - rt.y) / d) * k; }
      }
    }
    // geese migration in autumn
    this.gooseTimer -= dt;
    if (!this.geese && env.season === 2 && this.gooseTimer <= 0 && env.darkness < 0.5) {
      this.gooseTimer = this.rng.range(60, 140);
      const y0 = this.rng.range(10, MAPY - 10);
      this.geese = { x: MAPX + 25, y: y0, z: 42, vx: -3.2, vy: this.rng.range(-0.5, 0.5), t: 0 };
      this.city.audio?.event('geese', this.geese);
    }
    if (this.geese) {
      const g = this.geese;
      g.t += dt; g.x += g.vx * dt; g.y += g.vy * dt;
      if (g.x < -30) this.geese = null;
    }
    // airliners crossing high above (blinking navigation lights)
    this.planeTimer -= dt;
    if (this.planeTimer <= 0 && this.planes.length < 2) {
      this.planeTimer = this.rng.range(25, 70);
      const fromW = this.rng.chance(0.5);
      this.planes.push({ x: fromW ? -40 : MAPX + 40, y: this.rng.range(0, MAPY), z: this.rng.range(70, 90), vx: fromW ? 7 : -7, vy: this.rng.range(-1.5, 1.5), t: 0 });
    }
    for (let i = this.planes.length - 1; i >= 0; i--) {
      const p = this.planes[i];
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < -60 || p.x > MAPX + 60) this.planes.splice(i, 1);
    }
  }
  update(dt) {
    this.updatePigeons(dt);
    this.updateDogs(dt);
    this.updateOthers(dt);
  }
  dirFlip(dx, dy) {
    const d = this.city.camera.screenDir(dx || 0, dy || 0);
    return d[0] < 0;
  }
  emit(L, view) {
    const env = this.city.env;
    for (const pg of this.pigeons) {
      if (!view.visible(pg.x, pg.y, pg.z, 1)) continue;
      const arr = this.f.pigeon[pg.anim] || this.f.pigeon.walk;
      if (Math.abs(pg.vx || 0) > 0.0005 || pg.state === 'fly') pg.flip = this.dirFlip(pg.vx || 0.01, pg.vy || 0);
      L.push(pg.x, pg.y, pg.z, arr[pg.f % arr.length], pg.row, pg.flip ? SF.FLIP : 0, 1, 0.002);
    }
    for (const d of this.dogs) {
      if (!view.visible(d.x, d.y, d.z, 1)) continue;
      const fr = this.dogFrames[d.breed];
      const arr = fr[d.anim] || fr.walk;
      if (d.anim === 'walk' || d.anim === 'run') d.flip = this.dirFlip(d.dx, d.dy);
      const fi = d.anim === 'walk' ? Math.floor(d.dist / 0.12) % arr.length : d.anim === 'run' ? Math.floor(d.dist / 0.15) % arr.length : Math.floor(d.t * 2) % arr.length;
      L.push(d.x, d.y, d.z, arr[fi], d.row, d.flip ? SF.FLIP : 0, d.owner.alpha ?? 1, 0.002);
    }
    for (const s of this.squirrels) {
      if (env.season === 3 && env.snowCover > 0.5) continue;
      if (!view.visible(s.x, s.y, s.z, 1)) continue;
      const arr = s.state === 'run' ? this.f.squirrel.run : this.f.squirrel.stand;
      if (s.state === 'run') s.flip = this.dirFlip(s.dx, s.dy);
      L.push(s.x, s.y, s.z, arr[Math.floor(s.t * 8) % arr.length], this.squirrelRow, s.flip ? SF.FLIP : 0);
    }
    for (const c of this.cats) {
      if (!view.visible(c.x, c.y, c.z, 1)) continue;
      L.push(c.x, c.y, c.z, this.f.cat.sit[Math.floor(c.t * 0.7) % 2], c.row, 0);
      c.t += 0.016;
    }
    const pond = this.city.world.pond;
    if (pond && env.season !== 3) for (const d of this.ducks) {
      const x = pond.x + Math.cos(d.a) * pond.rx * d.rad, y = pond.y + Math.sin(d.a) * pond.ry * d.rad;
      if (!view.visible(x, y, CURB, 1)) continue;
      const flip = this.dirFlip(-Math.sin(d.a) * d.v, Math.cos(d.a) * d.v);
      L.push(x, y, CURB - 0.05, this.f.duck.swim[Math.floor(d.t * 2) % 2], d.row, flip ? SF.FLIP : 0);
    }
    for (const rt of this.rats) {
      if (rt.state === 'hide' || !view.visible(rt.x, rt.y, CURB, 1)) continue;
      L.push(rt.x, rt.y, CURB, this.f.rat.run[Math.floor(rt.t * 10) % 2], this.ratRow, this.dirFlip(rt.dx, rt.dy) ? SF.FLIP : 0);
    }
    for (const p of this.planes) {
      const flip = this.dirFlip(p.vx, p.vy);
      if (env.darkness < 0.6) L.push(p.x, p.y, p.z, this.planeFrame, this.planeRows.body, (flip ? SF.FLIP : 0) | SF.NOSHADOW | SF.NOSHADE);
      const blink = Math.floor(p.t * 1.6) % 2 === 0;
      if (blink) L.push(p.x, p.y, p.z + 0.1, this.city.atlas.get('dot2'), this.planeRows.red, SF.EMISSIVE | SF.NOSHADOW, 1, 0);
      if (env.darkness > 0.4 && Math.floor(p.t * 1.6 + 0.5) % 2 === 0) L.push(p.x - p.vx * 0.12, p.y, p.z + 0.05, this.city.atlas.get('dot'), this.planeRows.white, SF.EMISSIVE | SF.NOSHADOW, 1, 0);
    }
    if (this.geese) {
      const g = this.geese;
      const offs = [[0, 0], [1.2, -0.9], [2.4, -1.8], [3.6, -2.7], [1.2, 0.9], [2.4, 1.8], [3.6, 2.7], [4.8, 3.6]];
      for (const [ox, oy] of offs) {
        const f = this.f.pigeon.fly[Math.floor(g.t * 5 + ox) % 2];
        L.push(g.x + ox, g.y + oy, g.z, f, this.gooseRow, this.dirFlip(g.vx, g.vy) ? SF.FLIP : 0, 1, 0);
      }
    }
  }
}

function shadeHex(c, f) {
  const r = clamp(Math.round(((c >> 16) & 255) * f), 0, 255), g = clamp(Math.round(((c >> 8) & 255) * f), 0, 255), b = clamp(Math.round((c & 255) * f), 0, 255);
  return (r << 16) | (g << 8) | b;
}
