/* ==========================================================================
   AureaIA — Render ASCII en vivo para "Casos de Éxito"

   Cada video del portfolio se redibuja cuadro a cuadro con caracteres ASCII
   en un shader WebGL2. Cada carácter toma el color del píxel que tiene debajo
   y el brillo promedio de cada celda se mantiene igual al del video original.

   Valores por defecto: editá CONFIG. El panel de la página permite cambiarlos
   en vivo y recuerda la elección de cada visitante en localStorage.
   Si el navegador no tiene WebGL2, se muestran los videos originales.
   ========================================================================== */
(function () {
  'use strict';

  const CONFIG = {
    columnas: 360,   // caracteres de ancho por video (160–720)
    fidelidad: 0.8,  // 0 = ASCII puro sobre fondo negro · 1 = casi idéntico al video
    contraste: 1.0,  // 0.6–1.8
    color: 'video',  // 'video' usa el color real del píxel; o un hex, ej. '#00CCFF'
    comparar: false, // divisor original / ASCII que sigue al mouse
  };
  const LIMITES = { columnas: [160, 720], fidelidad: [0, 1], contraste: [0.6, 1.8] };
  const STORAGE_KEY = 'aurea-ascii-v1';
  const CHARS = " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
  const FONT = '"IBM Plex Mono", Consolas, Monaco, "Courier New", monospace';
  const FONDO = [10 / 255, 10 / 255, 10 / 255]; // --bg del sitio

  const api = { supported: false, pause() {}, resume() {} };
  window.AureaAscii = api;

  if (!window.WebGL2RenderingContext) return;
  const cardEls = Array.from(document.querySelectorAll('.portfolio-card'))
    .filter(card => card.querySelector('.portfolio-video video'));
  if (!cardEls.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---------- Estado (CONFIG + lo que el visitante eligió antes) ----------
  function leerGuardado() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!s || typeof s !== 'object') return {};
      const o = {};
      if (Number.isFinite(s.columnas)) o.columnas = clamp(s.columnas, ...LIMITES.columnas);
      if (Number.isFinite(s.fidelidad)) o.fidelidad = clamp(s.fidelidad, ...LIMITES.fidelidad);
      if (Number.isFinite(s.contraste)) o.contraste = clamp(s.contraste, ...LIMITES.contraste);
      if (s.color === 'video' || /^#[0-9a-f]{6}$/i.test(s.color || '')) o.color = s.color;
      if (typeof s.comparar === 'boolean') o.comparar = s.comparar;
      return o;
    } catch (_) { return {}; }
  }
  function guardar() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  const state = Object.assign({}, CONFIG, leerGuardado());

  const hexToRgb = h => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  };

  // ---------- Atlas de glifos + tabla brillo → glifo ----------
  // Cada glifo va en una celda con margen para que los mipmaps no se mezclen.
  const RW = 38, RH = 64, PAD = 16, SW = RW + PAD * 2, SH = RH + PAD * 2, ACOLS = 10;
  const AROWS = Math.ceil(CHARS.length / ACOLS);
  const atlas = document.createElement('canvas');
  const lut = new Uint8Array(256 * 4);

  function construirAtlas() {
    atlas.width = SW * ACOLS;
    atlas.height = SH * AROWS;
    const g = atlas.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000';
    g.fillRect(0, 0, atlas.width, atlas.height);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `500 ${RH * 0.92}px ${FONT}`;
    const cobertura = [];
    for (let i = 0; i < CHARS.length; i++) {
      const x = (i % ACOLS) * SW + PAD, y = Math.floor(i / ACOLS) * SH + PAD;
      g.fillText(CHARS[i], x + RW / 2, y + RH * 0.54);
      const d = g.getImageData(x, y, RW, RH).data;
      let s = 0;
      for (let p = 0; p < d.length; p += 4) s += d[p];
      cobertura.push(s / (RW * RH * 255));
    }
    // Para cada nivel de brillo, el glifo cuya cobertura medida es la más cercana
    const max = Math.max(...cobertura);
    for (let i = 0; i < 256; i++) {
      const objetivo = (i / 255) * max;
      let mejor = 0, dist = 9;
      for (let j = 0; j < cobertura.length; j++) {
        const dd = Math.abs(cobertura[j] - objetivo);
        if (dd < dist) { dist = dd; mejor = j; }
      }
      lut[i * 4] = mejor;
      lut[i * 4 + 1] = Math.round(cobertura[mejor] * 255);
      lut[i * 4 + 3] = 255;
    }
  }

  // ---------- Shader ----------
  const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

  const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uVid, uAtlas, uLut;
uniform vec2 uGrid, uCrop, uOff, uSlot, uPad, uRegion, uAtlasSize;
uniform float uACols, uContrast, uFid, uReal, uLod, uSplit;
uniform vec3 uAccent, uBg;
vec3 vid(vec2 q){ return texture(uVid, uOff + q * uCrop).rgb; }
vec3 grade(vec3 c){ return clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0); }
float L(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 tint(vec3 c){ return uReal > 0.5 ? c : min(vec3(1.0), uAccent * L(c) * 1.7); }
void main(){
  vec3 raw = vid(uv);
  if (uv.x < uSplit) { o = vec4(raw, 1.0); return; }
  vec2 cell = floor(uv * uGrid);
  vec2 local = fract(uv * uGrid);
  vec2 c = (cell + 0.5) / uGrid, h = 0.25 / uGrid;
  vec3 cc = grade((vid(c - h) + vid(c + vec2(h.x, -h.y)) + vid(c + vec2(-h.x, h.y)) + vid(c + h)) * 0.25);
  float v = L(cc);
  vec4 lu = texelFetch(uLut, ivec2(int(clamp(v, 0.0, 1.0) * 255.0 + 0.5), 0), 0);
  float slot = floor(lu.r * 255.0 + 0.5), cov = lu.g;
  vec2 sc = vec2(mod(slot, uACols), floor(slot / uACols));
  vec2 ap = (sc * uSlot + uPad + vec2(local.x, 1.0 - local.y) * uRegion) / uAtlasSize;
  float a = textureLod(uAtlas, ap, uLod).r;
  // ASCII puro: glifo sobre fondo, brillo compensado por la cobertura del glifo
  vec3 pure = uBg * (1.0 - a) + tint(cc) * min(a / max(cov, 0.001), 3.0);
  // ASCII integrado: el glifo modula el color del píxel y el promedio de la celda se conserva
  vec3 pc = tint(grade(raw));
  float tm = max(max(pc.r, pc.g), pc.b);
  float kmax = mix(3.0, 0.9, uFid);
  float k = min(kmax, min((1.0 / max(tm, 0.001) - 1.0) / max(1.0 - cov, 0.001), 1.0 / max(cov, 0.001)));
  vec3 subtle = pc * (1.0 + k * (a - cov));
  o = vec4(mix(pure, subtle, smoothstep(0.0, 0.6, uFid)), 1.0);
}`;

  function crearGL(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
    if (!gl) return null;
    const sh = (tipo, src) => { const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const textura = (unidad, min, mag) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unidad);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    textura(1, gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    textura(2, gl.NEAREST, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
    const vidTex = textura(0, gl.LINEAR, gl.LINEAR);

    const U = {};
    ['uVid', 'uAtlas', 'uLut', 'uGrid', 'uCrop', 'uOff', 'uSlot', 'uPad', 'uRegion', 'uAtlasSize',
      'uACols', 'uContrast', 'uFid', 'uReal', 'uLod', 'uSplit', 'uAccent', 'uBg']
      .forEach(n => { U[n] = gl.getUniformLocation(pr, n); });
    gl.uniform1i(U.uVid, 0);
    gl.uniform1i(U.uAtlas, 1);
    gl.uniform1i(U.uLut, 2);
    gl.uniform2f(U.uSlot, SW, SH);
    gl.uniform2f(U.uPad, PAD, PAD);
    gl.uniform2f(U.uRegion, RW, RH);
    gl.uniform2f(U.uAtlasSize, atlas.width, atlas.height);
    gl.uniform1f(U.uACols, ACOLS);
    gl.uniform3fv(U.uBg, FONDO);
    return { gl, U, vidTex };
  }

  // ---------- Tarjetas ----------
  let cards = [];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function iniciarTarjeta(card) {
    const wrap = card.querySelector('.portfolio-video');
    const video = wrap.querySelector('video');
    const canvas = el('canvas', 'ascii-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    video.after(canvas);
    const g = crearGL(canvas);
    if (!g) { canvas.remove(); return null; }

    card.classList.add('ascii-active');
    video.preload = 'auto';
    const chip = el('span', 'ascii-chip', 'ASCII en vivo');
    const split = el('div', 'ascii-split');
    const ladoL = el('span', 'ascii-side ascii-side-l', 'Original');
    const ladoR = el('span', 'ascii-side ascii-side-r', 'ASCII');
    wrap.append(chip, split, ladoL, ladoR);

    const c = { card, wrap, video, canvas, g, split, lados: [ladoL, ladoR],
      visible: false, splitX: 0.5, lastT: -1, uploaded: false, dirty: true };

    wrap.addEventListener('pointermove', e => {
      if (!state.comparar || e.pointerType === 'touch') return;
      const r = wrap.getBoundingClientRect();
      c.splitX = clamp((e.clientX - r.left) / r.width, 0, 1);
      actualizarSplit(c);
    });
    wrap.addEventListener('pointerleave', () => { c.splitX = 0.5; actualizarSplit(c); });
    video.addEventListener('loadeddata', () => { c.uploaded = false; });
    actualizarSplit(c);
    return c;
  }

  function actualizarSplit(c) {
    c.split.hidden = !state.comparar;
    c.lados.forEach(l => { l.hidden = !state.comparar; });
    c.split.style.setProperty('--x', (c.splitX * 100) + '%');
    c.dirty = true;
  }

  const filasPara = (cols, w, h) => Math.max(6, Math.round(cols * 0.6 * h / w));

  function dibujar(c) {
    const { gl, U } = c.g;
    const v = c.video, W = c.canvas.width, H = c.canvas.height;
    gl.viewport(0, 0, W, H);
    const va = v.videoWidth / v.videoHeight, ca = W / H;
    let sx = 1, sy = 1;
    if (va > ca) sx = ca / va; else sy = va / ca;
    gl.uniform2f(U.uCrop, sx, sy);
    gl.uniform2f(U.uOff, (1 - sx) / 2, (1 - sy) / 2);
    const cols = state.columnas, filas = filasPara(cols, W, H);
    gl.uniform2f(U.uGrid, cols, filas);
    gl.uniform1f(U.uLod, Math.max(0, Math.log2(RH / (H / filas))));
    gl.uniform1f(U.uContrast, state.contraste);
    gl.uniform1f(U.uFid, state.fidelidad);
    const real = state.color === 'video';
    gl.uniform1f(U.uReal, real ? 1 : 0);
    gl.uniform3fv(U.uAccent, real ? [1, 1, 1] : hexToRgb(state.color));
    gl.uniform1f(U.uSplit, state.comparar ? c.splitX : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function loop() {
    for (const c of cards) {
      if (!c.visible) continue;
      const v = c.video;
      if (v.readyState < 2 || !v.videoWidth) continue;
      if (!c.uploaded || v.currentTime !== c.lastT) {
        const gl = c.g.gl;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, c.g.vidTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        c.lastT = v.currentTime;
        c.uploaded = true;
        c.dirty = true;
      }
      if (c.dirty) { dibujar(c); c.dirty = false; }
    }
    requestAnimationFrame(loop);
  }

  const marcarTodo = () => cards.forEach(c => { c.dirty = true; });

  // ---------- Panel de controles ----------
  function iniciarPanel() {
    const panel = document.getElementById('asciiPanel');
    if (!panel) return;
    const $ = id => document.getElementById(id);
    const cols = $('asciiCols'), fid = $('asciiFid'), con = $('asciiCon'), cmp = $('asciiCompare');
    const swatches = panel.querySelectorAll('.ascii-swatch');

    const sync = () => {
      if (cols) cols.value = state.columnas;
      if (fid) fid.value = state.fidelidad;
      if (con) con.value = state.contraste;
      if (cmp) cmp.checked = state.comparar;
      swatches.forEach(s => s.setAttribute('aria-pressed', String(s.dataset.color === state.color)));
      salidas();
    };
    const salidas = () => {
      const ref = cards[0] && cards[0].wrap;
      const filas = ref && ref.clientWidth
        ? filasPara(state.columnas, ref.clientWidth, ref.clientHeight)
        : Math.round(state.columnas * 0.6 * 9 / 16);
      if ($('asciiColsOut')) $('asciiColsOut').textContent = `${state.columnas} × ${filas}`;
      if ($('asciiFidOut')) $('asciiFidOut').textContent = Math.round(state.fidelidad * 100) + '%';
      if ($('asciiConOut')) $('asciiConOut').textContent = Number(state.contraste).toFixed(2);
    };
    const cambio = () => { salidas(); marcarTodo(); guardar(); };

    cols && cols.addEventListener('input', () => { state.columnas = +cols.value; cambio(); });
    fid && fid.addEventListener('input', () => { state.fidelidad = +fid.value; cambio(); });
    con && con.addEventListener('input', () => { state.contraste = +con.value; cambio(); });
    cmp && cmp.addEventListener('change', () => {
      state.comparar = cmp.checked;
      cards.forEach(actualizarSplit);
      guardar();
    });
    swatches.forEach(s => s.addEventListener('click', () => {
      state.color = s.dataset.color;
      swatches.forEach(o => o.setAttribute('aria-pressed', String(o === s)));
      marcarTodo();
      guardar();
    }));
    const reset = $('asciiReset');
    reset && reset.addEventListener('click', () => {
      Object.assign(state, CONFIG);
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      sync();
      cards.forEach(actualizarSplit);
      marcarTodo();
    });

    api.refreshOutputs = salidas;
    sync();
    panel.hidden = false;
  }

  // ---------- Arranque ----------
  function iniciar() {
    construirAtlas();
    cards = cardEls.map(iniciarTarjeta).filter(Boolean);
    if (!cards.length) return;
    api.supported = true;

    let pausado = false;
    const ro = new ResizeObserver(entries => entries.forEach(e => {
      const c = cards.find(k => k.wrap === e.target);
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.canvas.width = Math.max(1, Math.round(e.contentRect.width * dpr));
      c.canvas.height = Math.max(1, Math.round(e.contentRect.height * dpr));
      c.dirty = true;
      if (c === cards[0] && api.refreshOutputs) api.refreshOutputs();
    }));
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      const c = cards.find(k => k.card === e.target);
      if (!c) return;
      c.visible = e.isIntersecting;
      if (c.visible && !pausado && !reduceMotion) c.video.play().catch(() => {});
      if (!c.visible) c.video.pause();
    }), { threshold: 0.15 });
    cards.forEach(c => { ro.observe(c.wrap); io.observe(c.card); });

    // El lightbox pausa los renders mientras está abierto
    api.pause = () => { pausado = true; cards.forEach(c => c.video.pause()); };
    api.resume = () => {
      pausado = false;
      if (!reduceMotion) cards.forEach(c => { if (c.visible) c.video.play().catch(() => {}); });
    };

    iniciarPanel();
    requestAnimationFrame(loop);
  }

  const fuente = document.fonts && document.fonts.load
    ? document.fonts.load('500 64px "IBM Plex Mono"').catch(() => {})
    : Promise.resolve();
  Promise.race([fuente, new Promise(r => setTimeout(r, 2000))]).then(iniciar);
})();
