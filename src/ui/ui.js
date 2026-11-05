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
    // device pixels per art pixel; down to 1/8 CSS pixel per art pixel shows the whole diorama
    const dev = [0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12];
    return dev.filter((d) => d / dpr >= 0.124 && d / dpr <= 6.01);
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
    const g4 = this.h('div', 'group');
    g4.append(this.btn('⟲', 'Rotate left (Q)', () => this.rotate(-1)), this.btn('⟳', 'Rotate right (E)', () => this.rotate(1)),
      this.btn('−', 'Zoom out (-)', () => this.zoom(-1)), this.btn('+', 'Zoom in (+)', () => this.zoom(1)));
    const g5 = this.h('div', 'group');
    g5.append(this.btn('👁', 'Follow a random person (F)', () => this.followRandom()), this.btn('✸', 'Fireworks! (X)', () => this.fireworks()));
    bar.append(g1, g2, g3, g4, g5);
    R.append(bar);
    // follow card
    this.card = this.h('div', 'panel card hidden');
    R.append(this.card);
    // toast
    this.toastEl = this.h('div', 'toast hidden');
    R.append(this.toastEl);
    // help
    this.help = this.h('div', 'panel help hidden', `
      <div class="htitle">PIXEL NYC — CONTROLS</div>
      <div class="hrow"><b>Drag</b> pan the city</div>
      <div class="hrow"><b>Wheel / pinch / + −</b> zoom</div>
      <div class="hrow"><b>Q / E</b> rotate the view</div>
      <div class="hrow"><b>Click a person</b> follow them</div>
      <div class="hrow"><b>WASD / arrows</b> pan</div>
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
  update(dt) {
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
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      app.audio?.unlock();
      if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY }; moved = 0; }
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), acc: 0 };
        drag = null;
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
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
          const scaleCss = app.camera.scale / (window.devicePixelRatio || 1);
          const [wx, wy] = app.camera.unprojectDelta(-dx / scaleCss, -dy / scaleCss);
          app.camera.x += wx; app.camera.y += wy;
          app.camera.vx = (wx / 0.016) * 0.5; app.camera.vy = (wy / 0.016) * 0.5;
        }
      }
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
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
    });
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    this.keys = keys;
  }
  click(cx, cy) {
    const app = this.app;
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
    if (!sx && !sy) return;
    if (this.app.camera.follow) this.unfollow();
    const cam = this.app.camera;
    const speed = 420 / (cam.scale / (window.devicePixelRatio || 1));
    const [wx, wy] = cam.unprojectDelta(sx * speed * dt, sy * speed * dt);
    cam.x += wx; cam.y += wy;
  }
}
