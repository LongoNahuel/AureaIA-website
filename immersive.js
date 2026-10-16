/* ==========================================================================
   AureaIA — Recorrido inmersivo por el entrenamiento de una red neuronal

   El fondo es un viaje continuo: al bajar, la cámara entra en un cerebro y
   recorre por dentro una red neuronal multicapa real (fondo/red.js) mientras
   se entrena con dígitos escritos a mano.

     01 Datos            (#inicio)     una galaxia con los 500 ejemplos de
                                       entrenamiento; uno entra al cerebro
     02 Forward          (#servicios)  la señal avanza capa por capa al ritmo
                                       del scroll: entrada 14×14, convolución,
                                       max pooling, densas 32 y 16, softmax 10
     03 Backpropagation  (#historias)  se calcula la pérdida, la cámara gira y
                                       el gradiente vuelve hacia la entrada;
                                       los pesos se actualizan
     04 Entrenamiento    (#contacto)   la red entrena en vivo por épocas; el
                                       espacio latente (embeddings de la capa
                                       de 16) se ordena por dígito

   Pesos, activaciones, gradientes, pérdida y precisión son los de la red.
   Three.js con bloom (UnrealBloomPass) y niebla. Sin WebGL, el sitio usa
   particles.js como antes.
   ========================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { crearDatos, crearRed, crearEntrenador, pca3, N, NC, NCONV, NPOOL, NIN, NH1, NH2, NOUT } from './fondo/red.js';

const ETAPAS = [
  { id: 'inicio', nombre: 'Datos' },
  { id: 'servicios', nombre: 'Forward' },
  { id: 'historias', nombre: 'Backpropagation' },
  { id: 'contacto', nombre: 'Entrenamiento' },
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const compacto = coarse || Math.min(window.innerWidth, window.innerHeight) < 700;
const Q = compacto ? { puntos: 9000, niebla: 0.0065 } : { puntos: 26000, niebla: 0.0055 };

const FONDO = 0x0a0a0a;
const CIAN = new THREE.Color(0x00ccff);
const VIOLETA = new THREE.Color(0.55, 0.45, 1.0);
const BLANCO = new THREE.Color(0xe8f6ff);

// profundidad de cada capa (la señal avanza hacia -z)
const Z = { gal: 70, in: 26, conv: 18, pool: 11, h1: 1, h2: -8, out: -17, perdida: -22 };
const ESC_CEREBRO = 2.4;

// ---------- Utilidades ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261016);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const num = (v, d = 2) => v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const argmax = a => { let m = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i; return m; };
const maxAbs = a => { let m = 1e-9; for (const v of a) m = Math.max(m, Math.abs(v)); return m; };

// Ruido de Perlin 3D (para las circunvoluciones de la corteza)
const PERM = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return [...p, ...p];
})();
function ruido(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Zc = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  const u = f(x), v = f(y), w = f(z);
  const g = (h, x, y, z) => {
    const k = h & 15, a = k < 8 ? x : y, b = k < 4 ? y : (k === 12 || k === 14 ? x : z);
    return ((k & 1) ? -a : a) + ((k & 2) ? -b : b);
  };
  const A = PERM[X] + Y, AA = PERM[A] + Zc, AB = PERM[A + 1] + Zc, B = PERM[X + 1] + Y, BA = PERM[B] + Zc, BB = PERM[B + 1] + Zc;
  return lerp(lerp(lerp(g(PERM[AA], x, y, z), g(PERM[BA], x - 1, y, z), u),
                   lerp(g(PERM[AB], x, y - 1, z), g(PERM[BB], x - 1, y - 1, z), u), v),
              lerp(lerp(g(PERM[AA + 1], x, y, z - 1), g(PERM[BA + 1], x - 1, y, z - 1), u),
                   lerp(g(PERM[AB + 1], x, y - 1, z - 1), g(PERM[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}

// ---------- Cerebro procedural (la red vive adentro) ----------
function construirCerebro() {
  const T = new Float32Array(Q.puntos * 3), S = new Float32Array(Q.puntos * 3), F = new Float32Array(Q.puntos);
  const R = [6.4, 8.2, 12.5], CX = 2.7, RMED = 2.3;
  for (let i = 0; i < Q.puntos; i++) {
    const r0 = rand();
    let p, f;
    if (r0 < 0.86) { // corteza
      const lado = rand() < 0.5 ? -1 : 1;
      const u = V(gauss(), gauss(), gauss()).normalize();
      const rx = u.x * lado < 0 ? RMED : R[0];
      p = V(lado * CX + u.x * rx, 1.2 + u.y * R[1], u.z * R[2]);
      if (p.y < -3.2) p.y = -3.2 + (p.y + 3.2) * 0.45;
      p.z -= Math.max(0, -u.y) * 1.6 * Math.max(0, u.z);
      const n = Math.abs(ruido(p.x * 0.42, p.y * 0.42, p.z * 0.42));
      f = Math.pow(1 - n, 3);
      p.addScaledVector(V(u.x / rx, u.y / R[1], u.z / R[2]).normalize(), (f - 0.45) * 1.25);
      if (Math.abs(p.x) < 0.45) p.x = Math.sign(p.x || lado) * 0.45;
    } else if (r0 < 0.96) { // cerebelo
      const u = V(gauss(), gauss(), gauss()).normalize();
      p = V(u.x * 8.2, -6.3 + u.y * 3.6, -8.6 + u.z * 4.8);
      f = 0.55 + 0.45 * Math.sin(p.y * 7.5) ** 2;
      p.addScaledVector(u, (f - 0.5) * 0.35);
    } else { // tronco
      const t = rand(), a = rand() * Math.PI * 2, rr = 1.7 * (1 - t * 0.25);
      p = V(Math.cos(a) * rr, -4.5 - t * 9.5, -3.5 - t * 1.6 + Math.sin(a) * rr);
      f = 0.35;
    }
    p.multiplyScalar(ESC_CEREBRO);
    T.set([p.x, p.y, p.z], i * 3);
    F[i] = f;
    S.set([(rand() * 2 - 1) * 140, (rand() * 2 - 1) * 80, -rand() * 200 + 120], i * 3);
  }
  return { T, S, F };
}

// ---------- Posiciones de las neuronas de cada capa ----------
function posicionesRed() {
  const capas = [];
  const add = (nombre, n, fn) => capas.push({ nombre, n, pos: Array.from({ length: n }, (_, i) => fn(i)) });
  add('in', N * N, i => V(((i % N) - 6.5) * 0.85, (6.5 - Math.floor(i / N)) * 0.85, Z.in));
  const off = f => [((f % 2) - 0.5) * 6.6, (0.5 - Math.floor(f / 2)) * 6.6];
  add('conv', NC * NCONV * NCONV, i => {
    const f = Math.floor(i / (NCONV * NCONV)), r = i % (NCONV * NCONV), [ox, oy] = off(f);
    return V(ox + ((r % NCONV) - 5.5) * 0.45, oy + (5.5 - Math.floor(r / NCONV)) * 0.45, Z.conv);
  });
  add('pool', NIN, i => {
    const f = Math.floor(i / (NPOOL * NPOOL)), r = i % (NPOOL * NPOOL), [ox, oy] = off(f);
    return V(ox + ((r % NPOOL) - 2.5) * 0.9, oy + (2.5 - Math.floor(r / NPOOL)) * 0.9, Z.pool);
  });
  add('h1', NH1, i => V(((i % 8) - 3.5) * 1.6, (1.5 - Math.floor(i / 8)) * 1.6, Z.h1));
  add('h2', NH2, i => V(((i % 4) - 1.5) * 2.2, (1.5 - Math.floor(i / 4)) * 2.2, Z.h2));
  add('out', NOUT, i => V((i - 4.5) * 1.4, 0, Z.out));
  let o = 0;
  for (const c of capas) { c.ini = o; o += c.n; }
  return { capas, total: o, por: Object.fromEntries(capas.map(c => [c.nombre, c])) };
}

// ---------- Shaders ----------
const cerebroVS = /* glsl */`
attribute vec3 aT;
attribute vec3 aSeed;
attribute float aFold;
uniform float uTime, uCompose, uPixel, uSize, uOpacity, uFog, uWaveZ, uWaveOn;
uniform vec3 uWaveColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = aSeed.x * 0.5;
  float t = smoothstep(d, d + 0.5, uCompose);
  vec3 suelto = position + vec3(sin(uTime * 0.25 + aSeed.y * 6.2832) * 3.0, cos(uTime * 0.2 + aSeed.z * 6.2832) * 2.0, 0.0);
  vec3 p = mix(suelto, aT, t);
  p += t * (1.0 - t) * 4.0 * (aSeed - 0.5) * 24.0;
  p += aT * 0.008 * sin(uTime * 1.1 + aSeed.y * 6.2832) * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.5);
  float onda = exp(-pow((aT.z - uWaveZ) / 5.0, 2.0)) * uWaveOn * t;
  float lum = mix(0.25, 1.0, aFold);
  gl_PointSize = uSize * uPixel * (0.6 + lum * 0.8 + onda * 1.2) * (300.0 / depth);
  vec3 c = mix(vec3(0.0, 0.4, 1.0), vec3(0.0, 0.8, 1.0), clamp(aFold * 0.8 + aSeed.y * 0.2, 0.0, 1.0));
  vColor = mix(c, uWaveColor, clamp(onda, 0.0, 1.0));
  vAlpha = (0.14 + lum * 0.5 + onda * 0.6) * mix(0.45, 1.0, t) * uOpacity
         * exp(-pow(uFog * depth, 2.0)) * smoothstep(4.0, 16.0, depth);
}`;
const suaveFS = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  gl_FragColor = vec4(vColor, exp(-r * 4.5) * vAlpha);
}`;

// Neuronas: brillo por activación (forward) y violeta por gradiente (backpropagation)
const neuronaVS = /* glsl */`
attribute float aAct;
attribute float aGrad;
attribute float aTam;
uniform float uPixel, uOpacity, uFog, uWaveF, uWaveB, uBack, uTime;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.5);
  float llego = smoothstep(uWaveF - 0.6, uWaveF + 0.6, p.z);          // la señal ya pasó por esta capa
  float frente = exp(-pow((p.z - uWaveF) / 1.4, 2.0));
  float volvio = (1.0 - smoothstep(uWaveB - 0.6, uWaveB + 0.6, p.z)) * uBack;
  float frenteB = exp(-pow((p.z - uWaveB) / 1.4, 2.0)) * uBack;
  float act = aAct * llego;
  float grad = sqrt(aGrad) * volvio;
  vec3 base = vec3(0.0, 0.18, 0.45);
  vec3 c = mix(base, vec3(0.0, 0.8, 1.0), clamp(act * 1.3, 0.0, 1.0));
  c = mix(c, vec3(0.9, 0.97, 1.0), clamp(act - 0.6, 0.0, 1.0) + frente * 0.5);
  c = mix(c, vec3(0.62, 0.5, 1.0), clamp(grad * 1.2 + frenteB * 0.4, 0.0, 1.0));
  gl_PointSize = aTam * uPixel * (0.55 + act * 0.9 + grad * 0.9 + frente * 0.5 + frenteB * 0.5) * (300.0 / depth);
  vColor = c;
  vAlpha = (0.24 + act * 0.6 + grad * 0.7 + frente * 0.3) * uOpacity * clamp(aTam * aTam * 1.4, 0.12, 1.0)
         * exp(-pow(uFog * depth, 2.0)) * smoothstep(2.0, 7.0, depth);
}`;

// Conexiones: color por signo del peso, brillo por |peso|; el frente de la señal y el gradiente las iluminan
const conexionVS = /* glsl */`
attribute float aW;
attribute float aG;
uniform float uOpacity, uFog, uWaveF, uWaveB, uBack;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.5);
  float w = abs(aW);
  float frente = exp(-pow((position.z - uWaveF) / 2.2, 2.0)) * (1.0 - uBack);
  float llego = smoothstep(uWaveF - 1.0, uWaveF + 1.0, position.z) * (1.0 - uBack);
  float frenteB = exp(-pow((position.z - uWaveB) / 2.2, 2.0)) * uBack;
  float volvio = (1.0 - smoothstep(uWaveB - 1.0, uWaveB + 1.0, position.z)) * uBack;
  float g = sqrt(aG);
  vec3 c = aW >= 0.0 ? vec3(0.0, 0.8, 1.0) : vec3(0.45, 0.38, 1.0);
  c = mix(c, vec3(0.95, 0.9, 1.0), clamp(g * volvio + frenteB * g, 0.0, 1.0));
  float a = 0.015 + 0.09 * w + llego * 0.1 * w + frente * (0.06 + 0.32 * w) + volvio * g * 0.45 + frenteB * (0.05 + 0.5 * g);
  vColor = c;
  vAlpha = a * uOpacity * exp(-pow(uFog * depth, 2.0)) * smoothstep(1.0, 4.0, depth);
}`;
const lineaFS = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main() { gl_FragColor = vec4(vColor, vAlpha); }`;

// Galaxia de ejemplos: cada punto dibuja su dígito desde un atlas
const galaxiaVS = /* glsl */`
attribute float aTile;
attribute float aSel;
uniform float uPixel, uOpacity, uFog, uSize, uTime;
varying vec2 vTile;
varying float vAlpha;
varying float vSel;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.5);
  gl_PointSize = uSize * uPixel * (1.0 + aSel * 1.4) * (300.0 / depth);
  vTile = vec2(mod(aTile, 25.0), floor(aTile / 25.0));
  vSel = aSel;
  vAlpha = uOpacity * (0.55 + 0.45 * aSel) * exp(-pow(uFog * depth, 2.0)) * smoothstep(3.0, 12.0, depth);
}`;
const galaxiaFS = /* glsl */`
uniform sampler2D uAtlas;
varying vec2 vTile;
varying float vAlpha;
varying float vSel;
void main() {
  vec2 uv = (vTile * 14.0 + gl_PointCoord * 14.0) / vec2(350.0, 280.0);
  float v = texture2D(uAtlas, uv).r;
  vec2 q = abs(gl_PointCoord * 2.0 - 1.0);
  float borde = step(0.9, max(q.x, q.y)) * (0.25 + 0.75 * vSel);
  vec3 c = mix(vec3(0.0, 0.55, 1.0), vec3(0.85, 0.96, 1.0), v) ;
  c = mix(c, vec3(1.0), vSel * v * 0.5);
  float a = max(v, borde) * vAlpha + 0.04 * vAlpha;
  gl_FragColor = vec4(c, a);
}`;

// ---------- Etiquetas de texto en 3D ----------
function crearEtiqueta(alto = 1, ancho = 512, altoPx = 96) {
  const c = document.createElement('canvas');
  c.width = ancho; c.height = altoPx;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false }));
  s.userData = { c, tex, texto: null };
  s.scale.set(alto * ancho / altoPx, alto, 1);
  return s;
}
function escribir(sprite, lineas, { color = '#e8f6ff', fuente = '500 40px "IBM Plex Mono", Consolas, monospace', alinear = 'left' } = {}) {
  const u = sprite.userData, txt = [].concat(lineas), clave = txt.join('|') + color;
  if (u.texto === clave) return;
  u.texto = clave;
  const g = u.c.getContext('2d'), W = u.c.width, H = u.c.height;
  g.clearRect(0, 0, W, H);
  g.font = fuente;
  g.textBaseline = 'middle';
  g.textAlign = alinear;
  g.shadowColor = 'rgba(0, 204, 255, 0.5)';
  g.shadowBlur = 12;
  const x = alinear === 'center' ? W / 2 : 8;
  txt.forEach((t, i) => {
    g.fillStyle = i === 0 ? color : 'rgba(232, 246, 255, 0.75)';
    g.fillText(t, x, H / (txt.length + 1) * (i + 1));
  });
  u.tex.needsUpdate = true;
}

// ---------- Escena ----------
function iniciar() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !compacto, powerPreference: 'high-performance' });
  } catch (_) {
    return false;
  }
  if (!renderer.getContext()) return false;

  const pr = Math.min(window.devicePixelRatio || 1, compacto ? 1.25 : 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const canvas = renderer.domElement;
  canvas.className = 'immersive-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FONDO); // pasa bien por el espacio de color del compositor
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 800);
  scene.add(camera);
  const ajustarFov = () => { camera.fov = camera.aspect < 1 ? 70 : 55; camera.updateProjectionMatrix(); };
  ajustarFov();

  let composer = null;
  if (!compacto) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(pr);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.45, 0.34));
    composer.addPass(new OutputPass());
  }

  // ---------- Modelo real ----------
  const datos = crearDatos();
  const red = crearRed();
  const entrenador = crearEntrenador(datos, red);
  const { capas, total: NNEUR, por } = posicionesRed();
  let ej = 7;                     // el primer ejemplo que recorre la red: un 7
  let estado = null;              // forward + backward del ejemplo actual
  let sucio = true;               // hay que recalcular el ejemplo y los atributos
  let metrica = entrenador.evaluar(200);
  const historial = [metrica.loss];
  const recientes = [];           // últimas predicciones, para el panel

  // ---------- Cerebro ----------
  const { T, S, F } = construirCerebro();
  const gc = new THREE.BufferGeometry();
  gc.setAttribute('position', new THREE.BufferAttribute(S, 3));
  gc.setAttribute('aT', new THREE.BufferAttribute(T, 3));
  gc.setAttribute('aSeed', new THREE.BufferAttribute(Float32Array.from({ length: Q.puntos * 3 }, () => rand()), 3));
  gc.setAttribute('aFold', new THREE.BufferAttribute(F, 1));
  gc.boundingSphere = new THREE.Sphere(V(0, 0, 0), 400);
  const uCerebro = {
    uTime: { value: 0 }, uCompose: { value: 0 }, uPixel: { value: pr }, uSize: { value: compacto ? 0.62 : 0.55 },
    uOpacity: { value: 0 }, uFog: { value: Q.niebla }, uWaveZ: { value: 0 }, uWaveOn: { value: 0 }, uWaveColor: { value: CIAN.clone() },
  };
  scene.add(new THREE.Points(gc, new THREE.ShaderMaterial({
    uniforms: uCerebro, vertexShader: cerebroVS, fragmentShader: suaveFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // ---------- Galaxia de 500 ejemplos ----------
  const atlas = new Uint8Array(350 * 280 * 4);
  datos.X.forEach((img, k) => {
    const tx = k % 25, ty = Math.floor(k / 25);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = ((ty * 14 + j) * 350 + tx * 14 + i) * 4;
      atlas[o] = img[j * N + i] * 255; atlas[o + 3] = 255;
    }
  });
  const atlasTex = new THREE.DataTexture(atlas, 350, 280, THREE.RGBAFormat);
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.needsUpdate = true;
  const nG = datos.X.length;
  const galPos = new Float32Array(nG * 3), galBase = [];
  for (let k = 0; k < nG; k++) { // galaxia espiral de dos brazos frente al cerebro
    const r = 3 + 15 * Math.sqrt(rand()), brazo = (k % 2) * Math.PI, a = brazo + r * 0.32 + gauss() * 0.25;
    galBase.push([r, a, gauss() * 1.4, gauss() * 4]);
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(galPos, 3));
  gg.setAttribute('aTile', new THREE.BufferAttribute(Float32Array.from({ length: nG }, (_, k) => k), 1));
  gg.setAttribute('aSel', new THREE.BufferAttribute(new Float32Array(nG), 1));
  gg.boundingSphere = new THREE.Sphere(V(0, 0, Z.gal), 60);
  const uGal = { uPixel: { value: pr }, uOpacity: { value: 0 }, uFog: { value: Q.niebla }, uSize: { value: compacto ? 2.2 : 1.8 }, uTime: { value: 0 }, uAtlas: { value: atlasTex } };
  scene.add(new THREE.Points(gg, new THREE.ShaderMaterial({
    uniforms: uGal, vertexShader: galaxiaVS, fragmentShader: galaxiaFS, transparent: true, depthWrite: false,
  })));
  // estela del ejemplo que entra a la red
  const estelaGeo = new THREE.BufferGeometry();
  estelaGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 6), 3));
  const estelaMat = new THREE.LineBasicMaterial({ color: CIAN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const estela = new THREE.LineSegments(estelaGeo, estelaMat);
  estela.frustumCulled = false;
  scene.add(estela);

  // ---------- Red: neuronas ----------
  const nPos = new Float32Array(NNEUR * 3), nTam = new Float32Array(NNEUR);
  const tamCapa = { in: 0.5, conv: 0.22, pool: 0.42, h1: 1.0, h2: 1.15, out: 1.4 };
  capas.forEach(c => c.pos.forEach((p, i) => { nPos.set([p.x, p.y, p.z], (c.ini + i) * 3); nTam[c.ini + i] = tamCapa[c.nombre]; }));
  const gn = new THREE.BufferGeometry();
  gn.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
  gn.setAttribute('aTam', new THREE.BufferAttribute(nTam, 1));
  gn.setAttribute('aAct', new THREE.BufferAttribute(new Float32Array(NNEUR), 1));
  gn.setAttribute('aGrad', new THREE.BufferAttribute(new Float32Array(NNEUR), 1));
  const uRed = {
    uPixel: { value: pr }, uOpacity: { value: 0 }, uFog: { value: Q.niebla }, uTime: { value: 0 },
    uWaveF: { value: 40 }, uWaveB: { value: -40 }, uBack: { value: 0 },
  };
  scene.add(new THREE.Points(gn, new THREE.ShaderMaterial({
    uniforms: uRed, vertexShader: neuronaVS, fragmentShader: suaveFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // ---------- Red: conexiones densas (pool→h1, h1→h2, h2→salida) ----------
  const tramosCon = [['pool', 'h1', 'W1', NIN], ['h1', 'h2', 'W2', NH1], ['h2', 'out', 'W3', NH2]];
  const nCon = NIN * NH1 + NH1 * NH2 + NH2 * NOUT;
  const cPos = new Float32Array(nCon * 6);
  let o = 0;
  for (const [a, b, , nIn] of tramosCon) {
    const A = por[a].pos, B = por[b].pos;
    for (let j = 0; j < B.length; j++) for (let i = 0; i < nIn; i++) {
      cPos.set([A[i].x, A[i].y, A[i].z, B[j].x, B[j].y, B[j].z], o * 6); o++;
    }
  }
  const gl = new THREE.BufferGeometry();
  gl.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
  gl.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(nCon * 2), 1));
  gl.setAttribute('aG', new THREE.BufferAttribute(new Float32Array(nCon * 2), 1));
  gl.boundingSphere = new THREE.Sphere(V(0, 0, 0), 60);
  scene.add(new THREE.LineSegments(gl, new THREE.ShaderMaterial({
    uniforms: uRed, vertexShader: conexionVS, fragmentShader: lineaFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // ventana del kernel 3×3 sobre la entrada y rayos hacia la neurona de convolución
  const kernelGeo = new THREE.BufferGeometry();
  kernelGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 6), 3));
  const kernelMat = new THREE.LineBasicMaterial({ color: BLANCO, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const kernel = new THREE.LineSegments(kernelGeo, kernelMat);
  kernel.frustumCulled = false;
  scene.add(kernel);

  // ---------- Salida: barras del softmax, dígitos y pérdida ----------
  const barras = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 1, 0.12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), NOUT);
  barras.frustumCulled = false;
  for (let k = 0; k < NOUT; k++) barras.setColorAt(k, CIAN);
  scene.add(barras);
  const etiquetasDig = por.out.pos.map((p, k) => {
    const s = crearEtiqueta(0.8, 96, 96);
    escribir(s, String(k), { fuente: '600 64px "Inter", -apple-system, sans-serif', alinear: 'center' });
    s.position.set(p.x, p.y - 1.25, p.z);
    scene.add(s);
    return s;
  });
  const perdidaSprite = crearEtiqueta(2.2, 1024, 192);
  perdidaSprite.position.set(0, 7, Z.perdida);
  scene.add(perdidaSprite);

  // ---------- Nombres de las capas ----------
  const nombresCapa = [
    ['in', 'entrada', `${N}×${N} píxeles`, V(-6.2, 7.3, Z.in)],
    ['conv', 'convolución', `${NC} filtros 3×3 · ReLU`, V(-6.8, 7.4, Z.conv)],
    ['pool', 'max pooling 2×2', `${NC}×${NPOOL}×${NPOOL} = ${NIN}`, V(-6.8, 7.4, Z.pool)],
    ['h1', 'densa', `${NH1} neuronas · ReLU`, V(-6.4, 4.2, Z.h1)],
    ['h2', 'densa · embedding', `${NH2} neuronas · ReLU`, V(-4.4, 5.0, Z.h2)],
    ['out', 'softmax', `${NOUT} clases`, V(-6.8, 4.0, Z.out)],
  ].map(([id, t1, t2, p]) => {
    const s = crearEtiqueta(1.1);
    escribir(s, [t1, t2], { color: '#00ccff', fuente: '500 34px "IBM Plex Mono", Consolas, monospace' });
    s.position.copy(p);
    s.center.set(0, 0.5);
    scene.add(s);
    return s;
  });
  const filtrosSprite = crearEtiqueta(2.2, 384, 96); // los 4 filtros aprendidos
  filtrosSprite.position.set(7.2, 7.4, Z.conv);
  filtrosSprite.center.set(1, 0.5);
  scene.add(filtrosSprite);
  function dibujarFiltros() {
    const { c, tex } = filtrosSprite.userData, g = c.getContext('2d');
    g.clearRect(0, 0, 384, 96);
    const K = red.P.K, m = maxAbs(K);
    for (let f = 0; f < NC; f++) for (let i = 0; i < 9; i++) {
      const v = K[f * 9 + i] / m, x = 16 + f * 92 + (i % 3) * 24, y = 12 + Math.floor(i / 3) * 24;
      g.fillStyle = v >= 0 ? `rgba(0, 204, 255, ${0.15 + 0.85 * v})` : `rgba(140, 115, 255, ${0.15 - 0.85 * v})`;
      g.fillRect(x, y, 22, 22);
    }
    tex.needsUpdate = true;
  }

  // ---------- Espacio latente: embeddings de la capa de 16 ----------
  const nLat = 300, C_LAT = V(0, 17, -4);
  const latPos = new Float32Array(nLat * 3), latObj = new Float32Array(nLat * 3), latCol = new Float32Array(nLat * 3);
  const tono = d => new THREE.Color().setHSL(0.5 + d * 0.035, 0.9, 0.62);
  for (let k = 0; k < nLat; k++) {
    const c = tono(datos.Y[k]); latCol.set([c.r, c.g, c.b], k * 3);
    latPos.set([C_LAT.x + gauss() * 3, C_LAT.y + gauss() * 3, C_LAT.z + gauss() * 3], k * 3);
  }
  latObj.set(latPos);
  const glat = new THREE.BufferGeometry();
  glat.setAttribute('position', new THREE.BufferAttribute(latPos, 3));
  glat.setAttribute('color', new THREE.BufferAttribute(latCol, 3));
  glat.boundingSphere = new THREE.Sphere(C_LAT, 30);
  const latMat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
  scene.add(new THREE.Points(glat, latMat));
  const etiquetasLat = Array.from({ length: 10 }, (_, d) => {
    const s = crearEtiqueta(1.1, 96, 96);
    escribir(s, String(d), { color: '#' + tono(d).getHexString(), fuente: '700 64px "Inter", -apple-system, sans-serif', alinear: 'center' });
    s.position.copy(C_LAT);
    scene.add(s);
    return s;
  });
  const latTitulo = crearEtiqueta(1.2);
  escribir(latTitulo, ['espacio latente', 'capa de 16 → PCA 3D'], { color: '#00ccff', fuente: '500 34px "IBM Plex Mono", Consolas, monospace' });
  latTitulo.position.set(C_LAT.x - 8, C_LAT.y + 8, C_LAT.z);
  latTitulo.center.set(0, 0.5);
  scene.add(latTitulo);
  function actualizarLatente() {
    const P3 = pca3(datos.X.slice(0, nLat).map(x => red.forward(x).a2));
    let m = 1e-6;
    for (const p of P3) m = Math.max(m, Math.hypot(...p));
    const cent = Array.from({ length: 10 }, () => [0, 0, 0, 0]);
    P3.forEach((p, k) => {
      const q = [C_LAT.x + p[0] / m * 9, C_LAT.y + p[1] / m * 7, C_LAT.z + p[2] / m * 7];
      latObj.set(q, k * 3);
      const c = cent[datos.Y[k]]; c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; c[3]++;
    });
    cent.forEach((c, d) => etiquetasLat[d].userData.destino = V(c[0] / c[3], c[1] / c[3] + 0.9, c[2] / c[3]));
  }

  // ---------- Panel de entrenamiento (pegado a la cámara) ----------
  const panel = (() => {
    const c = document.createElement('canvas');
    c.width = 360; c.height = 300;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
    m.renderOrder = 10;
    camera.add(m);
    return { c, tex, m, t: 0 };
  })();
  function dibujarPanel() {
    const g = panel.c.getContext('2d'), W = 360, H = 300;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10, 12, 18, 0.55)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0, 204, 255, 0.5)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, H - 1);
    g.font = '500 15px "IBM Plex Mono", Consolas, monospace'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(232, 246, 255, 0.9)';
    g.fillText(`época ${num(entrenador.epoca, 1)} · lote 16 · Adam`, 12, 18);
    g.fillStyle = '#00ccff';
    g.fillText(`precisión ${Math.round(metrica.acc * 100)}%   pérdida ${num(metrica.loss, 3)}`, 12, 40);
    // curva de pérdida
    const cx = 12, cy = 58, cw = W - 24, ch = 110, h = historial, mx = Math.max(...h, 0.01);
    g.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(cx, cy + ch * i / 2); g.lineTo(cx + cw, cy + ch * i / 2); g.stroke(); }
    g.strokeStyle = '#00ccff'; g.lineWidth = 2; g.beginPath();
    h.forEach((v, i) => { const x = cx + i / Math.max(1, h.length - 1) * cw, y = cy + ch - v / mx * ch; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    g.fillStyle = 'rgba(232, 246, 255, 0.55)'; g.font = '500 12px "IBM Plex Mono", Consolas, monospace';
    g.fillText('pérdida por paso', cx, cy + ch + 12);
    // últimas predicciones
    const y0 = 200, tam = 40;
    recientes.slice(-8).forEach((r, i) => {
      const x0 = 12 + i * 43, img = datos.X[r.k];
      for (let j = 0; j < N; j++) for (let q = 0; q < N; q++) {
        const v = img[j * N + q];
        if (v < 0.05) continue;
        g.fillStyle = `rgba(200, 235, 255, ${v})`;
        g.fillRect(x0 + q * tam / N, y0 + j * tam / N, tam / N + 0.3, tam / N + 0.3);
      }
      g.strokeStyle = r.ok ? 'rgba(0, 204, 255, 0.8)' : 'rgba(140, 115, 255, 0.9)';
      g.strokeRect(x0 + 0.5, y0 + 0.5, tam, tam);
      g.fillStyle = r.ok ? '#00ccff' : '#a796ff';
      g.font = '600 15px "IBM Plex Mono", Consolas, monospace';
      g.fillText(`→${r.pred}`, x0 + 6, y0 + tam + 16);
    });
    g.fillStyle = 'rgba(232, 246, 255, 0.55)'; g.font = '500 12px "IBM Plex Mono", Consolas, monospace';
    g.fillText('predicciones del último lote', 12, H - 12);
    panel.tex.needsUpdate = true;
  }

  // ---------- Atributos a partir del modelo ----------
  function recalcular() {
    const f = red.forward(datos.X[ej]);
    const G = red.ceros();
    const b = red.backward(f, datos.Y[ej], G);
    estado = { f, b, G, y: datos.Y[ej], pred: argmax(f.p) };
    const act = gn.attributes.aAct.array, grad = gn.attributes.aGrad.array;
    const poner = (c, valores, destino) => { const m = maxAbs(valores); for (let i = 0; i < c.n; i++) destino[c.ini + i] = Math.abs(valores[i]) / m; };
    poner(por.in, f.x, act);
    poner(por.conv, f.c.map(v => Math.max(0, v)), act);
    poner(por.pool, f.a0, act);
    poner(por.h1, f.a1, act);
    poner(por.h2, f.a2, act);
    for (let k = 0; k < NOUT; k++) act[por.out.ini + k] = f.p[k];
    grad.fill(0, por.in.ini, por.in.ini + por.in.n);
    poner(por.conv, b.dc, grad);
    poner(por.pool, b.d0, grad);
    poner(por.h1, b.d1, grad);
    poner(por.h2, b.d2, grad);
    poner(por.out, b.d3, grad);
    gn.attributes.aAct.needsUpdate = true;
    gn.attributes.aGrad.needsUpdate = true;
    // conexiones: peso normalizado y gradiente del ejemplo
    const aW = gl.attributes.aW.array, aG = gl.attributes.aG.array;
    let k = 0;
    for (const [, , nombre, nIn] of tramosCon) {
      const Wm = red.P[nombre], Gm = G[nombre], mw = maxAbs(Wm), mg = maxAbs(Gm);
      const nOut = Wm.length / nIn;
      for (let j = 0; j < nOut; j++) for (let i = 0; i < nIn; i++) {
        const w = Wm[j * nIn + i] / mw, g = Math.abs(Gm[j * nIn + i]) / mg;
        aW[k] = aW[k + 1] = w; aG[k] = aG[k + 1] = g; k += 2;
      }
    }
    gl.attributes.aW.needsUpdate = true;
    gl.attributes.aG.needsUpdate = true;
    // barras del softmax
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    por.out.pos.forEach((p, d) => {
      const h = Math.max(0.04, f.p[d] * 6);
      m4.compose(V(p.x, p.y + 0.9 + h / 2, p.z), new THREE.Quaternion(), V(1, h, 1));
      barras.setMatrixAt(d, m4);
      barras.setColorAt(d, d === estado.y ? col.copy(BLANCO) : d === estado.pred ? col.copy(VIOLETA) : col.copy(CIAN).multiplyScalar(0.7));
    });
    barras.instanceMatrix.needsUpdate = true;
    barras.instanceColor.needsUpdate = true;
    escribir(perdidaSprite, [`pérdida ${num(b.loss)}`, `objetivo ${estado.y} → predijo ${estado.pred}`],
      { color: estado.pred === estado.y ? '#00ccff' : '#b7a8ff', fuente: '600 56px "IBM Plex Mono", Consolas, monospace', alinear: 'center' });
    dibujarFiltros();
    sucio = false;
  }

  // ---------- Recorrido según el scroll ----------
  const anclas = ETAPAS.map(e => document.getElementById(e.id));
  let A = [0, 1, 2, 3, 4];
  const medir = () => {
    const vh = window.innerHeight;
    const tops = anclas.map(a => (a ? a.getBoundingClientRect().top + window.scrollY : 0));
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    A = [0, tops[1] - vh * 0.35, tops[2] - vh * 0.35, tops[3] - vh * 0.35, max];
    for (let i = 1; i < A.length; i++) A[i] = Math.max(A[i], A[i - 1] + 1);
  };
  medir();
  new ResizeObserver(medir).observe(document.body);
  window.addEventListener('load', medir);
  const etapaScroll = () => { // 0 a 4: inicio, servicios, historias, contacto
    const y = window.scrollY;
    for (let i = 0; i < 4; i++) if (y < A[i + 1]) return i + clamp((y - A[i]) / (A[i + 1] - A[i]), 0, 1);
    return 4;
  };

  // paradas de cámara: afuera → galaxia → adentro de la red → giro → vuelta → afuera
  const PARADAS = [
    { s: 0.00, cam: V(30, 12, 118), foco: V(0, 2, 28), corre: 17 },
    { s: 0.50, cam: V(20, 8, 100), foco: V(0, 0, 46), corre: 11 },
    { s: 0.90, cam: V(9, 4, 66), foco: V(0, 0, 30), corre: 6 },
    { s: 1.10, cam: V(3, 2.5, 40), foco: V(0, 0, 24), corre: 1.5 },
    { s: 1.40, cam: V(-6, 4, 27), foco: V(0, 0, 12), corre: 0 },
    { s: 1.65, cam: V(7, 3.5, 15), foco: V(0, 0, 0), corre: 0 },
    { s: 1.90, cam: V(-6, 2.5, 4), foco: V(0, 0, -12), corre: 0 },
    { s: 2.15, cam: V(2, 2.5, -6), foco: V(0, 2.5, -20), corre: 0 },
    { s: 2.40, cam: V(7, 5, -33), foco: V(0, 1, -15), corre: 0 },
    { s: 2.65, cam: V(-6, 3.5, -18), foco: V(0, 0, 0), corre: 0 },
    { s: 2.85, cam: V(6, -1, 0), foco: V(0, 0, 15), corre: 0 },
    { s: 3.05, cam: V(-2, 3, 13), foco: V(0, 0, 27), corre: 0 },
    { s: 3.45, cam: V(46, 26, 52), foco: V(0, 4, 2), corre: 14 },
    { s: 4.00, cam: V(62, 16, 70), foco: V(0, 2, 0), corre: 20 },
  ];
  const rutaCam = new THREE.CatmullRomCurve3(PARADAS.map(p => p.cam), false, 'centripetal');
  const rutaMira = new THREE.CatmullRomCurve3(PARADAS.map(p => p.foco), false, 'centripetal');
  const tramo = s => {
    for (let i = 0; i < PARADAS.length - 1; i++) if (s <= PARADAS[i + 1].s) return [i, (s - PARADAS[i].s) / (PARADAS[i + 1].s - PARADAS[i].s)];
    return [PARADAS.length - 2, 1];
  };
  const derecha = V(0, 0, 0), arriba = V(0, 1, 0);

  const mouseT = new THREE.Vector2(0, 0), mouseS = new THREE.Vector2(0, 0);
  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    mouseT.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight * 2 - 1));
  }, { passive: true });
  document.addEventListener('pointerleave', () => mouseT.set(0, 0));

  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    ajustarFov();
    if (composer) composer.setSize(w, h);
    medir();
  }, { passive: true });

  let introInicio = reduceMotion ? 0 : -1;
  const empezarIntro = () => { if (introInicio < 0) introInicio = performance.now() + 450; };
  if (document.readyState === 'complete') empezarIntro();
  else window.addEventListener('load', empezarIntro);

  const telemetria = crearTelemetria();
  const modal = document.getElementById('videoModal');
  const pos = V(0, 0, 0), mira = V(0, 0, 0);
  let sCur = etapaScroll(), tPrev = performance.now(), tiempo = 0, hudT = 0;
  let actualizado = false, acumPasos = 0, cicloT = 0, latT = 0, latListo = false;
  let ultimoPaso = null, ultimoLote = [7], loteVisible = new Set([7]);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - tPrev) / 1000);
    const dtr = Math.min(0.25, (now - tPrev) / 1000);
    tPrev = now;
    if (modal && modal.classList.contains('show')) return;
    if (!reduceMotion) tiempo += dt;

    let intro = 1;
    if (!reduceMotion) intro = introInicio > 0 && now > introInicio ? Math.min(1, (now - introInicio) / 2600) : 0;
    const ease = 1 - Math.pow(1 - intro, 3);

    sCur += (etapaScroll() - sCur) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 3));
    const s = sCur;
    const angosto = camera.aspect < 1.1;

    // ---- fases del entrenamiento ----
    const entrena = s >= 3.08;
    const fwd = smooth(1.0, 2.15, s);                 // la señal avanza con el scroll
    const back = smooth(2.42, 3.0, s);                // el gradiente vuelve con el scroll
    let waveF = lerp(Z.in + 3, Z.out - 4, fwd), waveB = lerp(Z.out - 4, Z.in + 3, back), uBack = s > 2.35 ? 1 : 0;

    // actualización de pesos al terminar la backpropagation
    if (s > 2.98 && !actualizado && estado) {
      red.aplicar(estado.G, 1, 0.003);
      actualizado = true; sucio = true;
      ultimoPaso = 'actualizacion';
    }
    if (s < 2.6) actualizado = false;

    // entrenamiento en vivo por épocas (~18 lotes por segundo)
    if (entrena) {
      acumPasos += dtr * 18;
      while (acumPasos >= 1) {
        acumPasos--;
        const r = entrenador.paso();
        historial.push(r.loss);
        if (historial.length > 240) historial.shift();
        ultimoLote = r.indices;
      }
      cicloT += dtr;
      if (cicloT > 0.9) { // un ejemplo del lote recorre la red: adelante y atrás
        cicloT = 0;
        ej = ultimoLote[0];
        loteVisible = new Set(ultimoLote);
        sucio = true;
        metrica = entrenador.evaluar(200);
        for (const k of [ej, ...Array.from({ length: 3 }, () => Math.floor(Math.random() * datos.X.length))]) {
          const p = argmax(red.forward(datos.X[k]).p);
          recientes.push({ k, pred: p, ok: p === datos.Y[k] });
        }
        if (recientes.length > 16) recientes.splice(0, recientes.length - 16);
      }
      const c = cicloT / 0.9;
      if (c < 0.5) { waveF = lerp(Z.in + 3, Z.out - 4, c * 2); uBack = 0; waveB = Z.out - 4; }
      else { waveF = Z.out - 4; uBack = 1; waveB = lerp(Z.out - 4, Z.in + 3, (c - 0.5) * 2); }
      latT += dtr;
      if (latT > 0.6) { latT = 0; actualizarLatente(); latListo = true; }
      panel.t += dtr;
      if (panel.t > 0.25) { panel.t = 0; dibujarPanel(); }
    } else if (s < 1.0 && ej !== 7 && entrenador.epoca === 0) { ej = 7; sucio = true; }
    if (sucio) recalcular();

    uRed.uWaveF.value = waveF;
    uRed.uWaveB.value = waveB;
    uRed.uBack.value = uBack;

    // ---- visibilidad ----
    const dentro = smooth(0.85, 1.15, s) * (1 - smooth(3.6, 4.0, s) * 0.35);
    uRed.uOpacity.value = ease * Math.max(dentro, 0.25 * smooth(0.3, 0.9, s));
    uCerebro.uCompose.value = 0.5 * ease + 0.5 * smooth(0.05, 0.85, s);
    uCerebro.uOpacity.value = ease * (1 - 0.55 * smooth(1.0, 1.3, s) * (1 - smooth(3.1, 3.5, s)));
    uCerebro.uWaveOn.value = entrena ? 1 : 0;
    uCerebro.uWaveZ.value = uBack ? waveB * ESC_CEREBRO * 0.6 : waveF * ESC_CEREBRO * 0.6;
    uCerebro.uWaveColor.value.copy(uBack ? VIOLETA : CIAN);
    uCerebro.uTime.value = tiempo;
    uGal.uOpacity.value = ease * (1 - smooth(1.2, 1.5, s) * (1 - smooth(3.1, 3.5, s)));
    const conv = smooth(1.05, 1.2, s) * (1 - smooth(1.55, 1.7, s));
    kernelMat.opacity = conv;
    barras.material.opacity = smooth(1.85, 2.05, s) * (1 - smooth(2.3, 2.45, s)) + smooth(3.2, 3.5, s) * 0.55;
    etiquetasDig.forEach(e => { e.material.opacity = barras.material.opacity; });
    perdidaSprite.material.opacity = smooth(1.95, 2.1, s) * (1 - smooth(2.28, 2.4, s));
    const vNombres = smooth(1.0, 1.2, s) * (1 - smooth(3.1, 3.3, s));
    nombresCapa.forEach(e => { e.material.opacity = vNombres; });
    filtrosSprite.material.opacity = vNombres;
    const vLat = latListo ? smooth(3.1, 3.4, s) : 0;
    latMat.opacity = vLat;
    latTitulo.material.opacity = vLat;
    etiquetasLat.forEach(e => {
      e.material.opacity = vLat;
      if (e.userData.destino) e.position.lerp(e.userData.destino, 1 - Math.exp(-dt * 3));
    });
    const lp = glat.attributes.position.array;
    for (let i = 0; i < lp.length; i++) lp[i] += (latObj[i] - lp[i]) * (1 - Math.exp(-dt * 3));
    glat.attributes.position.needsUpdate = true;

    // ---- galaxia de ejemplos ----
    const sel = gg.attributes.aSel.array;
    const enLote = entrena ? loteVisible : new Set([ej]);
    for (let k = 0; k < nG; k++) {
      const [r, a, y, z] = galBase[k], ang = a + tiempo * 0.04 * (8 / (r + 2));
      galPos[k * 3] = Math.cos(ang) * r;
      galPos[k * 3 + 1] = Math.sin(ang) * r * 0.75 + y;
      galPos[k * 3 + 2] = Z.gal + z;
      sel[k] = enLote.has(k) ? 1 : 0;
    }
    gg.attributes.position.needsUpdate = true;
    gg.attributes.aSel.needsUpdate = true;
    // estela: del ejemplo a la capa de entrada
    const ep = estelaGeo.attributes.position.array;
    const desde = V(galPos[ej * 3], galPos[ej * 3 + 1], galPos[ej * 3 + 2]), hasta = V(0, 0, Z.in);
    for (let i = 0; i < 16; i++) {
      const t0 = i / 16, t1 = (i + 1) / 16;
      const a = desde.clone().lerp(hasta, t0), b = desde.clone().lerp(hasta, t1);
      a.y += Math.sin(t0 * Math.PI) * 4; b.y += Math.sin(t1 * Math.PI) * 4;
      ep.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    }
    estelaGeo.attributes.position.needsUpdate = true;
    estelaMat.opacity = ease * (smooth(0.4, 0.9, s) * (1 - smooth(1.3, 1.5, s)) + (entrena ? 0.6 : 0)) * 0.7;

    // ---- kernel de convolución recorriendo la entrada ----
    if (conv > 0.01) {
      const paso = Math.floor(tiempo * 40) % (NCONV * NCONV), f = Math.floor(tiempo * 40 / (NCONV * NCONV)) % NC;
      const x = paso % NCONV, y = Math.floor(paso / NCONV);
      const inp = (gx, gy) => V((gx - 7) * 0.85, (7 - gy) * 0.85, Z.in);
      const dest = por.conv.pos[f * NCONV * NCONV + y * NCONV + x];
      const kp = kernelGeo.attributes.position.array;
      let q = 0;
      const seg = (a, b) => { kp.set([a.x, a.y, a.z, b.x, b.y, b.z], q * 6); q++; };
      const c0 = inp(x, y), c1 = inp(x + 3, y), c2 = inp(x + 3, y + 3), c3 = inp(x, y + 3);
      seg(c0, c1); seg(c1, c2); seg(c2, c3); seg(c3, c0);
      [c0, c1, c2, c3].forEach(c => seg(c, dest));
      kernelGeo.attributes.position.needsUpdate = true;
      kernelGeo.setDrawRange(0, 16);
    }

    // ---- panel ----
    panel.m.material.opacity = angosto ? 0 : smooth(3.3, 3.6, s) * ease;
    if (!angosto) {
      const D = 18, hh = D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), hw = hh * camera.aspect;
      const px = Math.min(300, window.innerHeight * 0.34, window.innerWidth * 0.2);
      const alto = px / 1.2 / window.innerHeight * 2 * hh;
      panel.m.scale.set(alto, alto, 1);
      const nx = 1 - (px / 2 + Math.max(24, (window.innerWidth - 1160) / 2 + 16)) / (window.innerWidth / 2);
      panel.m.position.set(nx * hw, -0.12 * hh, -D);
      panel.m.rotation.y = -0.2;
    }

    // ---- cámara ----
    mouseS.lerp(mouseT, 1 - Math.exp(-dt * 2.5));
    const [ti, tf] = tramo(s);
    const u = (ti + tf) / (PARADAS.length - 1);
    rutaCam.getPoint(u, pos);
    rutaMira.getPoint(u, mira);
    derecha.subVectors(mira, pos).cross(arriba).normalize();
    const corre = lerp(PARADAS[ti].corre, PARADAS[ti + 1].corre, tf);
    if (angosto) pos.addScaledVector(pos.clone().sub(mira).normalize(), corre * 0.8);
    else mira.addScaledVector(derecha, -corre);
    pos.x -= mouseS.x * 1.6; pos.y += mouseS.y * 1.1;
    pos.z += (1 - ease) * 60;
    camera.position.copy(pos);
    camera.lookAt(mira.x - mouseS.x * 1.2, mira.y + mouseS.y * 0.8, mira.z);
    // leve alabeo en las curvas del recorrido
    camera.rotateZ(clamp((rutaCam.getPoint(Math.min(1, u + 0.01)).x - pos.x) * 0.01, -0.05, 0.05));

    if (composer) composer.render(); else renderer.render(scene, camera);

    // ---- telemetría ----
    hudT += dt;
    if (hudT > 0.1 && estado) {
      hudT = 0;
      telemetria.actualizar({ s, waveF, waveB, uBack, entrena, estado, ej, metrica, historial, epoca: entrenador.epoca, ultimoPaso, red });
    }
  }

  requestAnimationFrame(frame);
  return true;
}

// ---------- Telemetría en una franja debajo del menú ----------
function crearTelemetria() {
  const fila = document.createElement('div');
  fila.className = 'vms-row';
  fila.innerHTML = '<div class="container"></div>';
  document.getElementById('navbar')?.append(fila);
  const barra = document.createElement('div');
  barra.className = 'vms-strip';
  barra.setAttribute('aria-label', 'Estado del entrenamiento de la red del fondo');
  barra.innerHTML = `
    <span class="vms-live"><i></i>Red</span>
    <span class="vms-stage"></span>
    <span class="vms-layer"></span>
    <span class="vms-shape"></span>
    <canvas class="vms-spark" width="120" height="28" hidden></canvas>
    <span class="vms-steps" aria-hidden="true">${'<b></b>'.repeat(12)}</span>`;
  fila.firstElementChild.append(barra);
  const $ = q => barra.querySelector(q);
  const spark = $('.vms-spark'), sg = spark.getContext('2d');
  const pasos = barra.querySelectorAll('.vms-steps b');
  const set = (q, t) => { const el = $(q); if (el.textContent !== t) el.textContent = t; };
  const capaEn = z => (z > (Z.in + Z.conv) / 2 ? 'in' : z > (Z.conv + Z.pool) / 2 ? 'conv' : z > (Z.pool + Z.h1) / 2 ? 'pool' : z > (Z.h1 + Z.h2) / 2 ? 'h1' : z > (Z.h2 + Z.out) / 2 ? 'h2' : 'out');

  return {
    actualizar(d) {
      const e = clamp(Math.floor(d.s), 0, 3);
      set('.vms-stage', `${String(e + 1).padStart(2, '0')} ${ETAPAS[e].nombre}`);
      const { f, b, y, pred } = d.estado;
      let capa = '', forma = '';
      if (d.entrena) {
        capa = `época ${num(d.epoca, 1)} · pérdida ${num(d.metrica.loss, 3)} · precisión ${Math.round(d.metrica.acc * 100)}%`;
        const nPesos = Object.values(d.red.P).reduce((a, p) => a + p.length, 0);
        forma = d.uBack ? `backprop del lote → Adam actualiza ${nPesos.toLocaleString('es-AR')} pesos` : `ejemplo: dígito ${y} → predicción ${pred} (${num(f.p[pred])})`;
      } else if (d.s < 1) {
        capa = '500 ejemplos · 10 dígitos · 14×14 píxeles';
        forma = `entra el ejemplo #${d.ej}: un ${y}`;
      } else if (d.s < 2.3) {
        const c = capaEn(d.waveF + 2);
        const info = {
          in: ['entrada', `196 valores entre 0 y 1`],
          conv: ['convolución 3×3', `filtro 1 · Σk·x+b = ${num(f.c[60])} → ReLU ${num(Math.max(0, f.c[60]))}`],
          pool: ['max pooling 2×2', `máximo de 4 vecinos = ${num(f.a0[14])}`],
          h1: ['densa 32', `h1₁: Σw·x+b = ${num(f.z1[0])} → ReLU ${num(f.a1[0])}`],
          h2: ['densa 16', `h2₁: Σw·x+b = ${num(f.z2[0])} → ReLU ${num(f.a2[0])}`],
          out: ['softmax', `P(${y}) = ${num(f.p[y])} · predicción ${pred} (${num(f.p[pred])})`],
        }[c];
        capa = `forward · ${info[0]}`; forma = info[1];
      } else if (d.s < 2.45) {
        capa = `pérdida = −log P(${y}) = ${num(b.loss)}`;
        forma = `∂L/∂z = p − y · ‖δ salida‖ ${num(Math.hypot(...b.d3), 3)}`;
      } else {
        const c = capaEn(d.waveB - 2);
        const g = { out: d.estado.G.W3, h2: d.estado.G.W3, h1: d.estado.G.W2, pool: d.estado.G.W1, conv: d.estado.G.K, in: d.estado.G.K }[c];
        const nombre = { out: 'W₃', h2: 'W₃', h1: 'W₂', pool: 'W₁', conv: 'filtros', in: 'filtros' }[c];
        capa = d.s > 2.95 ? 'actualización · w ← w − η·∂L/∂w' : `backpropagation · gradiente de ${nombre}`;
        forma = `‖∂L/∂${nombre}‖ = ${num(Math.hypot(...g), 3)}`;
      }
      set('.vms-layer', capa);
      set('.vms-shape', forma);
      const h = d.historial;
      spark.hidden = !d.entrena || h.length < 2;
      if (!spark.hidden) {
        const v = h.slice(-60), max = Math.max(...v, 0.01);
        sg.clearRect(0, 0, 120, 28);
        sg.strokeStyle = '#00ccff'; sg.lineWidth = 2; sg.beginPath();
        v.forEach((x, i) => { const px = i / Math.max(1, v.length - 1) * 118 + 1, py = 26 - (x / max) * 24; i ? sg.lineTo(px, py) : sg.moveTo(px, py); });
        sg.stroke();
      }
      const lleno = Math.round(d.s / 4 * 12);
      pasos.forEach((b, i) => b.classList.toggle('on', i < lleno));
    },
  };
}

// ---------- Cursor y botones magnéticos ----------
function iniciarCursor() {
  if (coarse || reduceMotion) return;
  const anillo = document.createElement('div');
  anillo.className = 'cursor-ring';
  anillo.setAttribute('aria-hidden', 'true');
  const etiquetaCursor = document.createElement('span');
  anillo.append(etiquetaCursor);
  document.body.append(anillo);
  document.documentElement.classList.add('has-cursor');

  let x = -100, y = -100, tx = -100, ty = -100;
  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    tx = e.clientX; ty = e.clientY;
    anillo.classList.add('is-visible');
  }, { passive: true });
  document.addEventListener('pointerleave', () => anillo.classList.remove('is-visible'));

  const interactivo = 'a, button, label, input, textarea, select, [role="slider"]';
  document.addEventListener('pointerover', e => {
    const card = e.target.closest('.portfolio-card');
    const ctl = e.target.closest(interactivo);
    anillo.classList.toggle('is-card', !!card && !ctl);
    anillo.classList.toggle('is-hover', !!ctl);
    etiquetaCursor.textContent = card && !ctl ? 'Ver video' : '';
  });

  const loop = () => {
    x += (tx - x) * 0.2; y += (ty - y) * 0.2;
    anillo.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  document.querySelectorAll('.hero .btn-primary, .hero .btn-ghost, .footer-cta').forEach(btn => {
    btn.classList.add('is-magnetic');
    btn.addEventListener('pointermove', e => {
      const r = btn.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      btn.style.transform = `translate(${(dx * 10).toFixed(1)}px, ${(dy * 8).toFixed(1)}px)`;
    });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
  });
}

// ---------- Arranque ----------
const saveData = navigator.connection && navigator.connection.saveData;
if (!saveData && iniciar()) {
  window.AureaImmersive = { activo: true };
  document.documentElement.classList.add('immersive');
  iniciarCursor();
}
