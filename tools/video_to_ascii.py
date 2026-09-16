#!/usr/bin/env python3
"""
video_to_ascii.py — convierte los videos del portfolio a animaciones ASCII a color.

Muestrea cada video a una grilla de celdas de caracteres: el carácter codifica
la luminancia y el color el matiz de la celda. La secuencia se empaqueta como
JSON delta-comprimido que reproduce ascii-player.js en el navegador.

El procesado es en streaming (una pasada de estadísticas a bajo fps y otra de
codificación), así que la memoria no depende de la duración ni de la
resolución del clip.

Uso:
    python3 tools/video_to_ascii.py                # procesa todos los clips
    python3 tools/video_to_ascii.py manos          # procesa uno solo
    python3 tools/video_to_ascii.py --cols 200     # prueba otra resolución
"""

import argparse
import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_DIR = os.path.join(ROOT, "videos")
OUT_DIR = os.path.join(ROOT, "ascii")

FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")

# 64 niveles de densidad. La rampa no está copiada de ninguna tabla: sale de
# medir la cobertura de tinta real de cada ASCII imprimible en una
# monoespaciada y quedarse con 64 densidades equiespaciadas (ver derive_ramp).
RAMP = " _.-',:~^;!*r+/()|=><?lcvij][Lz7xtf1{CyIF2%w5aXP$GAUK6OD#R8Q@WBM"

# Alfabeto de 6 bits para las celdas: dos caracteres por celda (nivel + color).
# No contiene ni ',' ni ';', que son los separadores del formato delta.
B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

PALETTE_SIZE = 64

# Relación ancho/alto de una celda de texto monoespaciado. El reproductor usa
# la misma constante para que la grilla conserve el aspecto del video.
CELL_ASPECT = 0.6

# Curva tonal por defecto. Los clips son capturas de pantalla con tema oscuro:
# casi toda la luminancia se apelotona entre 18 y 65, así que una rampa lineal
# deja todo en un gris plano. Mezclamos ecualización de histograma (recupera el
# detalle del texto) con una rampa lineal (mantiene el fondo negro).
EQ_MIX = 0.7      # peso de la ecualización frente a la rampa lineal
GAMMA = 1.45      # >1 hunde los grises bajos para que el fondo quede vacío
SHARPEN = 1.0     # realce local: devuelve nitidez al texto tras el submuestreo
SATURATION = 1.6

# Histéresis temporal (ver stabilize).
CHAR_TOL = 2          # niveles de 64 que debe saltar una celda para actualizarse
COLOR_TOL = 46.0      # distancia RGB para aceptar un cambio de color

# Dos niveles de detalle. Una tarjeta mide ~470 px de ancho: a 260 columnas
# cada carácter caería en 1,8 px, así que ahí sólo se pagaría peso sin ganar
# nitidez. El nivel "hi" se descarga únicamente al abrir el lightbox.
TIERS = [
    {"suffix": "", "cols": 132},        # tarjetas del portfolio
    {"suffix": ".hi", "cols": 260},     # lightbox y vista comparativa
]

CLIPS = [
    {"id": "robo", "file": "Analítica de robo_urto.mp4.mp4", "fps": 12},
    {"id": "chatbot", "file": "ChatBot.mp4.mp4", "fps": 10},
    {"id": "celulares", "file": "Detección de celulares.mp4.mp4", "fps": 12},
    {"id": "manos", "file": "Detección de manos.mp4.mp4", "fps": 15},
    {"id": "mirada", "file": "Detección de mirada.mp4.mp4", "fps": 12},
]


# --------------------------------------------------------------------------
# Lectura del video
# --------------------------------------------------------------------------

def source_size(path):
    out = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", path], stderr=subprocess.PIPE
    ).stderr.decode("utf-8", "replace")
    for token in out.split():
        token = token.rstrip(",")
        if "x" in token and token.replace("x", "").isdigit():
            w, _, h = token.partition("x")
            if int(w) > 100 and int(h) > 100:
                return int(w), int(h)
    raise RuntimeError("no pude leer la resolución de " + path)


def detect_crop(path, threshold=16, probe_w=160, probe_h=90):
    """Bounding box del contenido, para descartar las bandas negras del clip.

    Devuelve (x, y, w, h) en píxeles de la fuente. Miramos el máximo temporal de
    cada píxel: una banda sólo se recorta si está oscura durante todo el clip.
    """
    src_w, src_h = source_size(path)
    cmd = [
        FFMPEG, "-v", "error", "-i", path,
        "-vf", f"fps=2,scale={probe_w}:{probe_h}:flags=area",
        "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ]
    raw = subprocess.run(cmd, stdout=subprocess.PIPE, check=True).stdout
    n = len(raw) // (probe_w * probe_h)
    peak = np.frombuffer(raw[: n * probe_w * probe_h], dtype=np.uint8).reshape(
        n, probe_h, probe_w
    ).max(0)

    ys = np.flatnonzero(peak.max(1) > threshold)
    xs = np.flatnonzero(peak.max(0) > threshold)
    if len(ys) == 0 or len(xs) == 0:
        return 0, 0, src_w, src_h

    x = int(xs[0] / probe_w * src_w) & ~1
    y = int(ys[0] / probe_h * src_h) & ~1
    w = (int((xs[-1] + 1) / probe_w * src_w) - x) & ~1
    h = (int((ys[-1] + 1) / probe_h * src_h) - y) & ~1
    return x, y, max(w, 2), max(h, 2)


def stream_frames(path, cols, rows, fps, crop=None):
    """Genera frames (rows, cols, 3) uint8 promediando cada celda.

    Streaming: nunca tenemos más de un frame en memoria, así que subir columnas
    o duración no cambia el consumo.
    """
    chain = []
    if crop:
        x, y, w, h = crop
        chain.append(f"crop={w}:{h}:{x}:{y}")
    chain += [f"fps={fps}", f"scale={cols}:{rows}:flags=area"]

    cmd = [
        FFMPEG, "-v", "error", "-i", path,
        "-vf", ",".join(chain),
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]
    stride = cols * rows * 3
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=stride * 4)
    try:
        while True:
            buf = proc.stdout.read(stride)
            while len(buf) < stride:       # los pipes devuelven lecturas cortas
                chunk = proc.stdout.read(stride - len(buf))
                if not chunk:
                    break
                buf += chunk
            if len(buf) < stride:
                break
            yield np.frombuffer(buf, dtype=np.uint8).reshape(rows, cols, 3)
    finally:
        # Si cortamos antes de tiempo (p. ej. al volcar sólo el póster),
        # matamos ffmpeg en vez de dejarlo escribir contra un pipe cerrado.
        if proc.poll() is None:
            proc.terminate()
        proc.stdout.close()
        proc.wait()


# --------------------------------------------------------------------------
# Luminancia -> carácter
# --------------------------------------------------------------------------

def luminance(frame):
    f = frame.astype(np.float32)
    return 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]


def sharpen(lum, amount):
    """Máscara de enfoque 3x3 sobre la grilla de celdas de un frame."""
    if not amount:
        return lum
    p = np.pad(lum, 1, mode="edge")
    blur = (
        p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:]
        + p[1:-1, :-2] + p[1:-1, 1:-1] + p[1:-1, 2:]
        + p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:]
    ) / 9.0
    return np.clip(lum + amount * (lum - blur), 0.0, 255.0)


def tone_curve(samples, eq_mix, gamma):
    """Tabla de 256 entradas: luminancia -> índice de RAMP.

    Precalcularla como LUT deja el trabajo por frame en un simple indexado.
    """
    lo, hi = np.percentile(samples, 2.0), np.percentile(samples, 99.5)
    if hi - lo < 8:
        lo, hi = 0.0, 255.0

    levels = np.arange(256, dtype=np.float32)
    linear = np.clip((levels - lo) / (hi - lo), 0.0, 1.0)

    # CDF exclusiva (fracción de celdas estrictamente más oscuras). Con la CDF
    # inclusiva el negro puro heredaría el peso de todo su bin y el fondo se
    # llenaría de caracteres; así el nivel más oscuro siempre cae en el espacio.
    hist, _ = np.histogram(samples, bins=256, range=(0, 256))
    cdf = (np.cumsum(hist) - hist).astype(np.float32)
    cdf /= max(cdf[-1], 1.0)

    norm = np.clip(eq_mix * np.clip(cdf, 0, 1) + (1.0 - eq_mix) * linear, 0.0, 1.0)
    return np.rint(norm ** gamma * (len(RAMP) - 1)).astype(np.uint8)


# --------------------------------------------------------------------------
# Color
# --------------------------------------------------------------------------

def normalized_colors(frame, saturation=SATURATION):
    """Matiz de cada celda con el brillo neutralizado.

    El brillo ya lo aporta el carácter, así que el color sólo guarda el tono.
    Saturamos un poco para que los acentos de la UI (azul, verde, rojo de las
    alertas) se distingan del gris, y forzamos a gris claro las celdas casi
    negras, donde normalizar sólo amplificaría ruido de compresión.
    """
    f = frame.astype(np.float32)
    mx = f.max(axis=-1, keepdims=True)
    grey = f.mean(axis=-1, keepdims=True)
    f = grey + (f - grey) * saturation
    peak = np.maximum(f.max(axis=-1, keepdims=True), 1e-6)
    scaled = np.where(mx > 10, f * (245.0 / peak), 235.0)
    return np.clip(scaled, 0, 255)


def build_palette(samples, k=PALETTE_SIZE, iters=14, seed=7):
    """k-means sobre los colores normalizados visibles."""
    rng = np.random.default_rng(seed)
    if len(samples) > 80000:
        samples = samples[rng.choice(len(samples), 80000, replace=False)]

    centers = samples[rng.choice(len(samples), k, replace=False)].astype(np.float32)
    for _ in range(iters):
        labels = np.argmin(
            ((samples[:, None, :] - centers[None, :, :]) ** 2).sum(-1), axis=1
        )
        for i in range(k):
            m = labels == i
            if m.any():
                centers[i] = samples[m].mean(0)
            else:
                centers[i] = samples[rng.integers(len(samples))]
    return np.clip(centers, 0, 255)


def palette_lut(centers, bits=5):
    """LUT 3D (32³) de RGB -> índice de paleta.

    Calcular la distancia a 64 centros para cada celda de cada frame es el paso
    más caro del pipeline; con la LUT queda en un indexado.
    """
    side = 1 << bits
    step = 256 / side
    axis = (np.arange(side) + 0.5) * step
    grid = np.stack(np.meshgrid(axis, axis, axis, indexing="ij"), -1).reshape(-1, 3)
    d = ((grid[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
    return d.argmin(1).astype(np.uint8), bits


def quantize(colors, lut, bits):
    shift = 8 - bits
    c = colors.astype(np.uint8)
    idx = ((c[..., 0] >> shift).astype(np.int32) << (2 * bits)) \
        | ((c[..., 1] >> shift).astype(np.int32) << bits) \
        | (c[..., 2] >> shift).astype(np.int32)
    return lut[idx]


# --------------------------------------------------------------------------
# Codificación
# --------------------------------------------------------------------------

CELL = [B64[c] + B64[p] for c in range(64) for p in range(64)]


def encode_frame(cur, prev, out):
    """Añade a `out` el delta de `cur` respecto a `prev`.

    Formato: "salto,celdas;salto,celdas;…". Cada celda son dos caracteres
    base64: nivel de la rampa y entrada de la paleta. El frame 0 va completo.
    """
    if prev is None:
        out.append("0," + "".join(CELL[v] for v in cur))
        return

    diff = np.flatnonzero(cur != prev)
    if len(diff) == 0:
        out.append("")
        return

    # Agrupamos posiciones contiguas tolerando huecos de hasta 3 celdas: salen
    # más baratos que abrir un segmento nuevo con su salto y su separador.
    breaks = np.flatnonzero(np.diff(diff) > 3)
    starts = np.concatenate(([0], breaks + 1))
    ends = np.concatenate((breaks + 1, [len(diff)]))

    parts = []
    cursor = 0
    for s, e in zip(starts, ends):
        a, b = int(diff[s]), int(diff[e - 1]) + 1
        parts.append(f"{a - cursor}," + "".join(CELL[v] for v in cur[a:b]))
        cursor = b
    out.append(";".join(parts))


def process(clip, cols, suffix="", dump_preview=None):
    path = os.path.join(VIDEO_DIR, clip["file"])
    fps = clip["fps"]
    eq_mix = clip.get("eq_mix", EQ_MIX)
    gamma = clip.get("gamma", GAMMA)
    sharp = clip.get("sharpen", SHARPEN)
    char_tol = clip.get("char_tol", CHAR_TOL)
    color_tol2 = clip.get("color_tol", COLOR_TOL) ** 2

    crop = detect_crop(path)
    # Las filas salen del aspecto del recorte, para no deformar la imagen.
    rows = max(2, int(round(cols * CELL_ASPECT * crop[3] / crop[2])))
    n_cells = cols * rows

    # --- pasada 1: estadísticas sobre una muestra a bajo fps ---------------
    lum_samples, color_samples = [], []
    for frame in stream_frames(path, cols, rows, 2, crop):
        lum = sharpen(luminance(frame), sharp)
        lum_samples.append(lum.reshape(-1).astype(np.uint8))
        col = normalized_colors(frame).reshape(-1, 3)
        color_samples.append(col[lum.reshape(-1) > 18])

    lum_samples = np.concatenate(lum_samples)
    color_samples = np.concatenate(color_samples)
    if len(color_samples) < PALETTE_SIZE:
        color_samples = np.full((PALETTE_SIZE, 3), 235.0, dtype=np.float32)

    char_lut = tone_curve(lum_samples, eq_mix, gamma)
    centers = build_palette(color_samples)
    pal_lut, pal_bits = palette_lut(centers)
    del lum_samples, color_samples

    # --- pasada 2: codificación -------------------------------------------
    frames = []
    prev = None                                  # último estado emitido
    held_char = np.zeros(n_cells, dtype=np.uint8)
    held_pal = np.zeros(n_cells, dtype=np.uint8)
    ink_per_frame = []
    first = True

    for frame in stream_frames(path, cols, rows, fps, crop):
        lum = sharpen(luminance(frame), sharp)
        new_char = char_lut[lum.reshape(-1).astype(np.uint8)]
        colors = normalized_colors(frame).reshape(-1, 3)
        new_pal = quantize(colors, pal_lut, pal_bits)

        if first:
            held_char, held_pal = new_char.copy(), new_pal.copy()
            first = False
        else:
            held_char, held_pal = stabilize(
                held_char, held_pal, new_char, new_pal, colors, centers,
                char_tol, color_tol2,
            )

        cells = (held_char.astype(np.uint16) << 6) | held_pal
        encode_frame(cells, prev, frames)
        prev = cells
        ink_per_frame.append(float(held_char.mean()))

    poster = pick_poster(ink_per_frame)

    if dump_preview:
        dump_text_preview(path, cols, rows, fps, crop, char_lut, sharp, poster, dump_preview)

    data = {
        "id": clip["id"],
        "cols": cols,
        "rows": rows,
        "fps": fps,
        "ramp": RAMP,
        "alphabet": B64,
        "cellAspect": CELL_ASPECT,
        "poster": poster,
        "source": {
            "width": crop[2],
            "height": crop[3],
            "bytes": os.path.getsize(path),
            "file": "videos/" + clip["file"],
            # Recorte aplicado, para que la vista comparativa pueda encuadrar
            # el <video> exactamente igual que el ASCII.
            "crop": {"x": crop[0], "y": crop[1], "w": crop[2], "h": crop[3]},
            "full": dict(zip(("w", "h"), source_size(path))),
        },
        "palette": ["#%02x%02x%02x" % tuple(int(round(c)) for c in col) for col in centers],
        "frames": frames,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, clip["id"] + suffix + ".json")
    with open(out, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    return out, len(frames), cols, rows, os.path.getsize(out)


def stabilize(held_char, held_pal, new_char, new_pal, colors, centers,
              char_tol, color_tol2):
    """Histéresis temporal: ignora los micro-cambios de celda entre frames.

    El ruido de compresión hace oscilar cada celda un nivel arriba y abajo
    constantemente. Sin filtrar, esas oscilaciones parpadean en pantalla y
    además dominan el delta: casi todas las celdas se marcan como "cambiadas"
    en cada frame. Un carácter sólo cambia si salta más de `char_tol` niveles;
    un color, sólo si el color real de la celda se alejó lo suficiente del que
    ya estamos mostrando (comparar índices de paleta no serviría: son
    etiquetas, no una escala).
    """
    moved = np.abs(new_char.astype(np.int16) - held_char.astype(np.int16)) > char_tol
    drift = ((colors - centers[held_pal]) ** 2).sum(-1) > color_tol2
    visible = (new_char >= 2) & (held_char >= 2)
    change = moved | (drift & visible)

    return np.where(change, new_char, held_char), np.where(change, new_pal, held_pal)


def pick_poster(ink_per_frame):
    """Frame de portada: el más "lleno" del tramo central del clip.

    El primer frame suele ser una pantalla en negro o una app todavía sin
    arrancar, así que como imagen fija de la tarjeta no dice nada.
    """
    n = len(ink_per_frame)
    lo = int(n * 0.15)
    hi = max(lo + 1, int(n * 0.85))
    return int(lo + int(np.argmax(ink_per_frame[lo:hi])))


def dump_text_preview(path, cols, rows, fps, crop, char_lut, sharp, index, out_path):
    """Vuelca el frame de portada como texto plano, para revisarlo a ojo."""
    for i, frame in enumerate(stream_frames(path, cols, rows, fps, crop)):
        if i < index:
            continue
        lum = sharpen(luminance(frame), sharp)
        grid = char_lut[lum.astype(np.uint8)]
        with open(out_path, "w") as fh:
            fh.write("\n".join("".join(RAMP[v] for v in row) for row in grid))
        return


def derive_ramp(font_path="/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", n=64):
    """Regenera RAMP midiendo la tinta real de cada ASCII imprimible.

    No se usa en tiempo de ejecución; queda documentado cómo se obtuvo la rampa
    por si se cambia la tipografía del reproductor.
    """
    from PIL import Image, ImageDraw, ImageFont

    font = ImageFont.truetype(font_path, 64)
    density = {}
    for code in range(32, 127):
        ch = chr(code)
        if ch in '"\\`':          # rompen el JSON o son visualmente ambiguos
            continue
        img = Image.new("L", (40, 74), 0)
        ImageDraw.Draw(img).text((2, 2), ch, font=font, fill=255)
        density[ch] = float(np.asarray(img, dtype=np.float32).mean() / 255.0)

    ordered = sorted(density.items(), key=lambda kv: kv[1])
    targets = np.linspace(ordered[0][1], ordered[-1][1], n)
    chosen, used = [], set()
    for t in targets:
        best = min((c for c, _ in ordered if c not in used),
                   key=lambda c: abs(density[c] - t))
        used.add(best)
        chosen.append(best)
    chosen.sort(key=lambda c: density[c])
    return "".join(chosen)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("ids", nargs="*", help="clips a procesar (por defecto, todos)")
    ap.add_argument("--cols", type=int, default=None,
                    help="fuerza una resolución única en vez de los dos niveles")
    args = ap.parse_args()

    tiers = [{"suffix": "", "cols": args.cols}] if args.cols else TIERS
    total = 0
    for tier in tiers:
        for clip in CLIPS:
            if args.ids and clip["id"] not in args.ids:
                continue
            dump = os.path.join("/tmp", f"preview_{clip['id']}{tier['suffix']}.txt")
            out, n, cols, rows, size = process(
                clip, cols=tier["cols"], suffix=tier["suffix"], dump_preview=dump
            )
            total += size
            label = clip["id"] + tier["suffix"]
            print(f"{label:<14} {cols}x{rows} {n:>5} frames  {size/1024:>8.1f} KB")
    print(f"{'TOTAL':<14} {total/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
