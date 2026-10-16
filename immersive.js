/* ==========================================================================
   AureaIA — Recorrido 3D por una red neuronal real (YOLOv8n)

   Todo lo que se ve es real: YOLOv8n (ONNX, 3,15 M de parámetros) corrió
   sobre un cuadro del caso "Detección de Celulares", y cada plano de la
   escena es un mapa de activación de ese cuadro. Ver cnn/manifiesto.json.

     01 Datos     (#inicio)     imagen de entrada 640×640 y sus canales RGB
     02 Modelo    (#servicios)  backbone CSPDarknet: model.0 → model.9 (SPPF)
     03 Visión    (#historias)  neck PAN y mapas de clase de la cabeza
     04 Decisión  (#contacto)   detecciones finales después de NMS

   La línea cian sigue la posición del celular detectado a través de todas
   las capas. Niebla, bloom (UnrealBloomPass) y desvanecido cercano.
   Además: barra de telemetría en la navegación, cursor y botones magnéticos.
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
const MANIFIESTO = 'cnn/manifiesto.json';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const compacto = coarse || Math.min(window.innerWidth, window.innerHeight) < 700;
const Q = compacto
  ? { mapas: 6, polvo: 900, pulsos: 60, niebla: 0.011 }
  : { mapas: 12, polvo: 2600, pulsos: 160, niebla: 0.009 };

const FONDO = 0x0a0a0a;
const CIAN = new THREE.Color(0x00ccff);
const AZUL = new THREE.Color(0x0066ff);
const BLANCO = new THREE.Color(0xe8f6ff);

// ---------- Utilidades ----------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tamPlano = res => 3 + 2 * Math.log2(res / 10); // 640 → 15 · 20 → 5

// ---------- Shader de planos (mapas de activación, imagen, canales, mapas de clase) ----------
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
uniform vec4 uRect;
uniform float uOpacity, uFog, uModo;
uniform vec3 uTinte;
varying vec2 vUv;
varying float vProf;
// negro → #0066FF → #00CCFF → blanco (valores lineales)
vec3 cmap(float v) {
  vec3 c = mix(vec3(0.0, 0.003, 0.03), vec3(0.0, 0.133, 1.0), smoothstep(0.0, 0.45, v));
  c = mix(c, vec3(0.0, 0.604, 1.0), smoothstep(0.4, 0.75, v));
  return mix(c, vec3(0.8, 0.95, 1.0), smoothstep(0.78, 1.0, v));
}
void main() {
  vec4 tex = texture2D(uMap, uRect.xy + vUv * uRect.zw);
  float borde = 1.0 - smoothstep(0.0, 0.01, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  vec3 col; float a;
  if (uModo < 0.5) {            // activación
    float v = tex.r;
    col = cmap(v); a = 0.1 + 0.75 * smoothstep(0.04, 0.85, v);
  } else if (uModo < 1.5) {     // imagen a color
    col = tex.rgb; a = 1.0;
  } else if (uModo < 2.5) {     // un canal RGB de la entrada
    float v = dot(tex.rgb, uTinte);
    col = uTinte * v; a = 0.2 + 0.8 * v;
  } else {                      // mapa de clase de la cabeza
    float v = pow(tex.r, 0.55);
    col = cmap(v) * 1.5; a = 0.12 + 0.88 * v;
  }
  col = mix(col, vec3(0.0, 0.604, 1.0), borde * 0.6);
  a = max(a, borde * 0.55);
  float fog = exp(-pow(uFog * vProf, 2.0));
  float cerca = smoothstep(3.0, 11.0, vProf);
  gl_FragColor = vec4(col, a * uOpacity * fog * cerca);
  #include <colorspace_fragment>
}`;

// ---------- Pulsos (señal que avanza por el trayecto del objeto) ----------
const pulsoVS = /* glsl */`
attribute vec3 aB;
attribute vec2 aP;
uniform float uTime, uPixel, uSize, uFog, uOpacity;
varying float vAlpha;
void main() {
  float t = fract(aP.x + uTime * aP.y);
  vec4 mv = modelViewMatrix * vec4(mix(position, aB, t), 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.5);
  gl_PointSize = uSize * uPixel * 300.0 / depth;
  vAlpha = sin(t * 3.14159) * exp(-pow(uFog * depth, 2.0)) * smoothstep(2.5, 9.0, depth) * uOpacity;
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

// ---------- Etiquetas de texto en 3D ----------
function etiqueta(lineas, color = '#00ccff', ancho = 5.5) {
  const c = document.createElement('canvas');
  const alto = 34 + lineas.length * 46;
  c.width = 640; c.height = alto;
  const g = c.getContext('2d');
  g.font = '500 34px "IBM Plex Mono", Consolas, monospace';
  g.textBaseline = 'top';
  lineas.forEach((l, i) => {
    g.fillStyle = i === 0 ? color : 'rgba(232, 246, 255, 0.78)';
    g.fillText(l, 6, 14 + i * 46);
  });
  g.fillStyle = color;
  g.fillRect(0, 0, 3, alto);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  const s = new THREE.Sprite(mat);
  s.center.set(0, 0);
  s.scale.set(ancho, ancho * alto / 640, 1);
  return s;
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
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);
  const ajustarFov = () => { camera.fov = camera.aspect < 1 ? 66 : 50; camera.updateProjectionMatrix(); };
  ajustarFov();

  let composer = null;
  if (!compacto) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(pr);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.4, 0.5));
    composer.addPass(new OutputPass());
  }

  // Polvo en el espacio: da paralaje mientras se cargan los datos y durante el recorrido
  const pp = new Float32Array(Q.polvo * 3);
  for (let i = 0; i < Q.polvo; i++) {
    pp.set([(Math.random() * 2 - 1) * 50, (Math.random() * 2 - 1) * 30, 60 - Math.random() * 520], i * 3);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const polvoMat = new THREE.PointsMaterial({
    size: 0.22, map: spriteSuave(), color: 0x3d8bff, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  scene.add(new THREE.Points(pg, polvoMat));

  const uniformsComunes = { uTime: { value: 0 }, uPixel: { value: pr }, uFog: { value: Q.niebla }, uOpacity: { value: 0 } };
  const planos = [];   // materiales de planos, para el fundido de entrada
  const sprites = [];
  const lineas = [];
  let claves = [];     // paradas de cámara: { cam, mira, info }
  let rutaCam = null, rutaMira = null;

  // ---------- Construcción de la red a partir de los datos reales ----------
  const loader = new THREE.TextureLoader();
  const cargar = (url, datos) => new Promise(res => loader.load(url, t => {
    t.colorSpace = datos ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    res(t);
  }, undefined, () => res(null)));

  const materialPlano = (map, rect, modo, tinte = [1, 1, 1], aditivo = true) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: planoVS, fragmentShader: planoFS,
      uniforms: {
        uMap: { value: map }, uRect: { value: new THREE.Vector4(...rect) }, uOpacity: { value: 0 },
        uFog: { value: Q.niebla }, uModo: { value: modo }, uTinte: { value: new THREE.Vector3(...tinte) },
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    planos.push(m);
    return m;
  };
  const lineasMat = (color, opacidad) => {
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    m.userData.max = opacidad;
    lineas.push(m);
    return m;
  };
  const segmentos = (pares, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pares.flat(2)), 3));
    const l = new THREE.LineSegments(g, mat);
    scene.add(l);
    return l;
  };
  const conEtiqueta = (s, x, y, z) => { s.position.set(x, y, z); scene.add(s); sprites.push(s); };

  async function construir() {
    const datos = await fetch(MANIFIESTO).then(r => r.json());
    if (document.fonts && document.fonts.load) await document.fonts.load('500 34px "IBM Plex Mono"').catch(() => {});

    const m = datos.modelo;
    const entrada = await cargar(datos.fuente.imagen, false);
    const atlas = await Promise.all(datos.capas.map(c => cargar(c.archivo, true)));
    const mapasClase = await Promise.all(datos.mapas_clase.map(mc => Promise.all(mc.escalas.map(e => cargar(e.archivo, true)))));
    atlas.forEach((t, i) => {
      if (!t) return;
      const chico = datos.capas[i].tile <= 40;
      t.magFilter = chico ? THREE.NearestFilter : THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
    });
    mapasClase.flat().forEach(t => { if (t) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; } });

    const DZ = 0.75;
    // la cámara de cada capa tiene que quedar detrás de la capa anterior
    const hueco = lado => 15 + lado * 0.6;
    const trayecto = [];  // posición del celular en cada capa
    const cel = datos.detecciones.find(d => d.clase === 'cell phone') || datos.detecciones[0];
    const cx = (cel.caja[0] + cel.caja[2]) / 2, cy = (cel.caja[1] + cel.caja[3]) / 2;
    const enPlano = (lado, z) => V((cx - 0.5) * lado, (0.5 - cy) * lado, z);
    const marco = (lado, z) => {
      const h = lado / 2;
      return [V(-h, h, z), V(h, h, z), V(h, -h, z), V(-h, -h, z)];
    };
    let z = 0;
    let marcoAnterior = null;
    const conectar = (marcoNuevo) => {
      if (marcoAnterior) segmentos(marcoAnterior.map((p, i) => [p.toArray(), marcoNuevo[i].toArray()]), lineasMat(AZUL, 0.22));
      marcoAnterior = marcoNuevo;
    };

    // 01 · Entrada: imagen a color y sus tres canales
    const LE = tamPlano(640);
    const geoE = new THREE.PlaneGeometry(LE, LE);
    const img = new THREE.Mesh(geoE, materialPlano(entrada, [0, 0, 1, 1], 1, [1, 1, 1], false));
    img.position.z = z; scene.add(img);
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((t, k) => {
      const p = new THREE.Mesh(geoE, materialPlano(entrada, [0, 0, 1, 1], 2, t));
      p.position.z = z - (k + 1) * DZ * 1.4; scene.add(p);
    });
    conEtiqueta(etiqueta(['images · entrada', `${m.entrada[0]}×${m.entrada[1]}×${m.entrada[2]} · RGB`]), -LE / 2, LE / 2 + 0.6, z);
    trayecto.push(enPlano(LE, z));
    claves.push({ cam: V(-11, 2, z + 30), mira: V(-6, -0.5, z - 4), info: { id: 'images', tipo: 'Entrada', forma: m.entrada } });
    const zFinEntrada = z - 3 * DZ * 1.4;
    conectar(marco(LE, zFinEntrada));
    z = zFinEntrada;

    // 02–03 · Capas reales: backbone y neck
    datos.capas.forEach((capa, i) => {
      const [H, , C] = capa.forma;
      const lado = tamPlano(H);
      const geo = new THREE.PlaneGeometry(lado, lado);
      const n = Math.min(capa.mapas, Q.mapas);
      const z0 = z - hueco(lado);
      for (let j = 0; j < n; j++) {
        const r = Math.floor(j / capa.cols), q = j % capa.cols;
        const rect = [q / capa.cols, 1 - (r + 1) / capa.filas, 1 / capa.cols, 1 / capa.filas];
        const p = new THREE.Mesh(geo, materialPlano(atlas[i], rect, 0));
        p.position.z = z0 - j * DZ;
        scene.add(p);
      }
      const z1 = z0 - (n - 1) * DZ;
      conectar(marco(lado, z0));
      marcoAnterior = marco(lado, z1);
      conEtiqueta(etiqueta([`${capa.id} · ${capa.tipo}`, `${H}×${H}×${C} · ${capa.etapa}`]), -lado / 2, lado / 2 + 0.6, z0);
      trayecto.push(enPlano(lado, z0));
      claves.push({
        cam: V(-9 - lado * 0.1, 1.5 + lado * 0.06, z0 + 10 + lado * 0.6), mira: V(-3, 0, z0 - 4),
        info: { id: capa.id, tipo: capa.tipo, forma: capa.forma, act: capa.activacion_media },
      });
      z = z1;
    });

    // 03 · Mapas de clase reales de la cabeza (3 escalas por clase)
    const LH = 6.5, zH = z - 30;
    datos.mapas_clase.forEach((mc, fila) => {
      const y = fila === 0 ? LH * 0.62 : -LH * 0.62;
      mc.escalas.forEach((e, col) => {
        const x = (col - 1) * (LH + 1.8);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(LH, LH), materialPlano(mapasClase[fila][col], [0, 0, 1, 1], 3));
        p.position.set(x, y, zH);
        scene.add(p);
        conEtiqueta(etiqueta([`${mc.clase} · P${Math.log2(e.stride)}`, `${e.grilla}×${e.grilla} · máx ${e.max.toFixed(2)}`], '#00ccff', 4.2), x - LH / 2, y + LH / 2 + 0.35, zH);
      });
    });
    trayecto.push(V((cx - 0.5) * LH, -LH * 0.62 + (0.5 - cy) * LH, zH)); // escala de 40×40, donde el celular puntúa más
    claves.push({ cam: V(-8, 1.5, zH + 22), mira: V(-2.5, 0, zH), info: { id: 'Detect', tipo: 'Mapas de clase', forma: [m.anclas, 4 + m.clases] } });
    marcoAnterior = null;
    z = zH - 34;

    // 04 · Decisión: detecciones finales sobre la imagen
    const zF = z;
    const final = new THREE.Mesh(geoE, materialPlano(entrada, [0, 0, 1, 1], 1, [1, 1, 1], false));
    final.position.z = zF;
    scene.add(final);
    datos.detecciones.forEach(d => {
      const [x0, y0, x1, y1] = d.caja;
      const P = (u, v) => [(u - 0.5) * LE, (0.5 - v) * LE, zF + 0.05];
      const color = d.clase === 'cell phone' ? CIAN : BLANCO;
      segmentos([[P(x0, y0), P(x1, y0)], [P(x1, y0), P(x1, y1)], [P(x1, y1), P(x0, y1)], [P(x0, y1), P(x0, y0)]], lineasMat(color, 1));
      conEtiqueta(etiqueta([`${d.clase} ${d.conf.toFixed(2)}`], d.clase === 'cell phone' ? '#00ccff' : '#e8f6ff', 5.5), P(x0, y0)[0], P(x0, y0)[1] + 0.15, zF + 0.1);
    });
    conEtiqueta(etiqueta(['NMS · salida', `${datos.detecciones.length} objetos · conf ≥ ${m.conf}`]), -LE / 2, LE / 2 + 0.6, zF);
    trayecto.push(enPlano(LE, zF));
    claves.push({ cam: V(-9, 1.5, zF + 23), mira: V(-3, 0, zF), info: { id: 'NMS', tipo: 'Detecciones', forma: null, dets: datos.detecciones } });

    // Trayecto del celular por toda la red, con pulsos que avanzan
    const trazo = lineasMat(CIAN, 0.85);
    segmentos(trayecto.slice(0, -1).map((p, i) => [p.toArray(), trayecto[i + 1].toArray()]), trazo);
    const pares = [];
    for (let i = 0; i < Q.pulsos; i++) {
      const k = i % (trayecto.length - 1);
      pares.push([trayecto[k], trayecto[k + 1], 0.12 + Math.random() * 0.1]);
    }
    const A = new Float32Array(pares.length * 3), B = new Float32Array(pares.length * 3), P = new Float32Array(pares.length * 2);
    pares.forEach(([a, b, vel], i) => { A.set(a.toArray(), i * 3); B.set(b.toArray(), i * 3); P.set([Math.random(), vel], i * 2); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(A, 3));
    g.setAttribute('aB', new THREE.BufferAttribute(B, 3));
    g.setAttribute('aP', new THREE.BufferAttribute(P, 2));
    g.boundingSphere = new THREE.Sphere(V(0, 0, -150), 400);
    scene.add(new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: pulsoVS, fragmentShader: pulsoFS,
      uniforms: { ...uniformsComunes, uColor: { value: new THREE.Color(0.6, 0.95, 1.0) }, uSize: { value: 0.5 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));

    rutaCam = new THREE.CatmullRomCurve3(claves.map(c => c.cam), false, 'centripetal');
    rutaMira = new THREE.CatmullRomCurve3(claves.map(c => c.mira), false, 'centripetal');
    telemetria.preparar(datos, claves);
    listo = performance.now();
  }

  // ---------- Recorrido ----------
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

  // Cada sección recorre su tramo de la red (índices de parada de cámara)
  const tramos = () => {
    const n = claves.length;
    return [0, 1, Math.max(1, n - 7), n - 2, n - 1]; // entrada → model.0 → … → model.9 → neck → mapas → NMS
  };
  const progreso = () => {
    const T = tramos(), y = window.scrollY;
    for (let i = 0; i < 4; i++) {
      if (y < A[i + 1]) {
        const f = clamp((y - A[i]) / (A[i + 1] - A[i]), 0, 1);
        return { k: lerp(T[i], T[i + 1], f), etapa: i + f };
      }
    }
    return { k: T[4], etapa: 3 };
  };

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
  let kCur = null, tPrev = performance.now(), tiempo = 0, listo = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - tPrev) / 1000);
    tPrev = now;
    if (modal && modal.classList.contains('show')) return;
    if (!reduceMotion) tiempo += dt;

    let intro = 1;
    if (!reduceMotion) intro = introInicio > 0 && now > introInicio ? Math.min(1, (now - introInicio) / 2600) : 0;
    const ease = 1 - Math.pow(1 - intro, 3);
    const aparicion = listo ? (reduceMotion ? 1 : Math.min(1, (now - listo) / 1200)) : 0;
    // en pantallas angostas el texto ocupa todo el ancho: la red va más tenue
    const vis = ease * aparicion * (camera.aspect < 1.1 ? 0.7 : 1);
    mouseS.lerp(mouseT, 1 - Math.exp(-dt * 2.5));
    polvoMat.opacity = 0.5 * ease;

    const { k, etapa } = progreso();
    if (rutaCam) {
      kCur = kCur === null ? k : kCur + (k - kCur) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 2.4));
      const u = clamp(kCur / (claves.length - 1), 0, 1);
      rutaCam.getPoint(u, pos);
      rutaMira.getPoint(u, mira);
      const angosto = camera.aspect < 1.1;
      if (angosto) { // pantallas angostas: la cámara sigue pasando por el costado, pero mira al centro de cada capa
        mira.x = 0;
        pos.z += 8;
      }
      pos.x -= mouseS.x * 1.6;
      pos.y += mouseS.y * 1.1;
      pos.z += (1 - ease) * 40;
      camera.position.copy(pos);
      camera.lookAt(mira.x - mouseS.x * 1.5, mira.y + mouseS.y, mira.z);
      telemetria.actualizar(Math.round(kCur), etapa);
    } else {
      camera.position.set(-10, 2, 24 + (1 - ease) * 40);
      camera.lookAt(-3.5, -0.5, -4);
      telemetria.actualizar(0, etapa);
    }

    for (const m of planos) m.uniforms.uOpacity.value = vis;
    for (const s of sprites) s.material.opacity = vis * 0.95;
    for (const l of lineas) l.opacity = vis * l.userData.max;
    uniformsComunes.uOpacity.value = vis;
    uniformsComunes.uTime.value = tiempo;

    if (composer) composer.render(); else renderer.render(scene, camera);
  }

  construir().catch(() => { /* sin datos: queda el polvo y el sitio funciona igual */ });
  requestAnimationFrame(frame);
  return true;
}

// ---------- Telemetría estilo VMS en la barra de navegación ----------
function crearTelemetria() {
  const nav = document.querySelector('.navbar .container');
  const barra = document.createElement('div');
  barra.className = 'vms-strip';
  barra.setAttribute('aria-label', 'Recorrido por la red neuronal');
  barra.innerHTML = `
    <span class="vms-live"><i></i>YOLOv8n</span>
    <span class="vms-stage"></span>
    <span class="vms-layer"></span>
    <span class="vms-shape"></span>
    <span class="vms-steps" role="list"></span>`;
  if (nav) nav.insertBefore(barra, nav.querySelector('.hamburger'));
  const $ = s => barra.querySelector(s);
  let claves = [], ultimo = -1, etapaPrev = -1;

  return {
    preparar(datos, cl) {
      claves = cl;
      $('.vms-steps').innerHTML = cl.map(() => '<b role="listitem"></b>').join('');
      barra.title = `YOLOv8n · ${datos.modelo.parametros.toLocaleString('es-AR')} parámetros · ${datos.modelo.gflops} GFLOPs · cuadro real de "${datos.fuente.caso}"`;
    },
    actualizar(k, etapa) {
      const e = clamp(Math.round(etapa), 0, ETAPAS.length - 1);
      if (e !== etapaPrev) {
        $('.vms-stage').textContent = `${String(e + 1).padStart(2, '0')} ${ETAPAS[e].nombre}`;
        etapaPrev = e;
      }
      if (!claves.length || k === ultimo) return;
      ultimo = k;
      const info = claves[clamp(k, 0, claves.length - 1)].info;
      $('.vms-layer').textContent = `${info.id} · ${info.tipo}`;
      $('.vms-shape').textContent = info.dets
        ? `${info.dets.length} objetos`
        : info.forma ? info.forma.join('×') : '';
      barra.querySelectorAll('.vms-steps b').forEach((b, i) => b.classList.toggle('on', i <= k));
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
