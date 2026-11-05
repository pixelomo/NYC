// Pedestrian navigation graph: sidewalks, crosswalks (signal-controlled), park paths and POIs.

import { NB, roadCenter, CURB } from '../world/layout.js';
import { dist } from '../core/math.js';

const Q = 3.5; // sidewalk centreline offset from road centre

export class NavGraph {
  constructor() {
    this.nodes = [];
    this.segments = [];
  }
  add(x, y, z = CURB, kind = 'walk', data = null) {
    const n = { id: this.nodes.length, x, y, z, kind, data, edges: [] };
    this.nodes.push(n);
    return n;
  }
  link(a, b, cross = null) {
    if (a === b) return;
    if (a.edges.some((e) => e.to === b)) return;
    const len = dist(a.x, a.y, b.x, b.y) + Math.abs(a.z - b.z);
    a.edges.push({ to: b, len, cross });
    b.edges.push({ to: a, len, cross });
  }
  // nearest point on any sidewalk segment
  nearestSeg(x, y, maxD = 3) {
    let best = null, bd = maxD;
    for (const s of this.segments) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
      const L2 = dx * dx + dy * dy;
      let t = ((x - s.a.x) * dx + (y - s.a.y) * dy) / L2;
      t = Math.max(0.02, Math.min(0.98, t));
      const px = s.a.x + dx * t, py = s.a.y + dy * t;
      const d = dist(x, y, px, py);
      if (d < bd) { bd = d; best = { seg: s, t, x: px, y: py }; }
    }
    return best;
  }
  // attach a POI: creates a node on the sidewalk (merged with close ones) and returns it
  attach(x, y, maxD = 3.2) {
    const hit = this.nearestSeg(x, y, maxD);
    if (!hit) return null;
    const s = hit.seg;
    for (const p of s.stops) if (Math.abs(p.t - hit.t) * s.len < 0.35) return p.node;
    const node = this.add(hit.x, hit.y, CURB, 'walk');
    s.stops.push({ t: hit.t, node });
    return node;
  }
  finalize() {
    for (const s of this.segments) {
      const pts = [{ t: 0, node: s.a }, ...s.stops.sort((u, v) => u.t - v.t), { t: 1, node: s.b }];
      for (let i = 1; i < pts.length; i++) this.link(pts[i - 1].node, pts[i].node);
    }
  }
  // A* path from node a to node b, returns array of {node, cross}
  path(a, b) {
    if (a === b) return [{ node: a, cross: null }];
    const open = new Map(), came = new Map(), g = new Map();
    const h = (n) => dist(n.x, n.y, b.x, b.y);
    g.set(a, 0);
    open.set(a, h(a));
    let iter = 0;
    while (open.size && iter++ < 4000) {
      let cur = null, cf = Infinity;
      for (const [n, f] of open) if (f < cf) { cf = f; cur = n; }
      if (cur === b) break;
      open.delete(cur);
      for (const e of cur.edges) {
        const ng = g.get(cur) + e.len + (e.cross ? 2.5 : 0);
        if (ng < (g.get(e.to) ?? Infinity)) {
          g.set(e.to, ng);
          came.set(e.to, { from: cur, cross: e.cross });
          open.set(e.to, ng + h(e.to));
        }
      }
    }
    if (!came.has(b)) return null;
    const out = [];
    let n = b;
    while (n !== a) {
      const c = came.get(n);
      out.push({ node: n, cross: c.cross });
      n = c.from;
    }
    out.push({ node: a, cross: null });
    return out.reverse();
  }
}

export function buildNav(world) {
  const G = new NavGraph();
  const corner = {};
  const key = (i, j, qx, qy) => `${i},${j},${qx},${qy}`;
  for (let i = 0; i <= NB; i++)
    for (let j = 0; j <= NB; j++)
      for (const qx of [-1, 1])
        for (const qy of [-1, 1]) {
          const n = G.add(roadCenter(i) + qx * Q, roadCenter(j) + qy * Q, CURB, 'corner');
          n.i = i; n.j = j;
          corner[key(i, j, qx, qy)] = n;
        }
  // crosswalks
  for (let i = 0; i <= NB; i++)
    for (let j = 0; j <= NB; j++) {
      for (const qy of [-1, 1]) G.link(corner[key(i, j, -1, qy)], corner[key(i, j, 1, qy)], { i, j, axis: 'x', side: qy < 0 ? 3 : 1 });
      for (const qx of [-1, 1]) G.link(corner[key(i, j, qx, -1)], corner[key(i, j, qx, 1)], { i, j, axis: 'y', side: qx < 0 ? 2 : 0 });
    }
  // sidewalk segments
  for (let j = 0; j <= NB; j++)
    for (let i = 0; i < NB; i++)
      for (const qy of [-1, 1]) {
        const a = corner[key(i, j, 1, qy)], b = corner[key(i + 1, j, -1, qy)];
        G.segments.push({ a, b, len: dist(a.x, a.y, b.x, b.y), stops: [] });
      }
  for (let i = 0; i <= NB; i++)
    for (let j = 0; j < NB; j++)
      for (const qx of [-1, 1]) {
        const a = corner[key(i, j, qx, 1)], b = corner[key(i, j + 1, qx, -1)];
        G.segments.push({ a, b, len: dist(a.x, a.y, b.x, b.y), stops: [] });
      }
  // POIs ------------------------------------------------------------------
  const poi = { homes: [], shops: [], offices: [], subways: [], benches: [], stoops: [], carts: [], busStops: [], hydrants: [], park: {}, court: {} };
  for (const d of world.doors) {
    const sw = G.attach(d.x, d.y);
    if (!sw) continue;
    let door;
    if (d.stoop) {
      const bottom = G.add(d.sx, d.sy, CURB, 'stoop');
      door = G.add(d.dx, d.dy, d.dz, 'door', d);
      G.link(sw, bottom);
      G.link(bottom, door);
    } else {
      door = G.add(d.dx ?? d.x, d.dy ?? d.y, d.dz ?? CURB, 'door', d);
      G.link(sw, door);
    }
    door.sw = sw;
    if (d.kind === 'home' || d.kind === 'hotel') poi.homes.push(door);
  }
  for (const d of world.officeDoors) {
    const sw = G.attach(d.x, d.y, 4);
    if (!sw) continue;
    const door = G.add(d.dx, d.dy, CURB, 'door', d);
    G.link(sw, door);
    door.sw = sw;
    poi.offices.push(door);
  }
  for (const s of world.shops) {
    const sw = G.attach(s.x, s.y);
    if (!sw) continue;
    const door = G.add(s.dx ?? s.x - s.n[0] * 0.9, s.dy ?? s.y - s.n[1] * 0.9, CURB, 'shop', s);
    G.link(sw, door);
    door.sw = sw;
    poi.shops.push(door);
  }
  for (const s of world.subways) {
    const sw = G.attach(s.x, s.y);
    if (!sw) continue;
    const bottom = G.add(s.bx, s.by, CURB - 1.2, 'subway', s);
    G.link(sw, bottom);
    bottom.sw = sw;
    poi.subways.push(bottom);
  }
  for (const c of world.carts) {
    const sw = G.attach(c.x, c.y);
    if (sw) poi.carts.push({ node: sw, cart: c });
  }
  for (const b of world.busStops) {
    const sw = G.attach(b.x, b.y);
    if (sw) poi.busStops.push({ node: sw, stop: b });
  }
  for (const h of world.hydrants) {
    const sw = G.attach(h.x, h.y);
    if (sw) poi.hydrants.push({ node: sw, h });
  }
  // stoop seats belong to nearby doors
  for (const s of world.stoopSeats) {
    let best = null, bd = 3;
    for (const d of poi.homes) {
      const dd = dist(d.x, d.y, s.x, s.y);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (best) poi.stoops.push({ seat: s, door: best });
  }
  // Park network -----------------------------------------------------------
  if (world.park) {
    const P = world.park, cx = P.cx, cy = P.cy;
    const o = 1.3;
    const c00 = G.add(P.x0 + o, P.y0 + o), c10 = G.add(P.x1 - o, P.y0 + o), c11 = G.add(P.x1 - o, P.y1 - o), c01 = G.add(P.x0 + o, P.y1 - o);
    const mN = G.add(cx, P.y0 + o), mS = G.add(cx, P.y1 - o), mW = G.add(P.x0 + o, cy), mE = G.add(P.x1 - o, cy);
    G.link(c00, mN); G.link(mN, c10); G.link(c10, mE); G.link(mE, c11); G.link(c11, mS); G.link(mS, c01); G.link(c01, mW); G.link(mW, c00);
    const r = 3.0;
    const rN = G.add(cx, cy - r), rS = G.add(cx, cy + r), rW = G.add(cx - r, cy), rE = G.add(cx + r, cy);
    const d = r * 0.72;
    const dNW = G.add(cx - d, cy - d), dNE = G.add(cx + d, cy - d), dSE = G.add(cx + d, cy + d), dSW = G.add(cx - d, cy + d);
    const ring = [rN, dNE, rE, dSE, rS, dSW, rW, dNW];
    for (let k = 0; k < 8; k++) G.link(ring[k], ring[(k + 1) % 8]);
    G.link(mN, rN); G.link(mS, rS); G.link(mW, rW); G.link(mE, rE);
    G.link(c00, dNW); G.link(c10, dNE); G.link(c11, dSE); G.link(c01, dSW);
    // entrances to sidewalk
    const entr = [[mN, cx, P.y0 - 1], [mS, cx, P.y1 + 1], [mW, P.x0 - 1, cy], [mE, P.x1 + 1, cy]];
    for (const [n, x, y] of entr) { const sw = G.attach(x, y); if (sw) G.link(n, sw); }
    // corners connect to intersection corner nodes
    const near = (x, y) => G.nodes.filter((n) => n.kind === 'corner').reduce((b, n) => (dist(n.x, n.y, x, y) < dist(b.x, b.y, x, y) ? n : b));
    G.link(c00, near(P.x0 - 1, P.y0 - 1)); G.link(c10, near(P.x1 + 1, P.y0 - 1)); G.link(c11, near(P.x1 + 1, P.y1 + 1)); G.link(c01, near(P.x0 - 1, P.y1 + 1));
    poi.park.paths = [c00, c10, c11, c01, mN, mS, mW, mE, ...ring];
    poi.park.ring = ring;
    poi.park.perimeter = [c00, mN, c10, mE, c11, mS, c01, mW];
    // benches inside the park
    const all = G.nodes.slice();
    const nearestPark = (x, y) => poi.park.paths.reduce((b, n) => (dist(n.x, n.y, x, y) < dist(b.x, b.y, x, y) ? n : b));
    for (const b of world.benches) {
      if (b.x > P.x0 && b.x < P.x1 && b.y > P.y0 && b.y < P.y1) {
        const n = nearestPark(b.x, b.y);
        poi.benches.push({ bench: b, node: n, park: true });
      }
    }
    // pond & dog run & lawns
    if (world.pond) poi.park.pond = nearestPark(world.pond.x, world.pond.y);
    if (world.dogRun) {
      const g = G.add(world.dogRun.gate.x, world.dogRun.gate.y);
      G.link(g, nearestPark(g.x, g.y));
      poi.park.dogGate = g;
    }
    poi.park.lawnNodes = (world.lawns || []).map((l) => nearestPark((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2));
    void all;
  }
  // other benches (plazas, bus shelters): attach to sidewalk
  for (const b of world.benches) {
    if (poi.benches.some((p) => p.bench === b)) continue;
    const sw = G.attach(b.x, b.y, 6);
    if (sw) poi.benches.push({ bench: b, node: sw, park: false });
  }
  // court
  if (world.court) {
    const C = world.court;
    const gate = G.add(C.gate.x, C.gate.y);
    const sw = G.attach(C.gate.x, C.gate.y + 9, 6) || G.attach(C.gate.x, C.gate.y, 12);
    if (sw) G.link(gate, sw);
    poi.court.gate = gate;
    if (world.playground) {
      const pg = world.playground;
      const n = G.add((pg.x0 + pg.x1) / 2, pg.y1 - 0.5);
      const s2 = G.attach(n.x, pg.y1 + 1.2, 4);
      if (s2) G.link(n, s2);
      G.link(n, gate);
      poi.court.playground = n;
    }
    if (world.handball) {
      const n = G.add(world.handball.x, world.handball.y);
      G.link(n, gate);
      const s3 = G.attach(n.x, n.y + 3, 5);
      if (s3) G.link(n, s3);
      poi.court.handball = n;
    }
  }
  G.finalize();
  G.poi = poi;
  G.corners = corner;
  return G;
}
