// The big central park: the middle 2x2 blocks plus the streets they swallowed.
// Builds the ground (lawns, lake, paths), the walls and gates, fountain, dock, dog run,
// trees, lamps and benches, and describes the path network for pedestrians (world.parkNet).

import { T, CURB, parkRect } from './layout.js';
import { GC } from './ground.js';
import { MAT, GRP } from './mesh.js';
import { RNG, hash2i, valueNoise, shade, mixc } from '../core/math.js';
import { sharedTex } from './buildings.js';
import { propTex, parkLamp, trashBasket, chainFence, parkWall } from './props.js';
import { stoneFill } from './facades.js';

const PI = Math.PI;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

// Catmull-Rom spline through control points (passes through every point)
export function spline(cp, per = 8) {
  if (cp.length < 3) return cp.map((p) => [p[0], p[1]]);
  const out = [];
  const P = (i) => cp[Math.max(0, Math.min(cp.length - 1, i))];
  for (let i = 0; i < cp.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([cp[cp.length - 1][0], cp[cp.length - 1][1]]);
  return out;
}

export function polyLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return L;
}

// point + unit direction at arc length s along a polyline
export function along(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const L = dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (s <= L || i === pts.length - 1) {
      const t = L > 0 ? Math.min(1, s / L) : 0;
      const dx = (pts[i][0] - pts[i - 1][0]) / (L || 1), dy = (pts[i][1] - pts[i - 1][1]) / (L || 1);
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, dx, dy };
    }
    s -= L;
  }
  const p = pts[pts.length - 1];
  return { x: p[0], y: p[1], dx: 1, dy: 0 };
}

// points every ~step along the polyline, always including both ends
export function resample(pts, step) {
  const L = polyLen(pts);
  const n = Math.max(1, Math.round(L / step));
  const out = [];
  for (let k = 0; k <= n; k++) { const a = along(pts, (L * k) / n); out.push([a.x, a.y]); }
  out[0] = [pts[0][0], pts[0][1]];
  out[n] = [pts[pts.length - 1][0], pts[pts.length - 1][1]];
  return out;
}

export function roundedRect(x0, y0, x1, y1, r, step = 0.4) {
  const pts = [];
  const line = (ax, ay, bx, by) => { const n = Math.max(1, Math.ceil(dist(ax, ay, bx, by) / step)); for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n]); };
  const arc = (ccx, ccy, a0, a1) => { const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / step)); for (let i = 0; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([ccx + Math.cos(a) * r, ccy + Math.sin(a) * r]); } };
  line(x0 + r, y0, x1 - r, y0); arc(x1 - r, y0 + r, -PI / 2, 0);
  line(x1, y0 + r, x1, y1 - r); arc(x1 - r, y1 - r, 0, PI / 2);
  line(x1 - r, y1, x0 + r, y1); arc(x0 + r, y1 - r, PI / 2, PI);
  line(x0, y1 - r, x0, y0 + r); arc(x0 + r, y0 + r, PI, 1.5 * PI);
  return pts;
}

export function ellipsePts(ecx, ecy, rx, ry, step = 0.4) {
  const n = Math.max(16, Math.ceil((2 * PI * Math.max(rx, ry)) / step));
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * PI; pts.push([ecx + Math.cos(a) * rx, ecy + Math.sin(a) * ry]); }
  return pts;
}

// Split a closed polyline at the points nearest the given junctions.
// Returns the pieces (each from one junction to the next) and the snapped junction points.
export function splitClosed(pts, js) {
  const n = pts.length;
  const idx = js.map(([x, y]) => {
    let b = 0, bd = 1e9;
    for (let i = 0; i < n; i++) { const d = dist(pts[i][0], pts[i][1], x, y); if (d < bd) { bd = d; b = i; } }
    return b;
  });
  const sorted = [...new Set(idx)].sort((a, b) => a - b);
  const pieces = [];
  for (let k = 0; k < sorted.length; k++) {
    const a = sorted[k], b = sorted[(k + 1) % sorted.length];
    const seg = [];
    for (let i = a; ; i = (i + 1) % n) { seg.push(pts[i]); if (i === b) break; }
    pieces.push(seg);
  }
  return { pieces, at: idx.map((i) => pts[i]) };
}

// Path network: junction-to-junction polylines, resampled into nav nodes.
export class Net {
  constructor() { this.nodes = []; this.edges = []; this.strokes = []; }
  node(x, y, z) {
    for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i]; if (Math.abs(n.x - x) < 0.35 && Math.abs(n.y - y) < 0.35 && (z == null || n.z == null || Math.abs(n.z - z) < 0.3)) return i; }
    this.nodes.push(z == null ? { x, y } : { x, y, z });
    return this.nodes.length - 1;
  }
  edge(a, b) {
    if (a === b) return;
    if (!this.edges.some(([u, v]) => (u === a && v === b) || (u === b && v === a))) this.edges.push([a, b]);
  }
  // paint + walk a path; returns its node ids in order
  path(pts, w, o = {}) {
    if (w > 0) this.strokes.push({ pts, w, edge: o.edge ?? 2, kind: o.kind });
    const rs = resample(pts, o.step ?? 2.6);
    const ids = rs.map(([x, y], k) => this.node(x, y, o.z ? o.z(k / Math.max(1, rs.length - 1)) : undefined));
    for (let k = 1; k < ids.length; k++) this.edge(ids[k - 1], ids[k]);
    return ids;
  }
}

// ---------------------------------------------------------------------------
export function bigPark(C) {
  const R = parkRect();
  const W = C.world, mb = C.mb, g = W.ground.p;
  const rng = new RNG(4207);
  const S = sharedTex(C), P = propTex(C);
  const cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2;
  const inPark = (x, y, m = 0) => x > R.x0 + m && x < R.x1 - m && y > R.y0 + m && y < R.y1 - m;
  const net = new Net();

  // ---- dimensions -----------------------------------------------------------
  const gateHalf = 1.5, cornerCut = 2.8;
  const loopIn = 2.4, loopR = 4.5, loopW = 1.6;
  const plazaR = 6.0, basinR = 3.4, ringR = 4.7;
  const axisW = 2.0, mallW = 2.6;
  const lx0 = R.x0 + loopIn, ly0 = R.y0 + loopIn, lx1 = R.x1 - loopIn, ly1 = R.y1 - loopIn;
  const q = 10.5; // quadrant feature offset from the centre
  // great lawn (NW)
  const GL = { x: cx - q, y: cy - q, rx: 5.8, ry: 5.0 };
  const glRx = GL.rx + 0.95, glRy = GL.ry + 0.95;
  // lake (NE): union of ellipses
  const lobes = [
    { x: cx + 11.0, y: cy - 11.5, rx: 6.3, ry: 4.4 },
    { x: cx + 14.7, y: cy - 7.5, rx: 3.2, ry: 3.3 },
    { x: cx + 6.1, y: cy - 7.9, rx: 3.0, ry: 2.7 },
  ];
  const island = { x: cx + 5.9, y: cy - 8.0, r: 0.85 };
  const lakeF = (x, y) => {
    let f = -1e9;
    for (const l of lobes) { const dx = (x - l.x) / l.rx, dy = (y - l.y) / l.ry; f = Math.max(f, 1 - dx * dx - dy * dy); }
    return f + (valueNoise(x * 0.9, y * 0.9, 61) - 0.5) * 0.16;
  };
  // statue garden (SW) and dog run (SE)
  const SG = { x: cx - q, y: cy + q, r: 2.8 };
  const DR = { x0: cx + 9.1, y0: cy + 10.1, x1: cx + 18.1, y1: cy + 18.1 };
  const meadow = { x0: R.x0 + 4.4, y0: cy + 2.2, x1: SG.x - 2.0, y1: SG.y - 2.4 };

  // ---- path network -----------------------------------------------------------
  const arcMid = (sx, sy) => [sx < 0 ? lx0 + loopR * (1 - Math.SQRT1_2) : lx1 - loopR * (1 - Math.SQRT1_2), sy < 0 ? ly0 + loopR * (1 - Math.SQRT1_2) : ly1 - loopR * (1 - Math.SQRT1_2)];
  const loopJ = [
    [cx, ly0], [lx1, cy], [cx, ly1], [lx0, cy], // axis crossings
    arcMid(-1, -1), arcMid(1, -1), arcMid(1, 1), arcMid(-1, 1), // corner gates
    [lx0, SG.y], [SG.x, ly1], // statue garden spokes
  ];
  const loop = splitClosed(roundedRect(lx0, ly0, lx1, ly1, loopR), loopJ);
  const perimeter = [];
  for (const piece of loop.pieces) for (const id of net.path(piece, loopW, { step: 2.8 })) if (perimeter[perimeter.length - 1] !== id && perimeter[0] !== id) perimeter.push(id);
  const [LN, LE, LS, LW, CNW, CNE, CSE, CSW, LSGW, LSGS] = loop.at;

  // plaza ring around the fountain
  const ring = [];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * 2 * PI - PI / 2; ring.push(net.node(cx + Math.cos(a) * ringR, cy + Math.sin(a) * ringR)); }
  for (let k = 0; k < 8; k++) net.edge(ring[k], ring[(k + 1) % 8]);
  const rN = [cx, cy - ringR], rE = [cx + ringR, cy], rS = [cx, cy + ringR], rW = [cx - ringR, cy];

  // gates: inner node on the wall line, outer point on the sidewalk
  const gates = [];
  const gate = (x, y, sx, sy, corner = false) => { gates.push({ node: net.node(x, y), sx, sy, corner }); };
  gate(cx, R.y0, cx, R.y0 - 1.0); gate(cx, R.y1, cx, R.y1 + 1.0);
  gate(R.x0, cy, R.x0 - 1.0, cy); gate(R.x1, cy, R.x1 + 1.0, cy);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const gx = sx < 0 ? R.x0 + 0.3 : R.x1 - 0.3, gy = sy < 0 ? R.y0 + 0.3 : R.y1 - 0.3;
    gate(gx, gy, sx < 0 ? R.x0 - 1 : R.x1 + 1, sy < 0 ? R.y0 - 1 : R.y1 + 1, true);
    net.path([[gx, gy], arcMid(sx, sy)], loopW);
  }
  // north axis: gate -> loop -> lawn spur -> plaza
  const NJ = [cx, GL.y];
  net.path([[cx, R.y0], LN], axisW);
  net.path([LN, NJ], axisW);
  net.path([NJ, rN], axisW);
  // west axis: gate -> loop -> lawn/garden crossing -> plaza
  const WJ = [GL.x, cy];
  net.path([[R.x0, cy], LW], axisW);
  net.path([LW, WJ], axisW);
  net.path([WJ, rW], axisW);
  // east axis: gate -> loop -> ramble -> dock spur -> plaza
  const EJ1 = [cx + 17.0, cy], EJ2 = [cx + 10.0, cy];
  net.path([[R.x1, cy], LE], axisW);
  net.path([LE, EJ1], axisW);
  net.path([EJ1, EJ2], axisW);
  net.path([EJ2, rE], axisW);
  // the Mall (south): a wide elm-lined promenade from the south gate to the fountain
  const MJ = [cx, SG.y];
  net.path([[cx, R.y1], LS], mallW);
  net.path([LS, MJ], mallW);
  net.path([MJ, rS], mallW);
  // great lawn ring + spurs
  const gl = splitClosed(ellipsePts(GL.x, GL.y, glRx, glRy), [[GL.x + glRx, GL.y], [GL.x, GL.y + glRy], [GL.x - glRx * Math.SQRT1_2, GL.y - glRy * Math.SQRT1_2]]);
  const glRing = [];
  for (const piece of gl.pieces) glRing.push(...net.path(piece, 1.2, { step: 2.4 }));
  net.path([gl.at[0], NJ], 1.4);
  net.path([gl.at[1], WJ], 1.4);
  net.path(spline([gl.at[2], [gl.at[2][0] - 1.6, gl.at[2][1] - 1.0], CNW]), 1.3);
  // statue garden: a small round plaza with four winding spokes
  const sgN = [SG.x, SG.y - 2.2], sgE = [SG.x + 2.2, SG.y], sgS = [SG.x, SG.y + 2.2], sgW = [SG.x - 2.2, SG.y];
  const sgRing = [sgN, sgE, sgS, sgW].map(([x, y]) => net.node(x, y));
  for (let k = 0; k < 4; k++) net.edge(sgRing[k], sgRing[(k + 1) % 4]);
  net.path(spline([WJ, [SG.x - 0.9, cy + 3.2], [SG.x + 0.8, cy + 6.0], sgN]), 1.4);
  net.path(spline([MJ, [cx - 3.5, SG.y + 0.5], [cx - 6.5, SG.y - 0.4], sgE]), 1.6);
  net.path(spline([sgW, [SG.x - 4.2, SG.y + 0.6], LSGW]), 1.3);
  net.path(spline([sgS, [SG.x + 0.7, SG.y + 4.6], LSGS]), 1.3);
  // the Ramble: a winding woodland path from the Mall to the east axis, with the dog run off it
  const RJ = [cx + 11.5, cy + 6.1];
  net.path(spline([MJ, [cx + 2.8, SG.y - 0.3], [cx + 5.2, cy + 8.2], [cx + 8.3, cy + 6.6], RJ]), 1.3, { step: 2.4 });
  net.path(spline([RJ, [cx + 14.2, cy + 5.4], [cx + 16.2, cy + 3.0], EJ1]), 1.3, { step: 2.4 });
  const dogGateXY = [(DR.x0 + DR.x1) / 2 - 1.5, DR.y0 - 0.5];
  const dogPath = net.path([RJ, [RJ[0], RJ[1] + 1.4], [dogGateXY[0], dogGateXY[1] - 0.4]], 1.2);
  const dogGate = dogPath[dogPath.length - 1];
  // lake dock spur
  const dockX = EJ2[0], dockRoot = [dockX, cy - 5.6];
  const dockIds = net.path([EJ2, dockRoot], 1.2);
  const dockEnd = net.node(dockX, cy - 7.4);
  net.edge(dockIds[dockIds.length - 1], dockEnd);

  // ---- ground -------------------------------------------------------------------
  const P0 = { x0: R.x0, y0: R.y0, x1: R.x1, y1: R.y1 };
  C.paintGround(P0.x0, P0.y0, P0.x1, P0.y1, 'grass');
  // woodland floor in the Ramble (SE) and around the lake's far shore
  C.paintWhere(cx + 1.5, cy + 1.5, R.x1, R.y1, (x, y) => valueNoise(x * 0.18, y * 0.18, 62) > 0.32, 'woods');
  C.paintWhere(cx + 1.5, R.y0, R.x1, cy - 1.5, (x, y) => valueNoise(x * 0.2, y * 0.2, 63) > 0.62 && lakeF(x, y) < -0.6, 'woods');
  // mown lawns
  C.paintWhere(GL.x - GL.rx, GL.y - GL.ry, GL.x + GL.rx, GL.y + GL.ry, (x, y) => ((x - GL.x) / GL.rx) ** 2 + ((y - GL.y) / GL.ry) ** 2 <= 1, 'lawn');
  C.paintGround(meadow.x0, meadow.y0, meadow.x1, meadow.y1, 'lawn');
  // lake: rocky shore, water, island
  const lb = { x0: Math.min(...lobes.map((l) => l.x - l.rx)) - 1, y0: Math.min(...lobes.map((l) => l.y - l.ry)) - 1, x1: Math.max(...lobes.map((l) => l.x + l.rx)) + 1, y1: Math.max(...lobes.map((l) => l.y + l.ry)) + 1 };
  C.paintWhere(lb.x0, lb.y0, lb.x1, lb.y1, (x, y) => lakeF(x, y) > -0.2, 'shore');
  C.paintWhere(lb.x0, lb.y0, lb.x1, lb.y1, (x, y) => lakeF(x, y) > 0, 'water');
  C.paintWhere(island.x - 1.3, island.y - 1.3, island.x + 1.3, island.y + 1.3, (x, y) => dist(x, y, island.x, island.y) < island.r + 0.3, 'shore');
  C.paintWhere(island.x - 1.3, island.y - 1.3, island.x + 1.3, island.y + 1.3, (x, y) => dist(x, y, island.x, island.y) < island.r, 'woods');
  // dog run
  C.paintGround(DR.x0, DR.y0, DR.x1, DR.y1, 'dirt');
  C.paintWhere(DR.x0, DR.y0, DR.x1, DR.y1, (x, y) => valueNoise(x * 0.6, y * 0.6, 64) > 0.6, 'gravel');
  // formal flower garden (SW room): gravel walks between beds
  const FG = { x0: R.x0 + 4.0, y0: SG.y + 2.6, x1: SG.x - 2.3, y1: R.y1 - 4.0 };
  C.paintGround(FG.x0, FG.y0, FG.x1, FG.y1, 'gravel');
  {
    const bw = (FG.x1 - FG.x0 - 0.6 * 4) / 3, bh = (FG.y1 - FG.y0 - 0.6 * 3) / 2;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const x0 = FG.x0 + 0.6 + i * (bw + 0.6), y0 = FG.y0 + 0.6 + j * (bh + 0.6);
      C.paintGround(x0, y0, x0 + bw, y0 + bh, 'flowerbed');
    }
  }
  // paths: granite edges first, then the paving, clipped to the park
  for (const pass of [0, 1]) for (const s of net.strokes) {
    const hw = s.w / 2 + (pass === 0 ? s.edge / T : 0);
    const kind = pass === 0 ? 'pathEdge' : 'path';
    const pts = s.pts.length > 2 ? resample(s.pts, 0.5) : s.pts;
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
      C.paintWhere(Math.min(ax, bx) - hw, Math.min(ay, by) - hw, Math.max(ax, bx) + hw, Math.max(ay, by) + hw,
        (x, y) => inPark(x, y) && segDist(x, y, ax, ay, bx, by) <= hw, kind);
    }
  }
  // paved plazas: the fountain terrace, the statue garden and the corner entrances
  radialPlaza(C, cx, cy, plazaR, 0.6);
  radialPlaza(C, SG.x, SG.y, SG.r, 0.0);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const ex = sx < 0 ? R.x0 : R.x1, ey = sy < 0 ? R.y0 : R.y1;
    C.paintWhere(ex - 3, ey - 3, ex + 3, ey + 3, (x, y) => inPark(x, y) && dist(x, y, ex, ey) < 2.9, 'pathEdge');
    C.paintWhere(ex - 3, ey - 3, ex + 3, ey + 3, (x, y) => inPark(x, y) && dist(x, y, ex, ey) < 2.8, 'plaza');
  }
  // flowerbed ring round the statue
  C.paintWhere(SG.x - 1.7, SG.y - 1.7, SG.x + 1.7, SG.y + 1.7, (x, y) => { const d = dist(x, y, SG.x, SG.y); return d < 1.65 && d > 0.75; }, 'flowerbed');

  // ---- walls & gates ---------------------------------------------------------------
  const wt = 0.25;
  const pillar = (x, y) => {
    mb.box(x - 0.26, y - 0.26, CURB, x + 0.26, y + 0.26, CURB + 1.15, { px: S.limestone, nx: S.limestone, py: S.limestone, ny: S.limestone, pz: { t: S.limeTop } });
    mb.box(x - 0.33, y - 0.33, CURB + 1.15, x + 0.33, y + 0.33, CURB + 1.27, { px: S.limestone, nx: S.limestone, py: S.limestone, ny: S.limestone, pz: { t: S.limeTop } });
    mb.pyramid(x - 0.2, y - 0.2, x + 0.2, y + 0.2, CURB + 1.27, CURB + 1.45, S.limestone);
  };
  const sideRun = (a0, a1, mid) => [[a0 + cornerCut, mid - gateHalf], [mid + gateHalf, a1 - cornerCut]];
  for (const [a, b] of sideRun(R.x0, R.x1, cx)) {
    parkWall(C, a, R.y0, b, R.y0 + wt); parkWall(C, a, R.y1 - wt, b, R.y1);
    for (const x of [a, b]) { pillar(x, R.y0 + wt / 2); pillar(x, R.y1 - wt / 2); }
  }
  for (const [a, b] of sideRun(R.y0, R.y1, cy)) {
    parkWall(C, R.x0, a, R.x0 + wt, b); parkWall(C, R.x1 - wt, a, R.x1, b);
    for (const y of [a, b]) { pillar(R.x0 + wt / 2, y); pillar(R.x1 - wt / 2, y); }
  }

  // ---- fountain ----------------------------------------------------------------------
  {
    const wz = CURB + 0.42;
    ringWall(C, cx, cy, basinR, 0.32, 0.55, 28);
    waterDisc(C, cx, cy, basinR - 0.16, wz, 28);
    mb.cylinder(cx, cy, CURB, CURB + 1.0, 0.5, 12, S.limestone, null);
    mb.cylinder(cx, cy, CURB + 1.0, CURB + 1.2, 1.35, 16, S.limestone, S.limeTop);
    waterDisc(C, cx, cy, 1.18, CURB + 1.21, 16);
    // the upper tier comes off for winter, when the Christmas tree stands in the lower bowl
    const up = { group: GRP.NOT_WINTER };
    mb.cylinder(cx, cy, CURB + 1.2, CURB + 1.9, 0.24, 10, S.limestone, null, up);
    mb.cylinder(cx, cy, CURB + 1.9, CURB + 2.02, 0.66, 12, S.limestone, S.limeTop, up);
    waterDisc(C, cx, cy, 0.54, CURB + 2.03, 12, GRP.NOT_WINTER);
    mb.cylinder(cx, cy, CURB + 2.02, CURB + 2.3, 0.1, 8, S.limestone, S.limeTop, up);
    W.fountains.push({ x: cx, y: cy, z: CURB + 2.3, kind: 'tiered', r: basinR, floor: wz, bowls: [{ r: 0.66, z: CURB + 2.02 }, { r: 1.35, z: CURB + 1.2 }] });
    W.lamps.push({ x: cx, y: cy, z: CURB + 0.8, r: 4.2, color: [0.75, 0.88, 1.0], k: 0.55, kind: 'park' });
    W.parkCenter = { x: cx, y: cy, z: CURB + 1.2, flock: [cx + ringR + 0.2, cy + 1.6] };
  }
  // planters at the terrace diagonals
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + (k * PI) / 2;
    C.addPlanter(cx + Math.cos(a) * 5.15, cy + Math.sin(a) * 5.15);
  }

  // ---- statue -------------------------------------------------------------------------
  mb.box(SG.x - 0.62, SG.y - 0.62, CURB, SG.x + 0.62, SG.y + 0.62, CURB + 0.25, { px: S.greystone, nx: S.greystone, py: S.greystone, ny: S.greystone, pz: { t: S.limeTop } });
  mb.box(SG.x - 0.5, SG.y - 0.5, CURB + 0.25, SG.x + 0.5, SG.y + 0.5, CURB + 1.4, { px: S.greystone, nx: S.greystone, py: S.greystone, ny: S.greystone, pz: { t: S.limeTop } });
  C.addSprite('statue', SG.x, SG.y, CURB + 1.4);

  // ---- dog run --------------------------------------------------------------------------
  {
    const gx = dogGateXY[0];
    chainFence(C, DR.x0, DR.y0, gx - 0.6, DR.y0, 1.1, true);
    chainFence(C, gx + 0.6, DR.y0, DR.x1, DR.y0, 1.1, true);
    chainFence(C, DR.x0, DR.y0, DR.x0, DR.y1, 1.1, true);
    chainFence(C, DR.x1, DR.y0, DR.x1, DR.y1, 1.1, true);
    chainFence(C, DR.x0, DR.y1, DR.x1, DR.y1, 1.1, true);
    W.dogRun = { x0: DR.x0 + 0.4, y0: DR.y0 + 0.4, x1: DR.x1 - 0.4, y1: DR.y1 - 0.4, gate: { x: gx, y: DR.y0 - 0.25 } };
    // a few logs and a water bowl for the dogs
    mb.cylinder(DR.x1 - 2.2, DR.y1 - 1.6, CURB, CURB + 0.25, 0.22, 6, S.wood, S.wood);
    mb.box(DR.x0 + 1.4, DR.y1 - 2.4, CURB, DR.x0 + 3.0, DR.y1 - 2.0, CURB + 0.3, { px: S.wood, nx: S.wood, py: S.wood, ny: S.wood, pz: S.wood });
  }

  // ---- lake: dock, boats, rocks ----------------------------------------------------------
  W.pond = { x: lobes[0].x + 0.5, y: lobes[0].y + 0.2, rx: 5.0, ry: 3.4 };
  {
    const deck = C.atlas.shared('dock_deck', 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const plank = y >> 3;
        let c = shade(plank % 2 ? 0x8a6444 : 0x9a7250, 0.92 + hash2i(x >> 3, plank, 4) * 0.12);
        if (y % 8 === 7) c = 0x4a3424;
        if ((x === 4 || x === 20) && y % 8 === 3) c = 0x3a3a3a;
        p.set(x, y, c);
      }
    });
    const y0 = cy - 8.0, y1 = cy - 5.2, x0 = dockX - 0.6, x1 = dockX + 0.6;
    mb.box(x0, y0, CURB - 0.1, x1, y1, CURB + 0.05, { px: S.wood, nx: S.wood, py: S.wood, ny: S.wood, pz: { t: deck, world: true } });
    for (const [px, py] of [[x0, y0], [x1, y0], [x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]]) mb.cylinder(px, py, CURB - 0.1, CURB + 0.4, 0.07, 6, S.wood, S.wood);
    boat(C, x0 - 0.45, y0 + 1.0, PI / 2 + 0.12, 0xc8302c);
    boat(C, x1 + 0.45, y0 + 0.8, PI / 2 - 0.1, 0x2a6aa0);
    boat(C, x1 + 1.45, y0 + 1.45, PI / 2 + 0.2, 0x2f7a46);
  }
  const rockTex = C.atlas.shared('schist', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const band = Math.sin((x * 0.35 + y * 0.9) + valueNoise(x * 0.2, y * 0.2, 5) * 3);
      let c = band > 0.6 ? 0x8a8780 : band < -0.5 ? 0x5e5c58 : 0x74716a;
      if (hash2i(x >> 1, y >> 1, 9) > 0.93) c = 0xa0a49a; // mica glint
      if (hash2i(x >> 2, y >> 2, 10) > 0.9) c = mixc(c, 0x8a9a5a, 0.5); // lichen
      p.set(x, y, shade(c, 0.92 + hash2i(x, y, 11) * 0.14));
    }
  });
  const rock = (x, y, r, h) => {
    const a = rng.range(0, PI);
    mb.cylinder(x, y, CURB - 0.05, CURB + h * 0.55, r, 6, rockTex, null, { angle: a });
    mb.cone(x, y, CURB + h * 0.55, CURB + h, r, 6, rockTex, { angle: a, mat: MAT.SNOW });
  };
  // outcrop by the Ramble, boulders along the lake shore and on the island
  for (const [x, y, r, h] of [[cx + 6.6, cy + 4.6, 0.9, 0.9], [cx + 7.7, cy + 3.7, 0.6, 0.6], [cx + 5.6, cy + 5.4, 0.5, 0.45], [cx + 8.4, cy + 5.0, 0.45, 0.4]]) rock(x, y, r, h);
  for (let k = 0; k < 40 && W.trees.length >= 0; k++) {
    const l = rng.pick(lobes), a = rng.range(0, 2 * PI);
    const x = l.x + Math.cos(a) * (l.rx + 0.15), y = l.y + Math.sin(a) * (l.ry + 0.15);
    const f = lakeF(x, y);
    if (f > -0.22 && f < 0.02 && rng.chance(0.4) && dist(x, y, dockX, cy - 6.5) > 2) rock(x, y, rng.range(0.25, 0.45), rng.range(0.2, 0.4));
  }
  rock(island.x + 0.55, island.y + 0.35, 0.35, 0.3);

  // ---- trees ----------------------------------------------------------------------------------
  const trees = [];
  const lamps = [];
  const benches = [];
  const groundAt = (x, y) => g.getA(Math.floor(x * T), Math.floor(y * T));
  const soft = (x, y) => groundAt(x, y) === GC.GRASS;
  const inLawn = (x, y, m = 0.6) => ((x - GL.x) / (GL.rx + m)) ** 2 + ((y - GL.y) / (GL.ry + m)) ** 2 <= 1
    || (x > meadow.x0 - m && x < meadow.x1 + m && y > meadow.y0 - m && y < meadow.y1 + m);
  const clearOf = (x, y, r) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dy]) => soft(x + dx, y + dy));
  const tree = (x, y, sp, scale) => {
    trees.push({ x, y });
    C.addTree(x, y, sp, false, { scale: scale ?? rng.range(1.0, 1.3) });
  };
  const roomFor = (x, y, d) => trees.every((t) => dist(t.x, t.y, x, y) >= d);
  // the Mall's elm allee
  for (let y = cy + plazaR + 1.4; y < ly1 - 1.0; y += 2.45) {
    if (Math.abs(y - SG.y) < 1.4) continue;
    for (const sx of [-1, 1]) tree(cx + sx * (mallW / 2 + 1.25), y, 'elm', rng.range(1.0, 1.15));
  }
  // a row of trees just inside the wall
  for (const side of [0, 1, 2, 3]) {
    const len = R.x1 - R.x0;
    for (let t = cornerCut + 1.4; t < len - cornerCut - 1.2; t += rng.range(2.7, 3.3)) {
      if (Math.abs(t - len / 2) < gateHalf + 1.4) continue;
      const off = 1.0 + rng.range(-0.1, 0.15);
      const [x, y] = side === 0 ? [R.x0 + t, R.y0 + off] : side === 1 ? [R.x1 - off, R.y0 + t] : side === 2 ? [R.x1 - t, R.y1 - off] : [R.x0 + off, R.y1 - t];
      if (!soft(x, y) || !roomFor(x, y, 2.3)) continue;
      tree(x, y, rng.pick(['plane', 'plane', 'oak', 'elm', 'locust']));
    }
  }
  // the island's willow-like elm
  tree(island.x - 0.15, island.y - 0.1, 'elm', 0.9);

  // ---- lamps & benches along the paths --------------------------------------------------------
  const nearPath = (x, y, m) => net.strokes.some((s) => { for (let k = 1; k < s.pts.length; k++) if (segDist(x, y, s.pts[k - 1][0], s.pts[k - 1][1], s.pts[k][0], s.pts[k][1]) < s.w / 2 + m) return true; return false; });
  const lampOk = (x, y) => soft(x, y) && !inLawn(x, y, 0.2) && lamps.every((l) => dist(l.x, l.y, x, y) > 6.0) && trees.every((t) => dist(t.x, t.y, x, y) > 0.9) && !nearPath(x, y, 0.25);
  for (let k = 0; k < 4; k++) { const a = PI / 4 + (k * PI) / 2; const x = cx + Math.cos(a) * (plazaR + 0.5), y = cy + Math.sin(a) * (plazaR + 0.5); parkLamp(C, x, y); lamps.push({ x, y }); }
  for (const s of net.strokes) {
    const L = polyLen(s.pts);
    if (L < 3) continue;
    let k = 0;
    for (let d = Math.min(3.0, L / 2); d < L - 1.0; d += 6.5, k++) {
      for (const side of k % 2 ? [1, -1] : [-1, 1]) {
        const a = along(s.pts, d);
        const off = s.w / 2 + 0.38;
        const x = a.x - a.dy * off * side, y = a.y + a.dx * off * side;
        if (inPark(x, y, 0.6) && lampOk(x, y)) { parkLamp(C, x, y); lamps.push({ x, y }); break; }
      }
    }
  }
  const benchAt = (x, y, axis, facing) => {
    const fx = axis === 'x' ? [x - 0.8, x + 0.8] : [x - 0.25, x + 0.25], fy = axis === 'x' ? [y - 0.25, y + 0.25] : [y - 0.8, y + 0.8];
    for (const bx of fx) for (const by of fy) if (!inPark(bx, by, 0.3)) return false;
    if (benches.some((b) => dist(b.x, b.y, x, y) < 2.2) || lamps.some((l) => dist(l.x, l.y, x, y) < 1.1) || trees.some((t) => dist(t.x, t.y, x, y) < 0.7)) return false;
    C.addBench(x, y, axis, facing);
    benches.push({ x, y });
    return true;
  };
  // terrace benches facing the fountain
  for (let k = 0; k < 8; k++) {
    const a = PI / 4 + (k % 2 ? 0.36 : -0.36) + Math.floor(k / 2) * (PI / 2);
    const x = cx + Math.cos(a) * 5.0, y = cy + Math.sin(a) * 5.0;
    if (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))) benchAt(x, y, 'y', -Math.sign(Math.cos(a)));
    else benchAt(x, y, 'x', -Math.sign(Math.sin(a)));
  }
  // along the Mall, between the elms, facing the promenade
  for (let y = cy + plazaR + 2.6; y < ly1 - 1.5; y += 2.45) {
    if (Math.abs(y - SG.y) < 1.6) continue;
    benchAt(cx - mallW / 2 - 0.5, y, 'y', 1);
    benchAt(cx + mallW / 2 + 0.5, y, 'y', -1);
  }
  // facing the lake and the great lawn
  for (const y of [cy - 15.0, cy - 9.5]) benchAt(cx + axisW / 2 + 0.5, y, 'y', 1);
  for (const x of [cx + 13.5]) benchAt(x, cy - axisW / 2 - 0.5, 'x', -1);
  for (const y of [cy - 14.0, cy - 6.5]) benchAt(cx - axisW / 2 - 0.5, y, 'y', -1);
  for (const x of [cx - 15.5, cx - 6.0]) benchAt(x, cy - axisW / 2 - 0.5, 'x', -1);
  // statue garden
  benchAt(SG.x - 2.0, SG.y - 3.4, 'x', 1);
  benchAt(SG.x + 3.4, SG.y + 2.0, 'y', -1);
  // a few along the loop
  for (const [x, y, ax, f] of [[lx0 + 1.3, cy - 8, 'y', -1], [lx1 - 1.3, cy + 6, 'y', 1], [cx - 8, ly1 - 1.3, 'x', 1], [cx + 8, ly0 + 1.3, 'x', -1], [lx0 + 1.3, cy + 16, 'y', -1]]) benchAt(x, y, ax, f);
  // litter baskets at junctions
  for (const [x, y] of [[cx + 1.4, ly0 + 1.4], [cx - 1.6, ly1 - 1.6], [lx0 + 1.4, cy + 1.4], [lx1 - 1.4, cy - 1.4], [cx + 6.3, cy + 1.2], [cx - 6.3, cy - 1.2], [SG.x + 2.6, SG.y - 2.6], [cx + 1.6, cy + 10.5 + 1.6]]) if (soft(x, y)) trashBasket(C, x, y);

  // ---- more trees: groves and woodland filling the rest -------------------------------------------
  const zone = (x, y) => {
    if (x > DR.x0 - 0.8 && x < DR.x1 + 0.8 && y > DR.y0 - 0.8 && y < DR.y1 + 0.8) return null;
    if (x > cx + 1 && y > cy + 1) return { d: 0.97, sp: ['oak', 'elm', 'pine', 'oak', 'locust', 'pine'] };
    if (x > cx + 1 && y < cy - 1) return { d: 0.7, sp: ['elm', 'locust', 'plane', 'cherry'] };
    if (x < cx - 1 && y < cy - 1) return { d: 0.75, sp: ['plane', 'oak', 'elm', 'locust'] };
    if (x > SG.x + 1.5 && y < SG.y - 1) return { d: 0.97, sp: ['cherry', 'cherry', 'cherry', 'locust'] };
    return { d: 0.7, sp: ['oak', 'plane', 'cherry', 'elm'] };
  };
  const gs = 2.0;
  for (let y = R.y0 + 1.2; y < R.y1 - 1.0; y += gs)
    for (let x = R.x0 + 1.2; x < R.x1 - 1.0; x += gs) {
      const tx = x + (hash2i(Math.round(x * 10), Math.round(y * 10), 71) - 0.5) * 1.3;
      const ty = y + (hash2i(Math.round(x * 10), Math.round(y * 10), 72) - 0.5) * 1.3;
      const z = zone(tx, ty);
      if (!z || hash2i(Math.round(tx * 7), Math.round(ty * 7), 73) > z.d) continue;
      if (inLawn(tx, ty) || !clearOf(tx, ty, 0.55) || nearPath(tx, ty, 0.35) || lakeF(tx, ty) > -0.45 || dist(tx, ty, cx, cy) < plazaR + 1.2) continue;
      if (!roomFor(tx, ty, 2.05) || lamps.some((l) => dist(l.x, l.y, tx, ty) < 1.0) || benches.some((b) => dist(b.x, b.y, tx, ty) < 1.1)) continue;
      const sp = z.sp[Math.floor(hash2i(Math.round(tx * 3), Math.round(ty * 3), 74) * z.sp.length)];
      tree(tx, ty, sp);
    }

  // ---- data for the simulation ----------------------------------------------------------------------
  const inset = (r, m) => ({ x0: r.x0 + m, y0: r.y0 + m, x1: r.x1 - m, y1: r.y1 - m });
  W.lawns = [
    { x0: GL.x - GL.rx * 0.68, y0: GL.y - GL.ry * 0.68, x1: GL.x + GL.rx * 0.68, y1: GL.y + GL.ry * 0.68 },
    inset(meadow, 0.4),
  ];
  W.park = { ...R, cx, cy };
  const nearestNode = (x, y) => { let b = 0, bd = 1e9; net.nodes.forEach((n, i) => { const d = dist(n.x, n.y, x, y); if (d < bd) { bd = d; b = i; } }); return b; };
  W.parkNet = {
    nodes: net.nodes, edges: net.edges, gates,
    paths: net.nodes.map((_, i) => i),
    ring, perimeter,
    lawnNodes: [gl.at[0], gl.at[1], [meadow.x1, (meadow.y0 + meadow.y1) / 2]].map(([x, y]) => nearestNode(x, y)),
    pond: dockEnd, dogGate,
  };
  void glRing; void sgRing;
}

// Raised ring wall (fountain basin)
export function ringWall(C, x, y, r, w, h, n = 16) {
  const S = sharedTex(C);
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * 2 * PI, a1 = ((k + 1) / n) * 2 * PI;
    const ri = r - w / 2, ro = r + w / 2;
    const p = (rr, a) => [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
    const [o0, o1, i0, i1] = [p(ro, a0), p(ro, a1), p(ri, a0), p(ri, a1)];
    // outer face, inner face, top
    C.mb.quad([o1[0], o1[1], CURB + h], [o0[0], o0[1], CURB + h], [o0[0], o0[1], CURB], [o1[0], o1[1], CURB],
      [[0, 0], [dist(o0[0], o0[1], o1[0], o1[1]) * T, 0], [dist(o0[0], o0[1], o1[0], o1[1]) * T, h * T], [0, h * T]], S.limestone, [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0]);
    C.mb.quad([i0[0], i0[1], CURB + h], [i1[0], i1[1], CURB + h], [i1[0], i1[1], CURB], [i0[0], i0[1], CURB],
      [[0, 0], [dist(i0[0], i0[1], i1[0], i1[1]) * T, 0], [dist(i0[0], i0[1], i1[0], i1[1]) * T, h * T], [0, h * T]], S.limestone, [-Math.cos((a0 + a1) / 2), -Math.sin((a0 + a1) / 2), 0]);
    C.mb.quad([o0[0], o0[1], CURB + h], [o1[0], o1[1], CURB + h], [i1[0], i1[1], CURB + h], [i0[0], i0[1], CURB + h],
      [o0, o1, i1, i0].map((q) => [q[0] * T, q[1] * T]), S.limeTop, [0, 0, 1], MAT.SNOW | MAT.WET);
  }
}

// Flat disc sampling the ground texture (so it shades as water / ice) at height z
export function waterDisc(C, x, y, r, z, n, group = GRP.ALWAYS) {
  const gt = C.world.ground;
  const ox = x * T, oy = y * T;
  // paint water under it so the ground texture holds the water code
  C.paintWhere(x - r - 0.1, y - r - 0.1, x + r + 0.1, y + r + 0.1, (wx, wy) => dist(wx, wy, x, y) <= r + 0.06, 'water');
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * 2 * PI, a1 = ((k + 1) / n) * 2 * PI;
    const p0 = [x + Math.cos(a0) * r, y + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y + Math.sin(a1) * r];
    C.mb.tri([x, y, z], [p0[0], p0[1], z], [p1[0], p1[1], z], [[ox, oy], [p0[0] * T, p0[1] * T], [p1[0] * T, p1[1] * T]], gt, [0, 0, 1], MAT.GROUND | MAT.WET, group);
  }
}

// Radially paved plaza: concentric courses of limestone setts with a darker band near the rim
export function radialPlaza(C, x, y, r, inner) {
  const g = C.world.ground.p;
  for (let ty = Math.floor((y - r) * T); ty < Math.ceil((y + r) * T); ty++)
    for (let tx = Math.floor((x - r) * T); tx < Math.ceil((x + r) * T); tx++) {
      const dx = (tx + 0.5) / T - x, dy = (ty + 0.5) / T - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < inner) continue;
      const rr = d * T;
      const course = Math.floor(rr / 18);
      const arc = (Math.atan2(dy, dx) + PI) * rr + course * 11;
      const h = hash2i(tx, ty, 41);
      let c;
      if (rr > r * T - 2) c = 0x8e8a80; // kerb
      else if (rr % 18 < 1.2 || arc % 22 < 1.2) c = 0x9a958a; // joints
      else {
        const t = hash2i(course, Math.floor(arc / 22), 42);
        const band = course % 5 === 3;
        c = band ? mixc(0xa8806a, 0x96705c, t) : mixc(0xd8d1c2, 0xc4bcac, t);
        c = shade(c, 0.97 + h * 0.06);
      }
      g.set(tx, ty, c, GC.PLAZA);
    }
}

// Little rowboat moored at the dock (hidden while the lake is frozen)
export function boat(C, x, y, ang, color) {
  const A = C.atlas;
  const side = A.shared(`boat_side_${color}`, 48, 9, (p) => {
    p.rect(0, 0, 48, 9, 0xf2efe6);
    p.rect(0, 0, 48, 2, color);
    p.hline(0, 2, 48, shade(color, 0.6));
    p.rect(0, 7, 48, 2, 0x8a8a84);
  });
  const top = A.shared('boat_top', 48, 20, (p) => {
    p.rect(0, 0, 48, 20, 0x8a6444);
    for (let yy = 0; yy < 20; yy += 4) p.hline(0, yy, 48, 0x6a4a30);
    for (const sx of [12, 26, 38]) p.rect(sx, 0, 4, 20, 0xb08a5a);
    p.frame(0, 0, 48, 20, 0xf2efe6);
  });
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const shape = [[-0.72, -0.27], [0.42, -0.27], [0.74, 0], [0.42, 0.27], [-0.72, 0.27]];
  const pts = shape.map(([u, v]) => [x + u * ca - v * sa, y + u * sa + v * ca]);
  const z0 = CURB - 0.02, z1 = CURB + 0.24;
  const opt = { group: GRP.NO_ICE, mat: 0 };
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    C.mb.vquad(a[0], a[1], b[0], b[1], z0, z1, side, opt);
  }
  // deck (interior with thwarts) as a fan
  const uv = (u, v) => [(u + 0.72) / 1.46 * 47, (v + 0.27) / 0.54 * 19];
  for (let k = 1; k < shape.length - 1; k++) {
    const [a, b, c] = [0, k, k + 1];
    C.mb.tri([pts[a][0], pts[a][1], z1 - 0.06], [pts[b][0], pts[b][1], z1 - 0.06], [pts[c][0], pts[c][1], z1 - 0.06],
      [uv(...shape[a]), uv(...shape[b]), uv(...shape[c])], top, [0, 0, 1], MAT.SNOW | MAT.WET, GRP.NO_ICE);
  }
}

void stoneFill;
