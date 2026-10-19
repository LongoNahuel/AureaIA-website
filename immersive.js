/* ==========================================================================
   AureaIA — Recorrido inmersivo por el entrenamiento de una red neuronal

   El fondo es un viaje continuo: al bajar, la cámara entra en un cerebro y
   recorre por dentro una red neuronal multicapa real (fondo/red.js) mientras
   se entrena con dígitos escritos a mano.

     01 Datos            (#inicio)     al acercarse, columnas verticales de
                                       código caen como lluvia: fórmulas de
                                       backpropagation (violeta) y binario y
                                       hexadecimal (cian); un flujo entra al
                                       cerebro
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
   Sin carteles ni etiquetas: fuera de la lluvia de código del inicio, todo
   se lee por forma, color y movimiento (los números viven en la franja de
   telemetría debajo del menú).

   Resolución: hasta 2× la densidad de píxeles de la pantalla (MSAA ×4 en el
   compositor cuando la pantalla es de densidad 1–1,5) y escala adaptativa:
   baja la resolución si el equipo no llega a ~45 fps. Three.js con bloom
   (UnrealBloomPass) y niebla. Sin WebGL, el sitio usa particles.js como antes.
   ========================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { crearDatos, crearRed, crearEntrenador, pca3, trazosDeformados, N, NC, NCONV, NPOOL, NIN, NH1, NH2, NOUT } from './fondo/red.js';

const ETAPAS = [
  { id: 'inicio', nombre: 'Datos' },
  { id: 'servicios', nombre: 'Forward' },
  { id: 'historias', nombre: 'Backpropagation' },
  { id: 'contacto', nombre: 'Entrenamiento' },
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const compacto = coarse || Math.min(window.innerWidth, window.innerHeight) < 700;
// más puntos y más finos que antes: el cerebro se ve definido a 2× sin ganar brillo
const Q = compacto ? { puntos: 14000, tam: 0.54, niebla: 0.0065 } : { puntos: 42000, tam: 0.47, niebla: 0.0055 };
const PR_MAX = Math.min(window.devicePixelRatio || 1, 2);
const PR_MIN = Math.min(PR_MAX, 1);
const TESELA = 40; // px de cada dígito en el atlas del panel (los datos de la red siguen en 14×14)

// Lluvia de código del inicio: fórmulas reales de backpropagation y Adam, y columnas de binario/hex
const FORMULAS = [
  '∂L/∂w=δ·aᵀ', "δ=(Wᵀδ')⊙ReLU'(z)", 'w←w−η·∂L/∂w', '∂L/∂b=δ', '∂L/∂z=p−y', 'L=−Σy·log(p)',
  'z=W·a+b', 'a=ReLU(z)', 'p=softmax(z)', '∂L/∂a=Wᵀδ', 'm←β₁m+(1−β₁)g', 'v←β₂v+(1−β₂)g²',
  'θ←θ−η·m/(√v+ε)', 'η=0.003', "ReLU'(z)=[z>0]",
];
const HEXA = '0123456789ABCDEF';
const LLUVIA = compacto ? { columnas: 90, tam: 1.1 } : { columnas: 150, tam: 0.95 };

const FONDO = 0x0a0a0a;
const CIAN = new THREE.Color(0x00ccff);
const VIOLETA = new THREE.Color(0.55, 0.45, 1.0);
const BLANCO = new THREE.Color(0xe8f6ff);

// profundidad de cada capa (la señal avanza hacia -z)
const Z = { in: 26, conv: 18, pool: 11, h1: 1, h2: -8, out: -17, perdida: -22 };
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
uniform float uTime, uCompose, uPixel, uSize, uOpacity, uFog, uWaveZ, uWaveOn, uGan;
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
  vAlpha = (0.14 + lum * 0.5 + onda * 0.6) * mix(0.45, 1.0, t) * uOpacity * uGan
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

// Lluvia de código: cada punto es un carácter del atlas de glifos. Una "cabeza"
// baja por cada columna y deja una estela que se apaga, como en Matrix.
const lluviaVS = /* glsl */`
attribute float aGlifo;
attribute float aFila;
attribute vec4 aCol;    // velocidad (filas/s), fase, largo de la estela, ciclo
attribute float aTipo;  // 0 código, 1 fórmula
uniform float uPixel, uOpacity, uFog, uTam, uEscala, uTime;
uniform vec2 uGrilla;
varying vec2 vTile;
varying float vLuz;
varying float vPunta;
varying float vTipo;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.5);
  gl_PointSize = uTam * uEscala * uPixel / depth;
  float cabeza = mod(uTime * aCol.x + aCol.y, aCol.w);
  float d = cabeza - aFila;                       // > 0: la cabeza ya pasó por este carácter
  vPunta = exp(-d * d * 1.6);
  vLuz = d < 0.0 ? 0.0 : exp(-d / aCol.z);
  vTile = vec2(mod(aGlifo, uGrilla.x), floor(aGlifo / uGrilla.x));
  vTipo = aTipo;
  vAlpha = uOpacity * exp(-pow(uFog * depth, 2.0)) * smoothstep(6.0, 18.0, depth); // las columnas que pasan al lado se apagan
}`;
const lluviaFS = /* glsl */`
uniform sampler2D uAtlas;
uniform vec2 uGrilla;
varying vec2 vTile;
varying float vLuz;
varying float vPunta;
varying float vTipo;
varying float vAlpha;
void main() {
  float v = texture2D(uAtlas, (vTile + gl_PointCoord) / uGrilla).r;
  if (v < 0.02) discard;
  vec3 base = mix(vec3(0.0, 0.62, 1.0), vec3(0.62, 0.5, 1.0), vTipo); // código cian, fórmulas violeta
  vec3 c = mix(base, vec3(0.9, 0.97, 1.0), vPunta * 0.85);
  float fondo = mix(0.05, 0.15, vTipo);                               // las fórmulas quedan legibles
  gl_FragColor = vec4(c, v * vAlpha * (fondo + (1.0 - fondo) * max(vLuz, vPunta)));
}`;

// Atlas de glifos (64 px por carácter) para la lluvia de código
function crearAtlasGlifos(caracteres) {
  const T = 64, cols = 16, filas = Math.ceil(caracteres.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * T; c.height = filas * T;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  const fuente = '500 44px "IBM Plex Mono", "SFMono-Regular", Consolas, "DejaVu Sans Mono", "Cambria Math", "Segoe UI Symbol", monospace';
  const dibujar = () => {
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.font = fuente; g.textAlign = 'center'; g.textBaseline = 'middle';
    caracteres.forEach((ch, i) => g.fillText(ch, (i % cols) * T + T / 2, Math.floor(i / cols) * T + T / 2 + 2));
    tex.needsUpdate = true;
  };
  dibujar();
  // cuando llega IBM Plex Mono se vuelve a dibujar con la fuente del sitio
  if (document.fonts && document.fonts.load) document.fonts.load('500 44px "IBM Plex Mono"').then(dibujar).catch(() => {});
  return { tex, grilla: new THREE.Vector2(cols, filas), indice: new Map(caracteres.map((ch, i) => [ch, i])) };
}

// ---------- Lienzos 2D dentro de la escena (solo gráficos, sin texto) ----------
// Se dibujan a 2× para que sigan nítidos en pantallas de alta densidad.
function crearLienzo(ancho, alto, escala = 2) {
  const c = document.createElement('canvas');
  c.width = ancho * escala; c.height = alto * escala;
  const g = c.getContext('2d');
  g.setTransform(escala, 0, 0, escala, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, g, tex, ancho, alto };
}

// ---------- Escena ----------
// Si algo falla al armar la escena (navegador, GPU o extensión no soportada), se
// quita el canvas y el sitio sigue con las partículas 2D de particles.js.
function iniciar() {
  try {
    return iniciarEscena();
  } catch (e) {
    console.warn('AureaIA: no se pudo iniciar el fondo 3D; se usan las partículas 2D.', e);
    document.querySelectorAll('canvas.immersive-canvas, .vms-row').forEach(el => el.remove());
    return false;
  }
}

function iniciarEscena() {
  let renderer;
  try {
    // en escritorio el antialias lo hace el compositor (MSAA ×4); en celulares, el canvas
    renderer = new THREE.WebGLRenderer({ antialias: compacto, powerPreference: 'high-performance' });
  } catch (_) {
    return false;
  }
  if (!renderer.getContext()) return false;

  let pr = PR_MAX;
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

  // ---------- Compositor (bloom), con niveles para que funcione en cualquier navegador ----------
  //   nivel 0: bloom + MSAA ×4    nivel 1: bloom sin MSAA    nivel 2: sin bloom (render directo)
  //   nivel 3: se desactiva el 3D y quedan las partículas 2D
  // Firefox y algunas GPU no aceptan MSAA sobre buffers de media precisión, o no tienen esos
  // buffers: se consulta qué soporta el navegador y, además, se verifica que la imagen no salga negra.
  const soporte = (() => {
    const gl = renderer.getContext(), ext = renderer.extensions, w2 = renderer.capabilities.isWebGL2;
    const flotante = w2 ? ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')
                        : ext.has('OES_texture_half_float') && ext.has('EXT_color_buffer_half_float');
    let muestras = 0;
    // MSAA solo en pantallas de densidad 1–1,5 y hasta ~2,4 MP: a 2× las líneas ya salen finas
    const px = window.innerWidth * window.innerHeight * PR_MAX * PR_MAX;
    if (w2 && flotante && PR_MAX < 1.75 && px <= 2.4e6) {
      try {
        const lista = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
        muestras = Array.from(lista || []).find(n => n <= 4) || 0;
      } catch (_) { muestras = 0; }
    }
    return { flotante, muestras };
  })();
  let composer = null;
  let nivel = compacto || !soporte.flotante ? 2 : 0;

  function crearComposer(muestras) {
    const w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: muestras });
    const c = new EffectComposer(renderer, rt);
    c.setPixelRatio(pr);
    c.setSize(w, h);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.45, 0.34));
    c.addPass(new OutputPass());
    return c;
  }
  function composerCompleto(c) {
    const gl = renderer.getContext();
    try {
      for (const rt of [c.renderTarget1, c.renderTarget2]) {
        renderer.setRenderTarget(rt);
        renderer.clear();
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
      }
      return true;
    } catch (_) {
      return false;
    } finally {
      renderer.setRenderTarget(null);
    }
  }
  function soltarComposer() {
    if (!composer) return;
    composer.passes.forEach(p => p.dispose && p.dispose());
    composer.dispose();
    composer = null;
  }
  function armarComposer() {
    soltarComposer();
    if (nivel === 1 && !soporte.muestras) nivel = 2;   // sin MSAA el nivel 1 es igual al 0
    if (nivel >= 2) return;
    const c = crearComposer(nivel === 0 ? soporte.muestras : 0);
    if (composerCompleto(c)) { composer = c; return; }
    c.passes.forEach(p => p.dispose && p.dispose());
    c.dispose();
    nivel++;
    armarComposer();
  }
  armarComposer();

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
    uTime: { value: 0 }, uCompose: { value: 0 }, uPixel: { value: pr }, uSize: { value: Q.tam },
    uOpacity: { value: 0 }, uFog: { value: Q.niebla }, uWaveZ: { value: 0 }, uWaveOn: { value: 0 }, uWaveColor: { value: CIAN.clone() },
    uGan: { value: 0.85 }, // compensa el brillo de tener más puntos
  };
  scene.add(new THREE.Points(gc, new THREE.ShaderMaterial({
    uniforms: uCerebro, vertexShader: cerebroVS, fragmentShader: suaveFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // ---------- Atlas de dígitos (miniaturas del panel de entrenamiento) ----------
  // 25×20 dígitos redibujados en alta resolución con los mismos trazos y la
  // misma deformación que el ejemplo de 14×14 con el que entrena la red.
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = 25 * TESELA; atlasCanvas.height = 20 * TESELA;
  (() => {
    const g = atlasCanvas.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    datos.X.forEach((_, k) => {
      const x0 = (k % 25) * TESELA, y0 = Math.floor(k / 25) * TESELA, def = datos.D[k];
      g.lineWidth = (def.ancho + 1.2 / N) * TESELA; // el 14×14 suaviza ~1 píxel de borde
      for (const trazo of trazosDeformados(datos.Y[k], def)) {
        g.beginPath();
        trazo.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, x0 + x * TESELA, y0 + y * TESELA));
        g.stroke();
      }
    });
  })();

  // ---------- Lluvia de código: fórmulas de backpropagation, binario y hex ----------
  const glifos = [...new Set([...FORMULAS.join(''), ...HEXA, 'x'])];
  const atlasGlifos = crearAtlasGlifos(glifos);
  const lluvia = { pos: [], glifo: [], fila: [], col: [], tipo: [], cambia: [] }; // cambia: 0 fijo, 1 binario, 2 hex
  const textoCodigo = () => {
    if (rand() < 0.5) return Array.from({ length: 14 + Math.floor(rand() * 14) }, () => (rand() < 0.5 ? '0' : '1')).join('');
    let t = '';
    while (t.length < 16) t += (t ? '  ' : '') + '0x' + Array.from({ length: 2 + 2 * Math.floor(rand() * 2) }, () => HEXA[Math.floor(rand() * 16)]).join('');
    return t;
  };
  const sep = LLUVIA.tam * 1.08;
  for (let k = 0; k < LLUVIA.columnas; k++) {
    const formula = rand() < 0.38;
    const texto = formula ? FORMULAS[Math.floor(rand() * FORMULAS.length)] + '   ' + FORMULAS[Math.floor(rand() * FORMULAS.length)] : textoCodigo();
    const chars = Array.from(texto);
    // columnas alrededor del acercamiento de la cámara, cargadas hacia la derecha para no tapar el título
    const x = clamp(14 + gauss() * 12, -10, 40), z = 42 + rand() * 60, y0 = 4 + rand() * 16;
    const vel = formula ? 3 + rand() * 3 : 6 + rand() * 8;
    const estelaLargo = formula ? 8 + rand() * 6 : 4 + rand() * 5;
    const ciclo = chars.length + estelaLargo * 3 + rand() * chars.length;
    const col = [vel, rand() * ciclo, estelaLargo, ciclo];
    chars.forEach((ch, i) => {
      if (ch === ' ') return;
      lluvia.pos.push(x, y0 - i * sep, z);
      lluvia.glifo.push(atlasGlifos.indice.get(ch));
      lluvia.fila.push(i);
      lluvia.col.push(...col);
      lluvia.tipo.push(formula ? 1 : 0);
      const enHex = !formula && texto.includes('x');
      lluvia.cambia.push(formula || ch === 'x' || (enHex && texto[i + 1] === 'x') ? 0 : enHex ? 2 : 1);
    });
  }
  const nLluvia = lluvia.glifo.length;
  const glluvia = new THREE.BufferGeometry();
  glluvia.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lluvia.pos), 3));
  glluvia.setAttribute('aGlifo', new THREE.BufferAttribute(new Float32Array(lluvia.glifo), 1));
  glluvia.setAttribute('aFila', new THREE.BufferAttribute(new Float32Array(lluvia.fila), 1));
  glluvia.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(lluvia.col), 4));
  glluvia.setAttribute('aTipo', new THREE.BufferAttribute(new Float32Array(lluvia.tipo), 1));
  glluvia.boundingSphere = new THREE.Sphere(V(0, 0, 78), 80);
  const uLluvia = {
    uPixel: { value: pr }, uOpacity: { value: 0 }, uFog: { value: Q.niebla }, uTam: { value: LLUVIA.tam }, uEscala: { value: 1 },
    uTime: { value: 0 }, uAtlas: { value: atlasGlifos.tex }, uGrilla: { value: atlasGlifos.grilla },
  };
  scene.add(new THREE.Points(glluvia, new THREE.ShaderMaterial({
    uniforms: uLluvia, vertexShader: lluviaVS, fragmentShader: lluviaFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));
  const binIdx = ['0', '1'].map(c => atlasGlifos.indice.get(c)), hexIdx = [...HEXA].map(c => atlasGlifos.indice.get(c));
  let parpadeoT = 0;
  function parpadear() { // los bits y los bytes cambian mientras caen
    const g = glluvia.attributes.aGlifo.array;
    for (let i = 0; i < nLluvia; i++) {
      if (!lluvia.cambia[i] || Math.random() > 0.06) continue;
      const set = lluvia.cambia[i] === 1 ? binIdx : hexIdx;
      g[i] = set[Math.floor(Math.random() * set.length)];
    }
    glluvia.attributes.aGlifo.needsUpdate = true;
  }
  const ORIGEN_FLUJO = V(0, 5, 66); // de la lluvia sale el flujo de datos que entra al cerebro

  // estela: el flujo de datos que entra a la red
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

  // ---------- Salida: barras del softmax y el objetivo ----------
  const barras = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 1, 0.12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), NOUT);
  barras.frustumCulled = false;
  for (let k = 0; k < NOUT; k++) barras.setColorAt(k, CIAN);
  scene.add(barras);
  // el objetivo (one-hot) como una caja vacía de altura máxima: lo que le falta a la barra para llenarla es la pérdida
  const objetivoMat = new THREE.LineBasicMaterial({ color: BLANCO, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const objetivo = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.75, 6, 0.2)), objetivoMat);
  objetivo.frustumCulled = false;
  scene.add(objetivo);

  // ---------- Los 4 filtros 3×3 aprendidos, junto a la capa de convolución ----------
  const filtros = crearLienzo(384, 96);
  const filtrosSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: filtros.tex, transparent: true, depthWrite: false, opacity: 0, fog: false }));
  filtrosSprite.scale.set(2.2 * 4, 2.2, 1);
  filtrosSprite.position.set(7.2, 7.4, Z.conv);
  filtrosSprite.center.set(1, 0.5);
  scene.add(filtrosSprite);
  function dibujarFiltros() {
    const { g, tex } = filtros;
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
  // cada dígito es un color: a medida que la red aprende, los colores se agrupan
  function actualizarLatente() {
    const P3 = pca3(datos.X.slice(0, nLat).map(x => red.forward(x).a2));
    let m = 1e-6;
    for (const p of P3) m = Math.max(m, Math.hypot(...p));
    P3.forEach((p, k) => latObj.set([C_LAT.x + p[0] / m * 9, C_LAT.y + p[1] / m * 7, C_LAT.z + p[2] / m * 7], k * 3));
  }

  // ---------- Panel de entrenamiento (pegado a la cámara) ----------
  // Solo gráficos: precisión (barra), curva de pérdida y las últimas predicciones
  // (borde cian = acierto, violeta = error). Los números están en la telemetría.
  const panel = (() => {
    const l = crearLienzo(360, 300);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1), new THREE.MeshBasicMaterial({ map: l.tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
    m.renderOrder = 10;
    camera.add(m);
    return { ...l, m, t: 0 };
  })();
  function dibujarPanel() {
    const g = panel.g, W = 360, H = 300;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10, 12, 18, 0.55)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0, 204, 255, 0.5)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, H - 1);
    // precisión
    g.fillStyle = 'rgba(255, 255, 255, 0.08)'; g.fillRect(14, 16, W - 28, 6);
    g.fillStyle = '#00ccff'; g.fillRect(14, 16, (W - 28) * metrica.acc, 6);
    // curva de pérdida
    const cx = 14, cy = 40, cw = W - 28, ch = 140, h = historial, mx = Math.max(...h, 0.01);
    g.strokeStyle = 'rgba(255, 255, 255, 0.08)'; g.lineWidth = 1;
    for (let i = 0; i <= 3; i++) { g.beginPath(); g.moveTo(cx, cy + ch * i / 3); g.lineTo(cx + cw, cy + ch * i / 3); g.stroke(); }
    const curva = () => { g.beginPath(); h.forEach((v, i) => { const x = cx + i / Math.max(1, h.length - 1) * cw, y = cy + ch - v / mx * ch; i ? g.lineTo(x, y) : g.moveTo(x, y); }); };
    curva(); g.lineTo(cx + cw, cy + ch); g.lineTo(cx, cy + ch); g.closePath();
    g.fillStyle = 'rgba(0, 204, 255, 0.1)'; g.fill();
    curva(); g.strokeStyle = '#00ccff'; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
    // últimas predicciones, dibujadas desde el atlas en alta resolución
    const y0 = 208, tam = 38, paso = (W - 28 - tam) / 7;
    recientes.slice(-8).forEach((r, i) => {
      const x0 = 14 + i * paso;
      g.globalCompositeOperation = 'lighter'; // el fondo negro del atlas no tapa el panel
      g.drawImage(atlasCanvas, (r.k % 25) * TESELA, Math.floor(r.k / 25) * TESELA, TESELA, TESELA, x0, y0, tam, tam);
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = r.ok ? 'rgba(0, 204, 255, 0.85)' : 'rgba(150, 125, 255, 0.95)';
      g.lineWidth = 1.2; g.strokeRect(x0 + 0.5, y0 + 0.5, tam - 1, tam - 1);
      g.fillStyle = r.ok ? '#00ccff' : '#a796ff';
      g.beginPath(); g.arc(x0 + tam / 2, y0 + tam + 14, 3, 0, Math.PI * 2); g.fill();
    });
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
    const po = por.out.pos[estado.y];
    objetivo.position.set(po.x, po.y + 0.9 + 3, po.z);
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

  // paradas de cámara: afuera → lluvia de código → adentro de la red → giro → vuelta → afuera
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

  // resolución adaptativa: arranca a 2× (o la densidad de la pantalla) y baja de a 0,25 si no llega a ~45 fps
  const calidad = { muestras: 0, suma: 0, calentar: 90, cambios: 0 };
  function aplicarPR(p) {
    pr = p;
    renderer.setPixelRatio(p);
    if (composer) { composer.setPixelRatio(p); composer.setSize(window.innerWidth, window.innerHeight); }
    uCerebro.uPixel.value = uRed.uPixel.value = uLluvia.uPixel.value = p;
    window.AureaImmersive && (window.AureaImmersive.resolucion = p);
  }
  function medirCalidad(ms) {
    if (calidad.calentar > 0) { calidad.calentar--; return; }   // compilación de shaders y carga
    if (ms > 250) return;                                        // pestaña en segundo plano
    calidad.suma += ms; calidad.muestras++;
    if (calidad.muestras < 60) return;
    const prom = calidad.suma / calidad.muestras;
    calidad.suma = calidad.muestras = 0;
    if (prom > 22 && pr > PR_MIN + 0.01) { aplicarPR(Math.max(PR_MIN, pr - 0.25)); calidad.cambios++; calidad.calentar = 20; }
    else if (prom < 12 && pr < PR_MAX - 0.01 && calidad.cambios < 6) { aplicarPR(Math.min(PR_MAX, pr + 0.25)); calidad.cambios++; calidad.calentar = 20; }
  }

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
  const pos = V(0, 0, 0), mira = V(0, 0, 0);
  let sCur = etapaScroll(), tPrev = performance.now(), tiempo = 0, hudT = 0;
  let actualizado = false, acumPasos = 0, cicloT = 0, latT = 0, latListo = false;
  let ultimoPaso = null, ultimoLote = [7];

  // ---------- Vigía: si la imagen sale negra se baja un nivel; si nada funciona, partículas 2D ----------
  let activo = true, fallos = 0, perdidoT = 0;
  const vigia = { cuadro: 0, buenas: 0, negras: 0, listo: false };
  const muestraPx = new Uint8Array(4);
  function imagenNegra() { // el fondo correcto es #0A0A0A: si los puntos leídos son 0, no se está dibujando nada
    const gl = renderer.getContext();
    renderer.setRenderTarget(null);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.25], [0.8, 0.75], [0.3, 0.8], [0.75, 0.3]]) {
      gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, muestraPx);
      if (muestraPx[0] > 3 || muestraPx[1] > 3 || muestraPx[2] > 3) return false;
    }
    return true;
  }
  function vigilar() {
    vigia.cuadro++;
    if (vigia.cuadro < 3 || vigia.cuadro % 3) return;
    if (!imagenNegra()) {
      vigia.negras = 0;
      if (++vigia.buenas >= 3) vigia.listo = true;
      return;
    }
    vigia.buenas = 0;
    if (++vigia.negras < 2) return;
    vigia.negras = 0; vigia.cuadro = 0;
    nivel++;
    if (nivel >= 3) desactivar('la imagen salía negra');
    else { armarComposer(); if (window.AureaImmersive) window.AureaImmersive.nivel = nivel; }
  }
  function desactivar(motivo) {
    if (!activo) return;
    activo = false;
    console.warn(`AureaIA: fondo 3D desactivado (${motivo}); se usan las partículas 2D.`);
    try { soltarComposer(); renderer.dispose(); } catch (_) { /* nada */ }
    canvas.remove();
    document.querySelector('.vms-row')?.remove();
    document.documentElement.classList.remove('immersive');
    window.AureaImmersive = undefined;
    // si la página ya cargó, se arrancan acá; si no, script.js las inicia en "load"
    if (document.readyState === 'complete' && typeof window.initParticles === 'function' && typeof window.particlesJS !== 'undefined') window.initParticles();
  }
  canvas.addEventListener('webglcontextlost', () => { perdidoT = setTimeout(() => desactivar('se perdió el contexto WebGL'), 4000); });
  canvas.addEventListener('webglcontextrestored', () => clearTimeout(perdidoT));

  function frame(now) {
    if (!activo) return;
    requestAnimationFrame(frame);
    try {
      cuadro(now);
      fallos = 0;
    } catch (e) {
      console.error(e);
      if (++fallos > 5) desactivar('error al dibujar: ' + e.message);
    }
  }

  function cuadro(now) {
    const ms = now - tPrev;
    const dt = Math.min(0.05, (now - tPrev) / 1000);
    const dtr = Math.min(0.25, (now - tPrev) / 1000);
    tPrev = now;
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
    uLluvia.uOpacity.value = ease * (1 - smooth(1.2, 1.5, s) * (1 - 0.6 * smooth(3.1, 3.5, s)));
    const conv = smooth(1.05, 1.2, s) * (1 - smooth(1.55, 1.7, s));
    kernelMat.opacity = conv;
    barras.material.opacity = smooth(1.85, 2.05, s) * (1 - smooth(2.3, 2.45, s)) + smooth(3.2, 3.5, s) * 0.55;
    objetivoMat.opacity = smooth(1.95, 2.1, s) * (1 - smooth(2.3, 2.42, s)) * 0.8 + smooth(3.2, 3.5, s) * 0.3;
    filtrosSprite.material.opacity = smooth(1.0, 1.2, s) * (1 - smooth(1.6, 1.8, s));
    latMat.opacity = latListo ? smooth(3.1, 3.4, s) : 0;
    const lp = glat.attributes.position.array;
    for (let i = 0; i < lp.length; i++) lp[i] += (latObj[i] - lp[i]) * (1 - Math.exp(-dt * 3));
    glat.attributes.position.needsUpdate = true;

    // ---- lluvia de código ----
    uLluvia.uTime.value = tiempo;
    uLluvia.uEscala.value = window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    parpadeoT += dt;
    if (!reduceMotion && parpadeoT > 0.07 && uLluvia.uOpacity.value > 0.01) { parpadeoT = 0; parpadear(); }
    // estela: de la lluvia a la capa de entrada
    const ep = estelaGeo.attributes.position.array;
    const desde = ORIGEN_FLUJO, hasta = V(0, 0, Z.in);
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
    if (!vigia.listo) vigilar();
    if (!reduceMotion) medirCalidad(ms);

    // ---- telemetría ----
    hudT += dt;
    if (hudT > 0.1 && estado) {
      hudT = 0;
      telemetria.actualizar({ s, waveF, waveB, uBack, entrena, estado, ej, metrica, historial, epoca: entrenador.epoca, ultimoPaso, red });
    }
  }

  // estado visible desde la consola: AureaImmersive.nivel (0 bloom+MSAA, 1 bloom, 2 sin bloom) y la resolución
  window.AureaImmersive = { activo: true, resolucion: pr, nivel };
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
    anillo.classList.toggle('is-hover', !!e.target.closest(interactivo));
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
  document.documentElement.classList.add('immersive');
  iniciarCursor();
}
