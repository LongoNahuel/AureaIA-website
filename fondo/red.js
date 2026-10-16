/* ==========================================================================
   AureaIA — Red neuronal multicapa que se entrena en el navegador

   Datos: 500 dígitos escritos a mano (50 por clase), generados con trazos y
   deformaciones al azar, rasterizados a 14×14.

   Red (todo con pesos reales y backpropagation):
     entrada 14×14
     → convolución 4 filtros 3×3 + ReLU → 4×12×12
     → max pooling 2×2                  → 4×6×6 = 144
     → densa 32 + ReLU
     → densa 16 + ReLU                  (espacio latente / embedding)
     → densa 10 + softmax               (dígitos 0–9)
   Pérdida: entropía cruzada. Optimizador: Adam en lotes de 16.

   No usa el DOM: se puede probar con node (ver fondo/probar-red.mjs).
   ========================================================================== */

export const N = 14, NC = 4, NK = 3, NCONV = N - NK + 1, NPOOL = NCONV / 2;
export const NIN = NC * NPOOL * NPOOL, NH1 = 32, NH2 = 16, NOUT = 10;

export function aleatorio(semilla) {
  let a = semilla >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- Dígitos: trazos en el cuadrado unitario ----------
const elipse = (cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2, n = 26) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
const quad = (p0, c, p1, n = 12) =>
  Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]; });
const recta = (...p) => p;
const TRAZOS = {
  0: () => [elipse(0.5, 0.5, 0.22, 0.31)],
  1: () => [recta([0.4, 0.3], [0.54, 0.17], [0.54, 0.84])],
  2: () => [[...quad([0.28, 0.34], [0.5, 0.06], [0.72, 0.3]), ...quad([0.72, 0.3], [0.76, 0.48], [0.3, 0.82]).slice(1), [0.76, 0.81]]],
  3: () => [[...quad([0.3, 0.24], [0.72, 0.06], [0.66, 0.4]), ...quad([0.66, 0.4], [0.62, 0.5], [0.44, 0.5]).slice(1)],
            [...quad([0.44, 0.5], [0.8, 0.52], [0.68, 0.72]), ...quad([0.68, 0.72], [0.56, 0.92], [0.27, 0.78]).slice(1)]],
  4: () => [recta([0.62, 0.84], [0.62, 0.17], [0.24, 0.62], [0.78, 0.62])],
  5: () => [[[0.72, 0.19], [0.36, 0.19], [0.32, 0.48], ...quad([0.32, 0.48], [0.76, 0.36], [0.7, 0.66]).slice(1), ...quad([0.7, 0.66], [0.62, 0.9], [0.28, 0.78]).slice(1)]],
  6: () => [[...quad([0.66, 0.18], [0.3, 0.26], [0.31, 0.64]), ...elipse(0.5, 0.65, 0.19, 0.18, Math.PI, Math.PI * 3)]],
  7: () => [recta([0.24, 0.21], [0.76, 0.21], [0.46, 0.85])],
  8: () => [elipse(0.5, 0.33, 0.16, 0.15, Math.PI / 2, Math.PI * 2.5), elipse(0.5, 0.66, 0.2, 0.18, -Math.PI / 2, Math.PI * 1.5)],
  9: () => [[...elipse(0.5, 0.36, 0.19, 0.16, 0, Math.PI * 2), [0.69, 0.36], [0.6, 0.85]]],
};

// deformación al azar de un ejemplo: rotación, escala, inclinación, corrimiento y grosor del trazo
export function deformacion(rnd) {
  const rot = (rnd() - 0.5) * 0.5, esc = 0.84 + rnd() * 0.24, inc = (rnd() - 0.5) * 0.3;
  const dx = (rnd() - 0.5) * 0.12, dy = (rnd() - 0.5) * 0.1, ancho = 0.075 + rnd() * 0.045;
  return { rot, esc, inc, dx, dy, ancho };
}

// trazos del dígito ya deformados, en el cuadrado unitario (sirven para dibujarlo a cualquier resolución)
export function trazosDeformados(d, def) {
  const c = Math.cos(def.rot), s = Math.sin(def.rot);
  const tr = ([x, y]) => {
    let u = x - 0.5, v = y - 0.5;
    u += def.inc * v;
    return [0.5 + def.esc * (c * u - s * v) + def.dx, 0.5 + def.esc * (s * u + c * v) + def.dy];
  };
  return TRAZOS[d]().map(trazo => trazo.map(tr));
}

// rasteriza el dígito a 14×14 con una deformación al azar
export function dibujar(d, rnd) {
  return rasterizar(d, deformacion(rnd));
}

function rasterizar(d, def) {
  const ancho = def.ancho, segs = [];
  for (const p of trazosDeformados(d, def)) {
    for (let i = 0; i < p.length - 1; i++) segs.push([p[i], p[i + 1]]);
  }
  const img = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const px = (i + 0.5) / N, py = (j + 0.5) / N;
    let dmin = 9;
    for (const [[ax, ay], [bx, by]] of segs) {
      const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
      const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy + 1e-9)));
      const ex = wx - t * vx, ey = wy - t * vy, dd = ex * ex + ey * ey;
      if (dd < dmin) dmin = dd;
    }
    img[j * N + i] = Math.max(0, Math.min(1, 1 - (Math.sqrt(dmin) - ancho / 2) * N));
  }
  return img;
}

export function crearDatos(porClase = 50, semilla = 2026) {
  const rnd = aleatorio(semilla), X = [], Y = [], D = [];
  for (let k = 0; k < porClase; k++) for (let d = 0; d < 10; d++) {
    const def = deformacion(rnd);
    X.push(rasterizar(d, def)); Y.push(d); D.push(def);
  }
  return { X, Y, D }; // D: la deformación de cada ejemplo, para redibujarlo en alta resolución
}

// ---------- Red ----------
export function crearRed(semilla = 7) {
  const rnd = aleatorio(semilla);
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const capa = (n, fanIn) => Float32Array.from({ length: n }, () => g() * Math.sqrt(2 / fanIn));
  const P = {
    K: capa(NC * NK * NK, NK * NK), b0: new Float32Array(NC),
    W1: capa(NH1 * NIN, NIN), b1: new Float32Array(NH1),
    W2: capa(NH2 * NH1, NH1), b2: new Float32Array(NH2),
    W3: capa(NOUT * NH2, NH2), b3: new Float32Array(NOUT),
  };
  const nombres = Object.keys(P);
  const m = Object.fromEntries(nombres.map(k => [k, new Float32Array(P[k].length)]));
  const v = Object.fromEntries(nombres.map(k => [k, new Float32Array(P[k].length)]));
  let t = 0;

  function forward(x) {
    const c = new Float32Array(NC * NCONV * NCONV);
    for (let f = 0; f < NC; f++) for (let y = 0; y < NCONV; y++) for (let xx = 0; xx < NCONV; xx++) {
      let z = P.b0[f];
      for (let ky = 0; ky < NK; ky++) for (let kx = 0; kx < NK; kx++) z += P.K[f * 9 + ky * 3 + kx] * x[(y + ky) * N + xx + kx];
      c[(f * NCONV + y) * NCONV + xx] = z;
    }
    const a0 = new Float32Array(NIN), arg = new Int32Array(NIN);
    for (let f = 0; f < NC; f++) for (let py = 0; py < NPOOL; py++) for (let px = 0; px < NPOOL; px++) {
      let best = -1, bi = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = (f * NCONV + py * 2 + dy) * NCONV + px * 2 + dx, r = Math.max(0, c[i]);
        if (r > best) { best = r; bi = i; }
      }
      const o = (f * NPOOL + py) * NPOOL + px;
      a0[o] = best; arg[o] = bi;
    }
    const densa = (W, b, a, nOut, nIn, relu) => {
      const z = new Float32Array(nOut), o = new Float32Array(nOut);
      for (let j = 0; j < nOut; j++) {
        let s = b[j];
        for (let i = 0; i < nIn; i++) s += W[j * nIn + i] * a[i];
        z[j] = s; o[j] = relu ? Math.max(0, s) : s;
      }
      return [z, o];
    };
    const [z1, a1] = densa(P.W1, P.b1, a0, NH1, NIN, true);
    const [z2, a2] = densa(P.W2, P.b2, a1, NH2, NH1, true);
    const [z3] = densa(P.W3, P.b3, a2, NOUT, NH2, false);
    const mx = Math.max(...z3), e = z3.map(z => Math.exp(z - mx)), se = e.reduce((a, b) => a + b, 0);
    const p = e.map(z => z / se);
    return { x, c, a0, arg, z1, a1, z2, a2, z3, p };
  }

  const ceros = () => Object.fromEntries(nombres.map(k => [k, new Float32Array(P[k].length)]));

  // backpropagation de un ejemplo; suma los gradientes en G y devuelve los δ de cada capa
  function backward(f, y, G) {
    const d3 = Float32Array.from(f.p, (p, k) => p - (k === y ? 1 : 0));
    const atras = (W, d, aPrev, zPrev, nOut, nIn, gW, gb) => {
      const dPrev = new Float32Array(nIn);
      for (let j = 0; j < nOut; j++) {
        gb[j] += d[j];
        for (let i = 0; i < nIn; i++) { gW[j * nIn + i] += d[j] * aPrev[i]; dPrev[i] += W[j * nIn + i] * d[j]; }
      }
      if (zPrev) for (let i = 0; i < nIn; i++) if (zPrev[i] <= 0) dPrev[i] = 0;
      return dPrev;
    };
    const d2 = atras(P.W3, d3, f.a2, f.z2, NOUT, NH2, G.W3, G.b3);
    const d1 = atras(P.W2, d2, f.a1, f.z1, NH2, NH1, G.W2, G.b2);
    const d0 = atras(P.W1, d1, f.a0, null, NH1, NIN, G.W1, G.b1);
    const dc = new Float32Array(NC * NCONV * NCONV);
    for (let o = 0; o < NIN; o++) if (f.a0[o] > 0) dc[f.arg[o]] += d0[o];
    for (let ff = 0; ff < NC; ff++) for (let yy = 0; yy < NCONV; yy++) for (let xx = 0; xx < NCONV; xx++) {
      const d = dc[(ff * NCONV + yy) * NCONV + xx];
      if (!d) continue;
      G.b0[ff] += d;
      for (let ky = 0; ky < NK; ky++) for (let kx = 0; kx < NK; kx++) G.K[ff * 9 + ky * 3 + kx] += d * f.x[(yy + ky) * N + xx + kx];
    }
    return { d3, d2, d1, d0, dc, loss: -Math.log(f.p[y] + 1e-9) };
  }

  function aplicar(G, lote, lr) { // Adam
    t++;
    for (const k of nombres) {
      const p = P[k], g = G[k], mk = m[k], vk = v[k];
      for (let i = 0; i < p.length; i++) {
        const gr = g[i] / lote;
        mk[i] = 0.9 * mk[i] + 0.1 * gr;
        vk[i] = 0.999 * vk[i] + 0.001 * gr * gr;
        p[i] -= lr * (mk[i] / (1 - 0.9 ** t)) / (Math.sqrt(vk[i] / (1 - 0.999 ** t)) + 1e-8);
      }
    }
  }

  return { P, forward, backward, aplicar, ceros, get pasos() { return t; } };
}

// Entrenador: recorre los datos en orden aleatorio, en lotes
export function crearEntrenador(datos, red, { lote = 16, lr = 0.003, semilla = 11 } = {}) {
  const rnd = aleatorio(semilla), n = datos.X.length;
  const orden = Array.from({ length: n }, (_, i) => i);
  const mezclar = () => { for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; } };
  mezclar();
  let cursor = 0, vistos = 0;
  return {
    paso() {
      const G = red.ceros();
      let loss = 0;
      const indices = [];
      for (let b = 0; b < lote; b++) {
        const k = orden[cursor];
        indices.push(k);
        loss += red.backward(red.forward(datos.X[k]), datos.Y[k], G).loss;
        cursor++;
        if (cursor >= n) { cursor = 0; mezclar(); }
      }
      red.aplicar(G, lote, lr);
      vistos += lote;
      return { loss: loss / lote, indices };
    },
    evaluar(muestra = n) {
      let loss = 0, ok = 0;
      for (let k = 0; k < muestra; k++) {
        const f = red.forward(datos.X[k]);
        loss += -Math.log(f.p[datos.Y[k]] + 1e-9);
        if (f.p.indexOf(Math.max(...f.p)) === datos.Y[k]) ok++;
      }
      return { loss: loss / muestra, acc: ok / muestra };
    },
    get epoca() { return vistos / n; },
  };
}

// PCA a 3D del espacio latente (16 dimensiones) por iteración de potencias
export function pca3(filas) {
  const n = filas.length, d = filas[0].length, media = new Float64Array(d);
  for (const f of filas) for (let i = 0; i < d; i++) media[i] += f[i] / n;
  const C = Array.from({ length: d }, () => new Float64Array(d));
  for (const f of filas) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] += (f[i] - media[i]) * (f[j] - media[j]) / n;
  const vecs = [];
  for (let c = 0; c < 3; c++) {
    let v = Float64Array.from({ length: d }, (_, i) => Math.sin(i * 1.7 + c * 2.3) + 0.1);
    for (let it = 0; it < 60; it++) {
      const w = new Float64Array(d);
      for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) w[i] += C[i][j] * v[j];
      for (const u of vecs) { let dot = 0; for (let i = 0; i < d; i++) dot += w[i] * u[i]; for (let i = 0; i < d; i++) w[i] -= dot * u[i]; }
      const nrm = Math.hypot(...w) || 1;
      v = w.map(x => x / nrm);
    }
    vecs.push(v);
  }
  return filas.map(f => vecs.map(u => { let s = 0; for (let i = 0; i < d; i++) s += (f[i] - media[i]) * u[i]; return s; }));
}
