// The rest of Manhattan's skyline: the pre-war apartment towers along Central Park (twin-towered
// on Central Park West, limestone with slate roofs on Fifth Avenue), hotels and the slender
// supertalls of Billionaires' Row, and the landmarks round the park and downtown: the Guggenheim's
// spiral, the Met, the Natural History museum with its glass-cube planetarium, Lincoln Center,
// Columbus Circle, the Plaza, St Patrick's, the UN, Hudson Yards and the Vessel, the 9/11 Memorial
// pools and the Oculus, Battery Park with Castle Clinton, and the Brooklyn Bridge's Manhattan
// anchorage. Built from the same kit as everything else: boxes, cylinders, slopes and painted texels.

import { T, CURB, PARK } from './layout.js';
import { MAT } from './mesh.js';
import { winCode } from '../core/painter.js';
import { shade, mixc, hash2i } from '../core/math.js';
import { PAL, stoneFill, brickFill, smoothFill, drawWindow, signBoard } from './facades.js';
import { sharedTex, markHeight, waterTower } from './buildings.js';
import { section, band, beacon, hotel } from './towers.js';
import { propTex, beam, parkLamp, trashBasket } from './props.js';
import { landmark, flagPole, wall, roundPool, BRIDGE, ferry } from './landmarks.js';
import { ringWall, waterDisc, radialPlaza } from './park.js';

const PI = Math.PI;
const tex = (C, key, w, h, fn) => C.atlas.shared(key, w, h, fn);
const flat = (C, key, c) => tex(C, `flat_${key}`, 8, 8, (p) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, shade(c, 0.97 + hash2i(x, y, 3) * 0.05)); });
const sides = (t, top) => (top ? { px: t, nx: t, py: t, ny: t, pz: top } : { px: t, nx: t, py: t, ny: t });
const home = (C, x, y, dx, dy, n) => C.world.doors.push({ x, y, dx, dy, kind: 'home', n });
const office = (C, x, y, dx, dy) => C.world.officeDoors.push({ x, y, dx, dy, kind: 'office' });

// a one-storey, one-unit facade module: ashlar or brick with a pair of windows
export function module(C, key, o) {
  return tex(C, key, 32, 48, (p) => {
    if (o.brick) brickFill(p, 0, 0, 32, 48, o.brick, o.seed ?? 3);
    else stoneFill(p, 0, 0, 32, 48, [o.wall], o.seed ?? 5, 12, { blocks: 32 });
    const wall0 = o.brick ? o.brick[0] : o.wall;
    for (const wx of o.wins ?? [5, 19]) drawWindow(p, wx, o.arch ? 14 : 12, 8, o.arch ? 24 : 26, { frame: o.frame ?? 0xf2efe6, lintel: o.lintel, sill: o.sill, t: 0.5, panes: o.panes ?? '1/1', wall: wall0, keystone: o.keystone }, C.rng);
    if (o.arch) for (const wx of o.wins ?? [5, 19]) for (let k = 0; k < 8; k++) { const dy = Math.round(Math.sqrt(Math.max(0, 16 - (k - 3.5) ** 2)) * 0.9); p.vline(wx + k, 14 - dy, dy, k === 0 || k === 7 ? shade(wall0, 0.7) : 0x2a3a48); }
    if (o.band) { p.rect(0, 45, 32, 3, o.band); p.hline(0, 45, 32, shade(o.band, 1.1)); }
    if (o.pier) { p.rect(0, 0, 3, 48, shade(wall0, 1.06)); p.vline(2, 0, 48, shade(wall0, 0.82)); }
  });
}
// rusticated base with arched doors on the main front and big windows on the others
function lobbyPainter(color, frontFace, doorKind = 'arch') {
  return (p, w, h, i) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ly = y % 10;
      let c = shade(color, 0.95 + hash2i(x, y, 41) * 0.07);
      if (ly === 9) c = shade(color, 0.7); else if (ly === 0) c = shade(color, 1.08);
      p.set(x, y, c);
    }
    p.rect(0, 0, w, 6, shade(color, 1.1)); p.hline(0, 6, w, shade(color, 0.72));
    if (i === frontFace) {
      const dx = Math.floor(w / 2) - 14;
      p.rect(dx - 3, 18, 34, h - 18, shade(color, 0.85));
      p.rect(dx, 22, 28, h - 22, 0x3a2a1c);
      p.rect(dx + 2, 24, 24, h - 24, 0x40576d, winCode(0.04));
      p.vline(dx + 14, 24, h - 24, 0x8a6a3a);
      if (doorKind === 'arch') for (let k = 0; k < 28; k++) { const dy = Math.round(Math.sqrt(Math.max(0, 196 - (k - 13.5) ** 2)) * 0.45); p.vline(dx + k, 22 - dy, dy, k < 2 || k > 25 ? shade(color, 0.7) : 0x40576d, winCode(0.04)); }
    }
    for (let x = 10; x < w - 26; x += 42) {
      if (i === frontFace && Math.abs(x + 11 - w / 2) < 30) continue;
      p.rect(x, 22, 22, h - 32, shade(color, 0.7));
      p.rect(x + 2, 24, 18, h - 36, 0x40576d, winCode(0.12));
      p.vline(x + 11, 24, h - 36, shade(color, 0.85));
    }
  };
}
// a steep roof sloping in from all four eaves to a flat top (a mansard or a hipped roof)
export function mansard(C, x0, y0, x1, y1, z0, z1, inset, roofTex, topTex) {
  const mb = C.mb, i = inset;
  mb.slope([x0, y1, z0], [x1, y1, z0], [x0 + i, y1 - i, z1], [x1 - i, y1 - i, z1], roofTex);
  mb.slope([x1, y0, z0], [x0, y0, z0], [x1 - i, y0 + i, z1], [x0 + i, y0 + i, z1], roofTex);
  mb.slope([x1, y1, z0], [x1, y0, z0], [x1 - i, y1 - i, z1], [x1 - i, y0 + i, z1], roofTex);
  mb.slope([x0, y0, z0], [x0, y1, z0], [x0 + i, y0 + i, z1], [x0 + i, y1 - i, z1], roofTex);
  if (topTex) mb.box(x0 + i, y0 + i, z1 - 0.02, x1 - i, y1 - i, z1, { pz: { t: topTex, world: true } });
  markHeight(C.world, x0, y0, x1, y1, z1);
}
const copperTex = (C) => tex(C, 'copper', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let c = shade(x % 8 === 0 ? 0x4f9a86 : x % 8 === 1 ? 0x7cc8b0 : 0x6cb8a0, 0.92 + hash2i(x, y, 4) * 0.12);
    if (hash2i(x >> 1, y >> 2, 7) > 0.86) c = mixc(c, 0x8ad8c0, 0.4);
    p.set(x, y, c);
  }
});
// a sphere as stacked rings (the planetarium)
function sphere(C, x, y, z, r, t, n = 10) {
  for (let k = 0; k < n; k++) {
    const a = -1 + (2 * (k + 0.5)) / n, rr = r * Math.sqrt(1 - a * a);
    C.mb.cylinder(x, y, z + r * (-1 + (2 * k) / n), z + r * (-1 + (2 * (k + 1)) / n), rr, 16, t, k === n - 1 ? t : null);
  }
}
// a canopy from a doorway to the kerb, on poles
function canopy(C, x0, y0, x1, y1, z, t) {
  const P = propTex(C);
  C.mb.box(x0, y0, z, x1, y1, z + 0.22, sides(t, { t }));
  for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) C.mb.box(px - 0.04, py - 0.04, CURB, px + 0.04, py + 0.04, z, sides(P.silver));
}

// ---------------------------------------------------------------------------------------------
// Pre-war apartment towers. On Central Park West they rise to twin towers with little temples on
// top, facing the park; on Fifth Avenue they are limestone with a slate mansard; elsewhere a
// buff-brick block with art deco setbacks.
export function prewar(C, L, bx, by) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0;
  const west = bx === PARK.bx0 - 1, east = bx === PARK.bx1 + 1;
  const style = west ? 'twin' : east ? 'fifth' : (bx + by) % 2 ? 'deco' : 'twin';
  const wallC = style === 'fifth' ? 0xdccfb2 : style === 'deco' ? 0xd2b48a : 0xe0d0ae;
  const mod = module(C, `pw_${style}`, style === 'deco' ? { brick: PAL.brickTan, frame: 0x2b2b30, lintel: 0xe6dabe, sill: 0xe6dabe } : { wall: wallC, frame: style === 'fifth' ? 0x2b2b30 : 0x3a4a3a, lintel: shade(wallC, 1.08), sill: shade(wallC, 1.06), band: style === 'twin' ? shade(wallC, 0.92) : null });
  const crown = module(C, `pw_${style}_crown`, { wall: shade(wallC, 1.04), frame: 0xf2efe6, arch: true, keystone: true, pier: true });
  const x0 = L.x0 + 0.6, x1 = L.x1 - 0.6, y0 = L.y0 + 0.6, y1 = L.y1 - 0.6;
  const floors = style === 'fifth' ? 9 : style === 'twin' ? 13 : 15;
  const zb = z0 + 2.5, zt = zb + floors * 1.5;
  // the front faces the park (east on CPW, west on Fifth), else south
  const front = west ? 1 : east ? 3 : 0; // band face index: 0 py, 1 px, 2 ny, 3 nx
  band(C, x0, y0, x1, y1, z0, zb, lobbyPainter(style === 'deco' ? 0xc8a878 : 0xcfc2a2, front), null);
  section(C, x0, y0, x1, y1, zb, zt, mod, S.roofTar, { seed: 120 + bx + by * 7, mat: MAT.OFFICE });
  mb.box(x0 - 0.18, y0 - 0.18, zt, x1 + 0.18, y1 + 0.18, zt + 0.32, sides(S.limestone, { t: S.limeTop }));
  const cy = (y0 + y1) / 2, cx = (x0 + x1) / 2;
  const green = flat(C, 'canopy_green', 0x2f5a3a);
  if (front === 1) { canopy(C, x1, cy - 0.9, L.x1 + 2.1, cy + 0.9, z0 + 2.2, green); home(C, L.x1 + 1.0, cy, x1 - 0.2, cy, [1, 0]); }
  else if (front === 3) { canopy(C, L.x0 - 2.1, cy - 0.9, x0, cy + 0.9, z0 + 2.2, green); home(C, L.x0 - 1.0, cy, x0 + 0.2, cy, [-1, 0]); }
  else { canopy(C, cx - 0.9, y1, cx + 0.9, L.y1 + 2.1, z0 + 2.2, green); home(C, cx, L.y1 + 1.0, cx, y1 - 0.2, [0, 1]); }
  if (style === 'twin') {
    // two towers at the park-facing corners, each crowned by a little temple and a lantern
    const temple = tex(C, 'pw_temple', 32, 64, (p) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) p.set(x, y, 0x2a2a30, winCode(0.3, true));
      for (const cxx of [2, 12, 22]) { p.rect(cxx, 6, 7, 58, 0xe6dabe); p.vline(cxx, 6, 58, 0xf4ecd6); p.vline(cxx + 6, 6, 58, 0xb8ab8c); p.rect(cxx - 1, 6, 9, 3, 0xf4ecd6); }
      p.rect(0, 0, 32, 6, 0xe6dabe); p.hline(0, 5, 32, 0xb8ab8c);
    });
    const tw = 4.8;
    const ax = front === 1 || front === 0 ? x1 - tw - 0.4 : x0 + 0.4;
    for (const ty of [y0 + 0.4, y1 - tw - 0.4]) {
      const tz = zt + 0.32, th = tz + 6 * 1.5;
      section(C, ax, ty, ax + tw, ty + tw, tz, th, crown, S.roofTar, { seed: 140 + by, mat: MAT.OFFICE });
      mb.box(ax - 0.15, ty - 0.15, th, ax + tw + 0.15, ty + tw + 0.15, th + 0.3, sides(S.limestone, { t: S.limeTop }));
      mb.box(ax + 0.6, ty + 0.6, th + 0.3, ax + tw - 0.6, ty + tw - 0.6, th + 2.3, sides(temple, { t: S.limeTop }), { mat: MAT.OFFICE });
      mb.box(ax + 0.45, ty + 0.45, th + 2.3, ax + tw - 0.45, ty + tw - 0.45, th + 2.55, sides(S.limestone, { t: S.limeTop }));
      mb.pyramid(ax + 0.7, ty + 0.7, ax + tw - 0.7, ty + tw - 0.7, th + 2.55, th + 4.0, copperTex(C));
      mb.box(ax + tw / 2 - 0.05, ty + tw / 2 - 0.05, th + 4.0, ax + tw / 2 + 0.05, ty + tw / 2 + 0.05, th + 5.0, sides(S.metal));
      markHeight(C.world, ax, ty, ax + tw, ty + tw, th + 4.0);
    }
    waterTower(C, front === 1 ? x0 + 3 : x1 - 3, cy, zt + 0.32, 0.9);
  } else if (style === 'fifth') {
    // a slate mansard with a row of dormers, chimneys at the ends
    const slate = tex(C, 'pw_mansard', 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade((y >> 2) % 2 ? 0x3e4450 : 0x4a5160, 0.93 + hash2i(x >> 2, y >> 2, 34) * 0.12));
      for (const dx of [6, 20]) { p.rect(dx, 10, 7, 12, 0xe6dabe); p.rect(dx + 1, 12, 5, 9, 0x2a3440, winCode(0.4)); p.rect(dx - 1, 8, 9, 3, 0xe6dabe); }
    });
    mansard(C, x0 + 0.2, y0 + 0.2, x1 - 0.2, y1 - 0.2, zt + 0.32, zt + 3.4, 1.6, slate, S.roofTar);
    for (const [hx, hy] of [[x0 + 1.4, y0 + 1.4], [x1 - 1.4, y1 - 1.4]]) mb.box(hx - 0.3, hy - 0.3, zt + 0.32, hx + 0.3, hy + 0.3, zt + 4.0, sides(S.brickTan, { t: S.roofTar }));
    waterTower(C, cx, cy, zt + 3.4, 0.8);
  } else {
    // art deco setbacks and a finned crown
    section(C, x0 + 1.6, y0 + 1.6, x1 - 1.6, y1 - 1.6, zt + 0.32, zt + 6.32, mod, S.roofTar, { seed: 160 + bx, mat: MAT.OFFICE });
    section(C, x0 + 4.2, y0 + 4.2, x1 - 4.2, y1 - 4.2, zt + 6.32, zt + 10.32, crown, S.roofTar, { seed: 170 + bx, mat: MAT.OFFICE });
    for (let k = 0; k < 4; k++) mb.box(x0 + 4.6 + k * 2.0, y1 - 4.25, zt + 10.32, x0 + 4.9 + k * 2.0, y1 - 4.05, zt + 12.0, sides(S.limestone));
    waterTower(C, x0 + 2.6, y0 + 2.6, zt + 0.32, 0.85);
  }
}

// ---------------------------------------------------------------------------------------------
// A hotel tower on the avenue, with a limestone wing behind it
export function hotelBlock(C, L, bx, by) {
  const S = sharedTex(C), z0 = C.z0;
  hotel(C, { x0: L.x0 + 1, y0: L.y0 + 8.5, x1: L.x1 - 1, y1: L.y1 - 0.5 }, { floors: 16 + ((bx + by) % 3) * 3 });
  const lime = module(C, 'hb_lime', { wall: 0xdccfb2, frame: 0x2b2b30, lintel: 0xe6dabe, sill: 0xe6dabe });
  band(C, L.x0 + 1, L.y0 + 0.6, L.x1 - 1, L.y0 + 8.2, z0, z0 + 2.5, lobbyPainter(0xcfc2a2, 2), null);
  section(C, L.x0 + 1, L.y0 + 0.6, L.x1 - 1, L.y0 + 8.2, z0 + 2.5, z0 + 2.5 + 8 * 1.5, lime, S.roofTar, { seed: 180 + bx, mat: MAT.OFFICE });
  office(C, (L.x0 + L.x1) / 2, L.y0 - 0.9, (L.x0 + L.x1) / 2, L.y0 + 0.8);
}

// ---------------------------------------------------------------------------------------------
// Billionaires' Row: a pencil-thin supertall, either a white concrete grid of square windows
// (432 Park) or glass between bronze piers stepping back on its north side (57th Street)
export function supertall(C, L, bx) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  if (bx >= 8) {
    const grid = tex(C, 'st_grid', 32, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0xeceae4, 0.96 + hash2i(x, y, 51) * 0.05));
      p.rect(5, 6, 22, 36, 0x2a3646, winCode(0.5));
      for (let y = 6; y < 42; y++) for (let x = 5; x < 27; x++) if ((x + y) % 19 < 2 && y < 24) p.set(x, y, 0x6a8aa8, winCode(0.5));
    });
    const open = tex(C, 'st_open', 32, 48, (p) => { for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, x < 5 || x > 26 ? 0xeceae4 : 0x101418); });
    const h = 3.5, x0 = cx - h, x1 = cx + h, y0 = cy - h, y1 = cy + h;
    let z = z0;
    mb.box(x0 - 1.5, y0 - 1.5, z0, x1 + 1.5, y1 + 1.5, z0 + 2.4, sides(S.concrete, { t: S.roofGravel }));
    for (const [n, o] of [[12, false], [1, true], [12, false], [1, true], [12, false], [1, true], [8, false]]) {
      section(C, x0, y0, x1, y1, z, z + n * 1.5, o ? open : grid, null, { seed: 190 + n, mat: MAT.OFFICE });
      z += n * 1.5;
    }
    mb.box(x0, y0, z, x1, y1, z + 0.2, { pz: { t: S.roofSilver } });
    markHeight(C.world, x0, y0, x1, y1, z);
    beacon(C, cx, cy, z + 0.3);
  } else {
    const glassPier = tex(C, 'st_pier', 32, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x5a7e98, 1.1 - (y / 48) * 0.25), winCode(0.5));
      for (const px of [0, 16]) { p.rect(px, 0, 4, 48, 0xc8a070); p.vline(px, 0, 48, 0xe0bc8a); p.vline(px + 3, 0, 48, 0x8a6a42); }
      p.rect(0, 44, 32, 4, 0x8a6a42);
    });
    const x0 = cx - 3.6, x1 = cx + 3.6, y0 = cy - 4, y1 = cy + 4;
    mb.box(x0 - 1.5, y0 - 1.5, z0, x1 + 1.5, y1 + 1.5, z0 + 3.0, sides(S.limestone, { t: S.roofGravel }));
    const steps = [[y0, 40], [y0 + 2.4, 52], [y0 + 4.6, 62], [y0 + 6.4, 69]];
    let z = z0 + 3.0;
    for (const [yy, top] of steps) { section(C, x0, yy, x1, y1, z, z0 + top, glassPier, S.roofSilver, { seed: 200 + top, mat: MAT.GLASS | MAT.OFFICE }); z = z0 + top; }
    mb.box(cx - 0.05, y1 - 0.85, z, cx + 0.05, y1 - 0.75, z + 4, sides(S.metal));
    beacon(C, cx, y1 - 0.8, z + 4.1);
  }
  office(C, cx, L.y1 + 0.9, cx, L.y1 - 0.4);
  landmark(C, bx >= 8 ? '432 PARK AVENUE' : '111 WEST 57TH STREET', cx, L.y1 + 3, 0);
}

// ---------------------------------------------------------------------------------------------
// The Guggenheim: a white spiral widening as it climbs, a ribbon of window between the turns,
// the little rotunda beside it and a limestone grid tower behind
export function guggenheim(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const white = tex(C, 'gug_white', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0xf0ece2, 0.96 + hash2i(x, y, 61) * 0.05)); });
  const ring = tex(C, 'gug_ring', 64, 40, (p) => {
    for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) p.set(x, y, shade(0xf2eee4, 0.97 + hash2i(x, y, 62) * 0.04 - (y > 30 ? 0.06 : 0)));
    for (let x = 0; x < 64; x++) { p.set(x, 30, 0xb8b2a6); for (let y = 31; y < 37; y++) p.set(x, y, 0x3a4a5a, winCode(0.1, true)); p.set(x, 37, 0xd8d2c6); }
  });
  const glassTop = tex(C, 'gug_dome', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, (x % 8 === 0 || y % 8 === 0) ? 0xd8dce0 : 0x8ab0c8); });
  const cx = L.x0 + 6.4, cy = L.y0 + 8.4;
  C.paintGround(L.x0, L.y0, L.x0 + 12.5, L.y1, 'plaza');
  mb.cylinder(cx, cy, z0, z0 + 1.0, 3.9, 28, white, white);
  let z = z0 + 1.0, r = 4.0;
  for (let k = 0; k < 5; k++) { mb.cylinder(cx, cy, z, z + 1.25, r, 32, ring, k === 4 ? white : null); z += 1.25; r += 0.4; }
  mb.cone(cx, cy, z, z + 0.7, r - 0.9, 16, glassTop);
  markHeight(W, cx - r, cy - r, cx + r, cy + r, z);
  // the small rotunda (the monitor) to the north, and the grid tower behind
  mb.cylinder(cx + 0.6, L.y0 + 1.9, z0, z0 + 3.2, 1.6, 20, ring, white);
  const grid = module(C, 'gug_annex', { wall: 0xe6dfd0, frame: 0x8a8a84, wins: [4, 18], panes: '1/1' });
  section(C, L.x0 + 12.4, L.y0 + 3, L.x1 - 0.6, L.y0 + 14, z0, z0 + 2.5 + 10 * 1.5, grid, S.roofTar, { seed: 211, mat: MAT.OFFICE });
  // the name along the base, facing Fifth Avenue
  const name = tex(C, 'gug_name', 192, 12, (p) => { p.rect(0, 0, 192, 12, 0xf0ece2); p.text7(6, 3, 'SOLOMON R. GUGGENHEIM MUSEUM', 0x2a2a2e, 255); });
  mb.vquad(cx - 4.02, cy - 3.0, cx - 4.02, cy + 3.0, z0 + 0.35, z0 + 0.35 + 12 / T, name, { mat: MAT.FLAT });
  office(C, L.x0 - 0.9, cy, cx - 3.6, cy);
  landmark(C, 'GUGGENHEIM', L.x0 - 1.2, cy + 3, 3);
}

// ---------------------------------------------------------------------------------------------
// The Met: a Beaux-Arts front on Fifth Avenue (paired columns, three arched entrances, banners and
// the uncarved blocks on top), the great steps between two fountains, limestone wings behind
export function metMuseum(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const lime = 0xe2d6bc;
  const wing = tex(C, 'met_wing', 32, 64, (p) => {
    stoneFill(p, 0, 0, 32, 64, [lime], 71, 12, { blocks: 32 });
    p.rect(9, 18, 14, 34, shade(lime, 0.72));
    p.rect(11, 22, 10, 30, 0x2c3a48, winCode(0.15, true));
    for (let k = 0; k < 10; k++) { const dy = Math.round(Math.sqrt(Math.max(0, 25 - (k - 4.5) ** 2))); p.vline(11 + k, 22 - dy, dy, 0x2c3a48, winCode(0.15, true)); }
    p.rect(0, 0, 32, 5, shade(lime, 1.08)); p.hline(0, 5, 32, shade(lime, 0.75)); p.rect(0, 58, 32, 6, shade(lime, 0.9));
    p.rect(0, 0, 3, 64, shade(lime, 1.05)); p.vline(2, 0, 64, shade(lime, 0.8));
  });
  const x0 = L.x0 + 4.6, x1 = L.x1 - 0.5, y0 = L.y0 + 0.5, y1 = L.y1 - 0.5;
  mb.box(x0, y0, z0, x1, y1, z0 + 6.0, sides(wing, { t: S.roofSilver }));
  markHeight(W, x0, y0, x1, y1, z0 + 6.0);
  // skylights on the roof
  for (const [sx, sy] of [[x0 + 4, y0 + 4], [x0 + 9, y0 + 9], [x0 + 4, y1 - 4]]) mb.pyramid(sx - 1.4, sy - 1.4, sx + 1.4, sy + 1.4, z0 + 6.0, z0 + 6.9, S.glassBlue ?? S.roofSilver);
  // the central pavilion on Fifth Avenue
  const cy = (L.y0 + L.y1) / 2, px0 = L.x0 + 3.0;
  const front = tex(C, 'met_front', 224, 240, (p) => {
    stoneFill(p, 0, 0, 224, 240, [lime], 72, 12, { blocks: 32 });
    // entablature and attic
    p.rect(0, 0, 224, 44, shade(lime, 1.04)); p.hline(0, 44, 224, shade(lime, 0.7)); p.rect(0, 46, 224, 8, shade(lime, 1.1));
    for (const bx of [12, 72, 136, 196]) { p.rect(bx - 6, 4, 22, 34, shade(lime, 0.94)); p.frame(bx - 6, 4, 22, 34, shade(lime, 0.78)); }
    // three arched entrances between paired columns
    for (const [ax, aw] of [[44, 32], [96, 32], [148, 32]]) {
      p.rect(ax, 96, aw, 144, 0x2a3440, winCode(0.06, true));
      for (let k = 0; k < aw; k++) { const dy = Math.round(Math.sqrt(Math.max(0, (aw / 2) ** 2 - (k - aw / 2 + 0.5) ** 2))); p.vline(ax + k, 96 - dy, dy, 0x2a3440, winCode(0.06, true)); }
      p.rect(ax + 4, 200, aw - 8, 40, 0x5a3e1e);
    }
    for (const cx2 of [16, 30, 82, 134, 186, 200]) { p.rect(cx2, 56, 10, 184, shade(lime, 1.12)); p.vline(cx2, 56, 184, 0xfaf4e4); p.vline(cx2 + 9, 56, 184, shade(lime, 0.78)); p.rect(cx2 - 2, 56, 14, 6, 0xf4ecd6); }
  });
  mb.box(px0, cy - 3.5, z0, x0 + 0.1, cy + 3.5, z0 + 7.5, { nx: front, py: wing, ny: wing, pz: { t: S.roofSilver } });
  markHeight(W, px0, cy - 3.5, x0, cy + 3.5, z0 + 7.5);
  for (let k = 0; k < 4; k++) mb.box(px0 + 0.2, cy - 3.2 + k * 2.05, z0 + 7.5, px0 + 0.9, cy - 2.4 + k * 2.05, z0 + 8.1, sides(S.limestone, { t: S.limeTop }));
  // banners between the columns
  const cols = [0xc8302c, 0x1f4f9a, 0xe0a020];
  cols.forEach((c, k) => {
    const b = tex(C, `met_banner_${k}`, 24, 88, (p) => { p.rect(0, 0, 24, 88, c); p.vline(0, 0, 88, shade(c, 1.2)); p.vline(23, 0, 88, shade(c, 0.7)); p.text7(5, 10, 'THE', 0xf2efe6, 255); p.text7(5, 20, 'MET', 0xf2efe6, 255); p.rect(4, 40, 16, 30, shade(c, 1.15)); });
    const by = cy - 2.3 + k * 2.3;
    mb.vquad(px0 - 0.06, by - 0.38, px0 - 0.06, by + 0.38, z0 + 3.0, z0 + 3.0 + 88 / T, b, { mat: MAT.FLAT });
  });
  // the steps and the two fountains
  C.paintGround(L.x0, cy - 4, px0, cy + 4, 'stairsX');
  for (let k = 0; k < 3; k++) mb.box(L.x0 + 0.3 + k * 0.85, cy - 4, z0, px0, cy + 4, z0 + 0.12 * (k + 1), { pz: { t: S.limeTop }, nx: S.limestone });
  for (const fy of [L.y0 + 2.6, L.y1 - 2.6]) {
    C.fountainPool(L.x0 + 1.9, fy, 2.6, 3.4);
  }
  office(C, L.x0 - 0.9, cy, px0 + 0.2, cy);
  landmark(C, 'THE MET', L.x0 - 1.2, cy + 5, 3);
}

// ---------------------------------------------------------------------------------------------
// The Natural History museum on Central Park West: pink granite with arched windows, turreted
// corners, the columned rotunda entrance; and the planetarium, a white sphere in a glass cube
export function naturalHistory(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const pink = 0xc8a092;
  const granite = tex(C, 'amnh_wall', 32, 64, (p) => {
    stoneFill(p, 0, 0, 32, 64, [pink], 81, 8, { blocks: 16 });
    for (const wx of [6, 18]) { p.rect(wx, 22, 8, 28, 0x2a3440, winCode(0.2, true)); for (let k = 0; k < 8; k++) { const dy = Math.round(Math.sqrt(Math.max(0, 16 - (k - 3.5) ** 2))); p.vline(wx + k, 22 - dy, dy, 0x2a3440, winCode(0.2, true)); } p.rect(wx - 1, 50, 10, 2, shade(pink, 1.15)); }
    p.rect(0, 0, 32, 4, shade(pink, 1.1)); p.hline(0, 4, 32, shade(pink, 0.75));
  });
  const portico = tex(C, 'amnh_portico', 192, 272, (p) => {
    stoneFill(p, 0, 0, 192, 272, [0xd8ccb4], 82, 12, { blocks: 32 });
    p.rect(0, 0, 192, 40, 0xe6dabe); p.hline(0, 40, 192, 0xa89c84);
    signBoard(p, 30, 14, 132, 14, 'NATURAL HISTORY', { bg: 0xe6dabe, fg: 0x5a4a32, t: 1, shadow: false });
    p.rect(66, 110, 60, 162, 0x2a3440, winCode(0.08, true));
    for (let k = 0; k < 60; k++) { const dy = Math.round(Math.sqrt(Math.max(0, 900 - (k - 29.5) ** 2))); p.vline(66 + k, 110 - dy, dy, 0x2a3440, winCode(0.08, true)); }
    for (const cx2 of [10, 40, 140, 170]) { p.rect(cx2, 48, 13, 224, 0xf0e8d4); p.vline(cx2, 48, 224, 0xfaf4e4); p.vline(cx2 + 12, 48, 224, 0xb8ac94); p.rect(cx2 - 3, 48, 19, 8, 0xf4ecd6); }
  });
  const x0 = L.x0 + 0.8, x1 = L.x1 - 2.4, y0 = L.y0 + 6.8, y1 = L.y1 - 0.6;
  mb.box(x0, y0, z0, x1, y1, z0 + 7.0, sides(granite, { t: S.roofTar }));
  markHeight(W, x0, y0, x1, y1, z0 + 7.0);
  mb.box(L.x1 - 8.4, L.y0 + 0.6, z0, x1, y0, z0 + 7.0, sides(granite, { t: S.roofTar }));
  markHeight(W, L.x1 - 8.4, L.y0 + 0.6, x1, y0, z0 + 7.0);
  // turrets at the corners on the park side
  for (const ty of [L.y0 + 0.6, y1 - 3.0]) {
    mb.box(x1 - 3.0, ty, z0, x1 + 0.2, ty + 3.0, z0 + 9.6, sides(granite, { t: S.roofTar }));
    mb.pyramid(x1 - 3.2, ty - 0.2, x1 + 0.4, ty + 3.2, z0 + 9.6, z0 + 12.4, S.slate);
    markHeight(W, x1 - 3.0, ty, x1 + 0.2, ty + 3.0, z0 + 12.4);
  }
  // the rotunda entrance facing the park, with figures on its cornice
  const cy = (y0 + y1) / 2;
  mb.box(x1, cy - 3.0, z0, x1 + 1.5, cy + 3.0, z0 + 8.5, { px: portico, py: S.limestone, ny: S.limestone, pz: { t: S.limeTop } });
  markHeight(W, x1, cy - 3.0, x1 + 1.5, cy + 3.0, z0 + 8.5);
  for (let k = 0; k < 4; k++) mb.box(x1 + 0.9, cy - 2.6 + k * 1.75, z0 + 8.5, x1 + 1.3, cy - 2.2 + k * 1.75, z0 + 9.3, sides(S.greystone));
  C.paintGround(x1 + 1.5, cy - 3, L.x1, cy + 3, 'stairsX');
  // the planetarium: a white sphere inside a glass cube
  const gx0 = L.x0 + 1.0, gx1 = L.x0 + 8.6, gy0 = L.y0 + 0.4, gy1 = L.y0 + 6.6, gz = z0 + 7.6;
  const sp = tex(C, 'amnh_sphere', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0xf2f0ec, 0.95 + hash2i(x >> 2, y >> 2, 83) * 0.06), winCode(0.3, true)); });
  sphere(C, (gx0 + gx1) / 2, (gy0 + gy1) / 2, z0 + 3.9, 2.8, sp);
  const frame = flat(C, 'cube_frame', 0xd8dde2);
  for (const [ax, ay] of [[gx0, gy0], [gx1, gy0], [gx0, gy1], [gx1, gy1]]) mb.box(ax - 0.08, ay - 0.08, z0, ax + 0.08, ay + 0.08, gz, sides(frame, { t: frame }));
  for (const z of [z0 + 2.5, z0 + 5.0, gz - 0.12]) {
    mb.box(gx0, gy0 - 0.06, z, gx1, gy0 + 0.06, z + 0.12, sides(frame, { t: frame }));
    mb.box(gx0, gy1 - 0.06, z, gx1, gy1 + 0.06, z + 0.12, sides(frame, { t: frame }));
    mb.box(gx0 - 0.06, gy0, z, gx0 + 0.06, gy1, z + 0.12, sides(frame, { t: frame }));
    mb.box(gx1 - 0.06, gy0, z, gx1 + 0.06, gy1, z + 0.12, sides(frame, { t: frame }));
  }
  for (let k = 1; k < 4; k++) {
    const xx = gx0 + ((gx1 - gx0) * k) / 4, yy = gy0 + ((gy1 - gy0) * k) / 4;
    mb.box(xx - 0.05, gy0, gz - 0.1, xx + 0.05, gy1, gz, sides(frame, { t: frame }));
    mb.box(gx0, yy - 0.05, gz - 0.1, gx1, yy + 0.05, gz, sides(frame, { t: frame }));
  }
  C.world.solids.push([gx0, gy0, gx1, gy1, gz]);
  C.world.lamps.push({ x: (gx0 + gx1) / 2, y: gy1 + 1, z: z0 + 3, r: 4, color: [0.7, 0.8, 1], k: 0.6, kind: 'flood' });
  office(C, L.x1 + 0.9, cy, x1 + 1.3, cy);
  landmark(C, 'NATURAL HISTORY MUSEUM', L.x1 + 1.2, cy + 4);
}

// ---------------------------------------------------------------------------------------------
// Lincoln Center: the round fountain on a travertine plaza between the Met Opera's five arches,
// the concert hall and the theatre, both colonnaded
export function lincolnCenter(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const trav = 0xe8e0cc;
  const travTex = tex(C, 'lc_trav', 32, 48, (p) => { stoneFill(p, 0, 0, 32, 48, [trav], 91, 16, { blocks: 32 }); });
  const colonnade = tex(C, 'lc_colonnade', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x3a4a5c, 1.05 - y / 96), winCode(0.1, true));
    for (const cx2 of [0, 16]) { p.rect(cx2, 0, 4, 48, 0xf2ecdc); p.vline(cx2, 0, 48, 0xfffaf0); p.vline(cx2 + 3, 0, 48, 0xc8c0ac); }
    p.rect(0, 0, 32, 4, 0xf2ecdc);
  });
  const operaW = L.y1 - L.y0 - 4;
  const opera = tex(C, 'lc_opera', Math.round(operaW * T), Math.round(9.5 * T), (p, r) => {
    const w = r.w, h = r.h;
    stoneFill(p, 0, 0, w, h, [trav], 92, 16, { blocks: 32 });
    const n = 5, aw = Math.floor((w - 40) / n) - 12;
    for (let k = 0; k < n; k++) {
      const ax = 20 + k * (aw + 12) + 6;
      p.rect(ax, 70, aw, h - 70, 0x8a5a2a, winCode(0.02, true));
      for (let kk = 0; kk < aw; kk++) { const dy = Math.round(Math.sqrt(Math.max(0, (aw / 2) ** 2 - (kk - aw / 2 + 0.5) ** 2)) * 1.6); p.vline(ax + kk, 70 - dy, dy, 0x8a5a2a, winCode(0.02, true)); }
      for (let y = 90; y < h - 20; y += 36) p.ellipse(ax + aw / 2, y, 5, 4, 0xffe8a0, winCode(0.02, true)); // chandeliers
      p.vline(ax + Math.floor(aw / 2), 40, h - 40, 0xc8b898);
    }
    p.rect(0, 0, w, 14, shade(trav, 1.05)); p.hline(0, 14, w, shade(trav, 0.8));
  });
  // the plaza and the fountain
  const fx = L.x0 + 11.5, fy = (L.y0 + L.y1) / 2;
  C.paintGround(L.x0 + 6, L.y0 + 4.6, L.x1, L.y1 - 4.6, 'plaza');
  radialPlaza(C, fx, fy, 4.4, 0);
  roundPool(C, fx, fy, 2.3);
  W.fountains.push({ x: fx, y: fy, z: CURB + 0.4, kind: 'pool', w: 4.2, d: 4.2 });
  W.lamps.push({ x: fx, y: fy, z: CURB + 0.6, r: 4.0, color: [0.75, 0.88, 1.0], k: 0.55, kind: 'park' });
  // the Met Opera at the west end of the plaza, its fly tower behind
  const ox0 = L.x0 + 0.6, ox1 = L.x0 + 6;
  mb.box(ox0, L.y0 + 2, z0, ox1, L.y1 - 2, z0 + 9.5, { px: opera, py: travTex, ny: travTex, nx: travTex, pz: { t: S.roofTar } });
  mb.box(ox0 + 0.6, L.y0 + 4, z0 + 9.5, ox1 - 1.4, L.y1 - 4, z0 + 12.6, sides(travTex, { t: S.roofTar }));
  markHeight(W, ox0, L.y0 + 2, ox1, L.y1 - 2, z0 + 12.6);
  // the concert hall (north) and, kept low so the plaza shows from the street, the theatre's
  // colonnade (south)
  for (const [hy0, hy1, hh] of [[L.y0 + 0.6, L.y0 + 4.4, 7.2], [L.y1 - 3.4, L.y1 - 0.6, 2.6]]) {
    mb.box(ox1 + 0.4, hy0, z0, L.x1 - 0.5, hy1, z0 + hh, sides(colonnade, { t: S.roofTar }), { mat: MAT.OFFICE });
    mb.box(ox1 + 0.2, hy0 - 0.15, z0 + hh, L.x1 - 0.3, hy1 + 0.15, z0 + hh + 0.4, sides(S.limestone, { t: S.limeTop }));
    markHeight(W, ox1 + 0.4, hy0, L.x1 - 0.5, hy1, z0 + hh + 0.4);
  }
  office(C, L.x1 + 0.9, fy, fx + 2.6, fy);
  landmark(C, 'LINCOLN CENTER', L.x1 + 1.2, fy + 2);
}

// ---------------------------------------------------------------------------------------------
// Columbus Circle: twin glass towers on a podium, and the granite column with Columbus on top on
// the plaza at the corner of the park
export function columbusCircle(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const glass = tex(C, 'cc_glass', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
      let c = shade(0x3e6a78, 1.12 - (y / 48) * 0.3);
      if ((x + y) % 24 < 2 && y < 30) c = mixc(c, 0xb8dce8, 0.55);
      p.set(x, y, c, winCode(0.5));
    }
    for (let x = 0; x < 32; x++) p.set(x, 44, 0x8aa0aa);
    p.vline(0, 0, 48, 0xa8bcc4); p.vline(16, 0, 44, 0x6a8a96);
  });
  const podium = tex(C, 'cc_podium', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x6a8a98, 1.1 - y / 96), winCode(0.06, true));
    p.rect(0, 0, 32, 6, 0xd8ccb0); p.vline(0, 0, 48, 0xd8ccb0); p.vline(1, 0, 48, 0xb8ac90);
  });
  const x0 = L.x0 + 0.5, x1 = L.x1 - 0.5;
  mb.box(x0, L.y0 + 3.2, z0, x1, L.y1 - 0.5, z0 + 8.0, sides(podium, { t: S.roofSilver }), { mat: MAT.GLASS | MAT.OFFICE });
  markHeight(W, x0, L.y0 + 3.2, x1, L.y1 - 0.5, z0 + 8.0);
  for (const [tx0, tx1] of [[x0 + 0.4, x0 + 7.4], [x1 - 7.4, x1 - 0.4]]) {
    section(C, tx0, L.y0 + 3.8, tx1, L.y0 + 10.4, z0 + 8.0, z0 + 54, glass, S.roofSilver, { seed: 221, mat: MAT.GLASS | MAT.OFFICE });
    beacon(C, (tx0 + tx1) / 2, L.y0 + 7, z0 + 54.2);
  }
  // the plaza at the corner of the park and the Columbus monument
  C.paintGround(L.x0, L.y0, L.x1, L.y0 + 3.2, 'plaza');
  const mx = L.x1 - 2.2, my = L.y0 + 1.6;
  mb.box(mx - 0.75, my - 0.75, z0, mx + 0.75, my + 0.75, z0 + 0.9, sides(S.greystone, { t: S.limeTop }));
  mb.cylinder(mx, my, z0 + 0.9, z0 + 6.6, 0.3, 10, S.greystone, S.limeTop);
  mb.box(mx - 0.42, my - 0.42, z0 + 6.6, mx + 0.42, my + 0.42, z0 + 6.85, sides(S.greystone, { t: S.limeTop }));
  mb.box(mx - 0.13, my - 0.13, z0 + 6.85, mx + 0.13, my + 0.13, z0 + 7.6, sides(flat(C, 'bronze', 0x5a4a32)));
  W.solids.push([mx - 0.75, my - 0.75, mx + 0.75, my + 0.75, 6.6]);
  W.lamps.push({ x: mx, y: my + 1, z: z0 + 1.2, r: 3.5, color: [1, 0.9, 0.7], k: 0.5, kind: 'flood' });
  office(C, (x0 + x1) / 2, L.y0 + 2.3, (x0 + x1) / 2, L.y0 + 3.6);
  landmark(C, 'COLUMBUS CIRCLE', L.x1 + 1.2, L.y0 - 1.2, 1);
}

// ---------------------------------------------------------------------------------------------
// The Plaza: a white château of a hotel with a steep green copper roof, round corner turrets and
// flags over the door; Grand Army Plaza in front with the Pulitzer fountain and the gilded general
export function plazaHotel(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const wallT = module(C, 'plaza_mod', { wall: 0xeee6d6, frame: 0x2b2b30, lintel: 0xf6f0e4, sill: 0xf6f0e4 });
  const roof = tex(C, 'plaza_roof', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade((x >> 2) % 2 ? 0x5aa890 : 0x4f9a86, 0.93 + hash2i(x, y >> 2, 101) * 0.1));
    for (const dx of [5, 20]) { p.rect(dx, 8, 7, 12, 0xeee6d6); p.rect(dx + 1, 10, 5, 9, 0x2a3440, winCode(0.4)); p.rect(dx - 1, 6, 9, 3, 0x4f9a86); }
  });
  const x0 = L.x0 + 4.0, x1 = L.x1 - 0.5, y0 = L.y0 + 0.6, y1 = L.y1 - 0.6;
  band(C, x0, y0, x1, y1, z0, z0 + 2.5, lobbyPainter(0xe6dcc8, 3), null);
  section(C, x0, y0, x1, y1, z0 + 2.5, z0 + 26, wallT, null, { seed: 231, mat: MAT.OFFICE });
  mb.box(x0 - 0.2, y0 - 0.2, z0 + 26, x1 + 0.2, y1 + 0.2, z0 + 26.35, sides(S.limestone, { t: S.limeTop }));
  mansard(C, x0, y0, x1, y1, z0 + 26.35, z0 + 31.5, 2.2, roof, S.roofTar);
  for (const [tx, ty] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    mb.cylinder(tx, ty, z0 + 22, z0 + 27.5, 1.05, 12, wallT, null);
    mb.cone(tx, ty, z0 + 27.5, z0 + 31.2, 1.25, 12, roof);
  }
  for (const k of [-1, 0, 1]) {
    const fy = (y0 + y1) / 2 + k * 1.3;
    mb.box(x0 - 0.04, fy - 0.04, z0 + 2.6, x0 + 0.04, fy + 0.04, z0 + 4.2, sides(S.metal));
    W.flags.push({ x: x0 - 0.5, y: fy, z: z0 + 3.9, n: [-1, 0], type: k ? 'hotel' : 'us', tip: { x: x0 - 0.9, y: fy } });
  }
  canopy(C, L.x0 + 1.4, (y0 + y1) / 2 - 1.1, x0, (y0 + y1) / 2 + 1.1, z0 + 2.3, flat(C, 'canopy_red', 0x8a2a2a));
  W.doors.push({ x: L.x0 - 1.0, y: (y0 + y1) / 2, dx: x0 + 0.2, dy: (y0 + y1) / 2, kind: 'hotel', n: [-1, 0] });
  // Grand Army Plaza
  C.paintGround(L.x0, L.y0, x0, L.y1, 'plaza');
  const fx = L.x0 + 2.0, fy = L.y1 - 4.2;
  ringWall(C, fx, fy, 1.6, 0.24, 0.45, 20);
  waterDisc(C, fx, fy, 1.45, CURB + 0.35, 20);
  mb.cylinder(fx, fy, CURB, CURB + 0.9, 0.3, 10, S.limestone, null);
  mb.cylinder(fx, fy, CURB + 0.9, CURB + 1.05, 0.8, 12, S.limestone, S.limeTop);
  mb.cylinder(fx, fy, CURB + 1.05, CURB + 1.5, 0.12, 8, S.limestone, null);
  mb.cylinder(fx, fy, CURB + 1.5, CURB + 1.6, 0.4, 10, S.limestone, S.limeTop);
  W.fountains.push({ x: fx, y: fy, z: CURB + 1.6, kind: 'tiered', r: 1.6, floor: CURB + 0.35, bowls: [{ r: 0.4, z: CURB + 1.6 }, { r: 0.8, z: CURB + 1.05 }] });
  const sx = L.x0 + 2.0, sy = L.y0 + 4.0;
  mb.box(sx - 0.7, sy - 1.0, CURB, sx + 0.7, sy + 1.0, CURB + 1.3, sides(S.greystone, { t: S.limeTop }));
  C.addSprite('sherman', sx, sy, CURB + 1.3);
  W.solids.push([sx - 0.7, sy - 1.0, sx + 0.7, sy + 1.0, 1.3]);
  landmark(C, 'THE PLAZA', L.x0 - 1.2, (L.y0 + L.y1) / 2 + 3, 2);
}

// ---------------------------------------------------------------------------------------------
// St Patrick's Cathedral: a white marble Gothic church, its twin spires on Fifth Avenue, the nave
// and transepts under steep roofs, the rose window between the towers
export function stPatricks(C, L, o = {}) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const marble = o.stone ?? 0xeee8dc, key = o.key ?? 'sp';
  const nave = tex(C, `${key}_nave`, 48, 224, (p) => {
    stoneFill(p, 0, 0, 48, 224, [marble], 111, 12, { blocks: 24 });
    // a tall pointed window of stained glass, lit softly from inside at night
    const glass = [0x2a3a8a, 0x8a2a3a, 0xc8a030, 0x2a6a4a];
    for (let y = 44; y < 196; y++) for (let x = 16; x < 32; x++) {
      const top = y < 60 ? Math.abs(x - 23.5) < (y - 43) * 0.55 : true;
      if (top) p.set(x, y, (x === 23 || y % 20 === 0) ? 0x5a5a62 : glass[(x >> 2) + (y >> 4) & 3], winCode(0.25, true));
    }
    for (const bx of [0, 46]) { p.rect(bx, 0, 2, 224, shade(marble, 0.82)); }
    p.rect(0, 210, 48, 14, shade(marble, 0.92));
  });
  const front = tex(C, `${key}_front`, 64, 288, (p) => {
    stoneFill(p, 0, 0, 64, 288, [marble], 112, 12, { blocks: 24 });
    // the rose window and the great door
    for (let y = 40; y < 104; y++) for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - 31.5, y - 72);
      if (d < 26) p.set(x, y, d > 24 ? 0x8a8a90 : Math.floor((Math.atan2(y - 72, x - 31.5) + PI) * 4) % 2 ? 0x2a3a8a : 0x8a2a3a, winCode(0.25, true));
    }
    p.rect(18, 196, 28, 92, 0x5a3e1e);
    for (let k = 0; k < 28; k++) { const dy = Math.round(Math.abs(k - 13.5) < 14 ? (14 - Math.abs(k - 13.5)) * 1.4 : 0); p.vline(18 + k, 196 - dy, dy, 0x5a3e1e); }
    p.rect(20, 210, 24, 78, 0x3a2a18);
  });
  const spireTex = tex(C, `${key}_spire`, 32, 64, (p) => {
    stoneFill(p, 0, 0, 32, 64, [marble], 113, 8, { blocks: 16 });
    for (let y = 4; y < 64; y += 8) for (let x = 0; x < 32; x += 8) p.rect(x + 2, y, 3, 2, shade(marble, 0.8));
  });
  const slateT = S.slate;
  const ny0 = L.y0 + 6.4, ny1 = L.y1 - 6.4, nx0 = L.x0 + 4.2, nx1 = L.x1 - 2.6, zw = z0 + 7.0;
  // nave and transept
  mb.box(nx0, ny0, z0, nx1, ny1, zw, sides(nave), { mat: MAT.OFFICE });
  mb.gable(nx0, ny0 - 0.2, nx1, ny1 + 0.2, zw, zw + 3.4, 'x', slateT, nave);
  const tx0 = (nx0 + nx1) / 2 - 1.6, tx1 = (nx0 + nx1) / 2 + 1.6;
  mb.box(tx0, L.y0 + 3.2, z0, tx1, L.y1 - 3.2, zw, sides(nave), { mat: MAT.OFFICE });
  mb.gable(tx0 - 0.2, L.y0 + 3.2, tx1 + 0.2, L.y1 - 3.2, zw, zw + 3.4, 'y', slateT, nave);
  markHeight(W, nx0, ny0, nx1, ny1, zw + 3.4);
  markHeight(W, tx0, L.y0 + 3.2, tx1, L.y1 - 3.2, zw + 3.4);
  // the apse
  mb.cylinder(nx1, (ny0 + ny1) / 2, z0, zw, 2.6, 12, nave, null);
  mb.cone(nx1, (ny0 + ny1) / 2, zw, zw + 2.6, 2.8, 12, slateT);
  // the west front: the gabled wall with the rose window between the two spires
  const fy0 = ny0 - 0.4, fy1 = ny1 + 0.4;
  mb.box(L.x0 + 1.6, fy0 + 3.0, z0, nx0 + 0.1, fy1 - 3.0, zw + 2.0, { nx: front, py: S.limestone, ny: S.limestone });
  mb.gable(L.x0 + 1.6, fy0 + 3.0, nx0 + 0.1, fy1 - 3.0, zw + 2.0, zw + 4.2, 'x', slateT, spireTex);
  for (const [sy0, sy1] of [[fy0, fy0 + 3.0], [fy1 - 3.0, fy1]]) {
    mb.box(L.x0 + 1.2, sy0, z0, nx0 + 0.4, sy1, z0 + 13.5, sides(spireTex, { t: S.limeTop }), { mat: MAT.OFFICE });
    const scx = (L.x0 + 1.2 + nx0 + 0.4) / 2, scy = (sy0 + sy1) / 2;
    if (o.spires !== false) {
      mb.cone(scx, scy, z0 + 13.5, z0 + 22.5, 1.55, 8, spireTex, { angle: PI / 8 });
      markHeight(W, L.x0 + 1.2, sy0, nx0 + 0.4, sy1, z0 + 22.5);
    }
    for (const [ox, oy] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) mb.cone(scx + ox, scy + oy, z0 + 13.5, z0 + 15.4, 0.28, 6, spireTex);
  }
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  C.paintGround(L.x0, fy0 + 3.2, L.x0 + 1.6, fy1 - 3.2, 'stairsX');
  for (const [px, py] of [[L.x1 - 1.4, L.y0 + 1.6], [L.x1 - 1.4, L.y1 - 1.6], [L.x0 + 7, L.y0 + 1.6], [L.x0 + 7, L.y1 - 1.6]]) C.addTree(px, py, 'plane', true);
  W.lamps.push({ x: L.x0 + 0.5, y: (ny0 + ny1) / 2, z: z0 + 1, r: 5, color: [1, 0.92, 0.8], k: 0.5, kind: 'flood' });
  W.officeDoors.push({ x: L.x0 - 0.9, y: (ny0 + ny1) / 2, dx: L.x0 + 1.4, dy: (ny0 + ny1) / 2, kind: 'office' });
  landmark(C, o.name ?? "ST PATRICK'S CATHEDRAL", L.x1 + 1.2, (L.y0 + L.y1) / 2 + 4);
}

// ---------------------------------------------------------------------------------------------
// The United Nations by the East River: the Secretariat's green glass slab with white marble ends,
// the General Assembly's low hall with its dome, and the row of flags on First Avenue
export function unHQ(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const glass = tex(C, 'un_glass', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
      let c = shade(0x4a8a7a, 1.1 - (y / 48) * 0.25);
      if ((x + y) % 26 < 2 && y < 28) c = mixc(c, 0xb8e8d8, 0.5);
      p.set(x, y, c, winCode(0.5));
    }
    for (let x = 0; x < 32; x += 8) p.vline(x, 0, 48, 0xc8d0cc);
    p.rect(0, 42, 32, 6, 0x6a8a82);
  });
  const grille = tex(C, 'un_grille', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, y % 4 < 2 ? 0x2a3430 : 0x4a5650); });
  const marble = tex(C, 'un_marble', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0xf2f0ea, 0.95 + hash2i(x >> 1, y >> 3, 121) * 0.06)); });
  const x0 = L.x0 + 7.0, x1 = L.x0 + 11.2, y0 = L.y0 + 1.8, y1 = L.y0 + 12.6;
  let z = z0;
  for (const [h, t] of [[16, glass], [1.2, grille], [16, glass], [1.2, grille], [14, glass], [1.6, grille]]) {
    mb.box(x0, y0, z, x1, y1, z + h, { px: { t, mat: MAT.GLASS | MAT.OFFICE, seed: 241 }, nx: { t, mat: MAT.GLASS | MAT.OFFICE, seed: 241 }, py: marble, ny: marble });
    z += h;
  }
  mb.box(x0, y0, z, x1, y1, z + 0.1, { pz: { t: S.roofSilver } });
  markHeight(W, x0, y0, x1, y1, z);
  beacon(C, (x0 + x1) / 2, (y0 + y1) / 2, z + 0.2);
  // the conference building along the river and the General Assembly to the north
  mb.box(x1 + 1.2, y0, z0, L.x1 - 0.4, y1, z0 + 3.4, sides(marble, { t: S.roofTar }));
  markHeight(W, x1 + 1.2, y0, L.x1 - 0.4, y1, z0 + 3.4);
  const ga0 = L.x0 + 3.0, ga1 = L.x1 - 1.0, gy0 = y1 + 1.4, gy1 = L.y1 - 0.6;
  mb.box(ga0, gy0, z0, ga1, gy1, z0 + 4.6, sides(marble, { t: S.roofTar }));
  markHeight(W, ga0, gy0, ga1, gy1, z0 + 4.6);
  const gcx = (ga0 + ga1) / 2, gcy = (gy0 + gy1) / 2;
  mb.cylinder(gcx, gcy, z0 + 4.6, z0 + 5.2, 1.2, 16, marble, null);
  mb.cone(gcx, gcy, z0 + 5.2, z0 + 6.2, 1.3, 16, copperTex(C));
  // flags along First Avenue
  C.paintGround(L.x0, L.y0, x0 - 0.2, L.y1, 'plaza');
  let k = 0;
  for (let fy = L.y0 + 1.2; fy < L.y1 - 0.8; fy += 1.25, k++) flagPole(C, L.x0 + 0.9, fy, 3.6, k % 3 === 1 ? 'us' : 'hotel');
  office(C, L.x0 - 0.9, (y0 + y1) / 2, x0 + 0.2, (y0 + y1) / 2);
  landmark(C, 'UNITED NATIONS', L.x0 - 1.2, (L.y0 + L.y1) / 2 + 3);
}

// ---------------------------------------------------------------------------------------------
// Hudson Yards by the river: two glass towers, the observation deck jutting out of the taller one,
// and the Vessel, a copper honeycomb bowl of stairs, on the plaza between them
export function hudsonYards(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const glass = tex(C, 'hy_glass', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
      let c = shade(0x7a9cb4, 1.1 - (y / 48) * 0.28);
      if ((x + y) % 20 < 2 && y < 30) c = mixc(c, 0xe0f0f8, 0.55);
      p.set(x, y, c, winCode(0.5));
    }
    for (let x = 0; x < 32; x += 16) p.vline(x, 0, 48, 0xd8e0e6);
    p.rect(0, 45, 32, 3, 0xa8b8c4);
  });
  const vessel = tex(C, 'hy_vessel', 64, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      const u = (x % 16) - 8, v = (y % 16) - 8;
      const edge = Math.abs(Math.abs(u) - Math.abs(v)) < 2 || Math.abs(u) + Math.abs(v) > 13;
      p.set(x, y, edge ? shade(0xc87a4a, 0.9 + hash2i(x, y, 131) * 0.15) : 0x3a2418);
    }
  });
  // the taller tower with its deck, and a second tower
  const ax0 = L.x0 + 0.8, ax1 = L.x0 + 8.0, ay0 = L.y0 + 0.8, ay1 = L.y0 + 8.0;
  section(C, ax0, ay0, ax1, ay1, z0, z0 + 64, glass, S.roofSilver, { seed: 251, mat: MAT.GLASS | MAT.OFFICE });
  section(C, ax0 + 2.4, ay0, ax1, ay1, z0 + 64, z0 + 68, glass, S.roofSilver, { seed: 252, mat: MAT.GLASS | MAT.OFFICE });
  const deckT = flat(C, 'deck_grey', 0xa8b0b8);
  mb.box(ax1, ay0 + 2.4, z0 + 60, ax1 + 2.8, ay0 + 4.6, z0 + 60.35, sides(deckT, { t: deckT }));
  mb.vquad(ax1 + 2.8, ay0 + 4.6, ax1 + 2.8, ay0 + 2.4, z0 + 60.35, z0 + 60.9, tex(C, 'deck_glass', 8, 8, (p) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, 0xb8d8e8); }), { mat: MAT.FLAT });
  beacon(C, ax0 + 3, ay0 + 3, z0 + 68.2);
  section(C, L.x1 - 7.0, L.y1 - 8.0, L.x1 - 0.8, L.y1 - 0.8, z0, z0 + 50, glass, S.roofSilver, { seed: 253, mat: MAT.GLASS | MAT.OFFICE });
  office(C, (ax0 + ax1) / 2, L.y0 - 0.9, (ax0 + ax1) / 2, ay0 + 0.2);
  // the plaza and the Vessel
  C.paintGround(L.x0, ay1, L.x1 - 7.2, L.y1, 'plaza');
  C.paintGround(ax1, L.y0, L.x1, L.y1 - 8.2, 'plaza');
  const vx = L.x0 + 5.2, vy = L.y1 - 4.6;
  for (let k = 0; k < 7; k++) mb.cylinder(vx, vy, z0 + k * 1.0, z0 + (k + 1) * 1.0, 1.3 + k * 0.38, 16, vessel, null, { angle: k * 0.2 });
  W.solids.push([vx - 1.4, vy - 1.4, vx + 1.4, vy + 1.4, 7]);
  for (const [px, py] of [[L.x0 + 1.4, L.y1 - 1.4], [L.x1 - 8.4, ay1 + 1.6], [L.x1 - 1.4, L.y0 + 1.4]]) C.addTree(px, py, 'locust', true);
  W.lamps.push({ x: vx, y: vy + 2.4, z: z0 + 1, r: 4, color: [1, 0.85, 0.6], k: 0.5, kind: 'flood' });
  landmark(C, 'HUDSON YARDS', vx + 2, L.y1 + 1.2);
}

// ---------------------------------------------------------------------------------------------
// The 9/11 Memorial: two square pools where the towers stood, water falling on every side into a
// central void, the names on bronze parapets round them, a grove of oaks; the Oculus's white ribs
export function memorial(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const bronze = tex(C, 'mem_bronze', 32, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x3a3228, 0.95 + hash2i(x, y, 141) * 0.08));
    for (let y = 3; y < 13; y += 3) for (let x = 1; x < 31; x += 2) if (hash2i(x, y, 142) > 0.35) p.set(x, y, 0xe8d8a8, winCode(0.2, true));
  });
  const white = tex(C, 'oculus_white', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade(0xf4f4f0, 0.97 + hash2i(x, y, 143) * 0.04)); });
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  const pools = [[L.x0 + 4.6, L.y0 + 5.2], [L.x0 + 12.6, L.y0 + 12.6]];
  const H = 2.6;
  for (const [px, py] of pools) {
    // the pool: falling water round the edge, a still pool, the void in the middle
    C.paintWhere(px - H, py - H, px + H, py + H, () => true, 'falls');
    C.paintWhere(px - H + 0.7, py - H + 0.7, px + H - 0.7, py + H - 0.7, () => true, 'water');
    C.paintWhere(px - 0.8, py - 0.8, px + 0.8, py + 0.8, () => true, 'void');
    for (const [ax0, ay0, ax1, ay1] of [[px - H - 0.35, py - H - 0.35, px + H + 0.35, py - H], [px - H - 0.35, py + H, px + H + 0.35, py + H + 0.35], [px - H - 0.35, py - H, px - H, py + H], [px + H, py - H, px + H + 0.35, py + H]])
      mb.box(ax0, ay0, z0, ax1, ay1, z0 + 0.62, sides(bronze, { t: bronze }));
    W.solids.push([px - H - 0.35, py - H - 0.35, px + H + 0.35, py + H + 0.35, 0.62]);
    W.lamps.push({ x: px, y: py, z: z0 + 0.3, r: 3.6, color: [0.85, 0.92, 1.0], k: 0.5, kind: 'flood' });
  }
  // the grove
  for (let y = L.y0 + 1.2; y < L.y1 - 0.8; y += 2.4) for (let x = L.x0 + 1.2; x < L.x1 - 0.8; x += 2.4) {
    if (pools.some(([px, py]) => Math.abs(x - px) < H + 1.2 && Math.abs(y - py) < H + 1.2)) continue;
    if (x > L.x1 - 8.4 && y < L.y0 + 7.4) continue;
    C.addTree(x, y, 'oak', false, { scale: 0.85 });
  }
  // the Oculus: a white spine with ribs rising like wings
  const ox0 = L.x1 - 7.8, ox1 = L.x1 - 1.0, oy = L.y0 + 3.4;
  const glassT = tex(C, 'oculus_glass', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, x % 8 === 0 ? 0xe8eaec : 0x6a8aa0, winCode(0.1, true)); });
  mb.box(ox0 + 0.6, oy - 1.6, z0, ox1 - 0.6, oy + 1.6, z0 + 1.3, sides(glassT, { t: white }), { mat: MAT.GLASS });
  mb.box(ox0, oy - 0.25, z0 + 1.3, ox1, oy + 0.25, z0 + 1.8, sides(white, { t: white }));
  for (let k = 0; k <= 14; k++) {
    const x = ox0 + 0.2 + (k / 14) * (ox1 - ox0 - 0.4), e = Math.abs(k - 7) / 7;
    for (const sd of [-1, 1]) {
      beam(C, [x, oy + sd * 0.25, z0 + 1.6], [x + (k - 7) * 0.12, oy + sd * (2.9 - e * 0.8), z0 + 5.4 - e * 1.6], 0.06, white);
      beam(C, [x, oy + sd * 1.5, z0], [x, oy + sd * 0.3, z0 + 1.5], 0.05, white);
    }
  }
  markHeight(W, ox0, oy - 1.6, ox1, oy + 1.6, z0 + 1.8);
  office(C, (ox0 + ox1) / 2, L.y0 - 0.9, (ox0 + ox1) / 2, oy - 1.4);
  landmark(C, '9/11 MEMORIAL', (pools[0][0] + pools[1][0]) / 2, L.y1 + 1.2);
}

// ---------------------------------------------------------------------------------------------
// Battery Park at the southern tip: lawns and plane trees, Castle Clinton's round sandstone fort,
// the glass carousel pavilion, a promenade along the water and paths for strolling
export function batteryPark(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const sand = tex(C, 'castle_clinton', 32, 64, (p) => {
    stoneFill(p, 0, 0, 32, 64, [0xa8604a], 151, 8, { blocks: 16 });
    p.rect(12, 26, 8, 12, 0x2a1e18); p.rect(13, 27, 6, 10, 0x1a1210);
    p.rect(0, 0, 32, 4, 0xb87a62);
  });
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'grass');
  C.paintWhere(L.x0, L.y0, L.x1, L.y1, (x, y) => ((x - (L.x0 + 11)) / 5.5) ** 2 + ((y - (L.y0 + 6.5)) / 4) ** 2 < 1, 'lawn');
  // paths: a promenade along the south, a diagonal, a loop round the lawn
  const nodes = [], edges = [];
  const node = (x, y) => { const i = nodes.findIndex((n) => Math.abs(n.x - x) < 0.3 && Math.abs(n.y - y) < 0.3); if (i >= 0) return i; nodes.push({ x, y }); return nodes.length - 1; };
  const pathPts = [];
  const path = (pts, w) => {
    pathPts.push({ pts, w });
    let prev = null;
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2.4));
      for (let s = 0; s <= n; s++) { const id = node(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n); if (prev != null && prev !== id) edges.push([prev, id]); prev = id; }
    }
  };
  path([[L.x0 + 0.4, L.y1 - 1.6], [L.x1 - 0.4, L.y1 - 1.6]], 2.0);
  path([[L.x1 - 0.4, L.y0 + 0.6], [L.x0 + 11, L.y0 + 11.2], [L.x0 + 4.6, L.y1 - 1.6]], 1.6);
  path([[L.x0 + 0.4, L.y0 + 1.2], [L.x0 + 4.2, L.y0 + 6.5], [L.x0 + 11, L.y0 + 11.2]], 1.4);
  path([[L.x0 + 11, L.y0 + 0.6], [L.x0 + 17.2, L.y0 + 6.5], [L.x0 + 11, L.y0 + 11.2]], 1.4);
  for (const { pts, w } of pathPts) for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
    C.paintWhere(Math.min(ax, bx) - w, Math.min(ay, by) - w, Math.max(ax, bx) + w, Math.max(ay, by) + w, (x, y) => {
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - ax - dx * t, y - ay - dy * t) < w / 2 && x > L.x0 && x < L.x1 && y > L.y0 && y < L.y1;
    }, 'path');
  }
  // Castle Clinton
  const fx = L.x0 + 4.0, fy = L.y1 - 5.6, R = 3.0;
  C.paintWhere(fx - R, fy - R, fx + R, fy + R, (x, y) => Math.hypot(x - fx, y - fy) < R, 'gravel');
  const n = 24;
  for (let k = 0; k < n; k++) {
    if (k === 6) continue; // the gate, facing the path
    const a0 = (k / n) * 2 * PI, a1 = ((k + 1) / n) * 2 * PI;
    const p0 = [fx + Math.cos(a0) * R, fy + Math.sin(a0) * R], p1 = [fx + Math.cos(a1) * R, fy + Math.sin(a1) * R];
    const q0 = [fx + Math.cos(a0) * (R - 0.5), fy + Math.sin(a0) * (R - 0.5)], q1 = [fx + Math.cos(a1) * (R - 0.5), fy + Math.sin(a1) * (R - 0.5)];
    wall(C, p1, p0, z0, z0 + 2.0, sand, 0);
    wall(C, q0, q1, z0, z0 + 2.0, sand, 0);
    mb.quad([p0[0], p0[1], z0 + 2.0], [p1[0], p1[1], z0 + 2.0], [q1[0], q1[1], z0 + 2.0], [q0[0], q0[1], z0 + 2.0], [[0, 0], [8, 0], [8, 8], [0, 8]], sand, [0, 0, 1], MAT.SNOW);
    W.solids.push([Math.min(p0[0], p1[0], q0[0], q1[0]), Math.min(p0[1], p1[1], q0[1], q1[1]), Math.max(p0[0], p1[0], q0[0], q1[0]), Math.max(p0[1], p1[1], q0[1], q1[1]), 2.0]);
  }
  flagPole(C, fx, fy, 4.2, 'us');
  // the glass carousel
  const cx = L.x1 - 4.2, cy = L.y0 + 12.4;
  const glassT = tex(C, 'carousel_glass', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, x % 8 === 0 ? 0xdce4ea : 0x7aa0b8, winCode(0.05, true)); });
  mb.cylinder(cx, cy, z0, z0 + 1.6, 1.8, 16, glassT, null, { mat: MAT.GLASS });
  mb.cone(cx, cy, z0 + 1.6, z0 + 2.6, 2.2, 16, S.roofGreen ?? copperTex(C));
  W.solids.push([cx - 1.8, cy - 1.8, cx + 1.8, cy + 1.8, 1.6]);
  W.lamps.push({ x: cx, y: cy, z: z0 + 1.0, r: 3.0, color: [0.6, 0.8, 1.0], k: 0.6, kind: 'neon' });
  // trees, lamps and benches
  const trees = [];
  for (let y = L.y0 + 1.4; y < L.y1 - 3; y += 2.2) for (let x = L.x0 + 1.4; x < L.x1 - 1; x += 2.2) {
    const tx = x + (hash2i(Math.round(x * 10), Math.round(y * 10), 152) - 0.5), ty = y + (hash2i(Math.round(x * 10), Math.round(y * 10), 153) - 0.5);
    if (((tx - (L.x0 + 11)) / 6.2) ** 2 + ((ty - (L.y0 + 6.5)) / 4.6) ** 2 < 1 || Math.hypot(tx - fx, ty - fy) < R + 1.2 || Math.hypot(tx - cx, ty - cy) < 3) continue;
    if (pathPts.some(({ pts, w }) => pts.some((q, k) => k > 0 && distSeg(tx, ty, pts[k - 1], q) < w / 2 + 0.5))) continue;
    if (hash2i(Math.round(tx * 7), Math.round(ty * 7), 154) > 0.8) continue;
    C.addTree(tx, ty, (Math.round(tx + ty) % 3) ? 'plane' : 'elm', false); trees.push([tx, ty]);
  }
  for (let x = L.x0 + 2.5; x < L.x1 - 1; x += 4.5) { C.addBench(x, L.y1 - 0.45, 'x', -1); if (Math.round(x) % 2) parkLamp(C, x + 2.2, L.y1 - 0.4); }
  trashBasket(C, L.x0 + 11.6, L.y0 + 11.8);
  // its own walking net, joined to the sidewalks on its north and east sides and the waterfront
  W.extraNets.push({
    name: 'battery', rect: { x0: L.x0, y0: L.y0, x1: L.x1, y1: L.y1 }, nodes, edges,
    gates: [[L.x1 - 0.4, L.y0 + 0.6, L.x1 + 1, L.y0 + 0.6], [L.x0 + 11, L.y0 + 0.6, L.x0 + 11, L.y0 - 1], [L.x0 + 0.4, L.y0 + 1.2, L.x0 - 1, L.y0 + 1.2], [L.x1 - 0.4, L.y1 - 1.6, L.x1 + 1, L.y1 - 1.6], [L.x0 + 9, L.y1 - 1.6, L.x0 + 9, L.y1 + 1]]
      .map(([nx, ny, sx, sy]) => ({ node: node(nx, ny), sx, sy })),
  });
  landmark(C, 'BATTERY PARK', L.x0 + 9, L.y1 + 1.2);
}
const distSeg = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
};

// ---------------------------------------------------------------------------------------------
// The Brooklyn Bridge's Manhattan end: the great granite anchorage and the arched stone approach
// sloping down from it, with steps up to the promenade; a little park either side
export function bridgeApproach(C, L) {
  const S = sharedTex(C), mb = C.mb, z0 = C.z0, W = C.world;
  const yb = (L.y0 + L.y1) / 2, ZD = BRIDGE.ZD;
  const granite = tex(C, 'bb_granite', 64, 64, (p) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const row = y >> 3, off = row % 2 ? 8 : 0;
      let c = shade(mixc(0xb8a88c, 0xa89a80, hash2i((x + off) >> 4, row, 61)), 0.93 + hash2i(x, y, 62) * 0.1);
      if (y % 8 === 0 || (x + off) % 16 === 0) c = 0x8a7e68;
      p.set(x, y, c);
    }
  });
  const arches = tex(C, 'bb_arches', 64, 96, (p) => {
    for (let y = 0; y < 96; y++) for (let x = 0; x < 64; x++) {
      const row = y >> 3, off = row % 2 ? 8 : 0;
      let c = shade(mixc(0xb8a88c, 0xa89a80, hash2i((x + off) >> 4, row, 63)), 0.93 + hash2i(x, y, 64) * 0.1);
      if (y % 8 === 0 || (x + off) % 16 === 0) c = 0x8a7e68;
      p.set(x, y, c);
    }
    for (let y = 36; y < 96; y++) for (let x = 12; x < 52; x++) {
      const top = y < 56 ? Math.hypot(x - 31.5, y - 56) < 20 : true;
      if (top) p.set(x, y, y > 90 ? 0x3a342c : 0x2a2622);
    }
  });
  // the anchorage
  const ax0 = L.x1 - 7.6, ax1 = L.x1 - 0.2;
  mb.box(ax0, yb - 4.6, z0, ax1, yb + 4.6, ZD + 1.4, { px: arches, nx: arches, py: arches, ny: arches, pz: { t: S.concrete, world: true } });
  markHeight(W, ax0, yb - 4.6, ax1, yb + 4.6, ZD + 1.4);
  // the approach: a stone viaduct with arches, its deck rising from the west end to the anchorage
  const vx0 = L.x0 + 1.8, n = 6;
  for (let k = 0; k < n; k++) {
    const xa = vx0 + ((ax0 - vx0) * k) / n, xb = vx0 + ((ax0 - vx0) * (k + 1)) / n;
    const za = z0 + 1.6 + ((ZD - z0 - 1.6) * k) / n, zb2 = z0 + 1.6 + ((ZD - z0 - 1.6) * (k + 1)) / n;
    mb.box(xa, yb - 3.2, z0, xb, yb + 3.2, (za + zb2) / 2 - 0.2, { py: arches, ny: arches });
    mb.quad([xa, yb - 3.2, za], [xb, yb - 3.2, zb2], [xb, yb + 3.2, zb2], [xa, yb + 3.2, za], [[xa * T, (yb - 3.2) * T], [xb * T, (yb - 3.2) * T], [xb * T, (yb + 3.2) * T], [xa * T, (yb + 3.2) * T]], S.concrete, [0, 0, 1], MAT.SNOW | MAT.WET);
    for (const sy of [-1, 1]) mb.quad(sy > 0 ? [xb, yb + 3.2, zb2 + 0.5] : [xa, yb - 3.2, za + 0.5], sy > 0 ? [xa, yb + 3.2, za + 0.5] : [xb, yb - 3.2, zb2 + 0.5], sy > 0 ? [xa, yb + 3.2, za] : [xb, yb - 3.2, zb2], sy > 0 ? [xb, yb + 3.2, zb2] : [xa, yb - 3.2, za], [[0, 0], [(xb - xa) * T, 0], [(xb - xa) * T, 16], [0, 16]], granite, [0, sy, 0], 0);
    markHeight(W, xa, yb - 3.2, xb, yb + 3.2, (za + zb2) / 2);
  }
  // steps from the sidewalk up to the start of the viaduct
  C.paintGround(L.x0, yb - 1.2, vx0, yb + 1.2, 'stairsX');
  for (let k = 0; k < 4; k++) mb.box(L.x0 + 0.3 + k * 0.38, yb - 1.2, z0, vx0, yb + 1.2, z0 + 0.4 * (k + 1), { pz: { t: S.concrete }, nx: granite });
  // little parks either side, under the plane trees
  for (const [py0, py1] of [[L.y0, yb - 4.8], [yb + 4.8, L.y1]]) {
    C.paintGround(L.x0, py0, L.x1, py1, 'plaza');
    for (let x = L.x0 + 1.6; x < L.x1 - 1; x += 3.2) C.addTree(x, (py0 + py1) / 2, 'plane', true);
    for (let x = L.x0 + 3.2; x < L.x1 - 2; x += 6.4) C.addBench(x, py0 < yb ? py1 - 0.6 : py0 + 0.6, 'x', py0 < yb ? -1 : 1);
  }
}
