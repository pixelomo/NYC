// Builds the city. The ground, its geometry and the bridges come first, in one go; everything else
// (each block, each lot across the rivers, the park, Times Square, the quays...) is a job with a
// place, and a CityBuilder runs the jobs nearest the camera first, a few milliseconds at a time, so
// the page never freezes and what you look at appears first. Each batch of jobs becomes a chunk of
// geometry for the renderer; painted textures are sent to the GPU as they are made and their CPU
// copies let go.

import { Atlas } from './atlas.js';
import { MeshBuilder } from './mesh.js';
import { MAPX, MAPY, T, GT, NBX, NBY, BLOCK_TYPES, CURB } from './layout.js';
import { paintGround, buildGroundGeometry, buildSlabSides, makeGroundTiles, makeGroundPainter, landRaster } from './ground.js';
import { makeBaseTextures } from './textures.js';
import { makeContext, planBlocks } from './blocks.js';
import { RNG } from '../core/math.js';

export function startWorld(seed = 1977, progress = () => {}) {
  const rng = new RNG(seed);
  const atlas = new Atlas(2048);
  // the ground gets its own texture, at GT texels per unit, in tiles covering only the land; it is
  // painted at T texels per unit through a painter that keeps one texel in T / GT
  landRaster();
  const groundTiles = makeGroundTiles();
  const groundReg = { layer: 0, x: 0, y: 0, w: MAPX * T, h: MAPY * T, p: makeGroundPainter(groundTiles), tiles: groundTiles, scale: GT / T };
  const prof = [], tick = (name) => prof.push([name, performance.now()]);
  tick('start');
  progress('Paving streets');
  const groundInfo = paintGround(groundReg, rng);
  tick('ground');
  const tex = makeBaseTextures(atlas);
  const mb = new MeshBuilder();
  buildGroundGeometry(mb, groundReg, tex, tex.quay, tex.boroPave);
  buildSlabSides(mb, atlas, tex);

  const world = {
    rng, atlas, tex, ground: groundReg, groundTiles, groundInfo,
    heights: new Float32Array(MAPX * MAPY),
    lamps: [], lampHeads: [], trees: [], props: [], doors: [], officeDoors: [], benches: [], steam: [], signals: [],
    shops: [], stoopSeats: [], perches: [], pigeonCoops: [], beacons: [], flags: [], fountains: [], hydrants: [],
    trash: [], hoops: [], swings: [], slides: [], sprinklers: [], busStops: [], subways: [], carts: [], marquees: [], grates: [], canopies: [], extraNets: [], solids: [], poles: [],
    blocks: [],
  };
  for (let by = 0; by < NBY; by++)
    for (let bx = 0; bx < NBX; bx++) world.blocks.push({ bx, by, type: BLOCK_TYPES[by][bx] });
  tick('base');
  const C = makeContext(world, mb, atlas, rng);
  const jobs = planBlocks(C); // (builds the bridges as it plans)
  world.mesh = mb.finish();
  C.mb = new MeshBuilder();
  tick('bridges');
  world.buildProfile = prof.slice(1).map(([n, t], i) => `${n} ${Math.round(t - prof[i][1])}ms`).join(', ');
  return { world, builder: new CityBuilder(world, C, jobs) };
}

const keySeed = (k) => { let h = 2166136261; for (const ch of k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) % 1000000; };

export class CityBuilder {
  constructor(world, C, jobs) {
    this.world = world;
    this.C = C;
    this.jobs = jobs;
    this.total = jobs.length;
    this.done = 0;
    this.ms = 0;
    // jobs can make jobs (the blocks across the rivers)
    C.defer = (key, x, y, fn) => { this.jobs.push({ key, x, y, fn }); this.total++; };
  }
  get finished() { return this.jobs.length === 0; }
  get progress() { return this.total ? this.done / this.total : 1; }
  // how far a job is from (x, y): whole-width jobs only count the distance up or down the map
  dist(j, x, y) {
    const dy = j.y - y;
    return j.wide ? dy * dy : (j.x - x) * (j.x - x) * 0.5 + dy * dy;
  }
  // any job left within r of (x, y)?
  pendingNear(x, y, r) {
    return this.jobs.some((j) => !j.last && this.dist(j, x, y) < r * r);
  }
  // run the jobs nearest (x, y) for up to ms milliseconds; returns how many ran
  run(x, y, ms) {
    const t0 = performance.now();
    let n = 0;
    while (this.jobs.length && performance.now() - t0 < ms) {
      const others = this.jobs.some((j) => !j.last);
      let bi = -1, bd = Infinity;
      for (let i = 0; i < this.jobs.length; i++) {
        const j = this.jobs[i];
        if (j.last && others) continue;
        const d = this.dist(j, x, y);
        if (d < bd) { bd = d; bi = i; }
      }
      const j = this.jobs.splice(bi, 1)[0];
      this.runJob(j);
      n++;
    }
    this.ms += performance.now() - t0;
    return n;
  }
  runJob(j) {
    const C = this.C, rng0 = C.rng, z0 = C.z0;
    C.rng = new RNG(keySeed(j.key));
    C.z0 = CURB;
    try { j.fn(); } catch (e) { console.error(`city builder: ${j.key}`, e); }
    C.rng = rng0; C.z0 = z0;
    this.done++;
  }
  // the geometry made since last time (null if none)
  take() {
    const mb = this.C.mb;
    if (!mb.ni) return null;
    this.C.mb = new MeshBuilder();
    return mb.finish();
  }
}
