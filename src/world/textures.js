// Shared tiled textures (soil cross-section, curb, brick, concrete, etc.)

import { BASE_DEPTH, T } from './layout.js';
import { hash2i, shade, mixc, RNG } from '../core/math.js';

export function makeBaseTextures(atlas) {
  const tex = {};
  tex.curb = atlas.shared('curb', 32, 2, (p) => {
    p.rect(0, 0, 32, 1, 0xd2cfc8);
    p.rect(0, 1, 32, 1, 0x9d9a93);
    for (let x = 0; x < 32; x += 8) p.set(x, 1, 0x86837c);
  });
  const H = BASE_DEPTH * T;
  tex.soil = atlas.shared('soil', 256, H, (p) => {
    const rng = new RNG(99);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < 256; x++) {
        const h = hash2i(x, y, 3);
        let c;
        const wav = Math.sin(x * 0.07) * 2 + Math.sin(x * 0.023 + 1) * 3;
        if (y < 3) c = y === 0 ? 0x6a6c72 : 0x55575c; // pavement crust
        else if (y < 18 + wav) c = shade(0x6b4b33, 0.88 + h * 0.2);
        else if (y < 46 + wav) c = shade(0x8e6b48, 0.9 + h * 0.18);
        else {
          // manhattan schist
          const band = Math.sin((x + y * 2.2) * 0.09) * 0.5 + 0.5;
          c = shade(mixc(0x5d6670, 0x7b838c, band), 0.85 + h * 0.25);
          if (h > 0.985) c = 0xc9d2da; // mica sparkle
        }
        p.set(x, y, c);
      }
    // pebbles
    for (let i = 0; i < 140; i++) {
      const x = rng.int(0, 255), y = rng.int(5, 44);
      p.rect(x, y, rng.int(1, 3), rng.int(1, 2), shade(0x9a8a78, rng.range(0.8, 1.2)));
    }
    // cracks in rock
    for (let i = 0; i < 18; i++) {
      let x = rng.int(0, 255), y = rng.int(50, H - 4);
      for (let k = 0; k < 18; k++) { p.set(x, y, 0x434a52); x += rng.int(-1, 1); y += 1; }
    }
    // utility pipes in cross-section
    const pipes = [
      [30, 26, 5, 0x8b8f96, 0x5a5e66], [74, 32, 4, 0xd7d2c8, 0x9c968a], [120, 24, 3, 0xd08a2e, 0x8e5c1c],
      [168, 34, 6, 0x5b6f86, 0x3d4b5c], [214, 28, 4, 0xd7d2c8, 0x9c968a], [240, 38, 3, 0x7a7d84, 0x55585e],
    ];
    for (const [cx, cy, r, c1, c2] of pipes) {
      p.ellipse(cx, cy, r + 1, r + 1, 0x3a2a20);
      p.ellipse(cx, cy, r, r, c2);
      p.ellipse(cx - 1, cy - 1, r - 1, r - 1, c1);
    }
    // bottom edge shadow
    p.rect(0, H - 1, 256, 1, 0x2f343a);
  });
  return tex;
}
