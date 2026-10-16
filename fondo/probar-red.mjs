// Prueba la red multicapa con node: node fondo/probar-red.mjs
import { crearDatos, crearRed, crearEntrenador, pca3, N } from './red.js';

const datos = crearDatos();
const prueba = crearDatos(10, 99); // 100 dígitos nuevos que la red no ve al entrenar
const red = crearRed();
const ent = crearEntrenador(datos, red);

const ascii = img => Array.from({ length: N }, (_, j) => Array.from({ length: N }, (_, i) => ' .:-=+*#%@'[Math.round(img[j * N + i] * 9)]).join('')).join('\n');
for (const d of [0, 4, 8]) console.log(`dígito ${d}\n${ascii(datos.X[d])}\n`);

const t0 = Date.now();
for (let s = 1; s <= 600; s++) {
  ent.paso();
  if ([1, 31, 94, 157, 313, 469, 600].includes(s)) {
    const e = ent.evaluar(), p = (() => {
      let ok = 0;
      for (let k = 0; k < prueba.X.length; k++) { const f = red.forward(prueba.X[k]); if (f.p.indexOf(Math.max(...f.p)) === prueba.Y[k]) ok++; }
      return ok / prueba.X.length;
    })();
    console.log(`paso ${s} · época ${ent.epoca.toFixed(1)} · pérdida ${e.loss.toFixed(3)} · precisión ${(e.acc * 100).toFixed(1)}% · datos nuevos ${(p * 100).toFixed(0)}%`);
  }
}
console.log('ms', Date.now() - t0);
const lat = pca3(datos.X.slice(0, 200).map(x => red.forward(x).a2));
console.log('pca', lat.slice(0, 3).map(v => v.map(x => x.toFixed(2))));
