// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        target.scrollIntoView({ behavior: 'smooth' });
    });
});

// Form submission handler (only runs if a contact form exists on the page)
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        alert('Thanks for reaching out! I\'ll waddle back to you soon! 🐧');
        this.reset();
    });
}

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');
if (navToggle && navMenu) {
    navToggle.addEventListener('click', function() {
        const isOpen = navMenu.classList.toggle('open');
        navToggle.classList.toggle('open', isOpen);
        navToggle.setAttribute('aria-expanded', isOpen);
    });

    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('open');
            navToggle.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });
}

// Create falling snowflakes
function createSnowflakes() {
    const container = document.getElementById('snowflakes');
    const snowflakeCount = 15;
    
    for (let i = 0; i < snowflakeCount; i++) {
        const snowflake = document.createElement('div');
        snowflake.className = 'snowflake';
        snowflake.innerHTML = '❄';
        snowflake.style.left = Math.random() * 100 + '%';
        snowflake.style.animationDuration = (Math.random() * 3 + 5) + 's';
        snowflake.style.animationDelay = Math.random() * 5 + 's';
        snowflake.style.fontSize = (Math.random() * 10 + 15) + 'px';
        snowflake.style.opacity = Math.random() * 0.5 + 0.3;
        container.appendChild(snowflake);
    }
}

// Initialize snowflakes when page loads
createSnowflakes();

// Scroll penguin: waddles along the bottom edge as you scroll; click it to slide back to the top
function createScrollPenguin() {
    const track = document.createElement('div');
    track.className = 'scroll-track';
    track.setAttribute('aria-hidden', 'true');
    track.innerHTML = '<div class="scroll-track-fill"></div>';

    const penguin = document.createElement('button');
    penguin.type = 'button';
    penguin.className = 'scroll-penguin';
    penguin.title = 'Drag to scroll, click to go back to top';
    penguin.setAttribute('aria-label', 'Scroll position. Drag or use arrow keys to scroll, click to go back to top');
    penguin.innerHTML = `
        <div class="scroll-penguin-facing">
            <svg viewBox="0 0 40 44" aria-hidden="true">
                <ellipse cx="14" cy="41.5" rx="5" ry="2.2" fill="#ffa726"/>
                <ellipse cx="25" cy="41.5" rx="5" ry="2.2" fill="#ffa726"/>
                <ellipse cx="19" cy="24" rx="14" ry="17" fill="#1f2d3d"/>
                <ellipse cx="22.5" cy="27" rx="9" ry="13" fill="#ffffff"/>
                <ellipse cx="12" cy="26" rx="4" ry="10" fill="#15202b" transform="rotate(12 12 26)"/>
                <circle cx="25" cy="14" r="2.4" fill="#ffffff"/>
                <circle cx="25.9" cy="14" r="1.2" fill="#111111"/>
                <polygon points="30,15 38,17.5 30,20" fill="#ffa726"/>
            </svg>
        </div>`;

    document.body.appendChild(track);
    document.body.appendChild(penguin);

    const fill = track.firstElementChild;
    let lastY = window.scrollY;
    let walkTimer = null;
    let ticking = false;
    let arrived = false;

    function update() {
        ticking = false;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress = maxScroll > 0 ? Math.min(Math.max(window.scrollY / maxScroll, 0), 1) : 0;
        const travel = window.innerWidth - penguin.offsetWidth - 8;

        penguin.style.transform = `translateX(${4 + progress * travel}px)`;
        fill.style.transform = `scaleX(${progress})`;

        const y = window.scrollY;
        if (y !== lastY) {
            penguin.classList.toggle('facing-left', y < lastY);
            lastY = y;
        }

        const atEnd = progress > 0.995;
        if (atEnd && !arrived) {
            penguin.classList.remove('walking');
            // restart the hop animation
            penguin.classList.remove('arrived');
            void penguin.offsetWidth;
            penguin.classList.add('arrived');
        } else if (!atEnd) {
            penguin.classList.remove('arrived');
        }
        arrived = atEnd;
    }

    function onScroll() {
        if (!arrived) penguin.classList.add('walking');
        clearTimeout(walkTimer);
        walkTimer = setTimeout(() => penguin.classList.remove('walking'), 150);
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }

    // Drag the penguin left/right to scrub through the page, like a scrollbar thumb
    const maxScrollNow = () => document.documentElement.scrollHeight - window.innerHeight;
    let drag = null;

    function scrollToProgress(progress) {
        const clamped = Math.min(Math.max(progress, 0), 1);
        window.scrollTo({ top: clamped * maxScrollNow(), behavior: 'auto' });
    }

    penguin.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const rect = penguin.getBoundingClientRect();
        drag = { startX: e.clientX, grabOffset: e.clientX - rect.left, moved: false };
        penguin.setPointerCapture(e.pointerId);
    });

    penguin.addEventListener('pointermove', (e) => {
        if (!drag) return;
        if (!drag.moved && Math.abs(e.clientX - drag.startX) < 5) return;
        if (!drag.moved) {
            drag.moved = true;
            penguin.classList.add('dragging');
        }
        const travel = window.innerWidth - penguin.offsetWidth - 8;
        scrollToProgress((e.clientX - drag.grabOffset - 4) / travel);
    });

    function endDrag() {
        if (!drag) return;
        penguin.classList.remove('dragging');
        // keep the flag until the click event that follows pointerup has been ignored
        setTimeout(() => { drag = null; }, 0);
    }
    penguin.addEventListener('pointerup', endDrag);
    penguin.addEventListener('pointercancel', endDrag);

    penguin.addEventListener('click', () => {
        if (drag && drag.moved) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });

    // Keyboard: arrows nudge the penguin, Home/End jump to the ends
    penguin.addEventListener('keydown', (e) => {
        const max = maxScrollNow();
        if (max <= 0) return;
        const progress = window.scrollY / max;
        const steps = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 };
        if (e.key in steps) scrollToProgress(progress + steps[e.key]);
        else if (e.key === 'Home') scrollToProgress(0);
        else if (e.key === 'End') scrollToProgress(1);
        else return;
        e.preventDefault();
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => requestAnimationFrame(update));
    update();
}

createScrollPenguin();


// Night mode: follows the visitor's choice, else their dark-mode setting or local time (7pm-6am)
function setupSkyToggle() {
    const root = document.documentElement;
    const button = document.getElementById('skyToggle');
    if (!button) return;
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function savedSky() {
        try { return localStorage.getItem('sky'); } catch (e) { return null; }
    }

    function autoSky() {
        const hour = new Date().getHours();
        return darkQuery.matches || hour >= 19 || hour < 6 ? 'night' : 'day';
    }

    function applySky(sky, animate) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (animate && !reduceMotion) {
            root.classList.add('sky-changing');
            setTimeout(() => root.classList.remove('sky-changing'), 600);
        }
        root.setAttribute('data-sky', sky);
        const night = sky === 'night';
        button.setAttribute('aria-pressed', String(night));
        button.setAttribute('aria-label', night ? 'Switch to day mode' : 'Switch to night mode');
        button.title = night ? 'Day mode' : 'Night mode';
    }

    applySky(root.getAttribute('data-sky') || savedSky() || autoSky(), false);

    button.addEventListener('click', () => {
        const next = root.getAttribute('data-sky') === 'night' ? 'day' : 'night';
        try { localStorage.setItem('sky', next); } catch (e) {}
        applySky(next, true);
    });

    darkQuery.addEventListener('change', () => {
        if (!savedSky()) applySky(autoSky(), true);
    });
}

setupSkyToggle();
