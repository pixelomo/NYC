// Central Park: five blocks long between the Upper West and Upper East Sides, laid out like the real
// one from north to south. Harlem Meer, the North Woods with the Loch and the Great Hill, the
// Conservatory Garden; the Reservoir inside its running track; the Great Lawn with its ballfields,
// Turtle Pond under Belvedere Castle on Vista Rock, Cleopatra's Needle; the Ramble and the Lake,
// crossed by Bow Bridge, with the Boathouse and its rowboats; Bethesda Terrace and its fountain,
// the Mall's elms and Sheep Meadow, Strawberry Fields; Wollman Rink and the Pond with Gapstow
// Bridge at the bottom. The drive loops round it all; stone walls with gates at every street.
// It describes its paths for the pedestrians (world.parkNet) the way the old square park did.

import { T, CURB, parkRect, roadCenter, PARK } from './layout.js';
import { GC } from './ground.js';
import { MAT, GRP } from './mesh.js';
import { RNG, hash2i, valueNoise, shade, mixc } from '../core/math.js';
import { sharedTex } from './buildings.js';
import { propTex, parkLamp, trashBasket, chainFence, parkWall } from './props.js';
import { Net, spline, polyLen, along, resample, roundedRect, ellipsePts, splitClosed, segDist, ringWall, waterDisc, radialPlaza, boat } from './park.js';
import { stoneFill } from './facades.js';

const PI = Math.PI;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
// a soft-edged lake made of overlapping ellipses: f > 0 inside
const lakeField = (lobes, seed) => (x, y) => {
  let f = -1e9;
  for (const l of lobes) { const dx = (x - l.x) / l.rx, dy = (y - l.y) / l.ry; f = Math.max(f, 1 - dx * dx - dy * dy); }
  return f + (valueNoise(x * 0.9, y * 0.9, seed) - 0.5) * 0.16;
};
const boundsOf = (lobes, m = 1) => ({
  x0: Math.min(...lobes.map((l) => l.x - l.rx)) - m, y0: Math.min(...lobes.map((l) => l.y - l.ry)) - m,
  x1: Math.max(...lobes.map((l) => l.x + l.rx)) + m, y1: Math.max(...lobes.map((l) => l.y + l.ry)) + m,
});

export function centralPark(C) {
  const R = parkRect();
  const W = C.world, mb = C.mb, g = W.ground.p;
  const rng = new RNG(5107);
  const S = sharedTex(C), P = propTex(C);
  const cx = (R.x0 + R.x1) / 2, y0 = R.y0, x0 = R.x0;
  const inPark = (x, y, m = 0) => x > R.x0 + m && x < R.x1 - m && y > R.y0 + m && y < R.y1 - m;
  const net = new Net();

  // ---- the plan (north at the top: y grows southwards) --------------------------------------
  const loopIn = 2.6, loopR = 6, loopW = 1.7, gateW = 2.0;
  const lx0 = R.x0 + loopIn, lx1 = R.x1 - loopIn, ly0 = R.y0 + loopIn, ly1 = R.y1 - loopIn;
  const gateYs = [];
  for (let j = PARK.by0 + 1; j <= PARK.by1; j++) gateYs.push(roadCenter(j));
  // Harlem Meer, the Pool and the Loch running into it
  const meer = [{ x: cx + 10.5, y: y0 + 12, rx: 6.5, ry: 4.8 }, { x: cx + 4, y: y0 + 13.5, rx: 4.0, ry: 3.0 }, { x: cx + 15.5, y: y0 + 15.5, rx: 2.8, ry: 2.6 }];
  const meerF = lakeField(meer, 81);
  const pool = { x: x0 + 7, y: y0 + 26.5, r: 2.0 };
  const loch = spline([[pool.x + 1.6, pool.y - 0.8], [x0 + 11.5, y0 + 24.4], [x0 + 15, y0 + 25.2], [x0 + 18.6, y0 + 22.8], [cx - 3.2, y0 + 18.6], [cx + 1.5, y0 + 14.4]], 8);
  const greatHill = { x: x0 + 9.5, y: y0 + 12.5, r: 3.4 };
  const CG = { x0: cx + 7, y0: y0 + 23.5, x1: lx1 - 0.9, y1: y0 + 30.8 };
  const DR = { x0: x0 + 3.6, y0: y0 + 29.2, x1: x0 + 10.2, y1: y0 + 33.4 };
  // the Reservoir inside its running track
  const RV = { x: cx, y: y0 + 46, rx: 16, ry: 11.3 };
  const trackRx = RV.rx + 1.15, trackRy = RV.ry + 1.15;
  // the Great Lawn, Turtle Pond, Vista Rock and the castle, the obelisk
  const GL = { x: cx, y: y0 + 70, rx: 11, ry: 6.8 };
  const glRx = GL.rx + 1.0, glRy = GL.ry + 1.0;
  const turtle = [{ x: cx + 2, y: y0 + 81.4, rx: 7.2, ry: 2.2 }, { x: cx + 8.2, y: y0 + 82.2, rx: 3, ry: 1.8 }];
  const turtleF = lakeField(turtle, 82);
  const castle = { x: cx - 8.4, y: y0 + 81.6 };
  const needle = { x: cx + 15.6, y: y0 + 68.6 };
  // the Lake, the Ramble above it, the Boathouse on its east arm
  const lake = [{ x: cx - 8.5, y: y0 + 95.6, rx: 6.4, ry: 3.8 }, { x: cx + 2.5, y: y0 + 97, rx: 8, ry: 3.3 }, { x: cx + 13, y: y0 + 95.2, rx: 4.6, ry: 3.4 }];
  const lakeF = lakeField(lake, 61);
  const bowX = cx - 3;
  const boathouse = { x: cx + 13, y: y0 + 101.2 };
  // Bethesda Terrace, the Mall, Sheep Meadow, Strawberry Fields
  const BT = { x: cx, y: y0 + 105.4, r: 5.0, basin: 2.7, ring: 3.9 };
  const mallW = 2.6;
  const meadow = { x0: lx0 + 1.6, y0: y0 + 108.4, x1: cx - 5.2, y1: y0 + 120.4 };
  const SF = { x: lx0 + 4.2, y: y0 + 102.2, r: 2.3 };
  // Wollman Rink and the Pond with Gapstow Bridge
  const rink = { x0: cx + 6.6, y0: y0 + 105.8, x1: cx + 15.6, y1: y0 + 110.0 };
  const pond = [{ x: cx + 12, y: y0 + 117.4, rx: 5.2, ry: 2.4 }, { x: cx + 7.2, y: y0 + 118.4, rx: 2.4, ry: 1.6 }];
  const pondF = lakeField(pond, 83);
  const gapX = cx + 12.4;
  const anyWater = (x, y) => meerF(x, y) > -0.2 || turtleF(x, y) > -0.2 || lakeF(x, y) > -0.2 || pondF(x, y) > -0.2
    || ((x - RV.x) / (RV.rx + 0.4)) ** 2 + ((y - RV.y) / (RV.ry + 0.4)) ** 2 < 1 || (x > rink.x0 - 0.3 && x < rink.x1 + 0.3 && y > rink.y0 - 0.3 && y < rink.y1 + 0.3);
  // where a lake's shore is along a north-south line (for the bridges)
  const shoreAlong = (F, x, yFrom, yTo) => {
    let a = null, b = null;
    for (let y = yFrom; y <= yTo; y += 0.05) { if (F(x, y) > -0.2) { if (a == null) a = y; b = y; } }
    return [a, b];
  };

  // ---- path network -------------------------------------------------------------------------------
  const sideJ = [];
  for (const gy of gateYs) sideJ.push([lx0, gy], [lx1, gy]);
  const extraJ = [[lx0, y0 + 36], [lx1, CG.y0 + 3.6], [lx1, y0 + 79.6], [lx0, y0 + 90.4], [lx1, y0 + 89.4], [lx1, y0 + 113.0], [gapX, ly1], [cx, ly0], [cx, ly1]];
  const arcMid = (sx, sy) => [sx < 0 ? lx0 + loopR * (1 - Math.SQRT1_2) : lx1 - loopR * (1 - Math.SQRT1_2), sy < 0 ? ly0 + loopR * (1 - Math.SQRT1_2) : ly1 - loopR * (1 - Math.SQRT1_2)];
  const cornerJ = [arcMid(-1, -1), arcMid(1, -1), arcMid(1, 1), arcMid(-1, 1)];
  const loop = splitClosed(roundedRect(lx0, ly0, lx1, ly1, loopR), [...sideJ, ...extraJ, ...cornerJ]);
  const perimeter = [];
  for (const piece of loop.pieces) for (const id of net.path(piece, loopW, { step: 2.8, kind: 'drive' })) if (perimeter[perimeter.length - 1] !== id && perimeter[0] !== id) perimeter.push(id);
  const J = (x, y) => loop.at[[...sideJ, ...extraJ, ...cornerJ].findIndex(([a, b]) => Math.abs(a - x) < 1e-6 && Math.abs(b - y) < 1e-6)];
  const gates = [];
  const gate = (x, y, sx, sy, corner = false) => { gates.push({ node: net.node(x, y), sx, sy, corner }); };
  // a gate at every street end on both sides, at the two ends and the four corners
  for (const gy of gateYs) {
    gate(R.x0, gy, R.x0 - 1.0, gy); net.path([[R.x0, gy], J(lx0, gy)], gateW);
    gate(R.x1, gy, R.x1 + 1.0, gy); net.path([[R.x1, gy], J(lx1, gy)], gateW);
  }
  gate(cx, R.y0, cx, R.y0 - 1.0); net.path([[cx, R.y0], J(cx, ly0)], gateW);
  gate(cx, R.y1, cx, R.y1 + 1.0); net.path([[cx, R.y1], J(cx, ly1)], mallW);
  for (const [k, [sx, sy]] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
    const gx = sx < 0 ? R.x0 + 0.3 : R.x1 - 0.3, gy = sy < 0 ? R.y0 + 0.3 : R.y1 - 0.3;
    gate(gx, gy, sx < 0 ? R.x0 - 1 : R.x1 + 1, sy < 0 ? R.y0 - 1 : R.y1 + 1, true);
    net.path([[gx, gy], cornerJ[k]], loopW);
  }
  // the north end: round the Great Hill, along the Loch, the Meer's south shore, the garden
  const MW = [cx - 4.2, y0 + 21.8];
  const ghRing = splitClosed(ellipsePts(greatHill.x, greatHill.y, greatHill.r + 0.9, greatHill.r + 0.9), [[greatHill.x, greatHill.y + greatHill.r + 0.9], [greatHill.x + greatHill.r + 0.9, greatHill.y], [greatHill.x - 2.9, greatHill.y - 2.9]]);
  for (const piece of ghRing.pieces) net.path(piece, 1.2, { step: 2.4 });
  net.path(spline([ghRing.at[2], [x0 + 5.6, y0 + 6.4], cornerJ[0]]), 1.2);
  const lochPath = spline([J(lx0, gateYs[0]), [x0 + 7.6, y0 + 21.4], [x0 + 12.2, y0 + 20.6], [x0 + 16.4, y0 + 21.0], MW]);
  net.path(lochPath, 1.4, { step: 2.4 });
  net.path(spline([ghRing.at[0], [greatHill.x + 0.4, y0 + 19.2], lochPath[Math.floor(lochPath.length * 0.35)]]), 1.2);
  net.path(spline([J(cx, ly0), [cx - 2.4, y0 + 8.2], [cx - 4.6, y0 + 14.4], MW]), 1.4);
  net.path(spline([ghRing.at[1], [x0 + 15.4, y0 + 11.0], [cx - 4.6, y0 + 14.4]]), 1.2);
  const meerS = spline([MW, [cx + 1.6, y0 + 20.4], [cx + 8.2, y0 + 20.4], [cx + 15.0, y0 + 21.6], [lx1 - 0.2, gateYs[0] - 0.8]]);
  net.path(meerS, 1.6);
  // Conservatory Garden: axis walks from the shore path and the drive to the fountain
  const cgc = [(CG.x0 + CG.x1) / 2, (CG.y0 + CG.y1) / 2];
  net.path([[cgc[0], meerS[Math.floor(meerS.length * 0.62)][1]], [cgc[0], CG.y0], cgc], 1.4, { kind: 'gravel' });
  net.path([[CG.x0 - 0.2, cgc[1]], cgc], 1.4, { kind: 'gravel' });
  net.path([cgc, J(lx1, CG.y0 + 3.6)], 1.4, { kind: 'gravel' });
  // dog run off the drive
  const dogGateXY = [(DR.x0 + DR.x1) / 2, DR.y1 + 0.55];
  const dogPath = net.path([J(lx0, y0 + 36), [dogGateXY[0], y0 + 36], dogGateXY], 1.2);
  const dogGate = dogPath[dogPath.length - 1];
  // the Reservoir: its running track, and ways onto it from the drive and from north and south
  const tr = splitClosed(ellipsePts(RV.x, RV.y, trackRx, trackRy), [[RV.x, RV.y - trackRy], [RV.x + trackRx, RV.y], [RV.x, RV.y + trackRy], [RV.x - trackRx, RV.y]]);
  const track = [];
  for (const piece of tr.pieces) track.push(...net.path(piece, 1.1, { step: 2.6, kind: 'gravel' }));
  const [TN, TE, TS, TW] = tr.at;
  net.path(spline([TN, [cx - 1.2, y0 + 30.2], [cx - 3.6, y0 + 25.2], MW]), 1.4);
  net.path([TW, J(lx0, gateYs[1])], 1.4);
  net.path([TE, J(lx1, gateYs[1])], 1.4);
  // the Great Lawn: a ring path, spurs to the drive and the track
  const gl = splitClosed(ellipsePts(GL.x, GL.y, glRx, glRy), [[GL.x, GL.y - glRy], [GL.x + glRx, GL.y], [GL.x, GL.y + glRy], [GL.x - glRx, GL.y]]);
  for (const piece of gl.pieces) net.path(piece, 1.3, { step: 2.4 });
  const [GN, GE, GS, GW] = gl.at;
  net.path([TS, GN], 1.4);
  net.path(spline([GW, [lx0 + 3.6, GL.y + 2.4], J(lx0, gateYs[2])]), 1.4);
  net.path(spline([GE, [needle.x - 1.4, needle.y + 1.6], J(lx1, y0 + 79.6)]), 1.4);
  // Vista Rock: up from the lawn to the castle, down into the Ramble; the pond's south shore
  const castleN = [castle.x + 0.4, castle.y - 2.3], castleS = [castle.x + 0.9, castle.y + 2.5];
  net.path(spline([GS, [cx - 4.4, GL.y + glRy + 0.6], castleN]), 1.3);
  net.path(spline([castleN, [castle.x - 3.2, castle.y - 1.4], J(lx0, gateYs[2])]), 1.2);
  const pondSouth = spline([castleS, [cx - 3.0, y0 + 84.4], [cx + 4.4, y0 + 84.6], [cx + 11.6, y0 + 84.2], [cx + 16.0, y0 + 86.8], J(lx1, y0 + 89.4)]);
  net.path(pondSouth, 1.3, { step: 2.4 });
  // the Ramble: winding woodland paths down to the Lake
  const [bowN, bowS] = (() => { const [a, b] = shoreAlong(lakeF, bowX, y0 + 88, y0 + 104); return [a - 0.5, b + 0.5]; })();
  const rambleA = spline([castleS, [castle.x + 2.4, y0 + 87.4], [bowX - 1.6, y0 + 89.6], [bowX, bowN]]);
  net.path(rambleA, 1.2, { step: 2.3 });
  net.path(spline([rambleA[Math.floor(rambleA.length * 0.45)], [castle.x - 3.6, y0 + 89.6], J(lx0, y0 + 90.4)]), 1.2, { step: 2.3 });
  net.path(spline([pondSouth[Math.floor(pondSouth.length * 0.45)], [cx + 4.6, y0 + 88.2], [cx + 9.0, y0 + 90.0], [cx + 12.6, y0 + 91.2]]), 1.2, { step: 2.3 });
  // Bow Bridge: over the Lake's narrows, arching up a little
  const bowZ = (t) => CURB + 0.32 + Math.sin(PI * t) * 0.62;
  net.path([[bowX, bowN], [bowX, bowS]], 0, { step: 1.3, z: bowZ });
  // the south shore: west to Strawberry Fields, east to the terrace and the Boathouse
  const sfN = [SF.x + SF.r * 0.7, SF.y - SF.r * 0.7];
  net.path(spline([[bowX, bowS], [cx - 9.0, y0 + 100.6], sfN]), 1.4);
  net.path([[SF.x - SF.r, SF.y], J(lx0, gateYs[3])], 1.4);
  // Bethesda Terrace: a ring round the fountain, axes out of it
  const ring = [];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * 2 * PI - PI / 2; ring.push(net.node(BT.x + Math.cos(a) * BT.ring, BT.y + Math.sin(a) * BT.ring)); }
  for (let k = 0; k < 8; k++) net.edge(ring[k], ring[(k + 1) % 8]);
  const rN = [BT.x, BT.y - BT.ring], rE = [BT.x + BT.ring, BT.y], rS = [BT.x, BT.y + BT.ring], rW = [BT.x - BT.ring, BT.y];
  net.path([[bowX, bowS], [BT.x - 2.2, BT.y - 3.2]], 0);
  net.edge(net.node(BT.x - 2.2, BT.y - 3.2), ring[7]);
  net.path(spline([rW, [cx - 7.6, BT.y + 0.6], [SF.x + SF.r, SF.y + 0.4]]), 1.4);
  const dockX = boathouse.x - 3.4, dockRoot = [dockX, boathouse.y - 1.6];
  const bhFront = [boathouse.x - 0.6, boathouse.y + 2.4];
  net.path(spline([rE, [cx + 7.6, BT.y - 0.6], [dockX + 0.4, bhFront[1] - 0.2], bhFront]), 1.6);
  net.path([bhFront, [boathouse.x + 3.6, bhFront[1]], J(lx1, gateYs[3])], 1.4);
  const dockIds = net.path([[dockX, bhFront[1] - 0.4], dockRoot], 1.0);
  const dockEnd = net.node(dockX, dockRoot[1] - 2.1);
  net.edge(dockIds[dockIds.length - 1], dockEnd);
  // the Mall: from the terrace to the south end of the park
  const MJ = [cx, y0 + 113.4];
  net.path([rS, MJ], mallW);
  net.path([MJ, J(cx, ly1)], mallW);
  // between the rink and the Pond, over Gapstow Bridge, to the drive
  const se = spline([MJ, [cx + 5.0, MJ[1] - 0.2], [gapX - 1.6, y0 + 112.6], [gapX + 3.6, y0 + 112.8], J(lx1, y0 + 113.0)]);
  net.path(se, 1.5);
  const [gapN, gapS] = (() => { const [a, b] = shoreAlong(pondF, gapX, y0 + 112, y0 + 123); return [a - 0.5, b + 0.5]; })();
  net.path([[gapX, se[Math.floor(se.length * 0.62)][1]], [gapX, gapN]], 1.3);
  const gapZ = (t) => CURB + 0.3 + Math.sin(PI * t) * 0.85;
  net.path([[gapX, gapN], [gapX, gapS]], 0, { step: 1.2, z: gapZ });
  net.path([[gapX, gapS], J(gapX, ly1)], 1.3);
  // round the rink
  net.path(spline([[rink.x0 - 0.9, rink.y1 + 0.2], [rink.x0 - 1.0, rink.y0 - 0.6], [rink.x1 - 1.2, rink.y0 - 0.9]]), 1.1);

  // ---- ground -------------------------------------------------------------------------------------
  C.paintGround(R.x0, R.y0, R.x1, R.y1, 'grass');
  // woods: the North Woods, the Ramble, the shores, and copses all over
  C.paintWhere(R.x0, R.y0, cx + 2, y0 + 34, (x, y) => valueNoise(x * 0.17, y * 0.17, 91) > 0.28, 'woods');
  C.paintWhere(R.x0, y0 + 83, R.x1, y0 + 93, (x, y) => valueNoise(x * 0.2, y * 0.2, 92) > 0.3, 'woods');
  C.paintWhere(R.x0, R.y0, R.x1, R.y1, (x, y) => valueNoise(x * 0.12, y * 0.12, 93) > 0.66, 'woods');
  // lawns: the Great Hill, the Great Lawn, Sheep Meadow
  C.paintWhere(greatHill.x - greatHill.r, greatHill.y - greatHill.r, greatHill.x + greatHill.r, greatHill.y + greatHill.r, (x, y) => dist(x, y, greatHill.x, greatHill.y) < greatHill.r, 'lawn');
  C.paintWhere(GL.x - GL.rx, GL.y - GL.ry, GL.x + GL.rx, GL.y + GL.ry, (x, y) => ((x - GL.x) / GL.rx) ** 2 + ((y - GL.y) / GL.ry) ** 2 <= 1, 'lawn');
  C.paintWhere(meadow.x0, meadow.y0, meadow.x1, meadow.y1, (x, y) => {
    const r = 2.4, ex = Math.max(meadow.x0 + r - x, 0, x - (meadow.x1 - r)), ey = Math.max(meadow.y0 + r - y, 0, y - (meadow.y1 - r));
    return ex * ex + ey * ey <= r * r;
  }, 'lawn');
  // the Great Lawn's ballfields: dirt infields at its north end, home plate towards the edge
  for (const hx of [GL.x - 5.2, GL.x + 5.2]) {
    const hy = GL.y - GL.ry + 1.1;
    C.paintWhere(hx - 3, hy, hx + 3, hy + 3.4, (x, y) => { const d = dist(x, y, hx, hy), a = Math.atan2(y - hy, x - hx); return d < 3.1 && a > PI / 4 && a < (3 * PI) / 4; }, 'dirt');
    C.paintWhere(hx - 2, hy, hx + 2, hy + 2.6, (x, y) => { const u = (x - hx + (y - hy)) / Math.SQRT2, v = (y - hy - (x - hx)) / Math.SQRT2; return u > 0.45 && v > 0.45 && u < 1.55 && v < 1.55; }, 'lawn');
  }
  // water: Harlem Meer, the Pool and the Loch, the Reservoir, Turtle Pond, the Lake, the Pond, the rink
  const paintLake = (F, b) => {
    C.paintWhere(b.x0, b.y0, b.x1, b.y1, (x, y) => F(x, y) > -0.2, 'shore');
    C.paintWhere(b.x0, b.y0, b.x1, b.y1, (x, y) => F(x, y) > 0, 'water');
  };
  paintLake(meerF, boundsOf(meer));
  C.paintWhere(pool.x - pool.r - 1, pool.y - pool.r - 1, pool.x + pool.r + 1, pool.y + pool.r + 1, (x, y) => dist(x, y, pool.x, pool.y) < pool.r + 0.5, 'shore');
  C.paintWhere(pool.x - pool.r - 1, pool.y - pool.r - 1, pool.x + pool.r + 1, pool.y + pool.r + 1, (x, y) => dist(x, y, pool.x, pool.y) < pool.r, 'water');
  {
    const L = resample(loch, 0.4);
    for (const [pass, hw] of [['shore', 0.62], ['water', 0.34]])
      for (let k = 1; k < L.length; k++) {
        const [ax, ay] = L[k - 1], [bx, by] = L[k];
        C.paintWhere(Math.min(ax, bx) - 1, Math.min(ay, by) - 1, Math.max(ax, bx) + 1, Math.max(ay, by) + 1, (x, y) => segDist(x, y, ax, ay, bx, by) < hw, pass);
      }
  }
  C.paintWhere(RV.x - RV.rx - 1, RV.y - RV.ry - 1, RV.x + RV.rx + 1, RV.y + RV.ry + 1, (x, y) => ((x - RV.x) / (RV.rx + 0.22)) ** 2 + ((y - RV.y) / (RV.ry + 0.22)) ** 2 <= 1, 'pathEdge');
  C.paintWhere(RV.x - RV.rx - 1, RV.y - RV.ry - 1, RV.x + RV.rx + 1, RV.y + RV.ry + 1, (x, y) => ((x - RV.x) / RV.rx) ** 2 + ((y - RV.y) / RV.ry) ** 2 <= 1, 'water');
  paintLake(turtleF, boundsOf(turtle));
  paintLake(lakeF, boundsOf(lake));
  paintLake(pondF, boundsOf(pond));
  C.paintGround(rink.x0 - 0.2, rink.y0 - 0.2, rink.x1 + 0.2, rink.y1 + 0.2, 'plaza');
  C.paintGround(rink.x0, rink.y0, rink.x1, rink.y1, 'rink');
  // the Conservatory Garden: gravel walks between beds and clipped hedges
  C.paintGround(CG.x0, CG.y0, CG.x1, CG.y1, 'gravel');
  {
    const bw = (CG.x1 - CG.x0 - 0.7 * 3) / 2, bh = (CG.y1 - CG.y0 - 0.7 * 3) / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const bx0 = CG.x0 + 0.7 + i * (bw + 0.7), by0 = CG.y0 + 0.7 + j * (bh + 0.7);
      C.paintGround(bx0, by0, bx0 + bw, by0 + bh, j === 0 ? 'flowerbed' : 'lawn');
      if (j === 1) C.paintGround(bx0 + 0.6, by0 + 0.6, bx0 + bw - 0.6, by0 + bh - 0.6, 'flowerbed');
    }
  }
  // the dog run
  C.paintGround(DR.x0, DR.y0, DR.x1, DR.y1, 'dirt');
  C.paintWhere(DR.x0, DR.y0, DR.x1, DR.y1, (x, y) => valueNoise(x * 0.6, y * 0.6, 64) > 0.6, 'gravel');
  // paths: granite edges, then the paving (the drive is asphalt, the track and garden walks gravel)
  for (const pass of [0, 1]) for (const s of net.strokes) {
    const hw = s.w / 2 + (pass === 0 ? s.edge / T : 0);
    const kind = pass === 0 ? 'pathEdge' : s.kind === 'gravel' ? 'gravel' : s.kind === 'drive' ? 'driveway' : 'path';
    const pts = s.pts.length > 2 ? resample(s.pts, 0.5) : s.pts;
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
      C.paintWhere(Math.min(ax, bx) - hw, Math.min(ay, by) - hw, Math.max(ax, bx) + hw, Math.max(ay, by) + hw,
        (x, y) => inPark(x, y) && segDist(x, y, ax, ay, bx, by) <= hw && !(pass === 0 && anyWater(x, y)), kind);
    }
  }
  // paved plazas: Bethesda Terrace, Strawberry Fields, the corners, Vista Rock, the Boathouse
  radialPlaza(C, BT.x, BT.y, BT.r, 0.6);
  radialPlaza(C, SF.x, SF.y, SF.r, 0);
  imagineMosaic(C, SF.x, SF.y, 1.15);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const ex = sx < 0 ? R.x0 : R.x1, ey = sy < 0 ? R.y0 : R.y1;
    C.paintWhere(ex - 3.4, ey - 3.4, ex + 3.4, ey + 3.4, (x, y) => inPark(x, y) && dist(x, y, ex, ey) < 3.2, 'pathEdge');
    C.paintWhere(ex - 3.4, ey - 3.4, ex + 3.4, ey + 3.4, (x, y) => inPark(x, y) && dist(x, y, ex, ey) < 3.1, 'plaza');
  }
  C.paintWhere(castle.x - 2.6, castle.y - 2.4, castle.x + 2.6, castle.y + 2.6, (x, y) => dist(x, y, castle.x, castle.y + 0.2) < 2.3, 'plaza');
  C.paintGround(boathouse.x - 4.2, boathouse.y - 0.6, boathouse.x + 3.4, boathouse.y + 3.1, 'plaza');

  // ---- walls & gates ------------------------------------------------------------------------------
  const wt = 0.25, gateHalf = 1.4, cornerCut = 3.2;
  const pillar = (x, y) => {
    mb.box(x - 0.26, y - 0.26, CURB, x + 0.26, y + 0.26, CURB + 1.15, { px: S.limestone, nx: S.limestone, py: S.limestone, ny: S.limestone, pz: { t: S.limeTop } });
    mb.box(x - 0.33, y - 0.33, CURB + 1.15, x + 0.33, y + 0.33, CURB + 1.27, { px: S.limestone, nx: S.limestone, py: S.limestone, ny: S.limestone, pz: { t: S.limeTop } });
    mb.pyramid(x - 0.2, y - 0.2, x + 0.2, y + 0.2, CURB + 1.27, CURB + 1.45, S.limestone);
  };
  // runs of wall between the openings
  const runs = (a0, a1, opens) => {
    const cuts = [a0 + cornerCut, ...opens.flatMap((o) => [o - gateHalf, o + gateHalf]), a1 - cornerCut];
    const out = [];
    for (let k = 0; k < cuts.length; k += 2) if (cuts[k + 1] - cuts[k] > 0.6) out.push([cuts[k], cuts[k + 1]]);
    return out;
  };
  for (const [a, b] of runs(R.x0, R.x1, [cx])) {
    parkWall(C, a, R.y0, b, R.y0 + wt); parkWall(C, a, R.y1 - wt, b, R.y1);
    for (const x of [a, b]) { pillar(x, R.y0 + wt / 2); pillar(x, R.y1 - wt / 2); }
  }
  for (const [a, b] of runs(R.y0, R.y1, gateYs)) {
    parkWall(C, R.x0, a, R.x0 + wt, b); parkWall(C, R.x1 - wt, a, R.x1, b);
    for (const y of [a, b]) { pillar(R.x0 + wt / 2, y); pillar(R.x1 - wt / 2, y); }
  }

  // ---- Bethesda Fountain and its angel -----------------------------------------------------------
  {
    const wz = CURB + 0.42;
    ringWall(C, BT.x, BT.y, BT.basin, 0.32, 0.55, 28);
    waterDisc(C, BT.x, BT.y, BT.basin - 0.16, wz, 28);
    mb.cylinder(BT.x, BT.y, CURB, CURB + 1.0, 0.5, 12, S.limestone, null);
    mb.cylinder(BT.x, BT.y, CURB + 1.0, CURB + 1.2, 1.3, 16, S.limestone, S.limeTop);
    waterDisc(C, BT.x, BT.y, 1.13, CURB + 1.21, 16);
    mb.cylinder(BT.x, BT.y, CURB + 1.2, CURB + 1.8, 0.24, 10, S.limestone, null);
    mb.cylinder(BT.x, BT.y, CURB + 1.8, CURB + 1.92, 0.62, 12, S.limestone, S.limeTop);
    waterDisc(C, BT.x, BT.y, 0.5, CURB + 1.93, 12);
    mb.cylinder(BT.x, BT.y, CURB + 1.92, CURB + 2.25, 0.12, 8, S.limestone, S.limeTop);
    C.addSprite('angel', BT.x, BT.y, CURB + 2.25);
    W.fountains.push({ x: BT.x, y: BT.y, z: CURB + 2.1, kind: 'tiered', r: BT.basin, floor: wz, bowls: [{ r: 0.62, z: CURB + 1.92 }, { r: 1.3, z: CURB + 1.2 }] });
    W.lamps.push({ x: BT.x, y: BT.y, z: CURB + 0.8, r: 4.2, color: [0.75, 0.88, 1.0], k: 0.55, kind: 'park' });
    W.parkCenter = { x: BT.x, y: BT.y, z: CURB + 1.2, flock: [BT.x + BT.ring + 0.2, BT.y + 1.6], noTree: true };
    // the terrace's balustrade along the lake side, broken for the steps
    for (const sx of [-1, 1]) {
      const xa = BT.x + sx * 1.7, xb = BT.x + sx * (BT.r - 0.4);
      mb.box(Math.min(xa, xb), BT.y - BT.r + 0.35, CURB, Math.max(xa, xb), BT.y - BT.r + 0.6, CURB + 0.55, { px: S.limestone, nx: S.limestone, py: S.limestone, ny: S.limestone, pz: { t: S.limeTop } });
    }
  }

  // ---- the Conservatory Garden: its fountain, hedges and a pergola --------------------------------
  {
    ringWall(C, cgc[0], cgc[1], 1.25, 0.24, 0.4, 20);
    waterDisc(C, cgc[0], cgc[1], 1.1, CURB + 0.3, 20);
    mb.cylinder(cgc[0], cgc[1], CURB, CURB + 0.9, 0.16, 8, S.limestone, S.limeTop);
    W.fountains.push({ x: cgc[0], y: cgc[1], z: CURB + 0.9, kind: 'pool', w: 2.2, d: 2.2 });
    for (let x = CG.x0 + 0.5; x < CG.x1 - 0.3; x += 0.9) { C.addSprite('bush', x, CG.y0 + 0.3, CURB); C.addSprite('bush', x, CG.y1 - 0.3, CURB); }
    // the wisteria pergola along the garden's east side
    const px0 = CG.x1 - 1.1, px1 = CG.x1 - 0.2;
    for (let y = CG.y0 + 1.2; y < CG.y1 - 0.8; y += 1.4) for (const x of [px0, px1]) mb.box(x - 0.06, y - 0.06, CURB, x + 0.06, y + 0.06, CURB + 1.5, { px: S.wood, nx: S.wood, py: S.wood, ny: S.wood });
    for (let y = CG.y0 + 1.2; y < CG.y1 - 0.8; y += 0.5) mb.box(px0 - 0.15, y - 0.04, CURB + 1.5, px1 + 0.15, y + 0.04, CURB + 1.58, { px: S.wood, nx: S.wood, py: S.wood, ny: S.wood, pz: S.wood });
  }

  // ---- the Reservoir's fence ---------------------------------------------------------------------
  {
    const fr = RV.rx + 0.5, fry = RV.ry + 0.5;
    const n = Math.round((2 * PI * Math.max(fr, fry)) / 1.25);
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * 2 * PI, x = RV.x + Math.cos(a) * fr, y = RV.y + Math.sin(a) * fry;
      if (k < n) mb.box(x - 0.04, y - 0.04, CURB, x + 0.04, y + 0.04, CURB + 0.9, { px: P.black, nx: P.black, py: P.black, ny: P.black, pz: P.black });
      if (prev) beam(C, [prev[0], prev[1], CURB + 0.85], [x, y, CURB + 0.85], 0.025, P.black);
      prev = [x, y];
    }
    W.solids.push(...ellipseSolids(RV.x, RV.y, fr, fry));
    // the gatehouse on the south shore
    const gx = RV.x - 4, gy = RV.y + RV.ry + 0.2;
    mb.box(gx - 1.1, gy - 0.8, CURB, gx + 1.1, gy + 0.8, CURB + 1.4, { px: S.greystone, nx: S.greystone, py: S.greystone, ny: S.greystone });
    mb.pyramid(gx - 1.25, gy - 0.95, gx + 1.25, gy + 0.95, CURB + 1.4, CURB + 2.3, S.slate ?? S.roofTar);
  }

  // ---- Vista Rock and Belvedere Castle ----------------------------------------------------------------
  const rockTex = C.atlas.shared('schist', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const band = Math.sin((x * 0.35 + y * 0.9) + valueNoise(x * 0.2, y * 0.2, 5) * 3);
      let c = band > 0.6 ? 0x8a8780 : band < -0.5 ? 0x5e5c58 : 0x74716a;
      if (hash2i(x >> 1, y >> 1, 9) > 0.93) c = 0xa0a49a;
      if (hash2i(x >> 2, y >> 2, 10) > 0.9) c = mixc(c, 0x8a9a5a, 0.5);
      p.set(x, y, shade(c, 0.92 + hash2i(x, y, 11) * 0.14));
    }
  });
  const rock = (x, y, r, h) => {
    const a = rng.range(0, PI);
    mb.cylinder(x, y, CURB - 0.05, CURB + h * 0.55, r, 6, rockTex, null, { angle: a });
    mb.cone(x, y, CURB + h * 0.55, CURB + h, r, 6, rockTex, { angle: a, mat: MAT.SNOW });
  };
  belvedere(C, castle.x, castle.y, rockTex);
  // ---- Cleopatra's Needle -----------------------------------------------------------------------------
  obelisk(C, needle.x, needle.y);

  // ---- Bow Bridge and Gapstow Bridge ------------------------------------------------------------------
  archBridge(C, bowX, bowN + 0.3, bowS - 0.3, 0.85, bowZ, 'iron');
  archBridge(C, gapX, gapN + 0.3, gapS - 0.3, 0.8, gapZ, 'stone', rockTex);

  // ---- the Boathouse, its dock and rowboats -------------------------------------------------------------
  {
    const bx = boathouse.x, by = boathouse.y;
    const roofG = C.atlas.shared('boathouse_roof', 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(x % 8 < 1 ? 0x3e6a4a : 0x4f8a5e, 0.92 + hash2i(x, y >> 2, 21) * 0.12));
    });
    const wall = C.atlas.shared('boathouse_wall', 32, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0xe8dcc0, 0.95 + hash2i(x >> 2, y >> 3, 22) * 0.06));
      for (const wx of [3, 17]) { p.rect(wx, 10, 12, 26, 0x2a3a48, 160); p.frame(wx, 10, 12, 26, 0x6a5a3a); p.vline(wx + 6, 10, 26, 0x6a5a3a); }
      p.rect(0, 0, 32, 4, 0x6a5a3a);
    });
    mb.box(bx - 2.4, by - 0.2, CURB, bx + 2.8, by + 1.6, CURB + 1.6, { px: wall, nx: wall, py: wall, ny: wall });
    mb.gable(bx - 2.6, by - 0.4, bx + 3.0, by + 1.8, CURB + 1.6, CURB + 2.5, 'x', roofG, wall);
    W.solids.push([bx - 2.4, by - 0.2, bx + 2.8, by + 1.6, 1.6]);
    const deck = C.atlas.shared('dock_deck', 32, 32, () => {});
    const dx = dockX, dy0 = dockRoot[1] - 2.6, dy1 = by + 0.8;
    mb.box(dx - 0.6, dy0, CURB - 0.1, dx + 0.6, dy1, CURB + 0.05, { px: S.wood, nx: S.wood, py: S.wood, ny: S.wood, pz: { t: deck, world: true } });
    for (const [px, py] of [[dx - 0.6, dy0], [dx + 0.6, dy0], [dx - 0.6, (dy0 + dy1) / 2], [dx + 0.6, (dy0 + dy1) / 2]]) mb.cylinder(px, py, CURB - 0.1, CURB + 0.4, 0.07, 6, S.wood, S.wood);
    boat(C, dx - 1.05, dy0 + 0.9, PI / 2 + 0.12, 0xc8302c);
    boat(C, dx + 1.05, dy0 + 0.7, PI / 2 - 0.1, 0x2a6aa0);
    boat(C, dx + 2.1, dy0 + 1.35, PI / 2 + 0.2, 0x2f7a46);
    boat(C, dx - 2.2, dy0 + 1.5, PI / 2 - 0.25, 0xe8b830);
    W.lamps.push({ x: bx, y: by + 2.4, z: CURB + 1.4, r: 3.2, color: [1, 0.86, 0.6], k: 0.5, kind: 'street' });
  }

  // ---- Wollman Rink: boards round the ice, the rink house -------------------------------------------
  {
    const b = rink, white = P.white ?? S.limestone;
    for (const [ax, ay, bx, by] of [[b.x0, b.y0, b.x1, b.y0], [b.x0, b.y1, b.x1, b.y1], [b.x0, b.y0, b.x0, b.y1], [b.x1, b.y0, b.x1, b.y1]])
      mb.box(Math.min(ax, bx) - 0.06, Math.min(ay, by) - 0.06, CURB, Math.max(ax, bx) + 0.06, Math.max(ay, by) + 0.06, CURB + 0.38, { px: white, nx: white, py: white, ny: white, pz: white });
    const hx = b.x1 + 1.3, hy = (b.y0 + b.y1) / 2;
    mb.box(hx - 0.8, hy - 1.4, CURB, hx + 0.8, hy + 1.4, CURB + 1.1, { px: S.concrete, nx: S.concrete, py: S.concrete, ny: S.concrete, pz: { t: S.roofTar } });
    W.solids.push([b.x0 - 0.1, b.y0 - 0.1, b.x1 + 0.1, b.y1 + 0.1, 0.4], [hx - 0.8, hy - 1.4, hx + 0.8, hy + 1.4, 1.1]);
    for (const [lx, ly] of [[b.x0 - 0.3, b.y0 - 0.3], [b.x1 + 0.3, b.y0 - 0.3], [b.x0 - 0.3, b.y1 + 0.3]]) {
      mb.box(lx - 0.07, ly - 0.07, CURB, lx + 0.07, ly + 0.07, CURB + 3.6, { px: P.silver, nx: P.silver, py: P.silver, ny: P.silver });
      W.lamps.push({ x: (lx + (b.x0 + b.x1) / 2) / 2, y: (ly + (b.y0 + b.y1) / 2) / 2, z: CURB + 3.4, r: 5, color: [0.92, 0.96, 1.0], k: 0.6, kind: 'flood' });
      W.lampHeads.push({ x: lx, y: ly, z: CURB + 3.6, kind: 'flood' });
    }
  }

  // ---- the dog run ---------------------------------------------------------------------------------------
  {
    const gx = dogGateXY[0];
    chainFence(C, DR.x0, DR.y1, gx - 0.6, DR.y1, 1.1, true);
    chainFence(C, gx + 0.6, DR.y1, DR.x1, DR.y1, 1.1, true);
    chainFence(C, DR.x0, DR.y0, DR.x0, DR.y1, 1.1, true);
    chainFence(C, DR.x1, DR.y0, DR.x1, DR.y1, 1.1, true);
    chainFence(C, DR.x0, DR.y0, DR.x1, DR.y0, 1.1, true);
    W.dogRun = { x0: DR.x0 + 0.4, y0: DR.y0 + 0.4, x1: DR.x1 - 0.4, y1: DR.y1 - 0.4, gate: { x: gx, y: DR.y1 + 0.25 } };
    mb.cylinder(DR.x1 - 1.6, DR.y0 + 1.2, CURB, CURB + 0.25, 0.22, 6, S.wood, S.wood);
  }

  // ---- rocks: Vista Rock's shoulders, outcrops in the Ramble and the North Woods, lake shores -----
  for (const [x, y, r, h] of [[castle.x - 2.4, castle.y + 1.6, 0.9, 0.8], [castle.x + 2.6, castle.y + 1.2, 0.7, 0.6], [cx + 3.2, y0 + 88.4, 0.8, 0.7], [cx - 1.6, y0 + 86.8, 0.55, 0.45], [x0 + 13.4, y0 + 16.0, 0.9, 0.9], [x0 + 6.2, y0 + 18.6, 0.7, 0.6], [cx - 6.0, y0 + 9.4, 0.6, 0.5], [cx - 10.6, y0 + 112.6, 0.8, 0.7]]) rock(x, y, r, h);
  for (const [F, lobes] of [[meerF, meer], [lakeF, lake], [pondF, pond], [turtleF, turtle]])
    for (let k = 0; k < 26; k++) {
      const l = rng.pick(lobes), a = rng.range(0, 2 * PI);
      const x = l.x + Math.cos(a) * (l.rx + 0.15), y = l.y + Math.sin(a) * (l.ry + 0.15);
      const f = F(x, y);
      if (f > -0.22 && f < 0.02 && rng.chance(0.4) && dist(x, y, boathouse.x, boathouse.y) > 3.5 && Math.abs(x - bowX) > 1.2 && Math.abs(x - gapX) > 1.2) rock(x, y, rng.range(0.25, 0.45), rng.range(0.2, 0.4));
    }

  // ---- trees ---------------------------------------------------------------------------------------------
  const trees = [], lamps = [], benches = [];
  const groundAt = (x, y) => g.getA(Math.floor(x * T), Math.floor(y * T));
  const soft = (x, y) => { const a = groundAt(x, y); return a === GC.GRASS; };
  const inLawn = (x, y, m = 0.6) => ((x - GL.x) / (GL.rx + m)) ** 2 + ((y - GL.y) / (GL.ry + m)) ** 2 <= 1
    || (x > meadow.x0 - m && x < meadow.x1 + m && y > meadow.y0 - m && y < meadow.y1 + m) || dist(x, y, greatHill.x, greatHill.y) < greatHill.r + m;
  const clearOf = (x, y, r) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dy]) => soft(x + dx, y + dy));
  const tree = (x, y, sp, scale) => { trees.push({ x, y }); C.addTree(x, y, sp, false, { scale: scale ?? rng.range(1.0, 1.3) }); };
  const roomFor = (x, y, d) => trees.every((t) => dist(t.x, t.y, x, y) >= d);
  // the Mall's elms: a double row either side of the promenade
  for (let y = BT.y + BT.r + 1.2; y < ly1 - 1.0; y += 2.4) {
    if (Math.abs(y - MJ[1]) < 1.5) continue;
    for (const sx of [-1, 1]) for (const off of [1.25, 3.2]) tree(cx + sx * (mallW / 2 + off), y, 'elm', rng.range(1.0, 1.15));
  }
  // cherry trees along the Reservoir's east bank; a row just inside the walls
  for (let a = -0.9; a < 0.9; a += 0.17) {
    const x = RV.x + Math.cos(a) * (trackRx + 1.4), y = RV.y + Math.sin(a) * (trackRy + 1.4);
    if (soft(x, y) && roomFor(x, y, 1.6)) tree(x, y, 'cherry', rng.range(0.9, 1.1));
  }
  for (const side of [0, 1, 2, 3]) {
    const len = side % 2 === 0 ? R.x1 - R.x0 : R.y1 - R.y0;
    for (let t = cornerCut + 1.4; t < len - cornerCut - 1.2; t += rng.range(2.6, 3.2)) {
      const off = 1.0 + rng.range(-0.1, 0.15);
      const [x, y] = side === 0 ? [R.x0 + t, R.y0 + off] : side === 1 ? [R.x1 - off, R.y0 + t] : side === 2 ? [R.x1 - t, R.y1 - off] : [R.x0 + off, R.y1 - t];
      if (!soft(x, y) || !roomFor(x, y, 2.2)) continue;
      tree(x, y, rng.pick(['plane', 'plane', 'oak', 'elm', 'locust']));
    }
  }
  // willows (elms) leaning over the Lake and the Meer
  for (const [F, lobes] of [[lakeF, lake], [meerF, meer]])
    for (let k = 0; k < 16; k++) {
      const l = rng.pick(lobes), a = rng.range(0, 2 * PI);
      const x = l.x + Math.cos(a) * (l.rx + 1.0), y = l.y + Math.sin(a) * (l.ry + 1.0);
      if (F(x, y) < -0.35 && soft(x, y) && roomFor(x, y, 2.0)) tree(x, y, 'elm', rng.range(0.95, 1.2));
    }

  // ---- lamps, benches, baskets along the paths ---------------------------------------------------------
  const nearPath = (x, y, m) => net.strokes.some((s) => { for (let k = 1; k < s.pts.length; k++) if (segDist(x, y, s.pts[k - 1][0], s.pts[k - 1][1], s.pts[k][0], s.pts[k][1]) < s.w / 2 + m) return true; return false; });
  const lampOk = (x, y) => soft(x, y) && !inLawn(x, y, 0.2) && lamps.every((l) => dist(l.x, l.y, x, y) > 6.5) && trees.every((t) => dist(t.x, t.y, x, y) > 0.9) && !nearPath(x, y, 0.25);
  for (let k = 0; k < 4; k++) { const a = PI / 4 + (k * PI) / 2; const x = BT.x + Math.cos(a) * (BT.r + 0.5), y = BT.y + Math.sin(a) * (BT.r + 0.5); if (soft(x, y)) { parkLamp(C, x, y); lamps.push({ x, y }); } }
  for (const s of net.strokes) {
    const L = polyLen(s.pts);
    if (L < 3) continue;
    let k = 0;
    for (let d = Math.min(3.0, L / 2); d < L - 1.0; d += 7.0, k++) {
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
    for (const bx of fx) for (const by of fy) if (!inPark(bx, by, 0.3) || anyWater(bx, by)) return false;
    if (benches.some((b) => dist(b.x, b.y, x, y) < 2.2) || lamps.some((l) => dist(l.x, l.y, x, y) < 1.1) || trees.some((t) => dist(t.x, t.y, x, y) < 0.7)) return false;
    C.addBench(x, y, axis, facing);
    benches.push({ x, y });
    return true;
  };
  // terrace benches facing the fountain
  for (let k = 0; k < 8; k++) {
    const a = PI / 4 + (k % 2 ? 0.36 : -0.36) + Math.floor(k / 2) * (PI / 2);
    const x = BT.x + Math.cos(a) * 4.6, y = BT.y + Math.sin(a) * 4.6;
    if (Math.sin(a) < -0.5) continue; // (the lake side is the balustrade)
    if (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))) benchAt(x, y, 'y', -Math.sign(Math.cos(a)));
    else benchAt(x, y, 'x', -Math.sign(Math.sin(a)));
  }
  // along the Mall between the elms, facing the promenade
  for (let y = BT.y + BT.r + 2.4; y < ly1 - 1.5; y += 2.4) { benchAt(cx - mallW / 2 - 0.5, y, 'y', 1); benchAt(cx + mallW / 2 + 0.5, y, 'y', -1); }
  // round Strawberry Fields, along the Reservoir track and the Great Lawn, by the Meer and the Lake
  for (let k = 0; k < 6; k++) { const a = (k / 6) * 2 * PI + 0.3, x = SF.x + Math.cos(a) * (SF.r + 0.5), y = SF.y + Math.sin(a) * (SF.r + 0.5); if (Math.abs(Math.cos(a)) > 0.7) benchAt(x, y, 'y', -Math.sign(Math.cos(a))); else benchAt(x, y, 'x', -Math.sign(Math.sin(a))); }
  for (const [x, y, ax, f] of [[RV.x - 8, RV.y + trackRy + 1.2, 'x', -1], [RV.x + 8, RV.y + trackRy + 1.2, 'x', -1], [RV.x - 6, RV.y - trackRy - 1.2, 'x', 1], [RV.x + 6, RV.y - trackRy - 1.2, 'x', 1],
    [GL.x - 7, GL.y + glRy + 0.95, 'x', -1], [GL.x + 7, GL.y + glRy + 0.95, 'x', -1], [GL.x - 6, GL.y - glRy - 0.95, 'x', 1], [GL.x + 6, GL.y - glRy - 0.95, 'x', 1],
    [cx + 4, y0 + 21.4, 'x', -1], [cx + 10, y0 + 21.4, 'x', -1], [cx - 9, y0 + 101.6, 'x', -1], [cx + 6, y0 + 101.2, 'x', -1], [castle.x + 2.4, castle.y - 2.6, 'x', 1],
    [lx0 + 1.3, y0 + 60, 'y', -1], [lx1 - 1.3, y0 + 40, 'y', 1], [lx0 + 1.3, y0 + 100, 'y', -1], [lx1 - 1.3, y0 + 96, 'y', 1], [cx - 8, ly1 - 1.3, 'x', 1]]) benchAt(x, y, ax, f);
  for (const [x, y] of [[cx + 1.4, ly0 + 1.4], [cx - 1.6, ly1 - 1.6], [BT.x + 6.2, BT.y + 1.2], [BT.x - 6.2, BT.y - 1.2], [SF.x + 2.6, SF.y + 2.6], [GL.x + glRx + 1.4, GL.y + 1.4], [RV.x - trackRx - 1.4, RV.y + 1.4], [cgc[0] - 2.4, CG.y0 - 1.2]]) if (soft(x, y)) trashBasket(C, x, y);

  // ---- the woods: everything that isn't lawn, water, path or plaza --------------------------------------
  const zone = (x, y) => {
    if (x > DR.x0 - 0.8 && x < DR.x1 + 0.8 && y > DR.y0 - 0.8 && y < DR.y1 + 0.8) return null;
    if (x > CG.x0 - 0.6 && x < CG.x1 + 0.6 && y > CG.y0 - 0.6 && y < CG.y1 + 0.6) return null;
    if (y < y0 + 34) return { d: x < cx + 2 ? 1 : 0.85, sp: ['oak', 'elm', 'pine', 'oak', 'locust', 'pine'] }; // the North Woods
    if (y > y0 + 83 && y < y0 + 93) return { d: 1, sp: ['oak', 'elm', 'pine', 'oak', 'locust', 'cherry'] }; // the Ramble
    if (y > y0 + 100 && y < y0 + 108 && x < cx - 3) return { d: 0.85, sp: ['cherry', 'cherry', 'elm', 'locust'] }; // Cherry Hill
    return { d: 0.88, sp: ['oak', 'plane', 'elm', 'locust', 'oak', 'cherry'] };
  };
  const gs = 1.6;
  for (let y = R.y0 + 1.2; y < R.y1 - 1.0; y += gs)
    for (let x = R.x0 + 1.2; x < R.x1 - 1.0; x += gs) {
      const tx = x + (hash2i(Math.round(x * 10), Math.round(y * 10), 71) - 0.5) * 1.3;
      const ty = y + (hash2i(Math.round(x * 10), Math.round(y * 10), 72) - 0.5) * 1.3;
      const z = zone(tx, ty);
      if (!z || hash2i(Math.round(tx * 7), Math.round(ty * 7), 73) > z.d) continue;
      if (inLawn(tx, ty) || !clearOf(tx, ty, 0.55) || nearPath(tx, ty, 0.35) || anyWater(tx, ty) || dist(tx, ty, BT.x, BT.y) < BT.r + 1.2 || dist(tx, ty, castle.x, castle.y) < 3) continue;
      if (!roomFor(tx, ty, 1.7) || lamps.some((l) => dist(l.x, l.y, tx, ty) < 1.0) || benches.some((b) => dist(b.x, b.y, tx, ty) < 1.1)) continue;
      tree(tx, ty, z.sp[Math.floor(hash2i(Math.round(tx * 3), Math.round(ty * 3), 74) * z.sp.length)]);
    }
  // the water itself is out of bounds (ducks, rowboats and skaters aside)
  const bridges = [[bowX - 1.1, bowX + 1.1], [gapX - 1.1, gapX + 1.1]];
  for (const lobes of [meer, lake, pond, turtle]) for (const l of lobes) W.solids.push(...ellipseSolids(l.x, l.y, l.rx * 0.88, l.ry * 0.88, bridges));

  // ---- data for the simulation ----------------------------------------------------------------------------
  const inset = (r, m) => ({ x0: r.x0 + m, y0: r.y0 + m, x1: r.x1 - m, y1: r.y1 - m });
  W.lawns = [
    { x0: GL.x - GL.rx * 0.68, y0: GL.y - GL.ry * 0.5, x1: GL.x + GL.rx * 0.68, y1: GL.y + GL.ry * 0.68 },
    inset(meadow, 0.6),
    { x0: greatHill.x - 2, y0: greatHill.y - 2, x1: greatHill.x + 2, y1: greatHill.y + 2 },
  ];
  W.park = { ...R, cx, cy: (R.y0 + R.y1) / 2 };
  W.pond = { x: lake[1].x, y: lake[1].y, rx: lake[1].rx * 0.8, ry: lake[1].ry * 0.75 };
  W.reservoir = { x: RV.x, y: RV.y, rx: RV.rx, ry: RV.ry, track };
  const nearestNode = (x, y) => { let b = 0, bd = 1e9; net.nodes.forEach((n, i) => { const d = dist(n.x, n.y, x, y); if (d < bd) { bd = d; b = i; } }); return b; };
  W.parkNet = {
    nodes: net.nodes, edges: net.edges, gates,
    paths: net.nodes.map((_, i) => i),
    ring, perimeter,
    lawnNodes: [GE, GW, [meadow.x1 + 0.6, (meadow.y0 + meadow.y1) / 2], [meadow.x0 + 3, meadow.y0 - 0.8]].map(([x, y]) => nearestNode(x, y)),
    pond: dockEnd, dogGate,
  };
  W.parkSights = [
    ['BETHESDA TERRACE', BT.x, BT.y + 6], ['THE RESERVOIR', RV.x, RV.y + RV.ry + 4], ['BELVEDERE CASTLE', castle.x + 2, castle.y + 5], ['BOW BRIDGE', bowX + 2, (bowN + bowS) / 2 + 6],
    ['HARLEM MEER', meer[0].x - 2, meer[0].y + 8], ['GREAT LAWN', GL.x, GL.y + 4],
  ];
  void stoneFill; void lochPath;
}

// ---------------------------------------------------------------------------------------------------------
// solid boxes covering an ellipse (for the collision grid)
function ellipseSolids(x, y, rx, ry, gaps = []) {
  const out = [];
  const n = Math.max(4, Math.round(ry * 2));
  for (let k = 0; k < n; k++) {
    const t0 = -1 + (2 * k) / n, t1 = -1 + (2 * (k + 1)) / n, tm = (t0 + t1) / 2;
    const w = rx * Math.sqrt(Math.max(0, 1 - tm * tm));
    if (w <= 0.15) continue;
    // (cut round any bridge crossing this row)
    let spans = [[x - w, x + w]];
    for (const [g0, g1] of gaps) spans = spans.flatMap(([a, b]) => (g1 <= a || g0 >= b ? [[a, b]] : [[a, g0], [g1, b]].filter(([u, v]) => v - u > 0.1)));
    for (const [a, b] of spans) out.push([a, y + t0 * ry, b, y + t1 * ry, 0.3]);
  }
  return out;
}

// a thin straight bar between two points (rails, cables)
function beam(C, a, b, r, tex) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / L * r, ny = dx / L * r;
  C.mb.quad([a[0] + nx, a[1] + ny, a[2] + r], [b[0] + nx, b[1] + ny, b[2] + r], [b[0] + nx, b[1] + ny, b[2] - r], [a[0] + nx, a[1] + ny, a[2] - r],
    [[0, 0], [L * T, 0], [L * T, 2 * r * T], [0, 2 * r * T]], tex, [nx / r, ny / r, 0], MAT.FLAT);
  C.mb.quad([b[0] - nx, b[1] - ny, b[2] + r], [a[0] - nx, a[1] - ny, a[2] + r], [a[0] - nx, a[1] - ny, a[2] - r], [b[0] - nx, b[1] - ny, b[2] - r],
    [[0, 0], [L * T, 0], [L * T, 2 * r * T], [0, 2 * r * T]], tex, [-nx / r, -ny / r, 0], MAT.FLAT);
  C.mb.quad([a[0] - nx, a[1] - ny, a[2] + r], [b[0] - nx, b[1] - ny, b[2] + r], [b[0] + nx, b[1] + ny, b[2] + r], [a[0] + nx, a[1] + ny, a[2] + r],
    [[0, 0], [L * T, 0], [L * T, 2 * r * T], [0, 2 * r * T]], tex, [0, 0, 1], MAT.FLAT);
  void dz;
}

// "Imagine": the round black-and-white mosaic at Strawberry Fields
function imagineMosaic(C, x, y, r) {
  const g = C.world.ground.p;
  for (let ty = Math.floor((y - r) * T); ty < Math.ceil((y + r) * T); ty++)
    for (let tx = Math.floor((x - r) * T); tx < Math.ceil((x + r) * T); tx++) {
      const dx = (tx + 0.5) / T - x, dy = (ty + 0.5) / T - y, d = Math.hypot(dx, dy);
      if (d > r) continue;
      const a = Math.atan2(dy, dx), u = d / r;
      let c;
      if (u > 0.93) c = 0x2a2a2c;
      else if (u < 0.3) c = (tx >> 1) % 3 === 0 && (ty >> 1) % 3 === 0 ? 0x2a2a2c : 0xf2efe6; // the word in the middle
      else c = Math.floor((a / (2 * PI)) * 24 + 24) % 2 === 0 ? 0xf2efe6 : 0x2a2a2c;
      if (u > 0.3 && u < 0.36) c = 0x2a2a2c;
      g.set(tx, ty, shade(c, 0.95 + hash2i(tx, ty, 77) * 0.08), GC.PLAZA);
    }
}

// Belvedere Castle on Vista Rock: a grey schist keep with a crenellated tower, a turret and a flag
function belvedere(C, x, y, rockTex) {
  const S = sharedTex(C), mb = C.mb, W = C.world;
  const stone = C.atlas.shared('belvedere', 32, 48, (p) => {
    for (let yy = 0; yy < 48; yy++) for (let xx = 0; xx < 32; xx++) {
      const row = yy >> 2, off = row % 2 ? 4 : 0;
      let c = mixc(0x8a877e, 0x6e6b64, hash2i((xx + off) >> 3, row, 31));
      if (yy % 4 === 0 || (xx + off) % 8 === 0) c = 0x55534e;
      p.set(xx, yy, shade(c, 0.94 + hash2i(xx, yy, 32) * 0.1));
    }
    // a pointed window with a dark pane
    for (let yy = 14; yy < 32; yy++) for (let xx = 11; xx < 21; xx++) {
      const top = yy < 19 ? Math.abs(xx - 15.5) < (yy - 13) * 1.0 : true;
      if (top) p.set(xx, yy, yy > 16 ? 0x1e2a36 : 0x2a3440, 150);
    }
    p.rect(10, 32, 12, 2, 0xa8a49a);
  });
  const crenel = C.atlas.shared('crenel', 32, 12, (p) => {
    for (let yy = 0; yy < 12; yy++) for (let xx = 0; xx < 32; xx++) p.set(xx, yy, shade(0x8a877e, 0.94 + hash2i(xx, yy, 33) * 0.1));
    for (let xx = 0; xx < 32; xx += 8) p.rect(xx + 4, 0, 4, 5, 0, 0);
  });
  const slate = C.atlas.shared('slate', 32, 32, (p) => {
    for (let yy = 0; yy < 32; yy++) for (let xx = 0; xx < 32; xx++) p.set(xx, yy, shade((yy >> 2) % 2 ? 0x3e4450 : 0x4a5160, 0.93 + hash2i(xx >> 2, yy >> 2, 34) * 0.12));
  });
  // Vista Rock
  mb.cylinder(x, y, CURB - 0.05, CURB + 0.75, 2.3, 8, rockTex, rockTex, { angle: 0.3 });
  const z = CURB + 0.75;
  const f = (t) => ({ px: t, nx: t, py: t, ny: t });
  // the keep (a long hall) and the tower at its west end, the turret at the east
  mb.box(x - 1.3, y - 0.7, z, x + 1.4, y + 0.8, z + 1.55, { ...f(stone), pz: { t: S.roofTar } });
  mb.box(x - 1.3, y - 0.7, z + 1.55, x + 1.4, y + 0.8, z + 1.85, { ...f(crenel), pz: { t: S.roofTar } }, { mat: MAT.FLAT });
  mb.box(x - 1.7, y - 0.55, z, x - 0.55, y + 0.6, z + 3.1, { ...f(stone), pz: { t: S.roofTar } });
  mb.box(x - 1.78, y - 0.63, z + 3.1, x - 0.47, y + 0.68, z + 3.42, { ...f(crenel), pz: { t: S.roofTar } }, { mat: MAT.FLAT });
  mb.cylinder(x + 1.35, y - 0.35, z, z + 2.35, 0.42, 8, stone, null);
  mb.cone(x + 1.35, y - 0.35, z + 2.35, z + 3.3, 0.5, 8, slate);
  // the flag on the tower
  mb.box(x - 1.14, y + 0.02, z + 3.42, x - 1.1, y + 0.06, z + 4.6, { px: S.metal, nx: S.metal, py: S.metal, ny: S.metal });
  W.flags.push({ x: x - 1.12, y: y + 0.04, z: z + 4.55, n: [0, 1], type: 'us', tip: { x: x - 0.67, y: y + 0.04 } });
  W.solids.push([x - 2.0, y - 1.6, x + 2.0, y + 1.7, z + 3.4]);
  W.lamps.push({ x: x + 0.2, y: y + 1.8, z: z + 0.6, r: 3.0, color: [1, 0.9, 0.7], k: 0.45, kind: 'flood' });
}

// Cleopatra's Needle: a granite obelisk on its pedestal, bronze crabs at the corners
function obelisk(C, x, y) {
  const S = sharedTex(C), mb = C.mb;
  const gran = C.atlas.shared('obelisk', 16, 64, (p) => {
    for (let yy = 0; yy < 64; yy++) for (let xx = 0; xx < 16; xx++) p.set(xx, yy, shade(0xb0866a, 0.9 + hash2i(xx, yy >> 1, 41) * 0.15 - yy * 0.002));
    for (let yy = 4; yy < 60; yy += 3) for (let xx = 4; xx < 12; xx += 2) if (hash2i(xx, yy, 42) > 0.45) p.set(xx, yy, 0x6e4e3a); // hieroglyphs
  });
  mb.box(x - 0.75, y - 0.75, CURB, x + 0.75, y + 0.75, CURB + 0.35, { px: S.greystone, nx: S.greystone, py: S.greystone, ny: S.greystone, pz: { t: S.limeTop } });
  mb.box(x - 0.55, y - 0.55, CURB + 0.35, x + 0.55, y + 0.55, CURB + 0.75, { px: S.greystone, nx: S.greystone, py: S.greystone, ny: S.greystone, pz: { t: S.limeTop } });
  const z0 = CURB + 0.75, z1 = z0 + 5.4;
  // a slightly tapering shaft (two stacked boxes) and the pyramidion
  mb.box(x - 0.36, y - 0.36, z0, x + 0.36, y + 0.36, z0 + 2.7, { px: gran, nx: gran, py: gran, ny: gran });
  mb.box(x - 0.31, y - 0.31, z0 + 2.7, x + 0.31, y + 0.31, z1, { px: { t: gran, v0: 0 }, nx: gran, py: gran, ny: gran });
  mb.pyramid(x - 0.31, y - 0.31, x + 0.31, y + 0.31, z1, z1 + 0.5, gran);
  C.world.solids.push([x - 0.75, y - 0.75, x + 0.75, y + 0.75, z1]);
  C.world.lamps.push({ x, y: y + 1.2, z: CURB + 0.5, r: 2.6, color: [1, 0.86, 0.6], k: 0.4, kind: 'flood' });
}

// A footbridge over water, north-south along x, arching over the middle. 'iron': Bow Bridge, cream
// cast iron with an ornamental railing and planters; 'stone': Gapstow, a schist arch.
function archBridge(C, x, ya, yb, hw, zf, kind, rockTex) {
  const S = sharedTex(C), mb = C.mb, P = propTex(C);
  const cream = C.atlas.shared('bow_iron', 32, 16, (p) => {
    for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 32; xx++) p.set(xx, yy, shade(0xe8dcc0, 0.95 + hash2i(xx, yy, 51) * 0.06));
    for (let xx = 0; xx < 32; xx += 8) for (let k = 0; k < 8; k++) { const yy = 13 - Math.round(Math.sin((k / 8) * PI) * 9); p.set(xx + k, yy, 0x9a8a6a); }
    p.rect(0, 0, 32, 2, 0xc8b898); p.rect(0, 14, 32, 2, 0xb8a888);
  });
  const rail = C.atlas.shared('bow_rail', 32, 16, (p) => {
    for (let xx = 0; xx < 32; xx++) { p.set(xx, 0, 0xe8dcc0); p.set(xx, 1, 0xc8b898); p.set(xx, 15, 0xc8b898); }
    for (let xx = 0; xx < 32; xx += 4) for (let yy = 2; yy < 15; yy++) p.set(xx, yy, 0xe0d4b8);
    for (let xx = 0; xx < 32; xx += 8) for (let a = 0; a < 2 * PI; a += 0.3) p.set(Math.round(xx + 4 + Math.cos(a) * 3), Math.round(8 + Math.sin(a) * 3), 0xd0c4a8);
  });
  const deckTex = kind === 'iron' ? C.atlas.shared('dock_deck', 32, 32, () => {}) : S.concrete;
  const side = kind === 'iron' ? cream : rockTex;
  const n = 14, L = yb - ya;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const ya0 = ya + L * t0, ya1 = ya + L * t1, za = zf(t0), zb = zf(t1);
    const th = kind === 'iron' ? 0.22 : 0.45 + (1 - Math.sin(PI * (t0 + t1) / 2)) * 0.5;
    // deck
    mb.quad([x - hw, ya0, za], [x + hw, ya0, za], [x + hw, ya1, zb], [x - hw, ya1, zb], [[(x - hw) * T, ya0 * T], [(x + hw) * T, ya0 * T], [(x + hw) * T, ya1 * T], [(x - hw) * T, ya1 * T]], deckTex, [0, 0, 1], MAT.SNOW | MAT.WET);
    // fascias (east and west), the arch's spandrels
    const lu = (ya1 - ya0) * T;
    mb.quad([x + hw, ya1, zb], [x + hw, ya0, za], [x + hw, ya0, za - th], [x + hw, ya1, zb - th], [[0, 0], [lu, 0], [lu, th * T], [0, th * T]], side, [1, 0, 0], 0);
    mb.quad([x - hw, ya0, za], [x - hw, ya1, zb], [x - hw, ya1, zb - th], [x - hw, ya0, za - th], [[0, 0], [lu, 0], [lu, th * T], [0, th * T]], side, [-1, 0, 0], 0);
    // railings
    for (const sx of [-1, 1]) {
      const rx = x + sx * (hw - 0.04);
      if (kind === 'iron') mb.quad(sx > 0 ? [rx, ya1, zb + 0.5] : [rx, ya0, za + 0.5], sx > 0 ? [rx, ya0, za + 0.5] : [rx, ya1, zb + 0.5], sx > 0 ? [rx, ya0, za] : [rx, ya1, zb], sx > 0 ? [rx, ya1, zb] : [rx, ya0, za], [[0, 0], [lu, 0], [lu, 16], [0, 16]], rail, [sx, 0, 0], MAT.FLAT);
      else mb.quad(sx > 0 ? [rx, ya1, zb + 0.35] : [rx, ya0, za + 0.35], sx > 0 ? [rx, ya0, za + 0.35] : [rx, ya1, zb + 0.35], sx > 0 ? [rx, ya0, za] : [rx, ya1, zb], sx > 0 ? [rx, ya1, zb] : [rx, ya0, za], [[0, 0], [lu, 0], [lu, 0.35 * T], [0, 0.35 * T]], rockTex, [sx, 0, 0], 0);
    }
  }
  // abutments where the bridge lands
  for (const yy of [ya, yb]) {
    const z = zf(yy === ya ? 0 : 1);
    mb.box(x - hw - 0.15, yy - 0.35, CURB - 0.2, x + hw + 0.15, yy + 0.35, z, { px: kind === 'iron' ? S.limestone : rockTex, nx: kind === 'iron' ? S.limestone : rockTex, py: kind === 'iron' ? S.limestone : rockTex, ny: kind === 'iron' ? S.limestone : rockTex, pz: kind === 'iron' ? { t: S.limeTop } : rockTex });
  }
  if (kind === 'iron') for (const yy of [ya + 0.2, yb - 0.2]) for (const sx of [-1, 1]) C.addSprite('bush', x + sx * (hw + 0.05), yy, zf(yy === ya + 0.2 ? 0.02 : 0.98) + 0.05);
  void P;
}
