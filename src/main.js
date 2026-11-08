// Entry point: boot WebGL, build the city, run the main loop.

import { createGL } from './core/gl.js';
import { Renderer } from './render/renderer.js';
import { Camera } from './render/camera.js';
import { startWorld } from './world/world.js';
import { MAPX, MAPY, parkRect } from './world/layout.js';
import { Environment } from './sim/environment.js';
import { City } from './sim/city.js';
import { UI } from './ui/ui.js';
import { AudioEngine } from './audio/audio.js';

const canvas = document.getElementById('view');
const loading = document.getElementById('loading');
const loadingMsg = document.getElementById('loading-msg');

function setMsg(m) {
  if (loadingMsg) loadingMsg.textContent = m;
}
function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
// let the browser breathe (and draw) between slices of building; works in hidden tabs too (a
// message, not a zero timeout, which browsers stretch to 4 ms)
const yieldCh = new MessageChannel(), yieldQ = [];
yieldCh.port1.onmessage = () => { const r = yieldQ.shift(); if (r) r(); };
function yieldTask() {
  return new Promise((r) => { yieldQ.push(r); yieldCh.port2.postMessage(0); });
}

async function boot() {
  let gl;
  try {
    gl = createGL(canvas);
  } catch (e) {
    setMsg(e.message + ' Try a recent Chrome, Edge, Firefox or Safari.');
    return;
  }
  setMsg('Pouring concrete…');
  await nextFrame();
  const t0 = performance.now();
  const { world, builder } = startWorld(1977, (m) => setMsg(m));
  const renderer = new Renderer(gl);
  renderer.setStatic(world.mesh, world.atlas, world.groundTiles);
  world.mesh = null;
  const q = new URLSearchParams(location.search);
  const env = new Environment();
  const camera = new Camera();
  const dpr = window.devicePixelRatio || 1;
  camera.scale = camera.scaleTo = Math.max(1, Math.round(dpr));
  // open over Central Park, looking down its length from the Mall
  // (over the middle of Central Park, where no tower stands between the camera and the lawns)
  { const P = parkRect(); [camera.x, camera.y] = [(P.x0 + P.x1) / 2 - 10, (P.y0 + P.y1) / 2 - 10]; }
  if (q.has('zoom')) camera.scale = camera.scaleTo = parseFloat(q.get('zoom'));
  if (q.has('x')) camera.x = parseFloat(q.get('x'));
  if (q.has('y')) camera.y = parseFloat(q.get('y'));
  if (q.has('rot')) { camera.rot = parseInt(q.get('rot'), 10); camera.angle = (camera.rot * Math.PI) / 2; }
  if (q.get('view') === 'bird') camera.mode = 'bird';
  if (q.has('hour')) env.hour = parseFloat(q.get('hour'));
  if (q.has('season')) env.setSeason(parseInt(q.get('season'), 10));
  if (q.has('weather')) env.setWeather(q.get('weather'));
  if (q.has('pause')) env.paused = true;
  env.compute(0);
  const still = q.has('still');
  // first what the camera looks at, behind the loading screen
  const startT = performance.now();
  while (builder.pendingNear(camera.x, camera.y, 70) && performance.now() - startT < 20000) {
    builder.run(camera.x, camera.y, still ? 400 : 60);
    renderer.addBuilt(builder.take());
    setMsg(`Raising buildings… ${Math.round(builder.progress * 100)}%`);
    await yieldTask();
  }
  // the city's things (trees, props, lamps) are drawn while it is built; it comes to life after
  const city = new City(gl, renderer, world, env, camera);
  const app = { gl, world, renderer, env, camera, city, ready: false, builder, time: 0, canvas, fps: 0 };
  const audio = new AudioEngine(app);
  app.audio = audio;
  env.onEvent((ev, d) => {
    if (ev === 'lightning') audio.thunder(d.dist);
    if (ev === 'season') app.city.activities?.seed();
  });
  document.addEventListener('visibilitychange', () => {
    if (!audio.ctx || !audio.enabled) return;
    if (document.hidden) audio.ctx.suspend();
    else audio.ctx.resume();
  });
  const ui = new UI(app);
  app.ui = ui;
  window.__app = app;
  console.log(`first view in ${(performance.now() - t0).toFixed(0)}ms (${world.buildProfile})`);
  // then the rest of the city, nearest the camera first, in slices between frames; the people and
  // traffic start once it's all there
  const chip = document.createElement('div');
  chip.id = 'build-chip';
  chip.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);padding:6px 12px;border-radius:14px;background:rgba(20,24,34,.78);color:#f2efe6;font:600 12px/1 ui-monospace,monospace;letter-spacing:.06em;pointer-events:none;z-index:20';
  document.body.append(chip);
  (async () => {
    while (!builder.finished) {
      // (a bigger share of each frame while the frame rate is good)
      builder.run(camera.x, camera.y, still ? 300 : app.fps >= 50 ? 18 : app.fps >= 30 ? 12 : 8);
      renderer.addBuilt(builder.take());
      chip.textContent = `BUILDING THE CITY ${Math.round(builder.progress * 100)}%`;
      await yieldTask();
    }
    renderer.addBuilt(builder.take());
    renderer.doneBuilding();
    chip.textContent = 'WAKING UP THE CITY…';
    await yieldTask();
    city.startLife();
    city.audio = audio;
    app.ready = true;
    ui.fillPlaces?.();
    chip.remove();
    window.__city = app;
    console.log(`world built in ${(performance.now() - t0).toFixed(0)}ms (building ${builder.ms.toFixed(0)}ms, ${builder.done} jobs), tris=${renderer.stats.tris}, atlas pages=${world.atlas.pages.length}`);
  })();

  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  function resize() {
    const d = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * d), h = Math.round(canvas.clientHeight * d);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  const frameErrors = new Set();
  function step(dt) {
    app.time += dt;
    resize();
    env.update(dt);
    ui.pan(dt);
    camera.update(dt);
    app.city.update(dt);
    app.city.prepare(canvas.width, canvas.height);
    renderer.render(camera, env.u, app.time, canvas.width, canvas.height);
    audio.update(dt);
    ui.update(dt);
  }
  app.simulate = (secs, dt = 0.05) => {
    const t = performance.now();
    for (let k = 0; k < secs / dt; k++) { app.time += dt; env.update(dt); camera.update(dt); app.city.update(dt); }
    return performance.now() - t;
  };
  app.renderOnce = (dt = 0.016) => { const t = performance.now(); step(dt); return performance.now() - t; };
  function frame(now) {
    // (the first frame's timestamp can come out a hair earlier than the clock read at start-up)
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) {
      app.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0;
      // adaptive quality: shrink the shadow map if the GPU struggles
      app.lowFps = app.fps < 32 ? (app.lowFps || 0) + 1 : 0;
      if (app.lowFps >= 4 && renderer.shadowSize > 2048) { renderer.setShadowSize(2048); app.lowFps = 0; console.log('quality: shadow map 2048'); }
    }
    if (!still) requestAnimationFrame(frame);
    try {
      step(dt);
    } catch (e) {
      // keep the city running; report each distinct error once
      const msg = String(e && e.message);
      if (!frameErrors.has(msg)) { frameErrors.add(msg); console.error(e); }
    }
  }
  if (loading) loading.classList.add('hidden');
  ui.toast('♪ Tap the sound button for city sounds');
  if (still) { step(0.016); app.time = 1; } else requestAnimationFrame(frame);
}

boot();
