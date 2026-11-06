// Procedural WebAudio sound engine. Every sound is synthesised; positional sounds are panned and
// attenuated by their on-screen position and the zoom level.

import { clamp, RNG } from '../core/math.js';
import { isParkIntersection, NB } from '../world/layout.js';

export class AudioEngine {
  constructor(app) {
    this.app = app;
    this.enabled = false;
    this.ctx = null;
    this.rng = new RNG(5);
    this.last = {};
    this.birdT = 2;
    this.subwayT = 30;
    this.jingleT = 0;
    this.chirpT = 0;
    this.lastWalk = null;
  }
  // ---------------------------------------------------------------- setup
  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.8;
    this.amb.connect(this.master);
    const sr = ctx.sampleRate;
    const mk = (secs, fn) => {
      const b = ctx.createBuffer(1, Math.floor(sr * secs), sr);
      const d = b.getChannelData(0);
      fn(d, sr);
      return b;
    };
    this.white = mk(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.pink = mk(2, (d) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    });
    this.brown = mk(3, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    this.crickets = mk(2, (d, r) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / r;
        const chirp = (t % 0.5) < 0.12 ? Math.sin(Math.PI * ((t % 0.5) / 0.12)) : 0;
        const pulse = Math.sin(t * 2 * Math.PI * 30) > 0 ? 1 : 0.2;
        const c2 = ((t + 0.23) % 0.62) < 0.1 ? 0.6 : 0;
        d[i] = (Math.sin(t * 2 * Math.PI * 4400) * chirp * pulse + Math.sin(t * 2 * Math.PI * 4900) * c2 * pulse) * 0.25;
      }
    });
    // ambience loops
    const loop = (buf, filters, gain0 = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      let node = src;
      const fs = [];
      for (const [type, f, q] of filters) {
        const bq = ctx.createBiquadFilter();
        bq.type = type; bq.frequency.value = f; if (q) bq.Q.value = q;
        node.connect(bq); node = bq; fs.push(bq);
      }
      const g = ctx.createGain();
      g.gain.value = gain0;
      const pan = ctx.createStereoPanner();
      node.connect(g).connect(pan).connect(this.amb);
      src.start();
      return { src, g, f: fs, pan };
    };
    this.L = {
      city: loop(this.brown, [['lowpass', 420]], 0),
      traffic: loop(this.pink, [['bandpass', 700, 0.4]], 0),
      wind: loop(this.white, [['bandpass', 500, 0.8]], 0),
      rain: loop(this.white, [['highpass', 900], ['lowpass', 6500]], 0),
      crickets: loop(this.crickets, [['highpass', 2000]], 0),
      water: loop(this.white, [['bandpass', 1800, 0.6]], 0),
      steam: loop(this.white, [['highpass', 2400], ['lowpass', 6000]], 0),
      siren: null,
    };
    return true;
  }
  unlock() {
    if (this.ctx && this.ctx.state === 'suspended' && this.enabled) this.ctx.resume();
  }
  toggle() {
    if (!this.ctx && !this.init()) return;
    this.enabled = !this.enabled;
    if (this.enabled && this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.enabled ? 0.85 : 0, t, 0.15);
  }
  get on() { return this.enabled && this.ctx && this.ctx.state === 'running'; }
  // ---------------------------------------------------------------- helpers
  now() { return this.ctx.currentTime; }
  // positional gain/pan from world position
  where(src) {
    const app = this.app;
    const W = app.canvas.clientWidth, H = app.canvas.clientHeight;
    const s = app.camera.worldToScreen(src.x, src.y, src.z || 0, W, H);
    const dx = (s[0] - W / 2) / (W / 2), dy = (s[1] - H / 2) / (H / 2);
    const d = Math.hypot(dx, dy * 1.2);
    const css = app.camera.scale / (window.devicePixelRatio || 1);
    const zk = clamp(0.35 + css * 0.28, 0.4, 1.5);
    const g = Math.pow(clamp(1.3 - d, 0, 1), 1.6) * zk;
    const pan = clamp(dx * 0.85, -1, 1);
    if (!Number.isFinite(g) || !Number.isFinite(pan)) return { g: 0, pan: 0 };
    return { g, pan };
  }
  throttle(kind, dt) {
    const t = performance.now() / 1000;
    if (this.last[kind] && t - this.last[kind] < dt) return false;
    this.last[kind] = t;
    return true;
  }
  out(gain, pan) {
    const g = this.ctx.createGain();
    g.gain.value = Number.isFinite(gain) ? gain : 0;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Number.isFinite(pan) ? pan : 0;
    g.connect(p).connect(this.sfx);
    return g;
  }
  env(g, t, a, peak, d, sus = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + d);
  }
  osc(type, f, t, dur, dest, peak = 0.3, a = 0.005, f2 = null) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, a, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + dur + 0.05);
    return o;
  }
  noise(t, dur, dest, filters, peak = 0.3, a = 0.003, buf = this.white) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    let n = s;
    for (const [type, f, q, f2] of filters) {
      const b = this.ctx.createBiquadFilter();
      b.type = type; b.frequency.setValueAtTime(f, t);
      if (f2) b.frequency.exponentialRampToValueAtTime(f2, t + dur);
      if (q) b.Q.value = q;
      n.connect(b); n = b;
    }
    const g = this.ctx.createGain();
    this.env(g, t, a, peak, dur);
    n.connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + a + dur + 0.05);
  }
  click() {
    if (!this.on) return;
    const t = this.now();
    this.osc('square', 880, t, 0.04, this.out(0.06, 0), 0.5);
  }
  // ---------------------------------------------------------------- events
  event(kind, src) {
    if (!this.on || !src) return;
    try {
      this.play(kind, src);
    } catch (e) {
      this.fail(e);
    }
  }
  // report audio errors once instead of letting them stop the frame loop
  fail(e) {
    if (!this.failed) console.warn('audio:', e);
    this.failed = true;
  }
  play(kind, src) {
    const w = this.where(src);
    if (!(w.g >= 0.03)) return;
    const t = this.now();
    const r = this.rng;
    const O = (k = 1) => this.out(w.g * k, w.pan);
    switch (kind) {
      case 'dribble':
      case 'bounce': {
        if (!this.throttle('dribble', 0.08)) return;
        const o = O(kind === 'bounce' ? 0.6 : 0.9);
        this.osc('sine', 150, t, 0.12, o, 0.7, 0.002, 55);
        this.noise(t, 0.03, o, [['lowpass', 900]], 0.3);
        break;
      }
      case 'rim': {
        const o = O(0.7);
        for (const f of [640, 1010, 1590, 2230]) this.osc('sine', f * r.range(0.98, 1.02), t, 0.5, o, 0.14);
        this.noise(t, 0.04, o, [['bandpass', 3000, 2]], 0.2);
        break;
      }
      case 'swish': {
        const o = O(0.8);
        this.noise(t, 0.28, o, [['bandpass', 2600, 0.9, 5200]], 0.35, 0.02);
        break;
      }
      case 'throw': {
        if (!this.throttle('throw', 0.15)) return;
        this.noise(t, 0.16, O(0.5), [['bandpass', 500, 1.2, 1800]], 0.3, 0.02);
        break;
      }
      case 'splat': {
        if (!this.throttle('splat', 0.08)) return;
        this.noise(t, 0.12, O(0.7), [['lowpass', 1100, 0.7, 300]], 0.5);
        break;
      }
      case 'coo': {
        if (!this.throttle('coo', 0.35)) return;
        const o = O(0.45);
        const base = r.range(330, 420);
        const v = this.osc('sine', base, t, 0.22, o, 0.35, 0.03, base * 0.9);
        const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
        lfo.frequency.value = 18; lg.gain.value = 12; lfo.connect(lg).connect(v.frequency); lfo.start(t); lfo.stop(t + 0.6);
        this.osc('sine', base * 1.06, t + 0.26, 0.32, o, 0.3, 0.04, base * 0.82);
        break;
      }
      case 'flutter': {
        if (!this.throttle('flutter', 0.25)) return;
        const o = O(0.5);
        for (let k = 0; k < 7; k++) this.noise(t + k * 0.055, 0.04, o, [['bandpass', 1300, 0.8]], 0.25 * (1 - k / 9));
        break;
      }
      case 'bark': {
        if (!this.throttle('bark', 0.4)) return;
        const o = O(0.6);
        const f = r.range(260, 480);
        for (let k = 0; k < r.int(1, 3); k++) {
          const tt = t + k * 0.22;
          const b = this.ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f * 2.4; b.Q.value = 1.5; b.connect(o);
          this.osc('sawtooth', f, tt, 0.13, b, 0.6, 0.01, f * 0.7);
          this.noise(tt, 0.08, o, [['bandpass', 1200, 1]], 0.15);
        }
        break;
      }
      case 'horn': {
        if (!this.throttle('horn', 0.6)) return;
        const o = O(0.45);
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(o);
        const dur = r.chance(0.5) ? 0.35 : 0.18;
        const n = r.chance(0.4) ? 2 : 1;
        for (let k = 0; k < n; k++) {
          this.osc('square', 392, t + k * 0.28, dur, lp, 0.22, 0.01);
          this.osc('square', 494, t + k * 0.28, dur, lp, 0.18, 0.01);
        }
        break;
      }
      case 'bus': {
        const o = O(0.5);
        this.noise(t, 0.7, o, [['highpass', 1800]], 0.35, 0.01);
        for (let k = 0; k < 3; k++) this.osc('square', 1040, t + 0.9 + k * 0.35, 0.15, o, 0.12);
        break;
      }
      case 'boom': {
        const o = O(1.2);
        this.noise(t, 1.4, o, [['lowpass', 600, 0.7, 90]], 0.9, 0.005, this.brown);
        this.osc('sine', 70, t, 0.6, o, 0.6, 0.005, 35);
        for (let k = 0; k < 18; k++) this.noise(t + 0.25 + r.range(0, 0.9), 0.02, o, [['highpass', 3000]], r.range(0.05, 0.18));
        break;
      }
      case 'launch': {
        this.osc('sine', 700, t, 0.9, O(0.25), 0.12, 0.05, 2600);
        break;
      }
      case 'geese': {
        const o = O(0.35);
        for (let k = 0; k < 6; k++) {
          const tt = t + k * r.range(0.3, 0.6);
          const b = this.ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 650; b.Q.value = 3; b.connect(o);
          this.osc('sawtooth', r.range(320, 380), tt, 0.16, b, 0.5, 0.02, 300);
        }
        break;
      }
      case 'giggle': {
        if (!this.throttle('giggle', 1.2)) return;
        const o = O(0.3);
        let f = r.range(900, 1100);
        for (let k = 0; k < 5; k++) { this.osc('sine', f, t + k * 0.09, 0.07, o, 0.25, 0.01, f * 0.9); f *= 0.94; }
        break;
      }
      case 'train': {
        if (!this.throttle('train', 1.6)) return;
        const o = O(0.55);
        this.noise(t, 1.8, o, [['lowpass', 220]], 0.7, 0.3, this.brown);
        for (let k = 0; k < 6; k++) this.noise(t + k * 0.21 + (k % 2) * 0.06, 0.05, o, [['bandpass', 900, 2]], 0.22);
        break;
      }
      case 'trainStop': {
        const o = O(0.4);
        const v = this.osc('sine', 2350, t, 1.1, o, 0.12, 0.08, 2100);
        const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
        lfo.frequency.value = 9; lg.gain.value = 40; lfo.connect(lg).connect(v.frequency); lfo.start(t); lfo.stop(t + 1.3);
        this.noise(t + 0.9, 0.5, o, [['highpass', 2500]], 0.25, 0.01);
        break;
      }
      case 'trainGo': {
        const o = O(0.35);
        this.osc('sine', 660, t, 0.25, o, 0.2); this.osc('sine', 523, t + 0.3, 0.4, o, 0.2);
        break;
      }
      case 'siren':
        break;
    }
  }
  thunder(dist) {
    if (!this.on || !Number.isFinite(dist)) return;
    const t = this.now() + 0.4 + dist * 2.2;
    const o = this.out(1.1 - dist * 0.5, this.rng.range(-0.5, 0.5));
    this.noise(t, 3.5 + dist * 2, o, [['lowpass', 380, 0.6, 70]], 1.0, 0.08, this.brown);
    this.noise(t, 0.25, o, [['lowpass', 2000, 0.5, 400]], 0.5 * (1 - dist), 0.005);
  }
  birds(k) {
    const t = this.now();
    const r = this.rng;
    const o = this.out(0.13 * k, r.range(-0.8, 0.8));
    const n = r.int(3, 7);
    const base = r.range(2600, 4200);
    for (let i = 0; i < n; i++) {
      const tt = t + i * r.range(0.08, 0.16);
      this.osc('sine', base * r.range(0.9, 1.2), tt, 0.06, o, 0.3, 0.005, base * r.range(1.2, 1.6));
    }
  }
  walkChirp(src) {
    const w = this.where(src);
    if (w.g < 0.15) return;
    const t = this.now();
    const o = this.out(w.g * 0.25, w.pan);
    for (let k = 0; k < 6; k++) this.osc('square', 2600, t + k * 0.12, 0.02, o, 0.3);
  }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.ctx || !this.enabled) return;
    try {
      this.tick(dt);
    } catch (e) {
      this.fail(e);
    }
  }
  tick(dt) {
    const app = this.app, env = app.env, city = app.city;
    const t = this.now();
    const L = this.L;
    const set = (node, v, tc = 0.4) => node.g.gain.setTargetAtTime(Number.isFinite(v) ? v : 0, t, tc);
    const css = app.camera.scale / (window.devicePixelRatio || 1);
    const close = clamp(css / 3, 0.3, 1.4);
    const cars = city.traffic.cars;
    let moving = 0;
    for (const c of cars) if (c.state !== 'parked' && c.v > 0.5) moving++;
    const busy = clamp(moving / 40, 0.15, 1.2);
    set(L.city, 0.16 + 0.1 * busy);
    set(L.traffic, 0.04 + 0.05 * busy * close);
    set(L.wind, 0.04 + env.wind * (env.season === 3 || env.season === 2 ? 0.12 : 0.06));
    L.wind.f[0].frequency.setTargetAtTime(380 + Math.sin(t * 0.3) * 160 + Math.sin(t * 0.17) * 90, t, 0.5);
    set(L.rain, env.raining ? 0.32 * env.precip : env.snowing ? 0.03 : 0, 0.8);
    const cr = env.season === 1 && (env.hour > 20 || env.hour < 4.5) ? 0.06 : env.season === 0 && env.hour > 21 ? 0.02 : 0;
    set(L.crickets, cr, 1);
    // nearest water & steam
    const view = city.view;
    let water = 0, wpan = 0, steam = 0, span = 0;
    const W = city.world;
    if (env.season !== 3 && env.hour >= 7 && env.hour < 23) for (const f of W.fountains) { const w = this.where(f); if (w.g > water) { water = w.g; wpan = w.pan; } }
    if (city.activities?.hydrantOpen) { const w = this.where(city.activities.hydrantOpen.h); if (w.g * 1.4 > water) { water = w.g * 1.4; wpan = w.pan; } }
    for (const s of W.steam) if (s.kind === 'grate' || s.kind === 'manhole') { const w = this.where(s); if (w.g > steam) { steam = w.g; span = w.pan; } }
    set(L.water, water * 0.18, 0.3); L.water.pan.pan.setTargetAtTime(wpan, t, 0.3);
    set(L.steam, steam * 0.045 * (env.season === 3 ? 1.5 : 1), 0.3); L.steam.pan.pan.setTargetAtTime(span, t, 0.3);
    void view;
    // birds by day in spring/summer
    this.birdT -= dt;
    if (this.birdT <= 0) {
      const daytime = env.hour > 5.5 && env.hour < 19.5;
      const k = daytime ? (env.season === 0 || env.season === 1 ? 1 : env.season === 2 ? 0.4 : 0.15) * (env.hour < 9 ? 1.6 : 1) * (env.raining ? 0.2 : 1) : 0;
      this.birdT = this.rng.range(1.2, 4) / Math.max(0.2, k);
      if (k > 0) this.birds(Math.min(1.4, k));
    }
    // honks
    for (const c of city.traffic.honks) this.event('horn', c);
    city.traffic.honks.length = 0;
    // sirens
    const fire = cars.find((c) => c.siren);
    if (fire) {
      if (!L.siren) {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.45;
        const lg = this.ctx.createGain(); lg.gain.value = 420;
        lfo.connect(lg).connect(o.frequency);
        o.frequency.value = 1050;
        const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.8;
        const g = this.ctx.createGain(); g.gain.value = 0;
        const p = this.ctx.createStereoPanner();
        o.connect(bp).connect(g).connect(p).connect(this.sfx);
        o.start(); lfo.start();
        L.siren = { o, lfo, g, p };
      }
      const w = this.where(fire);
      L.siren.g.gain.setTargetAtTime(0.05 + w.g * 0.16, t, 0.2);
      L.siren.p.pan.setTargetAtTime(w.pan, t, 0.2);
    } else if (L.siren) {
      L.siren.g.gain.setTargetAtTime(0, t, 0.3);
      const s = L.siren;
      setTimeout(() => { try { s.o.stop(); s.lfo.stop(); } catch (e) { /* already stopped */ } }, 1500);
      L.siren = null;
    }
    // ice cream truck jingle (original tune)
    const ice = cars.find((c) => c.special === 'icecream');
    this.jingleT -= dt;
    if (ice && this.jingleT <= 0) {
      const w = this.where(ice);
      this.jingleT = 4.2;
      if (w.g > 0.03) {
        const o = this.out(w.g * 0.18, w.pan);
        const notes = [72, 76, 79, 76, 77, 74, 71, 74, 72, 76, 79, 84, 83, 79, 77, 76];
        notes.forEach((n, i) => this.osc('square', 440 * Math.pow(2, (n - 69) / 12), t + i * 0.24, 0.2, o, 0.25, 0.005));
      }
    }
    // garbage truck reverse beeps
    const gar = cars.find((c) => c.special === 'garbage' && c.v < 0.5);
    if (gar && this.throttle('garbage', 1.0)) { const w = this.where(gar); if (w.g > 0.05) this.osc('square', 1100, t, 0.3, this.out(w.g * 0.12, w.pan), 0.3); }
    // subway rumble underfoot
    this.subwayT -= dt;
    if (this.subwayT <= 0) {
      this.subwayT = this.rng.range(35, 80);
      const s = W.subways[this.rng.int(0, W.subways.length - 1)];
      if (s) { const w = this.where(s); this.noise(t, 5, this.out(0.15 + w.g * 0.35, w.pan), [['lowpass', 160]], 0.9, 1.5, this.brown); }
    }
    // crosswalk chirp at the intersection nearest the view centre
    this.chirpT -= dt;
    if (this.chirpT <= 0) {
      this.chirpT = 0.5;
      const cx = app.camera.x, cy = app.camera.y;
      const i = clamp(Math.round((cx - 4.5) / 27), 0, NB), j = clamp(Math.round((cy - 4.5) / 27), 0, NB);
      if (isParkIntersection(i, j)) { this.lastWalk = null; return; }
      const st = city.traffic.signalState(i, j);
      const key = `${i},${j},${st.walkEW},${st.walkNS}`;
      if (this.lastWalk && key !== this.lastWalk && (st.walkEW === 'walk' || st.walkNS === 'walk') && css >= 2) this.walkChirp({ x: i * 27 + 4.5, y: j * 27 + 4.5, z: 0 });
      this.lastWalk = key;
    }
  }
}
