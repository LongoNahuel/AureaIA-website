#!/usr/bin/env python3
"""
video_to_ascii.py — convierte los videos del portfolio a animaciones ASCII a color.

Muestrea cada video a una grilla de celdas de caracteres, elige el carácter por
luminancia y el color por el tono promedio de la celda, y empaqueta la secuencia
como JSON delta-comprimido que reproduce ascii-player.js en el navegador.

Uso:
    python3 tools/video_to_ascii.py                # procesa todos los clips
    python3 tools/video_to_ascii.py manos          # procesa uno solo
"""

import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_DIR = os.path.join(ROOT, "videos")
OUT_DIR = os.path.join(ROOT, "ascii")

FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")

# 16 niveles de densidad, de vacío a sólido.
RAMP = " .`,:;i1tfLCG08@"
PALETTE_SIZE = 16

# Curva tonal por defecto. Los clips son capturas de pantalla con tema oscuro:
# casi toda la luminancia se apelotona entre 18 y 65, así que una rampa lineal
# deja todo en un gris plano. Mezclamos ecualización de histograma (recupera el
# detalle del texto) con una rampa lineal (mantiene el fondo negro).
EQ_MIX = 0.7      # peso de la ecualización frente a la rampa lineal
GAMMA = 1.45      # >1 hunde los grises bajos para que el fondo quede vacío
SHARPEN = 1.0     # realce local: devuelve nitidez al texto tras el submuestreo
SATURATION = 1.6

# Relación ancho/alto de una celda de texto monoespaciado. El reproductor usa
# la misma constante para que la grilla conserve el aspecto del video.
CELL_ASPECT = 0.6

CLIPS = [
    {"id": "robo", "file": "Analítica de robo_urto.mp4.mp4", "cols": 132, "fps": 12},
    {"id": "chatbot", "file": "ChatBot.mp4.mp4", "cols": 132, "fps": 10},
    {"id": "celulares", "file": "Detección de celulares.mp4.mp4", "cols": 132, "fps": 12},
    {"id": "manos", "file": "Detección de manos.mp4.mp4", "cols": 132, "fps": 15},
    {"id": "mirada", "file": "Detección de mirada.mp4.mp4", "cols": 132, "fps": 12},
]


def source_size(path):
    out = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", path], stderr=subprocess.PIPE
    ).stderr.decode("utf-8", "replace")
    for token in out.split():
        if "x" in token and token.rstrip(",").replace("x", "").isdigit():
            w, _, h = token.rstrip(",").partition("x")
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


def decode_frames(path, cols, rows, fps, crop=None):
    """Devuelve un array (n_frames, rows, cols, 3) uint8 promediando por celda."""
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
    raw = subprocess.run(cmd, stdout=subprocess.PIPE, check=True).stdout
    stride = cols * rows * 3
    n = len(raw) // stride
    return np.frombuffer(raw[: n * stride], dtype=np.uint8).reshape(n, rows, cols, 3)


def luminance(frames):
    f = frames.astype(np.float32)
    return 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]


def sharpen(lum, amount):
    """Máscara de enfoque 3x3 sobre la grilla de celdas."""
    if not amount:
        return lum
    p = np.pad(lum, ((0, 0), (1, 1), (1, 1)), mode="edge")
    blur = (
        p[:, :-2, :-2] + p[:, :-2, 1:-1] + p[:, :-2, 2:]
        + p[:, 1:-1, :-2] + p[:, 1:-1, 1:-1] + p[:, 1:-1, 2:]
        + p[:, 2:, :-2] + p[:, 2:, 1:-1] + p[:, 2:, 2:]
    ) / 9.0
    return np.clip(lum + amount * (lum - blur), 0.0, 255.0)


def char_indices(lum, eq_mix=EQ_MIX, gamma=GAMMA, sharp=SHARPEN):
    """Luminancia -> índice en RAMP."""
    lum = sharpen(lum, sharp)
    sample = lum[:: max(1, len(lum) // 40)]

    lo, hi = np.percentile(sample, 2.0), np.percentile(sample, 99.5)
    if hi - lo < 8:
        lo, hi = 0.0, 255.0
    linear = np.clip((lum - lo) / (hi - lo), 0.0, 1.0)

    # CDF exclusiva (fracción de celdas estrictamente más oscuras). Con la CDF
    # inclusiva el negro puro heredaría el peso de todo su bin y el fondo se
    # llenaría de caracteres; así el nivel más oscuro siempre cae en el espacio.
    hist, _ = np.histogram(sample, bins=256, range=(0, 256))
    cdf = (np.cumsum(hist) - hist).astype(np.float32)
    cdf /= max(cdf[-1], 1.0)
    equalized = np.clip(cdf[np.clip(lum, 0, 255).astype(np.int32)], 0.0, 1.0)

    norm = np.clip(eq_mix * equalized + (1.0 - eq_mix) * linear, 0.0, 1.0) ** gamma
    return np.rint(norm * (len(RAMP) - 1)).astype(np.uint8)


def normalized_colors(frames, saturation=SATURATION):
    """Matiz de cada celda con el brillo neutralizado.

    El brillo ya lo aporta el carácter, así que el color sólo guarda el tono.
    Saturamos un poco para que los acentos de la UI (azul, verde, rojo de las
    alertas) se distingan del gris, y forzamos a gris claro las celdas casi
    negras, donde normalizar sólo amplificaría ruido de compresión.
    """
    f = frames.astype(np.float32)
    mx = f.max(axis=-1, keepdims=True)
    grey = f.mean(axis=-1, keepdims=True)
    f = grey + (f - grey) * saturation
    peak = np.maximum(f.max(axis=-1, keepdims=True), 1e-6)
    scaled = np.where(mx > 10, f * (245.0 / peak), 235.0)
    return np.clip(scaled, 0, 255)


def build_palette(colors, lum, k=PALETTE_SIZE, iters=12, seed=7):
    """k-means sobre los colores normalizados, ponderando las celdas visibles."""
    flat = colors.reshape(-1, 3)
    weights = lum.reshape(-1)
    # Sólo entrenamos con celdas que se van a ver.
    visible = flat[weights > 18]
    if len(visible) < k:
        visible = flat
    rng = np.random.default_rng(seed)
    sample = visible[rng.choice(len(visible), size=min(60000, len(visible)), replace=False)]

    centers = sample[rng.choice(len(sample), size=k, replace=False)].astype(np.float32)
    for _ in range(iters):
        d = ((sample[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for i in range(k):
            m = lab == i
            if m.any():
                centers[i] = sample[m].mean(0)
            else:
                centers[i] = sample[rng.integers(len(sample))]
    return np.clip(centers, 0, 255)


def quantize(colors, centers):
    flat = colors.reshape(-1, 3)
    out = np.empty(len(flat), dtype=np.uint8)
    step = 400_000
    for i in range(0, len(flat), step):
        chunk = flat[i : i + step]
        d = ((chunk[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        out[i : i + step] = d.argmin(1).astype(np.uint8)
    return out.reshape(colors.shape[:-1])


def stabilize(chars, colors, char_tol=1, min_visible=2):
    """Histéresis temporal: ignora los micro-cambios de celda entre frames.

    El ruido de compresión hace oscilar cada celda un nivel arriba y abajo
    constantemente. Sin filtrar, esas oscilaciones parpadean en pantalla y
    además dominan el delta: casi todas las celdas se marcan como "cambiadas"
    en cada frame. Sólo aceptamos un cambio de carácter si salta más de
    `char_tol` niveles, y uno de color si la celda es visible en ambos estados.
    """
    out_c = np.empty_like(chars)
    out_p = np.empty_like(colors)
    cur_c, cur_p = chars[0].copy(), colors[0].copy()
    out_c[0], out_p[0] = cur_c, cur_p

    for i in range(1, len(chars)):
        nc, npx = chars[i], colors[i]
        moved = np.abs(nc.astype(np.int16) - cur_c.astype(np.int16)) > char_tol
        recolored = (npx != cur_p) & (nc >= min_visible) & (cur_c >= min_visible)
        change = moved | recolored
        cur_c = np.where(change, nc, cur_c)
        cur_p = np.where(change, npx, cur_p)
        out_c[i], out_p[i] = cur_c, cur_p

    return out_c, out_p


HEX = "0123456789abcdef"


def encode_delta(cells):
    """cells: (n, rows*cols) uint8 con charIdx<<4 | colorIdx.

    Cada frame es "salto,datos;salto,datos;..." donde datos son pares hex.
    El primero se emite completo.
    """
    lut = [HEX[v >> 4] + HEX[v & 15] for v in range(256)]
    frames = []
    prev = None
    for cur in cells:
        if prev is None:
            frames.append("0," + "".join(lut[v] for v in cur))
            prev = cur
            continue

        diff = np.flatnonzero(cur != prev)
        if len(diff) == 0:
            frames.append("")
            prev = cur
            continue

        # Agrupamos posiciones contiguas (tolerando huecos de 1-2 celdas, que
        # salen más baratos que abrir un segmento nuevo).
        breaks = np.flatnonzero(np.diff(diff) > 3)
        starts = np.concatenate(([0], breaks + 1))
        ends = np.concatenate((breaks + 1, [len(diff)]))

        parts = []
        cursor = 0
        for s, e in zip(starts, ends):
            a, b = int(diff[s]), int(diff[e - 1]) + 1
            parts.append(f"{a - cursor}," + "".join(lut[v] for v in cur[a:b]))
            cursor = b
        frames.append(";".join(parts))
        prev = cur
    return frames


def pick_poster(cells):
    """Frame de portada: el más "lleno" del tramo central del clip.

    El primer frame suele ser una pantalla en negro o una app todavía sin
    arrancar, así que como imagen fija de la tarjeta no dice nada.
    """
    lo = int(len(cells) * 0.15)
    hi = max(lo + 1, int(len(cells) * 0.85))
    ink = (cells[lo:hi] >> 4).mean(axis=1)
    return int(lo + ink.argmax())


def preview(cells, cols, rows, index=0):
    """Vuelca un frame como texto plano para revisar la calidad a ojo."""
    grid = cells[index].reshape(rows, cols)
    return "\n".join("".join(RAMP[v >> 4] for v in row) for row in grid)


def process(clip, dump_preview=None):
    path = os.path.join(VIDEO_DIR, clip["file"])
    cols, fps = clip["cols"], clip["fps"]

    crop = detect_crop(path)
    # Las filas salen del aspecto del recorte, para no deformar la imagen.
    rows = max(2, int(round(cols * CELL_ASPECT * crop[3] / crop[2])))

    frames = decode_frames(path, cols, rows, fps, crop=crop)
    lum = luminance(frames)
    chars = char_indices(
        lum,
        eq_mix=clip.get("eq_mix", EQ_MIX),
        gamma=clip.get("gamma", GAMMA),
        sharp=clip.get("sharpen", SHARPEN),
    )
    colors = normalized_colors(frames)
    centers = build_palette(colors, lum)
    cidx = quantize(colors, centers)

    chars = chars.reshape(len(frames), rows * cols)
    cidx = cidx.reshape(len(frames), rows * cols)
    chars, cidx = stabilize(chars, cidx)
    cells = ((chars.astype(np.uint16) << 4) | cidx).astype(np.uint8)

    if dump_preview:
        with open(dump_preview, "w") as fh:
            fh.write(preview(cells, cols, rows, index=pick_poster(cells)))

    data = {
        "id": clip["id"],
        "cols": cols,
        "rows": rows,
        "fps": fps,
        "cellAspect": CELL_ASPECT,
        "poster": pick_poster(cells),
        "ramp": RAMP,
        "palette": ["#%02x%02x%02x" % tuple(int(round(c)) for c in col) for col in centers],
        "frames": encode_delta(cells),
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, clip["id"] + ".json")
    with open(out, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    return out, len(frames), os.path.getsize(out)


def main():
    wanted = sys.argv[1:]
    for clip in CLIPS:
        if wanted and clip["id"] not in wanted:
            continue
        dump = os.path.join("/tmp", f"preview_{clip['id']}.txt")
        out, n, size = process(clip, dump_preview=dump)
        print(f"{clip['id']:<10} {n:>5} frames  {size/1024:>8.1f} KB  -> {out}")


if __name__ == "__main__":
    main()
