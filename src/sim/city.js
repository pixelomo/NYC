// Orchestrates all dynamic systems and feeds the render layers each frame.

import { SpriteAtlas, PaletteBank, buildPropSprites } from '../render/sprites.js';
import { SpriteLayer } from '../render/spriteLayer.js';
import { LightLayer } from '../render/lightLayer.js';
import { CarLayer } from '../render/carLayer.js';
import { Statics } from './statics.js';
import { Traffic } from './traffic.js';
import { People } from './people.js';
import { Activities } from './activities.js';
import { Animals } from './animals.js';
import { Particles } from './particles.js';

export class City {
  constructor(gl, renderer, world, env, camera) {
    this.gl = gl;
    this.renderer = renderer;
    this.world = world;
    this.env = env;
    this.camera = camera;
    this.atlas = new SpriteAtlas();
    buildPropSprites(this.atlas);
    this.pal = new PaletteBank(2048);
    this.statics = new Statics(this);
    this.carLayer = new CarLayer(gl, this);
    this.traffic = new Traffic(this);
    this.systems = [];
    this.sprites = new SpriteLayer(gl, this.atlas, this.pal);
    this.lightLayer = new LightLayer(gl);
    renderer.addLayer({ light: (ctx) => this.lightLayer.light(ctx) });
    renderer.addLayer({
      shadow: (ctx) => { this.carLayer.shadow(ctx); this.sprites.shadow(ctx); },
      draw: (ctx) => { this.carLayer.draw(ctx); this.sprites.draw(ctx); },
    });
    this.view = { bw: 0, bh: 0, tsx: 0, tsy: 0, visible: () => true };
    this.time = 0;
    this.people = new People(this);
    this.activities = new Activities(this);
    this.people.activities = this.activities;
    this.animals = new Animals(this);
    this.particles = new Particles(this);
    this.addSystem(this.people);
    this.addSystem(this.activities);
    this.addSystem(this.animals);
    this.addSystem(this.particles);
    this.traffic.init();
    this.people.init();
  }
  addSystem(s) {
    this.systems.push(s);
    return s;
  }
  update(dt) {
    this.time += dt;
    this.traffic.update(dt);
    for (const s of this.systems) s.update && s.update(dt);
  }
  computeView(canvasW, canvasH) {
    const cam = this.camera;
    const scale = cam.scale;
    const bw = Math.ceil(canvasW / scale) + 4, bh = Math.ceil(canvasH / scale) + 4;
    const t = cam.project(cam.x, cam.y, 0);
    const v = this.view;
    v.bw = bw; v.bh = bh; v.tsx = t[0]; v.tsy = t[1];
    const hw = bw / 2, hh = bh / 2;
    v.visible = (x, y, z, m = 2) => {
      const p = cam.project(x, y, z);
      const mm = m * 16;
      return Math.abs(p[0] - t[0]) < hw + mm && p[1] - t[1] < hh + mm && t[1] - p[1] < hh + mm * 2;
    };
    return v;
  }
  prepare(canvasW, canvasH) {
    const view = this.computeView(canvasW, canvasH);
    const env = this.env;
    const L = this.sprites;
    L.begin();
    this.statics.emit(L, env, this.camera, this.time, view);
    for (const s of this.systems) s.emit && s.emit(L, view);
    L.end();
    this.carLayer.prepare(this.traffic.cars, this.time, env, view);
    const LL = this.lightLayer;
    LL.begin();
    this.statics.lights(LL, env, this.time);
    this.carLayer.lights(LL, this.traffic.cars, env);
    for (const s of this.systems) s.lights && s.lights(LL, env);
    LL.end();
  }
}
