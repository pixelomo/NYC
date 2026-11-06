// Static sprite props (trees with seasonal palettes, rooftop props, flags), glows and lamps.

import { TREE_SPECIES, paintTree, treePalette, PROP_COLORS, S } from '../render/sprites.js';
import { SF } from '../render/spriteLayer.js';
import { RNG, hash1 } from '../core/math.js';
import { CURB } from '../world/layout.js';

export class Statics {
  constructor(city) {
    this.city = city;
    const { atlas, pal, world } = city;
    this.treeFrames = {};
    for (const sp in TREE_SPECIES) {
      if (sp === 'xmas') continue;
      this.treeFrames[sp] = [0, 1, 2].map((v) => atlas.add(`tree_${sp}_${v}`, TREE_SPECIES[sp].w, TREE_SPECIES[sp].h, (s) => paintTree(s, TREE_SPECIES[sp], 1000 + v * 77 + sp.length * 13)));
    }
    this.treeRows = {};
    for (const sp in TREE_SPECIES) {
      if (sp === 'xmas') continue;
      this.treeRows[sp] = [pal.alloc(), pal.alloc()];
    }
    this.propRow = pal.alloc(PROP_COLORS);
    // variant palettes for props
    this.laundryRow = pal.alloc({ ...PROP_COLORS, [S.C5]: 0xe84a5f, [S.C6]: 0xf2c230, [S.C7]: 0x5aa0d8, [S.C1]: 0xf2f2f0 });
    this.statueRow = pal.alloc({ ...PROP_COLORS, [S.C9]: 0x4f9a86, [S.C10]: 0xffd860 });
    this.flagRow = pal.alloc({ [S.C1]: 0xd8302c, [S.C2]: 0xf2f2f0, [S.C3]: 0x9a9da3, [S.C7]: 0x23366e, [S.C6]: 0x8a2a6a });
    this.glowRows = {
      street: pal.alloc({ [S.C1]: [0xfff0c8, 128] }),
      park: pal.alloc({ [S.C1]: [0xffd890, 128] }),
      flood: pal.alloc({ [S.C1]: [0xf0f6ff, 128] }),
      red: pal.alloc({ [S.C1]: [0xff3020, 128] }),
      yellow: pal.alloc({ [S.C1]: [0xffc020, 128] }),
      green: pal.alloc({ [S.C1]: [0x30ff90, 128] }),
      walk: pal.alloc({ [S.C1]: [0xf0f4ff, 128] }),
      hand: pal.alloc({ [S.C1]: [0xff7a20, 128] }),
      beacon: pal.alloc({ [S.C1]: [0xff2020, 128] }),
    };
    this.xmasRow = pal.alloc();
    treePalette(pal, 'pine', 3, true, 0x4a3626, this.xmasRow);
    this.season = -1;
    this.snowy = null;
    const rng = new RNG(5);
    this.lampDelay = world.lamps.map(() => rng.range(0, 0.6));
    this.lampFlicker = world.lamps.map(() => (rng.chance(0.04) ? rng.range(0.5, 2) : 0));
    this.frames = {};
    for (const n of ['dish', 'antenna', 'deckchair', 'bush', 'grill', 'laundry', 'statue', 'xmas', 'snowman', 'glow', 'lamp2', 'lamp1', 'beacon', 'treeBundle', 'cartUmbrella', 'pedWalk', 'pedHand', 'tsqBall']) this.frames[n] = atlas.get(n);
    this.ballRows = [0xf2f6ff, 0x6ab8ff, 0xff6ad8, 0xffd84f].map((c) => pal.alloc({ [S.C1]: c, [S.C2]: 0xffffff }));
    this.umbRows = {
      hotdog: pal.alloc({ [S.C1]: 0xf2c230, [S.C2]: 0x1f4fa0, [S.C3]: 0x9a9da3 }),
      halal: pal.alloc({ [S.C1]: 0xf2f2ee, [S.C2]: 0xc8302c, [S.C3]: 0x9a9da3 }),
      pretzel: pal.alloc({ [S.C1]: 0xf2c230, [S.C2]: 0x2f8a46, [S.C3]: 0x9a9da3 }),
    };
    this.flagFrames = { us: [0, 1, 2, 3].map((f) => atlas.get('flag_us' + f)), hotel: [0, 1, 2, 3].map((f) => atlas.get('flag_hotel' + f)) };
    // christmas tree sellers (winter) along a brownstone block
    this.treeSellers = [];
    const ws = world.stoopSeats.length ? world.stoopSeats[Math.floor(world.stoopSeats.length * 0.6)] : null;
    if (ws) this.treeSellers.push({ x: ws.x + ws.n[0] * 2.4, y: ws.y + ws.n[1] * 2.4, n: ws.n });
  }
  updatePalettes(env) {
    const s = env.season;
    const snowy = env.snowCover > 0.3;
    if (s === this.season && snowy === this.snowy) return;
    this.season = s; this.snowy = snowy;
    for (const sp in this.treeRows) {
      const [a, b] = this.treeRows[sp];
      const bark = TREE_SPECIES[sp].bark;
      treePalette(this.city.pal, sp, s, snowy, bark, a);
      treePalette(this.city.pal, sp, s, snowy, bark, b);
      // second row: slight variation (autumn trees turning at different rates)
      if (s === 2) {
        this.city.pal.set(b, S.LEAF_M, sp === 'oak' ? 0xc8501e : 0xe0a030);
        this.city.pal.set(b, S.LEAF_L, sp === 'oak' ? 0xe8783a : 0xf8c84a);
      }
      if (s === 1) this.city.pal.set(b, S.LEAF_M, 0x4a9a3a);
    }
  }
  emit(L, env, cam, time, view) {
    const world = this.city.world;
    this.updatePalettes(env);
    const vis = (x, y, z, m = 6) => view.visible(x, y, z, m);
    // trees
    for (let i = 0; i < world.trees.length; i++) {
      const t = world.trees[i];
      if (!vis(t.x, t.y, t.z + 2, 6)) continue;
      const fr = this.treeFrames[t.species][t.variant];
      const rows = this.treeRows[t.species];
      L.push(t.x, t.y, t.z, fr, rows[i % 2], SF.TALL);
    }
    // props
    for (const p of world.props) {
      if (!vis(p.x, p.y, p.z, 3)) continue;
      if (p.group === 'warm' && !(env.season === 1 || env.season === 0)) continue;
      if (p.kind === 'deckchair' && env.season === 3) continue;
      const fr = this.frames[p.kind];
      if (!fr) continue;
      const row = p.kind === 'laundry' ? this.laundryRow : p.kind === 'statue' ? this.statueRow : p.kind === 'cartUmbrella' ? this.umbRows[p.cart] || this.propRow : this.propRow;
      L.push(p.x, p.y, p.z, fr, row, p.kind === 'statue' ? SF.TALL : 0);
    }
    // flags wave
    for (const f of world.flags) {
      const tip = f.tip || f;
      if (!vis(tip.x, tip.y, f.z, 2)) continue;
      const k = Math.floor(time * (3 + env.wind * 4) + f.x) % 4;
      const fr = this.flagFrames[f.type === 'hotel' ? 'hotel' : 'us'][k];
      const flip = cam.screenDirX(f.n[0], f.n[1]) < 0;
      L.push(tip.x, tip.y, f.z - 0.55, fr, this.flagRow, flip ? SF.FLIP : 0, 1, 0.002);
    }
    // winter: christmas tree at park centre, sellers
    if (env.season === 3 && world.parkCenter) {
      const c = world.parkCenter;
      L.push(c.x, c.y, c.z ?? CURB + 1.0, this.frames.xmas, this.xmasRow, SF.TALL);
      for (const s of this.treeSellers) {
        for (let k = 0; k < 5; k++) {
          const ox = s.n[1] * (k - 2) * 0.35, oy = -s.n[0] * (k - 2) * 0.35;
          L.push(s.x + ox, s.y + oy, CURB, this.frames.treeBundle, this.treeRows.pine[0], 0);
        }
      }
    }
    // lamp head glows
    const lampsOn = env.lampsOn;
    if (lampsOn) {
      for (const h of world.lampHeads) {
        if (!vis(h.x, h.y, h.z, 2)) continue;
        L.push(h.x, h.y, h.z - 0.02, this.frames.glow, this.glowRows[h.kind] ?? this.glowRows.street, SF.EMISSIVE | SF.NOSHADOW, 1, 0.01);
      }
    }
    // the ball on the Times Square tower: cycles colour, and drops on winter midnights
    if (world.ball && vis(world.ball.x, world.ball.y, world.ball.z1, 3)) {
      const b = world.ball, h = env.hour;
      let z = b.z1;
      if (env.season === 3 && (h >= 23.75 || h < 0.1)) z = b.z1 + (b.z0 - b.z1) * (h >= 23.75 ? (h - 23.75) / 0.25 : 1);
      L.push(b.x, b.y, z - 0.2, this.frames.tsqBall, this.ballRows[Math.floor(time * 0.6) % this.ballRows.length], SF.EMISSIVE | SF.NOSHADOW, 1, 0.01);
    }
    // beacons blink
    const blink = (time % 1.6) < 0.5;
    if (blink) for (const b of world.beacons) L.push(b.x, b.y, b.z, this.frames.beacon, this.glowRows.beacon, SF.EMISSIVE | SF.NOSHADOW, 1, 0.01);
    // traffic signal lamps
    const tr = this.city.traffic;
    if (tr) {
      const vd = cam.viewDir();
      for (const s of world.signals) {
        if (s.face[0] * vd[0] + s.face[1] * vd[1] <= 0.05) continue;
        if (!vis(s.x, s.y, s.z, 1)) continue;
        const st = tr.signalState(s.i, s.j);
        if (s.type === 'car' && st.flash) {
          const c = s.axis === 'x' ? st.ew : st.ns;
          if ((time % 1.2) > 0.6) continue;
          const top = s.z + 0.75;
          L.push(s.x, s.y, c === 'fr' ? top - 0.19 : top - 0.44, this.frames.lamp2, this.glowRows[c === 'fr' ? 'red' : 'yellow'], SF.EMISSIVE | SF.NOSHADOW, 1, 0.02);
          continue;
        }
        if (s.type === 'car') {
          const c = s.axis === 'x' ? st.ew : st.ns; // 'g','y','r'
          const top = s.z + (s.axis === 'x' ? 0.75 : 0.75);
          const z = c === 'r' ? top - 0.19 : c === 'y' ? top - 0.44 : top - 0.69;
          L.push(s.x, s.y, z, this.frames.lamp2, this.glowRows[c === 'r' ? 'red' : c === 'y' ? 'yellow' : 'green'], SF.EMISSIVE | SF.NOSHADOW, 1, 0.02);
        } else {
          const w = s.axis === 'x' ? st.walkEW : st.walkNS; // 'walk','flash','dont'
          if (w === 'flash' && (time % 1) > 0.5) continue;
          L.push(s.x, s.y, s.z + 0.02, w === 'walk' ? this.frames.pedWalk : this.frames.pedHand, this.glowRows[w === 'walk' ? 'walk' : 'hand'], SF.EMISSIVE | SF.NOSHADOW, 1, 0.02);
        }
      }
    }
  }
  // light-map contributions of static lamps
  lights(LL, env, time) {
    const world = this.city.world;
    const dark = env.darkness;
    const shopsOpen = env.hour >= 7 && env.hour < 22.5;
    for (let i = 0; i < world.lamps.length; i++) {
      const l = world.lamps[i];
      let k = l.k;
      if (l.kind === 'street' || l.kind === 'park' || l.kind === 'flood' || l.kind === 'globe' || l.kind === 'shelter' || l.kind === 'shed') {
        if (!env.lampsOn) continue;
        // staggered switch-on
        const on = Math.min(1, Math.max(0, (dark - 0.35 - this.lampDelay[i] * 0.3) * 6));
        if (on <= 0) continue;
        k *= on;
        if (this.lampFlicker[i]) {
          const f = Math.sin(time * 13 * this.lampFlicker[i]) + Math.sin(time * 31 + i);
          if (f > 1.2) k *= 0.15;
        }
        if (l.kind === 'flood') k *= env.hour > 23 || env.hour < 6 ? 0 : 1;
      } else if (l.kind === 'screen') {
        // giant video screens wash the square in shifting colour, strongest at night
        k *= 0.15 + Math.max(0, dark - 0.15) * 1.25;
        const a = time * 0.35 + i * 1.7;
        LL.add(l.x, l.y, l.r, [0.62 + 0.38 * Math.sin(a), 0.62 + 0.38 * Math.sin(a + 2.1), 0.62 + 0.38 * Math.sin(a + 4.2)], k * 0.85);
        continue;
      } else if (l.kind === 'shop') {
        if (!shopsOpen) continue;
        k *= Math.max(0, dark - 0.2) * 1.3;
      } else {
        k *= Math.max(0, dark - 0.25) * 1.4;
        if (l.kind === 'neon') k *= 0.8 + 0.2 * Math.sin(time * 9 + i);
      }
      if (k > 0.01) LL.add(l.x, l.y, l.r, l.color, k * 0.85);
    }
    void hash1;
  }
}
