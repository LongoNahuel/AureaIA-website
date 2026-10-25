// Loading screen + hero code trigger + particles
window.addEventListener('load', () => {
  const loading = document.getElementById('loading-screen');
  setTimeout(() => {
    loading.classList.add('hidden');
    setTimeout(() => loading.style.display = 'none', 500);
  }, 400);

  // Con la escena 3D activa (immersive.js) las partículas 2D no hacen falta
  if (typeof particlesJS !== 'undefined' && !window.AureaImmersive) initParticles();

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

  // Section headers: el título aparece desde una máscara
  document.querySelectorAll('.section-header.reveal').forEach(el => {
    inView(el, () => {
      animate(el, { opacity: [0, 1], y: [24, 0] }, { duration: 0.6, easing: [0.25, 1, 0.5, 1] });
      const h2 = el.querySelector('h2');
      if (h2) animate(h2, { clipPath: ['inset(0 0 100% 0)', 'inset(0 0 0% 0)'], y: [20, 0] }, { duration: 0.85, delay: 0.1, easing: [0.22, 1, 0.36, 1] });
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
// "Hablemos" armado con partículas. Para que se lea bien: canvas a la densidad de la
// pantalla, puntos chicos y densos (muestreo en panal), poco temblor y, debajo, la
// palabra nítida con un degradé suave que aparece cuando las partículas llegan.
function initContactParticles() {
  const canvas = document.getElementById('contact-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const PALABRA = 'Hablemos';
  const fuente = size => `700 ${size}px Inter, -apple-system, "Segoe UI", sans-serif`;
  let particles = [];
  let animId = null;
  let running = false;
  let frame = 0;
  let W = 0, H = 0, texto = null;

  function setSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.offsetWidth;
    H = canvas.offsetHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function sampleText() {
    const off = document.createElement('canvas');
    const oc = off.getContext('2d');
    // tamaño que entra en el ancho disponible
    let size = Math.floor(H * 0.78);
    oc.font = fuente(size);
    const ancho = oc.measureText(PALABRA).width;
    if (ancho > W * 0.96) size = Math.floor(size * W * 0.96 / ancho);
    texto = { size, x: W / 2, y: H / 2 };
    // se rasteriza a 3× para ubicar bien los bordes de cada letra
    const k = 3;
    off.width = Math.round(W * k);
    off.height = Math.round(H * k);
    oc.scale(k, k);
    oc.font = fuente(size);
    oc.textAlign = 'center';
    oc.textBaseline = 'middle';
    oc.fillStyle = '#fff';
    oc.fillText(PALABRA, texto.x, texto.y);
    const d = oc.getImageData(0, 0, off.width, off.height).data;
    const step = Math.max(2.1, size / 36);     // ~2,5 px con la letra de escritorio
    const pts = [];
    for (let j = 0, y = step / 2; y < H; j++, y += step * 0.87) {
      for (let x = (j % 2 ? step / 2 : 0) + step / 2; x < W; x += step) {
        if (d[(Math.round(y * k) * off.width + Math.round(x * k)) * 4 + 3] > 140) pts.push({ x, y });
      }
    }
    return { pts, step };
  }

  function build() {
    setSize();
    const { pts, step } = sampleText();
    const cx = W / 2, cy = H / 2;
    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
    particles = pts.map(t => {
      const u = (t.x - minX) / Math.max(1, maxX - minX); // cian a la izquierda, azul a la derecha
      return {
        x: cx + (Math.random() - 0.5) * W * 2.5,
        y: cy + (Math.random() - 0.5) * H * 3,
        tx: t.x, ty: t.y, ox: t.x, oy: t.y,
        size: step * (0.36 + Math.random() * 0.1),
        color: `rgb(0, ${Math.round(204 - 102 * u)}, 255)`,
        ease: 0.06 + Math.random() * 0.04,
        phase: Math.random() * Math.PI * 2,
      };
    });
    frame = 0;
  }

  function loop() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    frame++;
    // la palabra nítida aparece debajo cuando las partículas ya llegaron
    const nitida = Math.min(1, Math.max(0, (frame - 45) / 60));
    if (nitida > 0 && texto) {
      const g = ctx.createLinearGradient(texto.x - W / 2, 0, texto.x + W / 2, 0);
      g.addColorStop(0, '#00CCFF');
      g.addColorStop(1, '#0066FF');
      ctx.globalAlpha = 0.3 * nitida;
      ctx.fillStyle = g;
      ctx.font = fuente(texto.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PALABRA, texto.x, texto.y);
    }
    ctx.globalAlpha = 0.95;
    particles.forEach(p => {
      p.x += (p.tx - p.x) * p.ease;
      p.y += (p.ty - p.y) * p.ease;
      const dx = p.x - p.ox, dy = p.y - p.oy;
      if (dx * dx + dy * dy < 1) { // ya en su lugar: un leve brillo, sin deformar la letra
        p.tx = p.ox + Math.sin(frame * 0.02 + p.phase) * 0.35;
        p.ty = p.oy + Math.cos(frame * 0.015 + p.phase) * 0.35;
      }
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
    const arrancar = () => {
      if (!running) return;
      if (particles.length === 0) build();
      loop();
    };
    // se espera a Inter para muestrear la letra correcta
    if (document.fonts && document.fonts.load) document.fonts.load(fuente(80)).then(arrancar, arrancar);
    else arrancar();
  }

  function stop() {
    running = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting ? start() : stop());
  }, { threshold: 0.2 });
  io.observe(canvas);

  let anchoPrevio = canvas.offsetWidth;
  window.addEventListener('resize', () => {
    if (canvas.offsetWidth === anchoPrevio) return; // en celulares la barra del navegador cambia el alto
    anchoPrevio = canvas.offsetWidth;
    stop(); particles = []; start();
  }, { passive: true });
}

// Cookie banner
document.addEventListener('DOMContentLoaded', () => {
  initContactParticles();
  // La red de partículas conectadas de contacto y pie se mantiene también con el fondo 3D
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

// Casos de éxito: los videos solo se reproducen cuando están en pantalla
(function initCamFeeds() {
  const videos = document.querySelectorAll('.cam-video');
  if (!videos.length) return;
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reducido && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const v = e.target;
        if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); }
        else v.pause();
      });
    }, { threshold: 0.25 });
    videos.forEach(v => io.observe(v));
  }
  // reloj del visor
  const relojes = document.querySelectorAll('.cam-clock');
  const dos = n => String(n).padStart(2, '0');
  const tic = () => {
    const d = new Date();
    const txt = `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
    relojes.forEach(r => { r.textContent = txt; });
  };
  if (relojes.length) { tic(); setInterval(tic, 1000); }
})();

// Caso ChatBot: conversación de demostración en loop (se anima solo cuando está en pantalla)
(function initChatDemo() {
  const demo = document.querySelector('.chat-demo');
  if (!demo) return;
  const track = demo.querySelector('.chat-track');
  const kpiN = demo.querySelector('[data-kpi="n"]');
  const kpiT = demo.querySelector('[data-kpi="t"]');
  const guion = [
    { u: '¿Cómo actualizo el firmware de mi cámara desde la app?' },
    { b: 'Te guío paso a paso:<ol><li>Entrá a <b>Dispositivos</b> y elegí la cámara.</li><li>Tocá <b>Actualizar firmware</b> y confirmá.</li><li>No la desconectes durante unos 5 min.</li></ol>' },
    { u: 'Listo, ¿cómo verifico que quedó bien?' },
    { b: 'Revisá la versión en <b>Información del equipo</b>: tiene que coincidir con la última publicada. <span class="chat-ok">✓ Si la imagen vuelve sola, quedó OK.</span>' },
    { u: 'El NVR me muestra el error "Disco no formateado"' },
    { b: 'Es normal con un disco nuevo. Andá a <b>Almacenamiento → Discos</b>, seleccionalo y tocá <b>Formatear</b>. ⚠ Se borran las grabaciones de ese disco.' },
  ];
  const dos = n => String(n).padStart(2, '0');
  const hora = () => { const d = new Date(); return `${dos(d.getHours())}:${dos(d.getMinutes())}`; };
  let i = 0, consultas = 0, timer = null, activo = false;
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function agregar(html, cls) {
    const el = document.createElement('div');
    el.className = `chat-msg ${cls}`;
    el.innerHTML = html;
    track.appendChild(el);
    while (track.children.length > 6) track.firstElementChild.remove();
    return el;
  }
  function paso() {
    if (!activo) return;
    if (i >= guion.length) { // reinicia la conversación
      i = 0;
      timer = setTimeout(() => { track.innerHTML = ''; paso(); }, 2600);
      return;
    }
    const m = guion[i++];
    if (m.u) {
      agregar(`${m.u}<time>${hora()}</time>`, 'user');
      consultas++; if (kpiN) kpiN.textContent = consultas;
      timer = setTimeout(paso, 900);
    } else {
      const t = agregar('<span class="chat-typing"><i></i><i></i><i></i></span>', 'bot');
      const espera = 1100 + Math.random() * 900;
      timer = setTimeout(() => {
        t.innerHTML = `${m.b}<time>${hora()}</time>`;
        if (kpiT) kpiT.textContent = `${(espera / 1000).toFixed(1)} s`;
        timer = setTimeout(paso, 2600);
      }, espera);
    }
  }
  if (reducido) { guion.slice(0, 2).forEach(m => agregar(m.u || m.b, m.u ? 'user' : 'bot')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting && !activo) { activo = true; paso(); }
    else if (!e.isIntersecting && activo) { activo = false; clearTimeout(timer); }
  }), { threshold: 0.3 });
  io.observe(demo);
})();

// Analítica de Robo: eventos reales del sistema sincronizados con el video
(function initCamEvents() {
  document.querySelectorAll('.cam-events').forEach(panel => {
    const fig = panel.closest('.cam-feed');
    const video = fig && fig.querySelector('.cam-video');
    const list = panel.querySelector('.cam-events-list');
    const count = panel.querySelector('.cam-events-count');
    const live = fig && fig.querySelector('[data-live-event]');
    const tipoCuenta = panel.dataset.countType || 'alert';
    const [sing, plur] = (panel.dataset.countLabel || 'alerta|alertas').split('|');
    const idle = live ? live.textContent : '';
    let eventos = [];
    try { eventos = JSON.parse(panel.dataset.events); } catch (_) { return; }
    if (!video || !list) return;
    let mostrados = 0, alertas = 0;
    const mmss = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    function reiniciar() {
      list.innerHTML = ''; mostrados = 0; alertas = 0;
      if (count) count.textContent = `0 ${plur}`;
      if (live) { live.textContent = idle; live.classList.remove('is-alert'); }
      fig.classList.remove('is-alert');
    }
    video.addEventListener('timeupdate', () => {
      const t = video.currentTime;
      if (mostrados > 0 && t < eventos[mostrados - 1][0] - 0.5) reiniciar(); // volvió a empezar el loop
      while (mostrados < eventos.length && eventos[mostrados][0] <= t) {
        const [et, tipo, titulo, detalle] = eventos[mostrados++];
        const li = document.createElement('li');
        li.className = tipo;
        li.innerHTML = `<time>${mmss(et)}</time><span><b>${titulo}</b><small>${detalle}</small></span>`;
        list.appendChild(li);
        while (list.children.length > 5) list.firstElementChild.remove();
        if (live) {
          live.textContent = tipo === 'alert' ? `⚠ ${titulo}` : `${titulo}: ${detalle.split(' · ')[0]}`;
          live.classList.toggle('is-alert', tipo === 'alert');
        }
        if (tipo === tipoCuenta) {
          alertas++;
          if (count) count.textContent = `${alertas} ${alertas === 1 ? sing : plur}`;
        }
        if (tipo === 'alert') {
          fig.classList.add('is-alert');
          setTimeout(() => fig.classList.remove('is-alert'), 2600);
        }
      }
    });
    video.addEventListener('seeked', () => { if (video.currentTime < 0.5) reiniciar(); });
  });
})();

// Detección de Mirada: distribución del tiempo por dirección, calculada en vivo con la serie real del video
(function initCamStats() {
  document.querySelectorAll('.cam-stats').forEach(panel => {
    const fig = panel.closest('.cam-feed');
    const video = fig && fig.querySelector('.cam-video');
    const list = panel.querySelector('.cam-stats-list');
    const now = panel.querySelector('.cam-stats-now');
    let serie = [];
    try { serie = JSON.parse(panel.dataset.series); } catch (_) { return; }
    if (!video || !list || !serie.length) return;
    const nombres = [...new Set(serie.map(s => s[1]))];
    list.innerHTML = nombres.map(n => `<li data-dir="${n}"><span>${n.replace('-', '·')}</span><i><b></b></i><em>0%</em></li>`).join('');
    const filas = Object.fromEntries([...list.children].map(li => [li.dataset.dir, li]));
    video.addEventListener('timeupdate', () => {
      const t = video.currentTime, acum = {};
      let actual = serie[0];
      for (let i = 0; i < serie.length; i++) {
        const [ti, dir] = serie[i];
        if (ti > t) break;
        actual = serie[i];
        const fin = Math.min(t, i + 1 < serie.length ? serie[i + 1][0] : t);
        acum[dir] = (acum[dir] || 0) + Math.max(0, fin - ti);
      }
      const total = Object.values(acum).reduce((a, b) => a + b, 0) || 1;
      nombres.forEach(n => {
        const pct = Math.round(100 * (acum[n] || 0) / total);
        const li = filas[n];
        li.querySelector('b').style.width = pct + '%';
        li.querySelector('em').textContent = pct + '%';
        li.classList.toggle('is-now', n === actual[1]);
      });
      if (now) now.textContent = `${actual[1]} · ${actual[2]}%`;
    });
  });
})();

// A medida: configurador de analítica → especificación en vivo → formulario de contacto
(function initConfigurador() {
  const root = document.getElementById('configurador');
  const code = document.getElementById('spec-code');
  if (!root || !code) return;
  const range = document.getElementById('cfg-camaras');
  const out = document.getElementById('cfg-camaras-out');
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const valores = g => [...root.querySelectorAll(`[data-group="${g}"] .cfg-chip.is-on`)].map(b => b.dataset.value);

  root.querySelectorAll('.cfg-options').forEach(grupo => {
    const unico = grupo.hasAttribute('data-single');
    grupo.querySelectorAll('.cfg-chip').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.classList.contains('is-on'));
      btn.addEventListener('click', () => {
        if (unico) grupo.querySelectorAll('.cfg-chip').forEach(b => { b.classList.remove('is-on'); b.setAttribute('aria-pressed', 'false'); });
        else if (btn.classList.contains('is-on') && grupo.querySelectorAll('.is-on').length === 1) return; // al menos una opción
        btn.classList.toggle('is-on', unico ? true : !btn.classList.contains('is-on'));
        btn.setAttribute('aria-pressed', btn.classList.contains('is-on'));
        render();
      });
    });
  });
  range?.addEventListener('input', render);

  function spec() {
    return { escenario: valores('escenario')[0] || 'Otro', analiticas: valores('analiticas'), alertas: valores('alertas'), camaras: Number(range?.value || 1) };
  }
  function render() {
    const s = spec();
    if (out) out.textContent = s.camaras;
    const lista = (arr, ind = '  ') => arr.map(v => `${ind}- <span class="s">${esc(v)}</span>`).join('\n');
    code.innerHTML =
`<span class="c"># Analítica a medida · AureaIA</span>
<span class="k">escenario:</span> <span class="s">${esc(s.escenario)}</span>
<span class="k">camaras:</span> <span class="s">${s.camaras}</span>  <span class="c"># IP vía RTSP / ONVIF</span>
<span class="k">analiticas:</span>
${lista(s.analiticas)}
<span class="k">reglas:</span>
  <span class="k">zonas:</span> <span class="s">a definir sobre cada cámara</span>
  <span class="k">horarios:</span> <span class="s">según operación</span>
  <span class="k">umbrales:</span> <span class="s">calibrados con tus imágenes</span>
<span class="k">alertas:</span>
${lista(s.alertas)}`;
  }
  render();

  document.getElementById('spec-send')?.addEventListener('click', () => {
    const s = spec();
    const msg = `Hola, quiero una analítica a medida:\n• Escenario: ${s.escenario}\n• Cámaras: ${s.camaras}\n• Detectar: ${s.analiticas.join(', ')}\n• Alertas por: ${s.alertas.join(', ')}\n\nDetalle de mi requerimiento: `;
    const ta = document.querySelector('#contactForm [name="mensaje"]');
    if (ta) {
      ta.value = msg;
      document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 700);
    }
  });
})();
