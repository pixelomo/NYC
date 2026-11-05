// Low/mid-rise building generators: brownstones, walk-up tenements, lofts, firehouse + rooftop clutter.

import { T, CURB, MAP } from './layout.js';
import { MAT, GRP } from './mesh.js';
import { winCode, textWidth } from '../core/painter.js';
import { shade, mixc, hash2i } from '../core/math.js';
import {
  PAL, brickFill, stoneFill, smoothFill, rustication, drawWindow, drawDoor, corniceBand, drawShopfront, drawGate,
  roofFill, railingTex, ladderTex, plankTex, grilleTex, awningTex, billboardArt, signBoard, graffiti, glassDay,
} from './facades.js';

const dirKey = (x, y) => (x > 0.5 ? 'px' : x < -0.5 ? 'nx' : y > 0.5 ? 'py' : 'ny');

// Local frame on a block side. a: along the facade (left->right seen from the street), d: depth into the lot.
export class Frame {
  constructor(px, py, nx, ny, z0 = CURB) {
    this.px = px; this.py = py; this.nx = nx; this.ny = ny;
    this.ux = ny; this.uy = -nx;
    this.z0 = z0;
    this.keys = {
      front: dirKey(nx, ny), back: dirKey(-nx, -ny), left: dirKey(-this.ux, -this.uy), right: dirKey(this.ux, this.uy),
    };
  }
  pt(a, d) {
    return [this.px + a * this.ux - d * this.nx, this.py + a * this.uy - d * this.ny];
  }
  aabb(a0, a1, d0, d1) {
    const p = this.pt(a0, d0), q = this.pt(a1, d1);
    return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
  }
  box(mb, a0, a1, d0, d1, z0, z1, faces, opt) {
    const [x0, y0, x1, y1] = this.aabb(a0, a1, d0, d1);
    const f = {};
    if (faces.front) f[this.keys.front] = faces.front;
    if (faces.back) f[this.keys.back] = faces.back;
    if (faces.left) f[this.keys.left] = faces.left;
    if (faces.right) f[this.keys.right] = faces.right;
    if (faces.top) f.pz = faces.top;
    mb.box(x0, y0, z0, x1, y1, z1, f, opt);
    return [x0, y0, x1, y1];
  }
  // vertical quad parallel to the facade at depth d, spanning a0..a1, z0..z1 (texture reads from the street)
  facadeQuad(mb, a0, a1, d, z0, z1, tex, opt = {}) {
    const p = this.pt(a0, d), q = this.pt(a1, d);
    mb.vquad(p[0], p[1], q[0], q[1], z0, z1, tex, { ...opt, n: [this.nx, this.ny, 0] });
  }
  // vertical quad perpendicular to the facade at position a, from depth d0 to d1
  sideQuad(mb, a, d0, d1, z0, z1, tex, opt = {}) {
    const p = this.pt(a, d0), q = this.pt(a, d1);
    mb.vquad(p[0], p[1], q[0], q[1], z0, z1, tex, opt);
  }
  // world normal of the facade
  get n() { return [this.nx, this.ny]; }
}

export function markHeight(world, x0, y0, x1, y1, h) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(MAP, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(MAP, Math.ceil(x1)); x++) {
      const i = y * MAP + x;
      if (world.heights[i] < h) world.heights[i] = h;
    }
}

function region(C, w, h, paint) {
  const r = C.atlas.alloc(w, h);
  paint(r.p, r);
  return r;
}

// Shared tiled textures
export function sharedTex(C) {
  if (C._shared) return C._shared;
  const A = C.atlas;
  const S = {};
  const brickTile = (name, pal, seed) => A.shared(name, 64, 64, (p) => brickFill(p, 0, 0, 64, 64, pal, seed));
  S.brickRed = brickTile('b_red', PAL.brickRed, 3);
  S.brickBrown = brickTile('b_brown', PAL.brickBrown, 4);
  S.brickOrange = brickTile('b_orange', PAL.brickOrange, 5);
  S.brickTan = brickTile('b_tan', PAL.brickTan, 6);
  S.brickPurple = brickTile('b_purple', PAL.brickPurple, 8);
  S.brownstone = A.shared('s_brown', 64, 64, (p) => stoneFill(p, 0, 0, 64, 64, PAL.brownstone, 9, 6));
  S.limestone = A.shared('s_lime', 64, 64, (p) => stoneFill(p, 0, 0, 64, 64, PAL.limestone, 10, 8, { blocks: 16 }));
  S.greystone = A.shared('s_grey', 64, 64, (p) => stoneFill(p, 0, 0, 64, 64, PAL.greystone, 11, 8, { blocks: 16 }));
  S.concrete = A.shared('concrete', 64, 64, (p) => smoothFill(p, 0, 0, 64, 64, 0xb9b6ae, 12, 0.05));
  S.darkMetal = A.shared('darkmetal', 16, 16, (p) => smoothFill(p, 0, 0, 16, 16, 0x2a2b30, 13, 0.06));
  S.metal = A.shared('metal', 16, 16, (p) => smoothFill(p, 0, 0, 16, 16, 0x8d9097, 14, 0.05));
  S.blackIron = A.shared('iron', 8, 8, (p) => p.rect(0, 0, 8, 8, 0x1e1e22));
  S.roofSilver = A.shared('r_silver', 64, 64, (p) => roofFill(p, 64, 64, 'silver', C.rng));
  S.roofTar = A.shared('r_tar', 64, 64, (p) => roofFill(p, 64, 64, 'tar', C.rng));
  S.roofGravel = A.shared('r_gravel', 64, 64, (p) => roofFill(p, 64, 64, 'gravel', C.rng));
  S.roofDeck = A.shared('r_deck', 64, 64, (p) => roofFill(p, 64, 64, 'deck', C.rng));
  S.roofGreen = A.shared('r_green', 64, 64, (p) => roofFill(p, 64, 64, 'green', C.rng));
  S.railing = A.shared('railing', 48, 9, (p) => railingTex(p, 48, 9, 0x1e1e22, 2));
  S.railingTall = A.shared('railing_t', 48, 12, (p) => railingTex(p, 48, 12, 0x1e1e22, 3));
  S.fescRail = A.shared('fesc_rail', 48, 10, (p) => {
    p.clear();
    p.rect(0, 0, 48, 1, 0x1a1a1e);
    p.rect(0, 4, 48, 1, 0x1a1a1e);
    for (let x = 0; x < 48; x += 2) p.rect(x, 0, 1, 10, 0x1a1a1e);
  });
  S.ladder = A.shared('ladder', 6, 12, (p) => ladderTex(p, 6, 12));
  S.fstair = A.shared('fstair', 32, 4, (p) => {
    p.clear();
    p.rect(0, 0, 32, 1, 0x1a1a1e);
    p.rect(0, 3, 32, 1, 0x1a1a1e);
    for (let x = 0; x < 32; x += 2) p.rect(x, 1, 1, 2, 0x2a2a30);
  });
  S.stairs = A.shared('fesc_stairs', 10, 32, (p) => {
    p.clear();
    p.rect(0, 0, 1, 32, 0x1a1a1e);
    p.rect(9, 0, 1, 32, 0x1a1a1e);
    for (let y = 1; y < 32; y += 2) p.rect(0, y, 10, 1, 0x26262b);
  });
  S.grate = A.shared('grate', 16, 16, (p) => {
    p.clear();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x % 2 === 0 || y % 2 === 0) p.set(x, y, 0x1a1a1e);
  });
  S.hvac = A.shared('hvac', 32, 16, (p) => grilleTex(p, 32, 16, 0xa9aba6));
  S.hvacTop = A.shared('hvac_top', 32, 32, (p) => {
    smoothFill(p, 0, 0, 32, 32, 0xb4b6b1, 15, 0.04);
    p.ellipse(10, 16, 7, 7, 0x3a3b40);
    p.ellipse(10, 16, 5, 5, 0x55565c);
    p.rect(9, 10, 2, 12, 0x2a2b30);
    p.rect(4, 15, 12, 2, 0x2a2b30);
  });
  S.tank = A.shared('tank', 64, 32, (p) => plankTex(p, 64, 32, 0x8a6a48));
  S.tankDark = A.shared('tank2', 64, 32, (p) => plankTex(p, 64, 32, 0x6a5038));
  S.tankRoof = A.shared('tank_roof', 64, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) p.set(x, y, shade(0x4a4c52, 0.9 + hash2i(x, y, 3) * 0.15));
  });
  S.wood = A.shared('wood', 32, 16, (p) => plankTex(p, 32, 16, 0x9a6a44, false));
  S.fenceWood = A.shared('fence_w', 32, 16, (p) => {
    plankTex(p, 32, 16, 0x8a5e3c, false);
    for (let x = 0; x < 32; x += 4) p.set(x, 0, 0, 0);
  });
  S.chimney = A.shared('chimney', 16, 16, (p) => brickFill(p, 0, 0, 16, 16, PAL.brickRed, 19));
  S.chimneyTop = A.shared('chimney_top', 8, 8, (p) => { p.rect(0, 0, 8, 8, 0x8a8a88); p.rect(2, 2, 4, 4, 0x1e1e20); });
  S.skylight = A.shared('skylight', 16, 16, (p) => {
    p.rect(0, 0, 16, 16, 0x9a9da3);
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) p.set(x, y, (x + y) % 6 < 2 ? 0x9cc4dd : 0x4b6f8f);
  });
  S.glassBlue = A.shared('glass_b', 16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x + y) % 9 < 2 ? 0x8cb4d4 : 0x3d6385, winCode(0.5));
  });
  S.stoneStep = A.shared('step', 32, 8, (p) => {
    stoneFill(p, 0, 0, 32, 8, PAL.brownstone, 21, 0);
    p.rect(0, 0, 32, 1, shade(PAL.brownstone[0], 1.2));
  });
  S.stoneStepTop = A.shared('step_top', 32, 32, (p) => stoneFill(p, 0, 0, 32, 32, [0x8f6250], 22, 0));
  S.limeStep = A.shared('lstep', 32, 8, (p) => { stoneFill(p, 0, 0, 32, 8, PAL.limestone, 23, 0); p.rect(0, 0, 32, 1, 0xf0e6d0); });
  S.limeTop = A.shared('ltop', 32, 32, (p) => stoneFill(p, 0, 0, 32, 32, [0xe2d6ba], 24, 0));
  S.acUnit = A.shared('ac', 8, 6, (p) => {
    p.rect(0, 0, 8, 6, 0xe0dcd0);
    for (let y = 1; y < 5; y += 2) p.rect(1, y, 6, 1, 0xa8a49a);
    p.frame(0, 0, 8, 6, 0xb8b4a8);
  });
  S.acTop = A.shared('ac_top', 8, 8, (p) => p.rect(0, 0, 8, 8, 0xd4d0c4));
  S.flowerBox = A.shared('fbox', 16, 4, (p) => {
    p.rect(0, 0, 16, 4, 0x6b4a32);
    for (let x = 0; x < 16; x++) {
      p.set(x, 0, [0xe84a5f, 0xf2c230, 0x58ac43, 0xe58fb5, 0x58ac43][(x * 7) % 5]);
    }
  });
  S.flowerTop = A.shared('ftop', 16, 8, (p) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) p.set(x, y, [0x58ac43, 0x3f8a35, 0xe84a5f, 0xf2c230, 0x58ac43, 0xe58fb5][Math.floor(hash2i(x, y, 4) * 6)]);
  });
  S.xmasLights = A.shared('xmas', 32, 3, (p) => {
    p.clear();
    const cols = [0xff3040, 0x40ff60, 0x4080ff, 0xffd040, 0xff60e0];
    for (let x = 0; x < 32; x++) p.set(x, 1, 0x1e2a1e, 255);
    for (let x = 1; x < 32; x += 3) p.set(x, 2, cols[(x / 3) % 5 | 0], winCode(0.01, true));
  });
  S.lightsWarm = A.shared('warmlights', 32, 3, (p) => {
    p.clear();
    for (let x = 0; x < 32; x++) p.set(x, 0, 0x2a2a2a, 255);
    for (let x = 1; x < 32; x += 4) p.set(x, 1, 0xffd890, winCode(0.01, true));
  });
  S.wreath = A.shared('wreath', 8, 8, (p) => {
    p.clear();
    p.ring(4, 4, 4, 4, 1.6, 0x2f7a3a);
    p.set(2, 2, 0xd8302c); p.set(5, 5, 0xd8302c); p.set(5, 2, 0xffd040);
    p.rect(3, 6, 2, 2, 0xd8302c);
  });
  S.pumpkin = A.shared('pumpkin', 8, 6, (p) => {
    p.rect(0, 1, 8, 5, 0xe87a1a);
    p.rect(1, 0, 6, 6, 0xf08a22);
    p.set(3, 0, 0x3f8a35);
    p.set(2, 2, 0xffd040, winCode(0.01, true)); p.set(5, 2, 0xffd040, winCode(0.01, true));
    p.rect(2, 4, 4, 1, 0xffd040, winCode(0.01, true));
  });
  S.pumpkinTop = A.shared('pumpkin_t', 8, 8, (p) => { p.rect(0, 0, 8, 8, 0xf08a22); p.set(3, 3, 0x3f8a35); p.set(4, 4, 0x3f8a35); });
  S.trashCan = A.shared('trash', 12, 10, (p) => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) p.set(x, y, x % 3 === 0 ? 0x3e5040 : 0x56705a);
    p.rect(0, 0, 12, 1, 0x7a947e);
  });
  S.trashTop = A.shared('trash_t', 8, 8, (p) => { p.rect(0, 0, 8, 8, 0x4a604c); p.rect(2, 2, 4, 4, 0x2a3a2c); });
  C._shared = S;
  return S;
}

// ---------------------------------------------------------------------------
// Brownstone / rowhouse
// ---------------------------------------------------------------------------
export function rowhouse(C, fr, a0, W, D, o = {}) {
  const { mb, rng } = C;
  const S = sharedTex(C);
  const sb = o.setback ?? 1.5;
  const nF = o.floors ?? 3;
  const gardenH = 1.25, floorH = 1.5, band = 0.5;
  const H = gardenH + nF * floorH + band;
  const z0 = fr.z0;
  const tw = Math.round(W * T), th = Math.round(H * T);
  const style = o.style ?? rng.pick(['brownstone', 'brownstone', 'brick', 'limestone', 'painted', 'brick']);
  const wallPal = style === 'brownstone' ? PAL.brownstone : style === 'limestone' ? PAL.limestone
    : style === 'painted' ? [rng.pick([0xe8dcc0, 0xa8c4d4, 0xa8d4b8, 0xe2a8a0, 0xd8c8e0, 0xf0d890])]
    : rng.pick([PAL.brickRed, PAL.brickBrown, PAL.brickOrange, PAL.brickPurple]);
  const trim = style === 'brownstone' ? shade(PAL.brownstone[0], 1.18) : style === 'limestone' ? 0xf0e6cc : 0xe2d6ba;
  const frame = style === 'limestone' ? rng.pick([0x2b2b30, 0x2f4a3a, 0x5c3b2a]) : rng.pick(PAL.frames);
  const corniceC = rng.pick([0x3a2a22, 0x2b2b30, 0x2f4a3a, 0x6a4a3a, 0xe8e2d0, 0x5a1f1f]);
  const doorSide = o.doorSide ?? (rng.chance(0.5) ? 'L' : 'R');
  const nb = Math.max(2, Math.floor(tw / 16));
  const bayW = tw / nb;
  const doorBay = doorSide === 'L' ? 0 : nb - 1;
  const windows = [];
  const floorT = [];
  for (let f = 0; f < nF + 1; f++) floorT.push(rng.next());
  const curtainC = rng.pick(PAL.curtains);

  const front = region(C, tw, th, (p) => {
    // wall
    if (style === 'brownstone') stoneFill(p, 0, 0, tw, th, wallPal, rng.int(1, 999), 6);
    else if (style === 'limestone') stoneFill(p, 0, 0, tw, th, wallPal, rng.int(1, 999), 8, { blocks: 16 });
    else if (style === 'painted') smoothFill(p, 0, 0, tw, th, wallPal[0], 3, 0.04);
    else brickFill(p, 0, 0, tw, th, wallPal, rng.int(1, 999));
    // garden level rustication
    const gy = Math.round((band + nF * floorH) * T);
    rustication(p, 0, gy, tw, th - gy, style === 'brick' ? PAL.brownstone[0] : shade(wallPal[0], 0.92), 3);
    // frieze band
    corniceBand(p, 0, 0, tw, 8, shade(corniceC, 1.0));
    // floors (top to bottom)
    for (let f = 0; f < nF; f++) {
      const fy = Math.round((band + f * floorH) * T);
      const parlor = f === nF - 1;
      const wh = parlor ? 17 : 13;
      const wy = fy + (parlor ? 4 : 6);
      for (let b = 0; b < nb; b++) {
        const cx = Math.round(bayW * b + bayW / 2);
        if (parlor && b === doorBay) {
          // door with hood
          const dw = 9, dh = 20;
          const dx = cx - 4;
          const dy = fy + 24 - dh;
          p.rect(dx - 2, dy - 3, dw + 4, 3, trim);
          p.hline(dx - 2, dy - 1, dw + 4, shade(trim, 0.75));
          p.rect(dx - 1, dy, 1, dh, shade(trim, 0.9));
          p.rect(dx + dw, dy, 1, dh, shade(trim, 0.9));
          drawDoor(p, dx, dy, dw, dh, { color: rng.pick([0x5c3b2a, 0x2b2b30, 0x7a1f1f, 0x2f4a3a, 0x1f3a5f, 0x8a5a2a]), t: floorT[f] * 0.5, number: o.number, glass: rng.chance(0.3) });
          windows.push({ x: dx, y: dy, w: dw, h: dh, f, door: true });
          continue;
        }
        const ww = 8;
        const wx = cx - 4;
        const t = floorT[f] * 0.6 + rng.next() * 0.4;
        const det = rng.next();
        drawWindow(p, wx, wy, ww, wh, {
          frame, lintel: trim, sill: trim, t, keystone: style !== 'painted' && rng.chance(0.4),
          curtain: det < 0.35 ? curtainC : null, blinds: det >= 0.35 && det < 0.55,
          plant: det > 0.9 ? 'flower' : det > 0.85, cat: det > 0.975 ? rng.pick([0x1e1e1e, 0xe08a3a, 0xf2efe6]) : null,
        }, rng);
        windows.push({ x: wx, y: wy, w: ww, h: wh, f });
      }
    }
    // garden level windows with grilles
    const gH = th - gy;
    for (let b = 0; b < nb; b++) {
      const cx = Math.round(bayW * b + bayW / 2);
      if (b === doorBay) {
        // under-stoop door
        p.rect(cx - 4, gy + 6, 8, gH - 6, 0x1e1e22);
        p.rect(cx - 3, gy + 7, 6, gH - 7, 0x3a2a22);
        for (let x = cx - 3; x < cx + 3; x += 2) p.vline(x, gy + 7, gH - 7, 0x1e1e22);
        continue;
      }
      const wx = cx - 4, wy = gy + 5;
      drawWindow(p, wx, wy, 8, 10, { frame: 0x2b2b30, t: rng.next(), rail: false }, rng);
      for (let x = wx; x < wx + 8; x += 2) p.vline(x, wy - 1, 12, 0x161618);
    }
  });

  // rear facade
  const back = region(C, tw, th, (p) => {
    brickFill(p, 0, 0, tw, th, style === 'brick' ? wallPal : PAL.brickRed, rng.int(1, 999));
    p.rect(0, 0, tw, 2, 0x8a8a88);
    for (let f = 0; f < nF + 1; f++) {
      const fy = Math.round((band + f * floorH) * T);
      const n = Math.max(2, nb);
      for (let b = 0; b < n; b++) {
        if (f === nF && b === 0) {
          drawDoor(p, Math.round(bayW / 2) - 4, fy + 4, 8, 16, { color: 0x5c3b2a, transom: false });
          continue;
        }
        const cx = Math.round((tw / n) * b + tw / n / 2);
        drawWindow(p, cx - 4, fy + 6, 8, 12, { frame: 0xf2efe6, sill: 0x9a9a98, t: rng.next(), curtain: rng.chance(0.25) ? rng.pick(PAL.curtains) : null }, rng);
      }
    }
  });

  const sideTex = style === 'brownstone' ? S.brownstone : style === 'limestone' ? S.limestone : style === 'brick' ? S.brickRed : S.brickRed;
  const top = rng.pick([S.roofSilver, S.roofTar, S.roofSilver, S.roofGravel]);
  const side = { t: o.sideTex ?? sideTex };
  const aabb = fr.box(mb, a0, a0 + W, sb, sb + D, z0, z0 + H, {
    front, back, left: o.leftTex ?? side, right: o.rightTex ?? side, top: { t: top, world: true },
  });
  markHeight(C.world, ...aabb, z0 + H);

  // cornice (protruding)
  const corn = C.atlas.shared('cornice_' + corniceC, 32, 6, (p) => {
    corniceBand(p, 0, 0, 32, 6, corniceC);
  });
  const cornTop = C.atlas.shared('cornice_top_' + corniceC, 16, 16, (p) => smoothFill(p, 0, 0, 16, 16, shade(corniceC, 1.1), 3, 0.05));
  fr.box(mb, a0 - 0.0625, a0 + W + 0.0625, sb - 0.25, sb + 0.01, z0 + H - 0.375, z0 + H + 0.0625,
    { front: corn, left: corn, right: corn, top: { t: cornTop, world: true } });
  // parapets on back & sides
  const pa = { t: S.brickRed };
  fr.box(mb, a0, a0 + W, sb + D - 0.125, sb + D, z0 + H, z0 + H + 0.25, { back: pa, left: pa, right: pa, front: pa, top: { t: S.concrete, world: true } });

  // stoop
  const doorA = a0 + (doorBay + 0.5) * (W / nb);
  const sw = 1.25;
  const sa0 = doorA - sw / 2, sa1 = doorA + sw / 2;
  const stepTex = style === 'limestone' ? S.limeStep : S.stoneStep;
  const stepTop = style === 'limestone' ? S.limeTop : S.stoneStepTop;
  const sideStone = style === 'limestone' ? S.limestone : S.brownstone;
  // landing
  fr.box(mb, sa0, sa1, sb - 0.5, sb, z0, z0 + gardenH, { front: stepTex, left: sideStone, right: sideStone, top: { t: stepTop, world: true } });
  for (let i = 0; i < 4; i++) {
    const d1 = sb - 0.5 - 0.25 * i, d0p = sb - 0.5 - 0.25 * (i + 1);
    fr.box(mb, sa0, sa1, d0p, d1, z0, z0 + gardenH - 0.25 * (i + 1), { front: stepTex, left: sideStone, right: sideStone, top: { t: stepTop, world: true } });
  }
  // stoop railings (sloped)
  for (const a of [sa0 + 0.03, sa1 - 0.03]) {
    const pb = fr.pt(a, 0.05), pt_ = fr.pt(a, sb - 0.5);
    const zb = z0 + 0.25, zt = z0 + gardenH;
    const hR = 0.56;
    const len = Math.hypot(pt_[0] - pb[0], pt_[1] - pb[1]) * T;
    mb.quad([pb[0], pb[1], zb + hR + 0.15], [pt_[0], pt_[1], zt + hR], [pt_[0], pt_[1], zt], [pb[0], pb[1], zb],
      [[0, 0], [len, 0], [len, 9], [0, 9]], S.railing, [fr.ux, fr.uy, 0], MAT.FLAT);
    mb.quad([pb[0], pb[1], zb + hR + 0.15], [pt_[0], pt_[1], zt + hR], [pt_[0], pt_[1], zt], [pb[0], pb[1], zb],
      [[0, 0], [len, 0], [len, 9], [0, 9]], S.xmasLights, [fr.ux, fr.uy, 0], MAT.FLAT | MAT.NOSHADOW, GRP.XMAS);
    // newel post
    fr.box(mb, a - 0.06, a + 0.06, 0.0, 0.12, z0, z0 + 0.25 + 0.75, { front: S.blackIron, left: S.blackIron, right: S.blackIron, top: S.blackIron });
  }
  // areaway fence along the lot edge (both sides of the stoop)
  const fenceH = 0.5;
  if (sa0 - a0 > 0.2) fr.facadeQuad(mb, a0 + 0.05, sa0 - 0.05, 0.06, z0, z0 + fenceH, S.railing);
  if (a0 + W - sa1 > 0.2) fr.facadeQuad(mb, sa1 + 0.05, a0 + W - 0.05, 0.06, z0, z0 + fenceH, S.railing);
  // trash cans in areaway
  const canA = doorSide === 'L' ? a0 + W - 0.55 : a0 + 0.3;
  if (rng.chance(0.7)) {
    fr.box(mb, canA, canA + 0.36, 0.3, 0.66, z0, z0 + 0.6, { front: S.trashCan, left: S.trashCan, right: S.trashCan, top: S.trashTop });
  }
  // areaway garden
  if (C.ground) {
    const [gx0, gy0, gx1, gy1] = fr.aabb(doorSide === 'L' ? sa1 + 0.1 : a0 + 0.1, doorSide === 'L' ? a0 + W - 0.1 : sa0 - 0.1, 0.15, sb - 0.05);
    C.paintGround(gx0, gy0, gx1, gy1, rng.chance(0.6) ? 'flowerbed' : 'patio');
  }
  // seasonal decorations
  const zTop = z0 + H;
  const toZ = (ty) => zTop - ty / T;
  const toA = (tx) => a0 + tx / T;
  // cornice xmas lights
  fr.facadeQuad(mb, a0, a0 + W, sb - 0.27, zTop - 0.56, zTop - 0.38, S.xmasLights, { group: GRP.XMAS, mat: MAT.NOSHADOW | MAT.FLAT });
  for (const w of windows) {
    if (w.door) {
      // wreath
      fr.facadeQuad(mb, toA(w.x + 0.5), toA(w.x + 8.5), sb - 0.03, toZ(w.y + 14), toZ(w.y + 6), S.wreath, { group: GRP.XMAS });
      continue;
    }
    const r = rng.next();
    if (w.f >= 0 && w.f < nF - 1 && r < 0.3) {
      // window AC unit (summer)
      const a = toA(w.x + 0.0), zb = toZ(w.y + w.h) + 0.0625;
      fr.box(mb, a, a + 0.5, sb - 0.3, sb, zb, zb + 0.375, { front: S.acUnit, left: S.acUnit, right: S.acUnit, top: S.acTop }, { group: GRP.WARM });
    } else if (w.f === nF - 1 && r < 0.55) {
      const a = toA(w.x - 1), zb = toZ(w.y + w.h) - 0.05;
      fr.box(mb, a, a + 0.625, sb - 0.2, sb, zb, zb + 0.25, { front: S.flowerBox, left: S.flowerBox, right: S.flowerBox, top: S.flowerTop }, { group: GRP.SUMMER_OR_SPRING });
    }
  }
  // pumpkins on stoop steps (autumn)
  if (rng.chance(0.65)) {
    for (let i = 0; i < 3; i++) {
      if (rng.chance(0.4)) continue;
      const d = sb - 0.5 - 0.25 * i - 0.2, zt = z0 + gardenH - 0.25 * i;
      const a = rng.chance(0.5) ? sa0 + 0.12 : sa1 - 0.42;
      fr.box(mb, a, a + 0.3, d - 0.05, d + 0.15, zt, zt + 0.25, { front: S.pumpkin, left: S.pumpkin, right: S.pumpkin, top: S.pumpkinTop }, { group: GRP.AUTUMN });
    }
  }

  // roof clutter
  const R = { a0, a1: a0 + W, d0: sb, d1: sb + D, z: zTop };
  if (rng.chance(0.75)) chimney(C, fr, a0 + rng.range(0.2, W - 0.7), sb + rng.range(D * 0.3, D - 0.8), zTop);
  if (rng.chance(0.5)) skylight(C, fr, a0 + rng.range(0.4, W - 1.2), sb + rng.range(1, D - 2), zTop);
  if (rng.chance(0.18)) roofDeck(C, fr, a0 + 0.3, a0 + W - 0.3, sb + D * 0.55, sb + D - 0.3, zTop);
  if (rng.chance(0.25)) C.addSprite('dish', ...fr.pt(a0 + rng.range(0.5, W - 0.5), sb + D - 0.6), zTop);
  if (o.flag) C.addFlag(fr, a0 + W * 0.5, sb - 0.1, z0 + gardenH + floorH * 1.6);

  // register door + stoop spots
  const street = fr.pt(doorA, -0.7);
  const stoopBottom = fr.pt(doorA, 0.1);
  const doorPt = fr.pt(doorA, sb - 0.2);
  C.world.doors.push({ x: street[0], y: street[1], sx: stoopBottom[0], sy: stoopBottom[1], dx: doorPt[0], dy: doorPt[1], dz: z0 + gardenH, kind: 'home', n: fr.n, stoop: true });
  for (let i = 0; i < 3; i++) {
    const d = sb - 0.5 - 0.25 * i - 0.12;
    const p = fr.pt(doorA + (i % 2 ? 0.3 : -0.3), d);
    C.world.stoopSeats.push({ x: p[0], y: p[1], z: z0 + gardenH - 0.25 * i, n: fr.n });
  }
  return { H: zTop, R };
}

// ---------------------------------------------------------------------------
// Walk-up tenement with storefronts and fire escape
// ---------------------------------------------------------------------------
export function walkup(C, fr, a0, W, D, o = {}) {
  const { mb, rng } = C;
  const S = sharedTex(C);
  const nF = o.floors ?? rng.int(4, 5);
  const gH = 1.75, fH = 1.5, band = 0.75;
  const H = gH + nF * fH + band;
  const z0 = fr.z0;
  const tw = Math.round(W * T), th = Math.round(H * T);
  const brickName = o.brick ?? rng.pick(['brickRed', 'brickBrown', 'brickOrange', 'brickTan', 'brickPurple', 'brickRed']);
  const wallPal = { brickRed: PAL.brickRed, brickBrown: PAL.brickBrown, brickOrange: PAL.brickOrange, brickTan: PAL.brickTan, brickPurple: PAL.brickPurple }[brickName];
  const trim = rng.pick([0xe2d6ba, 0xd8cdb2, 0xf0e6d0, 0xb8b2a4]);
  const frame = rng.pick([0xf2efe6, 0xf2efe6, 0x2b2b30, 0x2f4a3a, 0x7a1f1f]);
  const corniceC = rng.pick([0x2b2b30, 0x3a2a22, 0x2f4a3a, 0xe8e2d0, 0x6a6a68, 0x5a1f1f]);
  const nb = Math.max(2, Math.round(tw / 18));
  const bayW = tw / nb;
  const shop = o.shop === undefined ? rng.pick(['bodega', 'pizza', 'laundry', 'coffee', 'bar', 'books', 'flowers', 'chinese', 'nails', 'hardware', 'bagels', 'diner']) : o.shop;
  const esc = o.fireEscape ?? (nb >= 3 && rng.chance(0.85));
  const escBays = esc ? (nb >= 4 ? [1, 2] : [0, 1]).map((b) => Math.min(b, nb - 1)) : [];
  const windows = [];
  let shopInfo = null;
  const shopTW = shop ? (o.resDoor === false ? tw : tw - 12) : 0;
  const resDoorX = o.resDoorLeft ? 1 : tw - 11;
  const floorT = [];
  for (let f = 0; f < nF; f++) floorT.push(rng.next());

  const paintFacade = (p, wide, withShop, sideMode) => {
    brickFill(p, 0, 0, wide, th, wallPal, rng.int(1, 999));
    // cornice band
    p.rect(0, 0, wide, 4, shade(corniceC, 0.9));
    corniceBand(p, 0, 4, wide, 8, corniceC);
    // floors
    const n = Math.max(2, Math.round(wide / 18));
    const bw = wide / n;
    for (let f = 0; f < nF; f++) {
      const fy = Math.round((band + f * fH) * T);
      // belt course
      if (f === nF - 1) p.rect(0, fy + 23, wide, 1, trim);
      for (let b = 0; b < n; b++) {
        const cx = Math.round(bw * b + bw / 2);
        const t = floorT[f] * 0.5 + rng.next() * 0.5;
        const det = rng.next();
        drawWindow(p, cx - 4, fy + 6, 8, 14, {
          frame, lintel: trim, sill: trim, t, curtain: det < 0.3 ? rng.pick(PAL.curtains) : null, blinds: det > 0.3 && det < 0.5,
          plant: det > 0.92, cat: det > 0.985 ? 0x1e1e1e : null, keystone: rng.chance(0.2),
        }, rng);
        if (!sideMode) windows.push({ x: cx - 4, y: fy + 6, w: 8, h: 14, f, b });
      }
    }
    // ground floor
    const gy = Math.round((band + nF * fH) * T);
    const gh = th - gy;
    if (withShop && shop) {
      const sx = o.resDoorLeft ? 12 : 0;
      shopInfo = drawShopfront(p, sx, gy, shopTW, gh, shop, rng, { doorLeft: rng.chance(0.5) });
      if (o.resDoor !== false) {
        // residential entrance
        const rx = resDoorX;
        p.rect(rx - 1, gy, 12, gh, trim);
        drawDoor(p, rx + 1, gy + 4, 8, gh - 4, { color: rng.pick([0x2b2b30, 0x5c3b2a, 0x7a1f1f]), glass: true, number: o.number });
      }
    } else {
      // residential ground floor
      p.rect(0, gy, wide, 1, trim);
      for (let b = 0; b < n; b++) {
        const cx = Math.round(bw * b + bw / 2);
        if (!sideMode && b === Math.floor(n / 2)) {
          p.rect(cx - 6, gy + 1, 12, gh - 1, trim);
          drawDoor(p, cx - 4, gy + 6, 8, gh - 6, { color: 0x2b2b30, glass: true, number: o.number });
        } else drawWindow(p, cx - 4, gy + 6, 8, 14, { frame, sill: trim, t: rng.next() }, rng);
      }
    }
    // ghost sign on side walls
    if (sideMode && rng.chance(0.55)) {
      const txt = rng.pick(['ROOMS', 'SODA 5C', 'PIANOS', 'COAL & ICE', 'LOFTS', 'GARAGE', 'HATS', 'BAKERY', 'TAILOR', 'FURS']);
      const sw = textWidth(txt, 2) + 8;
      if (sw < wide - 4) {
        const sx = Math.floor((wide - sw) / 2), sy = 14;
        const col = rng.pick([0xf2efe6, 0xf2c230, 0x5aa0d8]);
        for (let yy = 0; yy < 18; yy++) for (let xx = 0; xx < sw; xx++) p.blend(sx + xx, sy + yy, 0x2a2420, 0.55);
        const q = p.sub(sx, sy, sw, 18);
        q.text(4, 4, txt, col, 255, 2);
        for (let yy = 0; yy < 18; yy++) for (let xx = 0; xx < sw; xx++) if (hash2i(xx + sx, yy + sy, 3) < 0.3) p.blend(sx + xx, sy + yy, wallPal[0], 0.5);
      }
    }
  };
  const front = region(C, tw, th, (p) => paintFacade(p, tw, true, false));
  const sideW = Math.round(D * T);
  const sideFacade = o.cornerSide ? region(C, sideW, th, (p) => paintFacade(p, sideW, false, true)) : null;
  const plainSide = { brickRed: S.brickRed, brickBrown: S.brickBrown, brickOrange: S.brickOrange, brickTan: S.brickTan, brickPurple: S.brickPurple }[brickName];
  const back = region(C, tw, th, (p) => {
    brickFill(p, 0, 0, tw, th, wallPal, rng.int(1, 999));
    for (let f = 0; f < nF + 1; f++) {
      const fy = Math.round((band + f * fH) * T);
      for (let b = 0; b < nb; b++) {
        const cx = Math.round(bayW * b + bayW / 2);
        drawWindow(p, cx - 4, fy + 6, 8, 12, { frame: 0xf2efe6, sill: 0x9a9a98, t: rng.next() }, rng);
      }
    }
  });
  const top = rng.pick([S.roofTar, S.roofSilver, S.roofGravel]);
  const sides = {
    left: o.cornerSide === 'L' ? sideFacade : plainSide,
    right: o.cornerSide === 'R' ? sideFacade : plainSide,
  };
  const aabb = fr.box(mb, a0, a0 + W, 0, D, z0, z0 + H, { front, back, ...sides, top: { t: top, world: true } });
  markHeight(C.world, ...aabb, z0 + H);
  const zTop = z0 + H;
  const toZ = (ty) => zTop - ty / T;
  const toA = (tx) => a0 + tx / T;

  // big sheet-metal cornice
  const corn = C.atlas.shared('wcornice_' + corniceC, 32, 10, (p) => {
    corniceBand(p, 0, 0, 32, 10, corniceC);
    for (let x = 1; x < 32; x += 8) { p.rect(x, 2, 2, 7, shade(corniceC, 0.75)); p.rect(x, 8, 3, 1, shade(corniceC, 0.6)); }
  });
  const cornTop = C.atlas.shared('cornice_top_' + corniceC, 16, 16, (p) => smoothFill(p, 0, 0, 16, 16, shade(corniceC, 1.1), 3, 0.05));
  const cornA0 = a0 - (o.cornerSide === 'L' ? 0.3 : 0.0625), cornA1 = a0 + W + (o.cornerSide === 'R' ? 0.3 : 0.0625);
  fr.box(mb, cornA0, cornA1, -0.3, 0.02, zTop - 0.625, zTop + 0.0625, { front: corn, left: corn, right: corn, top: { t: cornTop, world: true } });
  if (o.cornerSide) {
    const a = o.cornerSide === 'L' ? a0 - 0.3 : a0 + W;
    fr.box(mb, a, a + 0.3, 0, D, zTop - 0.625, zTop + 0.0625, { front: corn, left: corn, right: corn, back: corn, top: { t: cornTop, world: true } });
  }
  // parapet
  const pa = { t: plainSide };
  fr.box(mb, a0, a0 + W, D - 0.125, D, zTop, zTop + 0.375, { back: pa, front: pa, left: pa, right: pa, top: { t: S.concrete, world: true } });

  // storefront awning + night gate
  if (shop && shopInfo) {
    const sx0 = o.resDoorLeft ? 12 : 0;
    const aA0 = toA(sx0 + 0.5), aA1 = toA(sx0 + shopTW - 0.5);
    const zA = z0 + gH - 0.375;
    const awnC = shopInfo.color;
    const striped = rng.chance(0.4);
    const awTex = C.atlas.shared(`awn_${awnC}_${striped}`, 32, 12, (p) => awningTex(p, 32, 12, awnC, striped, null, rng));
    const valW = Math.round((aA1 - aA0) * T);
    const valance = region(C, valW, 4, (p) => {
      awningTex(p, valW, 4, awnC, striped, null, rng);
      p.rect(0, 3, valW, 1, shade(awnC, 0.7));
    });
    if (rng.chance(0.8)) {
      const p0 = fr.pt(aA0, 0), p1 = fr.pt(aA1, 0), q0 = fr.pt(aA0, -1.0), q1 = fr.pt(aA1, -1.0);
      mb.slope([q0[0], q0[1], zA - 0.35], [q1[0], q1[1], zA - 0.35], [p0[0], p0[1], zA + 0.1], [p1[0], p1[1], zA + 0.1], awTex, { mat: MAT.SNOW | MAT.WET });
      fr.facadeQuad(mb, aA0, aA1, -1.0, zA - 0.6, zA - 0.35, valance);
    }
    // night roll-down gate
    const gate = region(C, Math.round(shopTW), Math.round((gH - 0.4) * T), (p) => drawGate(p, Math.round(shopTW), Math.round((gH - 0.4) * T), rng));
    fr.facadeQuad(mb, toA(sx0), toA(sx0 + shopTW), -0.03, z0, z0 + gH - 0.4, gate, { group: GRP.NIGHT, mat: 0 });
    C.world.shops.push({ kind: shop, name: shopInfo.name, ...ptObj(fr.pt(toA(sx0 + shopTW / 2), -0.8)), dx: fr.pt(toA(sx0 + shopTW / 2), 0.3)[0], dy: fr.pt(toA(sx0 + shopTW / 2), 0.3)[1], n: fr.n });
    // light spill from the shop window onto the sidewalk
    const lp = fr.pt(toA(sx0 + shopTW / 2), -0.9);
    C.world.lamps.push({ x: lp[0], y: lp[1], z: 0.5, r: 2.2, color: [1.0, 0.85, 0.6], k: 0.55, kind: 'shop', group: GRP.DAY });
    // blade sign
    if (rng.chance(0.45)) bladeSign(C, fr, toA(sx0 + 2), zA + 0.2, shopInfo.name, rng);
  }
  // fire escape
  if (esc) {
    const ex0 = toA(Math.round(bayW * escBays[0] + bayW / 2) - 9);
    const ex1 = toA(Math.round(bayW * escBays[escBays.length - 1] + bayW / 2) + 9);
    fireEscape(C, fr, ex0, ex1, 0, z0 + gH, fH, nF);
  }
  // seasonal: AC units in non-escape windows, xmas lights under cornice
  for (const w of windows) {
    if (escBays.includes(w.b)) continue;
    if (rng.chance(0.32)) {
      const a = toA(w.x), zb = toZ(w.y + w.h) + 0.0625;
      fr.box(mb, a, a + 0.5, -0.3, 0, zb, zb + 0.375, { front: S.acUnit, left: S.acUnit, right: S.acUnit, top: S.acTop }, { group: GRP.WARM });
    }
  }
  if (rng.chance(0.5)) fr.facadeQuad(mb, a0, a0 + W, -0.32, zTop - 0.85, zTop - 0.66, S.xmasLights, { group: GRP.XMAS, mat: MAT.NOSHADOW | MAT.FLAT });

  // rooftop
  const roof = { a0, a1: a0 + W, d0: 0, d1: D, z: zTop };
  roofClutter(C, fr, roof, { waterTower: o.waterTower ?? rng.chance(0.45), billboard: o.billboard });

  // door (residential)
  const rdA = o.resDoorLeft ? toA(6) : toA(resDoorX + 5);
  const st = fr.pt(shop ? rdA : a0 + W / 2, -0.7), dp = fr.pt(shop ? rdA : a0 + W / 2, 0.2);
  C.world.doors.push({ x: st[0], y: st[1], sx: st[0], sy: st[1], dx: dp[0], dy: dp[1], dz: z0, kind: 'home', n: fr.n });
  return { H: zTop };
}

function ptObj(p) {
  return { x: p[0], y: p[1] };
}

// Blade sign perpendicular to the facade
export function bladeSign(C, fr, a, z, text, rng) {
  const word = text.split(' ')[0].slice(0, 7);
  const hh = word.length * 6 + 4;
  const bg = rng.pick([0x1b1b1b, 0xc8302c, 0x1f4f9a, 0x2f4a3a]);
  const fg = rng.pick([0xff4f6a, 0x4fd2ff, 0xffd84f, 0xffffff]);
  const tex = region(C, 12, hh, (p) => {
    p.rect(0, 0, 12, hh, bg);
    p.frame(0, 0, 12, hh, shade(bg, 1.6));
    for (let i = 0; i < word.length; i++) p.text(4, 2 + i * 6, word[i], fg, winCode(0.02, true));
  });
  const H = hh / T;
  fr.sideQuad(C.mb, a, -0.2, -0.95, z, z + H, tex, { mat: MAT.NOSHADOW });
  fr.sideQuad(C.mb, a + 0.01, -0.95, -0.2, z, z + H, tex, { mat: MAT.NOSHADOW });
  const p = fr.pt(a, -0.6);
  C.world.lamps.push({ x: p[0], y: p[1], z: z, r: 1.4, color: [0.9, 0.5, 0.6], k: 0.3, kind: 'neon' });
}

// Zig-zag fire escape on a facade (front at d = dFace)
export function fireEscape(C, fr, ea0, ea1, dFace, zFirst, fH, nF) {
  const { mb } = C;
  const S = sharedTex(C);
  const depth = 0.6;
  const iron = { t: S.darkMetal };
  for (let f = 0; f < nF; f++) {
    // platforms at each upper floor (from the floor above the ground floor up)
    const zf = zFirst + f * fH;
    fr.box(mb, ea0, ea1, dFace - depth, dFace, zf - 0.06, zf, { front: iron, left: iron, right: iron, top: { t: S.grate } }, { topMat: MAT.SNOW });
    // front railing
    fr.facadeQuad(mb, ea0, ea1, dFace - depth + 0.02, zf, zf + 0.62, S.fescRail);
    fr.sideQuad(mb, ea0 + 0.02, dFace - depth, dFace, zf, zf + 0.62, S.fescRail);
    fr.sideQuad(mb, ea1 - 0.02, dFace, dFace - depth, zf, zf + 0.62, S.fescRail);
    // stairs from this platform to the next (sloped quad within platform depth)
    if (f < nF - 1) {
      const goingRight = f % 2 === 0;
      const sa0 = goingRight ? ea0 + 0.25 : ea1 - 0.25;
      const sa1 = goingRight ? ea1 - 0.55 : ea0 + 0.55;
      const d = dFace - depth * 0.4;
      const p0 = fr.pt(sa0, d), p1 = fr.pt(sa1, d);
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const sl = Math.hypot(len, fH) * T;
      const th = 0.25;
      mb.quad([p0[0], p0[1], zf + th], [p1[0], p1[1], zf + fH + th - 0.06], [p1[0], p1[1], zf + fH - 0.06], [p0[0], p0[1], zf],
        [[0, 0], [sl, 0], [sl, 4], [0, 4]], S.fstair, [fr.nx, fr.ny, 0], MAT.FLAT);
    }
  }
  // drop ladder
  const la = (ea0 + ea1) / 2 + 0.3;
  fr.facadeQuad(mb, la, la + 0.35, dFace - depth + 0.05, zFirst - 1.0, zFirst, S.ladder);
}

// Rooftop clutter: bulkhead, water tower, hvac, chimneys, billboard, antenna
export function roofClutter(C, fr, roof, o = {}) {
  const { rng } = C;
  const W = roof.a1 - roof.a0, D = roof.d1 - roof.d0;
  const z = roof.z;
  // bulkhead
  if (W > 3 && rng.chance(0.85)) {
    const bw = 1.5, bd = 1.75;
    const ba = roof.a0 + rng.range(0.3, W - bw - 0.3), bdd = roof.d0 + rng.range(D * 0.3, D - bd - 0.3);
    bulkhead(C, fr, ba, ba + bw, bdd, bdd + bd, z, 1.25);
  }
  if (o.waterTower) {
    const a = roof.a0 + rng.range(1.2, W - 1.2), d = roof.d0 + rng.range(1.5, D - 1.5);
    waterTower(C, ...fr.pt(a, d), z, rng.range(0.8, 1.05));
  }
  const nH = rng.int(0, 2);
  for (let i = 0; i < nH; i++) {
    const a = roof.a0 + rng.range(0.3, W - 1.3), d = roof.d0 + rng.range(0.6, D - 1);
    hvac(C, fr, a, d, z);
  }
  if (rng.chance(0.6)) chimney(C, fr, roof.a0 + rng.range(0.2, W - 0.6), roof.d0 + rng.range(0.4, D - 0.6), z);
  if (rng.chance(0.3)) C.addSprite('antenna', ...fr.pt(roof.a0 + rng.range(0.5, W - 0.5), roof.d0 + rng.range(0.5, D - 0.5)), z);
  if (rng.chance(0.35)) C.addSprite('dish', ...fr.pt(roof.a0 + rng.range(0.5, W - 0.5), roof.d0 + rng.range(0.5, D - 0.5)), z);
  if (o.billboard) billboard(C, fr, roof.a0 + 0.3, roof.a0 + Math.min(W - 0.3, 5.3), roof.d0 + 0.6, z, o.billboard);
  if (o.garden || rng.chance(0.12)) roofGarden(C, fr, roof.a0 + 0.4, roof.a1 - 0.4, roof.d0 + 0.4, roof.d0 + Math.min(D * 0.5, 3), z);
  if (rng.chance(0.08)) C.world.pigeonCoops.push({ ...ptObj(fr.pt(roof.a0 + W / 2, roof.d0 + D / 2)), z });
}

export function bulkhead(C, fr, a0, a1, d0, d1, z, h) {
  const S = sharedTex(C);
  const tex = C.atlas.shared('bulk', 32, 20, (p) => {
    brickFill(p, 0, 0, 32, 20, PAL.brickBrown, 31);
    p.rect(0, 0, 32, 2, 0x8a8a88);
  });
  const doorT = C.atlas.shared('bulk_door', 24, 20, (p) => {
    brickFill(p, 0, 0, 24, 20, PAL.brickBrown, 31);
    p.rect(0, 0, 24, 2, 0x8a8a88);
    p.rect(8, 6, 8, 14, 0x5a5d63);
    p.frame(8, 6, 8, 14, 0x3a3d43);
  });
  fr.box(C.mb, a0, a1, d0, d1, z, z + h, { front: doorT, back: tex, left: tex, right: tex, top: { t: S.roofTar, world: true } });
  markHeight(C.world, ...fr.aabb(a0, a1, d0, d1), z + h);
}

export function waterTower(C, x, y, z, r = 0.95) {
  const S = sharedTex(C);
  const { mb, rng } = C;
  const legH = 1.25, tankH = 1.9;
  // legs + platform
  const iron = S.darkMetal;
  for (const [dx, dy] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    mb.solid(x + dx * r - 0.06, y + dy * r - 0.06, z, x + dx * r + 0.06, y + dy * r + 0.06, z + legH, iron, iron);
  }
  mb.solid(x - r, y - 0.03, z + legH * 0.45, x + r, y + 0.03, z + legH * 0.45 + 0.06, iron, iron);
  mb.solid(x - 0.03, y - r, z + legH * 0.45, x + 0.03, y + r, z + legH * 0.45 + 0.06, iron, iron);
  mb.solid(x - r * 1.05, y - r * 1.05, z + legH - 0.08, x + r * 1.05, y + r * 1.05, z + legH, iron, S.grate);
  const kind = rng.next();
  const tankTex = kind < 0.12 ? flagTank(C) : rng.chance(0.5) ? S.tank : S.tankDark;
  mb.cylinder(x, y, z + legH, z + legH + tankH, r, 12, tankTex, null);
  mb.cone(x, y, z + legH + tankH, z + legH + tankH + 0.85, r * 1.08, 12, S.tankRoof);
  // finial
  mb.solid(x - 0.04, y - 0.04, z + legH + tankH + 0.8, x + 0.04, y + 0.04, z + legH + tankH + 1.05, iron, iron);
  // ladder
  mb.vquad(x - 0.15, y + r + 0.02, x + 0.15, y + r + 0.02, z, z + legH + tankH, S.ladder);
  markHeight(C.world, x - r, y - r, x + r, y + r, z + legH + tankH + 0.9);
  C.world.perches.push({ x, y, z: z + legH + tankH + 0.85 });
}

function flagTank(C) {
  return C.atlas.shared('tank_flag', 64, 30, (p) => {
    for (let y = 0; y < 30; y++) for (let x = 0; x < 64; x++) p.set(x, y, Math.floor(y / 3) % 2 ? 0xf2efe6 : 0xc8302c);
    p.rect(0, 0, 26, 15, 0x1f3a7a);
    for (let y = 2; y < 14; y += 3) for (let x = 2; x < 25; x += 4) p.set(x + (y % 2) * 2, y, 0xffffff);
    for (let x = 1; x < 64; x += 2) p.set(x, 29, 0x3a3a3e);
  });
}

export function hvac(C, fr, a, d, z) {
  const S = sharedTex(C);
  fr.box(C.mb, a, a + 1.0, d, d + 0.75, z, z + 0.5, { front: S.hvac, back: S.hvac, left: S.hvac, right: S.hvac, top: { t: S.hvacTop } });
  C.world.steam.push({ ...ptObj(fr.pt(a + 0.3, d + 0.37)), z: z + 0.55, kind: 'roof', rate: 0.25 });
}

export function chimney(C, fr, a, d, z) {
  const S = sharedTex(C);
  fr.box(C.mb, a, a + 0.375, d, d + 0.375, z, z + 0.75, { front: S.chimney, back: S.chimney, left: S.chimney, right: S.chimney, top: { t: S.chimneyTop } });
  C.world.steam.push({ ...ptObj(fr.pt(a + 0.19, d + 0.19)), z: z + 0.8, kind: 'chimney', rate: 0.15 });
}

export function skylight(C, fr, a, d, z) {
  const S = sharedTex(C);
  fr.box(C.mb, a, a + 0.75, d, d + 0.75, z, z + 0.25, { front: S.metal, back: S.metal, left: S.metal, right: S.metal, top: { t: S.skylight } });
}

export function roofDeck(C, fr, a0, a1, d0, d1, z) {
  const S = sharedTex(C);
  fr.box(C.mb, a0, a1, d0, d1, z, z + 0.06, { front: S.wood, back: S.wood, left: S.wood, right: S.wood, top: { t: S.roofDeck, world: true } });
  const p = fr.pt((a0 + a1) / 2, (d0 + d1) / 2);
  C.addSprite('deckchair', p[0], p[1], z + 0.06);
  C.addSprite('planter', ...fr.pt(a0 + 0.2, d0 + 0.2), z + 0.06);
  // string lights for summer nights
  fr.facadeQuad(C.mb, a0, a1, d0 + 0.02, z + 0.9, z + 1.1, S.lightsWarm, { group: GRP.SUMMER, mat: MAT.NOSHADOW | MAT.FLAT });
}

export function roofGarden(C, fr, a0, a1, d0, d1, z) {
  const S = sharedTex(C);
  const w = a1 - a0;
  for (let a = a0; a < a1 - 0.6; a += 1.1) {
    fr.box(C.mb, a, a + 0.8, d0, d0 + 0.5, z, z + 0.35, { front: S.wood, back: S.wood, left: S.wood, right: S.wood, top: { t: S.roofGreen, world: true } });
    C.addSprite('bush', ...fr.pt(a + 0.4, d0 + 0.25), z + 0.35);
  }
  void w; void d1;
}

export function billboard(C, fr, a0, a1, d, z, kind) {
  const { mb } = C;
  const S = sharedTex(C);
  const W = a1 - a0, H = 1.75, legH = 1.0;
  const tw = Math.round(W * T), th = Math.round(H * T);
  const art = region(C, tw, th, (p) => billboardArt(p, tw, th, kind, C.rng));
  const backT = C.atlas.shared('bb_back', 16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, x % 4 === 0 || y % 8 === 0 ? 0x4a4c52 : 0x6a6c72);
  });
  // legs
  for (const a of [a0 + 0.4, a1 - 0.4]) {
    fr.box(mb, a - 0.06, a + 0.06, d + 0.1, d + 0.22, z, z + legH, { front: S.darkMetal, left: S.darkMetal, right: S.darkMetal, back: S.darkMetal });
    fr.box(mb, a - 0.04, a + 0.04, d + 0.2, d + 0.9, z, z + legH * 0.6, { front: S.darkMetal, left: S.darkMetal, right: S.darkMetal });
  }
  fr.box(mb, a0, a1, d, d + 0.12, z + legH, z + legH + H, { front: { t: art, mat: MAT.NOSHADOW }, back: backT, left: backT, right: backT, top: S.darkMetal });
  // catwalk
  fr.box(mb, a0, a1, d - 0.35, d, z + legH - 0.06, z + legH, { front: S.darkMetal, left: S.darkMetal, right: S.darkMetal, top: { t: S.grate } });
  // lamps light up the billboard
  const lp = fr.pt((a0 + a1) / 2, d - 0.4);
  C.world.lamps.push({ x: lp[0], y: lp[1], z: z + legH + H, r: 2.0, color: [1, 0.95, 0.85], k: 0.25, kind: 'bill' });
  markHeight(C.world, ...fr.aabb(a0, a1, d - 0.35, d + 0.2), z + legH + H);
}

export function gardenWall(C, fr, a0, a1, d, z, h, kind = 'brick') {
  const S = sharedTex(C);
  const t = kind === 'wood' ? S.fenceWood : S.brickRed;
  fr.box(C.mb, a0, a1, d, d + 0.18, z, z + h, { front: t, back: t, left: t, right: t, top: { t: S.limeTop } });
}

export { signBoard, graffiti, glassDay };
