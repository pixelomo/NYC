// HUD, toolbar and input handling (mouse, touch, keyboard).

import { SEASONS } from '../sim/environment.js';
import { clamp } from '../core/math.js';

const WEATHER_ICONS = { clear: '☀', cloudy: '☁', rain: '☂', storm: '⚡', snow: '❄', fog: '≋' };
const SPEEDS = [1, 3, 10, 30];

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.build();
    this.bindInput();
    this.toastT = 0;
    this.lastSeason = app.env.season;
    this.lastDay = app.env.day;
    this.zoomLevels = this.computeZoomLevels();
    app.env.onEvent((ev, d) => {
      if (ev === 'season') this.toast(`${SEASONS[d].icon} ${SEASONS[d].name} has arrived`);
      if (ev === 'day') this.toast(`Day ${d + 1} — ${SEASONS[app.env.season].name}`);
    });
  }
  computeZoomLevels() {
    const dpr = window.devicePixelRatio || 1;
    // device pixels per art pixel; down to 1/16 CSS pixel per art pixel shows the whole diorama
    const dev = [0.0625, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12];
    return dev.filter((d) => d / dpr >= 0.062 && d / dpr <= 6.01);
  }
  h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  btn(label, title, fn, cls = '') {
    const b = this.h('button', 'btn ' + cls, label);
    b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); this.app.audio?.click(); });
    return b;
  }
  build() {
    const R = this.root;
    R.innerHTML = '';
    // clock panel
    const clock = this.h('div', 'panel clock');
    this.timeEl = this.h('div', 'time', '');
    this.dayEl = this.h('div', 'day', '');
    this.wxEl = this.h('div', 'wx', '');
    clock.append(this.timeEl, this.dayEl, this.wxEl);
    R.append(clock);
    // title
    const title = this.h('div', 'title', 'PIXEL<span>NYC</span>');
    R.append(title);
    this.titleEl = title;
    // top right buttons
    const tr = this.h('div', 'topright');
    this.soundBtn = this.btn('♪ OFF', 'Sound on/off (M)', () => this.toggleSound());
    tr.append(this.soundBtn, this.btn('?', 'Help (H)', () => this.toggleHelp()));
    R.append(tr);
    // toolbar
    const bar = this.h('div', 'panel toolbar');
    const g1 = this.h('div', 'group');
    this.playBtn = this.btn('❚❚', 'Pause / play (Space)', () => this.togglePause());
    this.speedBtn = this.btn('1×', 'Time speed (T)', () => this.cycleSpeed());
    g1.append(this.playBtn, this.speedBtn);
    const slider = this.h('input', 'slider');
    slider.type = 'range'; slider.min = 0; slider.max = 1439; slider.step = 1;
    slider.title = 'Time of day';
    slider.addEventListener('input', () => { this.app.env.hour = slider.value / 60; this.app.env.compute(0); });
    slider.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.slider = slider;
    g1.append(slider);
    const g2 = this.h('div', 'group');
    this.seasonBtns = SEASONS.map((s, i) => this.btn(s.icon, `${s.name} (${i + 1})`, () => this.setSeason(i), 'season'));
    this.autoSeason = this.btn('AUTO', 'Seasons change every day', () => this.setSeason(null), 'small');
    g2.append(...this.seasonBtns, this.autoSeason);
    const g3 = this.h('div', 'group');
    this.wxSel = this.h('select', 'sel');
    for (const w of ['auto', 'clear', 'cloudy', 'rain', 'storm', 'snow', 'fog']) {
      const o = this.h('option', null, w === 'auto' ? 'WEATHER: AUTO' : w.toUpperCase());
      o.value = w;
      this.wxSel.append(o);
    }
    this.wxSel.addEventListener('change', () => this.app.env.setWeather(this.wxSel.value === 'auto' ? null : this.wxSel.value));
    this.wxSel.addEventListener('pointerdown', (e) => e.stopPropagation());
    g3.append(this.wxSel);
    // places to jump to in the bigger city
    const W = this.app.world;
    const places = [['GO TO…', null]];
    if (W.park) places.push(['CENTRAL PARK', [W.park.cx, W.park.cy]]);
    for (const [name, x, y] of W.parkSights || []) places.push([name, [x, y]]);
    if (W.timesSquare) places.push(['TIMES SQUARE', W.timesSquare.view || [W.timesSquare.x, W.timesSquare.y + 4]]);
    for (const l of W.landmarks || []) places.push([l.name, [l.x, l.y], l.rot]);
    if (W.court) places.push(['BASKETBALL COURT', [(W.court.x0 + W.court.x1) / 2, (W.court.y0 + W.court.y1) / 2 + 3]]);
    const dept = W.shops.find((sh) => sh.kind === 'dept');
    if (dept) places.push(['DEPARTMENT STORE', [dept.x, dept.y]]);
    const firehouse = W.firehouse;
    if (firehouse) places.push(['FIREHOUSE', [firehouse.x, firehouse.y]]);
    this.placeSel = this.h('select', 'sel');
    places.forEach(([name], i) => { const o = this.h('option', null, name); o.value = String(i); this.placeSel.append(o); });
    this.placeSel.addEventListener('change', () => {
      const pl = places[+this.placeSel.value];
      if (pl && pl[1]) {
        if (this.app.camera.follow) this.unfollow();
        this.app.camera.vx = this.app.camera.vy = 0;
        this.app.camera.glide = { x: pl[1][0], y: pl[1][1] };
        // turn to the side the place is best seen from (the default view unless it says otherwise)
        const cam = this.app.camera;
        let d = ((((pl[2] ?? 0) - cam.rot) % 4) + 4) % 4;
        if (d === 3) d = -1;
        if (d) cam.rotate(d);
      }
      this.placeSel.value = '0';
    });
    this.placeSel.addEventListener('pointerdown', (e) => e.stopPropagation());
    g3.append(this.placeSel);
    const g4 = this.h('div', 'group');
    this.viewBtn = this.btn('◩', "Bird's-eye / isometric view (V)", () => this.toggleView());
    g4.append(this.viewBtn, this.btn('⟲', 'Rotate left (Q)', () => this.rotate(-1)), this.btn('⟳', 'Rotate right (E)', () => this.rotate(1)),
      this.btn('−', 'Zoom out (-)', () => this.zoom(-1)), this.btn('+', 'Zoom in (+)', () => this.zoom(1)));
    const g5 = this.h('div', 'group');
    this.playAsBtn = this.btn('PLAY', 'Take control of a person: walk, borrow cars, outrun the police (P)', () => this.togglePlay(), 'small');
    g5.append(this.playAsBtn, this.btn('👁', 'Follow a random person (F)', () => this.followRandom()), this.btn('✸', 'Fireworks! (X)', () => this.fireworks()));
    bar.append(g1, g2, g3, g4, g5);
    R.append(bar);
    // follow card
    this.card = this.h('div', 'panel card hidden');
    R.append(this.card);
    // toast
    this.toastEl = this.h('div', 'toast hidden');
    R.append(this.toastEl);
    // play-mode HUD: who you are, what you're in, how wanted you are, the pistol, prompts and news
    this.hudEl = this.h('div', 'panel playhud hidden', `
      <div class="ph-row"><span class="ph-name"></span><span class="ph-stars" title="Wanted level">${'<i></i>'.repeat(5)}</span></div>
      <div class="ph-status"></div>
      <div class="ph-row ph-sub"><span class="ph-gun"></span><span class="ph-car"><span class="ph-label">CAR</span><b><u></u></b></span></div>
      <div class="ph-prompt"></div>`);
    R.append(this.hudEl);
    this.hudMsg = this.h('div', 'playmsg hidden');
    R.append(this.hudMsg);
    this.hudBig = this.h('div', 'playbig hidden');
    R.append(this.hudBig);
    // help
    this.help = this.h('div', 'panel help hidden', `
      <div class="htitle">PIXEL NYC — CONTROLS</div>
      <div class="hrow"><b>Drag</b> pan the city</div>
      <div class="hrow"><b>Wheel / pinch / + −</b> zoom</div>
      <div class="hrow"><b>Q / E</b> rotate the view</div>
      <div class="hrow"><b>V</b> bird's-eye / isometric view</div>
      <div class="hrow"><b>P</b> play as someone: <b>WASD</b> move, <b>Shift</b> run, <b>F</b> get in/out of cars, <b>Space</b> handbrake, <b>Esc</b> quit</div>
      <div class="hrow"><b>Click</b> (or <b>Space</b> on foot) shoot · <b>R</b> reload · crimes bring police and wanted stars</div>
      <div class="hrow"><b>Click a person</b> follow them</div>
      <div class="hrow"><b>WASD / arrows</b> pan</div>
      <div class="hrow"><b>GO TO menu</b> glide to a place</div>
      <div class="hrow"><b>Space</b> pause · <b>T</b> time speed</div>
      <div class="hrow"><b>1-4</b> season · <b>0</b> auto seasons</div>
      <div class="hrow"><b>F</b> follow someone · <b>Esc</b> stop</div>
      <div class="hrow"><b>M</b> sound · <b>X</b> fireworks · <b>H</b> help</div>
      <div class="hnote">Each new day brings a new season. Kids shoot hoops in summer, throw snowballs in winter; the city lights up at dusk.</div>
      <div class="hclose">click anywhere to close</div>`);
    this.help.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.toggleHelp(false); });
    R.append(this.help);
  }
  // ---- actions --------------------------------------------------------------
  toggleSound() {
    const a = this.app.audio;
    if (!a) return;
    a.toggle();
    this.soundBtn.textContent = a.enabled ? '♪ ON' : '♪ OFF';
    this.soundBtn.classList.toggle('on', a.enabled);
  }
  toggleHelp(force) {
    const show = force ?? this.help.classList.contains('hidden');
    this.help.classList.toggle('hidden', !show);
  }
  togglePause() {
    const env = this.app.env;
    env.paused = !env.paused;
    this.playBtn.textContent = env.paused ? '▶' : '❚❚';
  }
  cycleSpeed() {
    const env = this.app.env;
    const i = (SPEEDS.indexOf(env.speed) + 1) % SPEEDS.length;
    env.speed = SPEEDS[i];
    this.speedBtn.textContent = env.speed + '×';
  }
  setSeason(s) {
    const env = this.app.env;
    if (s == null) { env.seasonOverride = null; this.toast('Seasons change every day'); }
    else { env.setSeason(s); this.toast(`${SEASONS[s].icon} ${SEASONS[s].name}`); }
    this.app.city.activities?.seed();
  }
  rotate(d) { this.app.camera.rotate(d); }
  togglePlay() {
    const pl = this.app.city.player, app = this.app;
    if (pl.active) {
      pl.stop();
      this.playAsBtn.classList.remove('on');
      this.hudEl.classList.add('hidden');
      this.toast('Back to watching the city');
      return;
    }
    // the person being followed, or whoever is nearest the middle of the screen
    let p = this.following;
    if (!p) {
      const cam = app.camera;
      let bd = Infinity;
      for (const q of app.city.people.list) {
        if (q.alpha < 0.9 || q.state === 'vanish' || q.state === 'appear' || q.z < 0) continue;
        const d = (q.x - cam.x) ** 2 + (q.y - cam.y) ** 2;
        if (d < bd) { bd = d; p = q; }
      }
    }
    if (!p) return;
    this.unfollow();
    if (!pl.start(p)) return;
    this.playAsBtn.classList.add('on');
    this.hudEl.classList.remove('hidden');
    if (app.camera.mode !== 'bird') this.toggleView('bird');
    const z = this.zoomLevels.find((v) => v >= 3 * (window.devicePixelRatio || 1) - 0.01) || this.zoomLevels[this.zoomLevels.length - 1];
    app.camera.zoomTo(z);
    this.toast('WASD move · SHIFT run · F get in/out · CLICK shoot · R reload · SPACE handbrake · ESC quit');
  }
  toggleView(mode) {
    const cam = this.app.camera;
    cam.mode = mode ?? (cam.mode === 'bird' ? 'iso' : 'bird');
    this.viewBtn.classList.toggle('on', cam.mode === 'bird');
    this.toast(cam.mode === 'bird' ? "Bird's-eye view" : 'Isometric view');
  }
  zoom(d) {
    const cam = this.app.camera;
    const L = this.zoomLevels;
    let i = L.findIndex((v) => v >= cam.scaleTo - 0.01);
    if (i < 0) i = L.length - 1;
    i = clamp(i + d, 0, L.length - 1);
    if (L[i] !== cam.scaleTo) cam.zoomTo(L[i]);
  }
  followRandom() {
    const list = this.app.city.people.list.filter((p) => p.alpha > 0.9 && p.state !== 'vanish');
    const vis = list.filter((p) => this.app.city.view.visible(p.x, p.y, p.z, 0));
    const pool = vis.length ? vis : list;
    if (pool.length) this.follow(pool[Math.floor(Math.random() * pool.length)]);
  }
  follow(p) {
    this.app.camera.follow = p;
    this.following = p;
    this.card.classList.remove('hidden');
  }
  unfollow() {
    this.app.camera.follow = null;
    this.following = null;
    this.card.classList.add('hidden');
  }
  fireworks() {
    const pt = this.app.city.particles;
    pt.forceFireworks = 14;
    pt.fireworkTimer = 0;
    const env = this.app.env;
    if (env.darkness < 0.5) this.toast('Fireworks look best at night!');
  }
  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    this.toastT = 3.5;
  }
  // ---- per frame ------------------------------------------------------------------
  updateHud() {
    const h = this.app.city.player.hud();
    if (!h) { if (!this.hudEl.classList.contains('hidden')) this.hudEl.classList.add('hidden'); this.hudMsg.classList.add('hidden'); this.hudBig.classList.add('hidden'); this.playAsBtn?.classList.remove('on'); this.titleEl.classList.remove('hidden'); this.root.classList.remove('playing'); this.app.canvas.classList.remove('aiming'); return; }
    this.hudEl.classList.remove('hidden');
    this.titleEl.classList.add('hidden');
    this.root.classList.add('playing');
    this.hudEl.querySelector('.ph-name').textContent = h.name.toUpperCase();
    this.hudEl.querySelector('.ph-status').textContent = h.status;
    this.hudEl.querySelector('.ph-prompt').textContent = h.prompt;
    // wanted stars: lit gold, blinking while the police are searching for you
    const blink = h.searching && Math.floor(performance.now() / 300) % 2;
    this.hudEl.querySelectorAll('.ph-stars i').forEach((el, i) => { el.className = i < h.stars ? (blink ? 'on dim' : 'on') : ''; });
    const g = h.gun;
    this.hudEl.querySelector('.ph-gun').textContent = g.reloading ? 'PISTOL · RELOADING' : `PISTOL · ${g.clip}/${g.cap}`;
    const carEl = this.hudEl.querySelector('.ph-car');
    carEl.classList.toggle('hidden', !h.car);
    if (h.car) {
      const bar = carEl.querySelector('u');
      bar.style.width = `${Math.round(Math.max(0, h.car.hp) * 100)}%`;
      bar.className = h.car.fire ? 'fire' : h.car.hp < 0.3 ? 'low' : h.car.hp < 0.6 ? 'mid' : '';
    }
    this.app.canvas.classList.add('aiming');
    const small = h.msgs.filter((m) => !m.big).map((m) => m.text);
    this.hudMsg.textContent = small.join('  ·  ');
    this.hudMsg.classList.toggle('hidden', !small.length);
    const big = h.msgs.find((m) => m.big);
    this.hudBig.textContent = big ? big.text : '';
    this.hudBig.classList.toggle('hidden', !big);
  }
  update(dt) {
    this.updateHud();
    const env = this.app.env;
    this.timeEl.textContent = env.timeString();
    const S = SEASONS[env.season];
    this.dayEl.textContent = `DAY ${env.day + 1} · ${S.icon} ${S.name.toUpperCase()}`;
    const w = env.currentWeather();
    this.wxEl.textContent = `${WEATHER_ICONS[w] || ''} ${w.toUpperCase()} · ${env.temperature()}°F`;
    if (document.activeElement !== this.slider) this.slider.value = Math.floor(env.hour * 60);
    this.seasonBtns.forEach((b, i) => b.classList.toggle('on', env.season === i));
    this.autoSeason.classList.toggle('on', env.seasonOverride == null);
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.add('hidden'); }
    const p = this.following;
    if (p) {
      if (p.dead) { this.unfollow(); this.toast(`${p.name} went ${p.node?.kind === 'subway' ? 'into the subway' : 'inside'}`); }
      else {
        const role = { resident: 'New Yorker', worker: 'Office worker', kid: 'Kid', player: 'Hooper', elder: 'Retiree', dogwalker: 'Dog walker', jogger: 'Jogger', tourist: 'Tourist', vendor: 'Street vendor', trick: 'Trick-or-treater' }[p.role] || 'New Yorker';
        const dog = p.dogName ? ` · with ${p.dogName}` : '';
        this.card.innerHTML = `<div class="cname">${p.name}, ${p.age}</div><div class="crole">${role}${dog}</div><div class="cthought">“${p.thought || 'Just walking'}”</div><div class="cclose">ESC / click empty space to stop</div>`;
      }
    }
  }
  // ---- input ------------------------------------------------------------------
  bindInput() {
    const app = this.app, cv = app.canvas;
    const ptrs = new Map();
    let drag = null, pinch = null, moved = 0;
    // play mode: the mouse aims, a click (or tap) fires
    const aim = (e) => {
      const pl = app.city.player;
      if (!pl || !pl.active) return false;
      const pz = pl.p ? pl.p.z + 0.8 : 0.8;
      const [wx, wy] = app.camera.screenToWorld(e.clientX, e.clientY, cv.clientWidth, cv.clientHeight, pz);
      pl.aimAt(wx, wy);
      return true;
    };
    cv.addEventListener('pointermove', (e) => { if (!ptrs.size) aim(e); });
    cv.addEventListener('pointerdown', (e) => {
      app.audio?.unlock();
      const pl = app.city.player;
      if (pl && pl.active && e.button === 0) {
        aim(e);
        pl.trigger = true; pl.clickShot = true;
        if (e.pointerType !== 'mouse') setTimeout(() => { pl.trigger = false; }, 120);
        cv.setPointerCapture(e.pointerId);
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, shoot: true });
        return;
      }
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY }; moved = 0; }
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), acc: 0 };
        drag = null;
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      if (ptrs.get(e.pointerId).shoot) { aim(e); return; }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = d / pinch.d;
        if (r > 1.25) { this.zoom(1); pinch.d = d; }
        else if (r < 0.8) { this.zoom(-1); pinch.d = d; }
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX; drag.y = e.clientY;
        if (moved > 4) {
          cv.classList.add('dragging');
          if (app.camera.follow) this.unfollow();
          app.camera.glide = null;
          const scaleCss = app.camera.scale / (window.devicePixelRatio || 1);
          const [wx, wy] = app.camera.unprojectDelta(-dx / scaleCss, -dy / scaleCss);
          app.camera.x += wx; app.camera.y += wy;
          app.camera.vx = (wx / 0.016) * 0.5; app.camera.vy = (wy / 0.016) * 0.5;
        }
      }
    });
    const up = (e) => {
      const was = ptrs.get(e.pointerId);
      ptrs.delete(e.pointerId);
      if (was && was.shoot) { const pl = app.city.player; if (pl && e.pointerType === 'mouse') pl.trigger = false; return; }
      cv.classList.remove('dragging');
      if (drag && moved <= 4) this.click(e.clientX, e.clientY);
      if (ptrs.size < 2) pinch = null;
      drag = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    let wheelAcc = 0;
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (wheelAcc > 60) { this.zoom(-1); wheelAcc = 0; }
      else if (wheelAcc < -60) { this.zoom(1); wheelAcc = 0; }
    }, { passive: false });
    const keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      app.audio?.unlock();
      const k = e.key.toLowerCase();
      keys.add(k);
      const pl = app.city.player;
      if (pl && pl.active) {
        // play mode: movement keys are read every frame; these act on press
        if (k === 'f' || k === 'enter') { if (!e.repeat) pl.action(); e.preventDefault(); return; }
        if (k === 'r') { if (!e.repeat) pl.reload(); return; }
        if (k === ' ' || k.startsWith('arrow')) { e.preventDefault(); return; }
        if (k === 'escape' || k === 'p') { if (!e.repeat) this.togglePlay(); return; }
        if ('wasd'.includes(k) && k.length === 1) return;
      }
      if (k === 'q') this.rotate(-1);
      else if (k === 'e') this.rotate(1);
      else if (k === '+' || k === '=') this.zoom(1);
      else if (k === '-' || k === '_') this.zoom(-1);
      else if (k === ' ') { this.togglePause(); e.preventDefault(); }
      else if (k === 't') this.cycleSpeed();
      else if (k >= '1' && k <= '4') this.setSeason(+k - 1);
      else if (k === '0') this.setSeason(null);
      else if (k === 'f') this.followRandom();
      else if (k === 'escape') { this.unfollow(); this.toggleHelp(false); }
      else if (k === 'm') this.toggleSound();
      else if (k === 'h' || k === '?') this.toggleHelp();
      else if (k === 'x') this.fireworks();
      else if (k === 'n') { app.env.hour = (app.env.hour + 3) % 24; }
      else if (k === 'v') this.toggleView();
      else if (k === 'p') this.togglePlay();
    });
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    this.keys = keys;
  }
  click(cx, cy) {
    const app = this.app;
    if (app.city.player.active) return;
    const p = app.city.people.pick(cx, cy, app.canvas.clientWidth, app.canvas.clientHeight);
    if (p) this.follow(p);
    else if (this.following) this.unfollow();
  }
  pan(dt) {
    const k = this.keys;
    if (!k) return;
    let sx = 0, sy = 0;
    if (k.has('a') || k.has('arrowleft')) sx -= 1;
    if (k.has('d') || k.has('arrowright')) sx += 1;
    if (k.has('w') || k.has('arrowup')) sy -= 1;
    if (k.has('s') || k.has('arrowdown')) sy += 1;
    const pl = this.app.city.player;
    if (pl && pl.active) {
      pl.input.x = sx; pl.input.y = sy; pl.input.run = k.has('shift'); pl.input.brake = k.has(' '); pl.input.space = k.has(' ');
      return;
    }
    if (!sx && !sy) return;
    if (this.app.camera.follow) this.unfollow();
    this.app.camera.glide = null;
    const cam = this.app.camera;
    const speed = 420 / (cam.scale / (window.devicePixelRatio || 1));
    const [wx, wy] = cam.unprojectDelta(sx * speed * dt, sy * speed * dt);
    cam.x += wx; cam.y += wy;
  }
}
