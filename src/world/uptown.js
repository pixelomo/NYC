// The blocks the rest of the island needed: Riverside Park all down the Hudson (with Grant's Tomb,
// Riverside Church's tower and the Soldiers' and Sailors' Monument), the wooded hills of Inwood Hill
// and Fort Tryon Parks with the Cloisters, Highbridge Park and its water tower, Columbia's Low
// Library, the Apollo on 125th Street, Union Square, and City Hall Park with the Woolworth Building.

import { T, CURB, STREET } from './layout.js';
import { MAT } from './mesh.js';
import { winCode } from '../core/painter.js';
import { shade, mixc, hash2i, valueNoise } from '../core/math.js';
import { PAL, stoneFill } from './facades.js';
import { sharedTex, markHeight } from './buildings.js';
import { section, band } from './towers.js';
import { propTex, parkLamp, trashBasket } from './props.js';
import { landmark, flagPole, wall, roundPool } from './landmarks.js';
import { module } from './manhattan.js';

const PI = Math.PI;
const sides = (t, top) => (top ? { px: t, nx: t, py: t, ny: t, pz: top } : { px: t, nx: t, py: t, ny: t });
const copper = (C) => C.atlas.shared('copper', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let c = shade(x % 8 === 0 ? 0x4f9a86 : x % 8 === 1 ? 0x7cc8b0 : 0x6cb8a0, 0.92 + hash2i(x, y, 4) * 0.12);
    if (hash2i(x >> 1, y >> 2, 7) > 0.86) c = mixc(c, 0x8ad8c0, 0.4);
    p.set(x, y, c);
  }
});
// a painted path: a polyline of the given width
function path(C, pts, w, kind = 'path') {
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
    C.paintWhere(Math.min(ax, bx) - w, Math.min(ay, by) - w, Math.max(ax, bx) + w, Math.max(ay, by) + w, (x, y) => {
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x - ax - dx * t, y - ay - dy * t) < w / 2;
    }, kind);
  }
}
const nearPts = (pts, x, y, m) => pts.some((q, k) => k > 0 && (() => {
  const [ax, ay] = pts[k - 1], [bx, by] = q, dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t) < m;
})());

// trees scattered over a block, avoiding the given paths and the kept-clear test
function woods(C, L, density, species, paths, keep = () => false) {
  const rng = C.rng;
  for (let y = L.y0 + 1; y < L.y1 - 0.8; y += 1.8)
    for (let x = L.x0 + 1; x < L.x1 - 0.8; x += 1.8) {
      const tx = x + (hash2i(Math.round(x * 10), Math.round(y * 10), 501) - 0.5) * 1.2, ty = y + (hash2i(Math.round(x * 10), Math.round(y * 10), 502) - 0.5) * 1.2;
      if (hash2i(Math.round(tx * 7), Math.round(ty * 7), 503) > density) continue;
      if (paths.some((p) => nearPts(p.pts, tx, ty, p.w / 2 + 0.6)) || keep(tx, ty)) continue;
      C.addTree(tx, ty, rng.pick(species), false, { scale: rng.range(0.95, 1.3) });
    }
}

// ---- Riverside Park --------------------------------------------------------------------------------
// a wooded strip along the Hudson: a promenade by the water, a winding path under the trees, and
// on some blocks a monument
export function riverside(C, L, kind) {
  const rng = C.rng, W = C.world;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'grass');
  C.paintWhere(L.x0, L.y0, L.x1, L.y1, (x, y) => valueNoise(x * 0.2, y * 0.2, 511) > 0.45, 'woods');
  const prom = { pts: [[L.x0 + 1.6, L.y0 - 1], [L.x0 + 1.6, L.y1 + 1]], w: 2.2 };
  const wind = { pts: [[L.x0 + 9, L.y0 - 1], [L.x0 + 11.5, L.y0 + 5], [L.x0 + 8.5, L.y0 + 10], [L.x0 + 11, L.y0 + 15], [L.x0 + 9.5, L.y1 + 1]], w: 1.4 };
  const paths = [prom, wind];
  let keep = () => false;
  if (kind === 'grantstomb') {
    // Grant's Tomb: a granite block with a columned portico, the round drum and stepped roof above,
    // on a plaza; Riverside Church's Gothic tower beyond it to the north
    const cx = L.x0 + 10.5, cy = L.y0 + 11.5;
    C.paintGround(cx - 5.5, cy - 5.5, cx + 5.5, L.y1, 'plaza');
    keep = (x, y) => (x > cx - 6.5 && x < cx + 6.5 && y > cy - 6.5) || (x > L.x1 - 7 && y < L.y0 + 7);
    grantsTomb(C, cx, cy);
    riversideChurch(C, L.x1 - 3.6, L.y0 + 3.6);
    landmark(C, "GRANT'S TOMB", cx, L.y1 + 3, 3);
  } else if (kind === 'soldiers') {
    // the Soldiers' and Sailors' Monument: a ring of marble columns on a terrace
    const cx = L.x0 + 11, cy = (L.y0 + L.y1) / 2;
    C.paintWhere(cx - 4, cy - 4, cx + 4, cy + 4, (x, y) => Math.hypot(x - cx, y - cy) < 3.8, 'plaza');
    keep = (x, y) => Math.hypot(x - cx, y - cy) < 4.6;
    monument(C, cx, cy);
    landmark(C, "SOLDIERS' AND SAILORS' MONUMENT", cx, L.y1 + 3, 3);
  }
  for (const p of paths) path(C, p.pts, p.w);
  woods(C, L, 0.68, ['plane', 'elm', 'oak', 'locust', 'elm'], paths, keep);
  for (let y = L.y0 + 3; y < L.y1 - 1; y += 6) { parkLamp(C, L.x0 + 3.1, y); C.addBench(L.x0 + 3.0, y + 2.4, 'y', -1); }
  W.lawns = W.lawns || [];
  void rng;
}
function grantsTomb(C, cx, cy) {
  const mb = C.mb, S = sharedTex(C);
  const gran = C.atlas.shared('grant_granite', 32, 32, (p) => { stoneFill(p, 0, 0, 32, 32, [0xe2dccc], 521, 8, { blocks: 16 }); });
  // steps, the base, the portico's columns on the south front
  mb.box(cx - 4.2, cy - 4.2, CURB, cx + 4.2, cy + 4.6, CURB + 0.6, sides(gran, { t: gran }));
  mb.box(cx - 3.4, cy - 3.4, CURB + 0.6, cx + 3.4, cy + 3.0, CURB + 4.6, sides(gran, { t: gran }), { mat: MAT.OFFICE });
  for (let k = 0; k < 6; k++) mb.cylinder(cx - 2.6 + k * 1.04, cy + 3.6, CURB + 0.6, CURB + 4.2, 0.24, 8, gran, null);
  mb.box(cx - 3.1, cy + 3.0, CURB + 4.2, cx + 3.1, cy + 4.1, CURB + 4.6, sides(gran, { t: gran }));
  mb.gable(cx - 3.1, cy + 3.0, cx + 3.1, cy + 4.1, CURB + 4.6, CURB + 5.4, 'y', gran, gran);
  // the drum with its colonnade, the stepped cone of a roof
  mb.cylinder(cx, cy, CURB + 4.6, CURB + 7.4, 2.3, 16, gran, null);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * 2 * PI; mb.cylinder(cx + Math.cos(a) * 2.55, cy + Math.sin(a) * 2.55, CURB + 4.6, CURB + 7.2, 0.14, 6, gran, null); }
  mb.cylinder(cx, cy, CURB + 7.2, CURB + 7.6, 2.75, 16, gran, gran);
  for (let k = 0; k < 4; k++) mb.cylinder(cx, cy, CURB + 7.6 + k * 0.35, CURB + 7.95 + k * 0.35, 2.2 - k * 0.45, 16, gran, gran);
  markHeight(C.world, cx - 4.2, cy - 4.2, cx + 4.2, cy + 4.6, CURB + 9);
  void S;
}
function riversideChurch(C, cx, cy) {
  const mb = C.mb;
  const stone = C.atlas.shared('rc_stone', 32, 64, (p) => {
    stoneFill(p, 0, 0, 32, 64, [0xc8bea8], 531, 8, { blocks: 16 });
    for (let y = 12; y < 52; y++) for (let x = 12; x < 20; x++) { const top = y < 17 ? Math.abs(x - 15.5) < (y - 11) * 0.8 : true; if (top) p.set(x, y, 0x2a3440, winCode(0.3, true)); }
  });
  mb.box(cx - 2.4, cy - 2.4, CURB, cx + 2.4, cy + 2.4, CURB + 22, sides(stone, { t: stone }), { mat: MAT.OFFICE });
  for (const [dx, dy] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) mb.box(cx + dx - 0.35, cy + dy - 0.35, CURB, cx + dx + 0.35, cy + dy + 0.35, CURB + 24, sides(stone, { t: stone }));
  mb.box(cx - 2.0, cy - 2.0, CURB + 22, cx + 2.0, cy + 2.0, CURB + 24.5, sides(stone, { t: stone }));
  mb.pyramid(cx - 1.6, cy - 1.6, cx + 1.6, cy + 1.6, CURB + 24.5, CURB + 27, stone);
  markHeight(C.world, cx - 2.4, cy - 2.4, cx + 2.4, cy + 2.4, CURB + 24.5);
  landmark(C, 'RIVERSIDE CHURCH', cx, cy + 9, 3);
}
function monument(C, cx, cy) {
  const mb = C.mb, S = sharedTex(C);
  const marble = C.atlas.shared('ssm_marble', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade(0xf0ece2, 0.95 + hash2i(x, y, 541) * 0.06)); });
  mb.cylinder(cx, cy, CURB, CURB + 0.8, 2.8, 16, S.greystone, S.limeTop);
  mb.cylinder(cx, cy, CURB + 0.8, CURB + 4.0, 1.2, 12, marble, null);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * 2 * PI; mb.cylinder(cx + Math.cos(a) * 1.75, cy + Math.sin(a) * 1.75, CURB + 0.8, CURB + 4.0, 0.15, 6, marble, null); }
  mb.cylinder(cx, cy, CURB + 4.0, CURB + 4.5, 2.05, 16, marble, marble);
  mb.cone(cx, cy, CURB + 4.5, CURB + 5.2, 1.6, 16, marble);
  C.world.solids.push([cx - 2.8, cy - 2.8, cx + 2.8, cy + 2.8, 4.5]);
}

// ---- Inwood Hill Park: forest on the hill at the island's northern tip --------------------------
export function inwoodHill(C, L) {
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'woods');
  C.paintWhere(L.x0, L.y0, L.x1, L.y1, (x, y) => valueNoise(x * 0.25, y * 0.25, 551) > 0.62, 'grass');
  const paths = [{ pts: [[L.x0 + 9, L.y1 + 1], [L.x0 + 11, L.y0 + 12], [L.x0 + 8, L.y0 + 6], [L.x0 + 12, L.y0 + 1]], w: 1.2 }];
  for (const p of paths) path(C, p.pts, p.w, 'dirt');
  woods(C, L, 0.92, ['oak', 'oak', 'pine', 'elm', 'locust', 'pine'], paths, (x) => x < L.x0 + 6.8);
  rocks(C, [[L.x0 + 14, L.y0 + 5, 1.0, 1.0], [L.x0 + 4, L.y1 - 4, 0.8, 0.7], [L.x1 - 3, L.y1 - 6, 0.7, 0.6]]);
  landmark(C, 'INWOOD HILL PARK', L.x0 + 9, L.y1 + 3, 3);
}
function rocks(C, list) {
  const mb = C.mb;
  const rockTex = C.atlas.shared('schist', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const band = Math.sin((x * 0.35 + y * 0.9) + valueNoise(x * 0.2, y * 0.2, 5) * 3);
      let c = band > 0.6 ? 0x8a8780 : band < -0.5 ? 0x5e5c58 : 0x74716a;
      if (hash2i(x >> 1, y >> 1, 9) > 0.93) c = 0xa0a49a;
      if (hash2i(x >> 2, y >> 2, 10) > 0.9) c = mixc(c, 0x8a9a5a, 0.5);
      p.set(x, y, shade(c, 0.92 + hash2i(x, y, 11) * 0.14));
    }
  });
  for (const [x, y, r, h] of list) {
    mb.cylinder(x, y, CURB - 0.05, CURB + h * 0.55, r, 6, rockTex, null, { angle: x });
    mb.cone(x, y, CURB + h * 0.55, CURB + h, r, 6, rockTex, { angle: x, mat: MAT.SNOW });
  }
  return rockTex;
}

// ---- Fort Tryon Park and the Cloisters --------------------------------------------------------------
export function cloisters(C, L) {
  const mb = C.mb, W = C.world;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'grass');
  C.paintWhere(L.x0, L.y0, L.x1, L.y1, (x, y) => valueNoise(x * 0.22, y * 0.22, 561) > 0.5, 'woods');
  // the monastery on its rocky height at the north end: walls of grey stone, the square tower with its
  // red-tiled roof, the cloister garden in the middle
  const x0 = L.x0 + 3, x1 = L.x0 + 14, y0 = L.y0 + 2, y1 = L.y0 + 10, zb = CURB + 1.4;
  const rockTex = rocks(C, []);
  mb.box(x0 - 1.2, y0 - 1.2, CURB, x1 + 1.2, y1 + 1.2, zb, { ...sides(rockTex), pz: { t: rockTex } });
  const stone = C.atlas.shared('cloister_stone', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const row = y >> 2, off = row % 2 ? 4 : 0;
      let c = mixc(0x9a958a, 0x7e7a72, hash2i((x + off) >> 3, row, 571));
      if (y % 4 === 0 || (x + off) % 8 === 0) c = 0x66625c;
      p.set(x, y, shade(c, 0.94 + hash2i(x, y, 572) * 0.1));
    }
    for (const wx of [6, 20]) for (let y = 10; y < 22; y++) for (let x = wx; x < wx + 5; x++) { const top = y < 13 ? Math.abs(x - wx - 2) < (y - 9) : true; if (top) p.set(x, y, 0x2a2a30, winCode(0.4, true)); }
  });
  const tile = C.atlas.shared('terracotta', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade((y % 4 < 2) ? 0xb8583a : 0xa04a30, 0.92 + hash2i(x >> 2, y >> 2, 573) * 0.12)); });
  // ranges round the cloister
  for (const [a, b, c, d] of [[x0, y0, x1, y0 + 2.2], [x0, y1 - 2.2, x1, y1], [x0, y0, x0 + 2.2, y1], [x1 - 2.2, y0, x1, y1]]) {
    mb.box(a, b, zb, c, d, zb + 2.4, sides(stone, { t: stone }), { mat: MAT.OFFICE });
  }
  mb.gable(x0, y0, x1, y0 + 2.2, zb + 2.4, zb + 3.4, 'x', tile, stone);
  mb.gable(x0, y1 - 2.2, x1, y1, zb + 2.4, zb + 3.4, 'x', tile, stone);
  C.paintGround(x0 + 2.2, y0 + 2.2, x1 - 2.2, y1 - 2.2, 'flowerbed');
  mb.box(x0 + 2.2, y0 + 2.2, CURB, x1 - 2.2, y1 - 2.2, zb + 0.02, { pz: { t: W.ground, world: true, mat: MAT.GROUND | MAT.SNOW } });
  // the tower
  const tx = x0 + 6, ty = y0 + 1.1;
  mb.box(tx - 1.6, ty - 1.6, zb, tx + 1.6, ty + 1.6, zb + 7.0, sides(stone, { t: stone }), { mat: MAT.OFFICE });
  mb.pyramid(tx - 1.9, ty - 1.9, tx + 1.9, ty + 1.9, zb + 7.0, zb + 9.0, tile);
  markHeight(W, x0 - 1.2, y0 - 1.2, x1 + 1.2, y1 + 1.2, zb + 3.4);
  markHeight(W, tx - 1.6, ty - 1.6, tx + 1.6, ty + 1.6, zb + 9);
  const paths = [{ pts: [[L.x1 + 1, L.y1 - 3], [L.x0 + 12, L.y1 - 4], [L.x0 + 8, y1 + 2], [x0 + 6, y1 + 1.2]], w: 1.4 }];
  for (const p of paths) path(C, p.pts, p.w);
  woods(C, L, 0.8, ['oak', 'elm', 'pine', 'locust', 'cherry'], paths, (x, y) => x > x0 - 2.5 && x < x1 + 2.5 && y > y0 - 2.5 && y < y1 + 2.5);
  landmark(C, 'THE CLOISTERS', (x0 + x1) / 2, L.y1 + 3, 3);
}

// ---- Highbridge Park and its water tower, on the bluff over the Harlem River ------------------------
export function highbridgePark(C, L) {
  const mb = C.mb;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'grass');
  C.paintWhere(L.x0, L.y0, L.x1, L.y1, (x, y) => valueNoise(x * 0.25, y * 0.25, 581) > 0.5, 'woods');
  const yc = (L.y0 + L.y1) / 2;
  const paths = [{ pts: [[L.x0 - 1, yc], [L.x1 + 1, yc]], w: 2.0 }, { pts: [[L.x0 + 6, L.y0 - 1], [L.x0 + 6, L.y1 + 1]], w: 1.2 }];
  for (const p of paths) path(C, p.pts, p.w);
  const tx = L.x1 - 5, ty = L.y0 + 4.5;
  const gran = C.atlas.shared('hb_tower', 32, 64, (p) => {
    stoneFill(p, 0, 0, 32, 64, [0xb8ae9a], 591, 8, { blocks: 16 });
    for (const y of [14, 34, 52]) { p.rect(13, y, 6, 8, 0x2a3440, winCode(0.4, true)); }
  });
  mb.cylinder(tx, ty, CURB, CURB + 13, 1.3, 8, gran, null);
  mb.cylinder(tx, ty, CURB + 13, CURB + 13.8, 1.55, 8, gran, gran);
  mb.cylinder(tx, ty, CURB + 13.8, CURB + 15.4, 1.0, 8, gran, null);
  mb.cone(tx, ty, CURB + 15.4, CURB + 17.4, 1.15, 8, sharedTex(C).slate ?? gran);
  markHeight(C.world, tx - 1.3, ty - 1.3, tx + 1.3, ty + 1.3, CURB + 15.4);
  woods(C, L, 0.75, ['oak', 'elm', 'locust', 'pine'], paths, (x, y) => Math.hypot(x - tx, y - ty) < 2.6 || (x > L.x1 - 8 && Math.abs(y - yc) < 2.5));
  landmark(C, 'HIGH BRIDGE WATER TOWER', tx, ty + 8, 1);
}

// ---- Columbia: Low Library's dome and portico over the steps, lawns, the libraries round them ------
export function columbia(C, L) {
  const mb = C.mb, S = sharedTex(C), W = C.world;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  const cx = (L.x0 + L.x1) / 2, cy = L.y0 + 7;
  C.paintGround(L.x0 + 1.5, cy + 6, cx - 1.5, L.y1 - 1.5, 'lawn');
  C.paintGround(cx + 1.5, cy + 6, L.x1 - 1.5, L.y1 - 1.5, 'lawn');
  const lime = C.atlas.shared('low_lime', 32, 48, (p) => { stoneFill(p, 0, 0, 32, 48, [0xe6dcc6], 601, 12, { blocks: 32 }); for (const wx of [6, 20]) { p.rect(wx, 14, 6, 22, 0x2a3440, winCode(0.3, true)); } });
  // the library: a cross of limestone with a portico of columns, the dome over the middle
  mb.box(cx - 4.5, cy - 4.5, CURB, cx + 4.5, cy + 4.5, CURB + 4.2, sides(lime, { t: S.roofTar }), { mat: MAT.OFFICE });
  for (let k = 0; k < 6; k++) mb.cylinder(cx - 3 + k * 1.2, cy + 5.1, CURB + 0.5, CURB + 4.0, 0.22, 8, lime, null);
  mb.box(cx - 3.5, cy + 4.5, CURB + 4.0, cx + 3.5, cy + 5.7, CURB + 4.6, sides(lime, { t: S.limeTop }));
  mb.box(cx - 3.6, cy + 4.4, CURB, cx + 3.6, cy + 5.8, CURB + 0.5, sides(S.limestone, { t: S.limeTop }));
  mb.cylinder(cx, cy, CURB + 4.2, CURB + 5.4, 3.0, 16, lime, null);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * (PI / 2), r = 3.0 * Math.cos(a); mb.cylinder(cx, cy, CURB + 5.4 + Math.sin(a) * 2.8, CURB + 5.4 + Math.sin(((k + 1) / 5) * (PI / 2)) * 2.8, r, 16, S.greystone, k === 4 ? S.greystone : null); }
  markHeight(W, cx - 4.5, cy - 4.5, cx + 4.5, cy + 4.5, CURB + 8.2);
  // the steps down to the lawns, and Alma Mater on her pedestal
  C.paintGround(cx - 3.5, cy + 5.8, cx + 3.5, cy + 8, 'stairsY');
  mb.box(cx - 0.5, cy + 8.4, CURB, cx + 0.5, cy + 9.2, CURB + 1.1, sides(S.greystone, { t: S.limeTop }));
  C.addSprite('goldStatue', cx, cy + 8.8, CURB + 1.1);
  // academic halls of red brick with limestone trim round the edges
  const brick = module(C, 'col_brick', { brick: PAL.brickRed, frame: 0xf2efe6, lintel: 0xe6dabe, sill: 0xe6dabe, band: 0xe6dabe });
  for (const [a, b, c, d] of [[L.x0 + 0.5, L.y0 + 0.5, L.x0 + 3.5, L.y1 - 0.5], [L.x1 - 3.5, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5]]) {
    section(C, a, b, c, d, CURB, CURB + 6, brick, S.roofGreen ?? S.roofTar, { seed: 611, mat: MAT.OFFICE });
  }
  for (const x of [L.x0 + 5, L.x1 - 5]) for (let y = cy + 7; y < L.y1 - 1; y += 2.6) C.addTree(x, y, 'elm', false);
  W.officeDoors.push({ x: cx, y: L.y1 + 0.9, dx: cx, dy: cy + 8.6, kind: 'office' });
  landmark(C, 'COLUMBIA UNIVERSITY', cx, L.y1 + 3, 3);
}

// ---- Union Square: the paved square, lawns and trees, the equestrian Washington, market stalls -----
export function unionSquare(C, L) {
  const mb = C.mb, S = sharedTex(C), rng = C.rng;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  C.paintGround(L.x0 + 2, L.y0 + 2, cx - 1.2, cy - 1.2, 'lawn');
  C.paintGround(cx + 1.2, L.y0 + 2, L.x1 - 2, cy - 1.2, 'lawn');
  C.paintGround(L.x0 + 2, cy + 1.2, cx - 1.2, L.y1 - 6, 'lawn');
  C.paintGround(cx + 1.2, cy + 1.2, L.x1 - 2, L.y1 - 6, 'lawn');
  for (let k = 0; k < 14; k++) { const x = L.x0 + 2.5 + rng.range(0, L.x1 - L.x0 - 5), y = L.y0 + 2.5 + rng.range(0, L.y1 - L.y0 - 9); if (Math.abs(x - cx) < 2 || Math.abs(y - cy) < 2) continue; C.addTree(x, y, rng.pick(['plane', 'elm', 'oak']), false); }
  mb.box(cx - 0.8, cy - 1.0, CURB, cx + 0.8, cy + 1.0, CURB + 1.4, sides(S.greystone, { t: S.limeTop }));
  C.addSprite('statue', cx, cy, CURB + 1.4);
  C.world.solids.push([cx - 0.8, cy - 1, cx + 0.8, cy + 1, 1.4]);
  // the greenmarket's stalls along the south side
  const cols = [0xc8302c, 0x2f8a46, 0xf2efe6, 0x1f4f9a, 0xe0a020];
  cols.forEach((col, k) => {
    const t = C.atlas.shared(`stall_${col}`, 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x >> 2) % 2 ? col : 0xf2efe6); });
    const x = L.x0 + 2 + k * 3.0, y = L.y1 - 3;
    for (const [dx, dy] of [[0, 0], [2.2, 0], [0, 1.6], [2.2, 1.6]]) mb.box(x + dx - 0.04, y + dy - 0.04, CURB, x + dx + 0.04, y + dy + 0.04, CURB + 1.4, sides(propTex(C).silver));
    mb.box(x - 0.1, y - 0.1, CURB + 1.4, x + 2.3, y + 1.7, CURB + 1.6, sides(t, { t }));
    mb.box(x + 0.1, y + 0.2, CURB, x + 2.1, y + 0.8, CURB + 0.8, sides(S.wood, { t: S.wood }));
  });
  for (const [x, y] of [[L.x0 + 1.2, L.y0 + 1.2], [L.x1 - 1.2, L.y0 + 1.2], [L.x0 + 1.2, cy], [L.x1 - 1.2, cy]]) parkLamp(C, x, y);
  trashBasket(C, cx + 2, cy + 2);
  landmark(C, 'UNION SQUARE', cx, L.y1 + 3, 0);
}

// ---- City Hall Park and the Woolworth Building ---------------------------------------------------------
export function cityHall(C, L) {
  const mb = C.mb, S = sharedTex(C), W = C.world, rng = C.rng;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'grass');
  const cx = L.x0 + 11.5, cy = (L.y0 + L.y1) / 2 - 1;
  C.paintGround(cx - 5.5, cy - 4, cx + 5.5, L.y1, 'plaza');
  path(C, [[L.x0 + 6.5, L.y1 + 1], [L.x0 + 6.5, L.y0 - 1]], 1.6);
  // City Hall: white marble, two storeys and a central pavilion, the cupola with a clock
  const marble = C.atlas.shared('ch_marble', 32, 48, (p) => {
    stoneFill(p, 0, 0, 32, 48, [0xf2eee4], 621, 12, { blocks: 32 });
    for (const wx of [5, 19]) for (const wy of [8, 28]) { p.rect(wx, wy, 8, 14, 0x2a3440, winCode(0.4)); p.rect(wx - 1, wy - 2, 10, 2, 0xd8d0c0); }
  });
  mb.box(cx - 5, cy - 2.2, CURB, cx + 5, cy + 2.2, CURB + 4.2, sides(marble, { t: S.roofTar }), { mat: MAT.OFFICE });
  mb.box(cx - 1.6, cy + 2.2, CURB, cx + 1.6, cy + 3.0, CURB + 4.6, sides(marble, { t: S.limeTop }));
  mb.cylinder(cx, cy, CURB + 4.2, CURB + 5.6, 0.9, 8, marble, null);
  mb.cylinder(cx, cy, CURB + 5.6, CURB + 6.4, 0.6, 8, marble, null);
  mb.cone(cx, cy, CURB + 6.4, CURB + 7.4, 0.7, 8, copper(C));
  markHeight(W, cx - 5, cy - 2.2, cx + 5, cy + 2.2, CURB + 4.2);
  roundPool(C, cx, cy + 6.2, 1.8);
  W.fountains.push({ x: cx, y: cy + 6.2, z: CURB + 0.4, kind: 'pool', w: 3.2, d: 3.2 });
  for (let k = 0; k < 10; k++) { const x = L.x0 + 9 + rng.range(0, 8), y = rng.chance(0.5) ? L.y0 + rng.range(1.5, 4) : L.y1 - rng.range(1, 2.5); C.addTree(x, y, rng.pick(['plane', 'elm']), false); }
  // the Woolworth Building on the west side: cream terracotta Gothic, rising to a green-copper crown
  const terra = C.atlas.shared('woolworth', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0xeee2c8, 0.95 + hash2i(x, y, 631) * 0.06));
    for (const px of [0, 8, 16, 24]) { p.rect(px, 0, 2, 48, 0xfaf2de); p.vline(px + 2, 0, 48, 0xc8bca0); }
    for (const wx of [3, 11, 19, 27]) p.rect(wx, 6, 4, 34, 0x2a3440, winCode(0.5));
    p.rect(0, 42, 32, 2, 0xd8ccb0);
  });
  const wx0 = L.x0 + 0.6, wx1 = L.x0 + 5.6, wy0 = L.y0 + 0.6, wy1 = L.y1 - 0.6, z0 = CURB;
  section(C, wx0, wy0, wx1, wy1, z0, z0 + 14, terra, S.roofTar, { seed: 641, mat: MAT.OFFICE });
  const ty0 = (wy0 + wy1) / 2 - 3, ty1 = ty0 + 6;
  section(C, wx0 + 0.4, ty0, wx1 - 0.4, ty1, z0 + 14, z0 + 30, terra, S.roofTar, { seed: 642, mat: MAT.OFFICE });
  section(C, wx0 + 0.9, ty0 + 0.6, wx1 - 0.9, ty1 - 0.6, z0 + 30, z0 + 34, terra, S.roofTar, { seed: 643, mat: MAT.OFFICE });
  mb.pyramid(wx0 + 0.9, ty0 + 0.6, wx1 - 0.9, ty1 - 0.6, z0 + 34, z0 + 38, copper(C));
  for (const [dx, dy] of [[0.9, 0.6], [-0.9, 0.6], [0.9, -0.6], [-0.9, -0.6]]) { const x = dx > 0 ? wx0 + dx : wx1 + dx, y = dy > 0 ? ty0 + dy : ty1 + dy; mb.cone(x, y, z0 + 34, z0 + 36, 0.3, 6, copper(C)); }
  W.officeDoors.push({ x: wx0 - 0.9, y: (wy0 + wy1) / 2, dx: wx0 + 0.3, dy: (wy0 + wy1) / 2, kind: 'office' });
  W.beacons.push({ x: (wx0 + wx1) / 2, y: (ty0 + ty1) / 2, z: z0 + 38.2 });
  landmark(C, 'CITY HALL', cx, L.y1 + 3, 3);
  landmark(C, 'WOOLWORTH BUILDING', wx0 - 4, wy1 + 4, 3);
  flagPole(C, cx + 3.6, cy + 4.2, 3.4, 'us');
  void band; void wall; void T; void STREET;
}
