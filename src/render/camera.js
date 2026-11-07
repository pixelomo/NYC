// Camera with two projections, both pixel-exact on the ground and with smooth 90-degree rotations:
//  'iso'  - 2:1 isometric (x half-width HX, y HY, height HZ per world unit)
//  'bird' - bird's-eye oblique: the ground is drawn straight down at T px per unit (north up at
//           rotation 0) and heights at half scale, so the camera-facing walls show "a little".

import { MAPX, MAPY, T } from '../world/layout.js';

const HX = T, HY = T / 2, HZ = T; // iso: screen px per world unit (x half-width, y, height)
const BS = T, BZ = T / 2; // bird's-eye: px per unit on the ground, px per unit of height
import { clamp, easeInOut } from '../core/math.js';

const CX = MAPX / 2, CY = MAPY / 2;
// depth (world units either side of the map centre) mapped onto clip space: the whole diorama must fit
export const DEPTH_RANGE = Math.max(200, (MAPX + MAPY) * 0.72);

export class Camera {
  constructor() {
    this.x = CX;
    this.y = CY;
    this.angle = 0;
    this.rot = 0; // integer quarter turns (unbounded)
    this.rotFrom = 0;
    this.rotT = 1;
    this.scale = 2; // device pixels per art pixel
    this.scaleFrom = 2;
    this.scaleTo = 2;
    this.scaleT = 1;
    this.follow = null;
    this.vx = 0;
    this.vy = 0;
    this.mode = 'iso';
  }
  get bird() { return this.mode === 'bird'; }
  // sprites are drawn this much shorter than their art (bird's-eye squashes heights)
  get squash() { return this.mode === 'bird' ? BZ / T : 1; }
  _rot(x, y) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const dx = x - CX, dy = y - CY;
    return [c * dx - s * dy, s * dx + c * dy];
  }
  _unrot(xr, yr) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return [CX + c * xr + s * yr, CY - s * xr + c * yr];
  }
  get settled() {
    return this.rotT >= 1 && this.scaleT >= 1;
  }
  rotate(dir) {
    this.rotFrom = this.angle;
    this.rot += dir;
    this.rotT = 0;
  }
  zoomTo(s) {
    this.scaleFrom = this.scale;
    this.scaleTo = s;
    this.scaleT = 0;
  }
  // a jolt from an explosion: decays over half a second or so
  shake(a) { this.shakeA = Math.max(this.shakeA || 0, a); }
  update(dt) {
    if (this._sx || this._sy) { this.x -= this._sx; this.y -= this._sy; this._sx = 0; this._sy = 0; }
    if (this.rotT < 1) {
      this.rotT = Math.min(1, this.rotT + dt / 0.7);
      const target = (this.rot * Math.PI) / 2;
      this.angle = this.rotFrom + (target - this.rotFrom) * easeInOut(this.rotT);
      if (this.rotT >= 1) this.angle = target;
    }
    if (this.scaleT < 1) {
      this.scaleT = Math.min(1, this.scaleT + dt / 0.35);
      const e = easeInOut(this.scaleT);
      // interpolate in log space for even feel
      this.scale = Math.exp(Math.log(this.scaleFrom) + (Math.log(this.scaleTo) - Math.log(this.scaleFrom)) * e);
      if (this.scaleT >= 1) this.scale = this.scaleTo;
    }
    if (this.glide && !this.follow) {
      // smooth trip to a chosen place; any pan cancels it
      const g = this.glide, k = 1 - Math.exp(-dt * 3.2);
      this.x += (g.x - this.x) * k;
      this.y += (g.y - this.y) * k;
      if (Math.hypot(g.x - this.x, g.y - this.y) < 0.05) this.glide = null;
    }
    if (this.follow) {
      const f = this.follow;
      const k = 1 - Math.exp(-dt * 4);
      this.x += (f.x - this.x) * k;
      this.y += (f.y - this.y) * k;
    } else if (this.vx || this.vy) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const decay = Math.exp(-dt * 6);
      this.vx *= decay;
      this.vy *= decay;
      if (Math.abs(this.vx) < 0.01) this.vx = 0;
      if (Math.abs(this.vy) < 0.01) this.vy = 0;
    }
    this.x = clamp(this.x, -10, MAPX + 10);
    this.y = clamp(this.y, -10, MAPY + 10);
    if (this.shakeA > 0.01) {
      const a = this.shakeA;
      this._sx = (Math.random() * 2 - 1) * a; this._sy = (Math.random() * 2 - 1) * a;
      this.x += this._sx; this.y += this._sy;
      this.shakeA *= Math.exp(-dt * 5);
    } else this.shakeA = 0;
  }
  // world -> art pixels (relative to map centre). Returns [sx, sy, depth] (smaller depth = nearer)
  project(x, y, z) {
    const [xr, yr] = this._rot(x, y);
    if (this.mode === 'bird') return [xr * BS, yr * BS - z * BZ, -yr];
    return [(xr - yr) * HX, (xr + yr) * HY - z * HZ, -(xr + yr)];
  }
  // screen-space direction (art px) of a world direction
  screenDir(nx, ny) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const xr = c * nx - s * ny, yr = s * nx + c * ny;
    if (this.mode === 'bird') return [xr * BS, yr * BS];
    return [(xr - yr) * HX, (xr + yr) * HY];
  }
  screenDirX(nx, ny) {
    return this.screenDir(nx, ny)[0];
  }
  // world xy per art pixel along the screen's horizontal axis (the plane sprites stand in)
  screenRight() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    if (this.mode === 'bird') return [c / BS, -s / BS];
    return [(c - s) / (2 * HX), -(s + c) / (2 * HX)];
  }
  // art pixels at height z -> rotated ground coordinates
  _artToRot(sx, sy, z) {
    if (this.mode === 'bird') return [sx / BS, (sy + z * BZ) / BS];
    const a = sx / HX, b = (sy + z * HZ) / HY;
    return [(a + b) / 2, (b - a) / 2];
  }
  // art-pixel screen delta -> world delta on the ground plane
  unprojectDelta(dsx, dsy) {
    const [xr, yr] = this._artToRot(dsx, dsy, 0);
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return [c * xr + s * yr, -s * xr + c * yr];
  }
  // screen pixel (CSS) -> world on plane z
  screenToWorld(px, py, viewW, viewH, z = 0) {
    const scaleCss = this.scale / (window.devicePixelRatio || 1);
    const t = this.project(this.x, this.y, 0);
    const sx = t[0] + (px - viewW / 2) / scaleCss;
    const sy = t[1] + (py - viewH / 2) / scaleCss;
    return this.artToWorld(sx, sy, z);
  }
  // art pixels (as returned by project) at height z -> world x, y
  artToWorld(sx, sy, z) {
    const [xr, yr] = this._artToRot(sx, sy, z);
    return this._unrot(xr, yr);
  }
  worldToScreen(x, y, z, viewW, viewH) {
    const scaleCss = this.scale / (window.devicePixelRatio || 1);
    const t = this.project(this.x, this.y, 0);
    const p = this.project(x, y, z);
    return [(p[0] - t[0]) * scaleCss + viewW / 2, (p[1] - t[1]) * scaleCss + viewH / 2, p[2]];
  }
  // camera view direction in world space (pointing toward the camera)
  viewDir() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    // rotated-space direction toward the camera -> world: inverse rotation
    const [xr, yr, zr] = this.mode === 'bird' ? [0, BZ, BS] : [1, 1, 1];
    const wx = c * xr + s * yr, wy = -s * xr + c * yr;
    const l = Math.hypot(wx, wy, zr);
    return [wx / l, wy / l, zr / l];
  }
  // Build view-projection for a buffer of bw x bh pixels holding k buffer pixels per art pixel
  // (k = 1 normally; below 1 when zoomed far out, so the buffer never grows past ~2x the canvas).
  matrices(bw, bh, k = 1) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const t0 = this.project(this.x, this.y, 0);
    const t = [t0[0] * k, t0[1] * k];
    const tsx = Math.floor(t[0]), tsy = Math.floor(t[1]);
    const fx = t[0] - tsx, fy = t[1] - tsy;
    const HXk = HX * k, HYk = HY * k, HZk = HZ * k;
    const D = DEPTH_RANGE;
    const m = new Float32Array(16);
    const kx = 2 / bw, ky = 2 / bh;
    if (this.mode === 'bird') {
      // screen x = xr*BS, screen y = yr*BS - z*BZ, depth = -yr
      const BSk = BS * k, BZk = BZ * k;
      m[0] = BSk * c * kx; m[4] = -BSk * s * kx; m[8] = 0; m[12] = (BSk * (-c * CX + s * CY) - tsx) * kx;
      m[1] = -BSk * s * ky; m[5] = -BSk * c * ky; m[9] = BZk * ky; m[13] = (BSk * (s * CX + c * CY) + tsy) * ky;
      m[2] = -s / D; m[6] = -c / D; m[10] = 0; m[14] = (s * CX + c * CY) / D;
      m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
      return { viewProj: m, frac: [fx, fy], tsx, tsy };
    }
    // clip_x
    m[0] = HXk * (c - s) * kx;
    m[4] = -HXk * (s + c) * kx;
    m[8] = 0;
    m[12] = (HXk * ((c - s) * -CX - (s + c) * -CY) - tsx) * kx;
    // clip_y
    m[1] = -HYk * (c + s) * ky;
    m[5] = -HYk * (c - s) * ky;
    m[9] = HZk * ky;
    m[13] = -(HYk * ((c + s) * -CX + (c - s) * -CY) - tsy) * ky;
    // clip_z
    m[2] = -(c + s) / D;
    m[6] = -(c - s) / D;
    m[10] = 0;
    m[14] = ((c + s) * CX + (c - s) * CY) / D;
    m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
    return { viewProj: m, frac: [fx, fy], tsx, tsy };
  }
}
