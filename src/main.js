// Entry point: boot WebGL, build the city, run the main loop.

import { createGL } from './core/gl.js';
import { Renderer } from './render/renderer.js';
import { Camera } from './render/camera.js';
import { buildWorld } from './world/world.js';
import { Environment } from './sim/environment.js';
import { City } from './sim/city.js';

const canvas = document.getElementById('view');
const loading = document.getElementById('loading');
const loadingMsg = document.getElementById('loading-msg');

function setMsg(m) {
  if (loadingMsg) loadingMsg.textContent = m;
}

async function boot() {
  let gl;
  try {
    gl = createGL(canvas);
  } catch (e) {
    setMsg(e.message);
    return;
  }
  await nextFrame();
  const t0 = performance.now();
  const world = buildWorld(1977, (m) => setMsg(m));
  const renderer = new Renderer(gl);
  renderer.setStatic(world.mesh, world.atlas);
  console.log(`world built in ${(performance.now() - t0).toFixed(0)}ms, tris=${renderer.stats.tris}, atlas pages=${world.atlas.pages.length}`);
  const env = new Environment();
  const camera = new Camera();
  const dpr = window.devicePixelRatio || 1;
  camera.scale = camera.scaleTo = Math.max(1, Math.round(2 * dpr));
  camera.x = 60;
  camera.y = 66;
  // debug/query overrides
  const q = new URLSearchParams(location.search);
  if (q.has('zoom')) camera.scale = camera.scaleTo = parseFloat(q.get('zoom'));
  if (q.has('x')) camera.x = parseFloat(q.get('x'));
  if (q.has('y')) camera.y = parseFloat(q.get('y'));
  if (q.has('rot')) { camera.rot = parseInt(q.get('rot'), 10); camera.angle = (camera.rot * Math.PI) / 2; }
  if (q.has('hour')) env.hour = parseFloat(q.get('hour'));
  if (q.has('season')) env.setSeason(parseInt(q.get('season'), 10));
  if (q.has('weather')) env.setWeather(q.get('weather'));
  if (q.has('pause')) env.paused = true;

  const city = new City(gl, renderer, world, env, camera);
  const app = { gl, world, renderer, env, camera, city, time: 0, canvas };
  window.__city = app;

  let last = performance.now();
  function resize() {
    const d = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * d), h = Math.round(canvas.clientHeight * d);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  const still = q.has('still');
  function step(dt) {
    app.time += dt;
    resize();
    env.update(dt);
    camera.update(dt);
    city.update(dt);
    city.prepare(canvas.width, canvas.height);
    renderer.render(camera, env.u, app.time, canvas.width, canvas.height);
  }
  app.simulate = (secs, dt = 0.05) => {
    const t = performance.now();
    for (let k = 0; k < secs / dt; k++) { app.time += dt; env.update(dt); camera.update(dt); city.update(dt); }
    return performance.now() - t;
  };
  app.renderOnce = (dt = 0.016) => { const t = performance.now(); step(dt); return performance.now() - t; };
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    if (!still) requestAnimationFrame(frame);
  }
  if (loading) loading.classList.add('hidden');
  if (still) { step(0.016); app.time = 1; } else requestAnimationFrame(frame);
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

boot();
