/* ==========================================================================
   AureaIA — Fondo inmersivo: los procesos de la IA alrededor de un cerebro

   Al bajar por el sitio, el cerebro se compone y muestra, con cálculos reales:

     01 Embeddings       (#inicio)     41 palabras en español con sus vectores
                                       reales (spaCy, 300 dimensiones), ubicadas
                                       en 3D por PCA y unidas a sus vecinas por
                                       similitud coseno
     02 LLM              (#servicios)  un modelo de lenguaje de bigramas
                                       entrenado con el texto de este sitio genera
                                       frases palabra por palabra, con la atención
                                       (softmax de q·k) de cada palabra nueva sobre
                                       las anteriores
     03 Convolución      (#historias)  kernels de 3×3 (Sobel y el de YOLOv8n
                                       model.0) recorren dígitos escritos a mano,
                                       con ReLU y max pooling 2×2
     04 Backpropagation  (#contacto)   una red 2-12-12-1 aprende con 200 ejemplos:
                                       cada ejemplo hace la pasada hacia adelante,
                                       se calcula el error y los gradientes vuelven
                                       hacia atrás; la frontera de decisión cambia
                                       en vivo

   Los datos están en fondo/procesos.json. Three.js con bloom (UnrealBloomPass),
   niebla y desvanecido cercano. Sin WebGL, el sitio usa particles.js como antes.
   ========================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const ETAPAS = [
  { id: 'inicio', nombre: 'Embeddings' },
  { id: 'servicios', nombre: 'LLM' },
  { id: 'historias', nombre: 'Convolución' },
  { id: 'contacto', nombre: 'Backpropagation' },
];
const DATOS = 'fondo/procesos.json';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const compacto = coarse || Math.min(window.innerWidth, window.innerHeight) < 700;
const Q = compacto
  ? { puntos: 8000, neuronas: 420, pulsos: 220, niebla: 0.011 }
  : { puntos: 22000, neuronas: 900, pulsos: 600, niebla: 0.009 };

const FONDO = 0x0a0a0a;
const CIAN = new THREE.Color(0x00ccff);
const AZUL = new THREE.Color(0x0066ff);
const VIOLETA = new THREE.Color(0.55, 0.45, 1.0);
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
      f = Math.pow(1 - n, 3);
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
      p.addScaledVector(u, (f - 0.5) * 0.35);
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

// ---------- Red que aprende con ejemplos: 2-12-12-1, tanh, Adam, dos espirales ----------
function crearRedEntrenable() {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(6.2832 * rnd());
  const capas = [2, 12, 12, 1];
  const X = [], Y = [];
  for (let c = 0; c < 2; c++) for (let i = 0; i < 100; i++) {
    const r = i / 100 * 0.9 + 0.08, a = i / 100 * 3.2 * Math.PI + c * Math.PI;
    X.push([r * Math.cos(a) + g() * 0.03, r * Math.sin(a) + g() * 0.03]); Y.push(c);
  }
  const orden = X.map((_, i) => i);
  let W, B, mA, vA, t, cursor, vistos;
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
    t = 0; cursor = 0; vistos = 0;
    for (let i = orden.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; }
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
  // backpropagation de un ejemplo: suma sus gradientes en gW y gB
  function backward(k, gW, gB) {
    const { a } = forward(X[k]), y = Y[k], p = a[3][0];
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
    return p;
  }
  const ceros = () => [W.map(w => new Float64Array(w.length)), B.map(b => new Float64Array(b.length))];
  function paso(lr = 0.03, lote = 50) { // un lote de 50 ejemplos, Adam
    const [gW, gB] = ceros();
    for (let i = 0; i < lote; i++) { backward(orden[cursor], gW, gB); cursor = (cursor + 1) % orden.length; }
    vistos += lote; t++;
    const P = [...W, ...B], G = [...gW, ...gB];
    P.forEach((p, q) => {
      for (let i = 0; i < p.length; i++) {
        const gr = G[q][i] / lote;
        mA[q][i] = 0.9 * mA[q][i] + 0.1 * gr;
        vA[q][i] = 0.999 * vA[q][i] + 0.001 * gr * gr;
        p[i] -= lr * (mA[q][i] / (1 - 0.9 ** t)) / (Math.sqrt(vA[q][i] / (1 - 0.999 ** t)) + 1e-8);
      }
    });
  }
  function evaluar() { // pérdida y precisión sobre los 200 ejemplos
    let loss = 0, ok = 0;
    for (let k = 0; k < X.length; k++) {
      const p = forward(X[k]).a[3][0], y = Y[k];
      loss += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
      ok += (p > 0.5) === (y === 1) ? 1 : 0;
    }
    return { loss: loss / X.length, acc: ok / X.length };
  }
  function ejemplo(k) { // pasada hacia adelante y gradiente de un solo ejemplo
    const [gW, gB] = ceros();
    const p = backward(k, gW, gB);
    let n2 = 0;
    for (const w of gW) for (const v of w) n2 += v * v;
    return { x: X[k], y: Y[k], p, error: Math.abs(p - Y[k]), grad: Math.sqrt(n2) };
  }
  function pesos(out) { // los 180 pesos normalizados por el mayor valor absoluto
    let k = 0, max = 1e-6;
    for (const w of W) for (const v of w) { out[k++] = v; max = Math.max(max, Math.abs(v)); }
    for (let i = 0; i < k; i++) out[i] /= max;
    return out;
  }
  reiniciar();
  return {
    X, Y, forward, paso, evaluar, ejemplo, pesos, reiniciar,
    get epoca() { return Math.floor(vistos / X.length); }, get pasos() { return t; },
  };
}

// ---------- Dígitos escritos a mano (trazos) para la convolución ----------
const DIGITOS = {
  7: [[['M', .24, .22], ['L', .76, .22], ['L', .46, .84]], [['M', .36, .52], ['L', .66, .52]]],
  2: [[['M', .28, .34], ['Q', .5, .08, .72, .3], ['Q', .78, .46, .3, .82], ['L', .76, .8]]],
  3: [[['M', .3, .24], ['Q', .72, .08, .66, .4], ['Q', .62, .5, .44, .5]], [['M', .44, .5], ['Q', .78, .52, .68, .72], ['Q', .56, .92, .27, .78]]],
  4: [[['M', .62, .84], ['L', .62, .18], ['L', .24, .62], ['L', .78, .62]]],
  5: [[['M', .72, .2], ['L', .36, .2], ['L', .32, .48], ['Q', .74, .38, .7, .66], ['Q', .62, .9, .28, .78]]],
};
function dibujarDigito(d, jitter) {
  const N = 112, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.strokeStyle = '#fff'; g.lineWidth = N * 0.1; g.lineCap = 'round'; g.lineJoin = 'round';
  const j = () => (jitter() - 0.5) * 0.06;
  for (const trazo of DIGITOS[d]) {
    g.beginPath();
    for (const [op, ...v] of trazo) {
      const p = v.map(x => (x + j()) * N);
      if (op === 'M') g.moveTo(p[0], p[1]);
      else if (op === 'L') g.lineTo(p[0], p[1]);
      else g.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    }
    g.stroke();
  }
  const s = document.createElement('canvas');
  s.width = s.height = 28;
  const gs = s.getContext('2d', { willReadFrequently: true });
  gs.drawImage(c, 0, 0, 28, 28);
  const px = gs.getImageData(0, 0, 28, 28).data;
  return Float32Array.from({ length: 784 }, (_, i) => px[i * 4] / 255);
}

// ---------- Shaders ----------
const puntosVS = /* glsl */`
attribute vec3 aT;
attribute vec3 aSeed;
attribute float aFold;
uniform float uTime, uCompose, uPixel, uSize, uOpacity, uFog, uAspect, uWaveZ, uWaveOn, uNeuron;
uniform vec2 uMouse;
uniform vec3 uWaveColor;
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

  vec3 azul = vec3(0.0, 0.4, 1.0), cian = vec3(0.0, 0.8, 1.0);
  vec3 c = mix(azul, cian, clamp(aFold * 0.8 + aSeed.y * 0.2, 0.0, 1.0));
  c = mix(c, uWaveColor, clamp(onda * 0.85, 0.0, 1.0));
  vColor = mix(c, vec3(0.85, 0.95, 1.0), clamp(g * 0.4 + uNeuron * 0.45, 0.0, 1.0));
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
  // los mapas se escriben con la fila 0 arriba; R = valor, G = ya calculado
  vec4 tex = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y));
  vec3 col; float a;
  if (uModo < 0.5) {
    bool listo = tex.g > 0.5;
    col = listo ? cmap(tex.r) : vec3(0.0, 0.25, 0.6);
    a = listo ? 0.2 + 0.8 * tex.r : 0.05;
  } else {             // entrada en escala de grises
    col = mix(vec3(0.0, 0.05, 0.12), vec3(0.85, 0.95, 1.0), tex.r);
    a = 0.25 + 0.7 * tex.r;
  }
  float borde = 1.0 - smoothstep(0.0, 0.012, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  col = mix(col, vec3(0.0, 0.604, 1.0), borde * 0.7);
  a = max(a, borde * 0.7);
  gl_FragColor = vec4(col, a * uOpacity * exp(-pow(uFog * vProf, 2.0)));
  #include <colorspace_fragment>
}`;

// ---------- Etiquetas de texto en 3D ----------
function crearEtiqueta(alto = 1.1) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false });
  const s = new THREE.Sprite(mat);
  s.userData = { c, tex, alto, texto: null };
  s.scale.set(alto * 512 / 96, alto, 1);
  return s;
}
function escribir(sprite, texto, color = '#e8f6ff', fuente = '500 52px "IBM Plex Mono", Consolas, monospace') {
  const u = sprite.userData;
  const clave = texto + color;
  if (u.texto === clave) return;
  u.texto = clave;
  const g = u.c.getContext('2d');
  g.clearRect(0, 0, 512, 96);
  g.font = fuente;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillStyle = color;
  g.shadowColor = 'rgba(0, 204, 255, 0.55)';
  g.shadowBlur = 14;
  g.fillText(texto, 256, 50);
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
  // fondo como color de escena: pasa bien por el espacio de color del compositor
  scene.background = new THREE.Color(FONDO);
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);
  scene.add(camera); // el panel de entrenamiento va pegado a la cámara
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
    uWaveZ: { value: 0 }, uWaveOn: { value: 0 }, uWaveColor: { value: new THREE.Color(0.85, 0.95, 1.0) },
  };

  // Puntos del cerebro
  const { T, S, F, corteza } = construirCerebro();
  const gp = new THREE.BufferGeometry();
  gp.setAttribute('position', new THREE.BufferAttribute(S, 3));
  gp.setAttribute('aT', new THREE.BufferAttribute(T, 3));
  gp.setAttribute('aSeed', new THREE.BufferAttribute(Float32Array.from({ length: Q.puntos * 3 }, () => rand()), 3));
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

  // Sinapsis que crecen, coloreadas por los pesos reales de la red que aprende
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

  // Pulsos: hacia adelante (cian) y hacia atrás (violeta, backpropagation)
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

  // Líneas con transparencia por vértice (vecinos, atención)
  const crearLineas = (maxSeg) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSeg * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxSeg * 8), 4));
    g.setDrawRange(0, 0);
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const l = new THREE.LineSegments(g, m);
    l.frustumCulled = false;
    scene.add(l);
    return { g, m, n: 0, max: maxSeg };
  };
  const linea = (L, a, b, c, alfa) => {
    if (L.n >= L.max) return;
    L.g.attributes.position.array.set([a.x, a.y, a.z, b.x, b.y, b.z], L.n * 6);
    L.g.attributes.color.array.set([c.r, c.g, c.b, alfa, c.r, c.g, c.b, alfa], L.n * 8);
    L.n++;
  };
  const cerrar = L => {
    L.g.setDrawRange(0, L.n * 2);
    L.g.attributes.position.needsUpdate = true;
    L.g.attributes.color.needsUpdate = true;
    L.n = 0;
  };

  // ---------- 01 · Embeddings ----------
  const emb = { listo: false, palabras: [], activa: 0, t: 0 };
  const lineasEmb = crearLineas(260);
  const vectorSprite = (() => { // barras de las primeras 8 dimensiones de la palabra activa
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false }));
    s.scale.set(5.2, 1.3, 1);
    s.userData = { c, tex };
    scene.add(s);
    return s;
  })();
  const dibujarVector = v => {
    const { c, tex } = vectorSprite.userData, g = c.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    const max = Math.max(...v.map(Math.abs), 1e-6);
    v.forEach((x, i) => {
      const h = Math.abs(x) / max * 40, xx = 18 + i * 44;
      g.fillStyle = x >= 0 ? '#00ccff' : '#8c73ff';
      g.fillRect(xx, x >= 0 ? 56 - h : 56, 30, h);
    });
    g.fillStyle = 'rgba(232,246,255,0.75)';
    g.font = '500 30px "IBM Plex Mono", Consolas, monospace';
    g.textBaseline = 'middle';
    g.fillText('… 300d', 372, 56);
    g.fillStyle = 'rgba(0,204,255,0.35)';
    g.fillRect(14, 56, 344, 1);
    tex.needsUpdate = true;
  };

  // ---------- 02 · LLM ----------
  const llm = { listo: false, tokens: [], t: 0, espera: 0, primera: true, ultima: null };
  const lineasAtencion = crearLineas(11 * 18);
  const ranuras = [];
  const spritesTok = Array.from({ length: 11 }, () => { const s = crearEtiqueta(1.25); scene.add(s); return s; });
  {
    // arco de 11 posiciones sobre el cerebro, en el plano que mira a la cámara de esa etapa
    const n = V(0.94, 0.23, -0.28).normalize();
    const e1 = V(0, 1, 0).cross(n).normalize();
    const e2 = n.clone().cross(e1).normalize();
    const c = V(0, 2, 0).addScaledVector(n, 9).add(V(0, 2.5, 0)); // delante y arriba del cerebro
    for (let k = 0; k < 11; k++) {
      const a = THREE.MathUtils.degToRad(160 - k * 14);
      ranuras.push(c.clone().addScaledVector(e1, Math.cos(a) * 12).addScaledVector(e2, Math.sin(a) * 8));
    }
    llm.centro = V(0, 2, 0); // las curvas de atención pasan por el cerebro
  }
  const atencion = (q, ks) => { // softmax(q·k · 4) sobre las palabras anteriores, vectores normalizados de 32 dimensiones
    const sc = ks.map(k => { let d = 0; for (let i = 0; i < q.length; i++) d += q[i] * k[i]; return d * 4; });
    const m = Math.max(...sc), e = sc.map(x => Math.exp(x - m)), s = e.reduce((a, b) => a + b, 0);
    return e.map(x => x / s);
  };

  // ---------- 03 · Convolución ----------
  const conv = { listo: false, k: 0, pausa: 0, pasada: -1, ultimo: null };
  const grupoConv = new THREE.Group();
  grupoConv.position.set(0, 6, 22);
  scene.add(grupoConv);
  const CELDA = 0.17, NIN = 28, NOUT = 26, NPOOL = 13;
  const LADO_IN = NIN * CELDA, LADO_OUT = NOUT * CELDA, SEP = 1.4;
  const X_IN = -(LADO_IN / 2 + SEP + LADO_OUT / 2), X_POOL = LADO_OUT / 2 + SEP + LADO_OUT / 2;
  const texData = n => { const t = new THREE.DataTexture(new Uint8Array(n * n * 4), n, n, THREE.RGBAFormat); t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
  const texIn = texData(NIN), texOut = texData(NOUT), texPool = texData(NPOOL);
  const uPlanos = [];
  const plano = (map, modo, x, lado) => {
    const u = { uMap: { value: map }, uOpacity: { value: 0 }, uModo: { value: modo }, uFog: comunes.uFog };
    uPlanos.push(u);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(lado, lado), new THREE.ShaderMaterial({
      uniforms: u, vertexShader: planoVS, fragmentShader: planoFS, transparent: true, depthWrite: false,
    }));
    m.position.x = x;
    grupoConv.add(m);
  };
  plano(texIn, 1, X_IN, LADO_IN);
  plano(texOut, 0, 0, LADO_OUT);
  plano(texPool, 0, X_POOL, LADO_OUT);
  const etiquetasConv = [
    [X_IN, 'entrada 28×28'], [0, 'convolución → 26×26'], [X_POOL, 'max pooling → 13×13'],
  ].map(([x, t]) => { const s = crearEtiqueta(0.62); s.position.set(x, -LADO_OUT / 2 - 0.75, 0); escribir(s, t, 'rgba(232,246,255,0.85)'); grupoConv.add(s); return s; });
  const etiquetaKernel = crearEtiqueta(0.7);
  etiquetaKernel.position.set(X_IN, LADO_IN / 2 + 0.85, 0);
  grupoConv.add(etiquetaKernel);
  const marcoMat = new THREE.LineBasicMaterial({ color: BLANCO, transparent: true, opacity: 0, toneMapped: false, fog: false });
  const rayosMat = new THREE.LineBasicMaterial({ color: CIAN, transparent: true, opacity: 0, toneMapped: false, fog: false });
  const marcoGeo = new THREE.BufferGeometry(), rayosGeo = new THREE.BufferGeometry();
  marcoGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  rayosGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  grupoConv.add(new THREE.LineSegments(marcoGeo, marcoMat), new THREE.LineSegments(rayosGeo, rayosMat));
  let entrada = null, salida = null, kernelActual = null, kernels = [];
  const ordenDigitos = [7, 2, 3, 5, 4];
  const jitter = mulberry32(42);

  function nuevaPasada() {
    conv.pasada++;
    conv.k = 0; conv.pausa = 0;
    kernelActual = kernels[conv.pasada % kernels.length];
    entrada = dibujarDigito(ordenDigitos[conv.pasada % ordenDigitos.length], jitter);
    const din = texIn.image.data;
    for (let i = 0; i < NIN * NIN; i++) { din[i * 4] = entrada[i] * 255; din[i * 4 + 1] = 255; }
    texIn.needsUpdate = true;
    salida = new Float32Array(NOUT * NOUT);
    let max = 1e-6;
    for (let y = 0; y < NOUT; y++) for (let x = 0; x < NOUT; x++) {
      const v = Math.max(0, convolucionar(x, y)); // ReLU
      salida[y * NOUT + x] = v; max = Math.max(max, v);
    }
    conv.escala = max;
    texOut.image.data.fill(0); texOut.needsUpdate = true;
    texPool.image.data.fill(0); texPool.needsUpdate = true;
    escribir(etiquetaKernel, `kernel ${kernelActual.nombre}`, '#00ccff', '500 34px "IBM Plex Mono", Consolas, monospace');
  }
  function convolucionar(x, y) { // ventana válida: entrada (x..x+2, y..y+2)
    let z = 0;
    for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) z += kernelActual.k[ky][kx] * entrada[(y + ky) * NIN + x + kx];
    return z;
  }
  function avanzarConvolucion(dt) {
    if (!conv.listo) return;
    if (conv.k >= NOUT * NOUT) {
      conv.pausa += dt;
      if (conv.pausa > 1.8) nuevaPasada();
      return;
    }
    const dOut = texOut.image.data, dPool = texPool.image.data;
    const n = reduceMotion ? NOUT * NOUT : Math.max(1, Math.round(NOUT * NOUT / 7 * dt)); // ~7 s por pasada
    for (let i = 0; i < n && conv.k < NOUT * NOUT; i++, conv.k++) {
      dOut[conv.k * 4] = salida[conv.k] / conv.escala * 255;
      dOut[conv.k * 4 + 1] = 255;
      const x = conv.k % NOUT, y = Math.floor(conv.k / NOUT);
      if (y % 2 === 1 && x % 2 === 1) { // completa una ventana 2×2 → max pooling
        const px = (x - 1) / 2, py = (y - 1) / 2;
        const m = Math.max(salida[(y - 1) * NOUT + x - 1], salida[(y - 1) * NOUT + x], salida[y * NOUT + x - 1], salida[y * NOUT + x]);
        dPool[(py * NPOOL + px) * 4] = m / conv.escala * 255;
        dPool[(py * NPOOL + px) * 4 + 1] = 255;
      }
    }
    texOut.needsUpdate = true; texPool.needsUpdate = true;
    const k = Math.min(conv.k, NOUT * NOUT - 1), x = k % NOUT, y = Math.floor(k / NOUT);
    const z = convolucionar(x, y);
    conv.ultimo = { x, y, z, relu: Math.max(0, z), kernel: kernelActual.nombre };
    // marco 3×3 sobre la entrada y rayos hacia el píxel de salida
    const pxIn = gx => X_IN - LADO_IN / 2 + gx * CELDA, pyIn = gy => LADO_IN / 2 - gy * CELDA;
    const pxOut = gx => -LADO_OUT / 2 + gx * CELDA, pyOut = gy => LADO_OUT / 2 - gy * CELDA;
    const kp = marcoGeo.attributes.position.array;
    let o = 0;
    for (let i = 0; i <= 3; i++) {
      kp.set([pxIn(x + i), pyIn(y), 0.02, pxIn(x + i), pyIn(y + 3), 0.02], o); o += 6;
      kp.set([pxIn(x), pyIn(y + i), 0.02, pxIn(x + 3), pyIn(y + i), 0.02], o); o += 6;
    }
    marcoGeo.attributes.position.needsUpdate = true;
    const rp = rayosGeo.attributes.position.array, ox = pxOut(x + 0.5), oy = pyOut(y + 0.5);
    o = 0;
    [[x, y], [x + 3, y], [x + 3, y + 3], [x, y + 3]].forEach(([gx, gy]) => { rp.set([pxIn(gx), pyIn(gy), 0.02, ox, oy, 0.02], o); o += 6; });
    const esq = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    esq.forEach(([gx, gy], i) => { const [hx, hy] = esq[(i + 1) % 4]; rp.set([pxOut(gx), pyOut(gy), 0.03, pxOut(hx), pyOut(hy), 0.03], o); o += 6; });
    rayosGeo.attributes.position.needsUpdate = true;
  }

  // ---------- 04 · Backpropagation y entrenamiento por ejemplos ----------
  const red = crearRedEntrenable();
  red.pesos(pesos);
  const historial = [];
  let metrica = red.evaluar(), entrenando = false;
  const ej = { k: 0, t: 0, dato: null, orden: 0 };
  const panel = (() => { // frontera de decisión y los 200 ejemplos, pegado a la cámara
    const c = document.createElement('canvas');
    c.width = c.height = 320;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
    m.renderOrder = 10;
    camera.add(m);
    return { c, tex, m, t: 0 };
  })();
  function dibujarPanel() {
    const g = panel.c.getContext('2d'), N = 40, L = 320, A = 26;
    g.clearRect(0, 0, L, L);
    g.fillStyle = 'rgba(10, 12, 18, 0.55)';
    g.fillRect(0, 0, L, L);
    const area = L - A - 8, ox = 4, oy = A + 4, cel = area / N;
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
      const x = (gx + 0.5) / N * 2.2 - 1.1, y = 1.1 - (gy + 0.5) / N * 2.2;
      const p = red.forward([x, y]).a[3][0], f = Math.abs(p - 0.5) * 2;
      g.fillStyle = p > 0.5 ? `rgba(0, 204, 255, ${0.08 + 0.32 * f})` : `rgba(140, 115, 255, ${0.08 + 0.32 * f})`;
      g.fillRect(ox + gx * cel, oy + gy * cel, cel + 0.5, cel + 0.5);
    }
    const P = ([x, y]) => [ox + (x + 1.1) / 2.2 * area, oy + (1.1 - y) / 2.2 * area];
    red.X.forEach((x, k) => {
      const [px, py] = P(x);
      g.fillStyle = red.Y[k] ? '#00ccff' : '#8c73ff';
      g.beginPath(); g.arc(px, py, 2.4, 0, Math.PI * 2); g.fill();
    });
    if (ej.dato) {
      const [px, py] = P(ej.dato.x);
      g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(232, 246, 255, 0.85)';
    g.font = '500 15px "IBM Plex Mono", Consolas, monospace';
    g.textBaseline = 'middle';
    g.fillText(`200 ejemplos · época ${red.epoca}`, 8, 14);
    g.strokeStyle = 'rgba(0, 204, 255, 0.5)'; g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, L - 1, L - 1);
    panel.tex.needsUpdate = true;
  }

  // ---------- Carga de datos ----------
  async function cargar() {
    const d = await fetch(DATOS).then(r => r.json());
    if (document.fonts && document.fonts.load) await document.fonts.load('500 52px "IBM Plex Mono"').catch(() => {});

    // embeddings: sprite por palabra en su posición PCA (alrededor del cerebro)
    const centro = V(4, 1, -2.5); // un poco hacia la derecha de la cámara de inicio
    emb.palabras = d.embeddings.palabras.map(p => {
      const s = crearEtiqueta(0.95);
      escribir(s, p.w, 'rgba(232, 246, 255, 0.9)', '500 46px "Inter", -apple-system, sans-serif');
      const destino = centro.clone().add(V(p.p[0] * 0.62, p.p[1] * 0.8, p.p[2] * 0.7));
      const origen = destino.clone().multiplyScalar(2.6).add(V(gauss() * 8, gauss() * 6, 20 + gauss() * 8));
      s.position.copy(origen);
      scene.add(s);
      return { ...p, s, destino, origen };
    });
    const idx = Object.fromEntries(emb.palabras.map((p, i) => [p.w, i]));
    emb.vecinosIdx = emb.palabras.map(p => p.vecinos.map(([w, c]) => [idx[w], c]));
    emb.listo = true;

    // LLM
    llm.vocab = d.llm.vocab;
    llm.indice = Object.fromEntries(d.llm.vocab.map((w, i) => [w, i]));
    llm.vec = d.llm.vec;
    llm.bigramas = d.llm.bigramas;
    llm.inicios = d.llm.inicios;
    llm.listo = true;

    // convolución
    kernels = d.convolucion.kernels;
    conv.listo = true;
    nuevaPasada();
  }

  const LEMA = ['transformamos', 'datos', 'en', 'decisiones', '.'];
  function siguienteToken() {
    const toks = llm.tokens;
    if (!toks.length) {
      const w = llm.primera ? LEMA[0] : llm.inicios[Math.floor(Math.random() * llm.inicios.length)];
      toks.push(w);
      llm.ultima = { w, p: null, prev: null, atn: [] };
      return;
    }
    const prev = toks[toks.length - 1];
    let cand = llm.bigramas[prev] || [['.', 1]];
    // decodificación: sin punto final antes de la cuarta palabra, y cierre al llegar a 10
    if (toks.length < 4 && cand.some(([c]) => c !== '.')) cand = cand.filter(([c]) => c !== '.');
    if (toks.length >= 10 && cand.some(([c]) => c === '.')) cand = cand.filter(([c]) => c === '.');
    const total = cand.reduce((a, [, n]) => a + n, 0);
    let w = cand[0][0];
    if (llm.primera && cand.some(([c]) => c === LEMA[toks.length])) w = LEMA[toks.length];
    else {
      let r = Math.random() * total;
      for (const [c, n] of cand) { r -= n; if (r <= 0) { w = c; break; } }
    }
    if (w === '.' || toks.length >= 10) llm.primera = false;
    const p = (cand.find(([c]) => c === w)[1]) / total;
    toks.push(w);
    const vecDe = t => llm.vec[llm.indice[t]];
    llm.ultima = { w, p, prev, atn: atencion(vecDe(w), toks.slice(0, -1).map(vecDe)) };
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
  const etapaScroll = () => {
    const y = window.scrollY;
    for (let i = 0; i < 4; i++) if (y < A[i + 1]) return i + clamp((y - A[i]) / (A[i + 1] - A[i]), 0, 1);
    return 3;
  };

  // Paradas de cámara (s = etapa continua 0–3). "corre" desplaza el foco hacia la
  // izquierda de la cámara, así el objeto queda en la mitad derecha, libre del texto;
  // con valores negativos queda en la mitad izquierda.
  const PARADAS = [
    { s: 0.0, cam: V(25, 8, 40), foco: V(0, -1, 0), corre: 13 },
    { s: 0.6, cam: V(40, 6, 26), foco: V(0, 0, 0), corre: 11 },
    // en servicios la lista va a la derecha: el cerebro y el texto generado pasan a la izquierda
    { s: 1.0, cam: V(50, 6, 4), foco: V(0, 3, -1), corre: -12 },
    { s: 1.55, cam: V(36, 16, -28), foco: V(0, 3, -2), corre: -11 },
    { s: 2.0, cam: V(-6, 1.5, 47), foco: V(0, -0.5, 22), corre: 6.5 },
    { s: 2.5, cam: V(-3, 2, 46), foco: V(0, -0.5, 22), corre: 6.5 },
    { s: 3.0, cam: V(52, 12, 50), foco: V(0, -5, 0), corre: 15 },
  ];
  const rutaCam = new THREE.CatmullRomCurve3(PARADAS.map(p => p.cam), false, 'centripetal');
  const rutaMira = new THREE.CatmullRomCurve3(PARADAS.map(p => p.foco), false, 'centripetal');
  const tramo = s => {
    for (let i = 0; i < PARADAS.length - 1; i++) {
      if (s <= PARADAS[i + 1].s) return [i, (s - PARADAS[i].s) / (PARADAS[i + 1].s - PARADAS[i].s)];
    }
    return [PARADAS.length - 2, 1];
  };
  const derecha = V(0, 0, 0), arriba = V(0, 1, 0);

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
  let sCur = etapaScroll(), tPrev = performance.now(), tiempo = 0, hudT = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - tPrev) / 1000);
    const dtr = Math.min(0.25, (now - tPrev) / 1000); // para los procesos: tiempo real aunque haya pocos cuadros
    tPrev = now;
    if (modal && modal.classList.contains('show')) return;
    if (!reduceMotion) tiempo += dt;

    let intro = 1;
    if (!reduceMotion) intro = introInicio > 0 && now > introInicio ? Math.min(1, (now - introInicio) / 2600) : 0;
    const ease = 1 - Math.pow(1 - intro, 3);

    sCur += (etapaScroll() - sCur) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 2.6));
    const s = sCur;
    const angosto = camera.aspect < 1.1;

    // visibilidad de cada proceso
    const compone = 0.55 * ease + 0.45 * smooth(0.05, 1.0, s);
    const crece = smooth(0.85, 1.7, s) * 1.15;
    const embVis = ease * (1 - smooth(0.7, 1.0, s));
    const llmVis = smooth(0.8, 1.05, s) * (1 - smooth(1.65, 1.9, s));
    const convVis = smooth(1.85, 2.05, s) * (1 - smooth(2.55, 2.8, s));
    const trainVis = smooth(2.6, 2.9, s);

    // 01 · embeddings: las palabras llegan a su lugar y se conectan con sus vecinas
    if (emb.listo) {
      const llegada = smooth(0, 1, compone);
      emb.t += dtr;
      if (emb.t > 1.4) { emb.t = 0; emb.activa = (emb.activa + 7) % emb.palabras.length; }
      emb.palabras.forEach((p, i) => {
        p.s.position.lerpVectors(p.origen, p.destino, llegada);
        const activa = i === emb.activa, vecina = emb.vecinosIdx[emb.activa].some(([j]) => j === i);
        p.s.material.opacity = embVis * (activa ? 1 : vecina ? 0.8 : 0.32);
        const esc = activa ? 1.25 : 1;
        p.s.scale.set(0.95 * 512 / 96 * esc, 0.95 * esc, 1);
      });
      if (embVis > 0.01) {
        const base = new THREE.Color(0.0, 0.5, 0.85);
        emb.palabras.forEach((p, i) => emb.vecinosIdx[i].slice(0, 2).forEach(([j, c]) => {
          if (j > i || !emb.vecinosIdx[j].slice(0, 2).some(([k]) => k === i)) linea(lineasEmb, p.s.position, emb.palabras[j].s.position, base, embVis * 0.22 * c);
        }));
        const act = emb.palabras[emb.activa];
        emb.vecinosIdx[emb.activa].forEach(([j, c]) => linea(lineasEmb, act.s.position, emb.palabras[j].s.position, CIAN, embVis * (0.35 + c)));
        vectorSprite.position.copy(act.s.position).add(V(0, 1.35, 0));
        if (vectorSprite.userData.w !== act.w) { dibujarVector(act.v); vectorSprite.userData.w = act.w; }
      }
      vectorSprite.material.opacity = embVis;
      cerrar(lineasEmb);
    }

    // 02 · LLM: genera palabra por palabra y dibuja la atención de la última sobre las anteriores
    if (llm.listo) {
      if (llmVis > 0.3 || llm.tokens.length === 0) {
        llm.t += dtr;
        const terminada = llm.tokens.length >= 11 || llm.tokens[llm.tokens.length - 1] === '.';
        if (terminada) { llm.espera += dtr; if (llm.espera > 1.8) { llm.tokens = []; llm.espera = 0; llm.t = 1; } }
        else if (llm.t > (reduceMotion ? 0.3 : 0.85)) { llm.t = 0; siguienteToken(); }
      }
      spritesTok.forEach((sp, k) => {
        const w = llm.tokens[k];
        if (w) {
          sp.position.copy(ranuras[k]);
          const ultima = k === llm.tokens.length - 1;
          escribir(sp, w, ultima ? '#00ccff' : 'rgba(232, 246, 255, 0.92)', '500 50px "Inter", -apple-system, sans-serif');
          sp.material.opacity = llmVis * (ultima ? 1 : 0.85);
        } else sp.material.opacity = 0;
      });
      if (llmVis > 0.01 && llm.ultima && llm.tokens.length > 1) {
        const q = ranuras[llm.tokens.length - 1];
        const ctrl = llm.centro;
        const c = new THREE.Color(), a = V(0, 0, 0), b = V(0, 0, 0);
        llm.ultima.atn.forEach((w, k) => {
          const dest = ranuras[k];
          c.copy(CIAN).lerp(BLANCO, w);
          for (let i = 0; i < 16; i++) { // curva cuadrática que pasa cerca del centro del cerebro
            const t0 = i / 16, t1 = (i + 1) / 16;
            const bez = (t, out) => out.set(0, 0, 0).addScaledVector(q, (1 - t) ** 2).addScaledVector(ctrl, 2 * t * (1 - t)).addScaledVector(dest, t * t);
            bez(t0, a); bez(t1, b);
            linea(lineasAtencion, a, b, c, llmVis * (0.08 + 0.9 * w));
          }
        });
      }
      cerrar(lineasAtencion);
    }

    // 03 · convolución
    if (convVis > 0.01) avanzarConvolucion(dtr);
    for (const u of uPlanos) u.uOpacity.value = convVis;
    etiquetasConv.forEach(e => { e.material.opacity = convVis; });
    etiquetaKernel.material.opacity = convVis;
    marcoMat.opacity = convVis;
    rayosMat.opacity = convVis * 0.8;

    // 04 · entrenamiento por ejemplos con backpropagation
    if (s < 2.3 && red.pasos > 0) { red.reiniciar(); historial.length = 0; red.pesos(pesos); metrica = red.evaluar(); ej.dato = null; }
    entrenando = trainVis > 0.5;
    let fase = 0; // 0 = adelante, 1 = atrás
    if (entrenando) {
      const pasos = reduceMotion ? 20 : 2;
      for (let i = 0; i < pasos; i++) red.paso();
      if (red.pasos % 10 === 0) { metrica = red.evaluar(); historial.push(metrica.loss); if (historial.length > 120) historial.shift(); }
      red.pesos(pesos);
      ej.t += dtr;
      if (!ej.dato || ej.t > 1.3) { ej.t = 0; ej.orden = (ej.orden + 37) % red.X.length; ej.dato = red.ejemplo(ej.orden); }
      fase = ej.t < 0.65 ? 0 : 1;
      panel.t += dtr;
      if (panel.t > 0.2) { panel.t = 0; dibujarPanel(); }
    }
    const ondaT = entrenando ? (fase === 0 ? ej.t / 0.65 : (ej.t - 0.65) / 0.65) : (tiempo * 0.4) % 1;
    comunes.uWaveZ.value = entrenando && fase === 1 ? lerp(-15, 15, clamp(ondaT, 0, 1)) : lerp(15, -15, clamp(ondaT, 0, 1));
    comunes.uWaveOn.value = Math.max(llmVis * 0.7, trainVis) * (1 - convVis);
    comunes.uWaveColor.value.copy(entrenando && fase === 1 ? VIOLETA : BLANCO);
    comunes.uTime.value = tiempo;
    uPulsos.uDir.value = entrenando && fase === 1 ? -1 : 1;
    uPulsos.uColor.value.copy(entrenando && fase === 1 ? VIOLETA : CIAN);
    uPulsos.uOpacity.value = ease * Math.max(llmVis, trainVis) * (1 - convVis);

    // panel pegado a la cámara: a la derecha del cerebro, a la altura del formulario
    panel.m.material.opacity = angosto ? 0 : trainVis;
    if (!angosto) {
      const D = 18, hh = D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), hw = hh * camera.aspect;
      const px = Math.min(240, window.innerHeight * 0.28, window.innerWidth * 0.17);
      const lado = px / window.innerHeight * 2 * hh;
      panel.m.scale.set(lado, lado, 1);
      const nx = 1 - (px / 2 + Math.max(24, (window.innerWidth - 1160) / 2 + 16)) / (window.innerWidth / 2);
      panel.m.position.set(nx * hw, 0.17 * hh, -D);
      panel.m.rotation.y = -0.22;
    }

    uPuntos.uCompose.value = compone;
    uPuntos.uOpacity.value = ease * (1 - 0.65 * convVis);
    uNeuronas.uOpacity.value = ease * smooth(0.8, 1.15, s) * (1 - 0.7 * convVis);
    uSinapsis.uCrece.value = crece;
    uSinapsis.uOpacity.value = ease * (1 - 0.7 * convVis) * (0.8 + 0.4 * trainVis);

    // mouse
    mouseS.lerp(mouseT, 1 - Math.exp(-dt * 2.5));
    if (mouseDentro) {
      if (mouse.x > 5) mouse.copy(mouseT);
      mouse.lerp(mouseT, 1 - Math.exp(-dt * 8));
    } else mouse.set(9, 9);
    comunes.uMouse.value.copy(mouse);

    // cámara
    const [ti, tf] = tramo(s);
    rutaCam.getPoint((ti + tf) / (PARADAS.length - 1), pos);
    rutaMira.getPoint((ti + tf) / (PARADAS.length - 1), mira);
    derecha.subVectors(mira, pos).cross(arriba).normalize();
    if (angosto) { // pantallas angostas: más lejos y un poco más abajo, debajo del texto
      pos.addScaledVector(pos.clone().sub(mira).normalize(), 14);
      mira.y += 7;
    } else mira.addScaledVector(derecha, -lerp(PARADAS[ti].corre, PARADAS[ti + 1].corre, tf));
    pos.x -= mouseS.x * 2; pos.y += mouseS.y * 1.3;
    pos.z += (1 - ease) * 40;
    camera.position.copy(pos);
    camera.lookAt(mira.x - mouseS.x * 1.5, mira.y + mouseS.y, mira.z);
    cerebro.rotation.y = Math.sin(tiempo * 0.1) * 0.3 * (1 - convVis) * (1 - llmVis) + mouseS.x * 0.12;
    cerebro.rotation.x = -mouseS.y * 0.06;

    if (composer) composer.render(); else renderer.render(scene, camera);

    // telemetría (10 veces por segundo)
    hudT += dt;
    if (hudT > 0.1) {
      hudT = 0;
      telemetria.actualizar({
        s, compone,
        emb: emb.listo ? emb.palabras[emb.activa] : null,
        llm: llm.listo ? { tokens: llm.tokens, ultima: llm.ultima } : null,
        conv: conv.ultimo,
        train: { epoca: red.epoca, metrica, historial, ej: ej.dato, fase, entrenando },
      });
    }
  }

  cargar().catch(() => { /* sin datos: el cerebro y el entrenamiento siguen funcionando */ });
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
  barra.setAttribute('aria-label', 'Estado de los procesos de IA del fondo');
  barra.innerHTML = `
    <span class="vms-live"><i></i>IA</span>
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
      if (e === 0 && d.emb) {
        capa = `‘${d.emb.w}’ → [${d.emb.v.slice(0, 3).map(v => num(v)).join(' ')} …] 300d`;
        const [w, c] = d.emb.vecinos[0];
        forma = `vecina ‘${w}’ · coseno ${num(c)}`;
      } else if (e === 1 && d.llm && d.llm.ultima) {
        capa = d.llm.tokens.join(' ').replace(' .', '.');
        const u = d.llm.ultima;
        if (u.p !== null) {
          const toks = d.llm.tokens, i = u.atn.reduce((m, v, k, arr) => (v > arr[m] ? k : m), 0);
          forma = `P(‘${u.w}’ | ‘${u.prev}’) = ${num(u.p)} · atención ‘${toks[i]}’ ${num(u.atn[i])}`;
        } else forma = 'inicio de frase';
      } else if (e === 2 && d.conv) {
        capa = `kernel ${d.conv.kernel} · 3×3`;
        forma = `(${d.conv.x},${d.conv.y}) Σ = ${num(d.conv.z)} → ReLU ${num(d.conv.relu)}`;
      } else if (e === 3) {
        const t = d.train;
        capa = t.entrenando ? `época ${t.epoca} · pérdida ${num(t.metrica.loss, 3)} · precisión ${Math.round(t.metrica.acc * 100)}%` : '200 ejemplos de entrenamiento';
        if (t.ej) {
          forma = t.fase === 0
            ? `ejemplo → p = ${num(t.ej.p)} · clase ${t.ej.y ? 'A' : 'B'}`
            : `backprop · error ${num(t.ej.error)} · ‖∂L/∂W‖ ${num(t.ej.grad, 3)}`;
        }
      }
      set('.vms-layer', capa);
      set('.vms-shape', forma);
      const h = d.train.historial;
      spark.hidden = e !== 3 || h.length < 2;
      if (!spark.hidden) {
        const max = Math.max(...h, 0.01);
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
