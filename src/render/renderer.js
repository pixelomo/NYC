// Main renderer: shadow map -> light map -> low-res scene (MRT colour + glow + depth) -> bloom -> composite.

import { createProgram, makeTexture, makeDepthTexture, makeFBO, makeBuffer, setFilter } from '../core/gl.js';
import { STATIC_VS, STATIC_FS, SHADOW_VS, SHADOW_FS, FS_VS, SKY_FS, BLUR_FS, COMPOSITE_FS } from './shaders.js';
import { normalize3, cross3, dot3, valueNoise } from '../core/math.js';
import { MAP, BASE_DEPTH, T } from '../world/layout.js';

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.progStatic = createProgram(gl, STATIC_VS, STATIC_FS, 'static');
    this.progShadow = createProgram(gl, SHADOW_VS, SHADOW_FS, 'shadow');
    this.progSky = createProgram(gl, FS_VS, SKY_FS, 'sky');
    this.progBlur = createProgram(gl, FS_VS, BLUR_FS, 'blur');
    this.progComp = createProgram(gl, FS_VS, COMPOSITE_FS, 'composite');
    this.emptyVAO = gl.createVertexArray();
    this.noiseTex = this._makeNoise();
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const qs = new URLSearchParams(location.search);
    this.shadowSize = Math.min(qs.has('shadow') ? parseInt(qs.get('shadow'), 10) : 4096, maxTex);
    this.shadowTex = makeDepthTexture(gl, this.shadowSize, this.shadowSize, true);
    this.shadowFBO = makeFBO(gl, [], this.shadowTex);
    this._makeStaticShadow();
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.lightSize = 1024;
    this.lightTex = makeTexture(gl, this.lightSize, this.lightSize, this.floatOK
      ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR }
      : { filter: gl.LINEAR });
    this.lightFBO = makeFBO(gl, [this.lightTex], null);
    this.bw = 0;
    this.bh = 0;
    this.layers = [];
    this.stats = { tris: 0 };
  }

  setShadowSize(n) {
    const gl = this.gl;
    if (n === this.shadowSize) return;
    gl.deleteTexture(this.shadowTex);
    gl.deleteFramebuffer(this.shadowFBO);
    this.shadowSize = n;
    this.shadowTex = makeDepthTexture(gl, n, n, true);
    this.shadowFBO = makeFBO(gl, [], this.shadowTex);
    this._makeStaticShadow();
  }

  // Shadow map of the static city only (no sprites or cars). Trees sample it, so their canopies
  // are shaded by buildings but never by each other's flat billboard shadows.
  _makeStaticShadow() {
    const gl = this.gl;
    const n = Math.min(2048, this.shadowSize);
    if (this.shadowTexS && this.shadowSizeS === n) return;
    if (this.shadowTexS) { gl.deleteTexture(this.shadowTexS); gl.deleteFramebuffer(this.shadowFBOS); }
    this.shadowSizeS = n;
    this.shadowTexS = makeDepthTexture(gl, n, n, true);
    this.shadowFBOS = makeFBO(gl, [], this.shadowTexS);
  }

  _makeNoise() {
    const gl = this.gl, N = 256;
    const d = new Uint8Array(N * N);
    // tileable value noise (period 256 at base freq 1/16)
    const P = 16;
    const tileNoise = (x, y, period, seed) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const h = (a, b) => valueNoise(((a % period) + period) % period + 0.5, ((b % period) + period) % period + 0.5, seed) ;
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), e = h(xi + 1, yi + 1);
      return (a + (b - a) * u) * (1 - v) + (c + (e - c) * u) * v;
    };
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let s = 0, amp = 0.5, tot = 0;
        for (let o = 0; o < 4; o++) {
          const f = (P << o) / N;
          s += amp * tileNoise(x * f, y * f, P << o, 7 + o);
          tot += amp;
          amp *= 0.5;
        }
        d[y * N + x] = Math.max(0, Math.min(255, Math.round(((s / tot - 0.5) * 1.6 + 0.5) * 255)));
      }
    const t = makeTexture(gl, N, N, { internal: gl.R8, format: gl.RED, data: d, filter: gl.LINEAR, wrap: gl.REPEAT });
    return t;
  }

  setStatic(mesh, atlas, groundPage) {
    const gl = this.gl;
    this.atlasTex = atlas.upload(gl);
    // ground: one big texture (world-space, T texels per unit); halve it if the GPU can't hold it
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    let gp = groundPage, scale = 1;
    if (gp.w > maxTex) {
      const h = new Uint8Array((gp.w >> 1) * (gp.h >> 1) * 4);
      for (let y = 0; y < gp.h >> 1; y++) for (let x = 0; x < gp.w >> 1; x++) {
        const s = ((y * 2) * gp.w + x * 2) * 4, d = (y * (gp.w >> 1) + x) * 4;
        h[d] = gp.data[s]; h[d + 1] = gp.data[s + 1]; h[d + 2] = gp.data[s + 2]; h[d + 3] = gp.data[s + 3];
      }
      gp = { w: gp.w >> 1, h: gp.h >> 1, data: h };
      scale = 0.5;
    }
    this.groundTex = makeTexture(gl, gp.w, gp.h, { data: gp.data });
    this.groundScale = scale;
    // free CPU copies of the static textures
    for (const pg of atlas.pages) pg.data = null;
    groundPage.data = null;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    makeBuffer(gl, mesh.pos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    makeBuffer(gl, mesh.uv);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    makeBuffer(gl, mesh.rect);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_SHORT, 0, 0);
    makeBuffer(gl, mesh.nrm);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.BYTE, true, 0, 0);
    makeBuffer(gl, mesh.info);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, 0, 0);
    makeBuffer(gl, mesh.idx, gl.ELEMENT_ARRAY_BUFFER);
    gl.bindVertexArray(null);
    this.staticVAO = vao;
    this.staticCount = mesh.indexCount;
    this.stats.tris = mesh.indexCount / 3;
  }

  addLayer(layer) {
    this.layers.push(layer);
  }

  _ensureTargets(bw, bh) {
    if (bw === this.bw && bh === this.bh) return;
    const gl = this.gl;
    const del = (t) => t && gl.deleteTexture(t);
    del(this.sceneTex); del(this.glowTex); del(this.depthTex);
    del(this.bA); del(this.bB); del(this.bC); del(this.bD);
    this.bw = bw;
    this.bh = bh;
    this.sceneTex = makeTexture(gl, bw, bh);
    this.glowTex = makeTexture(gl, bw, bh, { filter: gl.LINEAR });
    this.depthTex = makeDepthTexture(gl, bw, bh, false);
    this.sceneFBO = makeFBO(gl, [this.sceneTex, this.glowTex], this.depthTex);
    const hw = Math.max(1, bw >> 1), hh = Math.max(1, bh >> 1);
    const qw = Math.max(1, bw >> 2), qh = Math.max(1, bh >> 2);
    this.bA = makeTexture(gl, hw, hh, { filter: gl.LINEAR });
    this.bB = makeTexture(gl, hw, hh, { filter: gl.LINEAR });
    this.bC = makeTexture(gl, qw, qh, { filter: gl.LINEAR });
    this.bD = makeTexture(gl, qw, qh, { filter: gl.LINEAR });
    this.fA = makeFBO(gl, [this.bA], null);
    this.fB = makeFBO(gl, [this.bB], null);
    this.fC = makeFBO(gl, [this.bC], null);
    this.fD = makeFBO(gl, [this.bD], null);
  }

  // Light-space ortho matrix. Depth spans the whole map (an occluder anywhere along the light can
  // shade what is on screen) but x/y only cover what the camera can see, so the shadow map's
  // texels go where they are looked at. The extent is quantised and the centre snapped to whole
  // texels, so panning never makes shadow edges crawl.
  shadowMatrix(sunDir, view = null) {
    const f = normalize3([-sunDir[0], -sunDir[1], -sunDir[2]]);
    let up = [0, 0, 1];
    if (Math.abs(f[2]) > 0.98) up = [0, 1, 0];
    const r = normalize3(cross3(f, up));
    const u = cross3(r, f);
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const grow = (p, a, b, n) => { for (let i = 0; i < n; i++) { const v = i === 0 ? dot3(p, r) : i === 1 ? dot3(p, u) : dot3(p, f); a[i] = Math.min(a[i], v); b[i] = Math.max(b[i], v); } };
    for (const x of [-3, MAP + 3])
      for (const y of [-3, MAP + 3])
        for (const z of [-BASE_DEPTH, 75]) grow([x, y, z], mn, mx, 3);
    if (view) {
      const cam = view.camera, t = cam.project(cam.x, cam.y, 0);
      const vmn = [1e9, 1e9], vmx = [-1e9, -1e9];
      const mx2 = view.w / 2 + 24, my2 = view.h / 2 + 24;
      for (const sx of [t[0] - mx2, t[0] + mx2])
        for (const sy of [t[1] - my2, t[1] + my2])
          for (const z of [-BASE_DEPTH, 75]) { const [x, y] = cam.artToWorld(sx, sy, z); grow([x, y, z], vmn, vmx, 2); }
      for (let i = 0; i < 2; i++) {
        const a = Math.max(mn[i], vmn[i] - 2), b = Math.min(mx[i], vmx[i] + 2);
        if (b > a + 1) { mn[i] = a; mx[i] = b; }
      }
    }
    const ss = Math.min(this.shadowSize, this.shadowSizeS || this.shadowSize);
    const q = (v) => Math.pow(2, Math.ceil(Math.log2(Math.max(v, 8)) * 4) / 4);
    const h = [q((mx[0] - mn[0]) / 2), q((mx[1] - mn[1]) / 2), (mx[2] - mn[2]) / 2 + 1];
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    for (let i = 0; i < 2; i++) { const ts = (2 * h[i]) / ss; c[i] = Math.round(c[i] / ts) * ts; }
    const m = new Float32Array(16);
    m[0] = r[0] / h[0]; m[4] = r[1] / h[0]; m[8] = r[2] / h[0]; m[12] = -c[0] / h[0];
    m[1] = u[0] / h[1]; m[5] = u[1] / h[1]; m[9] = u[2] / h[1]; m[13] = -c[1] / h[1];
    m[2] = f[0] / h[2]; m[6] = f[1] / h[2]; m[10] = f[2] / h[2]; m[14] = -c[2] / h[2];
    m[15] = 1;
    // world units per shadow texel, and shadow-map depth (0..1) per world unit, for texel-scaled biases
    this.shadowK = [Math.max(h[0], h[1]) * 2 / this.shadowSize, 1 / (2 * h[2])];
    this.shadowKS = [Math.max(h[0], h[1]) * 2 / this.shadowSizeS, 1 / (2 * h[2])];
    return m;
  }

  // Common lit-surface uniforms
  setLit(p, ctx) {
    const gl = this.gl, u = p.u, e = ctx.env;
    gl.uniformMatrix4fv(u.uViewProj, false, ctx.viewProj);
    if (u.uShadowMat) gl.uniformMatrix4fv(u.uShadowMat, false, ctx.shadowMat);
    if (u.uShadowK) gl.uniform2fv(u.uShadowK, ctx.shadowK);
    if (u.uDither) gl.uniform2fv(u.uDither, ctx.ditherOff);
    gl.uniform1f(u.uShadowOn, ctx.shadowOn ? 1 : 0);
    gl.uniform3fv(u.uSunDir, e.sunDir);
    gl.uniform3fv(u.uSunCol, e.sunCol);
    gl.uniform3fv(u.uAmb, e.amb);
    gl.uniform3fv(u.uFace, e.face);
    gl.uniform2f(u.uRot, Math.cos(ctx.camera.angle), Math.sin(ctx.camera.angle));
    gl.uniform1f(u.uEmis, e.emis);
    gl.uniform1f(u.uSnow, e.snow);
    gl.uniform1f(u.uWet, e.wet);
    gl.uniform1f(u.uTime, ctx.time);
    gl.uniform4fv(u.uCloud, e.cloud);
    gl.uniform1f(u.uFlash, e.flash);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(u.uShadow, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.uniform1i(u.uLightMap, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.uniform1i(u.uNoise, 3);
  }

  render(camera, env, time, canvasW, canvasH) {
    const gl = this.gl;
    const scale = camera.scale; // device pixels per art pixel
    // Zoomed out (scale < 1): shrink the art itself into the buffer (k buffer px per art px), rendering at
    // most 2x the canvas resolution and filtering down, instead of a buffer of canvas/scale pixels.
    let k = 1;
    if (scale < 1) k = Math.min(1, scale * 2, (4096 * scale) / (canvasW + 8), (4096 * scale) / (canvasH + 8));
    const bs = scale / k; // device pixels per buffer pixel
    const linear = bs < 0.999;
    let bw = Math.ceil(canvasW / bs) + 4, bh = Math.ceil(canvasH / bs) + 4;
    bw += bw & 1; bh += bh & 1;
    bw = Math.min(bw, 4096); bh = Math.min(bh, 4096);
    this._ensureTargets(bw, bh);
    const { viewProj, frac, tsx, tsy } = camera.matrices(bw, bh, k);
    const shadowOn = env.sunDir[2] > 0.02;
    const shadowMat = this.shadowMatrix(env.sunDir, { camera, w: bw / k, h: bh / k });
    // offset that turns buffer pixels into absolute art pixels (mod 4), so shadow dithering stays put while panning
    const ditherOff = [(((tsx - bw / 2) % 4) + 4) % 4, (((tsy + bh / 2) % 4) + 4) % 4];
    // world xy per art pixel along the screen's horizontal axis (sprite billboards lie in this plane)
    const ca = Math.cos(camera.angle), sa = Math.sin(camera.angle);
    const right = camera.screenRight();
    void ca; void sa;
    const ctx = { viewProj, shadowMat, shadowK: this.shadowK, shadowKS: this.shadowKS, right, squash: camera.squash, ditherOff, k, shadowOn, env, camera, time, bw, bh, renderer: this, gl };
    const vis = env.vis >>> 0;

    // 1. Shadow map
    if (shadowOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.5, 3.0);
      const p = this.progShadow;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u.uShadowVP, false, shadowMat);
      gl.uniform1ui(p.u.uVis, vis);
      gl.uniform1ui(p.u.uSkipDetail, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlasTex);
      gl.uniform1i(p.u.uAtlas, 0);
      gl.bindVertexArray(this.staticVAO);
      gl.drawElements(gl.TRIANGLES, this.staticCount, gl.UNSIGNED_INT, 0);
      for (const l of this.layers) l.shadow && l.shadow(ctx);
      // static-only map for tall sprites (same light matrix, static geometry only)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBOS);
      gl.viewport(0, 0, this.shadowSizeS, this.shadowSizeS);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u.uShadowVP, false, shadowMat);
      gl.uniform1ui(p.u.uVis, vis);
      gl.uniform1ui(p.u.uSkipDetail, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlasTex);
      gl.uniform1i(p.u.uAtlas, 0);
      gl.bindVertexArray(this.staticVAO);
      gl.drawElements(gl.TRIANGLES, this.staticCount, gl.UNSIGNED_INT, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // 2. Light map (world-space XY additive light)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFBO);
    gl.viewport(0, 0, this.lightSize, this.lightSize);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (const l of this.layers) l.light && l.light(ctx);
    gl.disable(gl.BLEND);

    // 3. Scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.viewport(0, 0, bw, bh);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    {
      const p = this.progSky;
      gl.useProgram(p.program);
      gl.uniform3fv(p.u.uTop, env.skyTop);
      gl.uniform3fv(p.u.uBottom, env.skyBottom);
      gl.uniform1f(p.u.uStars, env.stars);
      gl.uniform1f(p.u.uTime, time);
      gl.uniform2f(p.u.uBuf, bw, bh);
      gl.uniform1f(p.u.uRotA, camera.angle);
      gl.uniform3fv(p.u.uMoon, env.moon);
      {
        // project the map centre well below the slab to place the drop shadow
        const c = camera.project(MAP / 2, MAP / 2, -BASE_DEPTH - 14);
        const sx = bw / 2 + (c[0] * k - tsx), sy = bh / 2 - (c[1] * k - tsy);
        if (camera.bird) gl.uniform4f(p.u.uShadowBlob, sx, sy, MAP * T * 0.58 * k, MAP * T * 0.58 * k);
        else gl.uniform4f(p.u.uShadowBlob, sx, sy, MAP * T * 0.62 * k, MAP * (T / 2) * 0.62 * k);
      }
      gl.bindVertexArray(this.emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    {
      const p = this.progStatic, u = p.u;
      gl.useProgram(p.program);
      this.setLit(p, ctx);
      gl.uniform1ui(u.uVis, vis);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlasTex);
      gl.uniform1i(u.uAtlas, 0);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
      gl.uniform1i(u.uGround, 4);
      gl.uniform1f(u.uGroundScale, this.groundScale);
      gl.uniform1f(u.uResLit, env.resLit);
      gl.uniform1f(u.uOffLit, env.offLit);
      gl.uniform1f(u.uLeaves, env.leaves);
      gl.uniform1f(u.uSeason, env.season);
      gl.uniform1f(u.uFlowers, env.flowers);
      gl.uniform3fv(u.uSkyTop, env.skyTop);
      gl.uniform3fv(u.uSkyHor, env.skyBottom);
      gl.uniform3fv(u.uViewDir, camera.viewDir());
      gl.uniform1f(u.uIce, env.ice);
      gl.uniform1f(u.uCrown, env.crown);
      gl.uniform3fv(u.uCrownA, env.crownA);
      gl.uniform3fv(u.uCrownB, env.crownB);
      gl.bindVertexArray(this.staticVAO);
      gl.drawElements(gl.TRIANGLES, this.staticCount, gl.UNSIGNED_INT, 0);
    }
    for (const l of this.layers) l.draw && l.draw(ctx);
    for (const l of this.layers) l.drawLate && l.drawLate(ctx);
    gl.bindVertexArray(null);

    // 4. Bloom
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    const blur = (src, dst, w, h, dx, dy, gain) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
      gl.viewport(0, 0, w, h);
      const p = this.progBlur;
      gl.useProgram(p.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(p.u.uSrc, 0);
      gl.uniform2f(p.u.uDir, dx, dy);
      gl.uniform1f(p.u.uGain, gain);
      gl.bindVertexArray(this.emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const hw = bw >> 1, hh = bh >> 1, qw = bw >> 2, qh = bh >> 2;
    blur(this.glowTex, this.fA, hw, hh, 1 / bw, 0, 1);
    blur(this.bA, this.fB, hw, hh, 0, 1 / hh, 1);
    blur(this.bB, this.fC, qw, qh, 2 / hw, 0, 1);
    blur(this.bC, this.fD, qw, qh, 0, 2 / qh, 1);

    // 5. Composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasW, canvasH);
    setFilter(gl, this.sceneTex, linear ? gl.LINEAR : gl.NEAREST);
    const p = this.progComp, u = p.u;
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bB);
    gl.uniform1i(u.uBloom, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.bD);
    gl.uniform1i(u.uBloom2, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    gl.uniform1i(u.uDepth, 3);
    gl.uniform2f(u.uBuf, bw, bh);
    gl.uniform2f(u.uCanvas, canvasW, canvasH);
    gl.uniform1f(u.uScale, bs);
    gl.uniform2f(u.uFrac, frac[0], frac[1]);
    gl.uniform1f(u.uBloomK, env.bloom);
    gl.uniform3fv(u.uGrade, env.grade);
    gl.uniform1f(u.uSat, env.sat);
    gl.uniform1f(u.uVignette, 0.35);
    gl.uniform1f(u.uOutline, env.outline);
    gl.uniform1f(u.uFlash, env.flash);
    gl.uniform1f(u.uLinear, linear ? 1 : 0);
    gl.uniform4fv(u.uFog, env.fogv || [0, 0, 0, 0]);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    return ctx;
  }
}
