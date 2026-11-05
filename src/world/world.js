// Builds the whole static city: atlas textures, mesh, and metadata used by the simulation.

import { Atlas } from './atlas.js';
import { MeshBuilder } from './mesh.js';
import { MAP, T, NB, BLOCK_TYPES } from './layout.js';
import { paintGround, buildGroundGeometry } from './ground.js';
import { makeBaseTextures } from './textures.js';
import { makeContext, buildBlocks } from './blocks.js';
import { RNG } from '../core/math.js';

export function buildWorld(seed = 1977, progress = () => {}) {
  const rng = new RNG(seed);
  const atlas = new Atlas(2048);
  const groundReg = atlas.allocPage(MAP * T, MAP * T);
  progress('Paving streets');
  const groundInfo = paintGround(groundReg, rng);
  const tex = makeBaseTextures(atlas);
  const mb = new MeshBuilder();
  buildGroundGeometry(mb, groundReg, tex);

  const world = {
    rng, atlas, tex, ground: groundReg, groundInfo,
    heights: new Float32Array(MAP * MAP),
    lamps: [], lampHeads: [], trees: [], props: [], doors: [], officeDoors: [], benches: [], steam: [], signals: [],
    shops: [], stoopSeats: [], perches: [], pigeonCoops: [], beacons: [], flags: [], fountains: [], hydrants: [],
    trash: [], hoops: [], swings: [], slides: [], sprinklers: [], busStops: [], subways: [], carts: [], marquees: [],
    blocks: [],
  };
  for (let by = 0; by < NB; by++)
    for (let bx = 0; bx < NB; bx++) world.blocks.push({ bx, by, type: BLOCK_TYPES[by][bx] });

  progress('Raising buildings');
  const C = makeContext(world, mb, atlas, rng);
  buildBlocks(C);
  world.mesh = mb.finish();
  return world;
}
