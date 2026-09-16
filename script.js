// Loading screen + hero code trigger + particles
window.addEventListener('load', () => {
  const loading = document.getElementById('loading-screen');
  setTimeout(() => {
    loading.classList.add('hidden');
    setTimeout(() => loading.style.display = 'none', 500);
  }, 400);

  if (typeof particlesJS !== 'undefined') initParticles();

  const heroCode = document.getElementById('hero-code');
  if (heroCode) {
    setTimeout(() => {
      heroCode.classList.add('visible');
      typeHeroCode();
    }, 700);
  }
});

function initParticles() {
  particlesJS('particles-js', {
    particles: {
      number: { value: 160, density: { enable: true, value_area: 800 } },
      color: { value: ['#0066FF', '#00CCFF', '#00B8FF'] },
      shape: { type: 'circle' },
      opacity: { value: 0.55, random: true, anim: { enable: true, speed: 0.8, opacity_min: 0.15, sync: false } },
      size: { value: 2.5, random: true, anim: { enable: false } },
      line_linked: { enable: true, distance: 160, color: '#00CCFF', opacity: 0.3, width: 1 },
      move: { enable: true, speed: 1.5, direction: 'none', random: true, straight: false, out_mode: 'out', bounce: false }
    },
    interactivity: {
      detect_on: 'canvas',
      events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' }, resize: true },
      modes: { grab: { distance: 180, line_linked: { opacity: 0.6 } }, push: { particles_nb: 3 } }
    },
    retina_detect: true
  });
}

// Hero code typing animation
function typeHeroCode() {
  const codeText = document.getElementById('code-text');
  const heroCursor = document.getElementById('hero-cursor');
  if (!codeText || !heroCursor) return;

  const lines = [
    { text: '# AureaIA — Inteligencia Artificial', type: 'comment' },
    { text: '\n\n', type: 'normal' },
    { text: 'def ', type: 'keyword' },
    { text: 'crear_soluciones', type: 'function' },
    { text: '():\n', type: 'normal' },
    { text: '    """', type: 'string' },
    { text: '\n    Unimos ciencia de datos con desarrollo', type: 'string' },
    { text: '\n    para crear soluciones que escalan.', type: 'string' },
    { text: '\n    """', type: 'string' },
    { text: '\n    ', type: 'normal' },
    { text: 'return ', type: 'keyword' },
    { text: 'innovación', type: 'function' },
    { text: '()\n\n', type: 'normal' },
    { text: 'print', type: 'builtin' },
    { text: '(', type: 'normal' },
    { text: '"Contáctanos!"', type: 'link' },
    { text: ')  ', type: 'normal' },
    { text: '←', type: 'arrow' },
  ];

  const colorMap = {
    comment: 'code-comment', keyword: 'code-keyword', function: 'code-function',
    string: 'code-string', builtin: 'code-builtin', link: 'code-link',
    arrow: 'code-arrow', normal: '',
  };

  function escHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  let li = 0, ci = 0;

  function render() {
    let html = '';
    for (let i = 0; i <= li; i++) {
      const l = lines[i];
      const txt = i === li ? l.text.substring(0, ci) : l.text;
      const cls = colorMap[l.type];
      html += cls ? `<span class="${cls}">${escHtml(txt)}</span>` : escHtml(txt);
    }
    codeText.innerHTML = html;
  }

  function type() {
    if (li >= lines.length) {
      heroCursor.style.display = 'none';
      const link = codeText.querySelector('.code-link');
      if (link) {
        link.addEventListener('click', () => {
          document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' });
        });
      }
      return;
    }
    const cur = lines[li];
    if (ci < cur.text.length) {
      render();
      ci++;
      const ch = cur.text[ci - 1];
      const delay = ch === '\n' ? 60 : 10 + Math.random() * 18;
      setTimeout(type, delay);
    } else {
      li++; ci = 0;
      setTimeout(type, 35);
    }
  }

  type();
}

// Navbar scroll state
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

// Hamburger menu
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('nav-menu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  navMenu.classList.toggle('active');
});

navMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
  });
});

document.addEventListener('click', (e) => {
  if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
  }
});

// Active nav link on scroll
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-menu a');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    if (window.scrollY >= section.offsetTop - 200) {
      current = section.getAttribute('id');
    }
  });
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
  });
}, { passive: true });

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// Reveal on scroll — Motion One (ESM dynamic import)
(async function initReveal() {
  let animate, inView;

  try {
    const m = await import('https://cdn.jsdelivr.net/npm/motion@11/+esm');
    animate = m.animate;
    inView = m.inView;
  } catch (_) {}

  if (!animate || !inView) {
    // CSS class fallback
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    return;
  }

  // Section headers
  document.querySelectorAll('.section-header.reveal').forEach(el => {
    inView(el, () => {
      animate(el, { opacity: [0, 1], y: [24, 0] }, { duration: 0.6, easing: [0.25, 1, 0.5, 1] });
    }, { amount: 0.2 });
  });

  // Service cards — stagger
  const serviceGrid = document.querySelector('.services-grid');
  if (serviceGrid) {
    inView(serviceGrid, () => {
      serviceGrid.querySelectorAll('.service-card.reveal').forEach((card, i) => {
        animate(card, { opacity: [0, 1], y: [28, 0] }, { duration: 0.5, delay: i * 0.07, easing: [0.25, 1, 0.5, 1] });
      });
    }, { amount: 0.1 });
  }

  // Portfolio cards — stagger
  const portfolioGrid = document.querySelector('.portfolio-grid');
  if (portfolioGrid) {
    inView(portfolioGrid, () => {
      portfolioGrid.querySelectorAll('.portfolio-card.reveal').forEach((card, i) => {
        animate(card, { opacity: [0, 1], y: [32, 0] }, { duration: 0.55, delay: i * 0.08, easing: [0.25, 1, 0.5, 1] });
      });
    }, { amount: 0.08 });
  }

  // Contact columns
  document.querySelectorAll('.contact-wrapper .reveal').forEach((el, i) => {
    inView(el, () => {
      animate(el, { opacity: [0, 1], y: [24, 0] }, { duration: 0.6, delay: i * 0.12, easing: [0.25, 1, 0.5, 1] });
    }, { amount: 0.15 });
  });
})();

// Portfolio — animaciones ASCII (reemplazan a los MP4 originales)
const isTouchDevice = window.matchMedia('(hover: none)').matches;

// canvas -> Promise<AsciiClip | null>. El JSON queda cacheado por id dentro del
// reproductor, así que la copia del lightbox no vuelve a descargar nada.
const asciiMounts = new Map();

function mountAscii(canvas, options) {
  if (!asciiMounts.has(canvas)) {
    const wrap = canvas.closest('.portfolio-video, .stage-pane-ascii');
    wrap?.classList.add('ascii-loading');

    asciiMounts.set(
      canvas,
      AsciiPlayer.attach(canvas, canvas.dataset.ascii, options)
        .then(clip => {
          wrap?.classList.remove('ascii-loading');
          wrap?.classList.add('ascii-ready');
          return clip;
        })
        .catch(err => {
          console.warn('[ascii] no pude cargar', canvas.dataset.ascii, err);
          wrap?.classList.remove('ascii-loading');
          wrap?.classList.add('ascii-error');
          return null;
        })
    );
  }
  return asciiMounts.get(canvas);
}

function withAscii(canvas, fn) {
  if (!canvas) return;
  mountAscii(canvas, { fit: 'cover' }).then(clip => clip && fn(clip));
}

document.querySelectorAll('.portfolio-card .ascii-canvas').forEach(canvas => {
  const card = canvas.closest('.portfolio-card');

  // Descargamos el clip recién cuando la tarjeta se acerca al viewport y
  // dejamos pintado el primer frame como póster.
  const preload = new IntersectionObserver((entries, obs) => {
    if (entries.some(e => e.isIntersecting)) {
      mountAscii(canvas, { fit: 'cover' });
      obs.disconnect();
    }
  }, { rootMargin: '300px' });
  preload.observe(card);

  if (isTouchDevice) {
    // En táctil no hay hover: animamos la tarjeta que esté a la vista.
    const playback = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        withAscii(canvas, clip => (entry.isIntersecting ? clip.play() : clip.rewind()));
      });
    }, { threshold: 0.5 });
    playback.observe(card);
  } else {
    card.addEventListener('mouseenter', () => withAscii(canvas, clip => clip.play()));
    card.addEventListener('mouseleave', () => withAscii(canvas, clip => clip.rewind()));
  }
});

// Contact form → WhatsApp
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const nombre = contactForm.querySelector('[name="nombre"]').value.trim();
    const email = contactForm.querySelector('[name="email"]').value.trim();
    const telefono = contactForm.querySelector('[name="telefono"]').value.trim();
    const mensaje = contactForm.querySelector('[name="mensaje"]').value.trim();

    if (!nombre || !email || !mensaje) {
      alert('Por favor completá los campos obligatorios.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Por favor ingresá un email válido.');
      return;
    }

    let msg = `*Nuevo contacto desde AureaIA*\n\n`;
    msg += `*Nombre:* ${nombre}\n`;
    msg += `*Email:* ${email}\n`;
    if (telefono) msg += `*Teléfono:* ${telefono}\n`;
    msg += `\n*Mensaje:*\n${mensaje}`;

    window.open(`https://wa.me/5491139481921?text=${encodeURIComponent(msg)}`, '_blank');
    showConfirmationModal();
    contactForm.reset();
  });
}

// Modal
function showConfirmationModal() {
  const modal = document.getElementById('confirmationModal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

function closeConfirmationModal() {
  const modal = document.getElementById('confirmationModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
}

document.getElementById('modalClose')?.addEventListener('click', closeConfirmationModal);

window.addEventListener('click', (e) => {
  const modal = document.getElementById('confirmationModal');
  if (e.target === modal) closeConfirmationModal();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeConfirmationModal();
});

// Contact section background particles
function initContactBgParticles() {
  if (typeof particlesJS === 'undefined') return;
  particlesJS('contact-particles', {
    particles: {
      number: { value: 160, density: { enable: true, value_area: 800 } },
      color: { value: ['#0066FF', '#00CCFF', '#00B8FF'] },
      shape: { type: 'circle' },
      opacity: { value: 0.55, random: true, anim: { enable: true, speed: 0.8, opacity_min: 0.15, sync: false } },
      size: { value: 2.5, random: true, anim: { enable: false } },
      line_linked: { enable: true, distance: 160, color: '#00CCFF', opacity: 0.3, width: 1 },
      move: { enable: true, speed: 1.5, direction: 'none', random: true, straight: false, out_mode: 'out', bounce: false }
    },
    interactivity: {
      detect_on: 'canvas',
      events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' }, resize: true },
      modes: { grab: { distance: 180, line_linked: { opacity: 0.6 } }, push: { particles_nb: 3 } }
    },
    retina_detect: true
  });
}

// Footer particles
function initFooterParticles() {
  if (typeof particlesJS === 'undefined') return;
  particlesJS('footer-particles', {
    particles: {
      number: { value: 160, density: { enable: true, value_area: 800 } },
      color: { value: ['#0066FF', '#00CCFF', '#00B8FF'] },
      shape: { type: 'circle' },
      opacity: { value: 0.55, random: true, anim: { enable: true, speed: 0.8, opacity_min: 0.15, sync: false } },
      size: { value: 2.5, random: true, anim: { enable: false } },
      line_linked: { enable: true, distance: 160, color: '#00CCFF', opacity: 0.3, width: 1 },
      move: { enable: true, speed: 1.5, direction: 'none', random: true, straight: false, out_mode: 'out', bounce: false }
    },
    interactivity: {
      detect_on: 'canvas',
      events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' }, resize: true },
      modes: { grab: { distance: 180, line_linked: { opacity: 0.6 } }, push: { particles_nb: 3 } }
    },
    retina_detect: true
  });
}

// Contact section — particle text morphing
function initContactParticles() {
  const canvas = document.getElementById('contact-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particles = [];
  let animId = null;
  let running = false;
  let frame = 0;

  function setSize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  function sampleText() {
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const oc = off.getContext('2d');
    const fontSize = Math.floor(canvas.height * 0.68);
    oc.font = `700 ${fontSize}px Inter, -apple-system, sans-serif`;
    oc.textAlign = 'center';
    oc.textBaseline = 'middle';
    oc.fillStyle = '#fff';
    oc.fillText('Hablemos', off.width / 2, off.height / 2);
    const d = oc.getImageData(0, 0, off.width, off.height).data;
    const pts = [];
    const step = 5;
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        if (d[(y * off.width + x) * 4 + 3] > 100) pts.push({ x, y });
      }
    }
    return pts;
  }

  function build() {
    setSize();
    const targets = sampleText();
    const cx = canvas.width / 2, cy = canvas.height / 2;
    particles = targets.map(t => ({
      x: cx + (Math.random() - 0.5) * canvas.width * 2.5,
      y: cy + (Math.random() - 0.5) * canvas.height * 3,
      tx: t.x, ty: t.y, ox: t.x, oy: t.y,
      size: 1.2 + Math.random() * 1.3,
      color: Math.random() > 0.4 ? '#00CCFF' : '#0066FF',
      ease: 0.04 + Math.random() * 0.04,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function loop() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;
    particles.forEach(p => {
      p.x += (p.tx - p.x) * p.ease;
      p.y += (p.ty - p.y) * p.ease;
      const dx = p.x - p.ox, dy = p.y - p.oy;
      if (dx * dx + dy * dy < 9) {
        p.tx = p.ox + Math.sin(frame * 0.018 + p.phase) * 1.8;
        p.ty = p.oy + Math.cos(frame * 0.013 + p.phase) * 1.8;
      }
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    animId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    if (particles.length === 0) build();
    loop();
  }

  function stop() {
    running = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting ? start() : stop());
  }, { threshold: 0.2 });
  io.observe(canvas);

  window.addEventListener('resize', () => { stop(); build(); start(); }, { passive: true });
}

// Lightbox — ASCII, video original, y la comparación lado a lado
(function () {
  const modal = document.getElementById('videoModal');
  const stage = document.getElementById('videoModalStage');
  const canvas = document.getElementById('videoModalAscii');
  const player = document.getElementById('videoModalPlayer');
  const modes = document.getElementById('asciiModes');
  const metrics = document.getElementById('asciiMetrics');
  const metricsList = document.getElementById('asciiMetricsList');
  const plainText = document.getElementById('asciiPlainText');
  const tintBg = document.getElementById('asciiTint');
  const metaVideo = document.getElementById('stageMetaVideo');
  const metaAscii = document.getElementById('stageMetaAscii');
  const tagEl = document.getElementById('videoModalTag');
  const titleEl = document.getElementById('videoModalTitle');
  const descEl = document.getElementById('videoModalDesc');
  const closeBtn = document.getElementById('videoModalClose');
  const backdrop = document.getElementById('videoModalBackdrop');

  if (!modal || !canvas || !stage) return;

  let clip = null;          // AsciiClip del lightbox (uno por apertura)
  let videoSrc = '';
  let mode = 'ascii';
  let syncFrame = null;

  /* --- utilidades ----------------------------------------------------- */

  function formatBytes(n) {
    if (!n) return '—';
    const mb = n / 1048576;
    return mb >= 1 ? mb.toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
  }

  function transferredBytes(url) {
    // Tamaño realmente transferido (ya comprimido por el servidor).
    try {
      const entry = performance.getEntriesByName(url).pop();
      return entry ? entry.encodedBodySize || entry.transferSize || 0 : 0;
    } catch (_) {
      return 0;
    }
  }

  function renderMetrics(data) {
    const cells = data.cols * data.rows;
    const asciiBytes = transferredBytes(data.url);
    const mp4Bytes = data.source ? data.source.bytes : 0;
    const ratio = asciiBytes && mp4Bytes ? Math.round(mp4Bytes / asciiBytes) : 0;

    const rows = [
      ['Fuente', data.source.width + '×' + data.source.height + ' px'],
      ['Grilla ASCII', data.cols + '×' + data.rows + ' caracteres'],
      ['Caracteres por frame', cells.toLocaleString('es-AR')],
      ['Niveles de densidad', String(data.ramp.length)],
      ['Paleta', data.palette.length + ' colores'],
      ['Muestreo', data.fps + ' fps · ' + data.frames.length + ' frames'],
      ['Peso del MP4', formatBytes(mp4Bytes)],
      ['Peso del ASCII', formatBytes(asciiBytes) +
        (ratio ? ' <span class="delta">(' + ratio + '× menos)</span>' : '')],
    ];

    metricsList.innerHTML = rows
      .map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>')
      .join('');

    applyFraming(data.source);
    metaVideo.textContent = data.source.width + '×' + data.source.height;
    metaAscii.textContent = data.cols + '×' + data.rows + ' · ' + data.ramp.length + ' niveles';
  }

  function applyFraming(source) {
    // El codificador recorta las bandas negras del clip; aplicamos el mismo
    // recorte al <video> por CSS para que los dos paneles muestren lo mismo.
    const crop = source.crop;
    const full = source.full;
    if (!crop || !full) return;

    stage.style.setProperty('--pane-aspect', crop.w + ' / ' + crop.h);
    stage.style.setProperty('--vid-width', (full.w / crop.w) * 100 + '%');
    stage.style.setProperty('--vid-left', (-crop.x / crop.w) * 100 + '%');
    stage.style.setProperty('--vid-top', (-crop.y / crop.h) * 100 + '%');
  }

  /* --- sincronización -------------------------------------------------- */

  function startSync() {
    stopSync();
    const step = () => {
      if (mode !== 'compare') return;
      // El video manda: el ASCII se posiciona en el mismo instante, así que
      // los dos paneles muestran siempre el mismo frame.
      if (clip) clip.seekSeconds(player.currentTime);
      syncFrame = requestAnimationFrame(step);
    };
    syncFrame = requestAnimationFrame(step);
  }

  function stopSync() {
    if (syncFrame) {
      cancelAnimationFrame(syncFrame);
      syncFrame = null;
    }
  }

  function ensureVideoLoaded() {
    // El MP4 sólo se descarga si el visitante pide verlo o comparar.
    if (!videoSrc) return;
    if (player.getAttribute('src') !== videoSrc) {
      player.setAttribute('src', videoSrc);
      player.load();
    }
  }

  // Si el navegador no puede con el MP4, la comparación se queda sin lado
  // izquierdo: lo decimos en vez de dejar un rectángulo negro.
  player.addEventListener('error', () => {
    stage.classList.add('video-error');
  });
  player.addEventListener('loadeddata', () => {
    stage.classList.remove('video-error');
  });

  /* --- modos ----------------------------------------------------------- */

  function setMode(next) {
    mode = next;
    stage.dataset.mode = next;
    modal.classList.toggle('mode-compare', next === 'compare');
    metrics.hidden = next !== 'compare';

    modes.querySelectorAll('button').forEach(btn => {
      const on = btn.dataset.mode === next;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    });

    stopSync();

    if (next === 'ascii') {
      player.pause();
      if (clip) clip.play();
      return;
    }

    if (clip) clip.pause();
    ensureVideoLoaded();
    player.play().catch(() => {});
    if (next === 'compare') startSync();
  }

  function mountClip(id) {
    if (clip) { clip.destroy(); clip = null; }
    asciiMounts.delete(canvas);
    // Nivel de detalle alto: aquí el clip se ve a tamaño grande.
    const detailed = id + '.hi';
    canvas.dataset.ascii = detailed;

    mountAscii(canvas, { fit: 'contain', monochrome: plainText.checked, tint: tintBg.checked })
      .then(instance => {
        if (!instance || canvas.dataset.ascii !== detailed) return;
        clip = instance;
        renderMetrics(instance.data);
        if (!modal.classList.contains('show')) return;
        if (mode === 'ascii') clip.play();
        else if (mode === 'compare') startSync();
      });
  }

  function openModal(card) {
    const cardCanvas = card.querySelector('.ascii-canvas');
    if (!cardCanvas) return;

    withAscii(cardCanvas, c => c.rewind());

    videoSrc = cardCanvas.dataset.video || '';
    tagEl.textContent = card.querySelector('.portfolio-tag')?.textContent || '';
    titleEl.textContent = card.querySelector('h3')?.textContent || '';
    descEl.textContent = card.querySelector('p')?.textContent || '';
    canvas.setAttribute('aria-label', titleEl.textContent + ' — animación ASCII');

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    mountClip(cardCanvas.dataset.ascii);
    setMode('ascii');
  }

  function closeModal() {
    modal.classList.remove('show');
    modal.classList.remove('mode-compare');
    document.body.style.overflow = '';
    stopSync();
    player.pause();
    player.removeAttribute('src');
    player.load();
    if (clip) { clip.destroy(); clip = null; }
    asciiMounts.delete(canvas);
  }

  document.querySelectorAll('.portfolio-card').forEach(card => {
    card.addEventListener('click', () => openModal(card));
  });

  modes.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (btn) setMode(btn.dataset.mode);
  });

  plainText.addEventListener('change', () => {
    if (clip) clip.setMonochrome(plainText.checked);
  });

  tintBg.addEventListener('change', () => {
    if (clip) clip.setTint(tintBg.checked);
  });

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
  });
})();

// Cookie banner
document.addEventListener('DOMContentLoaded', () => {
  initContactParticles();
  initContactBgParticles();
  initFooterParticles();

  const banner = document.getElementById('cookieBanner');
  if (!localStorage.getItem('cookieConsent')) {
    setTimeout(() => banner?.classList.add('show'), 2000);
  }

  document.getElementById('acceptCookies')?.addEventListener('click', () => {
    localStorage.setItem('cookieConsent', 'accepted');
    banner?.classList.remove('show');
  });

  document.getElementById('rejectCookies')?.addEventListener('click', () => {
    localStorage.setItem('cookieConsent', 'rejected');
    banner?.classList.remove('show');
  });
});
