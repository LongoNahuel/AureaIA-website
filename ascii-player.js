/*
 * ascii-player.js — reproduce las animaciones ASCII del portfolio.
 *
 * Cada clip vive en ascii/<id>.json: una grilla de celdas donde el carácter
 * codifica la luminancia y el color el matiz del pixel original. Los frames
 * están delta-comprimidos, así que la reproducción es secuencial y volver
 * atrás implica rebobinar desde el frame 0 (que siempre va completo).
 */
(function () {
  'use strict';

  var CACHE = new Map();

  // Cada celda son dos caracteres base64: nivel de la rampa y entrada de la
  // paleta (6 bits cada uno). El alfabeto no contiene ',' ni ';', que separan
  // los segmentos del delta.
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var B64 = new Int8Array(128).fill(0);
  for (var i = 0; i < 64; i++) B64[ALPHABET.charCodeAt(i)] = i;

  var reducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  function load(id) {
    if (!CACHE.has(id)) {
      CACHE.set(
        id,
        fetch('ascii/' + encodeURIComponent(id) + '.json').then(function (res) {
          if (!res.ok) throw new Error('ascii/' + id + '.json → ' + res.status);
          return res.json().then(function (data) {
            data.url = res.url;
            return data;
          });
        })
      );
    }
    return CACHE.get(id);
  }

  function AsciiClip(canvas, data, options) {
    var opts = options || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.data = data;
    this.cells = new Uint16Array(data.cols * data.rows);   // nivel<<6 | color
    this.cellAspect = data.cellAspect || 0.6;
    this.background = opts.background || '#000';
    this.monochrome = !!opts.monochrome;   // "texto plano": un solo color
    // Un glifo monoespaciado cubre como mucho ~27% de su celda, así que un
    // ASCII de sólo caracteres sobre negro queda ~3x más oscuro que la fuente.
    // Con `tint` pintamos además el color de la celda de fondo y el carácter
    // encima, que recupera el brillo real sin dejar de ser ASCII.
    this.tint = !!opts.tint;
    this.fit = opts.fit || 'cover';
    this.loop = opts.loop !== false;
    // Frame de portada: el clip queda parado ahí cuando no se reproduce.
    this.poster = Math.min(Math.max(data.poster | 0, 0), data.frames.length - 1);
    this.index = -1;
    this.playing = false;
    this.rafId = null;
    this.lastTime = 0;
    this.accumulator = 0;
    this.metrics = null;
    // Franjas sucias por fila: con 520 columnas repintar la grilla entera
    // cuesta ~56 ms, y el delta ya nos dice exactamente qué celdas cambiaron.
    this.dirtyFrom = new Int32Array(data.rows);
    this.dirtyTo = new Int32Array(data.rows);
    this.needsFullRedraw = true;
    this.clearDirty();

    // Paleta en RGB crudo y lienzo de una celda por píxel, para pintar el
    // fondo de un solo drawImage en vez de 91.000 fillRect.
    this.paletteRGB = new Uint8Array(data.palette.length * 3);
    for (var p = 0; p < data.palette.length; p++) {
      var hex = parseInt(data.palette[p].slice(1), 16);
      this.paletteRGB[p * 3] = (hex >> 16) & 255;
      this.paletteRGB[p * 3 + 1] = (hex >> 8) & 255;
      this.paletteRGB[p * 3 + 2] = hex & 255;
    }

    this.tick = this.tick.bind(this);

    var self = this;
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(function () {
        self.metrics = null;
        self.render();
      });
      this.observer.observe(canvas);
    }

    this.seek(this.poster);
    this.render();
  }

  /* --- decodificación ------------------------------------------------- */

  AsciiClip.prototype.clearDirty = function () {
    this.dirtyFrom.fill(this.data.cols);
    this.dirtyTo.fill(-1);
  };

  AsciiClip.prototype.markDirty = function (from, to) {
    var cols = this.data.cols;
    var row = (from / cols) | 0;
    var lastRow = ((to - 1) / cols) | 0;
    for (; row <= lastRow; row++) {
      var a = Math.max(from - row * cols, 0);
      var b = Math.min(to - row * cols, cols);
      if (a < this.dirtyFrom[row]) this.dirtyFrom[row] = a;
      if (b > this.dirtyTo[row]) this.dirtyTo[row] = b;
    }
  };

  AsciiClip.prototype.applyDelta = function (frame) {
    if (!frame) return;
    var cells = this.cells;
    var len = frame.length;
    var pos = 0;
    var i = 0;

    while (i < len) {
      var skip = 0;
      for (var c = frame.charCodeAt(i); i < len && c >= 48 && c <= 57; c = frame.charCodeAt(++i)) {
        skip = skip * 10 + (c - 48);
      }
      i++; // la coma que separa el salto de los datos
      pos += skip;

      var runStart = pos;
      while (i < len) {
        var head = frame.charCodeAt(i);
        if (head === 59) { i++; break; } // ';' cierra el segmento
        cells[pos++] = (B64[head] << 6) | B64[frame.charCodeAt(i + 1)];
        i += 2;
      }
      if (pos > runStart) this.markDirty(runStart, pos);
    }
  };

  AsciiClip.prototype.seek = function (target) {
    if (target < this.index || this.index < 0) {
      this.cells.fill(0);
      this.index = -1;
      this.needsFullRedraw = true;
    }
    while (this.index < target) {
      this.index++;
      this.applyDelta(this.data.frames[this.index]);
    }
  };

  /* --- dibujo ---------------------------------------------------------- */

  AsciiClip.prototype.measure = function () {
    var canvas = this.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var height = Math.max(1, Math.round(canvas.clientHeight * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      this.metrics = null;
    }
    if (this.metrics) return this.metrics;
    this.needsFullRedraw = true;   // cambió la geometría: hay que repintar todo

    var cols = this.data.cols;
    var rows = this.data.rows;
    // La grilla mide cols*cellAspect por rows en unidades de alto de celda.
    var scaleX = width / (cols * this.cellAspect);
    var scaleY = height / rows;
    var cellH = this.fit === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
    var cellW = cellH * this.cellAspect;

    var ctx = this.ctx;
    var font = Math.max(1, cellH).toFixed(2) +
      'px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = font;
    // Todos los glifos de una monoespaciada comparten avance; con él escalamos
    // horizontalmente para que cada columna caiga exactamente en su celda.
    var advance = ctx.measureText('M').width || cellW;

    this.metrics = {
      width: width,
      height: height,
      cellW: cellW,
      cellH: cellH,
      advance: advance,
      scaleX: cellW / advance,
      offsetX: (width - cols * cellW) / 2,
      offsetY: (height - rows * cellH) / 2,
      font: font
    };
    return this.metrics;
  };

  /** Pinta el color de cada celda como fondo, a una celda por píxel. */
  AsciiClip.prototype.drawTint = function (m) {
    var data = this.data;
    var cols = data.cols;
    var rows = data.rows;

    if (!this.tintCanvas) {
      this.tintCanvas = document.createElement('canvas');
      this.tintCanvas.width = cols;
      this.tintCanvas.height = rows;
      this.tintCtx = this.tintCanvas.getContext('2d');
      this.tintImage = this.tintCtx.createImageData(cols, rows);
    }

    var cells = this.cells;
    var pal = this.paletteRGB;
    var px = this.tintImage.data;
    var top = data.ramp.length - 1;

    for (var i = 0, o = 0; i < cells.length; i++, o += 4) {
      var value = cells[i];
      // La rampa se construyó con densidades equiespaciadas, así que el índice
      // ya es la fracción de tinta: sirve directo como brillo del fondo. El
      // carácter se dibuja encima en el mismo color, así que no se pasa.
      var level = (value >> 6) / top;
      var c = (value & 63) * 3;
      px[o] = pal[c] * level;
      px[o + 1] = pal[c + 1] * level;
      px[o + 2] = pal[c + 2] * level;
      px[o + 3] = 255;
    }

    this.tintCtx.putImageData(this.tintImage, 0, 0);

    var ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      this.tintCanvas, 0, 0, cols, rows,
      m.offsetX, m.offsetY, cols * m.cellW, rows * m.cellH
    );
  };

  /** Dibuja las celdas [x0, x1) de una fila. */
  AsciiClip.prototype.drawRow = function (m, y, x0, x1) {
    var ctx = this.ctx;
    var data = this.data;
    var cells = this.cells;
    var ramp = data.ramp;
    var palette = data.palette;
    var base = y * data.cols;
    var py = y * m.cellH;
    var x = x0;

    while (x < x1) {
      var value = cells[base + x];
      if (value >> 6 === 0) { x++; continue; }

      // Agrupamos las celdas contiguas del mismo color en un solo fillText.
      // Los espacios no rompen la tirada: no pintan nada.
      var color = value & 63;
      var start = x;
      var run = '';
      while (x < x1) {
        var cell = cells[base + x];
        var level = cell >> 6;
        if (level === 0) { run += ' '; x++; continue; }
        if ((cell & 63) !== color) break;
        run += ramp[level];
        x++;
      }

      ctx.fillStyle = palette[color];
      ctx.fillText(run, start * m.advance, py);
    }
  };

  AsciiClip.prototype.render = function () {
    if (!this.canvas.isConnected) return;
    var m = this.measure();
    var ctx = this.ctx;
    var rows = this.data.rows;
    var cols = this.data.cols;
    var y;

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Con fondo tintado repintamos entero: el fondo es una sola imagen
    // escalada, así que el repintado parcial no ahorraría nada.
    if (this.needsFullRedraw || this.tint) {
      ctx.fillStyle = this.background;
      ctx.fillRect(0, 0, m.width, m.height);
      if (this.tint) this.drawTint(m);
      ctx.setTransform(m.scaleX, 0, 0, 1, m.offsetX, m.offsetY);
      ctx.font = m.font;
      ctx.textBaseline = 'top';
      for (y = 0; y < rows; y++) this.drawRow(m, y, 0, cols);
      this.needsFullRedraw = false;
      this.clearDirty();
      return;
    }

    ctx.setTransform(m.scaleX, 0, 0, 1, m.offsetX, m.offsetY);
    ctx.font = m.font;
    ctx.textBaseline = 'top';

    for (y = 0; y < rows; y++) {
      if (this.dirtyTo[y] < 0) continue;

      // Un glifo puede desbordar su celda (las colas de 'y', 'j', ','), así que
      // ensanchamos la franja y recortamos el dibujo a la banda de esta fila.
      // Repintamos también la fila de arriba: sus colas caen dentro de la banda.
      var x0 = Math.max(this.dirtyFrom[y] - 1, 0);
      var x1 = Math.min(this.dirtyTo[y] + 1, cols);
      var top = y * m.cellH;
      var left = x0 * m.advance;
      var width = (x1 - x0) * m.advance;

      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, width, m.cellH);
      ctx.clip();
      ctx.fillStyle = this.background;
      ctx.fillRect(left, top, width, m.cellH);
      if (y > 0) this.drawRow(m, y - 1, x0, x1);
      this.drawRow(m, y, x0, x1);
      ctx.restore();
    }

    this.clearDirty();
  };

  /* --- reproducción ---------------------------------------------------- */

  AsciiClip.prototype.tick = function (now) {
    if (!this.playing) return;

    // Si la pestaña estuvo en segundo plano, no intentamos recuperar el
    // tiempo perdido: saltaríamos cientos de frames de golpe.
    var delta = Math.min(now - this.lastTime, 250);
    this.lastTime = now;
    this.accumulator += delta;

    var step = 1000 / this.data.fps;
    var total = this.data.frames.length;
    var moved = false;

    while (this.accumulator >= step) {
      this.accumulator -= step;
      var next = this.index + 1;
      if (next >= total) {
        if (!this.loop) { this.pause(); break; }
        next = 0;
      }
      this.seek(next);
      moved = true;
    }

    if (moved) this.render();
    this.rafId = requestAnimationFrame(this.tick);
  };

  AsciiClip.prototype.play = function () {
    if (this.playing || reducedMotion.matches) return;
    this.playing = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  };

  AsciiClip.prototype.pause = function () {
    this.playing = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  };

  AsciiClip.prototype.seekTo = function (index) {
    var clamped = Math.min(Math.max(index | 0, 0), this.data.frames.length - 1);
    if (clamped === this.index) return false;
    this.seek(clamped);
    this.render();
    return true;
  };

  /** Posiciona el clip en el mismo instante que el video original. */
  AsciiClip.prototype.seekSeconds = function (seconds) {
    return this.seekTo(Math.round(seconds * this.data.fps));
  };

  AsciiClip.prototype.rewind = function () {
    this.pause();
    this.seek(this.poster);
    this.render();
  };

  AsciiClip.prototype.setMonochrome = function (on) {
    this.monochrome = !!on;
    this.needsFullRedraw = true;
    this.render();
  };

  AsciiClip.prototype.setTint = function (on) {
    this.tint = !!on;
    this.needsFullRedraw = true;
    this.render();
  };

  AsciiClip.prototype.destroy = function () {
    this.pause();
    if (this.observer) this.observer.disconnect();
  };

  window.AsciiPlayer = {
    load: load,
    reducedMotion: reducedMotion,
    create: function (canvas, data, options) {
      return new AsciiClip(canvas, data, options);
    },
    attach: function (canvas, id, options) {
      return load(id).then(function (data) {
        return new AsciiClip(canvas, data, options);
      });
    }
  };
})();
