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

// Reveal on scroll
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// Portfolio videos — play on hover (desktop)
const isTouchDevice = window.matchMedia('(hover: none)').matches;

document.querySelectorAll('.portfolio-card').forEach(card => {
  const video = card.querySelector('video');
  if (!video) return;

  if (!isTouchDevice) {
    card.addEventListener('mouseenter', () => video.play().catch(() => {}));
    card.addEventListener('mouseleave', () => {
      video.pause();
      video.currentTime = 0;
    });
  }
});

// Portfolio videos — play when in view (mobile / touch)
if (isTouchDevice) {
  const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target.querySelector('video');
      if (!video) return;
      if (entry.isIntersecting) video.play().catch(() => {});
      else { video.pause(); video.currentTime = 0; }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.portfolio-card').forEach(card => videoObserver.observe(card));
}

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

// Video lightbox
(function () {
  const modal = document.getElementById('videoModal');
  const player = document.getElementById('videoModalPlayer');
  const tagEl = document.getElementById('videoModalTag');
  const titleEl = document.getElementById('videoModalTitle');
  const descEl = document.getElementById('videoModalDesc');
  const closeBtn = document.getElementById('videoModalClose');
  const backdrop = document.getElementById('videoModalBackdrop');

  if (!modal) return;

  function openModal(card) {
    const cardVideo = card.querySelector('video');
    if (cardVideo) { cardVideo.pause(); cardVideo.currentTime = 0; }

    const src = card.querySelector('video source')?.src || cardVideo?.currentSrc || '';
    const tag = card.querySelector('.portfolio-tag')?.textContent || '';
    const title = card.querySelector('h3')?.textContent || '';
    const desc = card.querySelector('p')?.textContent || '';

    player.src = src;
    player.load();
    tagEl.textContent = tag;
    titleEl.textContent = title;
    descEl.textContent = desc;

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    player.play().catch(() => {});
  }

  function closeModal() {
    modal.classList.remove('show');
    document.body.style.overflow = '';
    player.pause();
    player.src = '';
  }

  document.querySelectorAll('.portfolio-card').forEach(card => {
    card.addEventListener('click', () => openModal(card));
  });

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
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
