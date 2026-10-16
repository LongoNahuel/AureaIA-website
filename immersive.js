/* ==========================================================================
   AureaIA — Recorrido inmersivo por una red neuronal 3D

   Al bajar por el sitio, la cámara vuela a través de una red neuronal
   modelada en 3D, siguiendo la frase del hero: "Transformamos datos en
   decisiones".

     01 Datos     (#inicio)     tensor de entrada (3 canales de 16×10 vóxeles)
     02 Modelo    (#servicios)  bloques convolucionales y anillos densos
     03 Visión    (#historias)  túnel de recuadros de detección
     04 Decisión  (#contacto)   el iris enmarca la neurona de salida ganadora y el logo

   Neuronas reales (InstancedMesh), conexiones, pulsos de señal que viajan
   entre capas, una onda de activación de adelante hacia atrás, niebla para
   la profundidad y bloom (UnrealBloomPass).
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
const Q = compacto
  ? { pulsos: 600, flujo: 300, polvo: 1200, conex: 0.55, niebla: 0.02 }
  : { pulsos: 1800, flujo: 900, polvo: 3600, conex: 1, niebla: 0.016 };

const FONDO = 0x0a0a0a;
const AZUL = new THREE.Color(0x0066ff);
const CIAN = new THREE.Color(0x00ccff);

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
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pick = arr => arr[Math.floor(rand() * arr.length)];
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Lo que pasa muy cerca de la cámara se desvanece, para atravesar la red sin
// que una neurona o una partícula tape la pantalla
const CERCA = { uNear0: { value: 4 }, uNear1: { value: 14 } };
function fadeCercano(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNear0 = CERCA.uNear0;
    sh.uniforms.uNear1 = CERCA.uNear1;
    sh.vertexShader = 'varying float vProf;\n' + sh.vertexShader.replace(
      '#include <project_vertex>', '#include <project_vertex>\n  vProf = -mvPosition.z;');
    sh.fragmentShader = 'uniform float uNear0, uNear1;\nvarying float vProf;\n' + sh.fragmentShader.replace(
      '#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a *= smoothstep(uNear0, uNear1, vProf);');
  };
  return mat;
}

// ---------- Modelo de la red ----------
// Cada capa: nodos (posiciones), tipo de neurona, tamaño e índice de capa (li)
function construirRed() {
  const capas = [];

  const entrada = [];
  for (let c = 0; c < 3; c++) for (let j = 0; j < 10; j++) for (let i = 0; i < 16; i++) {
    entrada.push(V((i - 7.5) * 1.5, (j - 4.5) * 1.5, -c * 1.7));
  }
  capas.push({ nodos: entrada, tipo: 'voxel', tam: 0.55, li: 0 });

  const mapas = (n, w, h, paso, z0, dz) => {
    const out = [];
    for (let k = 0; k < n; k++) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      out.push(V((i - (w - 1) / 2) * paso, (j - (h - 1) / 2) * paso, z0 - k * dz));
    }
    return out;
  };
  capas.push({ nodos: mapas(8, 10, 6, 1.3, -30, 1.5), tipo: 'esfera', tam: 0.2, li: 1 });
  capas.push({ nodos: mapas(16, 6, 4, 1.2, -55, 1.1), tipo: 'esfera', tam: 0.19, li: 2 });

  const anillo = (n, r, z, fase = 0) => Array.from({ length: n }, (_, i) => {
    const a = i / n * TAU + fase;
    return V(Math.cos(a) * r, Math.sin(a) * r, z + Math.sin(a * 3) * 1.2);
  });
  capas.push({ nodos: anillo(32, 14, -85), tipo: 'esfera', tam: 0.6, li: 3 });
  capas.push({ nodos: anillo(24, 12, -105, 0.13), tipo: 'esfera', tam: 0.55, li: 4 });
  capas.push({ nodos: anillo(16, 10, -125, 0.2), tipo: 'esfera', tam: 0.5, li: 5 });
  capas.push({ nodos: [...anillo(40, 7.5, -176), ...anillo(20, 4, -176, 0.15)], tipo: 'esfera', tam: 0.32, li: 6 });
  capas.push({ nodos: [-6, -2, 2, 6].map(x => V(x, 0, -196)), tipo: 'salida', tam: 0.8, li: 7 });
  return capas;
}

const GANADORA = 2; // índice de la neurona de salida que "decide"

function construirConexiones(capas) {
  const base = [320, 320, 220, 170, 130, 150, 120];
  const conex = [];
  for (let k = 0; k < capas.length - 1; k++) {
    const A = capas[k].nodos, B = capas[k + 1].nodos;
    const n = Math.round(base[k] * Q.conex);
    for (let i = 0; i < n; i++) {
      const b = k === capas.length - 2 && rand() < 0.5 ? B[GANADORA] : pick(B);
      conex.push([pick(A), b, k]);
    }
  }
  return conex;
}

// ---------- Shader de pulsos (señales que viajan entre neuronas) ----------
const pulsoVS = /* glsl */`
attribute vec3 aB;
attribute vec2 aP;
uniform float uTime, uPixel, uSize, uFog, uOpacity;
varying float vAlpha;
void main() {
  float t = fract(aP.x + uTime * aP.y);
  vec3 p = mix(position, aB, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.5);
  float fog = exp(-pow(uFog * depth, 2.0));
  gl_PointSize = uSize * uPixel * 300.0 / depth;
  vAlpha = sin(t * 3.14159) * fog * uOpacity * smoothstep(4.0, 14.0, depth);
}`;
const pulsoFS = /* glsl */`
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  gl_FragColor = vec4(uColor, exp(-r * 4.0) * vAlpha);
}`;

function crearPulsos(pares, uniformsComunes, color, tam) {
  const n = pares.length;
  const A = new Float32Array(n * 3), B = new Float32Array(n * 3), P = new Float32Array(n * 2);
  pares.forEach(([a, b, vel], i) => {
    A.set([a.x, a.y, a.z], i * 3);
    B.set([b.x, b.y, b.z], i * 3);
    P.set([rand(), vel], i * 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(A, 3));
  g.setAttribute('aB', new THREE.BufferAttribute(B, 3));
  g.setAttribute('aP', new THREE.BufferAttribute(P, 2));
  g.boundingSphere = new THREE.Sphere(V(0, 0, -100), 400);
  const m = new THREE.ShaderMaterial({
    vertexShader: pulsoVS, fragmentShader: pulsoFS,
    uniforms: { ...uniformsComunes, uColor: { value: color }, uSize: { value: tam } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(g, m);
}

function spriteSuave() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  scene.fog = new THREE.FogExp2(FONDO, Q.niebla);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
  const ajustarFov = () => { camera.fov = camera.aspect < 1 ? 68 : 55; camera.updateProjectionMatrix(); };
  ajustarFov();

  const capas = construirRed();
  const conex = construirConexiones(capas);
  const comunes = {
    uTime: { value: 0 }, uPixel: { value: pr }, uFog: { value: Q.niebla }, uOpacity: { value: 0 },
  };

  // Neuronas: esferas y vóxeles instanciados, con color por instancia
  const instancias = { esfera: [], voxel: [] };
  capas.forEach(capa => capa.nodos.forEach((p, i) => {
    const ganadora = capa.tipo === 'salida' && i === GANADORA;
    const tam = ganadora ? capa.tam * 2 : capa.tam;
    (capa.tipo === 'voxel' ? instancias.voxel : instancias.esfera).push({ p, tam, li: capa.li, r: rand(), ganadora });
  }));
  const mallas = [];
  const crearMalla = (lista, geo) => {
    const mat = fadeCercano(new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0 }));
    const malla = new THREE.InstancedMesh(geo, mat, lista.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    lista.forEach((n, i) => {
      malla.setMatrixAt(i, m4.compose(n.p, q, V(n.tam, n.tam, n.tam)));
      malla.setColorAt(i, AZUL);
    });
    malla.instanceMatrix.needsUpdate = true;
    scene.add(malla);
    mallas.push({ malla, lista });
  };
  crearMalla(instancias.esfera, new THREE.IcosahedronGeometry(1, compacto ? 1 : 2));
  crearMalla(instancias.voxel, new THREE.BoxGeometry(1, 1, 1));

  // Conexiones con degradé azul → cian
  const lp = new Float32Array(conex.length * 6), lc = new Float32Array(conex.length * 6);
  conex.forEach(([a, b], i) => {
    lp.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    lc.set([AZUL.r, AZUL.g, AZUL.b, CIAN.r, CIAN.g, CIAN.b], i * 6);
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const lineasMat = fadeCercano(new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(new THREE.LineSegments(lg, lineasMat));

  // Pulsos de señal sobre las conexiones
  const paresPulsos = Array.from({ length: Q.pulsos }, () => {
    const [a, b] = pick(conex);
    return [a, b, 0.25 + rand() * 0.35];
  });
  const pulsos = crearPulsos(paresPulsos, comunes, new THREE.Color(0.75, 0.95, 1.0), 0.32);
  scene.add(pulsos);

  // Datos que entran a la red desde detrás de la cámara
  const entrada = capas[0].nodos;
  const paresFlujo = Array.from({ length: Q.flujo }, () => [
    V((rand() * 2 - 1) * 34, (rand() * 2 - 1) * 20, 45 + rand() * 40), pick(entrada), 0.08 + rand() * 0.12,
  ]);
  const flujo = crearPulsos(paresFlujo, comunes, CIAN.clone().multiplyScalar(0.9), 0.24);
  scene.add(flujo);

  // Visión: túnel de recuadros de detección
  const recuadros = [];
  [-140, -146, -152, -158, -164].forEach((z, k) => {
    const s = 10 - k * 0.7, l = s * 0.32;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      recuadros.push(sx * s, sy * s, z, sx * (s - l), sy * s, z);
      recuadros.push(sx * s, sy * s, z, sx * s, sy * (s - l), z);
    }
  });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(recuadros), 3));
  const recuadrosMat = fadeCercano(new THREE.LineBasicMaterial({ color: CIAN, transparent: true, opacity: 0, toneMapped: false }));
  scene.add(new THREE.LineSegments(rg, recuadrosMat));

  // Decisión: cubo isométrico como el logo, detrás de la capa de salida
  const logo = new THREE.Group();
  const cuboMat = new THREE.LineBasicMaterial({ color: CIAN, transparent: true, opacity: 0, toneMapped: false });
  logo.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(7, 7, 7)), cuboMat));
  logo.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3, 3, 3)), cuboMat));
  logo.position.set(0, 0, -210);
  logo.rotation.set(Math.atan(1 / Math.SQRT2), Math.PI / 4, 0);
  scene.add(logo);

  // Polvo en el espacio: da paralaje al moverse
  const pp = new Float32Array(Q.polvo * 3);
  for (let i = 0; i < Q.polvo; i++) {
    pp.set([(rand() * 2 - 1) * 45, (rand() * 2 - 1) * 28, 70 - rand() * 300], i * 3);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const polvoMat = fadeCercano(new THREE.PointsMaterial({
    size: 0.26, map: spriteSuave(), color: 0x3d8bff, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  scene.add(new THREE.Points(pg, polvoMat));

  // Postproceso
  let composer = null;
  if (!compacto) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(pr);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.5, 0.32));
    composer.addPass(new OutputPass());
  }

  // ---------- Recorrido de cámara ----------
  // El último punto queda más allá del final: sirve para mirar hacia adelante
  // Rodea por el costado la entrada y los bloques convolucionales, atraviesa los
  // anillos y el túnel por el centro y se detiene frente a la capa de salida.
  // El último punto queda más allá del final: sirve para mirar hacia adelante.
  const ruta = new THREE.CatmullRomCurve3([
    V(-7, 1, 40), V(-15, 6, 12), V(-17, 3, -20), V(11, -2, -48), V(0, 0, -72),
    V(0, 0, -95), V(0, 0.5, -118), V(0, 0, -135), V(0, 0, -152), V(0, 0, -175), V(0, 0, -200),
  ], false, 'centripetal');
  // avance (0–1) sobre la ruta para una profundidad z dada
  const muestras = Array.from({ length: 801 }, (_, i) => [i / 800, ruta.getPointAt(i / 800).z]);
  const uParaZ = z => muestras.reduce((m, s) => (Math.abs(s[1] - z) < Math.abs(m[1] - z) ? s : m))[0];
  const T_FIN = uParaZ(-150);

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

  // posición del scroll → avance sobre la ruta, con cada sección en su tramo de la red
  // inicio → junto a conv1 → salida de los anillos → entrada del túnel → dentro del túnel,
  // con el iris enmarcando la neurona ganadora
  const TRAMOS = [0, uParaZ(-20), uParaZ(-126), uParaZ(-140), T_FIN];
  const progreso = () => {
    const y = window.scrollY;
    for (let i = 0; i < 4; i++) {
      if (y < A[i + 1]) {
        const f = clamp((y - A[i]) / (A[i + 1] - A[i]), 0, 1);
        return { t: lerp(TRAMOS[i], TRAMOS[i + 1], f), etapa: i + f };
      }
    }
    return { t: T_FIN, etapa: 3 };
  };

  // Mouse
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

  // Entrada: la cámara llega desde atrás cuando se va la pantalla de carga
  let introInicio = reduceMotion ? 0 : -1;
  const empezarIntro = () => { if (introInicio < 0) introInicio = performance.now() + 450; };
  if (document.readyState === 'complete') empezarIntro();
  else window.addEventListener('load', empezarIntro);

  const hud = crearHud();
  const modal = document.getElementById('videoModal');
  const pos = V(0, 0, 0), mira = V(0, 0, 0), adelante = V(0, 0, 0), lateral = V(0, 0, 0), arriba = V(0, 1, 0);
  const color = new THREE.Color(), base = AZUL.clone().multiplyScalar(0.45);
  const activo = new THREE.Color(0.45, 0.85, 1.0).multiplyScalar(1.2);
  let tCur = progreso().t, tPrev = performance.now(), tiempo = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - tPrev) / 1000);
    tPrev = now;
    if (modal && modal.classList.contains('show')) return;
    if (!reduceMotion) tiempo += dt;

    const { t, etapa } = progreso();
    tCur += (t - tCur) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 2.6));
    mouseS.lerp(mouseT, 1 - Math.exp(-dt * 2.5));

    let intro = 1;
    if (!reduceMotion) intro = introInicio > 0 && now > introInicio ? Math.min(1, (now - introInicio) / 2800) : 0;
    const ease = 1 - Math.pow(1 - intro, 3);

    // cámara: posición sobre la ruta, mirando un poco más adelante
    ruta.getPointAt(clamp(tCur, 0, 1), pos);
    ruta.getPointAt(clamp(tCur + 0.045, 0, 1), mira);
    adelante.subVectors(mira, pos).normalize();
    lateral.crossVectors(arriba, adelante).normalize();
    const hx = camera.aspect < 1.1 ? 0 : 1; // en pantallas angostas la red va centrada
    pos.x *= hx;
    pos.addScaledVector(lateral, -mouseS.x * 1.4);
    pos.y += mouseS.y * 1.0;
    pos.z += (1 - ease) * 45;
    camera.position.copy(pos);
    mira.x = mira.x * hx - mouseS.x * 2.5;
    mira.y += mouseS.y * 1.8;
    camera.lookAt(mira);

    // onda de activación de la entrada a la salida
    for (const { malla, lista } of mallas) {
      for (let i = 0; i < lista.length; i++) {
        const n = lista[i];
        const w = 0.5 + 0.5 * Math.sin(tiempo * 1.6 - n.li * 1.1 + n.r * 0.8);
        if (n.ganadora) color.copy(CIAN).multiplyScalar((1.15 + 0.25 * w) * ease);
        else color.copy(base).lerp(activo, Math.pow(w, 6) * (0.55 + 0.45 * n.r)).multiplyScalar(ease);
        malla.setColorAt(i, color);
      }
      malla.instanceColor.needsUpdate = true;
      malla.material.opacity = ease;
    }
    lineasMat.opacity = 0.16 * ease;
    recuadrosMat.opacity = 0.75 * ease;
    cuboMat.opacity = 0.9 * ease;
    polvoMat.opacity = 0.55 * ease;
    comunes.uOpacity.value = ease;
    comunes.uTime.value = tiempo;
    logo.rotation.y = Math.PI / 4 + Math.sin(tiempo * 0.3) * 0.4;

    if (composer) composer.render(); else renderer.render(scene, camera);
    hud.actualizar(etapa);
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
