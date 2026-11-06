// Builds the whole static city: atlas textures, mesh, and metadata used by the simulation.

import { Atlas } from './atlas.js';
import { MeshBuilder } from './mesh.js';
import { MAP, T, NB, BLOCK_TYPES } from './layout.js';
import { paintGround, buildGroundGeometry, buildSlabSides } from './ground.js';
import { makeBaseTextures } from './textures.js';
import { makeContext, buildBlocks } from './blocks.js';
import { RNG } from '../core/math.js';
import { Page, Painter } from '../core/painter.js';

export function buildWorld(seed = 1977, progress = () => {}) {
  const rng = new RNG(seed);
  const atlas = new Atlas(2048);
  // the ground gets its own texture (MAP*T texels square)
  const groundPage = new Page(MAP * T, MAP * T);
  const groundReg = { layer: 0, x: 0, y: 0, w: MAP * T, h: MAP * T, p: new Painter(groundPage, 0, 0, MAP * T, MAP * T), page: groundPage };
  const prof = [], tick = (name) => prof.push([name, performance.now()]);
  tick('start');
  progress('Paving streets');
  const groundInfo = paintGround(groundReg, rng);
  tick('ground');
  const tex = makeBaseTextures(atlas);
  const mb = new MeshBuilder();
  buildGroundGeometry(mb, groundReg, tex);
  buildSlabSides(mb, atlas, tex);

  const world = {
    rng, atlas, tex, ground: groundReg, groundPage, groundInfo,
    heights: new Float32Array(MAP * MAP),
    lamps: [], lampHeads: [], trees: [], props: [], doors: [], officeDoors: [], benches: [], steam: [], signals: [],
    shops: [], stoopSeats: [], perches: [], pigeonCoops: [], beacons: [], flags: [], fountains: [], hydrants: [],
    trash: [], hoops: [], swings: [], slides: [], sprinklers: [], busStops: [], subways: [], carts: [], marquees: [], grates: [], canopies: [], extraNets: [],
    blocks: [],
  };
  for (let by = 0; by < NB; by++)
    for (let bx = 0; bx < NB; bx++) world.blocks.push({ bx, by, type: BLOCK_TYPES[by][bx] });

  tick('base');
  progress('Raising buildings');
  const C = makeContext(world, mb, atlas, rng);
  buildBlocks(C);
  tick('blocks');
  world.mesh = mb.finish();
  tick('mesh');
  world.buildProfile = prof.slice(1).map(([n, t], i) => `${n} ${Math.round(t - prof[i][1])}ms`).join(', ');
  return world;
}
