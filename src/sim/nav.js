// Pedestrian navigation graph: sidewalks, crosswalks (signal-controlled), park paths and POIs.

import { NB, roadCenter, CURB, isParkIntersection } from '../world/layout.js';
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
    const g = new Map(), came = new Map(), closed = new Set();
    const h = (n) => dist(n.x, n.y, b.x, b.y);
    // binary min-heap of [f, node]
    const heap = [];
    const push = (f, n) => {
      heap.push([f, n]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    g.set(a, 0);
    push(h(a), a);
    let iter = 0;
    while (heap.length && iter++ < 20000) {
      const [, cur] = pop();
      if (closed.has(cur)) continue;
      if (cur === b) break;
      closed.add(cur);
      const gc = g.get(cur);
      for (const e of cur.edges) {
        if (closed.has(e.to)) continue;
        const ng = gc + e.len + (e.cross ? 2.5 : 0);
        if (ng < (g.get(e.to) ?? Infinity)) {
          g.set(e.to, ng);
          came.set(e.to, { from: cur, cross: e.cross });
          push(ng + h(e.to), e.to);
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
  const park = (i, j) => isParkIntersection(i, j);
  for (let i = 0; i <= NB; i++)
    for (let j = 0; j <= NB; j++) {
      if (park(i, j)) continue;
      for (const qx of [-1, 1])
        for (const qy of [-1, 1]) {
          const n = G.add(roadCenter(i) + qx * Q, roadCenter(j) + qy * Q, CURB, 'corner');
          n.i = i; n.j = j;
          corner[key(i, j, qx, qy)] = n;
        }
    }
  // crosswalks; a leg swallowed by the park is plain sidewalk now (a segment POIs can attach to)
  const walk = (a, b) => G.segments.push({ a, b, len: dist(a.x, a.y, b.x, b.y), stops: [] });
  for (let i = 0; i <= NB; i++)
    for (let j = 0; j <= NB; j++) {
      if (park(i, j)) continue;
      for (const qy of [-1, 1]) {
        const a = corner[key(i, j, -1, qy)], b = corner[key(i, j, 1, qy)];
        if (park(i, j + qy)) walk(a, b);
        else G.link(a, b, { i, j, axis: 'x', side: qy < 0 ? 3 : 1 });
      }
      for (const qx of [-1, 1]) {
        const a = corner[key(i, j, qx, -1)], b = corner[key(i, j, qx, 1)];
        if (park(i + qx, j)) walk(a, b);
        else G.link(a, b, { i, j, axis: 'y', side: qx < 0 ? 2 : 0 });
      }
    }
  // sidewalk segments
  for (let j = 0; j <= NB; j++)
    for (let i = 0; i < NB; i++)
      for (const qy of [-1, 1]) {
        if (park(i, j) || park(i + 1, j)) continue;
        const a = corner[key(i, j, 1, qy)], b = corner[key(i + 1, j, -1, qy)];
        G.segments.push({ a, b, len: dist(a.x, a.y, b.x, b.y), stops: [] });
      }
  for (let i = 0; i <= NB; i++)
    for (let j = 0; j < NB; j++)
      for (const qx of [-1, 1]) {
        if (park(i, j) || park(i, j + 1)) continue;
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
  // Park network (paths described by the park builder) ---------------------------
  if (world.parkNet) {
    const N = world.parkNet;
    const pn = N.nodes.map((n) => G.add(n.x, n.y, CURB, 'park'));
    for (const [a, b] of N.edges) G.link(pn[a], pn[b]);
    // gates: link to the sidewalk outside (or straight to an intersection corner)
    for (const g of N.gates) {
      let sw = null;
      if (g.corner) sw = G.nodes.filter((n) => n.kind === 'corner').reduce((b, n) => (dist(n.x, n.y, g.sx, g.sy) < dist(b.x, b.y, g.sx, g.sy) ? n : b));
      else sw = G.attach(g.sx, g.sy, 2.5);
      if (sw) G.link(pn[g.node], sw);
    }
    const pick = (ids) => ids.map((k) => pn[k]);
    poi.park.paths = pick(N.paths);
    poi.park.ring = pick(N.ring);
    poi.park.perimeter = pick(N.perimeter);
    poi.park.lawnNodes = pick(N.lawnNodes);
    if (N.pond != null) poi.park.pond = pn[N.pond];
    if (N.dogGate != null) poi.park.dogGate = pn[N.dogGate];
    const P = world.park;
    const nearestPark = (x, y) => poi.park.paths.reduce((b, n) => (dist(n.x, n.y, x, y) < dist(b.x, b.y, x, y) ? n : b));
    // benches inside the park sit on its paths
    for (const b of world.benches) {
      if (b.x > P.x0 && b.x < P.x1 && b.y > P.y0 && b.y < P.y1) poi.benches.push({ bench: b, node: nearestPark(b.x, b.y), park: true });
    }
  }
  // other walkable squares (Times Square): their own nets, joined to the sidewalks
  poi.squares = {};
  for (const N of world.extraNets || []) {
    const pn = N.nodes.map((n) => G.add(n.x, n.y, CURB, 'plaza'));
    for (const [a, b] of N.edges) G.link(pn[a], pn[b]);
    for (const g of N.gates) { const sw = G.attach(g.sx, g.sy, 2.5); if (sw) G.link(pn[g.node], sw); }
    poi.squares[N.name] = pn;
    const R = N.rect;
    for (const b of world.benches) {
      if (b.x > R.x0 && b.x < R.x1 && b.y > R.y0 && b.y < R.y1 && pn.length) {
        const n = pn.reduce((best, q) => (dist(q.x, q.y, b.x, b.y) < dist(best.x, best.y, b.x, b.y) ? q : best));
        poi.benches.push({ bench: b, node: n, park: false });
      }
    }
  }
  // landmarks tourists come to photograph
  poi.landmarks = [];
  for (const l of world.landmarks || []) { const sw = G.attach(l.x, l.y, 5); if (sw) poi.landmarks.push(sw); }
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
