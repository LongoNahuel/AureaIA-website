/* ==========================================================================
   AureaIA — Fondo inmersivo: un cerebro que se compone, conecta y aprende

   Al bajar por el sitio, la escena cuenta cómo se arma y entrena una red:

     01 Datos          (#inicio)     miles de puntos sueltos que se componen
                                     en un cerebro
     02 Sinapsis       (#servicios)  aparecen las neuronas, crecen las sinapsis
                                     y se calcula Σ w·x + b en cada neurona
     03 Convolución    (#historias)  un kernel real de YOLOv8n (model.0) recorre
                                     un cuadro del caso "Detección de Celulares"
                                     y arma su mapa de salida píxel a píxel
     04 Entrenamiento  (#contacto)   una red 2-12-12-1 entrena en vivo con Adam
                                     sobre dos espirales; sus pesos reales
                                     colorean las sinapsis

   Todos los números de la barra de telemetría salen de esos cálculos.
   Three.js con bloom (UnrealBloomPass), niebla y desvanecido cercano.
   Si no hay WebGL, el sitio sigue usando particles.js como antes.
   ========================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const ETAPAS = [
  { id: 'inicio', nombre: 'Datos' },
  { id: 'servicios', nombre: 'Sinapsis' },
  { id: 'historias', nombre: 'Convolución' },
  { id: 'contacto', nombre: 'Entrenamiento' },
];
const DATOS_RED = 'cnn/red.json';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const compacto = coarse || Math.min(window.innerWidth, window.innerHeight) < 700;
const Q = compacto
  ? { puntos: 8000, neuronas: 420, pulsos: 220, niebla: 0.011 }
  : { puntos: 22000, neuronas: 900, pulsos: 600, niebla: 0.009 };

const FONDO = 0x0a0a0a;
const CIAN = new THREE.Color(0x00ccff);
const BLANCO = new THREE.Color(0xe8f6ff);

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

// Ruido de Perlin 3D (para las circunvoluciones de la corteza)
const PERM = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return [...p, ...p];
})();
function ruido(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  const u = f(x), v = f(y), w = f(z);
  const g = (h, x, y, z) => {
    const k = h & 15, a = k < 8 ? x : y, b = k < 4 ? y : (k === 12 || k === 14 ? x : z);
    return ((k & 1) ? -a : a) + ((k & 2) ? -b : b);
  };
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z, B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  return lerp(lerp(lerp(g(PERM[AA], x, y, z), g(PERM[BA], x - 1, y, z), u),
                   lerp(g(PERM[AB], x, y - 1, z), g(PERM[BB], x - 1, y - 1, z), u), v),
              lerp(lerp(g(PERM[AA + 1], x, y, z - 1), g(PERM[BA + 1], x - 1, y, z - 1), u),
                   lerp(g(PERM[AB + 1], x, y - 1, z - 1), g(PERM[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}

// ---------- Cerebro procedural ----------
// Dos hemisferios con circunvoluciones, cisura longitudinal, cerebelo y tronco.
// El frente del cerebro mira hacia +z.
function construirCerebro() {
  const T = new Float32Array(Q.puntos * 3);   // posición final
  const S = new Float32Array(Q.puntos * 3);   // posición suelta (datos)
  const F = new Float32Array(Q.puntos);       // brillo por circunvolución
  const corteza = [];
  const R = [6.4, 8.2, 12.5];   // radio lateral, alto y largo de cada hemisferio
  const CX = 2.7, RMED = 2.3;   // centro de cada hemisferio y radio hacia la cisura
  for (let i = 0; i < Q.puntos; i++) {
    const r0 = rand();
    let p, f;
    if (r0 < 0.8) { // corteza
      const lado = rand() < 0.5 ? -1 : 1;
      const u = V(gauss(), gauss(), gauss()).normalize();
      const medial = u.x * lado < 0;
      const rx = medial ? RMED : R[0];
      p = V(lado * CX + u.x * rx, 1.2 + u.y * R[1], u.z * R[2]);
      if (p.y < -3.2) p.y = -3.2 + (p.y + 3.2) * 0.45;           // base más plana
      p.z -= Math.max(0, -u.y) * 1.6 * Math.max(0, u.z);          // lóbulo temporal
      const n = Math.abs(ruido(p.x * 0.42, p.y * 0.42, p.z * 0.42));
      const cresta = 1 - n;
      f = Math.pow(cresta, 3);
      const normal = V(u.x / rx, u.y / R[1], u.z / R[2]).normalize();
      p.addScaledVector(normal, (f - 0.45) * 1.25);
      if (Math.abs(p.x) < 0.45) p.x = Math.sign(p.x || lado) * 0.45; // cisura
      if (r0 < 0.72 && f > 0.55) corteza.push(p.clone());
    } else if (r0 < 0.86) { // interior (sustancia blanca)
      const lado = rand() < 0.5 ? -1 : 1;
      const u = V(gauss(), gauss(), gauss()).normalize().multiplyScalar(Math.cbrt(rand()) * 0.8);
      p = V(lado * (CX + 1) + u.x * (u.x * lado < 0 ? RMED : R[0]), 1 + u.y * R[1], u.z * R[2]);
      f = 0.12;
    } else if (r0 < 0.96) { // cerebelo con láminas horizontales
      const u = V(gauss(), gauss(), gauss()).normalize();
      p = V(u.x * 8.2, -6.3 + u.y * 3.6, -8.6 + u.z * 4.8);
      f = 0.55 + 0.45 * Math.sin(p.y * 7.5) ** 2;
      p.multiplyScalar(1).addScaledVector(u, (f - 0.5) * 0.35);
    } else { // tronco encefálico
      const t = rand(), a = rand() * Math.PI * 2, rr = 1.7 * (1 - t * 0.25);
      p = V(Math.cos(a) * rr, -4.5 - t * 9.5, -3.5 - t * 1.6 + Math.sin(a) * rr);
      f = 0.35;
    }
    T.set([p.x, p.y, p.z], i * 3);
    F[i] = f;
    // posición suelta: nube amplia con corrientes de datos
    if (rand() < 0.4) {
      const k = Math.floor(rand() * 16), t = rand() * 2 - 1;
      S.set([t * 70, Math.sin(t * 3 + k) * 8 + (k - 7.5) * 3.4, Math.cos(t * 2 + k) * 14 - 12], i * 3);
    } else {
      S.set([(rand() * 2 - 1) * 60, (rand() * 2 - 1) * 34, -rand() * 90 + 40], i * 3);
    }
  }
  return { T, S, F, corteza };
}

// Neuronas sobre las crestas de la corteza y sinapsis entre vecinas
function construirConexiones(corteza) {
  const neuronas = [];
  const usados = new Set();
  while (neuronas.length < Q.neuronas && usados.size < corteza.length) {
    const i = Math.floor(rand() * corteza.length);
    if (usados.has(i)) continue;
    usados.add(i);
    neuronas.push(corteza[i].clone().multiplyScalar(0.985));
  }
  const pares = new Map();
  const agregar = (a, b) => { const k = a < b ? `${a}-${b}` : `${b}-${a}`; if (!pares.has(k)) pares.set(k, [a, b]); };
  neuronas.forEach((p, i) => {
    const cerca = [];
    neuronas.forEach((q, j) => { if (i !== j) { const d = p.distanceToSquared(q); if (d < 30) cerca.push([d, j]); } });
    cerca.sort((a, b) => a[0] - b[0]).slice(0, 4).forEach(([, j]) => agregar(i, j));
  });
  // cuerpo calloso: conexiones entre hemisferios
  const izq = neuronas.map((p, i) => [p, i]).filter(([p]) => p.x < 0);
  const der = neuronas.map((p, i) => [p, i]).filter(([p]) => p.x > 0);
  for (let k = 0; k < Math.round(Q.neuronas * 0.13); k++) {
    const [p, i] = izq[Math.floor(rand() * izq.length)];
    let mejor = null, dm = 1e9;
    der.forEach(([q, j]) => { const d = (q.x + p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2; if (d < dm) { dm = d; mejor = j; } });
    if (mejor !== null) agregar(i, mejor);
  }
  const sinapsis = [...pares.values()].map(([a, b], k) => {
    const A = neuronas[a], B = neuronas[b];
    // nacen de adelante hacia atrás, con algo de azar
    const nace = clamp(0.7 * (12.5 - (A.z + B.z) / 2) / 25 + 0.3 * rand(), 0, 1);
    return { A, B, nace, idx: k % 180 };
  });
  return { neuronas, sinapsis };
}

// ---------- Red que entrena en vivo: 2-12-12-1, tanh, Adam, dos espirales ----------
function crearRedEntrenable() {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(6.2832 * rnd());
  const capas = [2, 12, 12, 1];
  let W, B, mA, vA, t;
  const X = [], Y = [];
  for (let c = 0; c < 2; c++) for (let i = 0; i < 100; i++) {
    const r = i / 100 * 0.9 + 0.08, a = i / 100 * 3.2 * Math.PI + c * Math.PI;
    X.push([r * Math.cos(a) + g() * 0.03, r * Math.sin(a) + g() * 0.03]); Y.push(c);
  }
  function reiniciar() {
    s = 7;
    W = []; B = [];
    for (let l = 0; l < 3; l++) {
      const n = capas[l], m = capas[l + 1];
      W.push(Float64Array.from({ length: n * m }, () => g() * Math.sqrt(1 / n)));
      B.push(new Float64Array(m));
    }
    const P = [...W, ...B];
    mA = P.map(p => new Float64Array(p.length));
    vA = P.map(p => new Float64Array(p.length));
    t = 0;
  }
  function forward(x) {
    const a = [x], z = [];
    for (let l = 0; l < 3; l++) {
      const n = capas[l], m = capas[l + 1], o = new Float64Array(m), zz = new Float64Array(m);
      for (let j = 0; j < m; j++) {
        let v = B[l][j];
        for (let i = 0; i < n; i++) v += W[l][i * m + j] * a[l][i];
        zz[j] = v;
        o[j] = l < 2 ? Math.tanh(v) : 1 / (1 + Math.exp(-v));
      }
      a.push(o); z.push(zz);
    }
    return { a, z };
  }
  function paso(lr = 0.01) {
    const gW = W.map(w => new Float64Array(w.length)), gB = B.map(b => new Float64Array(b.length));
    let loss = 0, ok = 0;
    for (let k = 0; k < X.length; k++) {
      const { a } = forward(X[k]), y = Y[k], p = a[3][0];
      loss += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
      ok += (p > 0.5) === (y === 1) ? 1 : 0;
      let d = [p - y];
      for (let l = 2; l >= 0; l--) {
        const n = capas[l], m = capas[l + 1], dn = new Float64Array(n);
        for (let j = 0; j < m; j++) {
          gB[l][j] += d[j];
          for (let i = 0; i < n; i++) { gW[l][i * m + j] += d[j] * a[l][i]; dn[i] += W[l][i * m + j] * d[j]; }
        }
        if (l > 0) for (let i = 0; i < n; i++) dn[i] *= 1 - a[l][i] * a[l][i];
        d = dn;
      }
    }
    t++;
    const P = [...W, ...B], G = [...gW, ...gB];
    P.forEach((p, q) => {
      for (let i = 0; i < p.length; i++) {
        const gr = G[q][i] / X.length;
        mA[q][i] = 0.9 * mA[q][i] + 0.1 * gr;
        vA[q][i] = 0.999 * vA[q][i] + 0.001 * gr * gr;
        p[i] -= lr * (mA[q][i] / (1 - 0.9 ** t)) / (Math.sqrt(vA[q][i] / (1 - 0.999 ** t)) + 1e-8);
      }
    });
    return { loss: loss / X.length, acc: ok / X.length };
  }
  function pesos(out) { // los 180 pesos normalizados por el mayor valor absoluto
    let k = 0, max = 1e-6;
    for (const w of W) for (const v of w) { out[k++] = v; max = Math.max(max, Math.abs(v)); }
    for (let i = 0; i < k; i++) out[i] /= max;
    return out;
  }
  reiniciar();
  return { X, forward, paso, pesos, reiniciar, get epoca() { return t; }, get W() { return W; }, get B() { return B; } };
}

// ---------- Shaders ----------
const puntosVS = /* glsl */`
attribute vec3 aT;
attribute vec3 aSeed;
attribute float aFold;
uniform float uTime, uCompose, uPixel, uSize, uOpacity, uFog, uAspect, uWaveZ, uWaveOn, uTrain, uNeuron;
uniform vec2 uMouse;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = aSeed.x * 0.5;
  float t = smoothstep(d, d + 0.5, uCompose);
  vec3 suelto = position + vec3(sin(uTime * 0.25 + aSeed.y * 6.2832) * 2.0,
                                cos(uTime * 0.2 + aSeed.z * 6.2832) * 1.5,
                                sin(uTime * 0.18 + aSeed.x * 6.2832) * 2.0);
  vec3 p = mix(suelto, aT, t);
  p += t * (1.0 - t) * 4.0 * (aSeed - 0.5) * 10.0;            // remolino a mitad de camino
  p += aT * 0.01 * sin(uTime * 1.1 + aSeed.y * 6.2832) * t;  // respiración

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 dv = (ndc - uMouse) * vec2(uAspect, 1.0);
  float g = smoothstep(0.3, 0.0, length(dv));
  clip.xy += normalize(dv + 1e-5) * g * 0.035 * clip.w;

  float depth = max(-mv.z, 0.5);
  float onda = exp(-pow((aT.z - uWaveZ) / 2.4, 2.0)) * uWaveOn * t;
  float lum = mix(0.25, 1.0, aFold);
  gl_PointSize = uSize * uPixel * (0.6 + lum * 0.8 + onda * 1.4 + uNeuron * 1.6) * (300.0 / depth) * (1.0 + g * 0.8);
  gl_Position = clip;

  vec3 azul = vec3(0.0, 0.4, 1.0), cian = vec3(0.0, 0.8, 1.0), blanco = vec3(0.85, 0.95, 1.0);
  vec3 c = mix(azul, cian, clamp(aFold * 0.8 + aSeed.y * 0.2, 0.0, 1.0));
  vColor = mix(c, blanco, clamp(onda * 0.85 + g * 0.4 + uNeuron * 0.45 + uTrain * 0.2 * aFold, 0.0, 1.0));
  float fog = exp(-pow(uFog * depth, 2.0));
  vAlpha = (0.16 + lum * 0.55 + onda * 0.7 + uNeuron * 0.45) * mix(0.5, 1.0, t) * uOpacity * fog * smoothstep(2.5, 9.0, depth);
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

const sinapsisVS = /* glsl */`
attribute vec3 aB;
attribute float aLado;
attribute float aNace;
attribute float aIdx;
uniform float uCrece, uOpacity, uFog;
uniform float uW[180];
varying vec3 vColor;
varying float vAlpha;
void main() {
  float g = clamp((uCrece - aNace) / 0.12, 0.0, 1.0);
  vec3 p = aLado < 0.5 ? position : mix(position, aB, g);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float w = uW[int(aIdx)];
  vColor = w >= 0.0 ? vec3(0.0, 0.8, 1.0) : vec3(0.42, 0.36, 1.0);
  float depth = max(-mv.z, 0.5);
  vAlpha = step(0.001, g) * (0.1 + 0.55 * min(abs(w), 1.0)) * uOpacity
         * exp(-pow(uFog * depth, 2.0)) * smoothstep(2.5, 9.0, depth);
}`;
const lineaFS = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main() { gl_FragColor = vec4(vColor, vAlpha); }`;

const pulsoVS = /* glsl */`
attribute vec3 aB;
attribute vec3 aP;   // fase, velocidad, nacimiento de la sinapsis
uniform float uTime, uPixel, uSize, uFog, uOpacity, uDir, uCrece;
uniform vec3 uColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float t = fract(aP.x + uTime * aP.y);
  if (uDir < 0.0) t = 1.0 - t;
  vec4 mv = modelViewMatrix * vec4(mix(position, aB, t), 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.5);
  gl_PointSize = uSize * uPixel * 300.0 / depth;
  vColor = uColor;
  vAlpha = sin(t * 3.14159) * step(aP.z + 0.12, uCrece) * uOpacity
         * exp(-pow(uFog * depth, 2.0)) * smoothstep(2.5, 9.0, depth);
}`;

const planoVS = /* glsl */`
varying vec2 vUv;
varying float vProf;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vProf = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const planoFS = /* glsl */`
uniform sampler2D uMap;
uniform float uOpacity, uModo, uFog;
varying vec2 vUv;
varying float vProf;
vec3 cmap(float v) {
  vec3 c = mix(vec3(0.0, 0.003, 0.03), vec3(0.0, 0.133, 1.0), smoothstep(0.0, 0.45, v));
  c = mix(c, vec3(0.0, 0.604, 1.0), smoothstep(0.4, 0.75, v));
  return mix(c, vec3(0.8, 0.95, 1.0), smoothstep(0.78, 1.0, v));
}
void main() {
  // el mapa de salida se escribe con la fila 0 arriba
  vec4 tex = texture2D(uMap, uModo < 0.5 ? vec2(vUv.x, 1.0 - vUv.y) : vUv);
  vec3 col; float a;
  if (uModo < 0.5) {   // mapa de salida: R = valor, G = ya calculado
    bool listo = tex.g > 0.5;
    col = listo ? cmap(tex.r) : vec3(0.0, 0.25, 0.6);
    a = listo ? 0.25 + 0.75 * tex.r : 0.05;
  } else {             // imagen de entrada
    col = tex.rgb; a = 0.92;
  }
  float borde = 1.0 - smoothstep(0.0, 0.006, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  col = mix(col, vec3(0.0, 0.604, 1.0), borde * 0.7);
  a = max(a, borde * 0.7);
  gl_FragColor = vec4(col, a * uOpacity * exp(-pow(uFog * vProf, 2.0)));
  #include <colorspace_fragment>
}`;

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
  // fondo como color de escena: pasa bien por el espacio de color del compositor
  scene.background = new THREE.Color(FONDO);
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);
  const ajustarFov = () => { camera.fov = camera.aspect < 1 ? 66 : 50; camera.updateProjectionMatrix(); };
  ajustarFov();

  let composer = null;
  if (!compacto) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(pr);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.45, 0.35));
    composer.addPass(new OutputPass());
  }

  const cerebro = new THREE.Group();
  scene.add(cerebro);
  const comunes = {
    uTime: { value: 0 }, uPixel: { value: pr }, uFog: { value: Q.niebla },
    uAspect: { value: window.innerWidth / window.innerHeight }, uMouse: { value: new THREE.Vector2(9, 9) },
    uWaveZ: { value: 0 }, uWaveOn: { value: 0 }, uTrain: { value: 0 },
  };

  // Puntos del cerebro
  const { T, S, F, corteza } = construirCerebro();
  const seed = Float32Array.from({ length: Q.puntos * 3 }, () => rand());
  const gp = new THREE.BufferGeometry();
  gp.setAttribute('position', new THREE.BufferAttribute(S, 3));
  gp.setAttribute('aT', new THREE.BufferAttribute(T, 3));
  gp.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  gp.setAttribute('aFold', new THREE.BufferAttribute(F, 1));
  gp.boundingSphere = new THREE.Sphere(V(0, 0, 0), 300);
  const uPuntos = { ...comunes, uCompose: { value: 0 }, uSize: { value: compacto ? 0.3 : 0.26 }, uOpacity: { value: 0 }, uNeuron: { value: 0 } };
  cerebro.add(new THREE.Points(gp, new THREE.ShaderMaterial({
    uniforms: uPuntos, vertexShader: puntosVS, fragmentShader: suaveFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // Neuronas
  const { neuronas, sinapsis } = construirConexiones(corteza);
  const NP = new Float32Array(neuronas.length * 3);
  neuronas.forEach((p, i) => NP.set([p.x, p.y, p.z], i * 3));
  const gn = new THREE.BufferGeometry();
  gn.setAttribute('position', new THREE.BufferAttribute(NP, 3));
  gn.setAttribute('aT', new THREE.BufferAttribute(NP, 3));
  gn.setAttribute('aSeed', new THREE.BufferAttribute(Float32Array.from({ length: neuronas.length * 3 }, () => rand()), 3));
  gn.setAttribute('aFold', new THREE.BufferAttribute(new Float32Array(neuronas.length).fill(1), 1));
  gn.boundingSphere = gp.boundingSphere;
  const uNeuronas = { ...comunes, uCompose: { value: 1 }, uSize: { value: compacto ? 0.5 : 0.42 }, uOpacity: { value: 0 }, uNeuron: { value: 1 } };
  cerebro.add(new THREE.Points(gn, new THREE.ShaderMaterial({
    uniforms: uNeuronas, vertexShader: puntosVS, fragmentShader: suaveFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // Sinapsis que crecen, coloreadas por los pesos reales de la red que entrena
  const nS = sinapsis.length;
  const sa = new Float32Array(nS * 6), sb = new Float32Array(nS * 6), sl = new Float32Array(nS * 2), sn = new Float32Array(nS * 2), si = new Float32Array(nS * 2);
  sinapsis.forEach((s, k) => {
    sa.set([s.A.x, s.A.y, s.A.z, s.A.x, s.A.y, s.A.z], k * 6);
    sb.set([s.B.x, s.B.y, s.B.z, s.B.x, s.B.y, s.B.z], k * 6);
    sl.set([0, 1], k * 2); sn.set([s.nace, s.nace], k * 2); si.set([s.idx, s.idx], k * 2);
  });
  const gs = new THREE.BufferGeometry();
  gs.setAttribute('position', new THREE.BufferAttribute(sa, 3));
  gs.setAttribute('aB', new THREE.BufferAttribute(sb, 3));
  gs.setAttribute('aLado', new THREE.BufferAttribute(sl, 1));
  gs.setAttribute('aNace', new THREE.BufferAttribute(sn, 1));
  gs.setAttribute('aIdx', new THREE.BufferAttribute(si, 1));
  gs.boundingSphere = gp.boundingSphere;
  const pesos = new Float32Array(180);
  const uSinapsis = { uCrece: { value: 0 }, uOpacity: { value: 0 }, uFog: comunes.uFog, uW: { value: pesos } };
  cerebro.add(new THREE.LineSegments(gs, new THREE.ShaderMaterial({
    uniforms: uSinapsis, vertexShader: sinapsisVS, fragmentShader: lineaFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // Pulsos: hacia adelante al calcular, hacia atrás al entrenar (retropropagación)
  const pa = new Float32Array(Q.pulsos * 3), pb = new Float32Array(Q.pulsos * 3), pp = new Float32Array(Q.pulsos * 3);
  for (let i = 0; i < Q.pulsos; i++) {
    const s = sinapsis[Math.floor(rand() * nS)];
    pa.set([s.A.x, s.A.y, s.A.z], i * 3); pb.set([s.B.x, s.B.y, s.B.z], i * 3);
    pp.set([rand(), 0.35 + rand() * 0.5, s.nace], i * 3);
  }
  const gq = new THREE.BufferGeometry();
  gq.setAttribute('position', new THREE.BufferAttribute(pa, 3));
  gq.setAttribute('aB', new THREE.BufferAttribute(pb, 3));
  gq.setAttribute('aP', new THREE.BufferAttribute(pp, 3));
  gq.boundingSphere = gp.boundingSphere;
  const uPulsos = {
    uTime: comunes.uTime, uPixel: comunes.uPixel, uFog: comunes.uFog, uSize: { value: 0.4 },
    uOpacity: { value: 0 }, uDir: { value: 1 }, uCrece: uSinapsis.uCrece, uColor: { value: CIAN.clone() },
  };
  cerebro.add(new THREE.Points(gq, new THREE.ShaderMaterial({
    uniforms: uPulsos, vertexShader: pulsoVS, fragmentShader: suaveFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // ---------- Convolución real: kernel de YOLOv8n model.0 sobre un cuadro real ----------
  const conv = { listo: false, k: 0, pausa: 0, ultimo: null };
  const grupoConv = new THREE.Group();
  grupoConv.position.set(0, 5, 22);
  scene.add(grupoConv);
  const CELDA = 0.13;
  let GW = 64, GH = 36, entradaPx = null, salida = null, salidaTex = null, kernelInfo = null;
  const uPlanos = [];
  const kernelMat = new THREE.LineBasicMaterial({ color: BLANCO, transparent: true, opacity: 0, toneMapped: false });
  const rayosMat = new THREE.LineBasicMaterial({ color: CIAN, transparent: true, opacity: 0, toneMapped: false });
  const kernelGeo = new THREE.BufferGeometry();
  const rayosGeo = new THREE.BufferGeometry();
  kernelGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  rayosGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  grupoConv.add(new THREE.LineSegments(kernelGeo, kernelMat));
  grupoConv.add(new THREE.LineSegments(rayosGeo, rayosMat));

  async function prepararConvolucion() {
    const datos = await fetch(DATOS_RED).then(r => r.json());
    kernelInfo = datos.kernel;
    [GW, GH] = datos.grilla;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = datos.fuente.imagen; });
    const c = document.createElement('canvas');
    c.width = GW; c.height = GH;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, GW, GH);
    const d = g.getImageData(0, 0, GW, GH).data;
    entradaPx = new Float32Array(GW * GH * 3);
    for (let i = 0; i < GW * GH; i++) for (let ch = 0; ch < 3; ch++) entradaPx[i * 3 + ch] = d[i * 4 + ch] / 255;
    // salida completa, para conocer la escala; se revela píxel a píxel
    salida = new Float32Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) salida[y * GW + x] = convolucionar(x, y).silu;
    const orden = Array.from(salida).sort((a, b) => a - b);
    conv.escala = orden[Math.floor(orden.length * 0.99)] || 1;
    salidaTex = new THREE.DataTexture(new Uint8Array(GW * GH * 4), GW, GH, THREE.RGBAFormat);
    salidaTex.magFilter = THREE.NearestFilter;
    salidaTex.needsUpdate = true;
    const entradaTex = new THREE.Texture(img);
    entradaTex.colorSpace = THREE.SRGBColorSpace;
    entradaTex.needsUpdate = true;
    const ancho = GW * CELDA, alto = GH * CELDA;
    const plano = (map, modo, x) => {
      const u = { uMap: { value: map }, uOpacity: { value: 0 }, uModo: { value: modo }, uFog: comunes.uFog };
      uPlanos.push(u);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.ShaderMaterial({
        uniforms: u, vertexShader: planoVS, fragmentShader: planoFS, transparent: true, depthWrite: false,
      }));
      m.position.x = x;
      grupoConv.add(m);
    };
    conv.ancho = ancho; conv.alto = alto; conv.sep = ancho / 2 + 1.6;
    plano(entradaTex, 1, -conv.sep);
    plano(salidaTex, 0, conv.sep);
    conv.listo = true;
  }

  function convolucionar(x, y) {
    const w = kernelInfo.pesos;
    let z = kernelInfo.bias;
    for (let ch = 0; ch < 3; ch++) for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) {
      const yy = y + ky - 1, xx = x + kx - 1;
      if (yy < 0 || yy >= GH || xx < 0 || xx >= GW) continue;   // padding con ceros
      z += w[ch * 9 + ky * 3 + kx] * entradaPx[(yy * GW + xx) * 3 + ch];
    }
    return { z, silu: z / (1 + Math.exp(-z)) };
  }

  function avanzarConvolucion(dt) {
    if (!conv.listo) return;
    const datos = salidaTex.image.data;
    if (conv.k >= GW * GH) {
      conv.pausa += dt;
      if (conv.pausa > 2.2) { conv.k = 0; conv.pausa = 0; datos.fill(0); salidaTex.needsUpdate = true; }
      return;
    }
    const n = reduceMotion ? GW * GH : Math.max(1, Math.round(GW * GH / 9 * dt)); // ~9 s por pasada
    for (let i = 0; i < n && conv.k < GW * GH; i++, conv.k++) {
      const v = clamp(salida[conv.k] / conv.escala, 0, 1);
      datos[conv.k * 4] = v * 255;
      datos[conv.k * 4 + 1] = 255;
    }
    salidaTex.needsUpdate = true;
    const k = Math.min(conv.k, GW * GH - 1), x = k % GW, y = Math.floor(k / GW);
    conv.ultimo = { x, y, ...convolucionar(x, y) };
    // marco del kernel 3×3 sobre la entrada y rayos hacia el píxel de salida
    const px = (gx, lado) => lado * conv.sep - conv.ancho / 2 + gx * CELDA;
    const py = gy => conv.alto / 2 - gy * CELDA;
    const kp = kernelGeo.attributes.position.array;
    let o = 0;
    for (let i = 0; i <= 3; i++) {
      kp.set([px(x - 1 + i, -1), py(y - 1), 0.02, px(x - 1 + i, -1), py(y + 2), 0.02], o); o += 6;
      kp.set([px(x - 1, -1), py(y - 1 + i), 0.02, px(x + 2, -1), py(y - 1 + i), 0.02], o); o += 6;
    }
    kernelGeo.attributes.position.needsUpdate = true;
    const rp = rayosGeo.attributes.position.array;
    const ox = px(x + 0.5, 1), oy = py(y + 0.5);
    o = 0;
    [[x - 1, y - 1], [x + 2, y - 1], [x + 2, y + 2], [x - 1, y + 2]].forEach(([gx, gy]) => {
      rp.set([px(gx, -1), py(gy), 0.02, ox, oy, 0.02], o); o += 6;
    });
    // contorno del píxel de salida
    const esq = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    esq.forEach(([gx, gy], i) => {
      const [hx, hy] = esq[(i + 1) % 4];
      rp.set([px(gx, 1), py(gy), 0.03, px(hx, 1), py(hy), 0.03], o); o += 6;
    });
    rayosGeo.attributes.position.needsUpdate = true;
  }

  // ---------- Red que entrena ----------
  const red = crearRedEntrenable();
  red.pesos(pesos);
  const historial = [];
  let entrenando = false, ultimaMetrica = { loss: NaN, acc: 0 };

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
  const etapaScroll = () => {
    const y = window.scrollY;
    for (let i = 0; i < 4; i++) if (y < A[i + 1]) return i + clamp((y - A[i]) / (A[i + 1] - A[i]), 0, 1);
    return 3;
  };

  // Paradas de cámara (s = etapa continua 0–3). "corre" desplaza el foco hacia la
  // izquierda de la cámara, así el objeto queda en la mitad derecha, libre del texto.
  const PARADAS = [
    { s: 0.0, cam: V(25, 8, 36), foco: V(0, -1, 0), corre: 9 },
    { s: 0.6, cam: V(40, 6, 24), foco: V(0, 0, 0), corre: 10 },
    { s: 1.0, cam: V(44, 4, 4), foco: V(0, 0, -1), corre: 9 },
    { s: 1.55, cam: V(30, 14, -26), foco: V(0, 0, -2), corre: 8 },
    { s: 2.0, cam: V(-8, 1.5, 50), foco: V(0, -1, 22), corre: 8 },
    { s: 2.5, cam: V(-4, 2, 49), foco: V(0, -1, 22), corre: 8 },
    { s: 3.0, cam: V(34, 6, 30), foco: V(0, 0, 0), corre: 11 },
  ];
  const rutaCam = new THREE.CatmullRomCurve3(PARADAS.map(p => p.cam), false, 'centripetal');
  const rutaMira = new THREE.CatmullRomCurve3(PARADAS.map(p => p.foco), false, 'centripetal');
  const correEn = s => {
    for (let i = 0; i < PARADAS.length - 1; i++) {
      if (s <= PARADAS[i + 1].s) return lerp(PARADAS[i].corre, PARADAS[i + 1].corre, (s - PARADAS[i].s) / (PARADAS[i + 1].s - PARADAS[i].s));
    }
    return PARADAS[PARADAS.length - 1].corre;
  };
  const derecha = V(0, 0, 0), arriba = V(0, 1, 0);
  const uRuta = s => {
    for (let i = 0; i < PARADAS.length - 1; i++) {
      if (s <= PARADAS[i + 1].s) return (i + (s - PARADAS[i].s) / (PARADAS[i + 1].s - PARADAS[i].s)) / (PARADAS.length - 1);
    }
    return 1;
  };

  const mouseT = new THREE.Vector2(0, 0), mouseS = new THREE.Vector2(0, 0), mouse = new THREE.Vector2(9, 9);
  let mouseDentro = false;
  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    mouseT.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight * 2 - 1));
    mouseDentro = true;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { mouseT.set(0, 0); mouseDentro = false; });

  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    ajustarFov();
    comunes.uAspect.value = w / h;
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
  let sCur = etapaScroll(), tPrev = performance.now(), tiempo = 0, hudT = 0, muestra = 0, neuronaHud = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - tPrev) / 1000);
    tPrev = now;
    if (modal && modal.classList.contains('show')) return;
    if (!reduceMotion) tiempo += dt;

    let intro = 1;
    if (!reduceMotion) intro = introInicio > 0 && now > introInicio ? Math.min(1, (now - introInicio) / 2600) : 0;
    const ease = 1 - Math.pow(1 - intro, 3);

    const objetivo = etapaScroll();
    sCur += (objetivo - sCur) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 2.6));
    const s = sCur;

    // fases de la historia
    const compone = 0.55 * ease + 0.45 * smooth(0.05, 1.0, s);
    const crece = smooth(0.85, 1.7, s) * 1.15;
    const convVis = smooth(1.9, 2.05, s) * (1 - smooth(2.55, 2.85, s));
    const entrena = smooth(2.6, 2.95, s);
    const calculo = smooth(1.2, 1.5, s) * (1 - convVis);

    // entrenamiento en vivo: arranca al llegar a la etapa y se reinicia al volver atrás
    if (s < 2.3 && red.epoca > 0) { red.reiniciar(); historial.length = 0; red.pesos(pesos); }
    entrenando = entrena > 0.5;
    if (entrenando) {
      const pasos = reduceMotion ? 20 : clamp(Math.round(dt * 60), 1, 3); // ~60 épocas por segundo
      for (let i = 0; i < pasos; i++) ultimaMetrica = red.paso();
      if (red.epoca % 4 === 0) historial.push(ultimaMetrica.loss);
      if (historial.length > 160) historial.shift();
      red.pesos(pesos);
    }
    if (convVis > 0.01) avanzarConvolucion(dt);

    // onda de activación: adelante→atrás al calcular, atrás→adelante al entrenar
    const fase = (tiempo * (entrenando ? 0.55 : 0.4)) % 1;
    comunes.uWaveZ.value = entrenando ? lerp(-15, 15, fase) : lerp(15, -15, fase);
    comunes.uWaveOn.value = Math.max(calculo, entrena) * (1 - convVis);
    comunes.uTrain.value = entrena;
    comunes.uTime.value = tiempo;

    uPuntos.uCompose.value = compone;
    uPuntos.uOpacity.value = ease * (1 - 0.65 * convVis);
    uNeuronas.uOpacity.value = ease * smooth(0.8, 1.15, s) * (1 - 0.7 * convVis);
    uSinapsis.uCrece.value = crece;
    uSinapsis.uOpacity.value = ease * (1 - 0.7 * convVis) * (0.8 + 0.4 * entrena);
    uPulsos.uOpacity.value = ease * Math.max(calculo, entrena) * (1 - convVis);
    uPulsos.uDir.value = entrenando ? -1 : 1;
    uPulsos.uColor.value.copy(entrenando ? BLANCO : CIAN);
    for (const u of uPlanos) u.uOpacity.value = convVis;
    kernelMat.opacity = convVis;
    rayosMat.opacity = convVis * 0.8;

    // mouse
    mouseS.lerp(mouseT, 1 - Math.exp(-dt * 2.5));
    if (mouseDentro) {
      if (mouse.x > 5) mouse.copy(mouseT);
      mouse.lerp(mouseT, 1 - Math.exp(-dt * 8));
    } else mouse.set(9, 9);
    comunes.uMouse.value.copy(mouse);

    // cámara
    const u = uRuta(s);
    rutaCam.getPoint(u, pos);
    rutaMira.getPoint(u, mira);
    derecha.subVectors(mira, pos).cross(arriba).normalize();
    if (camera.aspect < 1.1) { // pantallas angostas: más lejos y un poco más abajo, debajo del texto
      pos.addScaledVector(pos.clone().sub(mira).normalize(), 14);
      mira.y += 7;
    }
    else mira.addScaledVector(derecha, -correEn(s));
    pos.x -= mouseS.x * 2; pos.y += mouseS.y * 1.3;
    pos.z += (1 - ease) * 40;
    camera.position.copy(pos);
    camera.lookAt(mira.x - mouseS.x * 1.5, mira.y + mouseS.y, mira.z);
    cerebro.rotation.y = Math.sin(tiempo * 0.1) * 0.3 * (1 - convVis) + mouseS.x * 0.12;
    cerebro.rotation.x = -mouseS.y * 0.06;

    if (composer) composer.render(); else renderer.render(scene, camera);

    // telemetría (10 veces por segundo)
    hudT += dt;
    if (hudT > 0.1) {
      hudT = 0;
      if (Math.floor(tiempo / 0.8) !== muestra) {
        muestra = Math.floor(tiempo / 0.8);
        neuronaHud = muestra % 12;
      }
      const ej = red.X[(muestra * 37) % red.X.length];
      const f = red.forward(ej);
      telemetria.actualizar({
        s, compone, crece, entrenando,
        puntos: Q.puntos, neuronas: neuronas.length, sinapsis: nS,
        neurona: { j: neuronaHud, z: f.z[0][neuronaHud], a: f.a[1][neuronaHud] },
        conv: conv.ultimo && kernelInfo ? { ...conv.ultimo, canal: kernelInfo.canal, capa: kernelInfo.capa } : null,
        epoca: red.epoca, metrica: ultimaMetrica, historial,
      });
    }
  }

  prepararConvolucion().catch(() => { /* sin datos de convolución: el resto de la escena sigue */ });
  requestAnimationFrame(frame);
  return true;
}

// ---------- Telemetría estilo VMS en la barra de navegación ----------
function crearTelemetria() {
  const fila = document.createElement('div');
  fila.className = 'vms-row';
  fila.innerHTML = '<div class="container"></div>';
  document.getElementById('navbar')?.append(fila);
  const barra = document.createElement('div');
  barra.className = 'vms-strip';
  barra.setAttribute('aria-label', 'Estado de la red neuronal del fondo');
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
  const barras = barra.querySelectorAll('.vms-steps b');
  const set = (q, t) => { const el = $(q); if (el.textContent !== t) el.textContent = t; };

  return {
    actualizar(d) {
      const e = clamp(Math.round(d.s), 0, 3);
      set('.vms-stage', `${String(e + 1).padStart(2, '0')} ${ETAPAS[e].nombre}`);
      let capa = '', forma = '';
      if (e === 0) {
        capa = `${d.puntos.toLocaleString('es-AR')} puntos`;
        forma = `cerebro ${Math.round(d.compone * 100)}%`;
      } else if (e === 1) {
        const n = Math.round(clamp(d.crece, 0, 1) * d.sinapsis);
        capa = `${d.neuronas} neuronas · ${n.toLocaleString('es-AR')} sinapsis`;
        forma = `h${d.neurona.j + 1}: Σw·x+b = ${num(d.neurona.z)} → tanh ${num(d.neurona.a)}`;
      } else if (e === 2) {
        capa = d.conv ? `${d.conv.capa} · canal ${d.conv.canal} · 3×3×3` : 'kernel 3×3×3';
        forma = d.conv ? `(${d.conv.x},${d.conv.y}) Σ = ${num(d.conv.z)} → SiLU ${num(d.conv.silu)}` : '';
      } else {
        capa = d.epoca ? `época ${d.epoca} · pérdida ${num(d.metrica.loss, 3)}` : 'época 0';
        forma = d.epoca ? `precisión ${Math.round(d.metrica.acc * 100)}%` : '';
      }
      set('.vms-layer', capa);
      set('.vms-shape', forma);
      spark.hidden = e !== 3 || d.historial.length < 2;
      if (!spark.hidden) {
        const h = d.historial, max = Math.max(...h, 0.01);
        sg.clearRect(0, 0, 120, 28);
        sg.strokeStyle = '#00ccff';
        sg.lineWidth = 2;
        sg.beginPath();
        h.forEach((v, i) => {
          const x = i / Math.max(1, h.length - 1) * 118 + 1, y = 26 - (v / max) * 24;
          i ? sg.lineTo(x, y) : sg.moveTo(x, y);
        });
        sg.stroke();
      }
      const lleno = Math.round(d.s / 3 * 12);
      barras.forEach((b, i) => b.classList.toggle('on', i < lleno));
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
