// Street furniture, park and court furniture.

import { T, CURB } from './layout.js';
import { MAT, GRP } from './mesh.js';
import { winCode } from '../core/painter.js';
import { shade, hash2i } from '../core/math.js';
import { smoothFill, chainLinkTex, mural, PAL, stoneFill, brickFill } from './facades.js';
import { sharedTex, markHeight } from './buildings.js';

export function propTex(C) {
  if (C._props) return C._props;
  const A = C.atlas;
  const P = {};
  const solid = (name, c, amt = 0.04) => A.shared(name, 8, 8, (p) => smoothFill(p, 0, 0, 8, 8, c, 5, amt));
  P.pole = solid('pole', 0x5d6a62);
  P.poleDark = solid('pole_d', 0x2c3330);
  P.black = solid('black', 0x1e1e22);
  P.yellow = solid('sig_y', 0xd8a828);
  P.red = solid('red', 0xc8302c);
  P.blue = solid('blue', 0x1f4fa0);
  P.green = solid('green', 0x2f7a3a);
  P.orange = solid('orange', 0xe8741a);
  P.silver = solid('silver', 0xb8bcc2);
  P.wood = A.shared('bench_wood', 16, 4, (p) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) p.set(x, y, y === 1 || y === 3 ? 0x6b4428 : 0x9a6a3e);
  });
  P.lampHead = A.shared('lamp_head', 8, 4, (p) => { p.rect(0, 0, 8, 4, 0x4a524e); p.rect(1, 3, 6, 1, 0xfff0c0, winCode(0.32, true)); });
  P.lantern = A.shared('lantern', 6, 8, (p) => {
    p.rect(0, 0, 6, 8, 0x1e1e22);
    p.rect(1, 1, 4, 6, 0xffe2a0, winCode(0.32, true));
    p.vline(3, 1, 6, 0x1e1e22);
  });
  P.globe = A.shared('globe', 4, 4, (p) => { p.rect(0, 0, 4, 4, 0x3fbf5a, winCode(0.0, true)); p.set(0, 0, 0x2a8a3a, winCode(0.0, true)); });
  P.sigHead = A.shared('sig_head', 4, 12, (p) => {
    p.rect(0, 0, 4, 12, 0x2a2a26);
    p.frame(0, 0, 4, 12, 0xc8a228);
    for (let i = 0; i < 3; i++) p.rect(1, 1 + i * 4, 2, 2, 0x111111);
  });
  P.pedHead = A.shared('ped_head', 4, 6, (p) => { p.rect(0, 0, 4, 6, 0x2a2a26); p.frame(0, 0, 4, 6, 0xc8a228); });
  P.streetSign = A.shared('st_sign', 16, 3, (p) => { p.rect(0, 0, 16, 3, 0x1f7a3a); p.hline(1, 1, 14, 0xe8f0e8); p.set(3, 1, 0x1f7a3a); p.set(8, 1, 0x1f7a3a); });
  P.hydrant = A.shared('hydrant', 6, 8, (p) => {
    p.rect(0, 0, 6, 8, 0xc8302c);
    p.rect(0, 0, 6, 2, 0xd8d8d0);
    p.rect(0, 4, 6, 1, 0xa02020);
    p.set(1, 1, 0xffffff);
  });
  P.hydrantTop = A.shared('hydrant_t', 4, 4, (p) => { p.rect(0, 0, 4, 4, 0xd8d8d0); p.set(1, 1, 0xa8a8a0); });
  P.mailbox = A.shared('mailbox', 10, 14, (p) => {
    p.rect(0, 0, 10, 14, 0x1f4fa0);
    p.rect(0, 0, 10, 2, 0x2a5fb8);
    p.rect(2, 4, 6, 2, 0x163a78);
    p.text(1, 7, 'US', 0xffffff);
    p.rect(1, 12, 2, 2, 0x163a78); p.rect(7, 12, 2, 2, 0x163a78);
  });
  P.newsBoxes = ['news_r', 'news_y', 'news_b', 'news_g'].map((k, i) => A.shared(k, 6, 9, (p) => {
    const c = [0xc8302c, 0xe8c030, 0x2a5fb8, 0x2f8a46][i];
    p.rect(0, 0, 6, 9, c);
    p.rect(1, 1, 4, 3, 0xd8e0e8);
    p.rect(1, 6, 4, 1, shade(c, 0.6));
  }));
  P.basket = A.shared('basket', 8, 10, (p) => {
    p.clear();
    for (let y = 0; y < 10; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2 === 0 || y === 0 || y === 9) p.set(x, y, 0x2f6a3a);
  });
  P.basketTop = A.shared('basket_t', 8, 8, (p) => { p.rect(0, 0, 8, 8, 0x2f6a3a); p.rect(1, 1, 6, 6, 0x3a3a36); p.set(3, 3, 0xe8e8e0); p.set(5, 2, 0xc8302c); });
  P.chain = A.shared('chainlink', 32, 40, (p) => chainLinkTex(p, 32, 40));
  P.chainLow = A.shared('chainlink_low', 32, 12, (p) => chainLinkTex(p, 32, 12));
  P.backboard = A.shared('backboard', 28, 17, (p) => {
    p.rect(0, 0, 28, 17, 0xf2f2f0);
    p.frame(0, 0, 28, 17, 0xc8302c);
    p.frame(9, 7, 10, 8, 0xc8302c);
  });
  P.net = A.shared('net', 8, 6, (p) => {
    p.clear();
    for (let y = 0; y < 6; y++) for (let x = y >> 1; x < 8 - (y >> 1); x++) if ((x + y) % 2 === 0) p.set(x, y, 0xf2f2f0);
  });
  P.rim = solid('rim', 0xe8601a, 0.02);
  P.stack = A.shared('steam_stack', 16, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, Math.floor(y / 4) % 2 ? 0xf2f2ee : 0xf07a1a);
  });
  P.stackTop = A.shared('steam_stack_t', 8, 8, (p) => { p.rect(0, 0, 8, 8, 0x3a3a3a); p.rect(2, 2, 4, 4, 0x1a1a1a); });
  P.barrel = A.shared('barrel', 8, 10, (p) => {
    for (let y = 0; y < 10; y++) p.rect(0, y, 8, 1, y % 4 < 2 ? 0xf07a1a : 0xf2f2ee);
  });
  P.cone = A.shared('cone', 8, 8, (p) => {
    for (let y = 0; y < 8; y++) p.rect(0, y, 8, 1, y === 3 || y === 4 ? 0xf2f2ee : 0xf07a1a);
  });
  P.stoneWall = A.shared('parkwall', 32, 12, (p) => {
    stoneFill(p, 0, 0, 32, 12, [0x8e8a80], 17, 4, { blocks: 8 });
    p.rect(0, 0, 32, 1, 0xb0aca2);
  });
  P.stoneWallTop = A.shared('parkwall_t', 16, 16, (p) => stoneFill(p, 0, 0, 16, 16, [0xa8a49a], 18, 0));
  P.concrete = sharedTex(C).concrete;
  P.glass = A.shared('shelter_glass', 16, 16, (p) => {
    p.clear();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 7 === 0) p.set(x, y, 0xd8e8f0);
    p.frame(0, 0, 16, 16, 0x5a6066);
  });
  P.adPanel = A.shared('ad_panel', 16, 28, (p) => {
    p.rect(0, 0, 16, 28, 0x5a6066);
    for (let y = 1; y < 27; y++) for (let x = 1; x < 15; x++) p.set(x, y, y < 14 ? 0xff7ae0 : 0x4fd2ff, winCode(0.15, true));
    p.text(2, 3, 'NEW', 0xffffff, winCode(0.15, true));
    p.text(2, 16, 'SHOW', 0x1b1b1b, winCode(0.15, true));
  });
  P.kiosk = A.shared('kiosk', 8, 32, (p) => {
    p.rect(0, 0, 8, 32, 0x2a2e33);
    p.rect(1, 3, 6, 20, 0x5aa0d8, winCode(0.0, true));
    p.text(1, 8, 'NY', 0xffffff, winCode(0.0, true));
  });
  P.subwayRail = A.shared('sub_rail', 32, 10, (p) => {
    p.clear();
    p.rect(0, 0, 32, 1, 0x1f5a2a);
    p.rect(0, 9, 32, 1, 0x1f5a2a);
    for (let x = 0; x < 32; x += 4) p.rect(x, 0, 1, 10, 0x1f5a2a);
  });
  P.subwaySign = A.shared('sub_sign', 24, 7, (p) => {
    p.rect(0, 0, 24, 7, 0x1b1b1b);
    p.text(1, 1, 'SUBWAY', 0xffffff, winCode(0.2, true));
  });
  P.lineDots = A.shared('sub_dots', 24, 4, (p) => {
    p.rect(0, 0, 24, 4, 0x1b1b1b);
    const c = [0xee352e, 0x00933c, 0xb933ad, 0x0039a6, 0xfccc0a];
    for (let i = 0; i < 5; i++) p.rect(1 + i * 5, 0, 3, 3, c[i], winCode(0.2, true));
  });
  P.planter = A.shared('planter', 16, 8, (p) => { smoothFill(p, 0, 0, 16, 8, 0xb4ada0, 7, 0.05); p.rect(0, 0, 16, 1, 0xc8c2b6); });
  P.soilTop = A.shared('soil_top', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, hash2i(x, y, 3) < 0.5 ? 0x4a7a32 : 0x3a6a2a); });
  P.scaffold = A.shared('scaffold', 16, 16, (p) => { smoothFill(p, 0, 0, 16, 16, 0x2f7a46, 3, 0.05); p.rect(0, 0, 16, 1, 0x3f9a56); });
  P.bleacher = A.shared('bleach', 16, 4, (p) => { p.rect(0, 0, 16, 4, 0xb8bcc2); p.rect(0, 0, 16, 1, 0xd8dce2); p.rect(0, 3, 16, 1, 0x8a8e94); });
  C._props = P;
  return P;
}

const solidBox = (C, x0, y0, z0, x1, y1, z1, side, top, opt) => C.mb.box(x0, y0, z0, x1, y1, z1, { px: side, nx: side, py: side, ny: side, pz: top || side }, opt);

// NYC-style street lamp. (x,y) = pole base, (ax, ay) = arm direction (toward road)
export function streetLamp(C, x, y, ax, ay, o = {}) {
  const P = propTex(C);
  const z = CURB, h = o.h ?? 4.25;
  solidBox(C, x - 0.07, y - 0.07, z, x + 0.07, y + 0.07, z + h, P.pole);
  solidBox(C, x - 0.11, y - 0.11, z, x + 0.11, y + 0.11, z + 0.5, P.pole);
  const L = 1.1;
  const ex = x + ax * L, ey = y + ay * L;
  solidBox(C, Math.min(x, ex) - 0.04, Math.min(y, ey) - 0.04, z + h - 0.08, Math.max(x, ex) + 0.04, Math.max(y, ey) + 0.04, z + h, P.pole);
  const hx0 = ex - (ax ? 0.25 * ax : 0.12), hx1 = ex + (ax ? 0.12 * ax : 0.12);
  const hy0 = ey - (ay ? 0.25 * ay : 0.12), hy1 = ey + (ay ? 0.12 * ay : 0.12);
  solidBox(C, Math.min(hx0, hx1), Math.min(hy0, hy1), z + h - 0.2, Math.max(hx0, hx1), Math.max(hy0, hy1), z + h - 0.02, P.lampHead, P.pole);
  C.world.lamps.push({ x: ex, y: ey, z: z + h - 0.25, r: 4.2, color: [1.0, 0.86, 0.62], k: 1.0, kind: 'street' });
  C.world.lampHeads.push({ x: ex, y: ey, z: z + h - 0.25, kind: 'street' });
  markHeight(C.world, x - 0.1, y - 0.1, x + 0.1, y + 0.1, z + h);
  C.world.perches.push({ x: (x + ex) / 2, y: (y + ey) / 2, z: z + h });
}

export function parkLamp(C, x, y) {
  const P = propTex(C);
  const z = CURB;
  solidBox(C, x - 0.06, y - 0.06, z, x + 0.06, y + 0.06, z + 2.2, P.black);
  solidBox(C, x - 0.1, y - 0.1, z, x + 0.1, y + 0.1, z + 0.35, P.black);
  solidBox(C, x - 0.17, y - 0.17, z + 2.2, x + 0.17, y + 0.17, z + 2.65, P.lantern, P.black);
  C.mb.pyramid(x - 0.2, y - 0.2, x + 0.2, y + 0.2, z + 2.65, z + 2.85, P.black);
  C.world.lamps.push({ x, y, z: z + 2.4, r: 3.0, color: [1.0, 0.82, 0.55], k: 0.85, kind: 'park' });
  C.world.lampHeads.push({ x, y, z: z + 2.42, kind: 'park' });
  C.world.perches.push({ x, y, z: z + 2.85 });
}

// Traffic + pedestrian signal pole on a corner. cx,cy = intersection centre
export function signalPole(C, x, y, sx, sy, i, j) {
  // sx, sy: which quadrant (+1/-1) relative to the intersection centre
  const P = propTex(C);
  const z = CURB, h = 3.3;
  solidBox(C, x - 0.06, y - 0.06, z, x + 0.06, y + 0.06, z + h, P.poleDark);
  // street name signs
  solidBox(C, x - 0.5, y - 0.02, z + h - 0.15, x + 0.5, y + 0.02, z + h, P.streetSign);
  solidBox(C, x - 0.02, y - 0.5, z + h + 0.02, x + 0.02, y + 0.5, z + h + 0.17, P.streetSign);
  // vehicle heads facing outward along x and y (near-side signals)
  const hz = z + h - 1.05;
  // head facing x (for traffic approaching along x toward the intersection from side sx)
  const hx = x + sx * 0.05, hy = y - sy * 0.18;
  solidBox(C, hx - 0.12, hy - 0.12, hz, hx + 0.12, hy + 0.12, hz + 0.75, P.sigHead, P.yellow);
  C.world.signals.push({ i, j, axis: 'x', x: hx + sx * 0.13, y: hy, z: hz, face: [sx, 0], type: 'car' });
  const gx = x - sx * 0.18, gy = y + sy * 0.05;
  solidBox(C, gx - 0.12, gy - 0.12, hz - 0.1, gx + 0.12, gy + 0.12, hz + 0.65, P.sigHead, P.yellow);
  C.world.signals.push({ i, j, axis: 'y', x: gx, y: gy + sy * 0.13, z: hz - 0.1, face: [0, sy], type: 'car' });
  // pedestrian heads facing across the crosswalks
  const pz = z + 1.6;
  const px = x - sx * 0.12, py = y;
  solidBox(C, px - 0.1, py - 0.1, pz, px + 0.1, py + 0.1, pz + 0.38, P.pedHead, P.yellow);
  C.world.signals.push({ i, j, axis: 'x', x: px - sx * 0.11, y: py, z: pz + 0.08, face: [-sx, 0], type: 'ped' });
  const qx = x, qy = y - sy * 0.12;
  solidBox(C, qx - 0.1, qy - 0.1, pz + 0.4, qx + 0.1, qy + 0.1, pz + 0.78, P.pedHead, P.yellow);
  C.world.signals.push({ i, j, axis: 'y', x: qx, y: qy - sy * 0.11, z: pz + 0.48, face: [0, -sy], type: 'ped' });
  C.world.perches.push({ x, y, z: z + h + 0.17 });
}

export function hydrant(C, x, y) {
  const P = propTex(C);
  const z = CURB;
  solidBox(C, x - 0.14, y - 0.14, z, x + 0.14, y + 0.14, z + 0.45, P.hydrant, P.hydrantTop);
  solidBox(C, x - 0.22, y - 0.05, z + 0.2, x + 0.22, y + 0.05, z + 0.3, P.hydrant, P.hydrant);
  C.world.hydrants.push({ x, y });
}

export function mailbox(C, x, y) {
  const P = propTex(C);
  solidBox(C, x - 0.3, y - 0.25, CURB, x + 0.3, y + 0.25, CURB + 0.85, P.mailbox, P.blue);
}

export function newsBoxes(C, x, y, ax) {
  const P = propTex(C);
  for (let k = 0; k < 3; k++) {
    const ox = ax === 'x' ? k * 0.42 : 0, oy = ax === 'y' ? k * 0.42 : 0;
    solidBox(C, x + ox - 0.18, y + oy - 0.18, CURB, x + ox + 0.18, y + oy + 0.18, CURB + 0.55, P.newsBoxes[(k + Math.floor(x)) % 4]);
  }
}

export function trashBasket(C, x, y) {
  const P = propTex(C);
  solidBox(C, x - 0.2, y - 0.2, CURB, x + 0.2, y + 0.2, CURB + 0.6, P.basket, P.basketTop);
  C.world.trash.push({ x, y });
}

export function bench(C, x, y, axis, o = {}) {
  const P = propTex(C);
  const z = o.z ?? CURB;
  const L = 1.5;
  const [x0, x1, y0, y1] = axis === 'x' ? [x - L / 2, x + L / 2, y - 0.22, y + 0.22] : [x - 0.22, x + 0.22, y - L / 2, y + L / 2];
  solidBox(C, x0, y0, z + 0.3, x1, y1, z + 0.38, P.wood, P.wood);
  // backrest on the side away from 'facing'
  const f = o.facing ?? 1;
  if (axis === 'x') solidBox(C, x0, f > 0 ? y0 : y1 - 0.08, z + 0.38, x1, f > 0 ? y0 + 0.08 : y1, z + 0.8, P.wood, P.wood);
  else solidBox(C, f > 0 ? x0 : x1 - 0.08, y0, z + 0.38, f > 0 ? x0 + 0.08 : x1, y1, z + 0.8, P.wood, P.wood);
  for (const t of [0.1, 0.9]) {
    const lx = axis === 'x' ? x0 + (x1 - x0) * t : x, ly = axis === 'y' ? y0 + (y1 - y0) * t : y;
    solidBox(C, lx - 0.05, ly - 0.2, z, lx + 0.05, ly + 0.2, z + 0.3, P.black);
  }
  const seats = [];
  for (const t of [-0.45, 0, 0.45]) seats.push(axis === 'x' ? { x: x + t, y, z: z + 0.32, face: [0, f] } : { x, y: y + t, z: z + 0.32, face: [f, 0] });
  C.world.benches.push({ x, y, axis, seats, used: [false, false, false] });
}

export function steamStack(C, x, y) {
  const P = propTex(C);
  C.mb.cylinder(x, y, 0, 2.6, 0.32, 8, P.stack, P.stackTop);
  for (const [dx, dy] of [[-0.7, -0.6], [0.7, 0.6], [0.65, -0.7], [-0.6, 0.7]]) {
    C.mb.cylinder(x + dx, y + dy, 0, 0.62, 0.18, 6, P.barrel, P.orange);
  }
  C.world.steam.push({ x, y, z: 2.65, kind: 'stack', rate: 1.0 });
  markHeight(C.world, x - 0.4, y - 0.4, x + 0.4, y + 0.4, 2.6);
}

export function cone(C, x, y) {
  const P = propTex(C);
  C.mb.cone(x, y, CURB * 0, 0.45, 0.14, 6, P.cone, { mat: 0 });
}

export function kiosk(C, x, y) {
  const P = propTex(C);
  solidBox(C, x - 0.14, y - 0.14, CURB, x + 0.14, y + 0.14, CURB + 2.0, P.kiosk, P.black);
}

// Bus shelter along a curb. axis: direction of the street; side: which side is the road (+1/-1 on the normal axis)
export function busShelter(C, x, y, axis, roadSide) {
  const P = propTex(C);
  const z = CURB, L = 3, D = 0.9, H = 1.8;
  const [x0, x1, y0, y1] = axis === 'x' ? [x - L / 2, x + L / 2, y - D / 2, y + D / 2] : [x - D / 2, x + D / 2, y - L / 2, y + L / 2];
  // roof
  solidBox(C, x0 - 0.05, y0 - 0.05, z + H, x1 + 0.05, y1 + 0.05, z + H + 0.1, P.silver);
  // back glass wall (away from road)
  const back = axis === 'x' ? (roadSide > 0 ? y0 : y1) : (roadSide > 0 ? x0 : x1);
  if (axis === 'x') C.mb.vquad(x0, back, x1, back, z, z + H, P.glass, { mat: MAT.FLAT });
  else C.mb.vquad(back, y0, back, y1, z, z + H, P.glass, { mat: MAT.FLAT });
  // ad panel at one end
  if (axis === 'x') solidBox(C, x1 - 0.06, y0, z, x1, y1, z + H, P.adPanel, P.silver);
  else solidBox(C, x0, y1 - 0.06, z, x1, y1, z + H, P.adPanel, P.silver);
  // posts
  for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) solidBox(C, px - 0.04, py - 0.04, z, px + 0.04, py + 0.04, z + H, P.silver);
  bench(C, x, y, axis, { facing: axis === 'x' ? -roadSide : -roadSide });
  C.world.busStops.push({ x, y, axis, roadSide });
  C.world.lamps.push({ x, y, z: z + H, r: 1.8, color: [0.85, 0.9, 1.0], k: 0.4, kind: 'shelter' });
}

// Subway entrance: painted stairs + railings + green globes
export function subwayEntrance(C, x, y, axis) {
  const P = propTex(C);
  const z = CURB;
  const L = 2.5, W = 1.1;
  const [x0, x1, y0, y1] = axis === 'x' ? [x - L / 2, x + L / 2, y - W / 2, y + W / 2] : [x - W / 2, x + W / 2, y - L / 2, y + L / 2];
  C.paintGround(x0, y0, x1, y1, axis === 'x' ? 'stairsX' : 'stairsY');
  const rh = 0.75;
  if (axis === 'x') {
    C.mb.vquad(x0, y0, x1, y0, z, z + rh, P.subwayRail);
    C.mb.vquad(x1, y1, x0, y1, z, z + rh, P.subwayRail);
    C.mb.vquad(x1, y0, x1, y1, z, z + rh, P.subwayRail);
  } else {
    C.mb.vquad(x0, y1, x0, y0, z, z + rh, P.subwayRail);
    C.mb.vquad(x1, y0, x1, y1, z, z + rh, P.subwayRail);
    C.mb.vquad(x0, y1, x1, y1, z, z + rh, P.subwayRail);
  }
  // globes on posts at the open end
  const open = axis === 'x' ? [[x0, y0], [x0, y1]] : [[x0, y0], [x1, y0]];
  for (const [gx, gy] of open) {
    solidBox(C, gx - 0.05, gy - 0.05, z, gx + 0.05, gy + 0.05, z + 1.4, P.green);
    solidBox(C, gx - 0.13, gy - 0.13, z + 1.4, gx + 0.13, gy + 0.13, z + 1.65, P.globe);
    C.world.lamps.push({ x: gx, y: gy, z: z + 1.5, r: 1.6, color: [0.5, 1.0, 0.6], k: 0.5, kind: 'globe' });
  }
  // sign over the far end
  // two-sided sign (each side readable)
  const hs = 0.75; // sign is 24 texels wide
  if (axis === 'x') {
    C.mb.vquad(x1 + 0.02, y + hs, x1 + 0.02, y - hs, z + rh, z + rh + 0.44, P.subwaySign, { mat: MAT.NOSHADOW });
    C.mb.vquad(x1, y - hs, x1, y + hs, z + rh, z + rh + 0.44, P.subwaySign, { mat: MAT.NOSHADOW });
  } else {
    C.mb.vquad(x - hs, y1 + 0.02, x + hs, y1 + 0.02, z + rh, z + rh + 0.44, P.subwaySign, { mat: MAT.NOSHADOW });
    C.mb.vquad(x + hs, y1, x - hs, y1, z + rh, z + rh + 0.44, P.subwaySign, { mat: MAT.NOSHADOW });
  }
  const ent = axis === 'x' ? { x: x0 - 0.6, y } : { x, y: y0 - 0.6 };
  const bottom = axis === 'x' ? { x: x1 - 0.3, y } : { x, y: y1 - 0.3 };
  C.world.subways.push({ x: ent.x, y: ent.y, bx: bottom.x, by: bottom.y, axis });
}

// Low wall segment (park)
export function parkWall(C, x0, y0, x1, y1) {
  const P = propTex(C);
  C.mb.box(x0, y0, CURB, x1, y1, CURB + 0.7, { px: P.stoneWall, nx: P.stoneWall, py: P.stoneWall, ny: P.stoneWall, pz: { t: P.stoneWallTop, world: true } });
}

// Chain-link fence run (double-sided quad)
export function chainFence(C, xa, ya, xb, yb, h = 2.5, low = false) {
  const P = propTex(C);
  const tex = low ? P.chainLow : P.chain;
  const z = CURB;
  C.mb.vquad(xa, ya, xb, yb, z, z + h, tex, { mat: MAT.FLAT });
  // posts every ~2 units
  const len = Math.hypot(xb - xa, yb - ya);
  const n = Math.max(1, Math.round(len / 2));
  for (let k = 0; k <= n; k++) {
    const px = xa + ((xb - xa) * k) / n, py = ya + ((yb - ya) * k) / n;
    solidBox(C, px - 0.04, py - 0.04, z, px + 0.04, py + 0.04, z + h + 0.05, P.silver);
  }
  // top rail
  if (xa === xb) solidBox(C, xa - 0.03, Math.min(ya, yb), z + h - 0.04, xa + 0.03, Math.max(ya, yb), z + h + 0.02, P.silver);
  else solidBox(C, Math.min(xa, xb), ya - 0.03, z + h - 0.04, Math.max(xa, xb), ya + 0.03, z + h + 0.02, P.silver);
}

// Basketball hoop facing direction (fx, fy) toward the court
export function hoop(C, x, y, fx, fy) {
  const P = propTex(C);
  const z = CURB;
  solidBox(C, x - 0.09, y - 0.09, z, x + 0.09, y + 0.09, z + 2.4, P.blue);
  // arm toward the court
  const ax = x + fx * 0.6, ay = y + fy * 0.6;
  solidBox(C, Math.min(x, ax) - 0.05, Math.min(y, ay) - 0.05, z + 2.1, Math.max(x, ax) + 0.05, Math.max(y, ay) + 0.05, z + 2.2, P.blue);
  // backboard
  const bw = 0.9, bh = 1.05;
  if (fx !== 0) {
    C.mb.box(ax - 0.04, ay - bw, z + 1.85, ax + 0.04, ay + bw, z + 1.85 + bh, { px: P.backboard, nx: P.backboard, py: P.silver, ny: P.silver, pz: P.silver });
  } else {
    C.mb.box(ax - bw, ay - 0.04, z + 1.85, ax + bw, ay + 0.04, z + 1.85 + bh, { py: P.backboard, ny: P.backboard, px: P.silver, nx: P.silver, pz: P.silver });
  }
  // rim (four thin bars) + net
  const rx = ax + fx * 0.33, ry = ay + fy * 0.33, rr = 0.22, rz = z + 1.92;
  solidBox(C, rx - rr, ry - rr, rz, rx + rr, ry - rr + 0.04, rz + 0.04, P.rim);
  solidBox(C, rx - rr, ry + rr - 0.04, rz, rx + rr, ry + rr, rz + 0.04, P.rim);
  solidBox(C, rx - rr, ry - rr, rz, rx - rr + 0.04, ry + rr, rz + 0.04, P.rim);
  solidBox(C, rx + rr - 0.04, ry - rr, rz, rx + rr, ry + rr, rz + 0.04, P.rim);
  C.mb.vquad(rx - rr, ry, rx + rr, ry, rz - 0.38, rz, P.net, { mat: MAT.FLAT });
  C.mb.vquad(rx, ry - rr, rx, ry + rr, rz - 0.38, rz, P.net, { mat: MAT.FLAT });
  C.world.hoops.push({ x: rx, y: ry, z: rz, fx, fy, bx: x, by: y });
}

export function bleachers(C, x0, y0, x1, y1, axis, rows = 3) {
  const P = propTex(C);
  for (let r = 0; r < rows; r++) {
    const h = 0.3 + r * 0.3;
    if (axis === 'x') solidBox(C, x0, y0 + r * 0.45, CURB, x1, y0 + (r + 1) * 0.45, CURB + h, P.bleacher, P.bleacher);
    else solidBox(C, x0 + r * 0.45, y0, CURB, x0 + (r + 1) * 0.45, y1, CURB + h, P.bleacher, P.bleacher);
  }
  void y1;
}

export function handballWall(C, x0, y0, x1, y1, h) {
  const P = propTex(C);
  const W = Math.round(Math.max(x1 - x0, y1 - y0) * T), H = Math.round(h * T);
  const front = C.atlas.alloc(W, H);
  front.p.rect(0, 0, W, H, 0xb9b6ae);
  mural(front.p, 2, 2, W - 4, H - 10, C.rng);
  front.p.rect(0, H - 8, W, 1, 0xf2f2ee);
  const back = C.atlas.alloc(W, H);
  smoothFill(back.p, 0, 0, W, H, 0xb9b6ae, 4, 0.05);
  mural(back.p, 3, 3, W - 6, H - 12, C.rng);
  if (x1 - x0 > y1 - y0) C.mb.box(x0, y0, CURB, x1, y1, CURB + h, { py: front, ny: back, px: P.concrete, nx: P.concrete, pz: P.concrete });
  else C.mb.box(x0, y0, CURB, x1, y1, CURB + h, { px: front, nx: back, py: P.concrete, ny: P.concrete, pz: P.concrete });
  markHeight(C.world, x0, y0, x1, y1, CURB + h);
}

// Playground: swings + slide + climber
export function playground(C, x0, y0, x1, y1) {
  const P = propTex(C);
  const z = CURB;
  C.paintGround(x0, y0, x1, y1, 'rubber');
  // swing set
  const sx = x0 + 1.2, sy = y0 + 0.8;
  for (const dx of [0, 2.4]) {
    solidBox(C, sx + dx - 0.05, sy - 0.05, z, sx + dx + 0.05, sy + 0.05, z + 1.9, P.red);
    solidBox(C, sx + dx - 0.05, sy + 1.15, z, sx + dx + 0.05, sy + 1.25, z + 1.9, P.red);
  }
  solidBox(C, sx - 0.05, sy + 0.55, z + 1.85, sx + 2.45, sy + 0.65, z + 1.95, P.red);
  for (const dx of [0.7, 1.7]) {
    C.world.swings.push({ x: sx + dx, y: sy + 0.6, z: z + 0.45, top: z + 1.85 });
  }
  // slide: ladder tower + sloped chute
  const tx = x1 - 1.6, ty = y0 + 0.8;
  solidBox(C, tx, ty, z, tx + 0.8, ty + 0.8, z + 1.2, P.yellow, P.blue);
  const chute = C.atlas.shared('chute', 12, 16, (p) => { p.rect(0, 0, 12, 16, 0xe8c030); p.rect(0, 0, 1, 16, 0xc89a20); p.rect(11, 0, 1, 16, 0xc89a20); });
  C.mb.slope([tx + 0.05, ty + 2.6, z + 0.1], [tx + 0.75, ty + 2.6, z + 0.1], [tx + 0.05, ty + 0.8, z + 1.2], [tx + 0.75, ty + 0.8, z + 1.2], chute, { mat: MAT.SNOW });
  C.world.slides.push({ x: tx + 0.4, y: ty + 0.4, z: z + 1.2, ex: tx + 0.4, ey: ty + 2.5 });
  // climber dome (frame of bars)
  const cx = (x0 + x1) / 2, cy = y1 - 1.3;
  for (let k = -2; k <= 2; k++) {
    solidBox(C, cx + k * 0.35 - 0.03, cy - 0.8, z, cx + k * 0.35 + 0.03, cy + 0.8, z + 0.9 - Math.abs(k) * 0.15, P.blue);
    solidBox(C, cx - 0.8, cy + k * 0.35 - 0.03, z + 0.9 - Math.abs(k) * 0.15 - 0.06, cx + 0.8, cy + k * 0.35 + 0.03, z + 0.9 - Math.abs(k) * 0.15, P.green);
  }
}

export function scaffolding(C, fr, a0, a1) {
  // sidewalk shed: green plywood deck on pipe posts in front of a facade
  const P = propTex(C);
  const z = CURB, h = 2.4, d0 = -1.6, d1 = 0;
  fr.box(C.mb, a0, a1, d0, d1, z + h, z + h + 0.15, { front: P.scaffold, left: P.scaffold, right: P.scaffold, top: { t: P.scaffold } });
  for (let a = a0 + 0.1; a <= a1 - 0.05; a += 1.5) {
    fr.box(C.mb, a - 0.04, a + 0.04, d0 + 0.05, d0 + 0.13, z, z + h, { front: P.silver, left: P.silver, right: P.silver });
  }
  const p = fr.pt((a0 + a1) / 2, -0.8);
  C.world.lamps.push({ x: p[0], y: p[1], z: z + h, r: 1.6, color: [1, 0.95, 0.85], k: 0.5, kind: 'shed' });
}
