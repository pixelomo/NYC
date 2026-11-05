// Shared tiled textures for the diorama: soil cross-section and curbs (2x density).

import { BASE_DEPTH, T } from './layout.js';
import { hash2i, shade, mixc, RNG } from '../core/math.js';

export function makeBaseTextures(atlas) {
  const tex = {};
  tex.curb = atlas.shared('curb', 64, 4, (p) => {
    for (let x = 0; x < 64; x++) {
      p.set(x, 0, 0xe2dfd8);
      p.set(x, 1, shade(0xc8c5be, 0.97 + hash2i(x, 1, 3) * 0.06));
      p.set(x, 2, shade(0xb0ada6, 0.97 + hash2i(x, 2, 3) * 0.06));
      p.set(x, 3, 0x8a877f);
    }
    for (let x = 0; x < 64; x += 16) { p.set(x, 1, 0x8a877f); p.set(x, 2, 0x8a877f); }
  });
  const H = BASE_DEPTH * T;
  const W = 512;
  tex.soil = atlas.shared('soil', W, H, (p) => {
    const rng = new RNG(99);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const h = hash2i(x, y, 3);
        let c;
        const wav = Math.sin(x * 0.035) * 4 + Math.sin(x * 0.0115 + 1) * 6;
        if (y < 3) c = y === 0 ? 0x7a7c82 : 0x5c5e63; // pavement crust
        else if (y < 6) c = 0x8a8478; // gravel bed
        else if (y < 36 + wav) c = shade(0x6b4b33, 0.86 + h * 0.22);
        else if (y < 92 + wav) {
          const band = Math.sin(y * 0.4 + x * 0.02) * 0.5 + 0.5;
          c = shade(mixc(0x8e6b48, 0x9a7650, band * 0.5), 0.88 + h * 0.2);
        } else {
          // Manhattan schist with foliation and mica
          const fol = Math.sin((x + y * 2.2) * 0.045 + Math.sin(x * 0.01) * 2) * 0.5 + 0.5;
          c = shade(mixc(0x5a636d, 0x7b838c, fol), 0.84 + h * 0.24);
          if (h > 0.988) c = 0xd0d8e0;
        }
        p.set(x, y, c);
      }
    // pebbles and roots
    for (let i = 0; i < 320; i++) {
      const x = rng.int(0, W - 1), y = rng.int(8, 88);
      const w = rng.int(2, 5), hh = rng.int(1, 3);
      const c = shade(0x9a8a78, rng.range(0.75, 1.2));
      p.rect(x, y, w, hh, c);
      p.hline(x, y, w, shade(c, 1.2));
    }
    for (let i = 0; i < 24; i++) {
      let x = rng.int(0, W - 1), y = 6;
      for (let k = 0; k < rng.int(10, 26); k++) { p.set(x, y, 0x4a3424); x += rng.int(-1, 1); y += 1; }
    }
    // cracks in rock
    for (let i = 0; i < 36; i++) {
      let x = rng.int(0, W - 1), y = rng.int(100, H - 6);
      for (let k = 0; k < 32; k++) { p.set(x, y, 0x3e454c); p.set(x + 1, y, 0x6e7680); x += rng.int(-1, 1); y += 1; }
    }
    // utility pipes in cross-section (water main, steam, gas, electrical conduit bank)
    const pipes = [
      [60, 48, 10, 0x8b8f96, 0x5a5e66], [148, 60, 8, 0xd7d2c8, 0x9c968a], [240, 46, 6, 0xd08a2e, 0x8e5c1c],
      [336, 66, 12, 0x5b6f86, 0x3d4b5c], [428, 52, 8, 0xd7d2c8, 0x9c968a], [480, 74, 6, 0x7a7d84, 0x55585e],
    ];
    for (const [cx, cy, r, c1, c2] of pipes) {
      p.ellipse(cx, cy, r + 2, r + 2, 0x3a2a20);
      p.ellipse(cx, cy, r, r, c2);
      p.ellipse(cx - 1, cy - 1, r - 2, r - 2, c1);
      p.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.3, r * 0.3, shade(c1, 1.2));
      p.ring(cx, cy, r, r, 1, shade(c2, 0.8));
    }
    // conduit bank (concrete block with ducts)
    p.rect(180, 70, 30, 20, 0x9a968c);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) p.ellipse(186 + k * 9, 76 + j * 8, 3, 3, 0x2a2a2c);
    // bottom edge
    p.rect(0, H - 2, W, 2, 0x2a2f35);
  });
  return tex;
}
