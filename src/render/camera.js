// Isometric camera: 2:1 pixel projection with smooth 90-degree rotations and integer pixel zoom.

import { MAP, T } from '../world/layout.js';

const HX = T, HY = T / 2, HZ = T; // screen px per world unit (x half-width, y, height)
import { clamp, easeInOut } from '../core/math.js';

const CX = MAP / 2, CY = MAP / 2;
export const DEPTH_RANGE = 200;

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
  update(dt) {
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
    this.x = clamp(this.x, -10, MAP + 10);
    this.y = clamp(this.y, -10, MAP + 10);
  }
  // world -> art pixels (relative to map centre). Returns [sx, sy, depth]
  project(x, y, z) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const dx = x - CX, dy = y - CY;
    const xr = c * dx - s * dy, yr = s * dx + c * dy;
    return [(xr - yr) * HX, (xr + yr) * HY - z * HZ, -(xr + yr)];
  }
  // screen-space direction (art px) of a world direction
  screenDir(nx, ny) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const xr = c * nx - s * ny, yr = s * nx + c * ny;
    return [(xr - yr) * HX, (xr + yr) * HY];
  }
  screenDirX(nx, ny) {
    return this.screenDir(nx, ny)[0];
  }
  // art-pixel screen delta -> world delta on the ground plane
  unprojectDelta(dsx, dsy) {
    const a = dsx / HX, b = dsy / HY; // a = xr - yr, b = xr + yr
    const xr = (a + b) / 2, yr = (b - a) / 2;
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return [c * xr + s * yr, -s * xr + c * yr];
  }
  // screen pixel (CSS) -> world on plane z
  screenToWorld(px, py, viewW, viewH, z = 0) {
    const scaleCss = this.scale / (window.devicePixelRatio || 1);
    const t = this.project(this.x, this.y, 0);
    const sx = t[0] + (px - viewW / 2) / scaleCss;
    const sy = t[1] + (py - viewH / 2) / scaleCss + z * HZ;
    const a = sx / HX, b = sy / HY;
    const xr = (a + b) / 2, yr = (b - a) / 2;
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return [CX + c * xr + s * yr, CY - s * xr + c * yr];
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
    // rotated-space direction (1,1,1) -> world: inverse rotation
    const xr = 1, yr = 1;
    const wx = c * xr + s * yr, wy = -s * xr + c * yr;
    const l = Math.hypot(wx, wy, 1);
    return [wx / l, wy / l, 1 / l];
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
