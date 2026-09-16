# Pipeline ASCII del portfolio

Las tarjetas de *Casos de Éxito* ya no reproducen los MP4: reproducen una
transcripción a ASCII de esos mismos videos, frame a frame, dibujada en un
`<canvas>`. El lightbox ofrece tres representaciones: **ASCII**, **Comparar**
(video original y ASCII lado a lado, sincronizados) y **Video**.

## Dos niveles de detalle

Una tarjeta del portfolio mide ~470 px de ancho. A 260 columnas cada carácter
caería en 1,8 px: sólo se pagaría peso sin ganar nitidez. Por eso cada clip se
genera dos veces.

| Nivel | Archivo | Columnas | Se descarga |
|---|---|---|---|
| Tarjeta | `ascii/<id>.json` | 132 | al entrar la tarjeta en pantalla |
| Detalle | `ascii/<id>.hi.json` | 260 | al abrir el lightbox |

Peso total transferido (gzip): ~850 KB el nivel tarjeta para los cinco clips,
y entre 196 KB y 1,4 MB el de detalle, de a un clip por vez. Los MP4 originales
suman 129 MB y siguen disponibles desde el modo *Video*.

## Regenerar los clips

```bash
pip install numpy imageio-ffmpeg
python3 tools/video_to_ascii.py             # los dos niveles, todos los clips
python3 tools/video_to_ascii.py manos       # sólo un clip
python3 tools/video_to_ascii.py --cols 200  # resolución única, para probar
```

Requiere `ffmpeg` en el PATH (o `FFMPEG_BIN` apuntando al binario;
`imageio-ffmpeg` trae uno estático).

## Cómo se construye cada clip

1. **Recorte automático** — se descartan las bandas negras mirando el máximo
   temporal de cada píxel. El recorte queda guardado en el JSON: la vista
   comparativa lo aplica al `<video>` por CSS para que los dos paneles muestren
   el mismo encuadre al mismo tamaño.
2. **Muestreo** — `ffmpeg` promedia el video a una grilla de `cols × rows`
   celdas. Las filas se derivan del aspecto del recorte y de `CELL_ASPECT`
   (0.6), la proporción ancho/alto de un carácter monoespaciado.
3. **Carácter por luminancia** — 64 niveles. La rampa no está copiada de
   ninguna tabla: sale de medir la cobertura de tinta real de cada ASCII
   imprimible en la tipografía del reproductor y quedarse con 64 densidades
   equiespaciadas (`derive_ramp()`). Los clips son capturas de pantalla con
   tema oscuro, con casi toda la luminancia entre 18 y 65, así que una rampa
   lineal deja todo en un gris plano: se mezcla ecualización de histograma
   (recupera el texto) con rampa lineal (mantiene el fondo negro), más un
   realce local que devuelve nitidez tras el submuestreo. La CDF es
   *exclusiva*, si no el negro puro se llenaría de caracteres.
4. **Color por matiz** — 64 entradas por clip (k-means). El brillo ya lo aporta
   el carácter, así que el color guarda sólo el tono, saturado para que los
   acentos de la UI se distingan del gris.
5. **Histéresis temporal** — una celda sólo cambia si el carácter salta más de
   `CHAR_TOL` niveles, o si su color real se alejó de `COLOR_TOL` del que ya se
   está mostrando. Sin esto, el ruido de compresión hace parpadear la imagen y
   dispara el peso del delta.
6. **Delta + RLE** — cada frame guarda sólo los tramos que cambiaron respecto al
   anterior, como `salto,celdas;salto,celdas;…`. El frame 0 va completo. Cada
   celda son dos caracteres base64: nivel de la rampa y entrada de la paleta
   (6 bits cada uno). El alfabeto no contiene `,` ni `;`.

El procesado es en streaming (una pasada de estadísticas a 2 fps y otra de
codificación), así que la memoria no depende ni de la duración ni de la
resolución del clip.

## Ajustes

`EQ_MIX`, `GAMMA`, `SHARPEN`, `SATURATION`, `CHAR_TOL` y `COLOR_TOL` están
arriba del script; cada entrada de `CLIPS` puede sobrescribir `eq_mix`, `gamma`,
`sharpen`, `char_tol` y `color_tol`, además de fijar `fps`. Las resoluciones
salen de `TIERS`.

Para revisar un cambio a ojo, el script vuelca el frame de portada como texto
plano en `/tmp/preview_<id>[.hi].txt`.

## Reproducción

`ascii-player.js` expone `AsciiPlayer.attach(canvas, id, opts)` con
`fit` (`cover` | `contain`), `monochrome` y `loop`. Los deltas son secuenciales,
así que retroceder implica rebobinar desde el frame 0.

En el modo *Comparar* manda el video: cada cuadro de animación el clip se
reposiciona con `seekSeconds(video.currentTime)`, de modo que ambos paneles
muestran siempre el mismo instante.
