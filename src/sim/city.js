// Orchestrates all dynamic systems and feeds the render layers each frame.

import { SpriteAtlas, PaletteBank, buildPropSprites } from '../render/sprites.js';
import { SpriteLayer } from '../render/spriteLayer.js';
import { LightLayer } from '../render/lightLayer.js';
import { CarLayer } from '../render/carLayer.js';
import { PersonLayer } from '../render/personLayer.js';
import { TreeLayer } from '../render/treeLayer.js';
import { Statics } from './statics.js';
import { Traffic } from './traffic.js';
import { People } from './people.js';
import { Activities } from './activities.js';
import { Animals } from './animals.js';
import { Particles } from './particles.js';
import { Subway } from './subway.js';
import { Player } from './player.js';
import { Vehicles } from './vehicles.js';
import { Poles } from './poles.js';
import { Collision } from './collide.js';
import { DecalLayer } from '../render/decalLayer.js';
import { T } from '../world/layout.js';

export class City {
  constructor(gl, renderer, world, env, camera) {
    this.gl = gl;
    this.renderer = renderer;
    this.world = world;
    this.env = env;
    this.camera = camera;
    this.atlas = new SpriteAtlas();
    buildPropSprites(this.atlas);
    this.pal = new PaletteBank(4096);
    this.statics = new Statics(this);
    this.carLayer = new CarLayer(gl, this);
    this.personLayer = new PersonLayer(gl, this);
    this.treeLayer = new TreeLayer(gl, this);
    this.decals = new DecalLayer(gl, this);
    this.systems = [];
    this.sprites = new SpriteLayer(gl, this.atlas, this.pal);
    this.lightLayer = new LightLayer(gl);
    renderer.addLayer({ light: (ctx) => this.lightLayer.light(ctx) });
    renderer.addLayer({
      shadow: (ctx) => { this.carLayer.shadow(ctx); this.personLayer.shadow(ctx); this.treeLayer.shadow(ctx); this.sprites.shadow(ctx); },
      draw: (ctx) => { this.decals.draw(ctx); this.carLayer.draw(ctx); this.personLayer.draw(ctx); this.treeLayer.draw(ctx); this.sprites.draw(ctx); },
    });
    this.view = { bw: 0, bh: 0, tsx: 0, tsy: 0, visible: () => true };
    this.time = 0;
    // until the city is built, only its things are drawn (trees, props, lamps): no people, traffic
    // or animals yet. startLife() wakes it up.
    this.live = false;
    this.player = { active: false, hud: () => null, input: {} };
    this.people = { list: [], pick: () => null, emit() {} };
    this.particles = {};
    this.activities = null;
  }
  startLife() {
    const world = this.world;
    this.coll = new Collision(world);
    this.traffic = new Traffic(this);
    this.people = new People(this);
    this.activities = new Activities(this);
    this.people.activities = this.activities;
    this.animals = new Animals(this);
    this.particles = new Particles(this);
    this.addSystem(this.people);
    this.addSystem(this.activities);
    this.addSystem(this.animals);
    this.addSystem(this.particles);
    this.subway = new Subway(this);
    this.addSystem(this.subway);
    this.player = new Player(this);
    this.addSystem(this.player);
    // car physics after everyone has moved: contacts, damage, fires, wrecks
    this.vehicles = new Vehicles(this);
    this.addSystem(this.vehicles);
    this.poles = this.addSystem(new Poles(this));
    this.addSystem({ update: (dt) => this.decals.update(dt) });
    this.traffic.init();
    this.people.init();
    this.statics.wake();
    this.live = true;
  }
  // where the life of the city is concentrated: the player when playing, otherwise the camera
  focus() {
    const pl = this.player;
    if (pl && pl.active) { const t = pl.target(); if (t) return t; }
    return this.camera;
  }
  addSystem(s) {
    this.systems.push(s);
    return s;
  }
  update(dt) {
    this.time += dt;
    if (!this.live) return;
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
      const mm = m * T;
      return Math.abs(p[0] - t[0]) < hw + mm && p[1] - t[1] < hh + mm && t[1] - p[1] < hh + mm * 2;
    };
    return v;
  }
  prepare(canvasW, canvasH) {
    const view = this.computeView(canvasW, canvasH);
    const env = this.env;
    const L = this.sprites;
    L.begin();
    this.personLayer.begin();
    this.statics.emit(L, env, this.camera, this.time, view);
    for (const s of this.systems) s.emit && s.emit(L, view);
    L.end();
    this.personLayer.end();
    this.treeLayer.prepare(view, this.statics.treeRows);
    this.carLayer.prepare(!this.live ? [] : this.subway ? this.traffic.cars.concat(this.subway.cars) : this.traffic.cars, this.time, env, view);
    this.decals.prepare(view);
    const LL = this.lightLayer;
    LL.begin();
    this.statics.lights(LL, env, this.time);
    if (this.live) this.carLayer.lights(LL, this.traffic.cars, env);
    for (const s of this.systems) s.lights && s.lights(LL, env);
    LL.end();
  }
}
