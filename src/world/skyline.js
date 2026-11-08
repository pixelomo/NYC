// Manhattan's skyline. Two parts:
// - towerBlock(): every ordinary high-rise block gets its own tower, generated from the block's seed
//   and where it stands. The district sets the height (the peaks in Midtown and the Financial
//   District, lower through Chelsea and the Village, mid-height uptown) and the era sets the look:
//   glass curtain walls in a range of tints and mullion patterns, mid-century slabs on plazas, art deco
//   wedding cakes with lit crowns, and pre-war limestone and brick office blocks. Footprints, setbacks,
//   podiums, twin towers and crowns (flat, mast, spire, pyramid, slanted, lantern) all vary.
// - the real towers, each in its own block: the Seagram Building and Lever House on Park Avenue,
//   Citigroup Center's slanted top, the Hearst Tower's diagrid, the New York Times Building, One
//   Vanderbilt, the MetLife Building (built over Grand Central in landmarks.js), 40 Wall Street,
//   70 Pine Street, 8 Spruce Street and 56 Leonard Street's stacked boxes.

import { T, CURB, AVENUE_NAMES, STREET_NAMES, OR } from './layout.js';
import { MAT } from './mesh.js';
import { winCode } from '../core/painter.js';
import { shade, mixc, hash2i } from '../core/math.js';
import { PAL, stoneFill, brickFill, drawWindow } from './facades.js';
import { sharedTex, markHeight, waterTower } from './buildings.js';
import { section, beacon } from './towers.js';
import { propTex } from './props.js';
import { landmark, wall } from './landmarks.js';

const PI = Math.PI;
const CROWN = 254; // texel code for the coloured crown lights at night
const sides = (t, top) => (top ? { px: t, nx: t, py: t, ny: t, pz: top } : { px: t, nx: t, py: t, ny: t });

// ---- facade modules (one storey, tiled) ------------------------------------------------------------
export const GLASS = { blue: 0x3e7ea3, teal: 0x3a8a8c, green: 0x4a8a6a, silver: 0x8aa2b4, dark: 0x2c3a4a, bronze: 0x6a5a48, sky: 0x6aa6cc, smoke: 0x5a6670 };
const STONE = { lime: 0xdccfb2, buff: 0xd6c09a, grey: 0xb4b0a8, granite: 0xc49e8e, white: 0xece8e0, brown: 0x9a7a62, black: 0x34343a };
export function glassModule(C, tint, pat) {
  return C.atlas.shared(`sk_g_${tint.toString(16)}_${pat}`, 32, 48, (p) => {
    const hi = mixc(tint, 0xe8f4fa, 0.55), mull = mixc(tint, 0xd0d8de, 0.6), mullD = shade(tint, 0.6);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
      let c = shade(tint, 1.14 - (y / 48) * 0.3);
      if ((x + y) % 22 < 2 && y < 30) c = mixc(c, hi, 0.55);
      p.set(x, y, c, winCode(0.5));
    }
    if (pat === 'grid') { for (let y = 40; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, y === 40 ? mull : shade(tint, 0.72)); p.vline(0, 0, 48, mull); p.vline(16, 0, 40, mullD); }
    else if (pat === 'fins') { for (let x = 0; x < 32; x += 8) { p.vline(x, 0, 48, mull); p.vline(x + 1, 0, 48, mullD); } p.hline(0, 47, 32, mullD); }
    else if (pat === 'band') { for (let y = 28; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(mull, 0.95 + hash2i(x, y, 701) * 0.06)); p.hline(0, 28, 32, shade(mull, 1.1)); }
    else { p.hline(0, 47, 32, mullD); p.vline(0, 0, 48, mullD); } // flush: a smooth skin
  });
}
export function stoneModule(C, color, pat) {
  return C.atlas.shared(`sk_s_${color.toString(16)}_${pat}`, 32, 48, (p) => {
    if (pat === 'brick') brickFill(p, 0, 0, 32, 48, [color, shade(color, 0.94), shade(color, 1.05)], 711);
    else stoneFill(p, 0, 0, 32, 48, [color], 712, 12, { blocks: 32 });
    if (pat === 'piers') {
      // deco: tall piers, windows recessed between them over dark spandrels
      for (let y = 0; y < 48; y++) for (let x = 7; x < 25; x++) p.set(x, y, y < 32 ? shade(0x2e3e52, 1.1 - y / 80) : shade(color, 0.55), y < 32 ? winCode(0.5) : 255);
      p.vline(7, 0, 48, shade(color, 0.7)); p.vline(24, 0, 48, shade(color, 1.1));
      for (let y = 34; y < 46; y += 4) p.hline(9, y, 14, shade(color, 0.7));
    } else if (pat === 'ribbon') {
      for (let y = 8; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x2e3e52, 1.12 - (y - 8) / 50), winCode(0.5));
      for (let x = 0; x < 32; x += 8) p.vline(x, 8, 24, shade(color, 0.8));
    } else {
      const wall0 = color;
      for (const wx of [5, 19]) drawWindow(p, wx, 12, 8, 26, { frame: pat === 'brick' ? 0xf2efe6 : 0x2b2b30, lintel: shade(color, 1.08), sill: shade(color, 1.06), t: 0.5, panes: '1/1', wall: wall0 }, C.rng);
    }
  });
}
// a lobby storey: big glass shopfronts between piers, or stone with bronze doors
export function lobbyModule(C, color, glass) {
  return C.atlas.shared(`sk_lobby_${color.toString(16)}_${glass ? 1 : 0}`, 32, 80, (p) => {
    for (let y = 0; y < 80; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(color, 0.95 + hash2i(x, y, 721) * 0.06));
    p.rect(0, 0, 32, 8, shade(color, 1.08)); p.hline(0, 8, 32, shade(color, 0.7));
    p.rect(4, 18, 24, 62, glass ? 0x5a7e98 : 0x3a3022, winCode(glass ? 0.03 : 0.08));
    for (let y = 20; y < 80; y++) for (let x = 6; x < 26; x++) p.set(x, y, shade(glass ? 0x6a8ea8 : 0x40576d, 1.1 - (y - 20) / 120), winCode(0.04));
    p.vline(16, 20, 60, glass ? 0xc8d4dc : 0x8a6a3a);
    if (!glass) p.rect(4, 18, 24, 2, 0xc8a24a);
  });
}
export const crownTex = (C, color) => C.atlas.shared(`sk_crown_${color.toString(16)}`, 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(color, 0.95 + hash2i(x, y, 731) * 0.06));
  for (let x = 2; x < 32; x += 6) { p.rect(x, 4, 3, 24, 0xf4f0e6, CROWN); p.vline(x + 2, 4, 24, 0xd8d0c0, CROWN); }
  p.hline(0, 1, 32, 0xf4f0e6, CROWN);
});
export const copperTex = (C) => C.atlas.shared('copper', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let c = shade(x % 8 === 0 ? 0x4f9a86 : x % 8 === 1 ? 0x7cc8b0 : 0x6cb8a0, 0.92 + hash2i(x, y, 4) * 0.12);
    if (hash2i(x >> 1, y >> 2, 7) > 0.86) c = mixc(c, 0x8ad8c0, 0.4);
    p.set(x, y, c);
  }
});
const metalTex = (C) => sharedTex(C).metal;

// a frustum: the four sides sloping in from (x0..x1, y0..y1) at z0 to an inset i at z1
export function frustum(C, x0, y0, x1, y1, z0, z1, i, tex) {
  const mb = C.mb;
  mb.slope([x0, y1, z0], [x1, y1, z0], [x0 + i, y1 - i, z1], [x1 - i, y1 - i, z1], tex);
  mb.slope([x1, y0, z0], [x0, y0, z0], [x1 - i, y0 + i, z1], [x0 + i, y0 + i, z1], tex);
  mb.slope([x1, y1, z0], [x1, y0, z0], [x1 - i, y1 - i, z1], [x1 - i, y0 + i, z1], tex);
  mb.slope([x0, y0, z0], [x0, y1, z0], [x0 + i, y0 + i, z1], [x0 + i, y1 - i, z1], tex);
}
// a vertical prism over a convex polygon (points in order of increasing angle), with a flat top
export function prism(C, pts, z0, z1, tex, top, mat = MAT.OFFICE, seed = 0) {
  const mb = C.mb, n = pts.length;
  const cx = pts.reduce((s, q) => s + q[0], 0) / n, cy = pts.reduce((s, q) => s + q[1], 0) / n;
  mb.body(() => {
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % n];
      wall(C, b, a, z0, z1, tex, mat, seed);
      if (top) mb.tri([cx, cy, z1], [a[0], a[1], z1], [b[0], b[1], z1], [[cx * T, cy * T], [a[0] * T, a[1] * T], [b[0] * T, b[1] * T]], top, [0, 0, 1], MAT.SNOW | MAT.WET);
    }
  });
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  markHeight(C.world, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), z1);
}
// a rectangle with its corners cut off by c, as prism points
export const chamfered = (x0, y0, x1, y1, c) => [[x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c], [x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c]].reverse();
// a street-number sign on a face, for the lobby
function addressSign(C, x0, x1, y, z, text) {
  const t = C.atlas.alloc(Math.max(48, text.length * 4 + 10), 10);
  t.p.rect(0, 0, t.w, 10, 0x1b1b1b, 255);
  t.p.text7(5, 2, text, 0xf2d27a, winCode(0.02, true));
  const w = t.w / T, cx = (x0 + x1) / 2;
  C.mb.vquad(cx - w / 2, y + 0.03, cx + w / 2, y + 0.03, z, z + 10 / T, t, { mat: MAT.FLAT | MAT.NOSHADOW });
}

// ---- the generic tower ---------------------------------------------------------------------------
const district = (bx, by) => (by <= OR(16) ? 'upper' : by <= OR(21) ? 'mid' : by <= OR(26) ? 'low' : 'down') + (bx <= 3 ? '-west' : '');
const HEIGHT = {
  mid: { glass: [44, 74], modern: [30, 48], deco: [42, 66], office: [24, 38] },
  down: { glass: [36, 60], modern: [30, 44], deco: [44, 62], office: [24, 40] },
  low: { glass: [16, 28], modern: [14, 24], deco: [22, 34], office: [14, 22] },
  upper: { glass: [20, 36], modern: [18, 28], deco: [24, 36], office: [14, 22] },
};
export function towerBlock(C, L, bx, by, kind) {
  const rng = C.rng, S = sharedTex(C), mb = C.mb, W = C.world, z0 = C.z0;
  const d = district(bx, by), base = d.split('-')[0];
  let [h0, h1] = HEIGHT[base][kind];
  if (d.endsWith('-west')) { h0 *= 0.75; h1 *= 0.8; }
  const H = rng.range(h0, h1);
  const street = STREET_NAMES[by + 1] || '', ave = AVENUE_NAMES[bx] || '';
  const num = kind === 'glass' || kind === 'modern' ? `${rng.int(1, 9) * 100 + rng.pick([0, 0, 5, 10, 50])} ${ave}` : `${rng.int(1, 160)} ${street}`;
  const lot = { x0: L.x0 + 0.5, y0: L.y0 + 0.5, x1: L.x1 - 0.5, y1: L.y1 - 0.5 };
  // a plaza under everything; the tower and its podium go on top
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  let fp; // the tower's footprint
  if (kind === 'glass') {
    const tint = rng.pick(Object.values(GLASS)), pat = rng.pick(['grid', 'fins', 'band', 'flush', 'grid']);
    const face = glassModule(C, tint, pat), lobby = lobbyModule(C, mixc(tint, 0xd0d8de, 0.6), true);
    const form = rng.pick(['prism', 'podium', 'twin', 'step', 'prism', 'chamfer']);
    const w = rng.range(9, 13.5), dd = rng.range(9, 13.5);
    const x0 = lot.x0 + rng.range(0, lot.x1 - lot.x0 - w), y0 = lot.y0 + rng.range(0, lot.y1 - lot.y0 - dd);
    fp = { x0, y0, x1: x0 + w, y1: y0 + dd };
    let zb = z0;
    if (form === 'podium' || form === 'twin') {
      zb = z0 + rng.range(4, 8);
      section(C, lot.x0, lot.y0, lot.x1, lot.y1, z0, zb, glassModule(C, mixc(tint, 0x9aa8b4, 0.5), 'band'), S.roofGravel, { mat: MAT.GLASS | MAT.OFFICE, seed: rng.int(1, 250) });
    } else section(C, fp.x0, fp.y0, fp.x1, fp.y1, z0, z0 + 2.5, lobby, null, { mat: MAT.GLASS | MAT.OFFICE }), (zb = z0 + 2.5);
    const top = z0 + H;
    if (form === 'twin') {
      const a = { x0: lot.x0 + 0.6, y0: lot.y0 + 0.6, x1: lot.x0 + 7.4, y1: lot.y1 - 6 }, b = { x0: lot.x1 - 7.4, y0: lot.y0 + 5, x1: lot.x1 - 0.6, y1: lot.y1 - 0.6 };
      for (const [r, hh] of [[a, top], [b, z0 + H * rng.range(0.75, 0.92)]]) { section(C, r.x0, r.y0, r.x1, r.y1, zb, hh, face, S.roofSilver, { mat: MAT.GLASS | MAT.OFFICE, seed: rng.int(1, 250) }); crown(C, r, hh, rng.pick(['flat', 'mast', 'slant']), tint); }
      fp = a;
    } else if (form === 'step') {
      const z1 = zb + (top - zb) * rng.range(0.55, 0.7), i = rng.range(1.2, 2.2);
      section(C, fp.x0, fp.y0, fp.x1, fp.y1, zb, z1, face, S.roofSilver, { mat: MAT.GLASS | MAT.OFFICE, seed: rng.int(1, 250) });
      const r = { x0: fp.x0 + i, y0: fp.y0 + i, x1: fp.x1 - (rng.chance(0.5) ? i : 0), y1: fp.y1 - i };
      section(C, r.x0, r.y0, r.x1, r.y1, z1, top, face, S.roofSilver, { mat: MAT.GLASS | MAT.OFFICE, seed: rng.int(1, 250) });
      crown(C, r, top, rng.pick(['flat', 'mast', 'spire']), tint);
    } else if (form === 'chamfer') {
      prism(C, chamfered(fp.x0, fp.y0, fp.x1, fp.y1, rng.range(1.4, 2.6)), zb, top, face, S.roofSilver, MAT.GLASS | MAT.OFFICE, rng.int(1, 250));
      crown(C, { x0: fp.x0 + 2, y0: fp.y0 + 2, x1: fp.x1 - 2, y1: fp.y1 - 2 }, top, rng.pick(['flat', 'mast']), tint);
    } else {
      section(C, fp.x0, fp.y0, fp.x1, fp.y1, zb, top, face, S.roofSilver, { mat: MAT.GLASS | MAT.OFFICE, seed: rng.int(1, 250) });
      crown(C, fp, top, rng.pick(['flat', 'mast', 'slant', 'lantern', 'flat']), tint);
    }
  } else if (kind === 'modern') {
    // mid-century: a slab on a plaza, its long face to the avenue, pools or planters in front
    const color = rng.pick([STONE.white, STONE.black, 0x6a5a48, STONE.grey, 0x4a5a6a]);
    const face = rng.chance(0.5) ? stoneModule(C, color, 'ribbon') : glassModule(C, color === STONE.white ? GLASS.silver : mixc(color, 0x3a4a5a, 0.5), rng.pick(['grid', 'fins']));
    const along = rng.chance(0.5), w = along ? rng.range(13, 16.5) : rng.range(6, 8), dd = along ? rng.range(6, 8) : rng.range(13, 16.5);
    const x0 = lot.x0 + rng.range(0, lot.x1 - lot.x0 - w), y0 = lot.y0 + rng.range(0, Math.max(0, lot.y1 - lot.y0 - dd - 4));
    fp = { x0, y0, x1: x0 + w, y1: y0 + dd };
    const lobby = lobbyModule(C, color, true);
    section(C, fp.x0 + 0.6, fp.y0 + 0.6, fp.x1 - 0.6, fp.y1 - 0.6, z0, z0 + 2.5, lobby, null, { mat: MAT.GLASS | MAT.OFFICE });
    section(C, fp.x0, fp.y0, fp.x1, fp.y1, z0 + 2.5, z0 + H, face, S.roofGravel, { mat: MAT.GLASS | MAT.OFFICE, seed: rng.int(1, 250) });
    crown(C, fp, z0 + H, 'flat', color);
    // the plaza in front: two pools, or planters and trees
    const py0 = fp.y1 + 1, py1 = lot.y1 - 0.5;
    if (py1 - py0 > 3) {
      if (rng.chance(0.5)) for (const fx of [lot.x0 + (lot.x1 - lot.x0) * 0.28, lot.x0 + (lot.x1 - lot.x0) * 0.72]) C.fountainPool(fx, (py0 + py1) / 2, 3.2, Math.min(2.6, py1 - py0 - 0.6));
      else for (let x = lot.x0 + 2; x < lot.x1 - 1; x += 3.5) C.addTree(x, (py0 + py1) / 2, rng.pick(['locust', 'plane']), true);
    }
  } else if (kind === 'deco') {
    // art deco: a wedding cake of setbacks, stone piers, a crown lit at night
    const color = rng.pick([STONE.lime, STONE.buff, STONE.grey, STONE.white, STONE.brown, STONE.granite]);
    const face = stoneModule(C, color, 'piers');
    const lobby = lobbyModule(C, shade(color, 0.92), false);
    fp = { ...lot };
    const tiers = rng.int(3, 5), top = z0 + H;
    let r = { ...lot }, z = z0 + 2.5;
    section(C, r.x0, r.y0, r.x1, r.y1, z0, z, lobby, null, { mat: MAT.OFFICE });
    const zs = [];
    for (let k = 0; k < tiers; k++) zs.push(z0 + 2.5 + (top - z0 - 2.5) * (k === tiers - 1 ? 1 : (0.35 + 0.65 * (k + 1) / tiers) * rng.range(0.85, 1)));
    zs.sort((a, b) => a - b);
    for (let k = 0; k < tiers; k++) {
      section(C, r.x0, r.y0, r.x1, r.y1, z, zs[k], face, S.roofTar, { mat: MAT.OFFICE, seed: rng.int(1, 250) });
      z = zs[k];
      const ix = rng.range(1.2, 2.4), iy = rng.range(1.2, 2.4);
      if (k < tiers - 1) r = { x0: r.x0 + ix, y0: r.y0 + iy, x1: r.x1 - ix, y1: r.y1 - iy };
    }
    fp = r;
    crown(C, r, top, rng.pick(['deco', 'spire', 'pyramid', 'deco']), color);
  } else {
    // pre-war office: a block filling the lot, a setback or two, a water tower or a copper roof
    const color = rng.pick([STONE.lime, STONE.buff, STONE.grey, PAL.brickTan[0], PAL.brickBrown[0], PAL.brickRed[0]]);
    const brick = color === PAL.brickTan[0] || color === PAL.brickBrown[0] || color === PAL.brickRed[0];
    const face = stoneModule(C, color, brick ? 'brick' : 'punched');
    const lobby = lobbyModule(C, brick ? STONE.lime : shade(color, 0.92), false);
    const cut = rng.chance(0.4) ? rng.range(4, 7) : 0; // an air shaft / light court on one side
    fp = { x0: lot.x0, y0: lot.y0, x1: lot.x1 - (rng.chance(0.5) ? cut : 0), y1: lot.y1 };
    const z1 = z0 + H * rng.range(0.7, 0.85);
    section(C, fp.x0, fp.y0, fp.x1, fp.y1, z0, z0 + 2.5, lobby, null, { mat: MAT.OFFICE });
    section(C, fp.x0, fp.y0, fp.x1, fp.y1, z0 + 2.5, z1, face, S.roofTar, { mat: MAT.OFFICE, seed: rng.int(1, 250) });
    mb.box(fp.x0 - 0.15, fp.y0 - 0.15, z1, fp.x1 + 0.15, fp.y1 + 0.15, z1 + 0.3, sides(S.limestone, { t: S.limeTop }));
    const r = { x0: fp.x0 + 2, y0: fp.y0 + 2, x1: fp.x1 - 2, y1: fp.y1 - 2 };
    section(C, r.x0, r.y0, r.x1, r.y1, z1 + 0.3, z0 + H, face, S.roofTar, { mat: MAT.OFFICE, seed: rng.int(1, 250) });
    if (rng.chance(0.4)) crown(C, r, z0 + H, 'pyramid', color);
    else { crown(C, r, z0 + H, 'flat', color); waterTower(C, r.x0 + 2, r.y0 + 2, z0 + H, 0.9); }
    if (cut) waterTower(C, fp.x0 + 3, fp.y0 + 3, z1 + 0.3, 0.85);
  }
  addressSign(C, fp.x0, fp.x1, fp.y1, z0 + 2.55, num);
  W.officeDoors.push({ x: (fp.x0 + fp.x1) / 2, y: Math.min(L.y1 + 0.9, fp.y1 + 0.9), dx: (fp.x0 + fp.x1) / 2, dy: fp.y1 - 0.2, kind: 'office' });
  void PI; void propTex;
}

// the top of a tower over rectangle r at height z
export function crown(C, r, z, style, color) {
  const mb = C.mb, S = sharedTex(C), W = C.world, rng = C.rng;
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, w = r.x1 - r.x0, d = r.y1 - r.y0;
  if (style === 'flat' || style === 'mast') {
    // a mechanical penthouse with louvres
    const i = Math.min(w, d) * 0.22;
    const louv = C.atlas.shared('louver', 24, 24, (p) => {
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) p.set(x, y, y % 4 === 0 ? 0x4a5f6c : y % 4 === 1 ? 0x6a8392 : 0x8ca3b2);
      p.vline(0, 0, 24, 0xb8c8d2); p.vline(1, 0, 24, 0x9ab0be);
    });
    mb.box(r.x0 + i, r.y0 + i, z, r.x1 - i, r.y1 - i, z + 2.2, sides(louv, { t: S.roofSilver }));
    markHeight(W, r.x0 + i, r.y0 + i, r.x1 - i, r.y1 - i, z + 2.2);
    if (style === 'mast') { mb.box(cx - 0.08, cy - 0.08, z + 2.2, cx + 0.08, cy + 0.08, z + 2.2 + rng.range(5, 10), sides(metalTex(C))); beacon(C, cx, cy, z + 9); }
  } else if (style === 'slant') {
    // a roof sloping down to the south
    const h = Math.min(8, d * 0.6), face = glassModule(C, typeof color === 'number' ? color : GLASS.silver, 'flush');
    mb.slope([r.x0, r.y1, z], [r.x1, r.y1, z], [r.x0, r.y0, z + h], [r.x1, r.y0, z + h], face);
    mb.vquad(r.x1, r.y0, r.x0, r.y0, z, z + h, face);
    mb.tri([r.x0, r.y0, z], [r.x0, r.y0, z + h], [r.x0, r.y1, z], [[0, h * T], [0, 0], [d * T, h * T]], face, [-1, 0, 0], 0);
    mb.tri([r.x1, r.y1, z], [r.x1, r.y0, z + h], [r.x1, r.y0, z], [[0, h * T], [d * T, 0], [d * T, h * T]], face, [1, 0, 0], 0);
    markHeight(W, r.x0, r.y0, r.x1, r.y0 + d / 2, z + h);
  } else if (style === 'lantern') {
    const g = glassModule(C, GLASS.sky, 'fins');
    mb.box(r.x0 + 1, r.y0 + 1, z, r.x1 - 1, r.y1 - 1, z + 3.0, sides(g, { t: S.roofSilver }), { mat: MAT.GLASS });
    mb.box(r.x0 + 0.6, r.y0 + 0.6, z + 3.0, r.x1 - 0.6, r.y1 - 0.6, z + 3.4, sides(metalTex(C), { t: metalTex(C) }));
    W.lamps.push({ x: cx, y: cy, z: z + 1.5, r: 4, color: [0.8, 0.9, 1], k: 0.4, kind: 'flood' });
  } else if (style === 'spire') {
    let rr = { ...r }, zz = z;
    for (let k = 0; k < 3; k++) {
      const i = Math.min(rr.x1 - rr.x0, rr.y1 - rr.y0) * 0.2;
      rr = { x0: rr.x0 + i, y0: rr.y0 + i, x1: rr.x1 - i, y1: rr.y1 - i };
      mb.box(rr.x0, rr.y0, zz, rr.x1, rr.y1, zz + 2, sides(crownTex(C, typeof color === 'number' ? color : STONE.lime), { t: S.roofTar }));
      zz += 2;
    }
    mb.cone(cx, cy, zz, zz + rng.range(6, 11), Math.min(rr.x1 - rr.x0, rr.y1 - rr.y0) * 0.35, 8, metalTex(C));
    markHeight(W, rr.x0, rr.y0, rr.x1, rr.y1, zz);
    beacon(C, cx, cy, zz + 6);
  } else if (style === 'pyramid') {
    const t = rng.chance(0.6) ? copperTex(C) : S.slate ?? S.roofTar;
    mb.pyramid(r.x0, r.y0, r.x1, r.y1, z, z + Math.min(w, d) * rng.range(0.45, 0.7), t, { mat: MAT.SNOW });
    markHeight(W, r.x0 + w * 0.25, r.y0 + d * 0.25, r.x1 - w * 0.25, r.y1 - d * 0.25, z + Math.min(w, d) * 0.3);
  } else {
    // deco crown: stepped tiers banded with lights
    const ct = crownTex(C, color);
    let rr = { ...r }, zz = z;
    for (let k = 0; k < 3; k++) {
      const i = Math.min(rr.x1 - rr.x0, rr.y1 - rr.y0) * 0.16;
      rr = { x0: rr.x0 + i, y0: rr.y0 + i, x1: rr.x1 - i, y1: rr.y1 - i };
      mb.box(rr.x0, rr.y0, zz, rr.x1, rr.y1, zz + 1.6, sides(ct, { t: S.roofTar }), { mat: MAT.OFFICE });
      zz += 1.6;
    }
    markHeight(W, rr.x0, rr.y0, rr.x1, rr.y1, zz);
    mb.box(cx - 0.08, cy - 0.08, zz, cx + 0.08, cy + 0.08, zz + 3, sides(metalTex(C)));
    beacon(C, cx, cy, zz + 3);
  }
}

// ---- the real towers -------------------------------------------------------------------------------
const fill = (C, L) => C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
const door = (C, x, y, dx, dy) => C.world.officeDoors.push({ x, y, dx, dy, kind: 'office' });

// The Seagram Building (bronze and dark glass, set back behind its plaza and two pools on Park
// Avenue) and, beside it, Lever House (a blue-green glass slab over a one-storey podium on pilotis)
export function seagramLever(C, L) {
  const mb = C.mb, S = sharedTex(C), W = C.world, z0 = C.z0;
  fill(C, L);
  const bronze = C.atlas.shared('seagram', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x5a4430, 1.08 - (y / 48) * 0.25), winCode(0.5));
    for (const bx of [0, 8, 16, 24]) { p.vline(bx, 0, 48, 0xa8844e); p.vline(bx + 1, 0, 48, 0x6a5232); }
    for (let y = 40; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, y === 40 ? 0x8a6a42 : 0x3a2c20);
  });
  const lever = C.atlas.shared('lever', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x3a8a8a, 1.1 - (y / 48) * 0.25), winCode(0.5));
    for (let y = 30; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x2a5a5e, 0.95 + hash2i(x, y, 741) * 0.05));
    for (let x = 0; x < 32; x += 8) p.vline(x, 0, 48, 0xc8d4dc);
    p.hline(0, 30, 32, 0xc8d4dc);
  });
  // Seagram: plaza and pools on the avenue (west), the tower behind, its bustle at the back
  const tx0 = L.x0 + 6.0, tx1 = L.x0 + 11.0, ty0 = L.y0 + 4.0, ty1 = L.y1 - 4.0;
  for (const fy of [L.y0 + 4.5, L.y1 - 4.5]) C.fountainPool(L.x0 + 3.0, fy, 2.6, 3.6);
  section(C, tx0, ty0, tx1, ty1, z0, z0 + 2.5, lobbyModule(C, 0x6a5232, true), null, { mat: MAT.GLASS | MAT.OFFICE });
  section(C, tx0, ty0, tx1, ty1, z0 + 2.5, z0 + 34, bronze, S.roofTar, { mat: MAT.GLASS | MAT.OFFICE, seed: 211 });
  section(C, tx0 + 0.4, ty0 + 0.4, tx1 - 0.4, ty1 - 0.4, z0 + 34, z0 + 36, bronze, S.roofTar, { mat: MAT.GLASS | MAT.OFFICE, seed: 212 });
  section(C, tx1, ty0 + 1.5, tx1 + 1.6, ty1 - 1.5, z0, z0 + 10, bronze, S.roofTar, { mat: MAT.GLASS | MAT.OFFICE, seed: 213 });
  door(C, L.x0 - 0.9, (ty0 + ty1) / 2, tx0 + 0.2, (ty0 + ty1) / 2);
  landmark(C, 'SEAGRAM BUILDING', L.x0 - 1.5, L.y1 + 2, 3);
  // Lever House: the podium raised on columns, the slab rising from its north end
  const lx0 = L.x1 - 6.0, lx1 = L.x1 - 0.5, white = C.atlas.shared('lever_sp', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade(0xd8e4e4, 0.96 + hash2i(x, y, 742) * 0.06)); });
  for (let y = L.y0 + 1; y < L.y1 - 0.5; y += 2.4) for (const x of [lx0 + 0.4, lx1 - 0.4]) mb.box(x - 0.12, y - 0.12, z0, x + 0.12, y + 0.12, z0 + 1.6, sides(S.metal));
  mb.box(lx0, L.y0 + 0.5, z0 + 1.6, lx1, L.y1 - 0.5, z0 + 3.0, { ...sides(lever), pz: { t: S.roofGravel } }, { mat: MAT.GLASS | MAT.OFFICE });
  section(C, lx0 + 1.2, L.y0 + 1.0, lx1 - 0.6, L.y0 + 9.5, z0 + 3.0, z0 + 22, lever, white, { mat: MAT.GLASS | MAT.OFFICE, seed: 214 });
  markHeight(W, lx0, L.y0 + 0.5, lx1, L.y1 - 0.5, z0 + 3.0);
  C.paintGround(lx0, L.y0 + 10, lx1, L.y1 - 1, 'lawn');
  landmark(C, 'LEVER HOUSE', L.x1 + 1.5, L.y1 + 2, 0);
}

// Citigroup Center: a silver tower banded with windows, standing on four columns at the middles of its
// sides, its top sliced off at 45 degrees; the little church tucked under one corner
export function citigroup(C, L) {
  const mb = C.mb, S = sharedTex(C), W = C.world, z0 = C.z0;
  fill(C, L);
  const alu = C.atlas.shared('citi', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0xc8ccd0, 0.97 + hash2i(x, y, 751) * 0.04));
    for (let y = 18; y < 40; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x34485c, 1.1 - (y - 18) / 50), winCode(0.5));
    p.hline(0, 17, 32, 0xe8ecf0); p.hline(0, 40, 32, 0x9aa0a6);
  });
  const x0 = L.x0 + 4, x1 = L.x0 + 14, y0 = L.y0 + 4, y1 = L.y0 + 14, zb = z0 + 6, zt = z0 + 48, h = 10;
  for (const [cx, cy] of [[(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1], [x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]]) mb.box(cx - 0.9, cy - 0.9, z0, cx + 0.9, cy + 0.9, zb, sides(S.concrete, { t: S.concrete }));
  mb.box(x0, y0, zb - 0.3, x1, y1, zb, { nz: S.concrete, pz: { t: S.concrete } });
  section(C, x0, y0, x1, y1, zb, zt, alu, null, { mat: MAT.GLASS | MAT.OFFICE, seed: 221 });
  mb.slope([x0, y1, zt], [x1, y1, zt], [x0, y0, zt + h], [x1, y0, zt + h], alu);
  mb.vquad(x1, y0, x0, y0, zt, zt + h, alu);
  mb.tri([x0, y0, zt], [x0, y0, zt + h], [x0, y1, zt], [[0, h * T], [0, 0], [10 * T, h * T]], alu, [-1, 0, 0], 0);
  mb.tri([x1, y1, zt], [x1, y0, zt + h], [x1, y0, zt], [[0, h * T], [10 * T, 0], [10 * T, h * T]], alu, [1, 0, 0], 0);
  markHeight(W, x0, y0, x1, y1, zt);
  markHeight(W, x0, y0, x1, y0 + 5, zt + h / 2);
  // St Peter's Church at the corner, and the sunken plaza
  mb.box(L.x0 + 0.6, L.y1 - 6.5, z0, L.x0 + 6.5, L.y1 - 0.6, z0 + 3.2, sides(S.greystone, { t: S.roofTar }));
  mb.pyramid(L.x0 + 0.6, L.y1 - 6.5, L.x0 + 6.5, L.y1 - 0.6, z0 + 3.2, z0 + 4.6, S.slate ?? S.roofTar);
  W.solids.push([L.x0 + 0.6, L.y1 - 6.5, L.x0 + 6.5, L.y1 - 0.6, 3.2]);
  door(C, (x0 + x1) / 2, L.y1 + 0.9, (x0 + x1) / 2, y1 + 0.5);
  landmark(C, 'CITIGROUP CENTER', (x0 + x1) / 2, L.y1 + 3, 0);
}

// The Hearst Tower: a glass tower in a steel diagrid rising out of the old six-storey stone base
export function hearst(C, L) {
  const S = sharedTex(C), z0 = C.z0;
  fill(C, L);
  const baseT = C.atlas.shared('hearst_base', 32, 48, (p) => {
    stoneFill(p, 0, 0, 32, 48, [0xd8ccb4], 761, 12, { blocks: 32 });
    for (const wx of [6, 20]) { p.rect(wx, 10, 6, 28, 0x2a3440, winCode(0.4)); p.rect(wx - 2, 8, 10, 2, 0xe6dcc6); }
  });
  const dia = C.atlas.shared('hearst_dia', 64, 192, (p) => {
    for (let y = 0; y < 192; y++) for (let x = 0; x < 64; x++) p.set(x, y, shade(0x5a86a4, 1.08 - ((y % 48) / 48) * 0.2), winCode(0.5));
    for (let y = 0; y < 192; y += 12) p.hline(0, y, 64, 0x8aa8bc);
    for (let k = 0; k < 192; k++) for (let w = 0; w < 3; w++) {
      const x1 = Math.round((k / 192) * 64) + w, x2 = 63 - Math.round((k / 192) * 64) + w;
      if (x1 < 64) p.set(x1, k, 0xd8dee4); if (x2 >= 0 && x2 < 64) p.set(x2, k, 0xb8c0c8);
    }
  });
  section(C, L.x0 + 0.5, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0, z0 + 8, baseT, S.roofGravel, { mat: MAT.OFFICE, seed: 231 });
  prism(C, chamfered(L.x0 + 3.5, L.y0 + 3.5, L.x1 - 3.5, L.y1 - 3.5, 1.2), z0 + 8, z0 + 42, dia, S.roofSilver, MAT.GLASS | MAT.OFFICE, 232);
  door(C, (L.x0 + L.x1) / 2, L.y1 + 0.9, (L.x0 + L.x1) / 2, L.y1 - 0.6);
  landmark(C, 'HEARST TOWER', (L.x0 + L.x1) / 2, L.y1 + 3, 0);
}

// The New York Times Building: a glass tower veiled in white ceramic rods, the masthead over the
// door, a mast rising from the roof
export function nytimes(C, L) {
  const mb = C.mb, S = sharedTex(C), z0 = C.z0;
  fill(C, L);
  const rods = C.atlas.shared('nyt_rods', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x6a8aa0, 1.05 - y / 120), winCode(0.5));
    for (let y = 1; y < 48; y += 3) p.hline(0, y, 32, 0xeeeae2);
    p.vline(0, 0, 48, 0xd8d4cc);
  });
  const x0 = L.x0 + 3.5, x1 = L.x1 - 3.5, y0 = L.y0 + 2.5, y1 = L.y1 - 5;
  section(C, L.x0 + 1, y0, L.x1 - 1, L.y1 - 1, z0, z0 + 4, glassModule(C, GLASS.silver, 'grid'), S.roofGravel, { mat: MAT.GLASS | MAT.OFFICE, seed: 241 });
  prism(C, chamfered(x0, y0, x1, y1, 0.9), z0 + 4, z0 + 50, rods, S.roofSilver, MAT.GLASS | MAT.OFFICE, 242);
  mb.box((x0 + x1) / 2 - 0.1, (y0 + y1) / 2 - 0.1, z0 + 50, (x0 + x1) / 2 + 0.1, (y0 + y1) / 2 + 0.1, z0 + 68, sides(metalTex(C)));
  beacon(C, (x0 + x1) / 2, (y0 + y1) / 2, z0 + 68);
  const t = C.atlas.alloc(112, 12);
  t.p.rect(0, 0, 112, 12, 0xf2efe6, 255);
  t.p.text7(5, 3, 'THE NEW YORK TIMES', 0x1b1b1b, winCode(0.02, true));
  mb.vquad((x0 + x1) / 2 - 1.75, L.y1 - 0.97, (x0 + x1) / 2 + 1.75, L.y1 - 0.97, z0 + 4.2, z0 + 4.2 + 12 / T, t, { mat: MAT.FLAT });
  door(C, (x0 + x1) / 2, L.y1 + 0.9, (x0 + x1) / 2, L.y1 - 1.2);
  landmark(C, 'NEW YORK TIMES BUILDING', (x0 + x1) / 2, L.y1 + 3, 0);
}

// One Vanderbilt: a tower of terracotta-trimmed glass tapering in four steps, the angled faces
// between them, an open crown and a spire
export function vanderbilt(C, L) {
  const mb = C.mb, S = sharedTex(C), W = C.world, z0 = C.z0;
  fill(C, L);
  const glass = C.atlas.shared('vanderbilt', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x5a7e94, 1.1 - (y / 48) * 0.25), winCode(0.5));
    for (let x = 0; x < 32; x += 8) { p.vline(x, 0, 48, 0xd8c8b4); p.vline(x + 1, 0, 48, 0xb8a48e); }
    p.rect(0, 0, 32, 3, 0xc8a88a);
  });
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  const tiers = [[7.2, z0, z0 + 30], [6.4, z0 + 31.5, z0 + 54], [5.4, z0 + 55.5, z0 + 72], [4.4, z0 + 73.2, z0 + 80]];
  tiers.forEach(([h, za, zb], k) => {
    section(C, cx - h, cy - h, cx + h, cy + h, za, zb, k === 3 ? glassModule(C, GLASS.sky, 'fins') : glass, k === 3 ? null : S.roofSilver, { mat: MAT.GLASS | MAT.OFFICE, seed: 251 + k });
    const next = tiers[k + 1];
    if (next) frustum(C, cx - h, cy - h, cx + h, cy + h, zb, next[1], h - next[0], glass);
  });
  mb.box(cx - 0.12, cy - 0.12, z0 + 80, cx + 0.12, cy + 0.12, z0 + 92, sides(metalTex(C)));
  markHeight(W, cx - 4.4, cy - 4.4, cx + 4.4, cy + 4.4, z0 + 80);
  beacon(C, cx, cy, z0 + 92);
  W.lamps.push({ x: cx, y: cy, z: z0 + 78, r: 5, color: [0.9, 0.95, 1], k: 0.5, kind: 'flood' });
  door(C, cx, L.y1 + 0.9, cx, cy + 7);
  landmark(C, 'ONE VANDERBILT', cx, L.y1 + 3, 0);
}

// 40 Wall Street: a limestone shaft rising in setbacks to a green copper pyramid with dormers and a
// spire
export function fortyWall(C, L) {
  const mb = C.mb, S = sharedTex(C), W = C.world, z0 = C.z0;
  fill(C, L);
  const face = stoneModule(C, 0xd8ccb2, 'piers'), lob = lobbyModule(C, 0xc8bca0, false);
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  section(C, L.x0 + 0.5, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0, z0 + 2.5, lob, null, { mat: MAT.OFFICE });
  section(C, L.x0 + 0.5, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0 + 2.5, z0 + 18, face, S.roofTar, { mat: MAT.OFFICE, seed: 261 });
  section(C, cx - 5.5, cy - 5.5, cx + 5.5, cy + 5.5, z0 + 18, z0 + 42, face, S.roofTar, { mat: MAT.OFFICE, seed: 262 });
  section(C, cx - 4.2, cy - 4.2, cx + 4.2, cy + 4.2, z0 + 42, z0 + 48, face, S.roofTar, { mat: MAT.OFFICE, seed: 263 });
  const cop = C.atlas.shared('fw_pyr', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(x % 4 === 0 ? 0x4f9a86 : 0x6cb8a0, 0.92 + hash2i(x, y, 771) * 0.1));
    for (const dx of [6, 20]) { p.rect(dx, 14, 5, 7, 0x2a3440, winCode(0.4, true)); p.rect(dx - 1, 12, 7, 2, 0x8ad8c0); }
  });
  mb.pyramid(cx - 4.2, cy - 4.2, cx + 4.2, cy + 4.2, z0 + 48, z0 + 56, cop);
  mb.box(cx - 0.12, cy - 0.12, z0 + 55, cx + 0.12, cy + 0.12, z0 + 63, sides(metalTex(C)));
  markHeight(W, cx - 2, cy - 2, cx + 2, cy + 2, z0 + 55);
  beacon(C, cx, cy, z0 + 63);
  door(C, cx, L.y1 + 0.9, cx, L.y1 - 0.6);
  landmark(C, '40 WALL STREET', cx, L.y1 + 3, 0);
}

// 70 Pine Street: brick and limestone stepping back again and again to a glass lantern and a spire
export function seventyPine(C, L) {
  const mb = C.mb, S = sharedTex(C), W = C.world, z0 = C.z0;
  fill(C, L);
  const face = stoneModule(C, 0xc8a888, 'piers'), lob = lobbyModule(C, 0xd8ccb4, false);
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  const tiers = [[7.5, 6.5, 2.5, 26], [6.0, 5.0, 26, 40], [4.5, 3.8, 40, 49], [3.2, 2.8, 49, 55], [2.2, 2.0, 55, 58.5]];
  section(C, cx - 7.5, cy - 6.5, cx + 7.5, cy + 6.5, z0, z0 + 2.5, lob, null, { mat: MAT.OFFICE });
  tiers.forEach(([hx, hy, za, zb], k) => section(C, cx - hx, cy - hy, cx + hx, cy + hy, z0 + za, z0 + zb, k === 4 ? crownTex(C, 0xc8a888) : face, S.roofTar, { mat: MAT.OFFICE, seed: 271 + k }));
  const lan = glassModule(C, GLASS.sky, 'fins');
  mb.box(cx - 1.2, cy - 1.2, z0 + 58.5, cx + 1.2, cy + 1.2, z0 + 61, sides(lan, { t: metalTex(C) }), { mat: MAT.GLASS });
  mb.cone(cx, cy, z0 + 61, z0 + 66, 0.8, 8, metalTex(C));
  W.lamps.push({ x: cx, y: cy, z: z0 + 60, r: 4, color: [0.9, 0.95, 1], k: 0.5, kind: 'flood' });
  beacon(C, cx, cy, z0 + 66);
  door(C, cx, L.y1 + 0.9, cx, cy + 6.3);
  landmark(C, '70 PINE STREET', cx, L.y1 + 3, 0);
}

// 8 Spruce Street: a school in a brick base, the stainless steel tower above rippling like
// draped cloth, its top stepping down to the east
export function eightSpruce(C, L) {
  const S = sharedTex(C), z0 = C.z0;
  fill(C, L);
  const ripple = C.atlas.shared('spruce', 64, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) {
      const wv = Math.sin((x + Math.sin(y * 0.13) * 6) * 0.35);
      p.set(x, y, wv > 0.55 ? 0xe8ecf0 : wv < -0.6 ? 0x8a929a : shade(0x5a7088, 1.05 - (y % 48) / 120), wv > -0.6 && wv <= 0.55 ? winCode(0.5) : 255);
    }
  });
  const brick = stoneModule(C, PAL.brickRed[0], 'brick');
  section(C, L.x0 + 0.5, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0, z0 + 6, brick, S.roofGravel, { mat: MAT.OFFICE, seed: 281 });
  const y0 = L.y0 + 4, y1 = L.y0 + 12.5, x0 = L.x0 + 3;
  for (const [a, b, h] of [[0, 4, 58], [4, 7, 55], [7, 9.5, 51], [9.5, 12, 47]]) section(C, x0 + a, y0, x0 + b, y1, z0 + 6, z0 + h, ripple, S.roofSilver, { mat: MAT.GLASS | MAT.OFFICE, seed: 282 });
  door(C, (L.x0 + L.x1) / 2, L.y1 + 0.9, (L.x0 + L.x1) / 2, L.y1 - 0.6);
  landmark(C, '8 SPRUCE STREET', x0 + 6, L.y1 + 3, 0);
}

// 56 Leonard Street: glass boxes stacked off-kilter, each one or two storeys, cantilevering out on
// every side, with white slab edges
export function leonard(C, L) {
  const mb = C.mb, S = sharedTex(C), W = C.world, z0 = C.z0, rng = C.rng;
  fill(C, L);
  const g = glassModule(C, GLASS.smoke, 'flush');
  const slab = C.atlas.shared('leonard_slab', 8, 8, (p) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, 0xeeeeea); });
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  section(C, cx - 5, cy - 5, cx + 5, cy + 5, z0, z0 + 8, g, S.roofSilver, { mat: MAT.GLASS | MAT.OFFICE, seed: 291 });
  let z = z0 + 8;
  while (z < z0 + 52) {
    const h = rng.chance(0.5) ? 1.5 : 3.0, sh = z > z0 + 44 ? 0.7 : 1;
    const hx = rng.range(3.6, 5.6) * sh, hy = rng.range(3.6, 5.6) * sh, ox = rng.range(-1.3, 1.3), oy = rng.range(-1.3, 1.3);
    mb.body(() => mb.box(cx + ox - hx, cy + oy - hy, z, cx + ox + hx, cy + oy + hy, z + h - 0.12, { ...sides({ t: g, mat: MAT.GLASS | MAT.OFFICE, seed: 292 }) }));
    mb.box(cx + ox - hx - 0.06, cy + oy - hy - 0.06, z + h - 0.12, cx + ox + hx + 0.06, cy + oy + hy + 0.06, z + h, sides(slab, { t: slab }));
    markHeight(W, cx + ox - hx, cy + oy - hy, cx + ox + hx, cy + oy + hy, z + h);
    z += h;
  }
  door(C, cx, L.y1 + 0.9, cx, cy + 5.2);
  landmark(C, '56 LEONARD STREET', cx, L.y1 + 3, 0);
}

// The MetLife Building over Grand Central: a broad slab with bevelled long sides, its name across
// the top (called from grandCentral, in place of a plain slab)
export function metlife(C, x0, y0, x1, y1, z0, H) {
  const mb = C.mb, S = sharedTex(C), W = C.world;
  const face = C.atlas.shared('metlife', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0xb8b4aa, 0.96 + hash2i(x, y, 781) * 0.05));
    for (let x = 2; x < 32; x += 6) p.rect(x, 0, 3, 40, 0x2e3e52, winCode(0.5));
    p.rect(0, 40, 32, 8, 0x9a968c);
  });
  const c = Math.min(2.2, (y1 - y0) * 0.3);
  prism(C, [[x1, y0 + c], [x1, y1 - c], [x1 - c * 1.6, y1], [x0 + c * 1.6, y1], [x0, y1 - c], [x0, y0 + c], [x0 + c * 1.6, y0], [x1 - c * 1.6, y0]].reverse(), z0, z0 + H, face, S.roofSilver, MAT.OFFICE, 159);
  const t = C.atlas.alloc(96, 20);
  t.p.rect(0, 0, 96, 20, 0, 0);
  t.p.text7(6, 3, 'METLIFE', 0xf4f8ff, winCode(0.0, true), 2);
  const cx = (x0 + x1) / 2, w = 96 / T;
  mb.vquad(cx - w / 2, y1 + 0.04, cx + w / 2, y1 + 0.04, z0 + H - 2.2, z0 + H - 2.2 + 20 / T, t, { mat: MAT.FLAT | MAT.NOSHADOW });
  mb.vquad(cx + w / 2, y0 - 0.04, cx - w / 2, y0 - 0.04, z0 + H - 2.2, z0 + H - 2.2 + 20 / T, t, { mat: MAT.FLAT | MAT.NOSHADOW });
  crown(C, { x0: x0 + 3, y0: y0 + 1, x1: x1 - 3, y1: y1 - 1 }, z0 + H, 'flat');
  landmark(C, 'METLIFE BUILDING', cx, y0 - 3, 0);
  void W;
}
