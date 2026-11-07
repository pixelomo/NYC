// Landmarks of the big city, each built on its own block from the same kit as the rest of the town:
// an Empire State-style art deco tower with its mooring mast, a Chrysler-style crown of stainless
// sunbursts, One World Trade Center's tapering glass shaft, Rockefeller Center's slab over its sunken
// plaza (rink in winter, fountains in summer) with the golden statue and flags, the Flatiron wedge,
// Grand Central's arched front with the tower behind it, the Public Library with its stone lions
// and Bryant Park, the arena drum, the stock exchange's columns and great flag, Washington Square's
// arch and fountain, Chinatown, the Brooklyn Bridge over the East River and the Statue of Liberty.

import { T, CURB, WATER_Z, RIVER_X, MAP } from './layout.js';
import { MAT } from './mesh.js';
import { winCode, textWidth } from '../core/painter.js';
import { shade, mixc, hash2i, RNG } from '../core/math.js';
import { PAL, stoneFill, brickFill, smoothFill, drawWindow, signBoard } from './facades.js';
import { sharedTex, markHeight, Frame } from './buildings.js';
import { section, band, region, beacon, lobbyDoors, plaza } from './towers.js';
import { propTex, beam } from './props.js';

const PI = Math.PI;
const CROWN = 254; // window code for coloured crown lights at night

// a landmark's name and where to look at it from (for the GO TO menu and tourists)
function landmark(C, name, x, y) {
  (C.world.landmarks || (C.world.landmarks = [])).push({ name, x, y });
}

// a free-standing flagpole with a waving flag
function flagPole(C, x, y, h, type = 'us') {
  const P = propTex(C);
  C.mb.box(x - 0.04, y - 0.04, CURB, x + 0.04, y + 0.04, CURB + h, { px: P.silver, nx: P.silver, py: P.silver, ny: P.silver, pz: P.silver });
  C.world.flags.push({ x, y, z: CURB + h - 0.05, n: [0, 1], type, tip: { x: x + 0.45, y } });
}

// lobby band: stone with bronze doors and a name over the main entrance
function lobbyBand(C, x0, y0, x1, y1, z0, z1, name, o = {}) {
  const S = sharedTex(C);
  band(C, x0, y0, x1, y1, z0, z1, (p, w, h, i) => {
    stoneFill(p, 0, 0, w, h, [o.stone ?? 0xd8ccb0], 7 + i, 16, { blocks: 32 });
    p.rect(0, 0, w, 5, o.trim ?? 0x8a6a3a);
    p.hline(0, 2, w, 0xc8a24a);
    for (let x = 10; x < w - 26; x += 40) {
      p.rect(x, 14, 22, h - 14, 0x5a3e1e);
      p.rect(x + 2, 16, 18, h - 16, 0x40576d, winCode(0.04));
      p.vline(x + 11, 26, h - 26, 0x8a6a3a);
      p.hline(x + 2, 26, 18, 0x8a6a3a);
      for (let k = 0; k < 5; k++) p.line(x + 11, 26, x + 2 + k * 4.5, 16, 0xc8a24a);
    }
    if (name && (i === 0 || i === 1)) signBoard(p, Math.floor(w / 2) - 50, 6, 100, 10, name, { bg: o.trim ?? 0x8a6a3a, fg: 0xf2d27a, t: 0.03, shadow: false });
  }, S.roofTar, { mat: MAT.OFFICE });
}

// ---------------------------------------------------------------------------------------------
// Empire State-style tower: limestone with full-height aluminium piers, five setbacks, a lit
// crown and the mooring mast and antenna on top (the tallest thing in midtown)
export function empireState(C, L) {
  const S = sharedTex(C), { rng } = C, z0 = C.z0;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  const stone = 0xd9cfb6;
  const mod = C.atlas.shared('esb_mod', 32, 48, (p) => {
    stoneFill(p, 0, 0, 32, 48, [stone], 61, 0);
    for (const bx of [3, 18]) {
      drawWindow(p, bx, 5, 11, 29, { frame: 0x2a2a30, t: 0.5, panes: '1/1' }, rng);
      for (let y = 36; y < 46; y++) for (let x = bx; x < bx + 11; x++) p.set(x, y, (x + y) % 4 === 0 ? 0x8a8a94 : 0x6c6c76);
    }
    for (const px of [0, 15, 30]) { p.vline(px, 0, 48, 0xeef1f4); p.vline(px + 1, 0, 48, 0xb0b4bc); }
  });
  lobbyBand(C, L.x0 + 0.5, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0, z0 + 2.5, '350 5TH AV');
  section(C, L.x0 + 0.5, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0 + 2.5, z0 + 9, mod, S.roofTar, { seed: 90 });
  section(C, cx - 7, cy - 7, cx + 7, cy + 7, z0 + 9, z0 + 20, mod, S.roofTar, { seed: 91 });
  section(C, cx - 5.5, cy - 5.5, cx + 5.5, cy + 5.5, z0 + 20, z0 + 62, mod, S.roofTar, { seed: 92 });
  section(C, cx - 4.4, cy - 4.4, cx + 4.4, cy + 4.4, z0 + 62, z0 + 67, mod, S.roofTar, { seed: 93 });
  // the crown floors: their piers carry the coloured night lights
  const crownFace = (p, w, h) => {
    stoneFill(p, 0, 0, w, h, [stone], 64, 0);
    for (let x = 0; x < w; x += 15) {
      drawWindow(p, x + 3, 6, 9, h - 14, { frame: 0x2a2a30, t: 0.6, panes: '1/1' }, rng);
      p.vline(x, 0, h, 0xf2f4f6, CROWN); p.vline(x + 1, 0, h, 0xd8dce4, CROWN);
    }
    p.hline(0, 0, w, 0xf2f4f6, CROWN); p.hline(0, h - 1, w, 0xb8ae96);
  };
  band(C, cx - 3.5, cy - 3.5, cx + 3.5, cy + 3.5, z0 + 67, z0 + 71, crownFace, S.roofTar);
  band(C, cx - 2.6, cy - 2.6, cx + 2.6, cy + 2.6, z0 + 71, z0 + 74, crownFace, S.concrete);
  // observation deck railing
  const P = propTex(C);
  for (const [a, b] of [[[cx - 2.6, cy - 2.6], [cx + 2.6, cy - 2.6]], [[cx + 2.6, cy - 2.6], [cx + 2.6, cy + 2.6]], [[cx + 2.6, cy + 2.6], [cx - 2.6, cy + 2.6]], [[cx - 2.6, cy + 2.6], [cx - 2.6, cy - 2.6]]])
    C.mb.box(Math.min(a[0], b[0]) - 0.03, Math.min(a[1], b[1]) - 0.03, z0 + 74, Math.max(a[0], b[0]) + 0.03, Math.max(a[1], b[1]) + 0.03, z0 + 74.5, { px: P.black, nx: P.black, py: P.black, ny: P.black, pz: P.black });
  // the mooring mast: fluted aluminium with lit windows, stepping in to a dome and the antenna
  const mast = C.atlas.shared('esb_mast', 48, 64, (p) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 48; x++) p.set(x, y, x % 6 === 0 ? 0xf2f4f6 : x % 6 === 1 ? 0xd8dce2 : x % 6 === 5 ? 0x8a9098 : 0xb8bec6, x % 6 === 0 ? CROWN : 255);
    for (let y = 8; y < 64; y += 16) for (let x = 2; x < 48; x += 6) { p.set(x + 1, y, 0xffe8b0, winCode(0.9, true)); p.set(x + 1, y + 1, 0xffe8b0, winCode(0.9, true)); }
  });
  C.mb.body(() => C.mb.cylinder(cx, cy, z0 + 74, z0 + 80, 1.25, 12, mast, S.metal, { mat: MAT.GLASS }));
  C.mb.body(() => C.mb.cylinder(cx, cy, z0 + 80, z0 + 83, 0.85, 12, mast, S.metal, { mat: MAT.GLASS }));
  C.mb.body(() => C.mb.cylinder(cx, cy, z0 + 83, z0 + 84.4, 0.55, 10, mast, null, { mat: MAT.GLASS }));
  C.mb.body(() => C.mb.cone(cx, cy, z0 + 84.4, z0 + 85.8, 0.55, 10, S.metal, { mat: 0 }));
  C.mb.solid(cx - 0.07, cy - 0.07, z0 + 85.8, cx + 0.07, cy + 0.07, z0 + 96, S.metal, S.metal);
  beacon(C, cx, cy, z0 + 96.1);
  C.world.lamps.push({ x: cx, y: cy + 4, z: z0 + 62, r: 4, color: [1, 0.9, 0.75], k: 0.2, kind: 'up' });
  C.world.officeDoors.push(...lobbyDoors(cx, cy, 8.5, 8.5));
  landmark(C, 'EMPIRE STATE BUILDING', cx, L.y1 + 3);
}

// ---------------------------------------------------------------------------------------------
// Chrysler-style tower: white brick shaft with dark window strips, steel eagles at the setback,
// then the crown of stacked stainless sunbursts with triangular windows, and the needle spire
export function chryslerTower(C, L) {
  const S = sharedTex(C), { rng } = C, z0 = C.z0;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  const mod = C.atlas.shared('chr_mod', 32, 48, (p) => {
    brickFill(p, 0, 0, 32, 48, [0xe8e4dc, 0xdcd8d0, 0xf0ece4], 71);
    for (const bx of [4, 18]) {
      drawWindow(p, bx, 6, 10, 28, { frame: 0x2a2a30, t: 0.5, panes: '1/1' }, rng);
      for (let y = 34; y < 44; y++) for (let x = bx; x < bx + 10; x++) p.set(x, y, 0x3a3a44);
    }
    for (let x = 0; x < 32; x += 2) p.set(x, 47, 0x2a2a30);
  });
  lobbyBand(C, L.x0 + 0.5, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0, z0 + 2.5, '405 LEXINGTON', { stone: 0x8a8478, trim: 0x2a2a30 });
  section(C, L.x0 + 0.5, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0 + 2.5, z0 + 8, mod, S.roofTar, { seed: 95 });
  section(C, cx - 6, cy - 6, cx + 6, cy + 6, z0 + 8, z0 + 44, mod, S.roofTar, { seed: 96 });
  section(C, cx - 4.8, cy - 4.8, cx + 4.8, cy + 4.8, z0 + 44, z0 + 50, mod, S.roofTar, { seed: 97 });
  // steel eagles leaning out from the corners of the setback
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ex = cx + sx * 4.8, ey = cy + sy * 4.8;
    C.mb.solid(Math.min(ex, ex + sx * 0.9), Math.min(ey, ey + sy * 0.9), z0 + 49.4, Math.max(ex, ex + sx * 0.9), Math.max(ey, ey + sy * 0.9), z0 + 49.9, S.metal, S.metal);
  }
  // the crown: six shrinking tiers, each face a stainless sunburst with triangular windows
  const sunburst = (p, w, h) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - w / 2) / (w / 2), dy = (h - y - 0.5) / h;
        const r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
        let c = shade(0xc4c8d0, 0.82 + 0.3 * (1 - y / h)), a = 255;
        if (r > 0.92 && r < 1.06) c = 0xf0f3f8;
        else if (r <= 0.92) {
          const k = (ang / PI) * 14;
          if (Math.abs(k - Math.round(k)) < 0.12) c = 0x8a9098;
          else if (r > 0.45 && r < 0.82 && Math.floor(k) % 2 === 0 && (r - 0.45) / 0.37 < 1 - Math.abs(k - Math.floor(k) - 0.5) * 2) { c = 0xf2ead0; a = CROWN; }
        }
        p.set(x, y, c, a);
      }
    p.hline(0, h - 1, w, 0x8a9098);
  };
  let z = z0 + 50;
  [4.0, 3.4, 2.8, 2.2, 1.6, 1.05].forEach((r, i) => {
    const hgt = 2.0 - i * 0.15;
    band(C, cx - r, cy - r, cx + r, cy + r, z, z + hgt, sunburst, S.metal, { mat: MAT.GLASS });
    z += hgt;
  });
  const spire = C.atlas.shared('chr_spire', 16, 64, (p) => { for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) p.set(x, y, x % 4 === 0 ? 0xf4f6fa : x % 4 === 1 ? 0xd4d8e0 : 0xaab0ba); });
  C.mb.body(() => C.mb.pyramid(cx - 0.5, cy - 0.5, cx + 0.5, cy + 0.5, z, z + 9, spire, { mat: MAT.GLASS }));
  beacon(C, cx, cy, z + 9.1);
  C.world.lamps.push({ x: cx, y: cy + 3, z: z0 + 50, r: 3.5, color: [1, 0.95, 0.85], k: 0.25, kind: 'up' });
  C.world.officeDoors.push(...lobbyDoors(cx, cy, 8.5, 8.5));
  landmark(C, 'CHRYSLER BUILDING', cx, L.y1 + 3);
}

// ---------------------------------------------------------------------------------------------
// One World Trade Center: a glass podium, then a shaft whose square base turns into a square
// rotated 45 degrees at the top (eight triangular facets), a parapet and a long spire
export function oneWTC(C, L) {
  const S = sharedTex(C), z0 = C.z0, mb = C.mb;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  const glass = C.atlas.shared('wtc_glass', 24, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 24; x++) {
      let c = shade(0x7aa6c8, 1.12 - (y / 48) * 0.3);
      if ((x + y) % 20 < 2 && y < 30) c = mixc(c, 0xd8eef8, 0.55);
      p.set(x, y, c, winCode(0.5));
    }
    for (let y = 44; y < 48; y++) for (let x = 0; x < 24; x++) p.set(x, y, 0x5a7a92);
    p.vline(0, 0, 48, 0xd8e4ec); p.vline(12, 0, 44, 0xa8bccb);
  });
  const fins = C.atlas.shared('wtc_fins', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, x % 4 === 0 ? 0xe8eef2 : x % 4 === 1 ? 0xb8c4cc : shade(0x6a8aa2, 0.9 + (y / 32) * 0.15), x % 4 > 1 ? winCode(0.05) : 255);
  });
  // podium
  section(C, cx - 6.5, cy - 6.5, cx + 6.5, cy + 6.5, z0, z0 + 4, fins, S.roofSilver, { mat: MAT.GLASS, seed: 111 });
  // the shaft: an octagon whose vertices slide from a square to the square turned 45 degrees
  const s0 = 5.2, s1 = 3.4, zb = z0 + 4, zt = z0 + 80, slices = 6;
  const vert = (j, t) => {
    const a = (j * PI) / 4;
    const r = j % 2 === 0 ? s0 + (s1 * Math.SQRT2 - s0) * t : s0 * Math.SQRT2 + (s1 - s0 * Math.SQRT2) * t;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  mb.body(() => {
    for (let k = 0; k < slices; k++) {
      const t0 = k / slices, t1 = (k + 1) / slices, za = zb + (zt - zb) * t0, zc = zb + (zt - zb) * t1;
      for (let j = 0; j < 8; j++) {
        let A0 = vert(j, t0), B0 = vert(j + 1, t0), A1 = vert(j, t1), B1 = vert(j + 1, t1);
        // outward normal of the facet (tilted up a little: the shaft tapers)
        let ex = B0[0] - A0[0], ey = B0[1] - A0[1];
        const el = Math.hypot(ex, ey) || 1;
        let nx = ey / el, ny = -ex / el;
        const mx = (A0[0] + B0[0]) / 2 - cx, my = (A0[1] + B0[1]) / 2 - cy;
        if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
        // corners in the same order as box faces: top-left to top-right runs along (ny, -nx)
        if (ex * ny - ey * nx < 0) { [A0, B0] = [B0, A0]; [A1, B1] = [B1, A1]; ex = -ex; ey = -ey; }
        const w0 = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]) * T, w1 = Math.hypot(B1[0] - A1[0], B1[1] - A1[1]) * T;
        const v0 = (zt - zc) * T, v1 = (zt - za) * T;
        const nl = Math.hypot(nx, ny, 0.12);
        const mid = (w0 - w1) / 2;
        mb.quad([A1[0], A1[1], zc], [B1[0], B1[1], zc], [B0[0], B0[1], za], [A0[0], A0[1], za],
          [[mid, v0], [mid + w1, v0], [w0, v1], [0, v1]], glass, [nx / nl, ny / nl, 0.12 / nl], MAT.GLASS | MAT.OFFICE, mb.defaultGroup, 113 + j);
      }
    }
    // roof cap and parapet ring
    for (let j = 0; j < 8; j++) {
      const A = vert(j, 1), B = vert(j + 1, 1);
      mb.tri([cx, cy, zt], [B[0], B[1], zt], [A[0], A[1], zt], [[0, 0], [8, 0], [0, 8]], S.roofSilver, [0, 0, 1], MAT.SNOW);
    }
  });
  markHeight(C.world, cx - s0, cy - s0, cx + s0, cy + s0, zt);
  // communications ring and the spire
  mb.body(() => mb.cylinder(cx, cy, zt, zt + 1.4, 1.3, 12, S.metal, S.metal, { mat: 0 }));
  mb.body(() => mb.cylinder(cx, cy, zt + 1.4, zt + 14, 0.22, 6, S.metal, null, { mat: 0 }));
  mb.cylinder(cx, cy, zt + 14, zt + 24, 0.1, 6, S.metal, null, { mat: 0 });
  beacon(C, cx, cy, zt + 24.1);
  C.world.lamps.push({ x: cx, y: cy, z: zt + 10, r: 3, color: [0.9, 0.95, 1], k: 0.2, kind: 'up' });
  C.world.officeDoors.push(...lobbyDoors(cx, cy, 6.5, 6.5));
  plaza(C, L, { x0: cx - 6.5, y0: cy - 6.5, x1: cx + 6.5, y1: cy + 6.5 });
  landmark(C, 'ONE WORLD TRADE CENTER', cx, L.y1 + 3);
}

// ---------------------------------------------------------------------------------------------
// Rockefeller Center: the limestone slab with its setbacks at the north of the block; in front, the
// sunken plaza (a rink in winter, fountains in summer) under the golden statue, ringed with flags,
// and the big tree at Christmas
export function rockefeller(C, L) {
  const S = sharedTex(C), { rng } = C, z0 = C.z0, mb = C.mb, W = C.world;
  const cx = (L.x0 + L.x1) / 2;
  const mod = C.atlas.shared('rock_mod', 24, 48, (p) => {
    stoneFill(p, 0, 0, 24, 48, [0xd2c8b0], 81, 0);
    p.rect(0, 0, 4, 48, 0xe2d8c0); p.vline(0, 0, 48, 0xeee6d2); p.vline(4, 0, 48, 0xb8ae96);
    drawWindow(p, 7, 6, 12, 30, { frame: 0x2a2a30, t: 0.5, panes: '1/1' }, rng);
    for (let y = 38; y < 46; y++) for (let x = 7; x < 19; x++) p.set(x, y, 0x5a5650);
  });
  const y0 = L.y0 + 0.5, y1 = L.y0 + 8.5;
  lobbyBand(C, cx - 4, y0, cx + 4, y1, z0, z0 + 3, null, { stone: 0xcfc6ae, trim: 0x6a5a3a });
  section(C, cx - 4, y0, cx + 4, y1, z0 + 3, z0 + 36, mod, S.roofTar, { seed: 121 });
  section(C, cx - 4, y0 + 1, cx + 4, y1 - 1, z0 + 36, z0 + 52, mod, S.roofTar, { seed: 122 });
  section(C, cx - 3.2, y0 + 1.8, cx + 3.2, y1 - 1.8, z0 + 52, z0 + 60, mod, S.roofDeck, { seed: 123 });
  beacon(C, cx, (y0 + y1) / 2, z0 + 60.2);
  // low wings either side of the slab
  section(C, L.x0 + 0.5, y0, cx - 4, y1 + 1, z0, z0 + 7, mod, S.roofGreen, { seed: 124 });
  section(C, cx + 4, y0, L.x1 - 0.5, y1 + 1, z0, z0 + 7, mod, S.roofGreen, { seed: 125 });
  // the sunken plaza: water in summer, ice in winter
  const rx0 = cx - 4.2, rx1 = cx + 4.2, ry0 = y1 + 2.2, ry1 = L.y1 - 1.6;
  C.paintGround(L.x0, y1, L.x1, L.y1, 'plaza');
  C.fountainPool((rx0 + rx1) / 2, (ry0 + ry1) / 2, rx1 - rx0, ry1 - ry0);
  W.solids.push([rx0, ry0, rx1, ry1, 0.5]);
  // the golden statue above the north end, on its rock
  mb.box(cx - 0.7, ry0 - 0.2, CURB, cx + 0.7, ry0 + 0.6, CURB + 1.0, { px: S.greystone, nx: S.greystone, py: S.greystone, ny: S.greystone, pz: { t: S.greystone } });
  C.addSprite('goldStatue', cx, ry0 + 0.25, CURB + 1.0);
  W.lamps.push({ x: cx, y: ry0 + 1.5, z: 1.2, r: 3.5, color: [1, 0.85, 0.5], k: 0.45, kind: 'flood' });
  // flags all round
  const fl = [];
  for (let x = rx0; x <= rx1 + 0.01; x += 1.4) { fl.push([x, ry0 - 0.6]); fl.push([x, ry1 + 0.6]); }
  for (let y = ry0 + 0.8; y < ry1; y += 1.4) { fl.push([rx0 - 0.6, y]); fl.push([rx1 + 0.6, y]); }
  for (const [x, y] of fl) flagPole(C, x, y, 3.2, rng.chance(0.25) ? 'us' : 'hotel');
  // the Christmas tree behind the statue, in winter
  (W.xmasTrees || (W.xmasTrees = [])).push({ x: cx, y: y1 + 1.2, z: CURB });
  // garden planters leading in from the street
  for (const x of [cx - 2.4, cx + 2.4]) { C.addPlanter(x, L.y1 + 0.2); }
  W.officeDoors.push({ x: cx, y: y1 + 0.9, dx: cx, dy: y1 - 0.2, kind: 'office' });
  landmark(C, 'ROCKEFELLER CENTER', cx, L.y1 + 3);
}

// ---------------------------------------------------------------------------------------------
// helpers for odd shapes
function fillHeight(W, inside, x0, y0, x1, y1, h) {
  const MAPN = Math.sqrt(W.heights.length) | 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(MAPN, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(MAPN, Math.ceil(x1)); x++)
      if (inside(x + 0.5, y + 0.5)) W.heights[y * MAPN + x] = Math.max(W.heights[y * MAPN + x], h);
}
// a vertical wall between two points with a tiled texture (u along the wall)
function wall(C, a, b, z0, z1, tex, mat, seed = 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * T, H = (z1 - z0) * T;
  const nx = (b[1] - a[1]), ny = -(b[0] - a[0]), l = Math.hypot(nx, ny) || 1;
  C.mb.quad([a[0], a[1], z1], [b[0], b[1], z1], [b[0], b[1], z0], [a[0], a[1], z0], [[0, 0], [len, 0], [len, H], [0, H]], tex, [nx / l, ny / l, 0], mat, C.mb.defaultGroup, seed);
}
// round stone rim of a pool / fountain basin, water painted on the ground inside
function roundPool(C, cx, cy, r, h = 0.45) {
  const S = sharedTex(C);
  C.paintWhere(cx - r, cy - r, cx + r, cy + r, (x, y) => Math.hypot(x - cx, y - cy) < r - 0.1, 'water');
  const n = Math.max(12, Math.round(r * 6));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * PI, a1 = ((k + 1) / n) * 2 * PI;
    const p0 = [cx + Math.cos(a) * r, cy + Math.sin(a) * r], p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    const q0 = [cx + Math.cos(a) * (r - 0.22), cy + Math.sin(a) * (r - 0.22)], q1 = [cx + Math.cos(a1) * (r - 0.22), cy + Math.sin(a1) * (r - 0.22)];
    wall(C, p1, p0, CURB, CURB + h, S.limestone, 0);
    wall(C, q0, q1, CURB, CURB + h, S.limestone, 0);
    C.mb.quad([p0[0], p0[1], CURB + h], [p1[0], p1[1], CURB + h], [q1[0], q1[1], CURB + h], [q0[0], q0[1], CURB + h], [[0, 0], [8, 0], [8, 4], [0, 4]], S.limestone, [0, 0, 1], MAT.SNOW);
  }
  C.world.solids.push([cx - r * 0.85, cy - r * 0.85, cx + r * 0.85, cy + r * 0.85, h]);
}

// ---------------------------------------------------------------------------------------------
// The Flatiron: a wedge of terracotta and limestone on a triangular lot, its rounded prow pointing
// up the avenue; the rest of the block is a plaza with tables, trees and a sidewalk clock
export function flatiron(C, L) {
  const S = sharedTex(C), { rng } = C, z0 = C.z0, mb = C.mb, W = C.world;
  const A = [L.x0 + 0.6, L.y0 + 0.6], B = [L.x0 + 0.6, L.y1 - 0.6], Cc = [L.x0 + 9.4, L.y1 - 0.6];
  const xAt = (y) => A[0] + ((y - A[1]) / (Cc[1] - A[1])) * (Cc[0] - A[0]);
  const inside = (x, y) => y > A[1] && y < B[1] && x > A[0] && x < xAt(y);
  const terra = 0xdccbae;
  const mod = C.atlas.shared('flat_mod', 24, 40, (p) => {
    stoneFill(p, 0, 0, 24, 40, [terra], 131, 10);
    for (const bx of [3, 13]) drawWindow(p, bx, 6, 8, 24, { frame: 0x3a3028, t: 0.5, panes: '1/1', wall: terra }, rng);
    for (let x = 0; x < 24; x += 3) p.set(x, 34, 0xb8a888);
    p.hline(0, 39, 24, 0xc4b494);
  });
  const base = C.atlas.shared('flat_base', 32, 40, (p) => {
    stoneFill(p, 0, 0, 32, 40, [0xc8bca4], 132, 8, { blocks: 16 });
    for (let y = 0; y < 40; y += 8) p.hline(0, y, 32, 0x9a907a);
    drawWindow(p, 6, 10, 20, 26, { frame: 0x2a2a2e, t: 0.3, panes: '1/1' }, rng);
  });
  const crown = C.atlas.shared('flat_crown', 24, 48, (p) => {
    stoneFill(p, 0, 0, 24, 48, [0xe2d4b8], 133, 0);
    for (let x = 0; x < 24; x += 6) { p.rect(x + 1, 10, 4, 22, 0x2a2a30, winCode(0.5)); p.rect(x + 1, 8, 4, 2, 0xc4b494); }
    for (let x = 0; x < 24; x += 4) { p.set(x, 38, 0x9a8a6a); p.set(x + 1, 37, 0x9a8a6a); }
    p.rect(0, 42, 24, 6, 0xb8a888); p.hline(0, 42, 24, 0xeee2c8);
  });
  const zb = z0 + 4, zs = z0 + 28, zc = z0 + 31.5;
  const edges = [[B, A], [A, Cc], [Cc, B]]; // west face, the long diagonal, the short south face
  mb.body(() => {
    for (const [a, b] of edges) {
      wall(C, a, b, z0, zb, base, MAT.OFFICE, 140);
      wall(C, a, b, zb, zs, mod, MAT.OFFICE, 141);
      wall(C, a, b, zs, zc, crown, MAT.OFFICE, 142);
    }
    mb.tri([A[0], A[1], zc], [Cc[0], Cc[1], zc], [B[0], B[1], zc], [[0, 0], [9 * T, 17 * T], [0, 17 * T]], S.roofTar, [0, 0, 1], MAT.SNOW);
    // the rounded prow
    mb.cylinder(A[0] + 0.25, A[1] + 0.55, z0, zc, 0.42, 8, mod, null, { mat: MAT.OFFICE });
    // overhanging cornice
    for (const [a, b] of edges) {
      const mx = (a[0] + b[0]) / 2 - (A[0] + B[0] + Cc[0]) / 3, my = (a[1] + b[1]) / 2 - (A[1] + B[1] + Cc[1]) / 3;
      const l = Math.hypot(mx, my) || 1, ox = (mx / l) * 0.3, oy = (my / l) * 0.3;
      wall(C, [a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy], zc, zc + 0.5, S.limestone, 0);
    }
  });
  for (let y = A[1]; y < B[1]; y += 0.5) W.solids.push([A[0], y, Math.max(A[0] + 0.3, xAt(y + 0.5)), y + 0.5, zc]);
  fillHeight(W, inside, A[0], A[1], Cc[0], B[1], zc);
  W.officeDoors.push({ x: (B[0] + Cc[0]) / 2, y: L.y1 + 0.9, dx: (B[0] + Cc[0]) / 2, dy: L.y1 - 1, kind: 'office' });
  // the plaza on the rest of the block
  C.paintWhere(L.x0, L.y0, L.x1, L.y1, (x, y) => !inside(x, y), 'plaza');
  const P = propTex(C);
  for (let i = 0; i < 4; i++) {
    const x = L.x1 - 2.5 - (i % 2) * 3.2, y = L.y0 + 3 + Math.floor(i / 2) * 4.5;
    mb.cylinder(x, y, CURB, CURB + 0.7, 0.06, 6, S.darkMetal, null);
    mb.cylinder(x, y, CURB + 0.7, CURB + 0.74, 0.4, 10, P.green, P.green);
    C.addSprite('cartUmbrella', x, y, CURB + 1.75, { cart: 'pretzel' });
  }
  for (const [x, y] of [[L.x1 - 1.2, L.y1 - 1.5], [L.x1 - 5, L.y1 - 1.5], [L.x1 - 1.2, L.y0 + 12.5], [L.x0 + 12, L.y0 + 1.2]]) C.addTree(x, y, 'plane', true);
  C.addBench(L.x1 - 7.5, L.y1 - 1.2, 'x');
  C.addBench(L.x1 - 1.2, L.y0 + 9, 'y');
  // cast-iron sidewalk clock
  const cxk = L.x0 + 11.5, cyk = L.y0 + 0.8;
  mb.cylinder(cxk, cyk, CURB, CURB + 3.2, 0.12, 8, S.darkMetal, null);
  const face = C.atlas.shared('clockface', 16, 16, (p) => {
    p.rect(0, 0, 16, 16, 0x1e3a2a); p.ellipse(8, 8, 7, 7, 0xf2efe6, winCode(0.02, true)); p.ring(8, 8, 7, 7, 1, 0xc8a24a);
    p.line(8, 8, 8, 3, 0x1b1b1b); p.line(8, 8, 11, 9, 0x1b1b1b);
  });
  mb.box(cxk - 0.3, cyk - 0.2, CURB + 3.2, cxk + 0.3, cyk + 0.2, CURB + 3.8, { py: face, ny: face, px: S.darkMetal, nx: S.darkMetal, pz: { t: S.darkMetal } });
  landmark(C, 'FLATIRON BUILDING', L.x0 + 4, L.y1 + 3);
}

// ---------------------------------------------------------------------------------------------
// Grand Central: the Beaux-Arts front on 42nd Street with three great arched windows between paired
// columns, the clock and sculpture on top, and the wide office slab rising behind it
export function grandCentral(C, L) {
  const S = sharedTex(C), { rng } = C, z0 = C.z0, mb = C.mb, W = C.world;
  const tx0 = L.x0 + 0.5, tx1 = L.x1 - 0.5, ty0 = L.y0 + 6.5, ty1 = L.y1 - 0.5, H = 9.5;
  const stone = 0xe6dcc6;
  const front = (p, w, h, i) => {
    stoneFill(p, 0, 0, w, h, [stone], 151 + i, 16, { blocks: 32 });
    if (i === 0) {
      // three tall arched windows with mullions, glowing at night
      const bw = Math.round(w / 4.2), gap = Math.round((w - bw * 3) / 4);
      for (let k = 0; k < 3; k++) {
        const x0 = gap + k * (bw + gap), top = 30, bot = h - 18;
        for (let y = top - bw / 2; y < bot; y++)
          for (let x = x0; x < x0 + bw; x++) {
            const dx = x + 0.5 - (x0 + bw / 2), dy = y + 0.5 - top;
            if (y < top && dx * dx + dy * dy > (bw / 2) ** 2) continue;
            const mull = (x - x0) % 8 === 0 || (y - top) % 10 === 0;
            p.set(x, y, mull ? 0x3a3a40 : 0x6a8aa8, mull ? 255 : winCode(0.02));
          }
        // paired columns either side
        for (const cxl of [x0 - 8, x0 + bw + 3]) for (let y = 24; y < h - 10; y++) { p.set(cxl, y, 0xf6efe0); p.set(cxl + 1, y, 0xe0d6c0); p.set(cxl + 2, y, 0xc8bea8); p.set(cxl + 4, y, 0xf6efe0); p.set(cxl + 5, y, 0xc8bea8); }
      }
      // entrance doors at the bottom of each arch
      for (let k = 0; k < 3; k++) { const x0 = gap + k * (bw + gap) + bw / 2 - 8; p.rect(x0, h - 18, 16, 18, 0x4a3a28); p.rect(x0 + 2, h - 16, 12, 16, 0x40576d, winCode(0.03)); }
      p.rect(0, 12, w, 6, 0xd2c6ac); p.hline(0, 12, w, 0xf6efe0);
      signBoard(p, Math.floor(w / 2) - 60, 2, 120, 9, 'GRAND CENTRAL TERMINAL', { bg: stone, fg: 0x5a4a32, t: 1, shadow: false });
    } else {
      for (let x = 12; x < w - 20; x += 36) drawWindow(p, x, 30, 16, 50, { frame: 0x3a3a40, t: 0.3, panes: '2/2' }, rng);
    }
  };
  band(C, tx0, ty0, tx1, ty1, z0, z0 + H, front, S.roofGreen, { mat: MAT.OFFICE });
  // the clock and sculpture group over the middle of the front
  const clock = C.atlas.shared('gct_clock', 64, 48, (p) => {
    stoneFill(p, 0, 0, 64, 48, [stone], 157, 0);
    p.ellipse(32, 26, 12, 12, 0xd8a83a); p.ellipse(32, 26, 10, 10, 0xf2efe6, winCode(0.02, true));
    p.line(32, 26, 32, 18, 0x1b1b1b); p.line(32, 26, 38, 28, 0x1b1b1b);
    for (const sx of [10, 46]) { p.ellipse(sx + 4, 14, 3, 3, 0x9a9a8a); p.rect(sx, 17, 9, 22, 0xa8a898); p.rect(sx - 2, 22, 4, 10, 0xa8a898); }
    p.ellipse(32, 6, 4, 4, 0x9a9a8a); p.rect(28, 8, 8, 6, 0xa8a898);
  });
  mb.box(L.x0 + 6.5, ty1 - 1.2, z0 + H, L.x1 - 6.5, ty1 - 0.2, z0 + H + 2.4, { py: clock, ny: S.limestone, px: S.limestone, nx: S.limestone, pz: { t: S.limestone } });
  W.lamps.push({ x: (L.x0 + L.x1) / 2, y: ty1 + 1, z: 3, r: 5, color: [1, 0.85, 0.6], k: 0.5, kind: 'flood' });
  // the office slab behind
  const slab = C.atlas.shared('gct_slab', 24, 48, (p) => {
    smoothFill(p, 0, 0, 24, 48, 0xb8b4aa, 158, 0.04);
    for (const bx of [2, 13]) p.rect(bx, 6, 9, 32, 0x2e3e52, winCode(0.5));
    p.rect(0, 40, 24, 8, 0x9a968c);
  });
  section(C, L.x0 + 1.2, L.y0 + 0.5, L.x1 - 1.2, L.y0 + 6.0, z0, z0 + 50, slab, S.roofSilver, { seed: 159 });
  W.officeDoors.push({ x: (L.x0 + L.x1) / 2, y: ty1 + 0.9, dx: (L.x0 + L.x1) / 2, dy: ty1 - 0.2, kind: 'office' });
  W.officeDoors.push({ x: L.x0 + 4, y: ty1 + 0.9, dx: L.x0 + 4, dy: ty1 - 0.2, kind: 'office' });
  landmark(C, 'GRAND CENTRAL', (L.x0 + L.x1) / 2, L.y1 + 3);
}

// ---------------------------------------------------------------------------------------------
// The Public Library: a marble palace facing the avenue across wide steps between two stone lions;
// Bryant Park behind it: a lawn ringed with plane trees, gravel walks, benches and a fountain
export function library(C, L) {
  const S = sharedTex(C), { rng } = C, z0 = C.z0, mb = C.mb, W = C.world;
  const bx0 = L.x1 - 9.5, bx1 = L.x1 - 2.6, by0 = L.y0 + 1, by1 = L.y1 - 1, H = 6.2;
  const marble = 0xeae4d6;
  band(C, bx0, by0, bx1, by1, z0, z0 + H, (p, w, h, i) => {
    stoneFill(p, 0, 0, w, h, [marble], 161 + i, 12, { blocks: 24 });
    for (let x = 10; x < w - 24; x += 30) {
      const top = 26;
      for (let y = top - 8; y < h - 14; y++) for (let xx = x; xx < x + 16; xx++) {
        const dx = xx + 0.5 - (x + 8), dy = y + 0.5 - top;
        if (y < top && dx * dx + dy * dy > 64) continue;
        p.set(xx, y, (xx - x) % 5 === 0 ? 0x3a3a40 : 0x5a7088, winCode(0.15));
      }
    }
    p.rect(0, 8, w, 5, 0xd8d0be); p.hline(0, 8, w, 0xf6f2e8);
    if (i === 1) signBoard(p, Math.floor(w / 2) - 50, 0, 100, 8, 'THE PUBLIC LIBRARY', { bg: marble, fg: 0x6a5a40, t: 1, shadow: false });
  }, S.roofTar, { mat: MAT.OFFICE });
  // portico columns and steps on the avenue side (east)
  const px = bx1 + 0.9;
  for (let k = 0; k < 6; k++) {
    const y = (by0 + by1) / 2 - 3.75 + k * 1.5;
    mb.cylinder(px, y, CURB + 1.0, CURB + H - 0.6, 0.28, 10, S.limestone, null);
  }
  mb.box(bx1, (by0 + by1) / 2 - 4.4, CURB + H - 0.6, px + 0.45, (by0 + by1) / 2 + 4.4, CURB + H, { px: S.limestone, py: S.limestone, ny: S.limestone, pz: { t: S.limestone } });
  for (let s2 = 0; s2 < 4; s2++) {
    const x1 = L.x1 - 0.4 - (3 - s2) * 0.55;
    mb.box(bx1, (by0 + by1) / 2 - 5, CURB, x1, (by0 + by1) / 2 + 5, CURB + (s2 + 1) * 0.25, { px: S.limestone, py: S.limestone, ny: S.limestone, pz: { t: S.limeTop || S.limestone, world: true } });
  }
  W.solids.push([bx0, by0, L.x1 - 0.4, by1, H]);
  // the lions on their pedestals either side of the steps
  for (const sy of [-1, 1]) {
    const ly = (by0 + by1) / 2 + sy * 6.2, lx = L.x1 - 1.4;
    mb.box(lx - 0.7, ly - 0.5, CURB, lx + 0.7, ly + 0.5, CURB + 0.9, { px: S.limestone, nx: S.limestone, py: S.limestone, ny: S.limestone, pz: { t: S.limestone } });
    C.addSprite('lion', lx, ly, CURB + 0.9);
    W.solids.push([lx - 0.7, ly - 0.5, lx + 0.7, ly + 0.5, 0.9]);
  }
  W.officeDoors.push({ x: L.x1 + 0.9, y: (by0 + by1) / 2, dx: bx1 + 0.3, dy: (by0 + by1) / 2, kind: 'office' });
  landmark(C, 'PUBLIC LIBRARY', L.x1 + 3, (L.y0 + L.y1) / 2);
  // Bryant Park
  const gx0 = L.x0 + 0.5, gx1 = bx0 - 0.5;
  C.paintGround(gx0, L.y0 + 0.5, gx1, L.y1 - 0.5, 'gravel');
  C.paintGround(gx0 + 1.6, L.y0 + 3.2, gx1 - 1.2, L.y1 - 3.2, 'lawn');
  for (let x = gx0 + 1.0; x < gx1; x += 2.6) { C.addTree(x, L.y0 + 1.4, 'plane', false); C.addTree(x, L.y1 - 1.4, 'plane', false); }
  for (let y = L.y0 + 4.5; y < L.y1 - 4; y += 3) { C.addBench(gx0 + 0.9, y, 'y'); C.addBench(gx1 - 0.6, y, 'y', -1); }
  roundPool(C, gx0 + 3.0, (L.y0 + L.y1) / 2, 1.2);
  W.fountains.push({ x: gx0 + 3.0, y: (L.y0 + L.y1) / 2, z: CURB + 0.3, kind: 'center' });
  landmark(C, 'BRYANT PARK', (gx0 + gx1) / 2, L.y1 + 3);
}

// ---------------------------------------------------------------------------------------------
// The arena: a great concrete drum of vertical fins on a glass podium with marquee screens
export function arena(C, L) {
  const S = sharedTex(C), z0 = C.z0, mb = C.mb, W = C.world;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  band(C, L.x0 + 0.5, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0, z0 + 3.2, (p, w, h, i) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0x4a6a86, 1.08 - (y / h) * 0.2), winCode(0.03));
    for (let x = 0; x < w; x += 24) { p.vline(x, 0, h, 0xc8d0d8); p.vline(x + 1, 0, h, 0x8a96a2); }
    // marquee screen band
    p.rect(0, 0, w, 22, 0x0a0a0c, 255);
    const msg = i % 2 ? 'TONIGHT  HOOPS  7:30' : 'CONCERT SAT  TIX ON SALE';
    const tw = textWidth(msg, 2, true);
    p.text7(Math.max(2, Math.floor((w - tw) / 2)), 4, msg, i % 2 ? 0xffb020 : 0x4fd2ff, winCode(0.0, true), 2);
  }, S.roofSilver, { mat: MAT.GLASS });
  const fin = C.atlas.shared('arena_fin', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, x % 8 < 3 ? shade(0xe8e4dc, 1.04 - (x % 8) * 0.06) : shade(0x2e3a48, 1.0 + (y / 48) * 0.1), x % 8 < 3 ? 255 : winCode(0.2));
  });
  mb.body(() => mb.cylinder(cx, cy, z0 + 3.2, z0 + 10.5, 7.4, 28, fin, null, { mat: MAT.GLASS }));
  mb.body(() => mb.cone(cx, cy, z0 + 10.5, z0 + 12, 7.4, 28, S.roofSilver, { mat: MAT.SNOW }));
  markHeight(W, cx - 6.5, cy - 6.5, cx + 6.5, cy + 6.5, z0 + 12);
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) W.officeDoors.push({ x: cx + dx * 9.4, y: cy + dy * 9.4, dx: cx + dx * 8.3, dy: cy + dy * 8.3, kind: 'office' });
  W.lamps.push({ x: cx, y: L.y1 + 1, z: 2, r: 5, color: [0.7, 0.85, 1], k: 0.5, kind: 'screen' });
  landmark(C, 'MADISON SQUARE GARDEN', cx, L.y1 + 3);
}

// ---------------------------------------------------------------------------------------------
// The stock exchange: a temple front on Wall Street, six giant columns before a great flag, a
// sculpted pediment, and a limestone office tower behind
export function exchange(C, L) {
  const S = sharedTex(C), { rng } = C, z0 = C.z0, mb = C.mb, W = C.world;
  const x0 = L.x0 + 1, x1 = L.x1 - 1, y0 = L.y0 + 7, y1 = L.y1 - 2.2, H = 8.4;
  band(C, x0, y0, x1, y1, z0, z0 + H, (p, w, h, i) => {
    stoneFill(p, 0, 0, w, h, [0xe8e2d6], 171 + i, 14, { blocks: 28 });
    if (i !== 0) for (let x = 8; x < w - 16; x += 26) drawWindow(p, x, 40, 12, 70, { frame: 0x3a3a40, t: 0.4, panes: '2/2' }, rng);
  }, S.roofTar, { mat: MAT.OFFICE });
  // the colonnade: podium, six columns, entablature, pediment
  const fy = y1 + 1.6;
  mb.box(x0, y1, CURB, x1, fy + 0.4, CURB + 1.2, { py: S.greystone, px: S.greystone, nx: S.greystone, pz: { t: S.limestone } });
  for (let k = 0; k < 6; k++) {
    const x = x0 + 1.4 + k * ((x1 - x0 - 2.8) / 5);
    mb.cylinder(x, fy, CURB + 1.2, CURB + 7.2, 0.42, 12, S.limestone, null);
    mb.box(x - 0.55, fy - 0.55, CURB + 7.2, x + 0.55, fy + 0.55, CURB + 7.55, { px: S.limestone, nx: S.limestone, py: S.limestone, ny: S.limestone, pz: { t: S.limestone } });
  }
  const ent = C.atlas.alloc(Math.round((x1 - x0) * T), 32);
  stoneFill(ent.p, 0, 0, ent.w, 32, [0xeee8dc], 177, 0);
  signBoard(ent.p, Math.floor(ent.w / 2) - 60, 10, 120, 12, 'STOCK EXCHANGE', { bg: 0xeee8dc, fg: 0x4a4030, t: 1, shadow: false });
  mb.box(x0, y1 - 0.2, CURB + 7.55, x1, fy + 0.6, CURB + 8.55, { py: ent, px: S.limestone, nx: S.limestone, pz: { t: S.limestone } });
  const ped = C.atlas.shared('xch_ped', 64, 32, (p) => {
    stoneFill(p, 0, 0, 64, 32, [0xeee8dc], 178, 0);
    for (let k = 0; k < 9; k++) { const x = 6 + k * 6; p.ellipse(x, 22, 2, 2, 0xc8c0b0); p.rect(x - 1, 24, 3, 6, 0xc8c0b0); }
  });
  mb.gable(x0, y1 - 0.2, x1, fy + 0.6, CURB + 8.55, CURB + 10.4, 'y', S.limestone, ped);
  // the great flag behind the columns
  const flag = C.atlas.alloc(Math.round((x1 - x0 - 1.6) * T), Math.round(5.6 * T));
  {
    const p = flag.p, w = flag.w, h = flag.h;
    for (let y = 0; y < h; y++) { const red = Math.floor((y / h) * 13) % 2 === 0; for (let x = 0; x < w; x++) p.set(x, y, red ? shade(0xb22234, 0.95 + hash2i(x >> 2, y, 3) * 0.1) : 0xf2f2ee); }
    const cw = Math.round(w * 0.42), ch = Math.round(h * (7 / 13));
    p.rect(0, 0, cw, ch, 0x3c3b6e);
    for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) p.set(Math.round(((c + (r % 2 ? 1 : 0.5)) / 6.2) * cw), Math.round(((r + 0.7) / 9.6) * ch), 0xffffff);
  }
  const fb = new Frame(x0 + 0.8, y1 + 0.3, 0, 1);
  fb.facadeQuad(mb, 0, flag.w / T, 0, CURB + 1.4, CURB + 1.4 + flag.h / T, flag, { mat: MAT.FLAT });
  W.solids.push([x0, y1, x1, fy + 0.6, H]);
  // the office tower behind
  const lime = C.atlas.shared('lime_mod2', 32, 48, (p) => {
    stoneFill(p, 0, 0, 32, 48, PAL.limestone, 179, 16, { blocks: 32 });
    drawWindow(p, 4, 10, 10, 28, { frame: 0xf2efe6, t: 0.5, panes: '1/1', wall: PAL.limestone[0] }, rng);
    drawWindow(p, 18, 10, 10, 28, { frame: 0xf2efe6, t: 0.5, panes: '1/1', wall: PAL.limestone[0] }, rng);
  });
  section(C, L.x0 + 1, L.y0 + 0.5, L.x1 - 1, L.y0 + 6.5, z0, z0 + 34, lime, S.roofTar, { seed: 180 });
  W.officeDoors.push({ x: (x0 + x1) / 2, y: L.y1 + 0.9, dx: (x0 + x1) / 2, dy: y1 + 0.5, kind: 'office' });
  landmark(C, 'STOCK EXCHANGE', (x0 + x1) / 2, L.y1 + 3);
}

// ---------------------------------------------------------------------------------------------
// Washington Square: lawns crossed by paths, the round fountain in the middle and the white marble
// arch at the north end
export function washingtonSquare(C, L) {
  const S = sharedTex(C), mb = C.mb, W = C.world;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2 + 1;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'lawn');
  // paths: a ring round the fountain and four arms out to the corners and the arch
  C.paintWhere(L.x0, L.y0, L.x1, L.y1, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d < 5.6) return true;
    const ax = Math.abs(x - cx), ay = Math.abs(y - cy);
    if (ax < 1.3 && y < cy) return true;
    return Math.abs(ax - ay) < 1.0;
  }, 'plaza');
  roundPool(C, cx, cy, 3.4);
  W.fountains.push({ x: cx, y: cy, z: CURB + 0.3, kind: 'center' });
  // trees and benches
  for (const [x, y] of [[L.x0 + 2, L.y0 + 5], [L.x0 + 2, L.y1 - 2.5], [L.x1 - 2, L.y0 + 5], [L.x1 - 2, L.y1 - 2.5], [L.x0 + 5, L.y1 - 1.5], [L.x1 - 5, L.y1 - 1.5], [L.x0 + 1.5, cy], [L.x1 - 1.5, cy]]) C.addTree(x, y, 'elm', false);
  for (const a of [0.4, 1.2, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0]) C.addBench(cx + Math.cos(a) * 6.2, cy + Math.sin(a) * 6.2, Math.abs(Math.cos(a)) > 0.7 ? 'y' : 'x', 1);
  // the arch
  const ay0 = L.y0 + 0.6, ay1 = ay0 + 1.6;
  const marble = C.atlas.shared('arch_marble', 64, 64, (p) => {
    stoneFill(p, 0, 0, 64, 64, [0xf2eee4], 191, 12, { blocks: 24 });
    for (let y = 0; y < 64; y += 12) p.hline(0, y, 64, 0xd8d2c4);
  });
  const attic = C.atlas.shared('arch_attic', 192, 52, (p) => {
    stoneFill(p, 0, 0, 192, 52, [0xf2eee4], 192, 0);
    p.rect(0, 0, 192, 6, 0xe2dccc); p.hline(0, 6, 192, 0xc8c0ae);
    p.rect(24, 14, 144, 12, 0xe8e2d4); p.frame(24, 14, 144, 12, 0xc8c0ae);
    p.text7(Math.floor((192 - textWidth('WASHINGTON SQUARE', 1, true)) / 2), 17, 'WASHINGTON SQUARE', 0x8a826e);
    // the arch's curve (the spandrels) on the lower part
    for (let y = 30; y < 52; y++) for (let x = 0; x < 192; x++) {
      const dx = (x + 0.5 - 96) / 50, dy = (52 - y) / 22;
      if (dx * dx + dy * dy < 1) p.set(x, y, 0, 0);
      else if (dx * dx + dy * dy < 1.12) p.set(x, y, 0xd8d0be);
    }
  });
  for (const sx of [-1, 1]) mb.box(cx + sx * 1.55 - (sx > 0 ? 0 : 1.45), ay0, CURB, cx + sx * 1.55 + (sx > 0 ? 1.45 : 0), ay1, CURB + 4.4, { px: marble, nx: marble, py: marble, ny: marble });
  mb.box(cx - 3.0, ay0, CURB + 4.4, cx + 3.0, ay1, CURB + 6.0, { py: attic, ny: attic, px: marble, nx: marble, pz: { t: S.limestone } });
  // the curve of the arch spans the gap under the attic (an alpha-cut panel each side)
  const fN = new Frame(cx + 3.0, ay0, 0, -1), fS = new Frame(cx - 3.0, ay1, 0, 1);
  const curve = C.atlas.shared('arch_curve', 96, 40, (p) => {
    for (let y = 0; y < 40; y++) for (let x = 0; x < 96; x++) {
      const dx = (x + 0.5 - 48) / 48, dy = (40 - y) / 40;
      if (dx * dx + dy * dy > 1) p.set(x, y, shade(0xf2eee4, 0.95 + hash2i(x, y, 5) * 0.08), 255);
      else p.set(x, y, 0, 0);
    }
  });
  fN.facadeQuad(mb, 1.5, 4.5, 0, CURB + 3.15, CURB + 4.4, curve, { mat: 0 });
  fS.facadeQuad(mb, 1.5, 4.5, 0, CURB + 3.15, CURB + 4.4, curve, { mat: 0 });
  for (const sx of [-1, 1]) W.solids.push([cx + sx * 1.55 - (sx > 0 ? 0 : 1.45), ay0, cx + sx * 1.55 + (sx > 0 ? 1.45 : 0), ay1, 6]);
  W.lamps.push({ x: cx, y: ay1 + 1.5, z: 1, r: 4, color: [1, 0.95, 0.85], k: 0.5, kind: 'flood' });
  landmark(C, 'WASHINGTON SQUARE', cx, L.y1 + 3);
}

// ---------------------------------------------------------------------------------------------
// Chinatown: red lanterns along the shopfronts and a gate with a green-tiled roof on one corner
export function chinatownExtras(C, L, gate) {
  const mb = C.mb, P = propTex(C), S = sharedTex(C);
  for (const [x0, y0, x1, y1] of [[L.x0, L.y1 + 0.45, L.x1, L.y1 + 0.45], [L.x0, L.y0 - 0.45, L.x1, L.y0 - 0.45], [L.x0 - 0.45, L.y0, L.x0 - 0.45, L.y1], [L.x1 + 0.45, L.y0, L.x1 + 0.45, L.y1]]) {
    const n = 7;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      C.addSprite('redLantern', x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, CURB + 2.9);
    }
  }
  if (!gate) return;
  const gx = L.x1 + 1.0, gy0 = L.y1 - 4.5, gy1 = L.y1 - 0.5;
  const red = C.atlas.shared('cn_red', 16, 16, (p) => smoothFill(p, 0, 0, 16, 16, 0xc8202c, 5, 0.05));
  const tile = C.atlas.shared('cn_tile', 32, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) p.set(x, y, x % 4 === 0 ? 0x1f5a32 : y % 4 === 0 ? 0x2a7a46 : 0x3a8a52); });
  for (const y of [gy0, gy1]) mb.box(gx - 0.18, y - 0.18, CURB, gx + 0.18, y + 0.18, CURB + 3.4, { px: red, nx: red, py: red, ny: red, pz: red });
  mb.box(gx - 0.25, gy0 - 0.6, CURB + 3.0, gx + 0.25, gy1 + 0.6, CURB + 3.5, { px: red, nx: red, py: red, ny: red, pz: red });
  mb.gable(gx - 0.7, gy0 - 1.0, gx + 0.7, gy1 + 1.0, CURB + 3.5, CURB + 4.3, 'y', tile, S.darkMetal);
  C.world.solids.push([gx - 0.18, gy0 - 0.18, gx + 0.18, gy0 + 0.18, 3.4]);
  C.world.solids.push([gx - 0.18, gy1 - 0.18, gx + 0.18, gy1 + 0.18, 3.4]);
  void P;
  landmark(C, 'CHINATOWN', gx, L.y1 + 2);
}

// ---------------------------------------------------------------------------------------------
// The Brooklyn Bridge: from a granite abutment at the quay, a deck with a raised boardwalk runs out
// over the East River through a Gothic stone tower; the main cables sweep down from the tower
// saddles, hung with suspenders and the web of diagonal stays
export function brooklynBridge(C, yb) {
  const S = sharedTex(C), mb = C.mb, W = C.world, P = propTex(C);
  const x0 = RIVER_X, x1 = MAP, zd = 2.2;
  const granite = C.atlas.shared('bb_granite', 64, 64, (p) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const row = y >> 3, off = row % 2 ? 8 : 0;
      let c = shade(mixc(0xb8a88c, 0xa89a80, hash2i((x + off) >> 4, row, 61)), 0.93 + hash2i(x, y, 62) * 0.1);
      if (y % 8 === 0 || (x + off) % 16 === 0) c = 0x8a7e68;
      p.set(x, y, c);
    }
  });
  const truss = C.atlas.shared('bb_truss', 32, 16, (p) => {
    p.rect(0, 0, 32, 16, 0x5a5048);
    for (let x = 0; x < 32; x++) { p.set(x, 0, 0x8a7e70); p.set(x, 15, 0x3a342e); p.set(x, Math.abs((x % 16) - 8) + 4, 0x2e2822); }
  });
  const road = C.atlas.shared('bb_road', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x4a4d57, 0.92 + hash2i(x, y, 63) * 0.12));
    for (let x = 0; x < 32; x += 2) if ((x >> 3) % 2 === 0) p.set(x, 15, 0xeeeef0);
  });
  const planks = C.atlas.shared('bb_planks', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, x % 4 === 0 ? 0x6a4a30 : shade(0xa87a50, 0.92 + hash2i(x >> 2, y, 64) * 0.14));
  });
  // abutment in the river beside the quay, the deck and the raised boardwalk on it
  mb.box(x0, yb - 3.6, WATER_Z, x0 + 3.0, yb + 3.6, zd, { px: granite, nx: granite, py: granite, ny: granite, pz: { t: S.concrete, world: true } });
  mb.box(x0, yb - 3.1, zd - 0.45, x1, yb + 3.1, zd, { py: truss, ny: truss, pz: { t: road, world: true } });
  mb.box(x0, yb - 0.8, zd, x1, yb + 0.8, zd + 0.45, { py: truss, ny: truss, pz: { t: planks, world: true } });
  for (const sy of [-1, 1]) {
    const y = yb + sy * 0.78;
    for (let x = x0 + 0.5; x < x1; x += 1.0) mb.box(x - 0.03, y - 0.03, zd + 0.45, x + 0.03, y + 0.03, zd + 1.0, { px: P.black, nx: P.black, py: P.black, ny: P.black });
    mb.box(x0, y - 0.03, zd + 0.95, x1, y + 0.03, zd + 1.02, { px: P.black, nx: P.black, py: P.black, ny: P.black, pz: P.black });
  }
  // the tower: three piers rising from the water, joined over the roadways by the arched upper block
  const tx0 = x0 + 8.5, tx1 = tx0 + 3.0, zt = 12.0;
  const arches = C.atlas.alloc(Math.round(7.6 * T), Math.round((zt - 7.0) * T));
  {
    const p = arches.p, w = arches.w, h = arches.h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = y >> 3, off = row % 2 ? 8 : 0;
      let c = shade(mixc(0xb8a88c, 0xa89a80, hash2i((x + off) >> 4, row, 65)), 0.93 + hash2i(x, y, 66) * 0.1);
      if (y % 8 === 0 || (x + off) % 16 === 0) c = 0x8a7e68;
      p.set(x, y, c);
    }
    // two pointed (Gothic) arch heads over the roadway openings
    for (const ac of [w * 0.27, w * 0.73]) {
      const half = w * 0.16;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = Math.abs(x + 0.5 - ac), up = h - y;
        const r = half * 1.6, cxo = half - r; // two circles meeting at a point
        const inArch = dx < half && Math.hypot(dx - cxo, up) < r && up < h * 0.9;
        if (inArch) p.set(x, y, 0x2a2622);
      }
    }
    for (let x = 0; x < w; x++) { p.set(x, 0, 0xd8ccb0); p.set(x, 1, 0xc8bca0); }
  }
  for (const [ya, yb2] of [[yb - 3.8, yb - 2.4], [yb - 0.7, yb + 0.7], [yb + 2.4, yb + 3.8]]) mb.box(tx0, ya, WATER_Z, tx1, yb2, 7.0, { px: granite, nx: granite, py: granite, ny: granite });
  mb.box(tx0, yb - 3.8, 7.0, tx1, yb + 3.8, zt, { px: arches, nx: arches, py: granite, ny: granite, pz: { t: S.concrete, world: true } });
  mb.box(tx0 - 0.2, yb - 4.0, zt, tx1 + 0.2, yb + 4.0, zt + 0.5, { px: granite, nx: granite, py: granite, ny: granite, pz: { t: S.concrete, world: true } });
  W.solids.push([tx0, yb - 3.8, tx1, yb + 3.8, zt]);
  // main cables, suspenders and stays
  const cable = P.black;
  const cz = (x) => (x < tx0 ? zd + 0.6 + ((x - x0) / (tx0 - x0)) ** 2 * (zt + 0.4 - zd - 0.6) : zt + 0.4 - (1 - Math.exp(-(x - tx1) / 7)) * (zt - 4.6));
  for (const sy of [-1, 1]) {
    const y = yb + sy * 3.05;
    const pts = [];
    for (let x = x0 + 0.5; x <= tx0 + 0.01; x += (tx0 - x0 - 0.5) / 6) pts.push([x, y, cz(x)]);
    pts.push([tx0 + 1.5, y, zt + 0.5]);
    for (let x = tx1; x <= x1 + 0.01; x += (x1 - tx1) / 8) pts.push([x, y, cz(x)]);
    for (let k = 1; k < pts.length; k++) beam(C, pts[k - 1], pts[k], 0.09, cable);
    for (let x = x0 + 1; x < x1; x += 0.9) {
      if (x > tx0 - 0.3 && x < tx1 + 0.3) continue;
      mb.box(x - 0.02, y - 0.02, zd, x + 0.02, y + 0.02, cz(x), { px: cable, nx: cable, py: cable, ny: cable });
    }
    for (const dx of [1.8, 3.6, 5.4, 7.2]) {
      beam(C, [tx0, y, zt - 0.3], [tx0 - dx, y, zd], 0.03, cable);
      beam(C, [tx1, y, zt - 0.3], [tx1 + dx * 1.3, y, zd], 0.03, cable);
    }
  }
  // lamps along the boardwalk
  for (let x = x0 + 2; x < x1; x += 5) {
    W.lamps.push({ x, y: yb, z: zd + 1.5, r: 3, color: [1, 0.9, 0.7], k: 0.6, kind: 'street' });
    W.lampHeads.push({ x, y: yb + 0.8, z: zd + 1.6, kind: 'globe' });
  }
  W.lamps.push({ x: tx0 + 1.5, y: yb, z: zt, r: 5, color: [1, 0.92, 0.8], k: 0.4, kind: 'flood' });
  landmark(C, 'BROOKLYN BRIDGE', x0 - 3, yb + 4);
}

// ---------------------------------------------------------------------------------------------
// The Statue of Liberty on her island in the harbour: a grassy island with a stone quay, the
// star-shaped fort, the granite pedestal, and the copper-green statue holding her torch high
export function statueOfLiberty(C, ix, iy) {
  const S = sharedTex(C), mb = C.mb, W = C.world, gt = W.ground;
  const R = 5.4, n = 20, zi = CURB;
  const granite = C.atlas.shared('bb_granite', 64, 64, () => {});
  // the island: painted ground (grass, a paved ring and the fort's courtyard) on a stone-sided disc
  C.paintWhere(ix - R, iy - R, ix + R, iy + R, (x, y) => Math.hypot(x - ix, y - iy) < R + 0.05, 'lawn');
  C.paintWhere(ix - R, iy - R, ix + R, iy + R, (x, y) => { const d = Math.hypot(x - ix, y - iy); return d > R - 1.1 && d < R + 0.05; }, 'plaza');
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * 2 * PI, a1 = ((k + 1) / n) * 2 * PI;
    const p0 = [ix + Math.cos(a0) * R, iy + Math.sin(a0) * R], p1 = [ix + Math.cos(a1) * R, iy + Math.sin(a1) * R];
    mb.tri([ix, iy, zi], [p0[0], p0[1], zi], [p1[0], p1[1], zi], [[ix * T, iy * T], [p0[0] * T, p0[1] * T], [p1[0] * T, p1[1] * T]], gt, [0, 0, 1], MAT.GROUND | MAT.SNOW | MAT.WET);
    wall(C, p1, p0, WATER_Z, zi, granite, 0);
  }
  // star fort: eleven points round the base of the pedestal
  const pts = [];
  for (let k = 0; k < 22; k++) { const a = (k / 22) * 2 * PI, r = k % 2 ? 2.0 : 2.9; pts.push([ix + Math.cos(a) * r, iy + Math.sin(a) * r]); }
  const zf = zi + 0.9;
  mb.body(() => {
    for (let k = 0; k < 22; k++) {
      const a = pts[k], b = pts[(k + 1) % 22];
      wall(C, b, a, zi, zf, granite, 0);
      mb.tri([ix, iy, zf], [a[0], a[1], zf], [b[0], b[1], zf], [[ix * T, iy * T], [a[0] * T, a[1] * T], [b[0] * T, b[1] * T]], S.concrete, [0, 0, 1], MAT.SNOW);
    }
  });
  // pedestal
  const ped = C.atlas.shared('lib_ped', 32, 64, (p) => {
    stoneFill(p, 0, 0, 32, 64, [0xc4b8a0], 201, 8, { blocks: 16 });
    for (const x of [4, 13, 22]) { p.rect(x, 16, 6, 18, 0x6a604e); p.rect(x + 1, 17, 4, 16, 0x4a4238); }
    p.rect(0, 12, 32, 3, 0xd8ccb4); p.rect(0, 38, 32, 3, 0xd8ccb4);
  });
  mb.body(() => {
    mb.box(ix - 1.25, iy - 1.25, zf, ix + 1.25, iy + 1.25, zf + 1.2, { px: granite, nx: granite, py: granite, ny: granite, pz: { t: S.concrete } });
    mb.box(ix - 1.0, iy - 1.0, zf + 1.2, ix + 1.0, iy + 1.0, zf + 3.8, { px: ped, nx: ped, py: ped, ny: ped, pz: { t: S.concrete } });
    mb.box(ix - 1.12, iy - 1.12, zf + 3.8, ix + 1.12, iy + 1.12, zf + 4.1, { px: granite, nx: granite, py: granite, ny: granite, pz: { t: S.concrete } });
  });
  W.solids.push([ix - R, iy - R, ix + R, iy + R, zf + 4.1]);
  C.addSprite('liberty', ix, iy, zf + 4.1);
  W.liberty = { x: ix, y: iy, z: zf + 4.1 };
  // floodlights and the torch
  for (const [dx, dy] of [[-2.6, 2.6], [2.6, 2.6], [0, -3.2]]) W.lamps.push({ x: ix + dx * 0.4, y: iy + dy * 0.4, z: zf + 3, r: 4, color: [0.85, 1, 0.9], k: 0.7, kind: 'flood' });
  W.lamps.push({ x: ix - 0.6, y: iy, z: zf + 10, r: 2.5, color: [1, 0.75, 0.3], k: 0.9, kind: 'neon' });
  for (const [x, y] of [[ix - 3.6, iy + 3.0], [ix + 3.6, iy + 3.0], [ix - 3.6, iy - 3.0], [ix + 3.6, iy - 3.0]]) C.addTree(x, y, 'oak', false);
  landmark(C, 'STATUE OF LIBERTY', ix, iy);
}
