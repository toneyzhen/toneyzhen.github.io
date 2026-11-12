// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        target.scrollIntoView({ behavior: 'smooth' });
    });
});

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

// Snowflakes are pure decoration, so skip them for visitors who ask for less motion
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    createSnowflakes();
}

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



// Resume: open in a pop-up on the page on every device. PDF.js draws the pages, since phone
// browsers can't show a PDF inside a page by themselves. It loads only on the first open.
(function () {
    const link = document.getElementById('resumeLink');
    const dialog = document.getElementById('resumeDialog');
    const pages = document.getElementById('resumePages');
    if (!link || !dialog || !pages || typeof dialog.showModal !== 'function') return;

    const pdfUrl = link.getAttribute('href');
    let doc = null;
    let renderedWidth = 0;
    let rendering = null;

    function showStatus(text, withLink) {
        const p = document.createElement('p');
        p.className = 'resume-status';
        p.textContent = text;
        if (withLink) {
            const a = document.createElement('a');
            a.href = pdfUrl;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = 'Open it in a new tab';
            p.append(' ', a, '.');
        }
        pages.replaceChildren(p);
    }

    async function loadDocument() {
        const base = document.baseURI;
        const pdfjs = await import(new URL('vendor/pdfjs/pdf.min.mjs', base).href);
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', base).href;
        return pdfjs.getDocument({ url: new URL(pdfUrl, base).href }).promise;
    }

    async function render() {
        const width = Math.min(pages.clientWidth - 2 * parseFloat(getComputedStyle(pages).paddingLeft), 820);
        if (width <= 0 || Math.abs(width - renderedWidth) < 40) return;
        renderedWidth = width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const out = [];
        for (let n = 1; n <= doc.numPages; n++) {
            const page = await doc.getPage(n);
            const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);
            canvas.setAttribute('aria-hidden', 'true');
            await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] }).promise;

            const wrap = document.createElement('div');
            wrap.className = 'resume-page';
            wrap.setAttribute('role', 'img');
            wrap.setAttribute('aria-label', `Resume page ${n} of ${doc.numPages}`);
            wrap.appendChild(canvas);

            // keep the PDF's own links clickable
            const annotations = await page.getAnnotations();
            annotations.filter((a) => a.subtype === 'Link' && a.url).forEach((a) => {
                const [x1, y1] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
                const [x2, y2] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
                const hit = document.createElement('a');
                hit.href = a.url;
                hit.target = '_blank';
                hit.rel = 'noopener';
                hit.setAttribute('aria-label', a.url.replace(/^mailto:/, 'Email '));
                Object.assign(hit.style, {
                    left: (Math.min(x1, x2) / viewport.width) * 100 + '%',
                    top: (Math.min(y1, y2) / viewport.height) * 100 + '%',
                    width: (Math.abs(x2 - x1) / viewport.width) * 100 + '%',
                    height: (Math.abs(y2 - y1) / viewport.height) * 100 + '%',
                });
                wrap.appendChild(hit);
            });
            out.push(wrap);
        }
        pages.replaceChildren(...out);
    }

    async function open() {
        dialog.showModal();
        try {
            if (!doc) {
                showStatus('Loading resume…');
                doc = await loadDocument();
            }
            rendering = render();
            await rendering;
        } catch (err) {
            console.warn('Resume viewer:', err);
            renderedWidth = 0;
            showStatus("The resume couldn't be displayed here.", true);
        }
    }

    link.addEventListener('click', (e) => {
        e.preventDefault();
        open();
    });

    dialog.addEventListener('click', (e) => {
        if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (!dialog.open || !doc) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { render().catch(() => {}); }, 250);
    });
})();
