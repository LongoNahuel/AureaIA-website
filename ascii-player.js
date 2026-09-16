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
  var HEX = new Int8Array(128).fill(-1);
  for (var i = 0; i < 16; i++) HEX['0123456789abcdef'.charCodeAt(i)] = i;

  var reducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  function load(id) {
    if (!CACHE.has(id)) {
      CACHE.set(
        id,
        fetch('ascii/' + encodeURIComponent(id) + '.json').then(function (res) {
          if (!res.ok) throw new Error('ascii/' + id + '.json → ' + res.status);
          return res.json();
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
    this.cells = new Uint8Array(data.cols * data.rows);
    this.cellAspect = data.cellAspect || 0.6;
    this.background = opts.background || '#000';
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

      while (i < len) {
        var hi = frame.charCodeAt(i);
        if (hi === 59) { i++; break; } // ';' cierra el segmento
        cells[pos++] = (HEX[hi] << 4) | HEX[frame.charCodeAt(i + 1)];
        i += 2;
      }
    }
  };

  AsciiClip.prototype.seek = function (target) {
    if (target < this.index || this.index < 0) {
      this.cells.fill(0);
      this.index = -1;
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

  AsciiClip.prototype.render = function () {
    if (!this.canvas.isConnected) return;
    var m = this.measure();
    var ctx = this.ctx;
    var data = this.data;
    var cells = this.cells;
    var ramp = data.ramp;
    var palette = data.palette;
    var cols = data.cols;
    var rows = data.rows;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, m.width, m.height);

    ctx.setTransform(m.scaleX, 0, 0, 1, m.offsetX, m.offsetY);
    ctx.font = m.font;
    ctx.textBaseline = 'top';

    for (var y = 0; y < rows; y++) {
      var base = y * cols;
      var py = y * m.cellH;
      var x = 0;

      while (x < cols) {
        var value = cells[base + x];
        if (value >> 4 === 0) { x++; continue; }

        // Agrupamos las celdas contiguas del mismo color en un solo fillText.
        // Los espacios no rompen la tirada: no pintan nada.
        var color = value & 15;
        var start = x;
        var run = '';
        while (x < cols) {
          var cell = cells[base + x];
          var level = cell >> 4;
          if (level === 0) { run += ' '; x++; continue; }
          if ((cell & 15) !== color) break;
          run += ramp[level];
          x++;
        }

        ctx.fillStyle = palette[color];
        ctx.fillText(run, start * m.advance, py);
      }
    }
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

  AsciiClip.prototype.rewind = function () {
    this.pause();
    this.seek(this.poster);
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
