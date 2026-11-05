(() => {
  // src/core/gl.js
  function createGL(canvas2) {
    let gl = canvas2.getContext("webgl2", {
      antialias: !1,
      alpha: !1,
      depth: !1,
      stencil: !1,
      premultipliedAlpha: !1,
      preserveDrawingBuffer: !1,
      powerPreference: "high-performance"
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    return gl;
  }
  function compileShader(gl, type, src, name) {
    let s = gl.createShader(type);
    if (gl.shaderSource(s, src), gl.compileShader(s), !gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      let log = gl.getShaderInfoLog(s), lines = src.split(`
`).map((l, i) => `${i + 1}: ${l}`).join(`
`);
      throw console.error(lines), new Error(`${name} ${type === gl.VERTEX_SHADER ? "VS" : "FS"} compile error: ${log}`);
    }
    return s;
  }
  function createProgram(gl, vsSrc, fsSrc, name = "program") {
    let vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, name), fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, name), p = gl.createProgram();
    if (gl.attachShader(p, vs), gl.attachShader(p, fs), gl.linkProgram(p), !gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(`${name} link error: ${gl.getProgramInfoLog(p)}`);
    let u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      let info = gl.getActiveUniform(p, i), nm = info.name.replace(/\[0\]$/, "");
      u[nm] = gl.getUniformLocation(p, info.name);
    }
    return { program: p, u, name };
  }
  function makeTexture(gl, w, h, opts = {}) {
    let {
      internal = gl.RGBA8,
      format = gl.RGBA,
      type = gl.UNSIGNED_BYTE,
      filter = gl.NEAREST,
      wrap = gl.CLAMP_TO_EDGE,
      data = null
    } = opts, t = gl.createTexture();
    return gl.bindTexture(gl.TEXTURE_2D, t), gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1), gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap), t.w = w, t.h = h, t;
  }
  function setFilter(gl, tex, filter) {
    gl.bindTexture(gl.TEXTURE_2D, tex), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }
  function makeDepthTexture(gl, w, h, compare = !1) {
    let t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t), gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    let f = compare ? gl.LINEAR : gl.NEAREST;
    return gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE), compare && (gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL)), t.w = w, t.h = h, t;
  }
  function makeFBO(gl, colors, depth) {
    let fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    let bufs = [];
    colors.forEach((tex, i) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0), bufs.push(gl.COLOR_ATTACHMENT0 + i);
    }), depth && gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0), bufs.length ? gl.drawBuffers(bufs) : (gl.drawBuffers([gl.NONE]), gl.readBuffer(gl.NONE));
    let st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return st !== gl.FRAMEBUFFER_COMPLETE && console.warn("FBO incomplete", st.toString(16)), gl.bindFramebuffer(gl.FRAMEBUFFER, null), fb.colors = colors, fb.depth = depth, fb;
  }
  function makeBuffer(gl, data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) {
    let b = gl.createBuffer();
    return gl.bindBuffer(target, b), gl.bufferData(target, data, usage), b;
  }

  // src/render/shaders.js
  var HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
precision highp sampler2DShadow;
`, COMMON = `
uniform sampler2DShadow uShadow;
uniform sampler2D uLightMap;
uniform sampler2D uNoise;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform vec3 uFace;
uniform vec2 uRot;
uniform float uEmis;
uniform float uSnow;
uniform float uWet;
uniform float uTime;
uniform vec4 uCloud;
uniform float uFlash;

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float nz(vec2 p) { return texture(uNoise, p).r; }

float shadowAt(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sp = uShadowMat * vec4(wp + n * 0.07 + uSunDir * 0.03, 1.0);
  vec3 s = sp.xyz * 0.5 + 0.5;
  if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  float v = texture(uShadow, vec3(s.xy, s.z - 0.0006));
  // pixel-art: dither the penumbra instead of smooth blending
  return step(bayer4(gl_FragCoord.xy), v);
}
float cloudAt(vec3 wp) {
  float c = nz(wp.xy * 0.006 + uCloud.xy) * 0.65 + nz(wp.xy * 0.017 + uCloud.xy * 1.7) * 0.35;
  float cov = uCloud.z;
  float m = smoothstep(1.0 - cov - 0.08, 1.0 - cov + 0.08, c);
  return 1.0 - m * uCloud.w;
}
vec3 lampAt(vec3 wp) {
  if (wp.z < -0.5) return vec3(0.0);
  vec3 l = texture(uLightMap, wp.xy / 128.0).rgb;
  float hf = clamp(1.0 - (wp.z - 0.3) / 8.0, 0.0, 1.0);
  return l * (hf * hf);
}
float faceShade(vec3 n) {
  vec2 r = vec2(uRot.x * n.x - uRot.y * n.y, uRot.y * n.x + uRot.x * n.y);
  float wl = max(r.y, 0.0), wr = max(r.x, 0.0);
  float side = mix(uFace.y, uFace.z, wr / (wl + wr + 1e-4));
  return mix(side, uFace.x, clamp(n.z, 0.0, 1.0));
}
`, STATIC_VS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in uvec4 aRect;
layout(location=3) in vec4 aNrm;
layout(location=4) in uvec4 aInfo;
uniform mat4 uViewProj;
uniform uint uVis;
out vec3 vWorld;
out vec2 vUV;
flat out uvec4 vRect;
flat out vec3 vNrm;
flat out uvec4 vInfo;
void main() {
  if (((uVis >> aInfo.z) & 1u) == 0u) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vWorld = aPos;
  vUV = aUV;
  vRect = aRect;
  vNrm = aNrm.xyz;
  vInfo = aInfo;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`, STATIC_FS = HEAD + COMMON + `
in vec3 vWorld;
in vec2 vUV;
flat in uvec4 vRect;
flat in vec3 vNrm;
flat in uvec4 vInfo;
uniform sampler2DArray uAtlas;
uniform highp sampler2D uGround;
uniform float uGroundScale;
uniform float uResLit;
uniform float uOffLit;
uniform float uLeaves;
uniform float uSeason;
uniform float uFlowers;
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
uniform vec3 uViewDir;
uniform float uIce;
uniform float uCrown;
uniform vec3 uCrownA;
uniform vec3 uCrownB;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;

vec3 windowColor(float h) {
  if (h < 0.42) return vec3(1.0, 0.80, 0.45);
  if (h < 0.68) return vec3(1.0, 0.92, 0.72);
  if (h < 0.84) return vec3(0.80, 0.92, 1.0);
  if (h < 0.93) return vec3(1.0, 0.60, 0.32);
  return vec3(0.45, 0.6, 1.0);
}

void main() {
  uint mat = vInfo.y;
  bool ground = (mat & 4u) != 0u;
  vec4 tex;
  if (ground) tex = texelFetch(uGround, ivec2(floor(vUV * uGroundScale)), 0);
  else {
    ivec2 tc = ivec2(vRect.xy) + ivec2(mod(floor(vUV), vec2(vRect.zw)));
    tex = texelFetch(uAtlas, ivec3(tc, int(vInfo.x)), 0);
  }
  if (tex.a < 0.5 / 255.0) discard;
  vec3 n = normalize(vNrm);
  vec3 albedo = tex.rgb;
  float code = floor(tex.a * 255.0 + 0.5);
  vec3 emis = vec3(0.0);
  float selfLit = 0.0;
  float refl = 0.0;
  float wetK = 0.0;
  float puddle = 0.0;
  vec2 wp2 = vWorld.xy;
  // stable per-texel world coordinate for noise (texel grid)
  vec2 tp = floor(vWorld.xy * 32.0) / 32.0;

  if (ground) {
    int g = int(code);
    float n1 = nz(tp * 0.11);
    float n2 = hash12(floor(vWorld.xy * 16.0));
    float n3 = nz(tp * 0.035 + 0.3);
    // water
    if (g == 15) {
      if (uIce > 0.5) {
        albedo = mix(vec3(0.78, 0.88, 0.95), vec3(0.92, 0.96, 1.0), step(0.6, n1));
        if (hash12(floor(vWorld.xy * 32.0)) < 0.04) albedo *= 0.85;
      } else {
        float w = nz(tp * 0.25 + vec2(uTime * 0.02, uTime * 0.013)) + nz(tp * 0.31 - vec2(uTime * 0.017, -uTime * 0.01));
        albedo = mix(vec3(0.16, 0.42, 0.55), vec3(0.28, 0.62, 0.72), smoothstep(0.7, 1.3, w));
        refl = 0.35;
        if (w > 1.38) albedo = vec3(0.75, 0.92, 1.0);
      }
    }
    // autumn leaves
    if (uLeaves > 0.0 && (g == 6 || g == 8 || g == 9 || g == 11 || g == 17 || g == 22)) {
      float k = (g == 8 || g == 9) ? 1.0 : 0.55;
      if (n2 < uLeaves * 0.26 * k * smoothstep(0.35, 0.75, n3)) {
        float h = hash12(floor(vWorld.xy * 16.0) + 7.0);
        albedo = h < 0.33 ? vec3(0.85, 0.42, 0.12) : h < 0.66 ? vec3(0.72, 0.22, 0.10) : vec3(0.88, 0.66, 0.18);
      }
    }
    // spring/summer flowers
    if (g == 10) {
      float h = hash12(floor(vWorld.xy * 16.0) + 3.0);
      if (uFlowers > 0.0 && h < 0.32 * uFlowers) {
        float c = hash12(floor(vWorld.xy * 16.0) + 11.0);
        vec3 fc = uSeason < 0.5 ? (c < 0.4 ? vec3(0.95, 0.2, 0.25) : c < 0.75 ? vec3(1.0, 0.85, 0.2) : vec3(0.95, 0.55, 0.85))
                : uSeason < 1.5 ? (c < 0.3 ? vec3(0.95, 0.35, 0.6) : c < 0.6 ? vec3(0.4, 0.5, 0.95) : vec3(1.0, 0.95, 0.9))
                : (c < 0.5 ? vec3(0.95, 0.55, 0.15) : vec3(0.75, 0.2, 0.2));
        albedo = fc;
      } else if (uFlowers > 0.0 && h < 0.75) {
        albedo = vec3(0.22, 0.48, 0.18);
      }
    }
    if (g == 8 && uSeason < 0.5 && uFlowers > 0.0 && n2 > 0.985) albedo = vec3(1.0, 0.95, 0.6);
    if (g == 8 && uSeason > 1.5 && uSeason < 2.5) albedo = mix(albedo, vec3(0.55, 0.55, 0.25), 0.25);
    // wetness
    bool hard = (g <= 7) || g == 11 || g == 12 || g == 13 || g == 16 || g == 17 || g == 19 || g == 20 || g == 18;
    if (hard) {
      wetK = uWet;
      float pm = nz(tp * 0.05 + 4.1) * 0.7 + nz(tp * 0.2) * 0.3;
      puddle = uWet * smoothstep(0.62, 0.66, pm);
    } else wetK = uWet * 0.6;
    // snow
    if (uSnow > 0.001) {
      float sn = nz(tp * 0.045 + 7.3);
      vec3 snowC = mix(vec3(0.84, 0.89, 0.97), vec3(0.97, 0.98, 1.0), smoothstep(0.35, 0.65, sn));
      float cover = 0.0;
      if (g == 1 || g == 3 || g == 4 || g == 5 || g == 19 || g == 20 || g == 18) {
        // driven lanes: slush
        float s = smoothstep(0.0, 1.0, uSnow) * (0.55 + 0.45 * n3);
        vec3 slush = mix(vec3(0.40, 0.40, 0.43), vec3(0.58, 0.57, 0.56), smoothstep(0.3, 0.7, n1));
        albedo = mix(albedo, slush, s * 0.8);
        if (n1 < uSnow * 0.38 - 0.05) albedo = snowC * 0.94;
      } else if (g == 2) {
        cover = uSnow * 1.15;
      } else if (g == 6 || g == 7) {
        cover = uSnow * (0.35 + 0.6 * n3);
      } else if (g == 15) {
        cover = uIce > 0.5 ? uSnow * 0.3 : 0.0;
      } else {
        cover = uSnow * 1.25;
      }
      float thr = n1 * 0.85 + n2 * 0.15;
      if (thr < cover - 0.05) { albedo = snowC; wetK *= 0.2; puddle = 0.0; }
      else if (thr < cover + 0.02) { albedo = mix(albedo, snowC, 0.55); }
    }
  } else {
    // non-ground: snow on top-facing surfaces
    if ((mat & 1u) != 0u && n.z > 0.55 && uSnow > 0.001) {
      float n1 = nz(tp * 0.13 + vWorld.z * 0.07);
      float n2 = hash12(floor(vWorld.xy * 16.0));
      if (n1 * 0.85 + n2 * 0.15 < uSnow * 1.3 - 0.05) {
        albedo = mix(vec3(0.86, 0.9, 0.98), vec3(0.98, 0.99, 1.0), smoothstep(0.3, 0.7, nz(tp * 0.05)));
        code = 255.0;
      }
    }
    if ((mat & 16u) != 0u) wetK = uWet * (n.z > 0.5 ? 1.0 : 0.35);
    // windows / emissive codes
    if (code > 0.5 && code < 254.5) {
      bool selfC = code >= 128.0;
      float t = selfC ? (code - 128.0) / 126.0 : (code - 1.0) / 126.0;
      // per-floor variation for tiled facades
      float fl = floor(vUV.y / float(vRect.w));
      float fc = floor(vUV.x / float(vRect.z));
      if (fl > 0.5 || fc > 0.5 || vInfo.w > 0u) {
        float hf = hash12(vec2(fl * 1.37 + float(vInfo.w) * 3.1, fc * 2.11 + t * 17.0));
        t = mix(hf, t, 0.35);
      }
      bool office = (mat & 8u) != 0u;
      float lit = office ? uOffLit : uResLit;
      if (selfC && t > 0.985) {
        // special crown lighting (art-deco tower etc.)
        emis = mix(uCrownA, uCrownB, step(0.5, fract(vWorld.z * 0.5 + 0.25))) * albedo * 2.2 * uCrown;
      } else if (t < lit) {
        float h = hash12(vec2(t * 91.0, fl + float(vInfo.w)));
        if (selfC) {
          selfLit = uEmis;
        } else {
          vec3 wc = windowColor(h);
          if (h > 0.93) wc *= 0.75 + 0.25 * sin(uTime * (7.0 + h * 9.0) + t * 40.0) * sin(uTime * 2.3 + h * 20.0);
          emis = wc * uEmis * 0.82;
        }
      }
      if (!selfC) refl = (mat & 2u) != 0u ? 0.55 : 0.22;
    }
  }

  // lighting
  float ndl = dot(n, uSunDir);
  float sh = ndl > 0.0 ? shadowAt(vWorld, n) : 0.0;
  float cl = cloudAt(vWorld);
  vec3 light = uAmb * faceShade(n) + uSunCol * max(ndl, 0.0) * sh * cl;
  vec3 lamp = lampAt(vWorld);
  light += lamp * (0.55 + 0.45 * max(n.z, 0.0));
  light += vec3(uFlash);
  // underground (subway cut-away): dim, warm tunnel lighting
  if (vWorld.z < -0.5) light = light * 0.5 + vec3(0.17, 0.155, 0.13);

  float wetDark = 1.0 - wetK * 0.38;
  vec3 col = albedo * wetDark * light;

  // reflections (glass, water, puddles)
  vec3 r = reflect(-uViewDir, n);
  vec3 sky = mix(uSkyHor, uSkyTop, clamp(r.z * 1.4, 0.0, 1.0));
  if (refl > 0.0) {
    float spec = pow(max(dot(r, uSunDir), 0.0), 48.0) * sh;
    col = mix(col, sky * (0.55 + 0.45 * cl), refl) + uSunCol * spec * refl * 1.5;
  }
  if (puddle > 0.0) {
    col = mix(col, sky * 0.75 + lamp * 1.4, puddle * 0.75);
  } else if (wetK > 0.0 && n.z > 0.5) {
    col += lamp * wetK * 0.5;
  }

  col += emis;
  // self-coloured lights (neon, signs, curtains, billboards): show their own colour at full brightness
  vec3 sglow = vec3(0.0);
  if (selfLit > 0.0) {
    col = mix(col, albedo * 1.08, clamp(selfLit, 0.0, 1.0) * 0.92);
    sglow = albedo * selfLit * 0.1;
  }
  oColor = vec4(col, 1.0);
  oGlow = vec4(emis * 0.38 + sglow + lamp * puddle * 0.25, 1.0);
}`, SHADOW_VS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in uvec4 aRect;
layout(location=4) in uvec4 aInfo;
uniform mat4 uShadowVP;
uniform uint uVis;
out vec2 vUV;
flat out uvec4 vRect;
flat out uint vLayer;
flat out uint vMat;
void main() {
  if (((uVis >> aInfo.z) & 1u) == 0u) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vUV = aUV; vRect = aRect; vLayer = aInfo.x; vMat = aInfo.y;
  gl_Position = uShadowVP * vec4(aPos, 1.0);
}`, SHADOW_FS = HEAD + `
in vec2 vUV;
flat in uvec4 vRect;
flat in uint vLayer;
flat in uint vMat;
uniform sampler2DArray uAtlas;
out vec4 o;
void main() {
  if ((vMat & 4u) != 0u) { o = vec4(1.0); return; }
  ivec2 tc = ivec2(vRect.xy) + ivec2(mod(floor(vUV), vec2(vRect.zw)));
  if (texelFetch(uAtlas, ivec3(tc, int(vLayer)), 0).a < 0.5 / 255.0) discard;
  o = vec4(1.0);
}`, FS_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`, SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform float uStars;
uniform float uTime;
uniform vec2 uBuf;
uniform float uRotA;
uniform vec3 uMoon; // x,y in [0,1], z = visibility
uniform vec4 uShadowBlob; // centre (buffer px), radius x, radius y
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 px = floor(vUv * uBuf);
  float t = vUv.y;
  vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, t));
  // dithered banding for a pixel look
  float d = fract(sin(dot(px, vec2(0.71, 0.93))) * 91.7);
  c += (d - 0.5) / 255.0 * 3.0;
  vec3 g = vec3(0.0);
  if (uStars > 0.01) {
    vec2 sp = px + vec2(uRotA * 180.0, 0.0);
    float s = h(floor(sp));
    if (s > 0.9965) {
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + s * 6.0) + s * 100.0);
      vec3 sc = vec3(0.9, 0.95, 1.0) * tw * uStars * smoothstep(0.15, 0.6, t);
      c += sc; g += sc * 0.3;
    }
  }
  if (uMoon.z > 0.01) {
    vec2 mp = uMoon.xy * uBuf;
    float r = 7.0;
    float dd = length(px + 0.5 - mp);
    if (dd < r) {
      float crater = h(floor((px - mp) / 2.0)) > 0.8 ? 0.85 : 1.0;
      vec3 mc = vec3(0.95, 0.93, 0.82) * crater * uMoon.z;
      c = mix(c, mc, uMoon.z); g += mc * 0.6;
    } else if (dd < r + 10.0) {
      float k = (1.0 - (dd - r) / 10.0);
      c += vec3(0.25, 0.28, 0.35) * k * k * uMoon.z * 0.6;
    }
  }
  // soft shadow of the floating diorama on the void below
  if (uShadowBlob.z > 1.0) {
    vec2 q = (px - uShadowBlob.xy) / uShadowBlob.zw;
    float dd = dot(q, q);
    float sh = clamp(1.0 - dd, 0.0, 1.0);
    sh = floor(sh * 5.0) / 5.0;
    c *= 1.0 - sh * 0.28;
  }
  oColor = vec4(c, 1.0);
  oGlow = vec4(g, 1.0);
}`, BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir;
uniform float uGain;
out vec4 o;
void main() {
  vec3 s = texture(uSrc, vUv).rgb * 0.227027;
  s += texture(uSrc, vUv + uDir * 1.3846).rgb * 0.3162162;
  s += texture(uSrc, vUv - uDir * 1.3846).rgb * 0.3162162;
  s += texture(uSrc, vUv + uDir * 3.2308).rgb * 0.0702703;
  s += texture(uSrc, vUv - uDir * 3.2308).rgb * 0.0702703;
  o = vec4(s * uGain, 1.0);
}`, COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBloom2;
uniform sampler2D uDepth;
uniform vec2 uBuf;
uniform vec2 uCanvas;
uniform float uScale;
uniform vec2 uFrac;
uniform float uBloomK;
uniform vec3 uGrade;
uniform float uSat;
uniform float uVignette;
uniform float uOutline;
uniform float uFlash;
uniform float uLinear;
uniform vec4 uFog; // rgb, amount
out vec4 o;
void main() {
  vec2 X = gl_FragCoord.xy;
  vec2 p = vec2(uBuf.x * 0.5 + (X.x - uCanvas.x * 0.5) / uScale + uFrac.x,
                uBuf.y * 0.5 + (X.y - uCanvas.y * 0.5) / uScale - uFrac.y);
  vec2 uv = uLinear > 0.5 ? p / uBuf : (floor(p) + 0.5) / uBuf;
  vec3 c = texture(uScene, uv).rgb;
  if (uOutline > 0.0 && uLinear < 0.5) {
    vec2 q = (floor(p) + 0.5) / uBuf;
    vec2 e = 1.0 / uBuf;
    float d0 = texture(uDepth, q).r;
    float dn = min(min(texture(uDepth, q + vec2(e.x, 0.0)).r, texture(uDepth, q - vec2(e.x, 0.0)).r),
                   min(texture(uDepth, q + vec2(0.0, e.y)).r, texture(uDepth, q - vec2(0.0, e.y)).r));
    if (d0 - dn > 0.006) c *= (1.0 - uOutline);
  }
  if (uFog.w > 0.001) {
    float dz = texture(uDepth, (floor(p) + 0.5) / uBuf).r;
    float back = dz >= 0.9999 ? 1.0 : clamp((dz - 0.35) * 2.2, 0.0, 1.0);
    float ny = gl_FragCoord.y / uCanvas.y;
    c = mix(c, uFog.rgb, uFog.w * (0.3 + 0.55 * back + 0.15 * ny));
  }
  vec3 b = texture(uBloom, p / uBuf).rgb + texture(uBloom2, p / uBuf).rgb * 0.45;
  c += b * uBloomK;
  c *= uGrade;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  vec2 sc = gl_FragCoord.xy / uCanvas - 0.5;
  c *= 1.0 - dot(sc, sc) * uVignette;
  c += vec3(uFlash * 0.25);
  o = vec4(c, 1.0);
}`;

  // src/core/math.js
  var TAU = Math.PI * 2, clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
  var smoothstep = (a, b, x) => {
    let t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  var dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by), dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
  function mulberry32(a) {
    return function() {
      a |= 0, a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      return t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t, ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var RNG = class {
    constructor(seed = 1) {
      this.r = mulberry32(seed >>> 0);
    }
    next() {
      return this.r();
    }
    range(a, b) {
      return a + (b - a) * this.r();
    }
    int(a, b) {
      return a + Math.floor((b - a + 1) * this.r());
    }
    chance(p) {
      return this.r() < p;
    }
    pick(arr) {
      return arr[Math.floor(this.r() * arr.length)];
    }
    weighted(items) {
      let total = 0;
      for (let it of items) total += it[1];
      let r = this.r() * total;
      for (let it of items)
        if (r -= it[1], r <= 0) return it[0];
      return items[items.length - 1][0];
    }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        let j = Math.floor(this.r() * (i + 1)), t = arr[i];
        arr[i] = arr[j], arr[j] = t;
      }
      return arr;
    }
    gauss() {
      return (this.r() + this.r() + this.r() + this.r() - 2) * 0.8660254;
    }
  };
  function hash2i(x, y, seed = 0) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041) | 0;
    return h = Math.imul(h ^ h >>> 13, 1274126177), h ^= h >>> 16, (h >>> 0) / 4294967296;
  }
  function hash1(n) {
    return hash2i(n, n * 7 + 3, 91);
  }
  function valueNoise(x, y, seed = 0) {
    let xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), a = hash2i(xi, yi, seed), b = hash2i(xi + 1, yi, seed), c = hash2i(xi, yi + 1, seed), d = hash2i(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  var R = (c) => c >> 16 & 255, G = (c) => c >> 8 & 255, B = (c) => c & 255;
  function rgb(r, g, b) {
    return clamp(Math.round(r), 0, 255) << 16 | clamp(Math.round(g), 0, 255) << 8 | clamp(Math.round(b), 0, 255);
  }
  function shade(c, f) {
    return rgb(R(c) * f, G(c) * f, B(c) * f);
  }
  function mixc(c1, c2, t) {
    return rgb(lerp(R(c1), R(c2), t), lerp(G(c1), G(c2), t), lerp(B(c1), B(c2), t));
  }
  function normalize3(v) {
    let l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // src/world/layout.js
  var roadStart = (k) => k * 27 + 2, roadEnd = (k) => k * 27 + 2 + 5, roadCenter = (k) => k * 27 + 2 + 2.5, lotStart = (b) => b * 27 + 9, lotEnd = (b) => b * 27 + 9 + 18, BLOCK_TYPES = [
    ["deco", "glass", "office", "lofts"],
    ["modern", "commercial", "walkups", "brownstones"],
    ["tenements", "court", "park", "firehouse"],
    ["brownstones", "brownstones", "brownstones", "bodega"]
  ];
  function blockRect(bx, by) {
    return { x0: lotStart(bx), y0: lotStart(by), x1: lotEnd(bx), y1: lotEnd(by) };
  }

  // src/render/renderer.js
  var Renderer = class {
    constructor(gl) {
      this.gl = gl, this.progStatic = createProgram(gl, STATIC_VS, STATIC_FS, "static"), this.progShadow = createProgram(gl, SHADOW_VS, SHADOW_FS, "shadow"), this.progSky = createProgram(gl, FS_VS, SKY_FS, "sky"), this.progBlur = createProgram(gl, FS_VS, BLUR_FS, "blur"), this.progComp = createProgram(gl, FS_VS, COMPOSITE_FS, "composite"), this.emptyVAO = gl.createVertexArray(), this.noiseTex = this._makeNoise();
      let maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE), qs = new URLSearchParams(location.search);
      this.shadowSize = Math.min(qs.has("shadow") ? parseInt(qs.get("shadow"), 10) : 4096, maxTex), this.shadowTex = makeDepthTexture(gl, this.shadowSize, this.shadowSize, !0), this.shadowFBO = makeFBO(gl, [], this.shadowTex), this.floatOK = !!gl.getExtension("EXT_color_buffer_float"), gl.getExtension("OES_texture_float_linear"), this.lightSize = 512, this.lightTex = makeTexture(gl, this.lightSize, this.lightSize, this.floatOK ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR } : { filter: gl.LINEAR }), this.lightFBO = makeFBO(gl, [this.lightTex], null), this.bw = 0, this.bh = 0, this.layers = [], this.stats = { tris: 0 };
    }
    setShadowSize(n) {
      let gl = this.gl;
      n !== this.shadowSize && (gl.deleteTexture(this.shadowTex), gl.deleteFramebuffer(this.shadowFBO), this.shadowSize = n, this.shadowTex = makeDepthTexture(gl, n, n, !0), this.shadowFBO = makeFBO(gl, [], this.shadowTex));
    }
    _makeNoise() {
      let gl = this.gl, N = 256, d = new Uint8Array(N * N), P = 16, tileNoise = (x, y, period, seed) => {
        let xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), h = (a2, b2) => valueNoise((a2 % period + period) % period + 0.5, (b2 % period + period) % period + 0.5, seed), a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), e = h(xi + 1, yi + 1);
        return (a + (b - a) * u) * (1 - v) + (c + (e - c) * u) * v;
      };
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          let s = 0, amp = 0.5, tot = 0;
          for (let o = 0; o < 4; o++) {
            let f = (P << o) / N;
            s += amp * tileNoise(x * f, y * f, P << o, 7 + o), tot += amp, amp *= 0.5;
          }
          d[y * N + x] = Math.max(0, Math.min(255, Math.round(((s / tot - 0.5) * 1.6 + 0.5) * 255)));
        }
      return makeTexture(gl, N, N, { internal: gl.R8, format: gl.RED, data: d, filter: gl.LINEAR, wrap: gl.REPEAT });
    }
    setStatic(mesh, atlas, groundPage) {
      let gl = this.gl;
      this.atlasTex = atlas.upload(gl);
      let maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE), gp = groundPage, scale = 1;
      if (gp.w > maxTex) {
        let h = new Uint8Array((gp.w >> 1) * (gp.h >> 1) * 4);
        for (let y = 0; y < gp.h >> 1; y++) for (let x = 0; x < gp.w >> 1; x++) {
          let s = (y * 2 * gp.w + x * 2) * 4, d = (y * (gp.w >> 1) + x) * 4;
          h[d] = gp.data[s], h[d + 1] = gp.data[s + 1], h[d + 2] = gp.data[s + 2], h[d + 3] = gp.data[s + 3];
        }
        gp = { w: gp.w >> 1, h: gp.h >> 1, data: h }, scale = 0.5;
      }
      this.groundTex = makeTexture(gl, gp.w, gp.h, { data: gp.data }), this.groundScale = scale;
      for (let pg of atlas.pages) pg.data = null;
      groundPage.data = null;
      let vao = gl.createVertexArray();
      gl.bindVertexArray(vao), makeBuffer(gl, mesh.pos), gl.enableVertexAttribArray(0), gl.vertexAttribPointer(0, 3, gl.FLOAT, !1, 0, 0), makeBuffer(gl, mesh.uv), gl.enableVertexAttribArray(1), gl.vertexAttribPointer(1, 2, gl.FLOAT, !1, 0, 0), makeBuffer(gl, mesh.rect), gl.enableVertexAttribArray(2), gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_SHORT, 0, 0), makeBuffer(gl, mesh.nrm), gl.enableVertexAttribArray(3), gl.vertexAttribPointer(3, 4, gl.BYTE, !0, 0, 0), makeBuffer(gl, mesh.info), gl.enableVertexAttribArray(4), gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, 0, 0), makeBuffer(gl, mesh.idx, gl.ELEMENT_ARRAY_BUFFER), gl.bindVertexArray(null), this.staticVAO = vao, this.staticCount = mesh.indexCount, this.stats.tris = mesh.indexCount / 3;
    }
    addLayer(layer) {
      this.layers.push(layer);
    }
    _ensureTargets(bw, bh) {
      if (bw === this.bw && bh === this.bh) return;
      let gl = this.gl, del = (t) => t && gl.deleteTexture(t);
      del(this.sceneTex), del(this.glowTex), del(this.depthTex), del(this.bA), del(this.bB), del(this.bC), del(this.bD), this.bw = bw, this.bh = bh, this.sceneTex = makeTexture(gl, bw, bh), this.glowTex = makeTexture(gl, bw, bh, { filter: gl.LINEAR }), this.depthTex = makeDepthTexture(gl, bw, bh, !1), this.sceneFBO = makeFBO(gl, [this.sceneTex, this.glowTex], this.depthTex);
      let hw = Math.max(1, bw >> 1), hh = Math.max(1, bh >> 1), qw = Math.max(1, bw >> 2), qh = Math.max(1, bh >> 2);
      this.bA = makeTexture(gl, hw, hh, { filter: gl.LINEAR }), this.bB = makeTexture(gl, hw, hh, { filter: gl.LINEAR }), this.bC = makeTexture(gl, qw, qh, { filter: gl.LINEAR }), this.bD = makeTexture(gl, qw, qh, { filter: gl.LINEAR }), this.fA = makeFBO(gl, [this.bA], null), this.fB = makeFBO(gl, [this.bB], null), this.fC = makeFBO(gl, [this.bC], null), this.fD = makeFBO(gl, [this.bD], null);
    }
    shadowMatrix(sunDir) {
      let f = normalize3([-sunDir[0], -sunDir[1], -sunDir[2]]), up = [0, 0, 1];
      Math.abs(f[2]) > 0.98 && (up = [0, 1, 0]);
      let r = normalize3(cross3(f, up)), u = cross3(r, f), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (let x of [-3, 120])
        for (let y of [-3, 120])
          for (let z of [-7, 75]) {
            let p = [x, y, z], a = [dot3(p, r), dot3(p, u), dot3(p, f)];
            for (let i = 0; i < 3; i++)
              mn[i] = Math.min(mn[i], a[i]), mx[i] = Math.max(mx[i], a[i]);
          }
      let c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], h = [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2 + 1], m = new Float32Array(16);
      return m[0] = r[0] / h[0], m[4] = r[1] / h[0], m[8] = r[2] / h[0], m[12] = -c[0] / h[0], m[1] = u[0] / h[1], m[5] = u[1] / h[1], m[9] = u[2] / h[1], m[13] = -c[1] / h[1], m[2] = f[0] / h[2], m[6] = f[1] / h[2], m[10] = f[2] / h[2], m[14] = -c[2] / h[2], m[15] = 1, m;
    }
    // Common lit-surface uniforms
    setLit(p, ctx) {
      let gl = this.gl, u = p.u, e = ctx.env;
      gl.uniformMatrix4fv(u.uViewProj, !1, ctx.viewProj), u.uShadowMat && gl.uniformMatrix4fv(u.uShadowMat, !1, ctx.shadowMat), gl.uniform1f(u.uShadowOn, ctx.shadowOn ? 1 : 0), gl.uniform3fv(u.uSunDir, e.sunDir), gl.uniform3fv(u.uSunCol, e.sunCol), gl.uniform3fv(u.uAmb, e.amb), gl.uniform3fv(u.uFace, e.face), gl.uniform2f(u.uRot, Math.cos(ctx.camera.angle), Math.sin(ctx.camera.angle)), gl.uniform1f(u.uEmis, e.emis), gl.uniform1f(u.uSnow, e.snow), gl.uniform1f(u.uWet, e.wet), gl.uniform1f(u.uTime, ctx.time), gl.uniform4fv(u.uCloud, e.cloud), gl.uniform1f(u.uFlash, e.flash), gl.activeTexture(gl.TEXTURE1), gl.bindTexture(gl.TEXTURE_2D, this.shadowTex), gl.uniform1i(u.uShadow, 1), gl.activeTexture(gl.TEXTURE2), gl.bindTexture(gl.TEXTURE_2D, this.lightTex), gl.uniform1i(u.uLightMap, 2), gl.activeTexture(gl.TEXTURE3), gl.bindTexture(gl.TEXTURE_2D, this.noiseTex), gl.uniform1i(u.uNoise, 3);
    }
    render(camera, env, time, canvasW, canvasH) {
      let gl = this.gl, scale = camera.scale, linear = scale < 0.999, bw = Math.ceil(canvasW / scale) + 4, bh = Math.ceil(canvasH / scale) + 4;
      bw += bw & 1, bh += bh & 1, bw = Math.min(bw, 4096), bh = Math.min(bh, 4096), this._ensureTargets(bw, bh);
      let { viewProj, frac } = camera.matrices(bw, bh), shadowOn = env.sunDir[2] > 0.02, shadowMat = this.shadowMatrix(env.sunDir), ctx = { viewProj, shadowMat, shadowOn, env, camera, time, bw, bh, renderer: this, gl }, vis = env.vis >>> 0;
      if (shadowOn) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO), gl.viewport(0, 0, this.shadowSize, this.shadowSize), gl.enable(gl.DEPTH_TEST), gl.depthFunc(gl.LESS), gl.depthMask(!0), gl.clear(gl.DEPTH_BUFFER_BIT), gl.enable(gl.POLYGON_OFFSET_FILL), gl.polygonOffset(1.5, 3);
        let p2 = this.progShadow;
        gl.useProgram(p2.program), gl.uniformMatrix4fv(p2.u.uShadowVP, !1, shadowMat), gl.uniform1ui(p2.u.uVis, vis), gl.activeTexture(gl.TEXTURE0), gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlasTex), gl.uniform1i(p2.u.uAtlas, 0), gl.bindVertexArray(this.staticVAO), gl.drawElements(gl.TRIANGLES, this.staticCount, gl.UNSIGNED_INT, 0);
        for (let l of this.layers) l.shadow && l.shadow(ctx);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFBO), gl.viewport(0, 0, this.lightSize, this.lightSize), gl.disable(gl.DEPTH_TEST), gl.clearColor(0, 0, 0, 1), gl.clear(gl.COLOR_BUFFER_BIT), gl.enable(gl.BLEND), gl.blendFunc(gl.ONE, gl.ONE);
      for (let l of this.layers) l.light && l.light(ctx);
      gl.disable(gl.BLEND), gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO), gl.viewport(0, 0, bw, bh), gl.disable(gl.DEPTH_TEST), gl.depthMask(!1);
      {
        let p2 = this.progSky;
        gl.useProgram(p2.program), gl.uniform3fv(p2.u.uTop, env.skyTop), gl.uniform3fv(p2.u.uBottom, env.skyBottom), gl.uniform1f(p2.u.uStars, env.stars), gl.uniform1f(p2.u.uTime, time), gl.uniform2f(p2.u.uBuf, bw, bh), gl.uniform1f(p2.u.uRotA, camera.angle), gl.uniform3fv(p2.u.uMoon, env.moon);
        {
          let c = camera.project(117 / 2, 117 / 2, -21), t = camera.project(camera.x, camera.y, 0), sx = bw / 2 + (c[0] - Math.floor(t[0])), sy = bh / 2 - (c[1] - Math.floor(t[1]));
          gl.uniform4f(p2.u.uShadowBlob, sx, sy, 117 * 32 * 0.62, 117 * (32 / 2) * 0.62);
        }
        gl.bindVertexArray(this.emptyVAO), gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.enable(gl.DEPTH_TEST), gl.depthFunc(gl.LESS), gl.depthMask(!0), gl.clear(gl.DEPTH_BUFFER_BIT);
      {
        let p2 = this.progStatic, u2 = p2.u;
        gl.useProgram(p2.program), this.setLit(p2, ctx), gl.uniform1ui(u2.uVis, vis), gl.activeTexture(gl.TEXTURE0), gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlasTex), gl.uniform1i(u2.uAtlas, 0), gl.activeTexture(gl.TEXTURE4), gl.bindTexture(gl.TEXTURE_2D, this.groundTex), gl.uniform1i(u2.uGround, 4), gl.uniform1f(u2.uGroundScale, this.groundScale), gl.uniform1f(u2.uResLit, env.resLit), gl.uniform1f(u2.uOffLit, env.offLit), gl.uniform1f(u2.uLeaves, env.leaves), gl.uniform1f(u2.uSeason, env.season), gl.uniform1f(u2.uFlowers, env.flowers), gl.uniform3fv(u2.uSkyTop, env.skyTop), gl.uniform3fv(u2.uSkyHor, env.skyBottom), gl.uniform3fv(u2.uViewDir, camera.viewDir()), gl.uniform1f(u2.uIce, env.ice), gl.uniform1f(u2.uCrown, env.crown), gl.uniform3fv(u2.uCrownA, env.crownA), gl.uniform3fv(u2.uCrownB, env.crownB), gl.bindVertexArray(this.staticVAO), gl.drawElements(gl.TRIANGLES, this.staticCount, gl.UNSIGNED_INT, 0);
      }
      for (let l of this.layers) l.draw && l.draw(ctx);
      for (let l of this.layers) l.drawLate && l.drawLate(ctx);
      gl.bindVertexArray(null), gl.disable(gl.DEPTH_TEST), gl.depthMask(!1);
      let blur = (src, dst, w, h, dx, dy, gain) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst), gl.viewport(0, 0, w, h);
        let p2 = this.progBlur;
        gl.useProgram(p2.program), gl.activeTexture(gl.TEXTURE0), gl.bindTexture(gl.TEXTURE_2D, src), gl.uniform1i(p2.u.uSrc, 0), gl.uniform2f(p2.u.uDir, dx, dy), gl.uniform1f(p2.u.uGain, gain), gl.bindVertexArray(this.emptyVAO), gl.drawArrays(gl.TRIANGLES, 0, 3);
      }, hw = bw >> 1, hh = bh >> 1, qw = bw >> 2, qh = bh >> 2;
      blur(this.glowTex, this.fA, hw, hh, 1 / bw, 0, 1), blur(this.bA, this.fB, hw, hh, 0, 1 / hh, 1), blur(this.bB, this.fC, qw, qh, 2 / hw, 0, 1), blur(this.bC, this.fD, qw, qh, 0, 2 / qh, 1), gl.bindFramebuffer(gl.FRAMEBUFFER, null), gl.viewport(0, 0, canvasW, canvasH), setFilter(gl, this.sceneTex, linear ? gl.LINEAR : gl.NEAREST);
      let p = this.progComp, u = p.u;
      return gl.useProgram(p.program), gl.activeTexture(gl.TEXTURE0), gl.bindTexture(gl.TEXTURE_2D, this.sceneTex), gl.uniform1i(u.uScene, 0), gl.activeTexture(gl.TEXTURE1), gl.bindTexture(gl.TEXTURE_2D, this.bB), gl.uniform1i(u.uBloom, 1), gl.activeTexture(gl.TEXTURE2), gl.bindTexture(gl.TEXTURE_2D, this.bD), gl.uniform1i(u.uBloom2, 2), gl.activeTexture(gl.TEXTURE3), gl.bindTexture(gl.TEXTURE_2D, this.depthTex), gl.uniform1i(u.uDepth, 3), gl.uniform2f(u.uBuf, bw, bh), gl.uniform2f(u.uCanvas, canvasW, canvasH), gl.uniform1f(u.uScale, scale), gl.uniform2f(u.uFrac, frac[0], frac[1]), gl.uniform1f(u.uBloomK, env.bloom), gl.uniform3fv(u.uGrade, env.grade), gl.uniform1f(u.uSat, env.sat), gl.uniform1f(u.uVignette, 0.35), gl.uniform1f(u.uOutline, env.outline), gl.uniform1f(u.uFlash, env.flash), gl.uniform1f(u.uLinear, linear ? 1 : 0), gl.uniform4fv(u.uFog, env.fogv || [0, 0, 0, 0]), gl.bindVertexArray(this.emptyVAO), gl.drawArrays(gl.TRIANGLES, 0, 3), gl.bindVertexArray(null), ctx;
    }
  };

  // src/render/camera.js
  var HX = 32, HY = 32 / 2, HZ = 32, CX = 117 / 2, CY = 117 / 2, DEPTH_RANGE = 200, Camera = class {
    constructor() {
      this.x = CX, this.y = CY, this.angle = 0, this.rot = 0, this.rotFrom = 0, this.rotT = 1, this.scale = 2, this.scaleFrom = 2, this.scaleTo = 2, this.scaleT = 1, this.follow = null, this.vx = 0, this.vy = 0;
    }
    get settled() {
      return this.rotT >= 1 && this.scaleT >= 1;
    }
    rotate(dir) {
      this.rotFrom = this.angle, this.rot += dir, this.rotT = 0;
    }
    zoomTo(s) {
      this.scaleFrom = this.scale, this.scaleTo = s, this.scaleT = 0;
    }
    update(dt) {
      if (this.rotT < 1) {
        this.rotT = Math.min(1, this.rotT + dt / 0.7);
        let target = this.rot * Math.PI / 2;
        this.angle = this.rotFrom + (target - this.rotFrom) * easeInOut(this.rotT), this.rotT >= 1 && (this.angle = target);
      }
      if (this.scaleT < 1) {
        this.scaleT = Math.min(1, this.scaleT + dt / 0.35);
        let e = easeInOut(this.scaleT);
        this.scale = Math.exp(Math.log(this.scaleFrom) + (Math.log(this.scaleTo) - Math.log(this.scaleFrom)) * e), this.scaleT >= 1 && (this.scale = this.scaleTo);
      }
      if (this.follow) {
        let f = this.follow, k = 1 - Math.exp(-dt * 4);
        this.x += (f.x - this.x) * k, this.y += (f.y - this.y) * k;
      } else if (this.vx || this.vy) {
        this.x += this.vx * dt, this.y += this.vy * dt;
        let decay = Math.exp(-dt * 6);
        this.vx *= decay, this.vy *= decay, Math.abs(this.vx) < 0.01 && (this.vx = 0), Math.abs(this.vy) < 0.01 && (this.vy = 0);
      }
      this.x = clamp(this.x, -10, 127), this.y = clamp(this.y, -10, 127);
    }
    // world -> art pixels (relative to map centre). Returns [sx, sy, depth]
    project(x, y, z) {
      let c = Math.cos(this.angle), s = Math.sin(this.angle), dx = x - CX, dy = y - CY, xr = c * dx - s * dy, yr = s * dx + c * dy;
      return [(xr - yr) * HX, (xr + yr) * HY - z * HZ, -(xr + yr)];
    }
    // screen-space direction (art px) of a world direction
    screenDir(nx, ny) {
      let c = Math.cos(this.angle), s = Math.sin(this.angle), xr = c * nx - s * ny, yr = s * nx + c * ny;
      return [(xr - yr) * HX, (xr + yr) * HY];
    }
    screenDirX(nx, ny) {
      return this.screenDir(nx, ny)[0];
    }
    // art-pixel screen delta -> world delta on the ground plane
    unprojectDelta(dsx, dsy) {
      let a = dsx / HX, b = dsy / HY, xr = (a + b) / 2, yr = (b - a) / 2, c = Math.cos(this.angle), s = Math.sin(this.angle);
      return [c * xr + s * yr, -s * xr + c * yr];
    }
    // screen pixel (CSS) -> world on plane z
    screenToWorld(px, py, viewW, viewH, z = 0) {
      let scaleCss = this.scale / (window.devicePixelRatio || 1), t = this.project(this.x, this.y, 0), sx = t[0] + (px - viewW / 2) / scaleCss, sy = t[1] + (py - viewH / 2) / scaleCss + z * HZ, a = sx / HX, b = sy / HY, xr = (a + b) / 2, yr = (b - a) / 2, c = Math.cos(this.angle), s = Math.sin(this.angle);
      return [CX + c * xr + s * yr, CY - s * xr + c * yr];
    }
    worldToScreen(x, y, z, viewW, viewH) {
      let scaleCss = this.scale / (window.devicePixelRatio || 1), t = this.project(this.x, this.y, 0), p = this.project(x, y, z);
      return [(p[0] - t[0]) * scaleCss + viewW / 2, (p[1] - t[1]) * scaleCss + viewH / 2, p[2]];
    }
    // camera view direction in world space (pointing toward the camera)
    viewDir() {
      let c = Math.cos(this.angle), s = Math.sin(this.angle), xr = 1, yr = 1, wx = c * xr + s * yr, wy = -s * xr + c * yr, l = Math.hypot(wx, wy, 1);
      return [wx / l, wy / l, 1 / l];
    }
    // Build view-projection for a buffer of bw x bh art pixels.
    matrices(bw, bh) {
      let c = Math.cos(this.angle), s = Math.sin(this.angle), t = this.project(this.x, this.y, 0), tsx = Math.floor(t[0]), tsy = Math.floor(t[1]), fx = t[0] - tsx, fy = t[1] - tsy, D = DEPTH_RANGE, m = new Float32Array(16), kx = 2 / bw, ky = 2 / bh;
      return m[0] = HX * (c - s) * kx, m[4] = -HX * (s + c) * kx, m[8] = 0, m[12] = (HX * ((c - s) * -CX - (s + c) * -CY) - tsx) * kx, m[1] = -HY * (c + s) * ky, m[5] = -HY * (c - s) * ky, m[9] = HZ * ky, m[13] = -(HY * ((c + s) * -CX + (c - s) * -CY) - tsy) * ky, m[2] = -(c + s) / D, m[6] = -(c - s) / D, m[10] = 0, m[14] = ((c + s) * CX + (c - s) * CY) / D, m[3] = 0, m[7] = 0, m[11] = 0, m[15] = 1, { viewProj: m, frac: [fx, fy], tsx, tsy };
    }
  };

  // src/core/painter.js
  var Page = class {
    constructor(w, h) {
      this.w = w, this.h = h, this.data = new Uint8Array(w * h * 4);
    }
  };
  function winCode(t, selfColored = !1) {
    let v = Math.round(clamp(t, 0, 1) * 126);
    return selfColored ? 128 + v : 1 + v;
  }
  var GLYPHS = {
    A: "010101111101101",
    B: "110101110101110",
    C: "011100100100011",
    D: "110101101101110",
    E: "111100110100111",
    F: "111100110100100",
    G: "011100101101011",
    H: "101101111101101",
    I: "111010010010111",
    J: "001001001101010",
    K: "101101110101101",
    L: "100100100100111",
    M: "101111111101101",
    N: "110101101101101",
    O: "010101101101010",
    P: "110101110100100",
    Q: "010101101110011",
    R: "110101110101101",
    S: "011100010001110",
    T: "111010010010010",
    U: "101101101101111",
    V: "101101101101010",
    W: "101101111111101",
    X: "101101010101101",
    Y: "101101010010010",
    Z: "111001010100111",
    0: "111101101101111",
    1: "010110010010111",
    2: "110001010100111",
    3: "110001010001110",
    4: "101101111001001",
    5: "111100110001110",
    6: "011100111101111",
    7: "111001010010010",
    8: "111101111101111",
    9: "111101111001110",
    " ": "000000000000000",
    "-": "000000111000000",
    ".": "000000000000010",
    "!": "010010010000010",
    "'": "010010000000000",
    $: "011110010011110",
    "%": "101001010100101",
    "#": "101111101111101",
    "*": "000101010101000",
    "+": "000010111010000",
    "/": "001001010100100",
    ":": "000010000010000",
    "@": "000101111111010",
    // heart
    "&": "010101010101011",
    "?": "110001010000010",
    ",": "000000000010100",
    '"': "101101000000000",
    "=": "000111000111000",
    "<": "001010100010001",
    ">": "100010001010100",
    "(": "010100100100010",
    ")": "010001001001010",
    "~": "000011110000000",
    "^": "010101000000000",
    _: "000000000000111"
  }, G7 = {
    A: "01110100011000111111100011000110001",
    B: "11110100011000111110100011000111110",
    C: "01110100011000010000100001000101110",
    D: "11110100011000110001100011000111110",
    E: "11111100001000011110100001000011111",
    F: "11111100001000011110100001000010000",
    G: "01110100011000010111100011000101111",
    H: "10001100011000111111100011000110001",
    I: "01110001000010000100001000010001110",
    J: "00111000100001000010000101001001100",
    K: "10001100101010011000101001001010001",
    L: "10000100001000010000100001000011111",
    M: "10001110111010110101100011000110001",
    N: "10001100011100110101100111000110001",
    O: "01110100011000110001100011000101110",
    P: "11110100011000111110100001000010000",
    Q: "01110100011000110001101011001001101",
    R: "11110100011000111110101001001010001",
    S: "01111100001000001110000010000111110",
    T: "11111001000010000100001000010000100",
    U: "10001100011000110001100011000101110",
    V: "10001100011000110001100010101000100",
    W: "10001100011000110101101011010101010",
    X: "10001100010101000100010101000110001",
    Y: "10001100010101000100001000010000100",
    Z: "11111000010001000100010001000011111",
    0: "01110100011001110101110011000101110",
    1: "00100011000010000100001000010001110",
    2: "01110100010000100010001000100011111",
    3: "11111000100010000010000011000101110",
    4: "00010001100101010010111110001000010",
    5: "11111100001111000001000011000101110",
    6: "00110010001000011110100011000101110",
    7: "11111000010001000100010000100001000",
    8: "01110100011000101110100011000101110",
    9: "01110100011000101111000010001001100",
    " ": "00000000000000000000000000000000000",
    "-": "00000000000000011111000000000000000",
    ".": "00000000000000000000000000110001100",
    "!": "00100001000010000100001000000000100",
    "'": "00100001000100000000000000000000000",
    $: "00100011111010001110001011111000100",
    "&": "01100100101010001000101011001001101",
    "@": "00000010101111111111011100010000000",
    "#": "01010010101111101010111110101001010",
    "%": "11000110010001000100010001001100011",
    "/": "00001000100001000100010000100010000",
    ":": "00000011000110000000011000110000000",
    ",": "00000000000000000000011000010001000",
    "+": "00000001000010011111001000010000000",
    "?": "01110100010000100010001000000000100",
    "*": "00000001001010101110101010010000000",
    "(": "00010001000100001000010000010000010",
    ")": "01000001000001000010000100010001000",
    '"': "01010010100000000000000000000000000",
    "=": "00000000001111100000111110000000000",
    "~": "00000000000100010101000100000000000",
    "<": "00010001000100010000010000010000010",
    ">": "01000001000001000001000100010001000",
    _: "00000000000000000000000000000011111"
  };
  function textWidth(str, scale = 1, big = !1) {
    return str.length ? big ? (str.length * 6 - 1) * scale : (str.length * 4 - 1) * scale : 0;
  }
  var Painter = class _Painter {
    constructor(page, ox = 0, oy = 0, w = page.w, h = page.h) {
      this.page = page, this.ox = ox, this.oy = oy, this.w = w, this.h = h;
    }
    sub(x, y, w, h) {
      return new _Painter(this.page, this.ox + x, this.oy + y, w, h);
    }
    idx(x, y) {
      return ((this.oy + y) * this.page.w + this.ox + x) * 4;
    }
    inside(x, y) {
      return x >= 0 && y >= 0 && x < this.w && y < this.h;
    }
    set(x, y, c, a = 255) {
      if (x |= 0, y |= 0, x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      let d = this.page.data, i = this.idx(x, y);
      d[i] = c >> 16 & 255, d[i + 1] = c >> 8 & 255, d[i + 2] = c & 255, d[i + 3] = a;
    }
    get(x, y) {
      if (x |= 0, y |= 0, !this.inside(x, y)) return 0;
      let d = this.page.data, i = this.idx(x, y);
      return d[i] << 16 | d[i + 1] << 8 | d[i + 2];
    }
    getA(x, y) {
      return this.inside(x | 0, y | 0) ? this.page.data[this.idx(x | 0, y | 0) + 3] : 0;
    }
    setA(x, y, a) {
      this.inside(x | 0, y | 0) && (this.page.data[this.idx(x | 0, y | 0) + 3] = a);
    }
    rect(x, y, w, h, c, a = 255) {
      x = Math.round(x), y = Math.round(y), w = Math.round(w), h = Math.round(h);
      let x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
      if (x1 <= x0 || y1 <= y0) return;
      let d = this.page.data, r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255;
      for (let yy = y0; yy < y1; yy++) {
        let i = this.idx(x0, yy);
        for (let xx = x0; xx < x1; xx++, i += 4)
          d[i] = r, d[i + 1] = g, d[i + 2] = b, d[i + 3] = a;
      }
    }
    clear(x = 0, y = 0, w = this.w, h = this.h) {
      this.rect(x, y, w, h, 0, 0);
    }
    // per-pixel brightness noise
    noise(x, y, w, h, c, amt, seed = 1, a = 255, scale = 1) {
      x = Math.round(x), y = Math.round(y);
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          let f = 1 + (hash2i(Math.floor((x + xx + this.ox) / scale), Math.floor((y + yy + this.oy) / scale), seed) - 0.5) * 2 * amt;
          this.set(x + xx, y + yy, rgb(R(c) * f, G(c) * f, B(c) * f), a);
        }
    }
    // sprinkle random pixels
    speckle(x, y, w, h, c, density, seed = 3, a = 255) {
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++)
          hash2i(x + xx + this.ox, y + yy + this.oy, seed) < density && this.set(x + xx, y + yy, c, a);
    }
    hline(x, y, len, c, a = 255) {
      this.rect(x, y, len, 1, c, a);
    }
    vline(x, y, len, c, a = 255) {
      this.rect(x, y, 1, len, c, a);
    }
    frame(x, y, w, h, c, a = 255) {
      this.hline(x, y, w, c, a), this.hline(x, y + h - 1, w, c, a), this.vline(x, y, h, c, a), this.vline(x + w - 1, y, h, c, a);
    }
    line(x0, y0, x1, y1, c, a = 255) {
      x0 = Math.round(x0), y0 = Math.round(y0), x1 = Math.round(x1), y1 = Math.round(y1);
      let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
      for (; this.set(x0, y0, c, a), !(x0 === x1 && y0 === y1); ) {
        let e2 = 2 * err;
        e2 >= dy && (err += dy, x0 += sx), e2 <= dx && (err += dx, y0 += sy);
      }
    }
    ellipse(cx, cy, rx, ry, c, a = 255) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          let dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          dx * dx + dy * dy <= 1 && this.set(x, y, c, a);
        }
    }
    ring(cx, cy, rx, ry, thick, c, a = 255) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          let dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy, dx2 = (x + 0.5 - cx) / (rx - thick), dy2 = (y + 0.5 - cy) / (ry - thick);
          d <= 1 && dx2 * dx2 + dy2 * dy2 > 1 && this.set(x, y, c, a);
        }
    }
    // multiply existing pixels (keeps alpha)
    mul(x, y, w, h, f) {
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) {
          if (!this.inside(xx, yy)) continue;
          let a = this.getA(xx, yy);
          if (a === 0) continue;
          let c = this.get(xx, yy);
          this.set(xx, yy, rgb(R(c) * f, G(c) * f, B(c) * f), a);
        }
    }
    tint(x, y, w, h, c, t) {
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) this.blend(xx, yy, c, t);
    }
    blend(x, y, c, t) {
      if (!this.inside(x, y)) return;
      let a = this.getA(x, y), o = this.get(x, y);
      this.set(x, y, rgb(R(o) + (R(c) - R(o)) * t, G(o) + (G(c) - G(o)) * t, B(o) + (B(c) - B(o)) * t), a || 255);
    }
    vgrad(x, y, w, h, c0, c1, a = 255) {
      for (let yy = 0; yy < h; yy++) {
        let t = h > 1 ? yy / (h - 1) : 0, c = rgb(R(c0) + (R(c1) - R(c0)) * t, G(c0) + (G(c1) - G(c0)) * t, B(c0) + (B(c1) - B(c0)) * t);
        this.rect(x, y + yy, w, 1, c, a);
      }
    }
    // 5x7 font text; returns width
    text7(x, y, str, c, a = 255, scale = 1) {
      str = String(str).toUpperCase();
      let cx = x;
      for (let ch of str) {
        let g = G7[ch] || G7[" "];
        for (let i = 0; i < 35; i++)
          g[i] === "1" && this.rect(cx + i % 5 * scale, y + Math.floor(i / 5) * scale, scale, scale, c, a);
        cx += 6 * scale;
      }
      return cx - x - scale;
    }
    text(x, y, str, c, a = 255, scale = 1) {
      str = String(str).toUpperCase();
      let cx = x;
      for (let ch of str) {
        let g = GLYPHS[ch] || GLYPHS[" "];
        for (let i = 0; i < 15; i++)
          g[i] === "1" && this.rect(cx + i % 3 * scale, y + Math.floor(i / 3) * scale, scale, scale, c, a);
        cx += 4 * scale;
      }
      return cx - x - scale;
    }
    // copy pixels from another painter region
    blit(src, sx, sy, w, h, dx, dy, skipTransparent = !0) {
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          let a = src.getA(sx + xx, sy + yy);
          skipTransparent && a === 0 || this.set(dx + xx, dy + yy, src.get(sx + xx, sy + yy), a);
        }
    }
  }, SPainter = class {
    constructor(page, ox, oy, w, h) {
      this.page = page, this.ox = ox, this.oy = oy, this.w = w, this.h = h;
    }
    set(x, y, slot, shade2 = 128, alt = 0) {
      if (x = Math.round(x), y = Math.round(y), x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      let d = this.page.data, i = ((this.oy + y) * this.page.w + this.ox + x) * 4;
      d[i] = slot, d[i + 1] = shade2, d[i + 2] = alt, d[i + 3] = 255;
    }
    setAlt(x, y, alt) {
      if (x = Math.round(x), y = Math.round(y), x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      let d = this.page.data, i = ((this.oy + y) * this.page.w + this.ox + x) * 4;
      d[i + 2] = alt, d[i + 3] === 0 && (d[i] = 0, d[i + 3] = 255);
    }
    get(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
      let d = this.page.data, i = ((this.oy + y) * this.page.w + this.ox + x) * 4;
      return d[i + 3] ? d[i] : -1;
    }
    rect(x, y, w, h, slot, shade2 = 128) {
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, slot, shade2);
    }
    clearPx(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      let d = this.page.data, i = ((this.oy + y) * this.page.w + this.ox + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
    }
    ellipse(cx, cy, rx, ry, slot, shade2 = 128) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          let dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          dx * dx + dy * dy <= 1 && this.set(x, y, slot, shade2);
        }
    }
    line(x0, y0, x1, y1, slot, shade2 = 128) {
      x0 = Math.round(x0), y0 = Math.round(y0), x1 = Math.round(x1), y1 = Math.round(y1);
      let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
      for (; this.set(x0, y0, slot, shade2), !(x0 === x1 && y0 === y1); ) {
        let e2 = 2 * err;
        e2 >= dy && (err += dy, x0 += sx), e2 <= dx && (err += dx, y0 += sy);
      }
    }
  };

  // src/world/atlas.js
  var BestFitShelves = class {
    constructor(w, h, pad = 1) {
      this.w = w, this.h = h, this.pad = pad, this.shelves = [], this.nextY = 0;
    }
    alloc(w, h) {
      let pad = this.pad;
      if (w + pad > this.w) return null;
      let best = null;
      for (let s of this.shelves)
        s.h >= h && s.h <= h * 1.6 + 6 && s.x + w + pad <= this.w && (!best || s.h < best.h) && (best = s);
      if (!best) {
        if (this.nextY + h + pad > this.h) return null;
        best = { y: this.nextY, h, x: 0 }, this.shelves.push(best), this.nextY += h + pad;
      }
      let r = { x: best.x, y: best.y, w, h };
      return best.x += w + pad, r;
    }
  }, Atlas = class {
    constructor(size = 2048) {
      this.size = size, this.pages = [], this.packers = [], this.cache = /* @__PURE__ */ new Map();
    }
    newPage() {
      return this.pages.push(new Page(this.size, this.size)), this.packers.push(new BestFitShelves(this.size, this.size, 1)), this.pages.length - 1;
    }
    // Allocate a w*h region. Returns { layer, x, y, w, h, p: Painter }
    alloc(w, h) {
      if (w = Math.max(1, Math.round(w)), h = Math.max(1, Math.round(h)), w > this.size || h > this.size) throw new Error(`atlas alloc too big ${w}x${h}`);
      for (let i2 = 1; i2 < this.pages.length; i2++) {
        let r2 = this.packers[i2].alloc(w, h);
        if (r2) return this._region(i2, r2);
      }
      let i = this.newPage(), r = this.packers[i].alloc(w, h);
      return this._region(i, r);
    }
    // Dedicated whole page (used for the ground)
    allocPage(w, h) {
      let i = this.newPage();
      return this.packers[i].nextY = this.size, this._region(i, { x: 0, y: 0, w, h });
    }
    _region(layer, r) {
      return { layer, x: r.x, y: r.y, w: r.w, h: r.h, p: new Painter(this.pages[layer], r.x, r.y, r.w, r.h) };
    }
    // Cached shared region (e.g. tiled brick)
    shared(key, w, h, paint) {
      let r = this.cache.get(key);
      return r || (r = this.alloc(w, h), paint(r.p, r), this.cache.set(key, r)), r;
    }
    upload(gl) {
      let tex = gl.createTexture();
      return gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex), gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1), gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, this.size, this.size, this.pages.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, null), this.pages.forEach((pg, i) => {
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, this.size, this.size, 1, gl.RGBA, gl.UNSIGNED_BYTE, pg.data);
      }), gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST), gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST), gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE), gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE), tex;
    }
  };

  // src/world/mesh.js
  var MAT = {
    SNOW: 1,
    // accumulates snow on up-facing surfaces
    GLASS: 2,
    // reflective
    GROUND: 4,
    // alpha = ground material code
    OFFICE: 8,
    // windows follow office lighting schedule
    WET: 16,
    // darkens in rain
    WATER: 32,
    // animated water
    NOSHADOW: 64,
    // does not receive sun shadow (e.g. emissive signage)
    FLAT: 128
    // no directional face shading (sprites-like)
  }, GRP = {
    ALWAYS: 0,
    SPRING: 1,
    SUMMER: 2,
    AUTUMN: 3,
    WINTER: 4,
    NOT_WINTER: 5,
    NIGHT: 6,
    DAY: 7,
    SUMMER_DAY: 8,
    FOUNTAIN: 9,
    NOT_SUMMER: 10,
    XMAS: 11,
    NOT_XMAS: 12,
    ICE: 13,
    NO_ICE: 14,
    CONSTRUCTION: 15,
    GATE_OPEN: 16,
    GATE_CLOSED: 17,
    SUMMER_OR_SPRING: 18,
    WARM: 19
  };
  function grow(arr, need) {
    if (need <= arr.length) return arr;
    let n = arr.length * 2;
    for (; n < need; ) n *= 2;
    let a = new arr.constructor(n);
    return a.set(arr), a;
  }
  var MeshBuilder = class {
    constructor() {
      this.pos = new Float32Array(3 * 4096), this.uv = new Float32Array(2 * 4096), this.rect = new Uint16Array(4 * 4096), this.nrm = new Int8Array(4 * 4096), this.info = new Uint8Array(4 * 4096), this.idx = new Uint32Array(6 * 2048), this.nv = 0, this.ni = 0, this.defaultGroup = GRP.ALWAYS;
    }
    _ensure(nv, ni) {
      let v = this.nv + nv, i = this.ni + ni;
      this.pos = grow(this.pos, v * 3), this.uv = grow(this.uv, v * 2), this.rect = grow(this.rect, v * 4), this.nrm = grow(this.nrm, v * 4), this.info = grow(this.info, v * 4), this.idx = grow(this.idx, i);
    }
    _v(p, u, v, tex, n, mat, group, seed) {
      let k = this.nv++;
      return this.pos[k * 3] = p[0], this.pos[k * 3 + 1] = p[1], this.pos[k * 3 + 2] = p[2], this.uv[k * 2] = u, this.uv[k * 2 + 1] = v, this.rect[k * 4] = tex.x, this.rect[k * 4 + 1] = tex.y, this.rect[k * 4 + 2] = tex.w, this.rect[k * 4 + 3] = tex.h, this.nrm[k * 4] = Math.round(n[0] * 127), this.nrm[k * 4 + 1] = Math.round(n[1] * 127), this.nrm[k * 4 + 2] = Math.round(n[2] * 127), this.nrm[k * 4 + 3] = 0, this.info[k * 4] = tex.layer, this.info[k * 4 + 1] = mat, this.info[k * 4 + 2] = group, this.info[k * 4 + 3] = seed & 255, k;
    }
    // p0..p3: TL, TR, BR, BL as seen from the front. uvs: [[u,v] x4]
    quad(p0, p1, p2, p3, uvs, tex, n, mat = 0, group = this.defaultGroup, seed = 0) {
      if (!tex) return;
      n || (n = quadNormal(p0, p1, p3)), this._ensure(4, 6);
      let a = this._v(p0, uvs[0][0], uvs[0][1], tex, n, mat, group, seed), b = this._v(p1, uvs[1][0], uvs[1][1], tex, n, mat, group, seed), c = this._v(p2, uvs[2][0], uvs[2][1], tex, n, mat, group, seed), d = this._v(p3, uvs[3][0], uvs[3][1], tex, n, mat, group, seed), I = this.idx;
      I[this.ni++] = a, I[this.ni++] = b, I[this.ni++] = c, I[this.ni++] = a, I[this.ni++] = c, I[this.ni++] = d;
    }
    tri(p0, p1, p2, uvs, tex, n, mat = 0, group = this.defaultGroup, seed = 0) {
      if (!tex) return;
      n || (n = quadNormal(p0, p1, p2)), this._ensure(3, 3);
      let a = this._v(p0, uvs[0][0], uvs[0][1], tex, n, mat, group, seed), b = this._v(p1, uvs[1][0], uvs[1][1], tex, n, mat, group, seed), c = this._v(p2, uvs[2][0], uvs[2][1], tex, n, mat, group, seed);
      this.idx[this.ni++] = a, this.idx[this.ni++] = b, this.idx[this.ni++] = c;
    }
    // Axis-aligned box. faces: {px,nx,py,ny,pz} -> face spec (region or {t, mat, group, u0, v0})
    box(x0, y0, z0, x1, y1, z1, faces, opt = {}) {
      let g = opt.group ?? this.defaultGroup, seed = opt.seed ?? 0, sideMat = opt.mat ?? 0, topMat = opt.topMat ?? MAT.SNOW | MAT.WET, H = (z1 - z0) * 32, f = (spec) => spec && spec.t ? spec : spec ? { t: spec } : null, s;
      if (s = f(faces.py)) {
        let W = (x1 - x0) * 32, u0 = s.u0 || 0, v0 = s.v0 || 0;
        this.quad(
          [x0, y1, z1],
          [x1, y1, z1],
          [x1, y1, z0],
          [x0, y1, z0],
          [[u0, v0], [u0 + W, v0], [u0 + W, v0 + H], [u0, v0 + H]],
          s.t,
          [0, 1, 0],
          s.mat ?? sideMat,
          s.group ?? g,
          s.seed ?? seed
        );
      }
      if (s = f(faces.ny)) {
        let W = (x1 - x0) * 32, u0 = s.u0 || 0, v0 = s.v0 || 0;
        this.quad(
          [x1, y0, z1],
          [x0, y0, z1],
          [x0, y0, z0],
          [x1, y0, z0],
          [[u0, v0], [u0 + W, v0], [u0 + W, v0 + H], [u0, v0 + H]],
          s.t,
          [0, -1, 0],
          s.mat ?? sideMat,
          s.group ?? g,
          s.seed ?? seed
        );
      }
      if (s = f(faces.px)) {
        let W = (y1 - y0) * 32, u0 = s.u0 || 0, v0 = s.v0 || 0;
        this.quad(
          [x1, y1, z1],
          [x1, y0, z1],
          [x1, y0, z0],
          [x1, y1, z0],
          [[u0, v0], [u0 + W, v0], [u0 + W, v0 + H], [u0, v0 + H]],
          s.t,
          [1, 0, 0],
          s.mat ?? sideMat,
          s.group ?? g,
          s.seed ?? seed
        );
      }
      if (s = f(faces.nx)) {
        let W = (y1 - y0) * 32, u0 = s.u0 || 0, v0 = s.v0 || 0;
        this.quad(
          [x0, y0, z1],
          [x0, y1, z1],
          [x0, y1, z0],
          [x0, y0, z0],
          [[u0, v0], [u0 + W, v0], [u0 + W, v0 + H], [u0, v0 + H]],
          s.t,
          [-1, 0, 0],
          s.mat ?? sideMat,
          s.group ?? g,
          s.seed ?? seed
        );
      }
      if (s = f(faces.pz)) {
        let W = (x1 - x0) * 32, D = (y1 - y0) * 32, u0 = s.u0 ?? (s.world ? x0 * 32 : 0), v0 = s.v0 ?? (s.world ? y0 * 32 : 0);
        this.quad(
          [x0, y0, z1],
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z1],
          [[u0, v0], [u0 + W, v0], [u0 + W, v0 + D], [u0, v0 + D]],
          s.t,
          [0, 0, 1],
          s.mat ?? topMat,
          s.group ?? g,
          s.seed ?? seed
        );
      }
      if (s = f(faces.nz)) {
        let W = (x1 - x0) * 32, D = (y1 - y0) * 32;
        this.quad(
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y0, z0],
          [x0, y0, z0],
          [[0, 0], [W, 0], [W, D], [0, D]],
          s.t,
          [0, 0, -1],
          s.mat ?? sideMat,
          s.group ?? g,
          s.seed ?? seed
        );
      }
    }
    // Box where every side face uses the same region (tiled) and the top another.
    solid(x0, y0, z0, x1, y1, z1, side, top, opt = {}) {
      this.box(x0, y0, z0, x1, y1, z1, { px: side, nx: side, py: side, ny: side, pz: top }, opt);
    }
    // Vertical quad between (xa,ya) and (xb,yb), from z0 to z1. Texture u runs a->b.
    vquad(xa, ya, xb, yb, z0, z1, tex, opt = {}) {
      let len = Math.hypot(xb - xa, yb - ya) * 32, H = (z1 - z0) * 32, u0 = opt.u0 || 0, v0 = opt.v0 || 0, nx = yb - ya, ny = -(xb - xa), l = Math.hypot(nx, ny) || 1, ux = (xb - xa) / (l || 1), n = [-((yb - ya) / (l || 1)), ux, 0];
      this.quad(
        [xa, ya, z1],
        [xb, yb, z1],
        [xb, yb, z0],
        [xa, ya, z0],
        [[u0, v0], [u0 + len, v0], [u0 + len, v0 + H], [u0, v0 + H]],
        tex,
        opt.n || n,
        opt.mat ?? MAT.FLAT,
        opt.group ?? this.defaultGroup,
        opt.seed || 0
      );
    }
    // Horizontal quad (decal) at height z
    hquad(x0, y0, x1, y1, z, tex, opt = {}) {
      let W = (x1 - x0) * 32, D = (y1 - y0) * 32, u0 = opt.u0 ?? 0, v0 = opt.v0 ?? 0;
      this.quad(
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
        [[u0, v0], [u0 + W, v0], [u0 + W, v0 + D], [u0, v0 + D]],
        tex,
        [0, 0, 1],
        opt.mat ?? MAT.SNOW | MAT.WET,
        opt.group ?? this.defaultGroup,
        opt.seed || 0
      );
    }
    // Sloped quad from a low edge to a high edge (awnings, roofs). edge a: (xa0,ya0,za)->(xa1,ya1,za), edge b at zb
    slope(a0, a1, b0, b1, tex, opt = {}) {
      let W = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]) * 32, H = Math.hypot(b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]) * 32, u0 = opt.u0 || 0, v0 = opt.v0 || 0;
      this.quad(
        b0,
        b1,
        a1,
        a0,
        [[u0, v0], [u0 + W, v0], [u0 + W, v0 + H], [u0, v0 + H]],
        tex,
        null,
        opt.mat ?? MAT.SNOW | MAT.WET,
        opt.group ?? this.defaultGroup,
        opt.seed || 0
      );
    }
    // Gable roof over [x0,x1]x[y0,y1] from z0 up to ridge zr; ridge along 'x' or 'y'
    gable(x0, y0, x1, y1, z0, zr, axis, roofTex, endTex, opt = {}) {
      let g = opt.group ?? this.defaultGroup;
      if (axis === "x") {
        let ym = (y0 + y1) / 2;
        this.slope([x1, y0, z0], [x0, y0, z0], [x1, ym, zr], [x0, ym, zr], roofTex, opt), this.slope([x0, y1, z0], [x1, y1, z0], [x0, ym, zr], [x1, ym, zr], roofTex, opt);
        let D = (y1 - y0) * 32, Hh = (zr - z0) * 32;
        this.tri([x0, y0, z0], [x0, ym, zr], [x0, y1, z0], [[0, Hh], [D / 2, 0], [D, Hh]], endTex, [-1, 0, 0], 0, g), this.tri([x1, y1, z0], [x1, ym, zr], [x1, y0, z0], [[0, Hh], [D / 2, 0], [D, Hh]], endTex, [1, 0, 0], 0, g);
      } else {
        let xm = (x0 + x1) / 2;
        this.slope([x0, y0, z0], [x0, y1, z0], [xm, y0, zr], [xm, y1, zr], roofTex, opt), this.slope([x1, y1, z0], [x1, y0, z0], [xm, y1, zr], [xm, y0, zr], roofTex, opt);
        let W = (x1 - x0) * 32, Hh = (zr - z0) * 32;
        this.tri([x1, y0, z0], [xm, y0, zr], [x0, y0, z0], [[0, Hh], [W / 2, 0], [W, Hh]], endTex, [0, -1, 0], 0, g), this.tri([x0, y1, z0], [xm, y1, zr], [x1, y1, z0], [[0, Hh], [W / 2, 0], [W, Hh]], endTex, [0, 1, 0], 0, g);
      }
    }
    // N-sided cylinder (water towers, columns). Side texture wraps around.
    cylinder(cx, cy, z0, z1, r, sides, tex, capTex, opt = {}) {
      let H = (z1 - z0) * 32, circ = 2 * Math.PI * r * 32, g = opt.group ?? this.defaultGroup, off = opt.angle ?? Math.PI / sides;
      for (let i = 0; i < sides; i++) {
        let a0 = off + i / sides * Math.PI * 2, a1 = off + (i + 1) / sides * Math.PI * 2, p0x = cx + Math.cos(a0) * r, p0y = cy + Math.sin(a0) * r, p1x = cx + Math.cos(a1) * r, p1y = cy + Math.sin(a1) * r, am = (a0 + a1) / 2, n = [Math.cos(am), Math.sin(am), 0], u0 = i / sides * circ, u1 = (i + 1) / sides * circ;
        this.quad(
          [p1x, p1y, z1],
          [p0x, p0y, z1],
          [p0x, p0y, z0],
          [p1x, p1y, z0],
          [[u0, 0], [u1, 0], [u1, H], [u0, H]],
          tex,
          n,
          opt.mat ?? 0,
          g,
          opt.seed || 0
        );
      }
      if (capTex)
        for (let i = 0; i < sides; i++) {
          let a0 = off + i / sides * Math.PI * 2, a1 = off + (i + 1) / sides * Math.PI * 2, pts = [[cx, cy], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r]];
          this.tri(
            [pts[0][0], pts[0][1], z1],
            [pts[1][0], pts[1][1], z1],
            [pts[2][0], pts[2][1], z1],
            pts.map((p) => [(p[0] - cx + r) * 32, (p[1] - cy + r) * 32]),
            capTex,
            [0, 0, 1],
            opt.capMat ?? MAT.SNOW | MAT.WET,
            g
          );
        }
    }
    cone(cx, cy, z0, z1, r, sides, tex, opt = {}) {
      let g = opt.group ?? this.defaultGroup, off = opt.angle ?? Math.PI / sides, H = Math.hypot(z1 - z0, r) * 32, circ = 2 * Math.PI * r * 32;
      for (let i = 0; i < sides; i++) {
        let a0 = off + i / sides * Math.PI * 2, a1 = off + (i + 1) / sides * Math.PI * 2, am = (a0 + a1) / 2, slope = r / (z1 - z0), n = [Math.cos(am), Math.sin(am), slope], l = Math.hypot(n[0], n[1], n[2]), u0 = i / sides * circ, u1 = (i + 1) / sides * circ;
        this.tri(
          [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z0],
          [cx, cy, z1],
          [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z0],
          [[u0, H], [(u0 + u1) / 2, 0], [u1, H]],
          tex,
          [n[0] / l, n[1] / l, n[2] / l],
          opt.mat ?? MAT.SNOW,
          g
        );
      }
    }
    // Square pyramid
    pyramid(x0, y0, x1, y1, z0, z1, tex, opt = {}) {
      let g = opt.group ?? this.defaultGroup, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, W = (x1 - x0) * 32, Hs = Math.hypot(z1 - z0, (y1 - y0) / 2) * 32, top = [cx, cy, z1], mat = opt.mat ?? MAT.SNOW;
      this.tri([x0, y1, z0], top, [x1, y1, z0], [[0, Hs], [W / 2, 0], [W, Hs]], tex, null, mat, g), this.tri([x1, y0, z0], top, [x0, y0, z0], [[0, Hs], [W / 2, 0], [W, Hs]], tex, null, mat, g), this.tri([x1, y1, z0], top, [x1, y0, z0], [[0, Hs], [W / 2, 0], [W, Hs]], tex, null, mat, g), this.tri([x0, y0, z0], top, [x0, y1, z0], [[0, Hs], [W / 2, 0], [W, Hs]], tex, null, mat, g);
    }
    finish() {
      return {
        pos: this.pos.subarray(0, this.nv * 3),
        uv: this.uv.subarray(0, this.nv * 2),
        rect: this.rect.subarray(0, this.nv * 4),
        nrm: this.nrm.subarray(0, this.nv * 4),
        info: this.info.subarray(0, this.nv * 4),
        idx: this.idx.subarray(0, this.ni),
        vertexCount: this.nv,
        indexCount: this.ni
      };
    }
  };
  function quadNormal(a, b, d) {
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }

  // src/world/ground.js
  var GC = {
    ASPHALT: 1,
    PARKING: 2,
    PAINT_W: 3,
    PAINT_Y: 4,
    CROSSWALK: 5,
    SIDEWALK: 6,
    CURB: 7,
    GRASS: 8,
    SOIL: 9,
    FLOWERBED: 10,
    PATH: 11,
    COURT: 12,
    COURT_LINE: 13,
    RUBBER: 14,
    WATER: 15,
    PLAZA: 16,
    PATIO: 17,
    METAL: 18,
    BUSLANE: 19,
    BIKELANE: 20,
    SAND: 21,
    GRAVEL: 22,
    WOOD: 23,
    STAIRS: 24
  }, COL = {
    asphalt: 4869463,
    asphaltDark: 4014153,
    asphaltPatch: 4211532,
    white: 15658736,
    yellow: 15909424,
    sidewalk: 12828856,
    sidewalkDark: 11447203,
    curb: 14210510,
    grass: 5811267,
    grassDark: 4164659,
    soil: 7031346,
    metal: 5986904
  };
  function raisedIntervals() {
    let out = [], x = 0;
    for (let k = 0; k <= 4; k++) {
      let rs = roadStart(k), re = roadEnd(k);
      rs > x && out.push([x, rs]), x = re;
    }
    return x < 117 && out.push([x, 117]), out;
  }
  function paintGround(region3, rng) {
    let p = region3.p, N = 117 * 32, d = region3.page.data, cells = Math.ceil(N / 64), big = new Float32Array(cells * cells);
    for (let i = 0; i < big.length; i++) big[i] = hash2i(i % cells, i / cells | 0, 12) - 0.5;
    let ar = COL.asphalt >> 16 & 255, ag = COL.asphalt >> 8 & 255, ab = COL.asphalt & 255;
    for (let y = 0; y < N; y++) {
      let row = (y >> 6) * cells, i = y * N * 4;
      for (let x = 0; x < N; x++, i += 4) {
        let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + 11 | 0;
        h = Math.imul(h ^ h >>> 13, 1274126177), h ^= h >>> 16;
        let r = (h >>> 0) / 4294967296, f = 0.93 + r * 0.11 + big[row + (x >> 6)] * 0.06;
        r > 0.992 ? f += 0.16 : r < 6e-3 && (f -= 0.12), d[i] = Math.min(255, ar * f), d[i + 1] = Math.min(255, ag * f), d[i + 2] = Math.min(255, ab * f), d[i + 3] = GC.ASPHALT;
      }
    }
    for (let i = 0; i < 170; i++) {
      let w = rng.int(24, 140), h = rng.int(20, 80), x = rng.int(0, N - w), y = rng.int(0, N - h);
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          if (p.getA(x + xx, y + yy) !== GC.ASPHALT) continue;
          let edge = xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1, hh = hash2i(x + xx, y + yy, 19);
          p.set(x + xx, y + yy, edge ? 3092792 : shade(COL.asphaltPatch, 0.95 + hh * 0.1), GC.ASPHALT);
        }
    }
    for (let i = 0; i < 420; i++) {
      let x = rng.int(0, N), y = rng.int(0, N), len = rng.int(10, 60), dx = rng.int(-1, 1), dy = rng.chance(0.5) ? 1 : -1;
      for (let k = 0; k < len; k++)
        if (p.set(x, y, 3158586, GC.ASPHALT), rng.chance(0.3) && (dx = rng.int(-1, 1)), x += dx, y += dy, rng.chance(0.06)) {
          let bx = x, by = y;
          for (let j = 0; j < 6; j++)
            bx += rng.int(-1, 1), by += 1, p.set(bx, by, 3421757, GC.ASPHALT);
        }
    }
    for (let i = 0; i < 260; i++) {
      let x = rng.int(0, N), y = rng.int(0, N), rx = rng.range(4, 10), ry = rng.range(3, 8);
      p.ellipse(x, y, rx, ry, 4277325, GC.ASPHALT), p.ellipse(x + 1, y, rx * 0.6, ry * 0.6, COL.asphaltDark, GC.ASPHALT);
    }
    for (let k = 0; k <= 4; k++) {
      let rs = roadStart(k) * 32, re = roadEnd(k) * 32, pw = Math.round(1.1 * 32);
      markBand(p, 0, rs, N, pw, GC.PARKING), markBand(p, 0, re - pw, N, pw, GC.PARKING), markBand(p, rs, 0, pw, N, GC.PARKING), markBand(p, re - pw, 0, pw, N, GC.PARKING);
    }
    let paintLine = (x, y, w, h, c, code) => {
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) {
          let worn = hash2i(xx >> 2, yy >> 2, 77) < 0.08;
          p.set(xx, yy, worn ? mixc(c, 5592668, 0.55) : shade(c, 0.94 + hash2i(xx, yy, 78) * 0.1), code);
        }
    };
    for (let k = 0; k <= 4; k++) {
      let rc = Math.round(roadCenter(k) * 32);
      for (let i = 0; i < 4; i++) {
        let a = (i * 27 + 2 + 5 + 2) * 32 + 16, b = (i + 1) * 27 * 32 - 16;
        paintLine(a, rc - 5, b - a, 3, COL.yellow, GC.PAINT_Y), paintLine(a, rc + 2, b - a, 3, COL.yellow, GC.PAINT_Y), paintLine(rc - 5, a, 3, b - a, COL.yellow, GC.PAINT_Y), paintLine(rc + 2, a, 3, b - a, COL.yellow, GC.PAINT_Y);
      }
    }
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++) {
        let x0 = roadStart(i) * 32, x1 = roadEnd(i) * 32, y0 = roadStart(j) * 32, y1 = roadEnd(j) * 32, sx0 = i * 27 * 32, sx1 = (i * 27 + 2 * 2 + 5) * 32, sy0 = j * 27 * 32, sy1 = (j * 27 + 2 * 2 + 5) * 32;
        zebra(p, x0, sy0 + 6, x1 - x0, y0 - sy0 - 12, "v"), zebra(p, x0, y1 + 6, x1 - x0, sy1 - y1 - 12, "v"), zebra(p, sx0 + 6, y0, x0 - sx0 - 12, y1 - y0, "h"), zebra(p, x1 + 6, y0, sx1 - x1 - 12, y1 - y0, "h");
        let rcx = roadCenter(i) * 32, rcy = roadCenter(j) * 32;
        j > 0 && paintLine(x0 + 4, sy0 - 9, rcx - x0 - 8, 6, COL.white, GC.PAINT_W), j < 4 && paintLine(rcx + 4, sy1 + 3, x1 - rcx - 8, 6, COL.white, GC.PAINT_W), i > 0 && paintLine(sx0 - 9, rcy + 4, 6, y1 - rcy - 8, COL.white, GC.PAINT_W), i < 4 && paintLine(sx1 + 3, y0 + 4, 6, rcy - y0 - 8, COL.white, GC.PAINT_W);
      }
    let iv = raisedIntervals();
    for (let [ax, bx] of iv)
      for (let [ay, by] of iv) paintSidewalkRect(p, ax * 32, ay * 32, (bx - ax) * 32, (by - ay) * 32, rng);
    let manholes = [];
    for (let k = 0; k <= 4; k++)
      for (let s = 0; s < 4; s++) {
        let along = s * 27 + 9 + rng.range(3, 15), off = roadCenter(k) + rng.pick([-0.7, 0.7, 0]);
        for (let axis of ["x", "y"]) {
          let wx = axis === "x" ? along : off, wy = axis === "x" ? off : along;
          manhole(p, wx * 32, wy * 32, rng), manholes.push({ x: wx, y: wy, axis });
        }
      }
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++) {
        let rcx = roadCenter(i) * 32, rcy = roadCenter(j) * 32, h = 5 / 2 * 32;
        for (let [gx, gy, vert] of [[rcx - h + 2, rcy - h - 70, !0], [rcx + h - 14, rcy + h + 58, !0], [rcx - h - 70, rcy + h - 14, !1], [rcx + h + 58, rcy - h + 2, !1]]) {
          let w = vert ? 12 : 22, hh = vert ? 22 : 12;
          p.rect(gx, gy, w, hh, 2500395, GC.METAL);
          for (let t = 2; t < (vert ? hh : w) - 1; t += 3)
            vert ? p.rect(gx + 2, gy + t, w - 4, 1, 5000530, GC.METAL) : p.rect(gx + t, gy + 2, 1, hh - 4, 5000530, GC.METAL);
        }
      }
    return { manholes };
  }
  function markBand(p, x, y, w, h, code) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        p.getA(xx, yy) === GC.ASPHALT && p.setA(xx, yy, code);
  }
  function zebra(p, x, y, w, h, dir) {
    let put = (xx, yy) => {
      let worn = hash2i(xx >> 1, yy >> 1, 5) < 0.07 || hash2i(xx >> 3, yy >> 3, 6) < 0.05;
      p.set(xx, yy, worn ? 11053228 : shade(COL.white, 0.95 + hash2i(xx, yy, 7) * 0.06), GC.CROSSWALK);
    };
    if (dir === "v")
      for (let xx = 8; xx < w - 7; xx += 16) for (let yy = 0; yy < h; yy++) for (let k = 0; k < 8; k++) put(x + xx + k, y + yy);
    else
      for (let yy = 8; yy < h - 7; yy += 16) for (let xx = 0; xx < w; xx++) for (let k = 0; k < 8; k++) put(x + xx, y + yy + k);
  }
  function paintSidewalkRect(p, x, y, w, h, rng) {
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        let gx = x + xx, gy = y + yy, hh = hash2i(gx, gy, 31), slab = hash2i(Math.floor(gx / 24), Math.floor(gy / 24), 33), c = shade(COL.sidewalk, 0.955 + hh * 0.07);
        slab < 0.12 ? c = shade(c, 0.93) : slab > 0.94 ? c = mixc(c, 14275264, 0.4) : slab > 0.9 && (c = mixc(c, 12104874, 0.35));
        let lx = gx % 24, ly = gy % 24;
        lx === 0 || ly === 0 ? c = COL.sidewalkDark : lx === 1 || ly === 1 ? c = shade(c, 1.05) : (lx === 23 || ly === 23) && (c = shade(c, 0.95)), hh > 0.995 && (c = shade(c, 0.85)), p.set(gx, gy, c, GC.SIDEWALK);
      }
    let nc = Math.floor(w * h / 2400);
    for (let i = 0; i < nc; i++) {
      let cx = x + rng.int(4, w - 5), cy = y + rng.int(4, h - 5);
      for (let k = 0; k < rng.int(5, 14); k++)
        p.set(cx, cy, 10262927, GC.SIDEWALK), cx += rng.int(-1, 1), cy += rng.chance(0.5) ? 1 : 0;
    }
    for (let [rx, ry, rw, rh] of [[x, y, w, 2], [x, y + h - 2, w, 2], [x, y, 2, h], [x + w - 2, y, 2, h]]) p.rect(rx, ry, rw, rh, COL.curb, GC.CURB);
    for (let [rx, ry, rw, rh] of [[x + 2, y + 2, w - 4, 1], [x + 2, y + h - 3, w - 4, 1], [x + 2, y + 2, 1, h - 4], [x + w - 3, y + 2, 1, h - 4]]) p.rect(rx, ry, rw, rh, 11841961, GC.CURB);
    let n = Math.floor(w * h / 900);
    for (let i = 0; i < n; i++) {
      let gx = x + rng.int(4, w - 6), gy = y + rng.int(4, h - 6), c = rng.chance(0.5) ? 10131343 : 9210242;
      p.rect(gx, gy, 2, 2, c, GC.SIDEWALK), rng.chance(0.4) && p.set(gx + 2, gy + 1, c, GC.SIDEWALK);
    }
  }
  function manhole(p, cx, cy, rng) {
    p.ellipse(cx, cy, 14, 14, 3026219, GC.METAL), p.ellipse(cx, cy, 12.5, 12.5, COL.metal, GC.METAL);
    for (let yy = -11; yy <= 11; yy++)
      for (let xx = -11; xx <= 11; xx++)
        xx * xx + yy * yy > 110 || ((xx + 40) % 4 === 0 || (yy + 40) % 4 === 0) && p.set(cx + xx, cy + yy, 4868422, GC.METAL);
    p.ring(cx, cy, 12.5, 12.5, 1.2, 7763311, GC.METAL), p.ring(cx, cy, 6, 6, 1, 6973796, GC.METAL), p.rect(cx - 2, cy - 1, 4, 2, 3026219, GC.METAL);
  }
  function buildGroundGeometry(mb, ground, tex) {
    let g = { t: ground, world: !0, mat: MAT.GROUND | MAT.SNOW | MAT.WET };
    mb.box(0, 0, -7, 117, 117, 0, { pz: g }, { topMat: MAT.GROUND | MAT.SNOW | MAT.WET });
    let iv = raisedIntervals();
    for (let [ax, bx] of iv)
      for (let [ay, by] of iv)
        mb.box(ax, ay, 0, bx, by, 0.125, {
          pz: { t: ground, u0: ax * 32, v0: ay * 32, mat: MAT.GROUND | MAT.SNOW | MAT.WET },
          px: tex.curb,
          nx: tex.curb,
          py: tex.curb,
          ny: tex.curb
        });
  }
  var TUNNEL = { z0: -4.4, z1: -0.75, depth: 2.4, a0: 3, a1: 114, station: [14, 34] };
  function buildSlabSides(mb, atlas, tex) {
    let T16 = 32, { z0: tz0, z1: tz1, depth: TD, a0, a1 } = TUNNEL, WH = Math.round((tz1 - tz0) * T16), wall = atlas.shared("tunnel_wall", 128, WH, (p) => {
      let H = p.h;
      for (let y = 0; y < H; y++) for (let x = 0; x < 128; x++) {
        let bx = x >> 4, by = Math.floor(y / 12), c = x % 16 === 0 || y % 12 === 0 ? 3814962 : hash2i(bx, by, 3) < 0.15 ? 6972506 : 5920076;
        c = shade(c, 0.93 + hash2i(x, y, 4) * 0.12), y < 60 && (c = shade(c, 0.5 + y / 120)), y > H - 10 && (c = y === H - 10 ? 4867650 : 3420204), p.set(x, y, c);
      }
      for (let cx of [12, 76]) for (let y = 0; y < H - 10; y++)
        p.set(cx, y, 1974565), p.set(cx + 1, y, 2764339), p.set(cx + 2, y, 3817544), p.set(cx + 3, y, 2764339);
      for (let x = 0; x < 128; x++)
        p.set(x, 66 + Math.round(Math.sin(x * 0.05) * 1.5), 1973792), p.set(x, 70, 2763308);
      for (let y = 88; y < H - 12; y += 2) p.set(80 + y % 3, y, 8010282);
      for (let lx of [40, 104])
        p.rect(lx - 1, 79, 10, 6, 2763308), p.rect(lx, 80, 8, 4, 16769696, 128), p.set(lx + 3, 80, 2763308);
    }), station = atlas.shared("station_wall", 256, WH, (p) => {
      let H = p.h;
      for (let y = 0; y < H; y++) for (let x = 0; x < 256; x++) {
        let c = x % 8 === 0 || y % 8 === 0 ? 12894388 : shade(15394522, 0.97 + hash2i(x >> 3, y >> 3, 9) * 0.05);
        y < 60 && (c = shade(c, 0.5 + y / 120)), p.set(x, y, c);
      }
      for (let x = 0; x < 256; x++) {
        for (let y = 72; y < 76; y++) p.set(x, y, 2779722);
        p.set(x, 76, 13148224), p.set(x, 77, 13148224), x % 8 < 4 && (p.set(x, 73, 4164196), p.set(x, 74, 4164196));
      }
      for (let ox of [20, 148])
        p.rect(ox, 82, 88, 18, 2779722), p.frame(ox, 82, 88, 18, 13148224), p.frame(ox + 2, 84, 84, 14, 4164196), p.text7(ox + 30, 88, "23 ST", 15921126);
      for (let lx of [122, 250]) p.rect(lx - 4, 60, 12, 3, 16774872, 128);
    }), track = atlas.shared("track", 64, Math.round(TD * T16), (p) => {
      let H = p.h;
      for (let y = 0; y < H; y++) for (let x = 0; x < 64; x++) {
        let r = hash2i(x, y, 8);
        p.set(x, y, r < 0.25 ? 4867136 : r > 0.92 ? 7235422 : 5919820);
      }
      for (let x = 0; x < 64; x += 8) for (let y = 12; y < H - 12; y++)
        p.set(x, y, 5914154), p.set(x + 1, y, 6965810), p.set(x + 2, y, 4862498);
      for (let ry of [24, H - 28]) for (let x = 0; x < 64; x++)
        p.set(x, ry, 14212322), p.set(x, ry + 1, 10133672), p.set(x, ry + 2, 5922406);
      for (let x = 0; x < 64; x++)
        p.set(x, H - 12, 15909424), p.set(x, H - 11, 14198816), p.set(x, H - 10, 6969888);
    }), platformTop = atlas.shared("platform_top", 64, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) p.set(x, y, x % 16 === 0 || y % 16 === 0 ? 10131084 : shade(11841702, 0.96 + hash2i(x, y, 5) * 0.08));
      for (let x = 0; x < 64; x++) for (let y = 0; y < 4; y++) p.set(x, y, (x + y) % 4 < 2 ? 15909424 : 14198816);
    }), concrete = atlas.shared("tunnel_conc", 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(6973024, 0.9 + hash2i(x, y, 2) * 0.2));
    }), soil = tex.soil, sides = [
      // [normal, point(a,d)->[x,y]]  a runs left->right as seen from outside; d goes into the slab
      { key: "py", n: [0, 1], pt: (a, d) => [a, 117 - d] },
      { key: "ny", n: [0, -1], pt: (a, d) => [117 - a, d] },
      { key: "px", n: [1, 0], pt: (a, d) => [117 - d, 117 - a] },
      { key: "nx", n: [-1, 0], pt: (a, d) => [d, a] }
    ], quadSide = (S2, aa0, aa1, d, zz0, zz1, texr, mat = 0) => {
      let p0 = S2.pt(aa0, d), p1 = S2.pt(aa1, d), u0 = aa0 * T16, u1 = aa1 * T16, v0 = -zz1 * T16, v1 = -zz0 * T16;
      mb.quad(
        [p0[0], p0[1], zz1],
        [p1[0], p1[1], zz1],
        [p1[0], p1[1], zz0],
        [p0[0], p0[1], zz0],
        [[u0, v0], [u1, v0], [u1, v1], [u0, v1]],
        texr,
        [S2.n[0], S2.n[1], 0],
        mat
      );
    };
    for (let S2 of sides) {
      quadSide(S2, 0, 117, 0, tz1, 0, soil), quadSide(S2, 0, 117, 0, -7, tz0, soil), quadSide(S2, 0, a0, 0, tz0, tz1, soil), quadSide(S2, a1, 117, 0, tz0, tz1, soil);
      let st = TUNNEL.station;
      S2.key === "py" ? (quadSide(S2, a0, st[0], TD, tz0, tz1, wall), quadSide(S2, st[0], st[1], TD, tz0, tz1, station), quadSide(S2, st[1], a1, TD, tz0, tz1, wall)) : quadSide(S2, a0, a1, TD, tz0, tz1, wall);
      {
        let q0 = S2.pt(a0, 0), q1 = S2.pt(a1, 0), q2 = S2.pt(a1, TD), q3 = S2.pt(a0, TD), L = (a1 - a0) * T16, D = TD * T16;
        mb.quad(
          [q3[0], q3[1], tz0],
          [q2[0], q2[1], tz0],
          [q1[0], q1[1], tz0],
          [q0[0], q0[1], tz0],
          [[0, 0], [L, 0], [L, D], [0, D]],
          track,
          [0, 0, 1],
          0
        );
      }
      {
        let e0 = S2.pt(a0, 0), e1 = S2.pt(a0, TD), u = [S2.n[1], -S2.n[0]];
        mb.quad(
          [e1[0], e1[1], tz1],
          [e0[0], e0[1], tz1],
          [e0[0], e0[1], tz0],
          [e1[0], e1[1], tz0],
          [[0, 0], [TD * T16, 0], [TD * T16, (tz1 - tz0) * T16], [0, (tz1 - tz0) * T16]],
          concrete,
          [u[0], u[1], 0],
          0
        );
        let f0 = S2.pt(a1, 0), f1 = S2.pt(a1, TD);
        mb.quad(
          [f0[0], f0[1], tz1],
          [f1[0], f1[1], tz1],
          [f1[0], f1[1], tz0],
          [f0[0], f0[1], tz0],
          [[0, 0], [TD * T16, 0], [TD * T16, (tz1 - tz0) * T16], [0, (tz1 - tz0) * T16]],
          concrete,
          [-u[0], -u[1], 0],
          0
        );
      }
      if (S2.key === "py") {
        let st2 = TUNNEL.station, [x0, y0] = S2.pt(st2[0], TD), [x1, y1] = S2.pt(st2[1], TD - 0.85);
        mb.box(
          Math.min(x0, x1),
          Math.min(y0, y1),
          tz0,
          Math.max(x0, x1),
          Math.max(y0, y1),
          tz0 + 0.5,
          { py: concrete, px: concrete, nx: concrete, pz: { t: platformTop, world: !0 } }
        );
      }
    }
  }

  // src/world/textures.js
  function makeBaseTextures(atlas) {
    let tex = {};
    tex.curb = atlas.shared("curb", 64, 4, (p) => {
      for (let x = 0; x < 64; x++)
        p.set(x, 0, 14868440), p.set(x, 1, shade(13157822, 0.97 + hash2i(x, 1, 3) * 0.06)), p.set(x, 2, shade(11578790, 0.97 + hash2i(x, 2, 3) * 0.06)), p.set(x, 3, 9078655);
      for (let x = 0; x < 64; x += 16)
        p.set(x, 1, 9078655), p.set(x, 2, 9078655);
    });
    let H = 7 * 32, W = 512;
    return tex.soil = atlas.shared("soil", W, H, (p) => {
      let rng = new RNG(99);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          let h = hash2i(x, y, 3), c, wav = Math.sin(x * 0.035) * 4 + Math.sin(x * 0.0115 + 1) * 6;
          if (y < 3) c = y === 0 ? 8027266 : 6053475;
          else if (y < 6) c = 9077880;
          else if (y < 36 + wav) c = shade(7031603, 0.86 + h * 0.22);
          else if (y < 92 + wav) {
            let band2 = Math.sin(y * 0.4 + x * 0.02) * 0.5 + 0.5;
            c = shade(mixc(9333576, 10122832, band2 * 0.5), 0.88 + h * 0.2);
          } else {
            let fol = Math.sin((x + y * 2.2) * 0.045 + Math.sin(x * 0.01) * 2) * 0.5 + 0.5;
            c = shade(mixc(5923693, 8094604, fol), 0.84 + h * 0.24), h > 0.988 && (c = 13687008);
          }
          p.set(x, y, c);
        }
      for (let i = 0; i < 320; i++) {
        let x = rng.int(0, W - 1), y = rng.int(8, 88), w = rng.int(2, 5), hh = rng.int(1, 3), c = shade(10127992, rng.range(0.75, 1.2));
        p.rect(x, y, w, hh, c), p.hline(x, y, w, shade(c, 1.2));
      }
      for (let i = 0; i < 24; i++) {
        let x = rng.int(0, W - 1), y = 6;
        for (let k = 0; k < rng.int(10, 26); k++)
          p.set(x, y, 4863012), x += rng.int(-1, 1), y += 1;
      }
      for (let i = 0; i < 36; i++) {
        let x = rng.int(0, W - 1), y = rng.int(100, H - 6);
        for (let k = 0; k < 32; k++)
          p.set(x, y, 4080972), p.set(x + 1, y, 7239296), x += rng.int(-1, 1), y += 1;
      }
      let pipes = [
        [60, 48, 10, 9146262, 5922406],
        [148, 60, 8, 14144200, 10262154],
        [240, 46, 6, 13666862, 9329692],
        [336, 66, 12, 5992326, 4016988],
        [428, 52, 8, 14144200, 10262154],
        [480, 74, 6, 8027524, 5593182]
      ];
      for (let [cx, cy, r, c1, c2] of pipes)
        p.ellipse(cx, cy, r + 2, r + 2, 3811872), p.ellipse(cx, cy, r, r, c2), p.ellipse(cx - 1, cy - 1, r - 2, r - 2, c1), p.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.3, r * 0.3, shade(c1, 1.2)), p.ring(cx, cy, r, r, 1, shade(c2, 0.8));
      p.rect(180, 70, 30, 20, 10131084);
      for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) p.ellipse(186 + k * 9, 76 + j * 8, 3, 3, 2763308);
      p.rect(0, H - 2, W, 2, 2764597);
    }), tex;
  }

  // src/world/facades.js
  var PAL = {
    brickRed: [11553330, 11027245, 12408120, 10239787],
    brickBrown: [9063219, 8209456, 9852218],
    brickOrange: [12871998, 12082999, 13595720],
    brickTan: [13673578, 12884064, 14332538],
    brickPurple: [7223861, 6566960, 7882048],
    brownstone: [8015164, 7292213, 8738374],
    limestone: [14470831, 13812642, 15129278],
    greystone: [11052960, 10263444, 11908269],
    cream: [15260864, 14471090],
    frames: [15921126, 15921126, 2829104, 3099194, 6044458, 8003359, 2046559],
    curtains: [14241615, 15254090, 15921126, 5939416, 8372330, 15044533, 11565782, 15768138, 15524552, 14209216],
    awning: [13119532, 3115590, 2051994, 1776411, 14721056, 9054826, 1011562],
    neon: [16732010, 5231359, 16767055, 8257386, 16743136, 16777215, 16751162]
  }, glassDay = 3493995, glassHi = 8826571;
  function brickFill(p, x, y, w, h, pal, seed = 1, opt = {}) {
    let base = pal[0], mortar = mixc(base, 14208188, 0.42), mortarD = shade(mortar, 0.9);
    for (let yy = 0; yy < h; yy++) {
      let gy = y + yy + (opt.oy || 0) + p.oy, course = Math.floor(gy / 3), ry = gy % 3;
      for (let xx = 0; xx < w; xx++) {
        let gx = x + xx + (opt.ox || 0) + p.ox;
        if (ry === 2) {
          p.set(x + xx, y + yy, hash2i(gx, gy, seed) < 0.5 ? mortar : mortarD);
          continue;
        }
        let bx = gx + (course & 1) * 4;
        if (bx % 8 === 7) {
          p.set(x + xx, y + yy, mortar);
          continue;
        }
        let cell = Math.floor(bx / 8), hc = hash2i(cell, course, seed + 7), c = pal[Math.floor(hc * pal.length)];
        hc > 0.955 ? c = shade(c, 0.74) : hc < 0.035 && (c = shade(c, 1.16)), c = shade(c, (ry === 0 ? 1.05 : 0.97) * (0.97 + hash2i(gx, gy, seed + 1) * 0.06)), p.set(x + xx, y + yy, c);
      }
    }
  }
  function stoneFill(p, x, y, w, h, pal, seed = 1, course = 12, opt = {}) {
    let bl = opt.blocks || 0;
    for (let yy = 0; yy < h; yy++) {
      let gy = y + yy + (opt.oy || 0), ci = course ? Math.floor(gy / course) : 0, ly = course ? gy % course : 1;
      for (let xx = 0; xx < w; xx++) {
        let gx = x + xx, hh = hash2i(gx + p.ox, gy + p.oy, seed), bi = bl ? Math.floor((gx + ci * 13) / bl) : 0, lx = bl ? (gx + ci * 13) % bl : 1, tone = hash2i(bi, ci, seed + 3), c = shade(pal[0], 0.95 + hh * 0.07 + (tone - 0.5) * 0.06);
        course && ly === course - 1 ? c = shade(pal[0], 0.8) : course && ly === 0 ? c = shade(pal[0], 1.08) : bl && lx === 0 ? c = shade(pal[0], 0.86) : bl && lx === 1 && (c = shade(pal[0], 1.05)), p.set(x + xx, y + yy, c);
      }
    }
  }
  function smoothFill(p, x, y, w, h, c, seed = 1, amt = 0.05) {
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        let hh = hash2i(x + xx + p.ox, y + yy + p.oy, seed);
        p.set(x + xx, y + yy, shade(c, 1 - amt + hh * amt * 2));
      }
  }
  function rustication(p, x, y, w, h, c, step = 6) {
    for (let yy = 0; yy < h; yy++) {
      let ly = yy % step;
      for (let xx = 0; xx < w; xx++) {
        let hh = hash2i(x + xx + p.ox, y + yy + p.oy, 77), col = shade(c, 0.95 + hh * 0.08);
        ly === step - 1 ? col = shade(c, 0.62) : ly === step - 2 ? col = shade(c, 0.82) : ly === 0 && (col = shade(c, 1.1)), p.set(x + xx, y + yy, col);
      }
    }
  }
  function drawWindow(p, x, y, w, h, o = {}, rng) {
    let frame = o.frame ?? 15921126, frameD = shade(frame, 0.78), t = o.t ?? 0.5;
    if (o.lintel != null) {
      let L = o.lintel;
      if (p.rect(x - 2, y - 5, w + 4, 5, L), p.hline(x - 2, y - 5, w + 4, shade(L, 1.12)), p.hline(x - 2, y - 1, w + 4, shade(L, 0.72)), p.vline(x - 2, y - 5, 5, shade(L, 1.05)), o.keystone) {
        let kx = x + (w >> 1) - 2;
        p.rect(kx, y - 7, 4, 7, shade(L, 1.06)), p.vline(kx + 3, y - 7, 7, shade(L, 0.8)), p.hline(kx, y - 7, 4, shade(L, 1.18));
      }
    }
    o.wall != null && p.hline(x, y - 1, w, shade(o.wall, 0.55)), p.rect(x, y, w, h, frame), p.vline(x, y, h, shade(frame, 1.06)), p.vline(x + w - 1, y, h, frameD), p.hline(x, y + h - 1, w, frameD);
    let gx = x + 2, gy = y + 2, gw = w - 4, gh = h - 4, glass = o.glass ?? glassDay, code = winCode(t);
    for (let yy = 0; yy < gh; yy++)
      for (let xx = 0; xx < gw; xx++) {
        let c = shade(glass, 1.16 - yy / gh * 0.32), d = xx + yy;
        (d % 14 === 3 || d % 14 === 4) && yy < gh * 0.55 ? c = mixc(c, glassHi, 0.65) : d % 14 === 5 && yy < gh * 0.4 && (c = mixc(c, glassHi, 0.3)), p.set(gx + xx, gy + yy, c, code);
      }
    if (o.curtain != null) {
      let cc = winCode(t, !0), cw = Math.max(2, Math.floor(gw / 3));
      for (let yy = 0; yy < gh; yy++) {
        let sway = yy > gh * 0.6 ? 1 : 0;
        for (let xx = 0; xx < cw + sway; xx++) {
          let fold = xx % 3 === 1 ? 0.85 : xx === cw + sway - 1 ? 0.78 : 1, c = shade(o.curtain, fold);
          p.set(gx + xx, gy + yy, c, cc), p.set(gx + gw - 1 - xx, gy + yy, c, cc);
        }
      }
      for (let xx = 0; xx < gw; xx++) p.set(gx + xx, gy, shade(o.curtain, 0.9), cc);
    }
    if (o.blinds) {
      let cc = winCode(t, !0), bh = Math.floor(gh * (0.25 + (rng ? rng.next() * 0.55 : 0.3)));
      for (let yy = 0; yy < bh; yy++)
        for (let xx = 0; xx < gw; xx++) p.set(gx + xx, gy + yy, yy % 3 === 2 ? 12367526 : yy % 3 === 0 ? 15920348 : 14867660, cc);
      p.hline(gx, gy + bh, gw, 9077880);
    }
    let panes = o.panes ?? (w >= 14 ? "2/2" : "1/1");
    if (o.rail !== !1 && h >= 18) {
      let my = y + Math.floor(h / 2);
      p.rect(x, my - 1, w, 2, frame), p.hline(x, my + 1, w, frameD);
    }
    if (panes === "2/2" && gw >= 8 && p.vline(x + Math.floor(w / 2), y + 1, h - 2, frame), panes === "6/6" && gw >= 10) {
      for (let k = 1; k < 3; k++) p.vline(gx + Math.round(gw * k / 3), gy, gh, frame);
      for (let fy of [gy + Math.round(gh / 4), gy + Math.round(gh * 3 / 4)]) p.hline(gx, fy, gw, frame);
    }
    if (o.arch) {
      let wallC = o.wall ?? frame;
      p.set(x, y, wallC), p.set(x + 1, y, wallC), p.set(x, y + 1, wallC), p.set(x + w - 1, y, wallC), p.set(x + w - 2, y, wallC), p.set(x + w - 1, y + 1, wallC);
    }
    if (o.plant) {
      let py = y + h - 7;
      for (let xx = 0; xx < gw; xx++)
        p.set(gx + xx, py + 3, 7031346), p.set(gx + xx, py + 2, 4164149), hash2i(xx + x, py, 3) < 0.6 && p.set(gx + xx, py + 1, 5811267), hash2i(xx + x, py, 4) < 0.3 && p.set(gx + xx, py, 7127120);
      if (o.plant === "flower") for (let k = 1; k < gw; k += 3) p.set(gx + k, py, [15223391, 15909424, 15044533][k % 3]);
    }
    if (o.cat) {
      let cx = gx + 2, cy = y + h - 9, cc = o.cat;
      p.rect(cx, cy + 2, 6, 4, cc), p.rect(cx + 1, cy, 4, 3, cc), p.set(cx + 1, cy - 1, cc), p.set(cx + 4, cy - 1, cc), p.set(cx + 2, cy + 1, 15913024), p.set(cx + 4, cy + 1, 15913024), p.set(cx + 6, cy + 4, cc), p.set(cx + 7, cy + 3, cc);
    }
    if (o.sill != null) {
      let S2 = o.sill;
      p.rect(x - 2, y + h, w + 4, 3, S2), p.hline(x - 2, y + h, w + 4, shade(S2, 1.15)), p.hline(x - 2, y + h + 2, w + 4, shade(S2, 0.7)), o.wall != null && p.hline(x - 1, y + h + 3, w + 2, shade(o.wall, 0.6));
    }
  }
  function drawDoor(p, x, y, w, h, o = {}) {
    let c = o.color ?? 6044458, frame = o.frame ?? shade(c, 0.7);
    p.rect(x, y, w, h, frame), p.rect(x + 2, y + 2, w - 4, h - 2, c);
    let py = y + 2;
    if (o.transom !== !1) {
      for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < w - 4; xx++) p.set(x + 2 + xx, y + 2 + yy, shade(glassDay, 1.15 - yy * 0.04), winCode(o.t ?? 0.15));
      let cx = x + w / 2, cy = y + 2 + 7;
      for (let k = 1; k < 4; k++) {
        let a = Math.PI * (k / 4);
        for (let r = 2; r < 7; r++) p.set(Math.round(cx - Math.cos(a) * r * 1.4), Math.round(cy - Math.sin(a) * r), frame);
      }
      p.hline(x + 2, y + 2 + 7, w - 4, frame), py = y + 2 + 7 + 2;
    }
    let lw = w - 4;
    if (o.glass) {
      let gh = Math.floor((h - (py - y)) * 0.5);
      p.rect(x + 4, py + 1, lw - 4, gh, shade(glassDay, 1.1), winCode(o.t ?? 0.15)), p.hline(x + 4, py + 2, lw - 4, glassHi, winCode(o.t ?? 0.15)), py += gh + 3;
    }
    let half = Math.floor((lw - 2) / 2);
    for (let yy = py; yy < y + h - 4; yy += 9)
      for (let px of [x + 3, x + 3 + half + 1]) {
        let ph = Math.min(7, y + h - 4 - yy);
        ph < 3 || (p.rect(px, yy, half - 1, ph, shade(c, 0.88)), p.hline(px, yy, half - 1, shade(c, 0.7)), p.vline(px, yy, ph, shade(c, 0.7)), p.hline(px, yy + ph - 1, half - 1, shade(c, 1.15)), p.vline(px + half - 2, yy, ph, shade(c, 1.15)));
      }
    if (p.rect(x + w - 5, y + Math.floor(h * 0.58), 2, 2, 15123274), p.set(x + w - 5, y + Math.floor(h * 0.58), 16773280), p.rect(x + 2, y + h - 3, w - 4, 2, 12098128), o.number != null) {
      let s = String(o.number), tw = textWidth(s, 1, !0);
      p.text7(x + Math.floor((w - tw) / 2), y - 9, s, 15123274);
    }
    if (o.wreath) {
      let cx = x + (w >> 1), cy = py + 6;
      p.ring(cx, cy, 5, 5, 2, 3111482), p.set(cx - 2, cy - 4, 14168108), p.set(cx + 3, cy + 2, 14168108), p.rect(cx - 1, cy + 4, 3, 3, 14168108);
    }
  }
  function corniceBand(p, x, y, w, h, c) {
    let hi = shade(c, 1.2), lo = shade(c, 0.66), mid = shade(c, 0.86);
    if (p.rect(x, y, w, h, c), p.hline(x, y, w, hi), h > 4 && p.hline(x, y + 1, w, shade(c, 1.08)), h > 6 && p.hline(x, y + 3, w, lo), h >= 10) {
      let dy = y + h - 5;
      for (let xx = 1; xx < w - 1; xx += 4)
        p.rect(x + xx, dy, 2, 3, mid), p.set(x + xx, dy + 2, lo);
    }
    if (p.hline(x, y + h - 2, w, shade(c, 0.78)), p.hline(x, y + h - 1, w, lo), h >= 10) {
      let step = Math.max(16, Math.floor(w / 6));
      for (let xx = 4; xx < w - 4; xx += step)
        p.rect(x + xx, y + 4, 4, h - 6, mid), p.vline(x + xx, y + 4, h - 6, hi), p.vline(x + xx + 3, y + 4, h - 6, lo), p.set(x + xx + 1, y + h - 4, lo), p.set(x + xx + 2, y + h - 3, lo);
    }
  }
  function signBoard(p, x, y, w, h, text, o = {}) {
    let bg = o.bg ?? 1776411, fg = o.fg ?? 16767055, lit = o.lit ?? !0;
    p.rect(x, y, w, h, bg), p.hline(x, y, w, shade(bg, 1.35)), p.hline(x, y + h - 1, w, shade(bg, 0.6)), o.border && p.frame(x, y, w, h, o.border);
    let a = lit ? winCode(o.t ?? 0.02, !0) : 255, scale = o.scale ?? (h >= 18 && textWidth(text, 2, !0) <= w - 6 ? 2 : 1);
    if (textWidth(text, scale, !0) <= w - 4 && h >= 7 * scale + 2) {
      let tw = textWidth(text, scale, !0), tx = x + Math.floor((w - tw) / 2), ty = y + Math.floor((h - 7 * scale) / 2);
      o.shadow !== !1 && p.text7(tx + scale, ty + scale, text, shade(bg, 0.55), a, scale), p.text7(tx, ty, text, fg, a, scale);
    } else {
      scale = h >= 12 && textWidth(text, 2) <= w - 4 ? 2 : 1;
      let tw = textWidth(text, scale), tx = x + Math.floor((w - tw) / 2), ty = y + Math.floor((h - 5 * scale) / 2);
      p.text(tx, ty, text, fg, a, scale);
    }
  }
  var SHOPS = {
    bodega: { name: ["DELI", "GROCERY", "BODEGA", "DELI & GROCERY", "MINI MART"], bg: 15909424, fg: 13119532, awn: 13119532, goods: "snacks" },
    pizza: { name: ["PIZZA", "$1 PIZZA", "NY SLICE", "SLICE"], bg: 13119532, fg: 16777215, awn: 3115590, goods: "pizza" },
    laundry: { name: ["LAUNDROMAT", "WASH & FOLD", "LAUNDRY"], bg: 2051994, fg: 16777215, awn: 2051994, goods: "washers" },
    coffee: { name: ["COFFEE", "ESPRESSO", "CAFE"], bg: 3877408, fg: 15915430, awn: 1011562, goods: "cafe" },
    bar: { name: ["BAR", "PUB", "TAVERN", "COCKTAILS"], bg: 1776411, fg: 16732010, awn: 1776411, goods: "bar" },
    books: { name: ["BOOKS", "USED BOOKS"], bg: 3099194, fg: 15921126, awn: 3099194, goods: "books" },
    flowers: { name: ["FLOWERS", "FLORIST"], bg: 15921126, fg: 3115590, awn: 3115590, goods: "flowers" },
    bagels: { name: ["BAGELS", "BAGEL BROS"], bg: 14721056, fg: 3877408, awn: 14721056, goods: "bagels" },
    hardware: { name: ["HARDWARE", "KEYS MADE"], bg: 13119532, fg: 15909424, awn: 1776411, goods: "tools" },
    nails: { name: ["NAILS", "NAIL SALON"], bg: 15044533, fg: 16777215, awn: 15044533, goods: "salon" },
    chinese: { name: ["CHINESE FOOD", "WOK & ROLL", "TAKE OUT"], bg: 13119532, fg: 15909424, awn: 13119532, goods: "food" },
    gallery: { name: ["GALLERY", "ART"], bg: 15921126, fg: 1776411, awn: 1776411, goods: "art" },
    boutique: { name: ["BOUTIQUE", "VINTAGE", "SHOES"], bg: 1776411, fg: 15921126, awn: 9054826, goods: "clothes" },
    pharmacy: { name: ["PHARMACY", "DRUGS"], bg: 15921126, fg: 3115590, awn: 2051994, goods: "pharmacy" },
    diner: { name: ["DINER", "EAT", "LUNCHEONETTE"], bg: 1011562, fg: 16732010, awn: 13119532, goods: "diner" }
  };
  function goods(p, x, y, w, h, kind, rng, t) {
    let cc = winCode(t, !0), put = (xx, yy, c) => {
      xx >= 0 && yy >= 0 && xx < w && yy < h && p.set(x + xx, y + yy, c, cc);
    }, box = (xx, yy, bw, bh, c) => {
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) put(xx + i, yy + j, i === 0 ? shade(c, 1.15) : j === bh - 1 ? shade(c, 0.75) : c);
    }, colors = [14241615, 15254090, 5939416, 8372330, 15044533, 15768138, 16777215, 11565782, 4885082];
    if (kind === "washers") {
      for (let xx = 1; xx + 9 <= w; xx += 11) {
        box(xx, h - 13, 9, 12, 15263978);
        for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) (i - 2) ** 2 + (j - 2) ** 2 <= 5 && put(xx + 2 + i, h - 10 + j, j < 2 ? 9089240 : 4872816);
        put(xx + 7, h - 12, 2763308);
      }
      for (let xx = 0; xx < w; xx += 3) put(xx, 2, 15921126);
      return;
    }
    if (kind === "pizza" || kind === "food" || kind === "diner" || kind === "cafe" || kind === "bagels") {
      for (let xx = 0; xx < w; xx++) {
        put(xx, h - 7, kind === "cafe" ? 9067066 : 14210252), put(xx, h - 6, 11052188);
        for (let j = h - 5; j < h; j++) put(xx, j, 6965818);
      }
      for (let xx = 2; xx + 10 < w; xx += 14) {
        box(xx, 2, 10, 6, 1973792);
        for (let k = 1; k < 9; k += 2) put(xx + k, 4, 15921126);
        put(xx + 2, 6, 15909424);
      }
      for (let xx = 4; xx < w; xx += 12)
        put(xx, 0, 2763308), put(xx, 9, 16773296), put(xx - 1, 10, 16769168), put(xx + 1, 10, 16769168);
      if (kind === "pizza") for (let k = 0; k < 2; k++) {
        for (let i = 0; i < 7; i++) put(4 + k * 10 + i, h - 8, 15249472);
        put(6 + k * 10, h - 9, 13119532), put(8 + k * 10, h - 9, 13119532);
      }
      if (kind === "bagels") for (let k = 2; k < w - 2; k += 5)
        put(k, h - 8, 12884064), put(k + 1, h - 8, 11565120), put(k + 2, h - 8, 12884064);
      let cx = w - 10;
      for (let j = h - 18; j < h - 7; j++)
        put(cx, j, 2777016), put(cx + 1, j, 2777016);
      put(cx, h - 20, 14196856), put(cx + 1, h - 20, 14196856), put(cx, h - 21, 2759184), put(cx + 1, h - 21, 2759184);
      return;
    }
    if (kind === "bar") {
      for (let xx = 0; xx < w; xx++) {
        put(xx, h - 7, 5913122);
        for (let j = h - 6; j < h; j++) put(xx, j, 3810326);
      }
      for (let row = 0; row < 2; row++) for (let xx = 1; xx < w - 1; xx += 3) {
        let c = colors[(xx * 3 + row) % colors.length];
        put(xx, 4 + row * 6, c), put(xx, 5 + row * 6, shade(c, 0.8)), put(xx, 6 + row * 6, shade(c, 0.7)), put(xx, 3 + row * 6, 2763306);
      }
      for (let xx = 0; xx < w; xx++)
        put(xx, 7, 9071178), put(xx, 13, 9071178);
      return;
    }
    if (kind === "flowers") {
      for (let xx = 0; xx < w; xx++) for (let yy = h - 12; yy < h; yy++) {
        let r = hash2i(xx + x, yy + y, 9);
        put(xx, yy, yy > h - 4 ? 7031346 : r < 0.45 ? r < 0.2 ? 4164149 : 5811267 : colors[Math.floor(r * 9) % 6]);
      }
      return;
    }
    if (kind === "art") {
      for (let xx = 2; xx + 10 < w; xx += 14) {
        let c = colors[rng.int(0, colors.length - 1)];
        box(xx, 3, 11, 9, 15921126);
        for (let j = 1; j < 8; j++) for (let i = 1; i < 10; i++) put(xx + i, 3 + j, hash2i(i, j + xx, 5) < 0.5 ? c : shade(c, 0.7));
        put(xx + 5, 13, 2763308);
      }
      return;
    }
    if (kind === "clothes") {
      for (let xx = 0; xx < w; xx++) put(xx, 3, 10132122);
      for (let xx = 2; xx + 5 < w; xx += 7) {
        let c = colors[rng.int(0, colors.length - 1)];
        for (let j = 4; j < 14; j++) for (let i = 0; i < 5; i++) j < 6 && (i === 0 || i === 4) || put(xx + i, j, i === 0 ? shade(c, 1.1) : c);
      }
      return;
    }
    for (let yy = 2; yy < h - 4; yy += 7) {
      for (let xx = 0; xx < w; xx++)
        put(xx, yy + 6, 10131086), put(xx, yy + 7, 6973022);
      for (let xx = 1; xx < w - 2; ) {
        let bw = rng.int(2, 4), bh = rng.int(3, 6);
        rng.chance(0.85) && box(xx, yy + 6 - bh, bw, bh, colors[rng.int(0, colors.length - 1)]), xx += bw + 1;
      }
    }
  }
  function drawShopfront(p, x, y, w, h, kind, rng, o = {}) {
    let S2 = SHOPS[kind] || SHOPS.bodega, frameC = o.frame ?? rng.pick([1776411, 3099194, 6044458, 8003359, 2046559, 15262416]), signH = o.signH ?? 14, name = o.name ?? rng.pick(S2.name);
    signBoard(p, x, y, w, signH, name, { bg: S2.bg, fg: S2.fg, t: 0.02 });
    let by = y + signH, bh = h - signH;
    p.rect(x, by, w, bh, frameC), p.hline(x, by, w, shade(frameC, 0.6));
    let dw = 11, dx = o.doorLeft ? x + 2 : x + w - dw - 2, t = 0.02 + rng.next() * 0.04, wx0 = o.doorLeft ? dx + dw + 2 : x + 2, wx1 = o.doorLeft ? x + w - 2 : dx - 2, wy = by + 2, wh = bh - 9;
    for (let yy = wy; yy < wy + wh; yy++)
      for (let xx = wx0; xx < wx1; xx++) {
        let c = shade(4216685, 1.18 - (yy - wy) / wh * 0.34);
        (xx + yy) % 19 === 3 && yy < wy + wh * 0.5 && (c = mixc(c, glassHi, 0.5)), p.set(xx, yy, c, winCode(t));
      }
    goods(p, wx0, wy, wx1 - wx0, wh, S2.goods, rng, t);
    for (let xx = wx0 + 15; xx < wx1 - 4; xx += 16)
      p.rect(xx, wy, 2, wh, frameC), p.vline(xx + 1, wy, wh, shade(frameC, 0.7));
    let bky = by + bh - 7;
    p.rect(x, bky, w, 7, shade(frameC, 0.82));
    for (let xx = x + 3; xx < x + w - 8; xx += 12)
      p.frame(xx, bky + 2, 9, 4, shade(frameC, 0.62)), p.hline(xx + 1, bky + 2, 7, shade(frameC, 1.1));
    return p.hline(x, bky, w, shade(frameC, 1.15)), p.rect(dx, by + 2, dw, bh - 2, shade(frameC, 0.85)), p.rect(dx + 2, by + 4, dw - 4, bh - 12, 4216685, winCode(t)), p.hline(dx + 2, by + 5, dw - 4, glassHi, winCode(t)), p.rect(dx + 2, by + Math.floor(bh * 0.55), dw - 4, 2, 13158596), o.open !== !1 && wx1 - wx0 > 26 && (p.text7(wx0 + 3, wy + 3, "OPEN", 16732010, winCode(0.01, !0)), p.rect(wx1 - 6, wy + wh - 8, 4, 5, 15921126)), { name, color: S2.awn, kind };
  }
  function drawGate(p, w, h, rng) {
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        let c = yy % 3 === 0 ? 8224903 : yy % 3 === 1 ? 10790829 : 9869727;
        xx % 18 === 0 && (c = 6974836), p.set(xx, yy, shade(c, 0.95 + hash2i(xx, yy, 5) * 0.08));
      }
    p.rect(0, 0, w, 4, 5922147), p.hline(0, 0, w, 8027523), p.rect(0, h - 2, w, 2, 4869458), graffiti(p, 2, 6, w - 4, h - 10, rng, 0.8);
  }
  function graffiti(p, x, y, w, h, rng, density = 1) {
    let cols = [16732010, 5231359, 16767055, 8257386, 16743136, 16777215, 1776411, 16751162, 8015871], n = Math.floor(w * h / 240 * density);
    for (let i = 0; i < n; i++) {
      let c = rng.pick(cols), kind = rng.int(0, 3), gx = x + rng.int(0, Math.max(0, w - 12)), gy = y + rng.int(0, Math.max(0, h - 9));
      if (kind === 0) {
        let fit = rng.pick(["NYC", "ZEPH", "REVS", "SKY", "BOMB", "YO", "ART", "LOVE", "KO", "DMZ", "TAKI", "JOY"]).slice(0, Math.max(1, Math.floor((w - (gx - x)) / 6)));
        p.text7(gx + 1, gy + 1, fit, shade(c, 0.4)), p.text7(gx, gy, fit, c);
      } else if (kind === 1) {
        let sx = gx, sy = gy + 4;
        for (let k = 0; k < 16; k++)
          p.set(sx, sy, c), p.set(sx, sy + 1, c), sx++, sy += rng.int(-1, 1);
      } else kind === 2 ? (p.ellipse(gx + 4, gy + 4, 4.5, 4.5, c), p.ellipse(gx + 4, gy + 4, 2, 2, shade(c, 0.55))) : (p.rect(gx, gy, rng.int(6, 14), 3, c), p.hline(gx, gy + 3, 6, shade(c, 0.5)));
    }
  }
  function mural(p, x, y, w, h, rng) {
    let skies = [[5231359, 16743136], [16767055, 16732010], [8257386, 5208831]], [c1, c2] = rng.pick(skies);
    for (let yy = 0; yy < h; yy++) {
      let c = mixc(c1, c2, yy / h);
      for (let xx = 0; xx < w; xx++) p.set(x + xx, y + yy, (xx + yy) % 2 && yy % 8 === 0 ? shade(c, 1.05) : c);
    }
    let sx = x + w * 0.7, sy = y + h * 0.35, sr = h * 0.2;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) for (let r = sr + 2; r < sr + 6; r++) p.set(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r), 16769658);
    p.ellipse(sx, sy, sr, sr, 16769658), p.ellipse(sx - sr * 0.2, sy - sr * 0.2, sr * 0.6, sr * 0.6, 16773808);
    let bx = x;
    for (; bx < x + w; ) {
      let bw = rng.int(6, 14), bh = rng.int(Math.floor(h * 0.25), Math.floor(h * 0.7));
      p.rect(bx, y + h - bh, bw, bh, 2760522), p.vline(bx, y + h - bh, bh, 3813210);
      for (let k = 3; k < bh - 3; k += 4) for (let j = 2; j < bw - 2; j += 3) rng.chance(0.45) && p.set(bx + j, y + h - bh + k, 16767055);
      rng.chance(0.3) && p.vline(bx + (bw >> 1), y + h - bh - 6, 6, 2760522), bx += bw;
    }
    let word = rng.pick(["NYC", "PEACE", "HOOPS", "BKLYN", "LOVE"]), sc = h > 52 ? 2 : 1;
    p.text7(x + 5, y + 5, word, 2760522, 255, sc), p.text7(x + 4, y + 4, word, 16777215, 255, sc);
  }
  function roofFill(p, w, h, kind, rng) {
    let base = kind === "silver" ? 12895945 : kind === "gravel" ? 9341830 : kind === "green" ? 6262597 : kind === "deck" ? 10119748 : 5987426;
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        let hh = hash2i(xx + p.ox, yy + p.oy, 41), c = shade(base, 0.93 + hh * 0.12);
        kind === "tar" && yy % 20 === 0 && (c = shade(base, 0.82)), kind === "tar" && yy % 20 === 1 && (c = shade(base, 1.06)), kind === "silver" && xx % 24 === 0 && (c = shade(base, 0.88)), kind === "silver" && xx % 24 === 1 && (c = shade(base, 1.05)), kind === "deck" && xx % 6 === 0 && (c = shade(base, 0.76)), kind === "gravel" && hh > 0.86 && (c = shade(base, hh > 0.95 ? 1.3 : 0.75)), kind === "green" && hh > 0.8 && (c = shade(base, hh > 0.93 ? 1.25 : 0.8)), p.set(xx, yy, c);
      }
    for (let i = 0; i < Math.floor(w * h / 1600); i++) {
      let x = rng.int(0, w - 12), y = rng.int(0, h - 8), pw = rng.int(6, 16), ph = rng.int(4, 10), c = shade(base, rng.range(0.85, 1.1));
      p.rect(x, y, pw, ph, c), p.hline(x, y, pw, shade(c, 1.08));
    }
  }
  function railingTex(p, w, h, c = 1973794, step = 4) {
    p.clear(), p.rect(0, 0, w, 2, c), p.hline(0, 0, w, shade(c, 1.8)), p.rect(0, h - 2, w, 2, c);
    for (let x = 0; x < w; x += step)
      p.rect(x, 0, 1, h, c), h > 12 && p.set(x, 3, shade(c, 1.6));
    if (h > 14) for (let x = 0; x < w; x++) x % step === Math.floor(step / 2) && p.set(x, Math.floor(h / 2), c);
  }
  function chainLinkTex(p, w, h) {
    p.clear();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let d1 = (x + y) % 8 === 0, d2 = (x - y + 800) % 8 === 0;
        (d1 || d2) && p.set(x, y, d1 && d2 ? 12107462 : (x + y) % 16 < 8 ? 9081241 : 8028553);
      }
    p.rect(0, 0, w, 2, 10133672);
  }
  function ladderTex(p, w, h, c = 1973794) {
    p.clear(), p.rect(0, 0, 2, h, c), p.rect(w - 2, 0, 2, h, c);
    for (let y = 2; y < h; y += 5) p.rect(0, y, w, 1, c);
  }
  function plankTex(p, w, h, c, hoops = !0) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let plank = Math.floor(x / 4), col = shade(c, 0.88 + hash2i(plank, y >> 4, 9) * 0.22);
        x % 4 === 3 ? col = shade(col, 0.72) : x % 4 === 0 && (col = shade(col, 1.08)), hash2i(x, y, 11) > 0.97 && (col = shade(col, 0.8)), p.set(x, y, col);
      }
    if (hoops) for (let y = 6; y < h; y += 12)
      p.rect(0, y, w, 1, 3026482), p.rect(0, y + 1, w, 1, 4868688);
  }
  function grilleTex(p, w, h, c) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) p.set(x, y, y % 3 === 2 ? shade(c, 0.66) : y % 3 === 0 ? shade(c, 1.08) : c);
    p.frame(0, 0, w, h, shade(c, 0.55)), p.frame(1, 1, w - 2, h - 2, shade(c, 1.12));
  }
  function awningTex(p, w, h, c, striped, text, rng) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let col = c;
        striped && Math.floor(x / 8) % 2 === 1 && (col = 15921126), col = shade(col, 1 - y / h * 0.14 + (x % 8 === 0 ? -0.04 : 0)), p.set(x, y, col);
      }
    if (text) {
      let tw = textWidth(text, 1, !0);
      tw < w - 4 && p.text7(Math.floor((w - tw) / 2), Math.max(0, Math.floor((h - 7) / 2)), text, 16777215);
    }
  }
  function billboardArt(p, w, h, kind, rng) {
    let t = winCode(0.03, !0), S2 = (x, y, ww, hh, c) => {
      for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < ww; xx++) p.set(Math.round(x) + xx, Math.round(y) + yy, c, t);
    }, txt = (x, y, s, c, sc = 1, sh = null) => {
      sh != null && p.text7(x + sc, y + sc, s, sh, t, sc), p.text7(x, y, s, c, t, sc);
    }, disc = (cx, cy, r, c) => p.ellipse(cx, cy, r, r, c, t);
    if (kind === "cola") {
      S2(0, 0, w, h, 14164012);
      for (let x = 0; x < w; x++) {
        let wy = Math.floor(h * 0.66 + Math.sin(x * 0.1) * 3);
        for (let k = 0; k < 3; k++) p.set(x, wy + k, 16777215, t);
      }
      S2(w - 26, 6, 12, h - 12, 5901838), S2(w - 24, 8, 3, h - 16, 12075072), S2(w - 23, 2, 6, 5, 14211288), S2(w - 26, h / 2 - 3, 12, 6, 15921126), txt(6, 6, "FIZZ", 16777215, 2, 6950420), txt(6, h - 14, "COLA", 16767055, 1, 6950420);
    } else if (kind === "bagel") {
      S2(0, 0, w, h, 15909424), disc(w - 24, h / 2, 14, 10115620), disc(w - 24, h / 2, 12, 12875834), disc(w - 26, h / 2 - 3, 6, 14195288), disc(w - 24, h / 2, 5, 15909424);
      for (let k = 0; k < 10; k++) p.set(w - 32 + rng.int(0, 16), Math.round(h / 2) - 8 + rng.int(0, 16), 15921126, t);
      txt(6, 6, "BAGEL", 3877408, 2), txt(6, h - 14, "BROS", 3877408);
    } else if (kind === "jazz") {
      S2(0, 0, w, h, 1907274);
      for (let i = 0; i < 30; i++) p.set(rng.int(0, w - 1), rng.int(0, h - 1), 4868746, t);
      txt(6, 6, "JAZZ", 16767055, 2, 657962), txt(6, h - 14, "TONIGHT", 5231359);
      for (let i = 0; i < 14; i++)
        p.set(w - 22 + Math.floor(i * 0.6), 8 + i, 14721056, t), p.set(w - 21 + Math.floor(i * 0.6), 8 + i, 13142552, t);
      S2(w - 16, 20, 8, 5, 14721056), S2(w - 14, 22, 4, 2, 9067024);
    } else if (kind === "show") {
      S2(0, 0, w, h, 723723);
      for (let x = 2; x < w; x += 6)
        S2(x, 1, 2, 2, 16767055), S2(x, h - 3, 2, 2, 16767055);
      txt(8, 7, "BIG", 16732010, 2, 4849680), txt(8, h - 14, "APPLE SHOW", 16777215), disc(w - 18, h / 2, 9, 14164012), S2(w - 19, h / 2 - 12, 2, 4, 6965802), S2(w - 17, h / 2 - 12, 4, 2, 5811267);
    } else if (kind === "taxi") {
      S2(0, 0, w, h, 16764719);
      for (let x = 0; x < w; x += 8)
        S2(x, h - 6, 4, 3, 1776411), S2(x + 4, h - 3, 4, 3, 1776411);
      txt(6, 6, "RIDE", 1776411, 2), txt(6, h - 16, "CITY CAB", 1776411);
    } else if (kind === "sun") {
      S2(0, 0, w, h, 5228799), disc(w - 20, 14, 11, 16769658), disc(w - 22, 12, 6, 16773808), S2(0, h - 12, w, 12, 15915430);
      for (let x = 0; x < w; x += 5) p.set(x, h - 12, 15255690, t);
      txt(6, 6, "SPF 50", 16777215, 2, 1731226), txt(6, h - 10, "SUMMER", 14241615);
    } else
      S2(0, 0, w, h, 3115590), txt(6, 6, "GOTHAM", 16777215, 2, 932378), txt(6, h - 14, "GIN", 16767055), S2(w - 18, 8, 10, h - 14, 14215392), S2(w - 16, 4, 6, 5, 1776411), S2(w - 18, h / 2, 10, 6, 13119532);
    p.frame(0, 0, w, h, 15263976, t), p.frame(1, 1, w - 2, h - 2, 10132122, t);
  }

  // src/world/buildings.js
  var dirKey = (x, y) => x > 0.5 ? "px" : x < -0.5 ? "nx" : y > 0.5 ? "py" : "ny", Frame = class {
    constructor(px, py, nx, ny, z0 = 0.125) {
      this.px = px, this.py = py, this.nx = nx, this.ny = ny, this.ux = ny, this.uy = -nx, this.z0 = z0, this.keys = {
        front: dirKey(nx, ny),
        back: dirKey(-nx, -ny),
        left: dirKey(-this.ux, -this.uy),
        right: dirKey(this.ux, this.uy)
      };
    }
    pt(a, d) {
      return [this.px + a * this.ux - d * this.nx, this.py + a * this.uy - d * this.ny];
    }
    aabb(a0, a1, d0, d1) {
      let p = this.pt(a0, d0), q = this.pt(a1, d1);
      return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
    }
    box(mb, a0, a1, d0, d1, z0, z1, faces, opt) {
      let [x0, y0, x1, y1] = this.aabb(a0, a1, d0, d1), f = {};
      return faces.front && (f[this.keys.front] = faces.front), faces.back && (f[this.keys.back] = faces.back), faces.left && (f[this.keys.left] = faces.left), faces.right && (f[this.keys.right] = faces.right), faces.top && (f.pz = faces.top), mb.box(x0, y0, z0, x1, y1, z1, f, opt), [x0, y0, x1, y1];
    }
    // vertical quad parallel to the facade at depth d, spanning a0..a1, z0..z1 (texture reads from the street)
    facadeQuad(mb, a0, a1, d, z0, z1, tex, opt = {}) {
      let p = this.pt(a0, d), q = this.pt(a1, d);
      mb.vquad(p[0], p[1], q[0], q[1], z0, z1, tex, { ...opt, n: [this.nx, this.ny, 0] });
    }
    // vertical quad perpendicular to the facade at position a, from depth d0 to d1
    sideQuad(mb, a, d0, d1, z0, z1, tex, opt = {}) {
      let p = this.pt(a, d0), q = this.pt(a, d1);
      mb.vquad(p[0], p[1], q[0], q[1], z0, z1, tex, opt);
    }
    // world normal of the facade
    get n() {
      return [this.nx, this.ny];
    }
  };
  function markHeight(world, x0, y0, x1, y1, h) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(117, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(117, Math.ceil(x1)); x++) {
        let i = y * 117 + x;
        world.heights[i] < h && (world.heights[i] = h);
      }
  }
  function region(C, w, h, paint) {
    let r = C.atlas.alloc(w, h);
    return paint(r.p, r), r;
  }
  function sharedTex(C) {
    if (C._shared) return C._shared;
    let A = C.atlas, S2 = {}, brickTile = (name, pal, seed) => A.shared(name, 128, 96, (p) => brickFill(p, 0, 0, 128, 96, pal, seed));
    return S2.brickRed = brickTile("b_red", PAL.brickRed, 3), S2.brickBrown = brickTile("b_brown", PAL.brickBrown, 4), S2.brickOrange = brickTile("b_orange", PAL.brickOrange, 5), S2.brickTan = brickTile("b_tan", PAL.brickTan, 6), S2.brickPurple = brickTile("b_purple", PAL.brickPurple, 8), S2.brownstone = A.shared("s_brown", 128, 96, (p) => stoneFill(p, 0, 0, 128, 96, PAL.brownstone, 9, 12)), S2.limestone = A.shared("s_lime", 128, 128, (p) => stoneFill(p, 0, 0, 128, 128, PAL.limestone, 10, 16, { blocks: 32 })), S2.greystone = A.shared("s_grey", 128, 128, (p) => stoneFill(p, 0, 0, 128, 128, PAL.greystone, 11, 16, { blocks: 32 })), S2.concrete = A.shared("concrete", 128, 128, (p) => {
      smoothFill(p, 0, 0, 128, 128, 12170926, 12, 0.05);
      for (let i = 0; i < 40; i++) p.set(i * 37 % 128, i * 59 % 128, 10131343);
    }), S2.darkMetal = A.shared("darkmetal", 32, 32, (p) => smoothFill(p, 0, 0, 32, 32, 2763568, 13, 0.06)), S2.metal = A.shared("metal", 32, 32, (p) => {
      smoothFill(p, 0, 0, 32, 32, 9277591, 14, 0.05);
      for (let x = 0; x < 32; x += 8) p.vline(x, 0, 32, 10461864);
    }), S2.blackIron = A.shared("iron", 16, 16, (p) => {
      p.rect(0, 0, 16, 16, 1973794), p.vline(0, 0, 16, 3816e3);
    }), S2.roofSilver = A.shared("r_silver", 128, 128, (p) => roofFill(p, 128, 128, "silver", C.rng)), S2.roofTar = A.shared("r_tar", 128, 128, (p) => roofFill(p, 128, 128, "tar", C.rng)), S2.roofGravel = A.shared("r_gravel", 128, 128, (p) => roofFill(p, 128, 128, "gravel", C.rng)), S2.roofDeck = A.shared("r_deck", 128, 128, (p) => roofFill(p, 128, 128, "deck", C.rng)), S2.roofGreen = A.shared("r_green", 128, 128, (p) => roofFill(p, 128, 128, "green", C.rng)), S2.railing = A.shared("railing", 96, 18, (p) => railingTex(p, 96, 18, 1973794, 4)), S2.railingTall = A.shared("railing_t", 96, 24, (p) => railingTex(p, 96, 24, 1973794, 5)), S2.fescRail = A.shared("fesc_rail", 96, 20, (p) => {
      p.clear(), p.rect(0, 0, 96, 2, 1710622), p.hline(0, 0, 96, 4868690), p.rect(0, 9, 96, 1, 1710622);
      for (let x = 0; x < 96; x += 3) p.rect(x, 0, 1, 20, 1710622);
      for (let x = 0; x < 96; x += 24)
        p.rect(x, 0, 2, 20, 2500140);
    }), S2.ladder = A.shared("ladder", 12, 24, (p) => ladderTex(p, 12, 24)), S2.fstair = A.shared("fstair", 64, 8, (p) => {
      p.clear(), p.rect(0, 0, 64, 2, 1710622), p.hline(0, 0, 64, 4473932), p.rect(0, 6, 64, 2, 1710622);
      for (let x = 0; x < 64; x += 3) p.rect(x, 2, 2, 4, 2763312);
    }), S2.stairs = A.shared("fesc_stairs", 20, 64, (p) => {
      p.clear(), p.rect(0, 0, 2, 64, 1710622), p.rect(18, 0, 2, 64, 1710622);
      for (let y = 1; y < 64; y += 4) p.rect(0, y, 20, 2, 2500139);
    }), S2.grate = A.shared("grate", 32, 32, (p) => {
      p.clear();
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++)
        (x % 4 === 0 || y % 4 === 0) && p.set(x, y, x % 4 === 0 && y % 4 === 0 ? 2763312 : 1710622);
    }), S2.hvac = A.shared("hvac", 32, 16, (p) => {
      grilleTex(p, 32, 16, 11119526), p.rect(24, 3, 6, 4, 6974576), p.hline(25, 4, 4, 14211284), p.hline(0, 15, 32, 6974568);
    }), S2.hvacTop = A.shared("hvac_top", 32, 24, (p) => {
      smoothFill(p, 0, 0, 32, 24, 11843249, 15, 0.04), p.frame(0, 0, 32, 24, 9079944);
      let cx = 16, cy = 12;
      p.ellipse(cx, cy, 9.5, 9.5, 3026740), p.ellipse(cx, cy, 8, 8, 4868945);
      for (let a = 0; a < 4; a++) {
        let ang = a / 4 * Math.PI * 2 + 0.4;
        for (let r = 2; r < 8; r++) p.set(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 2763568);
      }
      for (let r = 0; r < 3; r++) p.ring(cx, cy, 9 - r * 3, 9 - r * 3, 0.6, 6185062);
      p.ellipse(cx, cy, 1.5, 1.5, 9079952);
    }), S2.tank = A.shared("tank", 128, 64, (p) => plankTex(p, 128, 64, 9071176)), S2.tankDark = A.shared("tank2", 128, 64, (p) => plankTex(p, 128, 64, 6967352)), S2.tankRoof = A.shared("tank_roof", 128, 64, (p) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) p.set(x, y, shade(x % 8 === 0 ? 4079686 : 4869202, 0.9 + hash2i(x, y, 3) * 0.15));
    }), S2.wood = A.shared("wood", 64, 32, (p) => plankTex(p, 64, 32, 10119748, !1)), S2.fenceWood = A.shared("fence_w", 64, 32, (p) => {
      plankTex(p, 64, 32, 9068092, !1);
      for (let x = 0; x < 64; x += 8)
        p.set(x, 0, 0, 0), p.set(x + 1, 0, 0, 0), p.set(x, 1, 0, 0);
      p.hline(0, 8, 64, 6965804), p.hline(0, 24, 64, 6965804);
    }), S2.chimney = A.shared("chimney", 32, 32, (p) => {
      brickFill(p, 0, 0, 32, 32, PAL.brickRed, 19), p.rect(0, 0, 32, 3, 10132120), p.hline(0, 3, 32, 6974056);
    }), S2.chimneyTop = A.shared("chimney_top", 12, 12, (p) => {
      p.rect(0, 0, 12, 12, 9079432), p.rect(2, 2, 8, 8, 2763308), p.rect(4, 4, 4, 4, 1118484);
    }), S2.skylight = A.shared("skylight", 24, 24, (p) => {
      p.rect(0, 0, 24, 24, 10132899);
      for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) p.set(x, y, (x + y) % 12 < 3 ? 10274013 : 4943759);
      p.vline(12, 2, 20, 10132899), p.hline(2, 12, 20, 10132899), p.frame(0, 0, 24, 24, 8027523);
    }), S2.glassBlue = A.shared("glass_b", 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, (x + y) % 18 < 3 ? 9221332 : 4023173, winCode(0.5));
    }), S2.stoneStep = A.shared("step", 64, 8, (p) => {
      stoneFill(p, 0, 0, 64, 8, PAL.brownstone, 21, 0), p.rect(0, 0, 64, 2, shade(PAL.brownstone[0], 1.22)), p.hline(0, 2, 64, shade(PAL.brownstone[0], 1.08)), p.hline(0, 7, 64, shade(PAL.brownstone[0], 0.72));
    }), S2.stoneStepTop = A.shared("step_top", 64, 64, (p) => stoneFill(p, 0, 0, 64, 64, [9396816], 22, 0)), S2.limeStep = A.shared("lstep", 64, 8, (p) => {
      stoneFill(p, 0, 0, 64, 8, PAL.limestone, 23, 0), p.rect(0, 0, 64, 2, 15787728), p.hline(0, 7, 64, 12102544);
    }), S2.limeTop = A.shared("ltop", 64, 64, (p) => stoneFill(p, 0, 0, 64, 64, [14866106], 24, 0)), S2.acUnit = A.shared("ac", 16, 12, (p) => {
      p.rect(0, 0, 16, 12, 14999764);
      for (let y = 2; y < 10; y += 2) p.rect(2, y, 8, 1, 11052186);
      p.rect(11, 3, 3, 3, 9078396), p.set(12, 4, 4898922), p.frame(0, 0, 16, 12, 12104872), p.hline(0, 11, 16, 10131084);
    }), S2.acTop = A.shared("ac_top", 16, 16, (p) => {
      p.rect(0, 0, 16, 16, 13947076), p.frame(0, 0, 16, 16, 12368044);
    }), S2.flowerBox = A.shared("fbox", 32, 8, (p) => {
      p.rect(0, 2, 32, 6, 7031346), p.hline(0, 2, 32, 9069124);
      for (let x = 0; x < 32; x++)
        p.set(x, 0, [15223391, 15909424, 5811267, 15044533, 5811267, 4164149][x * 7 % 6]), p.set(x, 1, [5811267, 4164149, 15223391, 5811267][x * 5 % 4]);
    }), S2.flowerTop = A.shared("ftop", 32, 16, (p) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) p.set(x, y, [5811267, 4164149, 15223391, 15909424, 5811267, 15044533, 7127120][Math.floor(hash2i(x >> 1, y >> 1, 4) * 7)]);
    }), S2.xmasLights = A.shared("xmas", 64, 6, (p) => {
      p.clear();
      let cols = [16724032, 4259680, 4227327, 16764992, 16736480];
      for (let x = 0; x < 64; x++) p.set(x, 1 + Math.round(Math.sin(x / 64 * Math.PI * 4) * 1), 1976862, 255);
      for (let x = 2; x < 64; x += 6) {
        let c = cols[x / 6 % 5 | 0];
        p.rect(x, 3, 2, 2, c, winCode(0.01, !0)), p.set(x, 5, shade(c, 0.7), winCode(0.01, !0));
      }
    }), S2.lightsWarm = A.shared("warmlights", 64, 6, (p) => {
      p.clear();
      for (let x = 0; x < 64; x++) p.set(x, Math.round(Math.sin(x / 64 * Math.PI) * 2), 2763306, 255);
      for (let x = 3; x < 64; x += 8)
        p.rect(x, 2, 2, 3, 16767120, winCode(0.01, !0));
    }), S2.wreath = A.shared("wreath", 16, 16, (p) => {
      p.clear(), p.ring(8, 8, 7.5, 7.5, 3, 3111482);
      for (let a = 0; a < 12; a++) {
        let ang = a / 12 * Math.PI * 2;
        p.set(Math.round(8 + Math.cos(ang) * 6), Math.round(8 + Math.sin(ang) * 6), a % 3 ? 4168266 : 14168108);
      }
      p.rect(6, 13, 4, 3, 14168108), p.set(5, 15, 14168108), p.set(10, 15, 14168108);
    }), S2.pumpkin = A.shared("pumpkin", 10, 8, (p) => {
      p.clear(), p.ellipse(5, 5, 4.9, 3.2, 15235610), p.ellipse(5, 5, 3, 2.8, 15764002), p.vline(3, 3, 4, 13658128), p.vline(7, 3, 4, 13658128), p.rect(4, 0, 2, 2, 4164149);
      let g = winCode(0.01, !0);
      p.set(3, 4, 16764992, g), p.set(6, 4, 16764992, g), p.hline(3, 6, 4, 16764992, g);
    }), S2.pumpkinTop = A.shared("pumpkin_t", 10, 7, (p) => {
      p.ellipse(5, 3.5, 4.8, 3.4, 15764002), p.rect(4, 3, 2, 2, 4164149);
    }), S2.trashCan = A.shared("trash", 24, 20, (p) => {
      for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) p.set(x, y, x % 6 === 0 ? 4083776 : x % 6 === 1 ? 6982254 : 5664858);
      p.rect(0, 0, 24, 2, 8033406), p.hline(0, 9, 24, 4083776);
    }), S2.trashTop = A.shared("trash_t", 12, 12, (p) => {
      p.rect(0, 0, 12, 12, 4874316), p.ellipse(6, 6, 2.5, 2.5, 2767404), p.frame(0, 0, 12, 12, 6982254), p.hline(3, 2, 6, 8033406);
    }), C._shared = S2, S2;
  }
  function rowhouse(C, fr, a0, W, D, o = {}) {
    let { mb, rng } = C, S2 = sharedTex(C), sb = o.setback ?? 1.5, nF = o.floors ?? 3, gardenH = 1.25, floorH = 1.5, band2 = 0.5, H = gardenH + nF * floorH + band2, z0 = fr.z0, tw = Math.round(W * 32), th = Math.round(H * 32), style = o.style ?? rng.pick(["brownstone", "brownstone", "brick", "limestone", "painted", "brick"]), wallPal = style === "brownstone" ? PAL.brownstone : style === "limestone" ? PAL.limestone : style === "painted" ? [rng.pick([15260864, 11060436, 11064504, 14854304, 14207200, 15784080])] : rng.pick([PAL.brickRed, PAL.brickBrown, PAL.brickOrange, PAL.brickPurple]), trim = style === "brownstone" ? shade(PAL.brownstone[0], 1.18) : style === "limestone" ? 15787724 : 14866106, frame = style === "limestone" ? rng.pick([2829104, 3099194, 6044458]) : rng.pick(PAL.frames), corniceC = rng.pick([3811874, 2829104, 3099194, 6965818, 15262416, 5906207]), doorSide = o.doorSide ?? (rng.chance(0.5) ? "L" : "R"), nb = Math.max(2, Math.floor(tw / 32)), bayW = tw / nb, doorBay = doorSide === "L" ? 0 : nb - 1, windows = [], floorT = [];
    for (let f = 0; f < nF + 1; f++) floorT.push(rng.next());
    let curtainC = rng.pick(PAL.curtains), front = region(C, tw, th, (p) => {
      style === "brownstone" ? stoneFill(p, 0, 0, tw, th, wallPal, rng.int(1, 999), 12) : style === "limestone" ? stoneFill(p, 0, 0, tw, th, wallPal, rng.int(1, 999), 16, { blocks: 32 }) : style === "painted" ? smoothFill(p, 0, 0, tw, th, wallPal[0], 3, 0.04) : brickFill(p, 0, 0, tw, th, wallPal, rng.int(1, 999));
      let gy = Math.round((band2 + nF * floorH) * 32);
      rustication(p, 0, gy, tw, th - gy, style === "brick" ? PAL.brownstone[0] : shade(wallPal[0], 0.92), 6), corniceBand(p, 0, 0, tw, 16, shade(corniceC, 1)), p.rect(0, gy - 3, tw, 3, trim), p.hline(0, gy - 3, tw, shade(trim, 1.12)), p.hline(0, gy - 1, tw, shade(trim, 0.7));
      let wallC = wallPal[0];
      for (let f = 0; f < nF; f++) {
        let fy = Math.round((band2 + f * floorH) * 32), parlor = f === nF - 1, wh = parlor ? 34 : 27, wy = fy + (parlor ? 8 : 12);
        for (let b = 0; b < nb; b++) {
          let cx = Math.round(bayW * b + bayW / 2);
          if (parlor && b === doorBay) {
            let dx = cx - 9, dy = fy + 48 - 40;
            p.rect(dx - 5, dy - 7, 28, 5, trim), p.hline(dx - 5, dy - 7, 28, shade(trim, 1.15)), p.hline(dx - 5, dy - 3, 28, shade(trim, 0.7)), p.rect(dx - 4, dy - 2, 3, 4, shade(trim, 0.9)), p.rect(dx + 18 + 1, dy - 2, 3, 4, shade(trim, 0.9)), p.rect(dx - 2, dy, 2, 40, shade(trim, 0.92)), p.rect(dx + 18, dy, 2, 40, shade(trim, 0.85)), drawDoor(p, dx, dy, 18, 40, { color: rng.pick([6044458, 2829104, 8003359, 3099194, 2046559, 9067050]), t: floorT[f] * 0.5, number: o.number, glass: rng.chance(0.3) }), windows.push({ x: dx, y: dy, w: 18, h: 40, f, door: !0 });
            continue;
          }
          let ww = 16, wx = cx - 8, t = floorT[f] * 0.6 + rng.next() * 0.4, det = rng.next();
          drawWindow(p, wx, wy, ww, wh, {
            frame,
            lintel: trim,
            sill: trim,
            t,
            keystone: style !== "painted" && rng.chance(0.4),
            wall: wallC,
            panes: rng.chance(0.3) ? "6/6" : "2/2",
            curtain: det < 0.35 ? curtainC : null,
            blinds: det >= 0.35 && det < 0.55,
            plant: det > 0.9 ? "flower" : det > 0.85,
            cat: det > 0.975 ? rng.pick([1973790, 14715450, 15921126]) : null
          }, rng), windows.push({ x: wx, y: wy, w: ww, h: wh, f });
        }
      }
      let gH = th - gy;
      for (let b = 0; b < nb; b++) {
        let cx = Math.round(bayW * b + bayW / 2);
        if (b === doorBay) {
          p.rect(cx - 8, gy + 12, 16, gH - 12, 1973794), p.rect(cx - 6, gy + 14, 12, gH - 14, 3811874);
          for (let x = cx - 6; x < cx + 6; x += 3) p.vline(x, gy + 14, gH - 14, 1973794);
          p.hline(cx - 6, gy + 20, 12, 1973794);
          continue;
        }
        let wx = cx - 8, wy = gy + 10;
        drawWindow(p, wx, wy, 16, 20, { frame: 2829104, t: rng.next(), rail: !1, wall: wallC }, rng);
        for (let x = wx + 1; x < wx + 16; x += 3) p.vline(x, wy - 2, 24, 1447448);
        p.hline(wx, wy + 6, 16, 1447448), p.hline(wx, wy + 14, 16, 1447448);
      }
    }), back = region(C, tw, th, (p) => {
      brickFill(p, 0, 0, tw, th, style === "brick" ? wallPal : PAL.brickRed, rng.int(1, 999)), p.rect(0, 0, tw, 4, 9079432), p.hline(0, 4, tw, 5921368);
      for (let f = 0; f < nF + 1; f++) {
        let fy = Math.round((band2 + f * floorH) * 32), n = Math.max(2, nb);
        for (let b = 0; b < n; b++) {
          if (f === nF && b === 0) {
            drawDoor(p, Math.round(bayW / 2) - 8, fy + 8, 16, 32, { color: 6044458, transom: !1 });
            continue;
          }
          let cx = Math.round(tw / n * b + tw / n / 2);
          drawWindow(p, cx - 8, fy + 12, 16, 24, { frame: 15921126, sill: 10132120, t: rng.next(), curtain: rng.chance(0.25) ? rng.pick(PAL.curtains) : null, blinds: rng.chance(0.2) }, rng);
        }
      }
    }), sideTex = style === "brownstone" ? S2.brownstone : style === "limestone" ? S2.limestone : S2.brickRed, top = rng.pick([S2.roofSilver, S2.roofTar, S2.roofSilver, S2.roofGravel]), side = { t: o.sideTex ?? sideTex }, aabb = fr.box(mb, a0, a0 + W, sb, sb + D, z0, z0 + H, {
      front,
      back,
      left: o.leftTex ?? side,
      right: o.rightTex ?? side,
      top: { t: top, world: !0 }
    });
    markHeight(C.world, ...aabb, z0 + H);
    let corn = C.atlas.shared("cornice_" + corniceC, 64, 14, (p) => {
      corniceBand(p, 0, 0, 64, 14, corniceC);
    }), cornTop = C.atlas.shared("cornice_top_" + corniceC, 32, 32, (p) => {
      smoothFill(p, 0, 0, 32, 32, shade(corniceC, 1.1), 3, 0.05), p.hline(0, 0, 32, shade(corniceC, 1.25));
    });
    fr.box(
      mb,
      a0 - 0.0625,
      a0 + W + 0.0625,
      sb - 0.25,
      sb + 0.01,
      z0 + H - 0.375,
      z0 + H + 0.0625,
      { front: corn, left: corn, right: corn, top: { t: cornTop, world: !0 } }
    );
    let pa = { t: S2.brickRed };
    fr.box(mb, a0, a0 + W, sb + D - 0.125, sb + D, z0 + H, z0 + H + 0.25, { back: pa, left: pa, right: pa, front: pa, top: { t: S2.concrete, world: !0 } });
    let doorA = a0 + (doorBay + 0.5) * (W / nb), sw = 1.25, sa0 = doorA - sw / 2, sa1 = doorA + sw / 2, stepTex = style === "limestone" ? S2.limeStep : S2.stoneStep, stepTop = style === "limestone" ? S2.limeTop : S2.stoneStepTop, sideStone = style === "limestone" ? S2.limestone : S2.brownstone;
    fr.box(mb, sa0, sa1, sb - 0.5, sb, z0, z0 + gardenH, { front: stepTex, left: sideStone, right: sideStone, top: { t: stepTop, world: !0 } });
    for (let i = 0; i < 4; i++) {
      let d1 = sb - 0.5 - 0.25 * i, d0p = sb - 0.5 - 0.25 * (i + 1);
      fr.box(mb, sa0, sa1, d0p, d1, z0, z0 + gardenH - 0.25 * (i + 1), { front: stepTex, left: sideStone, right: sideStone, top: { t: stepTop, world: !0 } });
    }
    for (let a of [sa0 + 0.03, sa1 - 0.03]) {
      let pb = fr.pt(a, 0.05), pt_ = fr.pt(a, sb - 0.5), zb = z0 + 0.25, zt = z0 + gardenH, hR = 0.56, len = Math.hypot(pt_[0] - pb[0], pt_[1] - pb[1]) * 32;
      mb.quad(
        [pb[0], pb[1], zb + hR + 0.15],
        [pt_[0], pt_[1], zt + hR],
        [pt_[0], pt_[1], zt],
        [pb[0], pb[1], zb],
        [[0, 0], [len, 0], [len, 18], [0, 18]],
        S2.railing,
        [fr.ux, fr.uy, 0],
        MAT.FLAT
      ), mb.quad(
        [pb[0], pb[1], zb + hR + 0.15],
        [pt_[0], pt_[1], zt + hR],
        [pt_[0], pt_[1], zt],
        [pb[0], pb[1], zb],
        [[0, 0], [len, 0], [len, 6], [0, 6]],
        S2.xmasLights,
        [fr.ux, fr.uy, 0],
        MAT.FLAT | MAT.NOSHADOW,
        GRP.XMAS
      ), fr.box(mb, a - 0.06, a + 0.06, 0, 0.12, z0, z0 + 0.25 + 0.75, { front: S2.blackIron, left: S2.blackIron, right: S2.blackIron, top: S2.blackIron });
    }
    let fenceH = 0.5;
    sa0 - a0 > 0.2 && fr.facadeQuad(mb, a0 + 0.05, sa0 - 0.05, 0.06, z0, z0 + fenceH, S2.railing), a0 + W - sa1 > 0.2 && fr.facadeQuad(mb, sa1 + 0.05, a0 + W - 0.05, 0.06, z0, z0 + fenceH, S2.railing);
    let canA = doorSide === "L" ? a0 + W - 0.55 : a0 + 0.3;
    if (rng.chance(0.7) && fr.box(mb, canA, canA + 0.375, 0.3, 0.675, z0, z0 + 0.625, { front: S2.trashCan, left: S2.trashCan, right: S2.trashCan, top: S2.trashTop }), C.ground) {
      let [gx0, gy0, gx1, gy1] = fr.aabb(doorSide === "L" ? sa1 + 0.1 : a0 + 0.1, doorSide === "L" ? a0 + W - 0.1 : sa0 - 0.1, 0.15, sb - 0.05);
      C.paintGround(gx0, gy0, gx1, gy1, rng.chance(0.6) ? "flowerbed" : "patio");
    }
    let zTop = z0 + H, toZ = (ty) => zTop - ty / 32, toA = (tx) => a0 + tx / 32;
    fr.facadeQuad(mb, a0, a0 + W, sb - 0.27, zTop - 0.56, zTop - 0.38, S2.xmasLights, { group: GRP.XMAS, mat: MAT.NOSHADOW | MAT.FLAT });
    for (let w of windows) {
      if (w.door) {
        fr.facadeQuad(mb, toA(w.x + 1), toA(w.x + 17), sb - 0.03, toZ(w.y + 30), toZ(w.y + 14), S2.wreath, { group: GRP.XMAS });
        continue;
      }
      let r = rng.next();
      if (w.f >= 0 && w.f < nF - 1 && r < 0.3) {
        let a = toA(w.x + 0), zb = toZ(w.y + w.h) + 0.0625;
        fr.box(mb, a, a + 0.5, sb - 0.3, sb, zb, zb + 0.375, { front: S2.acUnit, left: S2.acUnit, right: S2.acUnit, top: S2.acTop }, { group: GRP.WARM });
      } else if (w.f === nF - 1 && r < 0.55) {
        let a = toA(w.x - 2), zb = toZ(w.y + w.h) - 0.05;
        fr.box(mb, a, a + 0.625, sb - 0.2, sb, zb, zb + 0.25, { front: S2.flowerBox, left: S2.flowerBox, right: S2.flowerBox, top: S2.flowerTop }, { group: GRP.SUMMER_OR_SPRING });
      }
    }
    if (rng.chance(0.65))
      for (let i = 0; i < 3; i++) {
        if (rng.chance(0.4)) continue;
        let d = sb - 0.5 - 0.25 * i - 0.2, zt = z0 + gardenH - 0.25 * i, a = rng.chance(0.5) ? sa0 + 0.12 : sa1 - 0.42;
        fr.box(mb, a, a + 0.3125, d - 0.05, d + 0.17, zt, zt + 0.25, { front: S2.pumpkin, left: S2.pumpkin, right: S2.pumpkin, top: S2.pumpkinTop }, { group: GRP.AUTUMN });
      }
    let R2 = { a0, a1: a0 + W, d0: sb, d1: sb + D, z: zTop };
    rng.chance(0.75) && chimney(C, fr, a0 + rng.range(0.2, W - 0.7), sb + rng.range(D * 0.3, D - 0.8), zTop), rng.chance(0.5) && skylight(C, fr, a0 + rng.range(0.4, W - 1.2), sb + rng.range(1, D - 2), zTop), rng.chance(0.18) && roofDeck(C, fr, a0 + 0.3, a0 + W - 0.3, sb + D * 0.55, sb + D - 0.3, zTop), rng.chance(0.25) && C.addSprite("dish", ...fr.pt(a0 + rng.range(0.5, W - 0.5), sb + D - 0.6), zTop), o.flag && C.addFlag(fr, a0 + W * 0.5, sb - 0.1, z0 + gardenH + floorH * 1.6);
    let street = fr.pt(doorA, -0.7), stoopBottom = fr.pt(doorA, 0.1), doorPt = fr.pt(doorA, sb - 0.2);
    C.world.doors.push({ x: street[0], y: street[1], sx: stoopBottom[0], sy: stoopBottom[1], dx: doorPt[0], dy: doorPt[1], dz: z0 + gardenH, kind: "home", n: fr.n, stoop: !0 });
    for (let i = 0; i < 3; i++) {
      let d = sb - 0.5 - 0.25 * i - 0.12, p = fr.pt(doorA + (i % 2 ? 0.3 : -0.3), d);
      C.world.stoopSeats.push({ x: p[0], y: p[1], z: z0 + gardenH - 0.25 * i, n: fr.n });
    }
    return { H: zTop, R: R2 };
  }
  function walkup(C, fr, a0, W, D, o = {}) {
    let { mb, rng } = C, S2 = sharedTex(C), nF = o.floors ?? rng.int(4, 5), gH = 1.75, fH = 1.5, band2 = 0.75, H = gH + nF * fH + band2, z0 = fr.z0, tw = Math.round(W * 32), th = Math.round(H * 32), brickName = o.brick ?? rng.pick(["brickRed", "brickBrown", "brickOrange", "brickTan", "brickPurple", "brickRed"]), wallPal = { brickRed: PAL.brickRed, brickBrown: PAL.brickBrown, brickOrange: PAL.brickOrange, brickTan: PAL.brickTan, brickPurple: PAL.brickPurple }[brickName], trim = rng.pick([14866106, 14208434, 15787728, 12104356]), frame = rng.pick([15921126, 15921126, 2829104, 3099194, 8003359]), corniceC = rng.pick([2829104, 3811874, 3099194, 15262416, 6974056, 5906207]), nb = Math.max(2, Math.round(tw / 36)), bayW = tw / nb, shop = o.shop === void 0 ? rng.pick(["bodega", "pizza", "laundry", "coffee", "bar", "books", "flowers", "chinese", "nails", "hardware", "bagels", "diner"]) : o.shop, esc = o.fireEscape ?? (nb >= 3 && rng.chance(0.85)), escBays = esc ? (nb >= 4 ? [1, 2] : [0, 1]).map((b) => Math.min(b, nb - 1)) : [], windows = [], shopInfo = null, shopTW = shop ? o.resDoor === !1 ? tw : tw - 24 : 0, resDoorX = o.resDoorLeft ? 2 : tw - 22, floorT = [];
    for (let f = 0; f < nF; f++) floorT.push(rng.next());
    let paintFacade = (p, wide, withShop, sideMode) => {
      brickFill(p, 0, 0, wide, th, wallPal, rng.int(1, 999)), p.rect(0, 0, wide, 8, shade(corniceC, 0.9)), corniceBand(p, 0, 8, wide, 16, corniceC);
      let n = Math.max(2, Math.round(wide / 36)), bw = wide / n;
      for (let f = 0; f < nF; f++) {
        let fy = Math.round((band2 + f * fH) * 32);
        f === nF - 1 && (p.rect(0, fy + 45, wide, 3, trim), p.hline(0, fy + 45, wide, shade(trim, 1.12)), p.hline(0, fy + 47, wide, shade(trim, 0.7)));
        for (let b = 0; b < n; b++) {
          let cx = Math.round(bw * b + bw / 2), t = floorT[f] * 0.5 + rng.next() * 0.5, det = rng.next();
          drawWindow(p, cx - 8, fy + 12, 16, 28, {
            frame,
            lintel: trim,
            sill: trim,
            t,
            curtain: det < 0.3 ? rng.pick(PAL.curtains) : null,
            blinds: det > 0.3 && det < 0.5,
            plant: det > 0.92,
            cat: det > 0.985 ? 1973790 : null,
            keystone: rng.chance(0.2),
            wall: wallPal[0],
            panes: rng.chance(0.25) ? "1/1" : "2/2"
          }, rng), sideMode || windows.push({ x: cx - 8, y: fy + 12, w: 16, h: 28, f, b });
        }
      }
      let gy = Math.round((band2 + nF * fH) * 32), gh = th - gy;
      if (withShop && shop) {
        let sx = o.resDoorLeft ? 24 : 0;
        if (shopInfo = drawShopfront(p, sx, gy, shopTW, gh, shop, rng, { doorLeft: rng.chance(0.5) }), o.resDoor !== !1) {
          let rx = resDoorX;
          p.rect(rx - 2, gy, 24, gh, trim), p.hline(rx - 2, gy, 24, shade(trim, 1.15)), drawDoor(p, rx + 2, gy + 10, 18, gh - 10, { color: rng.pick([2829104, 6044458, 8003359]), glass: !0, number: o.number });
          for (let by of [gy + 6]) p.rect(rx + 4, by - 3, 14, 2, 13148240);
        }
      } else {
        p.rect(0, gy, wide, 3, trim);
        for (let b = 0; b < n; b++) {
          let cx = Math.round(bw * b + bw / 2);
          !sideMode && b === Math.floor(n / 2) ? (p.rect(cx - 12, gy + 3, 24, gh - 3, trim), drawDoor(p, cx - 9, gy + 14, 18, gh - 14, { color: 2829104, glass: !0, number: o.number })) : drawWindow(p, cx - 8, gy + 12, 16, 28, { frame, sill: trim, t: rng.next(), wall: wallPal[0] }, rng);
        }
      }
      if (sideMode && rng.chance(0.55)) {
        let txt = rng.pick(["ROOMS", "SODA 5C", "PIANOS", "COAL & ICE", "LOFTS", "GARAGE", "HATS", "BAKERY", "TAILOR", "FURS"]), sw = textWidth(txt, 2, !0) + 16;
        if (sw < wide - 8) {
          let sx = Math.floor((wide - sw) / 2), sy = 30, col = rng.pick([15921126, 15909424, 5939416]);
          for (let yy = 0; yy < 26; yy++) for (let xx = 0; xx < sw; xx++) p.blend(sx + xx, sy + yy, 2761760, 0.55);
          p.sub(sx, sy, sw, 26).text7(8, 6, txt, col, 255, 2);
          for (let yy = 0; yy < 26; yy++) for (let xx = 0; xx < sw; xx++) hash2i(xx + sx, yy + sy, 3) < 0.3 && p.blend(sx + xx, sy + yy, wallPal[0], 0.5);
        }
      }
    }, front = region(C, tw, th, (p) => paintFacade(p, tw, !0, !1)), sideW = Math.round(D * 32), sideFacade = o.cornerSide ? region(C, sideW, th, (p) => paintFacade(p, sideW, !1, !0)) : null, plainSide = { brickRed: S2.brickRed, brickBrown: S2.brickBrown, brickOrange: S2.brickOrange, brickTan: S2.brickTan, brickPurple: S2.brickPurple }[brickName], back = region(C, tw, th, (p) => {
      brickFill(p, 0, 0, tw, th, wallPal, rng.int(1, 999));
      for (let f = 0; f < nF + 1; f++) {
        let fy = Math.round((band2 + f * fH) * 32);
        for (let b = 0; b < nb; b++) {
          let cx = Math.round(bayW * b + bayW / 2);
          drawWindow(p, cx - 8, fy + 12, 16, 24, { frame: 15921126, sill: 10132120, t: rng.next() }, rng);
        }
      }
    }), top = rng.pick([S2.roofTar, S2.roofSilver, S2.roofGravel]), sides = {
      left: o.cornerSide === "L" ? sideFacade : plainSide,
      right: o.cornerSide === "R" ? sideFacade : plainSide
    }, aabb = fr.box(mb, a0, a0 + W, 0, D, z0, z0 + H, { front, back, ...sides, top: { t: top, world: !0 } });
    markHeight(C.world, ...aabb, z0 + H);
    let zTop = z0 + H, toZ = (ty) => zTop - ty / 32, toA = (tx) => a0 + tx / 32, corn = C.atlas.shared("wcornice_" + corniceC, 64, 22, (p) => {
      corniceBand(p, 0, 0, 64, 22, corniceC);
      for (let x = 2; x < 64; x += 16)
        p.rect(x, 5, 4, 14, shade(corniceC, 0.75)), p.rect(x, 17, 6, 2, shade(corniceC, 0.6)), p.vline(x, 5, 14, shade(corniceC, 1.15));
    }), cornTop = C.atlas.shared("cornice_top_" + corniceC, 32, 32, (p) => {
      smoothFill(p, 0, 0, 32, 32, shade(corniceC, 1.1), 3, 0.05), p.hline(0, 0, 32, shade(corniceC, 1.25));
    }), cornA0 = a0 - (o.cornerSide === "L" ? 0.3 : 0.0625), cornA1 = a0 + W + (o.cornerSide === "R" ? 0.3 : 0.0625);
    if (fr.box(mb, cornA0, cornA1, -0.3, 0.02, zTop - 0.625, zTop + 0.0625, { front: corn, left: corn, right: corn, top: { t: cornTop, world: !0 } }), o.cornerSide) {
      let a = o.cornerSide === "L" ? a0 - 0.3 : a0 + W;
      fr.box(mb, a, a + 0.3, 0, D, zTop - 0.625, zTop + 0.0625, { front: corn, left: corn, right: corn, back: corn, top: { t: cornTop, world: !0 } });
    }
    let pa = { t: plainSide };
    if (fr.box(mb, a0, a0 + W, D - 0.125, D, zTop, zTop + 0.375, { back: pa, front: pa, left: pa, right: pa, top: { t: S2.concrete, world: !0 } }), shop && shopInfo) {
      let sx0 = o.resDoorLeft ? 24 : 0, aA0 = toA(sx0 + 0.5), aA1 = toA(sx0 + shopTW - 0.5), zA = z0 + gH - 0.375, awnC = shopInfo.color, striped = rng.chance(0.4), awTex = C.atlas.shared(`awn_${awnC}_${striped}`, 64, 24, (p) => awningTex(p, 64, 24, awnC, striped, null, rng)), valW = Math.round((aA1 - aA0) * 32), valance = region(C, valW, 8, (p) => {
        awningTex(p, valW, 8, awnC, striped, null, rng);
        for (let x = 0; x < valW; x++) (x % 8 === 0 || x % 8 === 7) && (p.setA(x, 7, 0), p.setA(x, 6, x % 8 === 0 ? 0 : 255));
        p.hline(0, 0, valW, shade(awnC, 1.2)), shopInfo.name && textWidth(shopInfo.name, 1, !0) < valW - 8 && p.text7(Math.floor((valW - textWidth(shopInfo.name, 1, !0)) / 2), 0, shopInfo.name, striped ? 1776411 : 16777215);
      });
      if (rng.chance(0.8)) {
        let p0 = fr.pt(aA0, 0), p1 = fr.pt(aA1, 0), q0 = fr.pt(aA0, -1), q1 = fr.pt(aA1, -1);
        mb.slope([q0[0], q0[1], zA - 0.35], [q1[0], q1[1], zA - 0.35], [p0[0], p0[1], zA + 0.1], [p1[0], p1[1], zA + 0.1], awTex, { mat: MAT.SNOW | MAT.WET }), fr.facadeQuad(mb, aA0, aA1, -1, zA - 0.6, zA - 0.35, valance);
      }
      let gate = region(C, Math.round(shopTW), Math.round((gH - 0.4) * 32), (p) => drawGate(p, Math.round(shopTW), Math.round((gH - 0.4) * 32), rng));
      fr.facadeQuad(mb, toA(sx0), toA(sx0 + shopTW), -0.03, z0, z0 + gH - 0.4, gate, { group: GRP.NIGHT, mat: 0 }), C.world.shops.push({ kind: shop, name: shopInfo.name, ...ptObj(fr.pt(toA(sx0 + shopTW / 2), -0.8)), dx: fr.pt(toA(sx0 + shopTW / 2), 0.3)[0], dy: fr.pt(toA(sx0 + shopTW / 2), 0.3)[1], n: fr.n });
      let lp = fr.pt(toA(sx0 + shopTW / 2), -0.9);
      C.world.lamps.push({ x: lp[0], y: lp[1], z: 0.5, r: 2.2, color: [1, 0.85, 0.6], k: 0.55, kind: "shop", group: GRP.DAY }), rng.chance(0.45) && bladeSign(C, fr, toA(sx0 + 4), zA + 0.2, shopInfo.name, rng);
    }
    if (esc) {
      let ex0 = toA(Math.round(bayW * escBays[0] + bayW / 2) - 18), ex1 = toA(Math.round(bayW * escBays[escBays.length - 1] + bayW / 2) + 18);
      fireEscape(C, fr, ex0, ex1, 0, z0 + gH, fH, nF);
    }
    for (let w of windows)
      if (!escBays.includes(w.b) && rng.chance(0.32)) {
        let a = toA(w.x), zb = toZ(w.y + w.h) + 0.0625;
        fr.box(mb, a, a + 0.5, -0.3, 0, zb, zb + 0.375, { front: S2.acUnit, left: S2.acUnit, right: S2.acUnit, top: S2.acTop }, { group: GRP.WARM });
      }
    rng.chance(0.5) && fr.facadeQuad(mb, a0, a0 + W, -0.32, zTop - 0.85, zTop - 0.66, S2.xmasLights, { group: GRP.XMAS, mat: MAT.NOSHADOW | MAT.FLAT });
    let roof = { a0, a1: a0 + W, d0: 0, d1: D, z: zTop };
    roofClutter(C, fr, roof, { waterTower: o.waterTower ?? rng.chance(0.45), billboard: o.billboard });
    let rdA = o.resDoorLeft ? toA(12) : toA(resDoorX + 10), st = fr.pt(shop ? rdA : a0 + W / 2, -0.7), dp = fr.pt(shop ? rdA : a0 + W / 2, 0.2);
    return C.world.doors.push({ x: st[0], y: st[1], sx: st[0], sy: st[1], dx: dp[0], dy: dp[1], dz: z0, kind: "home", n: fr.n }), { H: zTop };
  }
  function ptObj(p) {
    return { x: p[0], y: p[1] };
  }
  function bladeSign(C, fr, a, z, text, rng) {
    let word = text.split(" ")[0].slice(0, 7), hh = word.length * 10 + 8, bg = rng.pick([1776411, 13119532, 2051994, 3099194]), fg = rng.pick([16732010, 5231359, 16767055, 16777215]), tex = region(C, 24, hh, (p2) => {
      p2.rect(0, 0, 24, hh, bg), p2.frame(0, 0, 24, hh, shade(bg, 1.6)), p2.frame(2, 2, 20, hh - 4, fg, winCode(0.02, !0));
      for (let i = 0; i < word.length; i++) p2.text7(10, 5 + i * 10, word[i], fg, winCode(0.02, !0));
    }), H = hh / 32;
    fr.sideQuad(C.mb, a, -0.2, -0.95, z, z + H, tex, { mat: MAT.NOSHADOW }), fr.sideQuad(C.mb, a + 0.01, -0.95, -0.2, z, z + H, tex, { mat: MAT.NOSHADOW });
    let p = fr.pt(a, -0.6);
    C.world.lamps.push({ x: p[0], y: p[1], z, r: 1.4, color: [0.9, 0.5, 0.6], k: 0.3, kind: "neon" });
  }
  function fireEscape(C, fr, ea0, ea1, dFace, zFirst, fH, nF) {
    let { mb } = C, S2 = sharedTex(C), depth = 0.6, iron = { t: S2.darkMetal };
    for (let f = 0; f < nF; f++) {
      let zf = zFirst + f * fH;
      if (fr.box(mb, ea0, ea1, dFace - depth, dFace, zf - 0.06, zf, { front: iron, left: iron, right: iron, top: { t: S2.grate } }, { topMat: MAT.SNOW }), fr.facadeQuad(mb, ea0, ea1, dFace - depth + 0.02, zf, zf + 0.62, S2.fescRail), fr.sideQuad(mb, ea0 + 0.02, dFace - depth, dFace, zf, zf + 0.62, S2.fescRail), fr.sideQuad(mb, ea1 - 0.02, dFace, dFace - depth, zf, zf + 0.62, S2.fescRail), f < nF - 1) {
        let goingRight = f % 2 === 0, sa0 = goingRight ? ea0 + 0.25 : ea1 - 0.25, sa1 = goingRight ? ea1 - 0.55 : ea0 + 0.55, d = dFace - depth * 0.4, p0 = fr.pt(sa0, d), p1 = fr.pt(sa1, d), len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), sl = Math.hypot(len, fH) * 32, th = 0.25;
        mb.quad(
          [p0[0], p0[1], zf + th],
          [p1[0], p1[1], zf + fH + th - 0.06],
          [p1[0], p1[1], zf + fH - 0.06],
          [p0[0], p0[1], zf],
          [[0, 0], [sl, 0], [sl, 8], [0, 8]],
          S2.fstair,
          [fr.nx, fr.ny, 0],
          MAT.FLAT
        );
      }
    }
    let la = (ea0 + ea1) / 2 + 0.3;
    fr.facadeQuad(mb, la, la + 0.35, dFace - depth + 0.05, zFirst - 1, zFirst, S2.ladder);
  }
  function roofClutter(C, fr, roof, o = {}) {
    let { rng } = C, W = roof.a1 - roof.a0, D = roof.d1 - roof.d0, z = roof.z;
    if (W > 3 && rng.chance(0.85)) {
      let ba = roof.a0 + rng.range(0.3, W - 1.5 - 0.3), bdd = roof.d0 + rng.range(D * 0.3, D - 1.75 - 0.3);
      bulkhead(C, fr, ba, ba + 1.5, bdd, bdd + 1.75, z, 1.25);
    }
    if (o.waterTower) {
      let a = roof.a0 + rng.range(1.2, W - 1.2), d = roof.d0 + rng.range(1.5, D - 1.5);
      waterTower(C, ...fr.pt(a, d), z, rng.range(0.8, 1.05));
    }
    let nH = rng.int(0, 2);
    for (let i = 0; i < nH; i++) {
      let a = roof.a0 + rng.range(0.3, W - 1.3), d = roof.d0 + rng.range(0.6, D - 1);
      hvac(C, fr, a, d, z);
    }
    rng.chance(0.6) && chimney(C, fr, roof.a0 + rng.range(0.2, W - 0.6), roof.d0 + rng.range(0.4, D - 0.6), z), rng.chance(0.3) && C.addSprite("antenna", ...fr.pt(roof.a0 + rng.range(0.5, W - 0.5), roof.d0 + rng.range(0.5, D - 0.5)), z), rng.chance(0.35) && C.addSprite("dish", ...fr.pt(roof.a0 + rng.range(0.5, W - 0.5), roof.d0 + rng.range(0.5, D - 0.5)), z), o.billboard && billboard(C, fr, roof.a0 + 0.3, roof.a0 + Math.min(W - 0.3, 5.3), roof.d0 + 0.6, z, o.billboard), (o.garden || rng.chance(0.12)) && roofGarden(C, fr, roof.a0 + 0.4, roof.a1 - 0.4, roof.d0 + 0.4, roof.d0 + Math.min(D * 0.5, 3), z), rng.chance(0.08) && C.world.pigeonCoops.push({ ...ptObj(fr.pt(roof.a0 + W / 2, roof.d0 + D / 2)), z });
  }
  function bulkhead(C, fr, a0, a1, d0, d1, z, h) {
    let S2 = sharedTex(C), tex = C.atlas.shared("bulk", 64, 40, (p) => {
      brickFill(p, 0, 0, 64, 40, PAL.brickBrown, 31), p.rect(0, 0, 64, 4, 9079432), p.hline(0, 4, 64, 5921368);
    }), doorT = C.atlas.shared("bulk_door", 48, 40, (p) => {
      brickFill(p, 0, 0, 48, 40, PAL.brickBrown, 31), p.rect(0, 0, 48, 4, 9079432), p.hline(0, 4, 48, 5921368), p.rect(16, 12, 16, 28, 5922147), p.frame(16, 12, 16, 28, 3816771);
      for (let y = 16; y < 38; y += 4) p.hline(18, y, 12, 6974835);
      p.rect(28, 26, 2, 2, 13158596);
    });
    fr.box(C.mb, a0, a1, d0, d1, z, z + h, { front: doorT, back: tex, left: tex, right: tex, top: { t: S2.roofTar, world: !0 } }), markHeight(C.world, ...fr.aabb(a0, a1, d0, d1), z + h);
  }
  function waterTower(C, x, y, z, r = 0.95) {
    let S2 = sharedTex(C), { mb, rng } = C, legH = 1.25, tankH = 1.9, iron = S2.darkMetal;
    for (let [dx, dy] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]])
      mb.solid(x + dx * r - 0.06, y + dy * r - 0.06, z, x + dx * r + 0.06, y + dy * r + 0.06, z + legH, iron, iron);
    mb.solid(x - r, y - 0.03, z + legH * 0.45, x + r, y + 0.03, z + legH * 0.45 + 0.06, iron, iron), mb.solid(x - 0.03, y - r, z + legH * 0.45, x + 0.03, y + r, z + legH * 0.45 + 0.06, iron, iron), mb.solid(x - r * 1.05, y - r * 1.05, z + legH - 0.08, x + r * 1.05, y + r * 1.05, z + legH, iron, S2.grate);
    let tankTex = rng.next() < 0.12 ? flagTank(C) : rng.chance(0.5) ? S2.tank : S2.tankDark;
    mb.cylinder(x, y, z + legH, z + legH + tankH, r, 12, tankTex, null), mb.cone(x, y, z + legH + tankH, z + legH + tankH + 0.85, r * 1.08, 12, S2.tankRoof), mb.solid(x - 0.04, y - 0.04, z + legH + tankH + 0.8, x + 0.04, y + 0.04, z + legH + tankH + 1.05, iron, iron), mb.vquad(x - 0.1875, y + r + 0.02, x + 0.1875, y + r + 0.02, z, z + legH + tankH, S2.ladder), markHeight(C.world, x - r, y - r, x + r, y + r, z + legH + tankH + 0.9), C.world.perches.push({ x, y, z: z + legH + tankH + 0.85 });
  }
  function flagTank(C) {
    return C.atlas.shared("tank_flag", 128, 61, (p) => {
      for (let y = 0; y < 61; y++) for (let x = 0; x < 128; x++) {
        let c = Math.floor(y / 5) % 2 ? 15921126 : 13119532;
        x % 4 === 3 && (c = shade(c, 0.88)), p.set(x, y, c);
      }
      p.rect(0, 0, 52, 30, 2046586);
      for (let y = 3; y < 28; y += 5) for (let x = 3; x < 50; x += 8) {
        let sx = x + Math.floor(y / 5) % 2 * 4;
        p.set(sx, y, 16777215), p.set(sx - 1, y + 1, 16777215), p.set(sx + 1, y + 1, 16777215), p.set(sx, y + 2, 16777215);
      }
      for (let x = 1; x < 128; x += 2) p.set(x, 60, 3815998);
    });
  }
  function hvac(C, fr, a, d, z) {
    let S2 = sharedTex(C);
    fr.box(C.mb, a, a + 1, d, d + 0.75, z, z + 0.5, { front: S2.hvac, back: S2.hvac, left: S2.hvac, right: S2.hvac, top: { t: S2.hvacTop } }), C.world.steam.push({ ...ptObj(fr.pt(a + 0.3, d + 0.37)), z: z + 0.55, kind: "roof", rate: 0.25 });
  }
  function chimney(C, fr, a, d, z) {
    let S2 = sharedTex(C);
    fr.box(C.mb, a, a + 0.375, d, d + 0.375, z, z + 0.75, { front: S2.chimney, back: S2.chimney, left: S2.chimney, right: S2.chimney, top: { t: S2.chimneyTop } }), C.world.steam.push({ ...ptObj(fr.pt(a + 0.19, d + 0.19)), z: z + 0.8, kind: "chimney", rate: 0.15 });
  }
  function skylight(C, fr, a, d, z) {
    let S2 = sharedTex(C);
    fr.box(C.mb, a, a + 0.75, d, d + 0.75, z, z + 0.25, { front: S2.metal, back: S2.metal, left: S2.metal, right: S2.metal, top: { t: S2.skylight } });
  }
  function roofDeck(C, fr, a0, a1, d0, d1, z) {
    let S2 = sharedTex(C);
    fr.box(C.mb, a0, a1, d0, d1, z, z + 0.06, { front: S2.wood, back: S2.wood, left: S2.wood, right: S2.wood, top: { t: S2.roofDeck, world: !0 } });
    let p = fr.pt((a0 + a1) / 2, (d0 + d1) / 2);
    C.addSprite("deckchair", p[0], p[1], z + 0.06), C.addSprite("planter", ...fr.pt(a0 + 0.2, d0 + 0.2), z + 0.06), fr.facadeQuad(C.mb, a0, a1, d0 + 0.02, z + 0.9, z + 1.1, S2.lightsWarm, { group: GRP.SUMMER, mat: MAT.NOSHADOW | MAT.FLAT });
  }
  function roofGarden(C, fr, a0, a1, d0, d1, z) {
    let S2 = sharedTex(C), w = a1 - a0;
    for (let a = a0; a < a1 - 0.6; a += 1.1)
      fr.box(C.mb, a, a + 0.8, d0, d0 + 0.5, z, z + 0.35, { front: S2.wood, back: S2.wood, left: S2.wood, right: S2.wood, top: { t: S2.roofGreen, world: !0 } }), C.addSprite("bush", ...fr.pt(a + 0.4, d0 + 0.25), z + 0.35);
  }
  function billboard(C, fr, a0, a1, d, z, kind) {
    let { mb } = C, S2 = sharedTex(C), W = a1 - a0, H = 1.75, legH = 1, tw = Math.round(W * 32), th = Math.round(H * 32), art = region(C, tw, th, (p) => billboardArt(p, tw, th, kind, C.rng)), backT = C.atlas.shared("bb_back", 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, x % 8 === 0 || y % 16 === 0 ? 4869202 : (x + y) % 16 === 0 ? 5921890 : 6974578);
    });
    for (let a of [a0 + 0.4, a1 - 0.4])
      fr.box(mb, a - 0.06, a + 0.06, d + 0.1, d + 0.22, z, z + legH, { front: S2.darkMetal, left: S2.darkMetal, right: S2.darkMetal, back: S2.darkMetal }), fr.box(mb, a - 0.04, a + 0.04, d + 0.2, d + 0.9, z, z + legH * 0.6, { front: S2.darkMetal, left: S2.darkMetal, right: S2.darkMetal });
    fr.box(mb, a0, a1, d, d + 0.12, z + legH, z + legH + H, { front: { t: art, mat: MAT.NOSHADOW }, back: backT, left: backT, right: backT, top: S2.darkMetal }), fr.box(mb, a0, a1, d - 0.35, d, z + legH - 0.06, z + legH, { front: S2.darkMetal, left: S2.darkMetal, right: S2.darkMetal, top: { t: S2.grate } });
    let lp = fr.pt((a0 + a1) / 2, d - 0.4);
    C.world.lamps.push({ x: lp[0], y: lp[1], z: z + legH + H, r: 2, color: [1, 0.95, 0.85], k: 0.25, kind: "bill" }), markHeight(C.world, ...fr.aabb(a0, a1, d - 0.35, d + 0.2), z + legH + H);
  }
  function gardenWall(C, fr, a0, a1, d, z, h, kind = "brick") {
    let S2 = sharedTex(C), t = kind === "wood" ? S2.fenceWood : S2.brickRed;
    fr.box(C.mb, a0, a1, d, d + 0.18, z, z + h, { front: t, back: t, left: t, right: t, top: { t: S2.limeTop } });
  }

  // src/world/towers.js
  function region2(C, w, h, paint) {
    let r = C.atlas.alloc(w, h);
    return paint(r.p, r), r;
  }
  var seedCounter = 1;
  function section(C, x0, y0, x1, y1, z0, z1, side, top, opt = {}) {
    let seed = opt.seed ?? seedCounter++ % 250 + 1, mat = opt.mat ?? MAT.OFFICE, f = { t: side, mat, seed }, faces = { px: f, nx: f, py: f, ny: f };
    top && (faces.pz = { t: top, world: !0 }), opt.faces && Object.assign(faces, opt.faces), C.mb.box(x0, y0, z0, x1, y1, z1, faces, { seed }), markHeight(C.world, x0, y0, x1, y1, z1);
  }
  function band(C, x0, y0, x1, y1, z0, z1, fn, top, opt = {}) {
    let h = Math.round((z1 - z0) * 32), wx = Math.round((x1 - x0) * 32), wy = Math.round((y1 - y0) * 32), faces = {}, mk = (w, i) => ({ t: region2(C, w, h, (p) => fn(p, w, h, i)), mat: opt.mat ?? MAT.OFFICE });
    faces.py = mk(wx, 0), faces.px = mk(wy, 1), faces.ny = mk(wx, 2), faces.nx = mk(wy, 3), top && (faces.pz = { t: top, world: !0 }), C.mb.box(x0, y0, z0, x1, y1, z1, faces), markHeight(C.world, x0, y0, x1, y1, z1);
  }
  function beacon(C, x, y, z) {
    C.world.beacons.push({ x, y, z });
  }
  function decoTower(C, L) {
    let S2 = sharedTex(C), { rng } = C, z0 = C.z0, stone = 14997952, stoneD = 13221540, spandrel = 3881544, module = C.atlas.shared("deco_mod", 32, 48, (p) => {
      stoneFill(p, 0, 0, 32, 48, [stone], 5, 0), p.rect(0, 0, 6, 48, shade(stone, 1.05)), p.vline(0, 0, 48, shade(stone, 1.14)), p.rect(26, 0, 6, 48, shade(stone, 0.96)), p.vline(31, 0, 48, shade(stone, 0.86)), p.vline(6, 0, 48, stoneD), p.vline(25, 0, 48, shade(stoneD, 1.06)), drawWindow(p, 7, 3, 9, 32, { frame: 2829104, t: 0.5, panes: "1/1" }, rng), drawWindow(p, 16, 3, 9, 32, { frame: 2829104, t: 0.5, panes: "1/1" }, rng);
      for (let y = 36; y < 48; y++) for (let x = 7; x < 25; x++) {
        let v = Math.abs((x - 7) % 6 - 3) + (y - 36);
        p.set(x, y, v % 4 === 0 ? 6973568 : (x + y) % 3 === 0 ? 4539482 : spandrel);
      }
      p.hline(7, 36, 18, 2763060), p.hline(7, 47, 18, 5921136);
    }), roofT = S2.roofGravel, cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2, tiers = [
      { r: 8, z: 11 },
      { r: 6.5, z: 18 },
      { r: 5, z: 12 },
      { r: 3.5, z: 6 }
    ];
    band(C, cx - 8, cy - 8, cx + 8, cy + 8, z0, z0 + 2, (p, w, h, i) => {
      stoneFill(p, 0, 0, w, h, [14273968], 7, 16, { blocks: 32 }), p.rect(0, 0, w, 6, 9071162), p.hline(0, 2, w, 13148746), p.hline(0, 3, w, 14728282);
      for (let x = 8; x < w - 24; x += 32) {
        p.rect(x, 12, 20, h - 12, 6965794), p.rect(x + 2, 14, 16, h - 14, 4216685, winCode(0.05)), p.vline(x + 10, 25, h - 25, 9071162), p.hline(x + 2, 24, 16, 9071162);
        for (let k = 0; k < 5; k++) p.line(x + 10, 24, x + 2 + k * 4, 14, 13148746);
        p.rect(x + 7, h - 22, 2, 6, 13148746), p.rect(x + 11, h - 22, 2, 6, 13148746);
      }
      (i === 0 || i === 1) && signBoard(p, Math.floor(w / 2) - 60, 1, 120, 10, "THE PIXEL BLDG", { bg: 9071162, fg: 15913594, t: 0.03, shadow: !1 });
    }, roofT);
    let z = z0 + 2;
    tiers.forEach((tr, i) => {
      section(C, cx - tr.r, cy - tr.r, cx + tr.r, cy + tr.r, z, z + tr.z, module, roofT, { seed: 40 + i });
      let pr = tr.r;
      if (band(C, cx - pr, cy - pr, cx + pr, cy + pr, z + tr.z, z + tr.z + 0.5, (p, w, h) => {
        p.rect(0, 0, w, h, stone), p.hline(0, 0, w, shade(stone, 1.12));
        for (let x = 0; x < w; x++) {
          let k = x % 8, yy = 4 + (k < 4 ? k : 8 - k);
          p.set(x, yy, 9075290), p.set(x, yy + 1, 11049082);
        }
        p.hline(0, h - 3, w, shade(stone, 0.9)), p.hline(0, h - 1, w, stoneD);
      }, S2.concrete, { mat: 0 }), i < 3) for (let [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        let ex = cx + sx * (pr - 0.25), ey = cy + sy * (pr - 0.25);
        C.mb.solid(ex - 0.2, ey - 0.2, z + tr.z + 0.5, ex + 0.2, ey + 0.2, z + tr.z + 1.1, S2.limestone, S2.limestone);
      }
      z += tr.z;
    });
    let crown = (p, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(13159636, 0.9 + ((x + y) % 8 === 0 ? 0.2 : 0) + hash2i(x, y, 2) * 0.05));
      for (let x = 0; x < w; x += 10)
        p.vline(x, 0, h, 15265010), p.vline(x + 1, 0, h, 10133674);
      let tw = 20;
      for (let x0 = 2; x0 + tw <= w; x0 += tw + 4)
        for (let row = 0; row < 3; row++) {
          let by = h - 6 - row * Math.floor(h / 3.4);
          for (let k = 0; k < 8; k++) for (let xx = k; xx < tw - k; xx++) p.set(x0 + xx, by - k, 14209720, 254);
          for (let k = 0; k < 9; k++)
            p.set(x0 + k - 1, by - k, 8028298), p.set(x0 + tw - k, by - k, 8028298);
          p.hline(x0 - 1, by + 1, tw + 2, 8028298);
        }
      p.hline(0, 0, w, 15790838), p.hline(0, 1, w, 14212324);
    };
    band(C, cx - 2.5, cy - 2.5, cx + 2.5, cy + 2.5, z + 0.5, z + 3.5, crown, S2.metal, { mat: MAT.GLASS }), band(C, cx - 1.5, cy - 1.5, cx + 1.5, cy + 1.5, z + 3.5, z + 6, crown, S2.metal, { mat: MAT.GLASS });
    let spire = C.atlas.shared("spire", 32, 64, (p) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) p.set(x, y, x % 8 === 0 ? 15790838 : x % 8 === 1 ? 13949152 : y % 16 === 0 ? 10133674 : 11844292);
      for (let y = 8; y < 64; y += 16) for (let x = 4; x < 32; x += 8) p.set(x, y, 16777215, 254);
    });
    C.mb.pyramid(cx - 0.75, cy - 0.75, cx + 0.75, cy + 0.75, z + 6, z + 14, spire, { mat: MAT.GLASS }), beacon(C, cx, cy, z + 14.1), C.world.perches.push({ x: cx + 2, y: cy + 2, z: z + 0.5 }), C.world.lamps.push({ x: cx, y: cy + 3, z, r: 3, color: [1, 0.9, 0.7], k: 0.15, kind: "up" }), C.world.officeDoors.push(...lobbyDoors(cx, cy, 8, 8)), plaza(C, L, { x0: cx - 8, y0: cy - 8, x1: cx + 8, y1: cy + 8 });
  }
  function lobbyDoors(cx, cy, rx, ry) {
    return [
      { x: cx, y: cy + ry + 0.9, dx: cx, dy: cy + ry - 0.2, kind: "office" },
      { x: cx + rx + 0.9, y: cy, dx: cx + rx - 0.2, dy: cy, kind: "office" },
      { x: cx, y: cy - ry - 0.9, dx: cx, dy: cy - ry + 0.2, kind: "office" },
      { x: cx - rx - 0.9, y: cy, dx: cx - rx + 0.2, dy: cy, kind: "office" }
    ];
  }
  function glassTower(C, L) {
    let S2 = sharedTex(C), { rng } = C, z0 = C.z0, module = C.atlas.shared("glass_mod", 24, 48, (p) => {
      for (let y = 0; y < 48; y++)
        for (let x = 0; x < 24; x++) {
          let c = shade(4095651, 1.12 - y / 48 * 0.28), d = (x + y) % 22;
          (d === 6 || d === 7) && y < 28 ? c = mixc(c, 11065584, 0.6) : d === 8 && y < 20 && (c = mixc(c, 11065584, 0.3)), p.set(x, y, c, winCode(0.5));
        }
      for (let x = 2; x < 24; x++) p.set(x, 2, 12112096, winCode(0.5));
      for (let y = 38; y < 48; y++) for (let x = 0; x < 24; x++) p.set(x, y, y === 38 ? 10467012 : y === 39 ? 7309978 : x % 6 === 0 ? 3496562 : 2903910);
      p.vline(0, 0, 48, 12110034), p.vline(1, 0, 48, 9085102), p.vline(12, 0, 38, 8033702);
    }), x0 = L.x0 + 4, x1 = L.x0 + 14, y0 = L.y0 + 2.5, y1 = L.y0 + 12.5;
    band(C, x0, y0, x1, y1, z0, z0 + 2.5, (p, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(6262440, 1.1 - y / h * 0.2), winCode(0.03));
      for (let x = 0; x < w; x += 24)
        p.vline(x, 0, h, 13161692), p.vline(x + 1, 0, h, 10136244);
      p.rect(0, 0, w, 6, 13161692), p.hline(0, 6, w, 9083556), p.rect(0, 36, w, 2, 13161692);
      for (let x = 12; x < w - 24; x += 46)
        p.rect(x, h - 16, 20, 8, 14209216, winCode(0.03, !0)), p.hline(x, h - 16, 20, 15788248, winCode(0.03, !0)), p.rect(x + 4, h - 22, 2, 6, 2763310), p.rect(x + 2, h - 24, 6, 2, 16771248, winCode(0.03, !0));
      signBoard(p, Math.floor(w / 2) - 36, 10, 72, 14, "ONE PARK", { bg: 1780536, fg: 13691647, t: 0.03 });
    }, S2.concrete, { mat: MAT.GLASS | MAT.OFFICE }), section(C, x0, y0, x1, y1, z0 + 2.5, z0 + 44.5, module, null, { mat: MAT.GLASS | MAT.OFFICE, seed: 61 });
    let louv = C.atlas.shared("louver", 24, 24, (p) => {
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) p.set(x, y, y % 4 === 0 ? 4874092 : y % 4 === 1 ? 6980498 : 9216946);
      p.vline(0, 0, 24, 12110034), p.vline(1, 0, 24, 10137790);
    });
    section(C, x0 + 0.75, y0 + 0.75, x1 - 0.75, y1 - 0.75, z0 + 44.5, z0 + 47.5, louv, S2.roofSilver, { mat: MAT.GLASS, seed: 62 }), C.mb.solid(x0, y0, z0 + 44.5, x1, y0 + 0.25, z0 + 48.5, module, S2.metal, { mat: MAT.GLASS }), C.mb.solid(x0 + 4, y0 + 4, z0 + 47.5, x0 + 4.25, y0 + 4.25, z0 + 54, S2.metal, S2.metal), beacon(C, x0 + 4.1, y0 + 4.1, z0 + 54.1), hvacAt(C, x0 + 2, y0 + 3, z0 + 47.5), C.world.officeDoors.push({ x: (x0 + x1) / 2, y: y1 + 0.9, dx: (x0 + x1) / 2, dy: y1 - 0.2, kind: "office" }), C.world.officeDoors.push({ x: x1 + 0.9, y: (y0 + y1) / 2, dx: x1 - 0.2, dy: (y0 + y1) / 2, kind: "office" }), band(C, L.x0 + 1, L.y0 + 14, L.x0 + 7, L.y1 - 1, z0, z0 + 2.25, (p, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(6262440, 1.1 - y / h * 0.2), winCode(0.04));
      for (let x = 0; x < w; x += 24)
        p.vline(x, 0, h, 13161692), p.vline(x + 1, 0, h, 10136244);
      p.rect(0, 0, w, 4, 13161692), p.text7(8, 9, "CAFE", 16767055, winCode(0.02, !0), 2);
      for (let x = 10; x < w - 16; x += 28)
        p.rect(x, h - 18, 12, 2, 15261904, winCode(0.04, !0)), p.rect(x + 5, h - 16, 2, 10, 2763310), p.rect(x - 4, h - 14, 3, 8, 6044458), p.rect(x + 13, h - 14, 3, 8, 6044458);
    }, S2.roofSilver, { mat: MAT.GLASS }), plaza(C, L, { x0, y0, x1, y1 }, { sculpture: !0, subway: { x: L.x1 - 1.5, y: L.y1 - 4 } });
  }
  function hvacAt(C, x, y, z) {
    let fr = new Frame(x, y, 0, 1, z);
    hvac(C, fr, 0, 0, z);
  }
  function modernTower(C, L) {
    let S2 = sharedTex(C), z0 = C.z0, module = C.atlas.shared("bronze_mod", 24, 48, (p) => {
      for (let y = 0; y < 48; y++)
        for (let x = 0; x < 24; x++) {
          let c = shade(4865848, 1.1 - y / 48 * 0.25), d = (x + y) % 26;
          (d === 10 || d === 11) && y < 30 && (c = mixc(c, 10127994, 0.5)), p.set(x, y, c, winCode(0.5));
        }
      for (let y = 40; y < 48; y++) for (let x = 0; x < 24; x++) p.set(x, y, y === 40 ? 5917242 : 3812902);
      p.vline(0, 0, 48, 9071170), p.vline(1, 0, 48, 11043918), p.vline(2, 0, 48, 6967858), p.vline(12, 0, 40, 6967858), p.vline(13, 0, 40, 9071170);
    }), x0 = L.x0 + 3, x1 = L.x0 + 15, y0 = L.y0 + 1.5, y1 = L.y0 + 10.5;
    band(C, x0, y0, x1, y1, z0, z0 + 2.25, (p, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(8022618, 1.05 - y / h * 0.15), winCode(0.03));
      for (let x = 0; x < w; x += 24)
        p.vline(x, 0, h, 9071170), p.vline(x + 1, 0, h, 11043918);
      p.rect(0, 0, w, 4, 9071170), p.hline(0, 4, w, 5915688);
    }, S2.concrete, { mat: MAT.GLASS | MAT.OFFICE }), section(C, x0, y0, x1, y1, z0 + 2.25, z0 + 38.25, module, S2.roofGravel, { mat: MAT.GLASS | MAT.OFFICE, seed: 71 }), section(C, x0 + 1.5, y0 + 1.5, x1 - 1.5, y1 - 1.5, z0 + 38.25, z0 + 40.25, module, S2.roofTar, { mat: MAT.GLASS | MAT.OFFICE, seed: 72 }), C.mb.solid(x1 - 2, y0 + 2, z0 + 40.25, x1 - 1.8, y0 + 2.2, z0 + 45, S2.metal, S2.metal), beacon(C, x1 - 1.9, y0 + 2.1, z0 + 45.1), C.world.officeDoors.push({ x: (x0 + x1) / 2, y: y1 + 0.9, dx: (x0 + x1) / 2, dy: y1 - 0.2, kind: "office" }), plaza(C, L, { x0, y0, x1, y1 }, { pools: !0 });
  }
  function limestoneOffice(C, L) {
    let S2 = sharedTex(C), { rng } = C, z0 = C.z0, module = C.atlas.shared("lime_mod", 32, 48, (p) => {
      stoneFill(p, 0, 0, 32, 48, PAL.limestone, 33, 16, { blocks: 32 }), drawWindow(p, 4, 10, 10, 28, { frame: 15921126, sill: 13221540, lintel: 14208176, t: 0.5, panes: "1/1", wall: PAL.limestone[0] }, rng), drawWindow(p, 18, 10, 10, 28, { frame: 15921126, sill: 13221540, lintel: 14208176, t: 0.5, panes: "1/1", wall: PAL.limestone[0] }, rng);
    }), x0 = L.x0 + 1, x1 = L.x1 - 1, y0 = L.y0 + 1, y1 = L.y0 + 11;
    band(C, x0, y0, x1, y1, z0, z0 + 2.5, (p, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(12102540, (y % 8 === 7 ? 0.8 : 1) * (0.95 + hash2i(x, y, 9) * 0.08)));
      for (let x = 12; x < w - 28; x += 64)
        p.rect(x, 20, 24, h - 20, 9075290), p.rect(x + 2, 22, 20, h - 22, 4216685, winCode(0.05)), p.vline(x + 12, 22, h - 22, 9075290), p.hline(x + 2, 34, 20, 9075290), p.rect(x + 6, 5, 12, 11, 15787724), p.frame(x + 6, 5, 12, 11, 13221540), p.rect(x + 10, 8, 4, 5, 14208176);
    }, S2.concrete, { mat: MAT.OFFICE }), section(C, x0, y0, x1, y1, z0 + 2.5, z0 + 15.5, module, S2.roofTar, { seed: 81 }), section(C, x0 + 1.5, y0 + 1, x1 - 1.5, y1 - 1, z0 + 15.5, z0 + 24.5, module, S2.roofTar, { seed: 82 }), section(C, x0 + 4, y0 + 2, x1 - 4, y1 - 2, z0 + 24.5, z0 + 30.5, module, null, { seed: 83 });
    let copper = C.atlas.shared("copper", 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        let c = shade(x % 8 === 0 ? 5216902 : x % 8 === 1 ? 8177840 : 7125152, 0.92 + hash2i(x, y, 4) * 0.12);
        hash2i(x >> 1, y >> 2, 7) > 0.86 && (c = mixc(c, 9099456, 0.4)), p.set(x, y, c);
      }
    });
    C.mb.pyramid(x0 + 4, y0 + 2, x1 - 4, y1 - 2, z0 + 30.5, z0 + 36, copper, { mat: MAT.SNOW }), C.mb.solid((x0 + x1) / 2 - 0.05, (y0 + y1) / 2 - 0.05, z0 + 35.5, (x0 + x1) / 2 + 0.05, (y0 + y1) / 2 + 0.05, z0 + 38, S2.metal, S2.metal), beacon(C, (x0 + x1) / 2, (y0 + y1) / 2, z0 + 38.1), waterTower(C, x0 + 3, y0 + 2.5, z0 + 15.5, 0.9), C.world.officeDoors.push({ x: (x0 + x1) / 2, y: y0 - 0.9, dx: (x0 + x1) / 2, dy: y0 + 0.2, kind: "office" }), hotel(C, { x0: L.x0 + 1, y0: L.y0 + 12, x1: L.x1 - 1, y1: L.y1 - 0.5 });
  }
  function hotel(C, R2) {
    let S2 = sharedTex(C), { rng } = C, z0 = C.z0, brickMod = C.atlas.shared("hotel_mod", 32, 48, (p) => {
      brickFill(p, 0, 0, 32, 48, PAL.brickTan, 44), drawWindow(p, 8, 10, 16, 28, { frame: 2829104, lintel: 15787724, sill: 15787724, t: 0.5, wall: PAL.brickTan[0] }, rng);
    }), fr = new Frame(R2.x0, R2.y1, 0, 1, z0), W = R2.x1 - R2.x0, D = R2.y1 - R2.y0, LH = Math.round(2.5 * 32), lobby = region2(C, Math.round(W * 32), LH, (p) => {
      stoneFill(p, 0, 0, p.w, LH, [9054762], 5, 8), p.rect(0, 0, p.w, 6, 14200906), p.hline(0, 6, p.w, 10123818);
      for (let x = 12; x < p.w - 20; x += 44)
        p.rect(x, 26, 28, LH - 26, 14200906), p.rect(x + 2, 28, 24, LH - 28, 4216685, winCode(0.02)), p.vline(x + 14, 28, LH - 28, 14200906), p.hline(x + 2, 38, 24, 14200906), p.rect(x + 11, LH - 26, 2, 8, 15782e3), p.rect(x + 15, LH - 26, 2, 8, 15782e3);
      signBoard(p, 16, 9, p.w - 32, 14, "THE PIXEL HOTEL", { bg: 1776411, fg: 16767055, t: 0.02 });
    }), shaft = { t: brickMod, mat: 0, seed: 91 }, H = 2.5 + 12 * 1.5;
    C.mb.box(R2.x0, R2.y0, z0, R2.x1, R2.y1, z0 + 2.5, { py: { t: lobby, mat: 0 }, px: { t: S2.brickTan }, nx: { t: S2.brickTan } }), C.mb.box(R2.x0, R2.y0, z0 + 2.5, R2.x1, R2.y1, z0 + H, { py: shaft, px: shaft, nx: shaft, ny: shaft, pz: { t: S2.roofTar, world: !0 } }), markHeight(C.world, R2.x0, R2.y0, R2.x1, R2.y1, z0 + H);
    let can = region2(C, Math.round((W - 4) * 32), 10, (p) => {
      p.rect(0, 0, p.w, 10, 1776411), p.hline(0, 0, p.w, 14200906), p.hline(0, 9, p.w, 10123818);
      for (let x = 2; x < p.w; x += 5)
        p.rect(x, 3, 2, 1, 16773280, winCode(0.01, !0)), p.rect(x + 2, 6, 2, 1, 16773280, winCode(0.01, !0));
    });
    fr.box(C.mb, 2, W - 2, -1.6, 0, z0 + 2.3, z0 + 2.62, { front: can, left: can, right: can, top: { t: S2.darkMetal } });
    for (let a of [2.2, W - 2.2]) fr.box(C.mb, a - 0.05, a + 0.05, -1.55, -1.45, z0, z0 + 2.3, { front: S2.metal, left: S2.metal, right: S2.metal });
    C.world.lamps.push({ x: R2.x0 + W / 2, y: R2.y1 + 1.2, z: 0.5, r: 3.2, color: [1, 0.85, 0.55], k: 0.75, kind: "marquee" });
    let word = "HOTEL", hh = word.length * 24 + 10, tex = region2(C, 32, hh, (p) => {
      p.rect(0, 0, 32, hh, 1776411), p.frame(0, 0, 32, hh, 16732010, winCode(0.01, !0)), p.frame(2, 2, 28, hh - 4, 4856356);
      for (let i = 0; i < word.length; i++) p.text7(9, 7 + i * 24, word[i], 16732010, winCode(0.01, !0), 3);
    }), sz = z0 + 6, bx = R2.x1 - 0.2;
    C.mb.vquad(bx, R2.y1, bx, R2.y1 + 1, sz, sz + hh / 32, tex, { mat: MAT.NOSHADOW }), C.mb.vquad(bx + 0.02, R2.y1 + 1, bx + 0.02, R2.y1, sz, sz + hh / 32, tex, { mat: MAT.NOSHADOW }), C.world.lamps.push({ x: R2.x1, y: R2.y1 + 1.4, z: sz, r: 2.5, color: [1, 0.3, 0.45], k: 0.4, kind: "neon" });
    for (let a of [4, 7, 10]) C.addFlag(fr, a, -0.1, z0 + 3.2, a === 7 ? "us" : "hotel");
    C.world.doors.push({ x: R2.x0 + W / 2, y: R2.y1 + 0.9, dx: R2.x0 + W / 2, dy: R2.y1 - 0.2, kind: "hotel", n: [0, 1] }), roofClutter(C, fr, { a0: 0.5, a1: W - 0.5, d0: 0.5, d1: D - 0.5, z: z0 + H }, { waterTower: !0 });
  }
  function loft(C, fr, a0, W, D, o = {}) {
    let { mb, rng } = C, S2 = sharedTex(C), nF = o.floors ?? rng.int(5, 7), gH = 2, fH = 1.75, band2 = 0.75, H = gH + nF * fH + band2, z0 = fr.z0, tw = Math.round(W * 32), th = Math.round(H * 32), paint = rng.pick([15262416, 14210248, 12106944, 14733488, 10135712, 13154464]), front = region2(C, tw, th, (p) => {
      smoothFill(p, 0, 0, tw, th, paint, rng.int(1, 99), 0.03), corniceBand(p, 0, 0, tw, 20, shade(paint, 0.85));
      let nb = Math.max(2, Math.round(tw / 40)), bw = tw / nb;
      for (let f = 0; f < nF; f++) {
        let fy = Math.round((band2 + f * fH) * 32);
        p.rect(0, fy, tw, 4, shade(paint, 0.82)), p.hline(0, fy, tw, shade(paint, 1.1));
        for (let b = 0; b < nb; b++) {
          let x = Math.round(bw * b);
          p.rect(x, fy + 4, 6, 52, shade(paint, 1.06)), p.vline(x + 2, fy + 8, 44, shade(paint, 0.86)), p.vline(x + 4, fy + 8, 44, shade(paint, 0.86)), p.vline(x + 5, fy + 4, 52, shade(paint, 0.92)), p.rect(x - 1, fy + 4, 8, 3, shade(paint, 1.14)), p.hline(x - 1, fy + 7, 8, shade(paint, 0.8)), p.rect(x - 1, fy + 53, 8, 3, shade(paint, 0.9));
          let wx = x + 9, ww = Math.round(bw) - 12, wy = fy + 10;
          drawWindow(p, wx, wy, ww, 40, { frame: 2829104, t: rng.next(), panes: "2/2", wall: paint, curtain: rng.chance(0.15) ? rng.pick(PAL.curtains) : null }, rng);
          for (let k = 0; k < 4; k++)
            p.hline(wx, wy + k, 4 - k, paint), p.hline(wx + ww - (4 - k), wy + k, 4 - k, paint);
          p.hline(wx + 3, wy - 2, ww - 6, shade(paint, 0.8));
        }
      }
      let gy = Math.round((band2 + nF * fH) * 32), kind2 = o.shop ?? rng.pick(["gallery", "boutique", "coffee", "books", "boutique", "diner", "pharmacy"]);
      p.shopInfo = drawShopfront(p, 0, gy, tw, th - gy, kind2, rng, { doorLeft: rng.chance(0.5), signH: 14 });
    }), side = S2.brickRed, aabb = fr.box(mb, a0, a0 + W, 0, D, z0, z0 + H, { front, back: side, left: side, right: side, top: { t: S2.roofTar, world: !0 } });
    markHeight(C.world, ...aabb, z0 + H);
    let zTop = z0 + H, corn = C.atlas.shared("loft_corn_" + paint, 64, 21, (p) => corniceBand(p, 0, 0, 64, 21, shade(paint, 0.9)));
    fr.box(mb, a0 - 0.0625, a0 + W + 0.0625, -0.35, 0.02, zTop - 0.6, zTop + 0.06, { front: corn, left: corn, right: corn, top: { t: S2.concrete } }), rng.chance(0.6) && fireEscape(C, fr, a0 + W * 0.2, a0 + W * 0.8, 0, z0 + gH, fH, nF);
    let kind = front.p.shopInfo?.kind || "gallery", gate = region2(C, tw, Math.round((gH - 0.45) * 32), (p) => drawGate(p, tw, Math.round((gH - 0.45) * 32), rng));
    fr.facadeQuad(mb, a0, a0 + W, -0.03, z0, z0 + gH - 0.45, gate, { group: GRP.NIGHT, mat: 0 });
    let sp = fr.pt(a0 + W / 2, -0.8);
    C.world.shops.push({ kind, name: front.p.shopInfo?.name || "", x: sp[0], y: sp[1], n: fr.n }), C.world.lamps.push({ x: sp[0], y: sp[1], z: 0.5, r: 2.2, color: [1, 0.88, 0.65], k: 0.5, kind: "shop", group: GRP.DAY }), roofClutter(C, fr, { a0, a1: a0 + W, d0: 0, d1: D, z: zTop }, { waterTower: rng.chance(0.6) });
    let dp = fr.pt(a0 + W - 1, -0.7);
    return C.world.doors.push({ x: dp[0], y: dp[1], dx: dp[0], dy: dp[1], kind: "home", n: fr.n }), { H: zTop };
  }
  function plaza(C, L, tower, o = {}) {
    let { rng } = C;
    C.paintGround(L.x0, L.y0, L.x1, L.y1, "plaza");
    let spots = [];
    for (let x = L.x0 + 1.5; x < L.x1 - 1; x += 3.2) spots.push([x, L.y1 - 1]);
    for (let y = L.y0 + 1.5; y < L.y1 - 1; y += 3.2) spots.push([L.x1 - 1, y]);
    for (let [x, y] of spots) {
      if (x > tower.x0 - 0.8 && x < tower.x1 + 0.8 && y > tower.y0 - 0.8 && y < tower.y1 + 0.8 || o.subway && Math.hypot(x - o.subway.x, y - o.subway.y) < 3) continue;
      let r = rng.next();
      r < 0.45 ? C.addTree(x, y, "plane", !0) : r < 0.75 ? C.addBench(x, y, Math.abs(y - (L.y1 - 1)) < 0.01 ? "y" : "x") : C.addPlanter(x, y);
    }
    if (o.sculpture) {
      let sx = L.x0 + 3.5, sy = L.y1 - 3.5, red = C.atlas.shared("red_sculpt", 32, 32, (p) => smoothFill(p, 0, 0, 32, 32, 14168108, 3, 0.04));
      C.mb.solid(sx - 0.9, sy - 0.9, C.z0, sx + 0.9, sy + 0.9, C.z0 + 0.25, sharedTex(C).concrete, sharedTex(C).concrete), C.mb.solid(sx - 0.6, sy - 0.6, C.z0 + 0.25, sx + 0.6, sy + 0.6, C.z0 + 1.45, red, red), C.mb.solid(sx - 0.2, sy - 0.2, C.z0 + 1.45, sx + 0.2, sy + 0.2, C.z0 + 2.2, red, red);
    }
    if (o.pools)
      for (let px of [L.x0 + 4, L.x0 + 11]) {
        let py = L.y1 - 3.5;
        C.fountainPool(px, py, 2.4, 1.8);
      }
    o.subway && C.addSubway(o.subway.x, o.subway.y, "y");
  }

  // src/world/props.js
  function propTex(C) {
    if (C._props) return C._props;
    let A = C.atlas, P = {}, solid = (name, c, amt = 0.04) => A.shared(name, 16, 16, (p) => smoothFill(p, 0, 0, 16, 16, c, 5, amt));
    return P.pole = solid("pole", 6122082), P.poleDark = solid("pole_d", 2896688), P.black = solid("black", 1973794), P.yellow = solid("sig_y", 14198824), P.red = solid("red", 13119532), P.blue = solid("blue", 2052e3), P.green = solid("green", 3111482), P.orange = solid("orange", 15234074), P.silver = solid("silver", 12106946), P.wood = A.shared("bench_wood", 32, 8, (p) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) {
        let r = y % 4, c = r === 3 ? 4861466 : r === 0 ? 11565640 : 10119742;
        r !== 3 && hash2i(x >> 2, y >> 2, 5) > 0.7 && (c = shade(c, 0.92)), p.set(x, y, c);
      }
    }), P.lampHead = A.shared("lamp_head", 16, 6, (p) => {
      p.rect(0, 0, 16, 6, 4870734), p.hline(0, 0, 16, 6976622), p.rect(1, 4, 14, 2, 16773312, winCode(0.32, !0));
    }), P.lantern = A.shared("lantern", 11, 14, (p) => {
      p.rect(0, 0, 11, 14, 1973794), p.hline(1, 0, 9, 3816e3), p.rect(2, 2, 7, 11, 16769696, winCode(0.32, !0)), p.rect(3, 3, 2, 4, 16774352, winCode(0.32, !0)), p.vline(5, 2, 11, 1973794);
    }), P.globe = A.shared("globe", 8, 8, (p) => {
      let t = winCode(0, !0);
      p.rect(0, 0, 8, 8, 4177754, t), p.rect(1, 1, 3, 2, 9105568, t), p.hline(0, 7, 8, 2787898, t), p.vline(7, 0, 8, 2787898, t);
    }), P.sigHead = A.shared("sig_head", 8, 24, (p) => {
      p.rect(0, 0, 8, 24, 2763302), p.frame(0, 0, 8, 24, 13148712);
      for (let i = 0; i < 3; i++)
        p.ellipse(3.5, 4.5 + i * 8, 2.4, 2.4, 1118481), p.hline(1, 1 + i * 8, 6, 4868674);
    }), P.pedHead = A.shared("ped_head", 7, 12, (p) => {
      p.rect(0, 0, 7, 12, 2763302), p.frame(0, 0, 7, 12, 13148712), p.rect(1, 1, 5, 10, 1118481), p.hline(1, 6, 5, 2763302);
    }), P.streetSign = A.shared("st_sign", 32, 5, (p) => {
      p.rect(0, 0, 32, 5, 2062906), p.hline(0, 0, 32, 3119690), p.hline(0, 4, 32, 1530410), p.rect(2, 2, 28, 1, 15266024);
      for (let x of [6, 12, 17, 23]) p.set(x, 2, 2062906);
    }), P.hydrant = A.shared("hydrant", 9, 14, (p) => {
      p.rect(0, 0, 9, 14, 13119532), p.rect(1, 0, 7, 3, 14211280), p.hline(1, 0, 7, 15921900), p.hline(0, 3, 9, 10493984), p.vline(0, 4, 8, 14174780), p.vline(8, 4, 8, 10100768), p.rect(0, 7, 9, 2, 10493984), p.rect(3, 6, 3, 3, 14211280), p.set(4, 7, 10132114), p.hline(0, 12, 9, 9050650), p.hline(0, 13, 9, 6951956), p.set(2, 1, 16777215);
    }), P.hydrantTop = A.shared("hydrant_t", 9, 9, (p) => {
      p.rect(0, 0, 9, 9, 14211280), p.ellipse(4, 4, 2.5, 2.5, 11053216), p.set(4, 4, 6974052), p.set(2, 2, 16777215);
    }), P.mailbox = A.shared("mailbox", 19, 27, (p) => {
      p.rect(0, 0, 19, 27, 2052e3), p.rect(0, 0, 19, 4, 2777016), p.hline(0, 0, 19, 4882384), p.rect(3, 7, 13, 3, 1456760), p.hline(3, 7, 13, 5933784), p.text7(4, 12, "US", 16777215), p.text(2, 20, "MAIL", 14214392), p.vline(18, 4, 23, 1523590), p.rect(0, 25, 19, 2, 1710622), p.rect(1, 25, 3, 2, 1456760), p.rect(15, 25, 3, 2, 1456760);
    }), P.newsBoxes = ["news_r", "news_y", "news_b", "news_g"].map((k, i) => A.shared(k, 11, 18, (p) => {
      let c = [13119532, 15253552, 2777016, 3115590][i];
      p.rect(0, 0, 11, 18, c), p.hline(0, 0, 11, shade(c, 1.25)), p.rect(2, 2, 7, 6, 14213352), p.hline(3, 3, 5, 4868682), p.hline(3, 5, 4, 9079434), p.hline(3, 6, 5, 10132122), p.rect(3, 10, 5, 2, shade(c, 0.6)), p.rect(0, 14, 11, 4, shade(c, 0.75)), p.vline(10, 0, 18, shade(c, 0.8));
    })), P.basket = A.shared("basket", 13, 19, (p) => {
      p.clear();
      for (let y = 0; y < 19; y++) for (let x = 0; x < 13; x++)
        ((x + y) % 3 === 0 || (x - y + 99) % 3 === 0 || y <= 1 || y >= 17) && p.set(x, y, y <= 1 ? 4160074 : 3107386);
    }), P.basketTop = A.shared("basket_t", 13, 13, (p) => {
      p.rect(0, 0, 13, 13, 3107386), p.rect(2, 2, 9, 9, 3815990), p.rect(4, 4, 2, 2, 15263968), p.rect(7, 3, 2, 3, 13119532), p.set(5, 8, 15909424), p.rect(7, 7, 3, 2, 14209216);
    }), P.chain = A.shared("chainlink", 48, 80, (p) => chainLinkTex(p, 48, 80)), P.chainLow = A.shared("chainlink_low", 48, 36, (p) => chainLinkTex(p, 48, 36)), P.backboard = A.shared("backboard", 58, 34, (p) => {
      p.rect(0, 0, 58, 34, 15921904), p.frame(0, 0, 58, 34, 13119532), p.frame(1, 1, 56, 32, 13119532), p.frame(19, 15, 20, 15, 13119532), p.frame(20, 16, 18, 13, 13119532), p.hline(2, 2, 54, 16777215);
      for (let [bx, by] of [[4, 4], [53, 4], [4, 29], [53, 29]]) p.set(bx, by, 9079432);
    }), P.net = A.shared("net", 14, 12, (p) => {
      p.clear();
      for (let y = 0; y < 12; y++) {
        let inset = Math.floor(y / 4);
        for (let x = inset; x < 14 - inset; x++) ((x + y) % 3 === 0 || (x - y + 99) % 3 === 0) && p.set(x, y, 15921904);
      }
    }), P.rim = solid("rim", 15228954, 0.02), P.stack = A.shared("steam_stack", 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(Math.floor(y / 8) % 2 ? 15921902 : 15759898, 0.94 + hash2i(x, y, 3) * 0.08));
    }), P.stackTop = A.shared("steam_stack_t", 16, 16, (p) => {
      p.rect(0, 0, 16, 16, 3815994), p.ellipse(8, 8, 5, 5, 1710618);
    }), P.barrel = A.shared("barrel", 16, 20, (p) => {
      for (let y = 0; y < 20; y++) p.rect(0, y, 16, 1, y % 8 < 4 ? 15759898 : 15921902);
      p.hline(0, 0, 16, 2763306);
      for (let x = 0; x < 16; x += 4) p.set(x, 2, 16765088);
    }), P.cone = A.shared("cone", 16, 14, (p) => {
      for (let y = 0; y < 14; y++) p.rect(0, y, 16, 1, y >= 5 && y <= 7 ? 15921902 : 15759898);
      p.rect(0, 12, 16, 2, 2763306);
    }), P.stoneWall = A.shared("parkwall", 64, 22, (p) => {
      stoneFill(p, 0, 0, 64, 22, [9341568], 17, 8, { blocks: 16 }), p.rect(0, 0, 64, 3, 11578530), p.hline(0, 3, 64, 7236194);
    }), P.stoneWallTop = A.shared("parkwall_t", 32, 32, (p) => stoneFill(p, 0, 0, 32, 32, [11052186], 18, 0)), P.concrete = sharedTex(C).concrete, P.glass = A.shared("shelter_glass", 32, 32, (p) => {
      p.clear();
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) ((x + y) % 14 === 0 || (x + y) % 14 === 1) && p.set(x, y, 14215408);
      p.frame(0, 0, 32, 32, 5922918), p.hline(0, 1, 32, 8028294);
    }), P.adPanel = A.shared("ad_panel", 29, 58, (p) => {
      p.rect(0, 0, 29, 58, 5922918);
      let t = winCode(0.15, !0);
      for (let y = 2; y < 56; y++) for (let x = 2; x < 27; x++) p.set(x, y, y < 30 ? (x + y) % 9 === 0 ? 16751336 : 16743136 : 5231359, t);
      p.ellipse(14, 12, 5, 6, 16769224, t), p.rect(9, 6, 10, 3, 3810328, t), p.rect(8, 19, 12, 11, 1776411, t), p.text7(4, 34, "NEW", 16777215, t), p.text7(3, 45, "SHOW", 1776411, t);
    }), P.kiosk = A.shared("kiosk", 9, 64, (p) => {
      p.rect(0, 0, 9, 64, 2764339), p.hline(0, 0, 9, 4869715);
      let t = winCode(0, !0);
      p.rect(1, 6, 7, 40, 5939416, t), p.rect(1, 6, 7, 8, 2052e3, t), p.text(1, 8, "NY", 16777215, t), p.rect(2, 20, 5, 12, 14215408, t), p.rect(3, 50, 3, 2, 1118481);
    }), P.subwayRail = A.shared("sub_rail", 64, 24, (p) => {
      p.clear(), p.rect(0, 0, 64, 2, 2054698), p.hline(0, 0, 64, 4164170), p.rect(0, 21, 64, 2, 2054698);
      for (let x = 0; x < 64; x += 6) p.rect(x, 0, 1, 24, 2054698);
      for (let x = 0; x < 64; x += 32) p.rect(x, 0, 2, 24, 1526306);
    }), P.subwaySign = A.shared("sub_sign", 48, 14, (p) => {
      p.rect(0, 0, 48, 14, 1776411), p.hline(0, 0, 48, 3815994), p.text7(6, 4, "SUBWAY", 16777215, winCode(0.2, !0));
    }), P.lineDots = A.shared("sub_dots", 48, 8, (p) => {
      p.rect(0, 0, 48, 8, 1776411);
      let c = [15611182, 37692, 12137389, 14758, 16567306];
      for (let i = 0; i < 5; i++) p.ellipse(4.5 + i * 9, 3.5, 3, 3, c[i], winCode(0.2, !0));
    }), P.planter = A.shared("planter", 32, 16, (p) => {
      smoothFill(p, 0, 0, 32, 16, 11840928, 7, 0.05), p.rect(0, 0, 32, 2, 13157046), p.hline(0, 2, 32, 9077880);
      for (let x = 0; x < 32; x += 16) p.vline(x, 3, 13, 10130568);
    }), P.soilTop = A.shared("soil_top", 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, hash2i(x >> 1, y >> 1, 3) < 0.5 ? 4880946 : hash2i(x, y, 4) < 0.15 ? 6986306 : 3828266);
    }), P.scaffold = A.shared("scaffold", 32, 32, (p) => {
      smoothFill(p, 0, 0, 32, 32, 3111494, 3, 0.05), p.rect(0, 0, 32, 2, 4168278);
      for (let x = 0; x < 32; x += 16) p.vline(x, 0, 32, 2383930);
    }), P.bleacher = A.shared("bleach", 32, 10, (p) => {
      p.rect(0, 0, 32, 10, 12106946), p.rect(0, 0, 32, 2, 14212322), p.rect(0, 8, 32, 2, 9080468);
      for (let x = 0; x < 32; x += 16) p.vline(x, 2, 6, 10133156);
    }), C._props = P, P;
  }
  var solidBox = (C, x0, y0, z0, x1, y1, z1, side, top, opt) => C.mb.box(x0, y0, z0, x1, y1, z1, { px: side, nx: side, py: side, ny: side, pz: top || side }, opt);
  function streetLamp(C, x, y, ax, ay, o = {}) {
    let P = propTex(C), z = 0.125, h = o.h ?? 4.25;
    solidBox(C, x - 0.07, y - 0.07, z, x + 0.07, y + 0.07, z + h, P.pole), solidBox(C, x - 0.11, y - 0.11, z, x + 0.11, y + 0.11, z + 0.5, P.pole);
    let L = 1.1, ex = x + ax * L, ey = y + ay * L;
    solidBox(C, Math.min(x, ex) - 0.04, Math.min(y, ey) - 0.04, z + h - 0.08, Math.max(x, ex) + 0.04, Math.max(y, ey) + 0.04, z + h, P.pole);
    let hx0 = ex - (ax ? 0.25 * ax : 0.12), hx1 = ex + (ax ? 0.12 * ax : 0.12), hy0 = ey - (ay ? 0.25 * ay : 0.12), hy1 = ey + (ay ? 0.12 * ay : 0.12);
    solidBox(C, Math.min(hx0, hx1), Math.min(hy0, hy1), z + h - 0.2, Math.max(hx0, hx1), Math.max(hy0, hy1), z + h - 0.02, P.lampHead, P.pole), C.world.lamps.push({ x: ex, y: ey, z: z + h - 0.25, r: 4.2, color: [1, 0.86, 0.62], k: 1, kind: "street" }), C.world.lampHeads.push({ x: ex, y: ey, z: z + h - 0.25, kind: "street" }), markHeight(C.world, x - 0.1, y - 0.1, x + 0.1, y + 0.1, z + h), C.world.perches.push({ x: (x + ex) / 2, y: (y + ey) / 2, z: z + h });
  }
  function parkLamp(C, x, y) {
    let P = propTex(C), z = 0.125;
    solidBox(C, x - 0.06, y - 0.06, z, x + 0.06, y + 0.06, z + 2.2, P.black), solidBox(C, x - 0.1, y - 0.1, z, x + 0.1, y + 0.1, z + 0.35, P.black), solidBox(C, x - 0.17, y - 0.17, z + 2.2, x + 0.17, y + 0.17, z + 2.65, P.lantern, P.black), C.mb.pyramid(x - 0.2, y - 0.2, x + 0.2, y + 0.2, z + 2.65, z + 2.85, P.black), C.world.lamps.push({ x, y, z: z + 2.4, r: 3, color: [1, 0.82, 0.55], k: 0.85, kind: "park" }), C.world.lampHeads.push({ x, y, z: z + 2.42, kind: "park" }), C.world.perches.push({ x, y, z: z + 2.85 });
  }
  function signalPole(C, x, y, sx, sy, i, j) {
    let P = propTex(C), z = 0.125, h = 3.3;
    solidBox(C, x - 0.06, y - 0.06, z, x + 0.06, y + 0.06, z + h, P.poleDark), solidBox(C, x - 0.5, y - 0.02, z + h - 0.15, x + 0.5, y + 0.02, z + h, P.streetSign), solidBox(C, x - 0.02, y - 0.5, z + h + 0.02, x + 0.02, y + 0.5, z + h + 0.17, P.streetSign);
    let hz = z + h - 1.05, hx = x + sx * 0.05, hy = y - sy * 0.18;
    solidBox(C, hx - 0.12, hy - 0.12, hz, hx + 0.12, hy + 0.12, hz + 0.75, P.sigHead, P.yellow), C.world.signals.push({ i, j, axis: "x", x: hx + sx * 0.13, y: hy, z: hz, face: [sx, 0], type: "car" });
    let gx = x - sx * 0.18, gy = y + sy * 0.05;
    solidBox(C, gx - 0.12, gy - 0.12, hz - 0.1, gx + 0.12, gy + 0.12, hz + 0.65, P.sigHead, P.yellow), C.world.signals.push({ i, j, axis: "y", x: gx, y: gy + sy * 0.13, z: hz - 0.1, face: [0, sy], type: "car" });
    let pz = z + 1.6, px = x - sx * 0.12, py = y;
    solidBox(C, px - 0.1, py - 0.1, pz, px + 0.1, py + 0.1, pz + 0.38, P.pedHead, P.yellow), C.world.signals.push({ i, j, axis: "x", x: px - sx * 0.11, y: py, z: pz + 0.08, face: [-sx, 0], type: "ped" });
    let qx = x, qy = y - sy * 0.12;
    solidBox(C, qx - 0.1, qy - 0.1, pz + 0.4, qx + 0.1, qy + 0.1, pz + 0.78, P.pedHead, P.yellow), C.world.signals.push({ i, j, axis: "y", x: qx, y: qy - sy * 0.11, z: pz + 0.48, face: [0, -sy], type: "ped" }), C.world.perches.push({ x, y, z: z + h + 0.17 });
  }
  function hydrant(C, x, y) {
    let P = propTex(C), z = 0.125;
    solidBox(C, x - 0.14, y - 0.14, z, x + 0.14, y + 0.14, z + 0.45, P.hydrant, P.hydrantTop), solidBox(C, x - 0.22, y - 0.05, z + 0.2, x + 0.22, y + 0.05, z + 0.3, P.hydrant, P.hydrant), C.world.hydrants.push({ x, y });
  }
  function mailbox(C, x, y) {
    let P = propTex(C);
    solidBox(C, x - 0.3, y - 0.25, 0.125, x + 0.3, y + 0.25, 0.125 + 0.85, P.mailbox, P.blue);
  }
  function newsBoxes(C, x, y, ax) {
    let P = propTex(C);
    for (let k = 0; k < 3; k++) {
      let ox = ax === "x" ? k * 0.42 : 0, oy = ax === "y" ? k * 0.42 : 0;
      solidBox(C, x + ox - 0.18, y + oy - 0.18, 0.125, x + ox + 0.18, y + oy + 0.18, 0.125 + 0.55, P.newsBoxes[(k + Math.floor(x)) % 4]);
    }
  }
  function trashBasket(C, x, y) {
    let P = propTex(C);
    solidBox(C, x - 0.2, y - 0.2, 0.125, x + 0.2, y + 0.2, 0.125 + 0.6, P.basket, P.basketTop), C.world.trash.push({ x, y });
  }
  function bench(C, x, y, axis, o = {}) {
    let P = propTex(C), z = o.z ?? 0.125, L = 1.5, [x0, x1, y0, y1] = axis === "x" ? [x - L / 2, x + L / 2, y - 0.22, y + 0.22] : [x - 0.22, x + 0.22, y - L / 2, y + L / 2];
    solidBox(C, x0, y0, z + 0.3, x1, y1, z + 0.38, P.wood, P.wood);
    let f = o.facing ?? 1;
    axis === "x" ? solidBox(C, x0, f > 0 ? y0 : y1 - 0.08, z + 0.38, x1, f > 0 ? y0 + 0.08 : y1, z + 0.8, P.wood, P.wood) : solidBox(C, f > 0 ? x0 : x1 - 0.08, y0, z + 0.38, f > 0 ? x0 + 0.08 : x1, y1, z + 0.8, P.wood, P.wood);
    for (let t of [0.1, 0.9]) {
      let lx = axis === "x" ? x0 + (x1 - x0) * t : x, ly = axis === "y" ? y0 + (y1 - y0) * t : y;
      solidBox(C, lx - 0.05, ly - 0.2, z, lx + 0.05, ly + 0.2, z + 0.3, P.black);
    }
    let seats = [];
    for (let t of [-0.45, 0, 0.45]) seats.push(axis === "x" ? { x: x + t, y, z: z + 0.32, face: [0, f] } : { x, y: y + t, z: z + 0.32, face: [f, 0] });
    C.world.benches.push({ x, y, axis, seats, used: [!1, !1, !1] });
  }
  function steamStack(C, x, y) {
    let P = propTex(C);
    C.mb.cylinder(x, y, 0, 2.6, 0.32, 8, P.stack, P.stackTop);
    for (let [dx, dy] of [[-0.7, -0.6], [0.7, 0.6], [0.65, -0.7], [-0.6, 0.7]])
      C.mb.cylinder(x + dx, y + dy, 0, 0.62, 0.18, 6, P.barrel, P.orange);
    C.world.steam.push({ x, y, z: 2.65, kind: "stack", rate: 1 }), markHeight(C.world, x - 0.4, y - 0.4, x + 0.4, y + 0.4, 2.6);
  }
  function kiosk(C, x, y) {
    let P = propTex(C);
    solidBox(C, x - 0.14, y - 0.14, 0.125, x + 0.14, y + 0.14, 0.125 + 2, P.kiosk, P.black);
  }
  function busShelter(C, x, y, axis, roadSide) {
    let P = propTex(C), z = 0.125, L = 3, D = 0.9, H = 1.8, [x0, x1, y0, y1] = axis === "x" ? [x - L / 2, x + L / 2, y - D / 2, y + D / 2] : [x - D / 2, x + D / 2, y - L / 2, y + L / 2];
    solidBox(C, x0 - 0.05, y0 - 0.05, z + H, x1 + 0.05, y1 + 0.05, z + H + 0.1, P.silver);
    let back = axis === "x" ? roadSide > 0 ? y0 : y1 : roadSide > 0 ? x0 : x1;
    axis === "x" ? C.mb.vquad(x0, back, x1, back, z, z + H, P.glass, { mat: MAT.FLAT }) : C.mb.vquad(back, y0, back, y1, z, z + H, P.glass, { mat: MAT.FLAT }), axis === "x" ? solidBox(C, x1 - 0.06, y0, z, x1, y1, z + H, P.adPanel, P.silver) : solidBox(C, x0, y1 - 0.06, z, x1, y1, z + H, P.adPanel, P.silver);
    for (let [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) solidBox(C, px - 0.04, py - 0.04, z, px + 0.04, py + 0.04, z + H, P.silver);
    bench(C, x, y, axis, { facing: -roadSide }), C.world.busStops.push({ x, y, axis, roadSide }), C.world.lamps.push({ x, y, z: z + H, r: 1.8, color: [0.85, 0.9, 1], k: 0.4, kind: "shelter" });
  }
  function subwayEntrance(C, x, y, axis) {
    let P = propTex(C), z = 0.125, L = 2.5, W = 1.1, [x0, x1, y0, y1] = axis === "x" ? [x - L / 2, x + L / 2, y - W / 2, y + W / 2] : [x - W / 2, x + W / 2, y - L / 2, y + L / 2];
    C.paintGround(x0, y0, x1, y1, axis === "x" ? "stairsX" : "stairsY");
    let rh = 0.75;
    axis === "x" ? (C.mb.vquad(x0, y0, x1, y0, z, z + rh, P.subwayRail), C.mb.vquad(x1, y1, x0, y1, z, z + rh, P.subwayRail), C.mb.vquad(x1, y0, x1, y1, z, z + rh, P.subwayRail)) : (C.mb.vquad(x0, y1, x0, y0, z, z + rh, P.subwayRail), C.mb.vquad(x1, y0, x1, y1, z, z + rh, P.subwayRail), C.mb.vquad(x0, y1, x1, y1, z, z + rh, P.subwayRail));
    let open = axis === "x" ? [[x0, y0], [x0, y1]] : [[x0, y0], [x1, y0]];
    for (let [gx, gy] of open)
      solidBox(C, gx - 0.05, gy - 0.05, z, gx + 0.05, gy + 0.05, z + 1.4, P.green), solidBox(C, gx - 0.13, gy - 0.13, z + 1.4, gx + 0.13, gy + 0.13, z + 1.65, P.globe), C.world.lamps.push({ x: gx, y: gy, z: z + 1.5, r: 1.6, color: [0.5, 1, 0.6], k: 0.5, kind: "globe" });
    let hs = 0.75;
    axis === "x" ? (C.mb.vquad(x1 + 0.02, y + hs, x1 + 0.02, y - hs, z + rh, z + rh + 0.44, P.subwaySign, { mat: MAT.NOSHADOW }), C.mb.vquad(x1, y - hs, x1, y + hs, z + rh, z + rh + 0.44, P.subwaySign, { mat: MAT.NOSHADOW })) : (C.mb.vquad(x - hs, y1 + 0.02, x + hs, y1 + 0.02, z + rh, z + rh + 0.44, P.subwaySign, { mat: MAT.NOSHADOW }), C.mb.vquad(x + hs, y1, x - hs, y1, z + rh, z + rh + 0.44, P.subwaySign, { mat: MAT.NOSHADOW }));
    let ent = axis === "x" ? { x: x0 - 0.6, y } : { x, y: y0 - 0.6 }, bottom = axis === "x" ? { x: x1 - 0.3, y } : { x, y: y1 - 0.3 };
    C.world.subways.push({ x: ent.x, y: ent.y, bx: bottom.x, by: bottom.y, axis });
  }
  function parkWall(C, x0, y0, x1, y1) {
    let P = propTex(C);
    C.mb.box(x0, y0, 0.125, x1, y1, 0.125 + 0.7, { px: P.stoneWall, nx: P.stoneWall, py: P.stoneWall, ny: P.stoneWall, pz: { t: P.stoneWallTop, world: !0 } });
  }
  function chainFence(C, xa, ya, xb, yb, h = 2.5, low = !1) {
    let P = propTex(C), tex = low ? P.chainLow : P.chain, z = 0.125;
    C.mb.vquad(xa, ya, xb, yb, z, z + h, tex, { mat: MAT.FLAT });
    let len = Math.hypot(xb - xa, yb - ya), n = Math.max(1, Math.round(len / 2));
    for (let k = 0; k <= n; k++) {
      let px = xa + (xb - xa) * k / n, py = ya + (yb - ya) * k / n;
      solidBox(C, px - 0.04, py - 0.04, z, px + 0.04, py + 0.04, z + h + 0.05, P.silver);
    }
    xa === xb ? solidBox(C, xa - 0.03, Math.min(ya, yb), z + h - 0.04, xa + 0.03, Math.max(ya, yb), z + h + 0.02, P.silver) : solidBox(C, Math.min(xa, xb), ya - 0.03, z + h - 0.04, Math.max(xa, xb), ya + 0.03, z + h + 0.02, P.silver);
  }
  function hoop(C, x, y, fx, fy) {
    let P = propTex(C), z = 0.125;
    solidBox(C, x - 0.09, y - 0.09, z, x + 0.09, y + 0.09, z + 2.4, P.blue);
    let ax = x + fx * 0.6, ay = y + fy * 0.6;
    solidBox(C, Math.min(x, ax) - 0.05, Math.min(y, ay) - 0.05, z + 2.1, Math.max(x, ax) + 0.05, Math.max(y, ay) + 0.05, z + 2.2, P.blue);
    let bw = 0.9, bh = 1.05;
    fx !== 0 ? C.mb.box(ax - 0.04, ay - bw, z + 1.85, ax + 0.04, ay + bw, z + 1.85 + bh, { px: P.backboard, nx: P.backboard, py: P.silver, ny: P.silver, pz: P.silver }) : C.mb.box(ax - bw, ay - 0.04, z + 1.85, ax + bw, ay + 0.04, z + 1.85 + bh, { py: P.backboard, ny: P.backboard, px: P.silver, nx: P.silver, pz: P.silver });
    let rx = ax + fx * 0.33, ry = ay + fy * 0.33, rr = 0.22, rz = z + 1.92;
    solidBox(C, rx - rr, ry - rr, rz, rx + rr, ry - rr + 0.04, rz + 0.04, P.rim), solidBox(C, rx - rr, ry + rr - 0.04, rz, rx + rr, ry + rr, rz + 0.04, P.rim), solidBox(C, rx - rr, ry - rr, rz, rx - rr + 0.04, ry + rr, rz + 0.04, P.rim), solidBox(C, rx + rr - 0.04, ry - rr, rz, rx + rr, ry + rr, rz + 0.04, P.rim), C.mb.vquad(rx - rr, ry, rx + rr, ry, rz - 0.38, rz, P.net, { mat: MAT.FLAT }), C.mb.vquad(rx, ry - rr, rx, ry + rr, rz - 0.38, rz, P.net, { mat: MAT.FLAT }), C.world.hoops.push({ x: rx, y: ry, z: rz, fx, fy, bx: x, by: y });
  }
  function bleachers(C, x0, y0, x1, y1, axis, rows = 3) {
    let P = propTex(C);
    for (let r = 0; r < rows; r++) {
      let h = 0.3 + r * 0.3;
      axis === "x" ? solidBox(C, x0, y0 + r * 0.45, 0.125, x1, y0 + (r + 1) * 0.45, 0.125 + h, P.bleacher, P.bleacher) : solidBox(C, x0 + r * 0.45, y0, 0.125, x0 + (r + 1) * 0.45, y1, 0.125 + h, P.bleacher, P.bleacher);
    }
  }
  function handballWall(C, x0, y0, x1, y1, h) {
    let P = propTex(C), W = Math.round(Math.max(x1 - x0, y1 - y0) * 32), H = Math.round(h * 32), front = C.atlas.alloc(W, H);
    front.p.rect(0, 0, W, H, 12170926), mural(front.p, 4, 4, W - 8, H - 20, C.rng), front.p.rect(0, H - 16, W, 2, 15921902);
    let back = C.atlas.alloc(W, H);
    smoothFill(back.p, 0, 0, W, H, 12170926, 4, 0.05), mural(back.p, 6, 6, W - 12, H - 24, C.rng), x1 - x0 > y1 - y0 ? C.mb.box(x0, y0, 0.125, x1, y1, 0.125 + h, { py: front, ny: back, px: P.concrete, nx: P.concrete, pz: P.concrete }) : C.mb.box(x0, y0, 0.125, x1, y1, 0.125 + h, { px: front, nx: back, py: P.concrete, ny: P.concrete, pz: P.concrete }), markHeight(C.world, x0, y0, x1, y1, 0.125 + h);
  }
  function playground(C, x0, y0, x1, y1) {
    let P = propTex(C), z = 0.125;
    C.paintGround(x0, y0, x1, y1, "rubber");
    let sx = x0 + 1.2, sy = y0 + 0.8;
    for (let dx of [0, 2.4])
      solidBox(C, sx + dx - 0.05, sy - 0.05, z, sx + dx + 0.05, sy + 0.05, z + 1.9, P.red), solidBox(C, sx + dx - 0.05, sy + 1.15, z, sx + dx + 0.05, sy + 1.25, z + 1.9, P.red);
    solidBox(C, sx - 0.05, sy + 0.55, z + 1.85, sx + 2.45, sy + 0.65, z + 1.95, P.red);
    for (let dx of [0.7, 1.7])
      C.world.swings.push({ x: sx + dx, y: sy + 0.6, z: z + 0.45, top: z + 1.85 });
    let tx = x1 - 1.6, ty = y0 + 0.8;
    solidBox(C, tx, ty, z, tx + 0.8, ty + 0.8, z + 1.2, P.yellow, P.blue);
    let chute = C.atlas.shared("chute", 24, 32, (p) => {
      p.rect(0, 0, 24, 32, 15253552), p.rect(0, 0, 3, 32, 13146656), p.rect(21, 0, 3, 32, 13146656), p.vline(3, 0, 32, 16310384);
    });
    C.mb.slope([tx + 0.05, ty + 2.6, z + 0.1], [tx + 0.75, ty + 2.6, z + 0.1], [tx + 0.05, ty + 0.8, z + 1.2], [tx + 0.75, ty + 0.8, z + 1.2], chute, { mat: MAT.SNOW }), C.world.slides.push({ x: tx + 0.4, y: ty + 0.4, z: z + 1.2, ex: tx + 0.4, ey: ty + 2.5 });
    let cx = (x0 + x1) / 2, cy = y1 - 1.3;
    for (let k = -2; k <= 2; k++)
      solidBox(C, cx + k * 0.35 - 0.03, cy - 0.8, z, cx + k * 0.35 + 0.03, cy + 0.8, z + 0.9 - Math.abs(k) * 0.15, P.blue), solidBox(C, cx - 0.8, cy + k * 0.35 - 0.03, z + 0.9 - Math.abs(k) * 0.15 - 0.06, cx + 0.8, cy + k * 0.35 + 0.03, z + 0.9 - Math.abs(k) * 0.15, P.green);
  }
  function scaffolding(C, fr, a0, a1) {
    let P = propTex(C), z = 0.125, h = 2.4, d0 = -1.6;
    fr.box(C.mb, a0, a1, d0, 0, z + h, z + h + 0.15, { front: P.scaffold, left: P.scaffold, right: P.scaffold, top: { t: P.scaffold } });
    for (let a = a0 + 0.1; a <= a1 - 0.05; a += 1.5)
      fr.box(C.mb, a - 0.04, a + 0.04, d0 + 0.05, d0 + 0.13, z, z + h, { front: P.silver, left: P.silver, right: P.silver });
    let p = fr.pt((a0 + a1) / 2, -0.8);
    C.world.lamps.push({ x: p[0], y: p[1], z: z + h, r: 1.6, color: [1, 0.95, 0.85], k: 0.5, kind: "shed" });
  }

  // src/world/blocks.js
  function makeContext(world, mb, atlas, rng) {
    let gp = world.ground.p, C = {
      mb,
      atlas,
      rng,
      world,
      z0: 0.125,
      ground: world.ground,
      paintGround(x0, y0, x1, y1, kind) {
        let X0 = Math.round(Math.min(x0, x1) * 32), X1 = Math.round(Math.max(x0, x1) * 32), Y0 = Math.round(Math.min(y0, y1) * 32), Y1 = Math.round(Math.max(y0, y1) * 32);
        for (let y = Y0; y < Y1; y++)
          for (let x = X0; x < X1; x++) {
            let r = groundFill(kind, x, y, X0, Y0, X1, Y1);
            r && gp.set(x, y, r[0], r[1]);
          }
      },
      addSprite(kind, x, y, z, o = {}) {
        world.props.push({ kind, x, y, z, ...o });
      },
      addTree(x, y, species, pit = !1, o = {}) {
        world.trees.push({ x, y, z: 0.125, species, variant: rng.int(0, 2), scale: o.scale ?? rng.range(0.9, 1.1) }), pit && C.paintGround(x - 0.5, y - 0.5, x + 0.5, y + 0.5, "treepit");
      },
      addBench(x, y, axis, facing = 1) {
        bench(C, x, y, axis, { facing });
      },
      addPlanter(x, y) {
        let P = propTex(C);
        mb.box(x - 0.5, y - 0.5, 0.125, x + 0.5, y + 0.5, 0.125 + 0.5, { px: P.planter, nx: P.planter, py: P.planter, ny: P.planter, pz: { t: P.soilTop, world: !0 } }), C.addSprite("bush", x, y, 0.125 + 0.5);
      },
      addFlag(fr, a, d, z, type = "us") {
        let p = fr.pt(a, d);
        world.flags.push({ x: p[0], y: p[1], z, n: fr.n, type });
        let P = propTex(C), q = fr.pt(a, d - 0.9);
        mb.box(
          Math.min(p[0], q[0]) - 0.025,
          Math.min(p[1], q[1]) - 0.025,
          z,
          Math.max(p[0], q[0]) + 0.025,
          Math.max(p[1], q[1]) + 0.025,
          z + 0.05,
          { px: P.silver, nx: P.silver, py: P.silver, ny: P.silver, pz: P.silver }
        ), world.flags[world.flags.length - 1].tip = { x: q[0], y: q[1] };
      },
      fountainPool(x, y, w, d) {
        let P = propTex(C), S2 = sharedTex(C);
        C.paintGround(x - w / 2, y - d / 2, x + w / 2, y + d / 2, "water");
        let t = 0.18, h = 0.45, rim = S2.limestone, top = { t: S2.limeTop, world: !0 };
        mb.box(x - w / 2, y - d / 2, 0.125, x + w / 2, y - d / 2 + t, 0.125 + h, { px: rim, nx: rim, py: rim, ny: rim, pz: top }), mb.box(x - w / 2, y + d / 2 - t, 0.125, x + w / 2, y + d / 2, 0.125 + h, { px: rim, nx: rim, py: rim, ny: rim, pz: top }), mb.box(x - w / 2, y - d / 2, 0.125, x - w / 2 + t, y + d / 2, 0.125 + h, { px: rim, nx: rim, py: rim, ny: rim, pz: top }), mb.box(x + w / 2 - t, y - d / 2, 0.125, x + w / 2, y + d / 2, 0.125 + h, { px: rim, nx: rim, py: rim, ny: rim, pz: top }), mb.box(
          x - w / 2 + t,
          y - d / 2 + t,
          0.125,
          x + w / 2 - t,
          y + d / 2 - t,
          0.125 + h - 0.12,
          { pz: { t: world.ground, world: !0, mat: MAT.GROUND | MAT.WET } }
        ), world.fountains.push({ x, y, z: 0.125 + h - 0.12, kind: "pool", w, d });
      },
      addSubway(x, y, axis) {
        subwayEntrance(C, x, y, axis);
      }
    };
    return C;
  }
  function groundFill(kind, x, y, X0, Y0, X1, Y1) {
    let h = hash2i(x, y, 51);
    switch (kind) {
      case "flowerbed": {
        let e = Math.min(x - X0, y - Y0, X1 - 1 - x, Y1 - 1 - y);
        return e < 2 ? [e === 0 ? 11578530 : 9078396, GC.CURB] : [shade(hash2i(x >> 1, y >> 1, 8) > 0.5 ? 5914154 : 5125156, 0.9 + h * 0.2), GC.FLOWERBED];
      }
      case "soil":
        return [shade(5914154, 0.88 + h * 0.24), GC.SOIL];
      case "treepit": {
        let e = Math.min(x - X0, y - Y0, X1 - 1 - x, Y1 - 1 - y);
        if (e < 2) return [e === 0 ? 10131086 : 8025710, GC.CURB];
        let cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
        return Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > 7 && e > 2 && ((x - X0) % 4 === 0 || (y - Y0) % 4 === 0) ? [3814704, GC.SOIL] : [shade(hash2i(x >> 1, y >> 1, 6) > 0.6 ? 6177328 : 5125670, 0.88 + h * 0.24), GC.SOIL];
      }
      case "patio": {
        let row = y >> 3, off = row % 2 ? 8 : 0, jx = (x + off) % 16 === 0, jy = y % 8 === 0, c = shade(mixc(11047546, 12098176, hash2i(x + off >> 4, row, 3)), 0.95 + h * 0.08);
        return jy ? c = 8023650 : jx ? c = 8812908 : y % 8 === 1 && (c = shade(c, 1.06)), [c, GC.PATIO];
      }
      case "plaza": {
        let jx = x % 32 === 0, jy = y % 32 === 0, tile = hash2i(x >> 5, y >> 5, 9), c = shade(mixc(13223616, 11907756, tile), 0.97 + h * 0.05);
        return jx || jy ? c = 10131344 : (x % 32 === 1 || y % 32 === 1) && (c = shade(c, 1.05)), [c, GC.PLAZA];
      }
      case "grass": {
        let n = valueNoise(x * 0.04, y * 0.04, 5), n2 = valueNoise(x * 0.15, y * 0.15, 6), c = n > 0.55 ? COL.grass : mixc(COL.grass, COL.grassDark, 0.55);
        c = shade(c, 0.9 + h * 0.12 + (n2 - 0.5) * 0.1);
        let b = hash2i(x, y >> 1, 77);
        return b > 0.9 ? c = shade(c, 1.16) : b < 0.08 && (c = shade(c, 0.84)), h > 0.996 && (c = [15921896, 15915082, 14209264][Math.floor(hash2i(x, y, 3) * 3)]), [c, GC.GRASS];
      }
      case "path": {
        let hx = x / 12, hy = y / 10.4, row = Math.floor(hy), off = row % 2 ? 0.5 : 0, fx = hx + off - Math.floor(hx + off), fy = hy - row, edge = fx < 0.12 || fy < 0.15, c = shade(7302248, 0.94 + h * 0.08);
        return edge && (c = 5591630), [c, GC.PATH];
      }
      case "court":
        return [shade(4164186, 0.97 + h * 0.05), GC.COURT];
      case "courtKey":
        return [shade(11551290, 0.97 + h * 0.05), GC.COURT];
      case "courtLine":
        return [15921902, GC.COURT_LINE];
      case "asphaltPlay":
        return [shade(5267566, 0.95 + h * 0.08), GC.COURT];
      case "rubber":
        return [h < 0.33 ? 2779808 : h < 0.66 ? 3104656 : 3831984, GC.RUBBER];
      case "water":
        return [3108744, GC.WATER];
      case "sand":
        return [shade(14468234, 0.92 + h * 0.14), GC.SAND];
      case "gravel": {
        let st = hash2i(x >> 1, y >> 1, 21);
        return [shade(st > 0.8 ? 11575434 : st < 0.2 ? 8023130 : 10127988, 0.85 + h * 0.3), GC.GRAVEL];
      }
      case "wood":
        return [shade(x % 6 === 0 ? 6964784 : x % 6 === 1 ? 11172432 : 10119748, 0.95 + h * 0.08), GC.WOOD];
      case "stairsX":
      case "stairsY": {
        let t = kind === "stairsX" ? (x - X0) / (X1 - X0) : (y - Y0) / (Y1 - Y0), step = Math.floor((kind === "stairsX" ? x - X0 : y - Y0) / 6), edge = (kind === "stairsX" ? x - X0 : y - Y0) % 6 === 0, c = mixc(9078400, 1447450, Math.min(1, t * 1.15));
        return edge && (c = shade(c, 1.25)), [c, GC.STAIRS];
      }
      case "dirt":
        return [shade(9071178, 0.88 + h * 0.24), GC.GRAVEL];
    }
    return null;
  }
  function frames(L) {
    return {
      N: new Frame(L.x1, L.y0, 0, -1),
      S: new Frame(L.x0, L.y1, 0, 1),
      E: new Frame(L.x1, L.y1, 1, 0),
      W: new Frame(L.x0, L.y0, -1, 0)
    };
  }
  function buildBlocks(C) {
    for (let by = 0; by < 4; by++)
      for (let bx = 0; bx < 4; bx++) {
        let type = BLOCK_TYPES[by][bx], L = blockRect(bx, by), fn = BLOCKS[type];
        fn && fn(C, L, bx, by);
      }
    streetFurniture(C);
  }
  var BLOCKS = {
    brownstones: (C, L) => brownstoneBlock(C, L),
    walkups: (C, L) => walkupBlock(C, L, {}),
    tenements: (C, L) => walkupBlock(C, L, { shops: 0.8, fireEscape: !0 }),
    commercial: (C, L) => walkupBlock(C, L, { shops: 1, theater: !0 }),
    bodega: (C, L) => walkupBlock(C, L, { bodegaCorner: !0, shops: 0.6 }),
    firehouse: (C, L) => walkupBlock(C, L, { firehouse: !0, shops: 0.5 }),
    lofts: (C, L) => loftBlock(C, L),
    deco: (C, L) => decoTower(C, L),
    glass: (C, L) => glassTower(C, L),
    modern: (C, L) => modernTower(C, L),
    office: (C, L) => limestoneOffice(C, L),
    court: (C, L) => courtBlock(C, L),
    park: (C, L) => parkBlock(C, L)
  };
  function brownstoneBlock(C, L) {
    let { rng } = C, F = frames(L), style = rng.pick(["brownstone", "brick", "mixed", "mixed"]);
    C.paintGround(L.x0, L.y0, L.x1, L.y1, "grass");
    let num = rng.int(10, 80) * 2;
    for (let side of ["N", "S"]) {
      let fr = F[side];
      walkup(C, fr, 0, 4.5, 8, { cornerSide: "L", floors: rng.int(4, 5), shop: rng.pick(["bodega", "pizza", "coffee", "laundry", "bar", "diner", "flowers", null]) }), walkup(C, fr, 13.5, 4.5, 8, { cornerSide: "R", floors: rng.int(4, 5), shop: rng.pick(["bodega", "pizza", "coffee", "chinese", "bar", "nails", null]) });
      for (let k = 0; k < 3; k++) {
        let st = style === "mixed" ? void 0 : style;
        rowhouse(C, fr, 4.5 + k * 3, 3, 6, { style: st, floors: rng.chance(0.7) ? 3 : 4, number: num, flag: rng.chance(0.15) }), num += 2;
      }
    }
    for (let side of ["E", "W"]) {
      let fr = F[side];
      gardenWall(C, fr, 8, 10, 0, 0.125, 1.4, "brick"), C.world.backyardGates = C.world.backyardGates || [];
    }
    let ym0 = L.y0 + 7.5, ym1 = L.y1 - 7.5;
    C.paintGround(L.x0 + 4.5, ym0, L.x1 - 4.5, ym1, "grass");
    for (let k = 0; k < 4; k++) {
      let x = L.x0 + 4.5 + k * 3;
      C.mb.box(x - 0.05, ym0, 0.125, x + 0.05, ym1, 0.125 + 0.9, sideFaces(sharedTex(C).fenceWood, sharedTex(C).wood));
    }
    C.mb.box(L.x0 + 4.5, (ym0 + ym1) / 2 - 0.05, 0.125, L.x1 - 4.5, (ym0 + ym1) / 2 + 0.05, 0.125 + 0.9, sideFaces(sharedTex(C).fenceWood, sharedTex(C).wood));
    for (let k = 0; k < 3; k++) {
      let x = L.x0 + 6 + k * 3;
      for (let y of [ym0 + 0.75, ym1 - 0.75]) {
        let r = rng.next();
        r < 0.45 ? C.addTree(x + rng.range(-0.6, 0.6), y, rng.pick(["plane", "oak", "cherry", "locust"]), !1, { scale: rng.range(0.8, 1.05) }) : r < 0.65 ? (C.paintGround(x - 1, y - 0.6, x + 0.6, y + 0.6, "patio"), C.addSprite("grill", x, y, 0.125)) : r < 0.8 ? C.addSprite("laundry", x, y, 0.125, { group: "warm" }) : C.paintGround(x - 1.2, y - 0.6, x + 1.2, y + 0.6, "flowerbed");
      }
    }
  }
  function sideFaces(side, top) {
    return { px: side, nx: side, py: side, ny: side, pz: top };
  }
  function walkupBlock(C, L, o) {
    let { rng } = C, F = frames(L);
    C.paintGround(L.x0, L.y0, L.x1, L.y1, "patio");
    let shopP = o.shops ?? 0.6, pickShop = () => rng.chance(shopP) ? rng.pick(["bodega", "pizza", "laundry", "coffee", "bar", "books", "flowers", "chinese", "nails", "hardware", "bagels", "diner", "pharmacy"]) : null, num = rng.int(100, 400);
    for (let side of ["N", "S"]) {
      let fr = F[side], widths = rng.pick([[5, 4, 4, 5], [5, 3.5, 4.5, 5], [4.5, 4.5, 4.5, 4.5], [5, 8, 5]]), a = 0;
      widths.forEach((w, k) => {
        let corner = k === 0 ? "L" : k === widths.length - 1 ? "R" : null, shop = pickShop();
        o.bodegaCorner && side === "S" && k === widths.length - 1 && (shop = "bodega"), o.firehouse && side === "S" && k === 1 ? firehouse(C, fr, a, w, 7) : o.theater && side === "S" && w >= 8 ? theater(C, fr, a, w, 7) : walkup(C, fr, a, w, 7, {
          cornerSide: corner,
          shop: corner ? shop ?? pickShop() : shop,
          number: num,
          billboard: corner && rng.chance(0.35) ? rng.pick(["cola", "bagel", "jazz", "show", "taxi", "sun", "gin"]) : null,
          floors: rng.int(4, 6),
          fireEscape: o.fireEscape ? !0 : void 0,
          resDoorLeft: corner === "R"
        }), num += 2, a += w;
      });
    }
    for (let side of ["E", "W"]) {
      let fr = F[side];
      walkup(C, fr, 7, 4, 6.5, { shop: pickShop(), floors: rng.int(4, 5), number: num++ });
    }
    C.addTree((L.x0 + L.x1) / 2, (L.y0 + L.y1) / 2, "plane", !1, { scale: 0.9 }), C.addSprite("laundry", (L.x0 + L.x1) / 2 + 1.2, (L.y0 + L.y1) / 2 - 1, 0.125, { group: "warm" });
  }
  function firehouse(C, fr, a0, W, D) {
    let { mb, rng } = C, S2 = sharedTex(C), H = 2.75 + 2 * 1.5 + 0.75, tw = Math.round(W * 32), th = Math.round(H * 32), front = C.atlas.alloc(tw, th), p = front.p;
    brickFill(p, 0, 0, tw, th, PAL.brickRed, 77), p.rect(0, 0, tw, 24, 14866106), p.hline(0, 0, tw, 15919826), p.hline(0, 23, tw, 11050112);
    {
      let tx = textWidth("ENGINE 7", 2, !0);
      p.text7(Math.max(2, Math.floor((tw - tx) / 2)), 5, "ENGINE 7", 13119532, 255, 2);
    }
    for (let f = 0; f < 2; f++) {
      let fy = 24 + f * 48;
      for (let b = 0; b < 3; b++) drawWindow(p, Math.round(tw / 3 * b + tw / 6) - 8, fy + 10, 16, 28, { frame: 15921126, lintel: 14866106, sill: 14866106, t: rng.next(), wall: PAL.brickRed[0], keystone: !0 }, rng);
    }
    let gy = 120;
    p.rect(0, gy, tw, th - gy, 14866106), p.hline(0, gy, tw, 15919826);
    let dw = tw - 40;
    p.rect(8, gy + 8, dw, th - gy - 8, 13119532), p.frame(8, gy + 8, dw, th - gy - 8, 9050648);
    for (let y = gy + 12; y < th; y += 5)
      p.hline(10, y, dw - 4, 11019296), p.hline(10, y + 1, dw - 4, 14174780);
    for (let x = 14; x < 8 + dw - 16; x += 16)
      p.rect(x, gy + 16, 10, 8, 4216685, winCode(0.1)), p.frame(x - 1, gy + 15, 12, 10, 15921126);
    p.text7(Math.floor(8 + dw / 2 - 3), gy + 30, "7", 15909424, 255, 2), drawDoor(p, tw - 26, gy + 12, 18, th - gy - 12, { color: 13119532, glass: !0 });
    let back = S2.brickRed, aabb = fr.box(mb, a0, a0 + W, 0, D, 0.125, 0.125 + H, { front, back, left: back, right: back, top: { t: S2.roofTar, world: !0 } });
    markHeight(C.world, ...aabb, 0.125 + H), C.addFlag(fr, a0 + W - 1, -0.05, 0.125 + 4.2, "us");
    let bay = fr.pt(a0 + (dw / 2 + 8) / 32, -0.5);
    C.world.firehouse = { x: bay[0], y: bay[1], n: fr.n, door: fr.pt(a0 + (dw / 2 + 8) / 32, 1.5) }, C.world.lamps.push({ x: bay[0], y: bay[1], z: 2.5, r: 2.4, color: [1, 0.9, 0.7], k: 0.6, kind: "shop" });
  }
  function theater(C, fr, a0, W, D) {
    let { mb, rng } = C, S2 = sharedTex(C), H = 7.5, tw = Math.round(W * 32), th = Math.round(H * 32), front = C.atlas.alloc(tw, th), p = front.p;
    stoneFill(p, 0, 0, tw, th, PAL.limestone, 66, 16, { blocks: 32 }), p.rect(0, 0, tw, 8, 13154448), p.hline(0, 8, tw, 10127976);
    for (let x = 2; x < tw; x += 8)
      p.rect(x, 2, 4, 4, 15260864), p.set(x + 1, 3, 12101760);
    for (let x = 8; x < tw - 8; x += 24)
      p.rect(x, 20, 12, 112, 13154448), p.vline(x + 1, 20, 112, 14734516), p.vline(x + 10, 20, 112, 11049072), p.rect(x - 2, 16, 16, 5, 14734516), drawWindow(p, x + 2, 28, 8, 44, { frame: 2829104, t: rng.next() * 0.4, rail: !1, panes: "1/1" }, rng);
    let gy = th - 68;
    p.rect(0, gy, tw, 68, 5906207), p.hline(0, gy, tw, 9058858);
    for (let x = 12; x < tw - 24; x += 28)
      p.rect(x, gy + 24, 20, 44, 14200906), p.rect(x + 2, gy + 26, 16, 42, 4216685, winCode(0.02)), p.vline(x + 10, gy + 26, 42, 14200906), p.rect(x + 7, gy + 44, 2, 6, 15782e3), p.rect(x + 11, gy + 44, 2, 6, 15782e3);
    for (let x of [2, tw - 10])
      p.rect(x, gy + 24, 8, 30, 14200906), p.rect(x + 1, gy + 25, 6, 28, 15918784, winCode(0.02, !0)), p.rect(x + 2, gy + 28, 4, 10, 13119532, winCode(0.02, !0));
    let aabb = fr.box(mb, a0, a0 + W, 0, D, 0.125, 0.125 + H, { front, back: S2.brickBrown, left: S2.brickBrown, right: S2.brickBrown, top: { t: S2.roofTar, world: !0 } });
    markHeight(C.world, ...aabb, 0.125 + H);
    let mw = Math.round((W - 1) * 32), MH = 28, marq = C.atlas.alloc(mw, MH), q = marq.p;
    q.rect(0, 0, mw, MH, 15921126), q.rect(0, 0, mw, 3, 2763310), q.rect(0, MH - 3, mw, 3, 2763310);
    let bulb = winCode(0, !0);
    for (let x = 1; x < mw; x += 3)
      q.set(x, 1, 16769658, bulb), q.set(x, MH - 2, 16769658, bulb);
    let l1 = "NOW SHOWING", l2 = "PIXEL CITY 3";
    q.text7(Math.floor((mw - textWidth(l1, 1, !0)) / 2), 5, l1, 1776411, bulb), q.text7(Math.floor((mw - textWidth(l2, 1, !0)) / 2), 15, l2, 13119532, bulb), fr.box(mb, a0 + 0.5, a0 + W - 0.5, -1.4, 0, 0.125 + 2.2, 0.125 + 3.1, { front: marq, left: S2.darkMetal, right: S2.darkMetal, top: { t: S2.darkMetal } });
    let vt = C.atlas.alloc(32, 144);
    vt.p.rect(0, 0, 32, 144, 13119532);
    for (let y = 0; y < 144; y += 3)
      vt.p.set(1, y, 16769658, winCode(0, !0)), vt.p.set(30, y, 16769658, winCode(0, !0));
    vt.p.frame(3, 3, 26, 138, 9050648), "RIALTO".split("").forEach((ch, i) => vt.p.text7(9, 6 + i * 23, ch, 16777215, winCode(0, !0), 3)), fr.sideQuad(mb, a0 + 1, -0.15, -1.15, 0.125 + 3.4, 0.125 + 3.4 + 4.5, vt, { mat: MAT.NOSHADOW }), fr.sideQuad(mb, a0 + 1.01, -1.15, -0.15, 0.125 + 3.4, 0.125 + 3.4 + 4.5, vt, { mat: MAT.NOSHADOW });
    let lp = fr.pt(a0 + W / 2, -1.5);
    C.world.lamps.push({ x: lp[0], y: lp[1], z: 0.5, r: 3.4, color: [1, 0.85, 0.5], k: 0.9, kind: "marquee" }), C.world.marquees.push({ x: lp[0], y: lp[1] }), C.world.shops.push({ kind: "theater", name: "RIALTO", x: lp[0], y: lp[1], n: fr.n });
  }
  function loftBlock(C, L) {
    let { rng } = C, F = frames(L);
    C.paintGround(L.x0, L.y0, L.x1, L.y1, "patio");
    for (let side of ["N", "S"]) {
      let fr = F[side], a = 0;
      for (let w of [6, 6, 6])
        loft(C, fr, a, w, 8, { floors: rng.int(5, 7) }), a += w;
    }
    for (let side of ["E", "W"]) gardenWall(C, F[side], 8, 10, 0, 0.125, 1.6, "brick");
    scaffolding(C, F.S, 6.2, 11.8);
  }
  function courtBlock(C, L) {
    let { rng } = C;
    C.paintGround(L.x0, L.y0, L.x1, L.y1, "asphaltPlay");
    let cx0 = L.x0 + 2, cx1 = L.x1 - 2, cy0 = L.y0 + 1.5, cy1 = L.y0 + 9.5;
    C.paintGround(cx0, cy0, cx1, cy1, "court");
    let ccx = (cx0 + cx1) / 2, ccy = (cy0 + cy1) / 2;
    C.paintGround(cx0, ccy - 1.25, cx0 + 3, ccy + 1.25, "courtKey"), C.paintGround(cx1 - 3, ccy - 1.25, cx1, ccy + 1.25, "courtKey"), courtLines(C, cx0, cy0, cx1, cy1);
    let fx0 = cx0 - 0.75, fx1 = cx1 + 0.75, fy0 = cy0 - 0.75, fy1 = cy1 + 0.75;
    chainFence(C, fx0, fy0, fx1, fy0, 2.6), chainFence(C, fx0, fy0, fx0, fy1, 2.6), chainFence(C, fx1, fy1, fx1, fy0, 2.6), chainFence(C, fx0, fy1, ccx - 1, fy1, 2.6), chainFence(C, ccx + 1, fy1, fx1, fy1, 2.6), hoop(C, cx0 + 0.3, ccy, 1, 0), hoop(C, cx1 - 0.3, ccy, -1, 0), C.world.court = { x0: cx0, y0: cy0, x1: cx1, y1: cy1, gate: { x: ccx, y: fy1 + 0.6 } };
    for (let [x, y] of [[fx0 + 0.2, fy1 - 0.2], [fx1 - 0.2, fy0 + 0.2], [fx0 + 0.2, fy0 + 0.2], [fx1 - 0.2, fy1 - 0.2]]) {
      let P = propTex(C);
      C.mb.box(x - 0.07, y - 0.07, 0.125, x + 0.07, y + 0.07, 0.125 + 4.6, sideFaces(P.silver, P.silver)), C.mb.box(x - 0.3, y - 0.3, 0.125 + 4.6, x + 0.3, y + 0.3, 0.125 + 4.85, sideFaces(P.lampHead, P.silver)), C.world.lamps.push({ x: x + (ccx - x) * 0.25, y: y + (ccy - y) * 0.25, z: 0.125 + 4.5, r: 6, color: [0.95, 0.97, 1], k: 0.9, kind: "flood" }), C.world.lampHeads.push({ x, y, z: 0.125 + 4.6, kind: "flood" });
    }
    bleachers(C, cx0 + 1.5, cy1 + 1, cx0 + 5, cy1 + 2.4, "x", 3), C.world.courtSeats = [];
    for (let k = 0; k < 6; k++) C.world.courtSeats.push({ x: cx0 + 1.8 + k % 3 * 1.1, y: cy1 + 1.25 + Math.floor(k / 3) * 0.45, z: 0.125 + 0.3 + Math.floor(k / 3) * 0.3 });
    handballWall(C, L.x0 + 1.5, L.y1 - 4.2, L.x0 + 8, L.y1 - 3.8, 2.4), C.world.handball = { x: L.x0 + 4.75, y: L.y1 - 2.8 }, playground(C, L.x0 + 9.5, L.y1 - 6.8, L.x1 - 1, L.y1 - 1), C.world.sprinklers.push({ x: L.x0 + 13.5, y: L.y1 - 3.6 }), C.paintGround(L.x0 + 12.5, L.y1 - 4.6, L.x0 + 14.5, L.y1 - 2.6, "asphaltPlay");
    for (let [x, y] of [[L.x0 + 0.8, L.y1 - 1], [L.x0 + 3.5, L.y1 - 1], [L.x0 + 6.5, L.y1 - 1]]) C.addTree(x, y, rng.pick(["plane", "oak"]), !1);
    C.addBench(L.x0 + 4.8, L.y1 - 2, "x", -1), C.addBench(L.x1 - 1, cy1 + 3, "y", -1), parkLamp(C, L.x0 + 9, L.y1 - 2.2), trashBasket(C, L.x0 + 9.5, L.y1 - 0.6), C.world.playground = { x0: L.x0 + 9.5, y0: L.y1 - 6.8, x1: L.x1 - 1, y1: L.y1 - 1 };
  }
  function courtLines(C, x0, y0, x1, y1) {
    let g = C.world.ground.p, X0 = Math.round(x0 * 32), X1 = Math.round(x1 * 32), Y0 = Math.round(y0 * 32), Y1 = Math.round(y1 * 32), line = (x, y) => g.set(x, y, 15921902, GC.COURT_LINE), k = 32 / 16;
    for (let x = X0; x < X1; x++) for (let w = 0; w < 3; w++)
      line(x, Y0 + w), line(x, Y1 - 1 - w);
    for (let y = Y0; y < Y1; y++) for (let w = 0; w < 3; w++)
      line(X0 + w, y), line(X1 - 1 - w, y);
    let mx = Math.round((X0 + X1) / 2), my = Math.round((Y0 + Y1) / 2);
    for (let y = Y0; y < Y1; y++)
      line(mx, y), line(mx - 1, y), line(mx + 1, y);
    g.ring(mx, my, 15 * k, 15 * k, 3, 15921902, GC.COURT_LINE);
    for (let [ex, dir] of [[X0, 1], [X1, -1]]) {
      let bx = ex + dir * 14 * k, R2 = 58 * k;
      for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 4e-3) {
        let px = Math.round(bx + dir * Math.cos(a) * R2), py = Math.round(my + Math.sin(a) * R2);
        py > Y0 + 6 * k && py < Y1 - 6 * k && (line(px, py), line(px + dir, py), line(px + 2 * dir, py));
      }
      for (let sy of [my - 54 * k, my + 54 * k]) for (let x = Math.min(ex, bx); x <= Math.max(ex, bx); x++)
        line(x, sy), line(x, sy + 1), line(x, sy + 2);
      let kx = ex + dir * 48 * k;
      for (let y = my - 20 * k; y <= my + 20 * k; y++)
        line(kx, y), line(kx + dir, y), line(kx + 2 * dir, y);
      for (let x = Math.min(ex, kx); x <= Math.max(ex, kx); x++) for (let w = 0; w < 3; w++)
        line(x, my - 20 * k + w), line(x, my + 20 * k - w);
      g.ring(kx, my, 16 * k, 16 * k, 3, 15921902, GC.COURT_LINE);
      for (let d of [18, 26, 34]) for (let sy of [my - 20 * k - 4, my + 20 * k + 1]) for (let w = 0; w < 3; w++) for (let t = 0; t < 3; t++) line(ex + dir * (d * k + w), sy + t);
    }
  }
  function parkBlock(C, L) {
    let { rng } = C, cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
    C.paintGround(L.x0, L.y0, L.x1, L.y1, "grass");
    let pw = 1.4;
    C.paintGround(L.x0 + 0.6, L.y0 + 0.6, L.x1 - 0.6, L.y0 + 0.6 + pw, "path"), C.paintGround(L.x0 + 0.6, L.y1 - 0.6 - pw, L.x1 - 0.6, L.y1 - 0.6, "path"), C.paintGround(L.x0 + 0.6, L.y0 + 0.6, L.x0 + 0.6 + pw, L.y1 - 0.6, "path"), C.paintGround(L.x1 - 0.6 - pw, L.y0 + 0.6, L.x1 - 0.6, L.y1 - 0.6, "path"), C.paintGround(cx - pw / 2, L.y0, cx + pw / 2, L.y1, "path"), C.paintGround(L.x0, cy - pw / 2, L.x1, cy + pw / 2, "path");
    for (let t = 0; t <= 1; t += 4e-3)
      for (let [ax, ay, bx, by] of [[L.x0 + 1, L.y0 + 1, cx, cy], [L.x1 - 1, L.y1 - 1, cx, cy], [L.x1 - 1, L.y0 + 1, cx, cy], [L.x0 + 1, L.y1 - 1, cx, cy]]) {
        let x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        C.paintGround(x - 0.55, y - 0.55, x + 0.55, y + 0.55, "path");
      }
    circleGround(C, cx, cy, 3.2, "plaza"), circleGround(C, cx, cy, 2.1, "water"), ringWall(C, cx, cy, 2.1, 0.25, 0.5);
    let S2 = sharedTex(C);
    C.mb.cylinder(cx, cy, 0.125, 0.125 + 0.9, 0.35, 8, S2.limestone, S2.limeTop), C.mb.cylinder(cx, cy, 0.125 + 0.9, 0.125 + 1, 0.7, 8, S2.limestone, S2.limeTop), C.world.fountains.push({ x: cx, y: cy, z: 0.125 + 1, kind: "center", r: 2.1 }), C.world.parkCenter = { x: cx, y: cy };
    for (let k = 0; k < 8; k++) {
      if (k % 2 === 0) continue;
      let a = k / 8 * Math.PI * 2, bx = cx + Math.cos(a) * 3, by = cy + Math.sin(a) * 3;
      C.addBench(bx, by, Math.abs(Math.cos(a)) > 0.7 ? "y" : "x", Math.cos(a) > 0.3 || Math.sin(a) > 0.3 ? 1 : -1);
    }
    let px = L.x1 - 4.6, py = L.y0 + 4.6;
    ellipseGround(C, px, py, 2.9, 2.3, "sand"), ellipseGround(C, px, py, 2.6, 2, "water"), C.world.pond = { x: px, y: py, rx: 2.4, ry: 1.8 };
    let dx0 = L.x1 - 7.2, dy0 = L.y1 - 7.2, dx1 = L.x1 - 2.4, dy1 = L.y1 - 2.4;
    C.paintGround(dx0, dy0, dx1, dy1, "gravel"), chainFence(C, dx0, dy0, dx1, dy0, 1.1, !0), chainFence(C, dx0, dy0, dx0, dy1, 1.1, !0), chainFence(C, dx1, dy1, dx1, dy0, 1.1, !0), chainFence(C, dx0, dy1, dx0 + 2, dy1, 1.1, !0), chainFence(C, dx0 + 3, dy1, dx1, dy1, 1.1, !0), C.world.dogRun = { x0: dx0, y0: dy0, x1: dx1, y1: dy1, gate: { x: dx0 + 2.5, y: dy1 + 0.5 } };
    let sx = L.x0 + 4.6, sy = L.y1 - 4.6;
    circleGround(C, sx, sy, 1.9, "flowerbed"), C.mb.box(sx - 0.55, sy - 0.55, 0.125, sx + 0.55, sy + 0.55, 0.125 + 1.3, sideFaces(S2.greystone, { t: S2.limeTop })), C.addSprite("statue", sx, sy, 0.125 + 1.3);
    let treeSpots = [
      [L.x0 + 3.4, L.y0 + 4.2, "cherry"],
      [L.x0 + 5.8, L.y0 + 3, "cherry"],
      [L.x0 + 3, L.y0 + 6.6, "oak"],
      [L.x0 + 6.6, L.y0 + 6.4, "elm"],
      [L.x1 - 7.2, L.y0 + 3, "plane"],
      [L.x1 - 3, L.y0 + 7.6, "elm"],
      [L.x1 - 7.8, L.y0 + 6.8, "oak"],
      [L.x0 + 3, L.y1 - 7.8, "plane"],
      [L.x0 + 7, L.y1 - 3, "oak"],
      [L.x0 + 7.4, L.y1 - 7, "cherry"],
      [L.x1 - 1.6, L.y1 - 9.6, "pine"],
      [L.x0 + 1.7, L.y0 + 9.6 - 3, "pine"],
      [L.x1 - 3.2, L.y1 - 1.4, "locust"],
      [L.x0 + 9.6 + 2.2, L.y0 + 2.6, "elm"]
    ];
    for (let [x, y, sp] of treeSpots) C.addTree(x, y, sp, !1, { scale: rng.range(1, 1.25) });
    C.world.picnic = { x: L.x0 + 5, y: L.y0 + 5, r: 1.8 }, C.world.lawns = [
      { x0: L.x0 + 2.2, y0: L.y0 + 2.2, x1: cx - 1.6, y1: cy - 1.6 },
      { x0: cx + 1.6, y0: cy + 1.6, x1: L.x1 - 7.6, y1: L.y1 - 2.2 },
      { x0: L.x0 + 2.2, y0: cy + 1.6, x1: cx - 1.6, y1: L.y1 - 2.2 }
    ];
    let w = 0.25, gaps = (a0, a1, mid) => [[a0, mid - 1.2], [mid + 1.2, a1]];
    for (let [a, b] of gaps(L.x0 + 1.4, L.x1 - 1.4, cx))
      parkWall(C, a, L.y0, b, L.y0 + w), parkWall(C, a, L.y1 - w, b, L.y1);
    for (let [a, b] of gaps(L.y0 + 1.4, L.y1 - 1.4, cy))
      parkWall(C, L.x0, a, L.x0 + w, b), parkWall(C, L.x1 - w, a, L.x1, b);
    for (let [x, y] of [
      [cx - 1.3, L.y0 + 2.6],
      [cx + 1.3, L.y1 - 2.6],
      [L.x0 + 2.6, cy + 1.3],
      [L.x1 - 2.6, cy - 1.3],
      [cx - 3.6, cy - 3.6],
      [cx + 3.6, cy + 3.6],
      [cx + 3.6, cy - 3.6],
      [cx - 3.6, cy + 3.6]
    ]) parkLamp(C, x, y);
    C.addBench(L.x0 + 2.4, cy + 2.2, "y", 1), C.addBench(L.x0 + 2.4, cy - 2.4, "y", 1), C.addBench(cx + 2.4, L.y0 + 2.5, "x", 1), C.addBench(cx - 2.6, L.y1 - 2.5, "x", -1), C.addBench(L.x1 - 2.4, cy + 2.4, "y", -1), trashBasket(C, cx + 1.2, L.y0 + 2.6), trashBasket(C, L.x0 + 2.6, cy - 1.2), C.world.carts.push({ x: L.x0 - 0.9, y: cy + 3, kind: "hotdog", axis: "y" }), C.world.park = { ...L, cx, cy };
  }
  function circleGround(C, cx, cy, r, kind) {
    let g = C.world.ground.p;
    for (let y = Math.floor((cy - r) * 32); y < Math.ceil((cy + r) * 32); y++)
      for (let x = Math.floor((cx - r) * 32); x < Math.ceil((cx + r) * 32); x++) {
        let dx = (x + 0.5) / 32 - cx, dy = (y + 0.5) / 32 - cy;
        if (dx * dx + dy * dy <= r * r) {
          let f = groundFill(kind, x, y, 0, 0, 1e9, 1e9);
          f && g.set(x, y, f[0], f[1]);
        }
      }
  }
  function ellipseGround(C, cx, cy, rx, ry, kind) {
    let g = C.world.ground.p;
    for (let y = Math.floor((cy - ry) * 32); y < Math.ceil((cy + ry) * 32); y++)
      for (let x = Math.floor((cx - rx) * 32); x < Math.ceil((cx + rx) * 32); x++) {
        let dx = ((x + 0.5) / 32 - cx) / rx, dy = ((y + 0.5) / 32 - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          let f = groundFill(kind, x, y, 0, 0, 1e9, 1e9);
          f && g.set(x, y, f[0], f[1]);
        }
      }
  }
  function ringWall(C, cx, cy, r, w, h) {
    let S2 = sharedTex(C), n = 16;
    for (let k = 0; k < n; k++) {
      let a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, am = (a0 + a1) / 2, x = cx + Math.cos(am) * r, y = cy + Math.sin(am) * r, half = Math.PI * r / n + 0.02, tx = -Math.sin(am), ty = Math.cos(am), ex = Math.abs(tx) * half + Math.abs(Math.cos(am)) * w / 2, ey = Math.abs(ty) * half + Math.abs(Math.sin(am)) * w / 2;
      C.mb.box(x - ex, y - ey, 0.125, x + ex, y + ey, 0.125 + h, sideFaces(S2.limestone, { t: S2.limeTop }));
    }
  }
  function streetFurniture(C) {
    let { rng } = C, W = C.world;
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++) {
        let rx = roadCenter(i), ry = roadCenter(j);
        for (let sx of [-1, 1])
          for (let sy of [-1, 1]) signalPole(C, rx + sx * 2.85, ry + sy * 2.85, sx, sy, i, j);
      }
    for (let by = 0; by < 4; by++)
      for (let bx = 0; bx < 4; bx++) {
        let type = BLOCK_TYPES[by][bx], L = blockRect(bx, by), residential = ["brownstones", "walkups", "tenements", "bodega", "firehouse", "commercial", "lofts"].includes(type), sides = [
          { ax: "x", y: L.y0 - 2 + 0.35, x0: L.x0, x1: L.x1, ny: -1, nx: 0, name: "N" },
          { ax: "x", y: L.y1 + 2 - 0.35, x0: L.x0, x1: L.x1, ny: 1, nx: 0, name: "S" },
          { ax: "y", x: L.x0 - 2 + 0.35, y0: L.y0, y1: L.y1, nx: -1, ny: 0, name: "W" },
          { ax: "y", x: L.x1 + 2 - 0.35, y0: L.y0, y1: L.y1, nx: 1, ny: 0, name: "E" }
        ];
        for (let s of sides) {
          let at = (t, off = 0) => s.ax === "x" ? [s.x0 + t, s.y - s.ny * off] : [s.x - s.nx * off, s.y0 + t];
          for (let t of [5, 13]) {
            let [x, y] = at(t);
            streetLamp(C, x, y, s.nx, s.ny);
          }
          let treeTs = residential ? [2.6, 7.6, 10.4, 15.4] : type === "park" ? [3, 9, 15] : type === "court" ? [3, 15] : [3.2, 14.8];
          for (let t of treeTs)
            if (rng.chance(residential ? 0.9 : 0.8)) {
              let [x, y] = at(t, 0.35);
              C.addTree(x, y, residential ? rng.pick(["plane", "locust", "plane", "oak"]) : "plane", !0);
            }
          {
            let [x, y] = at(rng.range(8.2, 9.6), 0);
            hydrant(C, x, y);
          }
          {
            let [x, y] = at(0.8, -0.05);
            rng.chance(0.7) && trashBasket(C, x, y);
          }
          if (rng.chance(0.35)) {
            let [x, y] = at(17, 0.1);
            mailbox(C, x, y);
          } else if (rng.chance(0.35)) {
            let [x, y] = at(16.6, 0.1);
            newsBoxes(C, x, y, s.ax);
          }
          if (!residential && rng.chance(0.5)) {
            let [x, y] = at(11.2, 0);
            kiosk(C, x, y);
          }
        }
      }
    busShelter(C, lotStart(1) + 9, lotEnd(1) + 2 - 0.8, "x", 1), busShelter(C, lotEnd(2) + 2 - 0.8, lotStart(3) + 9, "y", 1), W.busRoute = !0, steamStack(C, lotStart(1) + 5.5, roadCenter(2) - 1.85), steamStack(C, roadCenter(3) + 1.85, lotStart(1) + 6), steamStack(C, lotStart(2) + 12, roadCenter(4) + 1.85), W.stacksBlock = [
      { x: lotStart(1) + 5.5, y: roadCenter(2) - 1.85 },
      { x: roadCenter(3) + 1.85, y: lotStart(1) + 6 },
      { x: lotStart(2) + 12, y: roadCenter(4) + 1.85 }
    ], subwayEntrance(C, lotStart(2) - 1, lotStart(2) + 4.5, "y"), subwayEntrance(C, lotStart(0) + 14, lotEnd(3) + 1, "x"), W.carts.push({ x: lotStart(1) + 14, y: lotEnd(0) + 1.3, kind: "halal", axis: "x" }), W.carts.push({ x: lotEnd(1) + 0.9, y: lotStart(2) + 14.5, kind: "pretzel", axis: "y" });
    for (let c of W.carts) buildCart(C, c);
    for (let m of W.groundInfo.manholes) rng.chance(0.35) && W.steam.push({ x: m.x, y: m.y, z: 0.02, kind: "manhole", rate: 0.4 });
  }
  function buildCart(C, c) {
    let P = propTex(C), A = C.atlas, n = cartNormal(c);
    c.nx = n[0], c.ny = n[1];
    let along = c.axis === "x" ? [1, 0] : [0, 1], L = 1.3, D = 0.7, H = 0.95, cx = c.x, cy = c.y, x0 = cx - (along[0] * L + Math.abs(n[0]) * D) / 2, x1 = cx + (along[0] * L + Math.abs(n[0]) * D) / 2, y0 = cy - (along[1] * L + Math.abs(n[1]) * D) / 2, y1 = cy + (along[1] * L + Math.abs(n[1]) * D) / 2, sideFor = (len) => A.shared(`cart_side_${c.kind}_${len}`, len, 24, (p) => {
      for (let y = 0; y < 24; y++) for (let x = 0; x < len; x++) p.set(x, y, (x + y) % 7 === 0 ? 14541028 : x % 16 === 0 ? 11054258 : 13159634);
      let [bg, fg, word] = c.kind === "halal" ? [13119532, 15909424, "HALAL"] : c.kind === "pretzel" ? [2052e3, 15909424, "PRETZEL"] : [15909424, 13119532, "HOT DOG"];
      p.rect(0, 3, len, 11, bg), p.hline(0, 3, len, shade(bg, 1.2)), p.hline(0, 13, len, shade(bg, 0.7));
      let tw = textWidth(word, 1, !0);
      if (tw <= len - 1) p.text7(Math.floor((len - tw) / 2), 5, word, fg, 255);
      else {
        let cx2 = len >> 1;
        c.kind === "hotdog" ? (p.ellipse(cx2, 8, 7, 3, 14196816), p.rect(cx2 - 7, 7, 14, 2, 12079146), p.hline(cx2 - 5, 7, 10, 15909424)) : c.kind === "pretzel" ? (p.ring(cx2 - 2, 8, 3.5, 3.5, 1.4, 9062938), p.ring(cx2 + 2, 8, 3.5, 3.5, 1.4, 9062938), p.set(cx2 - 2, 7, 15921902), p.set(cx2 + 3, 9, 15921902)) : (p.ellipse(cx2, 9, 7, 3, 15921902), p.ellipse(cx2 - 2, 8, 3, 1.6, 10115626), p.ellipse(cx2 + 3, 9, 2.5, 1.4, 15919280));
      }
      for (let k = 0; k * 14 + 4 < len - 8; k++)
        p.rect(4 + k * 14, 16, 10, 5, [14195280, 15259824, 9062954][k % 3]), p.frame(4 + k * 14, 16, 10, 5, 15921902);
      p.rect(0, 22, len, 2, 5922147);
    }), longSide = sideFor(42), shortSide = sideFor(22), top = A.shared("cart_top", 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, (x * 3 + y) % 9 === 0 ? 9080468 : 11843774);
      p.frame(0, 0, 32, 32, 9080468), p.rect(3, 3, 12, 11, 3811874);
      for (let k = 0; k < 4; k++) p.rect(5 + k * 2, 5, 1, 7, 13138490);
      p.rect(18, 4, 11, 9, 14196816);
      for (let k = 0; k < 3; k++) p.ellipse(21 + k * 3, 8, 1.2, 1.2, 10115616);
      p.rect(4, 18, 24, 10, 10133672), p.frame(4, 18, 24, 10, 6975092);
    }), F = c.axis === "x" ? { py: longSide, ny: longSide, px: shortSide, nx: shortSide } : { px: longSide, nx: longSide, py: shortSide, ny: shortSide };
    C.mb.box(x0, y0, 0.125 + 0.2, x1, y1, 0.125 + H, { ...F, pz: { t: top } });
    for (let [wx, wy] of [[x0 + 0.1, y0 + 0.1], [x1 - 0.1, y1 - 0.1]]) C.mb.box(wx - 0.06, wy - 0.06, 0.125, wx + 0.06, wy + 0.06, 0.125 + 0.25, { px: P.black, nx: P.black, py: P.black, ny: P.black, pz: P.black });
    C.addSprite("cartUmbrella", cx, cy, 0.125 + H, { cart: c.kind }), C.world.steam.push({ x: cx, y: cy, z: 0.125 + H + 0.1, kind: "cart", rate: 0.6 }), C.world.lamps.push({ x: cx, y: cy, z: 1.5, r: 1.5, color: [1, 0.9, 0.7], k: 0.45, kind: "shop", group: GRP.DAY });
  }
  function cartNormal(c) {
    let lx = (c.x % 27 + 27) % 27, ly = (c.y % 27 + 27) % 27;
    return c.axis === "x" ? ly < 4.5 ? [0, 1] : ly > 4.5 && ly < 9 ? [0, -1] : [0, 1] : lx < 4.5 ? [1, 0] : [-1, 0];
  }

  // src/world/world.js
  function buildWorld(seed = 1977, progress = () => {
  }) {
    let rng = new RNG(seed), atlas = new Atlas(2048), groundPage = new Page(117 * 32, 117 * 32), groundReg = { layer: 0, x: 0, y: 0, w: 117 * 32, h: 117 * 32, p: new Painter(groundPage, 0, 0, 117 * 32, 117 * 32), page: groundPage };
    progress("Paving streets");
    let groundInfo = paintGround(groundReg, rng), tex = makeBaseTextures(atlas), mb = new MeshBuilder();
    buildGroundGeometry(mb, groundReg, tex), buildSlabSides(mb, atlas, tex);
    let world = {
      rng,
      atlas,
      tex,
      ground: groundReg,
      groundPage,
      groundInfo,
      heights: new Float32Array(117 * 117),
      lamps: [],
      lampHeads: [],
      trees: [],
      props: [],
      doors: [],
      officeDoors: [],
      benches: [],
      steam: [],
      signals: [],
      shops: [],
      stoopSeats: [],
      perches: [],
      pigeonCoops: [],
      beacons: [],
      flags: [],
      fountains: [],
      hydrants: [],
      trash: [],
      hoops: [],
      swings: [],
      slides: [],
      sprinklers: [],
      busStops: [],
      subways: [],
      carts: [],
      marquees: [],
      blocks: []
    };
    for (let by = 0; by < 4; by++)
      for (let bx = 0; bx < 4; bx++) world.blocks.push({ bx, by, type: BLOCK_TYPES[by][bx] });
    progress("Raising buildings");
    let C = makeContext(world, mb, atlas, rng);
    return buildBlocks(C), world.mesh = mb.finish(), world;
  }

  // src/sim/environment.js
  var SEASONS = [
    { name: "Spring", icon: "\u273F", rise: 6.4, set: 19.6, maxEl: 58, swing: 0.15, tHi: 64, tLo: 49 },
    { name: "Summer", icon: "\u2600", rise: 5.5, set: 20.5, maxEl: 72, swing: 0.45, tHi: 88, tLo: 73 },
    { name: "Autumn", icon: "\u2766", rise: 7, set: 18.4, maxEl: 42, swing: -0.05, tHi: 61, tLo: 47 },
    { name: "Winter", icon: "\u2744", rise: 7.2, set: 16.7, maxEl: 27, swing: -0.4, tHi: 36, tLo: 25 }
  ];
  var keyLerp = (keys, x) => {
    if (x <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++)
      if (x <= keys[i][0]) {
        let a = keys[i - 1], b = keys[i], t = (x - a[0]) / (b[0] - a[0]);
        return Array.isArray(a[1]) ? a[1].map((v, k) => lerp(v, b[1][k], t)) : lerp(a[1], b[1], t);
      }
    return keys[keys.length - 1][1];
  }, hexv = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255], SKY_TOP = [[-18, hexv(461597)], [-8, hexv(1450058)], [-2, hexv(3096442)], [2, hexv(4878256)], [8, hexv(6067158)], [20, hexv(5612524)], [50, hexv(4560870)]], SKY_BOT = [[-18, hexv(1317432)], [-8, hexv(3813990)], [-2, hexv(11559034)], [2, hexv(16095842)], [8, hexv(16172943)], [20, hexv(12181750)], [50, hexv(12904442)]], SUN_COL = [[-2, [0, 0, 0]], [1, [0.55, 0.28, 0.14]], [5, [0.85, 0.55, 0.32]], [12, [0.9, 0.74, 0.55]], [25, [0.82, 0.78, 0.68]], [50, [0.8, 0.78, 0.72]]], AMB = [[-18, [0.17, 0.19, 0.31]], [-8, [0.22, 0.22, 0.38]], [-2, [0.36, 0.3, 0.42]], [3, [0.5, 0.44, 0.48]], [10, [0.56, 0.56, 0.6]], [30, [0.6, 0.63, 0.7]]], RES_LIT = [[0, 0.24], [2, 0.12], [4.5, 0.06], [6.5, 0.3], [8.5, 0.16], [12, 0.1], [16.5, 0.16], [19, 0.46], [21.5, 0.55], [23, 0.4], [24, 0.24]], OFF_LIT = [[0, 0.12], [5.5, 0.1], [7.5, 0.45], [9, 0.75], [17, 0.75], [19, 0.5], [21, 0.3], [24, 0.12]], CROWN = [
    [[1, 0.55, 0.8], [1, 1, 1]],
    [[1, 0.25, 0.25], [0.35, 0.5, 1]],
    [[1, 0.55, 0.12], [1, 0.85, 0.3]],
    [[1, 0.2, 0.25], [0.25, 0.95, 0.4]]
  ], Environment = class {
    constructor(seed = 7) {
      this.rng = new RNG(seed), this.day = 0, this.hour = 16.6, this.startSeason = 1, this.dayLength = 720, this.speed = 1, this.paused = !1, this.seasonOverride = null, this.weatherOverride = null, this.snowCover = 0, this.wetness = 0, this.precip = 0, this.cloudiness = 0.1, this.fog = 0, this.wind = 0.3, this.windDir = 0.6, this.flash = 0, this.lightningTimer = 4, this.cloudOff = [0, 0], this.listeners = [], this.planDay(!0), this.u = {}, this.compute(0);
    }
    get season() {
      return this.seasonOverride != null ? this.seasonOverride : (this.startSeason + this.day) % 4;
    }
    get seasonInfo() {
      return SEASONS[this.season];
    }
    onEvent(fn) {
      this.listeners.push(fn);
    }
    emit(ev, data) {
      for (let f of this.listeners) f(ev, data);
    }
    planDay(first = !1) {
      let s = this.season, r = this.rng, opts = [
        [["clear", 45], ["cloudy", 25], ["rain", 30]],
        [["clear", 60], ["cloudy", 12], ["storm", 28]],
        [["clear", 40], ["cloudy", 30], ["rain", 22], ["fog", 8]],
        [["clear", 22], ["cloudy", 20], ["snow", 58]]
      ][s], w = first ? "clear" : r.weighted(opts);
      if (this.plan = { base: w, start: 0, end: 0, intensity: 0 }, w === "rain" || w === "snow" || w === "storm") {
        let start = w === "storm" ? r.range(13, 18) : r.range(5, 16), dur = w === "storm" ? r.range(1.5, 3) : r.range(3, 9);
        this.plan.start = start, this.plan.end = start + dur, this.plan.intensity = w === "storm" ? 1 : r.range(0.45, 1), w === "snow" && r.chance(0.5) && (this.plan.start = 0, this.plan.end = r.range(6, 14));
      }
      first && (this.plan = { base: "clear", start: 23.2, end: 25, intensity: 0.8, lateStorm: !0 }), s === 3 && this.snowCover < 0.5 && (this.snowCover = 0.75);
    }
    setSeason(s) {
      this.seasonOverride = s, s === 3 && (this.snowCover = Math.max(this.snowCover, 0.8)), this.emit("season", s);
    }
    setWeather(w) {
      this.weatherOverride = w;
    }
    currentWeather() {
      if (this.weatherOverride) return this.weatherOverride;
      let p = this.plan, h = this.hour;
      return p.end > p.start && h >= p.start - 0.5 && h <= p.end + 0.5 ? p.lateStorm ? this.season === 3 ? "snow" : "storm" : p.base : p.base === "rain" || p.base === "storm" || p.base === "snow" ? "cloudy" : p.base;
    }
    update(dt) {
      if (!this.paused) {
        let hoursPerSec = 24 / this.dayLength * this.speed;
        if (this.hour += dt * hoursPerSec, this.hour >= 24) {
          this.hour -= 24;
          let prevSeason = this.season;
          this.day++, this.seasonOverride == null && prevSeason !== this.season && this.emit("season", this.season), this.planDay(), this.emit("day", this.day);
        }
      }
      this.compute(dt);
    }
    // sun elevation (deg) and direction
    sunAt(h) {
      let S2 = SEASONS[this.season], el, az;
      if (h >= S2.rise && h <= S2.set) {
        let t = (h - S2.rise) / (S2.set - S2.rise);
        el = S2.maxEl * Math.sin(Math.PI * t), az = -S2.swing + (Math.PI + 2 * S2.swing) * t;
      } else {
        let nightLen = 24 - S2.set + S2.rise, t = (h > S2.set ? h - S2.set : h + 24 - S2.set) / nightLen;
        el = -22 * Math.sin(Math.PI * t), az = Math.PI + S2.swing + (Math.PI - 2 * S2.swing) * t;
      }
      return { el, az };
    }
    compute(dt) {
      let u = this.u, s = this.season, h = this.hour, wtype = this.currentWeather(), tgtPrecip = (() => {
        if (wtype === "rain" || wtype === "snow" || wtype === "storm") {
          let p = this.plan;
          if (this.weatherOverride) return wtype === "storm" ? 1 : 0.8;
          let ramp = Math.min(smoothstep(p.start - 0.5, p.start + 0.5, h), 1 - smoothstep(p.end - 0.5, p.end + 0.5, h));
          return (p.intensity || 0.8) * (p.lateStorm ? 1 : ramp);
        }
        return 0;
      })(), k = 1 - Math.exp(-dt * 0.6);
      this.precip += (tgtPrecip - this.precip) * k;
      let isSnow = wtype === "snow" || s === 3 && this.precip > 0.05 && wtype !== "rain";
      this.snowing = isSnow && this.precip > 0.05, this.raining = !isSnow && this.precip > 0.05, this.storm = wtype === "storm";
      let tgtCloud = wtype === "clear" ? 0.12 : wtype === "cloudy" ? 0.55 : wtype === "fog" ? 0.75 : 0.85;
      this.cloudiness += (tgtCloud - this.cloudiness) * k, this.fog += ((wtype === "fog" ? 0.6 : wtype === "rain" ? 0.12 : 0) - this.fog) * k, this.wind += ((this.storm ? 1 : s === 2 ? 0.6 : s === 3 ? 0.5 : 0.3) - this.wind) * k * 0.3;
      let dh = this.paused ? 0 : dt * (24 / this.dayLength) * this.speed;
      this.snowing ? this.snowCover = Math.min(1, this.snowCover + dh * 0.35 * this.precip) : s !== 3 && (this.snowCover = Math.max(0, this.snowCover - dh * (s === 0 ? 0.25 : 0.8))), this.raining ? this.wetness = Math.min(1, this.wetness + dh * 3 * this.precip + (this.weatherOverride ? dt * 0.3 : 0)) : this.wetness = Math.max(0, this.wetness - dh * (s === 1 ? 0.5 : 0.25)), s === 3 && this.wetness > 0.3 && (this.wetness = 0.3), this.flash = Math.max(0, this.flash - dt * 4), this.storm && this.precip > 0.4 && (this.lightningTimer -= dt, this.lightningTimer <= 0 && (this.lightningTimer = this.rng.range(3, 12), this.flash = 1, this.emit("lightning", { dist: this.rng.range(0.2, 1) })));
      let wd = this.windDir;
      this.cloudOff[0] += dt * 2e-3 * (0.4 + this.wind) * Math.cos(wd), this.cloudOff[1] += dt * 2e-3 * (0.4 + this.wind) * Math.sin(wd);
      let sun = this.sunAt(h);
      this.sunEl = sun.el;
      let elR = sun.el * Math.PI / 180, sunDir = [Math.cos(sun.az) * Math.cos(elR), Math.sin(sun.az) * Math.cos(elR), Math.sin(elR)], cloudK = clamp(this.cloudiness, 0, 1), top = keyLerp(SKY_TOP, sun.el), bot = keyLerp(SKY_BOT, sun.el), gray = sun.el > -4 ? [0.55, 0.6, 0.66] : [0.1, 0.11, 0.16], grayB = sun.el > -4 ? [0.7, 0.73, 0.76] : [0.14, 0.15, 0.2];
      u.skyTop = top.map((v, i) => lerp(v, gray[i] * (sun.el > 8 ? 1 : 0.75), cloudK * 0.75)), u.skyBottom = bot.map((v, i) => lerp(v, grayB[i] * (sun.el > 8 ? 1 : 0.75), cloudK * 0.7));
      let night = 1 - smoothstep(-8, 2, sun.el);
      this.night = night, this.darkness = 1 - smoothstep(-4, 10, sun.el);
      let sunCol = keyLerp(SUN_COL, sun.el).map((v) => v * (1 - 0.82 * cloudK)), key = sunDir;
      if (sun.el < 0) {
        let mAz = sun.az + Math.PI * 0.85, mEl = clamp(-sun.el * 1.8 + 12, 5, 55) * Math.PI / 180, md = [Math.cos(mAz) * Math.cos(mEl), Math.sin(mAz) * Math.cos(mEl), Math.sin(mEl)], mk = smoothstep(-1, -8, sun.el) * (1 - 0.85 * cloudK);
        key = md, sunCol = [0.16 * mk, 0.2 * mk, 0.32 * mk], u.moon = [0.78, 0.8, smoothstep(-2, -10, sun.el) * (1 - cloudK * 0.9)];
      } else u.moon = [0.78, 0.8, 0];
      u.sunDir = key, u.sunCol = sunCol;
      let amb = keyLerp(AMB, sun.el).map((v) => v * (1 + cloudK * 0.18));
      u.amb = amb, u.face = [1, 0.88, 0.72], u.stars = smoothstep(-4, -12, sun.el) * (1 - cloudK), u.emis = 0.06 + 0.94 * this.darkness * this.darkness, u.snow = this.snowCover, u.wet = this.wetness, u.cloud = [this.cloudOff[0], this.cloudOff[1], clamp(0.25 + cloudK * 0.75, 0, 1), sun.el > 0 ? 0.45 + cloudK * 0.3 : 0], u.flash = this.flash * 0.9;
      let dk = this.darkness;
      u.resLit = clamp(keyLerp(RES_LIT, h) + dk * 0.08 + cloudK * 0.06, 0, 1), u.offLit = clamp(keyLerp(OFF_LIT, h) + dk * 0.05, 0, 1), u.leaves = s === 2 ? 0.85 : 0, u.season = s, u.flowers = [1, 0.8, 0.35, 0][s], u.ice = s === 3 ? 1 : 0, u.crown = smoothstep(-2, -7, sun.el) > 0 ? smoothstep(-1, -6, sun.el) : 0, u.crownA = CROWN[s][0], u.crownB = CROWN[s][1], u.bloom = 0.25 + 0.6 * night, u.sat = 1.08 - cloudK * 0.15, u.grade = [1, 1, 1], sun.el > 0 && sun.el < 12 && (u.grade = [1.04, 0.99, 0.94]), u.outline = 0.22;
      {
        let f = clamp(this.fog * 0.9 + (this.snowing ? 0.18 * this.precip : 0) + (this.raining ? 0.1 * this.precip : 0), 0, 0.75), fc = u.skyBottom.map((v, i) => v * 0.55 + [0.62, 0.65, 0.7][i] * 0.45 * (1 - this.darkness * 0.75));
        u.fogv = [fc[0], fc[1], fc[2], f];
      }
      u.vis = this.visMask(h, s), this.lampsOn = sun.el < 5 || cloudK > 0.7 && sun.el < 12 || this.fog > 0.3;
    }
    visMask(h, s) {
      let m = 1 << GRP.ALWAYS;
      m |= 1 << [GRP.SPRING, GRP.SUMMER, GRP.AUTUMN, GRP.WINTER][s], s !== 3 && (m |= 1 << GRP.NOT_WINTER), s !== 1 && (m |= 1 << GRP.NOT_SUMMER);
      let shopsOpen = h >= 7 && h < 22.5;
      return m |= 1 << (shopsOpen ? GRP.DAY : GRP.NIGHT), s === 1 && h >= 9 && h < 20.5 && (m |= 1 << GRP.SUMMER_DAY), s !== 3 && h >= 7 && h < 23 && (m |= 1 << GRP.FOUNTAIN), m |= 1 << (s === 3 ? GRP.XMAS : GRP.NOT_XMAS), m |= 1 << (s === 3 ? GRP.ICE : GRP.NO_ICE), m |= 1 << GRP.CONSTRUCTION, m |= 1 << (h >= 7 && h < 23 ? GRP.GATE_OPEN : GRP.GATE_CLOSED), (s === 0 || s === 1) && (m |= 1 << GRP.SUMMER_OR_SPRING), s === 1 && (m |= 1 << GRP.WARM), m >>> 0;
    }
    temperature() {
      let S2 = SEASONS[this.season], t = 0.5 - 0.5 * Math.cos((this.hour - 4) / 24 * Math.PI * 2);
      return Math.round(lerp(S2.tLo, S2.tHi, t) - this.precip * 4);
    }
    timeString() {
      let h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60), ap = h >= 12 ? "PM" : "AM";
      return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${ap}`;
    }
  };

  // src/render/sprites.js
  var SIZE = 2048, HEIGHT = 4096, SpriteAtlas = class {
    constructor() {
      this.page = new Page(SIZE, HEIGHT), this.templates = [], this.frames = /* @__PURE__ */ new Map(), this.x = 0, this.y = 0, this.rowH = 0, this.dirtyY0 = 0, this.dirtyY1 = HEIGHT, this.tex = null;
    }
    alloc(w, h) {
      if (this.x + w + 1 > SIZE && (this.x = 0, this.y += this.rowH + 1, this.rowH = 0), this.y + h + 1 > HEIGHT) throw new Error("sprite atlas full");
      let r = { x: this.x, y: this.y, w, h };
      return this.x += w + 1, this.rowH = Math.max(this.rowH, h), this.dirtyY0 = Math.min(this.dirtyY0, r.y), this.dirtyY1 = Math.max(this.dirtyY1, r.y + h), r;
    }
    // add a frame: paint(sp) draws into a w*h SPainter. anchor default bottom-centre
    add(name, w, h, paint, ax = Math.floor(w / 2), ay = h - 1) {
      let r = this.alloc(w, h), sp = new SPainter(this.page, r.x, r.y, w, h);
      paint(sp);
      let f = { x: r.x, y: r.y, w, h, ax, ay: ay + 1 };
      return name && this.frames.set(name, f), f;
    }
    get(name) {
      return this.frames.get(name);
    }
    get full() {
      return this.y > HEIGHT - 400;
    }
    upload(gl) {
      if (!this.tex) {
        this.tex = gl.createTexture(), gl.bindTexture(gl.TEXTURE_2D, this.tex), gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1), gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SIZE, HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.page.data), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE), this.dirtyY0 = HEIGHT, this.dirtyY1 = 0;
        return;
      }
      if (this.dirtyY1 > this.dirtyY0) {
        gl.bindTexture(gl.TEXTURE_2D, this.tex), gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        let y0 = this.dirtyY0, h = this.dirtyY1 - y0;
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, SIZE, h, gl.RGBA, gl.UNSIGNED_BYTE, this.page.data.subarray(y0 * SIZE * 4, (y0 + h) * SIZE * 4)), this.dirtyY0 = HEIGHT, this.dirtyY1 = 0;
      }
    }
  }, PaletteBank = class {
    constructor(rows = 1024) {
      this.rows = rows, this.data = new Uint8Array(32 * rows * 4), this.next = 0, this.free = [], this.dirty = !0, this.tex = null;
    }
    alloc(colors = {}) {
      let row = this.free.length ? this.free.pop() : this.next++;
      if (row >= this.rows) throw new Error("palette full");
      this.data.fill(0, row * 128, row * 128 + 128);
      for (let k in colors) this.set(row, +k, colors[k]);
      return row;
    }
    release(row) {
      this.free.push(row);
    }
    set(row, slot, c, a = 255) {
      let i = (row * 32 + slot) * 4;
      if (Array.isArray(c) && (a = c[1], c = c[0]), c == null) {
        this.data[i + 3] = 0, this.dirty = !0;
        return;
      }
      this.data[i] = c >> 16 & 255, this.data[i + 1] = c >> 8 & 255, this.data[i + 2] = c & 255, this.data[i + 3] = a, this.dirty = !0;
    }
    upload(gl) {
      if (!this.tex) {
        this.tex = gl.createTexture(), gl.bindTexture(gl.TEXTURE_2D, this.tex), gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 32, this.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.data), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE), gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE), this.dirty = !1;
        return;
      }
      this.dirty && (gl.bindTexture(gl.TEXTURE_2D, this.tex), gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 32, this.next, gl.RGBA, gl.UNSIGNED_BYTE, this.data.subarray(0, this.next * 128)), this.dirty = !1);
    }
  }, S = {
    // people
    SKIN: 1,
    HAIR: 2,
    TOP: 3,
    TOP2: 4,
    BOTTOM: 5,
    SHOES: 6,
    COAT: 7,
    HAT: 8,
    SCARF: 9,
    BAG: 10,
    DARK: 11,
    WHITE: 12,
    ITEM: 13,
    ITEM2: 14,
    SOCK: 15,
    // trees
    TRUNK: 1,
    BRANCH: 2,
    LEAF_D: 3,
    LEAF_M: 4,
    LEAF_L: 5,
    BLOSSOM: 6,
    BR_TOP: 7,
    LIGHT1: 8,
    LIGHT2: 9,
    LIGHT3: 10,
    STAR: 11,
    // animals
    BODY: 1,
    BODY_D: 2,
    BODY_L: 3,
    EYE: 4,
    NOSE: 5,
    COLLAR: 6,
    ACCENT: 7,
    BEAK: 8,
    // generic
    C1: 1,
    C2: 2,
    C3: 3,
    C4: 4,
    C5: 5,
    C6: 6,
    C7: 7,
    C8: 8,
    C9: 9,
    C10: 10
  };
  function shadeMul(sp, x, y, f) {
    if (x < 0 || y < 0 || x >= sp.w || y >= sp.h) return;
    let d = sp.page.data, i = ((sp.oy + y) * sp.page.w + sp.ox + x) * 4;
    !d[i + 3] || !d[i] || (d[i + 1] = clamp(Math.round(d[i + 1] * f), 30, 255));
  }
  function selOut(sp, dark = 0.74, lit = 1.08) {
    let W = sp.w, H = sp.h, m = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = sp.get(x, y) > 0 ? 1 : 0;
    let at = (x, y) => x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        m[y * W + x] && (!at(x + 1, y) || !at(x, y + 1) ? shadeMul(sp, x, y, dark) : (!at(x - 1, y) || !at(x, y - 1)) && shadeMul(sp, x, y, lit));
  }
  var TREE_SPECIES = {
    plane: { w: 88, h: 116, trunkH: 40, canopy: [40, 34], blobs: 30, bark: 9079412, camo: !0 },
    locust: { w: 76, h: 108, trunkH: 44, canopy: [34, 30], blobs: 40, small: !0, bark: 5917242 },
    oak: { w: 96, h: 112, trunkH: 36, canopy: [44, 36], blobs: 26, bark: 5916214 },
    elm: { w: 120, h: 140, trunkH: 52, canopy: [56, 40], blobs: 34, vase: !0, bark: 6181446 },
    cherry: { w: 84, h: 88, trunkH: 28, canopy: [38, 26], blobs: 30, bark: 4862e3 },
    pine: { w: 72, h: 108, trunkH: 12, pine: !0, bark: 4863526 },
    xmas: { w: 80, h: 152, trunkH: 12, pine: !0, xmas: !0, bark: 4863526 }
  };
  function paintTree(sp, spec, seed) {
    let rng = new RNG(seed), { w, h } = spec, cx = Math.floor(w / 2), base = h - 1;
    if (spec.pine) return paintPine(sp, spec, rng, seed);
    let th = spec.trunkH;
    for (let y = base; y > base - th; y--) {
      let t = (base - y) / th, half = t < 0.05 ? 4 : t < 0.14 ? 3 : 2.5, xa = Math.round(cx - half), xb = Math.round(cx + half) - 1;
      for (let x = xa; x <= xb; x++) {
        let rel = (x - xa) / Math.max(1, xb - xa), sh = rel < 0.25 ? 150 : rel < 0.6 ? 126 : 98;
        hash2i(x, y >> 2, seed + 5) < 0.2 && (sh -= 22), spec.camo && hash2i(x >> 1, (y >> 1) + 3, seed + 6) > 0.6 && (sh += 30), sp.set(x, y, S.TRUNK, clamp(sh, 56, 210), S.TRUNK);
      }
    }
    let tips = [], branch = (x, y, ang, len, depth) => {
      let x2 = x + Math.cos(ang) * len, y2 = y - Math.sin(ang) * len, steps = Math.ceil(len), thick = depth === 0 ? 4 : depth === 1 ? 3 : depth <= 3 ? 2 : 1;
      for (let i = 0; i <= steps; i++) {
        let px = Math.round(x + (x2 - x) * i / steps), py = Math.round(y + (y2 - y) * i / steps);
        for (let k = 0; k < thick; k++) {
          let slot = sp.get(px + k, py - 1) < 0 && depth >= 1 ? S.BR_TOP : S.BRANCH;
          sp.set(px + k, py, slot, k === 0 ? 138 : k === thick - 1 ? 98 : 118, slot);
        }
      }
      if (depth >= 5 || len < 4) {
        tips.push([x2, y2]);
        for (let k = 0; k < 3; k++) {
          let ta = ang + rng.range(-1, 1), tl = rng.range(3, 6), tx = Math.round(x2 + Math.cos(ta) * tl), ty = Math.round(y2 - Math.sin(ta) * tl), n2 = Math.max(1, Math.abs(tx - x2), Math.abs(ty - y2));
          for (let i = 0; i <= n2; i++) {
            let qx = Math.round(x2 + (tx - x2) * i / n2), qy = Math.round(y2 + (ty - y2) * i / n2);
            sp.get(qx, qy) < 0 && sp.set(qx, qy, S.BR_TOP, 116, S.BR_TOP);
          }
        }
        return;
      }
      let n = depth === 0 || rng.chance(0.35) ? 3 : 2;
      for (let k = 0; k < n; k++) {
        let spread = spec.vase ? 0.5 : 0.66, na = ang + (k - (n - 1) / 2) * spread + rng.range(-0.25, 0.25);
        branch(x2, y2, na, len * rng.range(0.64, 0.8), depth + 1);
      }
    }, topY = base - th, L0 = spec.canopy[1] * 0.75;
    branch(cx - 2, topY + 2, Math.PI / 2 + rng.range(-0.15, 0.15), L0 * 0.7, 0), spec.vase && (branch(cx - 1, topY + 8, Math.PI / 2 + 0.6, L0 * 0.8, 1), branch(cx - 1, topY + 8, Math.PI / 2 - 0.6, L0 * 0.8, 1));
    let [rx, ry] = spec.canopy, ccy = topY - ry * 0.55, blobs = [];
    for (let t of tips) blobs.push([t[0], t[1], rng.range(5, 9)]);
    for (let i = 0; i < spec.blobs; i++) {
      let a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next());
      blobs.push([cx + Math.cos(a) * r * rx * 0.75, ccy + Math.sin(a) * r * ry * 0.7, rng.range(7, 12)]);
    }
    let leafPix = (x, y, nx, ny) => {
      let prev = sp.get(x, y), alt = prev === S.BRANCH || prev === S.BR_TOP || prev === S.TRUNK ? prev : 0, n = (hash2i(x >> 1, y >> 1, seed) - 0.5) * 0.6 + (hash2i(x >> 2, y >> 2, seed + 7) - 0.5) * 0.5, l = -nx * 0.6 - ny * 0.8 + n, slot = l > 0.42 ? S.LEAF_L : l > -0.26 ? S.LEAF_M : S.LEAF_D;
      spec.small && hash2i(x, y, seed + 3) < 0.22 && (slot = S.LEAF_D), hash2i(x >> 1, y >> 1, seed + 9) < 0.08 && (slot = S.BLOSSOM);
      let sh = slot === S.LEAF_L && hash2i(x, y, seed + 11) < 0.12 ? 146 : 128;
      sp.set(x, y, slot, sh, alt);
    };
    for (let [bx, by, br] of blobs)
      for (let y = Math.floor(by - br); y <= Math.ceil(by + br); y++)
        for (let x = Math.floor(bx - br); x <= Math.ceil(bx + br); x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          let dx = (x + 0.5 - bx) / br, dy = (y + 0.5 - by) / (br * 0.85), d = dx * dx + dy * dy;
          if (d > 1 || d > 0.66 && hash2i(x >> 1, y >> 1, seed + 1) < 0.42) continue;
          let nx = (x - cx) / rx, ny = (y - ccy) / ry;
          leafPix(x, y, nx * 0.6 + dx * 0.4, ny * 0.6 + dy * 0.4);
        }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = sp.get(x, y);
        (s === S.LEAF_M || s === S.LEAF_L || s === S.BLOSSOM) && (sp.get(x, y + 1) < 0 || sp.get(x, y + 2) < 0) && sp.set(x, y, S.LEAF_D, 118, 0);
      }
  }
  function paintPine(sp, spec, rng, seed) {
    let { w, h } = spec, cx = Math.floor(w / 2), base = h - 1;
    for (let y = base; y > base - spec.trunkH - 8; y--) for (let x = cx - 2; x < cx + 2; x++) sp.set(x, y, S.TRUNK, x === cx - 2 ? 150 : x === cx + 1 ? 96 : 124, S.TRUNK);
    let layers = spec.xmas ? 9 : 7, top = 3, bottom = base - spec.trunkH;
    for (let l = 0; l < layers; l++) {
      let ly = top + (bottom - top) * (l + 1) / layers, lw = (w / 2 - 2) * (0.3 + 0.7 * (l + 1) / layers), lh = (bottom - top) / layers + 10;
      for (let y = Math.floor(ly - lh); y <= ly; y++) {
        let t = clamp((y - (ly - lh)) / lh, 0, 1), half = lw * Math.pow(t, 0.8);
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
          if (x < 0 || x >= w || y < 0) continue;
          let edge = Math.abs(x + 0.5 - cx) / Math.max(1, half);
          if (y > ly - 4 && hash2i(x >> 1, y, seed + 5) < 0.3 + (y - (ly - 4)) * 0.15 || edge > 0.82 && hash2i(x, y >> 1, seed + 6) < 0.5) continue;
          let n = (hash2i(x >> 1, y >> 1, seed) - 0.5) * 0.5, rel = (x - cx) / Math.max(1, half) + n, slot = rel < -0.3 ? S.LEAF_L : rel > 0.35 ? S.LEAF_D : S.LEAF_M;
          y > ly - 3 && (slot = S.LEAF_D), (sp.get(x, y - 1) < 0 || sp.get(x, y - 2) < 0) && (slot = S.BR_TOP), sp.set(x, y, slot, 128, slot === S.BR_TOP ? S.BR_TOP : 0);
        }
      }
    }
    if (spec.xmas) {
      for (let i = 0; i < 240; i++) {
        let y = rng.int(10, bottom - 2), x = rng.int(2, w - 3), s = sp.get(x, y);
        if (s === S.LEAF_M || s === S.LEAF_D || s === S.LEAF_L) {
          let L = rng.pick([S.LIGHT1, S.LIGHT2, S.LIGHT3]);
          sp.set(x, y, L, 128, 0), rng.chance(0.3) && sp.get(x + 1, y) > 0 && sp.set(x + 1, y, L, 100, 0);
        }
      }
      for (let [dx, dy] of [[0, -3], [0, -2], [-1, -1], [0, -1], [1, -1], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0], [-1, 1], [0, 1], [1, 1], [-2, 2], [2, 2], [-2, 3], [2, 3]]) sp.set(cx + dx, top + dy, S.STAR, 128, 0);
    }
  }
  var TREE_PALETTES = {
    // [season] => slots
    plane: [
      { L: [7915600, 5941308, 4098610], B: 9227356 },
      { L: [5941308, 4164146, 2779688], B: 5216822 },
      { L: [15773744, 14191144, 11033120], B: 15253568 },
      null
    ],
    locust: [
      { L: [12116080, 9226328, 6265404], B: 11065440 },
      { L: [9226328, 6989886, 4882480], B: 8042568 },
      { L: [16310352, 15777840, 13146664], B: 16314496 },
      null
    ],
    oak: [
      { L: [8964184, 6334524, 4096048], B: 8964184 },
      { L: [5216822, 3832364, 2644514], B: 5216822 },
      { L: [14178856, 12073502, 8398874], B: 15239728 },
      null
    ],
    elm: [
      { L: [9490528, 6860864, 4753466], B: 9490528 },
      { L: [5810236, 4098608, 2910758], B: 5810236 },
      { L: [15779896, 14195242, 11037218], B: 14715440 },
      null
    ],
    cherry: [
      { L: [16765152, 16296136, 14713e3], B: 16777215 },
      { L: [6860864, 4886580, 3107368], B: 5939258 },
      { L: [14704698, 12599344, 9447976], B: 15765568 },
      null
    ],
    pine: [
      { L: [4164170, 2779706, 1986094], B: 4164170 },
      { L: [4164170, 2779706, 1986094], B: 4164170 },
      { L: [3832388, 2778166, 1985066], B: 3832388 },
      { L: [3832388, 2778166, 1985066], B: 3832388 }
    ]
  };
  function treePalette(pal, species, season, snowy, barkColor, row = null) {
    let P = TREE_PALETTES[species] || TREE_PALETTES.plane, r = row ?? pal.alloc(), s = P[season], bare = !s, bark = bare ? shadeHex(barkColor, 0.62) : barkColor;
    if (pal.set(r, S.TRUNK, bark), pal.set(r, S.BRANCH, shadeHex(bark, 0.9)), pal.set(r, S.BR_TOP, snowy ? 15922938 : shadeHex(bark, bare ? 1 : 1.1)), s)
      pal.set(r, S.LEAF_L, s.L[0]), pal.set(r, S.LEAF_M, s.L[1]), pal.set(r, S.LEAF_D, s.L[2]), pal.set(r, S.BLOSSOM, s.B), species === "pine" && snowy ? (pal.set(r, S.LEAF_L, 15266040), pal.set(r, S.BR_TOP, 16777215)) : species === "pine" && pal.set(r, S.BR_TOP, s.L[0]);
    else
      for (let k of [S.LEAF_L, S.LEAF_M, S.LEAF_D, S.BLOSSOM]) pal.set(r, k, 0, 0);
    return pal.set(r, S.LIGHT1, 16726586, 128), pal.set(r, S.LIGHT2, 4259696, 128), pal.set(r, S.LIGHT3, 16764992, 128), pal.set(r, S.STAR, 16773792, 128), r;
  }
  function shadeHex(c, f) {
    let r = clamp(Math.round((c >> 16 & 255) * f), 0, 255), g = clamp(Math.round((c >> 8 & 255) * f), 0, 255), b = clamp(Math.round((c & 255) * f), 0, 255);
    return r << 16 | g << 8 | b;
  }
  var POSES = {
    walk: 4,
    run: 4,
    idle: 2,
    sit: 1,
    dribble: 2,
    shoot: 2,
    throw: 2,
    crouch: 1,
    wave: 1,
    skate: 2,
    phone: 1,
    lie: 1
  }, BACK_POSES = { walk: 1, run: 1, idle: 1, sit: 1 }, PW = 26, PH = 42, SIT_EXT = 10;
  function poseParams(anim, f) {
    let P = { lx: 0, rx: 0, ll: 0, rl: 0, la: "down", ra: "down", bob: 0, sit: !1, crouch: !1, jump: 0, lean: 0, dip: 0 };
    switch (anim) {
      case "walk": {
        let ph = [[-3, 3, "fwd", "back", 0], [0, 0, "down", "down", 1], [3, -3, "back", "fwd", 0], [0, 0, "down", "down", 1]][f];
        P.lx = ph[0], P.rx = ph[1], P.la = ph[2], P.ra = ph[3], P.bob = ph[4], f === 1 && (P.rl = 2), f === 3 && (P.ll = 2);
        break;
      }
      case "run": {
        let ph = [[-5, 5, "fwdb", "backb", 0], [0, 0, "bent", "bent", 2], [5, -5, "backb", "fwdb", 0], [0, 0, "bent", "bent", 2]][f];
        P.lx = ph[0], P.rx = ph[1], P.la = ph[2], P.ra = ph[3], P.bob = ph[4], P.lean = 1, f === 1 && (P.rl = 4), f === 3 && (P.ll = 4);
        break;
      }
      case "idle":
        P.bob = f;
        break;
      case "sit":
        P.sit = !0, P.la = "lap", P.ra = "lap";
        break;
      case "dribble":
        P.ra = f ? "low" : "fwdlow", P.la = "back", P.lx = -3, P.rx = 3, P.dip = 2 - f;
        break;
      case "shoot":
        P.la = "up", P.ra = "up", P.jump = f ? 6 : 0, P.ll = f * 2, P.rl = f * 2, P.dip = f ? 0 : 2;
        break;
      case "throw":
        P.ra = f ? "fwd" : "upback", P.la = f ? "back" : "fwd", P.lx = -3, P.rx = 4;
        break;
      case "crouch":
        P.crouch = !0, P.la = "low", P.ra = "low";
        break;
      case "wave":
        P.ra = "up";
        break;
      case "skate":
        P.la = "out", P.ra = "out", P.lx = f ? -3 : 3, P.rx = f ? 5 : -5, P.lean = 1;
        break;
      case "phone":
        P.ra = "phone";
        break;
      case "lie":
        P.lie = !0;
        break;
    }
    return P;
  }
  var HEADS = {
    adult: [".XXXXX.", "XXXXXXX", "XXXXXXX", "XXXXXXX", "XXXXXXX", "XXXXXXX", ".XXXXXX", "..XXXX."],
    kid: [".XXXX.", "XXXXXX", "XXXXXX", "XXXXXX", "XXXXXX", ".XXXXX", "..XXX."]
  }, ARMS = {
    down: [[0, 4], [0, 8]],
    fwd: [[1, 4], [3, 7]],
    back: [[-1, 4], [-3, 7]],
    fwdb: [[2, 3], [5, 1]],
    backb: [[-3, 3], [-4, 6]],
    bent: [[0, 4], [3, 3]],
    up: [[1, -4], [2, -8]],
    upback: [[-2, -3], [-4, -6]],
    low: [[1, 4], [3, 9]],
    fwdlow: [[2, 4], [5, 6]],
    lap: [[0, 4], [4, 5]],
    phone: [[1, 4], [3, 1]]
  };
  function paintPerson(sp, tpl, anim, f, view, ext = 0) {
    let P = poseParams(anim, f);
    if (P.lie) return paintLying(sp, tpl);
    let kid = tpl.body === "kid", elder = tpl.body === "elder", shorts = tpl.bottom === "shorts", skirt = tpl.bottom === "skirt", dress = tpl.bottom === "dress", fem = skirt || dress, front = view === "front", coat = tpl.coat, puffer = coat === "puffer", longCoat = coat === "long", cx = Math.floor(sp.w / 2), ground = sp.h - 1 - ext, legH = kid ? 7 : 11, torsoH = kid ? 7 : 10, headRows = HEADS[kid ? "kid" : "adult"], headH = headRows.length, headW = headRows[0].length, tw = (kid ? 6 : fem ? 7 : 8) + (puffer ? 2 : 0), tx0 = cx - Math.ceil(tw / 2), y0 = ground - P.jump, hipY = y0 - 2 - legH - P.bob + (P.crouch ? 5 : P.dip) + (P.sit ? legH - 2 : 0), shoulderY = hipY - torsoH + 1 + (elder ? 1 : 0), lean = P.lean, headY = shoulderY - 1 - headH, hx0 = cx - Math.floor(headW / 2) + (elder ? 1 : 0) + lean, topSlot = coat ? S.COAT : S.TOP, bareArms = !coat && (tpl.top === "tank" || tpl.top === "jersey"), shortSleeve = !coat && tpl.top === "tee", upperArmSlot = bareArms ? S.SKIN : topSlot, foreArmSlot = bareArms || shortSleeve ? S.SKIN : topSlot, legW = kid ? 2 : 3, ls = (y) => lean && y < shoulderY + torsoH / 2 ? 1 : 0, tset = (x, y, slot, sh = 128) => sp.set(x + ls(y), y, slot, sh), limbShade = (base, k, n) => base + (k === 0 ? 14 : k === n - 1 ? -16 : 0), drawLeg = (hx, dx, lift, far) => {
      let base = far ? 96 : 128;
      if (P.sit) {
        let kneeX = hx + (kid ? 5 : 7);
        for (let x = hx; x <= kneeX; x++) for (let k = 0; k < legW; k++) sp.set(x, hipY + 1 + k, (skirt || dress) && x > hx + 3 ? S.SKIN : S.BOTTOM, limbShade(base, k, legW));
        let shinTop = hipY + 1 + legW, shinBot = sp.h - 3, sx = kneeX - legW + 1;
        for (let y = shinTop; y <= shinBot; y++) {
          let slot = shorts || skirt || dress ? S.SKIN : S.BOTTOM;
          shorts && y >= shinBot - 1 && (slot = S.SOCK);
          for (let k = 0; k < legW; k++) sp.set(sx + k, y, slot, limbShade(base, k, legW));
        }
        for (let k = 0; k <= legW; k++) sp.set(sx + k, shinBot + 1, S.SHOES, base + 8);
        for (let k = -1; k <= legW + 1; k++) sp.set(sx + k, shinBot + 2, S.SHOES, base - 18);
        return;
      }
      let top = hipY + 1, bot = y0 - 2 - lift, n = Math.max(1, bot - top), kneeY = top + Math.round(n * 0.5), kx = hx + dx * 0.5 + lift * 0.8 + (P.crouch ? 3 : 0), fx = hx + dx - lift * 0.6, lastX = hx;
      for (let y = top; y <= bot; y++) {
        let x = Math.round(y <= kneeY ? hx + (kx - hx) * ((y - top) / Math.max(1, kneeY - top)) : kx + (fx - kx) * ((y - kneeY) / Math.max(1, bot - kneeY))), t = (y - top) / n, slot = S.BOTTOM;
        shorts && t > 0.42 && (slot = S.SKIN), (skirt || dress) && t > 0.2 && (slot = S.SKIN), shorts && y >= bot - 1 && (slot = S.SOCK);
        for (let k = 0; k < legW; k++) sp.set(x + k, y, slot, limbShade(base, k, legW));
        lastX = x;
      }
      for (let k = 0; k <= legW; k++) sp.set(lastX + k, bot + 1, S.SHOES, base + 8);
      for (let k = -1; k <= legW + 1; k++) sp.set(lastX + k, bot + 2, S.SHOES, base - 18);
    }, drawArm = (far, state) => {
      let sx = (far ? tx0 - 1 : tx0 + tw - 1) + lean, sy = shoulderY + 1, e, hnd;
      if (state === "out") {
        let s = far ? -1 : 1;
        e = [3 * s, 1], hnd = [6 * s, 2];
      } else [e, hnd] = ARMS[state] || ARMS.down;
      let k = kid ? 0.72 : 1, E = [sx + Math.round(e[0] * k), sy + Math.round(e[1] * k)], H2 = [sx + Math.round(hnd[0] * k), sy + Math.round(hnd[1] * k)], base = far ? 94 : 130, seg = (a, b, slot) => {
        let n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
        for (let i = 0; i <= n; i++) {
          let x = Math.round(a[0] + (b[0] - a[0]) * i / n), y = Math.round(a[1] + (b[1] - a[1]) * i / n);
          sp.set(x, y, slot, base + 10), sp.set(x + 1, y, slot, base - 14);
        }
      };
      return seg([sx, sy], E, upperArmSlot), puffer && seg([sx - 1, sy], [E[0] - 1, E[1]], S.COAT), seg(E, H2, foreArmSlot), !coat && !bareArms && !shortSleeve && sp.set(H2[0], H2[1] + (H2[1] >= E[1] ? -1 : 1), topSlot, base - 22), sp.set(H2[0], H2[1], S.SKIN, base + 6), sp.set(H2[0] + 1, H2[1], S.SKIN, base - 10), sp.set(H2[0], H2[1] + 1, S.SKIN, base - 4), sp.set(H2[0] + 1, H2[1] + 1, S.SKIN, base - 20), state === "phone" && (sp.set(H2[0] + 1, H2[1] - 1, S.DARK, 128), sp.set(H2[0] + 1, H2[1] - 2, S.DARK, 128), sp.set(H2[0] + 2, H2[1] - 2, S.DARK, 110), sp.set(H2[0] + 2, H2[1] - 1, S.WHITE, 120)), H2;
    };
    if (drawArm(!0, P.la), drawLeg(tx0 + 1, P.lx, P.ll, !0), drawLeg(cx, P.rx, P.rl, !1), skirt || dress) {
      let len = kid ? 3 : dress ? 6 : 5;
      for (let r = 0; r < len; r++) {
        let flare = Math.floor(r / 2);
        for (let x = tx0 - flare; x <= tx0 + tw - 1 + flare; x++) sp.set(x, hipY + 1 + r, S.BOTTOM, x <= tx0 - flare + 1 ? 146 : x >= tx0 + tw - 2 + flare ? 100 : (x + r) % 4 === 0 ? 112 : 124);
      }
    }
    if (longCoat && !P.sit) {
      let len = kid ? 3 : 6;
      for (let r = 0; r < len; r++) for (let x = tx0 - (r > 2 ? 1 : 0); x <= tx0 + tw - 1; x++) sp.set(x, hipY + 1 + r, S.COAT, x <= tx0 ? 146 : x >= tx0 + tw - 2 ? 100 : 122);
    }
    for (let y = shoulderY; y <= hipY; y++) {
      let r = y - shoulderY, x0 = tx0, x1 = tx0 + tw - 1;
      r === 0 && (x0++, x1--), fem && !coat && r > torsoH * 0.35 && r < torsoH * 0.75 && x0++;
      for (let x = x0; x <= x1; x++) {
        let rel = (x - tx0) / (tw - 1), sh = rel < 0.18 ? 150 : rel > 0.82 ? 98 : rel > 0.6 ? 114 : 130, slot = dress ? S.BOTTOM : topSlot;
        y === hipY && !coat && !dress && (slot = S.BOTTOM), puffer && r % 3 === 2 && (sh -= 20), tset(x, y, slot, sh);
      }
    }
    if (coat) {
      if (coat === "jacket" && front) {
        for (let y = shoulderY + 1; y <= hipY; y++)
          tset(cx, y, S.TOP, 128), tset(cx + 1, y, S.TOP, 112);
        tset(cx - 1, shoulderY, S.COAT, 150), tset(cx + 2, shoulderY, S.COAT, 150);
      }
      if (puffer) {
        if (front) for (let y = shoulderY + 1; y <= hipY; y++) tset(cx + 1, y, S.COAT, 96);
        for (let x = cx - 2; x <= cx + 2; x++) tset(x, shoulderY - 1, S.COAT, x === cx - 2 ? 146 : 124);
      }
      if (longCoat) {
        if (front) for (let y of [shoulderY + 3, shoulderY + 6]) tset(cx + 1, y, S.DARK, 120);
        for (let x = tx0; x < tx0 + tw; x++) tset(x, hipY - 2, S.COAT, 92);
      }
    } else {
      if (front && (tpl.top === "tee" || tpl.top === "tank" || tpl.top === "jersey" || dress) && (tset(cx - 1, shoulderY, S.SKIN, 122), tset(cx, shoulderY, S.SKIN, 112), tpl.top === "tank" && tset(cx + 1, shoulderY, S.SKIN, 104)), tpl.top === "stripe" && !dress) {
        for (let y = shoulderY + 1; y < hipY; y++) if ((y - shoulderY) % 3 === 1) for (let x = tx0; x < tx0 + tw; x++) sp.get(x + ls(y), y) === S.TOP && tset(x, y, S.TOP2, x === tx0 ? 146 : x >= tx0 + tw - 2 ? 100 : 124);
      }
      if (tpl.top === "jersey") {
        for (let x = tx0 + 1; x < tx0 + tw - 1; x++) (!front || x < cx - 1 || x > cx) && tset(x, shoulderY, S.TOP2, 120);
        (front ? ["XX", ".X", "X.", "XX"] : ["XXX", "..X", ".XX", "..X", "XXX"]).forEach((row, j) => [...row].forEach((c, i) => {
          c === "X" && tset(cx - 1 + i, shoulderY + (kid ? 2 : 3) + j, S.TOP2, 140);
        }));
      }
      if (tpl.top === "suit")
        if (front) {
          for (let j = 0; j < 4; j++) for (let x = cx - 1 + Math.floor(j / 2); x <= cx + 1 - Math.floor(j / 2); x++) tset(x, shoulderY + j, S.WHITE, 132);
          for (let j = 1; j < 7; j++) tset(cx, shoulderY + j, S.TOP2, j === 1 ? 140 : 122);
          tset(cx + 1, shoulderY + 1, S.TOP2, 110), tset(cx + 2, hipY - 3, S.DARK, 128), tset(cx + 2, hipY - 1, S.DARK, 128);
        } else for (let y = shoulderY + 2; y < hipY; y++) tset(cx, y, S.TOP, 104);
    }
    if (tpl.bag === "back")
      if (front) {
        for (let y = shoulderY; y <= shoulderY + 3; y++)
          tset(tx0 + 1, y, S.BAG, 104), tset(tx0 + tw - 2, y, S.BAG, 104);
        for (let y = shoulderY + 1; y <= shoulderY + (kid ? 5 : 7); y++)
          tset(tx0 - 1, y, S.BAG, 112), tset(tx0 - 2, y, S.BAG, 96);
      } else {
        let bh = kid ? 6 : 8;
        for (let y = shoulderY + 1; y <= shoulderY + bh; y++) for (let x = tx0 + 1; x < tx0 + tw - 1; x++) tset(x, y, S.BAG, x === tx0 + 1 ? 146 : x >= tx0 + tw - 2 ? 100 : 124);
        for (let x = tx0 + 2; x < tx0 + tw - 2; x++) tset(x, shoulderY + Math.round(bh * 0.6), S.BAG, 100);
        tset(cx - 1, shoulderY, S.BAG, 110), tset(cx, shoulderY, S.BAG, 110);
      }
    if (tpl.bag === "shoulder") {
      for (let j = 0; j < torsoH - 2; j++) tset(tx0 + 1 + Math.round(j * (tw - 3) / (torsoH - 3)), shoulderY + j, S.BAG, 100);
      let bx = front ? tx0 + tw - 2 : tx0 - 2, by = hipY - 2;
      for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 4; x++) sp.set(x, y, S.BAG, x === bx ? 146 : y === by + 3 ? 100 : 120);
    }
    if (tpl.scarf) {
      for (let x = cx - 2; x <= cx + 2; x++)
        tset(x, shoulderY - 1, S.SCARF, x === cx - 2 ? 146 : 124), tset(x, shoulderY, S.SCARF, x === cx - 2 ? 140 : 112);
      if (front) for (let j = 1; j <= 4; j++)
        tset(cx + 1, shoulderY + j, S.SCARF, 120), tset(cx + 2, shoulderY + j, S.SCARF, 100);
      else for (let j = 1; j <= 3; j++) tset(cx - 2, shoulderY + j, S.SCARF, 112);
    }
    if (!tpl.scarf && !puffer) for (let x = cx - 1; x <= cx + 1; x++) sp.set(x + lean + (elder ? 1 : 0), shoulderY - 1, S.SKIN, x === cx + 1 ? 104 : 120);
    headRows.forEach((row, r) => {
      for (let c = 0; c < headW; c++) row[c] === "X" && sp.set(hx0 + c, headY + r, S.SKIN, c === 0 ? 144 : c >= headW - 2 ? 112 : 130);
    });
    let ey = headY + 3;
    if (front && (sp.set(hx0 + headW - 2, ey, S.DARK, 128), sp.set(hx0 + headW - 4, ey, S.DARK, 128), sp.set(hx0 + headW, ey + 1, S.SKIN, 112), sp.set(hx0 + headW - 3, headY + headH - 2, S.SKIN, 92), sp.set(hx0 + 1, ey + 1, S.SKIN, 100), tpl.glasses)) {
      for (let c = headW - 5; c < headW; c++) sp.set(hx0 + c, ey, S.DARK, 128);
      sp.set(hx0 + headW - 4, ey, S.WHITE, 104), sp.set(hx0 + headW - 2, ey, S.WHITE, 104);
    }
    let H = (c, r, sh = 128) => sp.set(hx0 + c, headY + r, S.HAIR, sh), hair = tpl.hair;
    if (hair !== "bald") {
      for (let c = 1; c < headW - 1; c++) H(c, -1, 146);
      if (front) {
        for (let c = 0; c < headW; c++) H(c, 0, c < 2 ? 142 : 126);
        for (let c = 0; c < headW - 1; c++) H(c, 1, c < 2 ? 130 : 116);
        for (let c = 0; c < 3; c++) H(c, 2, 112);
        H(0, 3, 108), H(1, 3, 100), H(0, 4, 100);
      } else
        for (let r = 0; r < headH - 2; r++) for (let c = 0; c < headW; c++) headRows[r][c] === "X" && H(c, r, c === 0 ? 140 : c >= headW - 2 ? 104 : 122 - r * 2);
      if (hair === "long")
        if (front) for (let r = 1; r < headH + 3; r++)
          H(-1, r, 110), H(0, r, 120), r < headH + 1 && H(1, r, r > 4 ? 112 : 120);
        else for (let r = headH - 2; r < headH + 3; r++) for (let c = 0; c < headW - 1; c++) H(c, r, c === 0 ? 136 : 112);
      if (hair === "pony") {
        let pts = front ? [[-1, 1], [-2, 2], [-2, 3], [-2, 4], [-1, 5], [-2, 6]] : [[2, headH - 2], [3, headH - 2], [2, headH - 1], [3, headH - 1], [3, headH], [3, headH + 1]];
        for (let [c, r] of pts)
          H(c, r, 124), H(c + 1, r, 104);
      }
      if (hair === "afro") {
        let ccx = headW / 2 - (front ? 0.5 : 0), ccy = 1.5;
        for (let r = -4; r < (front ? 5 : headH - 1); r++)
          for (let c = -2; c < headW + 2; c++) {
            let dx = (c + 0.5 - ccx) / (headW / 2 + 1.6), dy = (r + 0.5 - ccy) / 4.6;
            dx * dx + dy * dy > 1 || front && c >= 3 && r >= 2 || H(c, r, (c * 3 + r * 5) % 7 === 0 ? 108 : dx < -0.3 || dy < -0.5 ? 146 : 124);
          }
      }
      if (hair === "bun") for (let [c, r] of [[1, -3], [2, -3], [0, -2], [1, -2], [2, -2], [3, -2]]) H(c + (front ? 0 : 1), r, r === -3 ? 146 : 124);
      if (hair === "spiky") {
        for (let c of [1, 3, 5]) H(c, -2, 140);
        H(3, -3, 146), H(1, -3, 120);
      }
    } else if (front)
      H(0, 3, 110), H(0, 4, 104), H(1, 3, 100);
    else for (let c = 0; c < headW; c++)
      H(c, 3, 108), H(c, 4, 100);
    let hat = tpl.hat, HT = (c, r, sh = 128, slot = S.HAT) => sp.set(hx0 + c, headY + r, slot, sh);
    if (hat === "beanie") {
      for (let r = -2; r <= 1; r++) for (let c = r === -2 ? 1 : 0; c < headW - (r === -2 ? 1 : 0); c++) HT(c, r, r <= -1 ? 146 - c * 3 : 122 - c * 2);
      for (let c = 0; c < headW; c++) HT(c, 2, c === 0 ? 128 : 104);
      for (let [c, r] of [[2, -4], [3, -4], [4, -4], [2, -3], [3, -3], [4, -3]]) HT(c, r, r === -4 ? 150 : 120, S.WHITE);
    } else if (hat === "cap") {
      for (let r = -2; r <= 0; r++) for (let c = r === -2 ? 1 : 0; c < headW - (r === -2 ? 1 : 0); c++) HT(c, r, r === -2 ? 148 : 128 - c * 2);
      if (front) for (let c = 3; c <= headW + 1; c++) HT(c, 1, c > headW - 1 ? 104 : 112);
      else
        HT(2, 0, 90, S.DARK), HT(3, 0, 90, S.DARK);
      HT(3, -3, 150);
    } else if (hat === "fedora") {
      for (let c = -2; c <= headW + 1; c++) HT(c, 0, c < 0 ? 120 : 104);
      for (let r = -4; r <= -1; r++) for (let c = r === -4 ? 1 : 0; c < headW - (r === -4 ? 1 : 0); c++) HT(c, r, r === -4 ? 146 : c === 0 ? 140 : 122);
      for (let c = 0; c < headW; c++) HT(c, -1, 100, S.DARK);
      HT(3, -4, 110);
    } else if (hat === "hood") {
      let hs = coat ? S.COAT : S.TOP;
      for (let c = 0; c < headW; c++) HT(c, -1, 140, hs);
      for (let r = 0; r < headH + 1; r++) HT(-1, r, 124, hs);
      if (front) {
        for (let r = 0; r < headH; r++)
          for (let c = 0; c < headW; c++)
            headRows[r][c] === "X" && (c >= 3 && r >= 2 || HT(c, r, c === 0 ? 136 : 118, hs));
        HT(headW - 1, 1, 104, hs), HT(headW, 1, 96, hs);
      } else for (let r = 0; r < headH + 1; r++) for (let c = 0; c < headW; c++) HT(c, r, c === 0 ? 136 : c >= headW - 2 ? 104 : 120, hs);
    } else if (hat === "witch") {
      for (let c = -3; c <= headW + 2; c++) HT(c, 0, c < 0 ? 120 : 104);
      for (let k = 0; k < 8; k++) {
        let half = Math.max(0, 3 - k * 0.4), ccx = 3 - k * 0.35;
        for (let c = Math.round(ccx - half); c <= Math.round(ccx + half); c++) HT(c, -1 - k, c < ccx ? 140 : 118);
      }
      for (let c = 0; c < headW; c++) HT(c, -1, 128, S.ITEM);
    } else if (hat === "helmet") {
      for (let r = -2; r <= 1; r++) for (let c = r === -2 ? 1 : -1; c <= headW - (r === -2 ? 1 : 0); c++) HT(c, r, r === -2 ? 150 : c < 2 ? 140 : 118);
      if (front) for (let c = headW - 1; c <= headW + 1; c++) HT(c, 2, 100);
      HT(1, -1, 170, S.WHITE);
    }
    let hand = drawArm(!1, P.ra), carrying = P.ra === "down" || P.ra === "fwd" || P.ra === "back";
    if (tpl.bag === "brief" && carrying) {
      let [hx, hy] = hand;
      sp.set(hx, hy + 2, S.BAG, 96), sp.set(hx + 1, hy + 2, S.BAG, 96);
      for (let y = hy + 3; y < hy + 7; y++) for (let x = hx - 2; x < hx + 4; x++) sp.set(x, y, S.BAG, x === hx - 2 ? 140 : y === hy + 6 ? 96 : 120);
      sp.set(hx, hy + 4, S.ITEM2, 150);
    }
    if (tpl.bag === "shopping" && carrying) {
      let [hx, hy] = hand;
      sp.set(hx - 1, hy + 2, S.BAG, 100), sp.set(hx + 2, hy + 2, S.BAG, 100);
      for (let y = hy + 3; y < hy + 9; y++) for (let x = hx - 1; x < hx + 4; x++) sp.set(x, y, S.BAG, x === hx - 1 ? 146 : x === hx + 3 ? 100 : y === hy + 3 ? 136 : 122);
    }
    if (elder && tpl.cane) {
      let [hx, hy] = hand;
      sp.set(hx + 1, hy - 1, S.DARK, 120), sp.set(hx + 2, hy - 1, S.DARK, 110);
      for (let y = hy; y <= y0; y++) sp.set(hx + 2, y, S.DARK, 110);
    }
  }
  function paintLying(sp, tpl) {
    let g = sp.h - 1;
    for (let x = 1; x < sp.w - 1; x++) for (let y2 = g - 2; y2 <= g; y2++) sp.set(x, y2, S.ITEM2, (x >> 2) % 2 ? 128 : 100);
    let y = g - 6, legC = tpl.bottom === "pants" ? S.BOTTOM : S.SKIN;
    sp.ellipse(5.5, y + 2, 3, 2.6, S.SKIN, 128);
    for (let x = 3; x <= 6; x++) sp.set(x, y - 1, S.HAIR, 128);
    sp.set(2, y, S.HAIR, 120), sp.set(2, y + 1, S.HAIR, 110), sp.set(2, y + 2, S.HAIR, 104), sp.set(6, y + 1, S.DARK, 128), sp.set(7, y + 1, S.DARK, 128), sp.set(8, y + 2, S.SKIN, 110);
    for (let x = 9; x <= 17; x++) for (let r = 0; r < 4; r++) sp.set(x, y + r, S.TOP, r === 0 ? 146 : r === 3 ? 100 : 124);
    for (let x = 18; x <= 21; x++) for (let r = 0; r < 4; r++) sp.set(x, y + r, S.BOTTOM, r === 0 ? 140 : 110);
    for (let x = 22; x <= 28; x++)
      sp.set(x, y + 1, legC, 136), sp.set(x, y + 2, legC, 116), sp.set(x, y + 3, legC, 100);
    sp.set(29, y, S.SKIN, 128), sp.set(29, y + 1, S.SKIN, 116);
    for (let x = 10; x <= 16; x++) sp.set(x, y + 3, S.SKIN, 112);
  }
  var TEMPLATE_BUDGET = 110;
  function personTemplate(atlas, tpl) {
    let key = "p:" + JSON.stringify(tpl), cached = atlas.frames.get(key);
    if (cached) return cached;
    if (atlas.templates.length >= TEMPLATE_BUDGET || atlas.full) {
      let best = null, bs = -1;
      for (let t of atlas.templates) {
        let sc = 0;
        t.tpl.body === tpl.body && (sc += 10), !!t.tpl.coat == !!tpl.coat && (sc += 6), t.tpl.hat === tpl.hat && (sc += 3), t.tpl.bottom === tpl.bottom && (sc += 2), t.tpl.top === tpl.top && (sc += 2), t.tpl.hair === tpl.hair && (sc += 1), t.tpl.bag === tpl.bag && (sc += 1), sc > bs && (bs = sc, best = t);
      }
      if (best) return best.out;
    }
    let out = { front: {}, back: {} };
    for (let anim in POSES)
      for (let view of ["front", "back"]) {
        if (view === "back" && !BACK_POSES[anim]) {
          out.back[anim] = out.front[anim];
          continue;
        }
        let arr = [];
        for (let f = 0; f < POSES[anim]; f++) {
          let fw = anim === "lie" ? 32 : PW, ext = anim === "sit" ? SIT_EXT : 0;
          arr.push(atlas.add(null, fw, PH + ext, (sp) => {
            paintPerson(sp, tpl, anim, f, view, ext), selOut(sp);
          }, Math.floor(fw / 2), PH - 1));
        }
        out[view][anim] = arr;
      }
    return atlas.frames.set(key, out), atlas.templates.push({ tpl, out }), out;
  }
  var DOG_BREEDS = {
    small: { len: 10, hgt: 6, leg: 4, head: 6, ears: "up", tail: "up" },
    terrier: { len: 12, hgt: 6, leg: 4, head: 6, ears: "up", tail: "up", wiry: !0 },
    medium: { len: 14, hgt: 7, leg: 6, head: 6, ears: "flop", tail: "up" },
    large: { len: 18, hgt: 8, leg: 8, head: 7, ears: "flop", tail: "out" },
    dachshund: { len: 18, hgt: 6, leg: 2, head: 6, ears: "flop", tail: "out" },
    poodle: { len: 12, hgt: 7, leg: 6, head: 6, ears: "flop", tail: "pom", fluffy: !0 },
    husky: { len: 16, hgt: 8, leg: 6, head: 7, ears: "up", tail: "curl", mask: !0 }
  }, dogFrameSize = (breed) => {
    let B2 = DOG_BREEDS[breed];
    return [B2.len + 16, B2.hgt + B2.leg + B2.head + 6];
  };
  function paintDog(sp, breed, anim, f) {
    let B2 = DOG_BREEDS[breed], g = sp.h - 1, x0 = 5, legTop = g - B2.leg + 1, bodyTop = legTop - B2.hgt, sit = anim === "sit", sniff = anim === "sniff", run = anim === "run", walk = anim === "walk", xEnd = x0 + B2.len - 1, drop = (x) => sit ? Math.round((1 - (x - x0) / B2.len) * (B2.leg + 1)) : 0, legs = [
      { x: x0 + 1, far: !0, ph: 0 },
      { x: xEnd - 4, far: !0, ph: 1 },
      { x: x0 + 3, far: !1, ph: 2 },
      { x: xEnd - 2, far: !1, ph: 3 }
    ], drawLeg = (L) => {
      if (sit && L.x < x0 + B2.len / 2) return;
      let dx = 0, lift = 0;
      if (walk) {
        let p = (f + L.ph) % 4;
        dx = [1, 0, -1, 0][p], lift = p === 1 ? 1 : 0;
      }
      if (run) {
        let p = (f + (L.ph >> 1)) % 2;
        dx = p ? 2 : -2, lift = p ? 1 : 0;
      }
      let sh = L.far ? 96 : 124, slot = L.far ? S.BODY_D : S.BODY;
      for (let y = legTop - 1; y <= g - lift; y++) {
        let t = (y - legTop) / Math.max(1, g - legTop), xx = L.x + Math.round(dx * Math.max(0, t));
        sp.set(xx, y, slot, sh + 10), sp.set(xx + 1, y, slot, sh - 12);
      }
      sp.set(L.x + dx + 2, g - lift, slot, sh - 6);
    };
    legs.filter((L) => L.far).forEach(drawLeg);
    for (let x = x0; x <= xEnd; x++)
      for (let y = bodyTop; y < legTop; y++) {
        let ry = (y - bodyTop) / Math.max(1, B2.hgt - 1);
        if ((x === x0 || x === xEnd) && (y === bodyTop || y === legTop - 1)) continue;
        let slot = ry > 0.72 && x > x0 + 2 && x < xEnd - 2 ? S.BODY_L : S.BODY;
        B2.mask && ry > 0.6 && (slot = S.BODY_L);
        let sh = ry < 0.2 ? 148 : ry > 0.8 ? 104 : 126;
        (B2.fluffy || B2.wiry) && (sh += hash2i(x, y, 3) < 0.35 ? 16 : hash2i(x, y, 4) < 0.25 ? -14 : 0), sp.set(x, y + drop(x), slot, sh);
      }
    if (B2.fluffy) for (let x = x0 + 1; x < xEnd; x++) hash2i(x, 0, 5) < 0.6 && sp.set(x, bodyTop - 1 + drop(x), S.BODY, 150);
    if (sit) for (let x = x0; x < x0 + 5; x++) sp.set(x, g, S.BODY_D, 100);
    legs.filter((L) => !L.far).forEach(drawLeg);
    let hw = B2.head + 1, hx = xEnd - 2, hy = (sniff ? legTop - 2 : bodyTop - B2.head + 3) - (sit ? 2 : 0);
    for (let y = hy; y < hy + B2.head; y++)
      for (let x = hx; x < hx + hw; x++)
        (x === hx || x === hx + hw - 1) && (y === hy || y === hy + B2.head - 1) || sp.set(x, y, B2.mask && y > hy + 2 ? S.BODY_L : S.BODY, y === hy ? 148 : x === hx + hw - 1 ? 110 : 130);
    let sy = hy + B2.head - 3;
    for (let x = hx + hw - 1; x < hx + hw + 2; x++)
      sp.set(x, sy, S.BODY, 132), sp.set(x, sy + 1, S.BODY_L, 116);
    if (sp.set(hx + hw + 2, sy, S.NOSE, 128), sp.set(hx + hw + 1, sy - 1, S.BODY, 120), sp.set(hx + hw - 2, hy + 2, S.EYE, 128), run && sp.set(hx + hw, sy + 2, S.COLLAR, 150), B2.ears === "up")
      sp.set(hx + 1, hy - 1, S.BODY_D, 128), sp.set(hx + 2, hy - 1, S.BODY_D, 116), sp.set(hx + 1, hy - 2, S.BODY_D, 110);
    else for (let y = hy + 1; y < hy + 5; y++)
      sp.set(hx, y, S.BODY_D, 104), sp.set(hx + 1, y, S.BODY_D, 116);
    for (let y = hy + B2.head - 2; y < Math.min(legTop, hy + B2.head + 2); y++)
      sp.set(hx - 1, y, S.COLLAR, 128), sp.set(hx, y, S.COLLAR, 110);
    let ty = bodyTop + drop(x0), wag = f % 2;
    if (B2.tail === "up") for (let k = 0; k < 4; k++)
      sp.set(x0 - 1 - (k >> 1) + (k === 3 ? wag : 0), ty - k, S.BODY, 134), sp.set(x0 - (k >> 1), ty - k, S.BODY, 116);
    else if (B2.tail === "out") for (let k = 0; k < 5; k++) sp.set(x0 - 1 - k, ty + 1 + (k > 2 ? wag : 0), S.BODY, 128 - k * 4);
    else if (B2.tail === "pom")
      sp.set(x0 - 1, ty, S.BODY, 128), sp.set(x0 - 2, ty - 1, S.BODY, 128), sp.ellipse(x0 - 3, ty - 3 - wag, 1.6, 1.6, S.BODY, 150);
    else for (let [dx, dy] of [[-1, 0], [-1, -1], [0, -2], [1, -3], [2, -3], [3, -2 + wag]])
      sp.set(x0 + dx, ty + dy, S.BODY_L, 140), sp.set(x0 + dx, ty + dy + 1, S.BODY, 120);
  }
  function paintPigeon(sp, anim, f) {
    let g = sp.h - 1;
    if (anim === "fly") {
      let up = f % 2 === 0, by2 = g - 7;
      sp.ellipse(8.5, by2, 5, 2.2, S.BODY, 128);
      for (let x = 5; x < 12; x++) sp.set(x, by2 + 2, S.BODY_L, 112);
      for (let [x, y] of [[3, by2 - 1], [2, by2 - 1], [2, by2], [1, by2], [2, by2 + 1], [3, by2 + 1]]) sp.set(x, y, S.BODY_D, 110);
      if (sp.ellipse(14, by2 - 1, 1.8, 1.6, S.BODY_D, 124), sp.set(12, by2, S.ACCENT, 128), sp.set(13, by2, S.ACCENT, 112), sp.set(15, by2 - 2, S.EYE, 128), sp.set(16, by2 - 1, S.BEAK, 128), sp.set(17, by2 - 1, S.BEAK, 110), up) {
        for (let k = 0; k < 6; k++) {
          let x = 8 - (k >> 1);
          sp.set(x - 1, by2 - 2 - k, S.BODY_L, 150 - k * 4), sp.set(x, by2 - 2 - k, S.BODY_L, 136), sp.set(x + 1, by2 - 2 - k, S.BODY_D, 116);
        }
        sp.set(4, by2 - 8, S.BODY_D, 110), sp.set(5, by2 - 8, S.BODY_D, 110);
      } else
        for (let k = 0; k < 5; k++) {
          let x = 8 - (k >> 1);
          sp.set(x - 1, by2 + 1 + k, S.BODY_L, 124), sp.set(x, by2 + 1 + k, S.BODY_D, 110);
        }
      return;
    }
    let peck = anim === "peck" && f === 1, bob = anim === "walk" && f === 1 ? 1 : 0, by = g - 4;
    sp.ellipse(6.5, by, 4.6, 2.6, S.BODY, 128);
    for (let x = 4; x <= 9; x++)
      sp.set(x, by - 1, S.BODY_L, 140), sp.set(x, by, S.BODY_L, 126);
    sp.set(6, by, S.BODY_D, 104), sp.set(8, by, S.BODY_D, 104), sp.set(7, by - 1, S.BODY_D, 112);
    for (let x = 4; x <= 9; x++) sp.set(x, by + 2, S.BODY_L, 104);
    sp.set(1, by - 1, S.BODY_D, 120), sp.set(2, by - 1, S.BODY_D, 120), sp.set(1, by, S.BODY_D, 104), sp.set(0, by - 1, S.BODY_D, 100);
    let hx = 10 + bob, hy = peck ? by + 1 : by - 3;
    sp.set(10, by - 1, S.ACCENT, 136), sp.set(10, by - 2, S.ACCENT, 120), sp.set(11, by - 1, S.ACCENT, 112), sp.ellipse(hx + 1.5, hy, 1.9, 1.7, S.BODY_D, 126), sp.set(hx + 2, hy - 1, S.EYE, 128), sp.set(hx + 3, hy + (peck ? 1 : 0), S.BEAK, 128), sp.set(hx + 4, hy + (peck ? 1 : 0), S.BEAK, 108), sp.set(hx + 3, hy - 1 + (peck ? 1 : 0), S.BODY_L, 150);
    let st = anim === "walk" ? f % 2 : 0;
    sp.set(5, by + 3, S.BEAK, 110), sp.set(5 - st, by + 4, S.BEAK, 104), sp.set(6 - st, by + 4, S.BEAK, 96), sp.set(8, by + 3, S.BEAK, 120), sp.set(8 + st, by + 4, S.BEAK, 110), sp.set(9 + st, by + 4, S.BEAK, 100);
  }
  function paintCat(sp, anim, f) {
    let g = sp.h - 1;
    if (anim === "sit") {
      sp.ellipse(5, g - 4, 3.6, 4.2, S.BODY, 124), sp.ellipse(5.5, g - 1.5, 3.2, 1.8, S.BODY, 116);
      for (let y = g - 7; y <= g - 2; y++) sp.set(2, y, S.BODY, 146);
      sp.ellipse(7, g - 10, 2.6, 2.3, S.BODY, 130), sp.set(5, g - 13, S.BODY_D, 128), sp.set(5, g - 12, S.BODY, 128), sp.set(6, g - 12, S.BODY, 120), sp.set(8, g - 13, S.BODY_D, 128), sp.set(8, g - 12, S.BODY, 128), sp.set(8, g - 10, S.EYE, 128), sp.set(6, g - 10, S.EYE, 110), sp.set(9, g - 9, S.BODY_L, 140);
      for (let y = g - 3; y <= g; y++) sp.set(7, y, S.BODY_L, 122);
      sp.set(8, g, S.BODY_L, 116);
      let w = f % 2;
      for (let x = 1; x <= 6; x++) sp.set(x, g, S.BODY_D, 104);
      sp.set(0, g - 1 - w, S.BODY_D, 110), sp.set(1, g - 1, S.BODY_D, 110), sp.set(0, g - 2 - w, S.BODY_D, 104);
      return;
    }
    let ph = f % 2, by = g - 6;
    sp.ellipse(8, by, 6, 2.6, S.BODY, 126);
    for (let x = 4; x <= 12; x++) sp.set(x, by - 2, S.BODY, 146);
    for (let x = 5; x <= 11; x++) sp.set(x, by + 2, S.BODY_L, 112);
    [[4, -1], [6, 1], [10, 1], [12, -1]].forEach(([lx, s], i) => {
      let off = ph ? s : -s;
      for (let y = by + 2; y <= g; y++) sp.set(lx + (y === g ? off : 0), y, i % 2 ? S.BODY : S.BODY_D, i % 2 ? 124 : 100);
    }), sp.ellipse(14, by - 2, 2.6, 2.2, S.BODY, 130), sp.set(12, by - 5, S.BODY_D, 128), sp.set(12, by - 4, S.BODY, 128), sp.set(15, by - 5, S.BODY_D, 128), sp.set(15, by - 4, S.BODY, 128), sp.set(15, by - 2, S.EYE, 128), sp.set(13, by - 2, S.EYE, 110), sp.set(16, by - 1, S.BODY_L, 140);
    for (let k = 0; k < 6; k++) sp.set(2 - (k > 3 ? k - 3 : 0), by - 1 - k, S.BODY, 122 - k * 2);
    sp.set(0, by - 6, S.BODY_D, 110);
  }
  function paintSquirrel(sp, anim, f) {
    let g = sp.h - 1;
    if (anim === "stand") {
      sp.ellipse(7, g - 4, 2.4, 3.6, S.BODY, 126), sp.ellipse(8, g - 9, 2, 1.8, S.BODY, 132), sp.set(7, g - 11, S.BODY_D, 120), sp.set(9, g - 9, S.EYE, 128), sp.set(9, g - 6, S.BODY_L, 130), sp.set(9, g - 7, S.BODY_L, 130);
      for (let y = g - 4; y <= g - 1; y++) sp.set(8, y, S.BODY_L, 112);
      for (let k = 0; k < 9; k++) {
        let x = 4 - Math.round(Math.sin(k / 8 * Math.PI) * 2.5), y = g - 1 - k;
        sp.set(x, y, S.BODY_L, 146), sp.set(x - 1, y, S.BODY_L, 126), sp.set(x + 1, y, S.BODY_D, 112);
      }
      sp.set(7, g, S.BODY_D, 100), sp.set(8, g, S.BODY_D, 100);
      return;
    }
    let hop = anim === "run" && f === 1 ? 2 : 0, by = g - 3 - hop;
    sp.ellipse(7, by, 3.4, 2, S.BODY, 126), sp.ellipse(10.5, by - 1.5, 1.9, 1.7, S.BODY, 132), sp.set(10, by - 3, S.BODY_D, 120), sp.set(11, by - 2, S.EYE, 128);
    for (let k = 0; k < 7; k++) {
      let x = 3 - Math.round(Math.sin(k / 6 * Math.PI) * 2), y = by - k;
      sp.set(x, y, S.BODY_L, 146), sp.set(x + 1, y, S.BODY_L, 124);
    }
    sp.set(5 - f, by + 2, S.BODY_D, 104), sp.set(5 - f, by + 3, S.BODY_D, 96), sp.set(9 + f, by + 2, S.BODY_D, 104), sp.set(9 + f, by + 3, S.BODY_D, 96);
  }
  function paintDuck(sp, anim, f) {
    let g = sp.h - 1, by = g - 3;
    sp.ellipse(7, by, 5, 2.4, S.BODY, 126);
    for (let x = 4; x <= 10; x++) sp.set(x, by - 2, S.BODY_L, 142);
    for (let x = 5; x <= 9; x++) sp.set(x, by - 1, S.BODY_L, 126);
    if (sp.set(1, by - 2, S.BODY_D, 120), sp.set(2, by - 2, S.BODY_D, 110), sp.set(1, by - 1, S.BODY_D, 104), sp.set(11, by - 2, S.ACCENT, 120), sp.set(11, by - 3, S.ACCENT, 128), sp.ellipse(12.5, by - 5, 2, 1.8, S.ACCENT, 130), sp.set(13, by - 6, S.EYE, 128), sp.set(14, by - 5, S.BEAK, 128), sp.set(15, by - 5, S.BEAK, 116), sp.set(14, by - 4, S.BEAK, 104), anim === "swim") for (let x = 0; x < sp.w; x++) (x + f * 2) % 5 < 2 && sp.set(x, g, S.WHITE, 120);
  }
  function paintRat(sp, f) {
    let g = sp.h - 1;
    sp.ellipse(6.5, g - 2.5, 3.6, 1.8, S.BODY, 124);
    for (let x = 4; x <= 8; x++) sp.set(x, g - 4, S.BODY, 140);
    sp.ellipse(10.5, g - 2.5, 1.6, 1.3, S.BODY, 130), sp.set(12, g - 2, S.BODY_L, 128), sp.set(10, g - 4, S.BODY_L, 120), sp.set(11, g - 3, S.EYE, 128);
    for (let k = 0; k < 4; k++) sp.set(2 - k, g - 2 + (k > 1 ? f : 0), S.BODY_L, 110);
    sp.set(4 + f, g, S.BODY_D, 100), sp.set(8 - f, g, S.BODY_D, 100);
  }
  function buildPropSprites(atlas) {
    let A = atlas;
    A.add("dish", 16, 18, (sp) => {
      for (let y = 1; y < 12; y++) for (let x = 1; x < 13; x++) {
        let d = ((x - 6.5) / 5.6) ** 2 + ((y - 6) / 4.8) ** 2;
        d <= 1 && sp.set(x, y, x + y < 11 ? S.C1 : S.C4, d > 0.7 ? 110 : 140 - Math.round(d * 30));
      }
      for (let k = 0; k < 4; k++) sp.set(9 + k, 6 - (k >> 1), S.C3, 120);
      sp.set(13, 4, S.C3, 140), sp.set(14, 4, S.C3, 128), sp.set(13, 5, S.C3, 110);
      for (let y = 11; y < 18; y++)
        sp.set(7, y, S.C3, 124), sp.set(8, y, S.C3, 96);
      sp.set(6, 17, S.C3, 110), sp.set(9, 17, S.C3, 100);
    }), A.add("antenna", 18, 36, (sp) => {
      for (let y = 3; y < 36; y++)
        sp.set(9, y, S.C3, 124), sp.set(10, y, S.C3, 96);
      for (let k = 0; k < 5; k++) {
        let half = 7 - k, yy = 4 + k * 5;
        for (let x = 9 - half; x <= 10 + half; x++) sp.set(x, yy, S.C3, 140 - k * 4);
        sp.set(9 - half, yy + 1, S.C3, 110), sp.set(10 + half, yy + 1, S.C3, 110);
      }
      sp.set(9, 2, S.C2, 150), sp.set(10, 2, S.C2, 128);
    }), A.add("deckchair", 18, 12, (sp) => {
      for (let x = 1; x < 13; x++) {
        let y = 7 - Math.floor(x / 6);
        sp.set(x, y, S.C5, (x >> 1) % 2 ? 128 : 150), sp.set(x, y + 1, S.C5, 104);
      }
      for (let k = 0; k < 6; k++)
        sp.set(13 + (k >> 1), 6 - k, S.C5, 140), sp.set(14 + (k >> 1), 6 - k, S.C5, 112);
      for (let k = 0; k < 4; k++)
        sp.set(2, 8 + k, S.C3, 110), sp.set(11, 8 + k, S.C3, 110), sp.set(15, 7 + k, S.C3, 100);
    }), A.add("bush", 24, 18, (sp) => {
      let blobs = [[7, 11, 6], [15, 10, 7], [11, 7, 6], [19, 12, 4.5], [4, 13, 4]];
      for (let [bx, by, r] of blobs)
        for (let y = 0; y < 18; y++)
          for (let x = 0; x < 24; x++) {
            let d = ((x + 0.5 - bx) / r) ** 2 + ((y + 0.5 - by) / (r * 0.85)) ** 2;
            if (d > 1 || d > 0.7 && hash2i(x >> 1, y >> 1, 9) < 0.4) continue;
            let l = -(x - 12) / 12 * 0.5 - (y - 9) / 9 * 0.7 + (hash2i(x >> 1, y >> 1, 4) - 0.5) * 0.6;
            sp.set(x, y, l > 0.3 ? S.C8 : l > -0.25 ? S.C9 : S.C10, 128);
          }
      for (let x = 0; x < 24; x++) for (let y = 17; y >= 10; y--) sp.get(x, y) >= 0 && (sp.get(x, y + 1) < 0 || sp.get(x, y + 2) < 0) && sp.set(x, y, S.C10, 110);
    }), A.add("grill", 12, 14, (sp) => {
      for (let y = 1; y < 9; y++) for (let x = 0; x < 12; x++)
        ((x + 0.5 - 6) / 5.6) ** 2 + ((y + 0.5 - 5) / 4) ** 2 <= 1 && sp.set(x, y, S.C3, x < 4 ? 150 : x > 8 ? 100 : 124);
      for (let x = 1; x < 11; x++) sp.set(x, 5, S.C4, 120);
      sp.set(5, 0, S.C4, 140), sp.set(6, 0, S.C4, 128);
      for (let k = 0; k < 5; k++)
        sp.set(3 - (k >> 1), 9 + k, S.C4, 110), sp.set(8 + (k >> 1), 9 + k, S.C4, 100), sp.set(6, 9 + k, S.C4, 96);
    }), A.add("laundry", 52, 32, (sp) => {
      for (let y = 3; y < 32; y++)
        sp.set(0, y, S.C3, 128), sp.set(1, y, S.C3, 100), sp.set(50, y, S.C3, 128), sp.set(51, y, S.C3, 100);
      let sag = (x2) => 4 + Math.round(Math.sin(x2 / 51 * Math.PI) * 4);
      for (let x2 = 1; x2 < 51; x2++) sp.set(x2, sag(x2), S.C4, 128);
      let cols = [S.C5, S.C6, S.C7, S.C1, S.C2], widths = [8, 6, 7, 3, 9], heights = [10, 11, 13, 5, 14], x = 4;
      for (let k = 0; k < 5; k++) {
        let c = cols[k], wdt = widths[k], hgt = heights[k], top = sag(x + wdt / 2) + 1;
        for (let yy = 0; yy < hgt; yy++)
          for (let xx = 0; xx < wdt; xx++)
            k === 0 && yy > 3 && (xx < 2 || xx > wdt - 3) || k === 2 && yy < 4 && (xx < 1 || xx > wdt - 2) || sp.set(x + xx, top + yy, c, xx === 0 ? 146 : xx === wdt - 1 ? 104 : (xx + yy) % 5 === 0 ? 116 : 128);
        sp.set(x + 1, top - 1, S.C4, 150), sp.set(x + wdt - 2, top - 1, S.C4, 150), x += wdt + 2;
      }
    }), A.add("statue", 32, 40, (sp) => {
      let c = S.C9, shadeAt = (x, y, cx, cy) => x + y < cx + cy - 4 ? 150 : x > cx + 3 || y > cy + 2 ? 100 : 126;
      for (let y = 20; y < 32; y++) for (let x = 5; x < 26; x++)
        ((x + 0.5 - 15) / 9.5) ** 2 + ((y + 0.5 - 26) / 4.6) ** 2 <= 1 && sp.set(x, y, c, shadeAt(x, y, 15, 26));
      for (let k = 0; k < 10; k++) for (let w = 0; w < 4; w++) sp.set(21 + Math.round(k * 0.45) + w, 24 - k, c, w === 0 ? 146 : w === 3 ? 100 : 126);
      for (let y = 12; y < 18; y++) for (let x = 25; x < 31; x++) ((x + 0.5 - 27.5) / 3.2) ** 2 + ((y + 0.5 - 14.5) / 2.4) ** 2 <= 1 && sp.set(x, y, c, x < 27 ? 144 : 118);
      sp.set(26, 11, c, 140), sp.set(27, 10, c, 132), sp.set(30, 16, c, 104);
      for (let k = 0; k < 6; k++) sp.set(22 + (k >> 1), 22 - k, c, 92);
      for (let y = 30; y < 38; y++)
        sp.set(8, y, c, 120), sp.set(9, y, c, 100), sp.set(11, y, c, 110), sp.set(12, y, c, 96), sp.set(21, y, c, 120), sp.set(22, y, c, 100);
      for (let k = 0; k < 5; k++)
        sp.set(23 + (k >> 1), 30 + k - (k > 2 ? 2 : 0), c, 126), sp.set(24 + (k >> 1), 30 + k - (k > 2 ? 2 : 0), c, 104);
      for (let k = 0; k < 8; k++)
        sp.set(5 - (k >> 2), 23 + k, c, 112), sp.set(4 - (k >> 2), 23 + k, c, 130);
      for (let y = 13; y < 22; y++) for (let x = 13; x < 18; x++) sp.set(x, y, c, x === 13 ? 148 : x === 17 ? 100 : 126);
      for (let y = 21; y < 25; y++)
        sp.set(12, y, c, 120), sp.set(13, y, c, 110);
      sp.ellipse(15.5, 10, 2.2, 2.4, c, 136);
      for (let x = 12; x < 20; x++) sp.set(x, 8, c, 116);
      for (let x = 13; x < 18; x++) sp.set(x, 7, c, 132);
      for (let k = 0; k < 7; k++)
        sp.set(17 + k, 15 - (k >> 1), c, 136), sp.set(17 + k, 16 - (k >> 1), c, 108);
      sp.set(24, 12, S.C10, 150);
      for (let x = 14; x < 18; x++) sp.set(x, 18, S.C10, 128);
      for (let x = 3; x < 29; x++)
        sp.set(x, 38, c, 116), sp.set(x, 39, c, 94);
    });
    let X = TREE_SPECIES.xmas;
    A.add("xmas", X.w, X.h, (sp) => paintTree(sp, X, 77), X.w / 2, X.h - 1), A.add("snowman", 18, 26, (sp) => {
      let balls = [[9, 20.5, 7, 5.5], [9, 11.5, 5.2, 4.4], [9, 4.8, 3.6, 3.4]];
      for (let [bx, by, rx, ry] of balls)
        for (let y = Math.floor(by - ry); y <= Math.ceil(by + ry); y++)
          for (let x = Math.floor(bx - rx); x <= Math.ceil(bx + rx); x++) {
            let dx = (x + 0.5 - bx) / rx, dy = (y + 0.5 - by) / ry;
            dx * dx + dy * dy > 1 || sp.set(x, y, S.C1, dx + dy * 0.6 < -0.4 ? 150 : dx > 0.45 || dy > 0.6 ? 104 : 128);
          }
      for (let x = 6; x <= 12; x++) sp.set(x, 2, S.C3, 110);
      for (let y = -1; y < 2; y++) for (let x = 7; x <= 11; x++) sp.set(x, y, S.C3, x === 7 ? 140 : 120);
      sp.set(8, 4, S.C3, 128), sp.set(10, 4, S.C3, 128), sp.set(11, 5, S.C7, 140), sp.set(12, 5, S.C7, 120), sp.set(13, 6, S.C7, 110);
      for (let x = 6; x <= 12; x++) sp.set(x, 8, S.C5, x === 6 ? 140 : 120);
      sp.set(11, 9, S.C5, 120), sp.set(11, 10, S.C5, 110), sp.set(12, 11, S.C5, 104), sp.set(9, 11, S.C3, 128), sp.set(9, 14, S.C3, 128), sp.set(9, 18, S.C3, 128);
      for (let k = 0; k < 4; k++)
        sp.set(4 - k, 11 - k, S.C4, 110), sp.set(14 + k, 11 - k, S.C4, 110);
      sp.set(1, 6, S.C4, 100), sp.set(16, 6, S.C4, 100);
    }, 9, 25), A.add("umbrella", 22, 12, (sp) => {
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 22; x++) {
          let dx = (x + 0.5 - 11) / 10.8, dy = (y + 0.5 - 7) / 7;
          if (dx * dx + dy * dy > 1 || y === 6 && x % 5 === 2) continue;
          let panel = Math.floor((x + 0.5 - 11) / 3.6);
          sp.set(x, y, S.ITEM, (x < 11 ? 146 : 112) + (panel % 2 ? -10 : 6));
        }
      for (let x = 2; x < 22; x += 5) sp.set(x, 6, S.DARK, 110);
      for (let y = 7; y < 12; y++) sp.set(11, y, S.DARK, 128);
      sp.set(10, 11, S.DARK, 110), sp.set(11, 0, S.DARK, 128);
    }, 11, 11), A.add("ball", 4, 4, (sp) => {
      for (let [x, y, sh] of [[1, 0, 150], [2, 0, 136], [0, 1, 146], [1, 1, 136], [2, 1, 120], [3, 1, 108], [0, 2, 128], [1, 2, 116], [2, 2, 104], [3, 2, 96], [1, 3, 100], [2, 3, 92]]) sp.set(x, y, S.C1, sh);
      sp.set(1, 2, S.C3, 110), sp.set(2, 1, S.C3, 110);
    }, 2, 3), A.add("snowball", 3, 3, (sp) => {
      sp.set(1, 0, S.C2, 150), sp.set(0, 1, S.C2, 140), sp.set(1, 1, S.C2, 128), sp.set(2, 1, S.C2, 110), sp.set(1, 2, S.C2, 104);
    }, 1, 2), A.add("frisbee", 6, 2, (sp) => {
      for (let x = 0; x < 6; x++) sp.set(x, 0, S.C6, x < 2 ? 150 : 128);
      for (let x = 1; x < 5; x++) sp.set(x, 1, S.C6, 100);
    }, 3, 1);
    for (let [n, w, h] of [["puff1", 10, 8], ["puff2", 16, 12], ["puff3", 22, 16], ["puff4", 28, 20]])
      A.add(n, w, h, (sp) => {
        let rr = new RNG(w * 7 + 3), blobs = [[w / 2, h * 0.6, w * 0.3, h * 0.36]];
        for (let k = 0; k < 4; k++) blobs.push([w * rr.range(0.28, 0.72), h * rr.range(0.38, 0.62), w * rr.range(0.18, 0.27), h * rr.range(0.22, 0.32)]);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            let best = 0;
            for (let [bx, by, rx, ry] of blobs) {
              let d = 1 - (((x + 0.5 - bx) / rx) ** 2 + ((y + 0.5 - by) / ry) ** 2);
              d > best && (best = d);
            }
            if (best <= 0 || best < 0.22 && hash2i(x, y, w) < 0.5) continue;
            let lit = x + y < (w + h) * 0.42;
            sp.set(x, y, S.C1, lit ? 150 : best < 0.3 ? 106 : 126);
          }
      }, Math.floor(w / 2), h - 1);
    A.add("leaf", 3, 2, (sp) => {
      sp.set(0, 0, S.C1, 140), sp.set(1, 0, S.C1, 128), sp.set(1, 1, S.C1, 110), sp.set(2, 1, S.C1, 96);
    }, 1, 1), A.add("glow", 7, 3, (sp) => {
      for (let x = 1; x < 6; x++)
        sp.set(x, 0, S.C1, 110), sp.set(x, 2, S.C1, 110);
      for (let x = 0; x < 7; x++) sp.set(x, 1, S.C1, x === 0 || x === 6 ? 110 : x >= 2 && x <= 4 ? 160 : 140);
    }, 3, 0), A.add("dot", 1, 1, (sp) => sp.set(0, 0, S.C1, 128), 0, 0), A.add("dot2", 2, 2, (sp) => {
      sp.set(0, 0, S.C1, 140), sp.set(1, 0, S.C1, 128), sp.set(0, 1, S.C1, 128), sp.set(1, 1, S.C1, 110);
    }, 1, 1), A.add("flake", 3, 3, (sp) => {
      sp.set(1, 0, S.C1, 128), sp.set(0, 1, S.C1, 128), sp.set(1, 1, S.C1, 150), sp.set(2, 1, S.C1, 128), sp.set(1, 2, S.C1, 128);
    }, 1, 1), A.add("cartUmbrella", 40, 24, (sp) => {
      for (let y = 0; y < 10; y++)
        for (let x = 0; x < 40; x++) {
          let dx = (x + 0.5 - 20) / 19.5, dy = (y + 0.5 - 10) / 10;
          if (dx * dx + dy * dy > 1 || y === 9 && x % 6 === 3) continue;
          let seg = Math.floor((Math.atan2(x + 0.5 - 20, 10.5 - y) + Math.PI) / (Math.PI / 7));
          sp.set(x, y, seg % 2 ? S.C1 : S.C2, x < 20 ? 146 : 112);
        }
      for (let y = 10; y < 24; y++)
        sp.set(19, y, S.C3, 120), sp.set(20, y, S.C3, 96);
      sp.set(19, 0, S.C3, 128);
    }, 20, 23), A.add("bike", 22, 14, (sp) => {
      let wheel = (cx) => {
        for (let a = 0; a < 28; a++) {
          let ang = a / 28 * Math.PI * 2;
          sp.set(Math.round(cx + Math.cos(ang) * 4), Math.round(9 + Math.sin(ang) * 4), S.C3, 110);
        }
        sp.set(cx, 9, S.C4, 128);
      };
      wheel(5), wheel(17), sp.line(5, 9, 10, 9, S.C5), sp.line(10, 9, 15, 4, S.C5), sp.line(8, 4, 15, 4, S.C5), sp.line(8, 4, 10, 9, S.C5), sp.line(5, 9, 8, 4, S.C5), sp.line(15, 4, 17, 9, S.C5), sp.set(7, 3, S.C3, 128), sp.set(8, 3, S.C3, 128), sp.set(9, 3, S.C3, 128), sp.set(15, 2, S.C3, 128), sp.set(16, 2, S.C3, 128), sp.set(15, 3, S.C3, 110);
    }, 11, 13), A.add("stroller", 14, 14, (sp) => {
      for (let y = 3; y < 9; y++) for (let x = 2; x < 11; x++) sp.set(x, y, S.ITEM, x < 4 ? 150 : y === 8 ? 100 : 122);
      for (let y = 0; y < 5; y++) for (let x = 1; x < 6; x++) ((x + 0.5 - 6) / 5) ** 2 + ((y + 0.5 - 5) / 5) ** 2 <= 1 && sp.set(x, y, S.ITEM, 144);
      sp.line(11, 4, 13, 0, S.DARK), sp.line(3, 9, 11, 9, S.DARK), sp.ellipse(3.5, 11.5, 2, 2, S.DARK, 120), sp.ellipse(10.5, 11.5, 2, 2, S.DARK, 120), sp.set(3, 11, S.C4, 140), sp.set(10, 11, S.C4, 140);
    }, 6, 13);
    for (let f = 0; f < 4; f++)
      A.add("flag_us" + f, 26, 20, (sp) => {
        for (let y = 0; y < 14; y++)
          for (let x = 0; x < 24; x++) {
            let wv = Math.sin(x * 0.32 + f * 1.57), wy = y + Math.round(wv * 1.6 * (x / 24)), canton = x < 10 && y < 7, slot = canton ? S.C7 : y % 2 ? S.C2 : S.C1;
            canton && x % 2 === 1 && y % 2 === 1 && (slot = S.C2), sp.set(x + 2, wy + 2, slot, 116 + Math.round(wv * 24));
          }
        for (let y = 0; y < 20; y++)
          sp.set(0, y, S.C3, 128), sp.set(1, y, S.C3, 100);
        sp.set(0, 0, S.C6, 150), sp.set(1, 0, S.C6, 128);
      }, 0, 19), A.add("flag_hotel" + f, 26, 20, (sp) => {
        for (let y = 0; y < 14; y++)
          for (let x = 0; x < 24; x++) {
            let wv = Math.sin(x * 0.32 + f * 1.57), wy = y + Math.round(wv * 1.6 * (x / 24));
            sp.set(x + 2, wy + 2, y === 2 || y === 11 ? S.C2 : S.C6, 116 + Math.round(wv * 24));
          }
        for (let y = 0; y < 20; y++)
          sp.set(0, y, S.C3, 128), sp.set(1, y, S.C3, 100);
      }, 0, 19);
    A.add("lamp2", 4, 4, (sp) => {
      for (let [x, y] of [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3]]) sp.set(x, y, S.C1, x === 1 && y === 1 ? 160 : 128);
    }, 2, 3), A.add("lamp1", 2, 4, (sp) => {
      for (let y = 0; y < 4; y++)
        sp.set(0, y, S.C1, 128), sp.set(1, y, S.C1, 128);
    }, 0, 3), A.add("pedHand", 5, 6, (sp) => {
      for (let [x, y] of [[0, 0], [2, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [1, 4], [2, 4], [3, 4], [1, 5], [2, 5], [3, 5]]) sp.set(x, y, S.C1, 128);
    }, 2, 5), A.add("pedWalk", 5, 7, (sp) => {
      for (let [x, y] of [[2, 0], [1, 1], [2, 1], [3, 1], [0, 2], [2, 2], [4, 2], [2, 3], [1, 4], [3, 4], [1, 5], [4, 5], [0, 6], [4, 6]]) sp.set(x, y, S.C1, 128);
    }, 2, 6), A.add("beacon", 5, 5, (sp) => {
      for (let [x, y, s] of [[2, 0, 128], [1, 1, 140], [2, 1, 160], [3, 1, 140], [0, 2, 128], [1, 2, 160], [2, 2, 180], [3, 2, 160], [4, 2, 128], [1, 3, 140], [2, 3, 160], [3, 3, 140], [2, 4, 128]]) sp.set(x, y, S.C1, s);
    }, 2, 2), A.add("treeBundle", 16, 28, (sp) => {
      for (let y = 0; y < 26; y++) {
        let half = Math.min(7, 1 + y / 3.5);
        for (let x = Math.round(8 - half); x < Math.round(8 + half); x++) sp.set(x, y, (x * 3 + y * 2) % 7 < 3 ? S.C10 : S.C8, x < 8 ? 140 : 110);
      }
      for (let y = 4; y < 26; y += 6) for (let x = 2; x < 14; x++) sp.get(x, y) >= 0 && sp.set(x, y, S.C4, 120);
      sp.set(7, 26, S.C4, 100), sp.set(8, 26, S.C4, 100), sp.set(7, 27, S.C4, 90), sp.set(8, 27, S.C4, 90);
    }, 8, 27), A.add("firefly", 1, 1, (sp) => sp.set(0, 0, S.C1, 128), 0, 0), A.add("pumpkinSmall", 8, 6, (sp) => {
      sp.ellipse(4, 3.5, 3.8, 2.5, S.C5, 128), sp.set(2, 2, S.C5, 150), sp.set(3, 1, S.C5, 146), sp.set(4, 0, S.C8, 128);
    }), A.add("coffee", 4, 6, (sp) => {
      for (let x = 0; x < 4; x++) sp.set(x, 0, S.C2, 128);
      for (let y = 1; y < 6; y++) for (let x = 0; x < 4; x++) sp.set(x, y, S.C4, x === 0 ? 140 : x === 3 ? 104 : 124);
      sp.set(1, 3, S.C3, 110), sp.set(2, 3, S.C3, 110);
    });
  }
  var PROP_COLORS = {
    // generic prop palette slots
    [S.C1]: 15921904,
    [S.C2]: 13119532,
    [S.C3]: 3815998,
    [S.C4]: 10132899,
    [S.C5]: 2777016,
    [S.C6]: 15253552,
    [S.C7]: 2046586,
    [S.C8]: 5941308,
    [S.C9]: 5216902,
    [S.C10]: 3107368
  };

  // src/render/spriteLayer.js
  var TX = 32 .toFixed(1), HEAD2 = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
`, VS = HEAD2 + `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec4 iRect;
layout(location=3) in vec4 iA; // ax, ay, palRow, flags
layout(location=4) in vec2 iB; // alpha, depth bias
uniform mat4 uViewProj;
uniform vec2 uBuf;
out vec2 vUV;
flat out vec4 vInfo;
out vec3 vWorld;
void main() {
  vec4 c = uViewProj * vec4(iPos, 1.0);
  vec2 px = floor((c.xy * 0.5 + 0.5) * uBuf + 0.5);
  float flags = iA.w;
  bool flip = mod(flags, 2.0) >= 1.0;
  float w = iRect.z, h = iRect.w;
  float ax = flip ? w - iA.x : iA.x;
  vec2 off = vec2(aCorner.x * w - ax, iA.y - aCorner.y * h);
  vec2 sp = px + off;
  float tx = flip ? (1.0 - aCorner.x) * w : aCorner.x * w;
  vUV = iRect.xy + vec2(tx, aCorner.y * h);
  vInfo = vec4(iA.z, flags, iB.x, 0.0);
  vWorld = iPos + vec3(0.0, 0.0, (iA.y - aCorner.y * h) / ${TX});
  gl_Position = vec4(sp / uBuf * 2.0 - 1.0, c.z - iB.y, 1.0);
}`, FS = HEAD2 + `
in vec2 vUV;
flat in vec4 vInfo;
in vec3 vWorld;
uniform sampler2D uSprites;
uniform sampler2D uPal;
uniform sampler2DShadow uShadow;
uniform sampler2D uLightMap;
uniform sampler2D uNoise;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform vec4 uCloud;
uniform float uFlash;
uniform float uEmis;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
void main() {
  vec4 t = texelFetch(uSprites, ivec2(floor(vUV)), 0);
  if (t.a < 0.5) discard;
  if (vInfo.z < 0.999 && bayer4(gl_FragCoord.xy) >= vInfo.z) discard;
  int row = int(vInfo.x + 0.5);
  int slot = int(t.r * 255.0 + 0.5);
  vec4 pc = texelFetch(uPal, ivec2(slot, row), 0);
  if (pc.a < 0.1) {
    int alt = int(t.b * 255.0 + 0.5);
    if (alt == 0) discard;
    pc = texelFetch(uPal, ivec2(alt, row), 0);
    if (pc.a < 0.1) discard;
  }
  float sh = t.g * 255.0 / 128.0;
  vec3 albedo = pc.rgb * sh;
  int flags = int(vInfo.y + 0.5);
  bool emissive = pc.a < 0.75 || (flags & 2) != 0;
  if (emissive) {
    float k = (flags & 2) != 0 ? 1.0 : uEmis;
    oColor = vec4(albedo * (0.6 + 0.6 * k), 1.0);
    oGlow = vec4(albedo * k, 1.0);
    return;
  }
  float s = 1.0;
  if (uShadowOn > 0.5 && (flags & 16) == 0) {
    vec4 spos = uShadowMat * vec4(vWorld + uSunDir * 0.12, 1.0);
    vec3 sc = spos.xyz * 0.5 + 0.5;
    if (sc.x > 0.0 && sc.y > 0.0 && sc.x < 1.0 && sc.y < 1.0 && sc.z < 1.0) {
      s = texture(uShadow, vec3(sc.xy, sc.z - 0.0015));
      s = step(bayer4(gl_FragCoord.xy), s);
    }
  }
  float cn = texture(uNoise, vWorld.xy * 0.006 + uCloud.xy).r * 0.65 + texture(uNoise, vWorld.xy * 0.017 + uCloud.xy * 1.7).r * 0.35;
  float cl = 1.0 - smoothstep(1.0 - uCloud.z - 0.08, 1.0 - uCloud.z + 0.08, cn) * uCloud.w;
  vec3 lm = vWorld.z < -0.5 ? vec3(0.0) : texture(uLightMap, vWorld.xy / 128.0).rgb;
  float hf = clamp(1.0 - (vWorld.z - 0.3) / 8.0, 0.0, 1.0);
  vec3 light = uAmb * 0.92 + uSunCol * 0.8 * s * cl * smoothstep(0.0, 0.15, uSunDir.z + 0.05) + lm * hf * hf * 1.1 + vec3(uFlash);
  if (vWorld.z < -0.5) light = light * 0.5 + vec3(0.2, 0.19, 0.16);
  if ((flags & 32) != 0) light = max(light, vec3(0.55));
  oColor = vec4(albedo * light, 1.0);
  oGlow = vec4(0.0, 0.0, 0.0, 1.0);
}`, SHADOW_VS2 = HEAD2 + `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec4 iRect;
layout(location=3) in vec4 iA;
layout(location=4) in vec2 iB;
uniform mat4 uShadowVP;
uniform vec3 uSunDir;
out vec2 vUV;
void main() {
  float flags = iA.w;
  bool noShadow = mod(floor(flags / 4.0), 2.0) >= 1.0;
  if (noShadow) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 right = normalize(vec3(-uSunDir.y, uSunDir.x, 0.0) + vec3(1e-4, 0.0, 0.0));
  float w = iRect.z, h = iRect.w;
  vec3 wp = iPos + right * ((aCorner.x * w - iA.x) / ${TX}) + vec3(0.0, 0.0, (iA.y - aCorner.y * h) / ${TX});
  vUV = iRect.xy + vec2(aCorner.x * w, aCorner.y * h);
  gl_Position = uShadowVP * vec4(wp, 1.0);
}`, SHADOW_FS2 = HEAD2 + `
in vec2 vUV;
uniform sampler2D uSprites;
out vec4 o;
void main() {
  if (texelFetch(uSprites, ivec2(floor(vUV)), 0).a < 0.5) discard;
  o = vec4(1.0);
}`, SF = { FLIP: 1, EMISSIVE: 2, NOSHADOW: 4, NOSHADE: 16, BRIGHT: 32 }, STRIDE = 13, SpriteLayer = class {
    constructor(gl, atlas, pal) {
      this.gl = gl, this.atlas = atlas, this.pal = pal, this.prog = createProgram(gl, VS, FS, "sprites"), this.shadowProg = createProgram(gl, SHADOW_VS2, SHADOW_FS2, "spriteShadow"), this.cap = 8192, this.data = new Float32Array(this.cap * STRIDE), this.count = 0, this.vao = gl.createVertexArray(), gl.bindVertexArray(this.vao);
      let corner = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, corner), gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW), gl.enableVertexAttribArray(0), gl.vertexAttribPointer(0, 2, gl.FLOAT, !1, 0, 0), this.ibuf = gl.createBuffer(), gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf), gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
      let B2 = STRIDE * 4, attr = (loc, n, off) => {
        gl.enableVertexAttribArray(loc), gl.vertexAttribPointer(loc, n, gl.FLOAT, !1, B2, off * 4), gl.vertexAttribDivisor(loc, 1);
      };
      attr(1, 3, 0), attr(2, 4, 3), attr(3, 4, 7), attr(4, 2, 11), gl.bindVertexArray(null);
    }
    begin() {
      this.count = 0;
    }
    push(x, y, z, f, row, flags = 0, alpha = 1, bias = 0) {
      if (this.count >= this.cap) return;
      let d = this.data, o = this.count * STRIDE;
      d[o] = x, d[o + 1] = y, d[o + 2] = z, d[o + 3] = f.x, d[o + 4] = f.y, d[o + 5] = f.w, d[o + 6] = f.h, d[o + 7] = f.ax, d[o + 8] = f.ay, d[o + 9] = row, d[o + 10] = flags, d[o + 11] = alpha, d[o + 12] = bias, this.count++;
    }
    end() {
      let gl = this.gl;
      this.atlas.upload(gl), this.pal.upload(gl), gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf), gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * STRIDE));
    }
    shadow(ctx) {
      if (!this.count) return;
      let gl = this.gl, p = this.shadowProg;
      gl.useProgram(p.program), gl.uniformMatrix4fv(p.u.uShadowVP, !1, ctx.shadowMat), gl.uniform3fv(p.u.uSunDir, ctx.env.sunDir), gl.activeTexture(gl.TEXTURE0), gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex), gl.uniform1i(p.u.uSprites, 0), gl.bindVertexArray(this.vao), gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    }
    draw(ctx) {
      if (!this.count) return;
      let gl = this.gl, p = this.prog, u = p.u, r = ctx.renderer, e = ctx.env;
      gl.useProgram(p.program), gl.uniformMatrix4fv(u.uViewProj, !1, ctx.viewProj), gl.uniform2f(u.uBuf, ctx.bw, ctx.bh), gl.uniformMatrix4fv(u.uShadowMat, !1, ctx.shadowMat), gl.uniform1f(u.uShadowOn, ctx.shadowOn ? 1 : 0), gl.uniform3fv(u.uSunDir, e.sunDir), gl.uniform3fv(u.uSunCol, e.sunCol), gl.uniform3fv(u.uAmb, e.amb), gl.uniform4fv(u.uCloud, e.cloud), gl.uniform1f(u.uFlash, e.flash), gl.uniform1f(u.uEmis, e.emis), gl.activeTexture(gl.TEXTURE0), gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex), gl.uniform1i(u.uSprites, 0), gl.activeTexture(gl.TEXTURE1), gl.bindTexture(gl.TEXTURE_2D, this.pal.tex), gl.uniform1i(u.uPal, 1), gl.activeTexture(gl.TEXTURE2), gl.bindTexture(gl.TEXTURE_2D, r.shadowTex), gl.uniform1i(u.uShadow, 2), gl.activeTexture(gl.TEXTURE3), gl.bindTexture(gl.TEXTURE_2D, r.lightTex), gl.uniform1i(u.uLightMap, 3), gl.activeTexture(gl.TEXTURE4), gl.bindTexture(gl.TEXTURE_2D, r.noiseTex), gl.uniform1i(u.uNoise, 4), gl.bindVertexArray(this.vao), gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    }
  };

  // src/render/lightLayer.js
  var VS2 = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iA; // x, y, rx, ry
layout(location=2) in vec4 iB; // dirx, diry, k, unused
layout(location=3) in vec3 iC; // colour
out vec2 vL;
flat out vec3 vCol;
void main() {
  vec2 c = aCorner * 2.0 - 1.0;
  vec2 d = normalize(iB.xy + vec2(1e-5, 0.0));
  vec2 pp = vec2(-d.y, d.x);
  vec2 w = iA.xy + d * (c.x * iA.z) + pp * (c.y * iA.w);
  vL = c;
  vCol = iC * iB.z;
  gl_Position = vec4(w / 128.0 * 2.0 - 1.0, 0.0, 1.0);
}`, FS2 = `#version 300 es
precision highp float;
in vec2 vL;
flat in vec3 vCol;
out vec4 o;
void main() {
  float d = dot(vL, vL);
  if (d > 1.0) discard;
  float f = (1.0 - d);
  f = f * f;
  // quantise into soft pixel-art bands
  f = floor(f * 6.0 + 0.5) / 6.0 * 0.85 + f * 0.15;
  o = vec4(vCol * f, 1.0);
}`, STRIDE2 = 11, LightLayer = class {
    constructor(gl) {
      this.gl = gl, this.prog = createProgram(gl, VS2, FS2, "lights"), this.cap = 4096, this.data = new Float32Array(this.cap * STRIDE2), this.count = 0, this.vao = gl.createVertexArray(), gl.bindVertexArray(this.vao);
      let cb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cb), gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW), gl.enableVertexAttribArray(0), gl.vertexAttribPointer(0, 2, gl.FLOAT, !1, 0, 0), this.ibuf = gl.createBuffer(), gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf), gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
      let B2 = STRIDE2 * 4, attr = (loc, n, off) => {
        gl.enableVertexAttribArray(loc), gl.vertexAttribPointer(loc, n, gl.FLOAT, !1, B2, off * 4), gl.vertexAttribDivisor(loc, 1);
      };
      attr(1, 4, 0), attr(2, 4, 4), attr(3, 3, 8), gl.bindVertexArray(null);
    }
    begin() {
      this.count = 0;
    }
    // round light
    add(x, y, r, color, k) {
      this.addDir(x, y, r, r, 1, 0, color, k);
    }
    addDir(x, y, rx, ry, dx, dy, color, k) {
      if (this.count >= this.cap || k <= 1e-3) return;
      let d = this.data, o = this.count * STRIDE2;
      d[o] = x, d[o + 1] = y, d[o + 2] = rx, d[o + 3] = ry, d[o + 4] = dx, d[o + 5] = dy, d[o + 6] = k, d[o + 7] = 0, d[o + 8] = color[0], d[o + 9] = color[1], d[o + 10] = color[2], this.count++;
    }
    end() {
      let gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf), gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * STRIDE2));
    }
    light(ctx) {
      if (!this.count) return;
      let gl = this.gl;
      gl.useProgram(this.prog.program), gl.bindVertexArray(this.vao), gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    }
  };

  // src/render/carLayer.js
  var sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross32 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot32 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v, bodySec = (w, zb, zs, zt, inset = 0.045) => [[-w, zb], [-w, zs], [-(w - inset), zt], [w - inset, zt], [w, zs], [w, zb]], cabSec = (wb, zb, wr, zr) => [[-wb, zb], [-wr, zr], [wr, zr], [wb, zb]];
  function bboxOf(st) {
    let bb = { x0: 1 / 0, x1: -1 / 0, y0: 1 / 0, y1: -1 / 0, z0: 1 / 0, z1: -1 / 0 };
    for (let s of st) {
      bb.x0 = Math.min(bb.x0, s.x), bb.x1 = Math.max(bb.x1, s.x);
      for (let [y, z] of s.pts)
        bb.y0 = Math.min(bb.y0, y), bb.y1 = Math.max(bb.y1, y), bb.z0 = Math.min(bb.z0, z), bb.z1 = Math.max(bb.z1, z);
    }
    return bb;
  }
  function face(mb, q, tx, bb, c, force, mat = 0) {
    let pts = [];
    for (let p of q) pts.some((r) => Math.abs(r[0] - p[0]) + Math.abs(r[1] - p[1]) + Math.abs(r[2] - p[2]) < 1e-6) || pts.push(p);
    if (pts.length < 3) return;
    let n = pts.length === 4 ? cross32(sub3(pts[2], pts[0]), sub3(pts[3], pts[1])) : cross32(sub3(pts[1], pts[0]), sub3(pts[2], pts[0])), l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-9) return;
    n = [n[0] / l, n[1] / l, n[2] / l];
    let cen = [0, 0, 0];
    for (let p of pts) for (let k = 0; k < 3; k++) cen[k] += p[k] / pts.length;
    if (dot32(n, sub3(cen, c)) < 0 && (n = [-n[0], -n[1], -n[2]]), n[2] < -0.6) return;
    let ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]), key = force || (az >= ax && az >= ay ? "top" : ay >= ax ? "side" : n[0] > 0 ? "front" : "back"), tex = tx[key] || tx.side, uv;
    key === "top" ? uv = (p) => [(p[0] - bb.x0) * 32, (p[1] - bb.y0) * 32] : key === "side" ? uv = (p) => [(p[0] - bb.x0) * 32, (bb.z1 - p[2]) * 32] : key === "front" || key === "glassF" ? uv = (p) => [(bb.y1 - p[1]) * 32, (bb.z1 - p[2]) * 32] : uv = (p) => [(p[1] - bb.y0) * 32, (bb.z1 - p[2]) * 32], pts.length === 4 ? mb.quad(pts[0], pts[1], pts[2], pts[3], pts.map(uv), tex, n, mat) : mb.tri(pts[0], pts[1], pts[2], pts.map(uv), tex, n, mat);
  }
  function loft2(mb, st, tx, o = {}) {
    let bb = o.bb || bboxOf(st), c = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, (bb.z0 + bb.z1) / 2], P = (s, j) => [s.x, s.pts[j][0], s.pts[j][1]];
    for (let i = 0; i < st.length - 1; i++)
      for (let j = 0; j < st[i].pts.length - 1; j++)
        face(mb, [P(st[i], j), P(st[i + 1], j), P(st[i + 1], j + 1), P(st[i], j + 1)], tx, bb, c, o.faceKey ? o.faceKey(i, j) : null, o.mat);
    if (o.caps !== !1)
      for (let [s, key] of [[st[0], "back"], [st[st.length - 1], "front"]]) {
        let pts = s.pts.map((p) => [s.x, p[0], p[1]]);
        for (let k = 1; k < pts.length - 1; k++) face(mb, [pts[0], pts[k], pts[k + 1]], tx, bb, c, key, o.mat);
      }
    return bb;
  }
  var HEAD3 = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
`, VS3 = HEAD3 + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in uvec4 aRect;
layout(location=3) in vec4 aNrm;
layout(location=4) in uvec4 aInfo;
layout(location=5) in vec4 iA; // x, y, z, heading
layout(location=6) in vec4 iB; // palRow, alpha, snow, lift
uniform mat4 uViewProj;
uniform vec2 uBuf;
out vec2 vUV;
flat out uvec4 vRect;
flat out vec3 vNrm;
out vec3 vWorld;
flat out vec4 vB;
flat out uint vMat;
void main() {
  float c = cos(iA.w), s = sin(iA.w);
  vec3 lp = aPos;
  vec3 wp = vec3(iA.x + lp.x * c - lp.y * s, iA.y + lp.x * s + lp.y * c, iA.z + lp.z + iB.w);
  vNrm = vec3(aNrm.x * c - aNrm.y * s, aNrm.x * s + aNrm.y * c, aNrm.z);
  vUV = aUV; vRect = aRect; vWorld = wp; vB = iB; vMat = aInfo.y;
  vec4 cc = uViewProj * vec4(iA.xyz, 1.0);
  vec2 px = (cc.xy * 0.5 + 0.5) * uBuf;
  vec2 snap = (floor(px + 0.5) - px) / uBuf * 2.0;
  vec4 p = uViewProj * vec4(wp, 1.0);
  p.xy += snap;
  gl_Position = p;
}`, FS3 = HEAD3 + `
in vec2 vUV;
flat in uvec4 vRect;
flat in vec3 vNrm;
in vec3 vWorld;
flat in vec4 vB;
flat in uint vMat;
uniform sampler2D uSprites;
uniform sampler2D uPal;
uniform sampler2DShadow uShadow;
uniform sampler2D uLightMap;
uniform sampler2D uNoise;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform vec3 uSunDir, uSunCol, uAmb, uFace;
uniform vec2 uRot;
uniform vec4 uCloud;
uniform float uFlash, uEmis;
uniform vec3 uSkyTop, uSkyHor, uViewDir;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
float faceShade(vec3 n) {
  vec2 r = vec2(uRot.x * n.x - uRot.y * n.y, uRot.y * n.x + uRot.x * n.y);
  float wl = max(r.y, 0.0), wr = max(r.x, 0.0);
  float side = mix(uFace.y, uFace.z, wr / (wl + wr + 1e-4));
  return mix(side, uFace.x, clamp(n.z, 0.0, 1.0));
}
void main() {
  if (vB.y < 0.999 && bayer4(gl_FragCoord.xy) >= vB.y) discard;
  ivec2 tc = ivec2(vRect.xy) + ivec2(clamp(floor(vUV), vec2(0.0), vec2(vRect.zw) - 1.0));
  vec4 t = texelFetch(uSprites, tc, 0);
  if (t.a < 0.5) discard;
  int row = int(vB.x + 0.5);
  int slot = int(t.r * 255.0 + 0.5);
  vec4 pc = texelFetch(uPal, ivec2(slot, row), 0);
  if (pc.a < 0.1) discard;
  vec3 albedo = pc.rgb * (t.g * 255.0 / 128.0);
  vec3 n = normalize(vNrm);
  if (pc.a < 0.75) {
    oColor = vec4(albedo * 1.15, 1.0);
    oGlow = vec4(albedo, 1.0);
    return;
  }
  // snow on roofs of parked cars
  if (vB.z > 0.0 && n.z > 0.6) {
    float h = fract(sin(dot(floor(vWorld.xy * 32.0), vec2(12.9898, 78.233))) * 43758.5453);
    float nn = texture(uNoise, vWorld.xy * 0.35).r;
    if (nn * 0.85 + h * 0.15 < vB.z * 1.35) albedo = mix(vec3(0.86, 0.9, 0.97), vec3(0.98, 0.99, 1.0), smoothstep(0.3, 0.7, nn));
  }
  float ndl = dot(n, uSunDir);
  float sh = 1.0;
  if (uShadowOn > 0.5 && ndl > 0.0) {
    vec4 sp = uShadowMat * vec4(vWorld + n * 0.06 + uSunDir * 0.03, 1.0);
    vec3 s = sp.xyz * 0.5 + 0.5;
    if (s.x > 0.0 && s.y > 0.0 && s.x < 1.0 && s.y < 1.0 && s.z < 1.0) sh = step(bayer4(gl_FragCoord.xy), texture(uShadow, vec3(s.xy, s.z - 0.0008)));
  } else if (ndl <= 0.0) sh = 0.0;
  float cn = texture(uNoise, vWorld.xy * 0.006 + uCloud.xy).r * 0.65 + texture(uNoise, vWorld.xy * 0.017 + uCloud.xy * 1.7).r * 0.35;
  float cl = 1.0 - smoothstep(1.0 - uCloud.z - 0.08, 1.0 - uCloud.z + 0.08, cn) * uCloud.w;
  vec3 lm = vWorld.z < -0.5 ? vec3(0.0) : texture(uLightMap, vWorld.xy / 128.0).rgb;
  vec3 light = uAmb * faceShade(n) + uSunCol * max(ndl, 0.0) * sh * cl + lm * (0.6 + 0.4 * max(n.z, 0.0)) + vec3(uFlash);
  if (vWorld.z < -0.5) light = light * 0.5 + vec3(0.16, 0.15, 0.13);
  vec3 col = albedo * light;
  // glossy paint / glass reflection
  if (slot == 3) {
    vec3 r = reflect(-uViewDir, n);
    vec3 sky = mix(uSkyHor, uSkyTop, clamp(r.z * 1.4, 0.0, 1.0));
    col = mix(col, sky * 0.8, 0.45) + lm * 0.3;
  } else if (n.z > 0.6) {
    col += uSunCol * pow(max(dot(reflect(-uViewDir, n), uSunDir), 0.0), 24.0) * 0.35 * sh;
  }
  oColor = vec4(col, 1.0);
  oGlow = vec4(0.0, 0.0, 0.0, 1.0);
}`, SHADOW_VS3 = HEAD3 + `
layout(location=0) in vec3 aPos;
layout(location=5) in vec4 iA;
layout(location=6) in vec4 iB;
uniform mat4 uShadowVP;
void main() {
  float c = cos(iA.w), s = sin(iA.w);
  vec3 wp = vec3(iA.x + aPos.x * c - aPos.y * s, iA.y + aPos.x * s + aPos.y * c, iA.z + aPos.z + iB.w);
  gl_Position = uShadowVP * vec4(wp, 1.0);
}`, SHADOW_FS3 = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(1.0); }`, CS = { BODY: 1, TRIM: 2, GLASS: 3, TIRE: 4, HEAD: 5, TAIL: 6, CHROME: 7, SIGN: 8, ACCENT: 9, SIREN_R: 10, SIREN_B: 11, INTERIOR: 12, WHITE: 13, BLACK: 14, PLATE: 15, LED: 16 }, BODY_COLORS = [13119532, 2777016, 15921902, 1973794, 9277591, 3107386, 8003359, 14209216, 3820138, 14715440, 5913194, 12106946, 2046559], CarLayer = class {
    constructor(gl, city) {
      this.gl = gl, this.city = city, this.atlas = city.atlas, this.pal = city.pal, this.prog = createProgram(gl, VS3, FS3, "cars"), this.shadowProg = createProgram(gl, SHADOW_VS3, SHADOW_FS3, "carShadow"), this.rng = new RNG(88), this.types = {}, this.buildMeshes();
    }
    // paint a palette-indexed region of the sprite atlas
    reg(w, h, paint) {
      let f = this.atlas.add(null, w, h, paint, 0, 0);
      return { x: f.x, y: f.y, w, h, layer: 0 };
    }
    buildMeshes() {
      let A = this, reg = (w, h, paint) => A.reg(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), paint), solid = (slot, shade2 = 128) => reg(2, 2, (sp) => sp.rect(0, 0, 2, 2, slot, shade2));
      this.solid = {
        body: solid(CS.BODY),
        bodyTop: solid(CS.BODY, 140),
        trim: solid(CS.TRIM),
        glass: solid(CS.GLASS),
        tire: solid(CS.TIRE, 90),
        chrome: solid(CS.CHROME),
        sign: solid(CS.SIGN),
        accent: solid(CS.ACCENT),
        red: solid(CS.SIREN_R),
        blue: solid(CS.SIREN_B),
        white: solid(CS.WHITE),
        black: solid(CS.BLACK),
        led: solid(CS.LED),
        plastic: solid(CS.TRIM, 110),
        cargo: solid(CS.WHITE, 120)
      };
      let S2 = this.solid, all = (t) => ({ px: t, nx: t, py: t, ny: t, pz: t }), box = (mb, x0, y0, z0, x1, y1, z1, F) => mb.box(x0, y0, z0, x1, y1, z1, F.px ? F : all(F), { topMat: MAT.SNOW, mat: 0 }), wheelTex = (r, rim = CS.CHROME) => {
        let D = Math.round(2 * r * 32);
        return reg(D, D, (sp) => {
          let c = (D - 1) / 2;
          for (let y = 0; y < D; y++)
            for (let x = 0; x < D; x++) {
              let d = Math.hypot(x - c, y - c) / (D / 2), slot = CS.TIRE, sh = d > 0.86 ? 96 : 112;
              d < 0.6 && (slot = rim, sh = x + y < D - 2 ? 150 : 112), d >= 0.6 && d < 0.68 && (sh = 74), d < 0.2 && (slot = CS.TIRE, sh = 100), sp.set(x, y, slot, sh);
            }
          for (let k = 0; k < 5; k++) {
            let a = k / 5 * Math.PI * 2 - 0.4;
            sp.set(Math.round(c + Math.cos(a) * D * 0.2), Math.round(c + Math.sin(a) * D * 0.2), CS.BLACK, 90);
          }
        });
      }, paintBodySide = (sp, Lt, Ht, o) => {
        let vs = o.vs;
        for (let y = 0; y < Ht; y++)
          for (let x = 0; x < Lt; x++) {
            let sh = y < vs ? 146 : y === vs ? 160 : y >= Ht - 2 ? 100 : 130 - Math.round((y - vs) / Ht * 24);
            sp.set(x, y, o.slot ?? CS.BODY, sh);
          }
        for (let [cu, cv, R2] of o.arches || [])
          for (let y = 0; y < Ht; y++)
            for (let x = Math.floor(cu - R2 - 2); x <= Math.ceil(cu + R2 + 2); x++) {
              let d = Math.hypot(x + 0.5 - cu, y + 0.5 - cv);
              d < R2 ? sp.set(x, y, CS.BLACK, d > R2 - 1.2 ? 64 : 48) : d < R2 + 1.2 && y + 0.5 < cv && sp.set(x, y, o.slot ?? CS.BODY, 160);
            }
        for (let x = 0; x < Lt; x++) sp.set(x, Ht - 1, CS.TRIM, 80);
      }, glassPanel = (W, H, o = {}) => reg(W, H, (sp) => {
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            let frame = x < (o.fx ?? 1) || x >= W - (o.fx ?? 1) || y < (o.ft ?? 1) || o.fb && y >= H - o.fb, streak = (x - y * 2 + 64) % 15 < 3;
            sp.set(x, y, frame ? o.frame ?? CS.BODY : CS.GLASS, frame ? 132 : streak ? 158 : 126 - Math.round(y / H * 18) + (o.dark ? -14 : 0));
          }
        if (o.wipers) for (let x = 3; x < W - 3; x++) x % 10 < 6 && sp.set(x, H - 1 - (x % 10 < 3 ? 0 : 1), CS.BLACK, 90);
        if (o.brake) for (let x = (W >> 1) - 3; x < (W >> 1) + 3; x++) sp.set(x, o.ft ?? 1, CS.TAIL, 128);
      }), wheelsAt = (mb, xs, yOff, r, wdt, tex) => {
        for (let x of xs)
          for (let s of [-1, 1]) {
            let ring = [];
            for (let k = 0; k < 10; k++) {
              let a = k / 10 * Math.PI * 2;
              ring.push([x + Math.cos(a) * r, r + Math.sin(a) * r]);
            }
            let ya = s * yOff - wdt / 2, yb = s * yOff + wdt / 2;
            for (let k = 0; k < 10; k++) {
              let a = ring[k], b = ring[(k + 1) % 10], am = (k + 0.5) / 10 * Math.PI * 2, n = [Math.cos(am), 0, Math.sin(am)];
              n[2] < -0.5 || mb.quad([a[0], ya, a[1]], [b[0], ya, b[1]], [b[0], yb, b[1]], [a[0], yb, a[1]], [[0, 0], [1, 0], [1, 1], [0, 1]], S2.tire, n, 0);
            }
            let yo = s > 0 ? yb : ya, D = 2 * r, uv = (p) => [(p[0] - (x - r)) * 32, (D - p[1]) * 32];
            for (let k = 0; k < 10; k++) {
              let a = ring[k], b = ring[(k + 1) % 10];
              mb.tri([x, yo, r], [a[0], yo, a[1]], [b[0], yo, b[1]], [uv([x, r]), uv(a), uv(b)], tex, [0, s, 0], 0);
            }
          }
      }, mirrors = (mb, x, w, z) => {
        for (let s of [-1, 1]) box(mb, x - 0.04, s > 0 ? w - 0.01 : -w - 0.06, z, x + 0.04, s > 0 ? w + 0.06 : -w + 0.01, z + 0.06, S2.body);
      }, sedan = (o = {}) => {
        let mb = new MeshBuilder(), L = o.len ?? 2.25, W = o.wid ?? 0.875, w = W / 2, zb = 0.13, zt = o.zt ?? 0.48, zs = zt - 0.06, drop = o.hoodDrop ?? 0.07, xr = -L / 2, xf = L / 2, cabR = o.cabR ?? -0.62, cabF = o.cabF ?? 0.5, roofR = o.roofR ?? -0.36, roofF = o.roofF ?? 0.13, zr = zt + (o.cabH ?? 0.31), r = 0.17, wheelX = [xr + L * 0.2, xf - L * 0.19], st = [
          { x: xr, pts: bodySec(w - 0.05, zb + 0.03, zs - 0.07, zt - 0.06) },
          { x: xr + 0.09, pts: bodySec(w, zb, zs - 0.01, zt - 0.01) },
          { x: cabR, pts: bodySec(w, zb, zs, zt) },
          { x: cabF, pts: bodySec(w, zb, zs - 5e-3, zt - 5e-3) },
          { x: xf - 0.1, pts: bodySec(w, zb, zs - drop, zt - drop) },
          { x: xf, pts: bodySec(w - 0.05, zb + 0.03, zs - drop - 0.07, zt - drop - 0.06) }
        ], bb = bboxOf(st), Lt = (bb.x1 - bb.x0) * 32, Wt = (bb.y1 - bb.y0) * 32, Ht = (bb.z1 - bb.z0) * 32, U = (x) => (x - bb.x0) * 32, V = (z) => (bb.z1 - z) * 32, vs = Math.round(V(zs)), side = reg(Lt, Ht, (sp) => {
          paintBodySide(sp, Math.round(Lt), Math.round(Ht), { vs, arches: wheelX.map((x) => [U(x), V(r), r * 32 + 1.5]) });
          let doors = o.doors ?? [cabF - 0.04, (cabR + cabF) / 2 - 0.02, cabR + 0.08];
          for (let dx of doors) for (let y = vs + 1; y < Ht - 2; y++) sp.set(Math.round(U(dx)), y, CS.BODY, 96);
          for (let hx of o.handles ?? [cabF - 0.2, (cabR + cabF) / 2 - 0.18])
            sp.set(Math.round(U(hx)), vs + 2, CS.CHROME, 156), sp.set(Math.round(U(hx)) + 1, vs + 2, CS.CHROME, 120);
          if (o.stripe) for (let x = 0; x < Lt; x++)
            sp.set(x, vs + 3, CS.ACCENT, 136), sp.set(x, vs + 4, CS.ACCENT, 112);
          if (o.checker) for (let x = Math.round(U(cabR)); x < U(cabF); x++)
            sp.set(x, vs + 2, (x >> 1) % 2 ? CS.BLACK : CS.WHITE, 128), sp.set(x, vs + 3, (x >> 1) % 2 ? CS.WHITE : CS.BLACK, 120);
          if (o.text) for (let x = Math.round(U(cabR)) + 2; x < U(cabF) - 2; x += 2) sp.set(x, vs + 5, CS.ACCENT, 140);
          sp.set(1, vs + 2, CS.TAIL, 128), sp.set(Math.round(Lt) - 2, vs + 2, CS.HEAD, 128);
        }), top = reg(Lt, Wt, (sp) => {
          for (let y = 0; y < Wt; y++)
            for (let x = 0; x < Lt; x++) {
              let e = Math.min(y, Wt - 1 - y);
              sp.set(x, y, CS.BODY, e < 1 ? 118 : e < 3 ? 138 : Math.abs(y - Wt / 2) < 3 ? 156 : 148);
            }
          for (let y = 2; y < Wt - 2; y++)
            sp.set(Math.round(U(cabF + 0.03)), y, CS.BLACK, 70), sp.set(Math.round(U(xr + 0.3)), y, CS.BODY, 106), sp.set(Math.round(U(xf - 0.12)), y, CS.BODY, 112);
          for (let yy of [Math.round(Wt * 0.28), Math.round(Wt * 0.6)]) for (let k = 0; k < 7; k++) sp.set(Math.round(U(cabF + 0.05)) + (k >> 2), yy + k, CS.BLACK, 92);
          if (o.hoodStripe) for (let x = Math.round(U(cabF)); x < Lt; x++) for (let yy of [Math.round(Wt / 2) - 2, Math.round(Wt / 2) + 1]) sp.set(x, yy, CS.ACCENT, 130);
        }), vTop = Math.round(V(zt - drop - 0.06)), front = reg(Wt, Ht, (sp) => {
          for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.BODY, y <= vTop ? 150 : 124);
          let gy0 = vTop + 2, gy1 = Math.round(Ht) - 3;
          for (let y = gy0; y < gy1; y++) for (let x = 8; x < Wt - 8; x++) sp.set(x, y, CS.BLACK, (y - gy0) % 2 ? 76 : 108);
          for (let x = 8; x < Wt - 8; x++) sp.set(x, gy0 - 1, CS.CHROME, 146);
          for (let hx of [2, Math.round(Wt) - 7]) for (let x = hx; x < hx + 5; x++)
            sp.set(x, gy0, CS.HEAD, 146), sp.set(x, gy0 + 1, CS.HEAD, 118);
          for (let x = 0; x < Wt; x++) sp.set(x, Math.round(Ht) - 2, CS.CHROME, 126);
          for (let x = Math.round(Wt / 2) - 3; x < Wt / 2 + 3; x++) sp.set(x, Math.round(Ht) - 3, CS.PLATE, 132);
          for (let x = 0; x < Wt; x++) sp.set(x, Math.round(Ht) - 1, CS.TRIM, 80);
        }), vTopB = Math.round(V(zt - 0.06)), back = reg(Wt, Ht, (sp) => {
          for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.BODY, y <= vTopB ? 150 : 120);
          let ty = vTopB + 2;
          for (let tx of [1, Math.round(Wt) - 7]) for (let x = tx; x < tx + 6; x++)
            sp.set(x, ty, CS.TAIL, 146), sp.set(x, ty + 1, CS.TAIL, 116);
          sp.set(8, ty + 1, CS.WHITE, 130), sp.set(Math.round(Wt) - 9, ty + 1, CS.WHITE, 130);
          for (let x = 8; x < Wt - 8; x++) sp.set(x, ty - 1, CS.BODY, 104);
          for (let x = Math.round(Wt / 2) - 3; x < Wt / 2 + 3; x++)
            sp.set(x, ty + 3, CS.PLATE, 132), sp.set(x, ty + 4, CS.PLATE, 116);
          for (let x = 0; x < Wt; x++) sp.set(x, Math.round(Ht) - 2, CS.TRIM, 110);
          for (let x = 0; x < Wt; x++) sp.set(x, Math.round(Ht) - 1, CS.TRIM, 80);
        });
        loft2(mb, st, { side, top, front, back }, { bb });
        let wb = w - 0.06, wr = w - 0.15, zc = zt - 0.01, cst = [
          { x: cabR, pts: cabSec(wb, zc, wb, zc) },
          { x: roofR, pts: cabSec(wb, zc, wr, zr) },
          { x: roofF, pts: cabSec(wb, zc, wr, zr) },
          { x: cabF, pts: cabSec(wb, zc, wb, zc) }
        ], cb = bboxOf(cst), Lc = (cb.x1 - cb.x0) * 32, Wc = (cb.y1 - cb.y0) * 32, Hc = (cb.z1 - cb.z0) * 32, Uc = (x) => (x - cb.x0) * 32, cside = reg(Lc, Hc, (sp) => {
          let H = Math.round(Hc);
          for (let y = 0; y < H; y++) {
            let t = y / Math.max(1, H - 1), xl = Uc(roofR + (cabR - roofR) * t), xr2 = Uc(roofF + (cabF - roofF) * t);
            for (let x = 0; x < Lc; x++) {
              let inside = x > xl + 1.5 && x < xr2 - 1.5 && y >= 1 && y < H - 1, slot = CS.BODY, sh = 134;
              inside && (slot = CS.GLASS, sh = (x + y * 2) % 13 < 2 ? 156 : 118), y === H - 1 && (slot = CS.CHROME, sh = 118), sp.set(x, y, slot, sh);
            }
          }
          let bx = Math.round(Uc((cabR + cabF) / 2 - 0.04));
          for (let y = 1; y < H - 1; y++)
            sp.set(bx, y, CS.BLACK, 72), sp.set(bx + 1, y, CS.BLACK, 72);
        }), roof = reg(Lc, Wc, (sp) => {
          for (let y = 0; y < Wc; y++) for (let x = 0; x < Lc; x++) {
            let e = Math.min(y, Wc - 1 - y);
            sp.set(x, y, CS.BODY, e < 1 ? 128 : e < 3 ? 146 : 158);
          }
          if (o.sunroof) for (let y = Math.round(Wc * 0.3); y < Wc * 0.7; y++) for (let x = Math.round(Uc(roofR + 0.12)); x < Uc(roofF - 0.1); x++) sp.set(x, y, CS.GLASS, 118);
        }), glassF = glassPanel(Wc, Hc, { wipers: !0 }), glassB = glassPanel(Wc, Hc, { dark: !0, brake: !0 });
        loft2(mb, cst, { side: cside, top: roof, glassF, glassB }, { bb: cb, caps: !1, faceKey: (i, j) => j !== 1 ? "side" : i === 0 ? "glassB" : i === 2 ? "glassF" : "top" }), box(mb, xf - 0.02, -w + 0.04, zb - 0.01, xf + 0.05, w - 0.04, zb + 0.08, o.chromeBumper ? S2.chrome : S2.plastic), box(mb, xr - 0.05, -w + 0.04, zb - 0.01, xr + 0.02, w - 0.04, zb + 0.08, o.chromeBumper ? S2.chrome : S2.plastic), mirrors(mb, cabF - 0.06, w, zt - 0.02), wheelsAt(mb, wheelX, w - 0.06, r, 0.14, wheelTex(r, o.darkRims ? CS.TRIM : CS.CHROME));
        let rx = (roofR + roofF) / 2;
        if (o.taxiSign && (box(mb, rx - 0.2, -0.17, zr, rx + 0.2, 0.17, zr + 0.03, S2.black), box(mb, rx - 0.18, -0.15, zr + 0.03, rx + 0.18, 0.15, zr + 0.16, S2.sign)), o.lightBar && (box(mb, rx - 0.08, -0.33, zr, rx + 0.08, 0.33, zr + 0.03, S2.black), box(mb, rx - 0.07, -0.32, zr + 0.03, rx + 0.07, -0.02, zr + 0.12, S2.red), box(mb, rx - 0.07, 0.02, zr + 0.03, rx + 0.07, 0.32, zr + 0.12, S2.blue)), o.rack) for (let s of [-1, 1]) box(mb, roofR + 0.05, s * (wr - 0.05) - 0.02, zr, roofF - 0.05, s * (wr - 0.05) + 0.02, zr + 0.05, S2.trim);
        return mb.finish();
      }, van = (o = {}) => {
        let mb = new MeshBuilder(), L = o.len ?? 2.75, W = o.wid ?? 1, H = o.h ?? 1.25, w = W / 2, zb = 0.16, xr = -L / 2, xf = L / 2, xWin = xf - 0.82, xHood = xf - 0.4, zHood = 0.72, st = [
          { x: xr, pts: bodySec(w - 0.04, zb + 0.02, H - 0.09, H - 0.03, 0.05) },
          { x: xr + 0.06, pts: bodySec(w, zb, H - 0.07, H, 0.06) },
          { x: xWin, pts: bodySec(w, zb, H - 0.07, H, 0.06) },
          { x: xHood, pts: bodySec(w, zb, zHood - 0.04, zHood, 0.05) },
          { x: xf - 0.06, pts: bodySec(w, zb, zHood - 0.12, zHood - 0.07, 0.05) },
          { x: xf, pts: bodySec(w - 0.05, zb + 0.03, zHood - 0.2, zHood - 0.14, 0.05) }
        ], bb = bboxOf(st), Lt = (bb.x1 - bb.x0) * 32, Wt = (bb.y1 - bb.y0) * 32, Ht = (bb.z1 - bb.z0) * 32, U = (x) => (x - bb.x0) * 32, V = (z) => (bb.z1 - z) * 32, r = 0.19, wheelX = [xr + 0.55, xf - 0.5], side = reg(Lt, Ht, (sp) => {
          let HH = Math.round(Ht), LL = Math.round(Lt);
          paintBodySide(sp, LL, HH, { vs: 2, arches: wheelX.map((x) => [U(x), V(r), r * 32 + 1.5]) });
          let bpx = Math.round(U(xWin - 0.3));
          for (let y = 4; y < V(zHood) + 1; y++) {
            let z = bb.z1 - y / 32, ta = clamp01((H - z) / (H - zHood)), ax = U(xWin + (xHood - xWin) * ta) - 2;
            for (let x = bpx + 2; x < ax; x++) sp.set(x, y, CS.GLASS, (x + y * 2) % 13 < 2 ? 156 : 118);
          }
          for (let y = 3; y < HH - 3; y++)
            sp.set(bpx, y, CS.BODY, 96), sp.set(Math.round(U(xWin - 0.95)), y, CS.BODY, 96);
          if (sp.set(bpx + 3, Math.round(V(zHood)) + 3, CS.CHROME, 150), o.stripe != null) for (let x = 0; x < LL; x++)
            sp.set(x, o.stripe, CS.ACCENT, 136), sp.set(x, o.stripe + 1, CS.ACCENT, 116), sp.set(x, o.stripe + 3, CS.ACCENT, 126);
          if (o.text) for (let x = 6; x < bpx - 10; x += 2)
            sp.set(x, 10, CS.ACCENT, 136), x % 6 === 0 && sp.set(x, 11, CS.ACCENT, 120);
          if (o.window) {
            for (let y = 6; y < 17; y++) for (let x = 12; x < 34; x++) sp.set(x, y, CS.INTERIOR, y < 8 ? 150 : 124);
            for (let x = 10; x < 36; x++)
              sp.set(x, 5, CS.WHITE, 150), sp.set(x, 17, CS.CHROME, 140);
            for (let k = 0; k < 4; k++) for (let y = 19; y < 25; y++) for (let x = 38 + k * 6; x < 42 + k * 6; x++) sp.set(x, y, [CS.ACCENT, CS.SIGN, CS.HEAD, CS.ACCENT][k], 136);
          }
        }), top = reg(Lt, Wt, (sp) => {
          for (let y = 0; y < Wt; y++) for (let x = 0; x < Lt; x++) {
            let e = Math.min(y, Wt - 1 - y);
            sp.set(x, y, CS.BODY, e < 1 ? 120 : x % 8 === 0 ? 128 : 148);
          }
        }), vF = Math.round(V(zHood - 0.14)), front = reg(Wt, Ht, (sp) => {
          let HH = Math.round(Ht), WW = Math.round(Wt);
          for (let y = 0; y < HH; y++) for (let x = 0; x < WW; x++) sp.set(x, y, CS.BODY, y <= vF ? 150 : 124);
          for (let y = vF + 3; y < HH - 4; y++) for (let x = 8; x < WW - 8; x++) sp.set(x, y, CS.BLACK, (y - vF) % 2 ? 76 : 106);
          for (let hx of [2, WW - 7]) for (let x = hx; x < hx + 5; x++)
            sp.set(x, vF + 3, CS.HEAD, 146), sp.set(x, vF + 4, CS.HEAD, 120), sp.set(x, vF + 5, CS.HEAD, 104);
          for (let x = 0; x < WW; x++)
            sp.set(x, HH - 3, CS.TRIM, 118), sp.set(x, HH - 2, CS.TRIM, 104), sp.set(x, HH - 1, CS.TRIM, 80);
          for (let x = (WW >> 1) - 3; x < (WW >> 1) + 3; x++) sp.set(x, HH - 4, CS.PLATE, 132);
        }), back = reg(Wt, Ht, (sp) => {
          let HH = Math.round(Ht), WW = Math.round(Wt);
          for (let y = 0; y < HH; y++) for (let x = 0; x < WW; x++) sp.set(x, y, CS.BODY, y < 2 ? 148 : 120);
          for (let y = 4; y < 14; y++) for (let [x0, x1] of [[3, (WW >> 1) - 2], [(WW >> 1) + 2, WW - 3]]) for (let x = x0; x < x1; x++) sp.set(x, y, CS.GLASS, y < 6 ? 146 : 112);
          for (let y = 2; y < HH - 3; y++) sp.set(WW >> 1, y, CS.BLACK, 80);
          for (let tx of [0, WW - 2]) for (let y = 16; y < 24; y++)
            sp.set(tx, y, CS.TAIL, 140), sp.set(tx + 1, y, CS.TAIL, 116);
          for (let x = (WW >> 1) - 3; x < (WW >> 1) + 3; x++) sp.set(x, HH - 5, CS.PLATE, 132);
          for (let x = 0; x < WW; x++)
            sp.set(x, HH - 3, CS.TRIM, 112), sp.set(x, HH - 2, CS.TRIM, 100), sp.set(x, HH - 1, CS.TRIM, 80);
        }), glassF = glassPanel(Wt, V(zHood) + 1, { wipers: !0, fx: 2 });
        return loft2(mb, st, { side, top, front, back, glassF }, { bb, faceKey: (i, j) => i === 2 && j === 2 ? "glassF" : null }), box(mb, xf - 0.02, -w + 0.03, zb - 0.01, xf + 0.05, w - 0.03, zb + 0.1, S2.plastic), box(mb, xr - 0.05, -w + 0.03, zb - 0.01, xr + 0.02, w - 0.03, zb + 0.1, S2.plastic), mirrors(mb, xHood - 0.04, w, zHood), wheelsAt(mb, wheelX, w - 0.07, r, 0.15, wheelTex(r)), o.cone && (box(mb, -0.25, -0.16, H, 0.09, 0.16, H + 0.04, S2.white), mb.cone(-0.08, 0, H + 0.38, H + 0.04, 0.15, 8, S2.accent, { mat: 0 }), mb.cylinder(-0.08, 0, H + 0.38, H + 0.5, 0.17, 8, S2.white, S2.white, { mat: 0 }), mb.cone(-0.08, 0, H + 0.5, H + 0.66, 0.15, 8, S2.white, { mat: 0 })), o.beacon && box(mb, 0.4, -0.12, H, 0.6, 0.12, H + 0.15, S2.sign), mb.finish();
      }, bus = () => {
        let mb = new MeshBuilder(), L = 6.5, W = 1.25, H = 1.6, w = W / 2, zb = 0.18, xr = -L / 2, xf = L / 2, st = [
          { x: xr, pts: bodySec(w - 0.05, zb + 0.02, H - 0.1, H - 0.03, 0.06) },
          { x: xr + 0.08, pts: bodySec(w, zb, H - 0.08, H, 0.07) },
          { x: xf - 0.1, pts: bodySec(w, zb, H - 0.08, H, 0.07) },
          { x: xf, pts: bodySec(w - 0.06, zb + 0.02, H - 0.12, H - 0.05, 0.06) }
        ], bb = bboxOf(st), Lt = Math.round((bb.x1 - bb.x0) * 32), Wt = Math.round((bb.y1 - bb.y0) * 32), Ht = Math.round((bb.z1 - bb.z0) * 32), U = (x) => (x - bb.x0) * 32, V = (z) => (bb.z1 - z) * 32, r = 0.24, wheelX = [xr + 1.35, xf - 1.25], side = reg(Lt, Ht, (sp) => {
          paintBodySide(sp, Lt, Ht, { vs: 2, slot: CS.WHITE, arches: wheelX.map((x) => [U(x), V(r), r * 32 + 1.5]) });
          for (let y = 5; y < 22; y++)
            for (let x = 4; x < Lt - 4; x++) {
              let frame = (x - 4) % 22 < 2;
              sp.set(x, y, frame ? CS.BLACK : CS.INTERIOR, frame ? 76 : y < 8 ? 146 : (x + y) % 17 < 2 ? 150 : 120);
            }
          for (let [d0, d1] of [[Lt - 26, Lt - 12], [Math.round(Lt * 0.52), Math.round(Lt * 0.52) + 14]])
            for (let y = 5; y < Ht - 3; y++) for (let x = d0; x < d1; x++) sp.set(x, y, x === d0 || x === d1 - 1 || x === d0 + d1 >> 1 ? CS.BLACK : CS.GLASS, x === d0 || x === d1 - 1 ? 72 : y < 8 ? 150 : 118);
          for (let x = 0; x < Lt; x++)
            sp.set(x, 24, CS.ACCENT, 140), sp.set(x, 25, CS.ACCENT, 124), sp.set(x, 26, CS.ACCENT, 140), sp.set(x, 28, CS.ACCENT, 110);
          let ax0 = Math.round(U(wheelX[0]) + 14), ax1 = Math.round(Lt * 0.52) - 6;
          for (let y = 30; y < Ht - 4; y++) for (let x = ax0; x < ax1; x++) sp.set(x, y, x < ax0 + 2 || x >= ax1 - 2 || y < 31 ? CS.BLACK : (x - ax0 >> 3) % 3 === 0 ? CS.SIGN : CS.HEAD, 118);
        }), top = reg(Lt, Wt, (sp) => {
          for (let y = 0; y < Wt; y++) for (let x = 0; x < Lt; x++) {
            let e = Math.min(y, Wt - 1 - y);
            sp.set(x, y, CS.WHITE, e < 2 ? 124 : 146);
          }
          for (let x = 30; x < 50; x++) for (let y = 8; y < Wt - 8; y++) sp.set(x, y, CS.CHROME, 130);
        }), front = reg(Wt, Ht, (sp) => {
          for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.WHITE, 128);
          for (let x = 4; x < Wt - 4; x++)
            sp.set(x, 2, CS.BLACK, 90), sp.set(x, 3, CS.LED, 140), sp.set(x, 4, CS.LED, 120), sp.set(x, 5, CS.BLACK, 90);
          for (let y = 7; y < 27; y++) for (let x = 2; x < Wt - 2; x++) sp.set(x, y, CS.GLASS, (x - y * 2 + 60) % 17 < 3 ? 158 : y < 9 ? 146 : 122);
          for (let y = 7; y < 27; y++) sp.set(Wt >> 1, y, CS.BLACK, 80);
          for (let x = 0; x < Wt; x++) sp.set(x, 29, CS.ACCENT, 136);
          for (let hx of [2, Wt - 7]) for (let x = hx; x < hx + 5; x++)
            sp.set(x, Ht - 9, CS.HEAD, 146), sp.set(x, Ht - 8, CS.HEAD, 118);
          for (let x = 0; x < Wt; x++)
            sp.set(x, Ht - 3, CS.TRIM, 110), sp.set(x, Ht - 2, CS.TRIM, 96), sp.set(x, Ht - 1, CS.TRIM, 80);
        }), back = reg(Wt, Ht, (sp) => {
          for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.WHITE, 118);
          for (let y = 5; y < 15; y++) for (let x = 3; x < Wt - 3; x++) sp.set(x, y, CS.GLASS, 112);
          for (let y = 20; y < 32; y++) for (let x = 8; x < Wt - 8; x++) sp.set(x, y, CS.BLACK, y % 2 ? 80 : 104);
          for (let tx of [1, Wt - 4]) for (let y = 18; y < 30; y++) for (let x = tx; x < tx + 3; x++) sp.set(x, y, CS.TAIL, y % 4 === 0 ? 110 : 136);
          for (let x = 0; x < Wt; x++)
            sp.set(x, Ht - 2, CS.TRIM, 100), sp.set(x, Ht - 1, CS.TRIM, 80);
        });
        return loft2(mb, st, { side, top, front, back }, { bb }), box(mb, -1.6, -0.42, H, 0.1, 0.42, H + 0.2, S2.chrome), box(mb, 1.4, -0.3, H, 2.2, 0.3, H + 0.08, S2.cargo), mirrors(mb, xf - 0.05, w, H - 0.6), wheelsAt(mb, wheelX, w - 0.08, r, 0.16, wheelTex(r)), mb.finish();
      }, truck = (o = {}) => {
        let mb = new MeshBuilder(), L = o.len ?? 4, W = o.wid ?? 1.125, w = W / 2, cabL = 1.15, cabH = 1.32, boxH = o.boxH ?? 1.8, zb = 0.2, xf = L / 2, xc = xf - cabL, xr = -L / 2, st = [
          { x: xc, pts: bodySec(w, zb, cabH - 0.06, cabH, 0.06) },
          { x: xf - 0.5, pts: bodySec(w, zb, cabH - 0.06, cabH, 0.06) },
          { x: xf - 0.2, pts: bodySec(w, zb, 0.8, 0.85, 0.05) },
          { x: xf, pts: bodySec(w - 0.05, zb + 0.02, 0.72, 0.77, 0.05) }
        ], bb = bboxOf(st), Lt = Math.round((bb.x1 - bb.x0) * 32), Wt = Math.round((bb.y1 - bb.y0) * 32), Ht = Math.round((bb.z1 - bb.z0) * 32), U = (x) => (x - bb.x0) * 32, V = (z) => (bb.z1 - z) * 32, r = 0.22, cabSlot = o.cabSlot ?? CS.BODY, side = reg(Lt, Ht, (sp) => {
          paintBodySide(sp, Lt, Ht, { vs: 2, slot: cabSlot, arches: [[U(xf - 0.45), V(r), r * 32 + 1.5]] });
          for (let y = 4; y < V(0.86); y++) {
            let z = bb.z1 - y / 32, ta = clamp01((cabH - z) / (cabH - 0.85)), ax = U(xf - 0.5 + 0.3 * ta) - 2;
            for (let x = 5; x < ax; x++) sp.set(x, y, CS.GLASS, (x + y * 2) % 13 < 2 ? 156 : 118);
          }
          for (let y = 3; y < Ht - 3; y++) sp.set(3, y, cabSlot, 96);
          sp.set(7, Math.round(V(0.86)) + 3, CS.CHROME, 150);
          for (let y = Math.round(V(0.6)); y < Math.round(V(0.6)) + 4; y++) for (let x = 2; x < 6; x++) sp.set(x, y, CS.CHROME, 130);
        }), top = reg(Lt, Wt, (sp) => {
          for (let y = 0; y < Wt; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, cabSlot, Math.min(y, Wt - 1 - y) < 2 ? 122 : 146);
        }), vF = Math.round(V(0.77)), front = reg(Wt, Ht, (sp) => {
          for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, cabSlot, y <= vF ? 148 : 122);
          for (let y = vF + 2; y < Ht - 5; y++) for (let x = 7; x < Wt - 7; x++) sp.set(x, y, CS.CHROME, (y - vF) % 2 ? 96 : 140);
          for (let hx of [1, Wt - 6]) for (let x = hx; x < hx + 5; x++) for (let y = vF + 2; y < vF + 5; y++) sp.set(x, y, CS.HEAD, 150 - (y - vF) * 10);
          for (let x = 0; x < Wt; x++)
            sp.set(x, Ht - 4, CS.CHROME, 140), sp.set(x, Ht - 3, CS.CHROME, 118), sp.set(x, Ht - 2, CS.TRIM, 96), sp.set(x, Ht - 1, CS.TRIM, 80);
        }), glassF = glassPanel(Wt, V(0.85) + 1, { wipers: !0, fx: 2 });
        loft2(mb, st, { side, top, front, back: S2.black, glassF }, { bb, faceKey: (i, j) => i === 1 && j === 2 ? "glassF" : null });
        let bst = [
          { x: xr, pts: bodySec(w + 0.02, 0.36, boxH - 0.04, boxH, 0.04) },
          { x: xc - 0.08, pts: bodySec(w + 0.02, 0.36, boxH - 0.04, boxH, 0.04) }
        ], cbb = bboxOf(bst), BL = Math.round((cbb.x1 - cbb.x0) * 32), BW = Math.round((cbb.y1 - cbb.y0) * 32), BH = Math.round((cbb.z1 - cbb.z0) * 32), cargo = o.cargo ?? CS.WHITE, bside = reg(BL, BH, (sp) => {
          for (let y = 0; y < BH; y++) for (let x = 0; x < BL; x++) sp.set(x, y, cargo, y < 2 ? 148 : x % 16 === 0 ? 112 : 126);
          for (let x = 0; x < BL; x++)
            sp.set(x, BH - 1, CS.TRIM, 90), sp.set(x, BH - 2, cargo, 104);
          if (o.stripe != null) for (let x = 0; x < BL; x++)
            sp.set(x, o.stripe, CS.ACCENT, 140), sp.set(x, o.stripe + 1, CS.ACCENT, 120), sp.set(x, o.stripe + 3, CS.ACCENT, 130);
          if (o.ladder) for (let x = 0; x < BL; x++)
            sp.set(x, 4, CS.CHROME, 146), x % 4 === 0 && (sp.set(x, 5, CS.CHROME, 120), sp.set(x, 6, CS.CHROME, 120)), sp.set(x, 7, CS.CHROME, 146);
          if (o.lockers) for (let k = 0; k < 5; k++) {
            let x0 = 4 + k * Math.floor((BL - 8) / 5);
            for (let y = 12; y < BH - 4; y++) for (let x = x0; x < x0 + Math.floor((BL - 8) / 5) - 2; x++) sp.set(x, y, CS.CHROME, (x + y) % 3 === 0 ? 150 : y === 12 ? 160 : 124);
          }
          if (o.hopper) for (let y = 6; y < BH - 3; y++) for (let x = 0; x < 12; x++) sp.set(x, y, CS.BLACK, x === 11 ? 70 : 100 + (x + y) % 4 * 4);
          if (o.logo) for (let y = 10; y < 18; y++) for (let x = Math.round(BL * 0.45); x < BL * 0.45 + 16; x++) sp.set(x, y, CS.ACCENT, (x + y) % 5 === 0 ? 150 : 128);
        }), btop = reg(BL, BW, (sp) => {
          for (let y = 0; y < BW; y++) for (let x = 0; x < BL; x++) sp.set(x, y, cargo, Math.min(y, BW - 1 - y) < 2 ? 118 : x % 12 === 0 ? 124 : 140);
        }), bback = reg(BW, BH, (sp) => {
          for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) sp.set(x, y, cargo, 116);
          for (let y = 2; y < BH - 4; y++)
            if (sp.set(BW >> 1, y, CS.TRIM, 86), y % 8 === 0) for (let x = 2; x < BW - 2; x++) sp.set(x, y, CS.CHROME, 120);
          for (let tx of [1, BW - 4]) for (let y = BH - 10; y < BH - 4; y++) for (let x = tx; x < tx + 3; x++) sp.set(x, y, CS.TAIL, 136);
          for (let x = 0; x < BW; x++)
            sp.set(x, BH - 2, CS.TRIM, 100), sp.set(x, BH - 1, CS.TRIM, 80);
        }), bfront = reg(BW, BH, (sp) => {
          for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) sp.set(x, y, cargo, y < 2 ? 146 : x < 2 || x >= BW - 2 ? 108 : 122);
          for (let mx of [3, BW - 5])
            sp.set(mx, 3, CS.TAIL, 140), sp.set(mx + 1, 3, CS.TAIL, 140);
        });
        if (loft2(mb, bst, { side: bside, top: btop, back: bback, front: bfront }, { bb: cbb }), box(mb, xr + 0.1, -w + 0.12, 0.12, xc, w - 0.12, 0.36, S2.black), wheelsAt(mb, [xf - 0.45], w - 0.08, r, 0.16, wheelTex(r)), wheelsAt(mb, o.len >= 4.5 ? [xr + 0.7, xr + 1.25] : [xr + 0.75], w - 0.08, r, 0.18, wheelTex(r)), box(mb, xf - 0.02, -w + 0.02, zb - 0.02, xf + 0.06, w - 0.02, zb + 0.1, S2.chrome), mirrors(mb, xf - 0.42, w, 0.95), o.lightBar && (box(mb, xf - 0.62, -0.42, cabH, xf - 0.48, -0.02, cabH + 0.12, S2.red), box(mb, xf - 0.62, 0.02, cabH, xf - 0.48, 0.42, cabH + 0.12, S2.blue)), o.beacon && box(mb, xf - 0.65, -0.12, cabH, xf - 0.45, 0.12, cabH + 0.16, S2.sign), o.plow) {
          let b0 = [xf + 0.35, -0.8], b1 = [xf + 0.12, 0.8];
          mb.quad([b0[0], b0[1], 0.6], [b1[0], b1[1], 0.6], [b1[0], b1[1], 0.02], [b0[0], b0[1], 0.02], [[0, 0], [2, 0], [2, 2], [0, 2]], S2.sign, null, MAT.SNOW), mb.quad([b1[0] - 0.04, b1[1], 0.6], [b0[0] - 0.04, b0[1], 0.6], [b0[0] - 0.04, b0[1], 0.02], [b1[0] - 0.04, b1[1], 0.02], [[0, 0], [2, 0], [2, 2], [0, 2]], S2.black, null, 0), box(mb, xf, -0.1, 0.2, xf + 0.25, 0.1, 0.35, S2.black);
        }
        if (o.ladderTop) {
          box(mb, xr + 0.25, -0.28, boxH, xc - 0.2, -0.2, boxH + 0.14, S2.chrome), box(mb, xr + 0.25, 0.2, boxH, xc - 0.2, 0.28, boxH + 0.14, S2.chrome);
          for (let x = xr + 0.35; x < xc - 0.25; x += 0.22) box(mb, x, -0.2, boxH + 0.06, x + 0.04, 0.2, boxH + 0.1, S2.chrome);
        }
        return mb.finish();
      }, defs = {
        subway: (() => {
          let mb = new MeshBuilder(), L = 3.25, W = 1.125, H = 1.5, w = W / 2, zb = 0.12, sec = [[-w, zb], [-w, H - 0.18], [-(w - 0.06), H - 0.06], [-(w - 0.2), H], [w - 0.2, H], [w - 0.06, H - 0.06], [w, H - 0.18], [w, zb]], st = [{ x: -L / 2, pts: sec }, { x: L / 2, pts: sec }], bb = bboxOf(st), Lt = Math.round((bb.x1 - bb.x0) * 32), Wt = Math.round((bb.y1 - bb.y0) * 32), Ht = Math.round((bb.z1 - bb.z0) * 32), side = reg(Lt, Ht, (sp) => {
            for (let y = 0; y < Ht; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.BODY, (x % 4 === 0 ? 116 : 134) - (y > Ht - 8 ? 22 : 0) + (y < 4 ? 12 : 0));
            let doors = [[16, 30], [Lt - 30, Lt - 16]];
            for (let y = 8; y < 21; y++)
              for (let x = 4; x < Lt - 4; x++)
                doors.some(([a, b]) => x >= a - 1 && x <= b) || sp.set(x, y, x % 14 < 2 ? CS.BLACK : CS.INTERIOR, x % 14 < 2 ? 80 : y < 10 ? 150 : 122);
            for (let [a, b] of doors) {
              for (let y = 6; y < Ht - 8; y++) for (let x = a; x < b; x++) sp.set(x, y, CS.BODY, x === a || x === b - 1 ? 92 : x === a + b >> 1 ? 96 : 140);
              for (let y = 9; y < 19; y++) for (let x0 of [a + 2, (a + b >> 1) + 2]) for (let x = x0; x < x0 + 4; x++) sp.set(x, y, CS.INTERIOR, 128);
            }
            for (let x = 0; x < Lt; x++)
              sp.set(x, 25, CS.ACCENT, 140), sp.set(x, 26, CS.ACCENT, 118);
            for (let y = Ht - 6; y < Ht; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.TIRE, x % 6 === 0 ? 70 : 96);
          }), top = reg(Lt, Wt, (sp) => {
            for (let y = 0; y < Wt; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.BODY, Math.min(y, Wt - 1 - y) < 3 ? 118 : x % 20 < 2 ? 120 : 140);
          }), end = reg(Wt, Ht, (sp) => {
            for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.BODY, 122);
            for (let y = 8; y < 20; y++) for (let x = 3; x < Wt - 3; x++) sp.set(x, y, x > 13 && x < 22 ? CS.BODY : CS.GLASS, x > 13 && x < 22 ? 110 : y < 10 ? 150 : 120);
            for (let y = 9; y < 26; y++) for (let x = 15; x < 21; x++) sp.set(x, y, CS.INTERIOR, 120);
            for (let x = 6; x < Wt - 6; x++)
              sp.set(x, 4, CS.LED, 146), sp.set(x, 5, CS.LED, 120);
            for (let hx of [3, Wt - 6]) for (let x = hx; x < hx + 3; x++)
              sp.set(x, 30, CS.HEAD, 146), sp.set(x, 31, CS.HEAD, 120);
            for (let y = Ht - 6; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.TIRE, 90);
          });
          loft2(mb, st, { side, top, front: end, back: end }, { bb });
          for (let x of [-L / 2 + 0.55, L / 2 - 0.55]) box(mb, x - 0.35, -w + 0.1, 0, x + 0.35, w - 0.1, zb + 0.02, S2.black);
          return mb.finish();
        })(),
        sedan: sedan(),
        taxi: sedan({ taxiSign: !0, checker: !0, chromeBumper: !1 }),
        suv: sedan({ len: 2.375, wid: 1, zt: 0.6, cabH: 0.36, cabR: -0.98, roofR: -0.88, cabF: 0.42, roofF: 0.08, hoodDrop: 0.05, rack: !0, darkRims: !0 }),
        police: sedan({ len: 2.375, lightBar: !0, stripe: !0, text: !0, darkRims: !0 }),
        van: van({ text: !0 }),
        icecream: van({ len: 3.25, h: 1.375, stripe: 26, window: !0, cone: !0 }),
        bus: bus(),
        truck: truck({ stripe: 12, logo: !0 }),
        fire: truck({ len: 5, cargo: CS.BODY, cabSlot: CS.BODY, ladder: !0, lightBar: !0, ladderTop: !0, lockers: !0 }),
        garbage: truck({ len: 4.25, hopper: !0, stripe: 20 }),
        plow: truck({ len: 4.25, hopper: !0, stripe: 20, beacon: !0, plow: !0 })
      }, gl = this.gl;
      for (let k in defs) {
        let m = defs[k], vao = gl.createVertexArray();
        gl.bindVertexArray(vao), makeBuffer(gl, m.pos), gl.enableVertexAttribArray(0), gl.vertexAttribPointer(0, 3, gl.FLOAT, !1, 0, 0), makeBuffer(gl, m.uv), gl.enableVertexAttribArray(1), gl.vertexAttribPointer(1, 2, gl.FLOAT, !1, 0, 0), makeBuffer(gl, m.rect), gl.enableVertexAttribArray(2), gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_SHORT, 0, 0), makeBuffer(gl, m.nrm), gl.enableVertexAttribArray(3), gl.vertexAttribPointer(3, 4, gl.BYTE, !0, 0, 0), makeBuffer(gl, m.info), gl.enableVertexAttribArray(4), gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, 0, 0), makeBuffer(gl, m.idx, gl.ELEMENT_ARRAY_BUFFER);
        let ibuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, ibuf), gl.bufferData(gl.ARRAY_BUFFER, 256 * 8 * 4, gl.DYNAMIC_DRAW), gl.enableVertexAttribArray(5), gl.vertexAttribPointer(5, 4, gl.FLOAT, !1, 32, 0), gl.vertexAttribDivisor(5, 1), gl.enableVertexAttribArray(6), gl.vertexAttribPointer(6, 4, gl.FLOAT, !1, 32, 16), gl.vertexAttribDivisor(6, 1), gl.bindVertexArray(null), this.types[k] = { vao, count: m.indexCount, ibuf, data: new Float32Array(256 * 8), n: 0 };
      }
    }
    assignPalette(car) {
      let r = this.rng, body = car.color != null && car.color !== 0 ? car.color : r.pick(BODY_COLORS), P = {
        [CS.TRIM]: 2763310,
        [CS.GLASS]: 4020856,
        [CS.TIRE]: 1973792,
        [CS.HEAD]: 15262928,
        [CS.TAIL]: 9050650,
        [CS.CHROME]: 12106946,
        [CS.SIGN]: 15919296,
        [CS.ACCENT]: 2777016,
        [CS.SIREN_R]: 11018272,
        [CS.SIREN_B]: 2113704,
        [CS.INTERIOR]: 5925498,
        [CS.WHITE]: 15790316,
        [CS.BLACK]: 1973794,
        [CS.PLATE]: 15909424,
        [CS.LED]: 6965786
      };
      switch (car.type) {
        case "taxi":
          body = 15908888, P[CS.SIGN] = 16314576;
          break;
        case "police":
          body = 15921902, P[CS.ACCENT] = 2052e3;
          break;
        case "bus":
          body = 15921902, P[CS.ACCENT] = 2056112;
          break;
        case "fire":
          body = 13115420, P[CS.WHITE] = 13115420;
          break;
        case "icecream":
          body = 16316144, P[CS.ACCENT] = 15760048, P[CS.INTERIOR] = 16769696, P[CS.WHITE] = 16773336;
          break;
        case "garbage":
        case "plow":
          body = 15921902, P[CS.ACCENT] = 3115590, P[CS.SIGN] = 15763994;
          break;
        case "truck":
          P[CS.ACCENT] = r.pick([13119532, 2777016, 3115590, 14715440]);
          break;
        case "subway":
          body = 12896462, P[CS.ACCENT] = 2779864, P[CS.INTERIOR] = 16314576, P[CS.LED] = 16751152;
          break;
      }
      P[CS.BODY] = body, car.palRow = this.pal.alloc(P), car.palBase = P, car.palState = "";
    }
    releasePalette(car) {
      car.palRow >= 0 && this.pal.release(car.palRow), car.palRow = -1;
    }
    updatePalette(car, time) {
      let lights = car.lights, siren = car.siren && Math.floor(time * 6) % 2, beacon2 = (car.special === "plow" || car.special === "garbage") && Math.floor(time * 4) % 2, busLit = car.type === "bus" || car.type === "icecream" || car.type === "subway", key = `${lights ? 1 : 0}${car.brake ? 1 : 0}${car.siren ? siren ? 2 : 1 : 0}${beacon2 ? 1 : 0}${car.type === "taxi" && car.taxiFree ? 1 : 0}`;
      if (key === car.palState) return;
      car.palState = key;
      let P = car.palBase, row = car.palRow, pal = this.pal;
      pal.set(row, CS.HEAD, lights ? 16774872 : P[CS.HEAD], lights ? 128 : 255), pal.set(row, CS.TAIL, car.brake ? 16724016 : lights ? 13639712 : P[CS.TAIL], car.brake || lights ? 128 : 255), car.siren && (pal.set(row, CS.SIREN_R, siren ? 16724016 : 7344144, siren ? 128 : 255), pal.set(row, CS.SIREN_B, siren ? 1056864 : car.type === "fire" ? 16724016 : 3174655, siren ? 255 : 128)), (car.special === "plow" || car.special === "garbage") && pal.set(row, CS.SIGN, beacon2 ? 16752672 : 9064464, beacon2 ? 128 : 255), car.type === "taxi" && pal.set(row, CS.SIGN, lights ? 16773808 : P[CS.SIGN], lights ? 128 : 255), busLit && pal.set(row, CS.INTERIOR, lights ? 16773312 : P[CS.INTERIOR], lights ? 128 : 255), (car.type === "bus" || car.type === "subway") && pal.set(row, CS.LED, 16752672, 128), car.type === "subway" && pal.set(row, CS.INTERIOR, 16773836, 128);
    }
    prepare(cars, time, env, view) {
      for (let k in this.types) this.types[k].n = 0;
      let snow = env.snowCover;
      for (let c of cars) {
        if (!view.visible(c.x, c.y, (c.z || 0) + 1, 6)) continue;
        let t = this.types[c.type];
        if (!t || t.n >= 256) continue;
        this.updatePalette(c, time);
        let o = t.n * 8, d = t.data;
        d[o] = c.x, d[o + 1] = c.y, d[o + 2] = c.z || 0, d[o + 3] = c.h, d[o + 4] = c.palRow, d[o + 5] = c.fadeOut != null ? Math.max(0, c.fadeOut) : 1 - (c.fadeIn || 0), d[o + 6] = c.state === "parked" ? snow : snow * 0.25, d[o + 7] = 0.02, t.n++;
      }
      let gl = this.gl;
      for (let k in this.types) {
        let t = this.types[k];
        t.n && (gl.bindBuffer(gl.ARRAY_BUFFER, t.ibuf), gl.bufferSubData(gl.ARRAY_BUFFER, 0, t.data.subarray(0, t.n * 8)));
      }
    }
    lights(LL, cars, env) {
      if (env.darkness < 0.4) return;
      let k = Math.min(1, (env.darkness - 0.4) * 3);
      for (let c of cars) {
        if (c.state === "parked") continue;
        let dx = Math.cos(c.h), dy = Math.sin(c.h);
        if (LL.addDir(c.x + dx * (c.len * 0.5 + 1.8), c.y + dy * (c.len * 0.5 + 1.8), 2.4, 0.95, dx, dy, [1, 0.95, 0.8], 0.55 * k), LL.add(c.x - dx * (c.len * 0.5 + 0.3), c.y - dy * (c.len * 0.5 + 0.3), c.brake ? 1 : 0.7, [1, 0.15, 0.1], (c.brake ? 0.6 : 0.25) * k), c.siren) {
          let ph = Math.floor(performance.now() / 160) % 2;
          LL.add(c.x, c.y, 3.5, ph ? [1, 0.1, 0.1] : c.type === "fire" ? [1, 0.2, 0.1] : [0.1, 0.3, 1], 0.7);
        }
      }
    }
    shadow(ctx) {
      let gl = this.gl, p = this.shadowProg;
      gl.useProgram(p.program), gl.uniformMatrix4fv(p.u.uShadowVP, !1, ctx.shadowMat);
      for (let k in this.types) {
        let t = this.types[k];
        t.n && (gl.bindVertexArray(t.vao), gl.drawElementsInstanced(gl.TRIANGLES, t.count, gl.UNSIGNED_INT, 0, t.n));
      }
    }
    draw(ctx) {
      let gl = this.gl, p = this.prog, u = p.u, r = ctx.renderer, e = ctx.env;
      gl.useProgram(p.program), gl.uniformMatrix4fv(u.uViewProj, !1, ctx.viewProj), gl.uniform2f(u.uBuf, ctx.bw, ctx.bh), gl.uniformMatrix4fv(u.uShadowMat, !1, ctx.shadowMat), gl.uniform1f(u.uShadowOn, ctx.shadowOn ? 1 : 0), gl.uniform3fv(u.uSunDir, e.sunDir), gl.uniform3fv(u.uSunCol, e.sunCol), gl.uniform3fv(u.uAmb, e.amb), gl.uniform3fv(u.uFace, e.face), gl.uniform2f(u.uRot, Math.cos(ctx.camera.angle), Math.sin(ctx.camera.angle)), gl.uniform4fv(u.uCloud, e.cloud), gl.uniform1f(u.uFlash, e.flash), gl.uniform1f(u.uEmis, e.emis), gl.uniform3fv(u.uSkyTop, e.skyTop), gl.uniform3fv(u.uSkyHor, e.skyBottom), gl.uniform3fv(u.uViewDir, ctx.camera.viewDir()), gl.activeTexture(gl.TEXTURE0), gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex), gl.uniform1i(u.uSprites, 0), gl.activeTexture(gl.TEXTURE1), gl.bindTexture(gl.TEXTURE_2D, this.pal.tex), gl.uniform1i(u.uPal, 1), gl.activeTexture(gl.TEXTURE2), gl.bindTexture(gl.TEXTURE_2D, r.shadowTex), gl.uniform1i(u.uShadow, 2), gl.activeTexture(gl.TEXTURE3), gl.bindTexture(gl.TEXTURE_2D, r.lightTex), gl.uniform1i(u.uLightMap, 3), gl.activeTexture(gl.TEXTURE4), gl.bindTexture(gl.TEXTURE_2D, r.noiseTex), gl.uniform1i(u.uNoise, 4);
      for (let k in this.types) {
        let t = this.types[k];
        t.n && (gl.bindVertexArray(t.vao), gl.drawElementsInstanced(gl.TRIANGLES, t.count, gl.UNSIGNED_INT, 0, t.n));
      }
    }
  };

  // src/sim/statics.js
  var Statics = class {
    constructor(city) {
      this.city = city;
      let { atlas, pal, world } = city;
      this.treeFrames = {};
      for (let sp in TREE_SPECIES)
        sp !== "xmas" && (this.treeFrames[sp] = [0, 1, 2].map((v) => atlas.add(`tree_${sp}_${v}`, TREE_SPECIES[sp].w, TREE_SPECIES[sp].h, (s) => paintTree(s, TREE_SPECIES[sp], 1e3 + v * 77 + sp.length * 13))));
      this.treeRows = {};
      for (let sp in TREE_SPECIES)
        sp !== "xmas" && (this.treeRows[sp] = [pal.alloc(), pal.alloc()]);
      this.propRow = pal.alloc(PROP_COLORS), this.laundryRow = pal.alloc({ ...PROP_COLORS, [S.C5]: 15223391, [S.C6]: 15909424, [S.C7]: 5939416, [S.C1]: 15921904 }), this.statueRow = pal.alloc({ ...PROP_COLORS, [S.C9]: 5216902, [S.C10]: 16767072 }), this.flagRow = pal.alloc({ [S.C1]: 14168108, [S.C2]: 15921904, [S.C3]: 10132899, [S.C7]: 2307694, [S.C6]: 9054826 }), this.glowRows = {
        street: pal.alloc({ [S.C1]: [16773320, 128] }),
        park: pal.alloc({ [S.C1]: [16767120, 128] }),
        flood: pal.alloc({ [S.C1]: [15791871, 128] }),
        red: pal.alloc({ [S.C1]: [16724e3, 128] }),
        yellow: pal.alloc({ [S.C1]: [16760864, 128] }),
        green: pal.alloc({ [S.C1]: [3211152, 128] }),
        walk: pal.alloc({ [S.C1]: [15791359, 128] }),
        hand: pal.alloc({ [S.C1]: [16742944, 128] }),
        beacon: pal.alloc({ [S.C1]: [16719904, 128] })
      }, this.xmasRow = pal.alloc(), treePalette(pal, "pine", 3, !0, 4863526, this.xmasRow), this.season = -1, this.snowy = null;
      let rng = new RNG(5);
      this.lampDelay = world.lamps.map(() => rng.range(0, 0.6)), this.lampFlicker = world.lamps.map(() => rng.chance(0.04) ? rng.range(0.5, 2) : 0), this.frames = {};
      for (let n of ["dish", "antenna", "deckchair", "bush", "grill", "laundry", "statue", "xmas", "snowman", "glow", "lamp2", "lamp1", "beacon", "treeBundle", "cartUmbrella", "pedWalk", "pedHand"]) this.frames[n] = atlas.get(n);
      this.umbRows = {
        hotdog: pal.alloc({ [S.C1]: 15909424, [S.C2]: 2052e3, [S.C3]: 10132899 }),
        halal: pal.alloc({ [S.C1]: 15921902, [S.C2]: 13119532, [S.C3]: 10132899 }),
        pretzel: pal.alloc({ [S.C1]: 15909424, [S.C2]: 3115590, [S.C3]: 10132899 })
      }, this.flagFrames = { us: [0, 1, 2, 3].map((f) => atlas.get("flag_us" + f)), hotel: [0, 1, 2, 3].map((f) => atlas.get("flag_hotel" + f)) }, this.treeSellers = [];
      let ws = world.stoopSeats.length ? world.stoopSeats[Math.floor(world.stoopSeats.length * 0.6)] : null;
      ws && this.treeSellers.push({ x: ws.x + ws.n[0] * 2.4, y: ws.y + ws.n[1] * 2.4, n: ws.n });
    }
    updatePalettes(env) {
      let s = env.season, snowy = env.snowCover > 0.3;
      if (!(s === this.season && snowy === this.snowy)) {
        this.season = s, this.snowy = snowy;
        for (let sp in this.treeRows) {
          let [a, b] = this.treeRows[sp], bark = TREE_SPECIES[sp].bark;
          treePalette(this.city.pal, sp, s, snowy, bark, a), treePalette(this.city.pal, sp, s, snowy, bark, b), s === 2 && (this.city.pal.set(b, S.LEAF_M, sp === "oak" ? 13127710 : 14721072), this.city.pal.set(b, S.LEAF_L, sp === "oak" ? 15235130 : 16304202)), s === 1 && this.city.pal.set(b, S.LEAF_M, 4889146);
        }
      }
    }
    emit(L, env, cam, time, view) {
      let world = this.city.world;
      this.updatePalettes(env);
      let vis = (x, y, z, m = 6) => view.visible(x, y, z, m);
      for (let i = 0; i < world.trees.length; i++) {
        let t = world.trees[i];
        if (!vis(t.x, t.y, t.z + 2, 6)) continue;
        let fr = this.treeFrames[t.species][t.variant], rows = this.treeRows[t.species];
        L.push(t.x, t.y, t.z, fr, rows[i % 2], 0);
      }
      for (let p of world.props) {
        if (!vis(p.x, p.y, p.z, 3) || p.group === "warm" && !(env.season === 1 || env.season === 0) || p.kind === "deckchair" && env.season === 3) continue;
        let fr = this.frames[p.kind];
        if (!fr) continue;
        let row = p.kind === "laundry" ? this.laundryRow : p.kind === "statue" ? this.statueRow : p.kind === "cartUmbrella" ? this.umbRows[p.cart] || this.propRow : this.propRow;
        L.push(p.x, p.y, p.z, fr, row, (p.kind === "statue", 0));
      }
      for (let f of world.flags) {
        let tip = f.tip || f;
        if (!vis(tip.x, tip.y, f.z, 2)) continue;
        let k = Math.floor(time * (3 + env.wind * 4) + f.x) % 4, fr = this.flagFrames[f.type === "hotel" ? "hotel" : "us"][k], flip = cam.screenDirX(f.n[0], f.n[1]) < 0;
        L.push(tip.x, tip.y, f.z - 0.55, fr, this.flagRow, flip ? SF.FLIP : 0, 1, 2e-3);
      }
      if (env.season === 3 && world.parkCenter) {
        let c = world.parkCenter;
        L.push(c.x, c.y, 0.125 + 1, this.frames.xmas, this.xmasRow, 0);
        for (let s of this.treeSellers)
          for (let k = 0; k < 5; k++) {
            let ox = s.n[1] * (k - 2) * 0.35, oy = -s.n[0] * (k - 2) * 0.35;
            L.push(s.x + ox, s.y + oy, 0.125, this.frames.treeBundle, this.treeRows.pine[0], 0);
          }
      }
      if (env.lampsOn)
        for (let h of world.lampHeads)
          vis(h.x, h.y, h.z, 2) && L.push(h.x, h.y, h.z - 0.02, this.frames.glow, this.glowRows[h.kind] ?? this.glowRows.street, SF.EMISSIVE | SF.NOSHADOW, 1, 0.01);
      if (time % 1.6 < 0.5) for (let b of world.beacons) L.push(b.x, b.y, b.z, this.frames.beacon, this.glowRows.beacon, SF.EMISSIVE | SF.NOSHADOW, 1, 0.01);
      let tr = this.city.traffic;
      if (tr) {
        let vd = cam.viewDir();
        for (let s of world.signals) {
          if (s.face[0] * vd[0] + s.face[1] * vd[1] <= 0.05 || !vis(s.x, s.y, s.z, 1)) continue;
          let st = tr.signalState(s.i, s.j);
          if (s.type === "car" && st.flash) {
            let c = s.axis === "x" ? st.ew : st.ns;
            if (time % 1.2 > 0.6) continue;
            let top = s.z + 0.75;
            L.push(s.x, s.y, c === "fr" ? top - 0.19 : top - 0.44, this.frames.lamp2, this.glowRows[c === "fr" ? "red" : "yellow"], SF.EMISSIVE | SF.NOSHADOW, 1, 0.02);
            continue;
          }
          if (s.type === "car") {
            let c = s.axis === "x" ? st.ew : st.ns, top = s.z + (s.axis === "x", 0.75), z = c === "r" ? top - 0.19 : c === "y" ? top - 0.44 : top - 0.69;
            L.push(s.x, s.y, z, this.frames.lamp2, this.glowRows[c === "r" ? "red" : c === "y" ? "yellow" : "green"], SF.EMISSIVE | SF.NOSHADOW, 1, 0.02);
          } else {
            let w = s.axis === "x" ? st.walkEW : st.walkNS;
            if (w === "flash" && time % 1 > 0.5) continue;
            L.push(s.x, s.y, s.z + 0.02, w === "walk" ? this.frames.pedWalk : this.frames.pedHand, this.glowRows[w === "walk" ? "walk" : "hand"], SF.EMISSIVE | SF.NOSHADOW, 1, 0.02);
          }
        }
      }
    }
    // light-map contributions of static lamps
    lights(LL, env, time) {
      let world = this.city.world, dark = env.darkness, shopsOpen = env.hour >= 7 && env.hour < 22.5;
      for (let i = 0; i < world.lamps.length; i++) {
        let l = world.lamps[i], k = l.k;
        if (l.kind === "street" || l.kind === "park" || l.kind === "flood" || l.kind === "globe" || l.kind === "shelter" || l.kind === "shed") {
          if (!env.lampsOn) continue;
          let on = Math.min(1, Math.max(0, (dark - 0.35 - this.lampDelay[i] * 0.3) * 6));
          if (on <= 0) continue;
          k *= on, this.lampFlicker[i] && Math.sin(time * 13 * this.lampFlicker[i]) + Math.sin(time * 31 + i) > 1.2 && (k *= 0.15), l.kind === "flood" && (k *= env.hour > 23 || env.hour < 6 ? 0 : 1);
        } else if (l.kind === "shop") {
          if (!shopsOpen) continue;
          k *= Math.max(0, dark - 0.2) * 1.3;
        } else
          k *= Math.max(0, dark - 0.25) * 1.4, l.kind === "neon" && (k *= 0.8 + 0.2 * Math.sin(time * 9 + i));
        k > 0.01 && LL.add(l.x, l.y, l.r, l.color, k * 0.85);
      }
    }
  };

  // src/sim/traffic.js
  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]], right = (d) => (d + 1) % 4, left = (d) => (d + 3) % 4, STOP = 4.8, EXIT = 4.5, CYCLE = { green: 15, yellow: 3, red: 1.5 }, CYCLE_LEN = 2 * (CYCLE.green + CYCLE.yellow + CYCLE.red);
  function bezier(p0, p1, p2, p3, n) {
    let pts = [];
    for (let i = 0; i <= n; i++) {
      let t = i / n, u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
      ]);
    }
    return pts;
  }
  var Piece = class {
    constructor(pts, kind) {
      this.pts = pts, this.kind = kind, this.cum = [0];
      for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      this.len = this.cum[this.cum.length - 1], this.cars = [];
    }
    at(s) {
      s = clamp(s, 0, this.len);
      let i = 1;
      for (; i < this.cum.length - 1 && this.cum[i] < s; ) i++;
      let a = this.pts[i - 1], b = this.pts[i], seg = this.cum[i] - this.cum[i - 1] || 1, t = (s - this.cum[i - 1]) / seg;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
    }
  }, CAR_TYPES = {
    sedan: { len: 2.25, wid: 0.875, speed: 4.6 },
    taxi: { len: 2.25, wid: 0.875, speed: 4.9 },
    suv: { len: 2.375, wid: 1, speed: 4.5 },
    van: { len: 2.75, wid: 1, speed: 4.2 },
    police: { len: 2.375, wid: 0.875, speed: 5 },
    bus: { len: 6.5, wid: 1.25, speed: 3.6 },
    truck: { len: 4, wid: 1.125, speed: 3.8 },
    fire: { len: 5, wid: 1.125, speed: 4.8 },
    icecream: { len: 3.25, wid: 1, speed: 2.6 },
    garbage: { len: 4.25, wid: 1.125, speed: 3 },
    plow: { len: 4.25, wid: 1.125, speed: 3.2 }
  }, Traffic = class {
    constructor(city) {
      this.city = city, this.rng = new RNG(321), this.cars = [], this.clock = 0, this.links = /* @__PURE__ */ new Map(), this.inLinks = /* @__PURE__ */ new Map(), this.connectors = /* @__PURE__ */ new Map(), this.offsets = [];
      for (let i = 0; i <= 4; i++) {
        this.offsets.push([]);
        for (let j = 0; j <= 4; j++) this.offsets[i].push((i * 7 + j * 3) % 5 * 4.3 + (i + j) * 2.1);
      }
      this.exitLock = /* @__PURE__ */ new Map(), this.buildNetwork(), this.buildParking(), this.nextId = 1, this.special = { fireTimer: 90, iceTimer: 20, garbageTimer: 5, plowTimer: 10 }, this.honks = [];
    }
    center(i, j) {
      return [roadCenter(i), roadCenter(j)];
    }
    buildNetwork() {
      for (let i = 0; i <= 4; i++)
        for (let j = 0; j <= 4; j++)
          for (let d = 0; d < 4; d++) {
            let [dx, dy] = DIRS[d], ni = i + dx, nj = j + dy;
            if (ni < 0 || nj < 0 || ni > 4 || nj > 4) continue;
            let [cx, cy] = this.center(i, j), [ex, ey] = this.center(ni, nj), rx = -dy * 0.7, ry = dx * 0.7, p0 = [cx + dx * EXIT + rx, cy + dy * EXIT + ry], p1 = [ex - dx * STOP + rx, ey - dy * STOP + ry], L = new Piece([p0, p1], "link");
            Object.assign(L, { i, j, d, ti: ni, tj: nj, id: `${i},${j},${d}`, park: [] }), this.links.set(L.id, L), this.inLinks.set(`${ni},${nj},${d}`, L);
          }
      for (let L of this.links.values()) {
        let { ti, tj, d } = L;
        for (let nd of [d, right(d), left(d)]) {
          let out = this.links.get(`${ti},${tj},${nd}`);
          if (!out) continue;
          let p0 = L.pts[1], p3 = out.pts[0], pts;
          if (nd === d) pts = [p0, p3];
          else {
            let k = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) * 0.52, [ax, ay] = DIRS[d], [bx, by] = DIRS[nd];
            pts = bezier(p0, [p0[0] + ax * k, p0[1] + ay * k], [p3[0] - bx * k, p3[1] - by * k], p3, 14);
          }
          let C = new Piece(pts, "conn");
          Object.assign(C, { from: L, to: out, turn: nd === d ? "s" : nd === right(d) ? "r" : "l", i: ti, j: tj, d, nd }), this.connectors.set(`${L.id}>${out.id}`, C);
        }
      }
    }
    buildParking() {
      let W = this.city.world, blockers = [];
      for (let h of W.hydrants) blockers.push([h.x, h.y, 1.3]);
      for (let b of W.busStops) blockers.push([b.x, b.y, 3.2]);
      for (let s of W.stacksBlock || []) blockers.push([s.x, s.y, 2.2]);
      for (let c of W.carts) blockers.push([c.x, c.y, 1.5]);
      W.firehouse && blockers.push([W.firehouse.x, W.firehouse.y, 3]);
      for (let L of this.links.values()) {
        let [dx, dy] = DIRS[L.d], px = -dy * (1.85 - 0.7), py = dx * (1.85 - 0.7);
        for (let s = 1.6; s < L.len - 1.4; s += 2.75) {
          let x = L.pts[0][0] + dx * s + px, y = L.pts[0][1] + dy * s + py;
          blockers.some(([bx, by, r]) => dist2(x, y, bx, by) < r * r) || x < 0.5 || y < 0.5 || x > 117 - 0.5 || y > 117 - 0.5 || L.park.push({ s, x, y, car: null, link: L });
        }
      }
    }
    // ---- signals -------------------------------------------------------------
    get flashing() {
      let h = this.city.env.hour;
      return h >= 1 && h < 5;
    }
    movingCarNear(x, y, r) {
      for (let c of this.cars) if (c.state !== "parked" && c.v > 0.4 && dist2(c.x, c.y, x, y) < r * r) return !0;
      return !1;
    }
    signalState(i, j) {
      if (this.flashing)
        return { ew: "fr", ns: "fy", walkEW: "walk", walkNS: "walk", ewT: 0, nsT: 0, flash: !0 };
      let t = (this.clock + this.offsets[i][j]) % CYCLE_LEN, g = CYCLE.green, y = CYCLE.yellow, r = CYCLE.red, half = g + y + r, ew = "r", ns = "r", walkEW = "dont", walkNS = "dont", ewT = 0, nsT = 0;
      return t < g ? (ew = "g", ewT = g - t) : t < g + y ? ew = "y" : t >= half && t < half + g ? (ns = "g", nsT = half + g - t) : t >= half + g && t < half + g + y && (ns = "y"), ew === "g" && (walkEW = t < g - 5 ? "walk" : "flash"), ew === "y" && (walkEW = "flash"), ns === "g" && (walkNS = t - half < g - 5 ? "walk" : "flash"), ns === "y" && (walkNS = "flash"), { ew, ns, walkEW, walkNS, ewT, nsT };
    }
    // ---- cars ----------------------------------------------------------------
    pickType(env) {
      let r = this.rng, opts = [["sedan", 30], ["taxi", 34], ["suv", 16], ["van", 8], ["truck", 5], ["police", 2]];
      return r.weighted(opts);
    }
    makeCar(type, link, s, opts = {}) {
      let T2 = CAR_TYPES[type], car = {
        id: this.nextId++,
        type,
        len: T2.len,
        wid: T2.wid,
        v0: T2.speed * this.rng.range(0.9, 1.08),
        v: 0,
        piece: link,
        s,
        lat: 0,
        latTarget: 0,
        next: null,
        state: "drive",
        x: 0,
        y: 0,
        h: 0,
        color: opts.color ?? null,
        brake: !1,
        life: this.rng.range(60, 200),
        wait: 0,
        honked: 0,
        route: opts.route ?? null,
        routeIdx: 0,
        stopAt: opts.stopAt ?? null,
        palRow: -1,
        siren: !!opts.siren,
        special: opts.special ?? null
      };
      return this.chooseNext(car), car;
    }
    chooseNext(car) {
      let L = car.piece;
      if (L.kind !== "link") return;
      let nd;
      if (car.route)
        nd = car.route[car.routeIdx % car.route.length](L);
      else {
        let opts = [];
        for (let [d, w] of [[L.d, 6], [right(L.d), 2.2], [left(L.d), 1.6]]) this.links.get(`${L.ti},${L.tj},${d}`) && opts.push([d, w]);
        nd = this.rng.weighted(opts);
      }
      if (car.next = this.connectors.get(`${L.id}>${L.ti},${L.tj},${nd}`) || null, !car.next)
        for (let d of [L.d, right(L.d), left(L.d)]) {
          let c = this.connectors.get(`${L.id}>${L.ti},${L.tj},${d}`);
          if (c) {
            car.next = c;
            break;
          }
        }
    }
    addCar(car) {
      this.cars.push(car), car.piece.cars.push(car), this.city.carLayer && this.city.carLayer.assignPalette(car), this.place(car);
    }
    removeCar(car) {
      let i = this.cars.indexOf(car);
      if (i >= 0 && this.cars.splice(i, 1), car.piece) {
        let k = car.piece.cars.indexOf(car);
        k >= 0 && car.piece.cars.splice(k, 1);
      }
      for (let [k, v] of this.exitLock) v === car && this.exitLock.delete(k);
      this.city.carLayer && this.city.carLayer.releasePalette(car);
    }
    init() {
      let env = this.city.env;
      for (let L of this.links.values())
        for (let p of L.park)
          if (this.rng.chance(0.5)) {
            let car = this.makeCar(this.rng.weighted([["sedan", 40], ["suv", 25], ["van", 10], ["taxi", 6], ["police", 2]]), L, p.s);
            car.state = "parked", car.v = 0, car.spot = p, p.car = car, car.lat = 1.85 - 0.7, L.cars.splice(L.cars.indexOf(car), 1), this.cars.push(car), this.city.carLayer && this.city.carLayer.assignPalette(car), this.place(car);
          }
      let target = this.targetCount(env);
      for (let k = 0; k < target; k++) this.spawnMoving(!0);
      for (let k = 0; k < 2; k++) this.spawnBus(k);
    }
    targetCount(env) {
      let h = env.hour, base = h < 5 ? 14 : h < 7 ? 30 : h < 10 ? 60 : h < 16 ? 46 : h < 19.5 ? 62 : h < 23 ? 40 : 22;
      return env.snowing && (base *= 0.7), Math.round(base);
    }
    spawnMoving(anywhere = !1) {
      let links = [...this.links.values()];
      for (let tries = 0; tries < 20; tries++) {
        let L = this.rng.pick(links);
        if (anywhere) {
          let s = this.rng.range(1, L.len - 3);
          if (L.cars.some((c) => Math.abs(c.s - s) < 4)) continue;
          let car2 = this.makeCar(this.pickType(), L, s);
          return car2.v = car2.v0 * 0.6, this.addCar(car2), car2;
        }
        let spots = L.park.filter((p2) => p2.car && p2.car.state === "parked");
        if (!spots.length) continue;
        let p = this.rng.pick(spots);
        if (L.cars.some((c) => c.s < p.s + 2 && c.s > p.s - 9)) continue;
        let car = p.car;
        return p.car = null, car.spot = null, car.state = "pullout", car.latTarget = 0, car.s = p.s, L.cars.push(car), car.piece = L, this.chooseNext(car), car.life = this.rng.range(50, 160), car;
      }
      return null;
    }
    spawnBus(k) {
      let route = [
        (L2) => L2.d === 0 ? L2.ti === 3 && L2.tj === 2 ? 1 : 0 : L2.d === 1 ? L2.ti === 3 && L2.tj === 4 ? 2 : 1 : L2.d === 2 ? L2.ti === 0 && L2.tj === 4 ? 3 : 2 : L2.ti === 0 && L2.tj === 2 ? 0 : 3
      ], L = k === 0 ? this.links.get("0,2,0") : this.links.get("3,3,1");
      if (!L) return;
      let car = this.makeCar("bus", L, 2, { route, color: 0 });
      car.v = 2, car.life = 1e9, car.busStops = this.city.world.busStops, this.addCar(car);
    }
    spawnSpecial(type, opts = {}) {
      let links = [...this.links.values()].filter((L2) => !L2.cars.some((c) => c.s < 7));
      if (!links.length) return null;
      let L = opts.link || this.rng.pick(links), car = this.makeCar(type, L, 0.5, opts);
      return car.v = car.v0 * 0.5, car.life = opts.life ?? 120, car.fadeIn = 1, this.addCar(car), car;
    }
    place(car) {
      let [x, y, h] = car.piece.at(car.s), lx = 0, ly = 0;
      if (car.lat) {
        let nx = -Math.sin(h), ny = Math.cos(h);
        lx = nx * car.lat, ly = ny * car.lat;
      }
      car.x = x + lx, car.y = y + ly, car.h = h, (car.state === "pullout" || car.state === "pullin") && (car.h += (car.lat - car.latTarget) * 0.25 * (car.state === "pullout" ? -1 : 1));
    }
    leaderGap(car) {
      let P = car.piece, best = 1e9, bestV = 0;
      for (let o of P.cars) {
        if (o === car || o.state === "parked") continue;
        let ds = o.s - car.s;
        ds > 0 && ds - o.len * 0.5 - car.len * 0.5 < best && (best = ds - o.len * 0.5 - car.len * 0.5, bestV = o.v);
      }
      if (best < 1e8) return [best, bestV];
      let rest = P.len - car.s, nxt = P.kind === "link" ? car.next : P.to;
      if (nxt) {
        for (let o of nxt.cars) {
          if (o === car || o.state === "parked") continue;
          let ds = rest + o.s;
          ds - o.len * 0.5 - car.len * 0.5 < best && (best = ds - o.len * 0.5 - car.len * 0.5, bestV = o.v);
        }
        if (best < 1e8) return [best, bestV];
        if (nxt.kind === "conn")
          for (let o of nxt.to.cars) {
            let ds = rest + nxt.len + o.s;
            ds - o.len * 0.5 - car.len * 0.5 < best && (best = ds - o.len * 0.5 - car.len * 0.5, bestV = o.v);
          }
      }
      return [best, bestV];
    }
    canEnter(car, C) {
      let st = this.signalState(C.i, C.j), light = C.d === 0 || C.d === 2 ? st.ew : st.ns;
      if (car.special === "fire" && car.siren) {
        if (light !== "g" && car.wait < 1.5) return !1;
      } else if (light === "fr") {
        if (car.wait < 1 || this.boxBusy(C, car)) return !1;
        let a = this.inLinks.get(`${C.i},${C.j},1`), b = this.inLinks.get(`${C.i},${C.j},3`);
        for (let L of [a, b]) if (L) {
          for (let o of L.cars) if (o.state !== "parked" && L.len - o.s < 9 && o.v > 1) return !1;
        }
      } else if (light === "fy") {
        if (this.boxBusy(C, car)) return !1;
      } else if (light === "r" || light === "y" && (car.piece.len - car.s > 0.6 || car.v < 2.5))
        return !1;
      let lk = this.exitLock.get(C.to.id);
      if (lk && lk !== car) return !1;
      for (let o of C.to.cars) if (o.s < car.len + 1.5 && o.state !== "parked") return !1;
      if (C.turn === "l") {
        let opp = this.inLinks.get(`${C.i},${C.j},${(C.d + 2) % 4}`);
        if (opp) {
          for (let o of opp.cars) if (o.state !== "parked" && opp.len - o.s < 9 && (o.v > 0.5 || opp.len - o.s < 3)) return !1;
        }
        for (let c2 of this.connectors.values()) if (c2.i === C.i && c2.j === C.j && c2.d === (C.d + 2) % 4 && c2.cars.length) return !1;
      }
      return !(C.turn !== "s" && this.city.people && this.city.people.crosswalkBusy(C.i, C.j, C.nd));
    }
    update(dt) {
      this.clock += dt;
      let env = this.city.env, dark = env.darkness > 0.45, moving = this.cars.filter((c) => c.state !== "parked" && !c.special && c.type !== "bus").length, target = this.targetCount(env);
      moving < target && this.rng.chance(dt * 1.2) && (this.spawnMoving(!1) || this.rng.chance(0.2) && this.spawnMoving(!0)), this.updateSpecials(dt, env);
      for (let car of [...this.cars])
        car.state !== "parked" && this.stepCar(car, dt, moving > target + 3);
      for (let car of this.cars)
        car.lights = car.state !== "parked" && dark;
    }
    updateSpecials(dt, env) {
      let sp = this.special, W = this.city.world, h = env.hour;
      if (sp.fireTimer -= dt, sp.fireTimer <= 0 && (sp.fireTimer = this.rng.range(150, 320), W.firehouse && !this.cars.some((c) => c.special === "fire"))) {
        let car = this.spawnSpecial("fire", { special: "fire", siren: !0, life: 70 });
        car && this.city.audio?.event("siren", car);
      }
      if (sp.iceTimer -= dt, env.season === 1 && h > 12 && h < 20 && sp.iceTimer <= 0 && !this.cars.some((c) => c.special === "icecream")) {
        sp.iceTimer = this.rng.range(80, 160);
        let L = this.links.get("1,2,0") || this.rng.pick([...this.links.values()]);
        this.spawnSpecial("icecream", { special: "icecream", link: L, life: 150, stopAt: { link: "1,2,0", s: 9 } });
      }
      sp.garbageTimer -= dt, h > 5 && h < 8.5 && sp.garbageTimer <= 0 && !this.cars.some((c) => c.special === "garbage") && (sp.garbageTimer = this.rng.range(60, 120), this.spawnSpecial("garbage", { special: "garbage", life: 120 })), sp.plowTimer -= dt, env.season === 3 && (env.snowing || env.snowCover > 0.5) && sp.plowTimer <= 0 && !this.cars.some((c) => c.special === "plow") && (sp.plowTimer = this.rng.range(70, 140), this.spawnSpecial("plow", { special: "plow", life: 100 }));
    }
    stepCar(car, dt, overPop) {
      let P = car.piece;
      if (car.life -= dt, car.fadeIn && (car.fadeIn = Math.max(0, car.fadeIn - dt * 1.5)), P.kind === "link" && car.state === "drive" && !car.special && car.type !== "bus" && (car.life < 0 || overPop)) {
        let spot = P.park.find((p) => !p.car && p.s > car.s + 4 && p.s < car.s + 12);
        spot && (car.state = "pullin", car.spot = spot, spot.car = car, car.latTarget = 1.85 - 0.7);
      }
      if (car.fadeOut != null && (car.fadeOut -= dt, car.fadeOut <= 0)) {
        this.removeCar(car);
        return;
      }
      car.special && car.life < 0 && car.fadeOut == null && (car.fadeOut = 1);
      let vMax = car.v0;
      if (car.state === "pullout" && (vMax = 1.8), car.state === "pullin") {
        let rem = car.spot.s - car.s;
        vMax = Math.max(0.4, Math.min(2.2, rem * 0.8));
      }
      (car.special === "icecream" || car.special === "garbage") && (vMax *= 0.8);
      let [gap, lv] = this.leaderGap(car);
      if (P.kind === "link" && car.next) {
        let rest = P.len - car.s;
        rest < 12 && !this.canEnter(car, car.next) && rest < gap && (gap = rest, lv = 0);
      }
      if (car.type === "bus" && P.kind === "link") {
        for (let b2 of car.busStops || []) {
          let along = P.d === 0 || P.d === 2 ? b2.x : b2.y, cross = P.d === 0 || P.d === 2 ? b2.y : b2.x, lanePos = P.d === 0 || P.d === 2 ? P.pts[0][1] : P.pts[0][0];
          if (Math.abs(cross - lanePos) > 3) continue;
          let rem = (P.d === 0 ? along - P.pts[0][0] : P.d === 2 ? P.pts[0][0] - along : P.d === 1 ? along - P.pts[0][1] : P.pts[0][1] - along) - car.s;
          car.dwell == null && rem > -0.5 && rem < gap && (gap = rem, lv = 0, rem < 0.4 && car.v < 0.3 && (car.dwell = 6, this.city.audio?.event("bus", car)));
        }
        car.dwell != null && (car.dwell -= dt, gap = 0, lv = 0, car.dwell <= 0 && (car.dwell = null, car.leftStop = 3)), car.leftStop && (car.leftStop -= dt, car.leftStop <= 0 && (car.leftStop = 0));
      }
      if (car.stopAt && P.kind === "link" && P.id === car.stopAt.link && car.stopDone == null) {
        let rem = car.stopAt.s - car.s;
        rem > -0.3 && rem < gap && (gap = rem, lv = 0, rem < 0.4 && car.v < 0.2 && (car.stopDone = 0, car.dwell = 35, this.city.onIceCreamStop?.(car)));
      }
      car.stopDone === 0 && car.dwell != null && (car.dwell -= dt, gap = 0, lv = 0, car.dwell <= 0 && (car.dwell = null, car.stopDone = 1, this.city.onIceCreamLeave?.(car))), car.leftStop && car.type === "bus" && (gap = Math.max(gap, 0));
      let a = 2.6, b = 4, s0 = 0.9, T2 = 0.9, v = car.v, sStar = s0 + v * T2 + v * (v - lv) / (2 * Math.sqrt(a * b)), acc = a * (1 - Math.pow(v / vMax, 4) - Math.pow(Math.max(0, sStar) / Math.max(0.05, gap), 2));
      if (acc = clamp(acc, -9, a), car.v = Math.max(0, v + acc * dt), gap < 0.05 && (car.v = 0), car.brake = acc < -0.6 || car.v < 0.1 && gap < 3, car.v < 0.1 ? (car.wait += dt, P.kind === "link" && car.next && car.wait > 1.2 && gap > 1.5 && gap < 4 && lv < 0.1 && this.rng.chance(dt * 0.12) && car.honked <= 0 && (this.honks.push(car), car.honked = 8)) : car.wait = 0, car.honked -= dt, car.s += car.v * dt, car.state === "pullout" || car.state === "pullin") {
        let k = Math.min(1, dt * (car.state === "pullout" ? 0.9 : 1.1) * Math.max(0.6, car.v));
        if (car.lat += (car.latTarget - car.lat) * k, car.state === "pullout" && Math.abs(car.lat) < 0.05 && (car.lat = 0, car.state = "drive"), car.state === "pullin" && car.s >= car.spot.s - 0.05) {
          car.s = car.spot.s, car.lat = car.latTarget, car.state = "parked", car.v = 0, car.brake = !1;
          let k2 = P.cars.indexOf(car);
          k2 >= 0 && P.cars.splice(k2, 1), this.place(car);
          return;
        }
      }
      for (; car.s >= car.piece.len; ) {
        let cur = car.piece, over = car.s - cur.len, nxt = null;
        if (cur.kind === "link") {
          if (!car.next || !this.canEnterNow(car, car.next)) {
            car.s = cur.len, car.v = 0;
            break;
          }
          nxt = car.next, this.exitLock.set(nxt.to.id, car);
        } else
          nxt = cur.to, this.exitLock.get(nxt.id) === car && this.exitLock.delete(nxt.id), car.route && car.routeIdx++;
        cur.cars.splice(cur.cars.indexOf(car), 1), nxt.cars.push(car), car.piece = nxt, car.s = over, nxt.kind === "link" && this.chooseNext(car);
      }
      this.place(car);
    }
    boxBusy(C, car) {
      for (let c2 of this.connectors.values()) if (c2.i === C.i && c2.j === C.j && c2.cars.some((o) => o !== car)) return !0;
      return !1;
    }
    canEnterNow(car, C) {
      let st = this.signalState(C.i, C.j), light = C.d === 0 || C.d === 2 ? st.ew : st.ns;
      if (light === "r" && !(car.special === "fire" && car.wait > 1.5) || light === "fr" && (car.wait < 1 || this.boxBusy(C, car))) return !1;
      let lk = this.exitLock.get(C.to.id);
      return !(lk && lk !== car);
    }
    carAt(x, y, r = 1.2) {
      for (let c of this.cars) if (dist2(c.x, c.y, x, y) < r * r) return c;
      return null;
    }
  };

  // src/sim/nav.js
  var Q = 3.5, NavGraph = class {
    constructor() {
      this.nodes = [], this.segments = [];
    }
    add(x, y, z = 0.125, kind = "walk", data = null) {
      let n = { id: this.nodes.length, x, y, z, kind, data, edges: [] };
      return this.nodes.push(n), n;
    }
    link(a, b, cross = null) {
      if (a === b || a.edges.some((e) => e.to === b)) return;
      let len = dist(a.x, a.y, b.x, b.y) + Math.abs(a.z - b.z);
      a.edges.push({ to: b, len, cross }), b.edges.push({ to: a, len, cross });
    }
    // nearest point on any sidewalk segment
    nearestSeg(x, y, maxD = 3) {
      let best = null, bd = maxD;
      for (let s of this.segments) {
        let dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy, t = ((x - s.a.x) * dx + (y - s.a.y) * dy) / L2;
        t = Math.max(0.02, Math.min(0.98, t));
        let px = s.a.x + dx * t, py = s.a.y + dy * t, d = dist(x, y, px, py);
        d < bd && (bd = d, best = { seg: s, t, x: px, y: py });
      }
      return best;
    }
    // attach a POI: creates a node on the sidewalk (merged with close ones) and returns it
    attach(x, y, maxD = 3.2) {
      let hit = this.nearestSeg(x, y, maxD);
      if (!hit) return null;
      let s = hit.seg;
      for (let p of s.stops) if (Math.abs(p.t - hit.t) * s.len < 0.35) return p.node;
      let node = this.add(hit.x, hit.y, 0.125, "walk");
      return s.stops.push({ t: hit.t, node }), node;
    }
    finalize() {
      for (let s of this.segments) {
        let pts = [{ t: 0, node: s.a }, ...s.stops.sort((u, v) => u.t - v.t), { t: 1, node: s.b }];
        for (let i = 1; i < pts.length; i++) this.link(pts[i - 1].node, pts[i].node);
      }
    }
    // A* path from node a to node b, returns array of {node, cross}
    path(a, b) {
      if (a === b) return [{ node: a, cross: null }];
      let open = /* @__PURE__ */ new Map(), came = /* @__PURE__ */ new Map(), g = /* @__PURE__ */ new Map(), h = (n2) => dist(n2.x, n2.y, b.x, b.y);
      g.set(a, 0), open.set(a, h(a));
      let iter = 0;
      for (; open.size && iter++ < 4e3; ) {
        let cur = null, cf = 1 / 0;
        for (let [n2, f] of open) f < cf && (cf = f, cur = n2);
        if (cur === b) break;
        open.delete(cur);
        for (let e of cur.edges) {
          let ng = g.get(cur) + e.len + (e.cross ? 2.5 : 0);
          ng < (g.get(e.to) ?? 1 / 0) && (g.set(e.to, ng), came.set(e.to, { from: cur, cross: e.cross }), open.set(e.to, ng + h(e.to)));
        }
      }
      if (!came.has(b)) return null;
      let out = [], n = b;
      for (; n !== a; ) {
        let c = came.get(n);
        out.push({ node: n, cross: c.cross }), n = c.from;
      }
      return out.push({ node: a, cross: null }), out.reverse();
    }
  };
  function buildNav(world) {
    let G3 = new NavGraph(), corner = {}, key = (i, j, qx, qy) => `${i},${j},${qx},${qy}`;
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++)
        for (let qx of [-1, 1])
          for (let qy of [-1, 1]) {
            let n = G3.add(roadCenter(i) + qx * Q, roadCenter(j) + qy * Q, 0.125, "corner");
            n.i = i, n.j = j, corner[key(i, j, qx, qy)] = n;
          }
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++) {
        for (let qy of [-1, 1]) G3.link(corner[key(i, j, -1, qy)], corner[key(i, j, 1, qy)], { i, j, axis: "x", side: qy < 0 ? 3 : 1 });
        for (let qx of [-1, 1]) G3.link(corner[key(i, j, qx, -1)], corner[key(i, j, qx, 1)], { i, j, axis: "y", side: qx < 0 ? 2 : 0 });
      }
    for (let j = 0; j <= 4; j++)
      for (let i = 0; i < 4; i++)
        for (let qy of [-1, 1]) {
          let a = corner[key(i, j, 1, qy)], b = corner[key(i + 1, j, -1, qy)];
          G3.segments.push({ a, b, len: dist(a.x, a.y, b.x, b.y), stops: [] });
        }
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j < 4; j++)
        for (let qx of [-1, 1]) {
          let a = corner[key(i, j, qx, 1)], b = corner[key(i, j + 1, qx, -1)];
          G3.segments.push({ a, b, len: dist(a.x, a.y, b.x, b.y), stops: [] });
        }
    let poi = { homes: [], shops: [], offices: [], subways: [], benches: [], stoops: [], carts: [], busStops: [], hydrants: [], park: {}, court: {} };
    for (let d of world.doors) {
      let sw = G3.attach(d.x, d.y);
      if (!sw) continue;
      let door;
      if (d.stoop) {
        let bottom = G3.add(d.sx, d.sy, 0.125, "stoop");
        door = G3.add(d.dx, d.dy, d.dz, "door", d), G3.link(sw, bottom), G3.link(bottom, door);
      } else
        door = G3.add(d.dx ?? d.x, d.dy ?? d.y, d.dz ?? 0.125, "door", d), G3.link(sw, door);
      door.sw = sw, (d.kind === "home" || d.kind === "hotel") && poi.homes.push(door);
    }
    for (let d of world.officeDoors) {
      let sw = G3.attach(d.x, d.y, 4);
      if (!sw) continue;
      let door = G3.add(d.dx, d.dy, 0.125, "door", d);
      G3.link(sw, door), door.sw = sw, poi.offices.push(door);
    }
    for (let s of world.shops) {
      let sw = G3.attach(s.x, s.y);
      if (!sw) continue;
      let door = G3.add(s.dx ?? s.x - s.n[0] * 0.9, s.dy ?? s.y - s.n[1] * 0.9, 0.125, "shop", s);
      G3.link(sw, door), door.sw = sw, poi.shops.push(door);
    }
    for (let s of world.subways) {
      let sw = G3.attach(s.x, s.y);
      if (!sw) continue;
      let bottom = G3.add(s.bx, s.by, 0.125 - 1.2, "subway", s);
      G3.link(sw, bottom), bottom.sw = sw, poi.subways.push(bottom);
    }
    for (let c of world.carts) {
      let sw = G3.attach(c.x, c.y);
      sw && poi.carts.push({ node: sw, cart: c });
    }
    for (let b of world.busStops) {
      let sw = G3.attach(b.x, b.y);
      sw && poi.busStops.push({ node: sw, stop: b });
    }
    for (let h of world.hydrants) {
      let sw = G3.attach(h.x, h.y);
      sw && poi.hydrants.push({ node: sw, h });
    }
    for (let s of world.stoopSeats) {
      let best = null, bd = 3;
      for (let d of poi.homes) {
        let dd = dist(d.x, d.y, s.x, s.y);
        dd < bd && (bd = dd, best = d);
      }
      best && poi.stoops.push({ seat: s, door: best });
    }
    if (world.park) {
      let P = world.park, cx = P.cx, cy = P.cy, o = 1.3, c00 = G3.add(P.x0 + o, P.y0 + o), c10 = G3.add(P.x1 - o, P.y0 + o), c11 = G3.add(P.x1 - o, P.y1 - o), c01 = G3.add(P.x0 + o, P.y1 - o), mN = G3.add(cx, P.y0 + o), mS = G3.add(cx, P.y1 - o), mW = G3.add(P.x0 + o, cy), mE = G3.add(P.x1 - o, cy);
      G3.link(c00, mN), G3.link(mN, c10), G3.link(c10, mE), G3.link(mE, c11), G3.link(c11, mS), G3.link(mS, c01), G3.link(c01, mW), G3.link(mW, c00);
      let r = 3, rN = G3.add(cx, cy - r), rS = G3.add(cx, cy + r), rW = G3.add(cx - r, cy), rE = G3.add(cx + r, cy), d = r * 0.72, dNW = G3.add(cx - d, cy - d), dNE = G3.add(cx + d, cy - d), dSE = G3.add(cx + d, cy + d), dSW = G3.add(cx - d, cy + d), ring = [rN, dNE, rE, dSE, rS, dSW, rW, dNW];
      for (let k = 0; k < 8; k++) G3.link(ring[k], ring[(k + 1) % 8]);
      G3.link(mN, rN), G3.link(mS, rS), G3.link(mW, rW), G3.link(mE, rE), G3.link(c00, dNW), G3.link(c10, dNE), G3.link(c11, dSE), G3.link(c01, dSW);
      let entr = [[mN, cx, P.y0 - 1], [mS, cx, P.y1 + 1], [mW, P.x0 - 1, cy], [mE, P.x1 + 1, cy]];
      for (let [n, x, y] of entr) {
        let sw = G3.attach(x, y);
        sw && G3.link(n, sw);
      }
      let near = (x, y) => G3.nodes.filter((n) => n.kind === "corner").reduce((b, n) => dist(n.x, n.y, x, y) < dist(b.x, b.y, x, y) ? n : b);
      G3.link(c00, near(P.x0 - 1, P.y0 - 1)), G3.link(c10, near(P.x1 + 1, P.y0 - 1)), G3.link(c11, near(P.x1 + 1, P.y1 + 1)), G3.link(c01, near(P.x0 - 1, P.y1 + 1)), poi.park.paths = [c00, c10, c11, c01, mN, mS, mW, mE, ...ring], poi.park.ring = ring, poi.park.perimeter = [c00, mN, c10, mE, c11, mS, c01, mW];
      let all = G3.nodes.slice(), nearestPark = (x, y) => poi.park.paths.reduce((b, n) => dist(n.x, n.y, x, y) < dist(b.x, b.y, x, y) ? n : b);
      for (let b of world.benches)
        if (b.x > P.x0 && b.x < P.x1 && b.y > P.y0 && b.y < P.y1) {
          let n = nearestPark(b.x, b.y);
          poi.benches.push({ bench: b, node: n, park: !0 });
        }
      if (world.pond && (poi.park.pond = nearestPark(world.pond.x, world.pond.y)), world.dogRun) {
        let g = G3.add(world.dogRun.gate.x, world.dogRun.gate.y);
        G3.link(g, nearestPark(g.x, g.y)), poi.park.dogGate = g;
      }
      poi.park.lawnNodes = (world.lawns || []).map((l) => nearestPark((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2));
    }
    for (let b of world.benches) {
      if (poi.benches.some((p) => p.bench === b)) continue;
      let sw = G3.attach(b.x, b.y, 6);
      sw && poi.benches.push({ bench: b, node: sw, park: !1 });
    }
    if (world.court) {
      let C = world.court, gate = G3.add(C.gate.x, C.gate.y), sw = G3.attach(C.gate.x, C.gate.y + 9, 6) || G3.attach(C.gate.x, C.gate.y, 12);
      if (sw && G3.link(gate, sw), poi.court.gate = gate, world.playground) {
        let pg = world.playground, n = G3.add((pg.x0 + pg.x1) / 2, pg.y1 - 0.5), s2 = G3.attach(n.x, pg.y1 + 1.2, 4);
        s2 && G3.link(n, s2), G3.link(n, gate), poi.court.playground = n;
      }
      if (world.handball) {
        let n = G3.add(world.handball.x, world.handball.y);
        G3.link(n, gate);
        let s3 = G3.attach(n.x, n.y + 3, 5);
        s3 && G3.link(n, s3), poi.court.handball = n;
      }
    }
    return G3.finalize(), G3.poi = poi, G3.corners = corner, G3;
  }

  // src/sim/people.js
  var SKIN = [16175796, 15645846, 14196856, 11958354, 9066038, 6504490, 1578e4], HAIR = [1841172, 3022872, 4861984, 8015402, 12092476, 14200928, 11027998, 10132122, 15263972, 1841172, 3022872], CLOTH = [14168108, 2777016, 3115590, 15909424, 15235610, 9054858, 1973794, 15921902, 9277591, 5939416, 15044533, 3820138, 8003359, 1011562, 12099704, 6982202], DARKS = [1973794, 2765638, 3820138, 4864554, 5921376, 3095082, 2307694], NAMES = [
    "Maria",
    "Jamal",
    "Wei",
    "Priya",
    "Luis",
    "Sofia",
    "Ahmed",
    "Rachel",
    "Dmitri",
    "Aisha",
    "Kenji",
    "Fatima",
    "Tony",
    "Grace",
    "Malik",
    "Elena",
    "Jae",
    "Omar",
    "Chloe",
    "Diego",
    "Nia",
    "Sam",
    "Yuki",
    "Isaac",
    "Rosa",
    "Mo",
    "Leah",
    "Andre",
    "Mei",
    "Carlos",
    "Bianca",
    "Kwame",
    "Olga",
    "Raj",
    "Lucia",
    "Tyrone",
    "Hana",
    "Frankie",
    "Esther",
    "Marco",
    "Imani",
    "Vic",
    "Ana",
    "Benny",
    "Zoe",
    "Hector",
    "Ming",
    "Destiny",
    "Sal",
    "Ivy"
  ], DOG_NAMES = ["Biscuit", "Lola", "Rocco", "Pretzel", "Bella", "Mookie", "Daisy", "Frank", "Peanut", "Luna", "Bodega", "Pickles"], POP = [[0, 50], [2, 26], [5, 34], [7, 170], [9, 240], [12, 250], [15, 270], [17, 310], [19, 270], [21, 190], [23, 95], [24, 50]];
  function popTarget(h) {
    for (let i = 1; i < POP.length; i++) if (h <= POP[i][0]) {
      let a = POP[i - 1], b = POP[i];
      return a[1] + (b[1] - a[1]) * (h - a[0]) / (b[0] - a[0]);
    }
    return 26;
  }
  var People = class {
    constructor(city) {
      this.city = city, this.world = city.world, this.rng = new RNG(4242), this.nav = buildNav(city.world), this.list = [], this.cross = /* @__PURE__ */ new Map(), this.nextId = 1, this.grid = /* @__PURE__ */ new Map(), this.umbrellaFrame = city.atlas.get("umbrella"), this.strollerFrame = city.atlas.get("stroller"), this.bikeFrame = city.atlas.get("bike"), this.activities = null, this.spawnAcc = 0;
    }
    // ---- helpers -----------------------------------------------------------------
    crossKey(c) {
      return `${c.i},${c.j},${c.side}`;
    }
    crosswalkBusy(i, j, side) {
      return (this.cross.get(`${i},${j},${side}`) || 0) > 0;
    }
    walkState(c) {
      let st = this.city.traffic.signalState(c.i, c.j);
      return c.axis === "x" ? st.walkEW : st.walkNS;
    }
    env() {
      return this.city.env;
    }
    // ---- creation ------------------------------------------------------------------
    outfit(role, kid, elder) {
      let env = this.env(), r = this.rng, s = env.season, t = env.temperature(), tpl = { body: kid ? "kid" : elder ? "elder" : "adult", hair: r.pick(["short", "short", "long", "pony", "bun", "afro", "bald", "spiky", "long"]) };
      elder && r.chance(0.3) && (tpl.hair = "bald"), kid && tpl.hair === "bald" && (tpl.hair = "short");
      let cold = t < 45, cool = t < 62, hot = t > 78;
      role === "jogger" ? (tpl.top = "tank", tpl.bottom = "shorts", cool && (tpl.top = "long", tpl.bottom = "pants", tpl.hat = "beanie")) : role === "player" ? (tpl.top = "jersey", tpl.bottom = "shorts") : role === "worker" ? (tpl.top = r.chance(0.6) ? "suit" : "long", tpl.bottom = r.chance(0.25) ? "skirt" : "pants", tpl.bag = r.chance(0.6) ? "brief" : "shoulder", tpl.glasses = r.chance(0.3)) : (tpl.top = hot ? r.pick(["tee", "tee", "tank", "stripe"]) : r.pick(["tee", "long", "stripe", "long"]), tpl.bottom = hot ? r.pick(["shorts", "shorts", "skirt", "dress", "pants"]) : r.pick(["pants", "pants", "skirt", "pants"]), kid && tpl.bottom === "dress" && r.chance(0.5) && (tpl.bottom = "shorts")), cold ? (tpl.coat = r.pick(["long", "puffer", "puffer"]), tpl.scarf = r.chance(0.6), tpl.hat = r.chance(0.65) ? "beanie" : tpl.hat, tpl.bottom === "shorts" && (tpl.bottom = "pants")) : cool && (tpl.coat = r.chance(0.6) ? "jacket" : null, r.chance(0.2) && (tpl.hat = "hood"), tpl.bottom === "shorts" && (tpl.bottom = "pants")), !tpl.hat && r.chance(hot ? 0.3 : 0.12) && (tpl.hat = r.pick(["cap", "cap", "fedora"])), role === "tourist" && (tpl.bag = "back", tpl.hat = tpl.hat || (hot ? "cap" : null)), kid && !cold && r.chance(0.4) && (tpl.bag = "back"), elder && (tpl.cane = r.chance(0.4)), role === "vendor" && (tpl.top = "tee", tpl.hat = "cap", tpl.coat = cold ? "puffer" : null), role === "trick" && (tpl.hat = r.pick(["witch", "witch", "helmet"]), tpl.coat = "long"), role === "shopper" && (tpl.bag = "shopping");
      for (let k of Object.keys(tpl)) (tpl[k] == null || tpl[k] === !1) && delete tpl[k];
      return tpl;
    }
    palette(tpl) {
      let r = this.rng, skin = r.pick(SKIN), hair = tpl.body === "elder" ? r.pick([10132122, 13158596, 15263972, 6974058]) : r.pick(HAIR.slice(0, 7)), P = {
        [S.SKIN]: skin,
        [S.HAIR]: hair,
        [S.TOP]: r.pick(CLOTH),
        [S.TOP2]: r.pick(CLOTH),
        [S.BOTTOM]: tpl.bottom === "pants" ? r.pick(DARKS.concat([3824266, 3824266, 12099704])) : r.pick(CLOTH),
        [S.SHOES]: r.pick([1973794, 15921902, 5913130, 14168108, 2777016]),
        [S.COAT]: r.pick([1973794, 8003359, 2765638, 12099704, 3107386, 14168108, 9054858, 15909424, 5939416]),
        [S.HAT]: r.pick(CLOTH),
        [S.SCARF]: r.pick([14168108, 15909424, 2777016, 15044533, 3115590]),
        [S.BAG]: r.pick([5913130, 1973794, 14168108, 12099704, 2777016]),
        [S.DARK]: 1709076,
        [S.WHITE]: 15921902,
        [S.ITEM]: r.pick([1973794, 14168108, 2777016, 15909424, 3115590, 15044533, 8015871]),
        [S.ITEM2]: r.pick(CLOTH),
        [S.SOCK]: 15921902
      };
      return tpl.top === "suit" && (P[S.TOP] = r.pick([1973794, 2765638, 4868690, 3811874]), P[S.TOP2] = r.pick([14168108, 2777016, 8003359]), P[S.BOTTOM] = P[S.TOP]), tpl.hat === "witch" && (P[S.HAT] = 1973794), tpl.hat === "helmet" && (P[S.HAT] = 14168108), this.city.pal.alloc(P);
    }
    create(role, opts = {}) {
      let r = this.rng, kid = role === "kid" || role === "player" || role === "trick" || opts.kid, elder = role === "elder", tpl = this.outfit(role, kid, elder), frames2 = personTemplate(this.city.atlas, tpl), p = {
        id: this.nextId++,
        role,
        kid,
        elder,
        tpl,
        frames: frames2,
        pal: this.palette(tpl),
        name: r.pick(NAMES),
        age: kid ? r.int(8, 15) : elder ? r.int(68, 88) : r.int(19, 62),
        x: 0,
        y: 0,
        z: 0.125,
        node: null,
        path: null,
        pi: 0,
        state: "idle",
        timer: 0,
        plan: [],
        step: null,
        speed: (kid ? r.range(1, 1.25) : elder ? r.range(0.5, 0.65) : r.range(0.82, 1.08)) * (role === "jogger" ? 2.1 : 1),
        lane: r.range(0.12, 0.42),
        anim: "idle",
        animT: r.next() * 4,
        front: !0,
        flip: !1,
        dx: 0,
        dy: 1,
        alpha: 1,
        fade: 0,
        dist: 0,
        thought: "",
        umbrella: !1,
        crossing: null
      };
      p.run = role === "jogger";
      let env = this.env();
      return p.umbrella = env.raining && !kid && r.chance(0.8), p;
    }
    release(p) {
      this.city.pal.release(p.pal), p.crossing && this.endCross(p), p.dog && (p.dog.gone = !0), p.onRelease && p.onRelease(p);
    }
    // ---- planning ---------------------------------------------------------------
    poi() {
      return this.nav.poi;
    }
    pickHome() {
      return this.rng.pick(this.poi().homes);
    }
    nearestOf(list, x, y) {
      let b = null, bd = 1 / 0;
      for (let n of list) {
        let d = dist2(n.x, n.y, x, y);
        d < bd && (bd = d, b = n);
      }
      return b;
    }
    plan(p, kind) {
      let P = this.poi(), r = this.rng, env = this.env(), shop = () => r.pick(P.shops), subway = () => r.pick(P.subways), office = () => r.pick(P.offices), home = p.home || this.pickHome();
      p.home = home;
      let go = (node, thought) => ({ t: "go", node, thought });
      switch (kind) {
        case "commute":
          return [go(subway(), "Running for the train"), { t: "enter" }];
        case "toWork":
          return [go(office(), "Late for a meeting"), { t: "enter" }];
        case "goHome":
          return [go(home, "Heading home"), { t: "enter" }];
        case "errand": {
          let s = shop();
          return [go(s, `Picking something up at the ${s.data?.name?.toLowerCase() || "shop"}`), { t: "shop", node: s, dur: r.range(6, 14) }, go(home, "Back home"), { t: "enter" }];
        }
        case "coffee": {
          let s = P.shops.find((n) => n.data?.kind === "coffee" || n.data?.kind === "bagels" || n.data?.kind === "bodega") || shop();
          return [go(s, "Need coffee. Now."), { t: "shop", node: s, dur: r.range(5, 9) }, go(subway(), "Off to work"), { t: "enter" }];
        }
        case "lunch": {
          let c = r.pick(P.carts), steps = [];
          c && steps.push(go(c.node, `Lunch from the ${c.cart.kind} cart`), { t: "idle", dur: r.range(4, 8), face: c.cart, thought: "Chicken over rice, extra white sauce" });
          let b = this.freeBench();
          return b && steps.push(go(b.node, "Finding a bench"), { t: "sit", bench: b, dur: r.range(18, 40), thought: "Lunch in the sun" }), steps.push(go(office(), "Back to the grind"), { t: "enter" }), steps;
        }
        case "park": {
          let steps = [go(r.pick(P.park.paths || [home]), "Walk in the park")], b = this.freeBench(!0);
          return b && r.chance(0.65) ? steps.push(go(b.node, "Resting my feet"), { t: "sit", bench: b, dur: r.range(20, 60), thought: p.elder ? "Feeding the pigeons" : "People watching", feed: p.elder }) : env.season === 1 && P.park.lawnNodes?.length && env.hour > 10 && env.hour < 18 && !env.raining ? steps.push(go(r.pick(P.park.lawnNodes), "Sunbathing"), { t: "activity", kind: "lawn", dur: r.range(30, 70) }) : steps.push(go(r.pick(P.park.paths), "Strolling"), go(r.pick(P.park.paths), "Strolling")), steps.push(go(r.chance(0.5) ? home : subway(), "Time to go"), { t: "enter" }), steps;
        }
        case "dogwalk": {
          let steps = [go(r.pick(P.park.perimeter || [home]), `Walking ${p.dogName}`)];
          return P.park.dogGate && r.chance(0.6) ? steps.push(go(P.park.dogGate, `Dog run time for ${p.dogName}`), { t: "activity", kind: "dogrun", dur: r.range(25, 50) }) : steps.push(go(r.pick(P.park.perimeter), `${p.dogName} wants to sniff everything`)), steps.push(go(home, "Home"), { t: "enter" }), steps;
        }
        case "jog": {
          let per = P.park.perimeter || [], steps = [go(per[0], "Morning run")];
          for (let lap = 0; lap < 2; lap++) for (let n of per) steps.push(go(n, "Keep the pace"));
          return steps.push(go(home, "Cool down"), { t: "enter" }), steps;
        }
        case "tourist": {
          let steps = [], spots = [...P.offices.slice(0, 4), ...P.park.ring || []];
          for (let k = 0; k < 3; k++) steps.push(go(r.pick(spots).sw || r.pick(spots), "Is that the famous one?"), { t: "idle", dur: r.range(3, 6), anim: "phone", thought: "Taking a photo" });
          return steps.push(go(subway(), "Next stop: Times Square?"), { t: "enter" }), steps;
        }
        case "kidplay":
          return this.kidPlan(p);
        case "stoop": {
          let s = this.freeStoop();
          return s ? [go(s.door.sw || s.door, "Hanging out on the stoop"), { t: "stoop", seat: s, dur: r.range(40, 90) }, { t: "enter" }] : [go(home, "Home"), { t: "enter" }];
        }
        case "bus": {
          let b = r.pick(P.busStops);
          return b ? [go(b.node, "Waiting for the bus"), { t: "bus", stop: b.stop, dur: 120 }] : [go(subway()), { t: "enter" }];
        }
        case "night":
          return [go(r.chance(0.5) ? subway() : home, r.pick(["Long shift", "One more slice", "The city never sleeps"])), { t: "enter" }];
        case "trick": {
          let steps = [];
          for (let k = 0; k < 4; k++) {
            let s = r.pick(P.stoops);
            s && steps.push(go(s.door.sw || s.door, "Trick or treat!"), { t: "idle", dur: 3, anim: "wave", thought: "Trick or treat!" });
          }
          return steps.push(go(home, "Counting candy"), { t: "enter" }), steps;
        }
        case "skate":
          return [go(P.park.pond || home, "Ice skating!"), { t: "activity", kind: "skate", dur: r.range(40, 90) }, go(home, "Hot chocolate time"), { t: "enter" }];
        case "wander":
        default:
          return [go(r.pick(P.shops).sw || home, "Just walking"), go(home, "Home"), { t: "enter" }];
      }
    }
    kidPlan(p) {
      let env = this.env(), r = this.rng, P = this.poi(), steps = [], s = env.season, A = this.activities;
      return s === 1 && A && env.hour > 12 && env.hour < 19.5 && A.hydrantOpen && r.chance(0.45) ? steps.push({ t: "go", node: A.hydrantOpen.node, thought: "Hydrant is open!!" }, { t: "activity", kind: "hydrant", dur: r.range(30, 60) }) : s === 3 && env.snowCover > 0.3 ? r.chance(0.7) ? steps.push({ t: "go", node: r.pick(P.park.lawnNodes || [P.court.gate]), thought: "SNOWBALL FIGHT" }, { t: "activity", kind: "snowball", dur: r.range(40, 80) }) : steps.push({ t: "go", node: P.park.pond, thought: "Skating" }, { t: "activity", kind: "skate", dur: r.range(30, 60) }) : !env.raining && (s === 1 || s === 0 || s === 2) && r.chance(0.65) && P.court.gate ? steps.push({ t: "go", node: P.court.gate, thought: "Next game, I got winners" }, { t: "activity", kind: "basketball", dur: r.range(50, 110) }) : P.court.playground && steps.push({ t: "go", node: P.court.playground, thought: "Swings!" }, { t: "activity", kind: "playground", dur: r.range(30, 60) }), steps.push({ t: "go", node: p.home || this.pickHome(), thought: "Mom said be home by dark" }, { t: "enter" }), steps;
    }
    freeBench(parkOnly = !1) {
      let list = this.poi().benches.filter((b) => (!parkOnly || b.park) && b.bench.used.some((u) => !u));
      return list.length ? this.rng.pick(list) : null;
    }
    freeStoop() {
      let list = this.poi().stoops.filter((s) => !s.seat.used);
      return list.length ? this.rng.pick(list) : null;
    }
    chooseKind(role) {
      let h = this.env().hour, r = this.rng, env = this.env();
      return role === "kid" ? env.season === 2 && h > 17 && h < 20.5 && r.chance(0.5) ? "trick" : "kidplay" : role === "jogger" ? "jog" : role === "dogwalker" ? "dogwalk" : role === "tourist" ? "tourist" : role === "elder" ? r.chance(0.6) ? "park" : "errand" : role === "worker" ? h < 11 ? "toWork" : h < 14.5 ? "lunch" : "commute" : h < 5 ? "night" : h < 9.5 ? r.weighted([["commute", 40], ["coffee", 20], ["toWork", 12], ["errand", 8], ["bus", 6]]) : h < 16 ? r.weighted([["errand", 35], ["park", 30], ["bus", 8], ["wander", 10], ["commute", 8]]) : h < 20 ? r.weighted([["goHome", 30], ["errand", 25], ["park", 15], ["stoop", env.season === 1 ? 25 : 4], ["bus", 6]]) : r.weighted([["goHome", 40], ["night", 30], ["stoop", env.season === 1 ? 20 : 2], ["errand", 10]]);
    }
    chooseRole() {
      let h = this.env().hour, r = this.rng, env = this.env(), kidsOut = h > 14.5 && h < 20.5 && !env.storm, opts = [
        ["resident", 46],
        ["worker", h > 7 && h < 10 ? 25 : h > 11.5 && h < 14 ? 22 : h > 16.5 && h < 19.5 ? 20 : 2],
        ["kid", kidsOut ? env.season === 3 && env.snowCover > 0.3 ? 40 : 30 : h > 8 && h < 14 && env.season === 1 ? 6 : 0],
        ["elder", h > 8 && h < 18 ? 9 : 1],
        ["dogwalker", h < 9 || h > 17 ? 12 : 6],
        ["jogger", h > 6 && h < 9 || h > 17 && h < 20 ? env.season === 3 ? 3 : 8 : 1],
        ["tourist", h > 9 && h < 20 ? 9 : 1]
      ];
      return env.raining && (opts[2][1] *= 0.2, opts[5][1] *= 0.2, opts[6][1] *= 0.5), r.weighted(opts);
    }
    // ---- spawning ---------------------------------------------------------------
    spawn(anywhere = !1) {
      let role = this.chooseRole(), kind = this.chooseKind(role), p = this.create(role), P = this.poi(), r = this.rng, h = this.env().hour, src;
      if (role === "worker" && (kind === "lunch" || kind === "commute") ? src = r.pick(P.offices) : role === "worker" || role === "tourist" || kind === "goHome" || kind === "night" && r.chance(0.5) ? src = r.pick(P.subways) : src = this.pickHome(), kind === "goHome" ? p.home = this.pickHome() : src.kind === "door" && src.data?.kind === "home" && (p.home = src), role === "dogwalker" && (p.dogName = r.pick(DOG_NAMES), this.city.animals?.spawnDog(p)), p.plan = this.plan(p, kind), p.node = src, p.x = src.x, p.y = src.y, p.z = src.z, p.state = "appear", p.alpha = 0, anywhere) {
        let n = r.pick(this.nav.nodes.filter((nn) => nn.kind === "walk" || nn.kind === "corner"));
        p.node = n, p.x = n.x, p.y = n.y, p.z = n.z, p.alpha = 1, p.state = "idle", p.timer = r.range(0, 0.5);
      }
      return p.dog && (p.dog.x = p.x, p.dog.y = p.y), this.list.push(p), p;
    }
    init() {
      let target = popTarget(this.env().hour) * this.weatherK();
      for (let k = 0; k < target * 0.8; k++) this.spawn(!0);
      this.activities?.seed();
    }
    weatherK() {
      let env = this.env(), k = 1;
      return env.raining && (k *= 0.6), env.storm && (k *= 0.45), env.snowing && (k *= 0.85), k;
    }
    // ---- step execution -----------------------------------------------------------------
    nextStep(p) {
      let st = p.plan.shift();
      if (p.step = st || null, !st) {
        this.goTo(p, this.nearestOf(this.poi().subways, p.x, p.y)), p.plan = [{ t: "enter" }];
        return;
      }
      switch (st.thought && (p.thought = st.thought), st.t) {
        case "go": {
          if (!st.node) {
            this.nextStep(p);
            return;
          }
          this.goTo(p, st.node) || this.nextStep(p);
          break;
        }
        case "idle":
          p.state = "idle", p.timer = st.dur, p.anim = st.anim || "idle", st.face && this.faceTo(p, st.face.x, st.face.y);
          break;
        case "sit": {
          let b = st.bench.bench, k = b.used.findIndex((u) => !u);
          if (k < 0) {
            this.nextStep(p);
            return;
          }
          b.used[k] = p.id, p.seat = { b, k };
          let s = b.seats[k];
          p.walkTo = { x: s.x, y: s.y, z: s.z, then: "sit" }, p.state = "approach", p.timer = st.dur, st.feed && (p.feeding = !0);
          break;
        }
        case "stoop": {
          let s = st.seat.seat;
          if (s.used) {
            this.nextStep(p);
            return;
          }
          s.used = p.id, p.stoopSeat = s, p.walkTo = { x: s.x, y: s.y, z: s.z, then: "sit", via: st.seat.door }, p.state = "approach", p.timer = st.dur, p.thought = this.rng.pick(["Catching up with the neighbors", "Too hot inside", "Watching the block"]);
          break;
        }
        case "shop":
          p.state = "inside", p.timer = st.dur, p.alphaTarget = 0, p.insideNode = st.node;
          break;
        case "enter":
          p.state = "vanish";
          break;
        case "activity": {
          this.activities && this.activities.join(p, st.kind, st.dur) ? p.state = "activity" : this.nextStep(p);
          break;
        }
        case "bus":
          p.state = "busWait", p.timer = st.dur, p.busStop = st.stop, p.anim = "idle", p.thought = "Where is the bus...";
          break;
        default:
          this.nextStep(p);
      }
    }
    goTo(p, target) {
      let from = p.node;
      from || (from = this.nearestOf(this.nav.nodes, p.x, p.y));
      let path = this.nav.path(from, target);
      return path ? (p.path = path.map((w) => ({ x: w.node.x, y: w.node.y, z: w.node.z, cross: w.cross, node: w.node })), p.pi = 1, p.state = "walk", p.goal = target, p.path.length <= 1 && (p.state = "arrived"), !0) : !1;
    }
    faceTo(p, x, y) {
      let d = this.city.camera.screenDir(x - p.x, y - p.y);
      p.front = d[1] >= 0, p.flip = d[0] < 0;
    }
    endCross(p) {
      let k = this.crossKey(p.crossing);
      this.cross.set(k, Math.max(0, (this.cross.get(k) || 1) - 1)), p.crossing = null;
    }
    // ---- update -----------------------------------------------------------------------
    update(dt) {
      let env = this.env(), target = popTarget(env.hour) * this.weatherK();
      if (this.list.length < target)
        for (this.spawnAcc += dt * Math.min(6, (target - this.list.length) * 0.08 + 0.4); this.spawnAcc > 1; )
          this.spawnAcc -= 1, this.spawn(!1);
      this.grid.clear();
      for (let p of this.list) {
        let k = Math.floor(p.x / 1.5) << 16 | Math.floor(p.y / 1.5), c = this.grid.get(k);
        c || this.grid.set(k, c = []), c.push(p);
      }
      for (let i = this.list.length - 1; i >= 0; i--) {
        let p = this.list[i];
        this.stepPerson(p, dt, env), p.dead && (this.release(p), this.list.splice(i, 1));
      }
    }
    neighbors(p, r = 0.6) {
      let out = [], cx = Math.floor(p.x / 1.5), cy = Math.floor(p.y / 1.5);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          let c = this.grid.get(cx + dx << 16 | cy + dy);
          if (c) for (let o of c) o !== p && dist2(o.x, o.y, p.x, p.y) < r * r && out.push(o);
        }
      return out;
    }
    stepPerson(p, dt, env) {
      switch (p.animT += dt, p.umbrella && !env.raining && this.rng.chance(dt * 0.1) && (p.umbrella = !1), !p.umbrella && env.raining && !p.kid && p.state === "walk" && this.rng.chance(dt * 0.05) && (p.umbrella = !0), p.state) {
        case "appear":
          p.alpha = Math.min(1, p.alpha + dt * 2.5), p.node && p.node.kind === "subway" && (p.z = Math.min(0.125, p.z + dt * 0.8)), p.alpha >= 1 && this.nextStep(p);
          break;
        case "idle":
          p.timer -= dt, (p.anim === "walk" || p.anim === "run") && (p.anim = "idle"), p.timer <= 0 && this.nextStep(p);
          break;
        case "arrived":
          this.nextStep(p);
          break;
        case "walk":
          this.walk(p, dt);
          break;
        case "wait": {
          p.anim = "idle";
          let w = this.walkState(p.waitCross), cw = p.path && p.path[p.pi], busy = w === "walk" && this.city.traffic.flashing && cw && this.city.traffic.movingCarNear((p.x + cw.x) / 2, (p.y + cw.y) / 2, 6);
          w === "walk" && !busy && (p.state = "walk", p.crossing = p.waitCross, this.cross.set(this.crossKey(p.crossing), (this.cross.get(this.crossKey(p.crossing)) || 0) + 1));
          break;
        }
        case "approach": {
          let t = p.walkTo, d = dist(p.x, p.y, t.x, t.y), sp = p.speed * dt;
          d <= sp + 0.02 ? (p.x = t.x, p.y = t.y, p.z = t.z, t.then === "sit" && (p.state = "sit", p.anim = "sit", this.faceSeat(p))) : (p.x += (t.x - p.x) / d * sp, p.y += (t.y - p.y) / d * sp, p.z += (t.z - p.z) * Math.min(1, sp / d), this.setFacing(p, t.x - p.x, t.y - p.y), p.dist += sp, p.anim = "walk");
          break;
        }
        case "sit":
          if (p.timer -= dt, p.anim = "sit", p.timer <= 0) {
            p.seat && (p.seat.b.used[p.seat.k] = !1, p.seat = null), p.stoopSeat && (p.stoopSeat.used = !1, p.stoopSeat = null), p.feeding = !1;
            let back = p.node;
            back ? (p.walkTo = { x: back.x, y: back.y, z: back.z, then: "resume" }, p.state = "return") : this.nextStep(p);
          }
          break;
        case "return": {
          let t = p.walkTo, d = dist(p.x, p.y, t.x, t.y), sp = p.speed * dt;
          d <= sp + 0.02 ? (p.x = t.x, p.y = t.y, p.z = t.z, this.nextStep(p)) : (p.x += (t.x - p.x) / d * sp, p.y += (t.y - p.y) / d * sp, p.z += (t.z - p.z) * Math.min(1, sp / d), this.setFacing(p, t.x - p.x, t.y - p.y), p.dist += sp, p.anim = "walk");
          break;
        }
        case "inside":
          p.timer -= dt, p.alpha = Math.max(0, p.alpha - dt * 3), p.timer <= 0 && (p.alpha = Math.min(1, p.alpha + dt * 6), p.reappeared || (p.reappeared = !0, this.rng.chance(0.5) && p.tpl.bag !== "shopping" && !p.tpl.bag && (p.tpl = { ...p.tpl, bag: "shopping" }, p.frames = personTemplate(this.city.atlas, p.tpl))), p.alpha >= 1 && (p.reappeared = !1, this.nextStep(p)));
          break;
        case "vanish":
          p.alpha -= dt * 2.5, p.node && p.node.kind === "subway" && (p.z -= dt * 0.8), p.alpha <= 0 && (p.dead = !0);
          break;
        case "activity":
          break;
        case "vendor":
          p.anim = "idle";
          break;
        case "busWait":
          p.timer -= dt, p.anim = "idle", p.timer <= 0 && (p.plan = [{ t: "go", node: this.nearestOf(this.poi().subways, p.x, p.y) }, { t: "enter" }], this.nextStep(p));
          break;
      }
      p.dog && this.city.animals?.followOwner(p.dog, p, dt);
    }
    faceSeat(p) {
      let f = p.seat ? p.seat.b.seats[p.seat.k].face : p.stoopSeat ? p.stoopSeat.n : [0, 1], d = this.city.camera.screenDir(f[0], f[1]);
      p.front = d[1] >= 0, p.flip = d[0] < 0;
    }
    setFacing(p, dx, dy) {
      Math.abs(dx) + Math.abs(dy) < 1e-4 || (p.dx = dx, p.dy = dy);
    }
    walk(p, dt) {
      let wp = p.path[p.pi];
      if (!wp) {
        p.state = "arrived";
        return;
      }
      if (wp.cross && p.crossing !== wp.cross && !p.passedCheck) {
        let w = this.walkState(wp.cross), prevN = p.path[p.pi - 1], carNear = w === "walk" && this.city.traffic.flashing && this.city.traffic.movingCarNear((prevN.x + wp.x) / 2, (prevN.y + wp.y) / 2, 6);
        if (w !== "walk" || carNear) {
          p.state = "wait", p.waitCross = wp.cross, this.faceTo(p, wp.x, wp.y);
          return;
        }
        p.crossing = wp.cross, this.cross.set(this.crossKey(p.crossing), (this.cross.get(this.crossKey(p.crossing)) || 0) + 1);
      }
      let prev = p.path[p.pi - 1], tx = wp.x, ty = wp.y, last = p.pi === p.path.length - 1, sdx = wp.x - prev.x, sdy = wp.y - prev.y, sl = Math.hypot(sdx, sdy) || 1;
      !last && wp.node.kind !== "door" && wp.node.kind !== "stoop" && wp.node.kind !== "subway" && (tx += -sdy / sl * p.lane, ty += sdx / sl * p.lane);
      let d = Math.hypot(tx - p.x, ty - p.y), speed = p.speed * (this.city.env.raining ? 1.12 : 1);
      p.dog && p.dog.sniffing && (speed = 0);
      let nb = this.neighbors(p, 0.55), px = 0, py = 0;
      for (let o of nb) {
        let ox = p.x - o.x, oy = p.y - o.y, od = Math.hypot(ox, oy) || 0.01;
        px += ox / od * (0.55 - od), py += oy / od * (0.55 - od);
        let ahead = ((o.x - p.x) * (tx - p.x) + (o.y - p.y) * (ty - p.y)) / (d || 1);
        ahead > 0.15 && ahead < 0.5 && o.state === "walk" && (speed *= 0.7);
      }
      let step = speed * dt;
      if (d <= step + 0.03)
        p.x = tx, p.y = ty, p.z = wp.z, p.node = wp.node, p.crossing && wp.cross === p.crossing && this.endCross(p), p.pi++, p.pi >= p.path.length && (p.state = "arrived", p.anim = "idle");
      else {
        let k = step / d;
        p.x += (tx - p.x) * k + px * dt * 0.8, p.y += (ty - p.y) * k + py * dt * 0.8, p.z += (wp.z - p.z) * Math.min(1, k * 1), this.setFacing(p, tx - p.x, ty - p.y), p.dist += step;
      }
      p.anim = p.run ? "run" : "walk";
    }
    // ---- rendering --------------------------------------------------------------------
    emit(L, view) {
      let cam = this.city.camera;
      for (let p of this.list)
        p.alpha <= 0.01 || view.visible(p.x, p.y, p.z, 2) && this.emitPerson(L, p, cam);
    }
    emitPerson(L, p, cam) {
      if (p.anim === "walk" || p.anim === "run" || p.forceFace) {
        let d = cam.screenDir(p.dx, p.dy);
        p.front = d[1] >= 0, Math.abs(d[0]) > 0.01 && (p.flip = d[0] < 0);
      }
      let set = p.front ? p.frames.front : p.frames.back, arr = set[p.anim] || set.idle, fi = 0;
      p.anim === "walk" ? fi = Math.floor(p.dist / 0.16) % 4 : p.anim === "run" ? fi = Math.floor(p.dist / 0.2) % 4 : p.anim === "idle" ? fi = Math.floor(p.animT * 1.3) % 2 : p.animFrame != null ? fi = p.animFrame % arr.length : fi = Math.floor(p.animT * 3) % arr.length;
      let f = arr[fi] || arr[0], alpha = p.alpha;
      if (p.z < 0.125 - 0.15 && (alpha *= clamp(1 + (p.z - 0.125 + 0.15) * 1.6, 0, 1)), L.push(p.x, p.y, p.z, f, p.pal, p.flip ? SF.FLIP : 0, alpha, 3e-3), p.umbrella) {
        let hz = p.z + (p.kid ? 0.82 : 1.12);
        L.push(p.x, p.y, hz, this.umbrellaFrame, p.pal, 0, alpha, 4e-3);
      }
      p.extra && p.extra(L, p);
    }
    // pick the person under a screen point (for follow mode)
    pick(px, py, viewW, viewH) {
      let cam = this.city.camera, best = null, bd = 400;
      for (let p of this.list) {
        if (p.alpha < 0.5) continue;
        let s = cam.worldToScreen(p.x, p.y, p.z + 0.5, viewW, viewH), d = (s[0] - px) ** 2 + (s[1] - py) ** 2;
        d < bd && (bd = d, best = p);
      }
      return best;
    }
  };

  // src/sim/activities.js
  var G2 = 5, Activities = class {
    constructor(city) {
      this.city = city, this.people = city.people, this.rng = new RNG(777);
      let W = city.world;
      this.court = W.court, this.hoops = W.hoops.filter((h) => this.court && h.x > this.court.x0 - 1 && h.x < this.court.x1 + 1 && h.y > this.court.y0 - 1 && h.y < this.court.y1 + 1), this.groups = { basketball: [], snowball: [], hydrant: [], skate: [], lawn: [], playground: [], dogrun: [] }, this.ball = null, this.snowballs = [], this.snowmen = [], this.hydrantOpen = null, this.hydrantTimer = 5, this.frisbee = null;
      let A = city.atlas;
      this.frames = { ball: A.get("ball"), snowball: A.get("snowball"), snowman: A.get("snowman"), frisbee: A.get("frisbee") }, this.row = city.pal.alloc({ [S.C1]: 15233050, [S.C2]: 16054527, [S.C3]: 1973794, [S.C4]: 6965802, [S.C5]: 14168108, [S.C6]: 15909424, [S.C7]: 15763994 }), this.possession = 0, this.score = [0, 0], this.shotClock = 0, this.season = city.env.season;
    }
    // Populate activities at start / season change so the city feels alive immediately
    seed() {
      let env = this.city.env, P = this.people, r = this.rng, poi = P.nav.poi, h = env.hour, s = env.season, day = h > 7.5 && h < 20.5, mk = (role, kind, node, x, y, dur, z = 0.125) => {
        let p = P.create(role);
        return p.home = P.pickHome(), p.node = node, p.x = x, p.y = y, p.z = z, p.plan = [{ t: "go", node: p.home, thought: "Heading home" }, { t: "enter" }], P.list.push(p), kind && !this.join(p, kind, dur) && (p.state = "idle", p.timer = 0.1), p;
      }, C = this.court;
      if (C && day && !env.raining && !(s === 3 && env.snowCover > 0.3)) {
        let n = s === 1 ? r.int(5, 7) : r.int(3, 4);
        for (let k = 0; k < n; k++) mk("player", "basketball", poi.court.gate, r.range(C.x0 + 1, C.x1 - 1), r.range(C.y0 + 1, C.y1 - 1), r.range(60, 140));
      }
      if (s === 3 && env.snowCover > 0.3 && day) {
        let a = this.snowArea();
        if (a) for (let k = 0; k < 8; k++) mk("kid", "snowball", poi.park.lawnNodes?.[0] || poi.court.gate, r.range(a.x0, a.x1), r.range(a.y0, a.y1), r.range(50, 120));
        let pond = this.city.world.pond;
        if (pond) for (let k = 0; k < 5; k++) mk(r.chance(0.5) ? "kid" : "resident", "skate", poi.park.pond, pond.x, pond.y, r.range(40, 100));
        for (let k = 0; k < 3; k++) {
          let a2 = this.snowArea();
          a2 && this.snowmen.push({ x: r.range(a2.x0 + 0.5, a2.x1 - 0.5), y: r.range(a2.y0 + 0.5, a2.y1 - 0.5) });
        }
      }
      if (day && poi.court.playground && !env.raining) for (let k = 0; k < 3; k++) mk("kid", "playground", poi.court.playground, poi.court.playground.x, poi.court.playground.y, r.range(30, 70));
      if (s === 1 && day && !env.raining) for (let k = 0; k < 4; k++) mk("resident", "lawn", poi.park.lawnNodes?.[k % 3], 72, 72, r.range(40, 90));
      if (day && poi.park.dogGate) for (let k = 0; k < 2; k++) {
        let p = mk("dogwalker", null, poi.park.dogGate, poi.park.dogGate.x, poi.park.dogGate.y, 0);
        p.dogName = r.pick(["Biscuit", "Lola", "Rocco", "Pretzel"]), this.city.animals?.spawnDog(p), this.join(p, "dogrun", r.range(30, 60));
      }
      let nb = day ? 8 : 2;
      for (let k = 0; k < nb; k++) {
        let b = P.freeBench(k % 2 === 0);
        if (!b) break;
        let p = mk(r.chance(0.35) ? "elder" : "resident", null, b.node, b.node.x, b.node.y, 0), bb = b.bench, i = bb.used.findIndex((u) => !u);
        bb.used[i] = p.id, p.seat = { b: bb, k: i };
        let st = bb.seats[i];
        p.x = st.x, p.y = st.y, p.z = st.z, p.state = "sit", p.anim = "sit", p.timer = r.range(20, 80), p.feeding = p.elder, p.thought = p.elder ? "Feeding the pigeons" : "People watching", P.faceSeat(p);
      }
      if (s === 1 && h > 16 || s === 0 && h > 17 && h < 21) for (let k = 0; k < 8; k++) {
        let st = P.freeStoop();
        if (!st) break;
        let p = mk(r.chance(0.3) ? "elder" : "resident", null, st.door, st.seat.x, st.seat.y, 0, st.seat.z);
        st.seat.used = p.id, p.stoopSeat = st.seat, p.state = "sit", p.anim = "sit", p.timer = r.range(40, 120), p.node = st.door, p.thought = r.pick(["Catching up with the neighbors", "Too hot inside", "Watching the block"]), P.faceSeat(p);
      }
      this.seedVendors();
    }
    seedVendors() {
      let P = this.people, env = this.city.env, open = env.hour > 7 && env.hour < 21.5;
      for (let c of this.city.world.carts)
        if (open && !c.vendor) {
          let p = P.create("vendor");
          p.x = c.x - c.nx * 0.55, p.y = c.y - c.ny * 0.55, p.z = 0.125, p.state = "vendor", p.anim = "idle", p.thought = c.kind === "halal" ? "Chicken over rice! Lamb over rice!" : c.kind === "pretzel" ? "Hot pretzels!" : "Hot dogs! Get your hot dogs!", p.forceFace = !1, P.faceTo(p, c.x + c.nx * 3, c.y + c.ny * 3), c.vendor = p, P.list.push(p);
        } else !open && c.vendor && (c.vendor.state = "vanish", c.vendor = null);
    }
    join(p, kind, dur) {
      let g = this.groups[kind];
      if (!g) return !1;
      let env = this.city.env;
      switch (p.actTimer = dur, p.actKind = kind, kind) {
        case "basketball": {
          if (!this.court || g.length >= 8 || env.raining || env.season === 3 && env.snowCover > 0.3) return !1;
          p.team = g.filter((q) => q.team === 0).length <= g.filter((q) => q.team === 1).length ? 0 : 1, p.tx = this.rng.range(this.court.x0 + 1, this.court.x1 - 1), p.ty = this.rng.range(this.court.y0 + 1, this.court.y1 - 1), p.thought = this.rng.pick(["Ball is life", "Pass it!", "Nothing but net", "Next game, I got winners", "Check ball"]);
          break;
        }
        case "snowball": {
          let area = this.snowArea();
          if (!area || g.length >= 10) return !1;
          p.team = g.filter((q) => q.team === 0).length <= g.filter((q) => q.team === 1).length ? 0 : 1, p.area = area, this.placeInArea(p, area, p.team), p.sbState = "make", p.sbTimer = this.rng.range(0.5, 2), p.thought = this.rng.pick(["SNOWBALL FIGHT!", "Take cover!", "Got you!", "My hands are frozen"]);
          break;
        }
        case "hydrant": {
          if (!this.hydrantOpen || g.length >= 8) return !1;
          let h = this.hydrantOpen.h;
          p.hy = { a: { x: h.x + h.nx * 0.2 - h.ux * 1.6, y: h.y + h.ny * 0.2 - h.uy * 1.6 }, b: { x: h.x + h.nx * 0.2 + h.ux * 1.6, y: h.y + h.ny * 0.2 + h.uy * 1.6 } }, p.hyDir = this.rng.chance(0.5) ? 1 : 0, p.thought = "SO COLD! SO GOOD!";
          break;
        }
        case "skate": {
          if (!this.city.world.pond || env.season !== 3 || g.length >= 10) return !1;
          p.ang = this.rng.range(0, Math.PI * 2), p.rad = this.rng.range(0.45, 0.95), p.angV = this.rng.range(0.35, 0.6), p.thought = this.rng.pick(["Wheee!", "Don't fall, don't fall", "Figure eight!"]);
          break;
        }
        case "lawn": {
          let lawns = this.city.world.lawns;
          if (!lawns || !lawns.length) return !1;
          let l = this.rng.pick(lawns);
          p.tx = this.rng.range(l.x0 + 0.5, l.x1 - 0.5), p.ty = this.rng.range(l.y0 + 0.5, l.y1 - 0.5), p.lawnPose = this.city.env.season === 1 && this.rng.chance(0.6) ? "lie" : "sit", p.thought = p.lawnPose === "lie" ? "Working on my tan" : "Reading a good book";
          break;
        }
        case "playground": {
          let W = this.city.world, opts = [];
          for (let s of W.swings) s.used || opts.push({ kind: "swing", s });
          for (let s of W.slides) opts.push({ kind: "slide", s });
          if (!opts.length) return !1;
          let o = this.rng.pick(opts);
          p.pg = o, o.kind === "swing" && (o.s.used = p.id), p.pgPhase = this.rng.range(0, 6), p.thought = o.kind === "swing" ? "Higher! Higher!" : "Slide!";
          break;
        }
        case "dogrun": {
          let dr = this.city.world.dogRun;
          if (!dr) return !1;
          p.tx = dr.gate.x + this.rng.range(-0.6, 0.6), p.ty = dr.gate.y - 0.2, p.dog && (p.dog.mode = "play", p.dog.area = dr), p.thought = `${p.dogName || "Buddy"}, go get it!`;
          break;
        }
      }
      return p.state = "activity", p.joinNode = p.node, g.push(p), !0;
    }
    leave(p) {
      let g = this.groups[p.actKind];
      if (g) {
        let i = g.indexOf(p);
        i >= 0 && g.splice(i, 1);
      }
      this.ball && this.ball.holder === p && (this.ball.holder = null, this.ball.state = "loose"), p.pg && p.pg.kind === "swing" && (p.pg.s.used = !1), p.pg = null, p.dog && (p.dog.mode = "follow"), p.animFrame = null, p.forceFace = !1;
      let back = p.joinNode;
      p.actKind = null, back ? (p.walkTo = { x: back.x, y: back.y, z: back.z }, p.state = "return") : this.people.nextStep(p);
    }
    snowArea() {
      let W = this.city.world, areas = [];
      if (W.lawns) for (let l of W.lawns) areas.push(l);
      return W.court && areas.push({ x0: W.court.x0 + 0.5, y0: W.court.y0 + 0.5, x1: W.court.x1 - 0.5, y1: W.court.y1 - 0.5 }), this.snowAreaPick || (this.snowAreaPick = areas[0]), this.snowAreaPick;
    }
    placeInArea(p, a, team) {
      let midx = (a.x0 + a.x1) / 2;
      p.tx = team === 0 ? this.rng.range(a.x0 + 0.3, midx - 1.2) : this.rng.range(midx + 1.2, a.x1 - 0.3), p.ty = this.rng.range(a.y0 + 0.3, a.y1 - 0.3);
    }
    moveTo(p, tx, ty, speed, dt) {
      let d = dist(p.x, p.y, tx, ty);
      if (d < 0.05) return !0;
      let s = Math.min(d, speed * dt);
      return p.dx = tx - p.x, p.dy = ty - p.y, p.x += (tx - p.x) / d * s, p.y += (ty - p.y) / d * s, p.dist += s, d < 0.08;
    }
    face(p, x, y) {
      let d = this.city.camera.screenDir(x - p.x, y - p.y);
      p.front = d[1] >= 0, Math.abs(d[0]) > 0.01 && (p.flip = d[0] < 0);
    }
    // ---- update ----------------------------------------------------------------
    update(dt) {
      let env = this.city.env;
      env.season !== this.season && (this.season = env.season, this.snowmen = [], this.snowAreaPick = null), this.vendorT = (this.vendorT ?? 0) - dt, this.vendorT <= 0 && (this.vendorT = 5, this.seedVendors()), this.updateHydrant(dt, env);
      for (let kind in this.groups) {
        let g = this.groups[kind];
        for (let i = g.length - 1; i >= 0; i--) {
          let p = g[i];
          p.actTimer -= dt;
          let h = env.hour, late = kind === "basketball" ? env.season === 1 ? h > 22 || h < 7 : env.darkness > 0.6 || h < 7 : kind === "dogrun" || kind === "lawn" ? env.darkness > 0.75 && (h > 22 || h < 6) : kind === "snowball" || kind === "playground" || kind === "skate" || kind === "hydrant" ? env.darkness > 0.55 && h > 18 || h < 7 || h > 21 : !1;
          (p.actTimer <= 0 || late || kind === "basketball" && env.raining || kind === "hydrant" && !this.hydrantOpen || p.dead) && this.leave(p);
        }
      }
      this.updateBasketball(dt, env), this.updateSnowball(dt, env), this.updateSimple(dt, env);
    }
    updateHydrant(dt, env) {
      let W = this.city.world;
      this.hydrantTimer -= dt;
      let hot = env.season === 1 && env.hour > 11 && env.hour < 19.5 && !env.raining && env.temperature() > 80;
      if (this.hydrantOpen && !hot && (this.hydrantOpen = null), !this.hydrantOpen && hot && this.hydrantTimer <= 0) {
        this.hydrantTimer = 60;
        let P = this.people.nav.poi.hydrants;
        if (P.length) {
          let sorted = P.slice().sort((a, b) => dist2(a.h.x, a.h.y, 60, 90) - dist2(b.h.x, b.h.y, 60, 90)), pick = sorted[this.rng.int(0, Math.min(3, sorted.length - 1))], h = pick.h, n = this.roadNormal(h.x, h.y);
          h.nx = n[0], h.ny = n[1], h.ux = -n[1], h.uy = n[0], this.hydrantOpen = { h, node: pick.node }, this.city.particles?.addEmitter("hydrant", h);
        }
      }
    }
    roadNormal(x, y) {
      let zone = (xx, yy) => {
        let lx = (xx % 27 + 27) % 27, ly = (yy % 27 + 27) % 27;
        return lx >= 2 && lx < 7 || ly >= 2 && ly < 7;
      };
      for (let [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (zone(x + dx * 1.2, y + dy * 1.2)) return [dx, dy];
      return [0, 1];
    }
    updateBasketball(dt, env) {
      let g = this.groups.basketball, C = this.court;
      if (!g.length || !C) {
        this.ball = null;
        return;
      }
      let audio = this.city.audio, b = this.ball;
      b || (b = this.ball = { x: (C.x0 + C.x1) / 2, y: (C.y0 + C.y1) / 2, z: 0.125 + 0.2, vx: 0, vy: 0, vz: 0, holder: null, state: "loose", t: 0, bounceSnd: 0 });
      let shootaround = g.length < 4, attackHoop = (team) => shootaround ? this.hoops[0] : this.hoops[team % this.hoops.length];
      if (b.t += dt, b.state === "held" && b.holder) {
        let p = b.holder, fx = Math.cos(p.faceAng || 0), fy = Math.sin(p.faceAng || 0), ph = b.t * 7.5 % Math.PI, prevZ = b.z;
        b.x = p.x + fx * 0.25, b.y = p.y + fy * 0.25, b.z = 0.125 + 0.08 + Math.abs(Math.cos(ph)) * 0.55, prevZ > 0.125 + 0.2 && b.z <= 0.125 + 0.2 && audio?.event("dribble", b), p.animFrame = b.z > 0.125 + 0.4 ? 0 : 1;
      } else if (b.state === "shot") {
        if (b.x += b.vx * dt, b.y += b.vy * dt, b.z += b.vz * dt, b.vz -= G2 * dt, b.flight -= dt, b.flight <= 0) {
          let hoop2 = b.target;
          if (b.make)
            b.state = "drop", b.x = hoop2.x, b.y = hoop2.y, b.z = hoop2.z - 0.05, b.vx = 0, b.vy = 0, b.vz = -0.5, audio?.event("swish", b), shootaround || (this.score[b.team]++, this.possession = 1 - b.team), this.city.particles?.netShake?.(hoop2);
          else {
            b.state = "loose";
            let a = this.rng.range(0, Math.PI * 2);
            b.vx = Math.cos(a) * 1.6 - hoop2.fx * 1.2, b.vy = Math.sin(a) * 1.6 - hoop2.fy * 1.2, b.vz = 1.6, audio?.event("rim", b);
          }
        }
      } else
        b.x += b.vx * dt, b.y += b.vy * dt, b.z += b.vz * dt, b.vz -= G2 * dt, b.z < 0.125 + 0.08 && (b.z = 0.125 + 0.08, Math.abs(b.vz) > 0.6 && audio?.event("bounce", b), b.vz = Math.abs(b.vz) * 0.55, b.vz < 0.3 && (b.vz = 0), b.vx *= 0.82, b.vy *= 0.82), (b.x < C.x0 - 0.6 || b.x > C.x1 + 0.6) && (b.vx *= -0.6, b.x = clamp(b.x, C.x0 - 0.6, C.x1 + 0.6)), (b.y < C.y0 - 0.6 || b.y > C.y1 + 0.6) && (b.vy *= -0.6, b.y = clamp(b.y, C.y0 - 0.6, C.y1 + 0.6)), b.state === "drop" && b.z <= 0.125 + 0.1 && (b.state = "loose");
      for (let p of g) {
        let hoop2 = attackHoop(p.team);
        if (hoop2)
          if (p.forceFace = !0, b.holder === p) {
            let d = dist(p.x, p.y, hoop2.x, hoop2.y);
            if (p.shootT = (p.shootT ?? this.rng.range(1.5, 4)) - dt, d < 1.6 || p.shootT <= 0 && d < 5.5) {
              p.anim = "shoot", p.animFrame = 1, p.shootPose = 0.45, b.state = "shot", b.holder = null, b.team = p.team, b.target = hoop2, b.make = this.rng.chance(clamp(0.75 - d * 0.08, 0.3, 0.75));
              let T2 = 0.65 + d * 0.08;
              b.flight = T2, b.x = p.x, b.y = p.y, b.z = p.z + 1.1, b.vx = (hoop2.x - b.x) / T2, b.vy = (hoop2.y - b.y) / T2, b.vz = (hoop2.z + 0.05 - b.z + 0.5 * G2 * T2 * T2) / T2, p.shootT = null, this.face(p, hoop2.x, hoop2.y);
              continue;
            }
            let tx = hoop2.x - hoop2.fx * -1.4 + Math.sin(b.t + p.id) * 1.2, ty = hoop2.y + Math.cos(b.t * 0.7 + p.id) * 1.6;
            this.moveTo(p, clamp(tx, C.x0 + 0.3, C.x1 - 0.3), clamp(ty, C.y0 + 0.3, C.y1 - 0.3), 1.1, dt), p.faceAng = Math.atan2(hoop2.y - p.y, hoop2.x - p.x), p.anim = "dribble", this.face(p, hoop2.x, hoop2.y);
          } else if (p.shootPose > 0)
            p.shootPose -= dt, p.anim = "shoot", p.animFrame = p.shootPose > 0.2 ? 1 : 0;
          else if (b.state === "loose" || b.state === "drop") {
            let d = dist(p.x, p.y, b.x, b.y);
            g.filter((q) => dist(q.x, q.y, b.x, b.y) < d).length < 2 ? (this.moveTo(p, b.x, b.y, 2.1, dt), p.anim = "run", p.animFrame = null, this.face(p, b.x, b.y), d < 0.35 && b.z < 0.125 + 1 && (!shootaround && b.state === "loose" && this.possession !== p.team && this.rng.chance(0.4) && (this.possession = p.team), b.holder = p, b.state = "held")) : (p.anim = "idle", p.animFrame = null, this.face(p, b.x, b.y));
          } else {
            let active = b.holder ? attackHoop(b.holder.team) : hoop2;
            if (p.spotT = (p.spotT ?? 0) - dt, p.spotT <= 0 || p.sx == null) {
              p.spotT = this.rng.range(1.2, 3);
              let ang = this.rng.range(-1.2, 1.2) + Math.atan2(-active.fy, -active.fx), r = this.rng.range(1.2, 3.8);
              p.sx = clamp(active.x + Math.cos(ang) * r, C.x0 + 0.3, C.x1 - 0.3), p.sy = clamp(active.y + Math.sin(ang) * r, C.y0 + 0.3, C.y1 - 0.3);
            }
            let arrived = this.moveTo(p, p.sx, p.sy, 1.6, dt);
            p.anim = arrived ? "idle" : "run", p.animFrame = null, this.face(p, b.x, b.y);
          }
      }
    }
    updateSnowball(dt, env) {
      let g = this.groups.snowball, audio = this.city.audio;
      for (let p of g) {
        p.forceFace = !0;
        let a = p.area;
        if (!a) continue;
        if (dist(p.x, p.y, p.tx, p.ty) > 0.1 && p.sbState !== "throw") {
          this.moveTo(p, p.tx, p.ty, 1.6, dt), p.anim = "run", p.animFrame = null;
          continue;
        }
        p.sbTimer -= dt;
        let foes = g.filter((q) => q.team !== p.team), foe = foes.length ? foes[(p.id + Math.floor(p.animT)) % foes.length] : null;
        if (foe && this.face(p, foe.x, foe.y), p.sbState === "make")
          p.anim = "crouch", p.animFrame = 0, p.sbTimer <= 0 && (p.sbState = "throw", p.sbTimer = 0.5);
        else if (p.sbState === "throw") {
          if (p.anim = "throw", p.animFrame = p.sbTimer > 0.25 ? 0 : 1, p.sbTimer <= 0.25 && !p.thrown && (p.thrown = !0, foe)) {
            let T2 = 0.55 + dist(p.x, p.y, foe.x, foe.y) * 0.06, tx = foe.x + this.rng.range(-0.5, 0.5), ty = foe.y + this.rng.range(-0.5, 0.5);
            this.snowballs.push({ x: p.x, y: p.y, z: p.z + 0.9, vx: (tx - p.x) / T2, vy: (ty - p.y) / T2, vz: (foe.z + 0.5 - p.z - 0.9 + 0.5 * G2 * T2 * T2) / T2, t: T2, target: foe }), audio?.event("throw", p);
          }
          p.sbTimer <= 0 && (p.thrown = !1, p.sbState = this.rng.chance(0.3) ? "move" : "make", p.sbTimer = this.rng.range(0.8, 2.2), p.sbState === "move" && (this.placeInArea(p, a, p.team), p.sbState = "make"));
        } else p.sbState === "hit" && (p.anim = "idle", p.animFrame = 0, p.sbTimer <= 0 && (p.sbState = "make", p.sbTimer = this.rng.range(0.6, 1.5)));
      }
      for (let i = this.snowballs.length - 1; i >= 0; i--) {
        let s = this.snowballs[i];
        if (s.x += s.vx * dt, s.y += s.vy * dt, s.z += s.vz * dt, s.vz -= G2 * dt, s.t -= dt, s.t <= 0 || s.z < 0.125) {
          let hit = s.target && dist(s.x, s.y, s.target.x, s.target.y) < 0.55;
          hit && s.target.sbState && (s.target.sbState = "hit", s.target.sbTimer = 0.7, s.target.thought = this.rng.pick(["Oof!", "Hey!!", "Right in the face", "You're going down"])), this.city.particles?.puff(s.x, s.y, Math.max(0.125, s.z), hit ? 8 : 5, [0.96, 0.98, 1]), audio?.event("splat", s), this.snowballs.splice(i, 1);
        }
      }
      if (env.season === 3 && env.snowCover > 0.4 && this.snowmen.length < 4 && g.length && this.rng.chance(dt * 0.05)) {
        let a = this.snowArea();
        a && this.snowmen.push({ x: this.rng.range(a.x0 + 0.5, a.x1 - 0.5), y: this.rng.range(a.y0 + 0.5, a.y1 - 0.5) });
      }
    }
    updateSimple(dt, env) {
      for (let p of this.groups.hydrant) {
        p.forceFace = !0;
        let t = p.hyDir ? p.hy.b : p.hy.a;
        this.moveTo(p, t.x, t.y, 1.9, dt) ? (p.hyPause = (p.hyPause ?? this.rng.range(0.3, 1.2)) - dt, p.anim = "wave", p.animFrame = 0, p.hyPause <= 0 && (p.hyDir = 1 - p.hyDir, p.hyPause = null, this.rng.chance(0.1) && this.city.audio?.event("giggle", p))) : (p.anim = "run", p.animFrame = null);
      }
      let pond = this.city.world.pond;
      for (let p of this.groups.skate) {
        if (!pond) break;
        p.forceFace = !0, p.ang += p.angV * dt;
        let tx = pond.x + Math.cos(p.ang) * pond.rx * p.rad, ty = pond.y + Math.sin(p.ang) * pond.ry * p.rad;
        dist(p.x, p.y, tx, ty) > 0.3 ? (this.moveTo(p, tx, ty, 1.5, dt), p.anim = "walk") : (p.dx = tx - p.x, p.dy = ty - p.y, p.x = tx, p.y = ty, p.anim = "skate", p.animFrame = Math.floor(p.ang * 3) % 2), p.z = 0.125;
      }
      for (let p of this.groups.lawn)
        dist(p.x, p.y, p.tx, p.ty) > 0.08 ? (this.moveTo(p, p.tx, p.ty, p.speed, dt), p.anim = "walk", p.forceFace = !0) : (p.anim = p.lawnPose, p.animFrame = 0, p.forceFace = !1);
      for (let p of this.groups.playground) {
        let o = p.pg;
        if (o)
          if (o.kind === "swing") {
            let s = o.s;
            if (dist(p.x, p.y, s.x, s.y) > 0.6 && !p.onSwing) {
              this.moveTo(p, s.x, s.y, p.speed, dt), p.anim = "walk", p.forceFace = !0;
              continue;
            }
            p.onSwing = !0, p.pgPhase += dt * 2.6;
            let sw = Math.sin(p.pgPhase) * 0.55;
            p.x = s.x, p.y = s.y + sw, p.z = s.z + (1 - Math.cos(p.pgPhase * 1)) * 0.05 + Math.abs(sw) * 0.25, p.anim = "sit", p.animFrame = 0, p.forceFace = !1, this.face(p, s.x, s.y + 1);
          } else {
            let s = o.s;
            p.pgT = (p.pgT ?? 0) + dt;
            let cyc = p.pgT % 6;
            if (cyc < 2.5)
              this.moveTo(p, s.x, s.y + 0.6, p.speed, dt), p.z = 0.125 + Math.min(1, cyc / 2.5) * 0.2, p.anim = "walk", p.forceFace = !0;
            else if (cyc < 3.5)
              p.x = s.x, p.y = s.y, p.z = s.z, p.anim = "wave", p.animFrame = 0;
            else {
              let t = Math.min(1, (cyc - 3.5) / 0.9);
              p.x = s.x + (s.ex - s.x) * t, p.y = s.y + (s.ey - s.y) * t, p.z = s.z + (0.125 + 0.05 - s.z) * t, p.anim = "sit", p.animFrame = 0, p.forceFace = !1, this.face(p, s.ex, s.ey + 1);
            }
            p.onSwing = !1;
          }
      }
      for (let p of this.groups.dogrun)
        dist(p.x, p.y, p.tx, p.ty) > 0.08 ? (this.moveTo(p, p.tx, p.ty, p.speed, dt), p.anim = "walk", p.forceFace = !0) : (p.anim = this.rng.chance(dt * 0.3) ? "throw" : "idle", p.animFrame = null, p.forceFace = !1, p.dog && this.face(p, p.dog.x, p.dog.y));
    }
    emit(L, view) {
      let b = this.ball;
      b && this.groups.basketball.length && view.visible(b.x, b.y, b.z, 1) && L.push(b.x, b.y, b.z, this.frames.ball, this.row, 0, 1, 6e-3);
      for (let s of this.snowballs) L.push(s.x, s.y, s.z, this.frames.snowball, this.row, 0, 1, 6e-3);
      if (this.city.env.season === 3) for (let s of this.snowmen) view.visible(s.x, s.y, 0.125, 1) && L.push(s.x, s.y, 0.125, this.frames.snowman, this.snowmanRow(), 0);
    }
    snowmanRow() {
      return this._smRow == null && (this._smRow = this.city.pal.alloc({ [S.C1]: 16054527, [S.C3]: 1973794, [S.C4]: 6965802, [S.C5]: 14168108, [S.C7]: 15763994 })), this._smRow;
    }
  };

  // src/sim/animals.js
  var Animals = class {
    constructor(city) {
      this.city = city, this.rng = new RNG(99);
      let A = city.atlas, mk = (name, w, h, fn) => A.add(name, w, h, (sp) => {
        fn(sp), selOut(sp, 0.8, 1.05);
      });
      this.f = {
        pigeon: { walk: [0, 1].map((f) => mk(null, 16, 14, (sp) => paintPigeon(sp, "walk", f))), peck: [0, 1].map((f) => mk(null, 16, 14, (sp) => paintPigeon(sp, "peck", f))), fly: [0, 1].map((f) => mk(null, 18, 16, (sp) => paintPigeon(sp, "fly", f))) },
        cat: { walk: [0, 1].map((f) => mk(null, 18, 14, (sp) => paintCat(sp, "walk", f))), sit: [0, 1].map((f) => mk(null, 12, 16, (sp) => paintCat(sp, "sit", f))) },
        squirrel: { run: [0, 1].map((f) => mk(null, 14, 14, (sp) => paintSquirrel(sp, "run", f))), stand: [mk(null, 14, 14, (sp) => paintSquirrel(sp, "stand", 0))] },
        duck: { swim: [0, 1].map((f) => mk(null, 16, 12, (sp) => paintDuck(sp, "swim", f))) },
        rat: { run: [0, 1].map((f) => mk(null, 14, 8, (sp) => paintRat(sp, f))) }
      }, this.dogFrames = {};
      for (let breed in DOG_BREEDS) {
        let [w, h] = dogFrameSize(breed);
        this.dogFrames[breed] = {
          walk: [0, 1, 2, 3].map((f) => mk(null, w, h, (sp) => paintDog(sp, breed, "walk", f))),
          run: [0, 1].map((f) => mk(null, w, h, (sp) => paintDog(sp, breed, "run", f))),
          sit: [0, 1].map((f) => mk(null, w, h, (sp) => paintDog(sp, breed, "sit", f))),
          sniff: [0, 1].map((f) => mk(null, w, h, (sp) => paintDog(sp, breed, "sniff", f)))
        };
      }
      let pal = city.pal;
      this.pigeonRows = [
        pal.alloc({ [S.BODY]: 9081504, [S.BODY_D]: 4870240, [S.BODY_L]: 11844808, [S.EYE]: 14176282, [S.BEAK]: 13138538, [S.ACCENT]: 5939322 }),
        pal.alloc({ [S.BODY]: 6975616, [S.BODY_D]: 3817032, [S.BODY_L]: 10133676, [S.EYE]: 14176282, [S.BEAK]: 13138538, [S.ACCENT]: 9067168 }),
        pal.alloc({ [S.BODY]: 15262940, [S.BODY_D]: 11049610, [S.BODY_L]: 16316144, [S.EYE]: 9058842, [S.BEAK]: 14196880, [S.ACCENT]: 13156528 }),
        pal.alloc({ [S.BODY]: 9071194, [S.BODY_D]: 5914676, [S.BODY_L]: 12098184, [S.EYE]: 14176282, [S.BEAK]: 13138538, [S.ACCENT]: 6986362 })
      ], this.catRows = [1973794, 14715450, 15921126, 9079440].map((c) => pal.alloc({ [S.BODY]: c, [S.BODY_D]: shadeHex2(c, 0.75), [S.BODY_L]: shadeHex2(c, 1.2), [S.EYE]: 9099338 })), this.squirrelRow = pal.alloc({ [S.BODY]: 9078144, [S.BODY_D]: 5920080, [S.BODY_L]: 11183260, [S.EYE]: 1973794 }), this.duckRows = [
        pal.alloc({ [S.BODY]: 9071178, [S.BODY_D]: 5914672, [S.BODY_L]: 11044954, [S.EYE]: 1973794, [S.ACCENT]: 3111498, [S.BEAK]: 15909424, [S.WHITE]: 14216952 }),
        pal.alloc({ [S.BODY]: 15921902, [S.BODY_D]: 13158596, [S.BODY_L]: 16777215, [S.EYE]: 1973794, [S.ACCENT]: 15921902, [S.BEAK]: 15900720, [S.WHITE]: 14216952 })
      ], this.ratRow = pal.alloc({ [S.BODY]: 4867136, [S.BODY_D]: 2762276, [S.BODY_L]: 13146778, [S.EYE]: 1973794 }), this.gooseRow = pal.alloc({ [S.BODY]: 9075306, [S.BODY_D]: 2762276, [S.BODY_L]: 14209220, [S.EYE]: 1973794, [S.BEAK]: 2762276, [S.ACCENT]: 1973794 }), this.dogs = [], this.pigeons = [], this.flocks = [], this.squirrels = [], this.cats = [], this.ducks = [], this.rats = [], this.geese = null, this.gooseTimer = 30, this.planes = [], this.planeTimer = 8, this.planeRows = {
        body: city.pal.alloc({ [S.BODY]: 14212322, [S.BODY_D]: 9080984, [S.BODY_L]: 15922424, [S.EYE]: 2763312, [S.BEAK]: 14212322, [S.ACCENT]: 2777016 }),
        red: city.pal.alloc({ [S.C1]: [16724016, 128] }),
        white: city.pal.alloc({ [S.C1]: [16777215, 128] }),
        green: city.pal.alloc({ [S.C1]: [3211104, 128] })
      }, this.planeFrame = city.atlas.add("plane", 26, 10, (sp) => {
        for (let x = 3; x < 23; x++)
          sp.set(x, 4, S.BODY, x < 7 ? 150 : 136), sp.set(x, 5, S.BODY, 122), sp.set(x, 6, S.BODY_D, 100);
        sp.set(23, 5, S.BODY_L, 150), sp.set(23, 4, S.BODY_L, 140), sp.set(24, 5, S.BODY_L, 128), sp.set(23, 6, S.BODY_D, 110);
        for (let k = 0; k < 4; k++)
          sp.set(3 + k, 3 - k, S.ACCENT, 136), sp.set(4 + k, 3 - k, S.ACCENT, 116);
        sp.set(2, 4, S.ACCENT, 120), sp.set(2, 3, S.ACCENT, 128);
        for (let k = 0; k < 5; k++)
          sp.set(11 + k, 7 + (k >> 1), S.BODY_D, 110), sp.set(12 + k, 7 + (k >> 1), S.BODY_D, 96);
        sp.set(13, 9, S.BODY_D, 90), sp.set(14, 9, S.BODY_D, 90);
        for (let x = 8; x < 22; x += 2) sp.set(x, 4, S.EYE, 128);
        sp.set(21, 4, S.EYE, 140), sp.set(22, 4, S.EYE, 140);
        for (let x = 5; x < 22; x++) sp.set(x, 5, S.ACCENT, 96);
      }), this.initPigeons(), this.initOthers();
    }
    // ---- pigeons ---------------------------------------------------------------
    initPigeons() {
      let W = this.city.world, r = this.rng, spots = [];
      W.parkCenter && spots.push({ x: W.parkCenter.x + 2.4, y: W.parkCenter.y + 1, r: 1.6 });
      for (let c of W.carts) spots.push({ x: c.x + 0.8, y: c.y + 0.6, r: 1 });
      for (let b of W.benches.filter((_, i) => i % 3 === 0).slice(0, 6)) spots.push({ x: b.x + 0.6, y: b.y + 0.6, r: 1 });
      for (let s of W.subways) spots.push({ x: s.x + 0.6, y: s.y, r: 0.9 });
      for (let sp of spots.slice(0, 12)) {
        let flock = { home: sp, members: [], state: "ground", timer: r.range(10, 40), cx: sp.x, cy: sp.y, wheelA: 0, coop: null }, n = r.int(5, 11);
        for (let k = 0; k < n; k++) {
          let pg = { flock, x: sp.x + r.range(-sp.r, sp.r), y: sp.y + r.range(-sp.r, sp.r), z: 0.125, vx: 0, vy: 0, vz: 0, state: "ground", t: r.range(0, 3), tx: 0, ty: 0, tz: 0, flip: r.chance(0.5), row: r.pick(this.pigeonRows), anim: "walk", f: 0 };
          flock.members.push(pg), this.pigeons.push(pg);
        }
        this.flocks.push(flock);
      }
      for (let c of W.pigeonCoops.slice(0, 2)) {
        let flock = { home: { x: c.x, y: c.y, r: 0.8, z: c.z }, members: [], state: "perch", timer: r.range(20, 60), cx: c.x, cy: c.y, coop: c, wheelA: 0 };
        for (let k = 0; k < 14; k++) {
          let pg = { flock, x: c.x + r.range(-0.8, 0.8), y: c.y + r.range(-0.8, 0.8), z: c.z, vx: 0, vy: 0, vz: 0, state: "perched", t: r.range(0, 3), row: r.pick(this.pigeonRows), anim: "walk", f: 0 };
          flock.members.push(pg), this.pigeons.push(pg);
        }
        this.flocks.push(flock);
      }
    }
    takeOff(pg, target) {
      pg.state = "fly", pg.tx = target.x, pg.ty = target.y, pg.tz = target.z, pg.ft = 0, pg.sx = pg.x, pg.sy = pg.y, pg.sz = pg.z, pg.dur = clamp(dist(pg.x, pg.y, target.x, target.y) / 3.2, 0.8, 4.5), pg.arc = this.rng.range(1.5, 4) + Math.abs(target.z - pg.z) * 0.3;
    }
    perchFor(pg) {
      let W = this.city.world, best = null, bd = 900;
      for (let p of W.perches) {
        let d = dist2(p.x, p.y, pg.x, pg.y) * this.rng.range(0.6, 1.4);
        d < bd && d > 4 && (bd = d, best = p);
      }
      return best ? { x: best.x + this.rng.range(-0.15, 0.15), y: best.y + this.rng.range(-0.15, 0.15), z: best.z } : null;
    }
    updatePigeons(dt) {
      let people = this.city.people?.list || [], cars = this.city.traffic.cars, audio = this.city.audio, env = this.city.env;
      for (let fl of this.flocks) {
        fl.timer -= dt;
        let feeder = people.find((p) => p.feeding && p.state === "sit" && dist2(p.x, p.y, fl.home.x, fl.home.y) < 120);
        feeder ? (fl.cx = feeder.x + 0.6, fl.cy = feeder.y + 0.6) : (fl.cx = fl.home.x, fl.cy = fl.home.y), fl.coop ? fl.state === "perch" && fl.timer <= 0 ? (fl.state = "wheel", fl.timer = this.rng.range(14, 24), fl.wheelA = 0, audio?.event("flutter", fl.home)) : fl.state === "wheel" && fl.timer <= 0 && (fl.state = "land", fl.timer = this.rng.range(30, 70)) : fl.state === "ground" && fl.timer <= 0 && env.darkness < 0.6 ? this.rng.chance(0.35) ? (fl.state = "wheel", fl.timer = this.rng.range(6, 12), fl.wheelA = this.rng.range(0, 6), audio?.event("flutter", fl.home)) : fl.timer = this.rng.range(15, 40) : fl.state === "wheel" && fl.timer <= 0 && (fl.state = "land", fl.timer = this.rng.range(25, 60)), fl.state === "wheel" && (fl.wheelA += dt * 0.9);
      }
      for (let pg of this.pigeons) {
        pg.t += dt;
        let fl = pg.flock;
        if (fl.state === "wheel" && pg.state !== "wheel" && (pg.state = "wheel", pg.ph = this.rng.range(0, 6.28), pg.rr = this.rng.range(2.5, 5)), pg.state === "wheel") {
          let hz = (fl.home.z || 0.125) + 7 + Math.sin(fl.wheelA * 0.7 + pg.ph) * 1.5, a = fl.wheelA + pg.ph * 0.15, tx = fl.home.x + Math.cos(a) * pg.rr, ty = fl.home.y + Math.sin(a) * pg.rr * 0.8;
          if (pg.vx = (tx - pg.x) * 2, pg.vy = (ty - pg.y) * 2, pg.x += pg.vx * dt, pg.y += pg.vy * dt, pg.z += (hz - pg.z) * Math.min(1, dt * 1.5), pg.anim = "fly", pg.f = Math.floor(pg.t * 10) % 2, fl.state === "land") {
            let tgt = fl.coop ? { x: fl.home.x + this.rng.range(-0.8, 0.8), y: fl.home.y + this.rng.range(-0.8, 0.8), z: fl.home.z } : { x: fl.cx + this.rng.range(-fl.home.r, fl.home.r), y: fl.cy + this.rng.range(-fl.home.r, fl.home.r), z: 0.125 };
            this.takeOff(pg, tgt);
          }
          continue;
        }
        if (pg.state === "fly") {
          pg.ft += dt;
          let t = clamp(pg.ft / pg.dur, 0, 1), e = t * t * (3 - 2 * t), px = pg.x;
          pg.x = pg.sx + (pg.tx - pg.sx) * e, pg.y = pg.sy + (pg.ty - pg.sy) * e, pg.z = pg.sz + (pg.tz - pg.sz) * e + Math.sin(t * Math.PI) * pg.arc, pg.vx = pg.x - px, pg.anim = "fly", pg.f = Math.floor(pg.t * 12) % 2, t >= 1 && (pg.state = pg.tz > 0.125 + 0.5 ? "perched" : "ground", pg.z = pg.tz, pg.perchT = this.rng.range(6, 25));
          continue;
        }
        if (pg.state === "perched") {
          if (pg.anim = "walk", pg.f = 0, pg.perchT = (pg.perchT ?? 10) - dt, fl.coop) continue;
          pg.perchT <= 0 && this.takeOff(pg, { x: fl.cx + this.rng.range(-fl.home.r, fl.home.r), y: fl.cy + this.rng.range(-fl.home.r, fl.home.r), z: 0.125 });
          continue;
        }
        if (pg.moveT = (pg.moveT ?? 0) - dt, pg.moveT <= 0 && (pg.moveT = this.rng.range(0.6, 2.5), this.rng.chance(0.55) ? (pg.gx = fl.cx + this.rng.range(-fl.home.r, fl.home.r), pg.gy = fl.cy + this.rng.range(-fl.home.r, fl.home.r), pg.mode = "walk") : pg.mode = "peck"), pg.mode === "walk" && pg.gx != null) {
          let d = dist(pg.x, pg.y, pg.gx, pg.gy);
          if (d > 0.05) {
            let s = Math.min(d, 0.45 * dt);
            pg.vx = (pg.gx - pg.x) / d * s, pg.x += pg.vx, pg.y += (pg.gy - pg.y) / d * s, pg.anim = "walk", pg.f = Math.floor(pg.t * 6) % 2;
          } else
            pg.mode = "peck";
        }
        pg.mode === "peck" && (pg.anim = "peck", pg.f = Math.floor(pg.t * 4 + pg.x) % 2);
        let scared = !1;
        for (let p of people) if (p.state === "walk" && dist2(p.x, p.y, pg.x, pg.y) < 0.8) {
          scared = !0;
          break;
        }
        if (!scared) {
          for (let c of cars) if (c.v > 1 && dist2(c.x, c.y, pg.x, pg.y) < 2.2) {
            scared = !0;
            break;
          }
        }
        if (scared) {
          audio?.event("flutter", pg);
          let perch = this.rng.chance(0.4) ? this.perchFor(pg) : null;
          this.takeOff(pg, perch || { x: fl.cx + this.rng.range(-fl.home.r * 1.5, fl.home.r * 1.5), y: fl.cy + this.rng.range(-fl.home.r * 1.5, fl.home.r * 1.5), z: 0.125 });
        } else this.rng.chance(dt * 0.02) && audio?.event("coo", pg);
      }
    }
    // ---- dogs -----------------------------------------------------------------------
    spawnDog(owner) {
      let r = this.rng, breed = r.pick(Object.keys(DOG_BREEDS)), colors = [9067050, 1973794, 15921126, 13148256, 5917242, 14207144, 10132122, 11561514], c = r.pick(colors), dog = {
        owner,
        breed,
        x: owner.x,
        y: owner.y,
        z: 0.125,
        row: this.city.pal.alloc({ [S.BODY]: c, [S.BODY_D]: shadeHex2(c, 0.72), [S.BODY_L]: shadeHex2(c, 1.25), [S.EYE]: 1973794, [S.NOSE]: 1973794, [S.COLLAR]: r.pick([14168108, 2777016, 15909424, 3115590]) }),
        mode: "follow",
        t: r.range(0, 5),
        dist: 0,
        anim: "walk",
        flip: !1,
        sniffing: !1,
        sniffT: 0,
        nextSniff: r.range(4, 12),
        gone: !1,
        name: owner.dogName
      };
      return owner.dog = dog, this.dogs.push(dog), dog;
    }
    followOwner(dog, p, dt) {
      if (dog.mode === "play") return;
      dog.t += dt;
      let ang = Math.atan2(p.dy, p.dx), tx = p.x + Math.cos(ang) * 0.55 - Math.sin(ang) * 0.3, ty = p.y + Math.sin(ang) * 0.55 + Math.cos(ang) * 0.3;
      if (dog.sniffing) {
        dog.sniffT -= dt, dog.anim = "sniff", dog.sniffT <= 0 && (dog.sniffing = !1, dog.nextSniff = this.rng.range(5, 14));
        return;
      }
      if (p.state === "walk" && (dog.nextSniff -= dt, dog.nextSniff <= 0)) {
        dog.sniffing = !0, dog.sniffT = this.rng.range(1.2, 2.5), this.rng.chance(0.25) && this.city.audio?.event("bark", dog);
        return;
      }
      let d = dist(dog.x, dog.y, tx, ty);
      if (d > 0.05) {
        let s = Math.min(d, Math.max(p.speed * 1.1, d * 3) * dt);
        dog.dx = tx - dog.x, dog.dy = ty - dog.y, dog.x += (tx - dog.x) / d * s, dog.y += (ty - dog.y) / d * s, dog.dist += s, dog.anim = s / dt > 1.5 ? "run" : "walk";
      } else dog.anim = p.state === "sit" || p.state === "idle" || dog.anim === "sit" ? "sit" : "walk";
      p.state !== "walk" && d < 0.1 && (dog.anim = "sit"), dog.z = p.z;
    }
    updateDogs(dt) {
      for (let i = this.dogs.length - 1; i >= 0; i--) {
        let d = this.dogs[i];
        if (d.gone || d.owner.dead) {
          this.city.pal.release(d.row), this.dogs.splice(i, 1);
          continue;
        }
        if (d.mode === "play" && d.area) {
          let a = d.area;
          d.t += dt, d.pt = (d.pt ?? 0) - dt, (d.pt <= 0 || d.px == null) && (d.pt = this.rng.range(0.8, 2.5), d.px = this.rng.range(a.x0 + 0.4, a.x1 - 0.4), d.py = this.rng.range(a.y0 + 0.4, a.y1 - 0.4), this.rng.chance(0.1) && this.city.audio?.event("bark", d));
          let dd = dist(d.x, d.y, d.px, d.py);
          if (dd > 0.08) {
            let s = Math.min(dd, 2.6 * dt);
            d.dx = d.px - d.x, d.dy = d.py - d.y, d.x += (d.px - d.x) / dd * s, d.y += (d.py - d.y) / dd * s, d.dist += s, d.anim = "run";
          } else d.anim = "sit";
          d.z = 0.125;
        }
      }
    }
    // ---- others ---------------------------------------------------------------------
    initOthers() {
      let W = this.city.world, r = this.rng;
      if (W.lawns) for (let k = 0; k < 7; k++) {
        let l = r.pick(W.lawns);
        this.squirrels.push({ x: r.range(l.x0, l.x1), y: r.range(l.y0, l.y1), z: 0.125, area: l, t: r.range(0, 5), state: "stand", tx: 0, ty: 0, flip: !1 });
      }
      let shops = W.shops.filter((s) => s.kind === "bodega");
      for (let s of shops.slice(0, 4)) this.cats.push({ x: s.x - s.n[0] * 0.6, y: s.y - s.n[1] * 0.6, z: 0.125, row: r.pick(this.catRows), state: "sit", t: r.range(0, 5), home: s });
      for (let s of W.stoopSeats.filter((_, i) => i % 9 === 4).slice(0, 4)) this.cats.push({ x: s.x, y: s.y, z: s.z, row: r.pick(this.catRows), state: "sit", t: r.range(0, 5), stoop: !0 });
      if (W.pond) for (let k = 0; k < 5; k++) this.ducks.push({ a: r.range(0, 6.28), rad: r.range(0.2, 0.8), v: r.range(0.08, 0.2) * (r.chance(0.5) ? 1 : -1), row: r.pick(this.duckRows), t: r.range(0, 4) });
      for (let t of W.trash.slice(0, 10)) this.rats.push({ x: t.x, y: t.y, z: 0.125, home: t, t: r.range(0, 10), state: "hide", tx: t.x, ty: t.y });
    }
    updateOthers(dt) {
      let env = this.city.env, people = this.city.people?.list || [];
      for (let s of this.squirrels) {
        if (s.t += dt, env.season === 3 && env.snowCover > 0.5) continue;
        let near = people.some((p) => dist2(p.x, p.y, s.x, s.y) < 1.2);
        if (s.state === "stand") {
          if (near || this.rng.chance(dt * 0.4)) {
            s.state = "run";
            let a = s.area;
            s.tx = clamp(s.x + this.rng.range(-3, 3), a.x0, a.x1), s.ty = clamp(s.y + this.rng.range(-3, 3), a.y0, a.y1);
          }
        } else {
          let d = dist(s.x, s.y, s.tx, s.ty);
          if (d < 0.05) s.state = "stand";
          else {
            let k = Math.min(d, 2.4 * dt);
            s.dx = s.tx - s.x, s.dy = s.ty - s.y, s.x += (s.tx - s.x) / d * k, s.y += (s.ty - s.y) / d * k;
          }
        }
      }
      for (let d of this.ducks)
        d.a += d.v * dt, d.t += dt;
      let night = env.hour > 22 || env.hour < 5;
      for (let rt of this.rats) {
        if (rt.t += dt, !night) {
          rt.state = "hide";
          continue;
        }
        if (rt.state === "hide" && this.rng.chance(dt * 0.08)) {
          rt.state = "run";
          let a = this.rng.range(0, 6.28);
          rt.tx = rt.home.x + Math.cos(a) * 1.5, rt.ty = rt.home.y + Math.sin(a) * 1.5;
        }
        if (rt.state === "run") {
          let d = dist(rt.x, rt.y, rt.tx, rt.ty);
          if (d < 0.05)
            rt.state = this.rng.chance(0.5) ? "hide" : "run", rt.x = rt.state === "hide" ? rt.home.x : rt.x, rt.y = rt.state === "hide" ? rt.home.y : rt.y, rt.tx = rt.home.x, rt.ty = rt.home.y;
          else {
            let k = Math.min(d, 2.8 * dt);
            rt.dx = rt.tx - rt.x, rt.dy = rt.ty - rt.y, rt.x += (rt.tx - rt.x) / d * k, rt.y += (rt.ty - rt.y) / d * k;
          }
        }
      }
      if (this.gooseTimer -= dt, !this.geese && env.season === 2 && this.gooseTimer <= 0 && env.darkness < 0.5) {
        this.gooseTimer = this.rng.range(60, 140);
        let y0 = this.rng.range(10, 107);
        this.geese = { x: 142, y: y0, z: 42, vx: -3.2, vy: this.rng.range(-0.5, 0.5), t: 0 }, this.city.audio?.event("geese", this.geese);
      }
      if (this.geese) {
        let g = this.geese;
        g.t += dt, g.x += g.vx * dt, g.y += g.vy * dt, g.x < -30 && (this.geese = null);
      }
      if (this.planeTimer -= dt, this.planeTimer <= 0 && this.planes.length < 2) {
        this.planeTimer = this.rng.range(25, 70);
        let fromW = this.rng.chance(0.5);
        this.planes.push({ x: fromW ? -40 : 157, y: this.rng.range(0, 117), z: this.rng.range(70, 90), vx: fromW ? 7 : -7, vy: this.rng.range(-1.5, 1.5), t: 0 });
      }
      for (let i = this.planes.length - 1; i >= 0; i--) {
        let p = this.planes[i];
        p.t += dt, p.x += p.vx * dt, p.y += p.vy * dt, (p.x < -60 || p.x > 177) && this.planes.splice(i, 1);
      }
    }
    update(dt) {
      this.updatePigeons(dt), this.updateDogs(dt), this.updateOthers(dt);
    }
    dirFlip(dx, dy) {
      return this.city.camera.screenDir(dx || 0, dy || 0)[0] < 0;
    }
    emit(L, view) {
      let env = this.city.env;
      for (let pg of this.pigeons) {
        if (!view.visible(pg.x, pg.y, pg.z, 1)) continue;
        let arr = this.f.pigeon[pg.anim] || this.f.pigeon.walk;
        (Math.abs(pg.vx || 0) > 5e-4 || pg.state === "fly") && (pg.flip = this.dirFlip(pg.vx || 0.01, pg.vy || 0)), L.push(pg.x, pg.y, pg.z, arr[pg.f % arr.length], pg.row, pg.flip ? SF.FLIP : 0, 1, 2e-3);
      }
      for (let d of this.dogs) {
        if (!view.visible(d.x, d.y, d.z, 1)) continue;
        let fr = this.dogFrames[d.breed], arr = fr[d.anim] || fr.walk;
        (d.anim === "walk" || d.anim === "run") && (d.flip = this.dirFlip(d.dx, d.dy));
        let fi = d.anim === "walk" ? Math.floor(d.dist / 0.12) % arr.length : d.anim === "run" ? Math.floor(d.dist / 0.15) % arr.length : Math.floor(d.t * 2) % arr.length;
        L.push(d.x, d.y, d.z, arr[fi], d.row, d.flip ? SF.FLIP : 0, d.owner.alpha ?? 1, 2e-3);
      }
      for (let s of this.squirrels) {
        if (env.season === 3 && env.snowCover > 0.5 || !view.visible(s.x, s.y, s.z, 1)) continue;
        let arr = s.state === "run" ? this.f.squirrel.run : this.f.squirrel.stand;
        s.state === "run" && (s.flip = this.dirFlip(s.dx, s.dy)), L.push(s.x, s.y, s.z, arr[Math.floor(s.t * 8) % arr.length], this.squirrelRow, s.flip ? SF.FLIP : 0);
      }
      for (let c of this.cats)
        view.visible(c.x, c.y, c.z, 1) && (L.push(c.x, c.y, c.z, this.f.cat.sit[Math.floor(c.t * 0.7) % 2], c.row, 0), c.t += 0.016);
      let pond = this.city.world.pond;
      if (pond && env.season !== 3) for (let d of this.ducks) {
        let x = pond.x + Math.cos(d.a) * pond.rx * d.rad, y = pond.y + Math.sin(d.a) * pond.ry * d.rad;
        if (!view.visible(x, y, 0.125, 1)) continue;
        let flip = this.dirFlip(-Math.sin(d.a) * d.v, Math.cos(d.a) * d.v);
        L.push(x, y, 0.125 - 0.05, this.f.duck.swim[Math.floor(d.t * 2) % 2], d.row, flip ? SF.FLIP : 0);
      }
      for (let rt of this.rats)
        rt.state === "hide" || !view.visible(rt.x, rt.y, 0.125, 1) || L.push(rt.x, rt.y, 0.125, this.f.rat.run[Math.floor(rt.t * 10) % 2], this.ratRow, this.dirFlip(rt.dx, rt.dy) ? SF.FLIP : 0);
      for (let p of this.planes) {
        let flip = this.dirFlip(p.vx, p.vy);
        env.darkness < 0.6 && L.push(p.x, p.y, p.z, this.planeFrame, this.planeRows.body, (flip ? SF.FLIP : 0) | SF.NOSHADOW | SF.NOSHADE), Math.floor(p.t * 1.6) % 2 === 0 && L.push(p.x, p.y, p.z + 0.1, this.city.atlas.get("dot2"), this.planeRows.red, SF.EMISSIVE | SF.NOSHADOW, 1, 0), env.darkness > 0.4 && Math.floor(p.t * 1.6 + 0.5) % 2 === 0 && L.push(p.x - p.vx * 0.12, p.y, p.z + 0.05, this.city.atlas.get("dot"), this.planeRows.white, SF.EMISSIVE | SF.NOSHADOW, 1, 0);
      }
      if (this.geese) {
        let g = this.geese, offs = [[0, 0], [1.2, -0.9], [2.4, -1.8], [3.6, -2.7], [1.2, 0.9], [2.4, 1.8], [3.6, 2.7], [4.8, 3.6]];
        for (let [ox, oy] of offs) {
          let f = this.f.pigeon.fly[Math.floor(g.t * 5 + ox) % 2];
          L.push(g.x + ox, g.y + oy, g.z, f, this.gooseRow, this.dirFlip(g.vx, g.vy) ? SF.FLIP : 0, 1, 0);
        }
      }
    }
  };
  function shadeHex2(c, f) {
    let r = clamp(Math.round((c >> 16 & 255) * f), 0, 255), g = clamp(Math.round((c >> 8 & 255) * f), 0, 255), b = clamp(Math.round((c & 255) * f), 0, 255);
    return r << 16 | g << 8 | b;
  }

  // src/sim/particles.js
  var MAXP = 4200, Particles = class {
    constructor(city) {
      this.city = city, this.rng = new RNG(1234);
      let A = city.atlas;
      this.fr = { puff: [A.get("puff1"), A.get("puff2"), A.get("puff3"), A.get("puff4")], dot: A.get("dot"), dot2: A.get("dot2"), flake: A.get("flake"), leaf: A.get("leaf"), glow: A.get("glow") }, this.fr.rain = A.add("rain", 1, 14, (sp) => {
        for (let y = 0; y < 14; y++) sp.set(0, y, S.C2, 76 + y * 7);
      }, 0, 13), this.fr.splash = A.add("splash", 5, 3, (sp) => {
        sp.set(0, 0, S.C2, 120), sp.set(4, 0, S.C2, 120), sp.set(1, 1, S.C2, 136), sp.set(3, 1, S.C2, 136), sp.set(2, 2, S.C2, 150), sp.set(1, 2, S.C2, 120), sp.set(3, 2, S.C2, 120);
      }, 2, 2);
      let pal = city.pal;
      this.row = pal.alloc({ [S.C1]: 15790838, [S.C2]: 13690104, [S.C3]: 16777215, [S.C4]: 14711328, [S.C5]: 13123626, [S.C6]: 15777840, [S.C7]: 16759e3, [S.C8]: 14217471, [S.C9]: 10132122 }), this.fwRows = [16728128, 4259712, 5275903, 16764992, 16740576, 16777215, 16748592, 6353151].map((c) => pal.alloc({ [S.C1]: [c, 128] })), this.flyRow = pal.alloc({ [S.C1]: [14221152, 128] }), this.p = [], this.emitters = [], this.rain = [], this.fireworkTimer = 3, this.flashes = [], this.fireflies = [], this.steamAcc = /* @__PURE__ */ new Map();
    }
    add(o) {
      return this.p.length >= MAXP ? null : (this.p.push(o), o);
    }
    puff(x, y, z, n, color) {
      for (let i = 0; i < n; i++) {
        let a = this.rng.range(0, 6.28), s = this.rng.range(0.3, 1.2);
        this.add({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: this.rng.range(0.5, 1.6), g: 4, life: 0.5, max: 0.5, f: this.fr.dot2, row: this.row, slot: 0, kind: "spark" });
      }
    }
    addEmitter(kind, data) {
      this.emitters = this.emitters.filter((e) => e.kind !== kind), this.emitters.push({ kind, data, acc: 0 });
    }
    // random point currently on screen at height z
    screenPoint(view, z) {
      let cam = this.city.camera, sx = view.tsx + this.rng.range(-view.bw / 2, view.bw / 2), sy = view.tsy + this.rng.range(-view.bh / 2 - 40, view.bh / 2), a = sx / 32, b = (sy + z * 32) / (32 / 2), xr = (a + b) / 2, yr = (b - a) / 2, c = Math.cos(cam.angle), s = Math.sin(cam.angle);
      return [117 / 2 + c * xr + s * yr, 117 / 2 - s * xr + c * yr];
    }
    groundZ(x, y) {
      let W = this.city.world, ix = Math.floor(x), iy = Math.floor(y);
      return ix < 0 || iy < 0 || ix >= 117 || iy >= 117 ? -99 : Math.max(W.heights[iy * 117 + ix], 0);
    }
    update(dt) {
      let env = this.city.env, view = this.city.view, r = this.rng, wind = env.wind, wx = Math.cos(env.windDir) * wind * 0.8, wy = Math.sin(env.windDir) * wind * 0.8;
      if (!view || !view.bw) return;
      let want = env.precip > 0.05 ? Math.floor((env.snowing ? 1400 : 1700) * env.precip * Math.min(1.6, view.bw * view.bh / 6e5)) : 0;
      for (; this.rain.length < want; ) {
        let z = r.range(0, 26), [x, y] = this.screenPoint(view, z);
        this.rain.push({ x, y, z, snow: env.snowing, ph: r.range(0, 6.28), sp: env.snowing ? r.range(0.7, 1.3) : r.range(9, 13) });
      }
      this.rain.length > want && (this.rain.length = want);
      for (let d of this.rain) {
        d.snow ? (d.ph += dt * 1.5, d.x += (wx * 0.8 + Math.sin(d.ph) * 0.35) * dt, d.y += (wy * 0.8 + Math.cos(d.ph * 0.7) * 0.2) * dt, d.z -= d.sp * dt) : (d.x += wx * 2.2 * dt, d.y += wy * 2.2 * dt, d.z -= d.sp * dt);
        let gz = this.groundZ(d.x, d.y);
        if (d.z <= gz || !view.visible(d.x, d.y, d.z, 3)) {
          !d.snow && d.z <= gz && gz > -50 && r.chance(0.5) && this.add({ x: d.x, y: d.y, z: gz + 0.02, vx: 0, vy: 0, vz: 0, g: 0, life: 0.18, max: 0.18, f: this.fr.splash, row: this.row, kind: "splash" });
          let z = r.range(14, 26), [x, y] = this.screenPoint(view, z);
          d.x = x, d.y = y, d.z = z, d.snow = env.snowing;
        }
      }
      let W = this.city.world, cold = env.season === 3 ? 1.8 : env.season === 2 || env.season === 0 ? 1.15 : 0.75;
      for (let i = 0; i < W.steam.length; i++) {
        let s = W.steam[i];
        if (!view.visible(s.x, s.y, s.z, 4)) continue;
        let rate = s.rate * cold;
        if (s.kind === "chimney" && (rate = env.season === 3 ? 0.5 : env.season === 2 ? 0.15 : 0), s.kind === "roof" && (rate *= env.season === 3 ? 1.6 : 0.5), s.kind === "manhole" && (rate *= 0.5 + 0.5 * Math.sin(this.city.time * 0.4 + i * 1.7)), rate <= 0) continue;
        let acc = (this.steamAcc.get(i) || 0) + dt * rate * 6;
        for (; acc > 1; ) {
          acc -= 1;
          let big = s.kind === "stack" || s.kind === "manhole";
          this.add({
            x: s.x + r.range(-0.1, 0.1),
            y: s.y + r.range(-0.1, 0.1),
            z: s.z,
            vx: wx * 0.6 + r.range(-0.12, 0.12),
            vy: wy * 0.6 + r.range(-0.12, 0.12),
            vz: big ? r.range(0.7, 1.2) : r.range(0.35, 0.6),
            g: -0.05,
            life: big ? r.range(2.5, 4) : r.range(1.5, 2.6),
            max: 0,
            kind: "steam",
            grow: big ? 4 : 2,
            row: this.row
          });
          let q = this.p[this.p.length - 1];
          q && (q.max = q.life);
        }
        this.steamAcc.set(i, acc);
      }
      for (let c of W.carts) view.visible(c.x, c.y, 1, 3) && r.chance(dt * 2) && this.add({ x: c.x, y: c.y, z: 0.125 + 1.2, vx: wx * 0.3, vy: wy * 0.3, vz: 0.4, g: 0, life: 1.6, max: 1.6, kind: "steam", grow: 2, row: this.row });
      if (env.season === 3) for (let c of this.city.traffic.cars) {
        if (c.state === "parked" || !r.chance(dt * 1.5) || !view.visible(c.x, c.y, 0, 2)) continue;
        let bx = c.x - Math.cos(c.h) * (c.len / 2 + 0.1), by = c.y - Math.sin(c.h) * (c.len / 2 + 0.1);
        this.add({ x: bx, y: by, z: 0.15, vx: -Math.cos(c.h) * 0.3, vy: -Math.sin(c.h) * 0.3, vz: 0.3, g: 0, life: 1.2, max: 1.2, kind: "steam", grow: 2, row: this.row });
      }
      if (env.season === 3 && this.city.camera.scale / (window.devicePixelRatio || 1) >= 2.5)
        for (let p of this.city.people.list) {
          if (p.alpha < 1 || !r.chance(dt * 0.6) || !view.visible(p.x, p.y, p.z, 0)) continue;
          let d = this.city.camera.screenDir(p.dx || 0, p.dy || 1), fx = p.flip ? -1 : 1;
          this.add({ x: p.x + fx * 0.05, y: p.y, z: p.z + (p.kid ? 0.7 : 0.85), vx: wx * 0.3, vy: wy * 0.3, vz: 0.15, g: 0, life: 0.9, max: 0.9, kind: "steam", grow: 1, row: this.row });
        }
      if ((env.season === 2 || env.season === 0) && W.trees.length) {
        let n = env.season === 2 ? 3 + wind * 6 : 1.5;
        for (let k = 0; k < n * dt * 10; k++) {
          if (!r.chance(0.1)) continue;
          let t = W.trees[r.int(0, W.trees.length - 1)];
          env.season === 0 && t.species !== "cherry" || view.visible(t.x, t.y, 3, 2) && this.add({ x: t.x + r.range(-1.2, 1.2), y: t.y + r.range(-1.2, 1.2), z: r.range(2, 3.5), vx: wx + r.range(-0.3, 0.3), vy: wy + r.range(-0.3, 0.3), vz: -r.range(0.4, 0.7), g: 0, life: 6, max: 6, kind: "leaf", f: this.fr.leaf, row: this.row, slot: env.season === 0 ? S.C7 : r.pick([S.C4, S.C5, S.C6]), ph: r.range(0, 6) });
        }
      }
      for (let e of this.emitters)
        if (e.kind === "hydrant") {
          let h = e.data;
          if (!this.city.activities || this.city.activities.hydrantOpen?.h !== h) continue;
          for (e.acc += dt * 70; e.acc > 1; ) {
            e.acc -= 1;
            let sp = r.range(2.2, 3.6);
            this.add({ x: h.x + h.nx * 0.25, y: h.y + h.ny * 0.25, z: 0.125 + 0.28, vx: h.nx * sp + h.ux * r.range(-0.6, 0.6), vy: h.ny * sp + h.uy * r.range(-0.6, 0.6), vz: r.range(1.2, 2.4), g: 5, life: 1.2, max: 1.2, kind: "water", f: r.chance(0.5) ? this.fr.dot : this.fr.dot2, row: this.row, slot: S.C8 });
          }
        }
      if (env.season !== 3 && env.hour >= 7 && env.hour < 23) for (let f of W.fountains) {
        if (!view.visible(f.x, f.y, f.z, 3)) continue;
        let n = f.kind === "center" ? 26 : 10;
        for (let k = 0; k < n * dt * 3; k++)
          if (f.kind === "center") {
            let a = r.range(0, 6.28), s = r.range(0.2, 0.55);
            this.add({ x: f.x, y: f.y, z: f.z + 0.1, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: r.range(2.2, 3), g: 5, life: 1.2, max: 1.2, kind: "water", f: this.fr.dot, row: this.row, slot: S.C8, floor: f.z - 0.5 });
          } else {
            let ox = r.range(-f.w / 2 + 0.4, f.w / 2 - 0.4), oy = r.range(-f.d / 2 + 0.4, f.d / 2 - 0.4);
            this.add({ x: f.x + ox, y: f.y + oy, z: f.z, vx: 0, vy: 0, vz: r.range(1.4, 2), g: 5, life: 0.8, max: 0.8, kind: "water", f: this.fr.dot, row: this.row, slot: S.C8, floor: f.z });
          }
      }
      if (env.season === 1 && env.hour > 10 && env.hour < 19) {
        for (let s of W.sprinklers)
          if (view.visible(s.x, s.y, 1, 3))
            for (let k = 0; k < 12 * dt * 3; k++) {
              let a = r.range(0, 6.28), sp = r.range(0.3, 1);
              this.add({ x: s.x, y: s.y, z: 0.125 + 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: r.range(1.8, 2.6), g: 5, life: 1, max: 1, kind: "water", f: this.fr.dot, row: this.row, slot: S.C8, floor: 0.125 });
            }
      }
      if (this.fireworkTimer -= dt, (env.season === 1 && (env.hour > 21 || env.hour < 0.5) && env.precip < 0.2 || this.forceFireworks > 0) && this.fireworkTimer <= 0) {
        this.fireworkTimer = r.range(0.6, 2.4), this.forceFireworks > 0 && this.forceFireworks--;
        let c = W.parkCenter || { x: 117 / 2, y: 117 / 2 };
        this.add({ x: c.x + r.range(-4, 4), y: c.y + r.range(-4, 4), z: 0.125 + 1, vx: r.range(-0.4, 0.4), vy: r.range(-0.4, 0.4), vz: r.range(9.5, 12), g: 4, life: r.range(1.8, 2.4), max: 2, kind: "rocket", f: this.fr.dot2, row: this.fwRows[5] }), this.city.audio?.event("launch", c);
      }
      let ffOn = env.season === 1 && env.hour > 20 && env.hour < 23.5 && !env.raining;
      if (ffOn && this.fireflies.length < 40 && W.lawns) {
        let l = r.pick(W.lawns);
        this.fireflies.push({ x: r.range(l.x0, l.x1), y: r.range(l.y0, l.y1), z: r.range(0.4, 1.8), ph: r.range(0, 6), sp: r.range(0.6, 1.4) });
      }
      ffOn || (this.fireflies.length = 0);
      for (let f of this.fireflies)
        f.ph += dt * f.sp, f.x += Math.sin(f.ph * 0.7) * 0.25 * dt, f.y += Math.cos(f.ph * 0.5) * 0.25 * dt, f.z += Math.sin(f.ph) * 0.1 * dt;
      for (let i = this.p.length - 1; i >= 0; i--) {
        let q = this.p[i];
        if (q.life -= dt, q.kind === "leaf")
          q.ph += dt * 3, q.x += (q.vx + Math.sin(q.ph) * 0.4) * dt, q.y += (q.vy + Math.cos(q.ph * 0.8) * 0.3) * dt, q.z += q.vz * dt, q.z <= this.groundZ(q.x, q.y) + 0.02 && (q.vz = 0, q.vx = 0, q.vy = 0, q.life = Math.min(q.life, 1.5));
        else {
          if (q.vz -= (q.g || 0) * dt, q.x += q.vx * dt, q.y += q.vy * dt, q.z += q.vz * dt, q.kind === "water") {
            let fl = q.floor ?? 0.125;
            q.z < fl && (q.life = 0, r.chance(0.15) && this.add({ x: q.x, y: q.y, z: fl + 0.02, vx: 0, vy: 0, vz: 0, g: 0, life: 0.15, max: 0.15, f: this.fr.splash, row: this.row, kind: "splash" }));
          }
          q.kind === "spark" && (q.vx *= 0.97, q.vy *= 0.97, q.vz *= 0.97);
        }
        q.kind === "rocket" && (r.chance(0.6) && this.add({ x: q.x, y: q.y, z: q.z, vx: 0, vy: 0, vz: -0.5, g: 0, life: 0.35, max: 0.35, kind: "spark", f: this.fr.dot, row: this.fwRows[3] }), (q.vz < 2 || q.life <= 0) && (q.life = 0, this.burst(q.x, q.y, q.z))), q.life <= 0 && this.p.splice(i, 1);
      }
      for (let i = this.flashes.length - 1; i >= 0; i--)
        this.flashes[i].k -= dt * 2.2, this.flashes[i].k <= 0 && this.flashes.splice(i, 1);
    }
    burst(x, y, z) {
      let r = this.rng, rowA = r.pick(this.fwRows), rowB = r.chance(0.4) ? r.pick(this.fwRows) : rowA, n = r.int(50, 90), kind = r.int(0, 2);
      for (let i = 0; i < n; i++) {
        let a = r.range(0, 6.28), b = Math.acos(r.range(-1, 1)), s = kind === 1 ? 3.6 : r.range(2, 4);
        this.add({ x, y, z, vx: Math.cos(a) * Math.sin(b) * s, vy: Math.sin(a) * Math.sin(b) * s, vz: Math.cos(b) * s * 0.8 + 0.5, g: 1.6, life: r.range(1.1, 1.9), max: 1.9, kind: "spark", f: r.chance(0.3) ? this.fr.dot2 : this.fr.dot, row: i % 2 ? rowA : rowB });
      }
      let colors = { 0: [1, 0.3, 0.3] };
      this.flashes.push({ x, y, k: 1.2, color: colors[0] && [r.range(0.6, 1), r.range(0.4, 1), r.range(0.4, 1)] }), this.city.audio?.event("boom", { x, y, z });
    }
    emit(L, view) {
      let env = this.city.env, pf = this.fr.puff;
      for (let q of this.p) {
        if (!view.visible(q.x, q.y, q.z, 2)) continue;
        let t = q.max ? q.life / q.max : 1;
        if (q.kind === "steam") {
          let age = 1 - t, si = Math.min(pf.length - 1, Math.floor(age * q.grow));
          L.push(q.x, q.y, q.z, pf[si], q.row, SF.NOSHADOW | SF.BRIGHT, Math.min(1, t * 2.6), 1e-3);
        } else q.kind === "spark" || q.kind === "rocket" ? L.push(q.x, q.y, q.z, q.f || this.fr.dot, q.row, SF.EMISSIVE | SF.NOSHADOW, Math.min(1, t * 1.6), 1e-3) : q.kind === "leaf" || q.kind === "water" ? L.push(q.x, q.y, q.z, q.f, this.slotRow(q.slot), SF.NOSHADOW, q.kind === "leaf" ? Math.min(1, q.life) : 1, 1e-3) : L.push(q.x, q.y, q.z, q.f, q.row, SF.NOSHADOW, t, 1e-3);
      }
      for (let d of this.rain)
        d.snow ? L.push(d.x, d.y, d.z, d.sp > 1.1 ? this.fr.flake : this.fr.dot2, this.slotRow(S.C3), SF.NOSHADOW | SF.BRIGHT, 1, 0) : L.push(d.x, d.y, d.z, this.fr.rain, this.row, SF.NOSHADOW | SF.BRIGHT, 0.9, 0);
      for (let f of this.fireflies)
        Math.sin(f.ph * 2.3) + Math.sin(f.ph * 1.1) < 0.6 || view.visible(f.x, f.y, f.z, 1) && L.push(f.x, f.y, f.z, this.fr.dot, this.flyRow, SF.EMISSIVE | SF.NOSHADOW, 1, 0);
    }
    // palette rows that map C1 to another slot colour (for single-slot sprites)
    slotRow(slot) {
      if (this._slotRows || (this._slotRows = {}), this._slotRows[slot] == null) {
        let colors = { [S.C2]: 12112104, [S.C3]: 16777215, [S.C4]: 14711328, [S.C5]: 13123626, [S.C6]: 15777840, [S.C7]: 16759e3, [S.C8]: 14217471 };
        this._slotRows[slot] = this.city.pal.alloc({ [S.C1]: colors[slot] ?? 16777215, [S.C2]: colors[slot] ?? 16777215 });
      }
      return this._slotRows[slot];
    }
    lights(LL, env) {
      for (let f of this.flashes) LL.add(f.x, f.y, 14, f.color, f.k * 0.8);
      for (let q of this.p) q.kind === "rocket" && LL.add(q.x, q.y, 1.2, [1, 0.8, 0.5], 0.5);
    }
  };

  // src/sim/subway.js
  var CAR_LEN = 3.25, GAP = 0.15, NCARS = 5, OFF = 0.9, Subway = class {
    constructor(city) {
      this.city = city, this.rng = new RNG(23);
      let c = OFF, r = 0.9, M = 117, pts = [], arc = (cx, cy, a0, a1) => {
        for (let k = 0; k <= 6; k++) {
          let a = a0 + (a1 - a0) * k / 6;
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
      };
      arc(c + r, c + r, Math.PI, Math.PI * 1.5), arc(M - c - r, c + r, -Math.PI / 2, 0), arc(M - c - r, M - c - r, 0, Math.PI / 2), arc(c + r, M - c - r, Math.PI / 2, Math.PI), pts.push(pts[0]), this.pts = pts, this.cum = [0];
      for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      this.len = this.cum[this.cum.length - 1], this.z = TUNNEL.z0 + 0.02, this.stopS = this.sAt(TUNNEL.station[0] + 1.8, M - c), this.trains = [0, 1].map((k) => ({ s: (this.stopS + 30 + k * this.len / 2) % this.len, v: 5, dwell: 0, served: !1, cars: [] }));
      for (let t of this.trains)
        for (let k = 0; k < NCARS; k++) {
          let car = { type: "subway", x: 0, y: 0, z: this.z, h: 0, len: CAR_LEN, state: "drive", lights: !0, brake: !1, palRow: -1, special: "subway" };
          city.carLayer.assignPalette(car), t.cars.push(car);
        }
      this.cars = this.trains.flatMap((t) => t.cars), this.waiting = [], this.leaving = [], this.spawnT = 2;
    }
    sAt(x, y) {
      let best = 0, bd = 1 / 0;
      for (let i = 1; i < this.pts.length; i++) {
        let a = this.pts[i - 1], b = this.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L2, 0, 1), px = a[0] + dx * t, py = a[1] + dy * t, d = Math.hypot(px - x, py - y);
        d < bd && (bd = d, best = this.cum[i - 1] + Math.sqrt(L2) * t);
      }
      return best;
    }
    at(s) {
      s = (s % this.len + this.len) % this.len;
      let i = 1;
      for (; i < this.cum.length - 1 && this.cum[i] < s; ) i++;
      let a = this.pts[i - 1], b = this.pts[i], seg = this.cum[i] - this.cum[i - 1] || 1, t = (s - this.cum[i - 1]) / seg;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
    }
    ahead(a, b) {
      return ((b - a) % this.len + this.len) % this.len;
    }
    update(dt) {
      let audio = this.city.audio;
      for (let i = 0; i < this.trains.length; i++) {
        let t = this.trains[i], other = this.trains[(i + 1) % this.trains.length];
        if (t.dwell > 0)
          t.dwell -= dt, t.v = 0, t.dwell < 4 && this.waiting.length && this.rng.chance(dt * 3) && this.board(), t.dwell <= 0 && (t.served = !0, audio?.event("trainGo", this.at(t.s)));
        else {
          let toStop = this.ahead(t.s, this.stopS), gap = this.ahead(t.s, other.s) - (CAR_LEN + GAP) * NCARS - 4, vT = 6.5;
          (!t.served || toStop < this.len / 2) && toStop < 22 && (vT = Math.max(0.6, Math.sqrt(2 * 1.6 * toStop))), gap < 12 && (vT = Math.min(vT, Math.max(0, gap * 0.4))), t.v += clamp(vT - t.v, -3.2 * dt, 1.6 * dt), toStop < 0.15 && !t.served && (t.dwell = 7, t.v = 0, audio?.event("trainStop", this.at(t.s)), this.alight()), toStop > 30 && toStop < this.len - 30 && (t.served = !1), t.s = (t.s + t.v * dt) % this.len, t.brake = vT < t.v - 0.2, t.v > 3 && this.rng.chance(dt * 0.6) && audio?.event("train", this.at(t.s));
        }
        t.cars.forEach((car, k) => {
          let [x, y, h] = this.at(t.s - k * (CAR_LEN + GAP));
          car.x = x, car.y = y, car.h = h, car.v = t.v, car.brake = t.brake && k === 0;
        });
      }
      this.spawnT -= dt, this.spawnT <= 0 && this.waiting.length < 7 && (this.spawnT = this.rng.range(2.5, 7), this.waiting.push(this.makePassenger(this.rng.range(TUNNEL.station[0] + 1, TUNNEL.station[1] - 1), 0)));
      for (let p of this.waiting)
        p.alpha = Math.min(1, p.alpha + dt * 1.5), p.t += dt;
      for (let i = this.leaving.length - 1; i >= 0; i--) {
        let p = this.leaving[i];
        p.t += dt, p.boarding ? p.alpha -= dt * 2 : (p.x -= dt * 0.9, p.dist += dt * 0.9, p.x < TUNNEL.station[0] + 0.6 && (p.alpha -= dt * 2.5)), p.alpha <= 0 && (this.city.pal.release(p.pal), this.leaving.splice(i, 1));
      }
    }
    makePassenger(x, alpha) {
      let P = this.city.people, role = this.rng.pick(["resident", "worker", "tourist", "resident"]), p = P.create(role);
      return p.x = x, p.y = 117 - TUNNEL.depth + 0.42, p.z = TUNNEL.z0 + 0.5, p.alpha = alpha, p.t = this.rng.range(0, 3), p.front = !0, p.flip = this.rng.chance(0.5), p;
    }
    board() {
      let p = this.waiting.shift();
      p && (p.boarding = !0, this.leaving.push(p));
    }
    alight() {
      let n = this.rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        let p = this.makePassenger(this.rng.range(TUNNEL.station[0] + 6, TUNNEL.station[1] - 2), 1);
        p.walking = !0, this.leaving.push(p);
      }
    }
    emit(L, view) {
      let cam = this.city.camera, draw = (p, walking) => {
        if (!view.visible(p.x, p.y, p.z, 2)) return;
        let f;
        if (walking) {
          let d = cam.screenDir(-1, 0);
          f = (d[1] >= 0 ? p.frames.front : p.frames.back).walk[Math.floor(p.dist / 0.16) % 4], p.flip = d[0] < 0;
        } else f = p.frames.front.idle[Math.floor(p.t * 1.3) % 2];
        L.push(p.x, p.y, p.z, f, p.pal, (p.flip ? SF.FLIP : 0) | SF.NOSHADE | SF.BRIGHT, clamp(p.alpha, 0, 1), 3e-3);
      };
      for (let p of this.waiting) draw(p, !1);
      for (let p of this.leaving) draw(p, !p.boarding);
    }
    lights(LL) {
    }
  };

  // src/sim/city.js
  var City = class {
    constructor(gl, renderer, world, env, camera) {
      this.gl = gl, this.renderer = renderer, this.world = world, this.env = env, this.camera = camera, this.atlas = new SpriteAtlas(), buildPropSprites(this.atlas), this.pal = new PaletteBank(2048), this.statics = new Statics(this), this.carLayer = new CarLayer(gl, this), this.traffic = new Traffic(this), this.systems = [], this.sprites = new SpriteLayer(gl, this.atlas, this.pal), this.lightLayer = new LightLayer(gl), renderer.addLayer({ light: (ctx) => this.lightLayer.light(ctx) }), renderer.addLayer({
        shadow: (ctx) => {
          this.carLayer.shadow(ctx), this.sprites.shadow(ctx);
        },
        draw: (ctx) => {
          this.carLayer.draw(ctx), this.sprites.draw(ctx);
        }
      }), this.view = { bw: 0, bh: 0, tsx: 0, tsy: 0, visible: () => !0 }, this.time = 0, this.people = new People(this), this.activities = new Activities(this), this.people.activities = this.activities, this.animals = new Animals(this), this.particles = new Particles(this), this.addSystem(this.people), this.addSystem(this.activities), this.addSystem(this.animals), this.addSystem(this.particles), this.subway = new Subway(this), this.addSystem(this.subway), this.traffic.init(), this.people.init();
    }
    addSystem(s) {
      return this.systems.push(s), s;
    }
    update(dt) {
      this.time += dt, this.traffic.update(dt);
      for (let s of this.systems) s.update && s.update(dt);
    }
    computeView(canvasW, canvasH) {
      let cam = this.camera, scale = cam.scale, bw = Math.ceil(canvasW / scale) + 4, bh = Math.ceil(canvasH / scale) + 4, t = cam.project(cam.x, cam.y, 0), v = this.view;
      v.bw = bw, v.bh = bh, v.tsx = t[0], v.tsy = t[1];
      let hw = bw / 2, hh = bh / 2;
      return v.visible = (x, y, z, m = 2) => {
        let p = cam.project(x, y, z), mm = m * 32;
        return Math.abs(p[0] - t[0]) < hw + mm && p[1] - t[1] < hh + mm && t[1] - p[1] < hh + mm * 2;
      }, v;
    }
    prepare(canvasW, canvasH) {
      let view = this.computeView(canvasW, canvasH), env = this.env, L = this.sprites;
      L.begin(), this.statics.emit(L, env, this.camera, this.time, view);
      for (let s of this.systems) s.emit && s.emit(L, view);
      L.end(), this.carLayer.prepare(this.subway ? this.traffic.cars.concat(this.subway.cars) : this.traffic.cars, this.time, env, view);
      let LL = this.lightLayer;
      LL.begin(), this.statics.lights(LL, env, this.time), this.carLayer.lights(LL, this.traffic.cars, env);
      for (let s of this.systems) s.lights && s.lights(LL, env);
      LL.end();
    }
  };

  // src/ui/ui.js
  var WEATHER_ICONS = { clear: "\u2600", cloudy: "\u2601", rain: "\u2602", storm: "\u26A1", snow: "\u2744", fog: "\u224B" }, SPEEDS = [1, 3, 10, 30], UI = class {
    constructor(app) {
      this.app = app, this.root = document.getElementById("ui"), this.build(), this.bindInput(), this.toastT = 0, this.lastSeason = app.env.season, this.lastDay = app.env.day, this.zoomLevels = this.computeZoomLevels(), app.env.onEvent((ev, d) => {
        ev === "season" && this.toast(`${SEASONS[d].icon} ${SEASONS[d].name} has arrived`), ev === "day" && this.toast(`Day ${d + 1} \u2014 ${SEASONS[app.env.season].name}`);
      });
    }
    computeZoomLevels() {
      let dpr = window.devicePixelRatio || 1;
      return [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12].filter((d) => d / dpr >= 0.49 && d / dpr <= 6.01);
    }
    h(tag, cls, html) {
      let e = document.createElement(tag);
      return cls && (e.className = cls), html != null && (e.innerHTML = html), e;
    }
    btn(label, title, fn, cls = "") {
      let b = this.h("button", "btn " + cls, label);
      return b.title = title, b.addEventListener("click", (e) => {
        e.stopPropagation(), fn(b), this.app.audio?.click();
      }), b;
    }
    build() {
      let R2 = this.root;
      R2.innerHTML = "";
      let clock = this.h("div", "panel clock");
      this.timeEl = this.h("div", "time", ""), this.dayEl = this.h("div", "day", ""), this.wxEl = this.h("div", "wx", ""), clock.append(this.timeEl, this.dayEl, this.wxEl), R2.append(clock);
      let title = this.h("div", "title", "PIXEL<span>NYC</span>");
      R2.append(title);
      let tr = this.h("div", "topright");
      this.soundBtn = this.btn("\u266A OFF", "Sound on/off (M)", () => this.toggleSound()), tr.append(this.soundBtn, this.btn("?", "Help (H)", () => this.toggleHelp())), R2.append(tr);
      let bar = this.h("div", "panel toolbar"), g1 = this.h("div", "group");
      this.playBtn = this.btn("\u275A\u275A", "Pause / play (Space)", () => this.togglePause()), this.speedBtn = this.btn("1\xD7", "Time speed (T)", () => this.cycleSpeed()), g1.append(this.playBtn, this.speedBtn);
      let slider = this.h("input", "slider");
      slider.type = "range", slider.min = 0, slider.max = 1439, slider.step = 1, slider.title = "Time of day", slider.addEventListener("input", () => {
        this.app.env.hour = slider.value / 60, this.app.env.compute(0);
      }), slider.addEventListener("pointerdown", (e) => e.stopPropagation()), this.slider = slider, g1.append(slider);
      let g2 = this.h("div", "group");
      this.seasonBtns = SEASONS.map((s, i) => this.btn(s.icon, `${s.name} (${i + 1})`, () => this.setSeason(i), "season")), this.autoSeason = this.btn("AUTO", "Seasons change every day", () => this.setSeason(null), "small"), g2.append(...this.seasonBtns, this.autoSeason);
      let g3 = this.h("div", "group");
      this.wxSel = this.h("select", "sel");
      for (let w of ["auto", "clear", "cloudy", "rain", "storm", "snow", "fog"]) {
        let o = this.h("option", null, w === "auto" ? "WEATHER: AUTO" : w.toUpperCase());
        o.value = w, this.wxSel.append(o);
      }
      this.wxSel.addEventListener("change", () => this.app.env.setWeather(this.wxSel.value === "auto" ? null : this.wxSel.value)), this.wxSel.addEventListener("pointerdown", (e) => e.stopPropagation()), g3.append(this.wxSel);
      let g4 = this.h("div", "group");
      g4.append(
        this.btn("\u27F2", "Rotate left (Q)", () => this.rotate(-1)),
        this.btn("\u27F3", "Rotate right (E)", () => this.rotate(1)),
        this.btn("\u2212", "Zoom out (-)", () => this.zoom(-1)),
        this.btn("+", "Zoom in (+)", () => this.zoom(1))
      );
      let g5 = this.h("div", "group");
      g5.append(this.btn("\u{1F441}", "Follow a random person (F)", () => this.followRandom()), this.btn("\u2738", "Fireworks! (X)", () => this.fireworks())), bar.append(g1, g2, g3, g4, g5), R2.append(bar), this.card = this.h("div", "panel card hidden"), R2.append(this.card), this.toastEl = this.h("div", "toast hidden"), R2.append(this.toastEl), this.help = this.h("div", "panel help hidden", `
      <div class="htitle">PIXEL NYC \u2014 CONTROLS</div>
      <div class="hrow"><b>Drag</b> pan the city</div>
      <div class="hrow"><b>Wheel / pinch / + \u2212</b> zoom</div>
      <div class="hrow"><b>Q / E</b> rotate the view</div>
      <div class="hrow"><b>Click a person</b> follow them</div>
      <div class="hrow"><b>WASD / arrows</b> pan</div>
      <div class="hrow"><b>Space</b> pause \xB7 <b>T</b> time speed</div>
      <div class="hrow"><b>1-4</b> season \xB7 <b>0</b> auto seasons</div>
      <div class="hrow"><b>F</b> follow someone \xB7 <b>Esc</b> stop</div>
      <div class="hrow"><b>M</b> sound \xB7 <b>X</b> fireworks \xB7 <b>H</b> help</div>
      <div class="hnote">Each new day brings a new season. Kids shoot hoops in summer, throw snowballs in winter; the city lights up at dusk.</div>
      <div class="hclose">click anywhere to close</div>`), this.help.addEventListener("pointerdown", (e) => {
        e.stopPropagation(), this.toggleHelp(!1);
      }), R2.append(this.help);
    }
    // ---- actions --------------------------------------------------------------
    toggleSound() {
      let a = this.app.audio;
      a && (a.toggle(), this.soundBtn.textContent = a.enabled ? "\u266A ON" : "\u266A OFF", this.soundBtn.classList.toggle("on", a.enabled));
    }
    toggleHelp(force) {
      let show = force ?? this.help.classList.contains("hidden");
      this.help.classList.toggle("hidden", !show);
    }
    togglePause() {
      let env = this.app.env;
      env.paused = !env.paused, this.playBtn.textContent = env.paused ? "\u25B6" : "\u275A\u275A";
    }
    cycleSpeed() {
      let env = this.app.env, i = (SPEEDS.indexOf(env.speed) + 1) % SPEEDS.length;
      env.speed = SPEEDS[i], this.speedBtn.textContent = env.speed + "\xD7";
    }
    setSeason(s) {
      let env = this.app.env;
      s == null ? (env.seasonOverride = null, this.toast("Seasons change every day")) : (env.setSeason(s), this.toast(`${SEASONS[s].icon} ${SEASONS[s].name}`)), this.app.city.activities?.seed();
    }
    rotate(d) {
      this.app.camera.rotate(d);
    }
    zoom(d) {
      let cam = this.app.camera, L = this.zoomLevels, i = L.findIndex((v) => v >= cam.scaleTo - 0.01);
      i < 0 && (i = L.length - 1), i = clamp(i + d, 0, L.length - 1), L[i] !== cam.scaleTo && cam.zoomTo(L[i]);
    }
    followRandom() {
      let list = this.app.city.people.list.filter((p) => p.alpha > 0.9 && p.state !== "vanish"), vis = list.filter((p) => this.app.city.view.visible(p.x, p.y, p.z, 0)), pool = vis.length ? vis : list;
      pool.length && this.follow(pool[Math.floor(Math.random() * pool.length)]);
    }
    follow(p) {
      this.app.camera.follow = p, this.following = p, this.card.classList.remove("hidden");
    }
    unfollow() {
      this.app.camera.follow = null, this.following = null, this.card.classList.add("hidden");
    }
    fireworks() {
      let pt = this.app.city.particles;
      pt.forceFireworks = 14, pt.fireworkTimer = 0, this.app.env.darkness < 0.5 && this.toast("Fireworks look best at night!");
    }
    toast(msg) {
      this.toastEl.textContent = msg, this.toastEl.classList.remove("hidden"), this.toastT = 3.5;
    }
    // ---- per frame ------------------------------------------------------------------
    update(dt) {
      let env = this.app.env;
      this.timeEl.textContent = env.timeString();
      let S2 = SEASONS[env.season];
      this.dayEl.textContent = `DAY ${env.day + 1} \xB7 ${S2.icon} ${S2.name.toUpperCase()}`;
      let w = env.currentWeather();
      this.wxEl.textContent = `${WEATHER_ICONS[w] || ""} ${w.toUpperCase()} \xB7 ${env.temperature()}\xB0F`, document.activeElement !== this.slider && (this.slider.value = Math.floor(env.hour * 60)), this.seasonBtns.forEach((b, i) => b.classList.toggle("on", env.season === i)), this.autoSeason.classList.toggle("on", env.seasonOverride == null), this.toastT > 0 && (this.toastT -= dt, this.toastT <= 0 && this.toastEl.classList.add("hidden"));
      let p = this.following;
      if (p)
        if (p.dead)
          this.unfollow(), this.toast(`${p.name} went ${p.node?.kind === "subway" ? "into the subway" : "inside"}`);
        else {
          let role = { resident: "New Yorker", worker: "Office worker", kid: "Kid", player: "Hooper", elder: "Retiree", dogwalker: "Dog walker", jogger: "Jogger", tourist: "Tourist", vendor: "Street vendor", trick: "Trick-or-treater" }[p.role] || "New Yorker", dog = p.dogName ? ` \xB7 with ${p.dogName}` : "";
          this.card.innerHTML = `<div class="cname">${p.name}, ${p.age}</div><div class="crole">${role}${dog}</div><div class="cthought">\u201C${p.thought || "Just walking"}\u201D</div><div class="cclose">ESC / click empty space to stop</div>`;
        }
    }
    // ---- input ------------------------------------------------------------------
    bindInput() {
      let app = this.app, cv = app.canvas, ptrs = /* @__PURE__ */ new Map(), drag = null, pinch = null, moved = 0;
      cv.addEventListener("pointerdown", (e) => {
        if (cv.setPointerCapture(e.pointerId), ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }), app.audio?.unlock(), ptrs.size === 1 && (drag = { x: e.clientX, y: e.clientY }, moved = 0), ptrs.size === 2) {
          let [a, b] = [...ptrs.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), acc: 0 }, drag = null;
        }
      }), cv.addEventListener("pointermove", (e) => {
        if (ptrs.has(e.pointerId)) {
          if (ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }), pinch && ptrs.size === 2) {
            let [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = d / pinch.d;
            r > 1.25 ? (this.zoom(1), pinch.d = d) : r < 0.8 && (this.zoom(-1), pinch.d = d);
            return;
          }
          if (drag) {
            let dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            if (moved += Math.abs(dx) + Math.abs(dy), drag.x = e.clientX, drag.y = e.clientY, moved > 4) {
              cv.classList.add("dragging"), app.camera.follow && this.unfollow();
              let scaleCss = app.camera.scale / (window.devicePixelRatio || 1), [wx, wy] = app.camera.unprojectDelta(-dx / scaleCss, -dy / scaleCss);
              app.camera.x += wx, app.camera.y += wy, app.camera.vx = wx / 0.016 * 0.5, app.camera.vy = wy / 0.016 * 0.5;
            }
          }
        }
      });
      let up = (e) => {
        ptrs.delete(e.pointerId), cv.classList.remove("dragging"), drag && moved <= 4 && this.click(e.clientX, e.clientY), ptrs.size < 2 && (pinch = null), drag = null;
      };
      cv.addEventListener("pointerup", up), cv.addEventListener("pointercancel", up);
      let wheelAcc = 0;
      cv.addEventListener("wheel", (e) => {
        e.preventDefault(), wheelAcc += e.deltaY, wheelAcc > 60 ? (this.zoom(-1), wheelAcc = 0) : wheelAcc < -60 && (this.zoom(1), wheelAcc = 0);
      }, { passive: !1 });
      let keys = /* @__PURE__ */ new Set();
      window.addEventListener("keydown", (e) => {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
        app.audio?.unlock();
        let k = e.key.toLowerCase();
        keys.add(k), k === "q" ? this.rotate(-1) : k === "e" ? this.rotate(1) : k === "+" || k === "=" ? this.zoom(1) : k === "-" || k === "_" ? this.zoom(-1) : k === " " ? (this.togglePause(), e.preventDefault()) : k === "t" ? this.cycleSpeed() : k >= "1" && k <= "4" ? this.setSeason(+k - 1) : k === "0" ? this.setSeason(null) : k === "f" ? this.followRandom() : k === "escape" ? (this.unfollow(), this.toggleHelp(!1)) : k === "m" ? this.toggleSound() : k === "h" || k === "?" ? this.toggleHelp() : k === "x" ? this.fireworks() : k === "n" && (app.env.hour = (app.env.hour + 3) % 24);
      }), window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase())), this.keys = keys;
    }
    click(cx, cy) {
      let app = this.app, p = app.city.people.pick(cx, cy, app.canvas.clientWidth, app.canvas.clientHeight);
      p ? this.follow(p) : this.following && this.unfollow();
    }
    pan(dt) {
      let k = this.keys;
      if (!k) return;
      let sx = 0, sy = 0;
      if ((k.has("a") || k.has("arrowleft")) && (sx -= 1), (k.has("d") || k.has("arrowright")) && (sx += 1), (k.has("w") || k.has("arrowup")) && (sy -= 1), (k.has("s") || k.has("arrowdown")) && (sy += 1), !sx && !sy) return;
      this.app.camera.follow && this.unfollow();
      let cam = this.app.camera, speed = 420 / (cam.scale / (window.devicePixelRatio || 1)), [wx, wy] = cam.unprojectDelta(sx * speed * dt, sy * speed * dt);
      cam.x += wx, cam.y += wy;
    }
  };

  // src/audio/audio.js
  var AudioEngine = class {
    constructor(app) {
      this.app = app, this.enabled = !1, this.ctx = null, this.rng = new RNG(5), this.last = {}, this.birdT = 2, this.subwayT = 30, this.jingleT = 0, this.chirpT = 0, this.lastWalk = null;
    }
    // ---------------------------------------------------------------- setup
    init() {
      let AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return !1;
      let ctx = this.ctx = new AC();
      this.master = ctx.createGain(), this.master.gain.value = 0;
      let comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16, comp.ratio.value = 4, this.master.connect(comp).connect(ctx.destination), this.sfx = ctx.createGain(), this.sfx.gain.value = 0.9, this.sfx.connect(this.master), this.amb = ctx.createGain(), this.amb.gain.value = 0.8, this.amb.connect(this.master);
      let sr = ctx.sampleRate, mk = (secs, fn) => {
        let b = ctx.createBuffer(1, Math.floor(sr * secs), sr), d = b.getChannelData(0);
        return fn(d, sr), b;
      };
      this.white = mk(2, (d) => {
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }), this.pink = mk(2, (d) => {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < d.length; i++) {
          let w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179, b1 = 0.99332 * b1 + w * 0.0750759, b2 = 0.969 * b2 + w * 0.153852, b3 = 0.8665 * b3 + w * 0.3104856, b4 = 0.55 * b4 + w * 0.5329522, b5 = -0.7616 * b5 - w * 0.016898, d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11, b6 = w * 0.115926;
        }
      }), this.brown = mk(3, (d) => {
        let l = 0;
        for (let i = 0; i < d.length; i++)
          l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02, d[i] = l * 3.5;
      }), this.crickets = mk(2, (d, r) => {
        for (let i = 0; i < d.length; i++) {
          let t = i / r, chirp = t % 0.5 < 0.12 ? Math.sin(Math.PI * (t % 0.5 / 0.12)) : 0, pulse = Math.sin(t * 2 * Math.PI * 30) > 0 ? 1 : 0.2, c2 = (t + 0.23) % 0.62 < 0.1 ? 0.6 : 0;
          d[i] = (Math.sin(t * 2 * Math.PI * 4400) * chirp * pulse + Math.sin(t * 2 * Math.PI * 4900) * c2 * pulse) * 0.25;
        }
      });
      let loop = (buf, filters, gain0 = 0) => {
        let src = ctx.createBufferSource();
        src.buffer = buf, src.loop = !0;
        let node = src, fs = [];
        for (let [type, f, q] of filters) {
          let bq = ctx.createBiquadFilter();
          bq.type = type, bq.frequency.value = f, q && (bq.Q.value = q), node.connect(bq), node = bq, fs.push(bq);
        }
        let g = ctx.createGain();
        g.gain.value = gain0;
        let pan = ctx.createStereoPanner();
        return node.connect(g).connect(pan).connect(this.amb), src.start(), { src, g, f: fs, pan };
      };
      return this.L = {
        city: loop(this.brown, [["lowpass", 420]], 0),
        traffic: loop(this.pink, [["bandpass", 700, 0.4]], 0),
        wind: loop(this.white, [["bandpass", 500, 0.8]], 0),
        rain: loop(this.white, [["highpass", 900], ["lowpass", 6500]], 0),
        crickets: loop(this.crickets, [["highpass", 2e3]], 0),
        water: loop(this.white, [["bandpass", 1800, 0.6]], 0),
        steam: loop(this.white, [["highpass", 2800]], 0),
        siren: null
      }, !0;
    }
    unlock() {
      this.ctx && this.ctx.state === "suspended" && this.enabled && this.ctx.resume();
    }
    toggle() {
      if (!this.ctx && !this.init()) return;
      this.enabled = !this.enabled, this.enabled && this.ctx.state === "suspended" && this.ctx.resume();
      let t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t), this.master.gain.setTargetAtTime(this.enabled ? 0.85 : 0, t, 0.15);
    }
    get on() {
      return this.enabled && this.ctx && this.ctx.state === "running";
    }
    // ---------------------------------------------------------------- helpers
    now() {
      return this.ctx.currentTime;
    }
    // positional gain/pan from world position
    where(src) {
      let app = this.app, W = app.canvas.clientWidth, H = app.canvas.clientHeight, s = app.camera.worldToScreen(src.x, src.y, src.z || 0, W, H), dx = (s[0] - W / 2) / (W / 2), dy = (s[1] - H / 2) / (H / 2), d = Math.hypot(dx, dy * 1.2), css = app.camera.scale / (window.devicePixelRatio || 1), zk = clamp(0.35 + css * 0.28, 0.4, 1.5);
      return { g: Math.pow(clamp(1.3 - d, 0, 1), 1.6) * zk, pan: clamp(dx * 0.85, -1, 1) };
    }
    throttle(kind, dt) {
      let t = performance.now() / 1e3;
      return this.last[kind] && t - this.last[kind] < dt ? !1 : (this.last[kind] = t, !0);
    }
    out(gain, pan) {
      let g = this.ctx.createGain();
      g.gain.value = gain;
      let p = this.ctx.createStereoPanner();
      return p.pan.value = pan, g.connect(p).connect(this.sfx), g;
    }
    env(g, t, a, peak, d, sus = 0) {
      g.gain.setValueAtTime(1e-4, t), g.gain.linearRampToValueAtTime(peak, t + a), g.gain.exponentialRampToValueAtTime(Math.max(1e-4, sus || 1e-4), t + a + d);
    }
    osc(type, f, t, dur, dest, peak = 0.3, a = 5e-3, f2 = null) {
      let o = this.ctx.createOscillator();
      o.type = type, o.frequency.setValueAtTime(f, t), f2 && o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      let g = this.ctx.createGain();
      return this.env(g, t, a, peak, dur), o.connect(g).connect(dest), o.start(t), o.stop(t + a + dur + 0.05), o;
    }
    noise(t, dur, dest, filters, peak = 0.3, a = 3e-3, buf = this.white) {
      let s = this.ctx.createBufferSource();
      s.buffer = buf;
      let n = s;
      for (let [type, f, q, f2] of filters) {
        let b = this.ctx.createBiquadFilter();
        b.type = type, b.frequency.setValueAtTime(f, t), f2 && b.frequency.exponentialRampToValueAtTime(f2, t + dur), q && (b.Q.value = q), n.connect(b), n = b;
      }
      let g = this.ctx.createGain();
      this.env(g, t, a, peak, dur), n.connect(g).connect(dest), s.start(t, Math.random() * 1.5), s.stop(t + a + dur + 0.05);
    }
    click() {
      if (!this.on) return;
      let t = this.now();
      this.osc("square", 880, t, 0.04, this.out(0.06, 0), 0.5);
    }
    // ---------------------------------------------------------------- events
    event(kind, src) {
      if (!this.on || !src) return;
      let w = this.where(src);
      if (w.g < 0.03) return;
      let t = this.now(), r = this.rng, O = (k = 1) => this.out(w.g * k, w.pan);
      switch (kind) {
        case "dribble":
        case "bounce": {
          if (!this.throttle("dribble", 0.08)) return;
          let o = O(kind === "bounce" ? 0.6 : 0.9);
          this.osc("sine", 150, t, 0.12, o, 0.7, 2e-3, 55), this.noise(t, 0.03, o, [["lowpass", 900]], 0.3);
          break;
        }
        case "rim": {
          let o = O(0.7);
          for (let f of [640, 1010, 1590, 2230]) this.osc("sine", f * r.range(0.98, 1.02), t, 0.5, o, 0.14);
          this.noise(t, 0.04, o, [["bandpass", 3e3, 2]], 0.2);
          break;
        }
        case "swish": {
          let o = O(0.8);
          this.noise(t, 0.28, o, [["bandpass", 2600, 0.9, 5200]], 0.35, 0.02);
          break;
        }
        case "throw": {
          if (!this.throttle("throw", 0.15)) return;
          this.noise(t, 0.16, O(0.5), [["bandpass", 500, 1.2, 1800]], 0.3, 0.02);
          break;
        }
        case "splat": {
          if (!this.throttle("splat", 0.08)) return;
          this.noise(t, 0.12, O(0.7), [["lowpass", 1100, 0.7, 300]], 0.5);
          break;
        }
        case "coo": {
          if (!this.throttle("coo", 0.35)) return;
          let o = O(0.45), base = r.range(330, 420), v = this.osc("sine", base, t, 0.22, o, 0.35, 0.03, base * 0.9), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
          lfo.frequency.value = 18, lg.gain.value = 12, lfo.connect(lg).connect(v.frequency), lfo.start(t), lfo.stop(t + 0.6), this.osc("sine", base * 1.06, t + 0.26, 0.32, o, 0.3, 0.04, base * 0.82);
          break;
        }
        case "flutter": {
          if (!this.throttle("flutter", 0.25)) return;
          let o = O(0.5);
          for (let k = 0; k < 7; k++) this.noise(t + k * 0.055, 0.04, o, [["bandpass", 1300, 0.8]], 0.25 * (1 - k / 9));
          break;
        }
        case "bark": {
          if (!this.throttle("bark", 0.4)) return;
          let o = O(0.6), f = r.range(260, 480);
          for (let k = 0; k < r.int(1, 3); k++) {
            let tt = t + k * 0.22, b = this.ctx.createBiquadFilter();
            b.type = "bandpass", b.frequency.value = f * 2.4, b.Q.value = 1.5, b.connect(o), this.osc("sawtooth", f, tt, 0.13, b, 0.6, 0.01, f * 0.7), this.noise(tt, 0.08, o, [["bandpass", 1200, 1]], 0.15);
          }
          break;
        }
        case "horn": {
          if (!this.throttle("horn", 0.6)) return;
          let o = O(0.45), lp = this.ctx.createBiquadFilter();
          lp.type = "lowpass", lp.frequency.value = 1800, lp.connect(o);
          let dur = r.chance(0.5) ? 0.35 : 0.18, n = r.chance(0.4) ? 2 : 1;
          for (let k = 0; k < n; k++)
            this.osc("square", 392, t + k * 0.28, dur, lp, 0.22, 0.01), this.osc("square", 494, t + k * 0.28, dur, lp, 0.18, 0.01);
          break;
        }
        case "bus": {
          let o = O(0.5);
          this.noise(t, 0.7, o, [["highpass", 1800]], 0.35, 0.01);
          for (let k = 0; k < 3; k++) this.osc("square", 1040, t + 0.9 + k * 0.35, 0.15, o, 0.12);
          break;
        }
        case "boom": {
          let o = O(1.2);
          this.noise(t, 1.4, o, [["lowpass", 600, 0.7, 90]], 0.9, 5e-3, this.brown), this.osc("sine", 70, t, 0.6, o, 0.6, 5e-3, 35);
          for (let k = 0; k < 18; k++) this.noise(t + 0.25 + r.range(0, 0.9), 0.02, o, [["highpass", 3e3]], r.range(0.05, 0.18));
          break;
        }
        case "launch": {
          this.osc("sine", 700, t, 0.9, O(0.25), 0.12, 0.05, 2600);
          break;
        }
        case "geese": {
          let o = O(0.35);
          for (let k = 0; k < 6; k++) {
            let tt = t + k * r.range(0.3, 0.6), b = this.ctx.createBiquadFilter();
            b.type = "bandpass", b.frequency.value = 650, b.Q.value = 3, b.connect(o), this.osc("sawtooth", r.range(320, 380), tt, 0.16, b, 0.5, 0.02, 300);
          }
          break;
        }
        case "giggle": {
          if (!this.throttle("giggle", 1.2)) return;
          let o = O(0.3), f = r.range(900, 1100);
          for (let k = 0; k < 5; k++)
            this.osc("sine", f, t + k * 0.09, 0.07, o, 0.25, 0.01, f * 0.9), f *= 0.94;
          break;
        }
        case "train": {
          if (!this.throttle("train", 1.6)) return;
          let o = O(0.55);
          this.noise(t, 1.8, o, [["lowpass", 220]], 0.7, 0.3, this.brown);
          for (let k = 0; k < 6; k++) this.noise(t + k * 0.21 + k % 2 * 0.06, 0.05, o, [["bandpass", 900, 2]], 0.22);
          break;
        }
        case "trainStop": {
          let o = O(0.4), v = this.osc("sine", 2350, t, 1.1, o, 0.12, 0.08, 2100), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
          lfo.frequency.value = 9, lg.gain.value = 40, lfo.connect(lg).connect(v.frequency), lfo.start(t), lfo.stop(t + 1.3), this.noise(t + 0.9, 0.5, o, [["highpass", 2500]], 0.25, 0.01);
          break;
        }
        case "trainGo": {
          let o = O(0.35);
          this.osc("sine", 660, t, 0.25, o, 0.2), this.osc("sine", 523, t + 0.3, 0.4, o, 0.2);
          break;
        }
        case "siren":
          break;
      }
    }
    thunder(dist3) {
      if (!this.on) return;
      let t = this.now() + 0.4 + dist3 * 2.2, o = this.out(1.1 - dist3 * 0.5, this.rng.range(-0.5, 0.5));
      this.noise(t, 3.5 + dist3 * 2, o, [["lowpass", 380, 0.6, 70]], 1, 0.08, this.brown), this.noise(t, 0.25, o, [["lowpass", 2e3, 0.5, 400]], 0.5 * (1 - dist3), 5e-3);
    }
    birds(k) {
      let t = this.now(), r = this.rng, o = this.out(0.13 * k, r.range(-0.8, 0.8)), n = r.int(3, 7), base = r.range(2600, 4200);
      for (let i = 0; i < n; i++) {
        let tt = t + i * r.range(0.08, 0.16);
        this.osc("sine", base * r.range(0.9, 1.2), tt, 0.06, o, 0.3, 5e-3, base * r.range(1.2, 1.6));
      }
    }
    walkChirp(src) {
      let w = this.where(src);
      if (w.g < 0.15) return;
      let t = this.now(), o = this.out(w.g * 0.25, w.pan);
      for (let k = 0; k < 6; k++) this.osc("square", 2600, t + k * 0.12, 0.02, o, 0.3);
    }
    // ---------------------------------------------------------------- per frame
    update(dt) {
      if (!this.ctx || !this.enabled) return;
      let app = this.app, env = app.env, city = app.city, t = this.now(), L = this.L, set = (node, v, tc = 0.4) => node.g.gain.setTargetAtTime(v, t, tc), css = app.camera.scale / (window.devicePixelRatio || 1), close = clamp(css / 3, 0.3, 1.4), cars = city.traffic.cars, moving = 0;
      for (let c of cars) c.state !== "parked" && c.v > 0.5 && moving++;
      let busy = clamp(moving / 40, 0.15, 1.2);
      set(L.city, 0.22 + 0.12 * busy), set(L.traffic, 0.05 + 0.06 * busy * close), set(L.wind, 0.04 + env.wind * (env.season === 3 || env.season === 2 ? 0.12 : 0.06)), L.wind.f[0].frequency.setTargetAtTime(380 + Math.sin(t * 0.3) * 160 + Math.sin(t * 0.17) * 90, t, 0.5), set(L.rain, env.raining ? 0.32 * env.precip : env.snowing ? 0.03 : 0, 0.8);
      let cr = env.season === 1 && (env.hour > 20 || env.hour < 4.5) ? 0.06 : env.season === 0 && env.hour > 21 ? 0.02 : 0;
      set(L.crickets, cr, 1);
      let view = city.view, water = 0, wpan = 0, steam = 0, span = 0, W = city.world;
      if (env.season !== 3 && env.hour >= 7 && env.hour < 23) for (let f of W.fountains) {
        let w = this.where(f);
        w.g > water && (water = w.g, wpan = w.pan);
      }
      if (city.activities?.hydrantOpen) {
        let w = this.where(city.activities.hydrantOpen.h);
        w.g * 1.4 > water && (water = w.g * 1.4, wpan = w.pan);
      }
      for (let s of W.steam) if (s.kind === "stack" || s.kind === "manhole") {
        let w = this.where(s);
        w.g > steam && (steam = w.g, span = w.pan);
      }
      if (set(L.water, water * 0.18, 0.3), L.water.pan.pan.setTargetAtTime(wpan, t, 0.3), set(L.steam, steam * 0.07 * (env.season === 3 ? 1.6 : 1), 0.3), L.steam.pan.pan.setTargetAtTime(span, t, 0.3), this.birdT -= dt, this.birdT <= 0) {
        let k = env.hour > 5.5 && env.hour < 19.5 ? (env.season === 0 || env.season === 1 ? 1 : env.season === 2 ? 0.4 : 0.15) * (env.hour < 9 ? 1.6 : 1) * (env.raining ? 0.2 : 1) : 0;
        this.birdT = this.rng.range(1.2, 4) / Math.max(0.2, k), k > 0 && this.birds(Math.min(1.4, k));
      }
      for (let c of city.traffic.honks) this.event("horn", c);
      city.traffic.honks.length = 0;
      let fire = cars.find((c) => c.siren);
      if (fire) {
        if (!L.siren) {
          let o = this.ctx.createOscillator();
          o.type = "sawtooth";
          let lfo = this.ctx.createOscillator();
          lfo.frequency.value = 0.45;
          let lg = this.ctx.createGain();
          lg.gain.value = 420, lfo.connect(lg).connect(o.frequency), o.frequency.value = 1050;
          let bp = this.ctx.createBiquadFilter();
          bp.type = "bandpass", bp.frequency.value = 1100, bp.Q.value = 0.8;
          let g = this.ctx.createGain();
          g.gain.value = 0;
          let p = this.ctx.createStereoPanner();
          o.connect(bp).connect(g).connect(p).connect(this.sfx), o.start(), lfo.start(), L.siren = { o, lfo, g, p };
        }
        let w = this.where(fire);
        L.siren.g.gain.setTargetAtTime(0.05 + w.g * 0.16, t, 0.2), L.siren.p.pan.setTargetAtTime(w.pan, t, 0.2);
      } else if (L.siren) {
        L.siren.g.gain.setTargetAtTime(0, t, 0.3);
        let s = L.siren;
        setTimeout(() => {
          try {
            s.o.stop(), s.lfo.stop();
          } catch {
          }
        }, 1500), L.siren = null;
      }
      let ice = cars.find((c) => c.special === "icecream");
      if (this.jingleT -= dt, ice && this.jingleT <= 0) {
        let w = this.where(ice);
        if (this.jingleT = 4.2, w.g > 0.03) {
          let o = this.out(w.g * 0.18, w.pan);
          [72, 76, 79, 76, 77, 74, 71, 74, 72, 76, 79, 84, 83, 79, 77, 76].forEach((n, i) => this.osc("square", 440 * Math.pow(2, (n - 69) / 12), t + i * 0.24, 0.2, o, 0.25, 5e-3));
        }
      }
      let gar = cars.find((c) => c.special === "garbage" && c.v < 0.5);
      if (gar && this.throttle("garbage", 1)) {
        let w = this.where(gar);
        w.g > 0.05 && this.osc("square", 1100, t, 0.3, this.out(w.g * 0.12, w.pan), 0.3);
      }
      if (this.subwayT -= dt, this.subwayT <= 0) {
        this.subwayT = this.rng.range(35, 80);
        let s = W.subways[this.rng.int(0, W.subways.length - 1)];
        if (s) {
          let w = this.where(s);
          this.noise(t, 5, this.out(0.15 + w.g * 0.35, w.pan), [["lowpass", 160]], 0.9, 1.5, this.brown);
        }
      }
      if (this.chirpT -= dt, this.chirpT <= 0) {
        this.chirpT = 0.5;
        let cx = app.camera.x, cy = app.camera.y, i = clamp(Math.round((cx - 4.5) / 27), 0, 4), j = clamp(Math.round((cy - 4.5) / 27), 0, 4), st = city.traffic.signalState(i, j), key = `${i},${j},${st.walkEW},${st.walkNS}`;
        this.lastWalk && key !== this.lastWalk && (st.walkEW === "walk" || st.walkNS === "walk") && css >= 2 && this.walkChirp({ x: i * 27 + 4.5, y: j * 27 + 4.5, z: 0 }), this.lastWalk = key;
      }
    }
  };

  // src/main.js
  var canvas = document.getElementById("view"), loading = document.getElementById("loading"), loadingMsg = document.getElementById("loading-msg");
  function setMsg(m) {
    loadingMsg && (loadingMsg.textContent = m);
  }
  function nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }
  async function boot() {
    let gl;
    try {
      gl = createGL(canvas);
    } catch (e) {
      setMsg(e.message + " Try a recent Chrome, Edge, Firefox or Safari.");
      return;
    }
    setMsg("Pouring concrete\u2026"), await nextFrame();
    let t0 = performance.now(), world = buildWorld(1977, (m) => setMsg(m));
    setMsg("Waking up the city\u2026"), await nextFrame();
    let renderer = new Renderer(gl);
    renderer.setStatic(world.mesh, world.atlas, world.groundPage);
    let q = new URLSearchParams(location.search), env = new Environment(), camera = new Camera(), dpr = window.devicePixelRatio || 1;
    camera.scale = camera.scaleTo = Math.max(1, Math.round(dpr)), camera.x = 60, camera.y = 70, q.has("zoom") && (camera.scale = camera.scaleTo = parseFloat(q.get("zoom"))), q.has("x") && (camera.x = parseFloat(q.get("x"))), q.has("y") && (camera.y = parseFloat(q.get("y"))), q.has("rot") && (camera.rot = parseInt(q.get("rot"), 10), camera.angle = camera.rot * Math.PI / 2), q.has("hour") && (env.hour = parseFloat(q.get("hour"))), q.has("season") && env.setSeason(parseInt(q.get("season"), 10)), q.has("weather") && env.setWeather(q.get("weather")), q.has("pause") && (env.paused = !0), env.compute(0);
    let city = new City(gl, renderer, world, env, camera), app = { gl, world, renderer, env, camera, city, time: 0, canvas, fps: 0 }, audio = new AudioEngine(app);
    app.audio = audio, city.audio = audio, env.onEvent((ev, d) => {
      ev === "lightning" && audio.thunder(d.dist), ev === "season" && city.activities?.seed();
    }), document.addEventListener("visibilitychange", () => {
      !audio.ctx || !audio.enabled || (document.hidden ? audio.ctx.suspend() : audio.ctx.resume());
    });
    let ui = new UI(app);
    app.ui = ui, window.__city = app, console.log(`world built in ${(performance.now() - t0).toFixed(0)}ms, tris=${renderer.stats.tris}, atlas pages=${world.atlas.pages.length}`);
    let last = performance.now(), fpsAcc = 0, fpsN = 0;
    function resize() {
      let d = window.devicePixelRatio || 1, w = Math.round(canvas.clientWidth * d), h = Math.round(canvas.clientHeight * d);
      (canvas.width !== w || canvas.height !== h) && (canvas.width = w, canvas.height = h);
    }
    let still = q.has("still");
    function step(dt) {
      app.time += dt, resize(), env.update(dt), ui.pan(dt), camera.update(dt), city.update(dt), city.prepare(canvas.width, canvas.height), renderer.render(camera, env.u, app.time, canvas.width, canvas.height), audio.update(dt), ui.update(dt);
    }
    app.simulate = (secs, dt = 0.05) => {
      let t = performance.now();
      for (let k = 0; k < secs / dt; k++)
        app.time += dt, env.update(dt), camera.update(dt), city.update(dt);
      return performance.now() - t;
    }, app.renderOnce = (dt = 0.016) => {
      let t = performance.now();
      return step(dt), performance.now() - t;
    };
    function frame(now) {
      let dt = Math.min(0.05, (now - last) / 1e3);
      last = now, fpsAcc += dt, fpsN++, fpsAcc > 1 && (app.fps = Math.round(fpsN / fpsAcc), fpsAcc = 0, fpsN = 0, app.lowFps = app.fps < 32 ? (app.lowFps || 0) + 1 : 0, app.lowFps >= 4 && renderer.shadowSize > 2048 ? (renderer.setShadowSize(2048), app.lowFps = 0, console.log("quality: shadow map 2048")) : app.lowFps >= 4 && renderer.shadowSize > 1024 && (renderer.setShadowSize(1024), app.lowFps = 0, console.log("quality: shadow map 1024"))), step(dt), still || requestAnimationFrame(frame);
    }
    loading && loading.classList.add("hidden"), ui.toast("\u266A Tap the sound button for city sounds"), still ? (step(0.016), app.time = 1) : requestAnimationFrame(frame);
  }
  boot();
})();
