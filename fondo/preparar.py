"""Datos reales para el fondo inmersivo de AureaIA.

- Embeddings: vectores de palabras en español (spaCy es_core_news_md, 300 dimensiones).
  Posición 3D por PCA y vecinos más cercanos por similitud coseno.
- LLM: modelo de bigramas entrenado con el texto del propio sitio, y vectores de cada
  palabra del vocabulario reducidos a 32 dimensiones (PCA) para calcular la atención.
- Convolución: kernels de bordes (Sobel) y el kernel real de YOLOv8n model.0 canal 6
  sumado sobre RGB (equivalente en escala de grises).
"""
import sys, re, json, html, numpy as np, spacy, onnx
from onnx import numpy_helper
# Uso: python preparar.py <carpeta del modelo spaCy> <carpeta con yolov8n.onnx> <carpeta de salida>
E, Y, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
nlp = spacy.load(f"{E}/wheel/es_core_news_md/es_core_news_md-3.8.0")
vec = lambda w: nlp.vocab[w].vector.astype(np.float64)

# ---------- Embeddings ----------
grupos = {
    "datos": "datos información análisis número cálculo estadística",
    "visión": "imagen video visión cámara mirada ojo rostro",
    "lenguaje": "texto lenguaje palabra pregunta respuesta voz conversación",
    "mente": "cerebro neurona memoria conocimiento inteligencia idea aprendizaje",
    "negocio": "cliente negocio empresa proceso solución decisión futuro",
    "seguridad": "seguridad robo detección persona mano gesto teléfono",
}
palabras = [w for g in grupos.values() for w in g.split()]
M = np.stack([vec(w) for w in palabras])
assert np.all(np.linalg.norm(M, axis=1) > 0)
U = M / np.linalg.norm(M, axis=1, keepdims=True)
C = U @ U.T
Mc = M - M.mean(0)
_, _, Vt = np.linalg.svd(Mc, full_matrices=False)
P3 = Mc @ Vt[:3].T
P3 = P3 / np.abs(P3).max(0) * np.array([15, 10, 13])
emb = []
for i, w in enumerate(palabras):
    orden = [j for j in np.argsort(-C[i]) if j != i][:4]
    emb.append({"w": w, "p": [round(float(v), 2) for v in P3[i]],
                "v": [round(float(v), 2) for v in M[i][:8]],
                "vecinos": [[palabras[j], round(float(C[i, j]), 2)] for j in orden]})

# ---------- LLM: bigramas con el texto del sitio ----------
src = open(f"{OUT}/../index.html", encoding="utf-8").read()
src = re.sub(r"<script.*?</script>|<style.*?</style>|<svg.*?</svg>|<!--.*?-->", " ", src, flags=re.S)
src = re.sub(r"<br\s*/?>|</?(span|strong|b)[^>]*>", " ", src)
texto = html.unescape(re.sub(r"<[^>]+>", " \n ", src))
frases = []
for linea in texto.split("\n"):
    linea = linea.strip()
    if len(linea.split()) < 3 or "·" in linea or "×" in linea: continue
    if re.search(r"ascii|fidelidad|comparar|cookies|derechos", linea, re.I): continue
    for f in re.split(r"(?<=[.!?:])\s+", linea):
        toks = re.findall(r"[a-záéíóúñü]+|[.]", f.lower())
        if len(toks) >= 3: frases.append(toks + ([] if toks[-1] == "." else ["."]))
vocab = sorted({t for f in frases for t in f})
cuenta = {}
for f in frases:
    for a, b in zip(f, f[1:]): cuenta.setdefault(a, {}).setdefault(b, 0); cuenta[a][b] += 1
bigramas = {a: sorted(([b, n] for b, n in d.items()), key=lambda x: -x[1]) for a, d in cuenta.items()}
inicios = sorted({f[0] for f in frases if f[0] in bigramas and len(f) >= 5})
V = np.stack([vec(w) if w != "." else np.zeros(300) for w in vocab])
con = np.linalg.norm(V, axis=1) > 0
Vc = V[con] - V[con].mean(0)
_, _, Wt = np.linalg.svd(Vc, full_matrices=False)
R = np.zeros((len(vocab), 32)); R[con] = Vc @ Wt[:32].T
R = R / (np.linalg.norm(R, axis=1, keepdims=True) + 1e-9)

# ---------- Convolución ----------
m = onnx.load(f"{Y}/yolov8n.onnx")
W0 = {t.name: numpy_helper.to_array(t) for t in m.graph.initializer}["model.0.conv.weight"][6].sum(0)
kernels = [
    {"nombre": "bordes verticales (Sobel)", "k": [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]},
    {"nombre": "bordes horizontales (Sobel)", "k": [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]},
    {"nombre": "YOLOv8n model.0 canal 6", "k": [[round(float(v), 2) for v in fila] for fila in W0]},
]

datos = {
    "embeddings": {"fuente": "spaCy es_core_news_md · 300 dimensiones", "palabras": emb},
    "llm": {"fuente": "bigramas entrenados con el texto de este sitio · atención con vectores de 32 dimensiones",
            "vocab": vocab, "vec": [[round(float(x), 3) for x in r] for r in R],
            "bigramas": bigramas, "inicios": inicios, "frases": len(frases)},
    "convolucion": {"kernels": kernels},
}
json.dump(datos, open(f"{OUT}/procesos.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("palabras", len(palabras), "frases", len(frases), "vocab", len(vocab), "inicios", inicios[:12])
print("kernel yolo gris", kernels[2]["k"])
for w in ["datos", "imagen", "cerebro", "pregunta"]:
    e = next(x for x in emb if x["w"] == w); print(w, e["vecinos"])
for a in ["transformamos", "datos", "en", "de", "análisis"]:
    print(a, bigramas.get(a, [])[:5])
