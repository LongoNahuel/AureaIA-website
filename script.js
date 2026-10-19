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
