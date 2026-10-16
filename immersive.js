/* ==========================================================================
   AureaIA — Escena inmersiva

   Una sola nube de partículas acompaña todo el sitio y cambia de forma con el
   scroll, siguiendo la frase del hero: "Transformamos datos en decisiones".

     01 Datos     (#inicio)     flujo de datos en movimiento
     02 Modelo    (#servicios)  red neuronal por capas
     03 Visión    (#historias)  lente con recuadro de detección
     04 Decisión  (#contacto)   cubo isométrico, como el logo

   Three.js con bloom (UnrealBloomPass) y profundidad de campo en el shader.
   Además: cursor, botones magnéticos e indicador de recorrido.
   Si no hay WebGL, el sitio sigue usando particles.js como antes.
   ========================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const ETAPAS = [
  { id: 'inicio', nombre: 'Datos' },
  { id: 'servicios', nombre: 'Modelo' },
  { id: 'historias', nombre: 'Visión' },
  { id: 'contacto', nombre: 'Decisión' },
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const compacto = coarse || Math.min(window.innerWidth, window.innerHeight) < 700;
const N = compacto ? 9000 : 26000;

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
const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = rand();
  while (!v) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- Formas (una posición por partícula y por etapa) ----------
function formaDatos(P, L) {
  for (let i = 0; i < N; i++) {
    let x, y, z, l;
    if (rand() < 0.55) { // corrientes de datos
      const k = Math.floor(rand() * 18), t = rand() * 2 - 1;
      x = t * 78;
      y = Math.sin(t * 3 + k) * 9 + (k - 8.5) * 2.8 + gauss() * 0.5;
      z = Math.cos(t * 2.2 + k * 0.7) * 12 - 8 + gauss() * 0.5;
      l = rand() < 0.06 ? 1 : 0.5;
    } else { // polvo de fondo
      x = (rand() * 2 - 1) * 80;
      y = (rand() * 2 - 1) * 36;
      z = -rand() * 70 + 18;
      l = rand() < 0.03 ? 0.9 : 0.1;
    }
    P.set([x, y, z], i * 3); L[i * 4] = l;
  }
}

function formaModelo(P, L) {
  const capas = [6, 9, 12, 9, 6];
  const nodos = capas.map((n, li) => Array.from({ length: n }, (_, ni) => [
    (li - 2) * 13, (ni - (n - 1) / 2) * 3.6, Math.sin(ni * 1.7 + li) * 5,
  ]));
  const todos = nodos.flat();
  for (let i = 0; i < N; i++) {
    let p, l;
    if (rand() < 0.32) { // neuronas
      const n = todos[Math.floor(rand() * todos.length)];
      p = [n[0] + gauss() * 0.45, n[1] + gauss() * 0.45, n[2] + gauss() * 0.45];
      l = 1;
    } else { // conexiones entre capas
      const li = Math.floor(rand() * 4);
      const a = nodos[li][Math.floor(rand() * nodos[li].length)];
      const b = nodos[li + 1][Math.floor(rand() * nodos[li + 1].length)];
      const t = rand();
      p = [lerp(a[0], b[0], t) + gauss() * 0.06, lerp(a[1], b[1], t) + gauss() * 0.06, lerp(a[2], b[2], t) + gauss() * 0.06];
      l = 0.3;
    }
    P.set(p, i * 3); L[i * 4 + 1] = l;
  }
}

function formaVision(P, L) {
  for (let i = 0; i < N; i++) {
    const r0 = rand();
    let x, y, z, l;
    if (r0 < 0.42) { // iris con estrías radiales
      const ang = (Math.floor(rand() * 120) / 120) * TAU + gauss() * 0.004;
      const rad = 3.8 + Math.pow(rand(), 0.8) * 9.4;
      x = Math.cos(ang) * rad; y = Math.sin(ang) * rad; z = gauss() * 0.35;
      l = rad < 5.2 ? 0.85 : 0.45;
    } else if (r0 < 0.6) { // bordes de pupila e iris
      const anillos = [3.4, 13.4, 14.4];
      const rad = anillos[Math.floor(rand() * 3)] + gauss() * 0.06, ang = rand() * TAU;
      x = Math.cos(ang) * rad; y = Math.sin(ang) * rad; z = 0;
      l = 0.95;
    } else if (r0 < 0.74) { // globo ocular por paralelos
      const lat = (Math.floor(rand() * 11) / 10 - 0.5) * Math.PI * 0.9, lon = rand() * TAU, R = 17;
      x = R * Math.cos(lat) * Math.cos(lon); y = R * Math.sin(lat); z = R * Math.cos(lat) * Math.sin(lon) - 2;
      l = 0.2;
    } else if (r0 < 0.9) { // esquinas del recuadro de detección
      const s = 20, largo = 6, cx = rand() < 0.5 ? -1 : 1, cy = rand() < 0.5 ? -1 : 1, d = rand() * largo;
      if (rand() < 0.5) { x = cx * (s - d); y = cy * s; } else { x = cx * s; y = cy * (s - d); }
      x += gauss() * 0.05; y += gauss() * 0.05; z = 0;
      l = 1;
    } else { // marcas de mira
      const dir = Math.floor(rand() * 4), d = 15.5 + rand() * 3;
      x = dir === 0 ? d : dir === 1 ? -d : gauss() * 0.04;
      y = dir === 2 ? d : dir === 3 ? -d : gauss() * 0.04;
      z = 0;
      l = 0.8;
    }
    P.set([x, y, z], i * 3); L[i * 4 + 2] = l;
  }
}

function formaDecision(P, L) {
  const aristas = a => {
    const v = [];
    for (const x of [-a, a]) for (const y of [-a, a]) for (const z of [-a, a]) v.push([x, y, z]);
    const e = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const dif = v[i].reduce((s, c, k) => s + (c !== v[j][k] ? 1 : 0), 0);
      if (dif === 1) e.push([v[i], v[j]]);
    }
    return { v, e };
  };
  const ext = aristas(8.5), int = aristas(3.5);
  // rotación isométrica: X 35.26°, Y 45°
  const rx = Math.atan(1 / Math.SQRT2), ry = Math.PI / 4;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  const iso = ([x, y, z]) => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
  };
  for (let i = 0; i < N; i++) {
    const r0 = rand();
    let p, l;
    const enArista = (cubo, j) => {
      const [a, b] = cubo.e[Math.floor(rand() * cubo.e.length)], t = rand();
      return [lerp(a[0], b[0], t) + gauss() * j, lerp(a[1], b[1], t) + gauss() * j, lerp(a[2], b[2], t) + gauss() * j];
    };
    if (r0 < 0.55) { p = enArista(ext, 0.05); l = 0.5; }
    else if (r0 < 0.75) { p = enArista(int, 0.04); l = 0.45; }
    else if (r0 < 0.85) { const v = ext.v[Math.floor(rand() * 8)]; p = [v[0] + gauss() * 0.35, v[1] + gauss() * 0.35, v[2] + gauss() * 0.35]; l = 0.85; }
    else { p = [gauss() * 1.4, gauss() * 1.4, gauss() * 1.4]; l = 0.7; }
    P.set(iso(p), i * 3); L[i * 4 + 3] = l;
  }
}

// ---------- Shader de partículas ----------
const vertexShader = /* glsl */`
attribute vec3 posB;
attribute vec3 posC;
attribute vec3 posD;
attribute vec3 aSeed;
attribute vec4 aLum;
uniform float uTime, uStage, uIntro, uPixel, uSize, uFocus, uFocusRange, uOpacity, uAspect;
uniform vec2 uMouse;
varying vec3 vColor;
varying float vAlpha;
varying float vBlur;

void main() {
  float d = aSeed.x * 0.45;
  float tAB = smoothstep(0.0 + d, 0.55 + d, uStage);
  float tBC = smoothstep(1.0 + d, 1.55 + d, uStage);
  float tCD = smoothstep(2.0 + d, 2.55 + d, uStage);
  vec3 p = mix(mix(mix(position, posB, tAB), posC, tBC), posD, tCD);
  float lum = mix(mix(mix(aLum.x, aLum.y, tAB), aLum.z, tBC), aLum.w, tCD);

  // flujo de los datos: se calma a medida que se arma el modelo
  float flujo = 1.0 - tAB;
  float ph = aSeed.y * 6.2832;
  p += flujo * vec3(sin(uTime * 0.30 + ph + p.y * 0.08) * 3.0,
                    cos(uTime * 0.25 + aSeed.z * 6.2832 + p.x * 0.05) * 2.0,
                    sin(uTime * 0.20 + aSeed.x * 6.2832) * 3.0);
  // respiración leve en todas las etapas
  p += 0.18 * sin(uTime * 0.9 + ph) * normalize(p + 0.001);
  // dispersión a mitad de cada transición
  float m = tAB * (1.0 - tAB) + tBC * (1.0 - tBC) + tCD * (1.0 - tCD);
  p += m * 4.0 * (aSeed - 0.5) * 10.0;

  // entrada: las partículas salen del centro
  float ip = clamp(uIntro * 1.35 - aSeed.x * 0.35, 0.0, 1.0);
  ip = 1.0 - pow(1.0 - ip, 3.0);
  p *= mix(0.02, 1.0, ip);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;

  // interacción con el mouse en pantalla
  vec2 ndc = clip.xy / clip.w;
  vec2 dv = (ndc - uMouse) * vec2(uAspect, 1.0);
  float g = smoothstep(0.32, 0.0, length(dv));
  clip.xy += normalize(dv + 1e-5) * g * 0.05 * clip.w;

  float depth = -mv.z;
  float blur = clamp(abs(depth - uFocus) / uFocusRange, 0.0, 1.0);
  gl_PointSize = uSize * uPixel * (0.55 + lum * 1.2) * (1.0 + blur * 2.6) * (1.0 + g * 1.1) * (300.0 / depth);
  gl_Position = clip;

  vec3 azul = vec3(0.0, 0.4, 1.0);
  vec3 cian = vec3(0.0, 0.8, 1.0);
  vec3 blanco = vec3(0.86, 0.95, 1.0);
  vColor = mix(mix(azul, cian, aSeed.y), blanco, clamp(lum * 0.55 + g * 0.5, 0.0, 1.0));
  // el desenfoque agranda el punto: el alfa baja en proporción al área para no sumar luz
  float area = (1.0 + blur * 2.6) * (1.0 + blur * 2.6);
  vAlpha = (0.1 + lum * 0.9) / area * uOpacity * ip;
  vBlur = blur;
}`;

const fragmentShader = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
varying float vBlur;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  float a = exp(-r * mix(5.5, 2.0, vBlur));
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

// ---------- Escena ----------
function iniciar() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
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
  scene.background = new THREE.Color(0x0a0a0a);
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 0, 72);

  const geo = new THREE.BufferGeometry();
  const A = new Float32Array(N * 3), B = new Float32Array(N * 3), C = new Float32Array(N * 3), D = new Float32Array(N * 3);
  const lum = new Float32Array(N * 4), seed = new Float32Array(N * 3);
  formaDatos(A, lum); formaModelo(B, lum); formaVision(C, lum); formaDecision(D, lum);
  for (let i = 0; i < seed.length; i++) seed[i] = rand();
  geo.setAttribute('position', new THREE.BufferAttribute(A, 3));
  geo.setAttribute('posB', new THREE.BufferAttribute(B, 3));
  geo.setAttribute('posC', new THREE.BufferAttribute(C, 3));
  geo.setAttribute('posD', new THREE.BufferAttribute(D, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  geo.setAttribute('aLum', new THREE.BufferAttribute(lum, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);

  const uniforms = {
    uTime: { value: 0 }, uStage: { value: 0 }, uIntro: { value: reduceMotion ? 1 : 0 },
    uPixel: { value: pr }, uSize: { value: compacto ? 0.42 : 0.36 },
    uFocus: { value: 72 }, uFocusRange: { value: 24 }, uOpacity: { value: 1 },
    uAspect: { value: window.innerWidth / window.innerHeight }, uMouse: { value: new THREE.Vector2(9, 9) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const grupo = new THREE.Group();
  grupo.add(new THREE.Points(geo, mat));
  scene.add(grupo);

  let composer = null;
  if (!compacto) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(pr);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.4, 0.35));
    composer.addPass(new OutputPass());
  }

  // Cámara y encuadre por etapa
  const ENCUADRE = [
    { z: 72, x: 10, op: 1.0 },
    { z: 60, x: 0, op: 0.8 },
    { z: 52, x: 0, op: 0.8 },
    { z: 58, x: 0, op: 0.6 },
  ];

  // Progreso del recorrido según las secciones
  const anclas = ETAPAS.map(e => document.getElementById(e.id));
  let tops = [];
  const medir = () => { tops = anclas.map(a => (a ? a.getBoundingClientRect().top + window.scrollY : 0)); };
  medir();
  new ResizeObserver(medir).observe(document.body);
  window.addEventListener('load', medir);

  // Cada forma se mantiene armada mientras se lee la sección y cambia en el último 45%
  const etapaObjetivo = () => {
    if (tops.length < 4) return 0;
    const y = window.scrollY + window.innerHeight * 0.45;
    for (let i = 0; i < 3; i++) {
      if (y < tops[i + 1]) return i + smooth(0.55, 1, (y - tops[i]) / Math.max(1, tops[i + 1] - tops[i]));
    }
    return 3;
  };

  // Mouse
  const mouse = new THREE.Vector2(9, 9), mouseS = new THREE.Vector2(0, 0), mouseT = new THREE.Vector2(0, 0);
  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    mouseT.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight * 2 - 1));
  }, { passive: true });
  document.addEventListener('pointerleave', () => mouseT.set(9, 9));

  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uniforms.uAspect.value = w / h;
    if (composer) composer.setSize(w, h);
    medir();
  }, { passive: true });

  // Entrada: arranca cuando se va la pantalla de carga
  let introInicio = -1;
  const empezarIntro = () => { if (introInicio < 0) introInicio = performance.now() + 450; };
  if (document.readyState === 'complete') empezarIntro();
  else window.addEventListener('load', empezarIntro);

  const hud = crearHud();
  const modal = document.getElementById('videoModal');
  let sCur = etapaObjetivo(), tPrev = performance.now(), tiempo = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - tPrev) / 1000);
    tPrev = now;
    if (modal && modal.classList.contains('show')) return;
    if (!reduceMotion) tiempo += dt;

    const objetivo = etapaObjetivo();
    sCur += (objetivo - sCur) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 3.2));
    if (Math.abs(objetivo - sCur) < 1e-4) sCur = objetivo;

    if (!reduceMotion && introInicio > 0 && now > introInicio) {
      uniforms.uIntro.value = Math.min(1, (now - introInicio) / 2600);
    }

    // mouse suavizado (fuera de la ventana = sin efecto)
    if (mouseT.x > 5) {
      mouse.set(9, 9);
      mouseS.multiplyScalar(Math.exp(-dt * 2));
    } else {
      if (mouse.x > 5) mouse.copy(mouseT);
      mouse.lerp(mouseT, 1 - Math.exp(-dt * 8));
      mouseS.lerp(mouseT, 1 - Math.exp(-dt * 2));
    }

    const i = Math.min(2, Math.floor(sCur)), f = sCur - i;
    const a = ENCUADRE[i], b = ENCUADRE[i + 1];
    const angosto = camera.aspect < 1 ? Math.min(1.9, 0.85 / camera.aspect) : 1;
    const camZ = lerp(a.z, b.z, f) * angosto;
    const gx = compacto || camera.aspect < 1.1 ? 0 : lerp(a.x, b.x, f);
    grupo.position.x = gx;
    const visionW = Math.max(0, 1 - Math.abs(sCur - 2));
    grupo.rotation.y = Math.sin(tiempo * 0.08) * 0.5 * (1 - visionW) + mouseS.x * 0.15;
    grupo.rotation.x = -mouseS.y * 0.08 + Math.sin(tiempo * 0.05) * 0.05 * (1 - visionW);
    camera.position.set(mouseS.x * 2.5, mouseS.y * 1.6, camZ);
    camera.lookAt(gx * 0.6, 0, 0);

    uniforms.uTime.value = tiempo;
    uniforms.uStage.value = sCur;
    uniforms.uFocus.value = camZ;
    uniforms.uOpacity.value = lerp(a.op, b.op, f);
    uniforms.uMouse.value.copy(mouse);

    if (composer) composer.render(); else renderer.render(scene, camera);
    hud.actualizar(sCur);
  }
  requestAnimationFrame(frame);
  return true;
}

// ---------- Indicador de recorrido ----------
function crearHud() {
  const nav = document.createElement('nav');
  nav.className = 'stage-hud';
  nav.setAttribute('aria-label', 'Recorrido del sitio');
  const ol = document.createElement('ol');
  const items = ETAPAS.map((e, i) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + e.id;
    const n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1).padStart(2, '0');
    const l = document.createElement('span'); l.className = 'l'; l.textContent = e.nombre;
    a.append(l, n);
    a.addEventListener('click', ev => {
      const t = document.getElementById(e.id);
      if (!t) return;
      ev.preventDefault();
      t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    li.append(a); ol.append(li);
    return li;
  });
  const barra = document.createElement('div');
  barra.className = 'stage-hud-bar';
  const fill = document.createElement('span');
  barra.append(fill);
  nav.append(ol, barra);
  document.body.append(nav);
  let activo = -1;
  return {
    actualizar(s) {
      const k = Math.round(s);
      if (k !== activo) {
        items.forEach((li, j) => li.classList.toggle('is-active', j === k));
        activo = k;
      }
      fill.style.height = (s / 3 * 100).toFixed(2) + '%';
    },
  };
}

// ---------- Cursor y botones magnéticos ----------
function iniciarCursor() {
  if (coarse || reduceMotion) return;
  const anillo = document.createElement('div');
  anillo.className = 'cursor-ring';
  anillo.setAttribute('aria-hidden', 'true');
  const etiqueta = document.createElement('span');
  anillo.append(etiqueta);
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
    etiqueta.textContent = card && !ctl ? 'Ver video' : '';
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
