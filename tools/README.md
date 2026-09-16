# Pipeline ASCII del portfolio

Las tarjetas de *Casos de Éxito* ya no reproducen los MP4: reproducen una
transcripción a ASCII de esos mismos videos, frame a frame, dibujada en un
`<canvas>`. Los MP4 siguen en `videos/` y se pueden ver desde el conmutador
"Video original" del lightbox.

| | MP4 | ASCII |
|---|---|---|
| Peso total | 129 MB | ~670 KB (gzip) |

## Regenerar los clips

```bash
pip install numpy imageio-ffmpeg
python3 tools/video_to_ascii.py            # todos
python3 tools/video_to_ascii.py manos      # sólo uno
```

Escribe `ascii/<id>.json`. Requiere `ffmpeg` en el PATH (o `FFMPEG_BIN`
apuntando al binario; `imageio-ffmpeg` trae uno estático).

## Cómo se construye cada clip

1. **Recorte automático** — se descartan las bandas negras mirando el máximo
   temporal de cada píxel, y de ahí sale el aspecto real del contenido.
2. **Muestreo** — `ffmpeg` promedia el video a una grilla de `cols × rows`
   celdas. Las filas se derivan del aspecto del recorte y de `CELL_ASPECT`
   (0.6), la proporción ancho/alto de un carácter monoespaciado, para que la
   imagen no se deforme.
3. **Carácter por luminancia** — los clips son capturas de pantalla con tema
   oscuro: casi toda la luminancia se apelotona entre 18 y 65, así que una
   rampa lineal deja todo en un gris plano. Se mezcla ecualización de
   histograma (recupera el texto) con rampa lineal (mantiene el fondo negro),
   más un realce local que devuelve nitidez tras el submuestreo.
4. **Color por matiz** — el brillo ya lo aporta el carácter, así que el color
   guarda sólo el tono, saturado para que los acentos de la UI se distingan.
   Se cuantiza a una paleta de 16 entradas por clip (k-means).
5. **Histéresis temporal** — una celda sólo cambia si se mueve más de un nivel.
   Sin esto, el ruido de compresión hace parpadear la imagen y además dispara
   el peso del delta.
6. **Delta + RLE** — cada frame guarda sólo los tramos que cambiaron respecto
   al anterior, como `salto,pares-hex;salto,pares-hex;…`. El frame 0 va
   completo. Cada celda son 2 dígitos hex: `carácter<<4 | color`.

## Ajustes

Las constantes de la curva tonal (`EQ_MIX`, `GAMMA`, `SHARPEN`, `SATURATION`)
están arriba del script, y cada entrada de `CLIPS` puede sobrescribir `eq_mix`,
`gamma` y `sharpen`, además de fijar `cols` y `fps`.

Para revisar un cambio a ojo, el script vuelca el frame de portada como texto
plano en `/tmp/preview_<id>.txt`.

## Reproducción

`ascii-player.js` expone `AsciiPlayer.attach(canvas, id, opts)`. Los deltas son
secuenciales, así que retroceder implica rebobinar desde el frame 0; a ~3 ms por
frame y 8 ms de montaje incluso para el clip de 1515 frames, no se nota.
