// Loading Screen y configuración inicial
window.addEventListener('load', () => {
    // Ocultar loading screen
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.transition = 'opacity 0.2s ease';
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 200);
    }

    // Inicializar Particles.js después de cargar
    if (typeof particlesJS !== 'undefined') {
        initParticles();
    }
});

// Particles.js Configuration
let clickCount = 0;
const maxClicks = 5;

function initParticles() {
    particlesJS('particles-js', {
    particles: {
        number: {
            value: 50,
            density: {
                enable: true,
                value_area: 1600
            }
        },
        color: {
            value: ['#0066FF', '#00CCFF', '#00E5FF']
        },
        shape: {
            type: 'circle',
            stroke: {
                width: 0,
                color: '#0066FF'
            }
        },
        opacity: {
            value: 0.9,
            random: true,
            anim: {
                enable: false
            }
        },
        size: {
            value: 2.5,
            random: true,
            anim: {
                enable: false
            }
        },
        line_linked: {
            enable: true,
            distance: 200,
            color: '#00CCFF',
            opacity: 0.6,
            width: 1.2
        },
        move: {
            enable: true,
            speed: 1,
            direction: 'none',
            random: false,
            straight: false,
            out_mode: 'out',
            bounce: false,
            attract: {
                enable: true,
                rotateX: 800,
                rotateY: 800
            }
        }
    },
    interactivity: {
        detect_on: 'canvas',
        events: {
            onhover: {
                enable: false
            },
            onclick: {
                enable: false
            },
            resize: true
        },
        modes: {
            grab: {
                distance: 200,
                line_linked: {
                    opacity: 0.6
                }
            },
            push: {
                particles_nb: 3
            }
        }
    },
    retina_detect: true
    });
}

// Limitar clicks a 5
setTimeout(() => {
    const canvas = document.querySelector('#particles-js canvas');
    if (canvas) {
        canvas.addEventListener('click', function(e) {
            if (clickCount >= maxClicks) {
                e.stopPropagation();
            } else {
                clickCount++;
                if (clickCount === 1) {
                    setTimeout(() => {
                        clickCount = 0;
                    }, 5000);
                }
            }
        }, true);
    }
}, 1000);

// Typing Effect
const typingText = document.getElementById('typing-text');
const navCursor = document.getElementById('nav-cursor');
let blinkCount = 0;
let typingComplete = false;

if (typingText && navCursor) {
    const text = 'Modelos que aprenden\nResultados que escalan';
    let index = 0;
    
    function getRandomDelay() {
        return 60 + Math.random() * 40;
    }
    
    function typeWriter() {
        if (index < text.length) {
            const currentText = text.substring(0, index + 1);
            const textNode = typingText.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                textNode.textContent = currentText;
            } else {
                typingText.insertBefore(document.createTextNode(currentText), navCursor);
            }
            navCursor.style.display = 'inline';
            index++;
            
            const char = text[index - 1];
            let delay = getRandomDelay();
            
            if (char === ',' || char === '.') {
                delay += 200;
            } else if (char === '\n') {
                delay += 300;
            } else if (char === ' ') {
                delay += 30;
            }
            
            setTimeout(typeWriter, delay);
        } else {
            typingComplete = true;
            // Iniciar tipeado en hero inmediatamente sin parpadeos
            navCursor.style.opacity = '0';
            const heroCode = document.getElementById('hero-code');
            if (heroCode) {
                heroCode.classList.add('visible');
                setTimeout(() => {
                    typeHeroCode();
                }, 200);
            }
        }
    }
    
    function countBlinks() {
        const checkBlink = setInterval(() => {
            blinkCount++;
            if (blinkCount >= 5) {
                clearInterval(checkBlink);
                setTimeout(() => {
                    navCursor.style.opacity = '0';
                    // Iniciar tipeado en hero inmediatamente
                    const heroCode = document.getElementById('hero-code');
                    if (heroCode) {
                        heroCode.classList.add('visible');
                        typeHeroCode();
                    }
                }, 500);
            }
        }, 1000);
    }
    
    setTimeout(() => {
        typeWriter();
    }, 200);
}

// Tipear código en Hero con sintaxis Python
function typeHeroCode() {
    const codeText = document.getElementById('code-text');
    const heroCursor = document.getElementById('hero-cursor');
    
    const codeLines = [
        { text: '# AureaIA - Inteligencia Artificial', type: 'comment' },
        { text: '\n', type: 'normal' },
        { text: 'def ', type: 'keyword' },
        { text: 'crear_soluciones', type: 'function' },
        { text: '():', type: 'normal' },
        { text: '\n    ', type: 'normal' },
        { text: '"""', type: 'string' },
        { text: '\n    Unimos ciencia de datos y desarrollo de software', type: 'string' },
        { text: '\n    para crear soluciones inteligentes que crecen', type: 'string' },
        { text: '\n    al ritmo de tu empresa.', type: 'string' },
        { text: '\n    ', type: 'normal' },
        { text: '"""', type: 'string' },
        { text: '\n    ', type: 'normal' },
        { text: 'return ', type: 'keyword' },
        { text: 'innovación', type: 'function' },
        { text: '()', type: 'normal' },
        { text: '\n\n', type: 'normal' },
        { text: 'print', type: 'builtin' },
        { text: '(', type: 'normal' },
        { text: '"Contáctanos!"', type: 'link' },
        { text: ')', type: 'normal' },
        { text: '  ', type: 'normal' },
        { text: '←', type: 'arrow' }
    ];
    
    let lineIndex = 0;
    let charIndex = 0;
    let currentHTML = '';
    
    function getRandomDelay() {
        return 8 + Math.random() * 12;
    }    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function getColorClass(type) {
        const colorMap = {
            'comment': 'code-comment',
            'keyword': 'code-keyword',
            'function': 'code-function',
            'string': 'code-string',
            'builtin': 'code-builtin',
            'link': 'code-link',
            'arrow': 'code-arrow',
            'normal': ''
        };
        return colorMap[type] || '';
    }
    
    function typeCode() {
        if (lineIndex < codeLines.length) {
            const currentLine = codeLines[lineIndex];
            const currentText = currentLine.text;
            
            if (charIndex < currentText.length) {
                const char = currentText[charIndex];
                
                // Construir HTML completo hasta este punto
                let html = '';
                for (let i = 0; i <= lineIndex; i++) {
                    const line = codeLines[i];
                    const text = i === lineIndex ? line.text.substring(0, charIndex + 1) : line.text;
                    const colorClass = getColorClass(line.type);
                    
                    if (colorClass) {
                        html += `<span class="${colorClass}">${escapeHtml(text)}</span>`;
                    } else {
                        html += escapeHtml(text);
                    }
                }
                
                codeText.innerHTML = html;
                charIndex++;
                
                let delay = getRandomDelay();
                if (char === '\n') delay = 50;
                
                setTimeout(typeCode, delay);
            } else {
                lineIndex++;
                charIndex = 0;
                setTimeout(typeCode, 50);
            }
        } else {
            // Finalizado el tipeo
            heroCursor.style.display = 'none';
            
            // Hacer el texto "Contáctanos!" cliceable
            const linkElement = codeText.querySelector('.code-link');
            if (linkElement) {
                linkElement.style.cursor = 'pointer';
                linkElement.addEventListener('click', function() {
                    const contactSection = document.getElementById('contacto');
                    if (contactSection) {
                        contactSection.scrollIntoView({ behavior: 'smooth' });
                    }
                });
            }
        }
    }
    
    typeCode();
}

// Smooth Scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar Background on Scroll
const navbar = document.querySelector('.navbar');
let lastScroll = 0;
let scrollTimeout;

window.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    
    scrollTimeout = setTimeout(() => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            navbar.style.background = 'rgba(10, 10, 10, 0.98)';
            navbar.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.3)';
        } else {
            navbar.style.background = 'rgba(10, 10, 10, 0.95)';
            navbar.style.boxShadow = 'none';
        }
        
        lastScroll = currentScroll;
        scrollTimeout = null;
    }, 100);
}, { passive: true });

// Intersection Observer for Animations
const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            entry.target.style.willChange = 'auto';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe all sections
document.querySelectorAll('section').forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(30px)';
    section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(section);
});

// Cards visible immediately for performance
document.querySelectorAll('.service-card, .case-study-card, .featured-card, .news-card').forEach(card => {
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
});

// Form Validation and WhatsApp Integration
const contactForm = document.getElementById('contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Get form data
        const nombre = contactForm.querySelector('[name="nombre"]').value.trim();
        const email = contactForm.querySelector('[name="email"]').value.trim();
        const telefono = contactForm.querySelector('[name="telefono"]').value.trim();
        const mensaje = contactForm.querySelector('[name="mensaje"]').value.trim();
        
        // Validation
        if (!nombre || !email || !mensaje) {
            alert('Por favor, completa todos los campos obligatorios.');
            return;
        }
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert('Por favor, ingresa un email válido.');
            return;
        }
        
        // Create WhatsApp message
        const whatsappNumber = '5491139481921'; // Argentina country code + number
        let whatsappMessage = `*Nuevo contacto desde AureaIA*%0A%0A`;
        whatsappMessage += `*Nombre:* ${encodeURIComponent(nombre)}%0A`;
        whatsappMessage += `*Email:* ${encodeURIComponent(email)}%0A`;
        if (telefono) {
            whatsappMessage += `*Teléfono:* ${encodeURIComponent(telefono)}%0A`;
        }
        whatsappMessage += `%0A*Mensaje:*%0A${encodeURIComponent(mensaje)}`;
        
        // Open WhatsApp
        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
        window.open(whatsappUrl, '_blank');
        
        // Show confirmation modal
        showConfirmationModal();
        
        // Reset form
        contactForm.reset();
    });
}

// Confirmation Modal Functions
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

// Close modal on outside click
window.addEventListener('click', (e) => {
    const modal = document.getElementById('confirmationModal');
    if (e.target === modal) {
        closeConfirmationModal();
    }
});

// Close modal on ESC key
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeConfirmationModal();
    }
});

// Dynamic Gradient Background Effect - Disabled for performance
// const hero = document.querySelector('.hero');

// Counter Animation
const animateCounter = (element, target, duration = 2000) => {
    let current = 0;
    const increment = target / (duration / 16);
    
    const updateCounter = () => {
        current += increment;
        if (current < target) {
            element.textContent = Math.floor(current);
            requestAnimationFrame(updateCounter);
        } else {
            element.textContent = target;
        }
    };
    
    updateCounter();
};

// Parallax Effect - Desktop only
let parallaxTicking = false;
const isDesktop = window.innerWidth > 1024;

if (isDesktop) {
    window.addEventListener('scroll', () => {
        if (!parallaxTicking) {
            requestAnimationFrame(() => {
                const scrolled = window.pageYOffset;
                const parallaxElements = document.querySelectorAll('.hero-content');
                
                parallaxElements.forEach(element => {
                    const speed = 0.5;
                    element.style.transform = `translateY(${scrolled * speed}px)`;
                });
                parallaxTicking = false;
            });
            parallaxTicking = true;
        }
    }, { passive: true });
}

// Mobile Menu Toggle (if needed)
const createMobileMenu = () => {
    const navbar = document.querySelector('.navbar');
    const navMenu = document.querySelector('.nav-menu');
    
    if (window.innerWidth <= 768) {
        const menuToggle = document.createElement('button');
        menuToggle.classList.add('menu-toggle');
        menuToggle.innerHTML = '☰';
        menuToggle.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 2rem;
            cursor: pointer;
            display: none;
        `;
        
        if (window.innerWidth <= 768) {
            menuToggle.style.display = 'block';
        }
        
        navbar.querySelector('.container').appendChild(menuToggle);
        
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Add smooth reveal to hero content
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
        setTimeout(() => {
            heroContent.style.opacity = '1';
            heroContent.style.transform = 'translateY(0)';
        }, 100);
    }
    
    // Initialize mobile menu if needed
    createMobileMenu();
});

// Resize handler
window.addEventListener('resize', () => {
    createMobileMenu();
});

// Add active state to nav links based on scroll position
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-menu a');
let navUpdateTimeout;

window.addEventListener('scroll', () => {
    if (navUpdateTimeout) return;
    
    navUpdateTimeout = setTimeout(() => {
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            
            if (pageYOffset >= sectionTop - 200) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').slice(1) === current) {
                link.classList.add('active');
            }
        });
        
        navUpdateTimeout = null;
    }, 150);
}, { passive: true });

// Carousel Horizontal - Mouse drag & Auto-play videos
document.addEventListener('DOMContentLoaded', () => {
    const carousel = document.querySelector('.cards-carousel');
    const cards = document.querySelectorAll('.card');
    
    // Duplicar tarjetas para scroll infinito
    if (carousel && cards.length > 0) {
        const cardsArray = Array.from(cards);
        cardsArray.forEach(card => {
            const clone1 = card.cloneNode(true);
            const clone2 = card.cloneNode(true);
            carousel.appendChild(clone1);
            carousel.appendChild(clone2);
        });
    }
    
    const allCards = document.querySelectorAll('.card');
    const videos = document.querySelectorAll('.card-video video');
    
    if (carousel) {
        let isDragging = false;
        let startX = 0;
        let scrollLeft = 0;
        let hasMoved = false;
        let scrollWidth = 0;
        let clientWidth = 0;
        
        // Calcular dimensiones para scroll infinito
        const updateDimensions = () => {
            scrollWidth = carousel.scrollWidth;
            clientWidth = carousel.clientWidth;
        };
        
        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        
        // Iniciar en el centro del scroll para efecto infinito
        carousel.scrollLeft = scrollWidth / 3;
        
        carousel.addEventListener('mousedown', (e) => {
            // No iniciar drag si se hace clic en una tarjeta directamente
            if (e.target.closest('.card')) {
                const card = e.target.closest('.card');
                isDragging = true;
                carousel.classList.add('dragging');
                startX = e.pageX - carousel.offsetLeft;
                scrollLeft = carousel.scrollLeft;
                hasMoved = false;
                e.preventDefault();
            }
        });
        
        carousel.addEventListener('mouseleave', () => {
            isDragging = false;
            carousel.classList.remove('dragging');
        });
        
        carousel.addEventListener('mouseup', () => {
            isDragging = false;
            carousel.classList.remove('dragging');
        });
        
        carousel.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - carousel.offsetLeft;
            const walk = (x - startX) * 2; // Velocidad de scroll
            if (Math.abs(walk) > 5) {
                hasMoved = true;
            }
            carousel.scrollLeft = scrollLeft - walk;
        });
        
        // Scroll infinito - reposicionar cuando llegue al extremo
        let scrollInfiniteTimeout;
        carousel.addEventListener('scroll', () => {
            if (scrollInfiniteTimeout) return;
            
            scrollInfiniteTimeout = setTimeout(() => {
                updateDimensions();
                const maxScroll = scrollWidth - clientWidth;
                const oneThird = scrollWidth / 3;
                
                if (carousel.scrollLeft <= 10) {
                    carousel.scrollLeft = oneThird;
                } else if (carousel.scrollLeft >= maxScroll - 10) {
                    carousel.scrollLeft = oneThird * 2 - clientWidth;
                }
                
                scrollInfiniteTimeout = null;
            }, 100);
        }, { passive: true });
        
        // Touch support
        carousel.addEventListener('touchstart', (e) => {
            isDragging = true;
            startX = e.touches[0].pageX - carousel.offsetLeft;
            scrollLeft = carousel.scrollLeft;
            hasMoved = false;
        }, { passive: true });
        
        carousel.addEventListener('touchend', () => {
            isDragging = false;
        });
        
        carousel.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const x = e.touches[0].pageX - carousel.offsetLeft;
            const walk = (x - startX) * 2;
            if (Math.abs(walk) > 5) {
                hasMoved = true;
            }
            carousel.scrollLeft = scrollLeft - walk;
        }, { passive: true });
        
        // Click para expandir/contraer tarjetas
        allCards.forEach(card => {
            card.addEventListener('click', (e) => {
                // Solo expandir/contraer si no hubo movimiento (no fue drag)
                if (!hasMoved) {
                    e.stopPropagation();
                    
                    // Cerrar otras tarjetas expandidas
                    allCards.forEach(c => {
                        if (c !== card) {
                            c.classList.remove('expanded');
                        }
                    });
                    
                    // Toggle de esta tarjeta
                    card.classList.toggle('expanded');
                    
                    // Scroll hacia la tarjeta expandida
                    if (card.classList.contains('expanded')) {
                        setTimeout(() => {
                            card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        }, 100);
                    }
                }
                hasMoved = false;
            });
        });
    }
});

// Cookie Banner
document.addEventListener('DOMContentLoaded', () => {
    const cookieBanner = document.getElementById('cookieBanner');
    const acceptBtn = document.getElementById('acceptCookies');
    const rejectBtn = document.getElementById('rejectCookies');
    
    // Check if user already made a choice
    const cookieConsent = localStorage.getItem('cookieConsent');
    
    if (!cookieConsent) {
        setTimeout(() => {
            cookieBanner.classList.add('show');
        }, 2000);
    }
    
    acceptBtn.addEventListener('click', () => {
        localStorage.setItem('cookieConsent', 'accepted');
        cookieBanner.classList.remove('show');
        setTimeout(() => {
            cookieBanner.style.display = 'none';
        }, 300);
    });
    
    rejectBtn.addEventListener('click', () => {
        localStorage.setItem('cookieConsent', 'rejected');
        cookieBanner.classList.remove('show');
        setTimeout(() => {
            cookieBanner.style.display = 'none';
        }, 300);
    });
});

// Particle Morphing for "Hablemos" title
function initParticleMorphing() {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const text = 'Hablemos';
    let animationFrame;
    let isAnimating = false;
    
    // Set canvas size
    const updateCanvasSize = () => {
        const container = canvas.parentElement;
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
    };
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    // Optimized Particle class
    class Particle {
        constructor(targetX, targetY, index) {
            // Start from varied positions for better visual effect
            const angle = (index / totalParticles) * Math.PI * 2;
            const radius = Math.random() * canvas.width * 0.5;
            this.x = canvas.width / 2 + Math.cos(angle) * radius;
            this.y = canvas.height / 2 + Math.sin(angle) * radius;
            this.targetX = targetX;
            this.targetY = targetY;
            this.size = Math.random() * 1.5 + 1;
            this.colorIndex = Math.floor(Math.random() * 3);
        }
        
        reset(targetX, targetY, index) {
            // Reset particle to new random position
            const angle = (index / totalParticles) * Math.PI * 2;
            const radius = Math.random() * canvas.width * 0.5;
            this.x = canvas.width / 2 + Math.cos(angle) * radius;
            this.y = canvas.height / 2 + Math.sin(angle) * radius;
            this.targetX = targetX;
            this.targetY = targetY;
        }
        
        update() {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            
            // Faster convergence
            this.x += dx * 0.08;
            this.y += dy * 0.08;
        }
        
        draw() {
            // Use pre-defined colors to avoid string allocation
            ctx.fillStyle = colors[this.colorIndex];
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Pre-define colors
    const colors = ['#0066FF', '#00CCFF', '#00d4ff'];
    let totalParticles = 0;
    
    // Get text coordinates with optimized sampling
    const getTextCoordinates = () => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        tempCtx.font = 'bold 80px Inter, sans-serif';
        tempCtx.fillStyle = 'white';
        tempCtx.textAlign = 'left';
        tempCtx.textBaseline = 'middle';
        
        const x = 0;
        const y = canvas.height / 2;
        
        tempCtx.fillText(text, x, y);
        
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const coordinates = [];
        
        // Reduced sampling for better performance (every 6 pixels)
        for (let y = 0; y < tempCanvas.height; y += 6) {
            for (let x = 0; x < tempCanvas.width; x += 6) {
                const index = (y * tempCanvas.width + x) * 4;
                const alpha = imageData.data[index + 3];
                
                if (alpha > 128) {
                    coordinates.push({ x, y });
                }
            }
        }
        
        return coordinates;
    };
    
    const coordinates = getTextCoordinates();
    totalParticles = coordinates.length;
    let particles = coordinates.map((coord, i) => new Particle(coord.x, coord.y, i));
    
    let frame = 0;
    const maxFrames = 100; // Stop animation after particles settle
    
    // Function to start animation
    function startAnimation() {
        if (isAnimating) return;
        
        isAnimating = true;
        frame = 0;
        
        // Reset particles to random positions
        particles.forEach((particle, i) => {
            particle.reset(coordinates[i].x, coordinates[i].y, i);
        });
        
        animate();
    }
    
    // Optimized animation loop
    function animate() {
        if (frame >= maxFrames) {
            // Draw final state with glow
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.shadowBlur = 15;
            particles.forEach(particle => {
                ctx.shadowColor = colors[particle.colorIndex];
                particle.draw();
            });
            ctx.shadowBlur = 0;
            isAnimating = false;
            return;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add glow only in first 50 frames for performance
        if (frame < 50) {
            ctx.shadowBlur = 8;
        }
        
        particles.forEach(particle => {
            particle.update();
            if (frame < 50) {
                ctx.shadowColor = colors[particle.colorIndex];
            }
            particle.draw();
        });
        
        ctx.shadowBlur = 0;
        frame++;
        animationFrame = requestAnimationFrame(animate);
    }
    
    // Start animation when contact section is in view (with looping)
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                startAnimation();
            }
        });
    }, { threshold: 0.2 });
    
    const contactSection = document.getElementById('contacto');
    if (contactSection) {
        observer.observe(contactSection);
    }
}

// Initialize particle morphing when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initParticleMorphing();
    }, 1000);
});
