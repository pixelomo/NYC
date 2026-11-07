// The bridges leading off the island, each with its own look:
// - the George Washington Bridge over the Hudson to the Palisades: two-level deck, giant towers of
//   bare steel lattice, four main cables
// - the Henry Hudson Bridge's steel arch over Spuyten Duyvil to the Bronx
// - High Bridge: the old stone aqueduct with its steel arch over the Harlem River
// - the Triborough: a lift span over the Harlem River, a viaduct across Randall's Island and a
//   suspension span over Hell Gate to Queens
// - the Queensboro Bridge's cantilevered steel truss over Roosevelt Island, and the tram beside it
// - the Williamsburg and Manhattan Bridges to Brooklyn (the Brooklyn Bridge is in landmarks.js)
// Each comes down onto Manhattan over an approach in its own block and runs out to the far shore
// (to the edge of the diorama). At night strings of lights hang along the main cables.

import { T, CURB, WATER_Z, MAPX, STREET, BROOKLYN_X, NBX, NBY, BLOCK_TYPES, blockRect, BOROUGHS } from './layout.js';
import { MAT } from './mesh.js';
import { winCode } from '../core/painter.js';
import { shade, mixc, hash2i } from '../core/math.js';
import { sharedTex, markHeight } from './buildings.js';
import { propTex, beam } from './props.js';
import { landmark } from './landmarks.js';

const PI = Math.PI;
const findBlock = (type) => {
  for (let by = 0; by < NBY; by++) for (let bx = 0; bx < NBX; bx++) if (BLOCK_TYPES[by][bx] === type) return { ...blockRect(bx, by), bx, by };
  return null;
};
const sides = (t, top) => (top ? { px: t, nx: t, py: t, ny: t, pz: top } : { px: t, nx: t, py: t, ny: t });

// ---- textures ------------------------------------------------------------------------------------
function texes(C, color) {
  const A = C.atlas, key = color.toString(16);
  const lattice = A.shared(`br_lat_${key}`, 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(color, 0.62 + hash2i(x, y, 301) * 0.05));
    for (let k = 0; k < 32; k++) { for (const o of [0, 16]) { p.set((k + o) % 32, k, shade(color, 1.08)); p.set((31 - k + o) % 32, k, shade(color, 0.92)); } }
    for (let y = 0; y < 32; y++) { p.set(0, y, shade(color, 1.15)); p.set(1, y, shade(color, 1.05)); p.set(31, y, shade(color, 0.8)); }
    for (let x = 0; x < 32; x++) { p.set(x, 0, shade(color, 1.12)); p.set(x, 15, shade(color, 1.0)); }
  });
  const plate = A.shared(`br_plate_${key}`, 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(color, 0.95 + hash2i(x >> 2, y >> 3, 302) * 0.06));
    for (let y = 2; y < 32; y += 8) for (let x = 2; x < 32; x += 4) p.set(x, y, shade(color, 1.18));
    for (let y = 0; y < 32; y++) { p.set(0, y, shade(color, 1.12)); p.set(31, y, shade(color, 0.8)); }
  });
  const truss = A.shared(`br_truss_${key}`, 32, 16, (p) => {
    p.rect(0, 0, 32, 16, shade(color, 0.7));
    for (let x = 0; x < 32; x++) { p.set(x, 0, shade(color, 1.15)); p.set(x, 1, shade(color, 1.0)); p.set(x, 15, shade(color, 0.6)); p.set(x, Math.abs((x % 16) - 8) + 4, shade(color, 1.05)); }
    for (let y = 0; y < 16; y++) p.set(0, y, shade(color, 1.1));
  });
  // open lattice for the trusses: alpha holes between the members
  const open = A.shared(`br_open_${key}`, 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const u = x % 32, v = y;
      const onDiag = Math.abs(u - v) < 2 || Math.abs(u - (31 - v)) < 2;
      const onEdge = v < 3 || v > 28 || u < 2 || u > 29;
      if (onDiag || onEdge) p.set(x, y, shade(color, onEdge ? (v < 3 ? 1.1 : 0.85) : 0.95 + hash2i(x, y, 303) * 0.06));
      else p.set(x, y, 0, 0);
    }
  });
  const road = A.shared('bb_road', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x4a4d57, 0.92 + hash2i(x, y, 63) * 0.12));
    for (let x = 0; x < 32; x += 2) if ((x >> 3) % 2 === 0) { p.set(x, 7, 0xeeeef0); p.set(x, 24, 0xeeeef0); }
  });
  const cable = A.shared('bb_cable', 8, 8, (p) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, shade(0x5c5a56, 0.9 + hash2i(x, y, 65) * 0.15)); });
  const granite = A.shared('bb_granite', 64, 64, (p) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const row = y >> 3, off = row % 2 ? 8 : 0;
      let c = shade(mixc(0xb8a88c, 0xa89a80, hash2i((x + off) >> 4, row, 61)), 0.93 + hash2i(x, y, 62) * 0.1);
      if (y % 8 === 0 || (x + off) % 16 === 0) c = 0x8a7e68;
      p.set(x, y, c);
    }
  });
  return { lattice, plate, truss, open, road, cable, granite };
}

// a deck along x from xa to xb at y, top at z (one level, or two with a truss between)
function deck(C, xa, xb, y, z, hw, X, o = {}) {
  const mb = C.mb, P = propTex(C);
  mb.box(xa, y - hw, z - 0.5, xb, y + hw, z, { py: X.truss, ny: X.truss, pz: { t: X.road, world: true } });
  if (o.lower) {
    mb.box(xa, y - hw, z - 2.4, xb, y + hw, z - 1.9, { py: X.truss, ny: X.truss, pz: { t: X.road, world: true }, nz: X.plate });
    for (const sy of [-1, 1]) mb.quad(sy > 0 ? [xb, y + hw, z - 0.5] : [xa, y - hw, z - 0.5], sy > 0 ? [xa, y + hw, z - 0.5] : [xb, y - hw, z - 0.5], sy > 0 ? [xa, y + hw, z - 1.9] : [xb, y - hw, z - 1.9], sy > 0 ? [xb, y + hw, z - 1.9] : [xa, y - hw, z - 1.9],
      [[0, 0], [(xb - xa) * T, 0], [(xb - xa) * T, 1.4 * T], [0, 1.4 * T]], X.open, [0, sy, 0], MAT.FLAT);
  }
  const iron = sides(P.black, P.black);
  for (const sy of [-1, 1]) {
    const yy = y + sy * (hw - 0.04);
    for (let x = xa + 0.5; x < xb; x += 1.2) mb.box(x - 0.03, yy - 0.03, z, x + 0.03, yy + 0.03, z + 0.5, iron);
    mb.box(xa, yy - 0.03, z + 0.46, xb, yy + 0.03, z + 0.52, iron);
  }
  // a dashed centre and lamps over the roadway
  for (let x = xa + 2; x < xb - 1; x += 6) {
    C.world.lamps.push({ x, y, z: z + 1.2, r: 2.6, color: [1, 0.86, 0.6], k: 0.5, kind: 'street' });
  }
}
// a cable through points [x, y, z], with the suspenders down to the deck at z
function cableRun(C, pts, X, r, deckZ, every, skip = () => false) {
  for (let k = 1; k < pts.length; k++) beam(C, pts[k - 1], pts[k], r, X.cable);
  if (!every) return;
  const at = (x) => {
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      if ((x - a[0]) * (x - b[0]) <= 0 && a[0] !== b[0]) return a[2] + ((x - a[0]) / (b[0] - a[0])) * (b[2] - a[2]);
    }
    return null;
  };
  const x0 = Math.min(pts[0][0], pts[pts.length - 1][0]), x1 = Math.max(pts[0][0], pts[pts.length - 1][0]), y = pts[0][1];
  for (let x = x0 + every / 2; x < x1; x += every) {
    if (skip(x)) continue;
    const zc = at(x);
    if (zc != null && zc - deckZ > 0.25) C.mb.box(x - 0.02, y - 0.02, deckZ, x + 0.02, y + 0.02, zc, sides(X.cable));
  }
}
// the sag of a main cable: through the anchor, the tower tops, the low point in the middle
function catenary(xA, t0, t1, xB, zA, zTop, zLow, y, n = 10) {
  const pts = [];
  const side = (xa, xb, za, zb, k) => { for (let i = 0; i <= k; i++) { const t = i / k; pts.push([xa + (xb - xa) * t, y, za + (zb - za) * t - 0.5 * 4 * t * (1 - t)]); } };
  side(xA, t0, zA, zTop, 4);
  pts.pop();
  for (let i = 0; i <= n; i++) { const t = i / n, u = 2 * t - 1; pts.push([t0 + (t1 - t0) * t, y, zLow + (zTop - zLow) * u * u]); }
  pts.pop();
  side(t1, xB, zTop, zA, 4);
  return pts;
}
// strings of lights along the cables, lit at night
function necklace(C, pts, every = 3) {
  let acc = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    for (let s = (every - acc) % every; s < L; s += every) {
      const t = s / L;
      C.world.lampHeads.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1], z: a[2] + (b[2] - a[2]) * t + 0.12, kind: 'globe' });
    }
    acc = (acc + L) % every;
  }
}

// ---- tower styles --------------------------------------------------------------------------------
// legs either side of the deck from the footing up to zt, with portals across between them
function tower(C, x, y, hw, zd, zt, style, X, o = {}) {
  const mb = C.mb, W = C.world;
  const lw = o.leg ?? 1.2, ly = hw + 0.35 + lw / 2;
  const legT = style === 'lattice' || style === 'gwb' ? X.lattice : X.plate;
  // footing in the river (or on the shore)
  if (!o.noFooting) mb.box(x - lw - 0.6, y - ly - lw, WATER_Z - 0.1, x + lw + 0.6, y + ly + lw, 0.7, { ...sides(X.granite), pz: { t: X.granite } });
  for (const sy of [-1, 1]) {
    const cy = y + sy * ly;
    if (style === 'deco') {
      // stepped plate legs, narrowing as they rise
      const steps = [[0.7, zt * 0.55, lw], [zt * 0.55, zt * 0.85, lw * 0.8], [zt * 0.85, zt, lw * 0.62]];
      for (const [za, zb, w] of steps) mb.box(x - w / 2, cy - w / 2, za, x + w / 2, cy + w / 2, zb, sides(legT, { t: legT }));
    } else mb.box(x - lw / 2, cy - lw / 2, 0.7, x + lw / 2, cy + lw / 2, zt, sides(legT, { t: legT }));
  }
  markHeight(W, x - lw / 2, y - ly - lw / 2, x + lw / 2, y + ly + lw / 2, zt);
  // the portals: struts across between the legs
  const span = (za, zb, t) => mb.box(x - lw * 0.4, y - ly, za, x + lw * 0.4, y + ly, zb, sides(t, { t }));
  if (style === 'gwb') {
    span(zd + 0.4, zd + 1.6, X.lattice);
    span(zd + (zt - zd) * 0.5, zd + (zt - zd) * 0.5 + 1.4, X.lattice);
    span(zt - 1.6, zt, X.lattice);
    for (const [za, zb] of [[zd + 1.6, zd + (zt - zd) * 0.5], [zd + (zt - zd) * 0.5 + 1.4, zt - 1.6]])
      for (const sx of [-1, 1]) beam(C, [x + sx * lw * 0.3, y - ly, za], [x + sx * lw * 0.3, y + ly, zb], 0.35, X.lattice), beam(C, [x + sx * lw * 0.3, y + ly, za], [x + sx * lw * 0.3, y - ly, zb], 0.35, X.lattice);
  } else if (style === 'arch') {
    // a solid portal at the top with an arched underside, and one below the deck
    span(zt - 2.2, zt, X.plate);
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, yy = y - ly + 2 * ly * t, dz = Math.sin(PI * t) * 1.2;
      mb.box(x - lw * 0.35, yy - ly / 8, zt - 2.2 - (1.2 - dz), x + lw * 0.35, yy + ly / 8, zt - 2.2, sides(X.plate));
    }
    span(zd - 1.2, zd - 0.5, X.plate);
    mb.box(x - lw * 0.6, y - ly - lw * 0.6, zt, x + lw * 0.6, y + ly + lw * 0.6, zt + 0.35, sides(X.plate, { t: X.plate }));
  } else if (style === 'lattice') {
    span(zt - 1.4, zt, X.lattice);
    span(zd + 0.6, zd + 1.4, X.lattice);
    for (const [za, zb] of [[zd + 1.4, zt - 1.4]]) beam(C, [x, y - ly, za], [x, y + ly, zb], 0.3, X.lattice), beam(C, [x, y + ly, za], [x, y - ly, zb], 0.3, X.lattice);
  } else {
    span(zt - 1.2, zt, X.plate);
    span(zd + 2.5, zd + 3.3, X.plate);
  }
}

// ---- a suspension bridge along x -----------------------------------------------------------------
function suspension(C, o) {
  const X = texes(C, o.color);
  const { y, x0, x1, t0, t1, zd, zt, hw } = o;
  deck(C, x0, x1, y, zd, hw, X, { lower: o.lower });
  tower(C, t0, y, hw, zd, zt, o.style, X, { leg: o.leg });
  tower(C, t1, y, hw, zd, zt, o.style, X, { leg: o.leg, noFooting: o.farOnLand });
  const xA = o.anchors[0], xB = o.anchors[1], zA = zd + 0.9, zLow = zd + 1.0;
  const lw = o.leg ?? 1.2, ly = hw + 0.35 + lw / 2;
  for (const dy of o.cables ?? [-ly, ly]) {
    const pts = catenary(xA, t0, t1, xB, zA, zt - 0.2, zLow, y + dy);
    cableRun(C, pts, X, o.cableR ?? 0.12, zd, 1.0, (x) => Math.abs(x - t0) < lw || Math.abs(x - t1) < lw);
    if (Math.abs(dy) === ly) necklace(C, pts, 2.6);
  }
  // anchorages at both ends
  for (const xa of [xA, xB]) if (xa > 0.5 && xa < MAPX - 0.5) {
    C.mb.box(xa - 2.0, y - hw - 0.8, CURB, xa + 2.0, y + hw + 0.8, zd + 1.2, { ...sides(X.granite), pz: { t: X.granite } });
    markHeight(C.world, xa - 2.0, y - hw - 0.8, xa + 2.0, y + hw + 0.8, zd + 1.2);
  }
  landmark(C, o.name, (t0 + t1) / 2, y + hw + 9, o.rot ?? 0);
  C.world.bridges.push({ name: o.name, y, x0, x1, z: zd, hw });
}

// ---- the approach: a steel ramp from the street up to the deck, across the block ------------------
// side 'e': the deck leaves the block's east side (for the East River bridges); 'w': its west side
export function approach(C, L, side, zd, hw, color, o = {}) {
  const mb = C.mb, S = sharedTex(C), X = texes(C, color);
  const y = (L.y0 + L.y1) / 2, n = 6;
  const xs = side === 'e' ? L.x0 + 1.0 : L.x1 - 1.0, xe = side === 'e' ? L.x1 - (o.anchor ? 5.5 : 0) : L.x0 + (o.anchor ? 5.5 : 0);
  const z0 = CURB + 0.6;
  for (let k = 0; k < n; k++) {
    const xa = xs + ((xe - xs) * k) / n, xb = xs + ((xe - xs) * (k + 1)) / n;
    const za = z0 + ((zd - z0) * k) / n, zb = z0 + ((zd - z0) * (k + 1)) / n;
    const lo = Math.min(xa, xb), hi = Math.max(xa, xb), zlo = side === 'e' ? za : zb, zhi = side === 'e' ? zb : za;
    mb.quad([lo, y - hw, zlo], [hi, y - hw, zhi], [hi, y + hw, zhi], [lo, y + hw, zlo], [[lo * T, (y - hw) * T], [hi * T, (y - hw) * T], [hi * T, (y + hw) * T], [lo * T, (y + hw) * T]], X.road, [0, 0, 1], MAT.SNOW | MAT.WET);
    for (const sy of [-1, 1]) {
      const yy = y + sy * hw;
      mb.quad(sy > 0 ? [hi, yy, zhi] : [lo, yy, zlo], sy > 0 ? [lo, yy, zlo] : [hi, yy, zhi], sy > 0 ? [lo, yy, zlo - 0.6] : [hi, yy, zhi - 0.6], sy > 0 ? [hi, yy, zhi - 0.6] : [lo, yy, zlo - 0.6], [[0, 0], [(hi - lo) * T, 0], [(hi - lo) * T, 0.6 * T], [0, 0.6 * T]], X.plate, [0, sy, 0], 0);
      // parapet
      mb.quad(sy > 0 ? [hi, yy, zhi + 0.5] : [lo, yy, zlo + 0.5], sy > 0 ? [lo, yy, zlo + 0.5] : [hi, yy, zhi + 0.5], sy > 0 ? [lo, yy, zlo] : [hi, yy, zhi], sy > 0 ? [hi, yy, zhi] : [lo, yy, zlo], [[0, 0], [(hi - lo) * T, 0], [(hi - lo) * T, 0.5 * T], [0, 0.5 * T]], X.plate, [0, sy, 0], 0);
    }
    // columns under each joint
    if (k > 0) for (const sy of [-1, 1]) mb.box(xa - 0.2, y + sy * (hw - 0.4) - 0.2, CURB, xa + 0.2, y + sy * (hw - 0.4) + 0.2, za - 0.6, sides(X.plate));
    if (k > 0) markHeight(C.world, Math.min(xa, xb), y - hw, Math.max(xa, xb), y + hw, Math.min(za, zb) - 0.6);
  }
  // the deck runs on from the top of the ramp, out over the riverside drive
  const edge = side === 'e' ? L.x1 + STREET : L.x0 - STREET;
  deck(C, Math.min(xe, edge), Math.max(xe, edge), y, zd, hw, X);
  // little plazas under plane trees either side
  for (const [ya, yb] of [[L.y0, y - hw - 0.6], [y + hw + 0.6, L.y1]]) {
    C.paintGround(L.x0, ya, L.x1, yb, 'plaza');
    if (o.trees === 'south' && ya === L.y0) continue;
    for (let x = L.x0 + 1.8; x < L.x1 - 1; x += 3.4) C.addTree(x, (ya + yb) / 2, 'plane', true);
  }
  void S;
  return { y, xe };
}

// ---- the Queensboro Bridge: a cantilevered steel truss on five piers, over Roosevelt Island --------
function cantilever(C, o) {
  const mb = C.mb, X = texes(C, o.color), W = C.world;
  const { y, x0, x1, zd, hw, piers } = o;
  deck(C, x0, x1, y, zd, hw, X, { lower: true });
  // the top chord: high over each pier, low in the middle of each span
  const peak = zd + 8.5, low = zd + 2.2;
  const prof = (x) => {
    let best = low;
    for (const px of piers) { const d = Math.abs(x - px); best = Math.max(best, peak - d * 0.62); }
    return Math.max(low, best);
  };
  const step = 1.5;
  for (const sy of [-1, 1]) {
    const yy = y + sy * hw;
    for (let x = x0; x < x1 - 0.01; x += step) {
      const xa = x, xb = Math.min(x1, x + step), za = prof(xa), zb = prof(xb);
      // the open lattice web between the deck and the top chord
      mb.quad(sy > 0 ? [xb, yy, zb] : [xa, yy, za], sy > 0 ? [xa, yy, za] : [xb, yy, zb], sy > 0 ? [xa, yy, zd] : [xb, yy, zd], sy > 0 ? [xb, yy, zd] : [xa, yy, zd],
        [[0, 0], [(xb - xa) * T, 0], [(xb - xa) * T, (za - zd) * T], [0, (za - zd) * T]], X.open, [0, sy, 0], MAT.FLAT);
      beam(C, [xa, yy, za], [xb, yy, zb], 0.32, X.plate);
    }
    beam(C, [x0, yy, zd + 0.1], [x1, yy, zd + 0.1], 0.3, X.plate);
  }
  // struts across the top
  for (let x = x0 + 1; x < x1; x += 3) { const z = prof(x); mb.box(x - 0.12, y - hw, z - 0.2, x + 0.12, y + hw, z, sides(X.plate, { t: X.plate })); }
  // the piers, and the towers over them with their finials
  for (const px of piers) {
    const onLand = o.landPiers?.includes(px);
    mb.box(px - 1.4, y - hw - 0.6, onLand ? CURB : WATER_Z - 0.1, px + 1.4, y + hw + 0.6, zd - 2.4, { ...sides(X.granite), pz: { t: X.granite } });
    for (const sy of [-1, 1]) {
      mb.box(px - 0.5, y + sy * hw - 0.5, zd - 2.4, px + 0.5, y + sy * hw + 0.5, peak + 1.2, sides(X.plate, { t: X.plate }));
      mb.cone(px, y + sy * hw, peak + 1.2, peak + 2.6, 0.45, 8, X.plate);
    }
    markHeight(W, px - 1.4, y - hw - 0.6, px + 1.4, y + hw + 0.6, peak + 1.2);
    W.lampHeads.push({ x: px, y: y - hw, z: peak + 2.7, kind: 'globe' }, { x: px, y: y + hw, z: peak + 2.7, kind: 'globe' });
  }
  for (let x = x0 + 2; x < x1; x += 3.2) { W.lampHeads.push({ x, y: y - hw, z: prof(x) + 0.25, kind: 'globe' }); W.lampHeads.push({ x, y: y + hw, z: prof(x) + 0.25, kind: 'globe' }); }
  landmark(C, o.name, (x0 + x1) / 2 + 6, y + hw + 10, 0);
  W.bridges.push({ name: o.name, y, x0, x1, z: zd, hw });
}

// ---- an arch along y (the Henry Hudson Bridge), or along x (High Bridge's middle span) ----------
function deckArch(C, o) {
  const mb = C.mb, X = texes(C, o.color);
  const { c, a0, a1, s0, s1, zd, hw } = o; // c: the cross coordinate; a0..a1: the deck; s0..s1: the arch's springings
  const alongY = o.axis === 'y';
  const P = (a, cc, z) => (alongY ? [cc, a, z] : [a, cc, z]);
  // deck
  if (alongY) mb.box(c - hw, Math.min(a0, a1), zd - 0.5, c + hw, Math.max(a0, a1), zd, { px: X.truss, nx: X.truss, pz: { t: X.road, world: true } });
  else mb.box(Math.min(a0, a1), c - hw, zd - 0.5, Math.max(a0, a1), c + hw, zd, { py: X.truss, ny: X.truss, pz: { t: o.walk ? X.granite : X.road, world: true } });
  // two arch ribs, with posts up to the deck
  const n = 16, rise = zd - 0.6 - (o.springZ ?? 0.2);
  for (const sd of [-1, 1]) {
    const cc = c + sd * (hw - 0.3);
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const t = k / n, a = s0 + (s1 - s0) * t, z = (o.springZ ?? 0.2) + rise * Math.sin(PI * t);
      const p = P(a, cc, z);
      if (prev) beam(C, prev, p, 0.42, X.plate);
      if (k > 0 && k < n && k % 2 === 0) beam(C, p, P(a, cc, zd - 0.5), 0.14, X.plate);
      prev = p;
    }
  }
  for (let k = 1; k < n; k += 3) {
    const t = k / n, a = s0 + (s1 - s0) * t, z = (o.springZ ?? 0.2) + rise * Math.sin(PI * t);
    beam(C, P(a, c - hw + 0.3, z), P(a, c + hw - 0.3, z), 0.16, X.plate);
  }
  const P2 = (a) => (alongY ? [c, a] : [a, c]);
  for (const a of [s0, s1]) { const [x, y] = P2(a); mb.box(x - 1.2, y - 1.2, WATER_Z - 0.1, x + 1.2, y + 1.2, (o.springZ ?? 0.2) + 0.4, { ...sides(X.granite), pz: { t: X.granite } }); }
  // railing and lamps
  const iron = sides(propTex(C).black);
  for (const sd of [-1, 1]) for (let a = Math.min(a0, a1) + 0.5; a < Math.max(a0, a1); a += 1.2) {
    const [x, y] = alongY ? [c + sd * (hw - 0.05), a] : [a, c + sd * (hw - 0.05)];
    mb.box(x - 0.03, y - 0.03, zd, x + 0.03, y + 0.03, zd + 0.5, iron);
  }
  for (let a = Math.min(a0, a1) + 2; a < Math.max(a0, a1); a += 5) { const [x, y] = alongY ? [c, a] : [a, c]; C.world.lamps.push({ x, y, z: zd + 1.2, r: 2.4, color: [1, 0.86, 0.6], k: 0.5, kind: 'street' }); }
}

// ---- High Bridge: stone arches on tall piers striding across, a steel arch over the river --------
function highBridge(C, L) {
  const mb = C.mb, X = texes(C, 0x6a6458), W = C.world;
  const y = (L.y0 + L.y1) / 2, edge = L.x1 + STREET; // the Manhattan shore (the Harlem River beyond)
  const bronx = edge + 12, x0 = L.x1 - 7, x1 = bronx + 14, zd = 6.2, hw = 1.1;
  const archT = C.atlas.shared('aqueduct', 64, 96, (p) => {
    for (let yy = 0; yy < 96; yy++) for (let xx = 0; xx < 64; xx++) {
      const row = yy >> 3, off = row % 2 ? 8 : 0;
      let c = shade(mixc(0xa89a84, 0x988a74, hash2i((xx + off) >> 4, row, 311)), 0.93 + hash2i(xx, yy, 312) * 0.1);
      if (yy % 8 === 0 || (xx + off) % 16 === 0) c = 0x7a6e5c;
      const top = 30, r = 24, inArch = yy > top && Math.abs(xx - 31.5) < r && (yy > top + r * 0.3 || Math.hypot(xx - 31.5, yy - (top + r)) < r);
      if (inArch) p.set(xx, yy, 0, 0); else p.set(xx, yy, c);
    }
  });
  // stone arcades over the land at both ends
  const arcade = (a, b) => {
    for (let x = a; x < b - 0.01; x += 4) {
      const xb = Math.min(b, x + 4);
      for (const sy of [-1, 1]) {
        const yy = y + sy * hw;
        mb.quad(sy > 0 ? [xb, yy, zd - 0.5] : [x, yy, zd - 0.5], sy > 0 ? [x, yy, zd - 0.5] : [xb, yy, zd - 0.5], sy > 0 ? [x, yy, CURB] : [xb, yy, CURB], sy > 0 ? [xb, yy, CURB] : [x, yy, CURB], [[0, 0], [64, 0], [64, 96], [0, 96]].map(([u, v]) => [u * (xb - x) / 4, v * (zd - 0.5 - CURB) / 6]), archT, [0, sy, 0], MAT.FLAT);
      }
      mb.box(x - 0.3, y - hw, CURB, x + 0.3, y + hw, zd - 0.5, sides(X.granite));
    }
  };
  arcade(x0, edge - 0.5);
  arcade(bronx + 0.5, x1);
  mb.box(x0, y - hw, zd - 0.5, edge - 0.5, y + hw, zd, { py: X.granite, ny: X.granite, pz: { t: X.granite, world: true } });
  mb.box(bronx + 0.5, y - hw, zd - 0.5, x1, y + hw, zd, { py: X.granite, ny: X.granite, pz: { t: X.granite, world: true } });
  deckArch(C, { axis: 'x', c: y, a0: edge - 0.5, a1: bronx + 0.5, s0: edge + 0.3, s1: bronx - 0.3, zd, hw, color: 0x5a5e66, walk: true, springZ: 0.3 });
  markHeight(W, x0, y - hw, x1, y + hw, zd);
  landmark(C, 'HIGH BRIDGE', (edge + bronx) / 2, y + 8, 1);
  W.bridges.push({ name: 'HIGH BRIDGE', y, x0, x1, z: zd, hw });
}

// ---- the Roosevelt Island Tram: a red cabin on cables from Second Avenue over the river ----------
function tram(C, xa, xb, y, mid) {
  const mb = C.mb, X = texes(C, 0x8a8e94), W = C.world;
  const red = C.atlas.shared('tram_red', 16, 16, (p) => {
    for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) p.set(xx, yy, yy < 3 ? 0xd8dce0 : yy < 10 ? (xx % 4 === 0 ? 0x2a2e34 : 0x6a8aa8) : 0xc8302c, yy >= 3 && yy < 10 ? winCode(0.1, true) : 255);
  });
  const zs = 7.5;
  for (const x of [xa, xb]) {
    mb.box(x - 2.2, y - 1.6, CURB, x + 2.2, y + 1.6, zs, { ...sides(X.plate), pz: { t: X.plate } });
    markHeight(W, x - 2.2, y - 1.6, x + 2.2, y + 1.6, zs);
  }
  mb.box(mid - 0.5, y - 1.2, WATER_Z, mid + 0.5, y + 1.2, zs + 6, sides(X.lattice, { t: X.lattice }));
  for (const dy of [-0.5, 0.5]) {
    beam(C, [xa, y + dy, zs], [mid, y + dy, zs + 6], 0.05, X.cable);
    beam(C, [mid, y + dy, zs + 6], [xb, y + dy, zs], 0.05, X.cable);
  }
  // the cabin, partway across
  const cx = mid + (xb - mid) * 0.45, cz = zs + 6 - (6 * 0.45) - 2.2;
  mb.box(cx - 0.9, y - 0.6, cz, cx + 0.9, y + 0.6, cz + 1.3, sides(red, { t: X.plate }));
  mb.box(cx - 0.05, y - 0.05, cz + 1.3, cx + 0.05, y + 0.05, cz + 2.2, sides(X.cable));
  W.lampHeads.push({ x: cx, y, z: cz + 1.4, kind: 'globe' });
}

// ---------------------------------------------------------------------------------------------------
export function buildBridges(C) {
  const W = C.world;
  W.bridges = W.bridges || [];
  // George Washington Bridge: from Washington Heights over the Hudson to the top of the Palisades
  const gwb = findBlock('gwb');
  if (gwb) {
    const zd = 9.5, hw = 3.2, a = approach(C, gwb, 'w', zd, hw, 0x9aa0a6, { anchor: true });
    suspension(C, { name: 'GEORGE WASHINGTON BRIDGE', y: a.y, x0: 0, x1: gwb.x0 - STREET, t0: gwb.x0 - STREET - 8, t1: 27, zd, zt: 30, hw, style: 'gwb', color: 0x9aa0a6, leg: 2.0, lower: true,
      anchors: [gwb.x0 + 3, 2.5], cables: [-(hw + 1.6), -(hw + 1.0), hw + 1.0, hw + 1.6], cableR: 0.16, farOnLand: false, rot: 0 });
    // the little red lighthouse at the foot of the Manhattan tower
    lighthouse(C, gwb.x0 - STREET + 1.6, a.y + 6.5);
  }
  // Henry Hudson Bridge: a steel arch over Spuyten Duyvil from Inwood Hill to the Bronx
  const inw = findBlock('inwoodhill');
  if (inw) {
    const c = inw.x0 + 4.5, top = inw.y0 - STREET; // Manhattan's north shore
    deckArch(C, { axis: 'y', c, a0: 2, a1: inw.y0 + 6, s0: top - 12.5, s1: top - 0.5, zd: 6.5, hw: 1.6, color: 0x4a5a6a });
    C.mb.box(c - 1.6, inw.y0 + 2, CURB, c + 1.6, inw.y0 + 6, 6.0, sides(texes(C, 0x4a5a6a).granite));
    landmark(C, 'HENRY HUDSON BRIDGE', c + 8, top - 6, 0);
    W.bridges.push({ name: 'HENRY HUDSON BRIDGE', x: c, y0: 2, y1: inw.y0 + 6, z: 6.5, hw: 1.6 });
  }
  const hb = findBlock('highbridge');
  if (hb) highBridge(C, hb);
  // the Triborough: from East Harlem over the Harlem River and Randall's Island, then Hell Gate to Queens
  const tb = findBlock('tbridge');
  if (tb) {
    const zd = 7.2, hw = 2.6, a = approach(C, tb, 'e', zd, hw, 0x7a8a7a);
    const X = texes(C, 0x7a8a7a), edge = tb.x1 + STREET;
    deck(C, edge, 362, a.y, zd, hw, X);
    // the lift span's two towers over the Harlem River
    for (const tx of [edge + 1.5, edge + 10]) tower(C, tx, a.y, hw, zd, zd + 9, 'deco', X, { leg: 1.0 });
    // piers across Randall's Island
    for (let x = edge + 14; x < 358; x += 5) C.mb.box(x - 0.4, a.y - hw + 0.4, CURB, x + 0.4, a.y + hw - 0.4, zd - 0.5, sides(X.plate));
    suspension(C, { name: 'TRIBOROUGH BRIDGE', y: a.y, x0: 362, x1: MAPX, t0: 364, t1: BROOKLYN_X + 4, zd, zt: 21, hw, style: 'deco', color: 0x7a8a7a, leg: 1.2, anchors: [358, MAPX + 4], farOnLand: true, rot: 0 });
  }
  // Queensboro Bridge, over Roosevelt Island, and the tram beside it
  const qb = findBlock('qbridge');
  if (qb) {
    const zd = 7.6, hw = 2.8, a = approach(C, qb, 'e', zd, hw, 0x9a8e78, { trees: 'south' });
    const edge = qb.x1 + STREET, RI = { x0: 349, x1: 360 };
    cantilever(C, { name: 'QUEENSBORO BRIDGE', y: a.y, x0: edge, x1: MAPX, zd, hw, color: 0x9a8e78, piers: [edge + 3, RI.x0 + 2, RI.x1 - 2, BROOKLYN_X + 3], landPiers: [RI.x0 + 2, RI.x1 - 2, BROOKLYN_X + 3] });
    tram(C, qb.x1 - 2.4, RI.x0 + 4, qb.y0 + 2.2, edge + 4);
  }
  // Williamsburg and Manhattan Bridges to Brooklyn
  const wb = findBlock('wbridge');
  if (wb) {
    const zd = 7.2, hw = 2.8, a = approach(C, wb, 'e', zd, hw, 0x5c5652, { anchor: true });
    const edge = wb.x1 + STREET;
    suspension(C, { name: 'WILLIAMSBURG BRIDGE', y: a.y, x0: edge, x1: MAPX, t0: edge + 5, t1: BROOKLYN_X - 5, zd, zt: 19, hw, style: 'lattice', color: 0x5c5652, leg: 1.3, anchors: [wb.x1 - 3, BROOKLYN_X + 14], rot: 0 });
  }
  const mbr = findBlock('mbridge');
  if (mbr) {
    const zd = 7.4, hw = 3.0, a = approach(C, mbr, 'e', zd, hw, 0x6a8aaa, { anchor: true });
    const edge = mbr.x1 + STREET;
    suspension(C, { name: 'MANHATTAN BRIDGE', y: a.y, x0: edge, x1: MAPX, t0: edge + 6, t1: BROOKLYN_X - 6, zd, zt: 20, hw, style: 'arch', color: 0x6a8aaa, leg: 1.4, anchors: [mbr.x1 - 3, BROOKLYN_X + 14], rot: 0 });
    // the arch and colonnade at its Manhattan end
    colonnade(C, mbr.x0 + 0.8, a.y, hw);
  }
  void BOROUGHS;
}

// the little red lighthouse on its rock under the bridge
function lighthouse(C, x, y) {
  const mb = C.mb;
  const red = C.atlas.shared('lighthouse', 16, 32, (p) => { for (let yy = 0; yy < 32; yy++) for (let xx = 0; xx < 16; xx++) p.set(xx, yy, shade(0xc8302c, xx < 5 ? 1.12 : xx > 11 ? 0.8 : 1)); p.rect(6, 8, 3, 4, 0x2a2a2e); });
  const blackT = propTex(C).black;
  mb.cylinder(x, y, CURB, CURB + 3.2, 0.55, 10, red, null);
  mb.cylinder(x, y, CURB + 3.2, CURB + 3.8, 0.42, 10, blackT, null);
  mb.cone(x, y, CURB + 3.8, CURB + 4.4, 0.5, 10, blackT);
  C.world.lamps.push({ x, y, z: CURB + 3.5, r: 3, color: [1, 0.9, 0.6], k: 0.7, kind: 'neon' });
  C.world.solids.push([x - 0.6, y - 0.6, x + 0.6, y + 0.6, 4]);
}

// the triumphal arch and curved colonnades at the Manhattan Bridge's foot
function colonnade(C, x, y, hw) {
  const mb = C.mb, S = sharedTex(C);
  const lime = S.limestone;
  for (const sy of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 5) * (PI / 2), cx = x + Math.sin(a) * 1.4, cy = y + sy * (hw + 1.0 + (1 - Math.cos(a)) * 1.6 + k * 0.5);
      mb.cylinder(cx, cy, CURB, CURB + 2.4, 0.16, 8, lime, null);
    }
    mb.box(x - 0.3, y + sy * (hw + 0.8), CURB + 2.4, x + 1.6, y + sy * (hw + 5.2), CURB + 2.8, sides(lime, { t: S.limeTop }));
  }
  mb.box(x - 0.4, y - hw - 0.8, CURB, x + 0.6, y - hw + 0.2, CURB + 4.6, sides(lime, { t: S.limeTop }));
  mb.box(x - 0.4, y + hw - 0.2, CURB, x + 0.6, y + hw + 0.8, CURB + 4.6, sides(lime, { t: S.limeTop }));
  void markHeight;
}
