// Pedestrians: roles, daily routines, path following, crossings, seating, rendering.

import { buildNav } from './nav.js';
import { personTemplate, personPose, S } from '../render/sprites.js';
import { SF } from '../render/spriteLayer.js';
import { RNG, clamp, dist, dist2 } from '../core/math.js';
import { CURB } from '../world/layout.js';

const SKIN = [0xf6d2b4, 0xeebc96, 0xd8a078, 0xb67852, 0x8a5636, 0x63402a, 0xf0c8a0];
const HAIR = [0x1c1814, 0x2e2018, 0x4a3020, 0x7a4e2a, 0xb8843c, 0xd8b060, 0xa8461e, 0x9a9a9a, 0xe8e8e4, 0x1c1814, 0x2e2018];
const CLOTH = [0xd8302c, 0x2a5fb8, 0x2f8a46, 0xf2c230, 0xe87a1a, 0x8a2a8a, 0x1e1e22, 0xf2f2ee, 0x8d9097, 0x5aa0d8, 0xe58fb5, 0x3a4a6a, 0x7a1f1f, 0x0f6f6a, 0xb8a078, 0x6a8a3a];
const DARKS = [0x1e1e22, 0x2a3346, 0x3a4a6a, 0x4a3a2a, 0x5a5a60, 0x2f3a2a, 0x23366e];
const NAMES = ['Maria', 'Jamal', 'Wei', 'Priya', 'Luis', 'Sofia', 'Ahmed', 'Rachel', 'Dmitri', 'Aisha', 'Kenji', 'Fatima', 'Tony', 'Grace', 'Malik', 'Elena',
  'Jae', 'Omar', 'Chloe', 'Diego', 'Nia', 'Sam', 'Yuki', 'Isaac', 'Rosa', 'Mo', 'Leah', 'Andre', 'Mei', 'Carlos', 'Bianca', 'Kwame', 'Olga', 'Raj',
  'Lucia', 'Tyrone', 'Hana', 'Frankie', 'Esther', 'Marco', 'Imani', 'Vic', 'Ana', 'Benny', 'Zoe', 'Hector', 'Ming', 'Destiny', 'Sal', 'Ivy'];
const DOG_NAMES = ['Biscuit', 'Lola', 'Rocco', 'Pretzel', 'Bella', 'Mookie', 'Daisy', 'Frank', 'Peanut', 'Luna', 'Bodega', 'Pickles'];

// people out and about by hour (the 6x6 city: roughly twice the 4x4 one's crowds)
const POP = [[0, 90], [2, 46], [5, 60], [7, 300], [9, 420], [12, 440], [15, 470], [17, 540], [19, 470], [21, 330], [23, 165], [24, 90]];

function popTarget(h) {
  for (let i = 1; i < POP.length; i++) if (h <= POP[i][0]) {
    const a = POP[i - 1], b = POP[i];
    return a[1] + ((b[1] - a[1]) * (h - a[0])) / (b[0] - a[0]);
  }
  return 46;
}

export class People {
  constructor(city) {
    this.city = city;
    this.world = city.world;
    this.rng = new RNG(4242);
    this.nav = buildNav(city.world);
    this.list = [];
    this.cross = new Map();
    this.nextId = 1;
    this.grid = new Map();
    this.umbrellaFrame = city.atlas.get('umbrella');
    this.strollerFrame = city.atlas.get('stroller');
    this.bikeFrame = city.atlas.get('bike');
    this.activities = null;
    this.spawnAcc = 0;
  }
  // ---- helpers -----------------------------------------------------------------
  crossKey(c) { return `${c.i},${c.j},${c.side}`; }
  crosswalkBusy(i, j, side) { return (this.cross.get(`${i},${j},${side}`) || 0) > 0; }
  // anyone on this crosswalk within r of (x, y)?
  crossersNear(i, j, side, x, y, r) {
    if (!this.crosswalkBusy(i, j, side)) return false;
    for (const p of this.list) {
      const c = p.crossing;
      if (c && c.i === i && c.j === j && c.side === side && dist2(p.x, p.y, x, y) < r * r) return true;
    }
    return false;
  }
  walkState(c) {
    const tr = this.city.traffic;
    if (tr.holdingPeds(this.crossKey(c))) return 'dont'; // let the waiting car turn first
    const st = tr.signalState(c.i, c.j);
    return c.axis === 'x' ? st.walkEW : st.walkNS;
  }
  env() { return this.city.env; }
  // ---- creation ------------------------------------------------------------------
  outfit(role, kid, elder) {
    const env = this.env(), r = this.rng;
    const s = env.season;
    const t = env.temperature();
    const tpl = { body: kid ? 'kid' : elder ? 'elder' : 'adult', hair: r.pick(['short', 'short', 'long', 'pony', 'bun', 'afro', 'bald', 'spiky', 'long']) };
    if (elder && r.chance(0.3)) tpl.hair = 'bald';
    if (kid && tpl.hair === 'bald') tpl.hair = 'short';
    const cold = t < 45, cool = t < 62, hot = t > 78;
    if (role === 'jogger') { tpl.top = 'tank'; tpl.bottom = 'shorts'; if (cool) { tpl.top = 'long'; tpl.bottom = 'pants'; tpl.hat = 'beanie'; } }
    else if (role === 'player') { tpl.top = 'jersey'; tpl.bottom = 'shorts'; }
    else if (role === 'worker') { tpl.top = r.chance(0.6) ? 'suit' : 'long'; tpl.bottom = r.chance(0.25) ? 'skirt' : 'pants'; tpl.bag = r.chance(0.6) ? 'brief' : 'shoulder'; tpl.glasses = r.chance(0.3); }
    else {
      tpl.top = hot ? r.pick(['tee', 'tee', 'tank', 'stripe']) : r.pick(['tee', 'long', 'stripe', 'long']);
      tpl.bottom = hot ? r.pick(['shorts', 'shorts', 'skirt', 'dress', 'pants']) : r.pick(['pants', 'pants', 'skirt', 'pants']);
      if (kid && tpl.bottom === 'dress' && r.chance(0.5)) tpl.bottom = 'shorts';
    }
    if (cold) { tpl.coat = r.pick(['long', 'puffer', 'puffer']); tpl.scarf = r.chance(0.6); tpl.hat = r.chance(0.65) ? 'beanie' : tpl.hat; if (tpl.bottom === 'shorts') tpl.bottom = 'pants'; }
    else if (cool) { tpl.coat = r.chance(0.6) ? 'jacket' : null; if (r.chance(0.2)) tpl.hat = 'hood'; if (tpl.bottom === 'shorts') tpl.bottom = 'pants'; }
    if (!tpl.hat && r.chance(hot ? 0.3 : 0.12)) tpl.hat = r.pick(['cap', 'cap', 'fedora']);
    if (role === 'tourist') { tpl.bag = 'back'; tpl.hat = tpl.hat || (hot ? 'cap' : null); }
    if (kid && !cold && r.chance(0.4)) tpl.bag = 'back';
    if (elder) tpl.cane = r.chance(0.4);
    if (role === 'vendor') { tpl.top = 'tee'; tpl.hat = 'cap'; tpl.coat = cold ? 'puffer' : null; }
    if (role === 'trick') { tpl.hat = r.pick(['witch', 'witch', 'helmet']); tpl.coat = 'long'; }
    if (role === 'shopper') tpl.bag = 'shopping';
    // normalise for cache efficiency
    for (const k of Object.keys(tpl)) if (tpl[k] == null || tpl[k] === false) delete tpl[k];
    return tpl;
  }
  palette(tpl) {
    const r = this.rng;
    const skin = r.pick(SKIN);
    const hair = tpl.body === 'elder' ? r.pick([0x9a9a9a, 0xc8c8c4, 0xe8e8e4, 0x6a6a6a]) : r.pick(HAIR.slice(0, 7));
    const P = {
      [S.SKIN]: skin, [S.HAIR]: hair, [S.TOP]: r.pick(CLOTH), [S.TOP2]: r.pick(CLOTH), [S.BOTTOM]: tpl.bottom === 'pants' ? r.pick(DARKS.concat([0x3a5a8a, 0x3a5a8a, 0xb8a078])) : r.pick(CLOTH),
      [S.SHOES]: r.pick([0x1e1e22, 0xf2f2ee, 0x5a3a2a, 0xd8302c, 0x2a5fb8]), [S.COAT]: r.pick([0x1e1e22, 0x7a1f1f, 0x2a3346, 0xb8a078, 0x2f6a3a, 0xd8302c, 0x8a2a8a, 0xf2c230, 0x5aa0d8]),
      [S.HAT]: r.pick(CLOTH), [S.SCARF]: r.pick([0xd8302c, 0xf2c230, 0x2a5fb8, 0xe58fb5, 0x2f8a46]), [S.BAG]: r.pick([0x5a3a2a, 0x1e1e22, 0xd8302c, 0xb8a078, 0x2a5fb8]),
      [S.DARK]: 0x1a1414, [S.WHITE]: 0xf2f2ee, [S.ITEM]: r.pick([0x1e1e22, 0xd8302c, 0x2a5fb8, 0xf2c230, 0x2f8a46, 0xe58fb5, 0x7a4fff]), [S.ITEM2]: r.pick(CLOTH), [S.SOCK]: 0xf2f2ee,
    };
    if (tpl.top === 'suit') { P[S.TOP] = r.pick([0x1e1e22, 0x2a3346, 0x4a4a52, 0x3a2a22]); P[S.TOP2] = r.pick([0xd8302c, 0x2a5fb8, 0x7a1f1f]); P[S.BOTTOM] = P[S.TOP]; }
    if (tpl.hat === 'witch') P[S.HAT] = 0x1e1e22;
    if (tpl.hat === 'helmet') P[S.HAT] = 0xd8302c;
    return this.city.pal.alloc(P);
  }
  create(role, opts = {}) {
    const r = this.rng;
    const kid = role === 'kid' || role === 'player' || role === 'trick' || opts.kid;
    const elder = role === 'elder';
    const tpl = this.outfit(role, kid, elder);
    const frames = personTemplate(this.city.atlas, tpl);
    const p = {
      id: this.nextId++, role, kid, elder, tpl, frames, pal: this.palette(tpl), name: r.pick(NAMES),
      age: kid ? r.int(8, 15) : elder ? r.int(68, 88) : r.int(19, 62),
      x: 0, y: 0, z: CURB, node: null, path: null, pi: 0, state: 'idle', timer: 0, plan: [], step: null,
      speed: (kid ? r.range(1.0, 1.25) : elder ? r.range(0.5, 0.65) : r.range(0.82, 1.08)) * (role === 'jogger' ? 2.1 : 1),
      lane: r.range(0.12, 0.42), anim: 'idle', animT: r.next() * 4, front: true, flip: false, dx: 0, dy: 1,
      alpha: 1, fade: 0, dist: 0, thought: '', umbrella: false, crossing: null,
    };
    p.run = role === 'jogger';
    const env = this.env();
    p.umbrella = env.raining && !kid && r.chance(0.8);
    return p;
  }
  release(p) {
    this.city.pal.release(p.pal);
    if (p.crossing) this.endCross(p);
    if (p.dog) p.dog.gone = true;
    if (p.onRelease) p.onRelease(p);
  }
  // ---- planning ---------------------------------------------------------------
  poi() { return this.nav.poi; }
  // a random pick from list (nodes, or {node} entries) within r of (x, y); the nearest if none is
  // that close. On the big map this keeps trips (and path searches) local.
  pickNear(list, x, y, r = 50) {
    if (!list || !list.length) return null;
    const at = (n) => n.node || n.door || n;
    const near = [];
    for (const n of list) { const q = at(n); if ((q.x - x) ** 2 + (q.y - y) ** 2 < r * r) near.push(n); }
    if (near.length) return this.rng.pick(near);
    let best = list[0], bd = Infinity;
    for (const n of list) { const q = at(n); const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  }
  pickHome(x, y, r = 50) {
    if (x == null) { const f = this.city.focus(); x = f.x; y = f.y; }
    return this.pickNear(this.poi().homes, x, y, r);
  }
  // is the park (or court) close enough to walk to from here?
  parkNear(x, y) { const pc = this.city.world.parkCenter; return pc && dist2(pc.x, pc.y, x, y) < 75 * 75; }
  courtNear(x, y) { const c = this.poi().court.gate; return c && dist2(c.x, c.y, x, y) < 75 * 75; }
  nearestOf(list, x, y) {
    let b = null, bd = Infinity;
    for (const n of list) { const d = dist2(n.x, n.y, x, y); if (d < bd) { bd = d; b = n; } }
    return b;
  }
  plan(p, kind) {
    const P = this.poi(), r = this.rng, env = this.env();
    const shop = () => this.pickNear(P.shops, p.x, p.y, 45);
    const subway = () => this.pickNear(P.subways, p.x, p.y, 55);
    const office = () => this.pickNear(P.offices, p.x, p.y, 55);
    const home = p.home || this.pickHome(p.x, p.y);
    p.home = home;
    const go = (node, thought) => ({ t: 'go', node, thought });
    // the park is a long way off on the big map: walk round the neighbourhood instead
    if ((kind === 'park' || kind === 'dogwalk' || kind === 'jog' || kind === 'skate') && !this.parkNear(p.x, p.y)) {
      const a = shop(), b = shop();
      p.run = kind === 'jog';
      return [go(a.sw || a, kind === 'dogwalk' ? `Walking ${p.dogName}` : kind === 'jog' ? 'Morning run' : 'Stretching my legs'), go(b.sw || b, 'Nice day for it'), go(home, 'Home'), { t: 'enter' }];
    }
    switch (kind) {
      case 'commute': return [go(subway(), 'Running for the train'), { t: 'enter' }];
      case 'toWork': return [go(office(), 'Late for a meeting'), { t: 'enter' }];
      case 'goHome': return [go(home, 'Heading home'), { t: 'enter' }];
      case 'errand': {
        const s = shop();
        return [go(s, `Picking something up at the ${s.data?.name?.toLowerCase() || 'shop'}`), { t: 'shop', node: s, dur: r.range(6, 14) }, go(home, 'Back home'), { t: 'enter' }];
      }
      case 'coffee': {
        const s = P.shops.find((n) => n.data?.kind === 'coffee' || n.data?.kind === 'bagels' || n.data?.kind === 'bodega') || shop();
        return [go(s, 'Need coffee. Now.'), { t: 'shop', node: s, dur: r.range(5, 9) }, go(subway(), 'Off to work'), { t: 'enter' }];
      }
      case 'lunch': {
        const c = this.pickNear(P.carts, p.x, p.y, 50);
        const steps = [];
        if (c) steps.push(go(c.node, `Lunch from the ${c.cart.kind} cart`), { t: 'idle', dur: r.range(4, 8), face: c.cart, thought: 'Chicken over rice, extra white sauce' });
        const b = this.freeBench(false, p.x, p.y);
        if (b) steps.push(go(b.node, 'Finding a bench'), { t: 'sit', bench: b, dur: r.range(18, 40), thought: 'Lunch in the sun' });
        steps.push(go(office(), 'Back to the grind'), { t: 'enter' });
        return steps;
      }
      case 'park': {
        const steps = [go(r.pick(P.park.paths || [home]), 'Walk in the park')];
        const b = this.freeBench(true, p.x, p.y);
        if (b && r.chance(0.65)) steps.push(go(b.node, 'Resting my feet'), { t: 'sit', bench: b, dur: r.range(20, 60), thought: p.elder ? 'Feeding the pigeons' : 'People watching', feed: p.elder });
        else if (env.season === 1 && P.park.lawnNodes?.length && env.hour > 10 && env.hour < 18 && !env.raining) steps.push(go(r.pick(P.park.lawnNodes), 'Sunbathing'), { t: 'activity', kind: 'lawn', dur: r.range(30, 70) });
        else steps.push(go(r.pick(P.park.paths), 'Strolling'), go(r.pick(P.park.paths), 'Strolling'));
        steps.push(go(r.chance(0.5) ? home : subway(), 'Time to go'), { t: 'enter' });
        return steps;
      }
      case 'dogwalk': {
        const steps = [go(r.pick(P.park.perimeter || [home]), `Walking ${p.dogName}`)];
        if (P.park.dogGate && r.chance(0.6)) steps.push(go(P.park.dogGate, `Dog run time for ${p.dogName}`), { t: 'activity', kind: 'dogrun', dur: r.range(25, 50) });
        else steps.push(go(r.pick(P.park.perimeter), `${p.dogName} wants to sniff everything`));
        steps.push(go(home, 'Home'), { t: 'enter' });
        return steps;
      }
      case 'jog': {
        const per = P.park.perimeter || [];
        const steps = [go(per[0], 'Morning run')];
        for (let lap = 0; lap < 2; lap++) for (const n of per) steps.push(go(n, 'Keep the pace'));
        steps.push(go(home, 'Cool down'), { t: 'enter' });
        return steps;
      }
      case 'tourist': {
        const steps = [];
        const tsq = (P.squares && P.squares.tsq) || [];
        const spots = [...(P.landmarks || []), ...(P.park.ring || []), ...tsq, ...tsq, ...P.offices];
        for (let k = 0; k < 3; k++) {
          const sp = this.pickNear(spots, p.x, p.y, 60);
          steps.push(go(sp.sw || sp, 'Is that the famous one?'), { t: 'idle', dur: r.range(3, 6), anim: 'phone', thought: 'Taking a photo' });
          // in Times Square: a sit on the red steps to take in the lights
          if (tsq.includes(sp) && r.chance(0.55)) {
            const free = P.benches.filter((e) => e.bench.steps && e.bench.used.some((u) => !u));
            const e = free.length ? r.pick(free) : null;
            if (e) steps.push(go(e.node, 'Up the red steps'), { t: 'sit', bench: e, dur: r.range(25, 75), thought: r.pick(['So many screens!', 'Best seat in the city', 'People watching']) });
          }
        }
        steps.push(go(subway(), 'Next stop: Times Square?'), { t: 'enter' });
        return steps;
      }
      case 'kidplay': return this.kidPlan(p);
      case 'stoop': {
        const s = this.freeStoop(p.x, p.y);
        if (!s) return [go(home, 'Home'), { t: 'enter' }];
        return [go(s.door.sw || s.door, 'Hanging out on the stoop'), { t: 'stoop', seat: s, dur: r.range(40, 90) }, { t: 'enter' }];
      }
      case 'bus': {
        const b = this.pickNear(P.busStops, p.x, p.y, 50);
        if (!b || dist2(b.node.x, b.node.y, p.x, p.y) > 60 * 60) return [go(subway()), { t: 'enter' }];
        return [go(b.node, 'Waiting for the bus'), { t: 'bus', stop: b.stop, dur: 120 }];
      }
      case 'night': return [go(r.chance(0.5) ? subway() : home, r.pick(['Long shift', 'One more slice', 'The city never sleeps'])), { t: 'enter' }];
      case 'trick': {
        const steps = [];
        for (let k = 0; k < 4; k++) {
          const s = this.pickNear(P.stoops, p.x, p.y, 40);
          if (s) steps.push(go(s.door.sw || s.door, 'Trick or treat!'), { t: 'idle', dur: 3, anim: 'wave', thought: 'Trick or treat!' });
        }
        steps.push(go(home, 'Counting candy'), { t: 'enter' });
        return steps;
      }
      case 'skate': return [go(P.park.pond || home, 'Ice skating!'), { t: 'activity', kind: 'skate', dur: r.range(40, 90) }, go(home, 'Hot chocolate time'), { t: 'enter' }];
      case 'wander':
      default:
        return [go(shop().sw || home, 'Just walking'), go(home, 'Home'), { t: 'enter' }];
    }
  }
  kidPlan(p) {
    const env = this.env(), r = this.rng, P = this.poi();
    const steps = [];
    const s = env.season;
    const A = this.activities;
    if (!this.courtNear(p.x, p.y) && !this.parkNear(p.x, p.y)) {
      const st = this.freeStoop(p.x, p.y);
      if (st) return [{ t: 'go', node: st.door.sw || st.door, thought: 'Hanging out' }, { t: 'stoop', seat: st, dur: r.range(30, 70) }, { t: 'enter' }];
      const sh = this.pickNear(P.shops, p.x, p.y, 40);
      return [{ t: 'go', node: sh.sw || sh, thought: 'Candy run!' }, { t: 'go', node: p.home || this.pickHome(p.x, p.y), thought: 'Mom said be home by dark' }, { t: 'enter' }];
    }
    if (s === 1 && A && env.hour > 12 && env.hour < 19.5 && A.hydrantOpen && r.chance(0.45)) {
      steps.push({ t: 'go', node: A.hydrantOpen.node, thought: 'Hydrant is open!!' }, { t: 'activity', kind: 'hydrant', dur: r.range(30, 60) });
    } else if (s === 3 && env.snowCover > 0.3) {
      if (r.chance(0.7)) steps.push({ t: 'go', node: r.pick(P.park.lawnNodes || [P.court.gate]), thought: 'SNOWBALL FIGHT' }, { t: 'activity', kind: 'snowball', dur: r.range(40, 80) });
      else steps.push({ t: 'go', node: P.park.pond, thought: 'Skating' }, { t: 'activity', kind: 'skate', dur: r.range(30, 60) });
    } else if (!env.raining && (s === 1 || s === 0 || s === 2) && r.chance(0.65) && P.court.gate) {
      steps.push({ t: 'go', node: P.court.gate, thought: 'Next game, I got winners' }, { t: 'activity', kind: 'basketball', dur: r.range(50, 110) });
    } else if (P.court.playground) {
      steps.push({ t: 'go', node: P.court.playground, thought: 'Swings!' }, { t: 'activity', kind: 'playground', dur: r.range(30, 60) });
    }
    steps.push({ t: 'go', node: p.home || this.pickHome(), thought: 'Mom said be home by dark' }, { t: 'enter' });
    return steps;
  }
  freeBench(parkOnly = false, x, y) {
    if (x == null) { const f = this.city.focus(); x = f.x; y = f.y; }
    const list = this.poi().benches.filter((b) => (!parkOnly || b.park) && b.bench.used.some((u) => !u) && dist2(b.node.x, b.node.y, x, y) < 60 * 60);
    return list.length ? this.rng.pick(list) : null;
  }
  freeStoop(x, y) {
    if (x == null) { const f = this.city.focus(); x = f.x; y = f.y; }
    const list = this.poi().stoops.filter((s) => !s.seat.used && dist2(s.door.x, s.door.y, x, y) < 50 * 50);
    return list.length ? this.rng.pick(list) : null;
  }
  chooseKind(role) {
    const h = this.env().hour, r = this.rng, env = this.env();
    if (role === 'kid') {
      if (env.season === 2 && h > 17 && h < 20.5 && r.chance(0.5)) return 'trick';
      return 'kidplay';
    }
    if (role === 'jogger') return 'jog';
    if (role === 'dogwalker') return 'dogwalk';
    if (role === 'tourist') return 'tourist';
    if (role === 'elder') return r.chance(0.6) ? 'park' : 'errand';
    if (role === 'worker') return h < 11 ? 'toWork' : h < 14.5 ? 'lunch' : 'commute';
    if (h < 5) return 'night';
    if (h < 9.5) return r.weighted([['commute', 40], ['coffee', 20], ['toWork', 12], ['errand', 8], ['bus', 6]]);
    if (h < 16) return r.weighted([['errand', 35], ['park', 30], ['bus', 8], ['wander', 10], ['commute', 8]]);
    if (h < 20) return r.weighted([['goHome', 30], ['errand', 25], ['park', 15], ['stoop', env.season === 1 ? 25 : 4], ['bus', 6]]);
    return r.weighted([['goHome', 40], ['night', 30], ['stoop', env.season === 1 ? 20 : 2], ['errand', 10]]);
  }
  chooseRole() {
    const h = this.env().hour, r = this.rng, env = this.env();
    const kidsOut = h > 14.5 && h < 20.5 && !env.storm;
    const opts = [['resident', 46], ['worker', h > 7 && h < 10 ? 25 : h > 11.5 && h < 14 ? 22 : h > 16.5 && h < 19.5 ? 20 : 2],
      ['kid', kidsOut ? (env.season === 3 && env.snowCover > 0.3 ? 40 : 30) : h > 8 && h < 14 && env.season === 1 ? 6 : 0],
      ['elder', h > 8 && h < 18 ? 9 : 1], ['dogwalker', h < 9 || h > 17 ? 12 : 6], ['jogger', (h > 6 && h < 9) || (h > 17 && h < 20) ? (env.season === 3 ? 3 : 8) : 1],
      ['tourist', h > 9 && h < 20 ? 9 : 1]];
    if (env.raining) { opts[2][1] *= 0.2; opts[5][1] *= 0.2; opts[6][1] *= 0.5; }
    return r.weighted(opts);
  }
  // ---- spawning ---------------------------------------------------------------
  spawn(anywhere = false) {
    const role = this.chooseRole();
    const kind = this.chooseKind(role);
    const p = this.create(role);
    const P = this.poi(), r = this.rng;
    const h = this.env().hour;
    // pick a source node consistent with the plan
    // (near where the action is: the crowd follows the camera round the big map)
    const f = this.city.focus();
    let src;
    if (role === 'worker' && (kind === 'lunch' || kind === 'commute')) src = this.pickNear(P.offices, f.x, f.y, 60);
    else if (role === 'worker' || role === 'tourist' || kind === 'goHome' || (kind === 'night' && r.chance(0.5))) src = this.pickNear(P.subways, f.x, f.y, 60);
    else src = this.pickHome(f.x, f.y, 60);
    if (anywhere) {
      // start partway along the route
      const ns = this.nav.nodes.filter((nn) => (nn.kind === 'walk' || nn.kind === 'corner' || nn.kind === 'park' || nn.kind === 'plaza') && dist2(nn.x, nn.y, f.x, f.y) < 75 * 75);
      if (ns.length) src = r.pick(ns);
    }
    p.x = src.x; p.y = src.y; p.z = src.z;
    if (kind === 'goHome') p.home = this.pickHome(src.x, src.y);
    else if (src.kind === 'door' && src.data?.kind === 'home') p.home = src;
    if (role === 'dogwalker') {
      p.dogName = r.pick(DOG_NAMES);
      this.city.animals?.spawnDog(p);
    }
    p.plan = this.plan(p, kind);
    p.node = src;
    p.state = 'appear';
    p.alpha = 0;
    if (anywhere) { p.alpha = 1; p.state = 'idle'; p.timer = r.range(0, 0.5); }
    if (p.dog) { p.dog.x = p.x; p.dog.y = p.y; }
    this.list.push(p);
    return p;
  }
  init() {
    const target = popTarget(this.env().hour) * this.weatherK();
    for (let k = 0; k < target * 0.8; k++) this.spawn(true);
    this.activities?.seed();
  }
  weatherK() {
    const env = this.env();
    let k = 1;
    if (env.raining) k *= 0.6;
    if (env.storm) k *= 0.45;
    if (env.snowing) k *= 0.85;
    return k;
  }
  // ---- step execution -----------------------------------------------------------------
  nextStep(p) {
    const st = p.plan.shift();
    p.step = st || null;
    if (!st) { this.goTo(p, this.nearestOf(this.poi().subways, p.x, p.y)); p.plan = [{ t: 'enter' }]; return; }
    if (st.thought) p.thought = st.thought;
    switch (st.t) {
      case 'go': {
        if (!st.node) { this.nextStep(p); return; }
        if (!this.goTo(p, st.node)) { this.nextStep(p); }
        break;
      }
      case 'idle': p.state = 'idle'; p.timer = st.dur; p.anim = st.anim || 'idle'; if (st.face) this.faceTo(p, st.face.x, st.face.y); break;
      case 'sit': {
        const b = st.bench.bench;
        const k = b.used.findIndex((u) => !u);
        if (k < 0) { this.nextStep(p); return; }
        b.used[k] = p.id;
        p.seat = { b, k };
        const s = b.seats[k];
        p.walkTo = { x: s.x, y: s.y, z: s.z, then: 'sit' };
        p.state = 'approach';
        p.timer = st.dur;
        if (st.feed) p.feeding = true;
        break;
      }
      case 'stoop': {
        const s = st.seat.seat;
        if (s.used) { this.nextStep(p); return; }
        s.used = p.id;
        p.stoopSeat = s;
        p.walkTo = { x: s.x, y: s.y, z: s.z, then: 'sit', via: st.seat.door };
        p.state = 'approach';
        p.timer = st.dur;
        p.thought = this.rng.pick(['Catching up with the neighbors', 'Too hot inside', 'Watching the block']);
        break;
      }
      case 'shop': p.state = 'inside'; p.timer = st.dur; p.alphaTarget = 0; p.insideNode = st.node; break;
      case 'enter': p.state = 'vanish'; break;
      case 'activity': {
        if (this.activities && this.activities.join(p, st.kind, st.dur)) { p.state = 'activity'; }
        else this.nextStep(p);
        break;
      }
      case 'bus': p.state = 'busWait'; p.timer = st.dur; p.busStop = st.stop; p.anim = 'idle'; p.thought = 'Where is the bus...'; break;
      default: this.nextStep(p);
    }
  }
  goTo(p, target) {
    let from = p.node;
    if (!from) from = this.nearestOf(this.nav.nodes, p.x, p.y);
    const path = this.nav.path(from, target);
    if (!path) return false;
    p.path = path.map((w) => ({ x: w.node.x, y: w.node.y, z: w.node.z, cross: w.cross, node: w.node }));
    p.pi = 1;
    p.state = 'walk';
    p.goal = target;
    if (p.path.length <= 1) { p.state = 'arrived'; }
    return true;
  }
  faceTo(p, x, y) {
    const d = this.city.camera.screenDir(x - p.x, y - p.y);
    p.front = d[1] >= 0;
    p.flip = d[0] < 0;
  }
  endCross(p) {
    const k = this.crossKey(p.crossing);
    this.cross.set(k, Math.max(0, (this.cross.get(k) || 1) - 1));
    p.crossing = null;
  }
  // ---- update -----------------------------------------------------------------------
  update(dt) {
    const env = this.env();
    // population
    const target = popTarget(env.hour) * this.weatherK();
    if (this.list.length < target) {
      this.spawnAcc += dt * Math.min(25, (target - this.list.length) * 0.15 + 0.4);
      while (this.spawnAcc > 1) { this.spawnAcc -= 1; this.spawn(false); }
    }
    // people far from the action and out of sight quietly go indoors (they are spawned near it)
    this.lodT = (this.lodT || 0) - dt;
    if (this.lodT <= 0) {
      this.lodT = 0.5;
      const f = this.city.focus(), view = this.city.view;
      for (const p of this.list) {
        if (p.dead || p.state === 'player' || p.state === 'cop' || p.state === 'vanish') continue;
        if (dist2(p.x, p.y, f.x, f.y) < 100 * 100 || view.visible(p.x, p.y, p.z, 4)) continue;
        this.detachPerson(p);
        p.dead = true;
      }
    }
    // spatial hash
    this.grid.clear();
    for (const p of this.list) {
      const k = (Math.floor(p.x / 1.5) << 16) | Math.floor(p.y / 1.5);
      let c = this.grid.get(k);
      if (!c) this.grid.set(k, (c = []));
      c.push(p);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      this.stepPerson(p, dt, env);
      if (p.dead) { this.release(p); this.list.splice(i, 1); }
    }
  }
  neighbors(p, r = 0.6) {
    const out = [];
    const cx = Math.floor(p.x / 1.5), cy = Math.floor(p.y / 1.5);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const c = this.grid.get(((cx + dx) << 16) | (cy + dy));
        if (c) for (const o of c) if (o !== p && dist2(o.x, o.y, p.x, p.y) < r * r) out.push(o);
      }
    return out;
  }
  // everyone within r of (x, y), from the spatial hash
  near(x, y, r) {
    const out = [];
    const c0x = Math.floor((x - r) / 1.5), c1x = Math.floor((x + r) / 1.5), c0y = Math.floor((y - r) / 1.5), c1y = Math.floor((y + r) / 1.5);
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cy = c0y; cy <= c1y; cy++) {
        const c = this.grid.get((cx << 16) | cy);
        if (c) for (const o of c) if (dist2(o.x, o.y, x, y) < r * r) out.push(o);
      }
    return out;
  }
  // stop whatever someone was doing (activity, seat, crosswalk) before something happens to them
  detachPerson(p) {
    if (p.actKind) this.city.activities?.leave(p);
    if (p.seat) { p.seat.b.used[p.seat.k] = false; p.seat = null; }
    if (p.stoopSeat) { p.stoopSeat.used = false; p.stoopSeat = null; }
    if (p.crossing) this.endCross(p);
    p.feeding = false; p.dodge = null; p.forceFace = false; p.animFrame = null;
    if (p.z < -0.05 && p.state !== 'vanish') p.z = CURB;
  }
  // shot, or hit hard by a car: down for good, a pool of blood spreading underneath
  kill(p, dx = 0, dy = 0, cause = 'shot') {
    if (p.state === 'dead' || p.state === 'player' || p.state === 'vanish' || p.state === 'inside') return false;
    const wasCop = p.state === 'cop';
    this.detachPerson(p);
    personPose(this.city.atlas, p.frames, 'down');
    p.state = 'dead'; p.deadT = 0; p.anim = 'down'; p.animFrame = 0; p.thought = ''; p.umbrella = false;
    p.plan = []; p.path = null; p.step = null;
    const k = cause === 'car' ? 3.4 : cause === 'blast' ? 4.2 : 0.7;
    p.kvx = dx * k; p.kvy = dy * k;
    const d = this.city.camera.screenDir(dx || 1, dy);
    p.flip = d[0] < 0; p.front = true;
    const r = this.rng;
    this.city.decals?.add('pool', p.x + dx * (k * 0.12 + 0.15), p.y + dy * (k * 0.12 + 0.15), p.z, r.range(0, 6.28), p.kid ? 0.5 : 0.68, 1, 5);
    if (cause !== 'blast') this.city.particles?.blood(p.x, p.y, p.z + (p.kid ? 0.6 : 0.85), dx, dy, cause === 'car' ? 18 : 14);
    this.city.audio?.event(cause === 'shot' ? 'hit' : 'thud', p);
    if (wasCop) this.city.player?.onCopDown(p);
    // anyone nearby runs for it
    for (const q of this.near(p.x, p.y, 9)) if (q !== p) this.panic(q, p.x, p.y, r.range(2.5, 4.5));
    return true;
  }
  // knocked flat (by a car or a blast): lies there a moment, then gets up grumbling
  knock(p, vx = 0, vy = 0) {
    if (p.state === 'dead' || p.state === 'player' || p.state === 'knocked') return;
    const wasCop = p.state === 'cop';
    this.detachPerson(p);
    personPose(this.city.atlas, p.frames, 'down');
    p.state = 'knocked'; p.timer = 2.4; p.anim = 'down'; p.animFrame = 0; p.kvx = vx * 2; p.kvy = vy * 2; p.wasCop = wasCop;
    p.thought = this.rng.pick(['OUCH!', 'Watch it!', 'My back...', 'Hey!']);
    this.city.audio?.event('thud', p);
  }
  // a frightened person runs away from (fx, fy), then picks up where they left off
  panic(p, fx, fy, t = 3) {
    const st = p.state;
    if (st === 'dead' || st === 'player' || st === 'cop' || st === 'vanish' || st === 'inside' || st === 'appear' || st === 'knocked' || st === 'vendor') return false;
    if (p.alpha < 0.5 || p.inCar) return false;
    if (st === 'flee') { p.timer = Math.max(p.timer, t); p.fleeFrom = { x: fx, y: fy }; return true; }
    if (p.step && p.step.t === 'go' && (st === 'walk' || st === 'wait')) p.plan.unshift(p.step);
    this.detachPerson(p);
    p.state = 'flee'; p.timer = t; p.fleeFrom = { x: fx, y: fy }; p.path = null;
    p.thought = this.rng.pick(['AAAH!', 'RUN!', 'Somebody call 911!', 'Oh no oh no', 'GET DOWN!', 'Not in my city!']);
    if (p.dog) p.dog.mode = 'follow';
    return true;
  }
  // a patrol officer in uniform
  createCop() {
    const r = this.rng;
    const tpl = { body: 'adult', hair: r.pick(['short', 'short', 'bun', 'bald', 'pony']), top: 'uniform', bottom: 'pants', hat: 'police' };
    const frames = personTemplate(this.city.atlas, tpl);
    const P = {
      [S.SKIN]: r.pick(SKIN), [S.HAIR]: r.pick(HAIR.slice(0, 7)), [S.TOP]: 0x23365e, [S.TOP2]: 0x2c4372, [S.BOTTOM]: 0x1b2440,
      [S.SHOES]: 0x141416, [S.COAT]: 0x23365e, [S.HAT]: 0x1b2747, [S.SCARF]: 0x23365e, [S.BAG]: 0x141416,
      [S.DARK]: 0x141414, [S.WHITE]: 0xf2f2ee, [S.ITEM]: 0xe8c24a, [S.ITEM2]: 0x6a7fa8, [S.SOCK]: 0x141416,
    };
    const p = {
      id: this.nextId++, role: 'cop', kid: false, elder: false, tpl, frames, pal: this.city.pal.alloc(P), name: 'Officer ' + r.pick(['Diaz', 'Kowalski', 'Chen', 'Murphy', 'Okafor', 'Russo', 'Patel', 'Lee', 'Brooks', 'Santos']),
      age: r.int(24, 55), x: 0, y: 0, z: 0, node: null, path: null, pi: 0, state: 'cop', timer: 0, plan: [], step: null,
      speed: 1, lane: 0.3, anim: 'idle', animT: r.next() * 4, front: true, flip: false, dx: 0, dy: 1,
      alpha: 1, fade: 0, dist: 0, thought: '', umbrella: false, crossing: null, hp: 2,
    };
    personPose(this.city.atlas, frames, 'aim');
    return p;
  }
  stepPerson(p, dt, env) {
    p.animT += dt;
    if (p.umbrella && !env.raining && this.rng.chance(dt * 0.1)) p.umbrella = false;
    if (!p.umbrella && env.raining && !p.kid && p.state === 'walk' && this.rng.chance(dt * 0.05)) p.umbrella = true;
    switch (p.state) {
      case 'appear':
        p.alpha = Math.min(1, p.alpha + dt * 2.5);
        if (p.node && p.node.kind === 'subway') p.z = Math.min(CURB, p.z + dt * 0.8);
        if (p.alpha >= 1) this.nextStep(p);
        break;
      case 'idle':
        p.timer -= dt;
        if (p.anim === 'walk' || p.anim === 'run') p.anim = 'idle';
        if (p.timer <= 0) this.nextStep(p);
        break;
      case 'arrived':
        this.nextStep(p);
        break;
      case 'walk':
        this.walk(p, dt);
        break;
      case 'wait': {
        p.anim = 'idle';
        const w = this.walkState(p.waitCross);
        const cw = p.path && p.path[p.pi];
        const busy = w === 'walk' && this.city.traffic.flashing && cw && this.city.traffic.movingCarNear((p.x + cw.x) / 2, (p.y + cw.y) / 2, 6);
        if (w === 'walk' && !busy) {
          p.state = 'walk';
          p.crossing = p.waitCross;
          this.cross.set(this.crossKey(p.crossing), (this.cross.get(this.crossKey(p.crossing)) || 0) + 1);
        }
        break;
      }
      case 'approach': {
        const t = p.walkTo;
        const d = dist(p.x, p.y, t.x, t.y);
        const sp = p.speed * dt;
        if (d <= sp + 0.02) {
          p.x = t.x; p.y = t.y; p.z = t.z;
          if (t.then === 'sit') { p.state = 'sit'; p.anim = 'sit'; this.faceSeat(p); }
        } else {
          p.x += ((t.x - p.x) / d) * sp; p.y += ((t.y - p.y) / d) * sp; p.z += (t.z - p.z) * Math.min(1, sp / d);
          this.setFacing(p, t.x - p.x, t.y - p.y);
          p.dist += sp; p.anim = 'walk';
        }
        break;
      }
      case 'sit':
        p.timer -= dt;
        p.anim = 'sit';
        if (p.timer <= 0) {
          if (p.seat) { p.seat.b.used[p.seat.k] = false; p.seat = null; }
          if (p.stoopSeat) { p.stoopSeat.used = false; p.stoopSeat = null; }
          p.feeding = false;
          // return to graph node then continue
          const back = p.node;
          if (back) { p.walkTo = { x: back.x, y: back.y, z: back.z, then: 'resume' }; p.state = 'return'; }
          else this.nextStep(p);
        }
        break;
      case 'return': {
        const t = p.walkTo;
        const d = dist(p.x, p.y, t.x, t.y);
        const sp = p.speed * dt;
        if (d <= sp + 0.02) { p.x = t.x; p.y = t.y; p.z = t.z; this.nextStep(p); }
        else { p.x += ((t.x - p.x) / d) * sp; p.y += ((t.y - p.y) / d) * sp; p.z += (t.z - p.z) * Math.min(1, sp / d); this.setFacing(p, t.x - p.x, t.y - p.y); p.dist += sp; p.anim = 'walk'; }
        break;
      }
      case 'inside':
        p.timer -= dt;
        p.alpha = Math.max(0, p.alpha - dt * 3);
        if (p.timer <= 0) {
          p.alpha = Math.min(1, p.alpha + dt * 6);
          if (!p.reappeared) {
            p.reappeared = true;
            if (this.rng.chance(0.5) && p.tpl.bag !== 'shopping' && !p.tpl.bag) {
              // comes out with a shopping bag
              p.tpl = { ...p.tpl, bag: 'shopping' };
              p.frames = personTemplate(this.city.atlas, p.tpl);
            }
          }
          if (p.alpha >= 1) { p.reappeared = false; this.nextStep(p); }
        }
        break;
      case 'vanish':
        p.alpha -= dt * 2.5;
        if (p.node && p.node.kind === 'subway') p.z -= dt * 0.8;
        if (p.alpha <= 0) p.dead = true;
        break;
      case 'activity':
        // controlled by the activity manager
        break;
      case 'vendor':
        p.anim = 'idle';
        break;
      case 'busWait':
        p.timer -= dt;
        p.anim = 'idle';
        if (p.timer <= 0) { p.plan = [{ t: 'go', node: this.nearestOf(this.poi().subways, p.x, p.y) }, { t: 'enter' }]; this.nextStep(p); }
        break;
      case 'player':
        // moved by the player system
        break;
      case 'dodge': {
        // diving out of the way of a car, then carrying on
        const d = p.dodge, C = this.city.coll;
        d.t -= dt;
        const nx = p.x + d.x * 3.4 * dt, ny = p.y + d.y * 3.4 * dt;
        if (!C || C.free(nx, ny, 0.18)) { p.x = nx; p.y = ny; p.dist += 3.4 * dt; }
        p.dx = d.x; p.dy = d.y; p.anim = 'run'; p.animFrame = null;
        if (d.t <= 0) { p.state = d.back === 'flee' ? 'flee' : d.back === 'walk' && p.path ? 'walk' : 'idle'; p.timer = 0.3; p.dodge = null; }
        break;
      }
      case 'knocked':
        // knocked flat by a car: lie there a moment, then get up grumbling and carry on
        p.timer -= dt;
        p.anim = 'down'; p.animFrame = 0;
        this.slide(p, dt);
        if (p.timer <= 0) {
          p.anim = 'idle'; p.animFrame = null;
          if (p.wasCop) { p.state = 'cop'; p.wasCop = false; break; }
          p.node = this.nearestOf(this.nav.nodes, p.x, p.y); p.state = 'idle'; p.timer = 0.6;
          if (!p.plan.length) p.plan = [{ t: 'go', node: p.home || this.pickHome(p.x, p.y), thought: 'What a city...' }, { t: 'enter' }];
        }
        break;
      case 'dead': {
        // stays down; once nobody is looking (or after a while) the body is taken away
        p.deadT += dt;
        p.anim = 'down'; p.animFrame = 0;
        this.slide(p, dt);
        if (p.deadT > 55 || (p.deadT > 14 && !this.city.view.visible(p.x, p.y, p.z, 3))) { p.alpha -= dt * 0.7; if (p.alpha <= 0) p.dead = true; }
        break;
      }
      case 'cop':
        // moved by the player system (police on foot)
        break;
      case 'flee': {
        // a driver who has just had their car taken: run away from it, then head home
        const C = this.city.coll, f = p.fleeFrom;
        p.timer -= dt;
        let ax = p.x - f.x, ay = p.y - f.y;
        const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
        const nx = p.x + ax * 2.4 * dt, ny = p.y + ay * 2.4 * dt;
        if (!C || C.free(nx, ny, 0.18)) { p.x = nx; p.y = ny; }
        else if (C.free(p.x + ay * 2.4 * dt, p.y - ax * 2.4 * dt, 0.18)) { p.x += ay * 2.4 * dt; p.y -= ax * 2.4 * dt; }
        p.dx = ax; p.dy = ay; p.anim = 'run'; p.dist += 2.4 * dt; p.animFrame = null;
        if (C) p.z += (C.groundZ(p.x, p.y) - p.z) * Math.min(1, dt * 12);
        if (p.timer <= 0) { p.node = this.nearestOf(this.nav.nodes, p.x, p.y); p.state = 'idle'; p.timer = 0.2; }
        break;
      }
    }
    if (p.dog) this.city.animals?.followOwner(p.dog, p, dt);
  }
  // momentum from a hit carries a body along the ground for a moment
  slide(p, dt) {
    if (!p.kvx && !p.kvy) return;
    const C = this.city.coll;
    const nx = p.x + p.kvx * dt, ny = p.y + p.kvy * dt;
    if (!C || C.free(nx, ny, 0.15)) { p.x = nx; p.y = ny; } else { p.kvx = 0; p.kvy = 0; }
    const k = Math.exp(-dt * 5);
    p.kvx *= k; p.kvy *= k;
    if (Math.abs(p.kvx) + Math.abs(p.kvy) < 0.02) { p.kvx = 0; p.kvy = 0; }
    if (C) p.z += (C.groundZ(p.x, p.y) - p.z) * Math.min(1, dt * 12);
  }
  faceSeat(p) {
    const f = p.seat ? p.seat.b.seats[p.seat.k].face : p.stoopSeat ? p.stoopSeat.n : [0, 1];
    const d = this.city.camera.screenDir(f[0], f[1]);
    p.front = d[1] >= 0;
    p.flip = d[0] < 0;
  }
  setFacing(p, dx, dy) {
    if (Math.abs(dx) + Math.abs(dy) < 1e-4) return;
    p.dx = dx; p.dy = dy;
  }
  walk(p, dt) {
    const wp = p.path[p.pi];
    if (!wp) { p.state = 'arrived'; return; }
    // crossing check at the start of a crosswalk edge
    if (wp.cross && p.crossing !== wp.cross && !p.passedCheck) {
      const w = this.walkState(wp.cross);
      const prevN = p.path[p.pi - 1];
      const carNear = w === 'walk' && this.city.traffic.flashing && this.city.traffic.movingCarNear((prevN.x + wp.x) / 2, (prevN.y + wp.y) / 2, 6);
      if (w !== 'walk' || carNear) { p.state = 'wait'; p.waitCross = wp.cross; this.faceTo(p, wp.x, wp.y); return; }
      p.crossing = wp.cross;
      this.cross.set(this.crossKey(p.crossing), (this.cross.get(this.crossKey(p.crossing)) || 0) + 1);
    }
    const prev = p.path[p.pi - 1];
    let tx = wp.x, ty = wp.y;
    const last = p.pi === p.path.length - 1;
    const sdx = wp.x - prev.x, sdy = wp.y - prev.y;
    const sl = Math.hypot(sdx, sdy) || 1;
    if (!last && wp.node.kind !== 'door' && wp.node.kind !== 'stoop' && wp.node.kind !== 'subway') {
      // keep to the right of the walking direction
      tx += (-sdy / sl) * p.lane;
      ty += (sdx / sl) * p.lane;
    }
    let d = Math.hypot(tx - p.x, ty - p.y);
    let speed = p.speed * (this.city.env.raining ? 1.12 : 1);
    if (p.dog && p.dog.sniffing) speed = 0;
    // simple avoidance: slow behind slower people heading the same way
    const nb = this.neighbors(p, 0.55);
    let px = 0, py = 0;
    for (const o of nb) {
      const ox = p.x - o.x, oy = p.y - o.y;
      const od = Math.hypot(ox, oy) || 0.01;
      px += (ox / od) * (0.55 - od);
      py += (oy / od) * (0.55 - od);
      const ahead = ((o.x - p.x) * (tx - p.x) + (o.y - p.y) * (ty - p.y)) / (d || 1);
      if (ahead > 0.15 && ahead < 0.5 && o.state === 'walk') speed *= 0.7;
    }
    const step = speed * dt;
    // progress watchdog: people converging on one spot (a bus stop, a kerb corner) push each other
    // apart and could hover round it forever; after a while without getting closer, call it reached
    if (p.wpIdx !== p.pi || p.wpPath !== p.path) { p.wpIdx = p.pi; p.wpPath = p.path; p.wpBest = d; p.wpT = 0; }
    else if (d < p.wpBest - 0.05) { p.wpBest = d; p.wpT = 0; }
    else p.wpT += dt;
    const stalled = p.wpT > 1.5 && d < 1.2;
    if (d <= step + 0.03 || stalled) {
      if (!stalled) { p.x = tx; p.y = ty; }
      p.z = wp.z;
      p.node = wp.node;
      if (p.crossing && wp.cross === p.crossing) this.endCross(p);
      p.pi++;
      if (p.pi >= p.path.length) { p.state = 'arrived'; p.anim = 'idle'; }
    } else {
      const k = step / d;
      p.x += (tx - p.x) * k + px * dt * 0.8;
      p.y += (ty - p.y) * k + py * dt * 0.8;
      p.z += (wp.z - p.z) * Math.min(1, k * 1.0);
      this.setFacing(p, tx - p.x, ty - p.y);
      p.dist += step;
    }
    p.anim = p.run ? 'run' : 'walk';
  }
  // ---- rendering --------------------------------------------------------------------
  emit(L, view) {
    const cam = this.city.camera;
    for (const p of this.list) {
      if (p.alpha <= 0.01) continue;
      if (!view.visible(p.x, p.y, p.z, 2)) continue;
      this.emitPerson(L, p, cam);
    }
  }
  emitPerson(L, p, cam) {
    // facing from movement
    if (p.anim === 'walk' || p.anim === 'run' || p.forceFace) {
      const d = cam.screenDir(p.dx, p.dy);
      p.front = d[1] >= 0;
      if (Math.abs(d[0]) > 0.01) p.flip = d[0] < 0;
    }
    const set = p.front ? p.frames.front : p.frames.back;
    const arr = set[p.anim] || set.idle;
    let fi = 0;
    if (p.anim === 'walk') fi = Math.floor(p.dist / 0.16) % 4;
    else if (p.anim === 'run') fi = Math.floor(p.dist / 0.2) % 4;
    else if (p.anim === 'idle') fi = Math.floor(p.animT * 1.3) % 2;
    else if (p.animFrame != null) fi = p.animFrame % arr.length;
    else fi = Math.floor(p.animT * 3) % arr.length;
    const f = arr[fi] || arr[0];
    let alpha = p.alpha;
    if (p.z < CURB - 0.15) alpha *= clamp(1 + (p.z - CURB + 0.15) * 1.6, 0, 1);
    L.push(p.x, p.y, p.z, f, p.pal, (p.flip ? SF.FLIP : 0) | (p.anim === 'down' || p.anim === 'lie' ? SF.FLAT : 0), alpha, p.anim === 'down' ? 0.002 : 0.003);
    if (p.umbrella) {
      const hz = p.z + (p.kid ? 0.82 : 1.12);
      L.push(p.x, p.y, hz, this.umbrellaFrame, p.pal, 0, alpha, 0.004);
    }
    if (p.extra) p.extra(L, p);
  }
  // pick the person under a screen point (for follow mode)
  pick(px, py, viewW, viewH) {
    const cam = this.city.camera;
    let best = null, bd = 400;
    for (const p of this.list) {
      if (p.alpha < 0.5) continue;
      const s = cam.worldToScreen(p.x, p.y, p.z + 0.5, viewW, viewH);
      const d = (s[0] - px) ** 2 + (s[1] - py) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}
