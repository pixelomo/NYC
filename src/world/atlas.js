// Multi-page texture atlas for static geometry (uploaded as a TEXTURE_2D_ARRAY).

import { Page, Painter } from '../core/painter.js';

// A painter over a region that is already painted: reads work, writes are dropped. Handed out
// when a block variant replays the textures its first copy made.
class ReplayPainter extends Painter {
  set() {}
  setA() {}
  rect() {}
}

class BestFitShelves {
  constructor(w, h, pad = 1) {
    this.w = w;
    this.h = h;
    this.pad = pad;
    this.shelves = [];
    this.nextY = 0;
  }
  alloc(w, h) {
    const pad = this.pad;
    if (w + pad > this.w) return null;
    let best = null;
    for (const s of this.shelves) {
      if (s.h >= h && s.h <= h * 1.6 + 6 && s.x + w + pad <= this.w) {
        if (!best || s.h < best.h) best = s;
      }
    }
    if (!best) {
      if (this.nextY + h + pad > this.h) return null;
      best = { y: this.nextY, h, x: 0 };
      this.shelves.push(best);
      this.nextY += h + pad;
    }
    const r = { x: best.x, y: best.y, w, h };
    best.x += w + pad;
    return r;
  }
}

export class Atlas {
  constructor(size = 2048) {
    this.size = size;
    this.pages = [];
    this.packers = [];
    this.cache = new Map();
  }
  newPage() {
    this.pages.push(new Page(this.size, this.size));
    this.packers.push(new BestFitShelves(this.size, this.size, 1));
    return this.pages.length - 1;
  }
  // Texture reuse between copies of the same block variant: the first copy records the regions it
  // allocates (in order); a later copy built from the same seed asks for the same sizes in the same
  // order and gets those regions back, already painted. Any mismatch ends the replay for that copy.
  beginReplay(key) {
    if (!this.records) this.records = new Map();
    const rec = this.records.get(key);
    if (rec) { this.replaying = rec; this.replayAt = 0; this.recording = null; this.replayed = (this.replayed || 0); }
    else { this.recording = []; this.records.set(key, this.recording); this.replaying = null; }
  }
  endReplay() { this.recording = null; this.replaying = null; }
  // Allocate a w*h region. Returns { layer, x, y, w, h, p: Painter }
  alloc(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w > this.size || h > this.size) throw new Error(`atlas alloc too big ${w}x${h}`);
    if (this.replaying) {
      const r = this.replaying[this.replayAt++];
      if (r && r.w === w && r.h === h) {
        this.replayed++;
        return { layer: r.layer, x: r.x, y: r.y, w, h, p: new ReplayPainter(this.pages[r.layer], r.x, r.y, w, h) };
      }
      this.replaying = null;
    }
    const out = this._alloc(w, h);
    if (this.recording) this.recording.push({ layer: out.layer, x: out.x, y: out.y, w, h });
    return out;
  }
  _alloc(w, h) {
    for (let i = 1; i < this.pages.length; i++) {
      const r = this.packers[i].alloc(w, h);
      if (r) return this._region(i, r);
    }
    const i = this.newPage();
    const r = this.packers[i].alloc(w, h);
    return this._region(i, r);
  }
  // Dedicated whole page (used for the ground)
  allocPage(w, h) {
    const i = this.newPage();
    this.packers[i].nextY = this.size; // nothing else goes here
    return this._region(i, { x: 0, y: 0, w, h });
  }
  _region(layer, r) {
    return { layer, x: r.x, y: r.y, w: r.w, h: r.h, p: new Painter(this.pages[layer], r.x, r.y, r.w, r.h) };
  }
  // Cached shared region (e.g. tiled brick)
  shared(key, w, h, paint) {
    let r = this.cache.get(key);
    if (!r) {
      // (shared regions sit outside block replays: a later copy finds them in the cache)
      r = this._alloc(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      paint(r.p, r);
      this.cache.set(key, r);
    }
    return r;
  }
  upload(gl) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, this.size, this.size, this.pages.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.pages.forEach((pg, i) => {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, this.size, this.size, 1, gl.RGBA, gl.UNSIGNED_BYTE, pg.data);
    });
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
}
