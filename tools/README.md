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
| Detalle | `ascii/<id>.hi.json` | 520 | al abrir el lightbox |

Peso total transferido (gzip): ~0,70 MB el nivel tarjeta para los cinco clips,
y entre 0,37 y 2,07 MB el de detalle, de a un clip por vez. Los MP4 originales
suman 129 MB y siguen disponibles desde el modo *Video*.

El nivel de detalle son 520×176 caracteres, unos 91.500 por frame.

## Regenerar los clips

```bash
pip install numpy imageio-ffmpeg
python3 tools/video_to_ascii.py             # los dos niveles, todos los clips
python3 tools/video_to_ascii.py manos       # sólo un clip
python3 tools/video_to_ascii.py --cols 200  # resolución única, para probar
```

Requiere `ffmpeg` en el PATH (o `FFMPEG_BIN` apuntando al binario;
`imageio-ffmpeg` trae uno estático).

## Qué tan fiel es (medido)

Contra el frame original, a escala de celda —el ancho de banda que el medio
puede representar— con la configuración que se publica:

| clip | Pearson | Spearman | color acertado | cobertura |
|---|---|---|---|---|
| robo | 0.954 | 0.829 | 99.4% | 99.8% |
| chatbot | 0.843 | 0.786 | 99.4% | 92.0% |
| celulares | 0.982 | 0.942 | 99.7% | 97.7% |
| manos | 0.970 | 0.917 | 99.3% | 93.7% |
| mirada | 0.977 | 0.901 | 98.7% | 84.2% |
| **media** | **0.945** | **0.875** | **99.3%** | **93.5%** |

Tres cosas que salieron de medir y conviene no volver a probar a ciegas:

1. **SSIM a escala de píxel no sirve acá.** Contra un gris plano da 0.583 sobre
   este contenido, y el ASCII crudo da 0.039: la textura del glifo no
   correlaciona localmente con la del video, por construcción. La comparación
   honesta es a escala de celda.
2. **Elegir el glifo por su forma es peor que elegirlo por su brillo.** Probado
   con submuestreo 3×5 por celda y emparejado por mínimos cuadrados, con
   selección de glifos por diversidad de forma (0.250 vs 0.411) y con el mismo
   alfabeto de densidad (0.296 vs 0.532). En capturas de pantalla, llenas de
   zonas planas, el brillo pesa mucho más que el borde.
3. **La resolución satura cerca de 640 columnas** y a 780 empeora: por debajo de
   ~2 px por celda el glifo ya no puede representar su propia densidad.

## Fondo tintado

Un glifo monoespaciado cubre como mucho **~27% de su celda** con tinta, así que
un ASCII de sólo caracteres sobre negro queda unas 3 veces más oscuro que la
fuente (medido en `robo`: 27.1 frente a 87.6 de brillo medio). No es un defecto
del codificador, es el techo del medio.

El reproductor puede pintar además el color de cada celda de fondo, con el
carácter encima: el brillo sube a 59.0 y la reconstrucción se vuelve mucho más
reconocible, sin dejar de estar hecha de caracteres. Va activado por defecto y
se puede desactivar desde el lightbox.

Se dibuja como un lienzo de una celda por píxel escalado de un solo
`drawImage`, no con 91.500 `fillRect`.

## Cómo se construye cada clip

1. **Recorte automático** — se descartan las bandas negras mirando el máximo
   temporal de cada píxel. El recorte queda guardado en el JSON: la vista
   comparativa lo aplica al `<video>` por CSS para que los dos paneles muestren
   el mismo encuadre al mismo tamaño.
2. **Muestreo** — `ffmpeg` promedia el video a una grilla de `cols × rows`
   celdas. Las filas se derivan del aspecto del recorte y de `CELL_ASPECT`
   (0.6), la proporción ancho/alto de un carácter monoespaciado.
3. **Carácter por luminancia** — 64 niveles. `--calibrate` elige por clip la
   curva que mejor reproduce el brillo real de sus celdas. El objetivo no puede
   ser sólo la correlación: como la fuente es mayormente oscura, una curva que
   hunda los grises puntúa alto simplemente apagando la pantalla (el óptimo sin
   restricción vaciaba el 43% de las celdas). Por eso se exige además
   `MIN_COVERAGE`: que el ASCII siga pintando algo donde el video tiene
   contenido. La rampa no está copiada de
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
6. **Color contiguo** — una celda reutiliza el color de su vecina izquierda
   cuando la diferencia con su color real es imperceptible (`COLOR_RUN_TOL`).
   El reproductor dibuja de un saque las tiradas del mismo color, así que
   alargarlas baja el coste de pintado; `fillText` se llevaba el 87% del tiempo
   de frame.
7. **Delta + RLE** — cada frame guarda sólo los tramos que cambiaron respecto al
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

El repintado es parcial: el delta ya dice qué celdas cambiaron, así que sólo se
repinta esa franja de cada fila (más la fila de arriba, cuyas colas de glifo
caen dentro). Medido en el peor caso, 56 ms por frame pasaron a 32.

En el modo *Comparar* manda el video: cada cuadro de animación el clip se
reposiciona con `seekSeconds(video.currentTime)`, de modo que ambos paneles
muestran siempre el mismo instante.
