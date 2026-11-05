// Time of day, seasons (one per day), weather and all lighting parameters derived from them.

import { clamp, lerp, smoothstep, RNG } from '../core/math.js';
import { GRP } from '../world/mesh.js';

export const SEASONS = [
  { name: 'Spring', icon: '✿', rise: 6.4, set: 19.6, maxEl: 58, swing: 0.15, tHi: 64, tLo: 49 },
  { name: 'Summer', icon: '☀', rise: 5.5, set: 20.5, maxEl: 72, swing: 0.45, tHi: 88, tLo: 73 },
  { name: 'Autumn', icon: '❦', rise: 7.0, set: 18.4, maxEl: 42, swing: -0.05, tHi: 61, tLo: 47 },
  { name: 'Winter', icon: '❄', rise: 7.2, set: 16.7, maxEl: 27, swing: -0.4, tHi: 36, tLo: 25 },
];

export const WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];

const keyLerp = (keys, x) => {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      const t = (x - a[0]) / (b[0] - a[0]);
      if (Array.isArray(a[1])) return a[1].map((v, k) => lerp(v, b[1][k], t));
      return lerp(a[1], b[1], t);
    }
  }
  return keys[keys.length - 1][1];
};

const hexv = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// Sky keyframes by sun elevation (degrees)
const SKY_TOP = [[-18, hexv(0x070b1d)], [-8, hexv(0x16204a)], [-2, hexv(0x2f3f7a)], [2, hexv(0x4a6fb0)], [8, hexv(0x5c93d6)], [20, hexv(0x55a3ec)], [50, hexv(0x4597e6)]];
const SKY_BOT = [[-18, hexv(0x141a38)], [-8, hexv(0x3a3266)], [-2, hexv(0xb0607a)], [2, hexv(0xf59a62)], [8, hexv(0xf6c78f)], [20, hexv(0xb9e0f6)], [50, hexv(0xc4e7fa)]];
const SUN_COL = [[-2, [0, 0, 0]], [1, [0.55, 0.28, 0.14]], [5, [0.85, 0.55, 0.32]], [12, [0.9, 0.74, 0.55]], [25, [0.82, 0.78, 0.68]], [50, [0.8, 0.78, 0.72]]];
const AMB = [[-18, [0.17, 0.19, 0.31]], [-8, [0.22, 0.22, 0.38]], [-2, [0.36, 0.3, 0.42]], [3, [0.5, 0.44, 0.48]], [10, [0.56, 0.56, 0.6]], [30, [0.6, 0.63, 0.7]]];

const RES_LIT = [[0, 0.24], [2, 0.12], [4.5, 0.06], [6.5, 0.3], [8.5, 0.16], [12, 0.1], [16.5, 0.16], [19, 0.46], [21.5, 0.55], [23, 0.4], [24, 0.24]];
const OFF_LIT = [[0, 0.12], [5.5, 0.1], [7.5, 0.45], [9, 0.75], [17, 0.75], [19, 0.5], [21, 0.3], [24, 0.12]];

const CROWN = [
  [[1.0, 0.55, 0.8], [1.0, 1.0, 1.0]],
  [[1.0, 0.25, 0.25], [0.35, 0.5, 1.0]],
  [[1.0, 0.55, 0.12], [1.0, 0.85, 0.3]],
  [[1.0, 0.2, 0.25], [0.25, 0.95, 0.4]],
];

export class Environment {
  constructor(seed = 7) {
    this.rng = new RNG(seed);
    this.day = 0;
    this.hour = 16.6;
    this.startSeason = 1; // begin in summer
    this.dayLength = 720; // real seconds per sim day at speed 1
    this.speed = 1;
    this.paused = false;
    this.seasonOverride = null;
    this.weatherOverride = null;
    this.snowCover = 0;
    this.wetness = 0;
    this.precip = 0; // current precipitation intensity 0..1
    this.cloudiness = 0.1;
    this.fog = 0;
    this.wind = 0.3;
    this.windDir = 0.6;
    this.flash = 0;
    this.lightningTimer = 4;
    this.cloudOff = [0, 0];
    this.listeners = [];
    this.planDay(true);
    this.u = {};
    this.compute(0);
  }
  get season() {
    if (this.seasonOverride != null) return this.seasonOverride;
    return (this.startSeason + this.day) % 4;
  }
  get seasonInfo() {
    return SEASONS[this.season];
  }
  onEvent(fn) {
    this.listeners.push(fn);
  }
  emit(ev, data) {
    for (const f of this.listeners) f(ev, data);
  }
  planDay(first = false) {
    const s = this.season, r = this.rng;
    const opts = [
      [['clear', 45], ['cloudy', 25], ['rain', 30]],
      [['clear', 60], ['cloudy', 12], ['storm', 28]],
      [['clear', 40], ['cloudy', 30], ['rain', 22], ['fog', 8]],
      [['clear', 22], ['cloudy', 20], ['snow', 58]],
    ][s];
    let w = first ? 'clear' : r.weighted(opts);
    this.plan = { base: w, start: 0, end: 0, intensity: 0 };
    if (w === 'rain' || w === 'snow' || w === 'storm') {
      const start = w === 'storm' ? r.range(13, 18) : r.range(5, 16);
      const dur = w === 'storm' ? r.range(1.5, 3) : r.range(3, 9);
      this.plan.start = start;
      this.plan.end = start + dur;
      this.plan.intensity = w === 'storm' ? 1 : r.range(0.45, 1);
      if (w === 'snow' && r.chance(0.5)) { this.plan.start = 0; this.plan.end = r.range(6, 14); }
    }
    if (first) {
      // a small summer storm late at night on the first day for drama
      this.plan = { base: 'clear', start: 23.2, end: 25, intensity: 0.8, lateStorm: true };
    }
    if (s === 3 && this.snowCover < 0.5) this.snowCover = 0.75; // winter starts snowy
  }
  setSeason(s) {
    this.seasonOverride = s;
    if (s === 3) this.snowCover = Math.max(this.snowCover, 0.8);
    this.emit('season', s);
  }
  setWeather(w) {
    this.weatherOverride = w;
  }
  currentWeather() {
    if (this.weatherOverride) return this.weatherOverride;
    const p = this.plan;
    const h = this.hour;
    if (p.end > p.start && h >= p.start - 0.5 && h <= p.end + 0.5) {
      if (p.lateStorm) return this.season === 3 ? 'snow' : 'storm';
      return p.base;
    }
    return p.base === 'rain' || p.base === 'storm' || p.base === 'snow' ? 'cloudy' : p.base;
  }
  update(dt) {
    if (!this.paused) {
      const hoursPerSec = (24 / this.dayLength) * this.speed;
      this.hour += dt * hoursPerSec;
      if (this.hour >= 24) {
        this.hour -= 24;
        const prevSeason = this.season;
        this.day++;
        if (this.seasonOverride == null && prevSeason !== this.season) this.emit('season', this.season);
        this.planDay();
        this.emit('day', this.day);
      }
    }
    this.compute(dt);
  }
  // sun elevation (deg) and direction
  sunAt(h) {
    const S = SEASONS[this.season];
    let el, az;
    if (h >= S.rise && h <= S.set) {
      const t = (h - S.rise) / (S.set - S.rise);
      el = S.maxEl * Math.sin(Math.PI * t);
      az = -S.swing + (Math.PI + 2 * S.swing) * t;
    } else {
      const nightLen = 24 - S.set + S.rise;
      let t = (h > S.set ? h - S.set : h + 24 - S.set) / nightLen;
      el = -22 * Math.sin(Math.PI * t);
      az = Math.PI + S.swing + (Math.PI - 2 * S.swing) * t;
    }
    return { el, az };
  }
  compute(dt) {
    const u = this.u, s = this.season, h = this.hour;
    const wtype = this.currentWeather();
    const tgtPrecip = (() => {
      if (wtype === 'rain' || wtype === 'snow' || wtype === 'storm') {
        const p = this.plan;
        if (this.weatherOverride) return wtype === 'storm' ? 1 : 0.8;
        const ramp = Math.min(smoothstep(p.start - 0.5, p.start + 0.5, h), 1 - smoothstep(p.end - 0.5, p.end + 0.5, h));
        return (p.intensity || 0.8) * (p.lateStorm ? 1 : ramp);
      }
      return 0;
    })();
    const k = 1 - Math.exp(-dt * 0.6);
    this.precip += (tgtPrecip - this.precip) * k;
    const isSnow = (wtype === 'snow') || (s === 3 && this.precip > 0.05 && wtype !== 'rain');
    this.snowing = isSnow && this.precip > 0.05;
    this.raining = !isSnow && this.precip > 0.05;
    this.storm = wtype === 'storm';
    const tgtCloud = wtype === 'clear' ? 0.12 : wtype === 'cloudy' ? 0.55 : wtype === 'fog' ? 0.75 : 0.85;
    this.cloudiness += (tgtCloud - this.cloudiness) * k;
    this.fog += ((wtype === 'fog' ? 0.6 : wtype === 'rain' ? 0.12 : 0) - this.fog) * k;
    this.wind += ((this.storm ? 1 : s === 2 ? 0.6 : s === 3 ? 0.5 : 0.3) - this.wind) * k * 0.3;
    // hours elapsed this frame (for accumulation)
    const dh = this.paused ? 0 : dt * (24 / this.dayLength) * this.speed;
    if (this.snowing) this.snowCover = Math.min(1, this.snowCover + dh * 0.35 * this.precip);
    else if (s !== 3) this.snowCover = Math.max(0, this.snowCover - dh * (s === 0 ? 0.25 : 0.8));
    if (this.raining) this.wetness = Math.min(1, this.wetness + dh * 3.0 * this.precip + (this.weatherOverride ? dt * 0.3 : 0));
    else this.wetness = Math.max(0, this.wetness - dh * (s === 1 ? 0.5 : 0.25));
    if (s === 3 && this.wetness > 0.3) this.wetness = 0.3;

    // lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.storm && this.precip > 0.4) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = this.rng.range(3, 12);
        this.flash = 1;
        this.emit('lightning', { dist: this.rng.range(0.2, 1) });
      }
    }
    // clouds drift
    const wd = this.windDir;
    this.cloudOff[0] += dt * 0.002 * (0.4 + this.wind) * Math.cos(wd);
    this.cloudOff[1] += dt * 0.002 * (0.4 + this.wind) * Math.sin(wd);

    const sun = this.sunAt(h);
    this.sunEl = sun.el;
    const elR = (sun.el * Math.PI) / 180;
    const sunDir = [Math.cos(sun.az) * Math.cos(elR), Math.sin(sun.az) * Math.cos(elR), Math.sin(elR)];
    const cloudK = clamp(this.cloudiness, 0, 1);
    const top = keyLerp(SKY_TOP, sun.el), bot = keyLerp(SKY_BOT, sun.el);
    const gray = sun.el > -4 ? [0.55, 0.6, 0.66] : [0.1, 0.11, 0.16];
    const grayB = sun.el > -4 ? [0.7, 0.73, 0.76] : [0.14, 0.15, 0.2];
    u.skyTop = top.map((v, i) => lerp(v, gray[i] * (sun.el > 8 ? 1 : 0.75), cloudK * 0.75));
    u.skyBottom = bot.map((v, i) => lerp(v, grayB[i] * (sun.el > 8 ? 1 : 0.75), cloudK * 0.7));
    const night = 1 - smoothstep(-8, 2, sun.el);
    this.night = night;
    this.darkness = 1 - smoothstep(-4, 10, sun.el);
    let sunCol = keyLerp(SUN_COL, sun.el).map((v) => v * (1 - 0.82 * cloudK));
    let key = sunDir;
    // moonlight at night
    if (sun.el < 0) {
      const mAz = sun.az + Math.PI * 0.85;
      const mEl = clamp(-sun.el * 1.8 + 12, 5, 55) * Math.PI / 180;
      const md = [Math.cos(mAz) * Math.cos(mEl), Math.sin(mAz) * Math.cos(mEl), Math.sin(mEl)];
      const mk = smoothstep(-1, -8, sun.el) * (1 - 0.85 * cloudK);
      key = md;
      sunCol = [0.16 * mk, 0.2 * mk, 0.32 * mk];
      u.moon = [0.78, 0.8, smoothstep(-2, -10, sun.el) * (1 - cloudK * 0.9)];
    } else u.moon = [0.78, 0.8, 0];
    u.sunDir = key;
    u.sunCol = sunCol;
    const amb = keyLerp(AMB, sun.el).map((v) => v * (1 + cloudK * 0.18));
    u.amb = amb;
    u.face = [1.0, 0.88, 0.72];
    u.stars = smoothstep(-4, -12, sun.el) * (1 - cloudK);
    u.emis = 0.06 + 0.94 * this.darkness * this.darkness;
    u.snow = this.snowCover;
    u.wet = this.wetness;
    u.cloud = [this.cloudOff[0], this.cloudOff[1], clamp(0.25 + cloudK * 0.75, 0, 1), sun.el > 0 ? 0.45 + cloudK * 0.3 : 0];
    u.flash = this.flash * 0.9;
    const dk = this.darkness;
    u.resLit = clamp(keyLerp(RES_LIT, h) + dk * 0.08 + cloudK * 0.06, 0, 1);
    u.offLit = clamp(keyLerp(OFF_LIT, h) + dk * 0.05, 0, 1);
    u.leaves = s === 2 ? 0.85 : 0;
    u.season = s;
    u.flowers = [1, 0.8, 0.35, 0][s];
    u.ice = s === 3 ? 1 : 0;
    u.crown = smoothstep(-2, -7, sun.el) > 0 ? smoothstep(-1, -6, sun.el) : 0;
    u.crownA = CROWN[s][0];
    u.crownB = CROWN[s][1];
    u.bloom = 0.25 + 0.6 * night;
    u.sat = 1.08 - cloudK * 0.15;
    u.grade = [1, 1, 1];
    if (sun.el > 0 && sun.el < 12) u.grade = [1.04, 0.99, 0.94];
    u.outline = 0.22;
    {
      // haze: fog days, rain and snowfall; tinted by the sky
      const f = clamp(this.fog * 0.9 + (this.snowing ? 0.18 * this.precip : 0) + (this.raining ? 0.1 * this.precip : 0), 0, 0.75);
      const fc = u.skyBottom.map((v, i) => v * 0.55 + [0.62, 0.65, 0.7][i] * 0.45 * (1 - this.darkness * 0.75));
      u.fogv = [fc[0], fc[1], fc[2], f];
    }
    u.vis = this.visMask(h, s);
    this.lampsOn = sun.el < 5 || (cloudK > 0.7 && sun.el < 12) || this.fog > 0.3;
  }
  visMask(h, s) {
    let m = 1 << GRP.ALWAYS;
    m |= 1 << [GRP.SPRING, GRP.SUMMER, GRP.AUTUMN, GRP.WINTER][s];
    if (s !== 3) m |= 1 << GRP.NOT_WINTER;
    if (s !== 1) m |= 1 << GRP.NOT_SUMMER;
    const shopsOpen = h >= 7 && h < 22.5;
    m |= 1 << (shopsOpen ? GRP.DAY : GRP.NIGHT);
    if (s === 1 && h >= 9 && h < 20.5) m |= 1 << GRP.SUMMER_DAY;
    if (s !== 3 && h >= 7 && h < 23) m |= 1 << GRP.FOUNTAIN;
    m |= 1 << (s === 3 ? GRP.XMAS : GRP.NOT_XMAS);
    m |= 1 << (s === 3 ? GRP.ICE : GRP.NO_ICE);
    m |= 1 << GRP.CONSTRUCTION;
    m |= 1 << (h >= 7 && h < 23 ? GRP.GATE_OPEN : GRP.GATE_CLOSED);
    if (s === 0 || s === 1) m |= 1 << GRP.SUMMER_OR_SPRING;
    if (s === 1) m |= 1 << GRP.WARM;
    return m >>> 0;
  }
  temperature() {
    const S = SEASONS[this.season];
    const t = 0.5 - 0.5 * Math.cos(((this.hour - 4) / 24) * Math.PI * 2);
    return Math.round(lerp(S.tLo, S.tHi, t) - this.precip * 4);
  }
  timeString() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    const ap = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
  }
}
